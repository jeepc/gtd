import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { userFields } from '@loop/core';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles, useScreenBottomInset } from '../theme';

export default function EntryDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const theme = useTheme();
  // 早返回（未找到条目）之前调用，遵守 hooks 规则。
  const bottomInset = useScreenBottomInset();
  const id: string = route.params?.id;
  const entry = useVaultStore(s => s.entries.find(e => e.id === id));
  const update = useVaultStore(s => s.update);
  const remove = useVaultStore(s => s.remove);
  const setProperty = useVaultStore(s => s.setProperty);
  const [content, setContent] = useState(entry?.content ?? '');
  const [due, setDue] = useState(formatDueInput(entry?.metadata.due));

  useEffect(() => {
    if (entry) {
      setContent(entry.content);
      setDue(formatDueInput(entry.metadata.due));
    }
  }, [entry?.id]);

  if (!entry) return <View style={[baseStyles.screen, { backgroundColor: theme.bg }]}><Text style={{ color: theme.muted, padding: 16 }}>未找到条目</Text></View>;

  const userMeta = userFields(entry.metadata);
  const priority = typeof entry.metadata.priority === 'number' ? entry.metadata.priority : null;

  const saveDue = async () => {
    const parsed = parseDueInput(due);
    if (parsed.ok) {
      await setProperty(entry.id, 'due', parsed.value);
    } else {
      Alert.alert(parsed.message);
    }
  };

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={bottomInset}>
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
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: theme.muted, marginBottom: 4 }}>截止时间</Text>
          <TextInput
            value={due}
            onChangeText={setDue}
            placeholder="2026-05-25 或 2026-05-25T18:30"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[baseStyles.input, { borderColor: theme.border, color: theme.fg }]}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={[baseStyles.button, { borderColor: theme.border }]} onPress={saveDue}>
              <Text style={{ color: theme.fg }}>保存 due</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[baseStyles.button, { borderColor: theme.border }]}
              onPress={async () => { setDue(''); await setProperty(entry.id, 'due', null); }}>
              <Text style={{ color: theme.fg }}>清除</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>只填日期时按本地当天 23:59 提醒。</Text>

          <Text style={{ color: theme.muted, marginTop: 12, marginBottom: 4 }}>优先级</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {([
              { v: null, label: '无' },
              { v: 1, label: 'P1（最高）' },
              { v: 2, label: 'P2' },
              { v: 3, label: 'P3' },
            ] as const).map(opt => (
              <TouchableOpacity
                key={String(opt.v)}
                style={[baseStyles.button, { borderColor: priority === opt.v ? theme.accent : theme.border }]}
                onPress={() => setProperty(entry.id, 'priority', opt.v)}>
                <Text style={{ color: theme.fg }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Text style={{ color: theme.muted }}>状态：{entry.status}</Text>
      <Text style={{ color: theme.muted }}>日期：{entry.date}</Text>
      {entry.metadata.done && <Text style={{ color: theme.muted }}>完成：{entry.metadata.done}</Text>}
      {entry.metadata.log && <Text style={{ color: theme.muted }}>记录：{entry.metadata.log}</Text>}
      <Text style={{ color: theme.muted }}>更新：{entry.metadata.updated}</Text>
      {Object.entries(userMeta).map(([k, v]) => (
        <Text key={k} style={{ color: theme.muted }}>{k}：{String(v)}</Text>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {entry.tags.map(t => (
          <Text
            key={t}
            onPress={() => navigation.navigate('Tag', { tag: t })}
            style={{ backgroundColor: theme.tagPillBg, color: theme.tagPillFg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6 }}
          >#{t}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

// 以下两个纯函数照搬 desktop EntryDetailPage.tsx（无 DOM 依赖）。
function formatDueInput(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseDueInput(value: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T23:59:00`);
    if (Number.isNaN(d.getTime())) return { ok: false, message: '截止日期无效' };
    return { ok: true, value: d.toISOString() };
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}:00`);
    if (Number.isNaN(d.getTime())) return { ok: false, message: '截止时间无效' };
    return { ok: true, value: d.toISOString() };
  }
  return { ok: false, message: '请使用 2026-05-25 或 2026-05-25T18:30 格式' };
}
