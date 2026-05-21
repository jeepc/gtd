import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import HomePage from './pages/HomePage.tsx';
import EntryDetailPage from './pages/EntryDetailPage.tsx';
import TagPage from './pages/TagPage.tsx';
import SearchPage from './pages/SearchPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import SyncSettingsPage from './pages/SyncSettingsPage.tsx';
import AISettingsPage from './pages/AISettingsPage.tsx';
import PromptTemplatesPage from './pages/PromptTemplatesPage.tsx';
import AboutPage from './pages/AboutPage.tsx';
import ConflictsPage from './pages/ConflictsPage.tsx';
import DevPage from './pages/DevPage.tsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<HomePage />} />
          <Route path="entry/:id" element={<EntryDetailPage />} />
          <Route path="tag/:tag" element={<TagPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/sync" element={<SyncSettingsPage />} />
          <Route path="settings/ai" element={<AISettingsPage />} />
          <Route path="settings/prompts" element={<PromptTemplatesPage />} />
          <Route path="settings/about" element={<AboutPage />} />
          <Route path="conflicts" element={<ConflictsPage />} />
        {import.meta.env.DEV && <Route path="dev" element={<DevPage />} />}
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
