import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EntryList from '../components/EntryList.tsx';
import AskAI from '../components/AskAI.tsx';
import { useVaultStore } from '../state/vaultStore.ts';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const search = useVaultStore(s => s.search);
  const results = q.trim() ? search(q) : [];

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <input
        autoFocus
        className="quick-input"
        placeholder="支持 #tag / status:todo / date:>=2026-05-01"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <div className="meta" style={{ marginTop: 8 }}>{q.trim() && `${results.length} 条结果`}</div>
      <AskAI entries={results} />
      <EntryList entries={results} groupByDate={false} />
    </>
  );
}
