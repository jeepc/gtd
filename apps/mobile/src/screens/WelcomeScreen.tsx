import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import RNFS from 'react-native-fs';
import { useVaultStore, saveSecret, refFor } from '../state/vaultStore';
import { useTheme, baseStyles } from '../theme';

type Mode = 'menu' | 'webdav';

/**
 * Mobile equivalent of the desktop WelcomeScreen (PRD §3.3). Same three
 * options; mobile platforms don't expose a native directory picker, so the
 * vault path is derived from a user-chosen folder name under the app sandbox.
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const initVault = useVaultStore(s => s.initVault);
  const appSettings = useVaultStore(s => s.appSettings);
  const saveAppSettings = useVaultStore(s => s.saveAppSettings);
  const syncNow = useVaultStore(s => s.syncNow);
  const [mode, setMode] = useState<Mode>('menu');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('Loop-Vault');

  async function createNew() {
    setBusy(true);
    try {
      const path = `${RNFS.DocumentDirectoryPath}/${name}`;
      await RNFS.mkdir(path);
      await initVault(path);
    } catch (e) {
      Alert.alert('创建失败', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openExisting() {
    setBusy(true);
    try {
      const path = `${RNFS.DocumentDirectoryPath}/${name}`;
      if (!(await RNFS.exists(path))) {
        Alert.alert('未找到', `${path} 不存在`);
        return;
      }
      await initVault(path);
    } catch (e) {
      Alert.alert('打开失败', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'webdav') {
    return (
      <WebDAVPull
        onBack={() => setMode('menu')}
        onDone={async (folderName, webdav, password) => {
          setBusy(true);
          try {
            const path = `${RNFS.DocumentDirectoryPath}/${folderName}`;
            await RNFS.mkdir(path);
            const passwordRef = refFor('webdav');
            await saveSecret(passwordRef, password);
            await saveAppSettings({
              ...appSettings,
              vaultPath: path,
              sync: {
                ...appSettings.sync,
                webdav: { url: webdav.url, username: webdav.username, passwordRef },
              },
            });
            await initVault(path);
            await syncNow();
          } catch (e) {
            Alert.alert('拉取失败', (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <Text style={[baseStyles.title, { color: theme.fg, marginTop: 32, textAlign: 'center' }]}>Loop</Text>
      <Text style={{ color: theme.muted, textAlign: 'center', marginBottom: 24 }}>
        欢迎使用。先选择数据从哪里来。
      </Text>
      <Text style={{ color: theme.muted, marginBottom: 6 }}>vault 文件夹名</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={[baseStyles.input, { borderColor: theme.border, color: theme.fg, marginBottom: 16 }]}
      />
      <Card title="创建新 vault" desc="在应用沙箱内新建一个空 vault。" disabled={busy} onPress={createNew} theme={theme} />
      <Card title="打开已有 vault" desc="使用相同名称打开已存在的 vault。" disabled={busy} onPress={openExisting} theme={theme} />
      <Card title="从 WebDAV 拉取" desc="另一台设备已经同步到 WebDAV，本机首次安装时把数据拉下来。" disabled={busy} onPress={() => setMode('webdav')} theme={theme} />
    </ScrollView>
  );
}

function Card({ title, desc, onPress, disabled, theme }: { title: string; desc: string; onPress: () => void; disabled: boolean; theme: ReturnType<typeof useTheme> }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: theme.fg, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>{title}</Text>
      <Text style={{ color: theme.muted, fontSize: 12 }}>{desc}</Text>
    </TouchableOpacity>
  );
}

function WebDAVPull({ onBack, onDone }: { onBack: () => void; onDone: (folderName: string, webdav: { url: string; username: string }, password: string) => void }) {
  const theme = useTheme();
  const [url, setUrl] = useState('https://dav.jianguoyun.com/dav/');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('Loop-Vault');
  const ready = url && user && pass && name;
  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: theme.accent, marginTop: 16 }}>← 返回</Text></TouchableOpacity>
      <Text style={[baseStyles.title, { color: theme.fg, marginTop: 8 }]}>从 WebDAV 拉取</Text>
      <Text style={{ color: theme.muted, marginTop: 16 }}>WebDAV URL</Text>
      <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" style={[baseStyles.input, { borderColor: theme.border, color: theme.fg }]} />
      <Text style={{ color: theme.muted, marginTop: 8 }}>用户名</Text>
      <TextInput value={user} onChangeText={setUser} autoCapitalize="none" style={[baseStyles.input, { borderColor: theme.border, color: theme.fg }]} />
      <Text style={{ color: theme.muted, marginTop: 8 }}>密码</Text>
      <TextInput value={pass} onChangeText={setPass} secureTextEntry style={[baseStyles.input, { borderColor: theme.border, color: theme.fg }]} />
      <Text style={{ color: theme.muted, marginTop: 8 }}>本地 vault 文件夹名</Text>
      <TextInput value={name} onChangeText={setName} style={[baseStyles.input, { borderColor: theme.border, color: theme.fg }]} />
      <TouchableOpacity
        disabled={!ready}
        onPress={() => ready && onDone(name, { url, username: user }, pass)}
        style={[baseStyles.button, { borderColor: theme.border, marginTop: 16, opacity: ready ? 1 : 0.5 }]}
      >
        <Text style={{ color: theme.fg }}>开始拉取</Text>
      </TouchableOpacity>
      <Text style={{ color: theme.muted, fontSize: 12, marginTop: 12 }}>密码会保存到系统密钥库，不写入任何配置文件。</Text>
    </ScrollView>
  );
}
