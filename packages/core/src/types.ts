/**
 * Entry status (PRD §2.1). `ongoing` (v2.0) is a continuously-in-progress item
 * that is NOT meant to be ticked off — it is archived or turned into `done`/a
 * Project by an explicit user action, never auto-completed.
 */
export type EntryStatus = 'todo' | 'done' | 'log' | 'ongoing';

/** A metadata value. JSON scalars only (§6.7.4); `null` doubles as a delete sentinel. */
export type ScalarValue = string | number | boolean | null;

/**
 * Entry metadata is an OPEN key-value map (PRD §6.7). Only a handful of base
 * fields are recognized by name; every other key is an arbitrary user field
 * (e.g. `due`, `priority`, `project`) or, when prefixed with `_`, a system
 * field that is hidden in the UI and never sent to AI (§6.7.2 / §8.3).
 */
export interface EntryMetadata {
  /** ISO 8601 last-update time. Always present; drives sync conflict resolution. */
  updated: string;
  /** ISO 8601 completion time (status=done). */
  done?: string;
  /** ISO 8601 log time (status=log). */
  log?: string;
  /** ISO 8601 tombstone time (§6.4.3). */
  deleted?: string;
  /** Arbitrary user / system fields. */
  [key: string]: ScalarValue | undefined;
}

export interface Entry {
  id: string;
  content: string;
  status: EntryStatus;
  tags: string[];
  date: string;
  /**
   * Optional associated Project (v2.0). Null when not linked. Optional in the
   * type so the legacy markdown path (parser/serializer/vault) keeps compiling
   * during migration; the SQLite repo always populates it.
   */
  project_id?: string | null;
  metadata: EntryMetadata;
}

// --- v2.0 entities (PRD §2.2 / §2.3) -------------------------------------

/** A goal with a terminal state, carrying a markdown body and linked entries. */
export interface Project {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'archived';
  /** Markdown body holding goals, notes, milestones. */
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  metadata: Record<string, ScalarValue>;
}

/** Recurring habit definition. Progress is computed dynamically from `match`. */
export interface HabitSchedule {
  period: 'day' | 'week' | 'month';
  target_min: number;
  target_max: number;
  /** MVP match rule: entries carrying this tag count toward the habit. */
  match: { tag: string };
}

export interface Habit {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'paused' | 'archived';
  body: string;
  schedule: HabitSchedule;
  created_at: string;
  updated_at: string;
  metadata: Record<string, ScalarValue>;
}

/** Computed progress of a habit for one period (no DB column; derived). */
export interface HabitProgress {
  habitId: string;
  period: HabitSchedule['period'];
  /** Inclusive period bounds, YYYY-MM-DD. */
  rangeStart: string;
  rangeEnd: string;
  /** Number of matching entries in the current period. */
  count: number;
  target_min: number;
  target_max: number;
}

// --- Op log (PRD §6.3) ---------------------------------------------------

/** Every kind of mutation recorded in the append-only op log (§6.3.2). */
export type OpKind =
  | 'entry.create'
  | 'entry.update'
  | 'entry.delete'
  | 'entry.set_metadata'
  | 'project.create'
  | 'project.update'
  | 'project.archive'
  | 'project.unarchive'
  | 'project.delete'
  | 'habit.create'
  | 'habit.update'
  | 'habit.delete'
  | 'config.set'
  | 'config.unset';

/**
 * A single op. `id` is a ULID (time-ordered, drives apply order); `at` is the
 * wall-clock ISO time used for LWW; `payload` shape depends on `kind` (§6.3.2).
 */
export interface Op {
  id: string;
  device_id: string;
  schema_version: number;
  at: string;
  kind: OpKind;
  payload: Record<string, unknown>;
}

export interface DayFile {
  date: string;
  version: number;
  updatedAt: string;
  entries: Entry[];
}

/**
 * Vault config — persisted as `<vault>/config.json` and synced via WebDAV.
 * Holds the prefs a user expects to be consistent when opening the same vault
 * on a different device (PRD §6.5). Never holds credentials or machine state.
 */
export interface VaultConfig {
  version: 1;
  ui: {
    theme: 'auto' | 'light' | 'dark';
    language: 'zh-CN' | 'en-US';
    /** Pin `ongoing` entries to the top of the home list (PRD §4.9.1). Default on. */
    ongoing_pinned?: boolean;
  };
  tagColors: Record<string, string>;
}

/**
 * App settings — persisted on the local machine only (e.g. `<appConfigDir>/
 * settings.json` on desktop). Holds machine-specific state and credential
 * *references* (PRD §6.6). Actual secrets live in the OS keychain (§8.2).
 */
export interface AppSettings {
  version: 1;
  /** Absolute path to the vault root. Empty string = unset (show WelcomeScreen). */
  vaultPath: string;
  sync: {
    webdav: {
      url: string;
      username: string;
      /** Opaque reference like `keychain://loop/webdav`. Value lives in keychain. */
      passwordRef: string;
    } | null;
    autoSync: boolean;
    intervalMinutes: number;
    syncOnFocus: boolean;
    syncOnBlur: boolean;
  };
  window?: {
    width: number;
    height: number;
  };
  /** Machine-local UI preferences. */
  ui?: {
    /** Show the `#`/`@`/`!` quick-insert toolbar above the capture input. */
    showInputToolbar: boolean;
  };
}

/**
 * @deprecated Use {@link VaultConfig} or {@link AppSettings}. Kept as a type
 * alias for vault config so existing imports keep compiling during migration.
 */
export type AppConfig = VaultConfig;

export const DATA_FORMAT_VERSION = 1;

export function defaultVaultConfig(): VaultConfig {
  return {
    version: 1,
    ui: { theme: 'dark', language: 'zh-CN', ongoing_pinned: true },
    tagColors: {},
  };
}

export function defaultAppSettings(): AppSettings {
  return {
    version: 1,
    vaultPath: '',
    sync: {
      webdav: null,
      autoSync: true,
      intervalMinutes: 5,
      syncOnFocus: true,
      syncOnBlur: true,
    },
    ui: { showInputToolbar: true },
  };
}

/** @deprecated Use {@link defaultVaultConfig}. */
export const defaultConfig = defaultVaultConfig;
