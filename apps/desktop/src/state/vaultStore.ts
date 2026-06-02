import { create } from 'zustand';
import {
  Vault, type Entry, type VaultConfig, type AppSettings, defaultVaultConfig, defaultAppSettings,
  type EntryStatus, searchEntries, WebDAVClient, sync, type SyncSummary,
  type ScalarValue, reconcileReminders, parseCapture,
} from '@loop/core';
import { LocalStorageFileSystem, TauriFileSystem } from '../platform/tauriFs.ts';
import { TauriAppSettings } from '../platform/tauriSettings.ts';
import { loadSecret, refFor } from '../platform/secrets.ts';
import { createDesktopNotifier } from '../platform/notifications.ts';
import { webdavFetch } from '../platform/webdavFetch.ts';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

/**
 * Sync state machine per PRD §4.7.1.
 *   idle           — last sync succeeded
 *   syncing        — pull/push in progress
 *   pull_required  — push rejected (divergence); will auto-pull and retry
 *   conflict       — true conflict written to `.conflicts/`
 *   error          — network / auth failure
 *   disabled       — user turned off sync or no WebDAV configured
 */
export type SyncStatus = 'idle' | 'syncing' | 'pull_required' | 'conflict' | 'error' | 'disabled';

interface VaultState {
  vault: Vault | null;
  entries: Entry[];
  vaultConfig: VaultConfig;
  appSettings: AppSettings;
  syncStatus: SyncStatus;
  syncStatusDetail: string;
  lastSync: SyncSummary | null;
  banner: string | null;
  /** True when no usable vault path is configured — UI redirects to WelcomeScreen. */
  needsWelcome: boolean;
  /** True until the very first `init()` finishes — UI shows a splash, not Welcome, during this window. */
  initializing: boolean;

  init(): Promise<void>;
  initVault(absolutePath: string): Promise<void>;
  refresh(): Promise<void>;
  reloadVault(): Promise<void>;

  create(content: string, status?: EntryStatus): Promise<void>;
  toggleDone(id: string, done: boolean): Promise<void>;
  update(id: string, patch: { content?: string; status?: EntryStatus }): Promise<void>;
  remove(id: string): Promise<void>;
  setProperty(id: string, key: string, value: ScalarValue | null): Promise<void>;

  saveVaultConfig(cfg: VaultConfig): Promise<void>;
  saveAppSettings(s: AppSettings): Promise<void>;

  syncNow(): Promise<void>;
  scheduleAutoSync(): void;
  resolveConflict(id: string, choice: 'local' | 'remote' | 'both'): Promise<void>;
  search(query: string): Entry[];

  onWindowFocus(): void;
  onWindowBlur(): void;
}

let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let periodicSyncTimer: ReturnType<typeof setInterval> | null = null;
const settingsStore = new TauriAppSettings();
const reminderNotifier = createDesktopNotifier();

export const useVaultStore = create<VaultState>((set, get) => ({
  vault: null,
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
    if (get().vault) { set({ initializing: false }); return; }

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
    const vault = new Vault(fs);
    const vaultConfig = await vault.loadVaultConfig();
    // Persist the path (no-op if already saved by WelcomeScreen).
    const settings = get().appSettings;
    if (settings.vaultPath !== absolutePath) {
      const next = { ...settings, vaultPath: absolutePath };
      await settingsStore.save(next);
      set({ appSettings: next });
    }
    set({ vault, vaultConfig, needsWelcome: false, syncStatus: deriveDisabledState(get().appSettings) });
    await get().refresh();
    vault.gcTombstones().catch(() => { /* best-effort */ });

    // PRD §4.7.2: startup sync is delayed 3s so the UI is interactive first.
    const trySync = () => {
      const s = get().appSettings;
      if (s.sync.autoSync && s.sync.webdav) get().syncNow();
    };
    setTimeout(trySync, 3000);

    setupPeriodicTimer(get);
  },

  async refresh() {
    const v = get().vault;
    if (!v) return;
    const entries = await v.listEntries({ limit: 500 });
    set({ entries });
    try {
      await reconcileReminders(entries, reminderNotifier);
    } catch (e) {
      set({ banner: '提醒调度失败：' + (e as Error).message });
    }
  },

  async reloadVault() {
    const v = get().vault;
    if (!v) return;
    // PRD §1.5.5 #4: full rebuild path to recover from any state divergence.
    v.invalidateAll();
    await get().refresh();
  },

  scheduleAutoSync() {
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    const s = get().appSettings;
    if (!s.sync.autoSync || !s.sync.webdav) return;
    autoSyncTimer = setTimeout(() => get().syncNow(), 30_000);
  },

  async create(content, _status = 'todo') {
    const v = get().vault;
    if (!v || !content.trim()) return;
    // Level 2 capture: extracts `@time`→due and trailing `!`→priority for todos
    // (database-design v1.1 §4.3); /log /done bodies pass through unchanged.
    const { status: s, content: c, metadata } = parseCapture(content);
    try {
      await v.createEntry({ content: c, status: s, metadata });
    } catch (e) {
      set({ banner: '保存失败：' + (e as Error).message });
      throw e;
    }
    await get().refresh();
    get().scheduleAutoSync();
  },

  async toggleDone(id, done) {
    const v = get().vault;
    if (!v) return;
    await v.updateEntry(id, { status: done ? 'done' : 'todo' });
    await get().refresh();
    get().scheduleAutoSync();
  },

  async update(id, patch) {
    const v = get().vault;
    if (!v) return;
    await v.updateEntry(id, patch);
    await get().refresh();
    get().scheduleAutoSync();
  },

  async remove(id) {
    const v = get().vault;
    if (!v) return;
    await v.deleteEntry(id);
    await get().refresh();
    get().scheduleAutoSync();
  },

  async setProperty(id, key, value) {
    const v = get().vault;
    if (!v) return;
    try {
      await v.setProperty(id, key, value);
    } catch (e) {
      set({ banner: (e as Error).message });
      return;
    }
    await get().refresh();
    get().scheduleAutoSync();
  },

  async saveVaultConfig(cfg) {
    const v = get().vault;
    if (!v) return;
    await v.saveVaultConfig(cfg);
    set({ vaultConfig: cfg });
  },

  async saveAppSettings(s) {
    await settingsStore.save(s);
    set({ appSettings: s, syncStatus: deriveDisabledState(s) });
    setupPeriodicTimer(get);
  },

  async syncNow() {
    const v = get().vault;
    const s = get().appSettings;
    if (!v || !s.sync.webdav) {
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
      const summary = await sync({ local: (v as any).fs, remote });
      v.invalidateAll();
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

  async resolveConflict(id, choice) {
    const v = get().vault;
    if (!v) return;
    const remote = choice === 'local' ? undefined : await v.findArchivedRemote(id) ?? undefined;
    await v.resolveConflict(id, choice, remote);
    await get().refresh();
    const remaining = await v.listConflicts();
    if (remaining.length === 0) {
      set({ syncStatus: 'idle', syncStatusDetail: '冲突已解决', banner: null });
    } else {
      set({ banner: `${remaining.length} 个文件存在冲突` });
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

function deriveDisabledState(s: AppSettings): SyncStatus {
  if (!s.sync.autoSync || !s.sync.webdav) return 'disabled';
  return 'idle';
}

function classifySyncResult(summary: SyncSummary, s: AppSettings): Partial<VaultState> {
  if (summary.errors.length > 0) {
    return { syncStatus: 'error', syncStatusDetail: summary.errors[0]!.message, banner: '同步失败：' + summary.errors[0]!.message };
  }
  if (summary.conflicts.length > 0) {
    return { syncStatus: 'conflict', syncStatusDetail: `${summary.conflicts.length} 个文件存在冲突`, banner: `${summary.conflicts.length} 个文件存在冲突` };
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
