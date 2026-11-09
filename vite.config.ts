import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-dom/client'] } } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 20000 },
});
