import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['app.calendra.si', 'staging.calendra.si', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/oauth2': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/login/oauth2': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['app.calendra.si', 'staging.calendra.si', 'localhost', '127.0.0.1'],
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
})
