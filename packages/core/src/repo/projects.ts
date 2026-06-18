import type { Storage, SqlParam } from '../storage.js';
import type { Project, ScalarValue } from '../types.js';

const SEP = String.fromCharCode(31);

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  body: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  metadata: string;
  tag_list: string | null;
}

const SELECT = `SELECT p.id, p.name, p.slug, p.status, p.body,
    p.created_at, p.updated_at, p.archived_at, p.metadata,
    (SELECT group_concat(tag, char(31)) FROM project_tags WHERE project_id = p.id) AS tag_list
  FROM projects p`;

export function mapRowToProject(r: ProjectRow): Project {
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
    status: r.status as Project['status'],
    body: r.body,
    tags: r.tag_list ? r.tag_list.split(SEP) : [],
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived_at: r.archived_at,
    metadata,
  };
}

export async function getProject(storage: Storage, id: string): Promise<Project | null> {
  const rows = await storage.query<ProjectRow>(`${SELECT} WHERE p.id = ?`, [id]);
  return rows.length ? mapRowToProject(rows[0]!) : null;
}

export async function getProjectBySlug(storage: Storage, slug: string): Promise<Project | null> {
  const rows = await storage.query<ProjectRow>(`${SELECT} WHERE p.slug = ?`, [slug]);
  return rows.length ? mapRowToProject(rows[0]!) : null;
}

export async function listProjects(
  storage: Storage,
  opts: { status?: Project['status'] } = {},
): Promise<Project[]> {
  const params: SqlParam[] = [];
  let whereSql = '';
  if (opts.status) { whereSql = ' WHERE p.status = ?'; params.push(opts.status); }
  const rows = await storage.query<ProjectRow>(
    `${SELECT}${whereSql} ORDER BY p.updated_at DESC`,
    params,
  );
  return rows.map(mapRowToProject);
}
