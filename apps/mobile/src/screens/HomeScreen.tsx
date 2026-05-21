import { useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, RefreshControl, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { matchSlashCommands, previewCapture, describeDue } from '@gtd/core';
import EntryList from '../components/EntryList';
import AskAI from '../components/AskAI';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles } from '../theme';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const entries = useVaultStore(s => s.entries);
  const create = useVaultStore(s => s.create);
  const syncNow = useVaultStore(s => s.syncNow);
  const syncStatus = useVaultStore(s => s.syncStatus);
  const banner = useVaultStore(s => s.banner);

  // Same shared matcher as desktop; tap a suggestion to complete the command.
  const matches = matchSlashCommands(text) ?? [];
  const pickCommand = (cmd: string) => {
    setText(cmd + ' ');
    inputRef.current?.focus();
  };

  return (
    <ScrollView
      style={[baseStyles.screen, { backgroundColor: theme.bg }]}
      refreshControl={<RefreshControl refreshing={syncStatus === 'syncing'} onRefresh={syncNow} />}
    >
      {banner && (
        <TouchableOpacity
          onPress={() => banner.includes('冲突') && navigation.navigate('Conflicts')}
          style={{ padding: 10, backgroundColor: '#fef3c7', borderRadius: 6, marginVertical: 8 }}
        >
          <Text style={{ color: '#92400e' }}>{banner}{banner.includes('冲突') && ' →'}</Text>
        </TouchableOpacity>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
        <Text style={[baseStyles.title, { color: theme.fg, flex: 1 }]}>GTD</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Search')}>
          <Text style={{ color: theme.accent, marginRight: 12 }}>搜索</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Text style={{ color: theme.accent }}>⋯</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        ref={inputRef}
        placeholder="写一条 todo，或 / 选命令；#due:0525@9:00 设提醒"
        placeholderTextColor={theme.muted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => { if (text.trim()) { create(text); setText(''); } }}
        autoCapitalize="none"
        autoCorrect={false}
        style={[baseStyles.input, { borderColor: theme.border, color: theme.fg, marginTop: 8, marginBottom: matches.length > 0 ? 0 : 8 }]}
      />
      {matches.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, backgroundColor: theme.bg, marginTop: 4, marginBottom: 8, overflow: 'hidden' }}>
          {matches.map((c, i) => (
            <TouchableOpacity
              key={c.cmd}
              onPress={() => pickCommand(c.cmd)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.border }}
            >
              <Text style={{ color: theme.accent, fontWeight: '600', width: 64 }}>{c.cmd}</Text>
              <Text style={{ color: theme.muted, fontSize: 12, flex: 1 }}>{c.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {matches.length === 0 && <CapturePreview text={text} theme={theme} />}
      <AskAI entries={entries} />
      <EntryList entries={entries} />
    </ScrollView>
  );
}

// Live preview of the parsed capture (status / due / priority / tags), so the
// inline `#due:` / `#!!` syntax is discoverable from the input box.
function CapturePreview({ text, theme }: { text: string; theme: ReturnType<typeof useTheme> }) {
  if (!text.trim()) return null;
  const p = previewCapture(text);
  const due = typeof p.fields.due === 'string' ? describeDue(p.fields.due) : null;
  const chips: string[] = [];
  if (p.status !== 'todo') chips.push(p.status === 'log' ? '日志' : '已完成');
  if (due) chips.push(`⏰ ${due.label}`);
  if (typeof p.fields.priority === 'number') chips.push(`P${p.fields.priority}`);
  p.tags.forEach(t => chips.push(`#${t}`));
  if (!chips.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {chips.map((c, i) => (
        <Text key={i} style={{ fontSize: 12, color: theme.tagFg, backgroundColor: theme.tagBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>{c}</Text>
      ))}
    </View>
  );
}
