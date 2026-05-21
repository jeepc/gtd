import { describe, it, expect } from 'vitest';
import { ulid, isUlid, ulidTimestamp } from '../ulid.js';

describe('ulid', () => {
  it('produces 26-char Crockford Base32 string', () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
  });

  it('encodes timestamp recoverably', () => {
    const t = 1716_000_000_000; // 2024-05-18 ish
    const id = ulid(t);
    expect(ulidTimestamp(id)).toBe(t);
  });

  it('is monotonic-ish across calls', () => {
    const a = ulid(1716_000_000_000);
    const b = ulid(1716_000_000_001);
    expect(a < b).toBe(true);
  });

  it('rejects invalid strings', () => {
    expect(isUlid('not a ulid')).toBe(false);
    expect(isUlid('01HXYZABCD1234567890ABCDEI')).toBe(false); // contains 'I'
  });
});
