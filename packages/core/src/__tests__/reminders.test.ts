import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import {
  computeReminderPlan,
  reconcileReminders,
  describeDue,
  TimerNotifier,
  type Notifier,
  type ScheduledReminder,
} from '../reminders.js';
import type { Entry, EntryMetadata } from '../types.js';

function todo(id: string, due?: string, meta: Partial<EntryMetadata> = {}): Entry {
  return {
    id, content: id, status: 'todo', tags: [], date: '2026-05-18',
    metadata: { updated: 'U', ...(due ? { due } : {}), ...meta },
  };
}

class FakeNotifier implements Notifier {
  scheduled = new Map<string, ScheduledReminder>();
  cancels: string[] = [];
  async schedule(r: ScheduledReminder): Promise<void> { this.scheduled.set(r.entryId, r); }
  async cancel(id: string): Promise<void> { this.scheduled.delete(id); this.cancels.push(id); }
  async listScheduled(): Promise<string[]> { return [...this.scheduled.keys()]; }
}

const NOW = new Date('2026-05-20T00:00:00Z');

describe('computeReminderPlan', () => {
  it('selects only open, non-deleted, future-due todos', () => {
    const entries = [
      todo('future', '2026-05-25'),
      todo('nodue'),
      todo('past', '2026-05-01'),
      { ...todo('done', '2026-05-25'), status: 'done' as const },
      todo('deleted', '2026-05-25', { deleted: '2026-05-19T00:00:00Z' }),
    ];
    const { activeIds } = computeReminderPlan(entries, NOW);
    expect([...activeIds]).toEqual(['future']);
  });

  it('date-only due resolves to the morning hour (default 9, configurable)', () => {
    const { toSchedule } = computeReminderPlan([todo('a', '2026-05-25')], NOW);
    expect(new Date(toSchedule[0]!.fireAt).getHours()).toBe(9);
    const custom = computeReminderPlan([todo('a', '2026-05-25')], NOW, { morningHour: 8 });
    expect(new Date(custom.toSchedule[0]!.fireAt).getHours()).toBe(8);
  });

  it('sorts soonest-first and caps to maxScheduled', () => {
    const entries = [todo('c', '2026-05-28'), todo('a', '2026-05-22'), todo('b', '2026-05-25')];
    const { toSchedule } = computeReminderPlan(entries, NOW, { maxScheduled: 2 });
    expect(toSchedule.map(r => r.entryId)).toEqual(['a', 'b']);
  });
});

describe('reconcileReminders', () => {
  it('schedules future todos', async () => {
    const n = new FakeNotifier();
    await reconcileReminders([todo('a', '2026-05-25')], n, NOW);
    expect([...n.scheduled.keys()]).toEqual(['a']);
  });

  it('cancels when an entry is completed or deleted', async () => {
    const n = new FakeNotifier();
    await reconcileReminders([todo('a', '2026-05-25')], n, NOW);
    await reconcileReminders([{ ...todo('a', '2026-05-25'), status: 'done' }], n, NOW);
    expect([...n.scheduled.keys()]).toEqual([]);
    expect(n.cancels).toContain('a');
  });

  it('reschedules when due changes', async () => {
    const n = new FakeNotifier();
    await reconcileReminders([todo('a', '2026-05-25')], n, NOW);
    const before = n.scheduled.get('a')!.fireAt;
    await reconcileReminders([todo('a', '2026-05-26')], n, NOW);
    expect(n.scheduled.get('a')!.fireAt).not.toBe(before);
  });

  it('cancels when due is removed', async () => {
    const n = new FakeNotifier();
    await reconcileReminders([todo('a', '2026-05-25')], n, NOW);
    await reconcileReminders([todo('a')], n, NOW);
    expect([...n.scheduled.keys()]).toEqual([]);
  });

  it('is idempotent: re-running with no change cancels nothing', async () => {
    const n = new FakeNotifier();
    await reconcileReminders([todo('a', '2026-05-25')], n, NOW);
    await reconcileReminders([todo('a', '2026-05-25')], n, NOW);
    expect(n.cancels).toEqual([]);
  });
});

describe('describeDue', () => {
  const now = new Date(2026, 4, 20, 12, 0, 0); // local May 20, noon

  it('labels relative days for date-only dues', () => {
    expect(describeDue('2026-05-20', now)).toEqual({ label: '今天', overdue: false });
    expect(describeDue('2026-05-21', now)).toEqual({ label: '明天', overdue: false });
    expect(describeDue('2026-05-19', now)).toEqual({ label: '昨天', overdue: true });
    expect(describeDue('2026-05-25', now)?.label).toBe('5/25');
  });

  it('appends time and marks overdue for past timed dues', () => {
    expect(describeDue('2026-05-20T08:00', now)).toEqual({ label: '今天 08:00', overdue: true });
    expect(describeDue('2026-05-20T15:30', now)).toEqual({ label: '今天 15:30', overdue: false });
  });

  it('returns null for unparseable values', () => {
    expect(describeDue('not-a-date', now)).toBeNull();
  });
});

describe('TimerNotifier', () => {
  it('fires at fireAt, tracks/clears scheduled ids, cancels', async () => {
    vi.useFakeTimers();
    try {
      const fired: string[] = [];
      const n = new TimerNotifier(r => fired.push(r.entryId));
      const fireAt = new Date(Date.now() + 1000).toISOString();
      await n.schedule({ entryId: 'a', fireAt, title: 'a' });
      await n.schedule({ entryId: 'b', fireAt, title: 'b' });
      expect((await n.listScheduled()).sort()).toEqual(['a', 'b']);
      await n.cancel('b');
      expect(await n.listScheduled()).toEqual(['a']);
      vi.advanceTimersByTime(1001);
      expect(fired).toEqual(['a']);
      expect(await n.listScheduled()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
