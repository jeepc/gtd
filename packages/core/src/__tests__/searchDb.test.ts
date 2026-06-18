import { describe, it, expect, beforeEach } from 'vitest';
import { createTestStorage } from './testStorage.js';
import { MemoryFileSystem } from '../fs.js';
import { LoopDB } from '../db.js';
import { searchDb } from '../search.js';
import type { Storage } from '../storage.js';

describe('searchDb (cross-entity SQL search §4.4)', () => {
  let db: LoopDB;
  let storage: Storage;
  let slug: string;

  beforeEach(async () => {
    storage = createTestStorage();
    db = new LoopDB(storage, new MemoryFileSystem(), 'dev');
    await db.init();
    const p = await db.createProject({ name: 'AI 视频带货', body: '研究工作流', tags: ['工作'] });
    slug = p.slug;
    await db.createEntry({ content: '调研头部账号 #AI', status: 'log', project_id: p.id });
    await db.createEntry({ content: '买菜 #生活', status: 'todo' });
    await db.createEntry({ content: '持续写作', status: 'ongoing' });
    await db.createHabit({
      name: '游泳',
      schedule: { period: 'week', target_min: 3, target_max: 4, match: { tag: '游泳' } },
    });
  });

  it('type:entry returns only entries', async () => {
    const r = await searchDb(storage, 'type:entry');
    expect(r.length).toBe(3);
    expect(r.every(x => x.type === 'entry')).toBe(true);
  });

  it('type:project matches project name/body text', async () => {
    const r = await searchDb(storage, 'type:project 视频');
    expect(r).toHaveLength(1);
    expect(r[0]!.type).toBe('project');
  });

  it('type:habit returns habits', async () => {
    const r = await searchDb(storage, 'type:habit');
    expect(r).toHaveLength(1);
    expect(r[0]!.type).toBe('habit');
  });

  it('#tag filters across entries and projects', async () => {
    const r = await searchDb(storage, '#AI');
    expect(r).toHaveLength(1);
    expect(r[0]!.type).toBe('entry');
  });

  it('status:ongoing selects the ongoing entry', async () => {
    const r = await searchDb(storage, 'status:ongoing');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'entry' });
  });

  it('project:slug returns entries linked to that project', async () => {
    const r = await searchDb(storage, `project:${slug}`);
    expect(r).toHaveLength(1);
    expect(r[0]!.type).toBe('entry');
  });
});
