import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { FetchAIClient, renderTemplate, type Entry } from '@gtd/core';
import { useVaultStore } from '../state/vaultStore';
import { loadSecret } from '../platform/keychain';
import { useTheme, baseStyles } from '../theme';

interface Props { entries: Entry[] }

export default function AskAI({ entries }: Props) {
  const theme = useTheme();
  const config = useVaultStore(s => s.config);
  const create = useVaultStore(s => s.create);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [open, setOpen] = useState(false);

  if (!config.ai.enabled) return null;

  async function ask(templateId: string) {
    const tpl = config.ai.promptTemplates.find(t => t.id === templateId);
    if (!tpl) return;
    const apiKey = await loadSecret(config.ai.apiKeyRef);
    if (!apiKey && config.ai.provider !== 'ollama') {
      setAnswer('请先在「设置 → AI」配置 API Key');
      setOpen(true);
      return;
    }
    setOpen(true);
    setAnswer('');
    setStreaming(true);
    const client = new FetchAIClient();
    try {
      for await (const chunk of client.stream({
        provider: config.ai.provider,
        apiKey,
        model: config.ai.model,
        endpoint: config.ai.endpoint,
        userPrompt: renderTemplate(tpl, entries),
      })) {
        setAnswer(prev => prev + chunk.delta);
        if (chunk.done) break;
      }
    } catch (e) {
      setAnswer('AI 调用失败：' + (e as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  async function saveAsLog() {
    if (!answer.trim()) return;
    await create('/log ' + answer + ' #ai_summary');
    setOpen(false);
  }

  return (
    <View style={{ marginVertical: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {config.ai.promptTemplates.map(t => (
          <TouchableOpacity key={t.id} onPress={() => ask(t.id)} style={[baseStyles.button, { borderColor: theme.border }]}>
            <Text style={{ color: theme.fg }}>问 AI：{t.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {open && (
        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, marginTop: 8 }}>
          <Text style={{ color: theme.fg }}>{answer || (streaming ? '思考中…' : '')}</Text>
          {answer && !streaming && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={saveAsLog} style={[baseStyles.button, { borderColor: theme.border }]}>
                <Text style={{ color: theme.fg }}>保存为 log</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOpen(false)} style={[baseStyles.button, { borderColor: theme.border }]}>
                <Text style={{ color: theme.fg }}>关闭</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
