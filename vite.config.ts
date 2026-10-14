import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';
import { betaBoot, PREFIX, PENDING } from './src/lib/beta';

// Aven Beta (scripts/build-beta.mjs): the same app as a second installable app with its own name, icon and storage
const beta = process.env.AVEN_BETA === '1';

export default defineConfig({
  // relative base: the same build works at a domain root (Vercel/Netlify) and under a sub-path (GitHub Pages /repo/)
  base: './',
  // the version shown in Settings → About, so you can see which build the phone is running
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __AVEN_BETA__: JSON.stringify(beta) },
  // the beta's icons replace the real ones (scripts/build-beta.mjs puts the merged folder here)
  ...(process.env.AVEN_PUBLIC_DIR ? { publicDir: process.env.AVEN_PUBLIC_DIR } : {}),
  ...(process.env.AVEN_OUT_DIR ? { build: { outDir: process.env.AVEN_OUT_DIR, emptyOutDir: true } } : {}),
  plugins: [
    react(),
    // the beta's page title, and its own storage: betaBoot is pasted in as the very first script (see src/lib/beta.ts)
    ...(beta ? [{
      name: 'aven-beta-boot',
      transformIndexHtml: (h: string) => h.replace('<title>Aven</title>', '<title>Aven Beta</title>')
        .replace('<head>', `<head><script>(${betaBoot.toString()})(window, ${JSON.stringify(PREFIX)}, ${JSON.stringify(PENDING)});</script>`),
    }] : []),
    VitePWA({
      // 'prompt': a new build never replaces the running one on its own, so an
      // active workout or unsaved entry is never interrupted by an update.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: beta ? 'Aven Beta' : 'Aven',
        short_name: beta ? 'Aven Beta' : 'Aven',
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
        // /beta/ is the Aven Beta app on the same site: the real app's worker must never answer its pages with the real app
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,mp3}'], maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, navigateFallbackDenylist: [/^\/api\//, ...(beta ? [] : [/\/beta(\/|$)/])],
        // the packed Danish food list: fetched the first time food is searched, then kept on the phone (works offline);
        // its name changes when the list changes, so old copies are simply replaced
        runtimeCaching: [{ urlPattern: /\/assets\/off-dk-[^/]*\.json$/, handler: 'CacheFirst', options: { cacheName: beta ? 'aven-beta-food-dk' : 'aven-food-dk', expiration: { maxEntries: 2 } } }],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: { include: ['tests/**/*.test.{ts,mjs}'] },
});
