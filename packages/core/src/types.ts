export type EntryStatus = 'todo' | 'done' | 'log';

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
  metadata: EntryMetadata;
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
    ui: { theme: 'dark', language: 'zh-CN' },
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
