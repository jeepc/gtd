import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoopLockup } from '../components/Logo.tsx';

export default function AboutPage() {
  const navigate = useNavigate();
  const vaultRoot = localStorage.getItem('gtd:vaultRoot') ?? '(未设置)';
  const [exportMsg, setExportMsg] = useState('');

  async function onExport() {
    setExportMsg('打包中…');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: `gtd-vault-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      });
      if (!path) { setExportMsg(''); return; }
      const count = await invoke<number>('export_vault', { vaultRoot, outputPath: path });
      setExportMsg(`已导出 ${count} 个文件到 ${path}`);
    } catch (e) {
      setExportMsg('导出失败：' + (e as Error).message);
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
          <a className="link" href="https://github.com/" target="_blank">开源仓库</a>
          {' · '}
          <a className="link" href="https://modelcontextprotocol.io" target="_blank">MCP 协议</a>
        </div>
      </div>
    </>
  );
}
