import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { userFields } from '@loop/core';
import { useVaultStore } from '../state/vaultStore.ts';

export default function EntryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const entry = useVaultStore(s => s.entries.find(e => e.id === id));
  const update = useVaultStore(s => s.update);
  const remove = useVaultStore(s => s.remove);
  const setProperty = useVaultStore(s => s.setProperty);
  const [content, setContent] = useState(entry?.content ?? '');
  const [due, setDue] = useState(formatDueInput(entry?.metadata.due));
  const [showMeta, setShowMeta] = useState(false);

  useEffect(() => {
    if (entry) {
      setContent(entry.content);
      setDue(formatDueInput(entry.metadata.due));
    }
  }, [entry?.id]);

  if (!entry) return <div className="empty">未找到条目</div>;

  const userMeta = userFields(entry.metadata);
  const saveDue = async () => {
    const parsed = parseDueInput(due);
    if (parsed.ok) {
      await setProperty(entry.id, 'due', parsed.value);
    } else {
      alert(parsed.message);
    }
  };

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <textarea
        value={content}
        rows={6}
        onChange={e => setContent(e.target.value)}
        style={{ width: '100%' }}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={async () => { await update(entry.id, { content }); navigate(-1); }}>保存</button>
        <button onClick={async () => { if (confirm('确定删除？')) { await remove(entry.id); navigate(-1); } }}>删除</button>
      </div>
      {entry.status === 'todo' && (
        <div className="section">
          <div className="row">
            <label>截止时间</label>
            <input
              value={due}
              onChange={e => setDue(e.target.value)}
              placeholder="2026-05-25 或 2026-05-25T18:30"
            />
            <button onClick={saveDue}>保存 due</button>
            <button onClick={async () => { setDue(''); await setProperty(entry.id, 'due', null); }}>清除</button>
          </div>
          <div className="meta">只填日期时按本地当天 23:59 提醒。</div>
          <div className="row" style={{ marginTop: 8 }}>
            <label>优先级</label>
            <select
              value={typeof entry.metadata.priority === 'number' ? entry.metadata.priority : ''}
              onChange={async e => {
                const v = e.target.value;
                await setProperty(entry.id, 'priority', v === '' ? null : Number(v));
              }}
            >
              <option value="">无</option>
              <option value="1">P1（最高）</option>
              <option value="2">P2</option>
              <option value="3">P3</option>
            </select>
          </div>
        </div>
      )}
      <div className="section">
        <div>状态：{entry.status}</div>
        <div>日期：{entry.date}</div>
        {entry.metadata.done && <div>完成时间：{entry.metadata.done}</div>}
        {entry.metadata.log && <div>记录时间：{entry.metadata.log}</div>}
        <div>更新时间：{entry.metadata.updated}</div>
        <div>标签：{entry.tags.map(t => <span key={t} className="tag" onClick={() => navigate(`/tag/${encodeURIComponent(t)}`)}>#{t}</span>)}</div>
        {Object.keys(userMeta).length > 0 && (
          <div style={{ marginTop: 8 }}>
            {Object.entries(userMeta).map(([k, v]) => (
              <div key={k} className="meta">{k}：{String(v)}</div>
            ))}
          </div>
        )}
        <div>
          <span className="link" onClick={() => setShowMeta(s => !s)}>{showMeta ? '隐藏' : '显示'} 元数据</span>
          {showMeta && <pre>{JSON.stringify(visibleMeta(entry.metadata), null, 2)}</pre>}
        </div>
      </div>
    </>
  );
}

function formatDueInput(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseDueInput(value: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T23:59:00`);
    if (Number.isNaN(d.getTime())) return { ok: false, message: '截止日期无效' };
    return { ok: true, value: d.toISOString() };
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}:00`);
    if (Number.isNaN(d.getTime())) return { ok: false, message: '截止时间无效' };
    return { ok: true, value: d.toISOString() };
  }
  return { ok: false, message: '请使用 2026-05-25 或 2026-05-25T18:30 格式' };
}

// Hide `_`-prefixed system fields from the metadata view (PRD §6.7.2 / §4.2).
function visibleMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) if (!k.startsWith('_')) out[k] = v;
  return out;
}
