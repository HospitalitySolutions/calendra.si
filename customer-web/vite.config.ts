import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const CUSTOMER_ACCOUNT_BASE = '/racun/'

export default defineConfig({
  // Keep all production assets below /racun so the public marketing site's
  // /assets namespace remains untouched.
  base: CUSTOMER_ACCOUNT_BASE,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['calendra.si', 'connect.calendra.si', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: process.env.CUSTOMER_WEB_DEV_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['calendra.si', 'connect.calendra.si', 'localhost', '127.0.0.1'],
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
})
