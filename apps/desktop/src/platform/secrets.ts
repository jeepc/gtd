/**
 * Secret storage for the desktop. Values are stored in the OS keychain
 * (Keychain on macOS, Credential Manager on Windows, libsecret on Linux)
 * via Rust-side `secret_*` Tauri commands using the `keyring` crate
 * (PRD §5.4, §8.2). The dev fallback uses localStorage so the UI can be
 * exercised in a browser.
 *
 * Refs look like `keychain://loop/webdav` — we just split on the last `/` and
 * pass `(service, key)` to the Rust side. Setting an empty value or `null`
 * deletes the entry.
 */

const isTauri = !!(window as any).__TAURI_INTERNALS__;

const KEYCHAIN_SCHEME = 'keychain://';

function parseRef(ref: string): { service: string; key: string } {
  const stripped = ref.startsWith(KEYCHAIN_SCHEME) ? ref.slice(KEYCHAIN_SCHEME.length) : ref;
  const slash = stripped.lastIndexOf('/');
  if (slash <= 0) return { service: 'loop', key: stripped };
  return { service: stripped.slice(0, slash), key: stripped.slice(slash + 1) };
}

export async function saveSecret(ref: string, value: string): Promise<void> {
  if (!ref) return;
  if (!isTauri) {
    localStorage.setItem('loop:secret:' + ref, value);
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const { service, key } = parseRef(ref);
  await invoke('secret_save', { service, key, value });
}

export async function loadSecret(ref: string): Promise<string> {
  if (!ref) return '';
  if (!isTauri) return localStorage.getItem('loop:secret:' + ref) ?? '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const { service, key } = parseRef(ref);
    const value = await invoke<string | null>('secret_load', { service, key });
    return value ?? '';
  } catch {
    return '';
  }
}

export async function deleteSecret(ref: string): Promise<void> {
  if (!ref) return;
  if (!isTauri) {
    localStorage.removeItem('loop:secret:' + ref);
    return;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const { service, key } = parseRef(ref);
    await invoke('secret_delete', { service, key });
  } catch { /* best-effort */ }
}

/** Build a stable ref for a named secret slot. */
export function refFor(name: 'webdav' | 'ai-key'): string {
  return `${KEYCHAIN_SCHEME}loop/${name}`;
}
