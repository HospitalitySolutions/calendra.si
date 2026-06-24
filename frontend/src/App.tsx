import axios from 'axios'
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { getStoredUser } from './auth'
import { useToast } from './components/Toast'
import { api, ensureCsrfToken, registerConflict409Handler } from './api'
import { LoginPage } from './pages/LoginPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { RegisterPage } from './pages/RegisterPage'
import { RegisterPlanAddonsPage } from './pages/RegisterPlanAddonsPage'
import { RegisterAccountPage } from './pages/RegisterAccountPage'
import { RegisterBillingDetailsPage } from './pages/RegisterBillingDetailsPage'
import { ZoomInstallPage } from './pages/ZoomInstallPage'
import { CourseAccessPage } from './pages/CourseAccessPage'
import { Shell } from './components/Shell'
import { useLocale } from './locale'
import { getDefaultAllowedRoute } from './lib/packageAccess'
import { hasAnyEmployeePermission, hasEmployeePermission } from './lib/employeePermissions'
import { storeAuthenticatedSession } from './lib/session'
import { startClockSync, stopClockSync } from './lib/clock'
import { clearAuthStoragePreservingTheme } from './theme'

const OAUTH_HANDLED_KEY = 'oauth_toast_handled'
const CHUNK_RELOAD_KEY = 'chunk_reload_attempted'
const REGISTER_BILLING_DETAILS_REQUIRED_KEY = 'calendra.register.requiresBillingDetails'
const REGISTER_BILLING_DETAILS_SEARCH_KEY = 'calendra.register.billingDetailsSearch'

function getPendingRegisterBillingDetailsPath() {
  try {
    if (sessionStorage.getItem(REGISTER_BILLING_DETAILS_REQUIRED_KEY) !== '1') return ''
    const selectionSearch = (sessionStorage.getItem(REGISTER_BILLING_DETAILS_SEARCH_KEY) || '').replace(/^\?/, '')
    return selectionSearch ? `/register/billing-details?${selectionSearch}` : '/register/billing-details'
  } catch {
    return ''
  }
}

function lazyWithReload<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  reloadKey: string,
) {
  return lazy(async () => {
    try {
      const mod = await importer()
      sessionStorage.removeItem(reloadKey)
      return mod
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isChunkLoadError = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message)

      if (isChunkLoadError && sessionStorage.getItem(reloadKey) !== 'true') {
        sessionStorage.setItem(reloadKey, 'true')
        window.location.reload()
        return new Promise<never>(() => undefined)
      }

      throw error
    }
  })
}

const CalendarPage = lazyWithReload(() => import('./pages/CalendarPage'), CHUNK_RELOAD_KEY)
const AnalyticsPage = lazyWithReload(() => import('./pages/AnalyticsPage').then((mod) => ({ default: mod.AnalyticsPage })), CHUNK_RELOAD_KEY)
const InboxPage = lazyWithReload(() => import('./pages/InboxPage').then((mod) => ({ default: mod.InboxPage })), CHUNK_RELOAD_KEY)
const BillingPage = lazyWithReload(() => import('./pages/BillingPage').then((mod) => ({ default: mod.BillingPage })), CHUNK_RELOAD_KEY)
const ClientsPage = lazyWithReload(() => import('./pages/ClientsPage').then((mod) => ({ default: mod.ClientsPage })), CHUNK_RELOAD_KEY)
const ConfigurationPage = lazyWithReload(() => import('./pages/ConfigurationPage').then((mod) => ({ default: mod.ConfigurationPage })), CHUNK_RELOAD_KEY)
const ConsultantsPage = lazyWithReload(() => import('./pages/ConsultantsPage').then((mod) => ({ default: mod.ConsultantsPage })), CHUNK_RELOAD_KEY)
const SecurityPage = lazyWithReload(() => import('./pages/SecurityPage').then((mod) => ({ default: mod.SecurityPage })), CHUNK_RELOAD_KEY)
const PlatformAdminPage = lazyWithReload(() => import('./pages/PlatformAdminPage').then((mod) => ({ default: mod.PlatformAdminPage })), CHUNK_RELOAD_KEY)
const HelpPage = lazyWithReload(() => import('./pages/HelpPage').then((mod) => ({ default: mod.HelpPage })), CHUNK_RELOAD_KEY)
const SessionTypesPage = lazyWithReload(() => import('./pages/SessionTypesPage').then((mod) => ({ default: mod.SessionTypesPage })), CHUNK_RELOAD_KEY)
const WalletScannerPage = lazyWithReload(() => import('./pages/WalletScannerPage').then((mod) => ({ default: mod.WalletScannerPage })), CHUNK_RELOAD_KEY)
const ConsumablesPage = lazyWithReload(() => import('./pages/ConsumablesPage').then((mod) => ({ default: mod.ConsumablesPage })), CHUNK_RELOAD_KEY)

export default function App() {
  const [user, setUser] = useState(() => getStoredUser())
  const [authResolved, setAuthResolved] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast, clearToasts } = useToast()
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
  const [billingModuleEnabled, setBillingModuleEnabled] = useState(true)
  const [inboxModuleEnabled, setInboxModuleEnabled] = useState(true)
  const [scannerModuleEnabled, setScannerModuleEnabled] = useState(true)
  const [consumablesModuleEnabled, setConsumablesModuleEnabled] = useState(true)


  useEffect(() => {
    registerConflict409Handler((msg) => showToast('error', msg))
    return () => registerConflict409Handler(null)
  }, [showToast])

  useEffect(() => {
    if (!user) {
      stopClockSync()
      return
    }
    startClockSync()
    return () => stopClockSync()
  }, [user])

  useEffect(() => {
    clearToasts()
  }, [clearToasts, location.pathname, location.search])

  useEffect(() => {
    void ensureCsrfToken().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!user) {
      setBillingModuleEnabled(true)
      setInboxModuleEnabled(true)
      setScannerModuleEnabled(true)
      return
    }

    let cancelled = false
    const loadBillingModuleState = () => {
      api.get('/settings')
        .then((res) => {
          if (!cancelled) {
            setBillingModuleEnabled(res.data?.BILLING_ENABLED !== 'false')
            setInboxModuleEnabled(res.data?.INBOX_ENABLED !== 'false')
            setScannerModuleEnabled(res.data?.SCANNER_MODULE_ENABLED !== 'false')
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBillingModuleEnabled(true)
            setInboxModuleEnabled(true)
            setScannerModuleEnabled(true)
          }
        })
    }

    loadBillingModuleState()
    window.addEventListener('settings-updated', loadBillingModuleState)
    return () => {
      cancelled = true
      window.removeEventListener('settings-updated', loadBillingModuleState)
    }
  }, [user])


  useEffect(() => {
    if (!user) {
      setConsumablesModuleEnabled(true)
      return
    }

    let cancelled = false
    const loadModuleCapabilities = () => {
      api.get('/settings/module-capabilities')
        .then((res) => {
          if (!cancelled) setConsumablesModuleEnabled(res.data?.consumablesEnabled !== false)
        })
        .catch(() => {
          if (!cancelled) setConsumablesModuleEnabled(true)
        })
    }

    loadModuleCapabilities()
    window.addEventListener('settings-updated', loadModuleCapabilities)
    return () => {
      cancelled = true
      window.removeEventListener('settings-updated', loadModuleCapabilities)
    }
  }, [user])

  useEffect(() => {
    if (!user || user.role === 'SUPER_ADMIN') return
    let cancelled = false
    api.get('/settings/sms-quota')
      .then((res) => {
        if (cancelled) return
        const warning = res.data?.warning === true
        const exhausted = res.data?.exhausted === true
        const remaining = Number(res.data?.remaining ?? 0)
        const monthKey = new Date().toISOString().slice(0, 7)
        const storageKey = `calendra.smsQuotaWarning.${user.companyId}.${monthKey}`
        if ((warning || exhausted) && sessionStorage.getItem(storageKey) !== '1') {
          sessionStorage.setItem(storageKey, '1')
          const message = exhausted
            ? (locale === 'sl'
              ? 'Mesečni limit SMS sporočil je dosežen. Povečajte limit v Upravljanje računa → Naročnina.'
              : 'The monthly SMS limit has been reached. Increase the limit in Account management → Subscription.')
            : (locale === 'sl'
              ? `Bližate se mesečni omejitvi SMS sporočil. Preostanek: ${remaining}. Limit lahko povečate v Upravljanje računa → Naročnina.`
              : `You are approaching the monthly SMS limit. Remaining: ${remaining}. You can increase the limit in Account management → Subscription.`)
          showToast('info', message)
          const shouldOpenSubscription = window.confirm(`${message}\n\n${locale === 'sl' ? 'Želite odpreti Naročnino?' : 'Open Subscription settings?'}`)
          if (shouldOpenSubscription) {
            navigate('/configuration?tab=company&subtab=subscription')
          }
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [locale, navigate, showToast, user])

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
    const onZoomInstallPage = location.pathname === '/zoom/install'
    if (oauthError) {
      if (!user) return
      if (handledRef.current) return
      handledRef.current = true
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(Date.now()))
      navigate(location.pathname, { replace: true })
      showToast('error', copy.googleSignInFailed + decodeURIComponent(oauthError))
    } else if (zoomConnected) {
      if (onZoomInstallPage) return
      if (handledRef.current) return
      handledRef.current = true
      const now = Date.now()
      const last = sessionStorage.getItem(OAUTH_HANDLED_KEY)
      if (last && now - parseInt(last, 10) < 2000) return
      sessionStorage.setItem(OAUTH_HANDLED_KEY, String(now))
      navigate(location.pathname === '/' ? '/calendar' : location.pathname, { replace: true })
      showToast('success', copy.zoomConnected)
    } else if (zoomError) {
      if (onZoomInstallPage) return
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
  if (location.pathname.startsWith('/course-access/')) return <CourseAccessPage />
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
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/add-ons" element={<RegisterPlanAddonsPage />} />
        <Route path="/register/account" element={<RegisterAccountPage />} />
        <Route path="/confirm-email" element={<Navigate to="/register/account" replace />} />
        <Route path="/register/confirm-email" element={<Navigate to="/register/account" replace />} />
        <Route path="/signup" element={<Navigate to="/register" replace />} />
        <Route path="/zoom/install" element={<ZoomInstallPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (location.pathname === '/register/billing-details') {
    return <RegisterBillingDetailsPage />
  }

  const pendingRegisterBillingDetailsPath = getPendingRegisterBillingDetailsPath()
  if (pendingRegisterBillingDetailsPath) {
    return <Navigate to={pendingRegisterBillingDetailsPath} replace />
  }

  const isPlatformAdmin = user.role === 'SUPER_ADMIN'
  const canViewCalendar = hasEmployeePermission(user, 'CALENDAR_BOOKINGS_VIEW')
  const canViewClients = hasEmployeePermission(user, 'CLIENTS_VIEW')
  const canViewEmployees = hasAnyEmployeePermission(user, ['EMPLOYEES_VIEW', 'ROLES_PERMISSIONS_VIEW'])
  const canViewServices = hasEmployeePermission(user, 'SERVICES_VIEW')
  const canViewBilling = hasAnyEmployeePermission(user, ['BILLING_INVOICES_VIEW', 'PAYMENTS_VIEW'])
  const canViewWalletBenefits = hasEmployeePermission(user, 'WALLET_BENEFITS_VIEW')
  const canViewReports = hasEmployeePermission(user, 'REPORTS_ANALYTICS_VIEW')
  const canViewInbox = hasEmployeePermission(user, 'INBOX_MESSAGES_VIEW')
  const canViewConfiguration = hasAnyEmployeePermission(user, [
    'SETTINGS_VIEW',
    'SPACES_VIEW',
    'NOTIFICATIONS_VIEW',
    'DELIVERY_LOGS_VIEW',
    'INTEGRATIONS_VIEW',
    'WEBSITE_WIDGET_VIEW',
    'GUEST_MOBILE_APP_VIEW',
  ])
  const billingAllowed = billingModuleEnabled && canViewBilling
  const consumablesAllowed = consumablesModuleEnabled && canViewWalletBenefits
  const inboxAllowed = inboxModuleEnabled && canViewInbox
  const canScanWalletEntitlements = scannerModuleEnabled && hasAnyEmployeePermission(user, ['WALLET_ENTITLEMENT_SCAN', 'SCANNER_VIEW', 'SCANNER_CREATE', 'SCANNER_EDIT'])
  const preferredFallbackRoute = getDefaultAllowedRoute(user.packageType)
  const routeCandidates = [
    { path: '/calendar', allowed: canViewCalendar },
    { path: '/clients', allowed: canViewClients },
    { path: '/billing', allowed: billingAllowed },
    { path: '/inbox', allowed: inboxAllowed },
    { path: '/analytics', allowed: canViewReports },
    { path: '/session-types', allowed: canViewServices },
    { path: '/consultants', allowed: canViewEmployees },
    { path: '/configuration', allowed: canViewConfiguration },
    { path: '/scanner', allowed: canScanWalletEntitlements },
  ]
  const preferredCandidate = routeCandidates.find((candidate) => candidate.path === preferredFallbackRoute && candidate.allowed)
  const fallbackRoute = preferredCandidate?.path ?? routeCandidates.find((candidate) => candidate.allowed)?.path ?? (user.role === 'CONSULTANT' ? '/my-profile' : '/help')

  return (
    <Shell>
      <Suspense fallback={<div className="content content-android-native" style={{ padding: 24 }}>{copy.loading}</div>}>
        <Routes>
          <Route path="/" element={<Navigate to={fallbackRoute} replace />} />
          <Route path="/calendar/*" element={canViewCalendar ? <CalendarPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/sessions" element={<Navigate to={canViewCalendar ? '/calendar' : fallbackRoute} replace />} />
          <Route path="/sessions/booked" element={<Navigate to={canViewCalendar ? '/calendar' : fallbackRoute} replace />} />
          <Route path="/sessions/bookable" element={<Navigate to={canViewCalendar ? '/calendar' : fallbackRoute} replace />} />
          <Route path="/clients" element={canViewClients ? <ClientsPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route
            path="/scanner"
            element={canScanWalletEntitlements ? <WalletScannerPage /> : <Navigate to={fallbackRoute} replace />}
          />
          <Route
            path="/consultants"
            element={canViewEmployees ? <ConsultantsPage /> : <Navigate to={fallbackRoute} replace />}
          />
          <Route
            path="/my-profile"
            element={user.role === 'CONSULTANT' ? <ConsultantsPage selfService /> : <Navigate to={fallbackRoute} replace />}
          />
          <Route path="/billing" element={billingAllowed ? <BillingPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/open-bills/:openBillId/edit" element={billingAllowed ? <BillingPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/billing/open-bills/:openBillId/edit" element={billingAllowed ? <BillingPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/consumables" element={consumablesAllowed ? <ConsumablesPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/analytics" element={canViewReports ? <AnalyticsPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/inbox" element={inboxAllowed ? <InboxPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/configuration" element={canViewConfiguration ? <ConfigurationPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route
            path="/session-types"
            element={canViewServices ? <SessionTypesPage /> : <Navigate to={fallbackRoute} replace />}
          />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/platform-admin" element={isPlatformAdmin ? <PlatformAdminPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/zoom/install" element={<ZoomInstallPage />} />
          <Route
            path="/security"
            element={
              canViewConfiguration ? (
                <Navigate to="/configuration?tab=company&subtab=security" replace />
              ) : (
                <SecurityPage />
              )
            }
          />
          <Route path="/settings" element={<Navigate to={canViewConfiguration ? (user.role === 'CONSULTANT' ? '/configuration?tab=integrations' : '/configuration') : fallbackRoute} replace />} />
          <Route path="/sessions/spaces" element={<Navigate to={canViewConfiguration ? '/configuration?tab=booking' : fallbackRoute} replace />} />
          <Route path="/sessions/types" element={<Navigate to={canViewServices ? '/session-types' : fallbackRoute} replace />} />
          <Route path="*" element={<Navigate to={fallbackRoute} replace />} />
        </Routes>
      </Suspense>
    </Shell>
  )
}
