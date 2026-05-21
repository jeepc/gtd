import { FlatList, View, Text, Alert } from 'react-native';
import { SwipeListView } from 'react-native-swipe-list-view';
import type { Entry } from '@gtd/core';
import { useVaultStore } from '../state/vaultStore';
import { useTheme } from '../theme';
import EntryRow from './EntryRow';

interface Props {
  entries: Entry[];
}

export default function EntryList({ entries }: Props) {
  const theme = useTheme();
  const toggle = useVaultStore(s => s.toggleDone);
  const remove = useVaultStore(s => s.remove);

  if (entries.length === 0) {
    return (
      <View style={{ padding: 32, alignItems: 'center' }}>
        <Text style={{ color: theme.muted }}>写下你的第一件事</Text>
      </View>
    );
  }

  return (
    <SwipeListView
      data={entries}
      keyExtractor={e => e.id}
      renderItem={({ item }) => <EntryRow entry={item} onToggle={toggle} />}
      renderHiddenItem={({ item }) => (
        <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 16, backgroundColor: '#ef4444' }}>
          <Text style={{ color: 'white' }} onPress={() => confirmDelete(item.id, remove)}>
            删除
          </Text>
        </View>
      )}
      rightOpenValue={-80}
      disableRightSwipe
    />
  );
}

function confirmDelete(id: string, remove: (id: string) => void) {
  Alert.alert('删除条目', '确定要删除吗？', [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: () => remove(id) },
  ]);
}
