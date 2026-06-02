import { View, Text, TouchableOpacity, Pressable, ToastAndroid, Platform, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import { describeDue, type Entry } from '@loop/core';
import { useTheme } from '../theme';

// 优先级徽章配色，对齐 desktop styles.css 的 .priority-badge.p1/p2/p3。
const PRIORITY_COLORS: Record<number, { fg: string; bg: string }> = {
  1: { fg: '#b91c1c', bg: '#fee2e2' },
  2: { fg: '#c2410c', bg: '#ffedd5' },
  3: { fg: '#a16207', bg: '#fef9c3' },
};

interface Props {
  entry: Entry;
  onToggle: (id: string, done: boolean) => void;
  onLongPress?: (entry: Entry) => void;
}

// PRD §7.3: long-press copies content to clipboard.
function copyEntry(entry: Entry) {
  Clipboard.setString(entry.content);
  if (Platform.OS === 'android') {
    ToastAndroid.show('已复制', ToastAndroid.SHORT);
  } else {
    Alert.alert('已复制');
  }
}

export default function EntryRow({ entry, onToggle, onLongPress }: Props) {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const done = entry.status === 'done';
  const isLog = entry.status === 'log';
  const isTodo = entry.status === 'todo';
  const due = isTodo && typeof entry.metadata.due === 'string'
    ? describeDue(entry.metadata.due)
    : null;
  const priority = isTodo && typeof entry.metadata.priority === 'number'
    && entry.metadata.priority >= 1 && entry.metadata.priority <= 3
    ? entry.metadata.priority
    : null;

  return (
    <Pressable
      onPress={() => navigation.navigate('Entry', { id: entry.id })}
      onLongPress={() => (onLongPress ? onLongPress(entry) : copyEntry(entry))}
      style={{
        flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10,
        paddingHorizontal: 4, backgroundColor: theme.bg,
        borderBottomWidth: 1, borderColor: theme.border,
      }}
    >
      <TouchableOpacity
        onPress={() => !isLog && onToggle(entry.id, !done)}
        style={{ width: 28, paddingTop: 2 }}
      >
        <Text style={{ color: theme.fg, fontSize: 16 }}>
          {isLog ? '•' : done ? '☑' : '☐'}
        </Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ color: done ? theme.muted : theme.fg, textDecorationLine: done ? 'line-through' : 'none' }}>
          {priority && (
            <Text
              onPress={() => navigation.navigate('Priority', { level: priority })}
              style={{
                color: PRIORITY_COLORS[priority]!.fg, backgroundColor: PRIORITY_COLORS[priority]!.bg,
                fontSize: 11, fontWeight: '700', paddingHorizontal: 5, borderRadius: 4,
              }}
            >
              {'!'.repeat(priority)}{' '}
            </Text>
          )}
          {renderContent(entry.content, theme, t => navigation.navigate('Tag', { tag: t }))}
          {due && (
            <Text
              style={{
                color: due.overdue ? '#92400e' : theme.muted,
                backgroundColor: due.overdue ? '#fef3c7' : 'transparent',
                fontSize: 12, paddingHorizontal: 6, borderRadius: 4,
              }}
            >
              {' '}{due.label}
            </Text>
          )}
        </Text>
      </View>
      <Text style={{ color: theme.muted, fontSize: 12, marginLeft: 8 }}>{formatTime(entry)}</Text>
    </Pressable>
  );
}

function renderContent(text: string, theme: ReturnType<typeof useTheme>, onTag: (t: string) => void) {
  const parts = text.split(/(\s|^)(#[^\s#]+)/g);
  return parts.map((p, i) => {
    if (/^#/.test(p)) {
      const tag = p.slice(1);
      if (/^\d+$/.test(tag)) return <Text key={i}>{p}</Text>;
      return (
        <Text
          key={i}
          onPress={() => onTag(tag)}
          style={{ backgroundColor: theme.tagPillBg, color: theme.tagPillFg, paddingHorizontal: 4, borderRadius: 4 }}
        >
          #{tag}
        </Text>
      );
    }
    return <Text key={i}>{p}</Text>;
  });
}

function formatTime(entry: Entry): string {
  const ts = entry.metadata.done || entry.metadata.log || entry.metadata.updated;
  if (!ts) return '';
  const d = new Date(ts);
  const diffMin = (Date.now() - d.getTime()) / 60_000;
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${Math.floor(diffMin)} 分钟前`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} 小时前`;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
