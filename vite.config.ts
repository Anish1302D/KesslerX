/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cesium(),
  ],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'esnext'
  },
  worker: {
    format: 'es'
  },
  test: {
    environment: 'jsdom',
    globals: true,
  }
})
