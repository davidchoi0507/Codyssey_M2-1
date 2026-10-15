import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 서버(api.201.n-e.kr/app/)에 올릴 때는 VITE_BASE=/app/ 로 빌드한다
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    host: true, // Listen on all network addresses (0.0.0.0)
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
  },
});

