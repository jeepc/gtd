import notifee, {
  AndroidImportance,
  TriggerType,
  type TimestampTrigger,
} from '@notifee/react-native';
import type { Notifier, ScheduledReminder } from '@loop/core';

/**
 * 移动端提醒后端（对应 desktop 的 createDesktopNotifier）。
 *
 * 与 desktop 的进程内 `TimerNotifier` 不同，这里用 notifee 的 OS 级定时通知
 * （trigger notification），App 退到后台甚至被杀也能按时弹出。`reconcileReminders`
 * 只依赖 `Notifier` 三个方法（reminders.ts），而它们与 notifee 的 trigger API
 * 恰好一一对应：
 *   - schedule → createTriggerNotification（id = entryId，天然幂等替换）
 *   - cancel   → cancelTriggerNotification
 *   - listScheduled → getTriggerNotificationIds
 */

const CHANNEL_ID = 'reminders';

class NotifeeNotifier implements Notifier {
  private channelReady: Promise<string> | null = null;
  private permissionAsked = false;

  /** 懒创建 Android 渠道并请求一次权限（iOS / Android 13+）。 */
  private async ensureReady(): Promise<string> {
    if (!this.permissionAsked) {
      this.permissionAsked = true;
      await notifee.requestPermission();
    }
    if (!this.channelReady) {
      this.channelReady = notifee.createChannel({
        id: CHANNEL_ID,
        name: '提醒',
        importance: AndroidImportance.HIGH,
      });
    }
    return this.channelReady;
  }

  async schedule(reminder: ScheduledReminder): Promise<void> {
    const channelId = await this.ensureReady();
    const timestamp = new Date(reminder.fireAt).getTime();
    if (Number.isNaN(timestamp) || timestamp <= Date.now()) return; // 过期的不排（plan 已排除，防御性）。
    const trigger: TimestampTrigger = { type: TriggerType.TIMESTAMP, timestamp };
    await notifee.createTriggerNotification(
      {
        id: reminder.entryId, // 同 id 再次创建会替换，满足幂等重排。
        title: 'Loop',
        body: reminder.title,
        android: { channelId, pressAction: { id: 'default' } },
      },
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

export function createMobileNotifier(): Notifier {
  return new NotifeeNotifier();
}
