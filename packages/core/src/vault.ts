import type { FileSystem } from './fs.js';
import type { Entry, DayFile, VaultConfig, EntryStatus, EntryMetadata, ScalarValue } from './types.js';
import { DATA_FORMAT_VERSION, defaultVaultConfig } from './types.js';
import { parseDayFile } from './parser.js';
import { serializeDayFile } from './serializer.js';
import { ulid } from './ulid.js';
import { extractTags } from './tags.js';
import {
  assertValidProperty,
  isBaseKey,
  metadataByteLength,
  MAX_META_BYTES,
  MetadataValidationError,
} from './metadata.js';

/** Clear the conflict flag, handling both the `_conflict` field and legacy `custom.conflict`. */
function clearConflictFlag(entry: Entry): void {
  delete entry.metadata._conflict;
  const m = entry.metadata as Record<string, unknown>;
  const legacy = m.custom;
  if (legacy && typeof legacy === 'object') {
    delete (legacy as Record<string, unknown>).conflict;
    if (Object.keys(legacy as object).length === 0) delete m.custom;
  }
}

const CONFIG_PATH = 'config.json';

export function pathForDate(date: string): string {
  // date is YYYY-MM-DD
  const [y, m] = date.split('-');
  return `${y}/${m}/${date}.md`;
}

function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Vault wraps a FileSystem and exposes high-level entry CRUD.
 * All entries for a given date live in a single Markdown file.
 */
export class Vault {
  /**
   * Cache of parsed day files. Invalidated on writeDay. External writes (via
   * sync) must call `invalidateAll()` afterwards. Per PRD §9.2 this keeps the
   * 10k-entry home-load budget realistic by avoiding re-parsing untouched days.
   */
  private dayCache = new Map<string, DayFile>();

  constructor(private fs: FileSystem) {}

  invalidateAll(): void {
    this.dayCache.clear();
  }

  invalidate(date: string): void {
    this.dayCache.delete(date);
  }

  // --- Vault config (PRD §6.5: cross-device prefs, synced with vault) ---

  /**
   * Load `<vault>/config.json`. Old vaults may carry machine-specific or
   * removed fields (`sync.webdav`, `ai.*`, etc.) — those are silently dropped
   * here so they migrate out on the next save. Credentials referenced via
   * `passwordRef` belong in {@link AppSettings}, not in the vault file.
   */
  async loadVaultConfig(): Promise<VaultConfig> {
    const def = defaultVaultConfig();
    if (!(await this.fs.exists(CONFIG_PATH))) {
      await this.saveVaultConfig(def);
      return def;
    }
    try {
      const raw = JSON.parse(await this.fs.readText(CONFIG_PATH)) as Partial<VaultConfig>;
      return {
        version: 1,
        ui: { ...def.ui, ...(raw.ui ?? {}) },
        tagColors: raw.tagColors ?? def.tagColors,
      };
    } catch {
      return def;
    }
  }

  async saveVaultConfig(cfg: VaultConfig): Promise<void> {
    await this.fs.writeText(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  }

  /** @deprecated Use {@link loadVaultConfig}. */
  loadConfig(): Promise<VaultConfig> {
    return this.loadVaultConfig();
  }

  /** @deprecated Use {@link saveVaultConfig}. */
  saveConfig(cfg: VaultConfig): Promise<void> {
    return this.saveVaultConfig(cfg);
  }

  // --- Day file IO ---

  async readDay(date: string): Promise<DayFile> {
    const cached = this.dayCache.get(date);
    if (cached) return cached;
    const path = pathForDate(date);
    if (!(await this.fs.exists(path))) {
      const empty = { date, version: DATA_FORMAT_VERSION, updatedAt: nowIso(), entries: [] };
      this.dayCache.set(date, empty);
      return empty;
    }
    const text = await this.fs.readText(path);
    const parsed = parseDayFile(text, path);
    this.dayCache.set(date, parsed);
    return parsed;
  }

  async writeDay(file: DayFile): Promise<void> {
    const path = pathForDate(file.date);
    await this.fs.writeText(path, serializeDayFile(file));
    this.dayCache.set(file.date, file);
  }

  // --- Entry CRUD ---

  async createEntry(input: {
    content: string;
    status?: EntryStatus;
    date?: string;
    /** Open metadata fields captured at creation (e.g. `due`, `priority`). Validated. */
    metadata?: Record<string, ScalarValue>;
  }): Promise<Entry> {
    const status: EntryStatus = input.status ?? 'todo';
    const date = input.date ?? todayDateString();
    const now = nowIso();

    // Base fields are managed; open user fields (`due`, `priority`, … from the
    // Level 2 capture syntax — database-design v1.1 §4.3) merge on top after
    // passing the same write-gate validation as setProperty.
    const metadata: EntryMetadata = { updated: now };
    if (status === 'done') metadata.done = now;
    if (status === 'log') metadata.log = now;
    for (const [k, v] of Object.entries(input.metadata ?? {})) {
      if (isBaseKey(k) || k === 'updated') continue; // managed internally
      assertValidProperty(k, v);
      metadata[k] = v;
    }
    if (metadataByteLength(metadata) > MAX_META_BYTES) {
      throw new MetadataValidationError(`metadata exceeds ${MAX_META_BYTES}-byte limit (§6.7.4)`);
    }

    const entry: Entry = {
      id: ulid(),
      content: input.content,
      status,
      tags: extractTags(input.content),
      date,
      metadata,
    };

    const day = await this.readDay(date);
    day.entries.unshift(entry);
    day.updatedAt = now;
    await this.writeDay(day);
    return entry;
  }

  async updateEntry(
    id: string,
    patch: {
      content?: string;
      status?: EntryStatus;
      /** Shallow metadata merge; a `null` value deletes the key. Validated. */
      metadata?: Record<string, ScalarValue | null>;
    },
  ): Promise<Entry | null> {
    const found = await this.findEntry(id);
    if (!found) return null;
    const { day, entry, index } = found;
    const now = nowIso();

    // Compute everything into locals first; only commit to the cached entry
    // once validation passes, so a rejected write never leaves the cache
    // half-applied (§1.5.5 no orphan state).
    let nextContent = entry.content;
    let nextTags = entry.tags;
    let nextStatus = entry.status;
    const nextMeta: EntryMetadata = { ...entry.metadata };

    if (patch.content !== undefined) {
      nextContent = patch.content;
      nextTags = extractTags(patch.content);
    }

    if (patch.status !== undefined && patch.status !== nextStatus) {
      nextStatus = patch.status;
      if (patch.status === 'done') nextMeta.done = now;
      if (patch.status === 'log') nextMeta.log = now;
    }

    if (patch.metadata) {
      for (const [k, v] of Object.entries(patch.metadata)) {
        if (k === 'updated') continue; // managed internally
        assertValidProperty(k, v);
        if (v === null) delete nextMeta[k];
        else nextMeta[k] = v;
      }
    }

    nextMeta.updated = now;
    if (metadataByteLength(nextMeta) > MAX_META_BYTES) {
      throw new MetadataValidationError(`metadata exceeds ${MAX_META_BYTES}-byte limit (§6.7.4)`);
    }

    entry.content = nextContent;
    entry.tags = nextTags;
    entry.status = nextStatus;
    entry.metadata = nextMeta;
    day.entries[index] = entry;
    day.updatedAt = now;
    await this.writeDay(day);
    return entry;
  }

  /**
   * Set or delete a single open metadata field (PRD §6.7 / MCP §4.6.2). Passing
   * `null` deletes the key. Base fields (done/log/updated/deleted) are managed
   * via status/delete operations and rejected here.
   */
  async setProperty(id: string, key: string, value: ScalarValue): Promise<Entry | null> {
    if (isBaseKey(key)) {
      throw new MetadataValidationError(`"${key}" is a managed base field; use status/delete instead`);
    }
    return this.updateEntry(id, { metadata: { [key]: value } });
  }

  async completeEntry(id: string): Promise<Entry | null> {
    return this.updateEntry(id, { status: 'done' });
  }

  async deleteEntry(id: string): Promise<boolean> {
    const found = await this.findEntry(id);
    if (!found) return false;
    const { day, entry, index } = found;
    const now = nowIso();
    // Tombstone strategy (§6.4.4): mark deleted in-place; physical removal happens after 30 days.
    entry.metadata.deleted = now;
    entry.metadata.updated = now;
    day.entries[index] = entry;
    day.updatedAt = now;
    await this.writeDay(day);
    return true;
  }

  /** Physically remove tombstones older than 30 days. Returns number of rows removed. */
  async gcTombstones(now = Date.now()): Promise<number> {
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const date of await this.listDates()) {
      const day = await this.readDay(date);
      const before = day.entries.length;
      day.entries = day.entries.filter(e => {
        if (!e.metadata.deleted) return true;
        return new Date(e.metadata.deleted).getTime() >= cutoff;
      });
      const diff = before - day.entries.length;
      if (diff > 0) {
        day.updatedAt = nowIso();
        await this.writeDay(day);
        removed += diff;
      }
    }
    return removed;
  }

  // --- Queries ---

  /** List all date strings (YYYY-MM-DD) present in the vault, sorted desc. */
  async listDates(): Promise<string[]> {
    const files = await this.fs.list('.');
    const dates = new Set<string>();
    for (const f of files) {
      const m = f.match(/(\d{4}-\d{2}-\d{2})\.md$/);
      if (m && !f.startsWith('.conflicts/')) dates.add(m[1]!);
    }
    return [...dates].sort().reverse();
  }

  /**
   * List entries across days, newest first. Excludes tombstoned entries by
   * default. `limit` caps total entries returned. `since` is an inclusive lower
   * bound date (YYYY-MM-DD) used to skip very old day files when the caller
   * only needs the recent timeline (PRD §4.1.2: default load last 14 days).
   */
  async listEntries(opts: { limit?: number; includeDeleted?: boolean; since?: string } = {}): Promise<Entry[]> {
    const limit = opts.limit ?? Infinity;
    const out: Entry[] = [];
    for (const date of await this.listDates()) {
      if (opts.since && date < opts.since) break;
      const day = await this.readDay(date);
      const entries = day.entries
        .filter(e => opts.includeDeleted || !e.metadata.deleted)
        .sort((a, b) => (b.metadata.updated || '').localeCompare(a.metadata.updated || ''));
      for (const e of entries) {
        out.push(e);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async getEntry(id: string): Promise<Entry | null> {
    const r = await this.findEntry(id);
    return r?.entry ?? null;
  }

  /**
   * Find the archived remote version of an entry (from `.conflicts/`). Useful
   * when the user wants to inspect "accept remote" before applying.
   */
  async findArchivedRemote(id: string): Promise<Entry | null> {
    const all = await this.fs.list('.');
    for (const f of all) {
      if (!f.startsWith('.conflicts/')) continue;
      try {
        const text = await this.fs.readText(f);
        const parsed = parseDayFile(text, f);
        const hit = parsed.entries.find(e => e.id === id);
        if (hit) return hit;
      } catch { /* skip */ }
    }
    return null;
  }

  /** List entries flagged as conflict by sync merge. */
  async listConflicts(): Promise<Entry[]> {
    const out: Entry[] = [];
    for (const date of await this.listDates()) {
      const day = await this.readDay(date);
      for (const e of day.entries) {
        // New form: `_conflict`; legacy form: `custom.conflict` (compat shim).
        const legacy = (e.metadata as Record<string, any>).custom;
        if (e.metadata._conflict || (legacy && legacy.conflict)) out.push(e);
      }
    }
    return out;
  }

  /**
   * Resolve a conflict marked on a vault entry.
   *   'local'   → drop flag, keep current local content
   *   'remote'  → replace content/metadata with archived remote version
   *   'both'    → keep local; spin off a new entry containing remote content
   * Returns the (potentially updated) local entry.
   */
  async resolveConflict(
    id: string,
    choice: 'local' | 'remote' | 'both',
    remote?: Entry,
  ): Promise<Entry | null> {
    const found = await this.findEntry(id);
    if (!found) return null;
    const { day, entry, index } = found;
    const now = nowIso();

    if (choice === 'local') {
      clearConflictFlag(entry);
      entry.metadata.updated = now;
    } else if (choice === 'remote' && remote) {
      entry.content = remote.content;
      entry.tags = remote.tags;
      entry.status = remote.status;
      entry.metadata = { ...remote.metadata, updated: now };
    } else if (choice === 'both' && remote) {
      clearConflictFlag(entry);
      entry.metadata.updated = now;
      day.entries.splice(index + 1, 0, {
        ...remote,
        id: ulid(),
        date: day.date,
        metadata: { ...remote.metadata, updated: now },
      });
    }

    day.entries[index] = entry;
    day.updatedAt = now;
    await this.writeDay(day);
    return entry;
  }

  private async findEntry(id: string): Promise<{ day: DayFile; entry: Entry; index: number } | null> {
    for (const date of await this.listDates()) {
      const day = await this.readDay(date);
      const index = day.entries.findIndex(e => e.id === id);
      if (index >= 0) return { day, entry: day.entries[index]!, index };
    }
    return null;
  }
}
