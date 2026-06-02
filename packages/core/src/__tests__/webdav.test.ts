import { describe, it, expect } from 'vitest';
import { WebDAVClient } from '../webdav.js';

const BASE = 'https://dav.example.com/dav/loop/';

/**
 * A fake WebDAV server that ONLY honours `Depth: 1` (like Nutstore/坚果云 and
 * Nextcloud). A `Depth: infinity` request would return just the top level — the
 * bug that made nested day files invisible to sync.
 */
function fakeServer(opts: { honorInfinity?: boolean } = {}) {
  // dir path (server-absolute, trailing slash) -> child hrefs
  const tree: Record<string, { href: string; dir: boolean }[]> = {
    '/dav/loop/': [
      { href: '/dav/loop/', dir: true },
      { href: '/dav/loop/config.json', dir: false },
      { href: '/dav/loop/2026/', dir: true },
    ],
    '/dav/loop/2026/': [
      { href: '/dav/loop/2026/', dir: true },
      { href: '/dav/loop/2026/06/', dir: true },
    ],
    '/dav/loop/2026/06/': [
      { href: '/dav/loop/2026/06/', dir: true },
      { href: '/dav/loop/2026/06/2026-06-02.md', dir: false },
    ],
  };

  const xmlFor = (members: { href: string; dir: boolean }[]) =>
    `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${members
      .map(
        (m) =>
          `<d:response><d:href>${m.href}</d:href><d:propstat><d:prop>` +
          `<d:getcontentlength>10</d:getcontentlength>` +
          `<d:resourcetype>${m.dir ? '<d:collection/>' : ''}</d:resourcetype>` +
          `</d:prop></d:propstat></d:response>`,
      )
      .join('')}</d:multistatus>`;

  const fetchFn = (async (input: any, init?: any) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const depth = init?.headers?.depth;
    if (init?.method === 'PROPFIND') {
      const here = tree[path];
      if (!here) return new Response('', { status: 404 });
      let members = here;
      if (depth === 'infinity' && opts.honorInfinity) {
        // would return everything; not used by the recursive client
        members = Object.values(tree).flat();
      } else if (depth === 'infinity') {
        members = [here[0]!]; // server caps infinity to the collection itself
      }
      return new Response(xmlFor(members), { status: 207 });
    }
    return new Response('', { status: 405 });
  }) as typeof fetch;

  return fetchFn;
}

describe('WebDAVClient.list (recursive Depth:1)', () => {
  it('finds nested day files even when the server caps Depth:infinity', async () => {
    const client = new WebDAVClient(
      { url: BASE, username: 'u', password: 'p' },
      fakeServer(),
    );
    const files = await client.list();
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(['2026/06/2026-06-02.md', 'config.json']);
  });

  it.each([404, 409])(
    'treats a %i on the root as an empty remote (first-run, folder not yet created)',
    async (status) => {
      const fetchFn = (async () => new Response('', { status })) as typeof fetch;
      const client = new WebDAVClient({ url: BASE, username: 'u', password: 'p' }, fetchFn);
      await expect(client.list()).resolves.toEqual([]);
    },
  );

  it('returns vault-relative paths that match the local file list', async () => {
    const client = new WebDAVClient(
      { url: BASE, username: 'u', password: 'p' },
      fakeServer(),
    );
    const files = await client.list();
    // No host, no leading slash, no dav-root prefix — exactly what fs.list emits.
    for (const f of files) {
      expect(f.path.startsWith('/')).toBe(false);
      expect(f.path).not.toContain('dav/loop');
    }
  });
});

describe('WebDAVClient.list (坚果云-style hrefs, no trailing slash on dirs)', () => {
  // 坚果云 returns directory hrefs WITHOUT a trailing slash and as ROOT-RELATIVE
  // paths (e.g. `/dav/loop/2026`). parsePropfind must strip the base path with
  // plain string ops — relying on RN's broken `URL` produced duplicated recursion
  // URLs like `/dav/loop/dav/loop/2026/` (404 → nested files never listed).
  function jianguoyunServer(requested: string[]) {
    const dir = (href: string) =>
      `<d:response><d:href>${href}</d:href><d:propstat><d:prop>` +
      `<d:resourcetype><d:collection/></d:resourcetype><d:getcontentlength>0</d:getcontentlength>` +
      `</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
    const file = (href: string) =>
      `<d:response><d:href>${href}</d:href><d:propstat><d:prop>` +
      `<d:resourcetype/><d:getcontentlength>42</d:getcontentlength>` +
      `</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
    const bodies: Record<string, string> = {
      '/dav/loop/': dir('/dav/loop/') + dir('/dav/loop/2026'),
      '/dav/loop/2026/': dir('/dav/loop/2026/') + dir('/dav/loop/2026/06'),
      '/dav/loop/2026/06/': dir('/dav/loop/2026/06/') + file('/dav/loop/2026/06/2026-06-02.md'),
    };
    return (async (input: any) => {
      const url = String(input);
      requested.push(url);
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const inner = bodies[path];
      if (!inner) return new Response('', { status: 404 });
      return new Response(
        `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:s="http://ns.jianguoyun.com">${inner}</d:multistatus>`,
        { status: 207 },
      );
    }) as typeof fetch;
  }

  it('builds correct recursion URLs and finds nested day files (no path duplication)', async () => {
    const requested: string[] = [];
    const client = new WebDAVClient(
      { url: 'https://dav.jianguoyun.com/dav/loop/', username: 'u', password: 'p' },
      jianguoyunServer(requested),
    );
    const files = await client.list();
    expect(files.map((f) => f.path)).toEqual(['2026/06/2026-06-02.md']);
    // The regression: every request URL must stay under the single base path.
    for (const u of requested) {
      expect(u).not.toContain('/dav/loop/dav/loop');
    }
    expect(requested).toContain('https://dav.jianguoyun.com/dav/loop/2026/');
  });
});

describe('WebDAVClient.testConnection', () => {
  it('succeeds when the collection already exists (207)', async () => {
    const fetchFn = (async () => new Response('', { status: 207 })) as typeof fetch;
    const client = new WebDAVClient({ url: BASE, username: 'u', password: 'p' }, fetchFn);
    expect(await client.testConnection()).toBe(true);
  });

  it.each([404, 409])(
    'creates a not-yet-existing 坚果云 subfolder and succeeds (initial %i)',
    async (status) => {
      const created = new Set<string>();
      const fetchFn = (async (input: any, init?: any) => {
        const path = new URL(String(input)).pathname;
        if (init?.method === 'MKCOL') {
          created.add(path);
          return new Response('', { status: 201 });
        }
        // PROPFIND: 404/409 until the base subfolder has been MKCOL'd.
        if (created.has('/dav/loop/')) return new Response('', { status: 207 });
        return new Response('', { status });
      }) as typeof fetch;
      const client = new WebDAVClient({ url: BASE, username: 'u', password: 'p' }, fetchFn);
      expect(await client.testConnection()).toBe(true);
      expect(created.has('/dav/loop/')).toBe(true);
    },
  );

  it('fails on real auth errors without creating anything (401)', async () => {
    let mkcols = 0;
    const fetchFn = (async (_input: any, init?: any) => {
      if (init?.method === 'MKCOL') { mkcols++; return new Response('', { status: 201 }); }
      return new Response('', { status: 401 });
    }) as typeof fetch;
    const client = new WebDAVClient({ url: BASE, username: 'u', password: 'p' }, fetchFn);
    expect(await client.testConnection()).toBe(false);
    expect(mkcols).toBe(0);
  });
});
