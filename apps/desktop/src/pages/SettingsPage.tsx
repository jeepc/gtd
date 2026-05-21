import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const navigate = useNavigate();
  return (
    <>
      <span className="back-link" onClick={() => navigate(-1)}>← 返回</span>
      <div className="title">设置</div>
      <div style={{ marginTop: 16 }}>
        <div className="list-link" onClick={() => navigate('/settings/sync')}>同步配置</div>
        <div className="list-link" onClick={() => navigate('/settings/ai')}>AI 配置</div>
        <div className="list-link" onClick={() => navigate('/settings/prompts')}>Prompt 模板</div>
        <div className="list-link" onClick={() => navigate('/settings/about')}>关于</div>
        {import.meta.env.DEV && (
          <div className="list-link" onClick={() => navigate('/dev')}>开发测试</div>
        )}
      </div>
    </>
  );
}
