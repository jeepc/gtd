/**
 * Platform-agnostic SQLite access (v2.0). `data.db` is the local query authority,
 * always rebuildable from the op log (PRD §1.5.5). Each platform injects an impl:
 * desktop → tauri-plugin-sql, mobile → react-native-quick-sqlite, Node MCP /
 * tests → better-sqlite3. Mirrors the {@link FileSystem} pattern.
 *
 * Every impl MUST, on connect, enable `PRAGMA foreign_keys = ON` (off by default
 * in SQLite — required for `ON DELETE SET NULL`/`CASCADE` in the schema to fire)
 * and `PRAGMA journal_mode = WAL` (so the app and Node MCP can share the file).
 */

/** A bound SQL parameter. SQLite scalars only (numbers, text, null). */
export type SqlParam = string | number | null;

export interface Storage {
  /** Run a query and return all rows. */
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  /** Run a statement with no result set (INSERT/UPDATE/DELETE/DDL/PRAGMA). */
  exec(sql: string, params?: SqlParam[]): Promise<void>;
  /**
   * Run `fn` inside a single transaction. The callback receives a Storage scoped
   * to the transaction; throwing rolls back, returning commits.
   */
  transaction<T>(fn: (tx: Storage) => Promise<T>): Promise<T>;
}
