import RNFS from 'react-native-fs';
import { type AppSettings, type AppSettingsStore, defaultAppSettings, parseAppSettings, serializeAppSettings } from '@loop/core';

const SETTINGS_PATH = `${RNFS.DocumentDirectoryPath}/settings.json`;

/**
 * Mobile AppSettings backend. Persists to the app sandbox (NOT inside the
 * vault, so credentials and machine-specific prefs never sync).
 */
export class RNAppSettings implements AppSettingsStore {
  async load(): Promise<AppSettings> {
    try {
      if (!(await RNFS.exists(SETTINGS_PATH))) {
        const def = defaultAppSettings();
        await this.save(def);
        return def;
      }
      const text = await RNFS.readFile(SETTINGS_PATH, 'utf8');
      return parseAppSettings(text);
    } catch {
      return defaultAppSettings();
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await RNFS.writeFile(SETTINGS_PATH, serializeAppSettings(settings), 'utf8');
  }
}
