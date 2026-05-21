import { describe, it, expect } from 'vitest';
import { mergeDayFiles } from '../sync.js';
import type { DayFile, Entry } from '../types.js';

function ent(id: string, content: string, updated: string, extra?: Partial<Entry>): Entry {
  return {
    id, content, status: 'todo', tags: [], date: '2026-05-18',
    metadata: { updated, ...(extra?.metadata ?? {}) },
    ...extra,
  };
}

function day(entries: Entry[]): DayFile {
  return { date: '2026-05-18', version: 1, updatedAt: '2026-05-18T00:00:00Z', entries };
}

describe('mergeDayFiles (§6.4.3)', () => {
  it('only local: keep local', () => {
    const r = mergeDayFiles(
      day([ent('a', 'A', '2026-05-18T10:00:00Z')]),
      day([]),
    );
    expect(r.file.entries.map(e => e.id)).toEqual(['a']);
    expect(r.conflicts).toEqual([]);
  });

  it('only remote: keep remote', () => {
    const r = mergeDayFiles(
      day([]),
      day([ent('b', 'B', '2026-05-18T10:00:00Z')]),
    );
    expect(r.file.entries.map(e => e.id)).toEqual(['b']);
  });

  it('identical: keep either', () => {
    const r = mergeDayFiles(
      day([ent('a', 'A', '2026-05-18T10:00:00Z')]),
      day([ent('a', 'A', '2026-05-18T10:00:00Z')]),
    );
    expect(r.file.entries).toHaveLength(1);
    expect(r.conflicts).toEqual([]);
  });

  it('different updated: keep newer', () => {
    const r = mergeDayFiles(
      day([ent('a', 'A1', '2026-05-18T10:00:00Z')]),
      day([ent('a', 'A2', '2026-05-18T11:00:00Z')]),
    );
    expect(r.file.entries[0]!.content).toBe('A2');
    expect(r.conflicts).toEqual([]);
  });

  it('same updated, different content: keep local, flag conflict, archive remote', () => {
    const r = mergeDayFiles(
      day([ent('a', 'A1', '2026-05-18T10:00:00Z')]),
      day([ent('a', 'A2', '2026-05-18T10:00:00Z')]),
    );
    expect(r.file.entries[0]!.content).toBe('A1');
    expect(r.file.entries[0]!.metadata._conflict).toBe(true);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]!.content).toBe('A2');
  });

  it('tombstone newer wins via updated', () => {
    const r = mergeDayFiles(
      day([ent('a', 'A', '2026-05-18T10:00:00Z')]),
      day([ent('a', 'A', '2026-05-18T11:00:00Z', { metadata: { updated: '2026-05-18T11:00:00Z', deleted: '2026-05-18T11:00:00Z' } })]),
    );
    expect(r.file.entries[0]!.metadata.deleted).toBeTruthy();
  });

  it('union and ordering: local order preserved, remote-only appended', () => {
    const r = mergeDayFiles(
      day([ent('a', 'A', '2026-05-18T10:00:00Z'), ent('b', 'B', '2026-05-18T10:00:00Z')]),
      day([ent('b', 'B', '2026-05-18T10:00:00Z'), ent('c', 'C', '2026-05-18T10:00:00Z')]),
    );
    expect(r.file.entries.map(e => e.id)).toEqual(['a', 'b', 'c']);
  });
});
