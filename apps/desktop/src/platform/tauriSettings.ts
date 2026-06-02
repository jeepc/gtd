import { type AppSettings, type AppSettingsStore, defaultAppSettings, parseAppSettings, serializeAppSettings } from '@loop/core';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

const SETTINGS_FILE = 'settings.json';

/**
 * Desktop AppSettings backend. Persists to `<appConfigDir>/settings.json` —
 * NOT inside the vault, so credentials and machine-specific prefs never sync.
 *
 * In the browser-dev fallback (no Tauri bridge) the same data lives in
 * localStorage so the UI can be exercised without a running shell.
 */
export class TauriAppSettings implements AppSettingsStore {
  async load(): Promise<AppSettings> {
    if (!isTauri) return loadFromLocalStorage();
    try {
      const { appConfigDir, join } = await import('@tauri-apps/api/path');
      const { readTextFile, exists, mkdir } = await import('@tauri-apps/plugin-fs');
      const dir = await appConfigDir();
      await mkdir(dir, { recursive: true }).catch(() => { /* dir may already exist */ });
      const path = await join(dir, SETTINGS_FILE);
      if (!(await exists(path))) {
        const def = defaultAppSettings();
        await this.save(def);
        return def;
      }
      return parseAppSettings(await readTextFile(path));
    } catch {
      return defaultAppSettings();
    }
  }

  async save(settings: AppSettings): Promise<void> {
    if (!isTauri) {
      saveToLocalStorage(settings);
      return;
    }
    const { appConfigDir, join } = await import('@tauri-apps/api/path');
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const dir = await appConfigDir();
    await mkdir(dir, { recursive: true }).catch(() => { /* dir may already exist */ });
    const path = await join(dir, SETTINGS_FILE);
    await writeTextFile(path, serializeAppSettings(settings));
  }
}

const LS_KEY = 'loop:appSettings';

function loadFromLocalStorage(): AppSettings {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return defaultAppSettings();
  return parseAppSettings(raw);
}

function saveToLocalStorage(s: AppSettings): void {
  localStorage.setItem(LS_KEY, serializeAppSettings(s));
}
