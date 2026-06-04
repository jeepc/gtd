import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { useVaultStore, saveSecret, loadSecret, refFor } from '../state/vaultStore';
import { WebDAVClient } from '@loop/core';
import { useTheme, baseStyles, useScreenBottomInset } from '../theme';

export default function SyncSettingsScreen() {
  const theme = useTheme();
  const bottomInset = useScreenBottomInset();
  const appSettings = useVaultStore(s => s.appSettings);
  const saveAppSettings = useVaultStore(s => s.saveAppSettings);
  const syncNow = useVaultStore(s => s.syncNow);

  const dav = appSettings.sync.webdav;
  const [url, setUrl] = useState(dav?.url ?? '');
  const [user, setUser] = useState(dav?.username ?? '');
  const [pass, setPass] = useState('');
  const [autoSync, setAutoSync] = useState(appSettings.sync.autoSync);
  const [intervalMin, setIntervalMin] = useState(String(appSettings.sync.intervalMinutes));
  const [syncOnFocus, setSyncOnFocus] = useState(appSettings.sync.syncOnFocus);
  const [syncOnBlur, setSyncOnBlur] = useState(appSettings.sync.syncOnBlur);
  const [test, setTest] = useState('');

  // 表单值快照：persist 从 ref 读最新值，避免 onBlur/卸载时的闭包过期问题。
  const formRef = useRef({ url, user, pass, autoSync, intervalMin, syncOnFocus, syncOnBlur });
  formRef.current = { url, user, pass, autoSync, intervalMin, syncOnFocus, syncOnBlur };
  // 有未落盘的文本改动时为 true；切回前台/失焦的 Switch 改动会即时落盘，不计入。
  const dirtyRef = useRef(false);

  // 改动即时自动保存（无保存按钮）：合并最新表单值 + 覆盖值写盘。
  // appSettings 从 store 现取，避免覆盖其它页面（如 vaultPath）的改动。
  async function persist(override: Partial<{ url: string; user: string; pass: string; autoSync: boolean; intervalMin: string; syncOnFocus: boolean; syncOnBlur: boolean }> = {}) {
    dirtyRef.current = false;
    const v = { ...formRef.current, ...override };
    const current = useVaultStore.getState().appSettings;
    const ref = refFor('webdav');
    if (v.pass) await saveSecret(ref, v.pass);
    await saveAppSettings({
      ...current,
      sync: {
        webdav: v.url ? { url: v.url, username: v.user, passwordRef: ref } : null,
        autoSync: v.autoSync,
        intervalMinutes: Math.max(1, Number(v.intervalMin) || 5),
        syncOnFocus: v.syncOnFocus,
        syncOnBlur: v.syncOnBlur,
      },
    });
  }

  // 离开页面（返回键卸载本屏）时，onBlur 可能来不及触发——补一次落盘，避免丢失文本改动。
  useEffect(() => () => { if (dirtyRef.current) void persist(); }, []);

  async function testConn() {
    setTest('测试中…');
    try {
      const password = pass || await loadSecret(dav?.passwordRef ?? refFor('webdav'));
      const c = new WebDAVClient({ url, username: user, password });
      setTest(await c.testConnection() ? '连接成功' : '连接失败');
    } catch (e) { setTest('失败：' + (e as Error).message); }
  }

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={bottomInset}>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>URL</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={url} onChangeText={t => { dirtyRef.current = true; setUrl(t); }} onBlur={() => persist()} autoCapitalize="none" />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>用户名</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={user} onChangeText={t => { dirtyRef.current = true; setUser(t); }} onBlur={() => persist()} autoCapitalize="none" />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>密码</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={pass} onChangeText={t => { dirtyRef.current = true; setPass(t); }} onBlur={() => persist()} secureTextEntry placeholder={dav ? '（保留不变）' : ''} placeholderTextColor={theme.muted} />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>自动同步</Text>
        <Switch value={autoSync} onValueChange={v => { setAutoSync(v); persist({ autoSync: v }); }} />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>周期 (分钟)</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={intervalMin} onChangeText={t => { dirtyRef.current = true; setIntervalMin(t); }} onBlur={() => persist()} keyboardType="number-pad" />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>切回前台时同步</Text>
        <Switch value={syncOnFocus} onValueChange={v => { setSyncOnFocus(v); persist({ syncOnFocus: v }); }} />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>切到后台时同步</Text>
        <Switch value={syncOnBlur} onValueChange={v => { setSyncOnBlur(v); persist({ syncOnBlur: v }); }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
        <TouchableOpacity style={[baseStyles.button, { borderColor: theme.border }]} onPress={testConn}><Text style={{ color: theme.fg }}>测试连接</Text></TouchableOpacity>
        <TouchableOpacity style={[baseStyles.button, { borderColor: theme.border }]} onPress={syncNow}><Text style={{ color: theme.fg }}>立即同步</Text></TouchableOpacity>
      </View>
      {test && <Text style={{ color: theme.muted }}>{test}</Text>}
    </ScrollView>
  );
}
