import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'slovenian_dictionary.json',
        'slovenian_forms_core.json',
      ],
      manifest: {
        name: 'Slovenian Offline Dictionary',
        short_name: 'SLO Dict',
        description: 'Reliable, offline-first dictionary for learning Slovenian.',
        theme_color: '#79be15',
        background_color: '#f9fafb',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,ico,png,svg,gz}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /slovenian_(dictionary|forms_core)\.json$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dictionary-core-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /slovenian_forms_full\.json\.gz$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dictionary-full-cache',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ]
      }
    })
  ]
});
