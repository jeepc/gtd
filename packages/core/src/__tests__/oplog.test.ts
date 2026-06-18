import { describe, it, expect } from 'vitest';
import { MemoryFileSystem } from '../fs.js';
import {
  createOp, serializeOp, parseOpLine, opLogPath, appendOp, readOpsFile, readAllOps,
  sortedUniqueById,
} from '../oplog.js';
import type { Op } from '../types.js';

describe('oplog', () => {
  it('round-trips an op through serialize/parse', () => {
    const op = createOp({
      id: '0001', at: '2026-05-18T08:00:00Z', kind: 'entry.create',
      payload: { id: 'E1', content: 'a' }, deviceId: 'd',
    });
    const parsed = parseOpLine(serializeOp(op));
    expect(parsed).toEqual(op);
  });

  it('derives the op-log path from the op time', () => {
    expect(opLogPath('2026-05-18T20:00:00Z')).toBe('ops/2026/05/2026-05-18.jsonl');
  });

  it('skips a corrupt jsonl line and records the error (§10.3)', async () => {
    const fs = new MemoryFileSystem();
    const good = serializeOp(createOp({
      id: '0001', at: '2026-05-18T08:00:00Z', kind: 'entry.delete', payload: { id: 'E1' }, deviceId: 'd',
    }));
    await fs.writeText('ops/2026/05/2026-05-18.jsonl', `${good}\n{ this is not json\n`);
    const { ops, errors } = await readOpsFile(fs, 'ops/2026/05/2026-05-18.jsonl');
    expect(ops).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBe(2);
  });

  it('appendOp accumulates valid jsonl lines', async () => {
    const fs = new MemoryFileSystem();
    for (let i = 1; i <= 3; i++) {
      await appendOp(fs, createOp({
        id: `000${i}`, at: '2026-05-18T08:00:00Z', kind: 'entry.delete',
        payload: { id: `E${i}` }, deviceId: 'd',
      }));
    }
    const { ops, errors } = await readAllOps(fs);
    expect(errors).toHaveLength(0);
    expect(ops).toHaveLength(3);
  });

  it('sortedUniqueById orders by id and dedupes', () => {
    const mk = (id: string): Op => createOp({ id, at: '2026-05-18T08:00:00Z', kind: 'entry.delete', payload: {}, deviceId: 'd' });
    const out = sortedUniqueById([mk('0003'), mk('0001'), mk('0001'), mk('0002')]);
    expect(out.map(o => o.id)).toEqual(['0001', '0002', '0003']);
  });
});
