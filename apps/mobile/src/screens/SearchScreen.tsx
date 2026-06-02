import { useState } from 'react';
import { View, TextInput, Text } from 'react-native';
import EntryList from '../components/EntryList';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles } from '../theme';

export default function SearchScreen() {
  const [q, setQ] = useState('');
  const theme = useTheme();
  const search = useVaultStore(s => s.search);
  const results = q.trim() ? search(q) : [];

  // 表头收进 ListHeaderComponent，让 EntryList（虚拟列表）成为唯一滚动容器，
  // 避免 VirtualizedList 嵌在 ScrollView 里破坏 windowing（RN 会报错）。
  const header = (
    <View>
      <TextInput
        autoFocus
        placeholder="支持 #tag / status:todo / date:>=2026-05-01"
        placeholderTextColor={theme.muted}
        value={q}
        onChangeText={setQ}
        style={[baseStyles.input, { borderColor: theme.border, color: theme.fg, marginTop: 16 }]}
      />
      <Text style={{ color: theme.muted, marginVertical: 8 }}>{q.trim() && `${results.length} 条结果`}</Text>
    </View>
  );

  return (
    <View style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <EntryList entries={results} ListHeaderComponent={header} groupByDate={false} />
    </View>
  );
}
