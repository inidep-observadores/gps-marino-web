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
        // App shell completo, incluida la base SQLite (wasm) y las fuentes, para abrir sin conexión desde el primer uso.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        globIgnores: [
          '**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2',
          // sqlite-wasm emite estos workers para otros modos (Worker1, VFS `opfs`); la app usa `opfs-sahpool` en su propio worker.
          '**/sqlite3-{worker1,opfs-async-proxy}-*.js',
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
