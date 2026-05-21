import { describe, it, expect } from 'vitest';
import { MemoryFileSystem } from '../fs.js';
import { Vault, pathForDate } from '../vault.js';

describe('Vault', () => {
  it('createEntry writes a day file at YYYY/MM/YYYY-MM-DD.md', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const e = await v.createEntry({ content: '买牛奶 #生活', date: '2026-05-18' });
    expect(e.status).toBe('todo');
    expect(await fs.exists('2026/05/2026-05-18.md')).toBe(true);
    expect(pathForDate('2026-05-18')).toBe('2026/05/2026-05-18.md');
  });

  it('listEntries returns newest first across dates', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    await v.createEntry({ content: 'a', date: '2026-05-17' });
    await v.createEntry({ content: 'b', date: '2026-05-18' });
    const list = await v.listEntries();
    expect(list[0]!.content).toBe('b');
    expect(list[1]!.content).toBe('a');
  });

  it('completeEntry flips status to done and records timestamp', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const e = await v.createEntry({ content: 'task', date: '2026-05-18' });
    const done = await v.completeEntry(e.id);
    expect(done?.status).toBe('done');
    expect(done?.metadata.done).toBeTruthy();
  });

  it('deleteEntry tombstones; gcTombstones removes after 30 days', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const e = await v.createEntry({ content: 'task', date: '2026-05-18' });
    await v.deleteEntry(e.id);
    // Not visible in listEntries (excludes deleted)
    expect(await v.listEntries()).toHaveLength(0);
    // Still on disk
    expect((await v.readDay('2026-05-18')).entries[0]!.metadata.deleted).toBeTruthy();

    // Pretend 31 days have passed
    const future = Date.now() + 31 * 24 * 60 * 60 * 1000;
    const removed = await v.gcTombstones(future);
    expect(removed).toBe(1);
    expect((await v.readDay('2026-05-18')).entries).toHaveLength(0);
  });

  it('resolveConflict (local) clears flag', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const e = await v.createEntry({ content: 'task', date: '2026-05-18' });
    // Simulate sync flagging the entry
    const day = await v.readDay('2026-05-18');
    day.entries[0]!.metadata._conflict = true;
    await v.writeDay(day);
    expect(await v.listConflicts()).toHaveLength(1);
    await v.resolveConflict(e.id, 'local');
    expect(await v.listConflicts()).toHaveLength(0);
  });

  it('resolveConflict (remote) replaces content', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const e = await v.createEntry({ content: 'local version', date: '2026-05-18' });
    const remote = { ...e, content: 'remote version', tags: [] };
    const day = await v.readDay('2026-05-18');
    day.entries[0]!.metadata._conflict = true;
    await v.writeDay(day);
    await v.resolveConflict(e.id, 'remote', remote);
    const updated = await v.getEntry(e.id);
    expect(updated?.content).toBe('remote version');
  });

  it('caches day reads; invalidate forces re-read', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    await v.createEntry({ content: 'a', date: '2026-05-18' });
    let reads = 0;
    const orig = fs.readText.bind(fs);
    fs.readText = async (p: string) => { reads++; return orig(p); };
    await v.readDay('2026-05-18');
    await v.readDay('2026-05-18');
    expect(reads).toBe(0); // both served from cache after createEntry primed it
    v.invalidate('2026-05-18');
    await v.readDay('2026-05-18');
    expect(reads).toBe(1);
  });

  it('listEntries respects since', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    await v.createEntry({ content: 'old', date: '2026-04-30' });
    await v.createEntry({ content: 'new', date: '2026-05-18' });
    const recent = await v.listEntries({ since: '2026-05-01' });
    expect(recent.map(e => e.content)).toEqual(['new']);
  });

  it('createEntry parses inline #key:value fields into metadata', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const e = await v.createEntry({ content: '买牛奶 #生活 #due:0525 #!!', date: '2026-05-18' });
    expect(e.tags).toEqual(['生活']);
    expect(e.content).toBe('买牛奶 #生活');
    expect(typeof e.metadata.due).toBe('string');
    expect(e.metadata.priority).toBe(2);
  });

  it('setProperty sets, then deletes with null, bumping updated', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const e = await v.createEntry({ content: 'task', date: '2026-05-18' });
    const before = e.metadata.updated;
    const set = await v.setProperty(e.id, 'due', '2026-05-25');
    expect(set?.metadata.due).toBe('2026-05-25');
    // `updated` is re-stamped to now on every write (>= the create time).
    expect(set!.metadata.updated >= before).toBe(true);
    const cleared = await v.setProperty(e.id, 'due', null);
    expect(cleared?.metadata.due).toBeUndefined();
  });

  it('setProperty rejects invalid keys and managed base fields', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const e = await v.createEntry({ content: 'task', date: '2026-05-18' });
    await expect(v.setProperty(e.id, 'a-b', 'x')).rejects.toThrow();
    await expect(v.setProperty(e.id, 'done', 'x')).rejects.toThrow();
  });

  it('config round trip', async () => {
    const fs = new MemoryFileSystem();
    const v = new Vault(fs);
    const cfg = await v.loadConfig();
    cfg.ui.theme = 'dark';
    await v.saveConfig(cfg);
    expect((await v.loadConfig()).ui.theme).toBe('dark');
  });
});
