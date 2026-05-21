import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { userFields } from '@gtd/core';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles } from '../theme';

export default function EntryDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const id: string = route.params?.id;
  const entry = useVaultStore(s => s.entries.find(e => e.id === id));
  const update = useVaultStore(s => s.update);
  const remove = useVaultStore(s => s.remove);
  const setProperty = useVaultStore(s => s.setProperty);
  const [content, setContent] = useState(entry?.content ?? '');
  const dueValue = typeof entry?.metadata.due === 'string' ? entry.metadata.due : '';
  const [due, setDue] = useState(dueValue);

  useEffect(() => { if (entry) setContent(entry.content); }, [entry?.id]);
  useEffect(() => { setDue(dueValue); }, [entry?.id, dueValue]);

  if (!entry) return <View style={[baseStyles.screen, { backgroundColor: theme.bg }]}><Text style={{ color: theme.muted, padding: 16 }}>未找到条目</Text></View>;

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <TextInput
        multiline
        value={content}
        onChangeText={setContent}
        style={[baseStyles.input, { borderColor: theme.border, color: theme.fg, minHeight: 100, marginTop: 16 }]}
      />
      <View style={{ flexDirection: 'row', marginVertical: 12, gap: 8 }}>
        <TouchableOpacity
          style={[baseStyles.button, { borderColor: theme.border }]}
          onPress={async () => { await update(entry.id, { content }); navigation.goBack(); }}>
          <Text style={{ color: theme.fg }}>保存</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[baseStyles.button, { borderColor: theme.border }]}
          onPress={() => Alert.alert('确认删除', '', [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: async () => { await remove(entry.id); navigation.goBack(); } },
          ])}>
          <Text style={{ color: '#ef4444' }}>删除</Text>
        </TouchableOpacity>
      </View>
      {entry.status === 'todo' && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: theme.muted, marginBottom: 4 }}>截止时间（设置后将提醒，如 2026-05-25 或 2026-05-25T09:00）</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={due}
              onChangeText={setDue}
              onEndEditing={() => setProperty(entry.id, 'due', due.trim() || null)}
              placeholder="YYYY-MM-DD[THH:mm]"
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]}
            />
            {!!dueValue && (
              <TouchableOpacity
                style={[baseStyles.button, { borderColor: theme.border }]}
                onPress={() => { setDue(''); setProperty(entry.id, 'due', null); }}>
                <Text style={{ color: theme.fg }}>清除</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      <Text style={{ color: theme.muted }}>状态：{entry.status}</Text>
      <Text style={{ color: theme.muted }}>日期：{entry.date}</Text>
      {entry.metadata.done && <Text style={{ color: theme.muted }}>完成：{entry.metadata.done}</Text>}
      {entry.metadata.log && <Text style={{ color: theme.muted }}>记录：{entry.metadata.log}</Text>}
      <Text style={{ color: theme.muted }}>更新：{entry.metadata.updated}</Text>
      {Object.entries(userFields(entry.metadata))
        .filter(([k]) => k !== 'due')
        .map(([k, v]) => (
          <Text key={k} style={{ color: theme.muted }}>{k}：{String(v)}</Text>
        ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {entry.tags.map(t => (
          <Text
            key={t}
            onPress={() => navigation.navigate('Tag', { tag: t })}
            style={{ backgroundColor: theme.tagBg, color: theme.tagFg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6 }}
          >#{t}</Text>
        ))}
      </View>
    </ScrollView>
  );
}
