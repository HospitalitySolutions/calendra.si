import { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { getStoredUser } from './auth'
import { useToast } from './components/Toast'
import { registerConflict409Handler } from './api'
import { LoginPage } from './pages/LoginPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SignupPage } from './pages/SignupPage'
import { Shell } from './components/Shell'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { InboxPage } from './pages/InboxPage'
import { BillingPage } from './pages/BillingPage'
import { ClientsPage } from './pages/ClientsPage'
import { ConfigurationPage } from './pages/ConfigurationPage'
import { PlatformAdminPage } from './pages/PlatformAdminPage'

const OAUTH_HANDLED_KEY = 'oauth_toast_handled'

const CalendarPage = lazy(() => import('./pages/CalendarPage'))

export default function App() {
  const user = getStoredUser()
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const handledRef = useRef(false)

  useEffect(() => {
    registerConflict409Handler((msg) => showToast('error', msg))
    return () => registerConflict409Handler(null)
  }, [showToast])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oauthError = params.get('oauth_error')
    const zoomConnected = params.get('zoom_connected')
    const zoomError = params.get('zoom_error')
    const googleConnected = params.get('google_connected')
    const googleError = params.get('google_error')
    if (oauthError) {
      // Keep oauth_error in URL on the login screen so LoginPage can show a persistent inline message.
      if (!user) return
      if (handledRef.current) return
      handledRef.current = true
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(Date.now()))
      navigate(location.pathname, { replace: true })
      showToast('error', 'Google sign-in failed: ' + decodeURIComponent(oauthError))
    } else if (zoomConnected) {
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('success', 'Zoom connected successfully. You can now create online sessions.')
    } else if (zoomError) {
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('error', 'Zoom authorization failed: ' + decodeURIComponent(zoomError))
    } else if (googleConnected) {
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('success', 'Google connected successfully. You can now create online sessions.')
    } else if (googleError) {
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('error', 'Google authorization failed: ' + decodeURIComponent(googleError))
    }
  }, [location.search, location.pathname, navigate, showToast, user])

  if (location.pathname === '/oauth-callback') return <OAuthCallbackPage />
  if (location.pathname === '/reset-password') return <ResetPasswordPage />

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (user.role === 'SUPER_ADMIN') {
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/platform-admin" replace />} />
        <Route path="/platform-admin" element={<PlatformAdminPage />} />
        <Route path="*" element={<Navigate to="/platform-admin" replace />} />
      </Routes>
    )
  }

  return (
    <Shell>
      <Suspense fallback={<div className="content content-android-native" style={{ padding: 24 }}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar" element={<CalendarPage key={location.key} />} />
          <Route path="/sessions" element={<Navigate to="/calendar" replace />} />
          <Route path="/sessions/booked" element={<Navigate to="/calendar" replace />} />
          <Route path="/sessions/bookable" element={<Navigate to="/calendar" replace />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/consultants" element={<Navigate to="/configuration?tab=consultants" replace />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
          <Route path="/settings" element={<Navigate to="/configuration" replace />} />
          <Route path="/sessions/spaces" element={<Navigate to="/configuration?tab=booking" replace />} />
          <Route path="/sessions/types" element={<Navigate to="/configuration?tab=booking" replace />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  )
}
