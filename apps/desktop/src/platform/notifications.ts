import { TimerNotifier, type ScheduledReminder } from '@loop/core';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

export function createDesktopNotifier(): TimerNotifier {
  return new TimerNotifier(reminder => {
    void fireNativeNotification(reminder);
  });
}

async function fireNativeNotification(reminder: ScheduledReminder): Promise<void> {
  if (!isTauri) {
    if ('Notification' in window) {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission === 'granted') new Notification('Loop', { body: reminder.title });
    }
    return;
  }

  const {
    isPermissionGranted,
    requestPermission,
    sendNotification,
  } = await import('@tauri-apps/plugin-notification');

  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === 'granted';
  }
  if (!permissionGranted) return;

  sendNotification({
    title: 'Loop',
    body: reminder.title,
  });
}
