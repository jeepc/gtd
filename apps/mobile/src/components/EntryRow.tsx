import { View, Text, TouchableOpacity, Pressable, ToastAndroid, Platform, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import { type Entry, describeDue } from '@gtd/core';
import { useTheme } from '../theme';

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

  return (
    <Pressable
      onPress={() => navigation.navigate('Entry', { id: entry.id })}
      onLongPress={() => (onLongPress ? onLongPress(entry) : copyEntry(entry))}
      style={{
        flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10,
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
          {renderContent(entry.content, theme, t => navigation.navigate('Tag', { tag: t }))}
        </Text>
        {dueBadge(entry, theme)}
      </View>
      <Text style={{ color: theme.muted, fontSize: 12, marginLeft: 8 }}>{formatTime(entry)}</Text>
    </Pressable>
  );
}

function dueBadge(entry: Entry, theme: ReturnType<typeof useTheme>) {
  if (entry.status === 'done') return null;
  const due = entry.metadata.due;
  if (typeof due !== 'string') return null;
  const d = describeDue(due);
  if (!d) return null;
  return (
    <Text style={{ fontSize: 12, marginTop: 2, color: d.overdue ? '#dc2626' : theme.muted }}>
      ⏰ {d.label}
    </Text>
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
          style={{ backgroundColor: theme.tagBg, color: theme.tagFg, paddingHorizontal: 4, borderRadius: 4 }}
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
  if (diffMin < 60) return `${Math.floor(diffMin)}m`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}h`;
  return d.toLocaleDateString('zh-CN');
}
