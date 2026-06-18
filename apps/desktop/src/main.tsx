import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import HomePage from './pages/HomePage.tsx';
import EntryDetailPage from './pages/EntryDetailPage.tsx';
import TagPage from './pages/TagPage.tsx';
import PriorityPage from './pages/PriorityPage.tsx';
import SearchPage from './pages/SearchPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import SyncSettingsPage from './pages/SyncSettingsPage.tsx';
import McpServerPage from './pages/McpServerPage.tsx';
import AboutPage from './pages/AboutPage.tsx';
import AppearanceSettingsPage from './pages/AppearanceSettingsPage.tsx';
import GeneralSettingsPage from './pages/GeneralSettingsPage.tsx';
import WelcomeScreen from './pages/WelcomeScreen.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './styles.css';

// Surface module-eval / async errors that React's boundary can't catch, so the
// window never sits blank with no clue (release builds have no console).
function showFatal(message: string) {
  const root = document.getElementById('root');
  if (root && (root.childElementCount === 0 || (root.textContent ?? '').trim() === '')) {
    root.innerHTML = `<pre style="padding:16px;color:#ef4444;font:12px monospace;white-space:pre-wrap">启动失败：\n${message}</pre>`;
  }
}
window.addEventListener('error', e => showFatal(e.error?.stack ?? e.message));
window.addEventListener('unhandledrejection', e => showFatal(String((e.reason && (e.reason.stack ?? e.reason.message)) ?? e.reason)));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<HomePage />} />
          <Route path="entry/:id" element={<EntryDetailPage />} />
          <Route path="tag/:tag" element={<TagPage />} />
          <Route path="priority/:level" element={<PriorityPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/sync" element={<SyncSettingsPage />} />
          <Route path="settings/mcp" element={<McpServerPage />} />
          <Route path="settings/about" element={<AboutPage />} />
          <Route path="settings/appearance" element={<AppearanceSettingsPage />} />
          <Route path="settings/general" element={<GeneralSettingsPage />} />
          <Route path="welcome" element={<WelcomeScreen />} />
        </Route>
      </Routes>
    </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
