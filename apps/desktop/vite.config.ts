import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri-friendly Vite config: fixed port, no overlay.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
