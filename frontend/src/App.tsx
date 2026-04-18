import axios from 'axios'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { getStoredUser } from './auth'
import { useToast } from './components/Toast'
import { api, ensureCsrfToken, registerConflict409Handler } from './api'
import { LoginPage } from './pages/LoginPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SignupPage } from './pages/SignupPage'
import { ZoomInstallPage } from './pages/ZoomInstallPage'
import { Shell } from './components/Shell'
import { useLocale } from './locale'
import { getDefaultAllowedRoute, hasBillingAccess, hasInboxAccess } from './lib/packageAccess'
import { storeAuthenticatedSession } from './lib/session'
import { clearAuthStoragePreservingTheme } from './theme'

const OAUTH_HANDLED_KEY = 'oauth_toast_handled'

const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((mod) => ({ default: mod.AnalyticsPage })))
const InboxPage = lazy(() => import('./pages/InboxPage').then((mod) => ({ default: mod.InboxPage })))
const BillingPage = lazy(() => import('./pages/BillingPage').then((mod) => ({ default: mod.BillingPage })))
const ClientsPage = lazy(() => import('./pages/ClientsPage').then((mod) => ({ default: mod.ClientsPage })))
const ConfigurationPage = lazy(() => import('./pages/ConfigurationPage').then((mod) => ({ default: mod.ConfigurationPage })))
const ConsultantsPage = lazy(() => import('./pages/ConsultantsPage').then((mod) => ({ default: mod.ConsultantsPage })))
const SecurityPage = lazy(() => import('./pages/SecurityPage').then((mod) => ({ default: mod.SecurityPage })))
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage').then((mod) => ({ default: mod.PlatformAdminPage })))
const HelpPage = lazy(() => import('./pages/HelpPage').then((mod) => ({ default: mod.HelpPage })))
const SessionTypesPage = lazy(() => import('./pages/SessionTypesPage').then((mod) => ({ default: mod.SessionTypesPage })))

export default function App() {
  const [user, setUser] = useState(() => getStoredUser())
  const [authResolved, setAuthResolved] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { locale } = useLocale()
  const copy = locale === 'sl' ? {
    googleSignInFailed: 'Google prijava ni uspela: ',
    zoomConnected: 'Zoom je uspešno povezan. Zdaj lahko ustvarjate spletne termine.',
    zoomAuthorizationFailed: 'Zoom avtorizacija ni uspela: ',
    googleConnected: 'Google je uspešno povezan. Zdaj lahko ustvarjate spletne termine.',
    googleAuthorizationFailed: 'Google avtorizacija ni uspela: ',
    loading: 'Nalaganje…',
  } : {
    googleSignInFailed: 'Google sign-in failed: ',
    zoomConnected: 'Zoom connected successfully. You can now create online sessions.',
    zoomAuthorizationFailed: 'Zoom authorization failed: ',
    googleConnected: 'Google connected successfully. You can now create online sessions.',
    googleAuthorizationFailed: 'Google authorization failed: ',
    loading: 'Loading…',
  }
  const handledRef = useRef(false)

  useEffect(() => {
    registerConflict409Handler((msg) => showToast('error', msg))
    return () => registerConflict409Handler(null)
  }, [showToast])

  useEffect(() => {
    void ensureCsrfToken().catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    api.get('/auth/me')
      .then((res) => {
        if (cancelled) return
        const nextUser = res.data?.user ?? null
        if (nextUser) {
          storeAuthenticatedSession({ user: nextUser })
          setUser(nextUser)
        } else {
          clearAuthStoragePreservingTheme()
          setUser(null)
        }
      })
      .catch((err) => {
        if (cancelled) return
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          clearAuthStoragePreservingTheme()
          setUser(null)
          return
        }
        setUser((current) => current)
      })
      .finally(() => {
        if (!cancelled) setAuthResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oauthError = params.get('oauth_error')
    const zoomConnected = params.get('zoom_connected')
    const zoomError = params.get('zoom_error')
    const googleConnected = params.get('google_connected')
    const googleError = params.get('google_error')
    if (oauthError) {
      if (!user) return
      if (handledRef.current) return
      handledRef.current = true
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(Date.now()))
      navigate(location.pathname, { replace: true })
      showToast('error', copy.googleSignInFailed + decodeURIComponent(oauthError))
    } else if (zoomConnected) {
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('success', copy.zoomConnected)
    } else if (zoomError) {
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('error', copy.zoomAuthorizationFailed + decodeURIComponent(zoomError))
    } else if (googleConnected) {
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('success', copy.googleConnected)
    } else if (googleError) {
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('error', copy.googleAuthorizationFailed + decodeURIComponent(googleError))
    }
  }, [location.search, location.pathname, navigate, showToast, user])

  if (location.pathname === '/oauth-callback') return <OAuthCallbackPage />
  if (location.pathname === '/forgot-password') return <ForgotPasswordPage />
  if (location.pathname === '/reset-password') return <ResetPasswordPage />

  if (!authResolved) {
    return <div className="content" style={{ padding: 24 }}>{copy.loading}</div>
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/zoom/install" element={<ZoomInstallPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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

  const billingAllowed = hasBillingAccess(user.packageType)
  const inboxAllowed = hasInboxAccess(user.packageType)
  const fallbackRoute = getDefaultAllowedRoute(user.packageType)

  return (
    <Shell>
      <Suspense fallback={<div className="content content-android-native" style={{ padding: 24 }}>{copy.loading}</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar/*" element={<CalendarPage />} />
          <Route path="/sessions" element={<Navigate to="/calendar" replace />} />
          <Route path="/sessions/booked" element={<Navigate to="/calendar" replace />} />
          <Route path="/sessions/bookable" element={<Navigate to="/calendar" replace />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route
            path="/consultants"
            element={user.role === 'ADMIN' ? <ConsultantsPage /> : <Navigate to={fallbackRoute} replace />}
          />
          <Route
            path="/my-profile"
            element={user.role === 'CONSULTANT' ? <ConsultantsPage selfService /> : <Navigate to={fallbackRoute} replace />}
          />
          <Route path="/billing" element={billingAllowed ? <BillingPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/inbox" element={inboxAllowed ? <InboxPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
          <Route
            path="/session-types"
            element={user.role === 'ADMIN' ? <SessionTypesPage /> : <Navigate to={fallbackRoute} replace />}
          />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/zoom/install" element={<ZoomInstallPage />} />
          <Route
            path="/security"
            element={
              user.role === 'ADMIN' ? (
                <Navigate to="/configuration?tab=security" replace />
              ) : (
                <SecurityPage />
              )
            }
          />
          <Route path="/settings" element={<Navigate to="/configuration" replace />} />
          <Route path="/sessions/spaces" element={<Navigate to="/configuration?tab=booking" replace />} />
          <Route path="/sessions/types" element={<Navigate to="/session-types" replace />} />
          <Route path="*" element={<Navigate to={fallbackRoute} replace />} />
        </Routes>
      </Suspense>
    </Shell>
  )
}
