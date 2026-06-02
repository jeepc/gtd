import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaultStore } from '../state/vaultStore.ts';

const isTauri = !!(window as any).__TAURI_INTERNALS__;
const BIN_KEY = 'loop:mcp:binaryPath';

/** Mirror of the Rust `McpHealth` struct (snake_case keys). */
interface McpHealth {
  ok: boolean;
  server_name?: string | null;
  version?: string | null;
  protocol_version?: string | null;
  tool_count: number;
  tools: string[];
}

/**
 * MCP 服务设置页：帮用户把 stdio MCP server 配进客户端并自检二进制是否就绪。
 * 不做「运行状态/启停」——该 server 由 Claude Desktop 等客户端按需 spawn，
 * 空闲时进程并不存在，桌面应用无法监控或托管它的生命周期。
 */
export default function McpServerPage() {
  const navigate = useNavigate();
  const vaultPath = useVaultStore(s => s.appSettings.vaultPath);
  const [binPath, setBinPath] = useState(() => localStorage.getItem(BIN_KEY) ?? '');
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<McpHealth | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function persist(p: string) {
    setBinPath(p);
    localStorage.setItem(BIN_KEY, p);
    setHealth(null);
    setError('');
  }

  const configSnippet = JSON.stringify(
    {
      mcpServers: {
        loop: {
          command: binPath || '/path/to/loop-mcp-server',
          env: { LOOP_VAULT_ROOT: vaultPath || '/path/to/Loop-Vault' },
        },
      },
    },
    null,
    2,
  );

  async function browse() {
    if (!isTauri) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ multiple: false, directory: false });
    if (typeof picked === 'string') persist(picked);
  }

  async function check() {
    setError('');
    setHealth(null);
    if (!isTauri) {
      setError('健康自检需在桌面应用内运行');
      return;
    }
    if (!binPath) {
      setError('请先指定 MCP server 二进制路径');
      return;
    }
    setChecking(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<McpHealth>('mcp_health_check', {
        binaryPath: binPath,
        vaultRoot: vaultPath,
      });
      setHealth(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(configSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 不可用时忽略 */
    }
  }

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">MCP 服务</div>
      <div className="section" style={{ marginTop: 16 }}>
        <div className="meta">
          Loop 的 MCP server 让 Claude Desktop 等客户端读写你的 vault。它是 stdio 进程，
          由客户端按需启动，因此这里不提供运行开关——只用于生成客户端配置并自检二进制是否就绪。
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <label>二进制路径</label>
          <input
            value={binPath}
            onChange={e => persist(e.target.value)}
            placeholder="…/apps/mcp-server/target/release/loop-mcp-server(.exe)"
            style={{ flex: 1 }}
          />
          {isTauri && <button onClick={browse}>浏览</button>}
        </div>
        <div className="row">
          <label>Vault 路径</label>
          <input value={vaultPath} readOnly />
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={check} disabled={checking}>{checking ? '自检中…' : '健康自检'}</button>
          <button onClick={copyConfig}>{copied ? '已复制' : '复制客户端配置'}</button>
        </div>

        {error && (
          <div className="meta" style={{ color: '#b91c1c', marginTop: 8 }}>自检失败：{error}</div>
        )}
        {health && (
          <div className="meta" style={{ marginTop: 8 }}>
            ✓ 协议 {health.protocol_version} · {health.server_name} v{health.version} · 暴露 {health.tool_count} 个工具
            <div style={{ marginTop: 4 }}>{health.tools.join('、')}</div>
          </div>
        )}

        <div className="meta" style={{ marginTop: 16 }}>
          把下面这段加入 Claude Desktop 配置（claude_desktop_config.json）：
        </div>
        <pre
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            marginTop: 8,
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
            fontSize: 12,
          }}
        >
          {configSnippet}
        </pre>
      </div>
    </>
  );
}
