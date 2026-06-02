import type { ReactElement } from 'react';
import { View, Text, Alert, type RefreshControlProps } from 'react-native';
import { SwipeListView } from 'react-native-swipe-list-view';
import type { Entry } from '@loop/core';
import { useVaultStore } from '../state/vaultStore';
import { useTheme } from '../theme';
import EntryRow from './EntryRow';

interface Props {
  entries: Entry[];
  /**
   * Rendered above the list. HomeScreen passes its capture UI here so the list
   * is the single scroll container — nesting a VirtualizedList inside a
   * ScrollView breaks windowing (RN warns about it).
   */
  ListHeaderComponent?: ReactElement | null;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Group entries into per-day sections like the desktop. Defaults to true. */
  groupByDate?: boolean;
}

export default function EntryList({ entries, ListHeaderComponent, refreshControl, groupByDate = true }: Props) {
  const theme = useTheme();
  const toggle = useVaultStore(s => s.toggleDone);
  const remove = useVaultStore(s => s.remove);

  const empty = (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <Text style={{ color: theme.muted }}>写下你的第一件事</Text>
    </View>
  );
  const renderItem = ({ item }: { item: Entry }) => <EntryRow entry={item} onToggle={toggle} />;
  const renderHiddenItem = ({ item }: { item: Entry }) => (
    <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 16, backgroundColor: '#ef4444' }}>
      <Text style={{ color: 'white' }} onPress={() => confirmDelete(item.id, remove)}>
        删除
      </Text>
    </View>
  );

  if (!groupByDate) {
    return (
      <SwipeListView
        data={entries}
        keyExtractor={e => e.id}
        ListHeaderComponent={ListHeaderComponent}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={empty}
        renderItem={renderItem}
        renderHiddenItem={renderHiddenItem}
        rightOpenValue={-80}
        disableRightSwipe
      />
    );
  }

  return (
    <SwipeListView
      useSectionList
      sections={groupSections(entries)}
      keyExtractor={e => e.id}
      ListHeaderComponent={ListHeaderComponent}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={empty}
      renderSectionHeader={({ section }) => (
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: theme.muted,
            backgroundColor: theme.bg,
            paddingTop: 16,
            paddingBottom: 6,
          }}
        >
          {formatDayHeader(section.title)}
        </Text>
      )}
      renderItem={renderItem}
      renderHiddenItem={renderHiddenItem}
      rightOpenValue={-80}
      disableRightSwipe
    />
  );
}

interface DateSection {
  title: string;
  data: Entry[];
}

/** Group entries into per-day sections, preserving the incoming order. */
function groupSections(entries: Entry[]): DateSection[] {
  const sections: DateSection[] = [];
  const byDate = new Map<string, DateSection>();
  for (const e of entries) {
    let section = byDate.get(e.date);
    if (!section) {
      section = { title: e.date, data: [] };
      byDate.set(e.date, section);
      sections.push(section);
    }
    section.data.push(e);
  }
  return sections;
}

function formatDayHeader(date: string): string {
  const today = new Date();
  const todayStr = ymd(today);
  const ys = ymd(new Date(today.getTime() - 86_400_000));
  if (date === todayStr) return '今天';
  if (date === ys) return '昨天';
  const dt = new Date(date + 'T00:00:00');
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
  return `${date} ${weekday}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function confirmDelete(id: string, remove: (id: string) => void) {
  Alert.alert('删除条目', '确定要删除吗？', [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: () => remove(id) },
  ]);
}
