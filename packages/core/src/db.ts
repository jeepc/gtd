import type { Storage } from './storage.js';
import type { FileSystem } from './fs.js';
import type {
  Entry, EntryStatus, Habit, HabitProgress, HabitSchedule, Op, OpKind, Project, ScalarValue,
} from './types.js';
import { ulid } from './ulid.js';
import { extractTags } from './tags.js';
import {
  assertValidProperty, isBaseKey, MAX_META_BYTES, MetadataValidationError,
} from './metadata.js';
import { createSchema, getSyncMeta, setSyncMeta } from './schema.js';
import { createOp, appendOp } from './oplog.js';
import { applyOp } from './apply.js';
import { rebuild, needsRebuild } from './rebuild.js';
import { readConfig, type ConfigPath } from './config.js';
import { computeProgress } from './habits.js';
import {
  getEntry, listEntries, listEntriesByTag, type ListEntriesOpts,
} from './repo/entries.js';
import { getProject, getProjectBySlug, listProjects } from './repo/projects.js';
import { getHabit, getHabitBySlug, listHabits } from './repo/habits.js';

/**
 * LoopDB — the v2.0 orchestrator that replaces {@link Vault} (PRD §6.3). Every
 * write follows the op-first invariant (§1.5.5): build op → append to the op log
 * → apply to SQLite → return. Reads go straight to SQL via the repos.
 */

function todayDateString(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function byteLen(obj: unknown): number {
  return new TextEncoder().encode(JSON.stringify(obj)).length;
}

export class LoopDB {
  constructor(
    private storage: Storage,
    private fs: FileSystem,
    private deviceId: string,
  ) {}

  /** Ensure schema + device id; rebuild from the op log if the DB lags/absent. */
  async init(): Promise<void> {
    await createSchema(this.storage);
    const existing = await getSyncMeta(this.storage, 'device_id');
    if (existing) this.deviceId = existing;
    else await setSyncMeta(this.storage, 'device_id', this.deviceId);
    if (await needsRebuild(this.storage, this.fs)) await this.rebuild();
  }

  /** Recreate `data.db` from the op log. */
  async rebuild(): Promise<void> {
    await rebuild(this.storage, this.fs);
    const dev = await getSyncMeta(this.storage, 'device_id');
    if (!dev) await setSyncMeta(this.storage, 'device_id', this.deviceId);
  }

  /** Op-first write: append to the log, then apply to SQLite. */
  private async write(kind: OpKind, payload: Record<string, unknown>): Promise<Op> {
    const op = createOp({ kind, payload, deviceId: this.deviceId });
    await appendOp(this.fs, op); // append must succeed before we touch SQLite
    await applyOp({ storage: this.storage, fs: this.fs }, op);
    return op;
  }

  private async uniqueSlug(table: 'projects' | 'habits', base: string): Promise<string> {
    const root = base || table.slice(0, -1);
    let slug = root;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop
    while ((await this.storage.query(`SELECT 1 FROM ${table} WHERE slug = ?`, [slug])).length) {
      n += 1;
      slug = `${root}-${n}`;
    }
    return slug;
  }

  // --- Entries -----------------------------------------------------------

  async createEntry(input: {
    content: string;
    status?: EntryStatus;
    date?: string;
    project_id?: string | null;
    metadata?: Record<string, ScalarValue>;
  }): Promise<Entry> {
    const status = input.status ?? 'todo';
    const id = ulid();
    const meta: Record<string, ScalarValue> = {};
    for (const [k, v] of Object.entries(input.metadata ?? {})) {
      if (isBaseKey(k) || k === 'updated') continue;
      assertValidProperty(k, v);
      meta[k] = v;
    }
    if (byteLen(meta) > MAX_META_BYTES) {
      throw new MetadataValidationError(`metadata exceeds ${MAX_META_BYTES}-byte limit (§6.7.4)`);
    }
    await this.write('entry.create', {
      id,
      content: input.content,
      status,
      date: input.date ?? todayDateString(),
      project_id: input.project_id ?? null,
      tags: extractTags(input.content),
      metadata: meta,
    });
    return (await getEntry(this.storage, id))!;
  }

  async updateEntry(
    id: string,
    patch: {
      content?: string;
      status?: EntryStatus;
      project_id?: string | null;
      metadata?: Record<string, ScalarValue | null>;
    },
  ): Promise<Entry | null> {
    if (!(await getEntry(this.storage, id))) return null;
    const fields: Record<string, unknown> = {};
    if (patch.content !== undefined) {
      fields.content = patch.content;
      fields.tags = extractTags(patch.content);
    }
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.project_id !== undefined) fields.project_id = patch.project_id;
    if (patch.metadata) {
      const m: Record<string, ScalarValue | null> = {};
      for (const [k, v] of Object.entries(patch.metadata)) {
        if (k === 'updated') continue;
        assertValidProperty(k, v);
        m[k] = v;
      }
      fields.metadata = m;
    }
    await this.write('entry.update', { id, fields });
    return getEntry(this.storage, id);
  }

  async setProperty(id: string, key: string, value: ScalarValue): Promise<Entry | null> {
    if (isBaseKey(key)) {
      throw new MetadataValidationError(`"${key}" is a managed base field; use status/delete instead`);
    }
    assertValidProperty(key, value);
    if (!(await getEntry(this.storage, id))) return null;
    await this.write('entry.set_metadata', { id, key, value });
    return getEntry(this.storage, id);
  }

  async completeEntry(id: string): Promise<Entry | null> {
    return this.updateEntry(id, { status: 'done' });
  }

  async deleteEntry(id: string): Promise<boolean> {
    if (!(await getEntry(this.storage, id))) return false;
    await this.write('entry.delete', { id });
    return true;
  }

  getEntry(id: string): Promise<Entry | null> {
    return getEntry(this.storage, id);
  }

  listEntries(opts: ListEntriesOpts = {}): Promise<Entry[]> {
    return listEntries(this.storage, opts);
  }

  // --- Projects ----------------------------------------------------------

  async createProject(input: {
    name: string;
    slug?: string;
    body?: string;
    tags?: string[];
    metadata?: Record<string, ScalarValue>;
  }): Promise<Project> {
    const id = ulid();
    const slug = await this.uniqueSlug('projects', input.slug ?? slugify(input.name));
    await this.write('project.create', {
      id,
      name: input.name,
      slug,
      body: input.body ?? '',
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    });
    return (await getProject(this.storage, id))!;
  }

  async updateProject(
    id: string,
    fields: {
      name?: string;
      slug?: string;
      body?: string;
      tags?: string[];
      metadata?: Record<string, ScalarValue | null>;
    },
  ): Promise<Project | null> {
    if (!(await getProject(this.storage, id))) return null;
    const next: Record<string, unknown> = { ...fields };
    if (fields.slug !== undefined) next.slug = await this.uniqueSlug('projects', slugify(fields.slug));
    await this.write('project.update', { id, fields: next });
    return getProject(this.storage, id);
  }

  async archiveProject(id: string): Promise<Project | null> {
    if (!(await getProject(this.storage, id))) return null;
    await this.write('project.archive', { id, at: nowIso() });
    return getProject(this.storage, id);
  }

  async unarchiveProject(id: string): Promise<Project | null> {
    if (!(await getProject(this.storage, id))) return null;
    await this.write('project.unarchive', { id });
    return getProject(this.storage, id);
  }

  async deleteProject(id: string): Promise<boolean> {
    if (!(await getProject(this.storage, id))) return false;
    await this.write('project.delete', { id });
    return true;
  }

  getProject(id: string): Promise<Project | null> {
    return getProject(this.storage, id);
  }

  getProjectBySlug(slug: string): Promise<Project | null> {
    return getProjectBySlug(this.storage, slug);
  }

  listProjects(opts: { status?: Project['status'] } = {}): Promise<Project[]> {
    return listProjects(this.storage, opts);
  }

  // --- Habits ------------------------------------------------------------

  async createHabit(input: {
    name: string;
    schedule: HabitSchedule;
    slug?: string;
    body?: string;
    metadata?: Record<string, ScalarValue>;
  }): Promise<Habit> {
    const id = ulid();
    const slug = await this.uniqueSlug('habits', input.slug ?? slugify(input.name));
    await this.write('habit.create', {
      id,
      name: input.name,
      slug,
      body: input.body ?? '',
      schedule: input.schedule,
      metadata: input.metadata ?? {},
    });
    return (await getHabit(this.storage, id))!;
  }

  async updateHabit(
    id: string,
    fields: {
      name?: string;
      slug?: string;
      body?: string;
      schedule?: HabitSchedule;
      status?: Habit['status'];
      metadata?: Record<string, ScalarValue | null>;
    },
  ): Promise<Habit | null> {
    if (!(await getHabit(this.storage, id))) return null;
    const next: Record<string, unknown> = { ...fields };
    if (fields.slug !== undefined) next.slug = await this.uniqueSlug('habits', slugify(fields.slug));
    await this.write('habit.update', { id, fields: next });
    return getHabit(this.storage, id);
  }

  async deleteHabit(id: string): Promise<boolean> {
    if (!(await getHabit(this.storage, id))) return false;
    await this.write('habit.delete', { id });
    return true;
  }

  getHabit(id: string): Promise<Habit | null> {
    return getHabit(this.storage, id);
  }

  getHabitBySlug(slug: string): Promise<Habit | null> {
    return getHabitBySlug(this.storage, slug);
  }

  listHabits(opts: { status?: Habit['status'] } = {}): Promise<Habit[]> {
    return listHabits(this.storage, opts);
  }

  /** Current-period progress for a habit, computed from matching entries. */
  async habitProgress(id: string, now: Date = new Date()): Promise<HabitProgress | null> {
    const habit = await getHabit(this.storage, id);
    if (!habit) return null;
    const entries = await listEntriesByTag(this.storage, habit.schedule.match.tag);
    return computeProgress(habit, entries, now);
  }

  // --- Config ------------------------------------------------------------

  getConfig(): Promise<Record<string, unknown>> {
    return readConfig(this.fs);
  }

  async setConfig(path: ConfigPath, value: unknown): Promise<void> {
    await this.write('config.set', { path, value });
  }

  async unsetConfig(path: ConfigPath): Promise<void> {
    await this.write('config.unset', { path });
  }
}
