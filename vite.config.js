import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Keep the development server local and prevent accidental source/config
  // disclosure if it is opened beyond the developer's machine.
  server: {
    host: '127.0.0.1',
    strictPort: true
  },
  plugins: [
    {
      name: 'dev-security-guard',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = (req.url || '').split('?')[0];
          if (/\/(?:\.env(?:\.[^/]*)?|package(?:-lock)?\.json|vite\.config\.[^/]+|vercel\.json)$/.test(path)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          next();
        });
      }
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'UTHM Timetable Planner',
        short_name: 'UTHM Timetable',
        description: 'A beautiful timetable planner application.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ]
});
