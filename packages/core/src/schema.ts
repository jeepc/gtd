import type { Storage } from './storage.js';

/**
 * SQLite schema (PRD §6.2). The DDL below is the source of truth for the local
 * query database; it is recreated on rebuild from the op log.
 *
 * Bump {@link SCHEMA_VERSION} when the DDL or op payload shape changes; the apply
 * engine's upgrade layer (`apply.ts`) migrates older ops forward on replay.
 */
export const SCHEMA_VERSION = 1;

/** Each statement runs individually (some drivers reject multi-statement exec). */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    body         TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    archived_at  TEXT,
    metadata     TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug)`,
  `CREATE TABLE IF NOT EXISTS project_tags (
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tag          TEXT NOT NULL,
    PRIMARY KEY (project_id, tag)
  )`,
  `CREATE TABLE IF NOT EXISTS entries (
    id           TEXT PRIMARY KEY,
    content      TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('todo', 'done', 'log', 'ongoing')),
    date         TEXT NOT NULL,
    project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    done_at      TEXT,
    log_at       TEXT,
    metadata     TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS entry_tags (
    entry_id     TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    tag          TEXT NOT NULL,
    PRIMARY KEY (entry_id, tag)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag)`,
  `CREATE TABLE IF NOT EXISTS habits (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL CHECK (status IN ('active', 'paused', 'archived')),
    body         TEXT NOT NULL DEFAULT '',
    schedule     TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    metadata     TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_habits_status ON habits(status)`,
  `CREATE INDEX IF NOT EXISTS idx_habits_slug ON habits(slug)`,
  `CREATE TABLE IF NOT EXISTS sync_meta (
    key          TEXT PRIMARY KEY,
    value        TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS applied_ops (
    op_id        TEXT PRIMARY KEY,
    applied_at   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_applied_ops_applied ON applied_ops(applied_at)`,
];

/**
 * Create the schema (idempotent) and seed `sync_meta.schema_version`. The caller
 * is responsible for `PRAGMA foreign_keys = ON` on the connection (see Storage).
 */
export async function createSchema(storage: Storage): Promise<void> {
  for (const stmt of SCHEMA_STATEMENTS) {
    await storage.exec(stmt);
  }
  const existing = await getSyncMeta(storage, 'schema_version');
  if (existing === null) {
    await setSyncMeta(storage, 'schema_version', String(SCHEMA_VERSION));
  }
}

/** True if the core tables already exist (used to decide first-run rebuild). */
export async function schemaExists(storage: Storage): Promise<boolean> {
  const rows = await storage.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='entries'`,
  );
  return rows.length > 0;
}

export async function getSyncMeta(storage: Storage, key: string): Promise<string | null> {
  const rows = await storage.query<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = ?`,
    [key],
  );
  return rows.length ? rows[0]!.value : null;
}

export async function setSyncMeta(storage: Storage, key: string, value: string): Promise<void> {
  await storage.exec(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
