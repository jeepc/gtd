// WebDAV requests must run outside the WebView so they bypass CORS — most
// WebDAV servers don't return CORS headers (especially for PROPFIND), so the
// browser's built-in fetch rejects them with "Failed to fetch". Inside Tauri we
// route through @tauri-apps/plugin-http (Rust-side, no CORS); in a plain browser
// (e.g. `vite dev` without the shell) we fall back to the global fetch.

const isTauri = !!(window as any).__TAURI_INTERNALS__;

/**
 * A `fetch`-compatible function for talking to WebDAV servers. Pass this as the
 * `fetchFn` argument to `WebDAVClient`.
 */
export const webdavFetch: typeof fetch = isTauri
  ? ((input: any, init?: any) =>
      import('@tauri-apps/plugin-http').then(({ fetch }) => fetch(input, init))) as typeof fetch
  : globalThis.fetch.bind(globalThis);
