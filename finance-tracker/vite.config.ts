import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // Registered from PWAUpdateBanner via virtual:pwa-register/react; never inject an inline script.
      injectRegister: false,
      strategies: 'generateSW',
      manifest: {
        name: 'Finvu',
        short_name: 'Finvu',
        description: 'Financie pod kontrolou',
        theme_color: '#8B5CF6',
        background_color: '#0d0b18',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: 'https://finvu.pedani.eu/',
        lang: 'sk',
        categories: ['finance'],
        icons: [
          { src: 'pwa-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: 'pwa-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: 'pwa-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: 'pwa-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: 'pwa-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // NOTE: with registerType: 'prompt' the SW must stay in the "waiting" state
        // until the user clicks "Aktualizovať". Setting skipWaiting/clientsClaim here
        // makes the SW self-activate immediately and omits the SKIP_WAITING message
        // listener, so the prompt's updateServiceWorker(true) → messageSkipWaiting()
        // has nothing to talk to and the page never reloads. Leave them off.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // index.html loads /theme-init.js?v=N; match it to the precached file offline.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
          },
        ],
      },
    }),
  ],
})
