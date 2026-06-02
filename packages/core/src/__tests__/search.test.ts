import { describe, it, expect } from 'vitest';
import { parseSearchQuery, searchEntries } from '../search.js';
import type { Entry } from '../types.js';

function e(overrides: Partial<Entry>): Entry {
  return {
    id: '01H',
    content: '',
    status: 'todo',
    tags: [],
    date: '2026-05-18',
    metadata: { updated: '2026-05-18T00:00:00Z' },
    ...overrides,
  };
}

describe('parseSearchQuery', () => {
  it('parses tag, status, date prefix', () => {
    const q = parseSearchQuery('#工作 status:todo date:2026-05');
    expect(q.tags).toEqual(['工作']);
    expect(q.status).toBe('todo');
    expect(q.dateExact).toBe('2026-05');
  });

  it('parses date >=', () => {
    const q = parseSearchQuery('date:>=2026-05-01');
    expect(q.dateGte).toBe('2026-05-01');
  });

  it('rest is text', () => {
    const q = parseSearchQuery('总结 work');
    expect(q.text).toEqual(['总结', 'work']);
  });

  it('parses priority:N and the pN shorthand', () => {
    expect(parseSearchQuery('priority:1').priority).toBe(1);
    expect(parseSearchQuery('p2').priority).toBe(2);
    expect(parseSearchQuery('P3').priority).toBe(3);
    // Out-of-range / unrelated tokens stay as text, not priority.
    expect(parseSearchQuery('p9').priority).toBeUndefined();
    expect(parseSearchQuery('p9').text).toEqual(['p9']);
  });
});

describe('searchEntries', () => {
  const entries: Entry[] = [
    e({ id: '1', content: '准备评审材料', tags: ['工作'], status: 'todo', date: '2026-05-18', metadata: { updated: '2026-05-18T00:00:00Z', priority: 1 } }),
    e({ id: '2', content: '跑步 5km', tags: ['健康'], status: 'done', date: '2026-05-18' }),
    e({ id: '3', content: '看书', tags: ['读书'], status: 'log', date: '2026-04-30' }),
    e({ id: '4', content: '回邮件', tags: ['工作'], status: 'todo', date: '2026-05-18', metadata: { updated: '2026-05-18T00:00:00Z', priority: 2 } }),
  ];

  it('filters by tag', () => {
    expect(searchEntries(entries, '#健康').map(x => x.id)).toEqual(['2']);
  });

  it('filters by priority', () => {
    expect(searchEntries(entries, 'priority:1').map(x => x.id)).toEqual(['1']);
    expect(searchEntries(entries, 'p2').map(x => x.id)).toEqual(['4']);
  });

  it('combines priority with tag as AND', () => {
    expect(searchEntries(entries, '#工作 priority:1').map(x => x.id)).toEqual(['1']);
  });

  it('filters by status', () => {
    expect(searchEntries(entries, 'status:log').map(x => x.id)).toEqual(['3']);
  });

  it('filters by date prefix', () => {
    expect(searchEntries(entries, 'date:2026-04').map(x => x.id)).toEqual(['3']);
  });

  it('combines text + filter as AND', () => {
    expect(searchEntries(entries, '跑步 status:done').map(x => x.id)).toEqual(['2']);
    expect(searchEntries(entries, '跑步 status:todo')).toEqual([]);
  });
});
