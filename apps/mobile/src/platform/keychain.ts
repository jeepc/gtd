import * as Keychain from 'react-native-keychain';

/**
 * Mobile secret backend (PRD §5.4, §8.2). react-native-keychain maps to
 * Keychain on iOS, Keystore on Android. Refs (e.g. `keychain://loop/webdav`)
 * are used as the keychain `service` so each ref gets its own slot.
 */

export async function saveSecret(ref: string, value: string): Promise<void> {
  if (!ref) return;
  if (!value) {
    await Keychain.resetGenericPassword({ service: ref });
    return;
  }
  await Keychain.setGenericPassword(ref, value, { service: ref });
}

export async function loadSecret(ref: string): Promise<string> {
  if (!ref) return '';
  const r = await Keychain.getGenericPassword({ service: ref });
  return r ? r.password : '';
}

export async function deleteSecret(ref: string): Promise<void> {
  if (!ref) return;
  await Keychain.resetGenericPassword({ service: ref });
}

const KEYCHAIN_SCHEME = 'keychain://';

/** Build a stable ref for a named secret slot (matches the desktop scheme). */
export function refFor(name: 'webdav' | 'ai-key'): string {
  return `${KEYCHAIN_SCHEME}loop/${name}`;
}
