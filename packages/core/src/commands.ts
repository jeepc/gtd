import type { EntryStatus } from './types.js';

export interface SlashCommand {
  /** Including the leading slash, e.g. "/done". */
  cmd: string;
  /** Status applied to the entry when this command is used. */
  status: EntryStatus;
  /** Human description shown in the autocomplete menu. */
  desc: string;
}

/**
 * Slash commands available in the quick-capture input on every platform.
 * The order here is the order shown in the autocomplete menu.
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/todo', status: 'todo', desc: '待办事项（可勾选完成）' },
  { cmd: '/log', status: 'log', desc: '记录日志（不可勾选）' },
  { cmd: '/done', status: 'done', desc: '直接标记为已完成' },
  { cmd: '/ongoing', status: 'ongoing', desc: '持续进行中（不打勾）' },
];

/**
 * Parse a leading slash-command prefix from raw quick-capture input.
 * Returns the resolved status and the content with the prefix (and the single
 * separating space) stripped. Unrecognized input falls back to `fallback`.
 */
export function parseCommand(
  content: string,
  fallback: EntryStatus = 'todo',
): { status: EntryStatus; content: string } {
  for (const c of SLASH_COMMANDS) {
    const prefix = c.cmd + ' ';
    if (content.startsWith(prefix)) {
      return { status: c.status, content: content.slice(prefix.length) };
    }
  }
  return { status: fallback, content };
}

/**
 * Autocomplete support. While the input is still just the command token — a
 * leading "/" followed by word chars and no space yet — return the commands
 * whose name matches what's been typed. Returns null when the menu should be
 * hidden (no leading slash, or a space has "locked in" the command).
 */
export function matchSlashCommands(value: string): SlashCommand[] | null {
  const m = /^\/(\w*)$/.exec(value);
  if (!m) return null;
  const filter = (m[1] ?? '').toLowerCase();
  return SLASH_COMMANDS.filter(c => c.cmd.slice(1).startsWith(filter));
}
