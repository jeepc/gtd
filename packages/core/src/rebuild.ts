import type { Storage } from './storage.js';
import type { FileSystem } from './fs.js';
import { createSchema, schemaExists, getSyncMeta, setSyncMeta } from './schema.js';
import { readAllOps, sortedUniqueById } from './oplog.js';
import { applyOpInTx } from './apply.js';
import { writeConfig } from './config.js';

/**
 * Replay the op log into a fresh `data.db` (PRD §1.5.5: the local database is
 * disposable). Used on first run, when `data.db` is missing/corrupt, and from the
 * "rebuild local database" command.
 */

export interface RebuildResult {
  opsApplied: number;
  parseErrors: { path: string; line: number; raw: string }[];
}

// Children before parents so FK clearing is clean regardless of pragma state.
const CLEAR_ORDER = [
  'entry_tags', 'project_tags', 'entries', 'projects', 'habits', 'applied_ops',
];

export async function rebuild(storage: Storage, fs: FileSystem): Promise<RebuildResult> {
  await createSchema(storage);
  // device_id is machine-local, not op-derived — preserve it across the wipe.
  const deviceId = await getSyncMeta(storage, 'device_id');
  for (const t of CLEAR_ORDER) await storage.exec(`DELETE FROM ${t}`);
  await storage.exec(`DELETE FROM sync_meta`);
  await createSchema(storage); // reseed schema_version
  if (deviceId !== null) await setSyncMeta(storage, 'device_id', deviceId);
  // config.json is op-derived too → reset before replay.
  await writeConfig(fs, {});

  const { ops, errors } = await readAllOps(fs);
  let applied = 0;
  await storage.transaction(async tx => {
    // Defer FK checks to commit so ULID-ordered ops whose parent/child share a
    // millisecond (e.g. project + linked entry) replay without ordering errors.
    await tx.exec('PRAGMA defer_foreign_keys = ON');
    for (const op of sortedUniqueById(ops)) {
      if (await applyOpInTx(tx, op, fs)) applied++;
    }
  });
  return { opsApplied: applied, parseErrors: errors };
}

/**
 * Light startup check: does the local DB lag behind the op log on disk? True if
 * the schema is absent or the newest op id exceeds `last_applied_op_id`.
 */
export async function needsRebuild(storage: Storage, fs: FileSystem): Promise<boolean> {
  if (!(await schemaExists(storage))) return true;
  const last = await getSyncMeta(storage, 'last_applied_op_id');
  const { ops } = await readAllOps(fs);
  if (!ops.length) return false;
  let maxId = '';
  for (const op of ops) if (op.id > maxId) maxId = op.id;
  return last === null || last < maxId;
}
