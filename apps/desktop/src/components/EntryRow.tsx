import { useNavigate } from 'react-router-dom';
import { describeDue, type Entry } from '@loop/core';

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
  const isOngoing = entry.status === 'ongoing';
  const due = typeof entry.metadata.due === 'string' && entry.status === 'todo'
    ? describeDue(entry.metadata.due)
    : null;
  const priority = entry.status === 'todo' && typeof entry.metadata.priority === 'number'
    && entry.metadata.priority >= 1 && entry.metadata.priority <= 3
    ? entry.metadata.priority
    : null;

  return (
    <li
      className={`entry ${isDone ? 'done' : ''} ${focused ? 'focused' : ''}`}
      data-entry-id={entry.id}
      onContextMenu={e => {
        e.preventDefault();
        if (confirm('删除此条目？')) onDelete(entry.id);
      }}
    >
      {!isLog && !isOngoing && (
        <button
          type="button"
          className="entry-check"
          role="checkbox"
          aria-checked={isDone}
          onClick={() => onToggle(entry.id, !isDone)}
        >
          {isDone ? '☑' : '☐'}
        </button>
      )}
      {isLog && <span style={{ width: 16 }}>•</span>}
      {/* ongoing (PRD §4.9.1): persistent, never checked off — a loop glyph, not a checkbox. */}
      {isOngoing && <span className="entry-ongoing" title="持续进行中" aria-label="持续进行中" style={{ width: 16, color: 'var(--accent, #f97316)' }}>↻</span>}
      <span className="content" onClick={() => navigate(`/entry/${entry.id}`)}>
        {priority && (
          <span
            className={`priority-badge p${priority} clickable`}
            title={`优先级 P${priority}（点击筛选）`}
            onClick={e => { e.stopPropagation(); navigate(`/priority/${priority}`); }}
          >
            {'!'.repeat(priority)}
          </span>
        )}
        {renderContent(entry.content, navigate)}
        {due && <span className={`due-badge ${due.overdue ? 'overdue' : ''}`}>{due.label}</span>}
      </span>
      <span className="meta">{formatTime(entry)}</span>
    </li>
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
