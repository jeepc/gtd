import { useVaultStore, type SyncStatus } from '../state/vaultStore.ts';

/**
 * PRD §4.7.1: a single, always-visible sync indicator at the bottom of the
 * window. Six states, color-coded. Click to trigger a manual sync.
 */
export default function SyncStatusBar() {
  const status = useVaultStore(s => s.syncStatus);
  const detail = useVaultStore(s => s.syncStatusDetail);
  const syncNow = useVaultStore(s => s.syncNow);

  const meta = STATUS_META[status];

  return (
    <div
      className="sync-status-bar"
      role="status"
      onClick={() => status !== 'syncing' && syncNow()}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '4px 12px',
        fontSize: 12,
        color: meta.color,
        background: 'var(--bg)',
        borderTop: '1px solid rgba(127,127,127,0.1)',
        cursor: status === 'syncing' ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      title={detail || meta.label}
    >
      <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: meta.color }} />
      <span>{meta.label}</span>
      {detail && <span style={{ opacity: 0.7 }}>· {detail}</span>}
    </div>
  );
}

const STATUS_META: Record<SyncStatus, { label: string; color: string }> = {
  idle: { label: '已同步', color: '#10b981' },
  syncing: { label: '同步中…', color: '#3b82f6' },
  pull_required: { label: '需要先拉取', color: '#f59e0b' },
  conflict: { label: '存在冲突', color: '#f59e0b' },
  error: { label: '同步失败', color: '#6b7280' },
  disabled: { label: '未启用同步', color: '#6b7280' },
};
