import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // The tests cover the storage layer only, so plain Node is enough; the
    // browser storage APIs they need are stubbed per test file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
