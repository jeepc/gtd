import type { FileSystem } from './fs.js';
import type { Storage } from './storage.js';
import type { Op } from './types.js';
import { isOpLogPath, parseOpLine, serializeOp, sortedUniqueById } from './oplog.js';
import { applyOpInTx } from './apply.js';
import { setSyncMeta } from './schema.js';

/**
 * Op-level sync (PRD §6.4). Replaces the v1.x file-level day-file merge. Because
 * the op log is append-only and ULID-ordered, merging is union + sort + dedupe by
 * id — there are effectively no true conflicts. Only `ops/`, `attachments/`, and
 * `config.json` are in scope (invariant §1.5.5 #5); `data.db*` never syncs.
 *
 * Lives beside the legacy `sync.ts` (still used by the v1.x apps) until Phase 3/4
 * migrate the apps to LoopDB.
 */

/** Minimal remote interface; {@link WebDAVClient} satisfies it structurally. */
export interface RemoteStore {
  list(): Promise<{ path: string; size: number; lastModified: string | null }[]>;
  get(path: string): Promise<string>;
  put(path: string, contents: string): Promise<void>;
}

export interface SyncOpsSummary {
  pushed: string[];
  pulled: string[];
  merged: string[];
  /** Number of pulled/merged ops applied to SQLite (0 if no storage given). */
  appliedOps: number;
  errors: { path: string; message: string }[];
  finishedAt: string;
}

export interface SyncOpsOptions {
  local: FileSystem;
  remote: RemoteStore;
  /** When provided, newly pulled/merged ops are applied to SQLite. */
  storage?: Storage;
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function inSyncScope(p: string): boolean {
  const n = normalize(p);
  if (n.startsWith('attachments/')) return true;
  if (n === 'config.json') return true;
  return isOpLogPath(n);
}

function parseOpsText(text: string): Op[] {
  const ops: Op[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const op = parseOpLine(line);
    if (op) ops.push(op);
  }
  return ops;
}

function serializeOps(ops: Op[]): string {
  return ops.length ? ops.map(serializeOp).join('\n') + '\n' : '';
}

export async function syncOps(opts: SyncOpsOptions): Promise<SyncOpsSummary> {
  const { local, remote, storage } = opts;
  const summary: SyncOpsSummary = {
    pushed: [], pulled: [], merged: [], appliedOps: 0, errors: [], finishedAt: '',
  };
  const newOps: Op[] = [];

  let localFiles: string[];
  let remoteList: Awaited<ReturnType<RemoteStore['list']>>;
  try {
    [localFiles, remoteList] = await Promise.all([local.list('.'), remote.list()]);
  } catch (e) {
    summary.errors.push({ path: '<list>', message: (e as Error).message });
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  const localSet = new Set(localFiles.map(normalize).filter(inSyncScope));
  const remoteSet = new Set(remoteList.map(f => normalize(f.path)).filter(inSyncScope));
  const all = new Set([...localSet, ...remoteSet]);

  for (const path of all) {
    try {
      const inLocal = localSet.has(path);
      const inRemote = remoteSet.has(path);
      const isOps = isOpLogPath(path);

      if (inLocal && !inRemote) {
        await remote.put(path, await local.readText(path));
        summary.pushed.push(path); // local ops are already applied locally
        continue;
      }
      if (!inLocal && inRemote) {
        const text = await remote.get(path);
        await local.writeText(path, text);
        summary.pulled.push(path);
        if (isOps) newOps.push(...parseOpsText(text));
        continue;
      }
      // both sides have it
      if (!isOps) continue; // attachments/config: derived or binary; leave as-is
      const [localText, remoteText] = await Promise.all([local.readText(path), remote.get(path)]);
      if (localText === remoteText) continue;
      const merged = sortedUniqueById([...parseOpsText(localText), ...parseOpsText(remoteText)]);
      const mergedText = serializeOps(merged);
      await local.writeText(path, mergedText);
      await remote.put(path, mergedText);
      summary.merged.push(path);
      newOps.push(...merged); // applyOp dedups already-applied ops
    } catch (e) {
      summary.errors.push({ path, message: (e as Error).message });
    }
  }

  if (storage && newOps.length) {
    try {
      await storage.transaction(async tx => {
        await tx.exec('PRAGMA defer_foreign_keys = ON');
        for (const op of sortedUniqueById(newOps)) {
          if (await applyOpInTx(tx, op, local)) summary.appliedOps += 1;
        }
      });
    } catch (e) {
      summary.appliedOps = 0;
      summary.errors.push({ path: '<apply>', message: (e as Error).message });
    }
  }
  if (storage) await setSyncMeta(storage, 'last_sync_at', new Date().toISOString());

  summary.finishedAt = new Date().toISOString();
  return summary;
}
