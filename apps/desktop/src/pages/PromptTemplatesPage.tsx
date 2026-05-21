import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaultStore } from '../state/vaultStore.ts';
import { ulid, type PromptTemplate } from '@gtd/core';

export default function PromptTemplatesPage() {
  const navigate = useNavigate();
  const config = useVaultStore(s => s.config);
  const saveConfig = useVaultStore(s => s.saveConfig);
  const [list, setList] = useState<PromptTemplate[]>(config.ai.promptTemplates);

  function add() {
    setList([...list, { id: ulid(), name: '新模板', prompt: '请总结：\n\n{{entries}}' }]);
  }
  function update(i: number, patch: Partial<PromptTemplate>) {
    setList(list.map((t, j) => j === i ? { ...t, ...patch } : t));
  }
  function remove(i: number) {
    setList(list.filter((_, j) => j !== i));
  }
  async function save() {
    await saveConfig({ ...config, ai: { ...config.ai, promptTemplates: list } });
    navigate(-1);
  }

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">Prompt 模板</div>
      {list.map((t, i) => (
        <div key={t.id} className="section" style={{ marginTop: 16 }}>
          <div className="row">
            <input value={t.name} onChange={e => update(i, { name: e.target.value })} />
            {!t.builtin && <button onClick={() => remove(i)}>删除</button>}
            {t.builtin && <span className="meta">预置</span>}
          </div>
          <textarea
            rows={4}
            style={{ width: '100%' }}
            value={t.prompt}
            onChange={e => update(i, { prompt: e.target.value })}
          />
          <div className="meta">使用 <code>{'{{entries}}'}</code> 占位符插入条目</div>
        </div>
      ))}
      <div className="row">
        <button onClick={add}>新建模板</button>
        <button onClick={save}>保存</button>
      </div>
    </>
  );
}
