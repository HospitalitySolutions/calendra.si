import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { LocaleProvider } from './locale'
import App from './App'
import { initTheme } from './theme'
import './styles.css'
import { queryClient } from './queries/queryClient'
import { QueryInvalidationBridge } from './queries/QueryInvalidationBridge'
import { installPerformanceDebugApi, installQueryPerformanceTracking } from './lib/performanceMonitor'
import { recoverFromChunkLoadError } from './lib/chunkRecovery'

try {
  initTheme()
} catch (e) {
  console.error('initTheme failed', e)
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  recoverFromChunkLoadError()
})

installPerformanceDebugApi()
installQueryPerformanceTracking(queryClient)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <QueryInvalidationBridge />
      <BrowserRouter>
        <LocaleProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </LocaleProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>,
)
