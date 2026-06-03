import { useState } from 'react';
import { Text, TouchableOpacity, ScrollView } from 'react-native';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles, useScreenBottomInset } from '../theme';

export default function AboutScreen() {
  const theme = useTheme();
  const bottomInset = useScreenBottomInset();
  const appSettings = useVaultStore(s => s.appSettings);
  const reloadVault = useVaultStore(s => s.reloadVault);
  const [reloadMsg, setReloadMsg] = useState('');

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={bottomInset}>
      <Text style={{ color: theme.fg, fontSize: 16, marginVertical: 8 }}>版本：0.1.0</Text>
      <Text style={{ color: theme.muted }}>数据目录：{appSettings.vaultPath || '(未设置)'}</Text>
      <Text style={{ color: theme.muted, marginTop: 16 }}>所有数据为本地 Markdown 文件，可用 Obsidian / Logseq 打开。</Text>
      <TouchableOpacity
        onPress={async () => { setReloadMsg('重新读取中…'); try { await reloadVault(); setReloadMsg('已读取磁盘上的最新内容'); } catch (e) { setReloadMsg('读取失败：' + (e as Error).message); } }}
        style={[baseStyles.button, { borderColor: theme.border, marginTop: 16 }]}
      >
        <Text style={{ color: theme.fg }}>重新读取数据</Text>
      </TouchableOpacity>
      {!!reloadMsg && <Text style={{ color: theme.muted, marginTop: 8 }}>{reloadMsg}</Text>}
      <Text style={{ color: theme.muted, marginTop: 8, fontSize: 12 }}>
        如果你在 Obsidian、文本编辑器等其他应用里直接改了文件，点这里可以重新读取磁盘上的最新内容。
      </Text>
    </ScrollView>
  );
}
