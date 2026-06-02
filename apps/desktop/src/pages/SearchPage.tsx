import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EntryList from '../components/EntryList.tsx';
import { useVaultStore } from '../state/vaultStore.ts';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const search = useVaultStore(s => s.search);
  const trimmed = q.trim();
  const results = trimmed ? search(q) : [];

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <input
        autoFocus
        className="quick-input"
        placeholder="支持 #tag / status:todo / priority:1 / date:>=2026-05-01"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      {!trimmed && (
        <div className="meta" style={{ marginTop: 8 }}>输入关键词或筛选条件开始搜索</div>
      )}
      {trimmed && (
        <>
          <div className="meta" style={{ marginTop: 8 }}>{results.length} 条结果</div>
          {results.length > 0 ? (
            <EntryList entries={results} groupByDate={false} />
          ) : (
            <div className="empty">没有匹配的结果</div>
          )}
        </>
      )}
    </>
  );
}
