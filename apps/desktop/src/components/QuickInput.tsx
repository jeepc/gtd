import { useState } from 'react';
import { matchSlashCommands, previewCapture, describeDue } from '@gtd/core';
import { useVaultStore } from '../state/vaultStore.ts';

export default function QuickInput() {
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const create = useVaultStore(s => s.create);

  // matchSlashCommands returns the matching commands while the input is still
  // just the command token (leading "/" + word chars, no space), else null.
  const matches = matchSlashCommands(value) ?? [];
  const menuOpen = !dismissed && matches.length > 0;
  const sel = Math.min(selected, matches.length - 1);

  const accept = (cmd: string) => {
    setValue(cmd + ' ');
    setSelected(0);
  };

  const submit = () => {
    if (!value.trim()) return;
    create(value).then(() => setValue('')).catch(() => { /* 错误已通过 banner 提示，保留输入内容 */ });
  };

  return (
    <div className="quick-input-wrap">
      {menuOpen && (
        <ul className="cmd-menu" role="listbox">
          {matches.map((c, i) => (
            <li
              key={c.cmd}
              role="option"
              aria-selected={i === sel}
              className={'cmd-item' + (i === sel ? ' selected' : '')}
              onMouseDown={e => { e.preventDefault(); accept(c.cmd); }}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="cmd-name">{c.cmd}</span>
              <span className="cmd-desc">{c.desc}</span>
            </li>
          ))}
        </ul>
      )}
      <input
        id="quick-input"
        className="quick-input"
        placeholder="写一条 todo，或 / 选命令；#due:0525@9:00 设提醒"
        value={value}
        autoComplete="off"
        onChange={e => { setValue(e.target.value); setSelected(0); setDismissed(false); }}
        onKeyDown={e => {
          if (menuOpen) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => (s + 1) % matches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => (s - 1 + matches.length) % matches.length); return; }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); const chosen = matches[sel]; if (chosen) accept(chosen.cmd); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(true); return; }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        autoFocus
      />
      {!menuOpen && <CapturePreview value={value} />}
    </div>
  );
}

// Live preview of what the input will become — makes the inline `#due:` / `#!!`
// syntax discoverable and confirms a reminder was set before pressing Enter.
function CapturePreview({ value }: { value: string }) {
  if (!value.trim()) return null;
  const p = previewCapture(value);
  const due = typeof p.fields.due === 'string' ? describeDue(p.fields.due) : null;
  const chips: { key: string; label: string }[] = [];
  if (p.status !== 'todo') chips.push({ key: 'st', label: p.status === 'log' ? '日志' : '已完成' });
  if (due) chips.push({ key: 'due', label: `⏰ ${due.label}` });
  if (typeof p.fields.priority === 'number') chips.push({ key: 'pri', label: `P${p.fields.priority}` });
  for (const t of p.tags) chips.push({ key: `t:${t}`, label: `#${t}` });
  if (!chips.length) return null;
  return (
    <div className="parse-preview" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, fontSize: 12, opacity: 0.85 }}>
      {chips.map(c => (
        <span key={c.key} style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(127,127,127,0.15)' }}>{c.label}</span>
      ))}
    </div>
  );
}
