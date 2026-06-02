import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

/**
 * 通用设置 —— 承载开机自启等系统行为开关。
 *
 * 自启状态以 OS 注册项为唯一事实来源（插件的 `isEnabled()`），不写入
 * settings.json，避免与系统真实状态产生漂移。浏览器开发环境（无 Tauri 桥）
 * 下隐藏该开关。
 */
export default function GeneralSettingsPage() {
  const navigate = useNavigate();
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isTauri) {
      setReady(true);
      return;
    }
    isEnabled()
      .then(setAutoLaunch)
      .catch(() => { /* 读取失败时按未启用处理 */ })
      .finally(() => setReady(true));
  }, []);

  const toggle = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      setAutoLaunch(next);
    } catch {
      /* 切换失败则保持原状态 */
    }
  };

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">通用</div>
      {isTauri && (
        <div className="section" style={{ marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoLaunch}
              disabled={!ready}
              onChange={e => toggle(e.target.checked)}
            />
            <span>开机时自动启动 Loop</span>
          </label>
        </div>
      )}
    </>
  );
}
