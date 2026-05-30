import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/renderer/setup.ts'],
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@main': resolve(__dirname, 'src/main'),
      '@shared': resolve(__dirname, 'src/shared'),
    }
  },
  build: {
    rollupOptions: {
      // Force Rollup/Vite to ignore the native sqlite module during bundling
      external: ['node:sqlite']
    }
  }
})
