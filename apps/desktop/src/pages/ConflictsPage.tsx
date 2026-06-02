import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaultStore } from '../state/vaultStore.ts';
import type { Entry } from '@loop/core';

interface Pair {
  local: Entry;
  remote: Entry | null;
}

export default function ConflictsPage() {
  const navigate = useNavigate();
  const vault = useVaultStore(s => s.vault);
  const resolveConflict = useVaultStore(s => s.resolveConflict);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!vault) return;
    setLoading(true);
    const local = await vault.listConflicts();
    const merged = await Promise.all(local.map(async l => ({
      local: l,
      remote: await vault.findArchivedRemote(l.id),
    })));
    setPairs(merged);
    setLoading(false);
  }

  useEffect(() => { load(); }, [vault]);

  async function pick(id: string, choice: 'local' | 'remote' | 'both') {
    await resolveConflict(id, choice);
    await load();
  }

  if (loading) return <div className="empty">加载中…</div>;

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">冲突解决 <span className="meta">{pairs.length} 条</span></div>
      {pairs.length === 0 && <div className="empty">没有冲突</div>}
      {pairs.map(({ local, remote }) => (
        <div key={local.id} className="section" style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="meta">{local.date} · 状态 {local.status}</div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="meta">本地</div>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{local.content}</pre>
            </div>
            <div style={{ flex: 1 }}>
              <div className="meta">远端</div>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{remote?.content ?? '(找不到归档)'}</pre>
            </div>
          </div>
          <div className="row">
            <button onClick={() => pick(local.id, 'local')}>接受本地</button>
            <button disabled={!remote} onClick={() => pick(local.id, 'remote')}>接受远端</button>
            <button disabled={!remote} onClick={() => pick(local.id, 'both')}>都保留</button>
          </div>
        </div>
      ))}
    </>
  );
}
