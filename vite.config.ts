import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // relative base: the same build works at a domain root (Vercel/Netlify) and under a sub-path (GitHub Pages /repo/)
  base: './',
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
        theme_color: '#0c0c0e',
        background_color: '#0c0c0e',
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
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'], maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: { include: ['tests/**/*.test.{ts,mjs}'] },
});
