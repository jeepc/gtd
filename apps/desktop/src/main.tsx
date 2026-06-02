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
import ConflictsPage from './pages/ConflictsPage.tsx';
import WelcomeScreen from './pages/WelcomeScreen.tsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
          <Route path="conflicts" element={<ConflictsPage />} />
          <Route path="welcome" element={<WelcomeScreen />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
