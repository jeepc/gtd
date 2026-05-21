import * as Keychain from 'react-native-keychain';

export async function saveSecret(ref: string, value: string): Promise<void> {
  await Keychain.setGenericPassword(ref, value, { service: ref });
}
export async function loadSecret(ref: string): Promise<string> {
  const r = await Keychain.getGenericPassword({ service: ref });
  return r ? r.password : '';
}
