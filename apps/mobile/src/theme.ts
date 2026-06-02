import { StyleSheet, useColorScheme } from 'react-native';
import { useVaultStore } from './state/vaultStore';

export interface Theme {
  name: 'light' | 'dark';
  bg: string; fg: string; muted: string; border: string; accent: string;
  tagBg: string; tagFg: string;
  /** #tag pill colors — kept in sync with desktop --tag-bg/--tag-fg. */
  tagPillBg: string; tagPillFg: string;
}

const light: Theme = {
  name: 'light',
  bg: '#ffffff', fg: '#1a1a1a', muted: '#6b7280', border: '#e5e7eb',
  accent: '#2563eb', tagBg: '#eef2ff', tagFg: '#4338ca',
  tagPillBg: '#fff1ec', tagPillFg: '#b3401d',
};
const dark: Theme = {
  name: 'dark',
  bg: '#0b0b0c', fg: '#e5e7eb', muted: '#9ca3af', border: '#27272a',
  accent: '#60a5fa', tagBg: '#1e293b', tagFg: '#93c5fd',
  tagPillBg: '#2a1812', tagPillFg: '#ff8a6a',
};

export function useTheme(): Theme {
  const system = useColorScheme();
  // Theme preference lives in the (synced) vault config; 'auto' follows the OS.
  const pref = useVaultStore(s => s.vaultConfig.ui.theme);
  const mode = pref === 'auto' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return mode === 'dark' ? dark : light;
}

export const baseStyles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  label: { width: 100 },
  button: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  title: { fontSize: 20, fontWeight: '600' },
  meta: { fontSize: 12 },
});
