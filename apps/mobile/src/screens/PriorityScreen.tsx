import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import EntryList from '../components/EntryList';
import { useVaultStore } from '../state/vaultStore';
import { useTheme, baseStyles } from '../theme';

// 优先级徽章配色，对齐 desktop styles.css 的 .priority-badge.p1/p2/p3。
const PRIORITY_COLORS: Record<number, { fg: string; bg: string }> = {
  1: { fg: '#b91c1c', bg: '#fee2e2' },
  2: { fg: '#c2410c', bg: '#ffedd5' },
  3: { fg: '#a16207', bg: '#fef9c3' },
};

/** 按优先级（P1/P2/P3）筛选条目——desktop PriorityPage 的 RN 对应物。 */
export default function PriorityScreen() {
  const route = useRoute<any>();
  const p = Number(route.params?.level);
  const theme = useTheme();
  const entries = useVaultStore(s => s.entries);
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');

  const filtered = entries.filter(e => {
    if (e.metadata.priority !== p) return false;
    if (filter === 'todo') return e.status === 'todo';
    if (filter === 'done') return e.status === 'done';
    return true;
  });

  const color = PRIORITY_COLORS[p] ?? { fg: theme.fg, bg: theme.tagBg };

  // 表头收进 ListHeaderComponent，让 EntryList（虚拟列表）成为唯一滚动容器，
  // 避免 VirtualizedList 嵌在 ScrollView 里破坏 windowing（RN 会报错）。
  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 }}>
        <Text style={{ color: color.fg, backgroundColor: color.bg, fontSize: 12, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
          {'!'.repeat(p)}
        </Text>
        <Text style={[baseStyles.title, { color: theme.fg }]}>优先级 P{p}</Text>
      </View>
      <Text style={{ color: theme.muted, marginBottom: 8 }}>{filtered.length} 条</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
        {(['all', 'todo', 'done'] as const).map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[baseStyles.button, { borderColor: filter === f ? theme.accent : theme.border }]}>
            <Text style={{ color: theme.fg }}>{f === 'all' ? '全部' : f === 'todo' ? '未完成' : '已完成'}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <EntryList entries={filtered} ListHeaderComponent={header} />
    </View>
  );
}
