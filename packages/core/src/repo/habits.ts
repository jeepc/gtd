import type { Storage, SqlParam } from '../storage.js';
import type { Habit, HabitSchedule, ScalarValue } from '../types.js';

interface HabitRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  body: string;
  schedule: string;
  created_at: string;
  updated_at: string;
  metadata: string;
}

const SELECT = `SELECT id, name, slug, status, body, schedule, created_at, updated_at, metadata FROM habits`;

export function mapRowToHabit(r: HabitRow): Habit {
  let schedule: HabitSchedule;
  try {
    schedule = JSON.parse(r.schedule) as HabitSchedule;
  } catch {
    schedule = { period: 'week', target_min: 0, target_max: 0, match: { tag: '' } };
  }
  let metadata: Record<string, ScalarValue> = {};
  try {
    const parsed = JSON.parse(r.metadata);
    if (parsed && typeof parsed === 'object') metadata = parsed;
  } catch {
    /* leave empty */
  }
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status as Habit['status'],
    body: r.body,
    schedule,
    created_at: r.created_at,
    updated_at: r.updated_at,
    metadata,
  };
}

export async function getHabit(storage: Storage, id: string): Promise<Habit | null> {
  const rows = await storage.query<HabitRow>(`${SELECT} WHERE id = ?`, [id]);
  return rows.length ? mapRowToHabit(rows[0]!) : null;
}

export async function getHabitBySlug(storage: Storage, slug: string): Promise<Habit | null> {
  const rows = await storage.query<HabitRow>(`${SELECT} WHERE slug = ?`, [slug]);
  return rows.length ? mapRowToHabit(rows[0]!) : null;
}

export async function listHabits(
  storage: Storage,
  opts: { status?: Habit['status'] } = {},
): Promise<Habit[]> {
  const params: SqlParam[] = [];
  let whereSql = '';
  if (opts.status) { whereSql = ' WHERE status = ?'; params.push(opts.status); }
  const rows = await storage.query<HabitRow>(
    `${SELECT}${whereSql} ORDER BY updated_at DESC`,
    params,
  );
  return rows.map(mapRowToHabit);
}
