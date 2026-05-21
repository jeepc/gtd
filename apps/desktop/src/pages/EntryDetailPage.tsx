import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useVaultStore } from '../state/vaultStore.ts';

export default function EntryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const entry = useVaultStore(s => s.entries.find(e => e.id === id));
  const update = useVaultStore(s => s.update);
  const remove = useVaultStore(s => s.remove);
  const setProperty = useVaultStore(s => s.setProperty);
  const [content, setContent] = useState(entry?.content ?? '');
  const [showMeta, setShowMeta] = useState(false);

  useEffect(() => { if (entry) setContent(entry.content); }, [entry?.id]);

  if (!entry) return <div className="empty">未找到条目</div>;

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
        <div className="row" style={{ marginTop: 12, gap: 8, alignItems: 'center' }}>
          <label>截止时间（设置后将提醒）：</label>
          <input
            type="datetime-local"
            value={dueInputValue(entry.metadata.due)}
            onChange={e => setProperty(entry.id, 'due', e.target.value || null)}
          />
          {typeof entry.metadata.due === 'string' && (
            <button onClick={() => setProperty(entry.id, 'due', null)}>清除</button>
          )}
        </div>
      )}
      <div className="section">
        <div>状态：{entry.status}</div>
        <div>日期：{entry.date}</div>
        {entry.metadata.done && <div>完成时间：{entry.metadata.done}</div>}
        {entry.metadata.log && <div>记录时间：{entry.metadata.log}</div>}
        <div>更新时间：{entry.metadata.updated}</div>
        <div>标签：{entry.tags.map(t => <span key={t} className="tag" onClick={() => navigate(`/tag/${encodeURIComponent(t)}`)}>#{t}</span>)}</div>
        <div>
          <span className="link" onClick={() => setShowMeta(s => !s)}>{showMeta ? '隐藏' : '显示'} 元数据</span>
          {showMeta && <pre>{JSON.stringify(visibleMeta(entry.metadata), null, 2)}</pre>}
        </div>
      </div>
    </>
  );
}

// `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm`. A date-only `due`
// shows at the default morning hour; a stored datetime is sliced to minutes.
function dueInputValue(due: unknown): string {
  if (typeof due !== 'string' || !due) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return `${due}T09:00`;
  return due.slice(0, 16);
}

// Hide `_`-prefixed system fields from the metadata view (PRD §6.7.2 / §4.2).
function visibleMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) if (!k.startsWith('_')) out[k] = v;
  return out;
}
