import { useMemo, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { matchSlashCommands, parseCapture, describeDue, extractTags } from '@loop/core';
import EntryList from '../components/EntryList';
import { LoopLockup } from '../components/Logo';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles } from '../theme';

// 输入辅助工具条符号，对齐 desktop QuickInput.tsx TOOLBAR_SYMBOLS。
const TOOLBAR_SYMBOLS = [
  { ch: '/', title: '命令' },
  { ch: '#', title: '标签' },
  { ch: '@', title: '截止时间' },
  { ch: '!', title: '优先级' },
];
const PRIORITY_COLORS: Record<number, { fg: string; bg: string }> = {
  1: { fg: '#b91c1c', bg: '#fee2e2' },
  2: { fg: '#c2410c', bg: '#ffedd5' },
  3: { fg: '#a16207', bg: '#fef9c3' },
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const entries = useVaultStore(s => s.entries);
  const create = useVaultStore(s => s.create);
  const syncNow = useVaultStore(s => s.syncNow);
  const syncStatus = useVaultStore(s => s.syncStatus);
  const banner = useVaultStore(s => s.banner);
  const showToolbar = useVaultStore(s => s.appSettings.ui?.showInputToolbar ?? true);

  // Same shared matcher as desktop; tap a suggestion to complete the command.
  const matches = matchSlashCommands(text) ?? [];
  const pickCommand = (cmd: string) => {
    setText(cmd + ' ');
    inputRef.current?.focus();
  };

  // 移动端简化：在末尾追加符号并重新聚焦（省去光标位置处理）。
  const insert = (ch: string) => {
    setText(t => t + ch);
    inputRef.current?.focus();
  };

  // 实时预览 Level 2 capture 会识别出什么（对齐 desktop QuickInput）。
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const { metadata } = parseCapture(text);
    const due = typeof metadata.due === 'string' ? metadata.due : undefined;
    const priority = typeof metadata.priority === 'number' ? metadata.priority : undefined;
    const tags = extractTags(text);
    if (due === undefined && priority === undefined && tags.length === 0) return null;
    return { due, dueDesc: due ? describeDue(due) : null, priority, tags };
  }, [text]);

  // 所有顶部 UI 收进 list 的 ListHeaderComponent，使 EntryList 成为唯一的
  // 滚动容器——VirtualizedList 嵌在 ScrollView 里会破坏 windowing（RN 会报错）。
  const header = (
    <View>
      {banner && (
        <TouchableOpacity
          onPress={() => banner.includes('冲突') && navigation.navigate('Conflicts')}
          style={{ padding: 10, backgroundColor: '#fef3c7', borderRadius: 6, marginVertical: 8 }}
        >
          <Text style={{ color: '#92400e' }}>{banner}{banner.includes('冲突') && ' →'}</Text>
        </TouchableOpacity>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
        <View style={{ flex: 1 }}>
          <LoopLockup height={24} color={theme.fg} />
        </View>
        <SyncIndicator status={syncStatus} onPress={syncNow} theme={theme} />
        <TouchableOpacity
          onPress={() => navigation.navigate('Search')}
          style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 8 }}
        >
          <Text style={{ color: theme.fg }}>搜索</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 8 }}
        >
          <Text style={{ color: theme.fg }}>⋯</Text>
        </TouchableOpacity>
      </View>
      {showToolbar && (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
          {TOOLBAR_SYMBOLS.map(s => (
            <TouchableOpacity
              key={s.ch}
              accessibilityRole="button"
              accessibilityLabel={s.title}
              onPress={() => insert(s.ch)}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 6, backgroundColor: theme.tagBg }}
            >
              <Text style={{ color: theme.muted, fontSize: 15 }}>{s.ch}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput
        ref={inputRef}
        placeholder="写一条 todo，或 / 选命令；# 加标签"
        placeholderTextColor={theme.muted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => { if (text.trim()) { create(text); setText(''); } }}
        autoCapitalize="none"
        autoCorrect={false}
        style={[baseStyles.input, { borderColor: theme.border, color: theme.fg, marginTop: 8, marginBottom: matches.length > 0 || preview ? 0 : 8 }]}
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
      {matches.length === 0 && preview && (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 8 }}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>识别到</Text>
          {preview.tags.map(t => (
            <Text key={t} style={{ backgroundColor: theme.tagPillBg, color: theme.tagPillFg, fontSize: 12, paddingHorizontal: 4, borderRadius: 4 }}>#{t}</Text>
          ))}
          {preview.due !== undefined && (
            preview.dueDesc
              ? (
                <Text style={{ fontSize: 12, paddingHorizontal: 6, borderRadius: 4, color: preview.dueDesc.overdue ? '#92400e' : theme.muted, backgroundColor: preview.dueDesc.overdue ? '#fef3c7' : 'transparent' }}>
                  截止 {preview.dueDesc.label}
                </Text>
              )
              : <Text style={{ color: theme.muted, fontSize: 12, fontStyle: 'italic' }}>截止「{preview.due}」未能识别为时间</Text>
          )}
          {preview.priority !== undefined && (
            <Text style={{ fontSize: 11, fontWeight: '700', paddingHorizontal: 5, borderRadius: 4, color: (PRIORITY_COLORS[preview.priority] ?? { fg: theme.fg }).fg, backgroundColor: (PRIORITY_COLORS[preview.priority] ?? { bg: theme.tagBg }).bg }}>
              {'!'.repeat(preview.priority)}
            </Text>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={[baseStyles.screen, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <EntryList
        entries={entries}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={syncStatus === 'syncing'} onRefresh={syncNow} />}
      />
    </View>
  );
}

// PRD §4.7.1: top-right sync state pill on home screen.
const STATUS_META = {
  idle: { label: '已同步', color: '#10b981' },
  syncing: { label: '同步中', color: '#3b82f6' },
  pull_required: { label: '需拉取', color: '#f59e0b' },
  conflict: { label: '有冲突', color: '#f59e0b' },
  error: { label: '同步失败', color: '#6b7280' },
  disabled: { label: '同步关闭', color: '#6b7280' },
} as const;

function SyncIndicator({ status, onPress, theme }: { status: keyof typeof STATUS_META; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  const meta = STATUS_META[status];
  return (
    <TouchableOpacity onPress={onPress} disabled={status === 'syncing'} accessibilityRole="button" accessibilityLabel={meta.label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: theme.tagBg }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.color }} />
        <Text style={{ color: theme.muted, fontSize: 11 }}>{meta.label}</Text>
      </View>
    </TouchableOpacity>
  );
}
