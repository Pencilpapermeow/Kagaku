/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'
import pkg from './package.json' with { type: 'json' }

const require = createRequire(import.meta.url)

/**
 * OCR files for "Test from paper", served from the app itself (never a CDN): the tesseract.js
 * worker, its engine (with and without SIMD) and the English data. They are NOT precached
 * with the app; the feature downloads them once into Cache Storage (src/paper/tools.ts).
 */
const OCR_FILES: Record<string, string> = {
  'ocr/worker.min.js': require.resolve('tesseract.js/dist/worker.min.js'),
  'ocr/tesseract-core-simd-lstm.wasm.js': require.resolve('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),
  'ocr/tesseract-core-lstm.wasm.js': require.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js'),
  'ocr/eng.traineddata.gz': require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
}

/** Same name as TOOLS_CACHE in src/paper/tools.ts. */
const TOOLS_CACHE = 'kagaku-paper-tools-v1'

function ocrFiles(): Plugin {
  return {
    name: 'kagaku-ocr-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0].replace(server.config.base, '')
        const file = path && OCR_FILES[path]
        if (!file) return next()
        res.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(OCR_FILES)) this.emitFile({ type: 'asset', fileName, source: readFileSync(file) })
    },
  }
}

const isPaperTool = (id: string) => /node_modules[\\/](pdfjs-dist|tesseract\.js)[\\/]/.test(id) && !id.includes('?')

// GitHub Pages serves the app from /<repo>/; CI passes the exact path in KAGAKU_BASE.
const base = process.env.KAGAKU_BASE ?? '/'

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version} (${gitSha()})`),
  },
  plugins: [
    react(),
    ocrFiles(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Kagaku',
        short_name: 'Kagaku',
        description: 'Active-recall practice for JEE Advanced: formulas, questions, CBT tests and a mistake notebook.',
        lang: 'en',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#f7f7f9',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // pdf.js and the OCR files are not part of the install; they are cached on first use.
        globIgnores: ['assets/paper/**', 'ocr/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/paper/') || url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: TOOLS_CACHE, cacheableResponse: { statuses: [200] } },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) => (chunk.moduleIds.some(isPaperTool) ? 'assets/paper/[name]-[hash].js' : 'assets/[name]-[hash].js'),
        assetFileNames: (asset) => ((asset.names ?? []).some((n) => n.includes('pdf.worker')) ? 'assets/paper/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
