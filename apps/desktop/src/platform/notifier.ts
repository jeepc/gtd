import { TimerNotifier, NoopNotifier, type Notifier, type ScheduledReminder } from '@gtd/core';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

/**
 * Desktop reminder backend. Reminders fire while the app/tray is running via an
 * in-process timer that triggers a native OS notification (PRD ADR-011: desktop
 * scope is "while-running"; durable scheduling across full quit is deferred).
 * In the browser-dev fallback there is no Tauri bridge, so reminders are no-op.
 */
export function createNotifier(): Notifier {
  if (!isTauri) return new NoopNotifier();
  return new TimerNotifier((r: ScheduledReminder) => {
    void fireNotification(r);
  });
}

async function fireNotification(r: ScheduledReminder): Promise<void> {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title: '提醒', body: r.title });
  } catch {
    /* notifications unavailable — best-effort */
  }
}
