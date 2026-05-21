// Tag rule (§6.2 edge cases):
//   tag must be preceded by whitespace or start-of-string
//   tag body matches [^\s#]+ and must contain at least one non-digit char
//     so that `#1 priority` does NOT count as a tag.
//
// We keep extraction permissive but conservative: digits-only tags are rejected.
const TAG_REGEX = /(?:^|\s)#([^\s#]+)/g;

export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  let m: RegExpExecArray | null;
  TAG_REGEX.lastIndex = 0;
  while ((m = TAG_REGEX.exec(content)) !== null) {
    const tag = m[1]!;
    if (/^\d+$/.test(tag)) continue; // skip pure-digit (e.g. #1)
    tags.add(tag);
  }
  return [...tags];
}

export function hasTag(content: string, tag: string): boolean {
  return extractTags(content).includes(tag);
}
