import { describe, it, expect } from 'vitest';
import { extractTags } from '../tags.js';

describe('extractTags', () => {
  it('finds simple tags', () => {
    expect(extractTags('hello #work #life')).toEqual(['work', 'life']);
  });

  it('rejects #1 (digits-only)', () => {
    expect(extractTags('#1 priority #work')).toEqual(['work']);
  });

  it('rejects tag without leading space', () => {
    expect(extractTags('no#work')).toEqual([]);
  });

  it('dedupes', () => {
    expect(extractTags('#a #a #b')).toEqual(['a', 'b']);
  });

  it('handles CJK', () => {
    expect(extractTags('做了 #工作 和 #健康')).toEqual(['工作', '健康']);
  });
});
