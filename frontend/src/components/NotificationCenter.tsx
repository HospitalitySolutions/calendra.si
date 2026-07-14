import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'
import { subscribeBookingUpdates } from '../lib/bookingRealtime'

type NotificationCategory = 'ALL' | 'BOOKING' | 'SYSTEM'

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

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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

export function NotificationCenter({ onOpen }: { onOpen?: () => void }) {
  const { locale } = useLocale()
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<NotificationCategory>('ALL')
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unreadCount: 0 })
  const [loading, setLoading] = useState(false)

  const copy = useMemo(() => locale === 'sl' ? {
    title: 'Obvestila', clear: 'Počisti', newLabel: 'novih', all: 'Vsa', bookings: 'Rezervacije', system: 'Sistem',
    empty: 'Ni novih obvestil.', viewAll: 'Poglej vse', aria: 'Obvestila',
  } : locale === 'sr' ? {
    title: 'Obaveštenja', clear: 'Očisti', newLabel: 'novih', all: 'Sva', bookings: 'Rezervacije', system: 'Sistem',
    empty: 'Nema novih obaveštenja.', viewAll: 'Pogledaj sve', aria: 'Obaveštenja',
  } : {
    title: 'Notifications', clear: 'Clear', newLabel: 'new', all: 'All', bookings: 'Bookings', system: 'System',
    empty: 'No new notifications.', viewAll: 'View all', aria: 'Notifications',
  }, [locale])

  const load = useCallback(async (selectedCategory = category, showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const { data } = await api.get<NotificationFeed>('/notifications', { params: { category: selectedCategory, limit: 5 } })
      setFeed({ items: Array.isArray(data?.items) ? data.items : [], unreadCount: Number(data?.unreadCount || 0) })
    } catch {
      // Keep the previous list during transient failures.
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [category])

  useEffect(() => {
    void load('ALL')
    const interval = window.setInterval(() => void load(category), 60_000)
    const unsubscribe = subscribeBookingUpdates(() => window.setTimeout(() => void load(category), 250))
    const onFocus = () => void load(category)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(interval)
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [category, load])

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

  const selectCategory = (next: NotificationCategory) => {
    setCategory(next)
    void load(next, true)
  }

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

  const badge = feed.unreadCount > 99 ? '99+' : String(feed.unreadCount)

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
            void load(category, true)
          }
        }}
        aria-label={copy.aria}
        aria-expanded={open}
        title={copy.aria}
      >
        <BellIcon />
        {feed.unreadCount > 0 ? <span className="staff-notification-badge">{badge}</span> : null}
      </button>

      {open ? (
        <section className="staff-notification-panel" role="dialog" aria-label={copy.title}>
          <header className="staff-notification-panel-header">
            <h2>{copy.title}</h2>
            <button type="button" onClick={() => void markAllRead()} disabled={feed.unreadCount === 0}>{copy.clear}</button>
          </header>

          <div className="staff-notification-toolbar">
            <span className="staff-notification-new-count">
              <BellIcon />
              <strong>{feed.unreadCount}</strong> {copy.newLabel}
            </span>
            <div className="staff-notification-filters" role="tablist">
              {([
                ['ALL', copy.all],
                ['BOOKING', copy.bookings],
                ['SYSTEM', copy.system],
              ] as Array<[NotificationCategory, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={category === value ? 'active' : ''}
                  onClick={() => selectCategory(value)}
                  role="tab"
                  aria-selected={category === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={`staff-notification-items${loading ? ' loading' : ''}`}>
            {!loading && feed.items.length === 0 ? (
              <div className="staff-notification-empty">{copy.empty}</div>
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

          <button type="button" className="staff-notification-view-all" onClick={() => { setOpen(false); navigate('/notifications') }}>
            {copy.viewAll}
          </button>
        </section>
      ) : null}
    </div>
  )
}
