import Database from 'better-sqlite3';
import type { Storage, SqlParam } from '../storage.js';

/**
 * Test-only {@link Storage} backed by real SQLite (better-sqlite3, in-memory).
 * Lives under __tests__ so the published package never depends on the native
 * module. Enables `foreign_keys` (off by default — required for the schema's
 * ON DELETE SET NULL/CASCADE) on connect, matching production impls.
 */
class BetterSqliteStorage implements Storage {
  constructor(private db: Database.Database) {}

  async query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    this.db.prepare(sql).run(...params);
  }

  async transaction<T>(fn: (tx: Storage) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    }
  }
}

export function createTestStorage(): Storage {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return new BetterSqliteStorage(db);
}
