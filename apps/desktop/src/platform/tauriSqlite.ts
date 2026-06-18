import { invoke } from '@tauri-apps/api/core';
import type { Storage, SqlParam } from '@loop/core';

/**
 * Desktop `Storage` impl over the custom rusqlite command layer (src-tauri/src/
 * sqlite.rs). The Rust side holds a single connection behind a Mutex, so the
 * lock between calls is released; to keep a `BEGIN…COMMIT` block atomic we
 * serialize every `transaction(fn)` through a JS promise-chain mutex. This
 * mirrors the synchronous better-sqlite3 reference impl in
 * `packages/core/src/__tests__/testStorage.ts`.
 */
export class TauriSqliteStorage implements Storage {
  /** Serializes transactions so two BEGIN/COMMIT blocks never interleave. */
  private static txLock: Promise<unknown> = Promise.resolve();

  static async open(absDbPath: string): Promise<TauriSqliteStorage> {
    await invoke('sql_open', { path: absDbPath });
    return new TauriSqliteStorage();
  }

  query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return invoke<T[]>('sql_select', { sql, params });
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    await invoke('sql_execute', { sql, params });
  }

  async transaction<T>(fn: (tx: Storage) => Promise<T>): Promise<T> {
    // Chain onto the shared lock so transactions run one at a time. We swallow
    // the predecessor's result/rejection here (it's awaited by its own caller).
    const run = TauriSqliteStorage.txLock.then(() => this.runTransaction(fn));
    TauriSqliteStorage.txLock = run.then(() => undefined, () => undefined);
    return run;
  }

  private async runTransaction<T>(fn: (tx: Storage) => Promise<T>): Promise<T> {
    await this.exec('BEGIN');
    try {
      const result = await fn(this);
      await this.exec('COMMIT');
      return result;
    } catch (e) {
      try { await this.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  }
}
