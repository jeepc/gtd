import { StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/**
 * 沉浸式（edge-to-edge）下页面内容会延伸到底部导航栏/手势条后面。给可滚动页面的
 * contentContainerStyle 加上这个底部 inset，避免最后的按钮/内容被系统条遮住。
 * 列表页（EntryList）自带处理，这里供 baseStyles.screen 的 ScrollView 页面复用。
 */
export function useScreenBottomInset(): { paddingBottom: number } {
  const insets = useSafeAreaInsets();
  return { paddingBottom: insets.bottom + 16 };
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
