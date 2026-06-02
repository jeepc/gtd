import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoopLockup } from '../components/Logo.tsx';
import { useVaultStore, saveSecret, refFor } from '../state/vaultStore.ts';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

type Mode = 'menu' | 'webdav';

/**
 * PRD §3.3 first-launch flow. Three options:
 *   1. Create a new empty vault under a chosen parent directory
 *   2. Open an existing vault directory (e.g. one already used by Obsidian)
 *   3. Restore from a WebDAV remote into a local directory
 *
 * No bottom menu; cards stack vertically on the welcome page.
 */
export default function WelcomeScreen() {
  const navigate = useNavigate();
  const initVault = useVaultStore(s => s.initVault);
  const appSettings = useVaultStore(s => s.appSettings);
  const saveAppSettings = useVaultStore(s => s.saveAppSettings);
  const syncNow = useVaultStore(s => s.syncNow);
  const [mode, setMode] = useState<Mode>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pickDirectory(): Promise<string | null> {
    if (!isTauri) {
      const fake = prompt('（浏览器预览模式）输入 vault 路径：') ?? '';
      return fake || null;
    }
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false });
    return typeof picked === 'string' ? picked : null;
  }

  async function createNew() {
    setError(''); setBusy(true);
    try {
      const parent = await pickDirectory();
      if (!parent) return;
      const name = prompt('vault 文件夹名称', 'Loop-Vault') ?? '';
      if (!name) return;
      const sep = parent.includes('\\') ? '\\' : '/';
      const path = parent.endsWith(sep) ? parent + name : `${parent}${sep}${name}`;
      if (isTauri) {
        const { mkdir } = await import('@tauri-apps/plugin-fs');
        await mkdir(path, { recursive: true });
      }
      await initVault(path);
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openExisting() {
    setError(''); setBusy(true);
    try {
      const path = await pickDirectory();
      if (!path) return;
      await initVault(path);
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'webdav') {
    return (
      <WebDAVPull
        onBack={() => setMode('menu')}
        onDone={async (path, webdav, password) => {
          setError(''); setBusy(true);
          try {
            if (isTauri) {
              const { mkdir } = await import('@tauri-apps/plugin-fs');
              await mkdir(path, { recursive: true });
            }
            const passwordRef = refFor('webdav');
            await saveSecret(passwordRef, password);
            await saveAppSettings({
              ...appSettings,
              vaultPath: path,
              sync: {
                ...appSettings.sync,
                webdav: { url: webdav.url, username: webdav.username, passwordRef },
              },
            });
            await initVault(path);
            await syncNow();
            navigate('/', { replace: true });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <LoopLockup height={48} />
      </div>
      <div className="meta" style={{ textAlign: 'center', marginBottom: 24 }}>
        欢迎使用 Loop。先选择数据从哪里来。
      </div>
      <Card
        title="创建新 vault"
        desc="选一个父目录，新建空 vault。适合第一次使用。"
        disabled={busy}
        onClick={createNew}
      />
      <Card
        title="打开已有 vault"
        desc="已经在 Obsidian / Logseq 用过的目录，可以直接打开。"
        disabled={busy}
        onClick={openExisting}
      />
      <Card
        title="从 WebDAV 拉取"
        desc="另一台设备已经同步到 WebDAV，本机首次安装时把数据拉下来。"
        disabled={busy}
        onClick={() => setMode('webdav')}
      />
      {error && <div className="meta" style={{ color: '#dc2626', marginTop: 12 }}>{error}</div>}
    </div>
  );
}

function Card({ title, desc, onClick, disabled }: { title: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '16px 20px',
        marginBottom: 12,
        border: '1px solid var(--border, rgba(127,127,127,0.3))',
        borderRadius: 8,
        background: 'transparent',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div className="meta">{desc}</div>
    </button>
  );
}

function WebDAVPull({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: (path: string, webdav: { url: string; username: string }, password: string) => void;
}) {
  const [url, setUrl] = useState('https://dav.jianguoyun.com/dav/');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [path, setPath] = useState('');

  async function pickPath() {
    if (!isTauri) { setPath(prompt('vault 路径') ?? ''); return; }
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') setPath(picked);
  }

  const ready = url && user && pass && path;

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: 24 }}>
      <span className="back-link" onClick={onBack}>← 返回</span>
      <div className="title" style={{ marginTop: 8 }}>从 WebDAV 拉取</div>
      <div className="section" style={{ marginTop: 16 }}>
        <div className="row"><label>WebDAV URL</label><input value={url} onChange={e => setUrl(e.target.value)} /></div>
        <div className="row"><label>用户名</label><input value={user} onChange={e => setUser(e.target.value)} /></div>
        <div className="row"><label>密码</label><input type="password" value={pass} onChange={e => setPass(e.target.value)} /></div>
        <div className="row">
          <label>本地保存目录</label>
          <input value={path} readOnly placeholder="点右侧选择…" />
          <button onClick={pickPath}>选择目录</button>
        </div>
        <div className="row">
          <button disabled={!ready} onClick={() => ready && onDone(path, { url, username: user }, pass)}>开始拉取</button>
        </div>
        <div className="meta" style={{ marginTop: 12 }}>
          密码会保存到系统密钥库，不写入任何配置文件。
        </div>
      </div>
    </div>
  );
}
