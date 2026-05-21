import { describe, it, expect } from 'vitest';
import { parseEntryLine, parseDayFile } from '../parser.js';

const D = '2026-05-18';
const T = '2026-05-18T00:00:00Z';

describe('parseEntryLine (§10.3 minimal cases)', () => {
  it('todo with tag and id', () => {
    const e = parseEntryLine(
      '- [ ] 买牛奶 #生活 ^01HXYZABCD1234567890ABCDEF',
      D, T,
    )!;
    expect(e.status).toBe('todo');
    expect(e.content).toBe('买牛奶 #生活');
    expect(e.tags).toEqual(['生活']);
    expect(e.id).toBe('01HXYZABCD1234567890ABCDEF');
  });

  it('done with metadata', () => {
    const e = parseEntryLine(
      '- [x] 跑步 ^01HXYZABCD1234567890ABCDEF <!-- {"done":"2026-05-18T08:30:00Z","updated":"2026-05-18T08:30:00Z"} -->',
      D, T,
    )!;
    expect(e.status).toBe('done');
    expect(e.metadata.done).toBe('2026-05-18T08:30:00Z');
  });

  it('log entry', () => {
    const e = parseEntryLine(
      '- 看书 #读书 ^01HXYZABCD1234567890ABCDEF',
      D, T,
    )!;
    expect(e.status).toBe('log');
    expect(e.tags).toEqual(['读书']);
  });

  it('multiple tags', () => {
    const e = parseEntryLine(
      '- [ ] task #a #b #c ^01HXYZABCD1234567890ABCDEF',
      D, T,
    )!;
    expect(e.tags).toEqual(['a', 'b', 'c']);
  });

  it('rejects pure-digit tags without leading space (#1 priority)', () => {
    const e = parseEntryLine(
      '- [ ] #1 priority #work ^01HXYZABCD1234567890ABCDEF',
      D, T,
    )!;
    expect(e.tags).toEqual(['work']);
    expect(e.content).toContain('#1 priority');
  });

  it('broken metadata JSON is tolerated; content preserved', () => {
    const e = parseEntryLine(
      '- [ ] 内容 ^01HXYZABCD1234567890ABCDEF <!-- 损坏的 json -->',
      D, T,
    )!;
    expect(e.content).toBe('内容');
    expect(e.metadata.updated).toBeTruthy();
  });

  it('backfills missing ID', () => {
    const e = parseEntryLine('- [ ] no id task', D, T)!;
    expect(e.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(e.content).toBe('no id task');
  });

  it('returns null for blank line', () => {
    expect(parseEntryLine('', D, T)).toBeNull();
    expect(parseEntryLine('   ', D, T)).toBeNull();
  });
});

describe('parseDayFile', () => {
  it('reads frontmatter + entries', () => {
    const text = `---
date: 2026-05-18
version: 1
updatedAt: 2026-05-18T23:45:12Z
---

- [ ] 准备评审 #工作 ^01HXYZABCD1234567890ABCDE1
- [x] 跑步 #健康 ^01HXYZABCD1234567890ABCDE3 <!-- {"done":"2026-05-18T08:30:00Z","updated":"2026-05-18T08:30:00Z"} -->
`;
    const f = parseDayFile(text);
    expect(f.date).toBe('2026-05-18');
    expect(f.version).toBe(1);
    expect(f.entries).toHaveLength(2);
    expect(f.entries[0]!.status).toBe('todo');
    expect(f.entries[1]!.status).toBe('done');
  });

  it('falls back to filename date when frontmatter missing', () => {
    const text = `- [ ] 没头 frontmatter ^01HXYZABCD1234567890ABCDE1\n`;
    const f = parseDayFile(text, '2026/05/2026-05-18.md');
    expect(f.date).toBe('2026-05-18');
    expect(f.entries).toHaveLength(1);
  });
});
