import type { FileSystem } from './fs.js';
import type { Entry, DayFile } from './types.js';
import { parseDayFile } from './parser.js';
import { serializeDayFile } from './serializer.js';
import { stableStringify } from './metadata.js';
import { WebDAVClient } from './webdav.js';

export interface SyncSummary {
  pushed: string[];
  pulled: string[];
  merged: string[];
  conflicts: string[];
  errors: { path: string; message: string }[];
  finishedAt: string;
}

export interface SyncOptions {
  /** Local filesystem rooted at vault. */
  local: FileSystem;
  /** Configured WebDAV remote. */
  remote: WebDAVClient;
}

const MD_FILE_RE = /(\d{4})\/(\d{2})\/\1-\2-\d{2}\.md$/;

// `config.json` (app settings) is intentionally NOT synced: it lives only at the
// vault root, and some WebDAV servers (notably 坚果云/Nutstore) forbid creating
// loose files directly under the dav root — only folders and files within them.
// A root-level config.json PUT therefore 404s. Day files (`YYYY/MM/…md`) are
// unaffected since they carry their own parent folders. Settings stay local.
function isVaultPath(p: string): boolean {
  return MD_FILE_RE.test(p);
}

/**
 * Bidirectional sync per §6.4. Entry-level merge for double-edited day files.
 */
export async function sync(opts: SyncOptions): Promise<SyncSummary> {
  const { local, remote } = opts;
  const summary: SyncSummary = {
    pushed: [], pulled: [], merged: [], conflicts: [], errors: [],
    finishedAt: '',
  };

  let localFiles: string[];
  let remoteFiles: Awaited<ReturnType<WebDAVClient['list']>>;
  try {
    [localFiles, remoteFiles] = await Promise.all([local.list('.'), remote.list()]);
  } catch (e) {
    summary.errors.push({ path: '<list>', message: (e as Error).message });
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  const localSet = new Set(localFiles.filter(isVaultPath));
  const remoteSet = new Set(remoteFiles.map(f => f.path).filter(isVaultPath));
  const all = new Set([...localSet, ...remoteSet]);

  for (const path of all) {
    try {
      const inLocal = localSet.has(path);
      const inRemote = remoteSet.has(path);

      if (inLocal && !inRemote) {
        const text = await local.readText(path);
        await remote.put(path, text);
        summary.pushed.push(path);
        continue;
      }
      if (!inLocal && inRemote) {
        const text = await remote.get(path);
        await local.writeText(path, text);
        summary.pulled.push(path);
        continue;
      }
      // both sides have it
      const [localText, remoteText] = await Promise.all([
        local.readText(path),
        remote.get(path),
      ]);
      if (localText === remoteText) continue;

      const merged = mergeDayFiles(
        parseDayFile(localText, path),
        parseDayFile(remoteText, path),
      );
      const serialized = serializeDayFile(merged.file);
      await local.writeText(path, serialized);
      await remote.put(path, serialized);
      summary.merged.push(path);

      if (merged.conflicts.length) {
        summary.conflicts.push(path);
        const conflictPath = `.conflicts/${path.replace(/\//g, '_')}.conflict-${ts()}`;
        await local.writeText(conflictPath, remoteText);
      }
    } catch (e) {
      summary.errors.push({ path, message: (e as Error).message });
    }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

function ts(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

interface MergeResult {
  file: DayFile;
  conflicts: Entry[];
}

/**
 * Entry-level merge per §6.4.3. For each id ∈ local.ids ∪ remote.ids:
 *   only local           → keep local
 *   only remote          → keep remote
 *   identical content    → keep either
 *   different updated    → keep newer updated
 *   same updated, diff   → keep local, flag conflict
 * For tombstones: newer `deleted` wins.
 */
export function mergeDayFiles(local: DayFile, remote: DayFile): MergeResult {
  const byId = new Map<string, Entry>();
  const conflicts: Entry[] = [];

  const pickNewer = (a: Entry, b: Entry): Entry => {
    const au = a.metadata.updated || '';
    const bu = b.metadata.updated || '';
    if (au === bu) {
      // tie-break: prefer one with deleted tombstone (deletes win on tie)
      if (a.metadata.deleted && !b.metadata.deleted) return a;
      if (b.metadata.deleted && !a.metadata.deleted) return b;
      return a;
    }
    return au > bu ? a : b;
  };

  // Compare on a deterministic key order, ignoring `_`-prefixed system fields
  // (e.g. `_conflict`) so device-local flags and key-ordering differences never
  // manufacture a false — or eternal — conflict.
  const sameContent = (a: Entry, b: Entry): boolean =>
    a.content === b.content &&
    a.status === b.status &&
    stableStringify(a.metadata, { dropSystem: true }) ===
      stableStringify(b.metadata, { dropSystem: true });

  const localById = new Map(local.entries.map(e => [e.id, e]));
  const remoteById = new Map(remote.entries.map(e => [e.id, e]));

  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    if (l && !r) { byId.set(id, l); continue; }
    if (!l && r) { byId.set(id, r); continue; }
    if (!l || !r) continue;
    if (sameContent(l, r)) { byId.set(id, l); continue; }
    if ((l.metadata.updated || '') === (r.metadata.updated || '')) {
      const flagged: Entry = {
        ...l,
        metadata: { ...l.metadata, _conflict: true },
      };
      byId.set(id, flagged);
      conflicts.push(r);
    } else {
      byId.set(id, pickNewer(l, r));
    }
  }

  // Preserve local entry order, append remote-only entries by their order
  const seen = new Set<string>();
  const ordered: Entry[] = [];
  for (const e of local.entries) {
    if (byId.has(e.id) && !seen.has(e.id)) {
      ordered.push(byId.get(e.id)!);
      seen.add(e.id);
    }
  }
  for (const e of remote.entries) {
    if (byId.has(e.id) && !seen.has(e.id)) {
      ordered.push(byId.get(e.id)!);
      seen.add(e.id);
    }
  }

  return {
    file: {
      date: local.date,
      version: Math.max(local.version, remote.version),
      updatedAt: new Date().toISOString(),
      entries: ordered,
    },
    conflicts,
  };
}
