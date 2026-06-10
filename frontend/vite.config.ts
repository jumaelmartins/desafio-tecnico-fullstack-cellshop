import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// O front fala sempre com caminhos relativos (/api/...). Em dev, o Vite
// faz proxy para o backend na 3001 — sem CORS e sem URL hardcoded no código.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
});
