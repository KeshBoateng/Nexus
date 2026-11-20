/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // New versions activate on their own. ('prompt' needs an in-app update button, which
      // didn't exist — users stayed on the first cached version. Fixed 2026-11-20, see K-11.)
      registerType: 'autoUpdate',
      // Custom worker (src/sw.ts) for push handling; precache manifest is injected at build.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'NEXUS',
        short_name: 'NEXUS',
        description: 'Your personal operating system.',
        theme_color: '#0d0e11',
        background_color: '#0d0e11',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
  },
});
