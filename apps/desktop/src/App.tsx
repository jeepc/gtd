import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useVaultStore } from './state/vaultStore.ts';
import SyncStatusBar from './components/SyncStatusBar.tsx';

export default function App() {
  const init = useVaultStore(s => s.init);
  const onFocus = useVaultStore(s => s.onWindowFocus);
  const onBlur = useVaultStore(s => s.onWindowBlur);
  const needsWelcome = useVaultStore(s => s.needsWelcome);
  const initializing = useVaultStore(s => s.initializing);
  const theme = useVaultStore(s => s.vaultConfig.ui.theme);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    init();
  }, [init]);

  // Resolve the configured theme ('auto'|'light'|'dark') to an explicit
  // data-theme on <html>, which drives the CSS palette (styles.css). For 'auto'
  // we track the OS preference live so it follows system changes.
  useEffect(() => {
    const root = document.documentElement;
    if (theme !== 'auto') {
      root.dataset.theme = theme;
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { root.dataset.theme = mq.matches ? 'dark' : 'light'; };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // PRD §3.3 WelcomeScreen guard. Once init() determines no vault is configured,
  // push the user to /welcome (unless they're already there).
  useEffect(() => {
    if (initializing) return;
    if (needsWelcome && location.pathname !== '/welcome') {
      navigate('/welcome', { replace: true });
    } else if (!needsWelcome && location.pathname === '/welcome') {
      navigate('/', { replace: true });
    }
  }, [needsWelcome, initializing, location.pathname, navigate]);

  // Global keyboard shortcuts (PRD §7.2).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'n') { e.preventDefault(); document.getElementById('quick-input')?.focus(); }
      else if (meta && e.key === 'f') { e.preventDefault(); navigate('/search'); }
      else if (meta && e.key === ',') { e.preventDefault(); navigate('/settings'); }
      else if (meta && e.key === 's') { e.preventDefault(); useVaultStore.getState().syncNow(); }
      // PRD §1.5.5 #3 / §7.2: rebuild the local DB from the op log. preventDefault
      // overrides the WebView's reload binding.
      else if (meta && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); useVaultStore.getState().rebuildDatabase(); }
      else if (e.key === 'Escape') { history.back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // PRD §4.7.2 focus/blur sync triggers.
  useEffect(() => {
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [onFocus, onBlur]);

  return (
    <div className="app" style={{ paddingBottom: 28 }}>
      <Outlet />
      {!needsWelcome && !initializing && <SyncStatusBar />}
    </div>
  );
}
