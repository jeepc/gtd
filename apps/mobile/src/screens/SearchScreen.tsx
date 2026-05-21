import { useState } from 'react';
import { View, TextInput, Text, ScrollView } from 'react-native';
import EntryList from '../components/EntryList';
import AskAI from '../components/AskAI';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles } from '../theme';

export default function SearchScreen() {
  const [q, setQ] = useState('');
  const theme = useTheme();
  const search = useVaultStore(s => s.search);
  const results = q.trim() ? search(q) : [];

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <TextInput
        autoFocus
        placeholder="支持 #tag / status:todo / date:>=2026-05-01"
        placeholderTextColor={theme.muted}
        value={q}
        onChangeText={setQ}
        style={[baseStyles.input, { borderColor: theme.border, color: theme.fg, marginTop: 16 }]}
      />
      <Text style={{ color: theme.muted, marginVertical: 8 }}>{q.trim() && `${results.length} 条结果`}</Text>
      <AskAI entries={results} />
      <EntryList entries={results} />
    </ScrollView>
  );
}
