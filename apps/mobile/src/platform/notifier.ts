import { Platform } from 'react-native';
import notifee, { TriggerType, AndroidImportance, type TimestampTrigger } from '@notifee/react-native';
import { TimerNotifier, type Notifier, type ScheduledReminder } from '@gtd/core';

/**
 * Mobile reminder backend.
 *   iOS / Android → notifee OS-scheduled triggers that survive app close.
 *   HarmonyOS     → no notifee; degrade to an in-app timer (PRD ADR-011).
 *
 * The reminder intent lives in the synced `due` field; the OS notification is
 * keyed by the entry's ULID (a valid notifee id), so no device-local id map is
 * needed — `reconcileReminders` rebuilds the schedule from `due` on each load.
 */
export function createNotifier(): Notifier {
  if ((Platform.OS as string) === 'harmony') {
    // In-app only: fires while the app runs; no durable OS notification.
    return new TimerNotifier(() => {});
  }
  return new NotifeeNotifier();
}

class NotifeeNotifier implements Notifier {
  private channelId: string | null = null;

  private async ensureChannel(): Promise<string> {
    if (this.channelId) return this.channelId;
    await notifee.requestPermission();
    this.channelId = await notifee.createChannel({
      id: 'reminders',
      name: '提醒',
      importance: AndroidImportance.HIGH,
    });
    return this.channelId;
  }

  async schedule(r: ScheduledReminder): Promise<void> {
    const channelId = await this.ensureChannel();
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: new Date(r.fireAt).getTime(),
    };
    // Same id (entry ULID) replaces any existing trigger — idempotent reschedule.
    await notifee.createTriggerNotification(
      { id: r.entryId, title: '提醒', body: r.title, android: { channelId } },
      trigger,
    );
  }

  async cancel(entryId: string): Promise<void> {
    await notifee.cancelTriggerNotification(entryId);
  }

  async listScheduled(): Promise<string[]> {
    return notifee.getTriggerNotificationIds();
  }
}
