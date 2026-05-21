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

  constructor(private cfg: WebDAVConfig, private fetchFn: typeof fetch = fetch) {
    this.base = cfg.url.endsWith('/') ? cfg.url : cfg.url + '/';
    this.auth = 'Basic ' + b64(`${cfg.username}:${cfg.password}`);
  }

  private url(path: string): string {
    const p = path.replace(/^\.\//, '').replace(/^\/+/, '');
    return this.base + encodeURI(p);
  }

  async testConnection(): Promise<boolean> {
    const res = await this.fetchFn(this.base, {
      method: 'PROPFIND',
      headers: { authorization: this.auth, depth: '0' },
    });
    return res.ok || res.status === 207;
  }

  async list(): Promise<RemoteFile[]> {
    const res = await this.fetchFn(this.base, {
      method: 'PROPFIND',
      headers: { authorization: this.auth, depth: 'infinity', 'content-type': 'application/xml' },
      body: PROPFIND_BODY,
    });
    if (!res.ok && res.status !== 207) throw new Error(`PROPFIND ${res.status}`);
    const xml = await res.text();
    return parsePropfind(xml, this.base);
  }

  async get(path: string): Promise<string> {
    const res = await this.fetchFn(this.url(path), { headers: { authorization: this.auth } });
    if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
    return res.text();
  }

  async put(path: string, contents: string): Promise<void> {
    // Try to create parent dirs first (best-effort; ignore errors).
    const parts = path.split('/');
    parts.pop();
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      try {
        await this.fetchFn(this.url(acc + '/'), {
          method: 'MKCOL',
          headers: { authorization: this.auth },
        });
      } catch { /* ignore */ }
    }
    const res = await this.fetchFn(this.url(path), {
      method: 'PUT',
      headers: { authorization: this.auth, 'content-type': 'text/markdown; charset=utf-8' },
      body: contents,
    });
    if (!res.ok && res.status !== 201 && res.status !== 204) {
      throw new Error(`PUT ${path} ${res.status}`);
    }
  }

  async delete(path: string): Promise<void> {
    const res = await this.fetchFn(this.url(path), {
      method: 'DELETE',
      headers: { authorization: this.auth },
    });
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      throw new Error(`DELETE ${path} ${res.status}`);
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

function parsePropfind(xml: string, base: string): RemoteFile[] {
  const out: RemoteFile[] = [];
  const responses = xml.match(/<[a-zA-Z]*:?response[^>]*>[\s\S]*?<\/[a-zA-Z]*:?response>/g) || [];
  for (const r of responses) {
    if (/<[a-zA-Z]*:?collection\s*\/>/.test(r)) continue; // skip directories
    const href = (r.match(/<[a-zA-Z]*:?href[^>]*>([^<]+)<\/[a-zA-Z]*:?href>/) || [])[1];
    if (!href) continue;
    const lastMod = (r.match(/<[a-zA-Z]*:?getlastmodified[^>]*>([^<]+)<\//) || [])[1] || null;
    const sizeStr = (r.match(/<[a-zA-Z]*:?getcontentlength[^>]*>(\d+)<\//) || [])[1];
    const etag = (r.match(/<[a-zA-Z]*:?getetag[^>]*>([^<]+)<\//) || [])[1] || null;
    let path = decodeURIComponent(href);
    const basePath = new URL(base).pathname;
    if (path.startsWith(basePath)) path = path.slice(basePath.length);
    path = path.replace(/^\/+/, '');
    if (!path || path.endsWith('/')) continue;
    out.push({ path, lastModified: lastMod, size: Number(sizeStr || '0'), etag });
  }
  return out;
}

function b64(s: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)));
  // Node fallback
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return Buffer.from(s, 'utf-8').toString('base64');
}
