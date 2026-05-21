import type { Entry } from './types.js';

/**
 * Reminder scheduling, derived purely from the synced `due` metadata field.
 *
 * Design (PRD §1.5.1): the reminder *intent* (`due`) lives in the Markdown and
 * is the only synced fact. The OS notification *handle* is device-local and
 * never written to the vault — each device independently derives its schedule
 * from `due` + `status`. State is reconstructed, not stored, so completing /
 * deleting / rescheduling all fall out of a single recompute, with no scattered
 * imperative cancels.
 */

export interface ScheduledReminder {
  /** Entry ULID — the stable, globally-unique key used to schedule/cancel. */
  entryId: string;
  /** Absolute firing instant, ISO 8601. */
  fireAt: string;
  /** Notification title (the entry content). */
  title: string;
}

/**
 * Platform-injected notification backend (mirrors the `FileSystem` pattern).
 * `schedule` MUST be idempotent per `entryId`: scheduling an already-known id
 * replaces it (so a changed `fireAt` reschedules cleanly).
 */
export interface Notifier {
  schedule(reminder: ScheduledReminder): Promise<void>;
  cancel(entryId: string): Promise<void>;
  /** Entry ids this device currently has scheduled. */
  listScheduled(): Promise<string[]>;
}

export interface ReminderOptions {
  /** Hour-of-day for date-only `due` (no time component). Default 9 (09:00 local). */
  morningHour?: number;
  /** Cap on simultaneously scheduled reminders (e.g. iOS 64-pending limit). */
  maxScheduled?: number;
}

export interface ReminderPlan {
  /** Reminders that should be scheduled, soonest first, capped to `maxScheduled`. */
  toSchedule: ScheduledReminder[];
  /** Entry ids that should currently be scheduled (== toSchedule ids). */
  activeIds: Set<string>;
}

/** Human-friendly description of a `due` value for UI badges (zh-CN). */
export interface DueDescription {
  label: string;
  overdue: boolean;
}

/**
 * Format a `due` value into a short badge label + overdue flag. Date-only dues
 * show just the day ("今天"/"明天"/"昨天"/"M/D"); timed dues append "HH:mm".
 * A timed due is overdue once its instant passes; a date-only due is overdue
 * only after that whole day. Returns null for an unparseable value.
 */
export function describeDue(due: string, now: Date = new Date()): DueDescription | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(due);
  const d = dateOnly ? new Date(`${due}T00:00:00`) : new Date(due);
  if (Number.isNaN(d.getTime())) return null;

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);

  let day: string;
  if (dayDiff === 0) day = '今天';
  else if (dayDiff === 1) day = '明天';
  else if (dayDiff === -1) day = '昨天';
  else day = `${d.getMonth() + 1}/${d.getDate()}`;

  const time = dateOnly
    ? ''
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const overdue = dateOnly ? dayDiff < 0 : d.getTime() < now.getTime();
  return { label: time ? `${day} ${time}` : day, overdue };
}

/** Resolve a `due` value to an absolute firing instant, or null if unparseable. */
function resolveFireAt(due: string, morningHour: number): Date | null {
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    // Date-only → default morning reminder, local time.
    const hh = String(morningHour).padStart(2, '0');
    d = new Date(`${due}T${hh}:00:00`);
  } else {
    // Datetime (with or without TZ) → as written.
    d = new Date(due);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Pure: given the current entries and `now`, compute which reminders should be
 * scheduled. Selects open todos with a future `due`. Past-due reminders are
 * skipped (no retroactive firing in v1). Date-only dues resolve to the morning
 * hour. Result is sorted soonest-first and capped to `maxScheduled`.
 */
export function computeReminderPlan(
  entries: Entry[],
  now: Date,
  opts: ReminderOptions = {},
): ReminderPlan {
  const morningHour = opts.morningHour ?? 9;
  const max = opts.maxScheduled ?? Infinity;

  const candidates: ScheduledReminder[] = [];
  for (const e of entries) {
    if (e.status !== 'todo') continue;
    if (e.metadata.deleted) continue;
    const due = e.metadata.due;
    if (typeof due !== 'string' || !due) continue;
    const fireAt = resolveFireAt(due, morningHour);
    if (!fireAt || fireAt.getTime() <= now.getTime()) continue;
    candidates.push({ entryId: e.id, fireAt: fireAt.toISOString(), title: e.content });
  }

  candidates.sort((a, b) => a.fireAt.localeCompare(b.fireAt));
  const toSchedule = candidates.slice(0, max);
  return { toSchedule, activeIds: new Set(toSchedule.map(r => r.entryId)) };
}

/**
 * Reconcile the device's scheduled notifications with the desired plan: cancel
 * anything no longer wanted, (re)schedule everything that is. Call after load,
 * any local mutation, and after sync (remote edits may have changed `due`).
 */
export async function reconcileReminders(
  entries: Entry[],
  notifier: Notifier,
  now: Date = new Date(),
  opts: ReminderOptions = {},
): Promise<void> {
  const { toSchedule, activeIds } = computeReminderPlan(entries, now, opts);
  const scheduled = await notifier.listScheduled();
  for (const id of scheduled) {
    if (!activeIds.has(id)) await notifier.cancel(id);
  }
  for (const reminder of toSchedule) {
    await notifier.schedule(reminder);
  }
}

/** No-op backend for tests, web preview, and platforms without notifications. */
export class NoopNotifier implements Notifier {
  async schedule(): Promise<void> {}
  async cancel(): Promise<void> {}
  async listScheduled(): Promise<string[]> {
    return [];
  }
}

// setTimeout's delay is a signed 32-bit int (~24.8 days); clamp and re-arm.
const MAX_TIMEOUT = 2_000_000_000;

/**
 * In-process timer backend: fires `fire(reminder)` at `fireAt` while the
 * runtime is alive. Used on desktop (→ native notification) and as the
 * HarmonyOS fallback. Non-durable by design — it does NOT survive app quit
 * (PRD ADR-011 desktop "while-running" scope). State is purely in-memory and
 * rebuilt by `reconcileReminders`, so it stays consistent across restarts.
 */
export class TimerNotifier implements Notifier {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private fire: (reminder: ScheduledReminder) => void) {}

  async schedule(reminder: ScheduledReminder): Promise<void> {
    this.clear(reminder.entryId);
    const delay = new Date(reminder.fireAt).getTime() - Date.now();
    if (delay <= 0) return; // past; plan already excludes these — defensive.
    const wait = Math.min(delay, MAX_TIMEOUT);
    const handle = setTimeout(() => {
      this.timers.delete(reminder.entryId);
      if (wait >= delay) this.fire(reminder);
      else void this.schedule(reminder); // far future: re-arm
    }, wait);
    this.timers.set(reminder.entryId, handle);
  }

  async cancel(entryId: string): Promise<void> {
    this.clear(entryId);
  }

  async listScheduled(): Promise<string[]> {
    return [...this.timers.keys()];
  }

  private clear(entryId: string): void {
    const handle = this.timers.get(entryId);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(entryId);
    }
  }
}
