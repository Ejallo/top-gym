import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repo-name>/
const base = '/top-gym/';
const build = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  base,
  define: {
    // Shown in settings to tell which version is running
    __BUILD__: JSON.stringify(build),
  },
  plugins: [
    react(),
    // version.json is never precached, so a stuck old app can fetch it and learn it is outdated
    {
      name: 'version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Exercise gifs are large: cache each one the first time it is shown instead of precaching all
        globIgnores: ['**/media/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/media/'),
            handler: 'CacheFirst',
            options: { cacheName: 'top-gym-media', expiration: { maxEntries: 2000 } },
          },
          {
            urlPattern: ({ url }) => url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com'),
            handler: 'CacheFirst',
            options: { cacheName: 'top-gym-fonts', expiration: { maxEntries: 30 } },
          },
        ],
      },
      manifest: {
        name: 'TOP GYM',
        short_name: 'TOP GYM',
        description: 'Personal workout log',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0b0b0b',
        theme_color: '#0b0b0b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
