import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaultStore, saveSecret, loadSecret } from '../state/vaultStore.ts';
import { FetchAIClient } from '@gtd/core';

export default function AISettingsPage() {
  const navigate = useNavigate();
  const config = useVaultStore(s => s.config);
  const saveConfig = useVaultStore(s => s.saveConfig);

  const [enabled, setEnabled] = useState(config.ai.enabled);
  const [provider, setProvider] = useState(config.ai.provider);
  const [model, setModel] = useState(config.ai.model);
  const [endpoint, setEndpoint] = useState(config.ai.endpoint ?? '');
  const [apiKey, setApiKey] = useState('');
  const [testMsg, setTestMsg] = useState('');

  async function save() {
    const apiKeyRef = `keychain://todo-app/${provider}-key`;
    if (apiKey) await saveSecret(apiKeyRef, apiKey);
    await saveConfig({
      ...config,
      ai: {
        ...config.ai,
        enabled,
        provider,
        model,
        endpoint: endpoint || null,
        apiKeyRef,
      },
    });
    navigate(-1);
  }

  async function test() {
    setTestMsg('测试中…');
    try {
      const key = apiKey || await loadSecret(config.ai.apiKeyRef);
      const client = new FetchAIClient();
      let buf = '';
      for await (const chunk of client.stream({
        provider, apiKey: key, model, endpoint: endpoint || null,
        userPrompt: '回答 "hello" 两个字',
      })) {
        buf += chunk.delta;
        if (buf.length > 20) break;
      }
      setTestMsg('测试成功：' + buf.slice(0, 50));
    } catch (e) {
      setTestMsg('测试失败：' + (e as Error).message);
    }
  }

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">AI 配置</div>
      <div className="section" style={{ marginTop: 16 }}>
        <div className="row"><label>启用 AI</label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /></div>
        <div className="row">
          <label>Provider</label>
          <select value={provider} onChange={e => setProvider(e.target.value as any)}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama (本地)</option>
            <option value="custom">自定义 (OpenAI 兼容)</option>
          </select>
        </div>
        <div className="row"><label>Model</label><input value={model} onChange={e => setModel(e.target.value)} /></div>
        <div className="row"><label>Endpoint</label><input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="留空使用默认" /></div>
        <div className="row"><label>API Key</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={config.ai.apiKeyRef ? '（保留不变）' : ''} /></div>
        <div className="row">
          <button onClick={test}>测试</button>
          <button onClick={save}>保存</button>
        </div>
        {testMsg && <div className="meta">{testMsg}</div>}
        <div className="meta" style={{ marginTop: 12 }}>
          启用后，「问 AI」会将当前可见条目发送给所选 provider。推荐 Ollama 完全本地。
        </div>
      </div>
    </>
  );
}
