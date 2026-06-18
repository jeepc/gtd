import { create } from 'zustand';
import {
  LoopDB, type Entry, type VaultConfig, type AppSettings, defaultVaultConfig, defaultAppSettings,
  type EntryStatus, searchEntries, WebDAVClient, syncOps, type SyncOpsSummary,
  type ScalarValue, reconcileReminders, parseCapture, ulid,
  type Storage, type FileSystem,
} from '@loop/core';
import { LocalStorageFileSystem, TauriFileSystem } from '../platform/tauriFs.ts';
import { TauriSqliteStorage } from '../platform/tauriSqlite.ts';
import { TauriAppSettings } from '../platform/tauriSettings.ts';
import { loadSecret, refFor } from '../platform/secrets.ts';
import { createDesktopNotifier } from '../platform/notifications.ts';
import { webdavFetch } from '../platform/webdavFetch.ts';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

/**
 * Sync state machine (PRD §4.7.1), simplified for the v2.0 op-level sync.
 *   idle      — last sync succeeded
 *   syncing   — pull/push in progress
 *   error     — network / auth failure
 *   disabled  — user turned off sync or no WebDAV configured
 *
 * The v1.x `pull_required` and `conflict` states are gone: the op log is
 * append-only and merged by ULID order, so there are no push rejections or
 * entry-level conflicts to resolve (§6.4).
 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'disabled';

interface VaultState {
  db: LoopDB | null;
  entries: Entry[];
  vaultConfig: VaultConfig;
  appSettings: AppSettings;
  syncStatus: SyncStatus;
  syncStatusDetail: string;
  lastSync: SyncOpsSummary | null;
  banner: string | null;
  /** True when no usable vault path is configured — UI redirects to WelcomeScreen. */
  needsWelcome: boolean;
  /** True until the very first `init()` finishes — UI shows a splash, not Welcome, during this window. */
  initializing: boolean;

  init(): Promise<void>;
  initVault(absolutePath: string): Promise<void>;
  refresh(): Promise<void>;
  rebuildDatabase(): Promise<void>;

  create(content: string, status?: EntryStatus): Promise<void>;
  toggleDone(id: string, done: boolean): Promise<void>;
  update(id: string, patch: { content?: string; status?: EntryStatus }): Promise<void>;
  remove(id: string): Promise<void>;
  setProperty(id: string, key: string, value: ScalarValue | null): Promise<void>;

  saveVaultConfig(cfg: VaultConfig): Promise<void>;
  saveAppSettings(s: AppSettings): Promise<void>;

  syncNow(): Promise<void>;
  scheduleAutoSync(): void;
  search(query: string): Entry[];

  onWindowFocus(): void;
  onWindowBlur(): void;
}

let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let periodicSyncTimer: ReturnType<typeof setInterval> | null = null;
// Held outside the reactive store: `syncOps` needs the FileSystem + Storage that
// back the current LoopDB, but neither is rendered, so they don't belong in state.
let currentFs: FileSystem | null = null;
let currentStorage: Storage | null = null;
const settingsStore = new TauriAppSettings();
const reminderNotifier = createDesktopNotifier();

export const useVaultStore = create<VaultState>((set, get) => ({
  db: null,
  entries: [],
  vaultConfig: defaultVaultConfig(),
  appSettings: defaultAppSettings(),
  syncStatus: 'disabled',
  syncStatusDetail: '',
  lastSync: null,
  banner: null,
  needsWelcome: false,
  initializing: true,

  async init() {
    if (get().db) { set({ initializing: false }); return; }

    // 1. Load AppSettings first (vault path lives here).
    const settings = await settingsStore.load();
    set({ appSettings: settings });

    // Migrate legacy localStorage vault root used in PRD v1.1.
    if (!settings.vaultPath) {
      const legacy = localStorage.getItem('loop:vaultRoot');
      if (legacy && isAbsolutePath(legacy)) {
        const migrated = { ...settings, vaultPath: legacy };
        await settingsStore.save(migrated);
        set({ appSettings: migrated });
      }
    }

    const path = get().appSettings.vaultPath || await defaultVaultPath();

    try {
      await get().initVault(path);
    } catch (e) {
      set({ banner: `打开 vault 失败：${(e as Error).message}` });
    } finally {
      set({ initializing: false });
    }
  },

  async initVault(absolutePath: string) {
    const fs = isTauri ? new TauriFileSystem(absolutePath) : new LocalStorageFileSystem();
    currentFs = fs;

    // Persist the path (no-op if already saved by WelcomeScreen).
    const settings = get().appSettings;
    if (settings.vaultPath !== absolutePath) {
      const next = { ...settings, vaultPath: absolutePath };
      await settingsStore.save(next);
      set({ appSettings: next });
    }

    // The SQLite Storage backend is native-only. In browser dev there is no
    // rusqlite, so run UI-only with no DB rather than crashing.
    if (!isTauri) {
      currentStorage = null;
      set({
        db: null, vaultConfig: defaultVaultConfig(), needsWelcome: false,
        syncStatus: 'disabled', banner: '浏览器预览暂不支持 SQLite，请在 Tauri 中运行',
      });
      return;
    }

    // `data.db` lives at the vault root but is never synced — it is the disposable
    // local query authority, rebuilt from the op log when absent (§1.5.5).
    const storage = await TauriSqliteStorage.open(`${absolutePath}/data.db`);
    currentStorage = storage;
    const db = new LoopDB(storage, fs, getDeviceId());
    await db.init(); // creates schema + rebuilds from op log if the DB is missing/stale

    const vaultConfig = await loadVaultConfig(db);
    set({ db, vaultConfig, needsWelcome: false, syncStatus: deriveDisabledState(get().appSettings) });
    await get().refresh();

    // PRD §4.7.2: startup sync is delayed 3s so the UI is interactive first.
    const trySync = () => {
      const s = get().appSettings;
      if (s.sync.autoSync && s.sync.webdav) get().syncNow();
    };
    setTimeout(trySync, 3000);

    setupPeriodicTimer(get);
  },

  async refresh() {
    const db = get().db;
    if (!db) return;
    const entries = await db.listEntries({ limit: 500 });
    set({ entries });
    try {
      await reconcileReminders(entries, reminderNotifier);
    } catch (e) {
      set({ banner: '提醒调度失败：' + (e as Error).message });
    }
  },

  async rebuildDatabase() {
    const db = get().db;
    if (!db) return;
    // PRD §1.5.5 #3: data.db is disposable — replay the op log to recover from
    // any state divergence (Ctrl/Cmd+R, or the About-page button).
    await db.rebuild();
    await get().refresh();
  },

  scheduleAutoSync() {
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    const s = get().appSettings;
    if (!s.sync.autoSync || !s.sync.webdav) return;
    autoSyncTimer = setTimeout(() => get().syncNow(), 30_000);
  },

  async create(content, _status = 'todo') {
    const db = get().db;
    if (!db || !content.trim()) return;
    // Level 2 capture: extracts `@time`→due, trailing `!`→priority, and the
    // `/ongoing` (and other) status commands (database-design §4.3).
    const { status: s, content: c, metadata } = parseCapture(content);
    try {
      await db.createEntry({ content: c, status: s, metadata });
    } catch (e) {
      set({ banner: '保存失败：' + (e as Error).message });
      throw e;
    }
    await get().refresh();
    get().scheduleAutoSync();
  },

  async toggleDone(id, done) {
    const db = get().db;
    if (!db) return;
    await db.updateEntry(id, { status: done ? 'done' : 'todo' });
    await get().refresh();
    get().scheduleAutoSync();
  },

  async update(id, patch) {
    const db = get().db;
    if (!db) return;
    await db.updateEntry(id, patch);
    await get().refresh();
    get().scheduleAutoSync();
  },

  async remove(id) {
    const db = get().db;
    if (!db) return;
    await db.deleteEntry(id);
    await get().refresh();
    get().scheduleAutoSync();
  },

  async setProperty(id, key, value) {
    const db = get().db;
    if (!db) return;
    try {
      // null clears a field — that goes through updateEntry's metadata patch
      // (setProperty only accepts a concrete scalar).
      if (value === null) await db.updateEntry(id, { metadata: { [key]: null } });
      else await db.setProperty(id, key, value);
    } catch (e) {
      set({ banner: (e as Error).message });
      return;
    }
    await get().refresh();
    get().scheduleAutoSync();
  },

  async saveVaultConfig(cfg) {
    const db = get().db;
    if (!db) { set({ vaultConfig: cfg }); return; }
    // config.json is op-log-derived (§6.4): write the synced sub-trees as config ops.
    await db.setConfig(['ui'], cfg.ui);
    await db.setConfig(['tagColors'], cfg.tagColors);
    set({ vaultConfig: cfg });
  },

  async saveAppSettings(s) {
    await settingsStore.save(s);
    set({ appSettings: s, syncStatus: deriveDisabledState(s) });
    setupPeriodicTimer(get);
  },

  async syncNow() {
    const db = get().db;
    const s = get().appSettings;
    if (!db || !currentFs || !currentStorage || !s.sync.webdav) {
      set({ syncStatus: 'disabled', banner: '尚未配置 WebDAV，前往「设置 → 同步配置」' });
      return;
    }
    set({ syncStatus: 'syncing', syncStatusDetail: '正在同步…' });
    try {
      const password = await loadSecret(s.sync.webdav.passwordRef || refFor('webdav'));
      const remote = new WebDAVClient({
        url: s.sync.webdav.url,
        username: s.sync.webdav.username,
        password,
      }, webdavFetch);
      // op-level sync: pulls/merges op files and applies new ops to SQLite itself.
      const summary = await syncOps({ local: currentFs, remote, storage: currentStorage });
      const next = classifySyncResult(summary, s);
      set({ lastSync: summary, ...next });
    } catch (e) {
      const message = (e as Error).message;
      set({
        syncStatus: 'error',
        syncStatusDetail: message,
        banner: '同步失败：' + message,
      });
    } finally {
      await get().refresh();
    }
  },

  search(query) {
    return searchEntries(get().entries, query);
  },

  onWindowFocus() {
    const s = get().appSettings;
    if (s.sync.syncOnFocus && s.sync.autoSync && s.sync.webdav) {
      get().syncNow();
    }
  },

  onWindowBlur() {
    const s = get().appSettings;
    if (s.sync.syncOnBlur && s.sync.autoSync && s.sync.webdav) {
      get().syncNow();
    }
  },
}));

/** Stable per-device id (op origin marker). Persisted locally, outside the vault. */
function getDeviceId(): string {
  let id = localStorage.getItem('loop:deviceId');
  if (!id) { id = ulid(); localStorage.setItem('loop:deviceId', id); }
  return id;
}

/** Read config.json (op-derived) and hydrate it into a {@link VaultConfig}. */
async function loadVaultConfig(db: LoopDB): Promise<VaultConfig> {
  const def = defaultVaultConfig();
  const raw = await db.getConfig();
  const ui = (raw.ui ?? {}) as Partial<VaultConfig['ui']>;
  return {
    version: 1,
    ui: { ...def.ui, ...ui },
    tagColors: (raw.tagColors as Record<string, string>) ?? {},
  };
}

function deriveDisabledState(s: AppSettings): SyncStatus {
  if (!s.sync.autoSync || !s.sync.webdav) return 'disabled';
  return 'idle';
}

function classifySyncResult(summary: SyncOpsSummary, s: AppSettings): Partial<VaultState> {
  if (summary.errors.length > 0) {
    return { syncStatus: 'error', syncStatusDetail: summary.errors[0]!.message, banner: '同步失败：' + summary.errors[0]!.message };
  }
  return {
    syncStatus: deriveDisabledState(s) === 'disabled' ? 'disabled' : 'idle',
    syncStatusDetail: `已于 ${formatLocalTime(new Date())} 同步`,
    banner: null,
  };
}

function setupPeriodicTimer(get: () => VaultState): void {
  if (periodicSyncTimer) {
    clearInterval(periodicSyncTimer);
    periodicSyncTimer = null;
  }
  const s = get().appSettings;
  if (!s.sync.autoSync || !s.sync.webdav) return;
  const minutes = Math.max(1, s.sync.intervalMinutes || 5);
  periodicSyncTimer = setInterval(() => {
    if (get().syncStatus !== 'syncing') get().syncNow();
  }, minutes * 60_000);
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
}

async function defaultVaultPath(): Promise<string> {
  if (!isTauri) return 'loop-browser-vault';
  const { homeDir, join } = await import('@tauri-apps/api/path');
  return join(await homeDir(), 'Loop-Vault');
}

function formatLocalTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export { saveSecret, loadSecret, deleteSecret, refFor } from '../platform/secrets.ts';
