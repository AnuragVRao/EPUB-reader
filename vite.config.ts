import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { serviceWorker } from './pwa/vite-plugin-sw.ts'

// https://vite.dev/config/
export default defineConfig({
  // Relative, so the built site works from any path - the root of a domain or
  // a GitHub Pages project sub-path - without being told which.
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    // The tests cover the storage layer only, so plain Node is enough; the
    // browser storage APIs they need are stubbed per test file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
