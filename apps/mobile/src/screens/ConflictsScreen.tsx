import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useVaultStore } from '../state/vaultStore';
import type { Entry } from '@gtd/core';
import { useTheme, baseStyles } from '../theme';

interface Pair { local: Entry; remote: Entry | null }

export default function ConflictsScreen() {
  const theme = useTheme();
  const vault = useVaultStore(s => s.vault);
  const resolve = useVaultStore(s => s.resolveConflict);
  const [pairs, setPairs] = useState<Pair[]>([]);

  async function load() {
    if (!vault) return;
    const local = await vault.listConflicts();
    const merged = await Promise.all(local.map(async l => ({
      local: l, remote: await vault.findArchivedRemote(l.id),
    })));
    setPairs(merged);
  }

  useEffect(() => { load(); }, [vault]);

  async function pick(id: string, choice: 'local' | 'remote' | 'both') {
    await resolve(id, choice);
    await load();
  }

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <Text style={[baseStyles.title, { color: theme.fg, marginVertical: 12 }]}>冲突 {pairs.length}</Text>
      {pairs.length === 0 && <Text style={{ color: theme.muted, padding: 24, textAlign: 'center' }}>没有冲突</Text>}
      {pairs.map(({ local, remote }) => (
        <View key={local.id} style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{local.date} · {local.status}</Text>
          <Text style={{ color: theme.muted, marginTop: 8 }}>本地</Text>
          <Text style={{ color: theme.fg }}>{local.content}</Text>
          <Text style={{ color: theme.muted, marginTop: 8 }}>远端</Text>
          <Text style={{ color: theme.fg }}>{remote?.content ?? '(找不到归档)'}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={[baseStyles.button, { borderColor: theme.border }]} onPress={() => pick(local.id, 'local')}>
              <Text style={{ color: theme.fg }}>接受本地</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!remote} style={[baseStyles.button, { borderColor: theme.border, opacity: remote ? 1 : 0.4 }]} onPress={() => pick(local.id, 'remote')}>
              <Text style={{ color: theme.fg }}>接受远端</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!remote} style={[baseStyles.button, { borderColor: theme.border, opacity: remote ? 1 : 0.4 }]} onPress={() => pick(local.id, 'both')}>
              <Text style={{ color: theme.fg }}>都保留</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
