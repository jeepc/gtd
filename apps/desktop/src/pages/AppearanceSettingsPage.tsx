import { useNavigate } from 'react-router-dom';
import { useVaultStore } from '../state/vaultStore.ts';

export default function AppearanceSettingsPage() {
  const navigate = useNavigate();
  const appSettings = useVaultStore(s => s.appSettings);
  const saveAppSettings = useVaultStore(s => s.saveAppSettings);
  const vaultConfig = useVaultStore(s => s.vaultConfig);
  const saveVaultConfig = useVaultStore(s => s.saveVaultConfig);
  const showToolbar = appSettings.ui?.showInputToolbar ?? true;
  const theme = vaultConfig.ui.theme;

  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">外观</div>
      <div className="section" style={{ marginTop: 16 }}>
        <div className="row">
          <label>主题</label>
          <select
            value={theme}
            onChange={e =>
              saveVaultConfig({
                ...vaultConfig,
                ui: { ...vaultConfig.ui, theme: e.target.value as 'auto' | 'light' | 'dark' },
              })
            }
          >
            <option value="auto">跟随系统</option>
            <option value="dark">深色模式</option>
            <option value="light">浅色模式</option>
          </select>
        </div>
      </div>
      <div className="section" style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showToolbar}
            onChange={e =>
              saveAppSettings({
                ...appSettings,
                ui: { ...appSettings.ui, showInputToolbar: e.target.checked },
              })
            }
          />
          <span>在输入框上方显示 # @ ! 工具栏</span>
        </label>
      </div>
    </>
  );
}
