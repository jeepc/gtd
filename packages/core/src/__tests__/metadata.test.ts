import { describe, it, expect } from 'vitest';
import {
  isSystemKey,
  isValidMetaKey,
  isScalar,
  assertValidProperty,
  orderedMetaEntries,
  stableStringify,
  metadataByteLength,
  userFields,
  aiVisibleMetadata,
  MetadataValidationError,
} from '../metadata.js';
import { serializeEntry, serializeEntryForAI } from '../serializer.js';
import { parseEntryLine } from '../parser.js';
import type { Entry, EntryMetadata } from '../types.js';

const ID = '01HXYZABCD1234567890ABCDEF';

describe('open metadata model (§6.7)', () => {
  it('isSystemKey: `_`-prefixed only', () => {
    expect(isSystemKey('_conflict')).toBe(true);
    expect(isSystemKey('due')).toBe(false);
  });

  it('key validation (§6.7.4)', () => {
    expect(isValidMetaKey('due')).toBe(true);
    expect(isValidMetaKey('_ai_category')).toBe(true);
    expect(isValidMetaKey('1bad')).toBe(false); // must start letter/underscore
    expect(isValidMetaKey('a-b')).toBe(false); // hyphen illegal
    expect(isValidMetaKey('x'.repeat(41))).toBe(false); // >40 chars
  });

  it('scalar check + assertValidProperty', () => {
    expect(isScalar(null)).toBe(true);
    expect(isScalar(2)).toBe(true);
    expect(isScalar({})).toBe(false);
    expect(() => assertValidProperty('due', '2026-05-25')).not.toThrow();
    expect(() => assertValidProperty('due', null)).not.toThrow(); // null = delete sentinel
    expect(() => assertValidProperty('a-b', 'x')).toThrow(MetadataValidationError);
    expect(() => assertValidProperty('ok', {} as never)).toThrow(MetadataValidationError);
  });

  it('orderedMetaEntries: base keys first (fixed), then user/system sorted', () => {
    const meta: EntryMetadata = {
      updated: 'U',
      zeta: 1,
      done: 'D',
      _conflict: true,
      alpha: 2,
    };
    expect(orderedMetaEntries(meta).map(([k]) => k)).toEqual([
      'done', 'updated', '_conflict', 'alpha', 'zeta',
    ]);
  });

  it('stableStringify is order-independent and can drop system keys', () => {
    const a: EntryMetadata = { updated: 'U', due: 'D', _conflict: true };
    const b: EntryMetadata = { _conflict: true, due: 'D', updated: 'U' };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify(a, { dropSystem: true })).not.toContain('_conflict');
    expect(stableStringify(a, { dropSystem: true })).toBe(
      stableStringify({ updated: 'U', due: 'D' }, { dropSystem: true }),
    );
  });

  it('metadataByteLength counts the serialized JSON', () => {
    expect(metadataByteLength({ updated: 'U' })).toBe('{"updated":"U"}'.length);
  });

  it('userFields excludes base + system keys; aiVisibleMetadata strips system', () => {
    const meta: EntryMetadata = { updated: 'U', due: 'D', priority: 2, _conflict: true };
    expect(userFields(meta)).toEqual({ due: 'D', priority: 2 });
    expect(aiVisibleMetadata(meta)).toEqual({ updated: 'U', due: 'D', priority: 2 });
  });

  it('arbitrary + system keys round-trip through serialize/parse', () => {
    const e: Entry = {
      id: ID, content: 'x', status: 'todo', tags: [], date: '2026-05-18',
      metadata: { updated: 'U', due: '2026-05-25', priority: 2, project: 'q3', _conflict: true },
    };
    const reparsed = parseEntryLine(serializeEntry(e), '2026-05-18', 'X')!;
    expect(reparsed.metadata.due).toBe('2026-05-25');
    expect(reparsed.metadata.priority).toBe(2);
    expect(reparsed.metadata.project).toBe('q3');
    expect(reparsed.metadata._conflict).toBe(true);
  });

  it('serializes with byte-identical key order to the Rust MCP server', () => {
    // Mirrors apps/mcp-server vault.rs `serialize_metadata_matches_ts_key_order`.
    const e: Entry = {
      id: ID, content: 'task', status: 'todo', tags: [], date: '2026-05-18',
      metadata: { updated: 'U', deleted: 'D', priority: 2, due: '2026-05-25' },
    };
    expect(serializeEntry(e)).toContain(
      '<!-- {"updated":"U","deleted":"D","due":"2026-05-25","priority":2} -->',
    );
  });

  it('serializeEntryForAI strips `_`-prefixed fields', () => {
    const e: Entry = {
      id: ID, content: 'x', status: 'todo', tags: [], date: '2026-05-18',
      metadata: { updated: 'U', due: '2026-05-25', _ai_category: '工作' },
    };
    const line = serializeEntryForAI(e);
    expect(line).toContain('"due"');
    expect(line).not.toContain('_ai_category');
  });
});
