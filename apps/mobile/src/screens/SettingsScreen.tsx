import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, baseStyles, useScreenBottomInset } from '../theme';

export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const bottomInset = useScreenBottomInset();
  const items: [string, string][] = [
    ['SyncSettings', '同步配置'],
    ['Appearance', '外观'],
    ['About', '关于'],
  ];
  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={bottomInset}>
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
