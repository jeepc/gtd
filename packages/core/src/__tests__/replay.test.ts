import { describe, it, expect } from 'vitest';
import { createTestStorage } from './testStorage.js';
import { MemoryFileSystem } from '../fs.js';
import { rebuild } from '../rebuild.js';
import { LoopDB } from '../db.js';
import type { Storage } from '../storage.js';

// PRD §10.2 reference op sequence (verbatim).
const SAMPLE = [
  '{"id":"01HXYZABCD1234567890ABCDE1","device_id":"laptop-a1","schema_version":1,"at":"2026-05-18T08:30:00Z","kind":"entry.create","payload":{"id":"01HXYZABCD1234567890ENTRY1","content":"跑步 5km","status":"log","date":"2026-05-18","tags":["健康"],"metadata":{}}}',
  '{"id":"01HXYZABCD1234567890ABCDE2","device_id":"laptop-a1","schema_version":1,"at":"2026-05-18T09:00:00Z","kind":"entry.create","payload":{"id":"01HXYZABCD1234567890ENTRY2","content":"准备周三的产品评审材料","status":"todo","date":"2026-05-18","tags":["工作"],"metadata":{"due":"2026-05-20T17:00:00Z"}}}',
  '{"id":"01HXYZABCD1234567890ABCDE3","device_id":"phone-b2","schema_version":1,"at":"2026-05-18T10:15:00Z","kind":"project.create","payload":{"id":"01HXYZABCD1234567890PROJ01","name":"研究 AI 视频带货","slug":"ai-video-commerce","body":"# 目标\\n搞清楚 AI 视频带货的工作流","tags":["工作","AI"]}}',
  '{"id":"01HXYZABCD1234567890ABCDE4","device_id":"phone-b2","schema_version":1,"at":"2026-05-18T10:16:00Z","kind":"entry.create","payload":{"id":"01HXYZABCD1234567890ENTRY3","content":"看了 5 个 AI 视频带货头部账号","status":"log","date":"2026-05-18","project_id":"01HXYZABCD1234567890PROJ01","tags":["AI"]}}',
  '{"id":"01HXYZABCD1234567890ABCDE5","device_id":"phone-b2","schema_version":1,"at":"2026-05-18T11:00:00Z","kind":"habit.create","payload":{"id":"01HXYZABCD1234567890HABIT1","name":"游泳","slug":"swimming","body":"心肺、肩颈、放松","schedule":{"period":"week","target_min":3,"target_max":4,"match":{"tag":"游泳"}}}}',
  '{"id":"01HXYZABCD1234567890ABCDE6","device_id":"laptop-a1","schema_version":1,"at":"2026-05-18T20:00:00Z","kind":"entry.create","payload":{"id":"01HXYZABCD1234567890ENTRY4","content":"游泳 1.2km 蛙泳","status":"log","date":"2026-05-18","tags":["游泳"]}}',
];

async function count(storage: Storage, table: string): Promise<number> {
  const rows = await storage.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0]!.n;
}

describe('op-log replay (§10.2)', () => {
  it('rebuilds the expected state from the sample op sequence', async () => {
    const storage = createTestStorage();
    const fs = new MemoryFileSystem();
    await fs.writeText('ops/2026/05/2026-05-18.jsonl', SAMPLE.join('\n') + '\n');

    const result = await rebuild(storage, fs);
    expect(result.opsApplied).toBe(6);
    expect(result.parseErrors).toHaveLength(0);

    expect(await count(storage, 'entries')).toBe(4);
    expect(await count(storage, 'projects')).toBe(1);
    expect(await count(storage, 'habits')).toBe(1);

    const db = new LoopDB(storage, fs, 'test-device');
    const progress = await db.habitProgress(
      '01HXYZABCD1234567890HABIT1',
      new Date('2026-05-18T12:00:00'),
    );
    expect(progress).not.toBeNull();
    expect(progress!.count).toBe(1);
    expect(progress!.target_min).toBe(3);
    expect(progress!.target_max).toBe(4);
  });

  it('rebuild is deterministic and idempotent', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeText('ops/2026/05/2026-05-18.jsonl', SAMPLE.join('\n') + '\n');

    const a = createTestStorage();
    await rebuild(a, fs);
    const b = createTestStorage();
    await rebuild(b, fs);
    await rebuild(b, fs); // second rebuild over the same storage

    for (const table of ['entries', 'projects', 'habits']) {
      expect(await count(a, table)).toBe(await count(b, table));
    }
  });
});
