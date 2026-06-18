import type { FileSystem } from './fs.js';
import type { Op } from './types.js';

/**
 * Vault config (PRD §6.5). `config.json` is an op-log-derived artifact, just like
 * `data.db`: it is mutated only through `config.set` / `config.unset` ops so it
 * syncs by replaying the op log. Holds cross-device prefs such as
 * `ui.ongoing_pinned` and `tagColors`.
 */

export const CONFIG_PATH = 'config.json';

export type ConfigPath = (string | number)[];

export async function readConfig(fs: FileSystem): Promise<Record<string, unknown>> {
  if (!(await fs.exists(CONFIG_PATH))) return {};
  try {
    const parsed = JSON.parse(await fs.readText(CONFIG_PATH));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function writeConfig(fs: FileSystem, cfg: Record<string, unknown>): Promise<void> {
  await fs.writeText(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

/** Set `value` at `path`, creating intermediate objects/arrays as needed. */
export function setByPath(root: Record<string, unknown>, path: ConfigPath, value: unknown): void {
  if (!path.length) return;
  let cur: any = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    const nextNumeric = typeof path[i + 1] === 'number';
    if (cur[k] == null || typeof cur[k] !== 'object') {
      cur[k] = nextNumeric ? [] : {};
    }
    cur = cur[k];
  }
  cur[path[path.length - 1]!] = value;
}

/** Remove the value at `path` (no-op if the path does not exist). */
export function unsetByPath(root: Record<string, unknown>, path: ConfigPath): void {
  if (!path.length) return;
  let cur: any = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    if (cur[k] == null || typeof cur[k] !== 'object') return;
    cur = cur[k];
  }
  const last = path[path.length - 1]!;
  if (Array.isArray(cur) && typeof last === 'number') cur.splice(last, 1);
  else delete cur[last];
}

/** Apply a `config.set`/`config.unset` op to `config.json` (read-modify-write). */
export async function applyConfigOp(fs: FileSystem, op: Op): Promise<void> {
  const cfg = await readConfig(fs);
  const path = (op.payload.path as ConfigPath) ?? [];
  if (op.kind === 'config.set') setByPath(cfg, path, op.payload.value);
  else if (op.kind === 'config.unset') unsetByPath(cfg, path);
  await writeConfig(fs, cfg);
}
