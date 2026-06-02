import { type AppSettings, defaultAppSettings } from './types.js';

/**
 * AppSettingsStore — platform-specific persistence for {@link AppSettings}.
 * Desktop persists to `<appConfigDir>/settings.json`; mobile to a file inside
 * the app sandbox. Anything cross-device should live in `VaultConfig` instead
 * (PRD §6.5 vs §6.6).
 */
export interface AppSettingsStore {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
}

/**
 * Merge a partial settings JSON read from disk with defaults. New fields added
 * in future versions degrade safely on old files because every field falls
 * back to its default. Unknown extra fields are dropped on next save.
 */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const def = defaultAppSettings();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<AppSettings>;
  return {
    version: 1,
    vaultPath: typeof r.vaultPath === 'string' ? r.vaultPath : def.vaultPath,
    sync: {
      ...def.sync,
      ...(r.sync ?? {}),
      webdav: r.sync?.webdav ?? null,
    },
    window: r.window,
    ui: {
      ...def.ui!,
      ...(r.ui ?? {}),
    },
  };
}

/** Render an AppSettings to JSON in a stable shape. */
export function serializeAppSettings(s: AppSettings): string {
  return JSON.stringify(s, null, 2);
}

/** Parse a settings JSON string, returning defaults on error. */
export function parseAppSettings(text: string): AppSettings {
  try {
    return normalizeAppSettings(JSON.parse(text));
  } catch {
    return defaultAppSettings();
  }
}
