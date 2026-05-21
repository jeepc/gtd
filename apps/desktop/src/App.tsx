import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useVaultStore } from './state/vaultStore.ts';

export default function App() {
  const init = useVaultStore(s => s.init);
  const navigate = useNavigate();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'n') { e.preventDefault(); document.getElementById('quick-input')?.focus(); }
      else if (meta && e.key === 'f') { e.preventDefault(); navigate('/search'); }
      else if (meta && e.key === ',') { e.preventDefault(); navigate('/settings'); }
      else if (meta && e.key === 's') { e.preventDefault(); useVaultStore.getState().syncNow(); }
      else if (e.key === 'Escape') { history.back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="app">
      <Outlet />
    </div>
  );
}
