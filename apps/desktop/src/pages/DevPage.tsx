import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Notifier } from '@gtd/core';
import { createNotifier } from '../platform/notifier.ts';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

/**
 * Developer-only scratch page (dev builds only — gated by import.meta.env.DEV in
 * main.tsx / SettingsPage). A place to exercise system behaviours by hand. More
 * test tools will be added here over time.
 */
export default function DevPage() {
  const navigate = useNavigate();
  // Reuse the real platform notifier so the test exercises the production path
  // (TimerNotifier → native OS notification), not a parallel reimplementation.
  const notifierRef = useRef<Notifier | null>(null);
  const [reminderMsg, setReminderMsg] = useState('');

  async function sendTestReminder() {
    try {
      // Ensure permission up front. The system fire path requests it lazily at
      // fire time, which can drop the first notification behind the OS prompt —
      // request here so the very first click reliably shows something.
      if (isTauri) {
        const { isPermissionGranted, requestPermission } = await import(
          '@tauri-apps/plugin-notification'
        );
        let granted = await isPermissionGranted();
        if (!granted) granted = (await requestPermission()) === 'granted';
        if (!granted) {
          setReminderMsg('未获得通知权限，请在「系统设置 › 通知」中允许本应用。');
          return;
        }
      }
      const notifier = (notifierRef.current ??= createNotifier());
      // fireAt must be in the future: TimerNotifier ignores past/now (delay <= 0).
      await notifier.schedule({
        entryId: `dev-test-${Date.now()}`,
        fireAt: new Date(Date.now() + 1000).toISOString(),
        title: `测试提醒 · ${new Date().toLocaleTimeString()}`,
      });
      setReminderMsg('已安排，约 1 秒后弹出…');
    } catch (e) {
      setReminderMsg('发送失败：' + (e as Error).message);
    }
  }

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">开发测试</div>

      <div className="section" style={{ marginTop: 16 }}>
        <h2>提醒</h2>
        <button onClick={sendTestReminder}>立即发送测试提醒</button>
        {reminderMsg && <div className="meta" style={{ marginTop: 6 }}>{reminderMsg}</div>}
        {!isTauri && (
          <div className="meta" style={{ marginTop: 6 }}>
            当前为浏览器预览（非 Tauri），提醒为空操作，不会真正弹出。请在桌面应用中测试。
          </div>
        )}
      </div>
    </>
  );
}
