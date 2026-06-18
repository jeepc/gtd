import { describe, it, expect, beforeEach } from 'vitest';
import { createTestStorage } from './testStorage.js';
import { MemoryFileSystem } from '../fs.js';
import { LoopDB } from '../db.js';
import { listOpFiles, readAllOps } from '../oplog.js';
import type { Storage } from '../storage.js';

async function freshDb(): Promise<{ db: LoopDB; storage: Storage; fs: MemoryFileSystem }> {
  const storage = createTestStorage();
  const fs = new MemoryFileSystem();
  const db = new LoopDB(storage, fs, 'test-device');
  await db.init();
  return { db, storage, fs };
}

describe('LoopDB', () => {
  let db: LoopDB;
  let storage: Storage;
  let fs: MemoryFileSystem;
  beforeEach(async () => {
    ({ db, storage, fs } = await freshDb());
  });

  it('op-first write: createEntry appends an op AND populates SQLite', async () => {
    const e = await db.createEntry({ content: '买菜 #生活', status: 'todo' });
    expect(e.tags).toEqual(['生活']);
    // op landed on disk
    const files = await listOpFiles(fs);
    expect(files.length).toBe(1);
    const { ops } = await readAllOps(fs);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.kind).toBe('entry.create');
    // and is queryable
    expect((await db.getEntry(e.id))!.content).toBe('买菜 #生活');
  });

  it('supports the ongoing status and pins it first', async () => {
    await db.createEntry({ content: 'a todo', status: 'todo' });
    const ongoing = await db.createEntry({ content: '持续学习', status: 'ongoing' });
    const list = await db.listEntries({ pinOngoing: true });
    expect(list[0]!.id).toBe(ongoing.id);
    expect(list[0]!.status).toBe('ongoing');
  });

  it('completeEntry moves todo → done and stamps done_at', async () => {
    const e = await db.createEntry({ content: 'task', status: 'todo' });
    const done = await db.completeEntry(e.id);
    expect(done!.status).toBe('done');
    expect(typeof done!.metadata.done).toBe('string');
  });

  it('setProperty rejects base keys but stores user fields', async () => {
    const e = await db.createEntry({ content: 'task', status: 'todo' });
    await expect(db.setProperty(e.id, 'updated', 'x')).rejects.toThrow();
    const updated = await db.setProperty(e.id, 'priority', 2);
    expect(updated!.metadata.priority).toBe(2);
  });

  it('upgrade-to-project flow: link an entry to a project', async () => {
    const p = await db.createProject({ name: 'AI 视频带货', body: '# 目标' });
    expect(p.slug).toBeTruthy();
    const e = await db.createEntry({ content: '调研', status: 'log', project_id: p.id });
    expect(e.project_id).toBe(p.id);
    const linked = await db.listEntries({ projectId: p.id });
    expect(linked).toHaveLength(1);
  });

  it('deleting a project unlinks its entries', async () => {
    const p = await db.createProject({ name: 'P' });
    const e = await db.createEntry({ content: 'x', status: 'log', project_id: p.id });
    expect(await db.deleteProject(p.id)).toBe(true);
    expect(await db.getProject(p.id)).toBeNull();
    expect((await db.getEntry(e.id))!.project_id).toBeNull();
  });

  it('habit progress recomputes immediately when target changes (§10.3)', async () => {
    const now = new Date('2026-05-18T12:00:00');
    const h = await db.createHabit({
      name: '游泳',
      schedule: { period: 'week', target_min: 3, target_max: 4, match: { tag: '游泳' } },
    });
    await db.createEntry({ content: '游泳 1km #游泳', status: 'log', date: '2026-05-18' });
    let progress = await db.habitProgress(h.id, now);
    expect(progress!.count).toBe(1);
    expect(progress!.target_max).toBe(4);

    await db.updateHabit(h.id, {
      schedule: { period: 'week', target_min: 3, target_max: 5, match: { tag: '游泳' } },
    });
    progress = await db.habitProgress(h.id, now);
    expect(progress!.count).toBe(1);
    expect(progress!.target_max).toBe(5);
  });

  it('pause/resume a habit via updateHabit status', async () => {
    const h = await db.createHabit({
      name: 'read',
      schedule: { period: 'day', target_min: 1, target_max: 1, match: { tag: 'read' } },
    });
    await db.updateHabit(h.id, { status: 'paused' });
    expect((await db.getHabit(h.id))!.status).toBe('paused');
    await db.updateHabit(h.id, { status: 'active' });
    expect((await db.getHabit(h.id))!.status).toBe('active');
  });

  it('config set/unset persist to config.json via ops', async () => {
    await db.setConfig(['ui', 'ongoing_pinned'], true);
    await db.setConfig(['tagColors', '工作'], '#3b82f6');
    let cfg = await db.getConfig();
    expect((cfg.ui as any).ongoing_pinned).toBe(true);
    expect((cfg.tagColors as any)['工作']).toBe('#3b82f6');

    await db.unsetConfig(['tagColors', '工作']);
    cfg = await db.getConfig();
    expect((cfg.tagColors as any)['工作']).toBeUndefined();
  });

  it('rebuild reproduces identical state from the op log', async () => {
    await db.createEntry({ content: 'one #a', status: 'todo' });
    await db.createEntry({ content: 'two', status: 'log' });
    const p = await db.createProject({ name: 'proj' });
    await db.createEntry({ content: 'three', status: 'log', project_id: p.id });

    const before = await db.listEntries();
    await db.rebuild();
    const after = await db.listEntries();
    expect(after.map(e => e.id).sort()).toEqual(before.map(e => e.id).sort());
    expect(await db.getProject(p.id)).not.toBeNull();
  });
});
