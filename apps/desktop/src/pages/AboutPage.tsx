import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoopLockup } from '../components/Logo.tsx';
import { useVaultStore } from '../state/vaultStore.ts';

export default function AboutPage() {
  const navigate = useNavigate();
  const appSettings = useVaultStore(s => s.appSettings);
  const rebuildDatabase = useVaultStore(s => s.rebuildDatabase);
  const vaultRoot = appSettings.vaultPath || '(未设置)';
  const [exportMsg, setExportMsg] = useState('');
  const [rebuildMsg, setRebuildMsg] = useState('');

  async function onExport() {
    setExportMsg('打包中…');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: `loop-vault-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      });
      if (!path) { setExportMsg(''); return; }
      const count = await invoke<number>('export_vault', { vaultRoot, outputPath: path });
      setExportMsg(`已导出 ${count} 个文件到 ${path}`);
    } catch (e) {
      setExportMsg('导出失败：' + (e as Error).message);
    }
  }

  async function onRebuild() {
    if (!confirm('重建本地数据库？将删除 data.db 并从操作日志（ops/）完整回放重建，不会丢失数据。')) return;
    setRebuildMsg('重建中…');
    try {
      await rebuildDatabase();
      setRebuildMsg('已从操作日志重建本地数据库');
    } catch (e) {
      setRebuildMsg('重建失败：' + (e as Error).message);
    }
  }

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div style={{ marginTop: 8, marginBottom: 4 }}><LoopLockup height={36} /></div>
      <div className="meta" style={{ marginBottom: 16 }}>一个未闭合的圆，等着一个橙点把它合上。</div>
      <div className="section">
        <div>版本：0.1.0</div>
        <div>数据目录：<code>{vaultRoot}</code></div>
        <div className="meta">数据存于本地 SQLite（data.db）+ 追加式操作日志（ops/）。data.db 可随时从日志重建。</div>
        <div style={{ marginTop: 12 }}>
          <button onClick={onExport}>导出全部数据 (zip)</button>
          {exportMsg && <div className="meta" style={{ marginTop: 6 }}>{exportMsg}</div>}
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={onRebuild}>重建本地数据库</button>
          {rebuildMsg && <div className="meta" style={{ marginTop: 6 }}>{rebuildMsg}</div>}
          <div className="meta" style={{ marginTop: 6 }}>
            本地数据库（data.db）只是操作日志的缓存。如果它损坏或与日志不一致，点这里删除并从 ops/ 完整回放重建（也可用 Ctrl/Cmd+R）。
          </div>
        </div>
      </div>
    </>
  );
}
