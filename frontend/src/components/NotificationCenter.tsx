import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'
import { subscribeBookingUpdates } from '../lib/bookingRealtime'

type NotificationPanelTab = 'NOTIFICATIONS' | 'TASKS'

type NotificationItem = {
  key: string
  category: string
  type: string
  severity: string
  title: string
  message: string
  source?: string | null
  actionUrl?: string | null
  entityId?: number | null
  createdAt: string
  unread: boolean
  announcement: boolean
}

type NotificationFeed = {
  items: NotificationItem[]
  unreadCount: number
}

type TodoItem = {
  id: number
  task?: string | null
  startTime?: string | null
}

type NotificationCenterProps = {
  onOpen?: () => void
  todosEnabled?: boolean
  todos?: TodoItem[]
  onOpenTodo?: (id: number, anchorEl?: HTMLElement | null) => void
  onCompleteTodo?: (id: number) => void | Promise<void>
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function TaskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3.5h6M9 9h6M9 13h6M9 17h4" />
    </svg>
  )
}

function NotificationTypeIcon({ type }: { type: string }) {
  const normalized = String(type || '').toUpperCase()
  if (normalized.includes('CREATED')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
      </svg>
    )
  }
  if (normalized.includes('RESCHEDULED') || normalized.includes('UPDATED')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    )
  }
  if (normalized.includes('CANCELLED')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6M15 9l-6 6" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  )
}

function localizedTitle(item: NotificationItem, locale: string) {
  const type = String(item.type || '').toUpperCase()
  if (type === 'BOOKING_CREATED') return locale === 'sl' ? 'Nova rezervacija' : locale === 'sr' ? 'Nova rezervacija' : 'New booking'
  if (type === 'BOOKING_RESCHEDULED' || type === 'BOOKING_UPDATED') return locale === 'sl' ? 'Termin je bil prestavljen' : locale === 'sr' ? 'Termin je pomeren' : 'Booking rescheduled'
  if (type === 'BOOKING_CANCELLED') return locale === 'sl' ? 'Termin je bil odpovedan' : locale === 'sr' ? 'Termin je otkazan' : 'Booking cancelled'
  return item.title
}

function formatRelativeTime(value: string, locale: string) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  const isSl = locale === 'sl'
  const isSr = locale === 'sr'
  if (minutes < 1) return isSl ? 'zdaj' : isSr ? 'sada' : 'now'
  if (minutes < 60) return isSl ? `pred ${minutes} min` : isSr ? `pre ${minutes} min` : `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return isSl ? `pred ${hours} h` : isSr ? `pre ${hours} h` : `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return isSl ? 'včeraj' : isSr ? 'juče' : 'yesterday'
  return new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', {
    day: 'numeric', month: 'short',
  }).format(new Date(timestamp))
}

function formatTodoTime(value: string | null | undefined, locale: string) {
  const date = value ? new Date(value) : null
  if (!date || !Number.isFinite(date.getTime())) return ''

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const time = new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  if (date < now) {
    const datePart = new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    }).format(date)
    return locale === 'sl' ? `Zamujeno · ${datePart}, ${time}` : locale === 'sr' ? `Kasni · ${datePart}, ${time}` : `Overdue · ${datePart}, ${time}`
  }
  if (date >= startOfToday && date < endOfToday) {
    return locale === 'sl' ? `Danes ob ${time}` : locale === 'sr' ? `Danas u ${time}` : `Today at ${time}`
  }
  return new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function NotificationCenter({
  onOpen,
  todosEnabled = true,
  todos = [],
  onOpenTodo,
  onCompleteTodo,
}: NotificationCenterProps) {
  const { locale } = useLocale()
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<NotificationPanelTab>('NOTIFICATIONS')
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unreadCount: 0 })
  const [loading, setLoading] = useState(false)
  const [completingTodoId, setCompletingTodoId] = useState<number | null>(null)

  const copy = useMemo(() => locale === 'sl' ? {
    title: 'Obvestila in naloge', clear: 'Počisti', notifications: 'Obvestila', tasks: 'Naloge',
    emptyNotifications: 'Ni novih obvestil.', emptyTasks: 'Ni nalog za danes ali zamujenih nalog.',
    viewAll: 'Prikaži vse', aria: 'Obvestila in naloge', completeTask: 'Označi kot opravljeno', openTask: 'Odpri nalogo',
  } : locale === 'sr' ? {
    title: 'Obaveštenja i zadaci', clear: 'Očisti', notifications: 'Obaveštenja', tasks: 'Zadaci',
    emptyNotifications: 'Nema novih obaveštenja.', emptyTasks: 'Nema zadataka za danas niti zadataka koji kasne.',
    viewAll: 'Prikaži sve', aria: 'Obaveštenja i zadaci', completeTask: 'Označi kao završeno', openTask: 'Otvori zadatak',
  } : {
    title: 'Notifications and tasks', clear: 'Clear', notifications: 'Notifications', tasks: 'Tasks',
    emptyNotifications: 'No new notifications.', emptyTasks: 'No overdue tasks or tasks for today.',
    viewAll: 'View all', aria: 'Notifications and tasks', completeTask: 'Mark as complete', openTask: 'Open task',
  }, [locale])

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const { data } = await api.get<NotificationFeed>('/notifications', { params: { category: 'ALL', limit: 5 } })
      setFeed({ items: Array.isArray(data?.items) ? data.items : [], unreadCount: Number(data?.unreadCount || 0) })
    } catch {
      // Keep the previous list during transient failures.
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 60_000)
    const unsubscribe = subscribeBookingUpdates(() => window.setTimeout(() => void load(), 250))
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(interval)
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('close-staff-notifications', close)
    return () => window.removeEventListener('close-staff-notifications', close)
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!todosEnabled && tab === 'TASKS') setTab('NOTIFICATIONS')
  }, [tab, todosEnabled])

  const markAllRead = async () => {
    await api.put('/notifications/read-all').catch(() => undefined)
    setFeed((current) => ({
      unreadCount: 0,
      items: current.items.map((item) => ({ ...item, unread: false })),
    }))
  }

  const openItem = async (item: NotificationItem) => {
    if (item.unread) {
      void api.put(`/notifications/${encodeURIComponent(item.key)}/read`).catch(() => undefined)
      setFeed((current) => ({
        unreadCount: Math.max(0, current.unreadCount - 1),
        items: current.items.map((row) => row.key === item.key ? { ...row, unread: false } : row),
      }))
    }
    setOpen(false)
    if (item.actionUrl) navigate(item.actionUrl)
  }

  const openTodo = (todo: TodoItem, anchorEl?: HTMLElement | null) => {
    const id = Number(todo.id)
    if (!Number.isInteger(id) || id <= 0) return
    setOpen(false)
    onOpenTodo?.(id, anchorEl)
  }

  const completeTodo = async (todo: TodoItem) => {
    const id = Number(todo.id)
    if (!Number.isInteger(id) || id <= 0 || completingTodoId === id) return
    setCompletingTodoId(id)
    try {
      await onCompleteTodo?.(id)
    } finally {
      setCompletingTodoId(null)
    }
  }

  const visibleTodos = todosEnabled ? todos : []
  const combinedCount = feed.unreadCount + visibleTodos.length
  const badge = combinedCount > 99 ? '99+' : String(combinedCount)

  return (
    <div className="staff-notification-center" ref={rootRef}>
      <button
        type="button"
        className={`staff-notification-trigger${open ? ' active' : ''}`}
        onClick={() => {
          const nextOpen = !open
          setOpen(nextOpen)
          if (nextOpen) {
            onOpen?.()
            void load(true)
          }
        }}
        aria-label={copy.aria}
        aria-expanded={open}
        title={copy.aria}
      >
        <BellIcon />
        {combinedCount > 0 ? <span className="staff-notification-badge">{badge}</span> : null}
      </button>

      {open ? (
        <section className="staff-notification-panel staff-notification-panel--unified" role="dialog" aria-label={copy.title}>
          <header className="staff-notification-panel-header">
            <h2>{copy.title}</h2>
            {tab === 'NOTIFICATIONS' ? (
              <button type="button" onClick={() => void markAllRead()} disabled={feed.unreadCount === 0}>{copy.clear}</button>
            ) : null}
          </header>

          <div className={`staff-notification-main-tabs${todosEnabled ? '' : ' single'}`} role="tablist" aria-label={copy.title}>
            <button
              type="button"
              className={tab === 'NOTIFICATIONS' ? 'active' : ''}
              onClick={() => setTab('NOTIFICATIONS')}
              role="tab"
              aria-selected={tab === 'NOTIFICATIONS'}
            >
              <BellIcon />
              <span>{copy.notifications}</span>
              <strong>{feed.unreadCount}</strong>
            </button>
            {todosEnabled ? (
              <button
                type="button"
                className={tab === 'TASKS' ? 'active' : ''}
                onClick={() => setTab('TASKS')}
                role="tab"
                aria-selected={tab === 'TASKS'}
              >
                <TaskIcon />
                <span>{copy.tasks}</span>
                <strong>{visibleTodos.length}</strong>
              </button>
            ) : null}
          </div>

          {tab === 'NOTIFICATIONS' ? (
            <div className={`staff-notification-items${loading ? ' loading' : ''}`}>
              {!loading && feed.items.length === 0 ? (
                <div className="staff-notification-empty">{copy.emptyNotifications}</div>
              ) : feed.items.map((item) => (
                <button
                  type="button"
                  className={`staff-notification-item staff-notification-item--${item.type.toLowerCase().replace(/_/g, '-')}${item.unread ? ' unread' : ''}`}
                  key={item.key}
                  onClick={() => void openItem(item)}
                >
                  <span className="staff-notification-item-icon"><NotificationTypeIcon type={item.type} /></span>
                  <span className="staff-notification-item-copy">
                    <strong>{localizedTitle(item, locale)}</strong>
                    <span>{item.message}</span>
                  </span>
                  <span className="staff-notification-item-meta">
                    <time>{formatRelativeTime(item.createdAt, locale)}</time>
                    {item.unread ? <i aria-label="Unread" /> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="staff-notification-task-items">
              {visibleTodos.length === 0 ? (
                <div className="staff-notification-empty">{copy.emptyTasks}</div>
              ) : visibleTodos.map((todo) => {
                const id = Number(todo.id)
                const isOverdue = Boolean(todo.startTime && new Date(todo.startTime).getTime() < Date.now())
                return (
                  <div className={`staff-notification-task-item${isOverdue ? ' overdue' : ''}`} key={id}>
                    <button
                      type="button"
                      className="staff-notification-task-open"
                      onClick={(event) => openTodo(todo, event.currentTarget)}
                      aria-label={copy.openTask}
                    >
                      <span className="staff-notification-task-icon"><TaskIcon /></span>
                      <span className="staff-notification-task-copy">
                        <strong>{String(todo.task || '').trim() || copy.tasks}</strong>
                        <span>{formatTodoTime(todo.startTime, locale)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="staff-notification-task-complete"
                      onClick={() => void completeTodo(todo)}
                      disabled={completingTodoId === id}
                      title={copy.completeTask}
                      aria-label={copy.completeTask}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <button
            type="button"
            className="staff-notification-view-all"
            onClick={() => {
              setOpen(false)
              navigate(tab === 'TASKS' ? '/calendar' : '/notifications')
            }}
          >
            {copy.viewAll}
          </button>
        </section>
      ) : null}
    </div>
  )
}
