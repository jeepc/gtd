import { describe, it, expect } from 'vitest';
import { MemoryFileSystem } from '../fs.js';
import { createTestStorage } from './testStorage.js';
import { createSchema } from '../schema.js';
import { createOp, serializeOp, readAllOps } from '../oplog.js';
import { syncOps, type RemoteStore } from '../syncOps.js';
import type { Op } from '../types.js';

/** In-memory remote backed by a MemoryFileSystem. */
class FakeRemote implements RemoteStore {
  constructor(private fs: MemoryFileSystem) {}
  async list() {
    const files = await this.fs.list('.');
    return Promise.all(
      files.map(async path => ({ path, size: (await this.fs.readText(path)).length, lastModified: null })),
    );
  }
  get(path: string) {
    return this.fs.readText(path);
  }
  async put(path: string, contents: string) {
    await this.fs.writeText(path, contents);
  }
}

const PATH = 'ops/2026/05/2026-05-18.jsonl';

function entryOp(id: string, entryId: string): Op {
  return createOp({
    id, at: '2026-05-18T08:00:00Z', deviceId: 'd', kind: 'entry.create',
    payload: { id: entryId, content: entryId, status: 'log', date: '2026-05-18', tags: [], metadata: {} },
  });
}

describe('syncOps (op-level merge §6.4)', () => {
  it('merges divergent op files via union + sorted-unique-by-id', async () => {
    const local = new MemoryFileSystem();
    const remoteFs = new MemoryFileSystem();
    await local.writeText(PATH, serializeOp(entryOp('0001', 'A')) + '\n');
    await remoteFs.writeText(PATH, serializeOp(entryOp('0002', 'B')) + '\n');

    const storage = createTestStorage();
    await createSchema(storage);

    const summary = await syncOps({ local, remote: new FakeRemote(remoteFs), storage });

    expect(summary.merged).toContain(PATH);
    expect(summary.appliedOps).toBe(2);

    // both ends now hold both ops, in id order
    const localOps = (await readAllOps(local)).ops.map(o => o.id);
    const remoteOps = (await readAllOps(remoteFs)).ops.map(o => o.id);
    expect(localOps).toEqual(['0001', '0002']);
    expect(remoteOps).toEqual(['0001', '0002']);

    const rows = await storage.query<{ n: number }>(`SELECT COUNT(*) AS n FROM entries`);
    expect(rows[0]!.n).toBe(2);
  });

  it('pushes local-only and pulls remote-only files', async () => {
    const local = new MemoryFileSystem();
    const remoteFs = new MemoryFileSystem();
    await local.writeText('ops/2026/05/2026-05-18.jsonl', serializeOp(entryOp('0001', 'A')) + '\n');
    await remoteFs.writeText('ops/2026/05/2026-05-19.jsonl', serializeOp(entryOp('0003', 'C')) + '\n');

    const storage = createTestStorage();
    await createSchema(storage);
    const summary = await syncOps({ local, remote: new FakeRemote(remoteFs), storage });

    expect(summary.pushed).toContain('ops/2026/05/2026-05-18.jsonl');
    expect(summary.pulled).toContain('ops/2026/05/2026-05-19.jsonl');
    // pulled op applied; pushed op was already local (not re-applied here)
    expect(summary.appliedOps).toBe(1);
    // remote received the pushed file
    expect(await remoteFs.exists('ops/2026/05/2026-05-18.jsonl')).toBe(true);
  });

  it('ignores out-of-scope files (data.db)', async () => {
    const local = new MemoryFileSystem();
    const remoteFs = new MemoryFileSystem();
    await local.writeText('data.db', 'binary');
    const summary = await syncOps({ local, remote: new FakeRemote(remoteFs) });
    expect(summary.pushed).not.toContain('data.db');
    expect(await remoteFs.exists('data.db')).toBe(false);
  });
});
