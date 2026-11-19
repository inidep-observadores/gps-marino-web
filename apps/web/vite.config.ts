import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // sqlite-wasm ubica su `.wasm` relativo a su propio módulo: no debe pasar por el pre-empaquetado de Vite.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // MapLibre ocupa ~1 MB (290 KB gzip) en su propio fragmento: se precachea igual, el aviso no aporta.
  build: { chunkSizeWarningLimit: 1200 },
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'GPS Marino',
        short_name: 'GPS Marino',
        description: 'GPS y registro de ubicaciones a bordo. Funciona sin conexión.',
        lang: 'es',
        theme_color: '#0b0e13',
        background_color: '#0b0e13',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'any',
        categories: ['navigation', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // App shell completo, incluida la base SQLite (wasm), las fuentes y las capas base (GeoJSON), para abrir
        // sin conexión desde el primer uso.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,geojson}'],
        globIgnores: [
          '**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2',
          // sqlite-wasm emite estos workers para otros modos (Worker1, VFS `opfs`); la app usa `opfs-sahpool` en su propio worker.
          '**/sqlite3-{worker1,opfs-async-proxy}-*.js',
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Mapas sin conexión: TODA tesela que se ve con conexión queda guardada y se reutiliza en altamar.
        // Caché primero (sin red no hay otra opción), con topes amplios y vencimiento largo; si el navegador
        // se queda sin cuota, se purga el caché del mapa antes que fallar (`purgeOnQuotaError`).
        runtimeCaching: [
          {
            // Estilos, TileJSON, fuentes (.pbf de glifos) y sprites de OpenFreeMap: del caché, actualizándose en
            // segundo plano. Las TESELAS (/planet/<versión>/...) no pasan por aquí: las guarda
            // `components/map/offlineTiles.ts` con una clave sin versión (la versión cambia y rompería el caché).
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org' && !/^\/planet\/[^/]+\//.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-style',
              expiration: { maxEntries: 300, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Pronóstico de viento (Open-Meteo): red primero con espera corta y, sin conexión, la última respuesta
            // guardada (la fecha de la respuesta dice de cuándo es; la app lo avisa).
            urlPattern: /^https:\/\/(api|marine-api)\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'open-meteo',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 4 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Imágenes satelitales y batimetría (Esri). Más pesadas: tope propio.
            urlPattern: /^https:\/\/(server|services)\.arcgisonline\.com\/.*\/tile\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-raster-tiles',
              expiration: { maxEntries: 6000, maxAgeSeconds: 365 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Mapa base Argenmap (IGN). Las respuestas traen `no-store`; Workbox las guarda igual. Mismo nombre de caché que usa
            // la descarga por zona (`offlineTiles.downloadArea`).
            urlPattern: /^https:\/\/wms\.ign\.gob\.ar\/geoserver\/gwc\/service\/tms\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-argenmap-tiles',
              expiration: { maxEntries: 12000, maxAgeSeconds: 365 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Señales náuticas (OpenSeaMap).
            urlPattern: /^https:\/\/tiles\.openseamap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-seamarks',
              expiration: { maxEntries: 4000, maxAgeSeconds: 365 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
