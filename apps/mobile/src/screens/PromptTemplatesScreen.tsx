import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useVaultStore } from '../state/vaultStore';
import { ulid, type PromptTemplate } from '@gtd/core';
import { useTheme, baseStyles } from '../theme';

export default function PromptTemplatesScreen() {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const config = useVaultStore(s => s.config);
  const saveConfig = useVaultStore(s => s.saveConfig);
  const [list, setList] = useState<PromptTemplate[]>(config.ai.promptTemplates);

  function update(i: number, patch: Partial<PromptTemplate>) {
    setList(list.map((t, j) => j === i ? { ...t, ...patch } : t));
  }

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      {list.map((t, i) => (
        <View key={t.id} style={{ marginVertical: 8 }}>
          <TextInput
            value={t.name}
            onChangeText={n => update(i, { name: n })}
            style={[baseStyles.input, { borderColor: theme.border, color: theme.fg, marginBottom: 6 }]}
          />
          <TextInput
            multiline
            value={t.prompt}
            onChangeText={p => update(i, { prompt: p })}
            style={[baseStyles.input, { borderColor: theme.border, color: theme.fg, minHeight: 80 }]}
          />
          {!t.builtin && (
            <TouchableOpacity onPress={() => setList(list.filter((_, j) => j !== i))}>
              <Text style={{ color: '#ef4444', marginTop: 4 }}>删除</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 16 }}>
        <TouchableOpacity onPress={() => setList([...list, { id: ulid(), name: '新模板', prompt: '请总结：\n\n{{entries}}' }])} style={[baseStyles.button, { borderColor: theme.border }]}>
          <Text style={{ color: theme.fg }}>新建</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={async () => { await saveConfig({ ...config, ai: { ...config.ai, promptTemplates: list } }); nav.goBack(); }} style={[baseStyles.button, { borderColor: theme.border }]}>
          <Text style={{ color: theme.fg }}>保存</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
