import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import EntryList from '../components/EntryList';
import AskAI from '../components/AskAI';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles } from '../theme';

export default function TagScreen() {
  const route = useRoute<any>();
  const tag: string = route.params?.tag;
  const theme = useTheme();
  const entries = useVaultStore(s => s.entries);
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');

  const filtered = entries.filter(e => {
    if (!e.tags.includes(tag)) return false;
    if (filter === 'todo') return e.status === 'todo';
    if (filter === 'done') return e.status === 'done';
    return true;
  });

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <Text style={[baseStyles.title, { color: theme.fg, marginTop: 16 }]}>#{tag}</Text>
      <Text style={{ color: theme.muted, marginBottom: 8 }}>{filtered.length} 条</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
        {(['all', 'todo', 'done'] as const).map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[baseStyles.button, { borderColor: filter === f ? theme.accent : theme.border }]}>
            <Text style={{ color: theme.fg }}>{f === 'all' ? '全部' : f === 'todo' ? '未完成' : '已完成'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <AskAI entries={filtered} />
      <EntryList entries={filtered} />
    </ScrollView>
  );
}
