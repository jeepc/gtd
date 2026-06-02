import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoopLockup } from '../components/Logo.tsx';
import { useVaultStore } from '../state/vaultStore.ts';

export default function AboutPage() {
  const navigate = useNavigate();
  const appSettings = useVaultStore(s => s.appSettings);
  const reloadVault = useVaultStore(s => s.reloadVault);
  const vaultRoot = appSettings.vaultPath || '(未设置)';
  const [exportMsg, setExportMsg] = useState('');
  const [reloadMsg, setReloadMsg] = useState('');

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

  async function onReload() {
    setReloadMsg('重载中…');
    try {
      await reloadVault();
      setReloadMsg('已读取磁盘上的最新内容');
    } catch (e) {
      setReloadMsg('重载失败：' + (e as Error).message);
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
        <div className="meta">数据为本地 Markdown 文件。可用 Obsidian / Logseq 直接打开。</div>
        <div style={{ marginTop: 12 }}>
          <button onClick={onExport}>导出全部数据 (zip)</button>
          {exportMsg && <div className="meta" style={{ marginTop: 6 }}>{exportMsg}</div>}
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={onReload}>重新读取数据</button>
          {reloadMsg && <div className="meta" style={{ marginTop: 6 }}>{reloadMsg}</div>}
          <div className="meta" style={{ marginTop: 6 }}>
            如果你在 Obsidian、文本编辑器等其他应用里直接改了文件，点这里可以重新读取磁盘上的最新内容。
          </div>
        </div>
      </div>
    </>
  );
}
