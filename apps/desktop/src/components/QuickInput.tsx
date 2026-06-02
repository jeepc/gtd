import { useMemo, useRef, useState } from 'react';
import { matchSlashCommands, parseCapture, describeDue, extractTags } from '@loop/core';
import { useVaultStore } from '../state/vaultStore.ts';

/** Quick-insert symbols for the input-assist toolbar (database-design §4.3). */
const TOOLBAR_SYMBOLS = [
  { ch: '/', title: '命令' },
  { ch: '#', title: '标签' },
  { ch: '@', title: '截止时间' },
  { ch: '!', title: '优先级' },
];

export default function QuickInput() {
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const create = useVaultStore(s => s.create);
  const showToolbar = useVaultStore(s => s.appSettings.ui?.showInputToolbar ?? true);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = matchSlashCommands(value) ?? [];
  const menuOpen = !dismissed && matches.length > 0;
  const sel = Math.min(selected, matches.length - 1);

  // Live, offline preview of what the Level 2 capture syntax will extract, so
  // typing `@明天`/`!!` gives immediate feedback before the entry is created.
  const preview = useMemo(() => {
    if (!value.trim()) return null;
    const { metadata } = parseCapture(value);
    const due = typeof metadata.due === 'string' ? metadata.due : undefined;
    const priority = typeof metadata.priority === 'number' ? metadata.priority : undefined;
    const tags = extractTags(value);
    if (due === undefined && priority === undefined && tags.length === 0) return null;
    return { due, dueDesc: due ? describeDue(due) : null, priority, tags };
  }, [value]);

  const accept = (cmd: string) => {
    setValue(cmd + ' ');
    setSelected(0);
  };

  // Insert a symbol at the caret (or replace the selection), then refocus.
  const insert = (ch: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    setValue(next);
    setDismissed(false);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + ch.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    if (!value.trim()) return;
    create(value).then(() => setValue('')).catch(() => { /* 错误已通过 banner 提示，保留输入内容 */ });
  };

  return (
    <div className="quick-input-wrap">
      {showToolbar && (
        <div className="input-toolbar" role="toolbar" aria-label="输入辅助">
          {TOOLBAR_SYMBOLS.map(s => (
            <button
              key={s.ch}
              type="button"
              className="input-toolbar-btn"
              title={s.title}
              onMouseDown={e => { e.preventDefault(); insert(s.ch); }}
            >
              {s.ch}
            </button>
          ))}
        </div>
      )}
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
        ref={inputRef}
        id="quick-input"
        className="quick-input"
        placeholder="写一条 todo，或 / 选命令；# 加标签"
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
      {!menuOpen && preview && (
        <div className="capture-preview" aria-live="polite">
          <span className="capture-preview-label">识别到</span>
          {preview.tags.map(t => (
            <span key={t} className="tag">#{t}</span>
          ))}
          {preview.due !== undefined && (
            preview.dueDesc
              ? (
                <span className={`due-badge ${preview.dueDesc.overdue ? 'overdue' : ''}`}>
                  截止 {preview.dueDesc.label}
                </span>
              )
              : <span className="capture-preview-raw">截止「{preview.due}」未能识别为时间</span>
          )}
          {preview.priority !== undefined && (
            <span className={`priority-badge p${preview.priority}`} title={`优先级 P${preview.priority}`}>
              {'!'.repeat(preview.priority)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
