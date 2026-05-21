import { useNavigate } from 'react-router-dom';
import { type Entry, describeDue } from '@gtd/core';

interface Props {
  entry: Entry;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  focused?: boolean;
}

export default function EntryRow({ entry, onToggle, onDelete, focused }: Props) {
  const navigate = useNavigate();
  const isDone = entry.status === 'done';
  const isLog = entry.status === 'log';

  return (
    <li
      className={`entry ${isDone ? 'done' : ''} ${focused ? 'focused' : ''}`}
      data-entry-id={entry.id}
      onContextMenu={e => {
        e.preventDefault();
        if (confirm('删除此条目？')) onDelete(entry.id);
      }}
    >
      {!isLog && (
        <input
          type="checkbox"
          checked={isDone}
          onChange={ev => onToggle(entry.id, ev.target.checked)}
        />
      )}
      {isLog && <span style={{ width: 16 }}>•</span>}
      <span className="content" onClick={() => navigate(`/entry/${entry.id}`)}>
        {renderContent(entry.content, navigate)}
      </span>
      {dueBadge(entry)}
      <span className="meta">{formatTime(entry)}</span>
    </li>
  );
}

function dueBadge(entry: Entry) {
  if (entry.status === 'done') return null;
  const due = entry.metadata.due;
  if (typeof due !== 'string') return null;
  const d = describeDue(due);
  if (!d) return null;
  return (
    <span
      className="due-badge"
      style={{ fontSize: 12, marginLeft: 8, color: d.overdue ? '#dc2626' : 'inherit', opacity: d.overdue ? 1 : 0.7 }}
    >
      ⏰ {d.label}
    </span>
  );
}

function renderContent(text: string, navigate: (p: string) => void) {
  const parts = text.split(/(\s|^)(#[^\s#]+)/g);
  return parts.map((p, i) => {
    if (/^#/.test(p)) {
      const tag = p.slice(1);
      if (/^\d+$/.test(tag)) return p;
      return (
        <span key={i} className="tag" onClick={e => { e.stopPropagation(); navigate(`/tag/${encodeURIComponent(tag)}`); }}>
          #{tag}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function formatTime(entry: Entry): string {
  const ts = entry.metadata.done || entry.metadata.log || entry.metadata.updated;
  if (!ts) return '';
  const d = new Date(ts);
  const diffMin = (Date.now() - d.getTime()) / 60_000;
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${Math.floor(diffMin)} 分钟前`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} 小时前`;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
