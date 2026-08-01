import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Относительная база обязательна: Electron грузит билд через file://
  base: './',
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  // host обязателен: по умолчанию Vite поднимается только на IPv6 (::1),
  // и запросы на 127.0.0.1 отбиваются отказом соединения.
  //
  // Порт 5400, а не привычный 5173: Windows держит 5145–5244 в списке
  // зарезервированных под Hyper-V диапазонов (netsh interface ipv4 show
  // excludedportrange protocol=tcp), и занять 5173 там просто нельзя.
  server: { host: '127.0.0.1', port: 5400, strictPort: true },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2022',
  },
});
