import { View, Text, ScrollView } from 'react-native';
import RNFS from 'react-native-fs';
import { useTheme, baseStyles } from '../theme';

export default function AboutScreen() {
  const theme = useTheme();
  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <Text style={{ color: theme.fg, fontSize: 16, marginVertical: 8 }}>版本：0.1.0</Text>
      <Text style={{ color: theme.muted }}>数据目录：{RNFS.DocumentDirectoryPath}/vault</Text>
      <Text style={{ color: theme.muted, marginTop: 16 }}>所有数据为本地 Markdown 文件，可用 Obsidian / Logseq 打开。</Text>
    </ScrollView>
  );
}
