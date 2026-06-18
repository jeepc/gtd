import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QuickInput from '../components/QuickInput.tsx';
import EntryList from '../components/EntryList.tsx';
import { LoopLockup } from '../components/Logo.tsx';
import { useVaultStore } from '../state/vaultStore.ts';

export default function HomePage() {
  const navigate = useNavigate();
  const rawEntries = useVaultStore(s => s.entries);
  const banner = useVaultStore(s => s.banner);
  const syncStatus = useVaultStore(s => s.syncStatus);
  const ongoingPinned = useVaultStore(s => s.vaultConfig.ui.ongoing_pinned !== false);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  // PRD §4.9.1: pin `ongoing` entries to the top (toggleable in settings).
  // Drives both render and keyboard nav so j/k order matches what's on screen.
  const entries = useMemo(() => {
    if (!ongoingPinned) return rawEntries;
    return [
      ...rawEntries.filter(e => e.status === 'ongoing'),
      ...rawEntries.filter(e => e.status !== 'ongoing'),
    ];
  }, [rawEntries, ongoingPinned]);

  // PRD §7.2 list keyboard navigation. Bound to Home only; ignores when an
  // input/textarea has focus (so typing in the quick input feels normal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (entries.length === 0) return;
      if (e.key === 'j') {
        e.preventDefault();
        setFocusedIdx(i => Math.min(entries.length - 1, i + 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setFocusedIdx(i => Math.max(0, i - 1));
      } else if (e.key === ' ') {
        if (focusedIdx < 0) return;
        e.preventDefault();
        const cur = entries[focusedIdx];
        // log entries have no checkbox; ongoing is never checked off (§4.9.1).
        if (cur && cur.status !== 'log' && cur.status !== 'ongoing') {
          useVaultStore.getState().toggleDone(cur.id, cur.status !== 'done');
        }
      } else if (e.key === 'Enter') {
        if (focusedIdx < 0) return;
        e.preventDefault();
        const cur = entries[focusedIdx];
        if (cur) navigate(`/entry/${cur.id}`);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (focusedIdx < 0) return;
        e.preventDefault();
        const cur = entries[focusedIdx];
        if (cur && confirm('删除此条目？')) {
          useVaultStore.getState().remove(cur.id);
          setFocusedIdx(i => Math.max(0, Math.min(i, entries.length - 2)));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entries, focusedIdx, navigate]);

  const focusedId = focusedIdx >= 0 ? entries[focusedIdx]?.id ?? null : null;

  return (
    <>
      <div className="top-bar">
        <div className="title" aria-label="Loop"><LoopLockup height={28} /></div>
        <div className="spacer" />
        <span className="meta">{syncStatus === 'syncing' ? '同步中…' : ''}</span>
        <button onClick={() => navigate('/search')}>搜索</button>
        <button onClick={() => navigate('/settings')}>⋯</button>
      </div>
      {banner && <div className="banner">{banner}</div>}
      <QuickInput />
      <EntryList entries={entries} focusedId={focusedId} />
    </>
  );
}
