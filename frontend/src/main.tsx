import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { LocaleProvider } from './locale'
import App from './App'
import { initTheme } from './theme'
import './styles.css'

try {
  initTheme()
} catch (e) {
  console.error('initTheme failed', e)
}

window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

const qc = new QueryClient()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={qc}>
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
