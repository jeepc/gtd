// Crockford Base32 alphabet (excludes I, L, O, U)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ALPHABET.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function getRandomValues(buf: Uint8Array): Uint8Array {
  const g: any = globalThis as any;
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(buf);
    return buf;
  }
  // Node fallback
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

function encodeTime(now: number, len: number): string {
  let mod: number;
  let str = '';
  for (let i = len - 1; i >= 0; i--) {
    mod = now % ENCODING_LEN;
    str = ALPHABET[mod] + str;
    now = (now - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len);
  getRandomValues(bytes);
  let str = '';
  for (let i = 0; i < len; i++) {
    str += ALPHABET[bytes[i]! % ENCODING_LEN];
  }
  return str;
}

export function ulid(seedTime?: number): string {
  const time = seedTime ?? Date.now();
  return encodeTime(time, TIME_LEN) + encodeRandom(RANDOM_LEN);
}

export function isUlid(s: string): boolean {
  return ULID_REGEX.test(s);
}

export function ulidTimestamp(id: string): number | null {
  if (!isUlid(id)) return null;
  let t = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    const idx = ALPHABET.indexOf(id[i]!);
    if (idx < 0) return null;
    t = t * ENCODING_LEN + idx;
  }
  return t;
}
