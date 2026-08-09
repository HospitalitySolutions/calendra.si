import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
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
import { PublicBookingManagePage } from './pages/PublicBookingManagePage'
import { PublicDemoBookingManagePage } from './pages/PublicDemoBookingManagePage'
import { PublicWaitlistOfferPage } from './pages/PublicWaitlistOfferPage'
import { ReceivedInvoiceDownloadPage, ReceivedInvoicesRedirectPage } from './pages/ReceivedInvoiceDownloadPage'
import { Shell } from './components/Shell'
import { useLocale } from './locale'
import { getDefaultAllowedRoute } from './lib/packageAccess'
import { hasAnyEmployeePermission, hasEmployeePermission } from './lib/employeePermissions'
import { storeAuthenticatedSession } from './lib/session'
import { startClockSync, stopClockSync } from './lib/clock'
import { clearAuthStoragePreservingTheme } from './theme'
import { AuthenticatedUserProvider } from './authUserContext'
import { clearActiveUnitId, getActiveUnitId } from './lib/unitContext'
import { isWorkspaceRolloutEnabled } from './lib/workspaceRollout'
import { moduleCapabilitiesQueryOptions, settingsQueryOptions } from './queries/sharedQueryOptions'
import { markNavigationRendered, markNavigationStart } from './lib/performanceMonitor'
import { sameNavigationFamily } from './queries/navigationRouteFamily'

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
        return new Promise<never>(() => {
          // The browser is reloading; keep the lazy import pending until navigation completes.
        })
      }

      throw error
    }
  })
}

const importCalendarPage = () => import('./pages/CalendarPage')
const importAnalyticsPage = () => import('./pages/AnalyticsPage')
const importWorkspaceAnalyticsPage = () => import('./pages/WorkspaceAnalyticsPage')
const importInboxPage = () => import('./pages/InboxPage')
const importBillingPage = () => import('./pages/BillingPage')
const importClientsPage = () => import('./pages/ClientsPage')
const importAppointmentsPage = () => import('./pages/AppointmentsPage')
const importConfigurationPage = () => import('./pages/ConfigurationPage')
const importConsultantsPage = () => import('./pages/ConsultantsPage')
const importSessionTypesPage = () => import('./pages/SessionTypesPage')
const importWalletScannerPage = () => import('./pages/WalletScannerPage')
const importConsumablesPage = () => import('./pages/ConsumablesPage')
const importNotificationsPage = () => import('./pages/NotificationsPage')
const importSecurityPage = () => import('./pages/SecurityPage')
const importPlatformAdminPage = () => import('./pages/PlatformAdminPage')
const importHelpPage = () => import('./pages/HelpPage')

const routeModulePrefetchers: Array<{ matches: (pathname: string) => boolean; load: () => Promise<unknown> }> = [
  { matches: (pathname) => pathname === '/calendar' || pathname.startsWith('/calendar/'), load: importCalendarPage },
  { matches: (pathname) => pathname === '/clients' || pathname.startsWith('/clients/'), load: importClientsPage },
  { matches: (pathname) => pathname === '/appointments' || pathname.startsWith('/appointments/'), load: importAppointmentsPage },
  { matches: (pathname) => pathname === '/session-types' || pathname.startsWith('/session-types/'), load: importSessionTypesPage },
  { matches: (pathname) => pathname === '/consultants' || pathname.startsWith('/consultants/'), load: importConsultantsPage },
  { matches: (pathname) => pathname === '/billing' || pathname.startsWith('/billing/') || pathname.startsWith('/open-bills/'), load: importBillingPage },
  { matches: (pathname) => pathname === '/analytics', load: importAnalyticsPage },
  { matches: (pathname) => pathname === '/analytics/workspace', load: importWorkspaceAnalyticsPage },
  { matches: (pathname) => pathname === '/inbox' || pathname.startsWith('/inbox/'), load: importInboxPage },
  { matches: (pathname) => pathname === '/configuration' || pathname.startsWith('/configuration/'), load: importConfigurationPage },
  { matches: (pathname) => pathname === '/consumables' || pathname.startsWith('/consumables/'), load: importConsumablesPage },
  { matches: (pathname) => pathname === '/scanner' || pathname.startsWith('/scanner/'), load: importWalletScannerPage },
  { matches: (pathname) => pathname === '/notifications' || pathname.startsWith('/notifications/'), load: importNotificationsPage },
  { matches: (pathname) => pathname === '/security' || pathname.startsWith('/security/'), load: importSecurityPage },
  { matches: (pathname) => pathname === '/platform-admin' || pathname.startsWith('/platform-admin/'), load: importPlatformAdminPage },
  { matches: (pathname) => pathname === '/help' || pathname.startsWith('/help/'), load: importHelpPage },
]
const prefetchedRouteModules = new Set<() => Promise<unknown>>()

function prefetchRouteModule(pathname: string) {
  const entry = routeModulePrefetchers.find((candidate) => candidate.matches(pathname))
  if (!entry || prefetchedRouteModules.has(entry.load)) return
  prefetchedRouteModules.add(entry.load)
  void entry.load().catch(() => {
    // Allow a later navigation attempt to retry a transient chunk download failure.
    prefetchedRouteModules.delete(entry.load)
  })
}

const CalendarPage = lazyWithReload(() => importCalendarPage(), CHUNK_RELOAD_KEY)
const AnalyticsPage = lazyWithReload(() => importAnalyticsPage().then((mod) => ({ default: mod.AnalyticsPage })), CHUNK_RELOAD_KEY)
const WorkspaceAnalyticsPage = lazyWithReload(() => importWorkspaceAnalyticsPage().then((mod) => ({ default: mod.WorkspaceAnalyticsPage })), CHUNK_RELOAD_KEY)
const InboxPage = lazyWithReload(() => importInboxPage().then((mod) => ({ default: mod.InboxPage })), CHUNK_RELOAD_KEY)
const BillingPage = lazyWithReload(() => importBillingPage().then((mod) => ({ default: mod.BillingPage })), CHUNK_RELOAD_KEY)
const ClientsPage = lazyWithReload(() => importClientsPage().then((mod) => ({ default: mod.ClientsPage })), CHUNK_RELOAD_KEY)
const AppointmentsPage = lazyWithReload(() => importAppointmentsPage().then((mod) => ({ default: mod.AppointmentsPage })), CHUNK_RELOAD_KEY)
const ConfigurationPage = lazyWithReload(() => importConfigurationPage().then((mod) => ({ default: mod.ConfigurationPage })), CHUNK_RELOAD_KEY)
const ConsultantsPage = lazyWithReload(() => importConsultantsPage().then((mod) => ({ default: mod.ConsultantsPage })), CHUNK_RELOAD_KEY)
const SecurityPage = lazyWithReload(() => importSecurityPage().then((mod) => ({ default: mod.SecurityPage })), CHUNK_RELOAD_KEY)
const PlatformAdminPage = lazyWithReload(() => importPlatformAdminPage().then((mod) => ({ default: mod.PlatformAdminPage })), CHUNK_RELOAD_KEY)
const HelpPage = lazyWithReload(() => importHelpPage().then((mod) => ({ default: mod.HelpPage })), CHUNK_RELOAD_KEY)
const SessionTypesPage = lazyWithReload(() => importSessionTypesPage().then((mod) => ({ default: mod.SessionTypesPage })), CHUNK_RELOAD_KEY)
const WalletScannerPage = lazyWithReload(() => importWalletScannerPage().then((mod) => ({ default: mod.WalletScannerPage })), CHUNK_RELOAD_KEY)
const ConsumablesPage = lazyWithReload(() => importConsumablesPage().then((mod) => ({ default: mod.ConsumablesPage })), CHUNK_RELOAD_KEY)
const NotificationsPage = lazyWithReload(() => importNotificationsPage().then((mod) => ({ default: mod.NotificationsPage })), CHUNK_RELOAD_KEY)

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
  const [waitlistModuleEnabled, setWaitlistModuleEnabled] = useState(false)
  const [consumablesModuleEnabled, setConsumablesModuleEnabled] = useState(true)
  const activeQueryUnitId = user?.activeUnitId ?? user?.companyId ?? null
  const appSettingsQuery = useQuery({
    ...settingsQueryOptions(activeQueryUnitId),
    enabled: Boolean(user),
  })
  const moduleCapabilitiesQuery = useQuery({
    ...moduleCapabilitiesQueryOptions(activeQueryUnitId),
    enabled: Boolean(user),
  })


  useEffect(() => {
    const genericConflict = locale === 'sl'
      ? 'Zahtevane spremembe ni mogoče izvesti, ker je v navzkrižju z obstoječimi podatki.'
      : locale === 'sr'
        ? 'Traženu izmenu nije moguće izvršiti jer je u konfliktu sa postojećim podacima.'
        : 'The requested change conflicts with existing data.'
    registerConflict409Handler((msg) => showToast('error', msg && msg.trim().toLowerCase() !== 'conflict' ? msg : genericConflict))
    return () => registerConflict409Handler(null)
  }, [locale, showToast])

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
    if (!user || typeof document === 'undefined') return

    const HOVER_INTENT_MS = 90
    let hoverTimer: number | null = null
    let hoverAnchor: HTMLAnchorElement | null = null

    const clearHoverIntent = () => {
      if (hoverTimer != null) window.clearTimeout(hoverTimer)
      hoverTimer = null
      hoverAnchor = null
    }

    const resolveAnchor = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return null
      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.hasAttribute('download')) return null
      if (anchor.target && anchor.target !== '_self') return null
      try {
        const url = new URL(anchor.href, window.location.href)
        if (url.origin !== window.location.origin) return null
        return { anchor, url }
      } catch {
        return null
      }
    }

    const prefetchDestination = (pathname: string, priority: 'intent' | 'commit') => {
      // Always warm the destination chunk. Some routes in the same data family
      // (for example Analytics vs Workspace Analytics) are separate lazy modules.
      prefetchRouteModule(pathname)
      if (sameNavigationFamily(location.pathname, pathname)) return
      // Keep the data-prefetch planner out of the already tight main bundle.
      // Hover/focus intent gives the tiny planner chunk time to load before click,
      // while pointer-down still deduplicates any in-flight destination queries.
      void import('./queries/navigationPrefetch')
        .then(({ prefetchNavigationData }) => prefetchNavigationData(pathname, {
          unitId: activeQueryUnitId,
          user: {
            id: user.id,
            role: user.role,
            companyId: user.companyId,
            tenantCode: user.tenantCode,
          },
          priority,
        }))
        .catch(() => undefined)
    }

    const onPointerOver = (event: PointerEvent) => {
      const resolved = resolveAnchor(event)
      if (!resolved || resolved.anchor === hoverAnchor) return
      clearHoverIntent()
      hoverAnchor = resolved.anchor
      hoverTimer = window.setTimeout(() => {
        hoverTimer = null
        prefetchDestination(resolved.url.pathname, 'intent')
      }, HOVER_INTENT_MS)
    }

    const onPointerOut = (event: PointerEvent) => {
      if (!hoverAnchor) return
      const related = event.relatedTarget
      if (related instanceof Node && hoverAnchor.contains(related)) return
      const target = event.target
      if (target instanceof Node && hoverAnchor.contains(target)) clearHoverIntent()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const resolved = resolveAnchor(event)
      if (!resolved) return
      clearHoverIntent()
      if (location.pathname !== resolved.url.pathname) markNavigationStart(resolved.url.pathname)
      prefetchDestination(resolved.url.pathname, 'commit')
    }

    const onFocusIn = (event: FocusEvent) => {
      const resolved = resolveAnchor(event)
      if (!resolved) return
      prefetchDestination(resolved.url.pathname, 'intent')
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const resolved = resolveAnchor(event)
      if (!resolved) return
      if (location.pathname !== resolved.url.pathname) markNavigationStart(resolved.url.pathname)
      prefetchDestination(resolved.url.pathname, 'commit')
    }

    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('pointerout', onPointerOut, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      clearHoverIntent()
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('pointerout', onPointerOut, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [activeQueryUnitId, location.pathname, user])

  useEffect(() => {
    void ensureCsrfToken().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!user) {
      setBillingModuleEnabled(true)
      setInboxModuleEnabled(true)
      setScannerModuleEnabled(true)
      setWaitlistModuleEnabled(false)
      return
    }

    if (appSettingsQuery.data) {
      setBillingModuleEnabled(appSettingsQuery.data.BILLING_ENABLED !== 'false')
      setInboxModuleEnabled(appSettingsQuery.data.INBOX_ENABLED !== 'false')
      setScannerModuleEnabled(appSettingsQuery.data.SCANNER_MODULE_ENABLED !== 'false')
      setWaitlistModuleEnabled(appSettingsQuery.data.WAITLIST_ENABLED === 'true')
    } else if (appSettingsQuery.isError) {
      setBillingModuleEnabled(true)
      setInboxModuleEnabled(true)
      setScannerModuleEnabled(true)
      setWaitlistModuleEnabled(false)
    }
  }, [appSettingsQuery.data, appSettingsQuery.isError, user])

  useEffect(() => {
    if (!user) {
      setConsumablesModuleEnabled(true)
      return
    }
    if (moduleCapabilitiesQuery.data) {
      setConsumablesModuleEnabled(moduleCapabilitiesQuery.data.consumablesEnabled !== false)
    } else if (moduleCapabilitiesQuery.isError) {
      setConsumablesModuleEnabled(true)
    }
  }, [moduleCapabilitiesQuery.data, moduleCapabilitiesQuery.isError, user])

  useEffect(() => {
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => markNavigationRendered(location.pathname))
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)
    }
  }, [location.pathname, location.search])


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

    const resolveSession = async () => {
      try {
        let response
        try {
          response = await api.get('/auth/me')
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 403 && getActiveUnitId() !== null) {
            // The remembered unit may have been removed from this login. Retry once with the server default.
            clearActiveUnitId()
            response = await api.get('/auth/me')
          } else {
            throw error
          }
        }

        if (cancelled) return
        const nextUser = response.data?.user ?? null
        if (nextUser) {
          storeAuthenticatedSession({ user: nextUser })
          setUser(nextUser)
        } else {
          clearAuthStoragePreservingTheme()
          setUser(null)
        }
      } catch (error) {
        if (cancelled) return
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          clearAuthStoragePreservingTheme()
          setUser(null)
          return
        }
        setUser((current) => current)
      } finally {
        if (!cancelled) setAuthResolved(true)
      }
    }

    void resolveSession()
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
  if (location.pathname.startsWith('/public-booking/manage/')) {
    return (
      <Routes>
        <Route path="/public-booking/manage/:token" element={<PublicBookingManagePage />} />
      </Routes>
    )
  }
  if (location.pathname.startsWith('/public-demo-booking/manage/')
      || location.pathname.startsWith('/predstavitev/upravljanje/')
      || location.pathname.startsWith('/en/demo/manage/')) {
    return (
      <Routes>
        <Route path="/public-demo-booking/manage/:token" element={<PublicDemoBookingManagePage />} />
        <Route path="/predstavitev/upravljanje/:token" element={<PublicDemoBookingManagePage />} />
        <Route path="/en/demo/manage/:token" element={<PublicDemoBookingManagePage />} />
      </Routes>
    )
  }
  if (location.pathname.startsWith('/public-waitlist/offer/')) {
    return (
      <Routes>
        <Route path="/public-waitlist/offer/:offerId" element={<PublicWaitlistOfferPage />} />
      </Routes>
    )
  }
  if (location.pathname === '/received-invoices' || location.pathname.startsWith('/received-invoices/')) {
    return (
      <Routes>
        <Route
          path="/received-invoices/:invoiceId/download"
          element={<ReceivedInvoiceDownloadPage user={user} authResolved={authResolved} />}
        />
        <Route
          path="/received-invoices"
          element={<ReceivedInvoicesRedirectPage user={user} authResolved={authResolved} />}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
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
  const canViewAppointments = canViewCalendar || canViewClients
  const canViewEmployees = hasAnyEmployeePermission(user, ['EMPLOYEES_VIEW', 'ROLES_PERMISSIONS_VIEW'])
  const canViewServices = hasEmployeePermission(user, 'SERVICES_VIEW')
  const canViewBilling = hasAnyEmployeePermission(user, ['BILLING_INVOICES_VIEW', 'PAYMENTS_VIEW'])
  const canViewWalletBenefits = hasEmployeePermission(user, 'WALLET_BENEFITS_VIEW')
  const canViewReports = hasEmployeePermission(user, 'REPORTS_ANALYTICS_VIEW')
  const hasWorkspaceAnalyticsFeature = (user.workspaceFeatures == null || user.workspaceFeatures.includes('WORKSPACE_ANALYTICS')) && isWorkspaceRolloutEnabled(user, 'WORKSPACE_ANALYTICS')
  const canViewInbox = hasEmployeePermission(user, 'INBOX_MESSAGES_VIEW')
  const canViewDeliveryLogs = hasEmployeePermission(user, 'DELIVERY_LOGS_VIEW')
  const canViewConfiguration = hasAnyEmployeePermission(user, [
    'SETTINGS_VIEW',
    'SPACES_VIEW',
    'NOTIFICATIONS_VIEW',
    'INTEGRATIONS_VIEW',
    'WEBSITE_WIDGET_VIEW',
    'GUEST_MOBILE_APP_VIEW',
  ])
  const billingAllowed = billingModuleEnabled && canViewBilling
  const appointmentsAllowed = waitlistModuleEnabled && canViewAppointments
  const consumablesAllowed = consumablesModuleEnabled && canViewWalletBenefits
  const inboxAllowed = inboxModuleEnabled && (canViewInbox || canViewDeliveryLogs)
  const canScanWalletEntitlements = scannerModuleEnabled && hasAnyEmployeePermission(user, ['WALLET_ENTITLEMENT_SCAN', 'SCANNER_VIEW', 'SCANNER_CREATE', 'SCANNER_EDIT'])
  const preferredFallbackRoute = getDefaultAllowedRoute(user.packageType)
  const routeCandidates = [
    { path: '/calendar', allowed: canViewCalendar },
    { path: '/clients', allowed: canViewClients },
    { path: '/appointments', allowed: appointmentsAllowed },
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
    <AuthenticatedUserProvider user={user}>
      <Shell user={user}>
        <Suspense fallback={<div className="content content-android-native" style={{ padding: 24 }}>{copy.loading}</div>}>
          <Routes>
          <Route path="/" element={<Navigate to={fallbackRoute} replace />} />
          <Route path="/calendar/*" element={canViewCalendar ? <CalendarPage user={user} /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/sessions" element={<Navigate to={canViewCalendar ? '/calendar' : fallbackRoute} replace />} />
          <Route path="/sessions/booked" element={<Navigate to={canViewCalendar ? '/calendar' : fallbackRoute} replace />} />
          <Route path="/sessions/bookable" element={<Navigate to={canViewCalendar ? '/calendar' : fallbackRoute} replace />} />
          <Route path="/clients" element={canViewClients ? <ClientsPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/appointments" element={appointmentsAllowed ? <AppointmentsPage /> : <Navigate to={fallbackRoute} replace />} />
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
          <Route path="/analytics/workspace" element={canViewReports && hasWorkspaceAnalyticsFeature ? <WorkspaceAnalyticsPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/inbox" element={inboxAllowed ? <InboxPage inboxModuleEnabled={inboxModuleEnabled} /> : <Navigate to={fallbackRoute} replace />} />
          <Route path="/configuration" element={canViewConfiguration ? <ConfigurationPage /> : <Navigate to={fallbackRoute} replace />} />
          <Route
            path="/session-types"
            element={canViewServices ? <SessionTypesPage /> : <Navigate to={fallbackRoute} replace />}
          />
          <Route path="/notifications" element={<NotificationsPage />} />
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
    </AuthenticatedUserProvider>
  )
}
