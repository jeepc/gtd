import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaultStore, saveSecret, loadSecret } from '../state/vaultStore.ts';
import { WebDAVClient } from '@gtd/core';

export default function SyncSettingsPage() {
  const navigate = useNavigate();
  const config = useVaultStore(s => s.config);
  const saveConfig = useVaultStore(s => s.saveConfig);
  const syncNow = useVaultStore(s => s.syncNow);
  const lastSync = useVaultStore(s => s.lastSync);

  const dav = config.sync.webdav;
  const [url, setUrl] = useState(dav?.url ?? '');
  const [user, setUser] = useState(dav?.username ?? '');
  const [pass, setPass] = useState('');
  const [autoSync, setAutoSync] = useState(config.sync.autoSync);
  const [testMsg, setTestMsg] = useState('');

  async function save() {
    const passwordRef = 'keychain://todo-app/webdav';
    if (pass) await saveSecret(passwordRef, pass);
    await saveConfig({
      ...config,
      sync: {
        webdav: { url, username: user, passwordRef },
        autoSync,
      },
    });
    navigate(-1);
  }

  async function test() {
    setTestMsg('测试中…');
    try {
      const password = pass || await loadSecret(dav?.passwordRef ?? '');
      const client = new WebDAVClient({ url, username: user, password });
      const ok = await client.testConnection();
      setTestMsg(ok ? '连接成功' : '连接失败');
    } catch (e) {
      setTestMsg('连接失败：' + (e as Error).message);
    }
  }

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">同步配置</div>
      <div className="section" style={{ marginTop: 16 }}>
        <div className="row"><label>WebDAV URL</label><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://dav.example.com/dav/" /></div>
        <div className="row"><label>用户名</label><input value={user} onChange={e => setUser(e.target.value)} /></div>
        <div className="row"><label>密码</label><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder={dav ? '（保留不变）' : ''} /></div>
        <div className="row"><label>自动同步</label><input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} /></div>
        <div className="row">
          <button onClick={test}>测试连接</button>
          <button onClick={save}>保存</button>
          <button onClick={syncNow}>立即同步</button>
        </div>
        {testMsg && <div className="meta">{testMsg}</div>}
        {lastSync && (
          <div className="meta" style={{ marginTop: 12 }}>
            上次同步：{lastSync.finishedAt} ·
            推送 {lastSync.pushed.length} · 拉取 {lastSync.pulled.length} ·
            合并 {lastSync.merged.length} · 冲突 {lastSync.conflicts.length}
          </div>
        )}
      </div>
    </>
  );
}
