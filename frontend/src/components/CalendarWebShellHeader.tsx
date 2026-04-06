import FullCalendar from '@fullcalendar/react'
import { createPortal } from 'react-dom'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { fullName } from '../lib/format'
import { useLocale } from '../locale'

const CONSULTANT_FILTER_ALL_SESSION = -1

type CalendarApiRef = RefObject<InstanceType<typeof FullCalendar> | null>

/** 3-day time grid: keep current calendar context (do not force today to middle). */
export function goToThreeDayViewWithTodayCentered(calendarRef: CalendarApiRef, useResourceViews = false) {
  const api = calendarRef.current?.getApi()
  if (!api) return
  api.changeView(useResourceViews ? 'resourceTimeGridThreeDay' : 'timeGridThreeDay')
}

function IconModeBookings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  )
}

function IconModeSpaces() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-6-5.33-6-11a6 6 0 1 1 12 0c0 5.67-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.25" />
    </svg>
  )
}

function IconFilterConsultant() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="5" cy="10" r="2.25" />
      <circle cx="19" cy="10" r="2.25" />
      <path d="M1.5 20a4 4 0 0 1 4-3.5M22.5 20a4 4 0 0 0-4-3.5" />
    </svg>
  )
}

function IconFilterSpace() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-6-5.33-6-11a6 6 0 1 1 12 0c0 5.67-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.25" />
    </svg>
  )
}

/** Icon + portaled list — used in bottom bar below ~940px (layout footer: popups anchor above buttons). */
export function CalendarRailIconFilters({
  showConsultant,
  showSpace,
  consultantFilterId,
  onConsultantFilterChange,
  spaceFilterId,
  onSpaceFilterChange,
  consultantUsers,
  spaces,
  layout = 'header',
}: {
  showConsultant: boolean
  showSpace: boolean
  consultantFilterId: number | null
  onConsultantFilterChange: (id: number | null) => void
  spaceFilterId: number | null
  onSpaceFilterChange: (id: number | null) => void
  consultantUsers: Array<{ id: number; firstName: string; lastName: string }>
  spaces: Array<{ id: number; name: string }>
  layout?: 'header' | 'footer'
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState<null | 'consultant' | 'space'>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const consultantBtnRef = useRef<HTMLButtonElement>(null)
  const spaceBtnRef = useRef<HTMLButtonElement>(null)
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({})

  const updatePortalPosition = useCallback(() => {
    if (!open) return
    const btn = open === 'consultant' ? consultantBtnRef.current : spaceBtnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const panelEl = panelRef.current
    const ph = panelEl?.offsetHeight ?? 0
    const pw = panelEl?.offsetWidth ?? 220

    if (layout === 'footer') {
      let left = r.left
      if (open === 'space') {
        left = r.right - pw
      }
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
      let top = r.top - ph - 8
      if (ph > 0 && top < 8) {
        top = Math.min(r.bottom + 8, window.innerHeight - ph - 8)
      }
      if (top < 8) top = 8
      setPortalStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 10060,
      })
      return
    }

    let top = r.top
    if (ph > 0) {
      const maxTop = window.innerHeight - ph - 8
      if (top > maxTop) top = Math.max(8, maxTop)
    }
    if (top < 8) top = 8
    setPortalStyle({
      position: 'fixed',
      top: `${top}px`,
      right: `${window.innerWidth - r.left + 8}px`,
      zIndex: 10060,
    })
  }, [open, layout])

  useLayoutEffect(() => {
    if (!open) {
      setPortalStyle({})
      return
    }
    updatePortalPosition()
    const raf = requestAnimationFrame(() => updatePortalPosition())
    const ro = panelRef.current ? new ResizeObserver(() => updatePortalPosition()) : null
    if (panelRef.current) ro?.observe(panelRef.current)
    window.addEventListener('scroll', updatePortalPosition, true)
    window.addEventListener('resize', updatePortalPosition)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('scroll', updatePortalPosition, true)
      window.removeEventListener('resize', updatePortalPosition)
    }
  }, [open, consultantUsers.length, spaces.length, layout, updatePortalPosition])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (kind: 'consultant' | 'space') => {
    setOpen((o) => (o === kind ? null : kind))
  }

  if (!showConsultant && !showSpace) return null

  const portalPanel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="calendar-rail-filter-popup-panel calendar-rail-filter-popup-panel--portal"
          style={portalStyle}
          role="listbox"
          aria-label={open === 'consultant' ? t('calendarConsultant') : t('calendarSpace')}
        >
          {open === 'consultant' ? (
            <>
              <button
                type="button"
                className={`calendar-view-dropdown-item${consultantFilterId == null ? ' calendar-rail-filter-popup-item--selected' : ''}`}
                role="option"
                aria-selected={consultantFilterId == null}
                onClick={() => {
                  onConsultantFilterChange(null)
                  setOpen(null)
                }}
              >
                ALL (Consultant view)
              </button>
              <button
                type="button"
                className={`calendar-view-dropdown-item${consultantFilterId === CONSULTANT_FILTER_ALL_SESSION ? ' calendar-rail-filter-popup-item--selected' : ''}`}
                role="option"
                aria-selected={consultantFilterId === CONSULTANT_FILTER_ALL_SESSION}
                onClick={() => {
                  onConsultantFilterChange(CONSULTANT_FILTER_ALL_SESSION)
                  setOpen(null)
                }}
              >
                ALL (Session view)
              </button>
              {consultantUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`calendar-view-dropdown-item${consultantFilterId === u.id ? ' calendar-rail-filter-popup-item--selected' : ''}`}
                  role="option"
                  aria-selected={consultantFilterId === u.id}
                  onClick={() => {
                    onConsultantFilterChange(u.id)
                    setOpen(null)
                  }}
                >
                  <span className="calendar-rail-filter-popup-item-label">{fullName(u)}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                type="button"
                className={`calendar-view-dropdown-item${spaceFilterId == null ? ' calendar-rail-filter-popup-item--selected' : ''}`}
                role="option"
                aria-selected={spaceFilterId == null}
                onClick={() => {
                  onSpaceFilterChange(null)
                  setOpen(null)
                }}
              >
                {t('calendarAll')}
              </button>
              {spaces.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`calendar-view-dropdown-item${spaceFilterId === s.id ? ' calendar-rail-filter-popup-item--selected' : ''}`}
                  role="option"
                  aria-selected={spaceFilterId === s.id}
                  onClick={() => {
                    onSpaceFilterChange(s.id)
                    setOpen(null)
                  }}
                >
                  <span className="calendar-rail-filter-popup-item-label">{s.name}</span>
                </button>
              ))}
            </>
          )}
        </div>,
        document.body,
      )
    : null

  const rootClass =
    layout === 'footer'
      ? 'calendar-header-filters calendar-header-filters--footer-icon'
      : 'calendar-header-filters calendar-header-filters--header-icons'

  return (
    <div ref={rootRef} className={rootClass}>
      {portalPanel}
      {showConsultant && (
        <div className="calendar-rail-filter-popup-wrap">
          <button
            ref={consultantBtnRef}
            type="button"
            className={`calendar-header-mode-btn calendar-rail-filter-popup-trigger${open === 'consultant' ? ' active' : ''}`}
            aria-expanded={open === 'consultant'}
            aria-haspopup="listbox"
            aria-label={t('calendarConsultant')}
            title={t('calendarConsultant')}
            onClick={() => toggle('consultant')}
          >
            <IconFilterConsultant />
          </button>
        </div>
      )}
      {showSpace && (
        <div className="calendar-rail-filter-popup-wrap">
          <button
            ref={spaceBtnRef}
            type="button"
            className={`calendar-header-mode-btn calendar-rail-filter-popup-trigger${open === 'space' ? ' active' : ''}`}
            aria-expanded={open === 'space'}
            aria-haspopup="listbox"
            aria-label={t('calendarSpace')}
            title={t('calendarSpace')}
            onClick={() => toggle('space')}
          >
            <IconFilterSpace />
          </button>
        </div>
      )}
    </div>
  )
}

export function CalendarHeaderFilters({
  showConsultant,
  showSpace,
  consultantFilterId,
  onConsultantFilterChange,
  spaceFilterId,
  onSpaceFilterChange,
  consultantUsers,
  spaces,
}: {
  showConsultant: boolean
  showSpace: boolean
  consultantFilterId: number | null
  onConsultantFilterChange: (id: number | null) => void
  spaceFilterId: number | null
  onSpaceFilterChange: (id: number | null) => void
  consultantUsers: Array<{ id: number; firstName: string; lastName: string }>
  spaces: Array<{ id: number; name: string }>
}) {
  const { t } = useLocale()
  if (!showConsultant && !showSpace) return null
  return (
    <div className="calendar-header-filters">
      {showConsultant && (
        <label className="inline-check calendar-filter-select calendar-header-filter-field">
          <span className="calendar-header-filter-label">{t('calendarConsultant')}</span>
          <select
            value={consultantFilterId == null ? '' : consultantFilterId === CONSULTANT_FILTER_ALL_SESSION ? String(CONSULTANT_FILTER_ALL_SESSION) : String(consultantFilterId)}
            onChange={(e) => {
              const v = e.target.value
              if (v === '') onConsultantFilterChange(null)
              else if (v === String(CONSULTANT_FILTER_ALL_SESSION)) onConsultantFilterChange(CONSULTANT_FILTER_ALL_SESSION)
              else onConsultantFilterChange(Number(v))
            }}
            aria-label={t('calendarConsultant')}
            title={t('calendarConsultant')}
          >
            <option value="">ALL (Consultant view)</option>
            <option value={String(CONSULTANT_FILTER_ALL_SESSION)}>ALL (Session view)</option>
            {consultantUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {fullName(u)}
              </option>
            ))}
          </select>
        </label>
      )}
      {showSpace && (
        <label className="inline-check calendar-filter-select calendar-header-filter-field">
          <span className="calendar-header-filter-label">{t('calendarSpace')}</span>
          <select
            value={spaceFilterId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              onSpaceFilterChange(v === '' ? null : Number(v))
            }}
            aria-label={t('calendarSpace')}
            title={t('calendarSpace')}
          >
            <option value="">{t('calendarAll')}</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

export function CalendarHeaderModeGroup({
  calendarMode,
  onModeChange,
  bookableEnabled,
  spacesEnabled,
}: {
  calendarMode: 'bookings' | 'availability' | 'spaces'
  onModeChange: (mode: 'bookings' | 'availability' | 'spaces') => void
  bookableEnabled: boolean
  spacesEnabled: boolean
}) {
  const { t } = useLocale()
  return (
    <div className="calendar-header-mode-group" role="group" aria-label={t('calendarMode')}>
      {(bookableEnabled || !spacesEnabled) && (
        <button
          type="button"
          className={`calendar-header-mode-btn${calendarMode === 'bookings' ? ' active' : ''}`}
          onClick={() => onModeChange('bookings')}
          title={t('calendarModeBookings')}
          aria-pressed={calendarMode === 'bookings'}
        >
          <IconModeBookings />
        </button>
      )}
      {spacesEnabled && (
        <button
          type="button"
          className={`calendar-header-mode-btn${calendarMode === 'spaces' ? ' active' : ''}`}
          onClick={() => onModeChange('spaces')}
          title={t('calendarModeSpaces')}
          aria-pressed={calendarMode === 'spaces'}
        >
          <IconModeSpaces />
        </button>
      )}
    </div>
  )
}

/** Prev/next only — for right rail under ~420px while title stays in the app header. */
export function CalendarHeaderDateNavArrows({ calendarRef }: { calendarRef: CalendarApiRef }) {
  const { t } = useLocale()
  return (
    <div className="calendar-rail-date-nav-arrows">
      <button
        type="button"
        className="calendar-header-chevron calendar-rail-date-nav-chevron"
        onClick={() => calendarRef.current?.getApi().prev()}
        title={t('calendarPrevious')}
        aria-label={t('calendarPreviousPeriod')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className="calendar-header-chevron calendar-rail-date-nav-chevron"
        onClick={() => calendarRef.current?.getApi().next()}
        title={t('calendarNext')}
        aria-label={t('calendarNextPeriod')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  )
}

export function CalendarHeaderDateNav({
  calendarRef,
  title,
  arrowsPlacement = 'inline',
}: {
  calendarRef: CalendarApiRef
  title: string
  /** `rail`: hide chevrons in header; show `CalendarHeaderDateNavArrows` in the calendar rail (≤419px). */
  arrowsPlacement?: 'inline' | 'rail'
}) {
  const { t } = useLocale()
  return (
    <div
      className={[
        'calendar-header-date-nav',
        arrowsPlacement === 'rail' ? 'calendar-header-date-nav--arrows-in-rail' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="calendar-header-chevron"
        onClick={() => calendarRef.current?.getApi().prev()}
        title={t('calendarPrevious')}
        aria-label={t('calendarPreviousPeriod')}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <h1 className="calendar-header-title">{title || '\u00a0'}</h1>
      <button
        type="button"
        className="calendar-header-chevron"
        onClick={() => calendarRef.current?.getApi().next()}
        title={t('calendarNext')}
        aria-label={t('calendarNextPeriod')}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  )
}

export function CalendarHeaderViewDropdown({
  calendarRef,
  view,
  t,
  useResourceViews = false,
}: {
  calendarRef: CalendarApiRef
  view: string
  t: (key: string) => string
  /** Spaces mode + ALL spaces: FullCalendar resource time-grid / resource month view names. */
  useResourceViews?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  const label =
    view === 'timeGridDay' || view === 'resourceTimeGridDay'
      ? t('viewDay')
      : view === 'timeGridThreeDay' || view === 'resourceTimeGridThreeDay'
        ? t('viewThreeDay')
        : view === 'timeGridWeek' || view === 'resourceTimeGridWeek'
          ? t('viewWeek')
          : t('viewMonth')

  const pick = (kind: 'day' | 'threeDay' | 'week' | 'month') => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (kind === 'day') {
      api.changeView(useResourceViews ? 'resourceTimeGridDay' : 'timeGridDay')
      api.today()
    } else if (kind === 'threeDay') {
      goToThreeDayViewWithTodayCentered(calendarRef, useResourceViews)
    } else if (kind === 'week') {
      api.changeView(useResourceViews ? 'resourceTimeGridWeek' : 'timeGridWeek')
    } else {
      api.changeView(useResourceViews ? 'resourceDayGridMonth' : 'dayGridMonth')
    }
    setOpen(false)
  }

  return (
    <div className="calendar-view-dropdown-wrap" ref={wrapRef}>
      <button
        type="button"
        className="calendar-view-dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}
        <svg className="calendar-view-dropdown-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="calendar-view-dropdown-panel" role="listbox">
          <button type="button" className="calendar-view-dropdown-item" role="option" onClick={() => pick('day')}>
            <span>{t('viewDay')}</span>
            <span className="calendar-view-dropdown-kbd">D</span>
          </button>
          <button type="button" className="calendar-view-dropdown-item" role="option" onClick={() => pick('threeDay')}>
            <span>{t('viewThreeDay')}</span>
            <span className="calendar-view-dropdown-kbd">3</span>
          </button>
          <button type="button" className="calendar-view-dropdown-item" role="option" onClick={() => pick('week')}>
            <span>{t('viewWeek')}</span>
            <span className="calendar-view-dropdown-kbd">W</span>
          </button>
          <button type="button" className="calendar-view-dropdown-item" role="option" onClick={() => pick('month')}>
            <span>{t('viewMonth')}</span>
            <span className="calendar-view-dropdown-kbd">M</span>
          </button>
        </div>
      )}
    </div>
  )
}
