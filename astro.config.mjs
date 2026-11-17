import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://gala.boxingcenter.fr',
  trailingSlash: 'never',
  devToolbar: { enabled: false },
  build: { format: 'file' },
  server: { port: 5640, host: '127.0.0.1' },
  vite: {
    server: {
      proxy: {
        '/api': { target: 'http://127.0.0.1:5641', changeOrigin: true },
      },
    },
  },
});
