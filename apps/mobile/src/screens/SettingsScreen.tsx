import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, baseStyles } from '../theme';

export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const items: [string, string][] = [
    ['SyncSettings', '同步配置'],
    ['AISettings', 'AI 配置'],
    ['PromptTemplates', 'Prompt 模板'],
    ['About', '关于'],
  ];
  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      {items.map(([route, label]) => (
        <TouchableOpacity
          key={route}
          onPress={() => nav.navigate(route)}
          style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.border }}
        >
          <Text style={{ color: theme.fg, fontSize: 16 }}>{label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
