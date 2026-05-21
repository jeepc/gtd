import { useState } from 'react';
import { useVaultStore, loadSecret } from '../state/vaultStore.ts';
import { FetchAIClient, renderTemplate, type Entry } from '@gtd/core';

interface Props {
  entries: Entry[];
}

export default function AskAI({ entries }: Props) {
  const config = useVaultStore(s => s.config);
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);

  if (!config.ai.enabled) return null;

  async function ask(templateId: string) {
    const template = config.ai.promptTemplates.find(t => t.id === templateId);
    if (!template) return;
    const apiKey = await loadSecret(config.ai.apiKeyRef);
    if (!apiKey && config.ai.provider !== 'ollama') {
      setAnswer('请先在「设置 → AI」配置 API Key');
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
        userPrompt: renderTemplate(template, entries),
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
    await useVaultStore.getState().create('/log ' + answer + ' #ai_summary');
    setOpen(false);
  }

  return (
    <>
      <details>
        <summary className="link">问 AI</summary>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
          {config.ai.promptTemplates.map(t => (
            <button key={t.id} onClick={() => ask(t.id)}>{t.name}</button>
          ))}
        </div>
      </details>
      {open && (
        <div className="ai-panel">
          {answer || (streaming ? '思考中…' : '')}
          {answer && !streaming && (
            <div style={{ marginTop: 8 }}>
              <button onClick={saveAsLog}>保存为 log</button>
              <button onClick={() => setOpen(false)} style={{ marginLeft: 6 }}>关闭</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
