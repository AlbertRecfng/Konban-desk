import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Запросы к API идут через тот же origin, поэтому refresh-cookie
    // с SameSite=Strict работает без настройки CORS
    proxy: {
      // ws: true - через этот же прокси идёт WebSocket-соединение Socket.IO
      '/api': { target: 'http://localhost:4000', ws: true },
    },
  },
});
