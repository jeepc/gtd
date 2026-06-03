import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaultStore, saveSecret, loadSecret, refFor } from '../state/vaultStore.ts';
import { WebDAVClient } from '@loop/core';
import { webdavFetch } from '../platform/webdavFetch.ts';

export default function SyncSettingsPage() {
  const navigate = useNavigate();
  const appSettings = useVaultStore(s => s.appSettings);
  const saveAppSettings = useVaultStore(s => s.saveAppSettings);
  const syncNow = useVaultStore(s => s.syncNow);
  const lastSync = useVaultStore(s => s.lastSync);

  const dav = appSettings.sync.webdav;
  const [url, setUrl] = useState(dav?.url ?? '');
  const [user, setUser] = useState(dav?.username ?? '');
  const [pass, setPass] = useState('');
  const [autoSync, setAutoSync] = useState(appSettings.sync.autoSync);
  const [intervalMin, setIntervalMin] = useState(appSettings.sync.intervalMinutes);
  const [syncOnFocus, setSyncOnFocus] = useState(appSettings.sync.syncOnFocus);
  const [syncOnBlur, setSyncOnBlur] = useState(appSettings.sync.syncOnBlur);
  const [testMsg, setTestMsg] = useState('');

  // 改动即时自动保存（无保存按钮）：字段变化后合并当前 state + 覆盖值写盘。
  async function persist(override: Partial<{ url: string; user: string; pass: string; autoSync: boolean; intervalMin: number; syncOnFocus: boolean; syncOnBlur: boolean }> = {}) {
    const v = { url, user, pass, autoSync, intervalMin, syncOnFocus, syncOnBlur, ...override };
    const passwordRef = refFor('webdav');
    if (v.pass) await saveSecret(passwordRef, v.pass);
    await saveAppSettings({
      ...appSettings,
      sync: {
        webdav: v.url ? { url: v.url, username: v.user, passwordRef } : null,
        autoSync: v.autoSync,
        intervalMinutes: Math.max(1, Number(v.intervalMin) || 5),
        syncOnFocus: v.syncOnFocus,
        syncOnBlur: v.syncOnBlur,
      },
    });
  }

  async function test() {
    setTestMsg('测试中…');
    try {
      const password = pass || await loadSecret(dav?.passwordRef ?? refFor('webdav'));
      const client = new WebDAVClient({ url, username: user, password }, webdavFetch);
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
        <div className="row"><label>WebDAV URL</label><input value={url} onChange={e => setUrl(e.target.value)} onBlur={() => persist()} placeholder="https://dav.example.com/dav/" /></div>
        <div className="row"><label>用户名</label><input value={user} onChange={e => setUser(e.target.value)} onBlur={() => persist()} /></div>
        <div className="row"><label>密码</label><input type="password" value={pass} onChange={e => setPass(e.target.value)} onBlur={() => persist()} placeholder={dav ? '（保留不变）' : ''} /></div>
        <div className="row"><label>自动同步</label><input type="checkbox" checked={autoSync} onChange={e => { setAutoSync(e.target.checked); persist({ autoSync: e.target.checked }); }} /></div>
        <div className="row"><label>周期分钟</label><input type="number" min={1} value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value) || 5)} onBlur={() => persist()} /></div>
        <div className="row"><label>窗口获焦时同步</label><input type="checkbox" checked={syncOnFocus} onChange={e => { setSyncOnFocus(e.target.checked); persist({ syncOnFocus: e.target.checked }); }} /></div>
        <div className="row"><label>窗口失焦时同步</label><input type="checkbox" checked={syncOnBlur} onChange={e => { setSyncOnBlur(e.target.checked); persist({ syncOnBlur: e.target.checked }); }} /></div>
        <div className="row">
          <button onClick={test}>测试连接</button>
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
