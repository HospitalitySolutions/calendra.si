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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@fullcalendar')) return 'vendor-calendar'
            if (id.includes('recharts')) return 'vendor-charts'
            if (id.includes('@zxing')) return 'vendor-scanner'
            if (id.includes('react')) return 'vendor-react'
            if (id.includes('axios')) return 'vendor-http'
            return 'vendor'
          }
          if (id.includes('/src/pages/ConfigurationPage')) return 'page-configuration'
          if (id.includes('/src/pages/BillingPage')) return 'page-billing'
          if (id.includes('/src/pages/calendar/CalendarPageContent') || id.includes('/src/pages/CalendarPage')) return 'page-calendar'
          if (id.includes('/src/pages/ClientsPage')) return 'page-clients'
          if (id.includes('/src/pages/PlatformAdminPage')) return 'page-platform-admin'
        },
      },
    },
  },
})
