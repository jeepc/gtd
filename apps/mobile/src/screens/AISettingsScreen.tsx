import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useVaultStore } from '../state/vaultStore';
import { saveSecret } from '../platform/keychain';
import { useTheme, baseStyles } from '../theme';

export default function AISettingsScreen() {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const config = useVaultStore(s => s.config);
  const saveConfig = useVaultStore(s => s.saveConfig);

  const [enabled, setEnabled] = useState(config.ai.enabled);
  const [provider, setProvider] = useState(config.ai.provider);
  const [model, setModel] = useState(config.ai.model);
  const [endpoint, setEndpoint] = useState(config.ai.endpoint ?? '');
  const [apiKey, setApiKey] = useState('');

  async function save() {
    const ref = `keychain://todo-app/${provider}-key`;
    if (apiKey) await saveSecret(ref, apiKey);
    await saveConfig({ ...config, ai: { ...config.ai, enabled, provider, model, endpoint: endpoint || null, apiKeyRef: ref } });
    nav.goBack();
  }

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]}>
      <View style={baseStyles.row}>
        <Text style={[baseStyles.label, { color: theme.muted }]}>启用 AI</Text>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>
      <View style={baseStyles.row}>
        <Text style={[baseStyles.label, { color: theme.muted }]}>Provider</Text>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {(['anthropic', 'openai', 'ollama', 'custom'] as const).map(p => (
            <TouchableOpacity key={p} onPress={() => setProvider(p)} style={[baseStyles.button, { borderColor: provider === p ? theme.accent : theme.border }]}>
              <Text style={{ color: theme.fg }}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={baseStyles.row}>
        <Text style={[baseStyles.label, { color: theme.muted }]}>Model</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={model} onChangeText={setModel} />
      </View>
      <View style={baseStyles.row}>
        <Text style={[baseStyles.label, { color: theme.muted }]}>Endpoint</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={endpoint} onChangeText={setEndpoint} placeholder="留空使用默认" placeholderTextColor={theme.muted} />
      </View>
      <View style={baseStyles.row}>
        <Text style={[baseStyles.label, { color: theme.muted }]}>API Key</Text>
        <TextInput style={[baseStyles.input, { flex: 1, borderColor: theme.border, color: theme.fg }]} value={apiKey} onChangeText={setApiKey} secureTextEntry placeholder={config.ai.apiKeyRef ? '（保留不变）' : ''} placeholderTextColor={theme.muted} />
      </View>
      <TouchableOpacity onPress={save} style={[baseStyles.button, { borderColor: theme.border, marginTop: 12 }]}>
        <Text style={{ color: theme.fg, textAlign: 'center' }}>保存</Text>
      </TouchableOpacity>
      <Text style={{ color: theme.muted, marginTop: 12 }}>启用后，「问 AI」会将当前可见条目发送给所选 provider。推荐 Ollama 完全本地。</Text>
    </ScrollView>
  );
}
