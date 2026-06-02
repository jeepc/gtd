/**
 * Minimal WebDAV client (RFC 4918) sufficient for sync:
 *   PROPFIND (depth: infinity) — list
 *   GET                        — read
 *   PUT                        — write
 *   DELETE                     — delete
 *   MKCOL                      — create directories (best effort)
 *
 * No external deps; works in browser/Tauri/Node 18+.
 */

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

export interface RemoteFile {
  path: string;       // path relative to dav root, e.g. "2026/05/2026-05-18.md"
  lastModified: string | null;
  size: number;
  etag: string | null;
}

export class WebDAVClient {
  private base: string;
  private auth: string;

  private fetchFn: typeof fetch;

  constructor(private cfg: WebDAVConfig, fetchFn?: typeof fetch) {
    // Bind to the global object: a native `fetch` invoked as `this.fetchFn(...)`
    // would otherwise have `this` set to the WebDAVClient instance, which the
    // browser rejects with "Illegal invocation".
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    this.base = cfg.url.endsWith('/') ? cfg.url : cfg.url + '/';
    this.auth = 'Basic ' + b64(`${cfg.username}:${cfg.password}`);
  }

  private url(path: string): string {
    const p = path.replace(/^\.\//, '').replace(/^\/+/, '');
    return this.base + encodeURI(p);
  }

  async testConnection(): Promise<boolean> {
    const probe = () =>
      this.fetchFn(this.base, {
        method: 'PROPFIND',
        headers: { authorization: this.auth, depth: '0' },
      });
    const res = await probe();
    if (res.ok || res.status === 207) return true;
    // 404 (not found) / 409 (missing intermediate parent) means the server is
    // reachable and the credentials were accepted — the request got past auth —
    // but the configured collection doesn't exist yet. This is the normal state
    // for a fresh 坚果云/Nutstore subfolder you haven't created in their UI.
    // Create the collection chain so the very first sync can write into it, then
    // re-probe. Anything else (401/403 auth failure, 5xx, network) is a real
    // failure and falls through to false.
    if (res.status === 404 || res.status === 409) {
      await this.ensureBaseCollection();
      const retry = await probe();
      return retry.ok || retry.status === 207;
    }
    return false;
  }

  /**
   * List every file under the dav root. We recurse with `Depth: 1` rather than
   * a single `Depth: infinity` PROPFIND because many servers (Nextcloud,
   * Nutstore/坚果云, …) silently cap infinity to the top level or reject it
   * outright. With infinity, nested day files (`YYYY/MM/…md`) never appear in
   * the listing, so sync treats every local day file as remote-absent and
   * pushes it wholesale — clobbering the other device's edits instead of
   * merging them.
   */
  async list(): Promise<RemoteFile[]> {
    const files: RemoteFile[] = [];
    await this.listInto('', files, new Set());
    return files;
  }

  private async listInto(rel: string, files: RemoteFile[], seenDirs: Set<string>): Promise<void> {
    const target = rel ? this.url(rel.endsWith('/') ? rel : rel + '/') : this.base;
    const res = await this.fetchFn(target, {
      method: 'PROPFIND',
      headers: { authorization: this.auth, depth: '1', 'content-type': 'application/xml' },
      body: PROPFIND_BODY,
    });
    // 404 (not found) or 409 (a missing intermediate parent — some servers,
    // incl. proxies fronting Nutstore, report this instead of 404) means the
    // collection doesn't exist yet. On the root that's a first-run vault folder
    // the very next push will MKCOL into existence; on a sub-dir it vanished
    // mid-walk. Either way: treat as empty, don't abort the whole sync —
    // otherwise list() throws before put() can create the folder.
    if (res.status === 404 || res.status === 409) return;
    if (!res.ok && res.status !== 207) throw new Error(`PROPFIND ${res.status} ${target}`);
    const members = parsePropfind(await res.text(), this.base);
    for (const m of members) {
      const norm = m.path.replace(/\/+$/, '');
      if (!norm || norm === rel.replace(/\/+$/, '')) continue; // skip the collection itself
      if (m.isDir) {
        // Don't descend into hidden dirs (e.g. `.conflicts/`); sync filters them anyway.
        if (norm.split('/').pop()!.startsWith('.')) continue;
        if (seenDirs.has(norm)) continue;
        seenDirs.add(norm);
        await this.listInto(norm, files, seenDirs);
      } else {
        files.push({ path: m.path, lastModified: m.lastModified, size: m.size, etag: m.etag });
      }
    }
  }

  async get(path: string): Promise<string> {
    const res = await this.fetchFn(this.url(path), { headers: { authorization: this.auth } });
    if (!res.ok) throw new Error(`GET ${res.status} ${this.url(path)}`);
    return res.text();
  }

  async put(path: string, contents: string): Promise<void> {
    let res = await this.rawPut(path, contents);
    // A missing-parent PUT yields 404 (e.g. Nutstore) or 409 (RFC 4918). The
    // base folder itself may not exist yet — root-level files like config.json
    // have no parent segments, so nothing would otherwise MKCOL it. Build the
    // whole collection chain (base + intermediates) and retry once.
    if (res.status === 404 || res.status === 409) {
      await this.ensureParents(path);
      res = await this.rawPut(path, contents);
    }
    if (!res.ok && res.status !== 201 && res.status !== 204) {
      throw new Error(`PUT ${res.status} ${this.url(path)}`);
    }
  }

  private rawPut(path: string, contents: string): Promise<Response> {
    return this.fetchFn(this.url(path), {
      method: 'PUT',
      headers: { authorization: this.auth, 'content-type': 'text/markdown; charset=utf-8' },
      body: contents,
    });
  }

  private async mkcol(u: string): Promise<void> {
    try {
      await this.fetchFn(u, { method: 'MKCOL', headers: { authorization: this.auth } });
    } catch { /* ignore: existing collections return 405/301 */ }
  }

  /**
   * MKCOL every collection segment of the configured base URL. The dav root
   * itself (e.g. `/dav/` on Nutstore) is not creatable and returns 405 — which
   * `mkcol` swallows — but each subfolder below it (`/dav/loop/`) is, so this
   * brings a not-yet-existing base folder into existence.
   */
  private async ensureBaseCollection(): Promise<void> {
    const origin = originOf(this.base);
    const segs = pathnameOf(this.base).split('/').filter(Boolean);
    let acc = '';
    for (const seg of segs) {
      acc += '/' + seg;
      await this.mkcol(origin + acc + '/');
    }
  }

  /** MKCOL the configured base collection and every intermediate dir of `path`. */
  private async ensureParents(path: string): Promise<void> {
    await this.ensureBaseCollection();
    const parts = path.split('/');
    parts.pop();
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      await this.mkcol(this.url(acc + '/'));
    }
  }

  async delete(path: string): Promise<void> {
    const res = await this.fetchFn(this.url(path), {
      method: 'DELETE',
      headers: { authorization: this.auth },
    });
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      throw new Error(`DELETE ${res.status} ${this.url(path)}`);
    }
  }
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getlastmodified/>
    <d:getcontentlength/>
    <d:getetag/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

interface PropMember extends RemoteFile {
  isDir: boolean;
}

function parsePropfind(xml: string, base: string): PropMember[] {
  const out: PropMember[] = [];
  const basePath = decodeURIComponent(pathnameOf(base));
  const responses = xml.match(/<[a-zA-Z]*:?response[^>]*>[\s\S]*?<\/[a-zA-Z]*:?response>/g) || [];
  for (const r of responses) {
    const isDir = /<[a-zA-Z]*:?collection\s*\/>/.test(r);
    const href = (r.match(/<[a-zA-Z]*:?href[^>]*>([^<]+)<\/[a-zA-Z]*:?href>/) || [])[1];
    if (!href) continue;
    const lastMod = (r.match(/<[a-zA-Z]*:?getlastmodified[^>]*>([^<]+)<\//) || [])[1] || null;
    const sizeStr = (r.match(/<[a-zA-Z]*:?getcontentlength[^>]*>(\d+)<\//) || [])[1];
    const etag = (r.match(/<[a-zA-Z]*:?getetag[^>]*>([^<]+)<\//) || [])[1] || null;
    // Reduce the href (which may be a full URL or a root-relative path) to its
    // path portion, then strip the base path so we get a vault-relative key that
    // always matches the local file list.
    let path: string;
    try {
      path = decodeURIComponent(pathnameOf(href));
    } catch {
      path = href;
    }
    if (path.startsWith(basePath)) path = path.slice(basePath.length);
    path = path.replace(/^\/+/, '');
    if (!path) continue; // the collection root itself
    out.push({ path, isDir, lastModified: lastMod, size: Number(sizeStr || '0'), etag });
  }
  return out;
}

// URL helpers implemented with plain string ops rather than the WHATWG `URL`
// constructor. React Native's (Hermes) `URL` is non-compliant — `new URL(u).pathname`
// and relative resolution return wrong values — which made parsePropfind fail to
// strip the base path and produce duplicated URLs like `/dav/loop/dav/loop/2026/`
// on recursive PROPFINDs (404 → nested day files never listed → mobile never pulled).
// String ops behave identically across Chromium, Node, and Hermes.
const ORIGIN_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]+/;

/** scheme://host of an absolute URL, or '' if `u` is already a bare path. */
function originOf(u: string): string {
  const m = u.match(ORIGIN_RE);
  return m ? m[0] : '';
}

/** Path portion of a full or root-relative URL, sans scheme/host/query/hash. */
function pathnameOf(u: string): string {
  const rest = u.replace(ORIGIN_RE, '');
  return rest.replace(/[?#].*$/, '') || '/';
}

function b64(s: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)));
  // Node fallback
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return Buffer.from(s, 'utf-8').toString('base64');
}
