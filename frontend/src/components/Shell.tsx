import { Capacitor } from '@capacitor/core'
import { PropsWithChildren, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { applyTheme, clearAuthStoragePreservingTheme, getStoredTheme, type ThemeMode } from '../theme'
import { useLocale } from '../locale'
import { LanguageModal } from './LanguageModal'
import { CalendarShellHeaderProvider, useCalendarShellHeader } from '../calendarHeaderContext'

const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

function AndroidNavIconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
function AndroidNavIconAnalytics() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="M7 16l4-8 4 5 4-6" />
    </svg>
  )
}
function AndroidNavIconBilling() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  )
}
function AndroidNavIconClients() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

/** Staggered bars (middle shorter, left-aligned) — white on colored trigger button */
function IconMobileMenuBars() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="5" y1="7.5" x2="19" y2="7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="16.5" x2="19" y2="16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconConfigGear() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function Shell({ children }: PropsWithChildren) {
  return (
    <CalendarShellHeaderProvider>
      <ShellInner>{children}</ShellInner>
    </CalendarShellHeaderProvider>
  )
}

function ShellInner({ children }: PropsWithChildren) {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useLocale()
  const user = getStoredUser()!
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())
  const [companyName, setCompanyName] = useState('Company')
  const [aiBookingEnabled, setAiBookingEnabled] = useState(true)
  const [overdueTodoCount, setOverdueTodoCount] = useState(0)
  const [todos, setTodos] = useState<any[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [languageModalOpen, setLanguageModalOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)
  const { slots: calendarShellSlots } = useCalendarShellHeader()
  const isCalendarRoute = location.pathname === '/calendar'

  const localDateStr = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  /** Bell list: overdue todos + today's todos (narrow calendar range, not full month). */
  const loadOverdue = () => {
    api.get('/bookings/todos/overdue-count').then((r) => setOverdueTodoCount(r.data.count)).catch(() => setOverdueTodoCount(0))
    const todayStr = localDateStr(new Date())
    Promise.all([
      api.get('/bookings/todos/overdue').catch(() => ({ data: [] as any[] })),
      api.get('/bookings/calendar', { params: { from: todayStr, to: todayStr } }).catch(() => ({ data: { todos: [] as any[] } })),
    ])
      .then(([overdueRes, calRes]) => {
        const overdueList: any[] = overdueRes.data ?? []
        const todayTodos: any[] = calRes.data?.todos ?? []
        const byId = new Map<number, any>()
        for (const t of overdueList) byId.set(t.id, t)
        for (const t of todayTodos) byId.set(t.id, t)
        setTodos(Array.from(byId.values()))
      })
      .catch(() => setTodos([]))
  }

  useEffect(() => {
    loadOverdue()
    const interval = window.setInterval(loadOverdue, 60000)
    window.addEventListener('todos-updated', loadOverdue)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('todos-updated', loadOverdue)
    }
  }, [])

  const loadCompanyName = () => {
    api
      .get('/settings')
      .then((r) => {
        const settingsData = r.data || {}
        const configuredName = String(settingsData.COMPANY_NAME || '').trim()
        setCompanyName(configuredName || 'Company')
        setAiBookingEnabled(settingsData.AI_BOOKING_ENABLED !== 'false')
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadCompanyName()
    const onSettings = () => loadCompanyName()
    window.addEventListener('settings-updated', onSettings)
    return () => window.removeEventListener('settings-updated', onSettings)
  }, [])

  /** Keep bottom tabs fixed: only the main column scrolls, not the whole WebView. */
  useEffect(() => {
    if (!isNativeAndroid) return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
      if (configRef.current && !configRef.current.contains(e.target as Node)) setConfigOpen(false)
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false)
    }
    if (bellOpen || configOpen || accountOpen) document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [bellOpen, configOpen, accountOpen])

  useLayoutEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileNavOpen])

  const completeTodo = async (id: number) => {
    await api.delete(`/bookings/todos/${id}`)
    window.dispatchEvent(new Event('todos-updated'))
  }

  const openTodo = (id: number, anchorEl?: HTMLElement | null) => {
    const anchorRect = anchorEl
      ? {
          left: anchorEl.getBoundingClientRect().left,
          right: anchorEl.getBoundingClientRect().right,
          top: anchorEl.getBoundingClientRect().top,
          bottom: anchorEl.getBoundingClientRect().bottom,
        }
      : null
    const payload = {
      todoId: id,
      anchorRect,
    }
    if (location.pathname === '/calendar') {
      window.dispatchEvent(new CustomEvent('open-calendar-todo', { detail: payload }))
    } else {
      try {
        sessionStorage.setItem('openCalendarTodo', JSON.stringify(payload))
      } catch {
        // ignore storage errors
      }
      navigate('/calendar')
    }
  }

  const setLightMode = () => {
    applyTheme('light')
    setTheme('light')
  }

  const setDarkMode = () => {
    applyTheme('dark')
    setTheme('dark')
  }

  const logout = () => {
    clearAuthStoragePreservingTheme()
    navigate('/')
    window.location.reload()
  }

  const triggerGlobalVoice = () => {
    const fire = () => window.dispatchEvent(new Event('global-voice-start'))
    if (location.pathname !== '/calendar') {
      navigate('/calendar')
      // Fire twice to cover route transition timing.
      window.setTimeout(fire, 240)
      window.setTimeout(fire, 700)
      return
    }
    fire()
  }

  const globalVoiceButton = aiBookingEnabled && location.pathname !== '/calendar'
    ? createPortal(
      <button
        type="button"
        className={`global-voice-fab${isNativeAndroid ? ' global-voice-fab--android' : ''}`}
        onClick={triggerGlobalVoice}
        aria-label="Glasovno rezerviranje"
        title="Glasovno rezerviranje"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>,
      document.body
    )
    : null

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const visibleTodos = todos
    .filter((t: any) => {
      const d = new Date(t.startTime)
      if (Number.isNaN(d.getTime())) return false
      const isOverdue = d < now
      const isToday = d >= startOfToday && d < endOfToday
      return isOverdue || isToday
    })
    .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  const showHeaderTodo = !isNativeAndroid

  const displayName = `${user.firstName} ${user.lastName}`.trim()
  const initials =
    `${(user.firstName?.[0] || '').toUpperCase()}${(user.lastName?.[0] || '').toUpperCase()}` || '?'

  const mobileNavTrigger = (
    <button
      type="button"
      className="app-header-mobile-nav-trigger"
      onClick={() => setMobileNavOpen(true)}
      aria-label={t('mobileNavMenu')}
      title={t('mobileNavMenu')}
    >
      <IconMobileMenuBars />
    </button>
  )

  /** Close drawer immediately only when re-tapping the current route; otherwise wait for pathname change (avoids a frame of old page under the overlay). */
  const closeMobileNavIfAlreadyOn = (path: string) => {
    if (location.pathname === path) setMobileNavOpen(false)
  }

  const mobileNavOverlay =
    mobileNavOpen &&
    createPortal(
      <div className="mobile-nav-overlay" role="dialog" aria-modal="true" aria-label={t('mobileNavMenu')}>
        <header className="mobile-nav-overlay-header">
          <span className="mobile-nav-overlay-brand">{companyName}</span>
          <button
            type="button"
            className="mobile-nav-overlay-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label={t('mobileNavClose')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="mobile-nav-overlay-body">
          <NavLink
            to="/calendar"
            className={({ isActive }) => `mobile-nav-overlay-link${isActive ? ' active' : ''}`}
            onClick={() => closeMobileNavIfAlreadyOn('/calendar')}
          >
            <span className="mobile-nav-overlay-link-icon">
              <AndroidNavIconCalendar />
            </span>
            <span className="mobile-nav-overlay-link-label">{t('navCalendar')}</span>
          </NavLink>
          <NavLink
            to="/clients"
            className={({ isActive }) => `mobile-nav-overlay-link${isActive ? ' active' : ''}`}
            onClick={() => closeMobileNavIfAlreadyOn('/clients')}
          >
            <span className="mobile-nav-overlay-link-icon">
              <AndroidNavIconClients />
            </span>
            <span className="mobile-nav-overlay-link-label">{t('navClients')}</span>
          </NavLink>
          <NavLink
            to="/billing"
            className={({ isActive }) => `mobile-nav-overlay-link${isActive ? ' active' : ''}`}
            onClick={() => closeMobileNavIfAlreadyOn('/billing')}
          >
            <span className="mobile-nav-overlay-link-icon">
              <AndroidNavIconBilling />
            </span>
            <span className="mobile-nav-overlay-link-label">{t('navBilling')}</span>
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) => `mobile-nav-overlay-link${isActive ? ' active' : ''}`}
            onClick={() => closeMobileNavIfAlreadyOn('/analytics')}
          >
            <span className="mobile-nav-overlay-link-icon">
              <AndroidNavIconAnalytics />
            </span>
            <span className="mobile-nav-overlay-link-label">{t('navAnalytics')}</span>
          </NavLink>
          <div className="mobile-nav-overlay-section-label">{t('mobileNavSectionSettings')}</div>
          <NavLink
            to="/configuration"
            className={({ isActive }) => `mobile-nav-overlay-link mobile-nav-overlay-link--sub${isActive ? ' active' : ''}`}
            onClick={() => closeMobileNavIfAlreadyOn('/configuration')}
          >
            <span className="mobile-nav-overlay-link-icon">
              <IconConfigGear />
            </span>
            <span className="mobile-nav-overlay-link-label">{t('configTitle')}</span>
          </NavLink>
          <button
            type="button"
            className="mobile-nav-overlay-link mobile-nav-overlay-link--sub mobile-nav-overlay-link--button"
            onClick={() => {
              setLanguageModalOpen(true)
              setMobileNavOpen(false)
            }}
          >
            <span className="mobile-nav-overlay-link-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </span>
            <span className="mobile-nav-overlay-link-label">{t('language')}</span>
          </button>
          <button
            type="button"
            className="mobile-nav-overlay-link mobile-nav-overlay-link--sub mobile-nav-overlay-link--button"
            onClick={() => {
              if (theme === 'light') setDarkMode()
              else setLightMode()
              setMobileNavOpen(false)
            }}
          >
            <span className="mobile-nav-overlay-link-icon">
              {theme === 'dark' ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3c0 0 0 0 0 0A7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </span>
            <span className="mobile-nav-overlay-link-label">{theme === 'dark' ? t('lightMode') : t('darkMode')}</span>
          </button>
        </div>
        <footer className="mobile-nav-overlay-footer">
          <a
            className="mobile-nav-overlay-support"
            href="mailto:dmirc@hosp-it.eu"
            onClick={() => setMobileNavOpen(false)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
            <span>{t('support')}</span>
          </a>
          <div className="mobile-nav-overlay-user">
            <span className="clients-name-avatar mobile-nav-overlay-user-avatar" aria-hidden>
              {initials}
            </span>
            <div className="mobile-nav-overlay-user-text">
              <div className="mobile-nav-overlay-user-name">{displayName}</div>
              <div className="mobile-nav-overlay-user-email">{user.email}</div>
            </div>
          </div>
          <button
            type="button"
            className="mobile-nav-overlay-logout"
            onClick={() => {
              setMobileNavOpen(false)
              logout()
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t('logout')}
          </button>
        </footer>
      </div>,
      document.body,
    )

  const calendarTodoBell =
    showHeaderTodo ? (
      <div className="notification-bell-wrap" ref={bellRef}>
        <button
          type="button"
          className="notification-bell"
          onClick={() => {
            setBellOpen((o) => !o)
            setConfigOpen(false)
            setAccountOpen(false)
          }}
          title={t('calendarTodoTasks')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M22 5.18 10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83L20.59 3.76 22 5.18ZM19.79 11.22c.05.25.05.51.05.78 0 4.31-3.48 7.8-7.79 7.8s-7.79-3.49-7.79-7.8 3.48-7.8 7.79-7.8c1.08 0 2.11.22 3.06.62l1.57-1.57A9.86 9.86 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-.8-.1-1.58-.29-2.33l-1.92 1.55Z" />
          </svg>
          {overdueTodoCount > 0 && <span className="notification-badge">{overdueTodoCount}</span>}
        </button>
        {bellOpen && (
          <div className="notification-dropdown">
            <div className="notification-dropdown-title">{t('calendarTodoTasksToComplete')}</div>
            {visibleTodos.length === 0 ? (
              <div className="notification-empty">{t('calendarNoTasks')}</div>
            ) : (
              <ul className="notification-list">
                {visibleTodos.map((todo: any) => (
                  <li
                    key={todo.id}
                    className="notification-item"
                    onClick={(e) => openTodo(todo.id, e.currentTarget as HTMLElement)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') openTodo(todo.id, e.currentTarget as HTMLElement)
                    }}
                  >
                    <span className="notification-task" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {todo.task}
                      {new Date(todo.startTime) < now && (
                        <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.75rem', letterSpacing: 0.2 }}>
                          {t('calendarTodoOverdue')}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="notification-complete-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        completeTodo(todo.id)
                      }}
                      title="Mark as complete"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    ) : null

  const headerActionsRest = (
    <>
      <div className="config-cog-wrap" ref={configRef}>
        <button
          type="button"
          className="config-cog"
          onClick={() => { setConfigOpen((o) => !o); setBellOpen(false); setAccountOpen(false) }}
          title="Configuration"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        {configOpen && (
          <div className="config-dropdown">
            <button type="button" className="config-dropdown-item" onClick={() => { navigate('/configuration'); setConfigOpen(false) }}>
              {t('settingsGroup')}
            </button>
            <button
              type="button"
              className="config-dropdown-item"
              onClick={() => {
                setConfigOpen(false)
                setLanguageModalOpen(true)
              }}
            >
              {t('language')}
            </button>
            <button
              type="button"
              className="config-dropdown-item"
              onClick={() => {
                if (theme === 'light') setDarkMode()
                else setLightMode()
                setConfigOpen(false)
              }}
            >
              {theme === 'dark' ? t('lightMode') : t('darkMode')}
            </button>
          </div>
        )}
      </div>
      <div className="header-credentials-wrap" ref={accountRef}>
        <button
          type="button"
          className="header-credentials-trigger"
          onClick={() => { setAccountOpen((o) => !o); setBellOpen(false); setConfigOpen(false) }}
          title={displayName}
          aria-expanded={accountOpen}
          aria-haspopup="dialog"
        >
          <span className="clients-name-avatar header-credentials-avatar" aria-hidden>
            {initials}
          </span>
        </button>
        {accountOpen && (
          <div className="credentials-popover" role="dialog" aria-label={displayName}>
            <div className="credentials-popover-header">{displayName}</div>
            <div className="credentials-popover-body">
              <div className="credentials-popover-user">
                <span className="clients-name-avatar credentials-popover-avatar" aria-hidden>
                  {initials}
                </span>
                <div className="credentials-popover-user-text">
                  <div className="credentials-popover-name">{displayName}</div>
                  <div className="credentials-popover-email">{user.email}</div>
                </div>
              </div>
              <div className="credentials-popover-divider" aria-hidden />
              <div className="credentials-popover-actions">
                <div className="credentials-popover-actions-title">{t('actions')}</div>
                <button
                  type="button"
                  className="credentials-popover-action-btn"
                  onClick={() => {
                    setAccountOpen(false)
                    logout()
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  {t('logout')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )

  const headerActions = (
    <div className="header-actions header-icons">
      {calendarTodoBell}
      {headerActionsRest}
    </div>
  )

  /** Narrow calendar: mode (optional) + view dropdown + todo + utilities */
  const calendarMobileHeaderToolbar =
    calendarShellSlots && calendarShellSlots.showMobileToolbar ? (
      <>
        {calendarShellSlots.modeGroup}
        {calendarShellSlots.viewDropdown}
        {calendarTodoBell}
        <div className="header-actions header-icons">{headerActionsRest}</div>
      </>
    ) : null

  if (isNativeAndroid) {
    return (
      <div className="layout-android">
        <div className="main-area main-area-android">
          <main className="content content-android-native">{children}</main>
        </div>
        {globalVoiceButton}
        <nav className="android-bottom-nav" aria-label="Main navigation">
          <NavLink to="/calendar" className={({ isActive }) => `android-nav-item${isActive ? ' active' : ''}`}>
            <AndroidNavIconCalendar />
            <span>Calendar</span>
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => `android-nav-item${isActive ? ' active' : ''}`}>
            <AndroidNavIconAnalytics />
            <span>Analytics</span>
          </NavLink>
          <NavLink to="/billing" className={({ isActive }) => `android-nav-item${isActive ? ' active' : ''}`}>
            <AndroidNavIconBilling />
            <span>Billing</span>
          </NavLink>
          <NavLink to="/clients" className={({ isActive }) => `android-nav-item${isActive ? ' active' : ''}`}>
            <AndroidNavIconClients />
            <span>Clients</span>
          </NavLink>
        </nav>
      </div>
    )
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <nav>
          <NavLink to="/calendar" title="Calendar" aria-label="Calendar">
            <AndroidNavIconCalendar />
          </NavLink>
          <NavLink to="/clients" title="Clients" aria-label="Clients">
            <AndroidNavIconClients />
          </NavLink>
          <NavLink to="/billing" title="Billing" aria-label="Billing">
            <AndroidNavIconBilling />
          </NavLink>
          <NavLink to="/analytics" title="Analytics" aria-label="Analytics">
            <AndroidNavIconAnalytics />
          </NavLink>
        </nav>
        <a
          className="sidebar-support"
          href="mailto:dmirc@hosp-it.eu"
          title={t('support')}
          aria-label={t('supportEmailHint')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
        </a>
      </aside>
      <div className={isCalendarRoute ? 'main-area main-area--calendar' : 'main-area'}>
        <header
          className={
            isCalendarRoute && calendarShellSlots
              ? 'app-header app-header--calendar'
              : 'app-header'
          }
        >
          {isCalendarRoute && calendarShellSlots ? (
            <>
              <div className="app-header-calendar-left">
                {mobileNavTrigger}
                <div className="app-header-brand app-header-brand--calendar" title={companyName}>
                  {companyName}
                </div>
                {calendarShellSlots.left}
              </div>
              <div className="app-header-calendar-center">{calendarShellSlots.center}</div>
              <div className="app-header-calendar-right">
                {calendarShellSlots.filters}
                {calendarMobileHeaderToolbar ?? (
                  <>
                    {calendarShellSlots.viewDropdown}
                    {headerActions}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="app-header-mobile-leading">
                {mobileNavTrigger}
                <div className="app-header-brand">{companyName}</div>
              </div>
              {headerActions}
            </>
          )}
        </header>
        <main className={isCalendarRoute ? 'content content--calendar-flush' : 'content'}>{children}</main>
      </div>
      {mobileNavOverlay}
      {globalVoiceButton}
      {languageModalOpen && <LanguageModal onClose={() => setLanguageModalOpen(false)} />}
    </div>
  )
}
