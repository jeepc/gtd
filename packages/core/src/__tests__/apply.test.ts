import { describe, it, expect, beforeEach } from 'vitest';
import { createTestStorage } from './testStorage.js';
import { createSchema } from '../schema.js';
import { applyOp } from '../apply.js';
import { createOp } from '../oplog.js';
import { getEntry } from '../repo/entries.js';
import { getProject } from '../repo/projects.js';
import type { Storage } from '../storage.js';
import type { Op, OpKind } from '../types.js';

/** Build an op with an explicit, sortable id + time. */
function op(id: string, at: string, kind: OpKind, payload: Record<string, unknown>): Op {
  return createOp({ id, at, kind, payload, deviceId: 'test-device' });
}

async function tagsOf(storage: Storage, entryId: string): Promise<string[]> {
  const rows = await storage.query<{ tag: string }>(
    `SELECT tag FROM entry_tags WHERE entry_id = ? ORDER BY tag`,
    [entryId],
  );
  return rows.map(r => r.tag);
}

describe('apply engine (§6.3.3 / §10.3)', () => {
  let storage: Storage;
  beforeEach(async () => {
    storage = createTestStorage();
    await createSchema(storage);
  });

  it('single entry.create inserts a row and its tags', async () => {
    await applyOp({ storage }, op('0001', '2026-05-18T08:00:00Z', 'entry.create', {
      id: 'E1', content: '跑步 5km #健康', status: 'log', date: '2026-05-18',
      tags: ['健康'], metadata: {},
    }));
    const e = await getEntry(storage, 'E1');
    expect(e).not.toBeNull();
    expect(e!.status).toBe('log');
    expect(e!.content).toBe('跑步 5km #健康');
    expect(await tagsOf(storage, 'E1')).toEqual(['健康']);
  });

  it('entry.update updates fields and sets updated_at to op.at', async () => {
    await applyOp({ storage }, op('0001', '2026-05-18T08:00:00Z', 'entry.create', {
      id: 'E1', content: 'old', status: 'todo', date: '2026-05-18', tags: [], metadata: {},
    }));
    await applyOp({ storage }, op('0002', '2026-05-18T09:00:00Z', 'entry.update', {
      id: 'E1', fields: { content: 'new #x', tags: ['x'] },
    }));
    const e = await getEntry(storage, 'E1');
    expect(e!.content).toBe('new #x');
    expect(e!.metadata.updated).toBe('2026-05-18T09:00:00Z');
    expect(await tagsOf(storage, 'E1')).toEqual(['x']);
  });

  it('entry.update after entry.delete is skipped without error', async () => {
    await applyOp({ storage }, op('0001', '2026-05-18T08:00:00Z', 'entry.create', {
      id: 'E1', content: 'a', status: 'todo', date: '2026-05-18', tags: [], metadata: {},
    }));
    await applyOp({ storage }, op('0002', '2026-05-18T09:00:00Z', 'entry.delete', { id: 'E1' }));
    await applyOp({ storage }, op('0003', '2026-05-18T10:00:00Z', 'entry.update', {
      id: 'E1', fields: { content: 'late' },
    }));
    expect(await getEntry(storage, 'E1')).toBeNull();
  });

  it('applying the same op twice is deduped', async () => {
    const create = op('0001', '2026-05-18T08:00:00Z', 'entry.create', {
      id: 'E1', content: 'a', status: 'todo', date: '2026-05-18', tags: [], metadata: {},
    });
    expect(await applyOp({ storage }, create)).toBe(true);
    expect(await applyOp({ storage }, create)).toBe(false);
    const rows = await storage.query<{ n: number }>(`SELECT COUNT(*) AS n FROM entries`);
    expect(rows[0]!.n).toBe(1);
    const applied = await storage.query<{ n: number }>(`SELECT COUNT(*) AS n FROM applied_ops`);
    expect(applied[0]!.n).toBe(1);
  });

  it('entry.create with an unknown field folds it into metadata', async () => {
    await applyOp({ storage }, op('0001', '2026-05-18T08:00:00Z', 'entry.create', {
      id: 'E1', content: 'a', status: 'todo', date: '2026-05-18', tags: [],
      metadata: { due: '2026-05-20' }, foo: 'bar',
    }));
    const e = await getEntry(storage, 'E1');
    expect(e!.metadata.due).toBe('2026-05-20');
    expect(e!.metadata.foo).toBe('bar');
  });

  it('a stale entry.update (older at) is dropped by LWW', async () => {
    await applyOp({ storage }, op('0001', '2026-05-18T10:00:00Z', 'entry.create', {
      id: 'E1', content: 'current', status: 'todo', date: '2026-05-18', tags: [], metadata: {},
    }));
    // op id is later but its at predates the row's updated_at → must not apply.
    await applyOp({ storage }, op('0009', '2026-05-18T08:00:00Z', 'entry.update', {
      id: 'E1', fields: { content: 'stale' },
    }));
    expect((await getEntry(storage, 'E1'))!.content).toBe('current');
  });

  it('project.delete removes the project and nulls dependent entries (FK)', async () => {
    await applyOp({ storage }, op('0001', '2026-05-18T08:00:00Z', 'project.create', {
      id: 'P1', name: 'Proj', slug: 'proj', body: '', tags: [], metadata: {},
    }));
    await applyOp({ storage }, op('0002', '2026-05-18T08:01:00Z', 'entry.create', {
      id: 'E1', content: 'a', status: 'log', date: '2026-05-18', project_id: 'P1',
      tags: [], metadata: {},
    }));
    await applyOp({ storage }, op('0003', '2026-05-18T09:00:00Z', 'project.delete', { id: 'P1' }));
    expect(await getProject(storage, 'P1')).toBeNull();
    expect((await getEntry(storage, 'E1'))!.project_id).toBeNull();
  });
});
