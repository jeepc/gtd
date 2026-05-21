import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useVaultStore } from '../state/vaultStore';
import { saveSecret, loadSecret } from '../platform/keychain';
import { WebDAVClient } from '@gtd/core';
import { useTheme, baseStyles } from '../theme';

export default function SyncSettingsScreen() {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const config = useVaultStore(s => s.config);
  const saveConfig = useVaultStore(s => s.saveConfig);
  const syncNow = useVaultStore(s => s.syncNow);

  const dav = config.sync.webdav;
  const [url, setUrl] = useState(dav?.url ?? '');
  const [user, setUser] = useState(dav?.username ?? '');
  const [pass, setPass] = useState('');
  const [autoSync, setAutoSync] = useState(config.sync.autoSync);
  const [test, setTest] = useState('');

  async function save() {
    const ref = 'keychain://todo-app/webdav';
    if (pass) await saveSecret(ref, pass);
    await saveConfig({ ...config, sync: { webdav: { url, username: user, passwordRef: ref }, autoSync } });
    nav.goBack();
  }

  async function testConn() {
    setTest('测试中…');
    try {
      const password = pass || await loadSecret(dav?.passwordRef ?? '');
      const c = new WebDAVClient({ url, username: user, password });
      setTest(await c.testConnection() ? '连接成功' : '连接失败');
    } catch (e) { setTest('失败：' + (e as Error).message); }
  }

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>URL</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={url} onChangeText={setUrl} placeholderTextColor={theme.muted} />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>用户名</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={user} onChangeText={setUser} />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>密码</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={pass} onChangeText={setPass} secureTextEntry placeholder={dav ? '（保留不变）' : ''} placeholderTextColor={theme.muted} />
      </View>
      <View style={baseStyles.row}><Text style={[baseStyles.label, { color: theme.muted }]}>自动同步</Text>
        <Switch value={autoSync} onValueChange={setAutoSync} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
        <TouchableOpacity style={[baseStyles.button, { borderColor: theme.border }]} onPress={testConn}><Text style={{ color: theme.fg }}>测试连接</Text></TouchableOpacity>
        <TouchableOpacity style={[baseStyles.button, { borderColor: theme.border }]} onPress={save}><Text style={{ color: theme.fg }}>保存</Text></TouchableOpacity>
        <TouchableOpacity style={[baseStyles.button, { borderColor: theme.border }]} onPress={syncNow}><Text style={{ color: theme.fg }}>立即同步</Text></TouchableOpacity>
      </View>
      {test && <Text style={{ color: theme.muted }}>{test}</Text>}
    </ScrollView>
  );
}
