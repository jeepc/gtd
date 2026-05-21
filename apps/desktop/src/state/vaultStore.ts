import { create } from 'zustand';
import {
  Vault, type Entry, type AppConfig, defaultConfig, type EntryStatus,
  searchEntries, WebDAVClient, sync, type SyncSummary, parseCommand,
  reconcileReminders, NoopNotifier, type Notifier, type ScalarValue,
} from '@gtd/core';
import { LocalStorageFileSystem, TauriFileSystem } from '../platform/tauriFs.ts';
import { createNotifier } from '../platform/notifier.ts';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

interface VaultState {
  vault: Vault | null;
  entries: Entry[];
  config: AppConfig;
  syncStatus: 'idle' | 'syncing';
  lastSync: SyncSummary | null;
  banner: string | null;

  init(): Promise<void>;
  refresh(): Promise<void>;
  create(content: string, status?: EntryStatus): Promise<void>;
  toggleDone(id: string, done: boolean): Promise<void>;
  update(id: string, patch: { content?: string; status?: EntryStatus }): Promise<void>;
  remove(id: string): Promise<void>;
  saveConfig(cfg: AppConfig): Promise<void>;
  setProperty(id: string, key: string, value: ScalarValue): Promise<void>;
  syncNow(): Promise<void>;
  scheduleAutoSync(): void;
  resolveConflict(id: string, choice: 'local' | 'remote' | 'both'): Promise<void>;
  search(query: string): Entry[];
}

let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let notifier: Notifier = new NoopNotifier();

// Reschedule device-local reminders from the current `due` fields (§ reminders).
async function reconcile(entries: Entry[]): Promise<void> {
  try { await reconcileReminders(entries, notifier); } catch { /* best-effort */ }
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vault: null,
  entries: [],
  config: defaultConfig(),
  syncStatus: 'idle',
  lastSync: null,
  banner: null,

  async init() {
    if (get().vault) return;
    const fs = isTauri
      ? new TauriFileSystem(await resolveVaultRoot())
      : new LocalStorageFileSystem();
    const vault = new Vault(fs);
    const config = await vault.loadConfig();
    notifier = createNotifier();
    set({ vault, config });
    await get().refresh();
    // PRD §6.4.4: physically remove tombstones older than 30 days on startup.
    vault.gcTombstones().catch(() => { /* best-effort */ });
    // PRD §4.5.1: sync on startup when configured.
    if (config.sync.autoSync && config.sync.webdav) {
      get().syncNow();
    }
  },

  async refresh() {
    const v = get().vault;
    if (!v) return;
    const entries = await v.listEntries({ limit: 500 });
    set({ entries });
    // Every refresh follows a create/edit/complete/delete/sync, so reconciling
    // here keeps reminders derived from one source of truth (the `due` fields).
    void reconcile(entries);
  },

  scheduleAutoSync() {
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    const cfg = get().config;
    if (!cfg.sync.autoSync || !cfg.sync.webdav) return;
    autoSyncTimer = setTimeout(() => get().syncNow(), 30_000);
  },

  async create(content, status = 'todo') {
    const v = get().vault;
    if (!v || !content.trim()) return;
    const { status: s, content: c } = parseCommand(content, status);
    try {
      await v.createEntry({ content: c, status: s });
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

  async saveConfig(cfg) {
    const v = get().vault;
    if (!v) return;
    await v.saveConfig(cfg);
    set({ config: cfg });
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

  async syncNow() {
    const v = get().vault;
    const cfg = get().config;
    if (!v || !cfg.sync.webdav) {
      set({ banner: '尚未配置 WebDAV，前往「设置 → 同步配置」' });
      return;
    }
    set({ syncStatus: 'syncing' });
    try {
      const password = await loadSecret(cfg.sync.webdav.passwordRef);
      const remote = new WebDAVClient({
        url: cfg.sync.webdav.url,
        username: cfg.sync.webdav.username,
        password,
      });
      const summary = await sync({ local: (v as any).fs, remote });
      v.invalidateAll();
      set({ lastSync: summary, banner: summary.conflicts.length ? `${summary.conflicts.length} 个文件存在冲突` : null });
    } catch (e) {
      set({ banner: '同步失败：' + (e as Error).message });
    } finally {
      set({ syncStatus: 'idle' });
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
    set({ banner: remaining.length ? `${remaining.length} 个文件存在冲突` : null });
  },

  search(query) {
    return searchEntries(get().entries, query);
  },
}));

async function resolveVaultRoot(): Promise<string> {
  // Stored in localStorage to persist across runs. Configurable in About page.
  // Ignore non-absolute saved values: a relative path can't satisfy the fs
  // capability scope ($HOME/**), so writes would be silently rejected.
  const saved = localStorage.getItem('gtd:vaultRoot');
  if (saved && isAbsolutePath(saved)) return saved;
  // Default: <homeDir>/GTD-Vault, resolved via Tauri's path API.
  const { homeDir, join } = await import('@tauri-apps/api/path');
  const def = await join(await homeDir(), 'GTD-Vault');
  localStorage.setItem('gtd:vaultRoot', def);
  return def;
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
}

// Secret storage shim. Real impl should use Stronghold or platform keychain.
export async function saveSecret(ref: string, value: string): Promise<void> {
  localStorage.setItem('gtd:secret:' + ref, value);
}
export async function loadSecret(ref: string): Promise<string> {
  return localStorage.getItem('gtd:secret:' + ref) ?? '';
}
