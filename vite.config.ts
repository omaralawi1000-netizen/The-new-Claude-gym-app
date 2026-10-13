import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

export default defineConfig({
  // relative base: the same build works at a domain root (Vercel/Netlify) and under a sub-path (GitHub Pages /repo/)
  base: './',
  // the version shown in Settings → About, so you can see which build the phone is running
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new build never replaces the running one on its own, so an
      // active workout or unsaved entry is never interrupted by an update.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Aven',
        short_name: 'Aven',
        description: 'Training, food and progress in one place.',
        theme_color: '#05060b',
        background_color: '#05060b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        // long-press the app icon (Android) for these
        shortcuts: [
          { name: 'Log food', short_name: 'Food', url: './?do=food', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Dictate', short_name: 'Dictate', url: './?do=voice', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Snap your plate', short_name: 'Photo', url: './?do=photo', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Log wrestling', short_name: 'Wrestling', url: './?do=wrestling', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the rest timer while the app is out of sight: lock-screen notification + the "rest over" alert
        importScripts: ['rest-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'], maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, navigateFallbackDenylist: [/^\/api\//],
        // the packed Danish food list: fetched the first time food is searched, then kept on the phone (works offline);
        // its name changes when the list changes, so old copies are simply replaced
        runtimeCaching: [{ urlPattern: /\/assets\/off-dk-[^/]*\.json$/, handler: 'CacheFirst', options: { cacheName: 'aven-food-dk', expiration: { maxEntries: 2 } } },
          // the 3D figure clips: fetched the first time an exercise is shown (or ahead, for today's workout), then kept for offline use
          { urlPattern: /\/figures\/[^/]*\.webm(\?.*)?$/, handler: 'CacheFirst', options: { cacheName: 'aven-figures', expiration: { maxEntries: 300 } } }],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: { include: ['tests/**/*.test.{ts,mjs}'] },
});
