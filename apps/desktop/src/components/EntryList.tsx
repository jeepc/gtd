import type { Entry } from '@gtd/core';
import { useVaultStore } from '../state/vaultStore.ts';
import EntryRow from './EntryRow.tsx';

interface Props {
  entries: Entry[];
  groupByDate?: boolean;
  focusedId?: string | null;
}

export default function EntryList({ entries, groupByDate = true, focusedId = null }: Props) {
  const toggle = useVaultStore(s => s.toggleDone);
  const remove = useVaultStore(s => s.remove);

  if (entries.length === 0) {
    return <div className="empty">写下你的第一件事</div>;
  }

  if (!groupByDate) {
    return (
      <ul className="entry-list">
        {entries.map(e => <EntryRow key={e.id} entry={e} focused={e.id === focusedId} onToggle={toggle} onDelete={remove} />)}
      </ul>
    );
  }

  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const arr = groups.get(e.date) ?? [];
    arr.push(e);
    groups.set(e.date, arr);
  }

  return (
    <>
      {[...groups.entries()].map(([date, items]) => (
        <section key={date}>
          <div className="day-header">{formatDayHeader(date)}</div>
          <ul className="entry-list">
            {items.map(e => <EntryRow key={e.id} entry={e} focused={e.id === focusedId} onToggle={toggle} onDelete={remove} />)}
          </ul>
        </section>
      ))}
    </>
  );
}

function formatDayHeader(date: string): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const yest = new Date(today.getTime() - 86_400_000);
  const ys = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
  if (date === todayStr) return '今天';
  if (date === ys) return '昨天';
  const dt = new Date(date + 'T00:00:00');
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
  return `${date} ${weekday}`;
}
