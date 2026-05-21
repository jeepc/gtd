import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import EntryList from '../components/EntryList.tsx';
import AskAI from '../components/AskAI.tsx';
import { useVaultStore } from '../state/vaultStore.ts';

type Filter = 'all' | 'todo' | 'done';

export default function TagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const entries = useVaultStore(s => s.entries);
  const [filter, setFilter] = useState<Filter>('all');

  const tagName = decodeURIComponent(tag || '');
  const filtered = entries.filter(e => {
    if (!e.tags.includes(tagName)) return false;
    if (filter === 'todo') return e.status === 'todo';
    if (filter === 'done') return e.status === 'done';
    return true;
  });

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">#{tagName} <span className="meta">{filtered.length} 条</span></div>
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={() => setFilter('all')} disabled={filter === 'all'}>全部</button>
        <button onClick={() => setFilter('todo')} disabled={filter === 'todo'}>仅未完成</button>
        <button onClick={() => setFilter('done')} disabled={filter === 'done'}>仅已完成</button>
      </div>
      <AskAI entries={filtered} />
      <EntryList entries={filtered} />
    </>
  );
}
