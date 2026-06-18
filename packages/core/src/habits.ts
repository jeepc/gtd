import type { Entry, Habit, HabitProgress, HabitSchedule } from './types.js';

/**
 * Habit progress (PRD §2.3). Habits carry no foreign key on entries; an entry
 * counts toward a habit when it satisfies the habit's `schedule.match` rule
 * (MVP: a single tag). Progress is computed dynamically at query time, so editing
 * a habit's schedule re-counts immediately with no stored aggregate to migrate.
 */

/** Does this entry count toward the habit? MVP rule: entry carries the tag. */
export function matchesHabit(entry: Entry, habit: Habit): boolean {
  const tag = habit.schedule.match?.tag;
  if (!tag) return false;
  return entry.tags.includes(tag);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - offset);
  return x;
}

/** Inclusive YYYY-MM-DD bounds of the period (local) containing `ref`. */
export function periodRange(
  period: HabitSchedule['period'],
  ref: Date,
): { start: string; end: string } {
  if (period === 'day') {
    const s = ymd(ref);
    return { start: s, end: s };
  }
  if (period === 'week') {
    const start = startOfWeek(ref);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: ymd(start), end: ymd(end) };
  }
  // month
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start: ymd(start), end: ymd(end) };
}

/** Shift `ref` back by `n` whole periods (used for the heatmap history). */
function shiftPeriods(period: HabitSchedule['period'], ref: Date, n: number): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (period === 'day') d.setDate(d.getDate() - n);
  else if (period === 'week') d.setDate(d.getDate() - n * 7);
  else d.setMonth(d.getMonth() - n);
  return d;
}

/** Progress for the period containing `now`. */
export function computeProgress(habit: Habit, entries: Entry[], now: Date = new Date()): HabitProgress {
  const { start, end } = periodRange(habit.schedule.period, now);
  let count = 0;
  for (const e of entries) {
    if (matchesHabit(e, habit) && e.date >= start && e.date <= end) count++;
  }
  return {
    habitId: habit.id,
    period: habit.schedule.period,
    rangeStart: start,
    rangeEnd: end,
    count,
    target_min: habit.schedule.target_min,
    target_max: habit.schedule.target_max,
  };
}

export interface HeatmapCell {
  rangeStart: string;
  rangeEnd: string;
  count: number;
}

/** Per-period counts for the last `periods` periods (newest last). Default 12. */
export function heatmap(
  habit: Habit,
  entries: Entry[],
  now: Date = new Date(),
  periods = 12,
): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (let i = periods - 1; i >= 0; i--) {
    const ref = shiftPeriods(habit.schedule.period, now, i);
    const { start, end } = periodRange(habit.schedule.period, ref);
    let count = 0;
    for (const e of entries) {
      if (matchesHabit(e, habit) && e.date >= start && e.date <= end) count++;
    }
    cells.push({ rangeStart: start, rangeEnd: end, count });
  }
  return cells;
}
