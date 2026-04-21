import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import resourcePlugin from '@fullcalendar/resource'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import resourceDayGridPlugin from '@fullcalendar/resource-daygrid'
import slLocale from '@fullcalendar/core/locales/sl'
import enGbLocale from '@fullcalendar/core/locales/en-gb'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition as NativeSpeechRecognition } from '@capacitor-community/speech-recognition'
import { createPortal } from 'react-dom'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type TextareaHTMLAttributes,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { useCalendarShellHeader } from '../calendarHeaderContext'
import {
  CalendarHeaderDateNav,
  CalendarHeaderDateNavArrows,
  CalendarHeaderFilters,
  CalendarHeaderModeGroup,
  CalendarHeaderViewDropdown,
  CalendarRailIconFilters,
  goToThreeDayViewWithTodayCentered,
} from '../components/CalendarWebShellHeader'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  buildNewSlotSearchParams,
  isCalendarFormPath,
  isLegacyNewSlotPath,
  matchCalendarFormRoute,
  mergeNewBookingAndAvailabilitySearch,
  parseAvailabilityQuery,
  parseNewSlotQuery,
  pathForNewForm,
  ROUTE_NEW_BOOKING,
  type AvailabilityFormQuery,
  type NewSlotQuery,
} from './calendarFormRoutes'
import { api } from '../api'
import { setPostZoomReturnPath } from '../lib/session'
import { getStoredUser } from '../auth'
import { Card, Field, PageHeader } from '../components/ui'
import { formatDateTime, fullName, nameLastFirst, parseClientNameInput, personInitials } from '../lib/format'
import { applyTheme, clearAuthStoragePreservingTheme, getStoredTheme, type ThemeMode } from '../theme'
import { useLocale, type AppLocale } from '../locale'
import { calendarBookingPanelHelpId, helpAria, helpTitle, helpTooltip } from '../helpContent'
import { LanguageModal } from '../components/LanguageModal'
import { ClientDetailSidePanel } from '../components/ClientDetailSidePanel'
import { GroupDetailSidePanel } from '../components/GroupDetailSidePanel'
import { useToast } from '../components/Toast'
import { consultantDayWindow, parseHmToMinutes as whWindowParseHm, windowToDayMs } from '../lib/consultantWorkingHours'
import { dayOptions } from '../lib/types'

const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
const WORKING_HOURS_FALLBACK_KEY = 'workingHoursFallback'
const PERSONAL_TASK_PRESETS_KEY = 'PERSONAL_TASK_PRESETS_JSON'
const AVAILABILITY_BLOCK_TASK = '__availability_block__'
/** Visible calendar data only; full meta/settings use CALENDAR_META_POLL_MS and focus/settings events. */
const CALENDAR_POLL_MS = 30000
const CALENDAR_META_POLL_MS = 180000
const DATE_SET_CALENDAR_DEBOUNCE_MS = 300
const FULLCALENDAR_LOCALES = [enGbLocale, slLocale]

const REPEAT_WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

function formatRepeatWeekdayLabel(loc: AppLocale, englishDay: string): string {
  const idx = (REPEAT_WEEKDAY_EN as readonly string[]).indexOf(englishDay)
  if (idx < 0) return englishDay
  return new Date(2024, 0, 7 + idx).toLocaleDateString(loc === 'sl' ? 'sl-SI' : 'en-GB', { weekday: 'long' })
}

/** FullCalendar resource id for bookings with no room (Spaces mode, ALL columns). */
const SPACE_RESOURCE_UNASSIGNED_ID = '__unassigned'

/** FullCalendar resource id for bookings with no consultant (Bookings mode, ALL columns). */
const CONSULTANT_RESOURCE_UNASSIGNED_ID = '__unassigned_consultant'

/** Web: normal + resource (Spaces, ALL) time-grid view types. */
function isWebTimeGridLikeView(v: string) {
  return (
    v === 'timeGridWeek' ||
    v === 'timeGridDay' ||
    v === 'timeGridThreeDay' ||
    v === 'resourceTimeGridWeek' ||
    v === 'resourceTimeGridDay' ||
    v === 'resourceTimeGridThreeDay'
  )
}

function localTodayYmd() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function splitLocalDateTimeParts(value: string | undefined | null): { date: string; time: string } {
  if (value == null) return { date: '', time: '' }
  const v = String(value).trim()
  if (!v) return { date: '', time: '' }
  const withSeconds = v.length === 16 ? `${v}:00` : v
  const m = withSeconds.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (!m) return { date: '', time: '' }
  return { date: m[1], time: m[2] }
}

function padLocalDateTimePart(n: number) {
  return String(n).padStart(2, '0')
}

/** Same rules as in-calendar normalizeToLocalDateTime (for all-day detection before component locals exist). */
function normalizeLocalDateTimeInputForAllDay(value: string): string {
  if (!value) return value
  const v = String(value).trim()
  if (!v) return v
  if (v.endsWith('Z') || /[+-]\d\d:\d\d$/.test(v)) {
    const d = new Date(v)
    return `${d.getFullYear()}-${padLocalDateTimePart(d.getMonth() + 1)}-${padLocalDateTimePart(d.getDate())}T${padLocalDateTimePart(d.getHours())}:${padLocalDateTimePart(d.getMinutes())}:${padLocalDateTimePart(d.getSeconds())}`
  }
  return v.length === 16 ? `${v}:00` : v
}

/** Whole-day bookings: local midnight through 23:59:59 on the same calendar date. */
function isLocalBookingAllDay(startVal: string | undefined, endVal: string | undefined): boolean {
  if (!startVal || !endVal) return false
  const ns = normalizeLocalDateTimeInputForAllDay(startVal)
  const ne = normalizeLocalDateTimeInputForAllDay(endVal)
  const sm = ns.match(/^(\d{4}-\d{2}-\d{2})T00:00:00/)
  const em = ne.match(/^(\d{4}-\d{2}-\d{2})T23:59:59/)
  if (!sm || !em) return false
  return sm[1] === em[1]
}

/** Todo (single `startTime`): all-day when stored at local midnight on that calendar day. */
function isLocalTodoAllDayStart(startVal: string | undefined): boolean {
  if (!startVal) return false
  const ns = normalizeLocalDateTimeInputForAllDay(startVal)
  return /^(\d{4}-\d{2}-\d{2})T00:00:00$/.test(ns)
}

/** Centers the field in the scrollport so Android WebView does not clip the native picker. */
function scrollIntoViewForAndroidPicker(el: HTMLElement) {
  if (typeof document === 'undefined') return
  if (!document.documentElement.classList.contains('layout-android')) return
  window.requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  })
}

/** ~one text line inside session panel padding (see `.calendar-session-notes-autogrow` CSS) */
const SESSION_NOTES_TEXTAREA_MIN_HEIGHT_PX = 32
const SESSION_NOTES_TEXTAREA_MAX_HEIGHT_PX = 288

type SessionNotesTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'value' | 'onChange'> & {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

/** Starts one line tall; grows with content up to a max height, then scrolls. */
function SessionNotesTextarea({ value, onChange, className, ...rest }: SessionNotesTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    const sh = el.scrollHeight
    const h = Math.min(Math.max(sh, SESSION_NOTES_TEXTAREA_MIN_HEIGHT_PX), SESSION_NOTES_TEXTAREA_MAX_HEIGHT_PX)
    el.style.height = `${h}px`
    el.style.overflowY = sh > SESSION_NOTES_TEXTAREA_MAX_HEIGHT_PX ? 'auto' : 'hidden'
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      className={['calendar-session-notes-autogrow', className].filter(Boolean).join(' ')}
      value={value}
      onChange={onChange}
      {...rest}
    />
  )
}

/** Trash icon for session panel “Izbriši” (matches pill footer style). */
function CalendarFormFooterDeleteIcon() {
  return (
    <svg className="calendar-form-footer-btn__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M8 6V5a1 1 0 011-1h6a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M6 6l1 15h10l1-15" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

/** Rounded badge + check for session panel “Shrani” / primary footer actions. */
function CalendarFormFooterSaveIcon() {
  return (
    <span className="calendar-form-footer-btn__save-mark" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 12.5l3 3 8-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** One row: time from | time to | date (date last). */
function CalendarLocalTimespanRow({
  startValue,
  endValue,
  onCommitStart,
  onCommitEnd,
  normalize,
  labels,
  allDayToggle,
  onCommitAllDayDate,
}: {
  startValue: string | undefined
  endValue: string | undefined
  onCommitStart: (localIso: string) => void
  onCommitEnd: (localIso: string) => void
  normalize: (v: string) => string
  labels: { timeFrom: string; timeTo: string; date: string }
  /** When set, shows “All day” switch on the date field; when checked, time fields are hidden. */
  allDayToggle?: { checked: boolean; onToggle: () => void; label: string; captionId: string }
  /** Used when all-day is on so start/end are updated together (avoids partial updates from split commits). */
  onCommitAllDayDate?: (ymd: string) => void
}) {
  const sp = splitLocalDateTimeParts(startValue)
  const ep = splitLocalDateTimeParts(endValue)
  const date = sp.date || ep.date || localTodayYmd()
  const startTime = sp.time || '09:00'
  const endTime = ep.time || '10:00'
  const allDay = !!allDayToggle?.checked

  return (
    <div className={['calendar-timespan-row', allDay ? 'calendar-timespan-row--all-day' : ''].filter(Boolean).join(' ')}>
      {!allDay && (
        <>
          <div className="calendar-timespan-field">
            <div className="calendar-timespan-input-inner">
              <span className="calendar-timespan-label">{labels.timeFrom}</span>
              <input
                type="time"
                value={startTime}
                onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
                onChange={(e) => {
                  const t = e.target.value
                  if (!t) return
                  onCommitStart(normalize(`${date}T${t}`))
                }}
                aria-label={labels.timeFrom}
              />
            </div>
          </div>
          <div className="calendar-timespan-field">
            <div className="calendar-timespan-input-inner">
              <span className="calendar-timespan-label">{labels.timeTo}</span>
              <input
                type="time"
                value={endTime}
                onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
                onChange={(e) => {
                  const t = e.target.value
                  if (!t) return
                  onCommitEnd(normalize(`${date}T${t}`))
                }}
                aria-label={labels.timeTo}
              />
            </div>
          </div>
        </>
      )}
      <div className="calendar-timespan-field calendar-timespan-field--date">
        <div className="calendar-timespan-input-inner">
          <div className="calendar-timespan-date-head">
            <span className="calendar-timespan-label">{labels.date}</span>
            {allDayToggle && (
              <div className="calendar-timespan-all-day-line" role="group" aria-label={allDayToggle.label}>
                <label
                  className="repeats-toggle-switch online-live-repeats-switch calendar-timespan-all-day-switch"
                  title={allDayToggle.label}
                >
                  <input
                    type="checkbox"
                    checked={allDayToggle.checked}
                    aria-labelledby={allDayToggle.captionId}
                    onChange={() => allDayToggle.onToggle()}
                  />
                  <span className="repeats-toggle-slider" />
                </label>
                <span id={allDayToggle.captionId} className="calendar-timespan-all-day-caption">
                  {allDayToggle.label}
                </span>
              </div>
            )}
          </div>
          <input
            type="date"
            value={date}
            onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
            onChange={(e) => {
              const d = e.target.value
              if (!d) return
              if (allDay && onCommitAllDayDate) {
                onCommitAllDayDate(d)
              } else {
                onCommitStart(normalize(`${d}T${startTime}`))
                onCommitEnd(normalize(`${d}T${endTime}`))
              }
            }}
            aria-label={labels.date}
          />
        </div>
      </div>
    </div>
  )
}

/** Todo: one row — time from | date (date last). */
function CalendarLocalTimeDateRow({
  value,
  onCommit,
  normalize,
  labels,
  allDayToggle,
  onCommitAllDayDate,
}: {
  value: string | undefined
  onCommit: (localIso: string) => void
  normalize: (v: string) => string
  labels: { time: string; date: string }
  allDayToggle?: { checked: boolean; onToggle: () => void; label: string; captionId: string }
  onCommitAllDayDate?: (ymd: string) => void
}) {
  const { date, time } = splitLocalDateTimeParts(value)
  const d = date || localTodayYmd()
  const tm = time || '09:00'
  const allDay = !!allDayToggle?.checked

  return (
    <div
      className={['calendar-timespan-row', 'calendar-timespan-row--two', allDay ? 'calendar-timespan-row--all-day' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {!allDay && (
        <div className="calendar-timespan-field">
          <div className="calendar-timespan-input-inner">
            <span className="calendar-timespan-label">{labels.time}</span>
            <input
              type="time"
              value={tm}
              onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
              onChange={(e) => {
                const t = e.target.value
                if (!t) return
                onCommit(normalize(`${d}T${t}`))
              }}
              aria-label={labels.time}
            />
          </div>
        </div>
      )}
      <div className="calendar-timespan-field calendar-timespan-field--date">
        <div className="calendar-timespan-input-inner">
          <div className="calendar-timespan-date-head">
            <span className="calendar-timespan-label">{labels.date}</span>
            {allDayToggle && (
              <div className="calendar-timespan-all-day-line" role="group" aria-label={allDayToggle.label}>
                <label
                  className="repeats-toggle-switch online-live-repeats-switch calendar-timespan-all-day-switch"
                  title={allDayToggle.label}
                >
                  <input
                    type="checkbox"
                    checked={allDayToggle.checked}
                    aria-labelledby={allDayToggle.captionId}
                    onChange={() => allDayToggle.onToggle()}
                  />
                  <span className="repeats-toggle-slider" />
                </label>
                <span id={allDayToggle.captionId} className="calendar-timespan-all-day-caption">
                  {allDayToggle.label}
                </span>
              </div>
            )}
          </div>
          <input
            type="date"
            value={d}
            onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
            onChange={(e) => {
              const next = e.target.value
              if (!next) return
              if (allDay && onCommitAllDayDate) {
                onCommitAllDayDate(next)
              } else if (allDay) {
                onCommit(normalize(`${next}T00:00:00`))
              } else {
                onCommit(normalize(`${next}T${tm}`))
              }
            }}
            aria-label={labels.date}
          />
        </div>
      </div>
    </div>
  )
}

/** Personal block task: type freely or open client-style dropdown for predefined tasks. */
function PersonalTaskCombo({
  value,
  onChange,
  placeholder,
  presets,
  dropdownOpen,
  onDropdownOpenChange,
  selectPredefinedLabel,
  noMatchLabel,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  presets: string[]
  dropdownOpen: boolean
  onDropdownOpenChange: (open: boolean) => void
  selectPredefinedLabel: string
  noMatchLabel: string
}) {
  const visiblePresets = useMemo(() => {
    const q = value.trim().toLowerCase()
    return presets.filter((p) => !q || p.toLowerCase().includes(q)).slice(0, 20)
  }, [presets, value])

  if (presets.length === 0) {
    return <input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  }

  return (
    <div className="client-picker personal-task-combo" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0, flex: 1 }}>
      <div className="client-search-wrap client-search-wrap--task-combo">
        <input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onDropdownOpenChange(true)}
        />
        <button
          type="button"
          className="client-task-preset-chevron"
          aria-label={selectPredefinedLabel}
          aria-expanded={dropdownOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDropdownOpenChange(!dropdownOpen)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {dropdownOpen && (
        <div className="client-dropdown-panel">
          {visiblePresets.map((task) => (
            <button
              key={task}
              type="button"
              className={`client-list-item ${value.trim() === task ? 'selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(task)
                onDropdownOpenChange(false)
              }}
            >
              {task}
            </button>
          ))}
          {visiblePresets.length === 0 && <span className="muted" style={{ padding: '8px 12px', display: 'block' }}>{noMatchLabel}</span>}
        </div>
      )}
    </div>
  )
}

/** Shell: below 1750px date nav moves left; from 940px up labeled Consultant/Space in header; under 940px icons + mic in bottom strip. */
const CALENDAR_COMPACT_HEADER_MAX_PX = 1749
/** ≤939px: Consultant/Space as icon popups in bottom strip; mic centered (labeled selects stay in header above 940px). */
const CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX = 939
/** Prev/next move from header to the right rail (narrow phones). */
const CALENDAR_DATE_NAV_RAIL_MAX_PX = 419
/** ≤780px: keep arrows + view selector grouped on the right side in the header. */
const CALENDAR_MOBILE_HEADER_NAV_MAX_PX = 780
/** ≤1100px: bookings “all consultants” resource columns show initials instead of full names. */
const CALENDAR_CONSULTANT_RESOURCE_INITIALS_MAX_PX = 1100

function useCalendarCompactHeader() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${CALENDAR_COMPACT_HEADER_MAX_PX}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_COMPACT_HEADER_MAX_PX}px)`)
    const apply = () => setCompact(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return compact
}

function useCalendarFiltersBottomBar() {
  const [bottom, setBottom] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX}px)`)
    const apply = () => setBottom(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return bottom
}

function useCalendarDateNavArrowsInRail() {
  const [v, setV] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${CALENDAR_DATE_NAV_RAIL_MAX_PX}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_DATE_NAV_RAIL_MAX_PX}px)`)
    const apply = () => setV(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return v
}

function useCalendarMobileHeaderNav() {
  const [v, setV] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(
          `(max-width: ${CALENDAR_MOBILE_HEADER_NAV_MAX_PX}px)`,
        ).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(
      `(max-width: ${CALENDAR_MOBILE_HEADER_NAV_MAX_PX}px)`,
    )
    const apply = () => setV(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return v
}

function useCalendarConsultantResourceInitialsLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${CALENDAR_CONSULTANT_RESOURCE_INITIALS_MAX_PX}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_CONSULTANT_RESOURCE_INITIALS_MAX_PX}px)`)
    const apply = () => setCompact(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return compact
}

/** Pinch zoom: only magnify above default (1); cannot zoom out past the normal view. */
const ANDROID_PINCH_ZOOM_MIN = 1
const ANDROID_PINCH_ZOOM_MAX = 2.75

function toIsoDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Resource week/three-day: keep holiday pill min-content small; full name stays in title. */
function truncateCalendarHolidayPillText(name: string, maxChars: number) {
  const t = name.trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, Math.max(0, maxChars - 1))}\u2026`
}

/** Noun form after a numeric count for "termin" (e.g. "2 termina", "4 termini"). */
function slovenianTerminCountForm(count: number): string {
  const n = Math.abs(count) % 100
  if (n >= 11 && n <= 14) return 'terminov'
  const last = n % 10
  if (last === 1) return 'termin'
  if (last >= 2 && last <= 4) return count >= 3 ? 'termini' : 'termina'
  return 'terminov'
}

function newClientInitials(firstName: string, lastName: string) {
  const letters = [firstName, lastName]
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
  return letters || 'N'
}

export default function CalendarPage() {

  const navigate = useNavigate()
  const location = useLocation()
  const { locale, t } = useLocale()
  const { showToast } = useToast()
  const isAndroidWeb = !isNativeAndroid && /Android/i.test(window.navigator.userAgent || '')
  const calendarLocaleTag = locale === 'sl' ? 'sl-SI' : 'en-GB'
  const voiceRecognitionLang = locale === 'sl' ? 'sl-SI' : 'en-US'
  const { setSlots: setShellCalendarSlots } = useCalendarShellHeader()
  const user = getStoredUser()!
  const [calendarData, setCalendarData] = useState<any>({ booked: [], bookable: [] })
  const [settings, setSettings] = useState<Record<string, string>>({})
  const personalModuleEnabled = settings.PERSONAL_ENABLED !== 'false'
  const todosModuleEnabled = settings.TODOS_ENABLED !== 'false'
  const [meta, setMeta] = useState({ clients: [], users: [], spaces: [], types: [] } as any)
  const EMPTY_ARR: any[] = useMemo(() => [], [])
  const metaUsers: any[] = Array.isArray(meta.users) ? meta.users : EMPTY_ARR
  const metaSpaces: any[] = Array.isArray(meta.spaces) ? meta.spaces : EMPTY_ARR
  const metaClients: any[] = Array.isArray(meta.clients) ? meta.clients : EMPTY_ARR
  const metaTypes: any[] = Array.isArray(meta.types) ? meta.types : EMPTY_ARR
  const metaConsultants = useMemo(() => metaUsers.filter((u: any) => u.consultant), [metaUsers])
  /** Hide Zaposleni when admin has no real choice (0–1 consultants). */
  const showBookingConsultantRow = user.role === 'ADMIN' && metaConsultants.length > 1
  /** Hide Prostor when there is no real choice (0–1 spaces). */
  const showBookingSpaceRow = settings.SPACES_ENABLED !== 'false' && metaSpaces.length > 1
  /** Hide Storitev (+ bundled Online on web) when no session types exist. */
  const showBookingTypeRow = settings.TYPES_ENABLED !== 'false' && metaTypes.length > 0
  const multipleClientsPerSessionEnabled = settings.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === 'true'
  /** Settings map values are usually strings; tolerate booleans / casing so group mode does not silently break. */
  const groupBookingEnabled = (() => {
    const v = settings.GROUP_BOOKING_ENABLED as unknown
    if (v === true) return true
    if (typeof v === 'string') return v.trim().toLowerCase() === 'true'
    return false
  })()
  const metaGroups: any[] = Array.isArray(meta.groups) ? meta.groups : EMPTY_ARR
  const [bookingGroupMode, setBookingGroupMode] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false)
  const [editingGroupSearch, setEditingGroupSearch] = useState(false)
  const groupSearchInputRef = useRef<HTMLInputElement>(null)
  const [showAddGroupModal, setShowAddGroupModal] = useState(false)
  const [newGroupForm, setNewGroupForm] = useState({ name: '', email: '' })
  const [savingNewGroupModal, setSavingNewGroupModal] = useState(false)
  const [groupModalError, setGroupModalError] = useState('')
  const [calendarGroupDetailId, setCalendarGroupDetailId] = useState<number | null>(null)
  /** When opening group details from edit booking, session-only fields are editable for this booking id. */
  const [calendarGroupDetailBookingId, setCalendarGroupDetailBookingId] = useState<number | null>(null)
  const [selection, setSelection] = useState<any>(null)
  const [dragSelection, setDragSelection] = useState<{
    start: string
    end: string
    resourceId?: string | null
  } | null>(null)
  const [form, setForm] = useState<any>({})
  const [clientSearch, setClientSearch] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [personalTaskPresetDropdownOpen, setPersonalTaskPresetDropdownOpen] = useState(false)
  /** When false and a client is chosen, show their name in the search slot; click opens search again. */
  const [editingClientSearch, setEditingClientSearch] = useState(false)
  const clientSearchInputRef = useRef<HTMLInputElement>(null)
  const bookedClientSearchInputRef = useRef<HTMLInputElement>(null)
  const [calendarClientDetailId, setCalendarClientDetailId] = useState<number | null>(null)
  const [calendarClientDetailRestrictLifecycle, setCalendarClientDetailRestrictLifecycle] = useState(false)
  const [bookedClientSearch, setBookedClientSearch] = useState('')
  const [bookedClientDropdownOpen, setBookedClientDropdownOpen] = useState(false)
  const [editingBookedClientSearch, setEditingBookedClientSearch] = useState(false)
  const [bookSessionClientsExpanded, setBookSessionClientsExpanded] = useState(false)
  const [bookedSessionClientsExpanded, setBookedSessionClientsExpanded] = useState(false)
  const [showAddClientModal, setShowAddClientModal] = useState(false)
  const [newClientForm, setNewClientForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [savingClient, setSavingClient] = useState(false)
  const [clientError, setClientError] = useState('')
  /** Admin only: null = ALL consultants (resource columns); CONSULTANT_FILTER_ALL_SESSION = all in single column; otherwise filter to specific consultant. */
  const CONSULTANT_FILTER_ALL_SESSION = -1
  const [consultantFilterId, setConsultantFilterId] = useState<number | null>(user.id ?? null)
  const [spaceFilterId, setSpaceFilterId] = useState<number | null>(null) // null = ALL
  const [androidMonthFirstDay, setAndroidMonthFirstDay] = useState(1)
  const [androidFilterPicker, setAndroidFilterPicker] = useState<null | 'consultant' | 'space'>(null)
  const [view, setView] = useState('timeGridWeek')
  const [calendarMode, setCalendarMode] = useState<'bookings' | 'availability' | 'spaces'>('bookings')
  const [confirmNonBookable, setConfirmNonBookable] = useState<any>(null)
  const [confirmOverlap, setConfirmOverlap] = useState<{ overlapping: any[]; start: string; end: string } | null>(null)
  const [confirmBookedPersonalOverlap, setConfirmBookedPersonalOverlap] = useState<
    | { type: 'create' }
    | { type: 'move'; booking: any; newStartStr: string; newEndStr: string; spaceIdOverride?: number | null; consultantIdOverride?: number | null }
    | { type: 'edit' }
    | null
  >(null)
  const [confirmNonBookableMove, setConfirmNonBookableMove] = useState<{
    booking: any
    newStartStr: string
    newEndStr: string
    allowPersonalBlockOverlap?: boolean
    spaceIdOverride?: number | null
    consultantIdOverride?: number | null
  } | null>(null)
  const [selectedBookedSession, setSelectedBookedSession] = useState<any>(null)
  const [selectedPersonalBlock, setSelectedPersonalBlock] = useState<any>(null)
  const [selectedTodo, setSelectedTodo] = useState<any>(null)
  const [pendingExternalTodo, setPendingExternalTodo] = useState<
    | {
        todoId: number
        anchorRect?: { left: number; right: number; top: number; bottom: number } | null
      }
    | null
  >(null)
  const [availabilitySelection, setAvailabilitySelection] = useState<any>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  /** Razpoložljivost: header check runs add (bookable slot) vs block (personal AVAILABILITY_BLOCK_TASK) per toggle. */
  const [availabilityIntent, setAvailabilityIntent] = useState<'add' | 'block'>('add')
  const [visibleRange, setVisibleRange] = useState<{ start: string; end: string } | null>(null)
  const [holidaysByDate, setHolidaysByDate] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmSwap, setConfirmSwap] = useState<{ dragged: any; target: any; revert: () => void } | null>(null)
  const [zoomConnected, setZoomConnected] = useState<boolean | null>(null)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [saveBookingError, setSaveBookingError] = useState<string | null>(null)
  const [saveBookingLoading, setSaveBookingLoading] = useState(false)
  const addBookingOnlineCaptionId = useId()
  const addBookingGroupCaptionId = useId()
  const bookedSessionOnlineCaptionId = useId()
  const newBookingAllDayCaptionId = useId()
  const editBookedAllDayCaptionId = useId()
  const personalFormAllDayCaptionId = useId()
  const personalEditAllDayCaptionId = useId()
  const todoFormAllDayCaptionId = useId()
  const todoEditAllDayCaptionId = useId()
  const availabilityAllDayCaptionId = useId()
  const [voiceBookingConfigured, setVoiceBookingConfigured] = useState<boolean | null>(null)
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceBookingLoading, setVoiceBookingLoading] = useState(false)
  const [voiceBookingError, setVoiceBookingError] = useState<string | null>(null)
  const [voiceReviewOpen, setVoiceReviewOpen] = useState(false)
  const [voiceReviewText, setVoiceReviewText] = useState('')
  const [voiceReviewClientId, setVoiceReviewClientId] = useState<number | null>(null)
  const [voiceReviewClientQuery, setVoiceReviewClientQuery] = useState('')
  const [voiceReviewClientDropdownOpen, setVoiceReviewClientDropdownOpen] = useState(false)
  const voiceReviewClientInputRef = useRef<HTMLInputElement>(null)
  const [voicePendingCancellation, setVoicePendingCancellation] = useState<null | {
    action?: string
    targetType?: string | null
    targetId?: number | null
    message?: string
    bookingId?: number
    clientId?: number | null
    clientName?: string | null
    title?: string | null
    startTime?: string | null
    endTime?: string | null
    confirmationRequired?: boolean
  }>(null)
  const [modeSwitching, setModeSwitching] = useState(false)
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)
  const loadRef = useRef<() => Promise<void>>(async () => {})
  const speechRecognitionRef = useRef<{ stop: () => void; abort?: () => void } | null>(null)
  const voiceStopRequestedRef = useRef(false)
  const webSpeechBestTranscriptRef = useRef('')
  const webSpeechSubmittedRef = useRef(false)
  const webSpeechHadTranscriptRef = useRef(false)
  const voiceFallbackErrorShownRef = useRef(false)
  const androidMicHoldActiveRef = useRef(false)
  const androidMicShouldListenRef = useRef(false)
  const nativeSpeechHandleRef = useRef<{ remove: () => Promise<void> } | null>(null)
  const nativeListeningHandleRef = useRef<{ remove: () => Promise<void> } | null>(null)
  const nativeTranscriptRef = useRef('')
  const nativeTranscriptBestRef = useRef('')
  const nativeSessionFinalizedRef = useRef(false)
  const nativeFinalizeTimerRef = useRef<number | null>(null)
  const nativeRestartTimerRef = useRef<number | null>(null)
  const nativeReleaseStopTimerRef = useRef<number | null>(null)
  const modeSwitchingTimerRef = useRef<number | null>(null)
  const nativeStartingRef = useRef(false)
  const calendarAndroidWeekRef = useRef<HTMLDivElement>(null)
  const calendarPinchLayerRef = useRef<HTMLDivElement>(null)
  const calendarSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const calendarSwipeAxisDecidedRef = useRef(false)
  const calendarSwipeIsHorizontalRef = useRef(false)
  const calendarSnapshotRef = useRef<HTMLElement | null>(null)
  const calendarSlideDirRef = useRef<-1 | 1 | 0>(0)
  /** Avoid double-opening modal when tap fires both dateClick and select on Android. */
  const androidSelectionAtRef = useRef(0)
  const [calendarPinchZoom, setCalendarPinchZoom] = useState(1)
  const [pinchOriginPct, setPinchOriginPct] = useState({ x: 50, y: 50 })
  const pinchZoomRef = useRef(1)
  const pinchGestureRef = useRef<{ dist0: number; scale0: number } | null>(null)
  const pinchAnchorRef = useRef<{ x: number; y: number; contentX: number; contentY: number } | null>(null)
  const isDraggingEventRef = useRef(false)
  const calendarDragTimePillRef = useRef<HTMLDivElement | null>(null)
  const calendarDragPointerCleanupRef = useRef<null | (() => void)>(null)
  const calendarSmallDragHintViewportRef = useRef(false)
  const dragEdgeNavAtRef = useRef(0)
  const dragEdgeSideRef = useRef<-1 | 0 | 1>(0)
  /** Throttle drag-selection state + DOM work in selectAllow (resource ALL views have many events; updates were ~60/s). */
  const dragSelectThrottleAtRef = useRef(0)
  const ignoreNextSelectionRef = useRef(false)
  /** Dismiss popup on calendar mousedown without opening a new selection from the same gesture. */
  const suppressNextCalendarSelectionRef = useRef(false)
  const bookingEndEditedManuallyRef = useRef(false)
  const hideCardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverCardRef = useRef<HTMLDivElement>(null)
  const hoveredTimegridRowRef = useRef<HTMLTableRowElement | null>(null)
  const [calendarSlideX, setCalendarSlideX] = useState(0)
  const [calendarIsSwiping, setCalendarIsSwiping] = useState(false)
  const [swipeTransitionActive, setSwipeTransitionActive] = useState(false)
  const [calendarToolbarTitle, setCalendarToolbarTitle] = useState('')
  const calendarToolbarTitleRef = useRef('')
  const swipeHandlersRef = useRef<{ move: Function | null; end: Function | null }>({ move: null, end: null })
  const swipeWrapRef = useRef<HTMLDivElement>(null)
  const swipeVelocityRef = useRef({ lastX: 0, lastT: 0, vx: 0 })
  const calendarHeaderCompact = useCalendarCompactHeader()
  const calendarFiltersBottomBar = useCalendarFiltersBottomBar()
  const calendarDateNavArrowsInRail = useCalendarDateNavArrowsInRail()
  const calendarMobileHeaderNav = useCalendarMobileHeaderNav()
  const calendarToolbarMonthLabel = useMemo(() => {
    const api = calendarRef.current?.getApi()
    const d = api?.getDate()
    if (!d) return ''
    return d.toLocaleDateString(calendarLocaleTag, { month: 'long' })
  }, [visibleRange, view, calendarLocaleTag])
  const useBookingSidePanel = isNativeAndroid || calendarFiltersBottomBar
  /** Same breakpoint as bottom filters (~939px): × + check header, no title/help; wide = PageHeader + footer CTAs. */
  const compactSelectionHeader = calendarFiltersBottomBar
  /** Booked / personal / todo editors: × left, delete + save icons right, no title; footer CTAs hidden unless delete confirm. */
  const compactSessionEditHeader = calendarFiltersBottomBar
  const compactSelectionCheckAria =
    availabilitySelection != null
      ? availabilityIntent === 'block'
        ? t('formBlockAvailability')
        : availabilitySelection.slotId
          ? t('formSaveChanges')
          : t('formCreateAvailability')
      : form.todo
        ? t('formAddTodo')
        : form.personal
          ? t('formAddBlock')
          : t('formBookSession')
  const showSelectionFormFooter = !calendarFiltersBottomBar && availabilitySelection == null
  const consultantResourceLabelsCompact = useCalendarConsultantResourceInitialsLayout()
  const compactFormHydrateSkipKeyRef = useRef<string | null>(null)
  const compactFormPrevPathRef = useRef(location.pathname)
  const lastHydratedFormRouteKeyRef = useRef('')

  const pushCompactFormRoute = useCallback(
    (toPath: string) => {
      compactFormHydrateSkipKeyRef.current = toPath
      navigate(toPath)
    },
    [navigate],
  )

  const leaveCompactFormRouteIfNeeded = useCallback(() => {
    if (!useBookingSidePanel) return
    if (!isCalendarFormPath(location.pathname)) return
    navigate('/calendar', { replace: true })
  }, [useBookingSidePanel, location.pathname, navigate])

  useEffect(() => {
    const prev = compactFormPrevPathRef.current
    compactFormPrevPathRef.current = location.pathname
    if (!useBookingSidePanel) return
    const wasForm = isCalendarFormPath(prev)
    const isForm = isCalendarFormPath(location.pathname)
    if (!wasForm || isForm) return
    lastHydratedFormRouteKeyRef.current = ''
    setSelection(null)
    setSelectedBookedSession(null)
    setSelectedPersonalBlock(null)
    setSelectedTodo(null)
    setAvailabilitySelection(null)
    setAvailabilityIntent('add')
    setAvailabilityError(null)
    setAvailabilitySaving(false)
    setConfirmDelete(false)
    setClientDropdownOpen(false)
    setMeetingProviderPickerOpen(false)
    setMeetingPickerCancelUnchecksOnline(false)
    setEditingClientSearch(false)
    calendarRef.current?.getApi()?.unselect()
  }, [location.pathname, useBookingSidePanel])

  useEffect(() => {
    if (useBookingSidePanel) return
    if (!isCalendarFormPath(location.pathname)) return
    lastHydratedFormRouteKeyRef.current = ''
    setSelection(null)
    setSelectedBookedSession(null)
    setSelectedPersonalBlock(null)
    setSelectedTodo(null)
    setAvailabilitySelection(null)
    setAvailabilityIntent('add')
    setAvailabilityError(null)
    setAvailabilitySaving(false)
    setConfirmDelete(false)
    setClientDropdownOpen(false)
    setMeetingProviderPickerOpen(false)
    setMeetingPickerCancelUnchecksOnline(false)
    setEditingClientSearch(false)
    calendarRef.current?.getApi()?.unselect()
    navigate('/calendar', { replace: true })
  }, [useBookingSidePanel, location.pathname, navigate])

  useEffect(() => {
    if (!useBookingSidePanel) return
    if (!isLegacyNewSlotPath(location.pathname)) return
    const sp = new URLSearchParams(location.search)
    if (location.pathname.endsWith('/personal')) sp.set('panel', 'personal')
    else if (location.pathname.endsWith('/todo')) sp.set('panel', 'todo')
    navigate(`${ROUTE_NEW_BOOKING}?${sp.toString()}`, { replace: true })
  }, [useBookingSidePanel, location.pathname, location.search, navigate])

  const [androidScheduleOpen, setAndroidScheduleOpen] = useState(false)
  const [androidConfigOpen, setAndroidConfigOpen] = useState(false)
  const [androidLanguageModal, setAndroidLanguageModal] = useState(false)
  const [androidTodoOpen, setAndroidTodoOpen] = useState(false)
  const androidScheduleRef = useRef<HTMLDivElement>(null)
  const androidConfigRef = useRef<HTMLDivElement>(null)
  const availabilityRangeStartInputRef = useRef<HTMLInputElement>(null)
  const availabilityRangeEndInputRef = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())
  const [meetingProviderPickerOpen, setMeetingProviderPickerOpen] = useState(false)
  /** If true, closing the picker without choosing (Cancel/backdrop) turns Online off — set when opening from the Online checkbox. */
  const [meetingPickerCancelUnchecksOnline, setMeetingPickerCancelUnchecksOnline] = useState(false)
  /** Android Book session: Notes textarea shown only after tapping + */
  const [bookSessionNotesExpanded, setBookSessionNotesExpanded] = useState(false)
  const [monthHoverCard, setMonthHoverCard] = useState<null | {
    x: number
    y: number
    transform: string
    timeRange: string
    typeLabel: string
    clientLabel: string | null
    /** When true, hover row uses group label (Skupina) instead of client (Stranka). */
    bookingIsGroup: boolean
    consultantLabel: string
    meetingLink: string | null
    meetingProvider: string | null
  }>(null)
  const [sessionPopupPosition, setSessionPopupPosition] = useState<{ left: number; top: number } | null>(null)
  const sessionPopupRef = useRef<HTMLDivElement | null>(null)
  const sessionPopupAnchorRectRef = useRef<{ left: number; right: number; top: number; bottom: number } | null>(null)
  const [sessionsSheetState, setSessionsSheetState] = useState<'closed' | 'collapsed' | 'expanded'>('closed')
  const [sessionsSheetDragOffset, setSessionsSheetDragOffset] = useState(0)
  const sessionsSheetStartYRef = useRef<number | null>(null)
  const sessionsSheetStartStateRef = useRef<'collapsed' | 'expanded'>('collapsed')
  const datesSetCalendarLoadTimerRef = useRef<number | null>(null)
  const lastHolidayRangeKeyRef = useRef<string | null>(null)
  /** Avoids a second /bookings/calendar fetch when datesSet fires with the same range right after load(). */
  const lastSuccessfulCalendarRangeKeyRef = useRef<string | null>(null)

  const computeCalendarFetchRange = () => {
    const apiCal = calendarRef.current?.getApi()
    let from = apiCal?.view?.activeStart ? new Date(apiCal.view.activeStart) : new Date()
    let to = apiCal?.view?.activeEnd ? new Date(apiCal.view.activeEnd) : new Date()
    if (!apiCal?.view?.activeEnd) to.setDate(to.getDate() + 30)
    from.setDate(from.getDate() - 7)
    to.setDate(to.getDate() + 7)
    const today = new Date()
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (todayDay < fromDay) from = todayDay
    if (todayDay > toDay) to = todayDay
    const fromStr = from.toISOString().slice(0, 10)
    const toStr = to.toISOString().slice(0, 10)
    return { fromStr, toStr, key: `${fromStr}|${toStr}` }
  }

  useEffect(() => {
    pinchZoomRef.current = calendarPinchZoom
  }, [calendarPinchZoom])

  useEffect(() => {
    if (!isNativeAndroid) return
    if (view !== 'dayGridMonth') return
    if (calendarPinchZoom !== 1) setCalendarPinchZoom(1)
  }, [view, calendarPinchZoom])

  useEffect(() => {
    if (!androidScheduleOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (androidScheduleRef.current && !androidScheduleRef.current.contains(e.target as Node)) {
        setAndroidScheduleOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [androidScheduleOpen])

  useEffect(() => {
    if (!androidConfigOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (androidConfigRef.current && !androidConfigRef.current.contains(e.target as Node)) {
        setAndroidConfigOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [androidConfigOpen])

  const toggleTheme = () => {
    if (theme === 'light') {
      applyTheme('dark')
      setTheme('dark')
      return
    }
    applyTheme('light')
    setTheme('light')
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore logout transport errors and still clear local state
    }
    clearAuthStoragePreservingTheme()
    window.location.replace('/login')
  }

  /** Two-finger pinch: scale the grid only; focal point = midpoint of fingers on first frame. */
  useEffect(() => {
    if (!isNativeAndroid) return
    const el = calendarAndroidWeekRef.current
    if (!el) return
    const distanceBetweenTouches = (tl: globalThis.TouchList) => {
      if (tl.length < 2) return 0
      return Math.hypot(tl[0].clientX - tl[1].clientX, tl[0].clientY - tl[1].clientY)
    }
    const setOriginFromTouches = (tl: globalThis.TouchList) => {
      const layer = calendarPinchLayerRef.current
      if (!layer || tl.length < 2) return
      const rect = layer.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const mx = (tl[0].clientX + tl[1].clientX) / 2
      const my = (tl[0].clientY + tl[1].clientY) / 2
      const x = mx - rect.left
      const y = my - rect.top
      setPinchOriginPct({
        x: Math.min(100, Math.max(0, (x / rect.width) * 100)),
        y: Math.min(100, Math.max(0, (y / rect.height) * 100)),
      })
      pinchAnchorRef.current = {
        x,
        y,
        contentX: (layer.scrollLeft + x) / Math.max(1, pinchZoomRef.current),
        contentY: (layer.scrollTop + y) / Math.max(1, pinchZoomRef.current),
      }
    }
    const onStart = (e: Event) => {
      const te = e as TouchEvent
      if (te.touches.length === 2) {
        const d = distanceBetweenTouches(te.touches)
        if (d > 0) {
          pinchGestureRef.current = { dist0: d, scale0: pinchZoomRef.current }
          setOriginFromTouches(te.touches)
        }
      }
    }
    const onMove = (e: Event) => {
      const te = e as TouchEvent
      if (te.touches.length === 2 && pinchGestureRef.current) {
        te.preventDefault()
        setOriginFromTouches(te.touches)
        const d = distanceBetweenTouches(te.touches)
        const g = pinchGestureRef.current
        if (g.dist0 < 4 || d < 1) return
        const next = Math.min(ANDROID_PINCH_ZOOM_MAX, Math.max(ANDROID_PINCH_ZOOM_MIN, g.scale0 * (d / g.dist0)))
        setCalendarPinchZoom(next)
        const layer = calendarPinchLayerRef.current
        const anchor = pinchAnchorRef.current
        if (layer && anchor) {
          requestAnimationFrame(() => {
            layer.scrollLeft = Math.max(0, anchor.contentX * next - anchor.x)
            layer.scrollTop = Math.max(0, anchor.contentY * next - anchor.y)
          })
        }
      }
    }
    const onEnd = () => {
      pinchGestureRef.current = null
      pinchAnchorRef.current = null
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [isNativeAndroid])

  useLayoutEffect(() => {
    if (!isNativeAndroid) return
    const id = requestAnimationFrame(() => calendarRef.current?.getApi().updateSize())
    return () => cancelAnimationFrame(id)
  }, [calendarPinchZoom, isNativeAndroid])

  useEffect(() => {
    if (isNativeAndroid) return
    const compactDayViews =
      view === 'timeGridDay' ||
      view === 'timeGridThreeDay' ||
      view === 'resourceTimeGridDay' ||
      view === 'resourceTimeGridThreeDay'
    if (!compactDayViews) return
    const bump = () => {
      requestAnimationFrame(() => calendarRef.current?.getApi().updateSize())
    }
    window.addEventListener('resize', bump)
    window.visualViewport?.addEventListener('resize', bump)
    bump()
    return () => {
      window.removeEventListener('resize', bump)
      window.visualViewport?.removeEventListener('resize', bump)
    }
  }, [view, isNativeAndroid])

  useEffect(() => {
    if (!isNativeAndroid) return
    const styleId = 'calendar-android-drag-ghost-fix'
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
.layout-android .fc .fc-event.fc-event-dragging:not(.fc-event-mirror) {
  opacity: 0 !important;
}
.layout-android .fc .fc-event.fc-event-dragging:not(.fc-event-mirror) * {
  opacity: 0 !important;
}
.layout-android .fc .fc-event-mirror {
  opacity: 1 !important;
  visibility: visible !important;
}
`
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  const isWeekOrMonthView =
    view === 'timeGridWeek' ||
    view === 'resourceTimeGridWeek' ||
    view === 'dayGridMonth' ||
    view === 'resourceDayGridMonth'

  /** View-only: ALL consultant in bookings mode, or ALL space in spaces mode, on week/month views. */
  const isViewOnly =
    isWeekOrMonthView &&
    ((calendarMode === 'bookings' && (consultantFilterId == null || consultantFilterId === CONSULTANT_FILTER_ALL_SESSION)) ||
      (calendarMode === 'spaces' && spaceFilterId == null))

  const cleanupDragArtifacts = useCallback(() => {
    const api = calendarRef.current?.getApi()
    api?.unselect()
    setDragSelection(null)
    const active = document.activeElement as HTMLElement | null
    active?.blur?.()
    document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
    document.querySelectorAll('.fc-highlight').forEach((n) => n.remove())
    document.querySelectorAll('.fc-event-dragging, .fc-event-selected').forEach((n) => n.classList.remove('fc-event-dragging', 'fc-event-selected'))
    window.setTimeout(() => {
      document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
      document.querySelectorAll('.fc-highlight').forEach((n) => n.remove())
      document.querySelectorAll('.fc-event-dragging, .fc-event-selected').forEach((n) => n.classList.remove('fc-event-dragging', 'fc-event-selected'))
    }, 0)
    window.setTimeout(() => {
      document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
      document.querySelectorAll('.fc-highlight').forEach((n) => n.remove())
      document.querySelectorAll('.fc-event-dragging, .fc-event-selected').forEach((n) => n.classList.remove('fc-event-dragging', 'fc-event-selected'))
    }, 120)
  }, [])

  /** Drop FC’s focus/selected chrome on session tiles after opening edit UI (keeps grid clean). */
  const clearSessionEventClickChrome = useCallback((el: HTMLElement) => {
    queueMicrotask(() => {
      el.classList.remove('fc-event-selected')
      el.blur()
    })
  }, [])

  const createCalendarSnapshot = useCallback(() => {
    const shell = document.querySelector('.calendar-fc-shell') as HTMLElement
    if (!shell) return

    if (calendarSnapshotRef.current) {
      calendarSnapshotRef.current.remove()
    }

    const clone = shell.cloneNode(true) as HTMLElement
    clone.classList.add('calendar-snapshot-layer')
    
    clone.style.position = 'absolute'
    clone.style.top = '0'
    clone.style.left = '0'
    clone.style.width = '100%'
    clone.style.height = '100%'
    clone.style.pointerEvents = 'none'
    clone.style.zIndex = '5'
    clone.style.transform = 'none'
    clone.style.transition = 'none' // Wipe any snapshot legacy transition

    if (shell.parentElement) {
      shell.parentElement.style.position = 'relative'
      shell.parentElement.appendChild(clone)
    }
    calendarSnapshotRef.current = clone
  }, [])

  const navigateCalendar = useCallback((dir: -1 | 1) => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (isDraggingEventRef.current) {
      document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
    }
    
    // Disable snapshot animations on large resolutions (laptops & monitors)
    if (window.innerWidth >= 1024) {
      if (dir < 0) api.prev()
      else api.next()
      return
    }
    
    createCalendarSnapshot()
    
    const screenW = window.innerWidth
    setCalendarIsSwiping(true)
    setSwipeTransitionActive(true)
    setCalendarSlideX(dir < 0 ? -screenW : screenW)

    if (dir < 0) api.prev()
    else api.next()

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCalendarIsSwiping(false)
        setCalendarSlideX(0)
        
        if (calendarSnapshotRef.current) {
          calendarSnapshotRef.current.style.setProperty('--calendar-slide-clone', `${dir < 0 ? screenW : -screenW}px`)
        }
        
        window.setTimeout(() => {
          if (calendarSnapshotRef.current) {
            calendarSnapshotRef.current.remove()
            calendarSnapshotRef.current = null
          }
          setSwipeTransitionActive(false)
        }, 320)
      })
    })
  }, [createCalendarSnapshot])

  const handleCalendarSwipeTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    // Disable click-and-drag swipe on large resolutions. Leaves standard drag/drop functional.
    if (window.innerWidth >= 1024) return
    
    const target = e.target as HTMLElement | null
    if (target?.closest('select')) return
    // Event drag sets isDraggingEventRef only in eventDragStart, after movement; without this, the first
    // few pixels of a horizontal drag on a session tile are classified as week swipe (api.prev/next).
    // Only skip for booked/personal/todo tiles — bookable/availability blocks are still .fc-event but use
    // selection, not event drag; blocking all .fc-event broke swipe from most of the grid.
    if (!isNativeAndroid && !isViewOnly) {
      const eventEl = target?.closest('.fc-event') as HTMLElement | null
      const touchOnDraggableSessionTile =
        eventEl != null &&
        (eventEl.classList.contains('calendar-event-booked-visual') ||
          eventEl.classList.contains('calendar-event-personal-visual') ||
          eventEl.classList.contains('calendar-event-todo-visual'))
      if (touchOnDraggableSessionTile) return
    }
    if (pinchZoomRef.current > 1.001) return
    if ('touches' in e && e.touches.length >= 2) return
    const t = 'touches' in e ? e.touches[0] : e
    calendarSwipeStartRef.current = { x: t.clientX, y: t.clientY }
    calendarSwipeAxisDecidedRef.current = false
    calendarSwipeIsHorizontalRef.current = false

    // To prevent swipes freezing if FullCalendar detaches the target element mid-swipe (e.g. crossing weeks over an event block),
    // we attach an immutable fallback native event listener specifically to this target node ensuring smooth continuation!
    if (target) {
      const onNativeMove = (ev: Event) => swipeHandlersRef.current.move?.(ev)
      const onNativeEnd = (ev: Event) => {
        swipeHandlersRef.current.end?.(ev)
        target.removeEventListener('touchmove', onNativeMove)
        target.removeEventListener('mousemove', onNativeMove)
        target.removeEventListener('touchend', onNativeEnd)
        target.removeEventListener('touchcancel', onNativeEnd)
        target.removeEventListener('mouseup', onNativeEnd)
      }
      target.addEventListener('touchmove', onNativeMove, { passive: true })
      target.addEventListener('mousemove', onNativeMove, { passive: true })
      target.addEventListener('touchend', onNativeEnd, { passive: true })
      target.addEventListener('touchcancel', onNativeEnd, { passive: true })
      target.addEventListener('mouseup', onNativeEnd, { passive: true })
    }
  }, [isNativeAndroid, isViewOnly])

  const handleCalendarSwipeTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('select')) return
    if (isDraggingEventRef.current) {
      isDraggingEventRef.current = false
      dragEdgeSideRef.current = 0
      cleanupDragArtifacts()
      if (calendarSwipeIsHorizontalRef.current) {
        const wrap = swipeWrapRef.current
        if (wrap) {
          wrap.style.setProperty('--calendar-slide-x', '0px')
          wrap.classList.remove('calendar-sliding-enabled', 'calendar-is-swiping', 'calendar-not-swiping')
        }
        setCalendarIsSwiping(false)
        setCalendarSlideX(0)
        setSwipeTransitionActive(false)
        if (calendarSnapshotRef.current) {
          calendarSnapshotRef.current.remove()
          calendarSnapshotRef.current = null
        }
      }
      calendarSwipeAxisDecidedRef.current = false
      calendarSwipeIsHorizontalRef.current = false
      return
    }
    if (pinchZoomRef.current > 1.001) {
      calendarSwipeStartRef.current = null
      if (calendarSwipeIsHorizontalRef.current) {
        const wrap = swipeWrapRef.current
        if (wrap) {
          wrap.style.setProperty('--calendar-slide-x', '0px')
          wrap.classList.remove('calendar-sliding-enabled', 'calendar-is-swiping', 'calendar-not-swiping')
        }
        setCalendarIsSwiping(false)
        setCalendarSlideX(0)
        setSwipeTransitionActive(false)
        if (calendarSnapshotRef.current) {
          calendarSnapshotRef.current.remove()
          calendarSnapshotRef.current = null
        }
      }
      calendarSwipeAxisDecidedRef.current = false
      calendarSwipeIsHorizontalRef.current = false
      return
    }
    const start = calendarSwipeStartRef.current
    calendarSwipeStartRef.current = null
    const wasHorizontal = calendarSwipeIsHorizontalRef.current
    calendarSwipeAxisDecidedRef.current = false
    calendarSwipeIsHorizontalRef.current = false

    if (!start) return
    const t = 'changedTouches' in e ? e.changedTouches[0] : e
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y

    if (wasHorizontal) {
      const dir = calendarSlideDirRef.current
      const screenW = window.innerWidth
      const wrap = swipeWrapRef.current

      const velocity = swipeVelocityRef.current.vx
      const VELOCITY_THRESHOLD = 0.3
      const DISTANCE_THRESHOLD = 56
      const fastFlick = Math.abs(velocity) > VELOCITY_THRESHOLD
      const flickAgainstDir = (dir < 0 && velocity > 0) || (dir > 0 && velocity < 0)
      const shouldSnapBack = dir === 0 || (Math.abs(dx) < DISTANCE_THRESHOLD && !(fastFlick && !flickAgainstDir))

      if (wrap) {
        wrap.classList.remove('calendar-is-swiping')
        wrap.classList.add('calendar-not-swiping')
      }
      setCalendarIsSwiping(false)

      if (shouldSnapBack) {
        if (wrap) wrap.style.setProperty('--calendar-slide-x', `${dir < 0 ? -screenW : screenW}px`)
        calendarSnapshotRef.current?.style.setProperty('--calendar-slide-clone', `0px`)

        window.setTimeout(() => {
          const api = calendarRef.current?.getApi()
          if (api) {
            if (dir < 0) api.next()
            else api.prev()
          }
          if (wrap) {
            wrap.style.setProperty('--calendar-slide-x', '0px')
            wrap.classList.remove('calendar-sliding-enabled', 'calendar-not-swiping')
          }
          if (calendarSnapshotRef.current) {
            calendarSnapshotRef.current.remove()
            calendarSnapshotRef.current = null
          }
          setCalendarSlideX(0)
          setSwipeTransitionActive(false)
        }, 320)
        return
      }

      if (wrap) wrap.style.setProperty('--calendar-slide-x', '0px')
      calendarSnapshotRef.current?.style.setProperty('--calendar-slide-clone', `${dir < 0 ? screenW : -screenW}px`)

      window.setTimeout(() => {
        if (wrap) wrap.classList.remove('calendar-sliding-enabled', 'calendar-not-swiping')
        if (calendarSnapshotRef.current) {
          calendarSnapshotRef.current.remove()
          calendarSnapshotRef.current = null
        }
        setCalendarSlideX(0)
        setSwipeTransitionActive(false)
      }, 320)
      return
    }

    const minDx = 56
    if (Math.abs(dx) < minDx || Math.abs(dx) < Math.abs(dy) * 1.15) return
    navigateCalendar(dx > 0 ? -1 : 1)
  }, [cleanupDragArtifacts, navigateCalendar])

  const handleDragEdgeAutoNavigate = useCallback((clientX: number) => {
    if (!isNativeAndroid || !isDraggingEventRef.current) return
    const host = calendarAndroidWeekRef.current
    const api = calendarRef.current?.getApi()
    if (!host || !api) return
    const rect = host.getBoundingClientRect()
    const edgePx = 28
    const side: -1 | 0 | 1 =
      clientX <= rect.left + edgePx
        ? -1
        : clientX >= rect.right - edgePx
          ? 1
          : 0
    if (side === 0) {
      dragEdgeSideRef.current = 0
      return
    }
    if (dragEdgeSideRef.current === side) return
    dragEdgeSideRef.current = side
    const now = Date.now()
    if (now - dragEdgeNavAtRef.current < 220) return
    dragEdgeNavAtRef.current = now
    navigateCalendar(side)
    calendarSwipeStartRef.current = null
  }, [navigateCalendar])

  const handleCalendarTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingEventRef.current) {
      const t = 'touches' in e ? e.touches[0] : e
      if (!t) return
      handleDragEdgeAutoNavigate(t.clientX)
      return
    }
    const start = calendarSwipeStartRef.current
    if (!start) return
    const t = 'touches' in e ? e.touches[0] : e
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y

    if (!calendarSwipeAxisDecidedRef.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        calendarSwipeAxisDecidedRef.current = true
        calendarSwipeIsHorizontalRef.current = Math.abs(dx) > Math.abs(dy) * 1.15
        if (calendarSwipeIsHorizontalRef.current) {
          const dir = dx > 0 ? -1 : 1
          calendarSlideDirRef.current = dir
          const screenW = window.innerWidth
          const initialOffset = dir < 0 ? -screenW + dx : screenW + dx

          const wrap = swipeWrapRef.current
          if (wrap) {
            wrap.style.setProperty('--calendar-slide-x', `${initialOffset}px`)
            wrap.classList.add('calendar-sliding-enabled', 'calendar-is-swiping')
            wrap.classList.remove('calendar-not-swiping')
          }

          createCalendarSnapshot()

          const api = calendarRef.current?.getApi()
          if (api) {
            if (dir < 0) api.prev()
            else api.next()
          }

          setCalendarIsSwiping(true)
          setSwipeTransitionActive(true)

          swipeVelocityRef.current = { lastX: t.clientX, lastT: performance.now(), vx: 0 }
        }
      }
    }
    if (calendarSwipeIsHorizontalRef.current) {
      const dir = calendarSlideDirRef.current
      const screenW = window.innerWidth
      const liveOffset = dir < 0 ? -screenW + dx : screenW + dx

      swipeWrapRef.current?.style.setProperty('--calendar-slide-x', `${liveOffset}px`)
      calendarSnapshotRef.current?.style.setProperty('--calendar-slide-clone', `${dx}px`)

      const now = performance.now()
      const dt = now - swipeVelocityRef.current.lastT
      if (dt > 0) {
        const instantVx = (t.clientX - swipeVelocityRef.current.lastX) / dt
        swipeVelocityRef.current.vx = 0.7 * instantVx + 0.3 * swipeVelocityRef.current.vx
      }
      swipeVelocityRef.current.lastX = t.clientX
      swipeVelocityRef.current.lastT = now
    }
  }, [createCalendarSnapshot, handleDragEdgeAutoNavigate])

  useEffect(() => {
    swipeHandlersRef.current.move = handleCalendarTouchMove
    swipeHandlersRef.current.end = handleCalendarSwipeTouchEnd
  }, [handleCalendarTouchMove, handleCalendarSwipeTouchEnd])

  const clearForcedHoverRow = useCallback(() => {
    if (hoveredTimegridRowRef.current) {
      hoveredTimegridRowRef.current.classList.remove('calendar-hover-row-forced')
      hoveredTimegridRowRef.current = null
    }
  }, [])

  const updateCalendarHoverRow = useCallback((clientY: number) => {
    if (
      isNativeAndroid ||
      (view !== 'timeGridWeek' && view !== 'timeGridDay' && view !== 'timeGridThreeDay') ||
      calendarMode !== 'bookings'
    ) {
      clearForcedHoverRow()
      return
    }
    const host = calendarAndroidWeekRef.current
    if (!host) return
    const timeGridBody = host.querySelector('.fc-timegrid-body') as HTMLElement | null
    if (!timeGridBody) {
      clearForcedHoverRow()
      return
    }
    const bodyRect = timeGridBody.getBoundingClientRect()
    if (clientY < bodyRect.top || clientY > bodyRect.bottom) {
      clearForcedHoverRow()
      return
    }
    const rows = Array.from(host.querySelectorAll('.fc-timegrid-slots tbody tr')) as HTMLTableRowElement[]
    if (!rows.length) {
      clearForcedHoverRow()
      return
    }
    const nextRow = rows.find((row) => {
      const r = row.getBoundingClientRect()
      return clientY >= r.top && clientY < r.bottom
    }) ?? null
    if (hoveredTimegridRowRef.current === nextRow) return
    clearForcedHoverRow()
    if (nextRow) {
      nextRow.classList.add('calendar-hover-row-forced')
      hoveredTimegridRowRef.current = nextRow
    }
  }, [isNativeAndroid, view, calendarMode, clearForcedHoverRow])

  const handleCalendarMouseMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    updateCalendarHoverRow(e.clientY)
    if (!isDraggingEventRef.current) return
    handleDragEdgeAutoNavigate(e.clientX)
  }, [updateCalendarHoverRow, handleDragEdgeAutoNavigate])

  const handleCalendarMouseLeave = useCallback(() => {
    clearForcedHoverRow()
  }, [clearForcedHoverRow])

  useEffect(() => {
    clearForcedHoverRow()
  }, [calendarMode, view, clearForcedHoverRow])

  /** Match web `todayDay`: go to today in day view so the button reliably navigates on Android WebView. */
  const goToTodayAndroid = useCallback(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    api.changeView('timeGridDay')
    window.setTimeout(() => {
      const a = calendarRef.current?.getApi()
      if (!a) return
      a.today()
      requestAnimationFrame(() => a.updateSize())
    }, 0)
  }, [])

  const openCalendarDayView = useCallback(
    (date: Date) => {
      const api = calendarRef.current?.getApi()
      if (!api) return
      api.gotoDate(date)
      const spacesOn = settings.SPACES_ENABLED === 'true'
      const wantResource =
        (calendarMode === 'spaces' && spaceFilterId == null && !isNativeAndroid && spacesOn) ||
        (calendarMode === 'bookings' && user.role === 'ADMIN' && consultantFilterId == null && !isNativeAndroid)
      api.changeView(wantResource ? 'resourceTimeGridDay' : 'timeGridDay')
      setAndroidScheduleOpen(false)
    },
    [calendarMode, spaceFilterId, consultantFilterId, settings.SPACES_ENABLED, user.role],
  )

  const renderAndroidCornerViewToggle = useCallback(
    (viewType?: string) => {
      if (!isNativeAndroid) return
      const root = calendarAndroidWeekRef.current
      const api = calendarRef.current?.getApi()
      if (!root || !api) return
      root.querySelectorAll('.calendar-android-corner-nav').forEach((n) => n.remove())
      if (viewType !== 'timeGridDay' && viewType !== 'timeGridWeek' && viewType !== 'timeGridThreeDay') return
      const axisHeader = root.querySelector('.fc .fc-timegrid .fc-col-header tr th.fc-timegrid-axis')
      if (!axisHeader) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'calendar-android-corner-nav'
      btn.dataset.view = viewType === 'timeGridDay' ? 'week' : 'month'
      btn.title = viewType === 'timeGridDay' ? 'Week view' : 'Month view'
      btn.setAttribute('aria-label', btn.title)
      const svgNs = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNs, 'svg')
      svg.setAttribute('width', '14')
      svg.setAttribute('height', '14')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', '2')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      svg.setAttribute('aria-hidden', 'true')
      const rect = document.createElementNS(svgNs, 'rect')
      rect.setAttribute('x', '3')
      rect.setAttribute('y', '4')
      rect.setAttribute('width', '18')
      rect.setAttribute('height', '18')
      rect.setAttribute('rx', '2')
      svg.appendChild(rect)
      const topLine = document.createElementNS(svgNs, 'path')
      topLine.setAttribute('d', 'M3 10h18')
      svg.appendChild(topLine)
      const detail = document.createElementNS(svgNs, 'path')
      detail.setAttribute(
        'd',
        viewType === 'timeGridDay'
          ? 'M8 2v4M16 2v4M7.5 15.5l2-3.5 2 3.5 2-3.5 2 3.5'
          : 'M8 14h3M13 14h3M8 18h3M13 18h3M8 2v4M16 2v4',
      )
      svg.appendChild(detail)
      btn.appendChild(svg)
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        api.changeView(viewType === 'timeGridDay' ? 'timeGridWeek' : 'dayGridMonth')
      })
      axisHeader.appendChild(btn)
    },
    [isNativeAndroid],
  )

  const applySettingsAndMeta = (
    s: { data?: Record<string, string> },
    clients: { data: any },
    users: { data: any },
    spaces: { data: any },
    types: { data: any },
    groups?: { data: any },
  ) => {
    let settingsData = s.data || {}
    if (!settingsData.WORKING_HOURS_START && !settingsData.WORKING_HOURS_END) {
      try {
        const raw = localStorage.getItem(WORKING_HOURS_FALLBACK_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') settingsData = { ...settingsData, ...parsed }
        }
      } catch {
        // ignore storage errors
      }
    }
    setSettings(settingsData)
    setMeta({ clients: clients.data, users: users.data, spaces: spaces.data, types: types.data, groups: groups?.data ?? [] })
  }

  const loadMetaOnly = async () => {
    const [s, clients, users, spaces, types, groups] = await Promise.all([
      api.get('/settings'),
      api.get('/clients'),
      user.role === 'ADMIN'
        ? api.get('/users').catch(() => ({ data: [] }))
        : Promise.resolve({ data: [user] }),
      api.get('/spaces'),
      api.get('/types'),
      api.get('/groups').catch(() => ({ data: [] })),
    ])
    applySettingsAndMeta(s, clients, users, spaces, types, groups)
  }

  const load = async () => {
    const { fromStr, toStr, key } = computeCalendarFetchRange()
    const [c, s, clients, users, spaces, types, groups] = await Promise.all([
      api.get('/bookings/calendar', { params: { from: fromStr, to: toStr } }),
      api.get('/settings'),
      api.get('/clients'),
      user.role === 'ADMIN'
        ? api.get('/users').catch(() => ({ data: [] }))
        : Promise.resolve({ data: [user] }),
      api.get('/spaces'),
      api.get('/types'),
      api.get('/groups').catch(() => ({ data: [] })),
    ])
    setCalendarData(c.data)
    applySettingsAndMeta(s, clients, users, spaces, types, groups)
    lastSuccessfulCalendarRangeKeyRef.current = key
  }

  loadRef.current = load

  const loadCalendarRangeOnly = async (force = false) => {
    const { fromStr, toStr, key } = computeCalendarFetchRange()
    if (!force && key === lastSuccessfulCalendarRangeKeyRef.current) return
    const c = await api.get('/bookings/calendar', { params: { from: fromStr, to: toStr } })
    setCalendarData(c.data)
    lastSuccessfulCalendarRangeKeyRef.current = key
  }

  const applyHolidayLabelsToMountedMonthCells = useCallback(() => {
    const calendarRoot = ((calendarRef.current as any)?.elRef?.current ?? null) as HTMLElement | null
    if (!calendarRoot) return
    const dayCells = Array.from(calendarRoot.querySelectorAll('.fc-daygrid-day[data-date]')) as HTMLElement[]
    dayCells.forEach((cell) => {
      const dateKey = cell.getAttribute('data-date') || ''
      const dayTop = cell.querySelector('.fc-daygrid-day-top') as HTMLElement | null
      if (!dayTop) return
      const old = dayTop.querySelector('.calendar-holiday-label')
      if (old) old.remove()
      const holidayName = holidaysByDate[dateKey]
      if (!holidayName) return
      const label = document.createElement('div')
      label.className = 'calendar-holiday-label'
      label.title = holidayName
      label.textContent = holidayName
      dayTop.appendChild(label)
    })
  }, [holidaysByDate])

  useEffect(() => {
    applyHolidayLabelsToMountedMonthCells()
  }, [holidaysByDate, view, applyHolidayLabelsToMountedMonthCells])

  useEffect(() => {
    if (!visibleRange?.start || !visibleRange?.end) return
    const startDate = new Date(visibleRange.start)
    const endExclusive = new Date(visibleRange.end)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endExclusive.getTime())) return
    const endDate = new Date(endExclusive)
    endDate.setDate(endDate.getDate() - 1)
    const from = toIsoDateKey(startDate)
    const to = toIsoDateKey(endDate)
    const key = `${from}:${to}`
    if (key === lastHolidayRangeKeyRef.current) return
    lastHolidayRangeKeyRef.current = key
    let cancelled = false
    api
      .get('/holidays', { params: { from, to } })
      .then((res) => {
        if (cancelled) return
        const rows: Array<{ date?: string; localName?: string; name?: string }> = Array.isArray(res.data) ? res.data : []
        const next: Record<string, string> = {}
        rows.forEach((row) => {
          if (!row?.date) return
          next[row.date] = (row.localName || row.name || '').trim()
        })
        setHolidaysByDate(next)
      })
      .catch(() => {
        if (cancelled) return
        setHolidaysByDate({})
      })
    return () => {
      cancelled = true
    }
  }, [visibleRange])

  useEffect(() => {
    void Promise.all([
      load(),
      api.get('/zoom/status').then((r) => setZoomConnected(r.data.connected)).catch(() => setZoomConnected(false)),
      api.get('/google/status').then((r) => setGoogleConnected(r.data.connected)).catch(() => setGoogleConnected(false)),
      api.get('/ai/voice-booking/status').then((r) => setVoiceBookingConfigured(!!r.data?.configured)).catch(() => setVoiceBookingConfigured(false)),
    ])
    const calendarInterval = window.setInterval(() => void loadCalendarRangeOnly(true), CALENDAR_POLL_MS)
    const metaInterval = window.setInterval(() => void loadMetaOnly(), CALENDAR_META_POLL_MS)
    const refreshClients = () => api.get('/clients').then((r) => {
      const updated: any[] = r.data ?? []
      setMeta((prev: any) => ({ ...prev, clients: updated }))
      setForm((f: any) => {
        if (!f.clientId) return f
        const still = updated.find((c: any) => c.id === f.clientId)
        if (still && still.active !== false) return f
        return { ...f, clientId: undefined }
      })
    }).catch(() => {})
    const onTodosUpdated = () => void loadCalendarRangeOnly(true)
    const onSettingsUpdated = () => void loadMetaOnly()
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void loadMetaOnly()
      void loadCalendarRangeOnly(true)
    }
    window.addEventListener('todos-updated', onTodosUpdated)
    window.addEventListener('clients-updated', refreshClients)
    window.addEventListener('settings-updated', onSettingsUpdated)
    window.addEventListener('users-updated', onSettingsUpdated)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(calendarInterval)
      window.clearInterval(metaInterval)
      window.removeEventListener('todos-updated', onTodosUpdated)
      window.removeEventListener('clients-updated', refreshClients)
      window.removeEventListener('settings-updated', onSettingsUpdated)
      window.removeEventListener('users-updated', onSettingsUpdated)
      document.removeEventListener('visibilitychange', onVisibility)
      if (datesSetCalendarLoadTimerRef.current != null) {
        window.clearTimeout(datesSetCalendarLoadTimerRef.current)
        datesSetCalendarLoadTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const PENDING_EXTERNAL_TODO_KEY = 'openCalendarTodo'
    const applyPayload = (raw: unknown) => {
      const data = raw as {
        todoId?: unknown
        anchorRect?: { left?: unknown; right?: unknown; top?: unknown; bottom?: unknown } | null
      }
      const todoId = Number(data?.todoId)
      if (!Number.isFinite(todoId)) return
      const r = data?.anchorRect
      const hasRect =
        !!r &&
        Number.isFinite(Number(r.left)) &&
        Number.isFinite(Number(r.right)) &&
        Number.isFinite(Number(r.top)) &&
        Number.isFinite(Number(r.bottom))
      setPendingExternalTodo({
        todoId,
        anchorRect: hasRect
          ? {
              left: Number(r!.left),
              right: Number(r!.right),
              top: Number(r!.top),
              bottom: Number(r!.bottom),
            }
          : null,
      })
    }

    try {
      const raw = sessionStorage.getItem(PENDING_EXTERNAL_TODO_KEY)
      if (raw) {
        applyPayload(JSON.parse(raw))
        sessionStorage.removeItem(PENDING_EXTERNAL_TODO_KEY)
      }
    } catch {
      // ignore malformed payloads
    }

    const onOpenTodoFromShell = (ev: Event) => {
      const ce = ev as CustomEvent
      applyPayload(ce.detail)
    }

    window.addEventListener('open-calendar-todo', onOpenTodoFromShell)
    return () => {
      window.removeEventListener('open-calendar-todo', onOpenTodoFromShell)
    }
  }, [])

  useEffect(() => {
    if (!pendingExternalTodo || !todosModuleEnabled) return
    const todo = (calendarData.todos || []).find((t: any) => t.id === pendingExternalTodo.todoId)
    if (!todo) return
    sessionPopupAnchorRectRef.current = pendingExternalTodo.anchorRect ?? null
    setSelectedTodo(todo)
    setPendingExternalTodo(null)
  }, [pendingExternalTodo, calendarData.todos, todosModuleEnabled])

  useEffect(() => {
    if (!todosModuleEnabled) return
    const todoIdRaw = new URLSearchParams(location.search).get('todoId')
    if (!todoIdRaw) return
    const todoId = Number(todoIdRaw)
    if (!Number.isFinite(todoId)) return
    navigate(`/calendar/todo/${todoId}`, { replace: true })
  }, [todosModuleEnabled, location.search, navigate])

  const PENDING_BOOKING_KEY = 'pendingOnlineBooking'

  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_BOOKING_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_BOOKING_KEY)
    try {
      const pending = JSON.parse(raw)
      const pendingGroupIdRaw = pending.groupId != null ? Number(pending.groupId) : NaN
      const pendingGroupId = Number.isFinite(pendingGroupIdRaw) && pendingGroupIdRaw > 0 ? pendingGroupIdRaw : null
      const pendingClientIds = Array.isArray(pending.clientIds)
        ? pending.clientIds
            .map((v: any) => Number(v))
            .filter((v: number) => Number.isInteger(v) && v > 0)
        : (() => {
            const n = Number(pending.clientId)
            return Number.isInteger(n) && n > 0 ? [n] : []
          })()
      const hasClients = pendingClientIds.length > 0
      if ((!hasClients && !pendingGroupId) || !pending.consultantId || !pending.startTime || !pending.endTime) return
      Promise.all([
        api.get('/zoom/status').then((r) => r.data.connected).catch(() => false),
        api.get('/google/status').then((r) => r.data.connected).catch(() => false),
      ]).then(([zoom, google]) => {
        setZoomConnected(zoom)
        setGoogleConnected(google)
        const provider = pending.meetingProvider || 'zoom'
        const connected = provider === 'google' ? google : zoom
        if (!connected) {
          setSaveBookingError(`Still not connected to ${provider === 'google' ? 'Google Meet' : 'Zoom'}. Please try again.`)
          return
        }
        const payload = pendingGroupId
          ? {
              groupId: pendingGroupId,
              ...(pendingClientIds.length > 0
                ? { clientId: pendingClientIds[0], clientIds: pendingClientIds }
                : { clientIds: [] as number[] }),
              consultantId: pending.consultantId,
              startTime: pending.startTime,
              endTime: pending.endTime,
              spaceId: pending.spaceId ?? null,
              typeId: pending.typeId ?? null,
              notes: pending.notes ?? '',
              meetingLink: null,
              online: true,
              meetingProvider: provider,
              groupEmailOverride: null,
              groupBillingCompanyIdOverride: null,
            }
          : {
              clientId: pendingClientIds[0],
              clientIds: pendingClientIds,
              consultantId: pending.consultantId,
              startTime: pending.startTime,
              endTime: pending.endTime,
              spaceId: pending.spaceId ?? null,
              typeId: pending.typeId ?? null,
              notes: pending.notes ?? '',
              meetingLink: null,
              online: true,
              meetingProvider: provider,
              groupEmailOverride: null,
              groupBillingCompanyIdOverride: null,
            }
        api.post('/bookings', payload, {
          headers: { 'X-Skip-Conflict-Toast': 'true' },
        }).then(() => {
          load()
          window.dispatchEvent(new Event('todos-updated'))
          setSelection(null)
          setEditingClientSearch(false)
        }).catch((e: any) => {
          const msg = e?.response?.data?.message || e?.message || 'Failed to book session.'
          setSaveBookingError(String(msg))
        })
      })
    } catch {
      // ignore invalid JSON
    }
  }, [])

  const connectZoom = async () => {
    const returnTo = `${location.pathname}${location.search}` || '/calendar'
    setPostZoomReturnPath(returnTo)
    navigate(`/zoom/install?next=${encodeURIComponent(returnTo)}`)
  }
  const connectGoogle = async () => {
    const { data } = await api.get('/google/authorize')
    window.location.href = data.redirectUrl
  }

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const toLocalDateTimeString = (date: Date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  const normalizeToLocalDateTime = (value: string) => {
    if (!value) return value
    // If it includes timezone offset or Z, normalize it to local (no offset) for backend LocalDateTime.
    if (value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value)) {
      return toLocalDateTimeString(new Date(value))
    }
    // If it already looks like local datetime, keep it.
    return value.length === 16 ? `${value}:00` : value
  }

  const fallbackSessionLengthMinutes = Number(settings.SESSION_LENGTH_MINUTES || 60)
  const bookableEnabled = settings.BOOKABLE_ENABLED !== 'false'
  const aiBookingEnabled = settings.AI_BOOKING_ENABLED !== 'false'
  const spacesEnabled = settings.SPACES_ENABLED === 'true'
  /** Spaces setting on and at least one space exists — hide mode + space filters otherwise */
  const calendarSpacesFeatureActive = spacesEnabled && metaSpaces.length > 0
  /** Right rail shows mode switch (spaces) and/or date arrows; omit grid column when unused so the grid fills width */
  const showCalendarRightRail =
    calendarSpacesFeatureActive || (calendarDateNavArrowsInRail && !calendarMobileHeaderNav)

  const spacesUseResourceColumns =
    calendarMode === 'spaces' && spaceFilterId == null && !isNativeAndroid && calendarSpacesFeatureActive

  const bookingsUseResourceColumns =
    calendarMode === 'bookings' && user.role === 'ADMIN' && consultantFilterId == null && !isNativeAndroid

  const useResourceColumns = spacesUseResourceColumns || bookingsUseResourceColumns

  useEffect(() => {
    if (!personalModuleEnabled) {
      setForm((f: any) => ({ ...f, personal: false }))
      setSelectedPersonalBlock(null)
      setPersonalTaskPresetDropdownOpen(false)
    }
  }, [personalModuleEnabled])

  useEffect(() => {
    if (!todosModuleEnabled) {
      setForm((f: any) => ({ ...f, todo: false }))
      setSelectedTodo(null)
      setAndroidTodoOpen(false)
    }
  }, [todosModuleEnabled])

  const calendarPlugins = useMemo(
    () =>
      isNativeAndroid
        ? [dayGridPlugin, timeGridPlugin, interactionPlugin]
        : [dayGridPlugin, timeGridPlugin, interactionPlugin, resourcePlugin, resourceTimeGridPlugin, resourceDayGridPlugin],
    [],
  )

  const calendarResources = useMemo((): { id: string; title: string }[] | undefined => {
    if (spacesUseResourceColumns) {
      return [
        { id: SPACE_RESOURCE_UNASSIGNED_ID, title: t('spaceUnassigned') },
        ...metaSpaces.map((s: any) => ({ id: String(s.id), title: s.name })),
      ]
    }
    if (bookingsUseResourceColumns) {
      const consultants = metaUsers.filter((u: any) => u.consultant || u.role === 'CONSULTANT')
      return [
        { id: CONSULTANT_RESOURCE_UNASSIGNED_ID, title: t('consultantUnassigned') },
        ...consultants.map((u: any) => ({
          id: String(u.id),
          title: `${u.firstName} ${u.lastName}`.trim(),
        })),
      ]
    }
    return undefined
  }, [spacesUseResourceColumns, bookingsUseResourceColumns, metaSpaces, metaUsers, t])

  /** When FC resource day view omits the date row, show the same stack as dayHeaderContent (belt-and-suspenders). */
  const resourceDayViewHeaderFallbackEl = useMemo(() => {
    if (isNativeAndroid || !useResourceColumns || view !== 'resourceTimeGridDay' || !visibleRange?.start) {
      return null
    }
    const d = new Date(`${visibleRange.start}T12:00:00`)
    if (!Number.isFinite(d.getTime())) return null
    const dowRaw = d.toLocaleDateString(calendarLocaleTag, { weekday: 'short' })
    const dowBase = dowRaw.replace(/\.$/, '').slice(0, 3)
    const dow = dowBase.charAt(0).toUpperCase() + dowBase.slice(1).toLowerCase()
    const dayNum = d.getDate()
    const holidayName = holidaysByDate[toIsoDateKey(d)]
    const now = new Date()
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    return (
      <div className="calendar-resource-day-header-fallback" key={visibleRange.start}>
        <div className="calendar-resource-day-header-fallback-inner">
          <div className="calendar-resource-day-header-fallback-axis" aria-hidden />
          <div className="calendar-resource-day-header-fallback-cell">
            <div
              className="fc-day-header-stack"
              role="button"
              tabIndex={0}
              onClick={() => openCalendarDayView(d)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openCalendarDayView(d)
                }
              }}
            >
              <span
                className={`calendar-header-holiday-pill${holidayName ? '' : ' calendar-header-holiday-pill--empty'}`}
                title={holidayName || ''}
              >
                {holidayName || '\u00A0'}
              </span>
              <span className="fc-day-header-dow">{dow}</span>
              <span className={`fc-day-header-dom${isToday ? ' fc-day-header-dom--today' : ''}`}>{dayNum}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }, [
    isNativeAndroid,
    useResourceColumns,
    view,
    visibleRange?.start,
    holidaysByDate,
    calendarLocaleTag,
    openCalendarDayView,
  ])

  useEffect(() => {
    if (isNativeAndroid) return
    const switchView = () => {
      const api = calendarRef.current?.getApi()
      if (!api) return
      const cur = api.view.type
      const toResource: Record<string, string> = {
        timeGridDay: 'resourceTimeGridDay',
        timeGridWeek: 'resourceTimeGridWeek',
        timeGridThreeDay: 'resourceTimeGridThreeDay',
        dayGridMonth: 'resourceDayGridMonth',
      }
      const fromResource: Record<string, string> = {
        resourceTimeGridDay: 'timeGridDay',
        resourceTimeGridWeek: 'timeGridWeek',
        resourceTimeGridThreeDay: 'timeGridThreeDay',
        resourceDayGridMonth: 'dayGridMonth',
      }
      const isResourceView = cur.startsWith('resource')
      if (useResourceColumns) {
        if (!isResourceView) {
          const next = toResource[cur] ?? 'resourceTimeGridWeek'
          api.changeView(next)
          requestAnimationFrame(() => api.updateSize())
        }
      } else {
        if (isResourceView) {
          const next = fromResource[cur] ?? 'timeGridWeek'
          api.changeView(next)
          requestAnimationFrame(() => api.updateSize())
        }
      }
    }
    // Defer once to avoid flushSync warning while preventing double-switch jitter.
    const t1 = setTimeout(switchView, 0)
    return () => { clearTimeout(t1) }
  }, [calendarMode, spaceFilterId, consultantFilterId, isNativeAndroid, useResourceColumns])

  const toCalendarTimeValue = (value: string | undefined, fallback: string) => {
    const v = (value || fallback).trim()
    if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`
    if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v
    return `${fallback}:00`
  }
  const slotMinTime = toCalendarTimeValue(settings.WORKING_HOURS_START, '05:00')
  const slotMaxTime = toCalendarTimeValue(settings.WORKING_HOURS_END, '23:00')
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const
  const calendarSlotDurationMinutes = 15

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX}px)`)
    const apply = () => {
      calendarSmallDragHintViewportRef.current = mq.matches
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const teardownCalendarDragAxisHint = useCallback(() => {
    const cleanup = calendarDragPointerCleanupRef.current
    if (cleanup) {
      cleanup()
      calendarDragPointerCleanupRef.current = null
    }
    const pill = calendarDragTimePillRef.current
    if (pill?.parentNode) {
      pill.remove()
      calendarDragTimePillRef.current = null
    }
  }, [])

  const positionCalendarDragAxisHint = useCallback(
    (clientY: number) => {
      if (!calendarSmallDragHintViewportRef.current || !isDraggingEventRef.current) {
        const p = calendarDragTimePillRef.current
        if (p) p.style.visibility = 'hidden'
        return
      }
      const host = calendarAndroidWeekRef.current
      if (!host) return
      const api = calendarRef.current?.getApi()
      const vt = api?.view.type ?? ''
      if (!vt.includes('timeGrid')) {
        const p = calendarDragTimePillRef.current
        if (p) p.style.visibility = 'hidden'
        return
      }

      const mirror =
        (host.querySelector('.fc-event-mirror') as HTMLElement | null)
        ?? (document.querySelector('.fc .fc-event-mirror') as HTMLElement | null)
      const yAnchor = mirror ? mirror.getBoundingClientRect().top + 1 : clientY

      const rows = Array.from(host.querySelectorAll('.fc-timegrid-slots tbody tr')) as HTMLTableRowElement[]
      if (!rows.length) return

      let row = rows.find((r) => {
        const b = r.getBoundingClientRect()
        return yAnchor >= b.top && yAnchor < b.bottom
      })
      if (!row) {
        const topR = rows[0].getBoundingClientRect()
        const botR = rows[rows.length - 1].getBoundingClientRect()
        if (yAnchor < topR.top) row = rows[0]
        else if (yAnchor > botR.bottom) row = rows[rows.length - 1]
        else return
      }

      const idx = rows.indexOf(row)
      const minParts = slotMinTime.split(':').map((v) => Number(v) || 0)
      const startMin = minParts[0] * 60 + (minParts[1] || 0)
      const tMin = startMin + idx * calendarSlotDurationMinutes
      const hh = Math.floor(tMin / 60)
      const mm = tMin % 60
      const labelDate = new Date(2000, 0, 1, hh, mm, 0, 0)
      const text = labelDate.toLocaleTimeString(calendarLocaleTag, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })

      const labelCell = row.querySelector('.fc-timegrid-slot-label') as HTMLElement | null
      if (!labelCell) return

      let pill = calendarDragTimePillRef.current
      if (!pill) {
        pill = document.createElement('div')
        pill.className = 'calendar-drag-axis-time-hint'
        pill.setAttribute('aria-live', 'polite')
        pill.setAttribute('role', 'status')
        document.body.appendChild(pill)
        calendarDragTimePillRef.current = pill
      }

      const lr = labelCell.getBoundingClientRect()
      pill.textContent = text
      pill.style.visibility = 'visible'
      pill.style.position = 'fixed'
      pill.style.left = `${lr.left}px`
      pill.style.top = `${lr.top}px`
      pill.style.width = `${lr.width}px`
      pill.style.minHeight = `${lr.height}px`
      pill.style.height = `${lr.height}px`
    },
    [slotMinTime, calendarLocaleTag],
  )

  useEffect(() => () => teardownCalendarDragAxisHint(), [teardownCalendarDragAxisHint])

  useEffect(() => {
    if (calendarMode === 'availability' && !bookableEnabled) {
      setCalendarMode('bookings')
      return
    }
    if (calendarMode === 'spaces' && !calendarSpacesFeatureActive) {
      setCalendarMode('bookings')
    }
  }, [calendarMode, bookableEnabled, calendarSpacesFeatureActive])

  useEffect(() => {
    if (isNativeAndroid) return
    setDragSelection(null)
    calendarRef.current?.getApi()?.unselect()
  }, [calendarMode, isNativeAndroid])

  const openAvailabilityModalFromSelection = (
    start: string,
    end: string,
    preferredConsultantId?: number | null,
    opts?: { skipCompactNavigate?: boolean },
  ) => {
    const startLocal = normalizeToLocalDateTime(start)
    const endLocal = normalizeToLocalDateTime(end)
    const availableConsultants = metaUsers.filter((u: any) => u.consultant)
    const selectionResourceConsultantId =
      selection?.resourceId && selection.resourceId !== CONSULTANT_RESOURCE_UNASSIGNED_ID
        ? Number(selection.resourceId)
        : null
    const defaultConsultantId =
      preferredConsultantId
      ?? (Number.isFinite(selectionResourceConsultantId) ? selectionResourceConsultantId : null)
      ?? consultantFilterId
      ?? availableConsultants[0]?.id
      ?? user.id
    const startDateOnly = startLocal.slice(0, 10)
    const endDateOnly = endLocal.slice(0, 10)
    setSelection({ start: startLocal, end: endLocal })
    setAvailabilityError(null)
    setAvailabilityIntent('add')
    setAvailabilitySelection({
      slotId: null,
      consultantId: defaultConsultantId,
      startTime: startLocal,
      endTime: endLocal,
      indefinite: false,
      rangeStartDate: startDateOnly,
      rangeEndDate: endDateOnly,
    })
    if (useBookingSidePanel && !opts?.skipCompactNavigate) {
      const slotQ: NewSlotQuery = {
        start: startLocal,
        end: endLocal,
        consultantId: defaultConsultantId,
        spaceId: form.spaceId !== undefined ? form.spaceId : undefined,
        clientId: form.clientId != null && Number.isInteger(Number(form.clientId)) && Number(form.clientId) > 0 ? form.clientId : undefined,
        resourceId:
          selection?.resourceId != null && selection.resourceId !== ''
            ? String(selection.resourceId)
            : undefined,
        outsideBookable: Boolean(form.outsideBookable),
      }
      const availabilityQ: AvailabilityFormQuery = {
        start: startLocal,
        end: endLocal,
        consultantId: defaultConsultantId,
        slotId: null,
        indefinite: false,
        rangeStartDate: startDateOnly,
        rangeEndDate: endDateOnly,
        fromWorkingHours: false,
      }
      pushCompactFormRoute(`${ROUTE_NEW_BOOKING}?${mergeNewBookingAndAvailabilitySearch(slotQ, availabilityQ)}`)
    }
  }

  const openAvailabilityModalFromSlot = (slot: any) => {
    const date = slot.date || new Date().toISOString().slice(0, 10)
    const startRaw = String(slot.startTime || '09:00:00')
    const endRaw = String(slot.endTime || '10:00:00')
    const startTime = `${date}T${startRaw.slice(0, 5)}:00`
    const endTime = `${date}T${endRaw.slice(0, 5)}:00`
    setSelection({ start: startTime, end: endTime })
    setAvailabilityError(null)
    setAvailabilityIntent('add')
    setAvailabilitySelection({
      slotId: slot.fromWorkingHours ? null : slot.id,
      consultantId: slot.consultant?.id ?? consultantFilterId ?? user.id,
      startTime,
      endTime,
      indefinite: !!slot.indefinite,
      rangeStartDate: slot.startDate || date,
      rangeEndDate: slot.endDate || date,
    })
    if (useBookingSidePanel) {
      const cid = slot.consultant?.id ?? consultantFilterId ?? user.id
      const slotQ: NewSlotQuery = {
        start: startTime,
        end: endTime,
        consultantId: cid,
      }
      const availabilityQ: AvailabilityFormQuery = {
        start: startTime,
        end: endTime,
        consultantId: cid,
        slotId: slot.fromWorkingHours ? null : slot.id,
        indefinite: !!slot.indefinite,
        rangeStartDate: slot.startDate || date,
        rangeEndDate: slot.endDate || date,
        fromWorkingHours: !!slot.fromWorkingHours,
      }
      pushCompactFormRoute(`${ROUTE_NEW_BOOKING}?${mergeNewBookingAndAvailabilitySearch(slotQ, availabilityQ)}`)
    }
  }

  const buildNewFormPanelOrder = (): Array<'booking' | 'personal' | 'todo' | 'availability'> => {
    const o: Array<'booking' | 'personal' | 'todo' | 'availability'> = ['booking']
    if (personalModuleEnabled) o.push('personal')
    if (todosModuleEnabled) o.push('todo')
    o.push('availability')
    return o
  }

  const getActiveNewFormPanel = (): 'booking' | 'personal' | 'todo' | 'availability' => {
    if (availabilitySelection) return 'availability'
    if (form.todo) return 'todo'
    if (form.personal) return 'personal'
    return 'booking'
  }

  const activateNewFormPanel = (panel: 'booking' | 'personal' | 'todo' | 'availability') => {
    if (panel === 'booking') {
      setAvailabilitySelection(null)
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setForm((f: any) => ({ ...f, personal: false, todo: false }))
      return
    }
    if (panel === 'personal') {
      setAvailabilitySelection(null)
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setForm((f: any) => ({ ...f, personal: true, todo: false, online: false, consultantId: user.id }))
      return
    }
    if (panel === 'todo') {
      setAvailabilitySelection(null)
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setForm((f: any) => ({ ...f, todo: true, personal: false, online: false, consultantId: user.id }))
      return
    }
    const start = form.startTime || selection?.start
    const end = form.endTime || selection?.end
    if (!start || !end) return
    openAvailabilityModalFromSelection(start, end, form.consultantId ?? null, { skipCompactNavigate: true })
  }

  const stepNewFormPanel = (dir: -1 | 1) => {
    if (!useBookingSidePanel || isNativeAndroid) return
    const order = buildNewFormPanelOrder()
    const cur = getActiveNewFormPanel()
    const idx = order.indexOf(cur)
    if (idx < 0) return
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= order.length) return
    activateNewFormPanel(order[nextIdx])
  }

  const newFormPanelSwipeRef = useRef<{ x: number; y: number } | null>(null)

  const onNewFormPanelTouchStart = (e: ReactTouchEvent) => {
    if (!useBookingSidePanel || isNativeAndroid) return
    const p = e.touches[0]
    if (!p) return
    newFormPanelSwipeRef.current = { x: p.clientX, y: p.clientY }
  }

  const onNewFormPanelTouchEnd = (e: ReactTouchEvent) => {
    if (!useBookingSidePanel || isNativeAndroid) return
    const start = newFormPanelSwipeRef.current
    newFormPanelSwipeRef.current = null
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.15) return
    stepNewFormPanel(dx < 0 ? 1 : -1)
    document.querySelectorAll<HTMLElement>('.booking-type-switcher .booking-type-btn').forEach((el) => {
      el.blur()
    })
  }

  const closeAvailabilityModal = () => {
    setSelection(null)
    setAvailabilitySelection(null)
    setAvailabilityIntent('add')
    setAvailabilityError(null)
    setAvailabilitySaving(false)
    setClientDropdownOpen(false)
    setMeetingProviderPickerOpen(false)
    setMeetingPickerCancelUnchecksOnline(false)
    setEditingClientSearch(false)
    if (!isNativeAndroid) {
      setDragSelection(null)
      calendarRef.current?.getApi()?.unselect()
    }
    leaveCompactFormRouteIfNeeded()
  }

  const saveAvailabilitySlot = async () => {
    if (!availabilitySelection) return
    setAvailabilityError(null)
    const startDate = new Date(availabilitySelection.startTime)
    const endDate = new Date(availabilitySelection.endTime)
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      setAvailabilityError('Please provide valid start and end times.')
      return
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setAvailabilityError('End time must be after start time.')
      return
    }
    const consultantId = user.role === 'ADMIN'
      ? Number(availabilitySelection.consultantId)
      : user.id
    if (!consultantId) {
      setAvailabilityError('Please select a consultant.')
      return
    }
    const indefinite = !!availabilitySelection.indefinite
    const payload = {
      dayOfWeek: dayNames[startDate.getDay()],
      startTime: startDate.toTimeString().slice(0, 8),
      endTime: endDate.toTimeString().slice(0, 8),
      consultantId,
      indefinite,
      startDate: indefinite ? null : (availabilitySelection.rangeStartDate || availabilitySelection.startTime.slice(0, 10)),
      endDate: indefinite ? null : (availabilitySelection.rangeEndDate || availabilitySelection.endTime.slice(0, 10)),
    }
    const overlapsDateWindow = (slot: any) => {
      const slotStart = slot.indefinite ? '1970-01-01' : String(slot.startDate || '1970-01-01')
      const slotEnd = slot.indefinite ? '2999-12-31' : String(slot.endDate || '2999-12-31')
      const payloadStart = payload.indefinite ? '1970-01-01' : String(payload.startDate || '1970-01-01')
      const payloadEnd = payload.indefinite ? '2999-12-31' : String(payload.endDate || '2999-12-31')
      return slotStart <= payloadEnd && slotEnd >= payloadStart
    }
    const toMinutes = (timeStr: string) => {
      const [hh, mm] = String(timeStr || '00:00:00').split(':')
      return (Number(hh) || 0) * 60 + (Number(mm) || 0)
    }
    setAvailabilitySaving(true)
    try {
      if (availabilitySelection.slotId) {
        await api.put(`/bookable-slots/${availabilitySelection.slotId}`, payload)
      } else {
        // Upsert behavior for Bookings-mode creation:
        // if an overlapping slot exists for same consultant/day/date-window,
        // expand/update it to the union instead of creating a second row.
        const sameConsultantDaySlots = (calendarData.bookable || []).filter((slot: any) => {
          const slotConsultantId = slot.consultant?.id ?? slot.consultantId
          if (slotConsultantId !== payload.consultantId) return false
          if (slot.dayOfWeek !== payload.dayOfWeek) return false
          return overlapsDateWindow(slot)
        })
        const touchingOrOverlapping = sameConsultantDaySlots.filter((slot: any) => {
          const slotStartMin = toMinutes(String(slot.startTime || '00:00:00'))
          const slotEndMin = toMinutes(String(slot.endTime || '00:00:00'))
          const payloadStartMin = toMinutes(payload.startTime)
          const payloadEndMin = toMinutes(payload.endTime)
          return slotStartMin <= payloadEndMin && slotEndMin >= payloadStartMin
        })
        const payloadStartMin = toMinutes(payload.startTime)
        const payloadEndMin = toMinutes(payload.endTime)
        const coveredRanges = touchingOrOverlapping
          .map((slot: any) => {
            const slotStartMin = toMinutes(String(slot.startTime || '00:00:00'))
            const slotEndMin = toMinutes(String(slot.endTime || '00:00:00'))
            return {
              startMin: Math.max(payloadStartMin, slotStartMin),
              endMin: Math.min(payloadEndMin, slotEndMin),
            }
          })
          .filter((r: any) => r.endMin > r.startMin)
          .sort((a: any, b: any) => a.startMin - b.startMin)
        let coverageCursor = payloadStartMin
        for (const r of coveredRanges) {
          if (r.endMin <= coverageCursor) continue
          if (r.startMin > coverageCursor) break
          coverageCursor = Math.max(coverageCursor, r.endMin)
          if (coverageCursor >= payloadEndMin) break
        }
        if (coverageCursor >= payloadEndMin) {
          // Already fully available for this consultant/day/date window -> no-op.
          await load()
          closeAvailabilityModal()
          return
        }

        if (touchingOrOverlapping.length > 0) {
          const mergedStart = [payload.startTime, ...touchingOrOverlapping.map((s: any) => String(s.startTime || payload.startTime))].sort()[0]
          const mergedEnd = [payload.endTime, ...touchingOrOverlapping.map((s: any) => String(s.endTime || payload.endTime))].sort().slice(-1)[0]
          const mergedIndefinite = payload.indefinite || touchingOrOverlapping.some((s: any) => !!s.indefinite)
          const mergedStartDate = mergedIndefinite
            ? null
            : [String(payload.startDate), ...touchingOrOverlapping.map((s: any) => String(s.startDate || payload.startDate))].sort()[0]
          const mergedEndDate = mergedIndefinite
            ? null
            : [String(payload.endDate), ...touchingOrOverlapping.map((s: any) => String(s.endDate || payload.endDate))].sort().slice(-1)[0]

          const mergedPayload = {
            ...payload,
            startTime: mergedStart,
            endTime: mergedEnd,
            indefinite: mergedIndefinite,
            startDate: mergedStartDate,
            endDate: mergedEndDate,
          }
          const idsToReplace = touchingOrOverlapping.map((s: any) => s.id).filter((id: any) => id != null)
          if (idsToReplace.length > 0) {
            await Promise.all(idsToReplace.map((id: any) => api.delete(`/bookable-slots/${id}`)))
          }
          await api.post('/bookable-slots', mergedPayload)
        } else {
          await api.post('/bookable-slots', payload)
        }
      }
      await load()
      closeAvailabilityModal()
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to save availability session.'
      setAvailabilityError(String(msg))
      setAvailabilitySaving(false)
    }
  }

  const blockAvailabilitySlot = async () => {
    if (!availabilitySelection) return
    setAvailabilityError(null)
    const startDate = new Date(availabilitySelection.startTime)
    const endDate = new Date(availabilitySelection.endTime)
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      setAvailabilityError('Please provide valid start and end times.')
      return
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setAvailabilityError('End time must be after start time.')
      return
    }
    const consultantId = user.role === 'ADMIN'
      ? Number(availabilitySelection.consultantId)
      : user.id
    if (!consultantId) {
      setAvailabilityError('Please select a consultant.')
      return
    }
    const indefinite = !!availabilitySelection.indefinite
    const payload = {
      dayOfWeek: dayNames[startDate.getDay()],
      startTime: startDate.toTimeString().slice(0, 8),
      endTime: endDate.toTimeString().slice(0, 8),
      consultantId,
      indefinite,
      startDate: indefinite ? null : (availabilitySelection.rangeStartDate || availabilitySelection.startTime.slice(0, 10)),
      endDate: indefinite ? null : (availabilitySelection.rangeEndDate || availabilitySelection.endTime.slice(0, 10)),
    }
    const overlapsDateWindow = (slot: any) => {
      const slotStart = slot.indefinite ? '1970-01-01' : String(slot.startDate || '1970-01-01')
      const slotEnd = slot.indefinite ? '2999-12-31' : String(slot.endDate || '2999-12-31')
      const payloadStart = payload.indefinite ? '1970-01-01' : String(payload.startDate || '1970-01-01')
      const payloadEnd = payload.indefinite ? '2999-12-31' : String(payload.endDate || '2999-12-31')
      return slotStart <= payloadEnd && slotEnd >= payloadStart
    }
    const toMinutes = (timeStr: string) => {
      const [hh, mm] = String(timeStr || '00:00:00').split(':')
      return (Number(hh) || 0) * 60 + (Number(mm) || 0)
    }
    setAvailabilitySaving(true)
    try {
      const blockStart = toMinutes(payload.startTime)
      const blockEnd = toMinutes(payload.endTime)
      const candidates = (calendarData.bookable || []).filter((slot: any) => {
        const slotConsultantId = slot.consultant?.id ?? slot.consultantId
        if (slotConsultantId !== payload.consultantId) return false
        if (slot.dayOfWeek !== payload.dayOfWeek) return false
        if (!overlapsDateWindow(slot)) return false
        const slotStart = toMinutes(String(slot.startTime || '00:00:00'))
        const slotEnd = toMinutes(String(slot.endTime || '00:00:00'))
        return slotStart < blockEnd && slotEnd > blockStart
      })

      const toHms = (totalMin: number) => {
        const h = Math.floor(totalMin / 60)
        const m = totalMin % 60
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
      }

      for (const slot of candidates) {
        if (!slot.id) continue
        const slotStart = toMinutes(String(slot.startTime || '00:00:00'))
        const slotEnd = toMinutes(String(slot.endTime || '00:00:00'))
        const overlapStart = Math.max(slotStart, blockStart)
        const overlapEnd = Math.min(slotEnd, blockEnd)
        if (overlapEnd <= overlapStart) continue

        // Fully covered => remove slot.
        if (blockStart <= slotStart && blockEnd >= slotEnd) {
          await api.delete(`/bookable-slots/${slot.id}`)
          continue
        }
        // Clip left edge.
        if (blockStart <= slotStart && blockEnd < slotEnd) {
          await api.put(`/bookable-slots/${slot.id}`, {
            dayOfWeek: slot.dayOfWeek,
            startTime: toHms(blockEnd),
            endTime: slot.endTime,
            consultantId: slot.consultant?.id ?? slot.consultantId,
            indefinite: !!slot.indefinite,
            startDate: slot.indefinite ? null : slot.startDate,
            endDate: slot.indefinite ? null : slot.endDate,
          })
          continue
        }
        // Clip right edge.
        if (blockStart > slotStart && blockEnd >= slotEnd) {
          await api.put(`/bookable-slots/${slot.id}`, {
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: toHms(blockStart),
            consultantId: slot.consultant?.id ?? slot.consultantId,
            indefinite: !!slot.indefinite,
            startDate: slot.indefinite ? null : slot.startDate,
            endDate: slot.indefinite ? null : slot.endDate,
          })
          continue
        }
        // Split middle: keep left by update, create right as a new slot.
        if (blockStart > slotStart && blockEnd < slotEnd) {
          await api.put(`/bookable-slots/${slot.id}`, {
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: toHms(blockStart),
            consultantId: slot.consultant?.id ?? slot.consultantId,
            indefinite: !!slot.indefinite,
            startDate: slot.indefinite ? null : slot.startDate,
            endDate: slot.indefinite ? null : slot.endDate,
          })
          await api.post('/bookable-slots', {
            dayOfWeek: slot.dayOfWeek,
            startTime: toHms(blockEnd),
            endTime: slot.endTime,
            consultantId: slot.consultant?.id ?? slot.consultantId,
            indefinite: !!slot.indefinite,
            startDate: slot.indefinite ? null : slot.startDate,
            endDate: slot.indefinite ? null : slot.endDate,
          })
        }
      }

      // Also add an availability-block marker so working-hours availability
      // is removed for this period as well (not only explicit slots).
      const ownerId = consultantId
      const blockCandidates = personalModuleEnabled
        ? (calendarData.personal || [])
            .filter((p: any) => (p.consultant?.id ?? p.consultantId ?? p.ownerId) === ownerId)
            .filter((p: any) => String(p.task || '').trim().toLowerCase() === AVAILABILITY_BLOCK_TASK)
        : []
      const reqStartMs = startDate.getTime()
      const reqEndMs = endDate.getTime()
      const covered = blockCandidates
        .map((p: any) => ({
          startMs: Math.max(reqStartMs, new Date(p.startTime).getTime()),
          endMs: Math.min(reqEndMs, new Date(p.endTime).getTime()),
        }))
        .filter((r: any) => Number.isFinite(r.startMs) && Number.isFinite(r.endMs) && r.endMs > r.startMs)
        .sort((a: any, b: any) => a.startMs - b.startMs)
      let cursor = reqStartMs
      for (const r of covered) {
        if (r.endMs <= cursor) continue
        if (r.startMs > cursor) break
        cursor = Math.max(cursor, r.endMs)
        if (cursor >= reqEndMs) break
      }
      if (cursor < reqEndMs && personalModuleEnabled) {
        await api.post('/bookings/personal-blocks', {
          startTime: availabilitySelection.startTime,
          endTime: availabilitySelection.endTime,
          task: AVAILABILITY_BLOCK_TASK,
          notes: 'Availability blocked',
          consultantId: user.role === 'ADMIN' ? consultantId : undefined,
        })
      }

      await load()
      closeAvailabilityModal()
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to block availability session.'
      setAvailabilityError(String(msg))
      setAvailabilitySaving(false)
    }
  }

  const confirmAvailabilityFromHeader = () => {
    void (availabilityIntent === 'block' ? blockAvailabilitySlot() : saveAvailabilitySlot())
  }

  const deleteAvailabilitySlot = async () => {
    if (!availabilitySelection?.slotId) return
    setAvailabilitySaving(true)
    setAvailabilityError(null)
    try {
      await api.delete(`/bookable-slots/${availabilitySelection.slotId}`)
      await load()
      closeAvailabilityModal()
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to delete availability session.'
      setAvailabilityError(String(msg))
      setAvailabilitySaving(false)
    }
  }

  const setCalendarModeView = useCallback(
    (mode: 'bookings' | 'availability' | 'spaces') => {
      if (mode === 'availability' && !bookableEnabled) return
      if (mode === 'spaces' && !calendarSpacesFeatureActive) return
      if (mode !== calendarMode) {
        setModeSwitching(true)
        if (modeSwitchingTimerRef.current != null) window.clearTimeout(modeSwitchingTimerRef.current)
        modeSwitchingTimerRef.current = window.setTimeout(() => {
          setModeSwitching(false)
          modeSwitchingTimerRef.current = null
        }, 380)
      }
      setCalendarMode(mode)
      setConfirmNonBookable(null)
      setSelection(null)
      setSelectedBookedSession(null)
      setSelectedPersonalBlock(null)
      setSelectedTodo(null)
      setAvailabilitySelection(null)
      setAvailabilityIntent('add')
      setAvailabilityError(null)
      setAvailabilitySaving(false)
    },
    [bookableEnabled, calendarMode, calendarSpacesFeatureActive],
  )

  useEffect(() => {
    return () => {
      if (modeSwitchingTimerRef.current != null) {
        window.clearTimeout(modeSwitchingTimerRef.current)
      }
    }
  }, [])

  const showAdminConsultantFilter = useMemo(
    () => user.role === 'ADMIN' && calendarMode !== 'spaces' && metaUsers.length > 1,
    [user.role, calendarMode, metaUsers.length],
  )

  const shellCalendarFilters = useMemo(
    () => (
      <CalendarHeaderFilters
        showConsultant={showAdminConsultantFilter}
        showSpace={calendarSpacesFeatureActive && calendarMode !== 'availability'}
        consultantFilterId={consultantFilterId}
        onConsultantFilterChange={setConsultantFilterId}
        spaceFilterId={spaceFilterId}
        onSpaceFilterChange={setSpaceFilterId}
        consultantUsers={metaUsers.filter((u: any) => u.consultant)}
        spaces={metaSpaces}
      />
    ),
    [
      showAdminConsultantFilter,
      calendarMode,
      calendarSpacesFeatureActive,
      consultantFilterId,
      spaceFilterId,
      metaUsers,
      metaSpaces,
    ],
  )

  const showWebMobileBottomPanel =
    !isNativeAndroid &&
    calendarFiltersBottomBar &&
    ((user.role === 'ADMIN' && calendarMode !== 'spaces') ||
      (calendarSpacesFeatureActive && calendarMode !== 'availability') ||
      aiBookingEnabled)

  useEffect(() => {
    if (isNativeAndroid) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      const api = calendarRef.current?.getApi()
      if (!api) return
      const k = e.key.toLowerCase()
      const res = useResourceColumns
      if (k === 'd') {
        e.preventDefault()
        api.changeView(res ? 'resourceTimeGridDay' : 'timeGridDay')
        api.today()
      } else if (k === '3') {
        e.preventDefault()
        goToThreeDayViewWithTodayCentered(calendarRef, res)
      } else if (k === 'w') {
        e.preventDefault()
        api.changeView(res ? 'resourceTimeGridWeek' : 'timeGridWeek')
      } else if (k === 'm') {
        e.preventDefault()
        api.changeView(res ? 'resourceDayGridMonth' : 'dayGridMonth')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isNativeAndroid, useResourceColumns])

  const getTypeMeta = (typeId: number | null | undefined) => {
    if (!typeId) return null
    return metaTypes?.find((x: any) => x.id === typeId) ?? null
  }

  const getTypeDurationMinutes = (typeId: number | null | undefined) => {
    const fallbackDuration = Number.isFinite(fallbackSessionLengthMinutes) && fallbackSessionLengthMinutes > 0
      ? fallbackSessionLengthMinutes
      : 60
    const t = getTypeMeta(typeId)
    const n = Number(t?.durationMinutes ?? fallbackDuration)
    if (!Number.isFinite(n) || n <= 0) return fallbackDuration
    return n
  }

  const getTypeBreakMinutes = (typeId: number | null | undefined) => {
    const t = getTypeMeta(typeId)
    const n = Number(t?.breakMinutes ?? 0)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
  }

  const getTypeMaxParticipants = (typeId: number | null | undefined) => {
    const t = getTypeMeta(typeId)
    const n = Number(t?.maxParticipantsPerSession)
    if (!Number.isFinite(n) || n < 1 || n > 99) return null
    return n
  }

  const getBookingBreakMinutes = (booking: any) => {
    const direct = Number(booking?.type?.breakMinutes)
    if (Number.isFinite(direct) && direct >= 0) return direct
    return getTypeBreakMinutes(booking?.type?.id)
  }

  const getBookingBusyEndMs = (booking: any) => {
    const endMs = new Date(booking?.endTime).getTime()
    if (!Number.isFinite(endMs)) return endMs
    return endMs + getBookingBreakMinutes(booking) * 60000
  }

  const getBookingBreakRange = (booking: any) => {
    const breakMinutes = getBookingBreakMinutes(booking)
    if (!Number.isFinite(breakMinutes) || breakMinutes <= 0) return null
    const startMs = new Date(booking?.endTime).getTime()
    if (!Number.isFinite(startMs)) return null
    const endMs = startMs + breakMinutes * 60000
    if (endMs <= startMs) return null
    return { startMs, endMs, breakMinutes }
  }

  const getBookingEndTimeForStart = (startValue: string, typeId: number | null | undefined) => {
    const normalizedStartValue = normalizeToLocalDateTime(startValue)
    const startDate = new Date(normalizedStartValue)
    if (!Number.isFinite(startDate.getTime())) return normalizedStartValue
    return toLocalDateTimeString(new Date(startDate.getTime() + getTypeDurationMinutes(typeId) * 60000))
  }

  const updateBookingFormStartTime = (nextStartTime: string) => {
    const normalizedStartTime = normalizeToLocalDateTime(nextStartTime)
    bookingEndEditedManuallyRef.current = false
    setForm((currentForm: any) => ({
      ...currentForm,
      startTime: normalizedStartTime,
      endTime: getBookingEndTimeForStart(normalizedStartTime, currentForm.typeId),
    }))
  }

  const updateBookingFormEndTime = (nextEndTime: string) => {
    bookingEndEditedManuallyRef.current = true
    setForm((currentForm: any) => ({
      ...currentForm,
      endTime: normalizeToLocalDateTime(nextEndTime),
    }))
  }

  const updateBookingFormType = (nextTypeId: number | null) => {
    setForm((currentForm: any) => {
      const allDay = isLocalBookingAllDay(currentForm.startTime, currentForm.endTime)
      return {
        ...currentForm,
        typeId: nextTypeId,
        endTime: allDay
          ? currentForm.endTime
          : bookingEndEditedManuallyRef.current
            ? currentForm.endTime
            : getBookingEndTimeForStart(currentForm.startTime, nextTypeId),
      }
    })
  }

  const effectiveConsultantFilterId = calendarMode === 'spaces' ? null : consultantFilterId

  /** Bookable / booked rows: non-admin → own consultant only; admin + filter → that consultant; admin + ALL → all. */
  const filterByConsultantRole = (list: any[] | undefined) => {
    if (!Array.isArray(list)) return []
    if (calendarMode === 'spaces') return list
    if (user.role !== 'ADMIN') {
      return list.filter((item: any) => item.consultant?.id === user.id)
    }
    if (effectiveConsultantFilterId == null || effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION) return list
    return list.filter((item: any) => item.consultant?.id === effectiveConsultantFilterId)
  }

  const adminConsultantFilterActive = user.role === 'ADMIN' && effectiveConsultantFilterId != null
  const selectedConsultantLabel = effectiveConsultantFilterId == null
    ? t('calendarFilterByStaffColumns')
    : effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION
      ? t('calendarFilterAllSessionsMerged')
      : fullName(metaUsers.find((u: any) => u.id === effectiveConsultantFilterId) || { firstName: '', lastName: '' })
  const selectedSpaceLabel = spaceFilterId == null
    ? t('calendarSpaceFilterAllLocations')
    : ((metaSpaces).find((s: any) => s.id === spaceFilterId)?.name || t('calendarSpaceFilterAllLocations'))

  const SLOT_MS = 15 * 60 * 1000

  const events = useMemo(() => {
    const selectedIsSelf = effectiveConsultantFilterId != null && effectiveConsultantFilterId === user.id
    const adminAll = user.role === 'ADMIN' && (effectiveConsultantFilterId == null || effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION)
    const adminSpecificOther = user.role === 'ADMIN' && effectiveConsultantFilterId != null && effectiveConsultantFilterId !== CONSULTANT_FILTER_ALL_SESSION && effectiveConsultantFilterId !== user.id
    const personalOwnerId = (p: any) => p.consultant?.id ?? p.consultantId ?? p.ownerId ?? null

    const splitRangeByBlocks = (startMs: number, endMs: number, blocks: Array<{ startMs: number; endMs: number }>) => {
      let segments: Array<{ startMs: number; endMs: number }> = [{ startMs, endMs }]
      for (const block of blocks) {
        segments = segments.flatMap((seg) => {
          const overlapStart = Math.max(seg.startMs, block.startMs)
          const overlapEnd = Math.min(seg.endMs, block.endMs)
          if (overlapEnd <= overlapStart) return [seg]
          const out: Array<{ startMs: number; endMs: number }> = []
          if (seg.startMs < overlapStart) out.push({ startMs: seg.startMs, endMs: overlapStart })
          if (overlapEnd < seg.endMs) out.push({ startMs: overlapEnd, endMs: seg.endMs })
          return out
        })
        if (segments.length === 0) break
      }
      return segments
    }
    const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart
    const parseHmToMinutes = (timeValue: string) => {
      const [hh, mm] = timeValue.split(':').map((x) => Number(x) || 0)
      return hh * 60 + mm
    }

    const isMonthGridView = view === 'dayGridMonth' || view === 'resourceDayGridMonth'

    const multipleSessionsPerSpaceEnabled = settings.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === 'true'
    /** When multiple physical sessions per space are allowed, do not flag break vs. another booking in that same space (mirrors backend space overlap rules). */
    const ignoreSameSpaceBreakOverlap = (a: any, other: any) => {
      if (!multipleSessionsPerSpaceEnabled || !spacesEnabled) return false
      const onlineA = !!(a?.meetingLink && String(a.meetingLink).trim())
      const onlineO = !!(other?.meetingLink && String(other.meetingLink).trim())
      if (onlineA || onlineO) return false
      const sa = a?.space?.id ?? null
      const so = other?.space?.id ?? null
      return sa != null && so != null && sa === so
    }

    const bookedBase = (
      user.role === 'ADMIN'
        ? filterByConsultantRole(calendarData.booked)
        : (calendarData.booked || [])
    )
    const booked = bookedBase
      .filter((b: any) => {
        if (calendarMode === 'spaces') {
          const isOnline = !!(b.meetingLink && String(b.meetingLink).trim())
          const resolvedSpaceId = isOnline ? null : (b.space?.id ?? null)
          if (spaceFilterId != null) return resolvedSpaceId === spaceFilterId
          return true
        }
        if (!spacesEnabled) return true
        if (spaceFilterId == null) return true
        return b.space?.id === spaceFilterId
      })
      .map((b: any) => {
        const typeDurationMinutes = getTypeDurationMinutes(b.type?.id)
        const typeBreakMinutes = getTypeBreakMinutes(b.type?.id)
        const bookedOwnerId = b.consultant?.id ?? null
        const maskedBooked = user.role !== 'ADMIN' && bookedOwnerId !== user.id
        const breakRange = getBookingBreakRange({ ...b, type: { ...b.type, breakMinutes: typeBreakMinutes } })
        const breakConflict = !!breakRange && (
          bookedBase.some((other: any) => {
            if (other?.id === b.id) return false
            if (ignoreSameSpaceBreakOverlap(b, other)) return false
            const otherStartMs = new Date(other?.startTime).getTime()
            const otherEndMs = new Date(other?.endTime).getTime()
            return Number.isFinite(otherStartMs)
              && Number.isFinite(otherEndMs)
              && otherEndMs > otherStartMs
              && overlaps(breakRange.startMs, breakRange.endMs, otherStartMs, otherEndMs)
          }) ||
          (personalModuleEnabled ? (calendarData.personal || []) : []).some((other: any) => {
            const otherOwnerId = personalOwnerId(other)
            if (bookedOwnerId == null || otherOwnerId !== bookedOwnerId) return false
            const otherStartMs = new Date(other?.startTime).getTime()
            const otherEndMs = new Date(other?.endTime).getTime()
            return Number.isFinite(otherStartMs)
              && Number.isFinite(otherEndMs)
              && otherEndMs > otherStartMs
              && overlaps(breakRange.startMs, breakRange.endMs, otherStartMs, otherEndMs)
          })
        )
        const ev: any = {
          id: `b-${b.id}`,
          title: maskedBooked ? '' : formatBookingClientsLabel(b),
          start: b.startTime,
          end: b.endTime,
          color: '#9B6BFF',
          order: 1,
          editable: !maskedBooked && !isViewOnly,
          extendedProps: {
            ...b,
            kind: 'booked',
            type: b.type ? { ...b.type, durationMinutes: typeDurationMinutes, breakMinutes: typeBreakMinutes } : b.type,
            masked: maskedBooked,
            breakConflict,
            breakMinutes: typeBreakMinutes,
          },
        }
        if (spacesUseResourceColumns) {
          const isOnline = !!(b.meetingLink && String(b.meetingLink).trim())
          ev.resourceId = !isOnline && b.space?.id != null ? String(b.space.id) : SPACE_RESOURCE_UNASSIGNED_ID
          ev.resourceEditable = !maskedBooked && !isViewOnly
        }
        if (bookingsUseResourceColumns) {
          ev.resourceId = bookedOwnerId != null ? String(bookedOwnerId) : CONSULTANT_RESOURCE_UNASSIGNED_ID
          ev.resourceEditable = !maskedBooked && !isViewOnly
        }
        return ev
      })
    const bookedBreakBackground = isMonthGridView
      ? []
      : booked.flatMap((ev: any) => {
          const breakRange = getBookingBreakRange(ev.extendedProps)
          if (!breakRange) return []
          const breakEv: any = {
            id: `${ev.id}-break`,
            title: '',
            display: 'background',
            start: toLocalDateTimeString(new Date(breakRange.startMs)),
            end: toLocalDateTimeString(new Date(breakRange.endMs)),
            editable: false,
            startEditable: false,
            durationEditable: false,
            extendedProps: {
              kind: 'booking-break',
              bookingId: ev.extendedProps?.id,
              breakConflict: Boolean(ev.extendedProps?.breakConflict),
              breakMinutes: breakRange.breakMinutes,
            },
          }
          if (ev.resourceId != null) breakEv.resourceId = ev.resourceId
          return [breakEv]
        })
    const today = new Date()
    const dayMap: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 }
    const visibleBookableSlots = !bookableEnabled ? [] : filterByConsultantRole(calendarData.bookable)
    const userHasWorkingHours = (u: any) => {
      const wh = u?.workingHours
      if (!wh || typeof wh !== 'object') return false
      if (wh.sameForAllDays) return !!(wh.allDays?.start && wh.allDays?.end)
      return dayOptions.some((d) => {
        const x = wh.byDay?.[d]
        return x && String(x.start || '').trim() && String(x.end || '').trim()
      })
    }
    const consultantsForWhVisible = metaUsers.filter((u: any) => {
      if (!userHasWorkingHours(u)) return false
      if (!(u.consultant || u.role === 'CONSULTANT')) return false
      if (user.role !== 'ADMIN') return u.id === user.id
      if (effectiveConsultantFilterId != null) return u.id === effectiveConsultantFilterId
      return true
    })
    const consultantIdsWithWh = new Set(consultantsForWhVisible.map((u: any) => u.id))
    // Keep explicit availability slots even when consultant working-hours exist.
    // This allows admins to open extra one-off windows from Bookings mode
    // (e.g. outside default working-hours), which should remove non-bookable hatch.
    const slotsWithoutWh = visibleBookableSlots
    const visibleConsultantIds = new Set<number>()
    visibleBookableSlots.forEach((slot: any) => {
      const id = slot.consultant?.id
      if (Number.isFinite(id)) visibleConsultantIds.add(id)
    })
    consultantsForWhVisible.forEach((u: any) => visibleConsultantIds.add(u.id))
    const blockingRangesByConsultant = new Map<number, Array<{ startMs: number; endMs: number }>>()
    for (const b of filterByConsultantRole(calendarData.booked || [])) {
      // Spaces + ALL columns: bookings are subtracted per resource column in bookableSpaceBookings.
      // Including them here would strip the interval from bookableVisibleSegments globally and hatch
      // every other space for that consultant at the same time.
      if (spacesUseResourceColumns) continue
      const cid = b.consultant?.id
      if (!Number.isFinite(cid) || !visibleConsultantIds.has(cid)) continue
      const startMs = new Date(b.startTime).getTime()
      const endMs = getBookingBusyEndMs(b)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
      const arr = blockingRangesByConsultant.get(cid) || []
      arr.push({ startMs, endMs })
      blockingRangesByConsultant.set(cid, arr)
    }
    if (personalModuleEnabled) {
      for (const p of calendarData.personal || []) {
        const cid = personalOwnerId(p)
        if (!Number.isFinite(cid) || !visibleConsultantIds.has(cid)) continue
        const startMs = new Date(p.startTime).getTime()
        const endMs = new Date(p.endTime).getTime()
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
        const arr = blockingRangesByConsultant.get(cid) || []
        arr.push({ startMs, endMs })
        blockingRangesByConsultant.set(cid, arr)
      }
    }
    const splitIntoStepSegments = (startMs: number, endMs: number, stepMs: number) => {
      const out: Array<{ startMs: number; endMs: number }> = []
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return out
      let cursor = startMs
      while (cursor < endMs) {
        const next = Math.min(endMs, cursor + stepMs)
        out.push({ startMs: cursor, endMs: next })
        cursor = next
      }
      return out
    }

    const companyWhStartMin = whWindowParseHm(slotMinTime)
    const companyWhEndMin = whWindowParseHm(slotMaxTime)
    const dayNamesFull = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    const subtractRange = (
      range: { startMs: number; endMs: number },
      blockStartMs: number,
      blockEndMs: number,
    ): Array<{ startMs: number; endMs: number }> => {
      if (blockEndMs <= range.startMs || blockStartMs >= range.endMs) return [range]
      const out: Array<{ startMs: number; endMs: number }> = []
      if (blockStartMs > range.startMs) out.push({ startMs: range.startMs, endMs: Math.min(blockStartMs, range.endMs) })
      if (blockEndMs < range.endMs) out.push({ startMs: Math.max(blockEndMs, range.startMs), endMs: range.endMs })
      return out.filter((x) => x.endMs > x.startMs)
    }
    const bookableFromSlots = slotsWithoutWh.flatMap((slot: any) => {
      const out: any[] = []
      for (let i = 0; i < 30; i++) {
        const date = new Date(today)
        date.setDate(today.getDate() + i)
        const isoDate = date.toISOString().slice(0, 10)
        if (date.getDay() !== dayMap[slot.dayOfWeek]) continue
        if (!slot.indefinite && ((slot.startDate && isoDate < slot.startDate) || (slot.endDate && isoDate > slot.endDate))) continue
        const baseStartMs = new Date(`${isoDate}T${slot.startTime}`).getTime()
        const baseEndMs = new Date(`${isoDate}T${slot.endTime}`).getTime()
        if (!Number.isFinite(baseStartMs) || !Number.isFinite(baseEndMs) || baseEndMs <= baseStartMs) continue
        const blocks = (blockingRangesByConsultant.get(slot.consultant?.id) || [])
          .filter((r) => r.endMs > baseStartMs && r.startMs < baseEndMs)
          .sort((a, b) => a.startMs - b.startMs)
        let visibleSegments = splitRangeByBlocks(baseStartMs, baseEndMs, blocks)
        const slotConsultantId = slot.consultant?.id
        if (Number.isFinite(slotConsultantId) && consultantIdsWithWh.has(slotConsultantId)) {
          const w = consultantDayWindow(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            slotConsultantId,
            metaUsers,
            companyWhStartMin,
            companyWhEndMin,
          )
          if (w != null && 'startMin' in w) {
            const whSpan = windowToDayMs(date.getFullYear(), date.getMonth(), date.getDate(), w.startMin, w.endMin)
            visibleSegments = visibleSegments.flatMap((seg) => subtractRange(seg, whSpan.startMs, whSpan.endMs))
          }
        }
        visibleSegments.forEach((seg, idx) => {
          out.push({
            id: `s-${slot.id}-${isoDate}-${idx}`,
            title: `Available · ${slot.consultant.firstName}`,
            start: toLocalDateTimeString(new Date(seg.startMs)),
            end: toLocalDateTimeString(new Date(seg.endMs)),
            color: '#22c55e',
            editable: false,
            startEditable: false,
            durationEditable: false,
            extendedProps: { ...slot, kind: 'bookable', date: isoDate },
          })
        })
      }
      return out
    })
    const bookableFromWh = !bookableEnabled
      ? []
      : consultantsForWhVisible.flatMap((cu: any) => {
          const out: any[] = []
          for (let i = 0; i < 30; i++) {
            const date = new Date(today)
            date.setDate(today.getDate() + i)
            const isoDate = date.toISOString().slice(0, 10)
            const w = consultantDayWindow(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
              cu.id,
              metaUsers,
              companyWhStartMin,
              companyWhEndMin,
            )
            if (w == null || ('closed' in w && w.closed) || !('startMin' in w)) continue
            const span = windowToDayMs(date.getFullYear(), date.getMonth(), date.getDate(), w.startMin, w.endMin)
            const baseStartMs = span.startMs
            const baseEndMs = span.endMs
            const blocks = (blockingRangesByConsultant.get(cu.id) || [])
              .filter((r) => r.endMs > baseStartMs && r.startMs < baseEndMs)
              .sort((a, b) => a.startMs - b.startMs)
            const visibleSegments = splitRangeByBlocks(baseStartMs, baseEndMs, blocks)
            visibleSegments.forEach((seg, idx) => {
              const sDate = new Date(seg.startMs)
              const eDate = new Date(seg.endMs)
              const startTimeStr = `${String(sDate.getHours()).padStart(2, '0')}:${String(sDate.getMinutes()).padStart(2, '0')}:00`
              const endTimeStr = `${String(eDate.getHours()).padStart(2, '0')}:${String(eDate.getMinutes()).padStart(2, '0')}:00`
              out.push({
                id: `wh-${cu.id}-${isoDate}-${idx}`,
                title: `Available · ${cu.firstName}`,
                start: toLocalDateTimeString(new Date(seg.startMs)),
                end: toLocalDateTimeString(new Date(seg.endMs)),
                color: '#22c55e',
                editable: false,
                startEditable: false,
                durationEditable: false,
                extendedProps: {
                  kind: 'bookable',
                  date: isoDate,
                  consultant: cu,
                  dayOfWeek: dayNamesFull[date.getDay()],
                  indefinite: true,
                  startTime: startTimeStr,
                  endTime: endTimeStr,
                  fromWorkingHours: true,
                  firstName: cu.firstName,
                  lastName: cu.lastName,
                },
              })
            })
          }
          return out
        })
    const bookableVisibleSegments = [...bookableFromSlots, ...bookableFromWh]
    const _bookingsResourceMode = calendarMode === 'bookings' && user.role === 'ADMIN' && consultantFilterId == null && !isNativeAndroid
    const bookableBookings = bookableVisibleSegments.flatMap((seg: any, idx: number) => {
      const startMs = new Date(seg.start).getTime()
      const endMs = new Date(seg.end).getTime()
      const chunks = splitIntoStepSegments(startMs, endMs, SLOT_MS)
      const cid = seg.extendedProps?.consultant?.id
      return chunks.map((chunk, chunkIdx) => {
        const ev: any = {
          ...seg,
          id: `${seg.id}-chunk-${idx}-${chunkIdx}`,
          title: '',
          display: 'background',
          start: toLocalDateTimeString(new Date(chunk.startMs)),
          end: toLocalDateTimeString(new Date(chunk.endMs)),
          extendedProps: {
            ...seg.extendedProps,
            bookableChunkIndex: chunkIdx,
            bookableChunkCount: chunks.length,
          },
        }
        if (_bookingsResourceMode && cid != null) {
          ev.resourceId = String(cid)
        }
        return ev
      })
    })

    /** Per-space-column bookable backgrounds (Space ALL + resource columns): consultant availability minus sessions already in that space. */
    const subtractRangeFromRange = (
      r: { startMs: number; endMs: number },
      bs: number,
      be: number,
    ): { startMs: number; endMs: number }[] => {
      if (be <= r.startMs || bs >= r.endMs) return [r]
      const out: { startMs: number; endMs: number }[] = []
      if (bs > r.startMs) out.push({ startMs: r.startMs, endMs: Math.min(bs, r.endMs) })
      if (be < r.endMs) out.push({ startMs: Math.max(be, r.startMs), endMs: r.endMs })
      return out.filter((x) => x.endMs > x.startMs)
    }

    const bookableSpaceBookings = (() => {
      if (!spacesUseResourceColumns || calendarMode !== 'spaces') return []
      const rawBooked = bookedBase.filter((b: any) => {
        if (spaceFilterId != null) return b.space?.id === spaceFilterId
        return true
      })
      const spaceIds = [SPACE_RESOURCE_UNASSIGNED_ID, ...metaSpaces.map((s: any) => String(s.id))]
      const out: any[] = []
      let segIdx = 0
      for (const seg of bookableVisibleSegments) {
        const startMs = new Date(seg.start).getTime()
        const endMs = new Date(seg.end).getTime()
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          segIdx++
          continue
        }
        for (const spRid of spaceIds) {
          const bookedInSpace = rawBooked.filter((b: any) => {
            if (spRid === SPACE_RESOURCE_UNASSIGNED_ID) return b.space == null || b.space?.id == null
            return b.space?.id != null && String(b.space.id) === spRid
          })
          let remaining: { startMs: number; endMs: number }[] = [{ startMs, endMs }]
          for (const b of bookedInSpace) {
            const bs = new Date(b.startTime).getTime()
            const be = getBookingBusyEndMs(b)
            if (!Number.isFinite(bs) || !Number.isFinite(be) || be <= bs) continue
            remaining = remaining.flatMap((r) => subtractRangeFromRange(r, bs, be))
            if (remaining.length === 0) break
          }
          for (const r of remaining) {
            if (r.endMs <= r.startMs) continue
            const chunks = splitIntoStepSegments(r.startMs, r.endMs, SLOT_MS)
            const chunkCount = chunks.length
            chunks.forEach((chunk, chunkIdx) => {
              out.push({
                id: `bs-${spRid}-${segIdx}-${chunk.startMs}-${chunkIdx}`,
                title: '',
                display: 'background',
                start: toLocalDateTimeString(new Date(chunk.startMs)),
                end: toLocalDateTimeString(new Date(chunk.endMs)),
                resourceId: spRid,
                extendedProps: {
                  ...seg.extendedProps,
                  kind: 'bookable',
                  bookableChunkIndex: chunkIdx,
                  bookableChunkCount: chunkCount,
                },
              })
            })
          }
        }
        segIdx++
      }
      return out
    })()

    const nonBookableBackground = (() => {
      if (!bookableEnabled || (calendarMode !== 'bookings' && calendarMode !== 'spaces') || isMonthGridView) return []

      const buildNonBookableForResource = (
        evs: any[],
        resourceId?: string,
      ) => {
        const availableByDate = new Map<string, Array<{ startMs: number; endMs: number }>>()
        for (const ev of evs) {
          const startMs = new Date(ev.start).getTime()
          const endMs = new Date(ev.end).getTime()
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
          const dateKey = String(ev.start).slice(0, 10)
          const arr = availableByDate.get(dateKey) || []
          arr.push({ startMs, endMs })
          availableByDate.set(dateKey, arr)
        }
        const dayStartMinutes = parseHmToMinutes(slotMinTime)
        const dayEndMinutes = parseHmToMinutes(slotMaxTime)
        const out: any[] = []
        const prefix = resourceId ? `nb-${resourceId}` : 'nb'
        for (let i = 0; i < 30; i++) {
          const day = new Date(today)
          day.setDate(today.getDate() + i)
          const key = day.toISOString().slice(0, 10)
          const dayStart = new Date(day)
          dayStart.setHours(Math.floor(dayStartMinutes / 60), dayStartMinutes % 60, 0, 0)
          const dayEnd = new Date(day)
          dayEnd.setHours(Math.floor(dayEndMinutes / 60), dayEndMinutes % 60, 0, 0)
          const windowStartMs = dayStart.getTime()
          const windowEndMs = dayEnd.getTime()
          if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs <= windowStartMs) continue

          const ranges = (availableByDate.get(key) || [])
            .map((r) => ({ startMs: Math.max(r.startMs, windowStartMs), endMs: Math.min(r.endMs, windowEndMs) }))
            .filter((r) => r.endMs > r.startMs)
            .sort((a, b) => a.startMs - b.startMs)

          let cursor = windowStartMs
          for (const r of ranges) {
            if (r.startMs > cursor) {
              const ev: any = {
                id: `${prefix}-${key}-${cursor}`,
                title: '',
                display: 'background',
                start: toLocalDateTimeString(new Date(cursor)),
                end: toLocalDateTimeString(new Date(r.startMs)),
                editable: false,
                startEditable: false,
                durationEditable: false,
                extendedProps: { kind: 'non-bookable', date: key },
              }
              if (resourceId) ev.resourceId = resourceId
              out.push(ev)
            }
            cursor = Math.max(cursor, r.endMs)
          }
          if (cursor < windowEndMs) {
            const ev: any = {
              id: `${prefix}-${key}-${cursor}`,
              title: '',
              display: 'background',
              start: toLocalDateTimeString(new Date(cursor)),
              end: toLocalDateTimeString(new Date(windowEndMs)),
              editable: false,
              startEditable: false,
              durationEditable: false,
              extendedProps: { kind: 'non-bookable', date: key },
            }
            if (resourceId) ev.resourceId = resourceId
            out.push(ev)
          }
        }
        return out
      }

      if (_bookingsResourceMode) {
        const consultants = metaUsers.filter((u: any) => u.consultant || u.role === 'CONSULTANT')
        const out: any[] = []
        for (const cu of consultants) {
          const rid = String(cu.id)
          const cuBookable = bookableBookings.filter((ev: any) => ev.resourceId === rid)
          out.push(...buildNonBookableForResource(cuBookable, rid))
        }
        return out
      }

      if (spacesUseResourceColumns && calendarMode === 'spaces') {
        const spaceIds = [SPACE_RESOURCE_UNASSIGNED_ID, ...metaSpaces.map((s: any) => String(s.id))]
        const out: any[] = []
        for (const spRid of spaceIds) {
          const spBookable = bookableSpaceBookings.filter((ev: any) => ev.resourceId === spRid)
          out.push(...buildNonBookableForResource(spBookable, spRid))
        }
        return out
      }

      return buildNonBookableForResource(bookableBookings)
    })()
    const bookable =
      calendarMode === 'bookings'
        ? (isMonthGridView ? [] : bookableBookings)
        : calendarMode === 'spaces'
          ? (isMonthGridView ? [] : spacesUseResourceColumns ? bookableSpaceBookings : [])
          : bookableVisibleSegments
    const personalTaskPresetColorByName = (() => {
      const map = new Map<string, string>()
      const raw = String(settings[PERSONAL_TASK_PRESETS_KEY] || '')
      if (!raw) return map
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return map
        for (const row of parsed) {
          const name = String(row?.name || '').trim().toLowerCase()
          const color = String(row?.color || '').trim()
          if (!name) continue
          if (!/^#[0-9a-fA-F]{6}$/.test(color)) continue
          map.set(name, color)
        }
      } catch {
        // Ignore parse errors and fall back to default event color.
      }
      return map
    })()

    const personal = (personalModuleEnabled ? calendarData.personal || [] : [])
      .filter((p: any) => personalOwnerId(p) === user.id)
      .filter((p: any) => {
        if (effectiveConsultantFilterId == null || effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION) return true
        return effectiveConsultantFilterId === user.id
      })
      .map((p: any) => {
        if (String(p.task || '').trim().toLowerCase() === AVAILABILITY_BLOCK_TASK) return null
        const taskName = String(p.task || '').trim().toLowerCase()
        const presetColor = personalTaskPresetColorByName.get(taskName)
        const ev: any = {
          id: `p-${p.id}`,
          title: p.task || t('formPersonal'),
          start: p.startTime,
          end: p.endTime,
          color: presetColor || '#F59E0B',
          order: 2,
          editable: !isViewOnly,
          extendedProps: { ...p, kind: 'personal', masked: false },
        }
        if (calendarMode === 'bookings' && user.role === 'ADMIN' && consultantFilterId == null && !isNativeAndroid) {
          ev.resourceId = String(user.id)
        }
        return ev
      })
      .filter(Boolean as any)
    const todosRaw = (todosModuleEnabled ? calendarData.todos || [] : [])
      .filter((t: any) => (t.consultant?.id ?? t.consultantId ?? user.id) === user.id)
      .filter((t: any) => {
        if (effectiveConsultantFilterId == null || effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION) return true
        return effectiveConsultantFilterId === user.id
      })
      .map((t: any) => {
        const start = t.startTime
        const end = t.endTime || toLocalDateTimeString(new Date(new Date(start).getTime() + 30 * 60 * 1000))
        const ev: any = {
          id: `t-${t.id}`,
          title: t.task || 'ToDo',
          start,
          end,
          color: '#4F8EF7',
          order: 2,
          editable: !isViewOnly,
          extendedProps: { ...t, kind: 'todo', masked: false },
        }
        if (calendarMode === 'bookings' && user.role === 'ADMIN' && consultantFilterId == null && !isNativeAndroid) {
          ev.resourceId = String(user.id)
        }
        return ev
      })

    const hidePersonalAndTodoOnAdminBookingsOverview =
      calendarMode === 'bookings' &&
      user.role === 'ADMIN' &&
      (consultantFilterId == null || consultantFilterId === CONSULTANT_FILTER_ALL_SESSION)

    /** Bookings + staff columns (Vsi termini po osebju): blocked availability per consultant as diagonal hatch. */
    const adminStaffColumnsAvailabilityBlocks = (() => {
      if (!bookingsUseResourceColumns || !personalModuleEnabled) return []
      return (calendarData.personal || []).flatMap((p: any) => {
        if (String(p.task || '').trim().toLowerCase() !== AVAILABILITY_BLOCK_TASK) return []
        const cid = personalOwnerId(p)
        if (!Number.isFinite(cid)) return []
        const startStr = String(p.startTime || '')
        return [
          {
            id: `avail-block-${p.id}`,
            title: '',
            display: 'background',
            start: p.startTime,
            end: p.endTime,
            resourceId: String(cid),
            editable: false,
            startEditable: false,
            durationEditable: false,
            extendedProps: { kind: 'non-bookable', date: startStr.slice(0, 10) },
          },
        ]
      })
    })()

    const personalCalendar = hidePersonalAndTodoOnAdminBookingsOverview ? [] : personal
    const todosCalendar = hidePersonalAndTodoOnAdminBookingsOverview ? [] : todosRaw

    const sessionDraftPreviewEvents: any[] = (() => {
      if (isViewOnly) return []
      type DraftKind = 'booked' | 'personal' | 'todo' | 'availability'
      let startStr: string | null = null
      let endStr: string | null = null
      let draftKind: DraftKind = 'booked'
      let resourceId: string | undefined

      // Skip edit-* modals: the real event already shows that slot.
      if (selectedBookedSession || selectedPersonalBlock || selectedTodo) {
        return []
      }
      if (availabilitySelection && selection) {
        startStr = availabilitySelection.startTime
        endStr = availabilitySelection.endTime
        draftKind = 'availability'
        if (bookingsUseResourceColumns) {
          const cid = availabilitySelection.consultantId
          resourceId = cid != null ? String(cid) : CONSULTANT_RESOURCE_UNASSIGNED_ID
        }
      } else if (selection && !availabilitySelection) {
        startStr = form?.startTime ?? selection.start
        endStr = form?.endTime ?? selection.end
        if (form?.todo && todosModuleEnabled) draftKind = 'todo'
        else if (form?.personal && personalModuleEnabled) draftKind = 'personal'
        else draftKind = 'booked'
        if (spacesUseResourceColumns && calendarMode === 'spaces') {
          const online = !!form?.online
          const sid = form?.spaceId
          resourceId = !online && sid != null ? String(sid) : SPACE_RESOURCE_UNASSIGNED_ID
        } else if (bookingsUseResourceColumns) {
          const cid = form?.consultantId
          resourceId = cid != null ? String(cid) : CONSULTANT_RESOURCE_UNASSIGNED_ID
        }
        if (
          bookingsUseResourceColumns &&
          resourceId === CONSULTANT_RESOURCE_UNASSIGNED_ID &&
          selection?.resourceId &&
          selection.resourceId !== CONSULTANT_RESOURCE_UNASSIGNED_ID
        ) {
          resourceId = String(selection.resourceId)
        }
        if (
          spacesUseResourceColumns &&
          calendarMode === 'spaces' &&
          resourceId === SPACE_RESOURCE_UNASSIGNED_ID &&
          selection?.resourceId &&
          selection.resourceId !== SPACE_RESOURCE_UNASSIGNED_ID
        ) {
          resourceId = String(selection.resourceId)
        }
        if (
          calendarMode === 'bookings' &&
          user.role === 'ADMIN' &&
          consultantFilterId == null &&
          !isNativeAndroid &&
          (draftKind === 'personal' || draftKind === 'todo')
        ) {
          resourceId = String(form?.consultantId ?? user.id)
        }
      } else {
        return []
      }

      if (!startStr || !endStr) return []
      const startNorm = normalizeToLocalDateTime(startStr)
      const endNorm = normalizeToLocalDateTime(endStr)
      const startMs = new Date(startNorm).getTime()
      const endMs = new Date(endNorm).getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return []

      const color =
        draftKind === 'personal'
          ? '#F59E0B'
          : draftKind === 'todo'
            ? '#4F8EF7'
            : draftKind === 'availability'
              ? availabilityIntent === 'block'
                ? '#ef4444'
                : '#14b8a6'
              : '#9B6BFF'
      const ev: any = {
        id: 'session-draft-preview',
        title: '\u00a0',
        start: startNorm,
        end: endNorm,
        color,
        display: 'auto',
        order: 9,
        extendedProps: {
          kind: 'draft-preview',
          draftKind,
          ...(draftKind === 'availability' ? { availabilityIntent } : {}),
        },
        editable: false,
        startEditable: false,
        durationEditable: false,
        resourceEditable: false,
      }
      if (resourceId != null) ev.resourceId = resourceId
      return [ev]
    })()

    if (modeSwitching) {
      return []
    }
    if (calendarMode === 'availability') {
      return [...bookable, ...sessionDraftPreviewEvents]
    }
    if (calendarMode === 'spaces') {
      if (spacesUseResourceColumns && bookableEnabled) {
        return [...nonBookableBackground, ...bookedBreakBackground, ...booked, ...bookable, ...sessionDraftPreviewEvents]
      }
      return [...bookedBreakBackground, ...booked, ...sessionDraftPreviewEvents]
    }
    return [
      ...nonBookableBackground,
      ...adminStaffColumnsAvailabilityBlocks,
      ...bookedBreakBackground,
      ...booked,
      ...bookable,
      ...personalCalendar,
      ...todosCalendar,
      ...sessionDraftPreviewEvents,
    ]
  }, [
    calendarData,
    user,
    spacesEnabled,
    spaceFilterId,
    metaTypes,
    metaSpaces,
    metaUsers,
    bookableEnabled,
    effectiveConsultantFilterId,
    isNativeAndroid,
    calendarMode,
    slotMinTime,
    slotMaxTime,
    view,
    settings,
    modeSwitching,
    isViewOnly,
    spacesUseResourceColumns,
    bookingsUseResourceColumns,
    consultantFilterId,
    selection,
    form,
    selectedBookedSession,
    selectedPersonalBlock,
    selectedTodo,
    availabilitySelection,
    availabilityIntent,
    personalModuleEnabled,
    todosModuleEnabled,
    t,
    locale,
  ])


  function normalizeSelectedClientIds(rawIds: any, fallbackClientId?: number | null) {
    const ids = Array.isArray(rawIds) ? rawIds : []
    const out: number[] = []
    ids.forEach((value: any) => {
      const n = Number(value)
      if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n)
    })
    const fallback = Number(fallbackClientId)
    if (Number.isInteger(fallback) && fallback > 0 && !out.includes(fallback)) out.push(fallback)
    return out
  }

  const applyFormClientIds = useCallback((clientIds: number[]) => {
    const normalized = normalizeSelectedClientIds(clientIds)
    setForm((prev: any) => ({
      ...prev,
      clientIds: normalized,
      clientId: normalized[0] ?? null,
    }))
  }, [])

  const applyBookedSessionClientIds = useCallback((clientIds: number[]) => {
    const normalized = normalizeSelectedClientIds(clientIds)
    setSelectedBookedSession((prev: any) => {
      if (!prev) return prev
      const clients = normalized
        .map((id) => metaClients.find((c: any) => c.id === id) || prev.clients?.find((c: any) => c.id === id) || (prev.client?.id === id ? prev.client : null))
        .filter(Boolean)
      return {
        ...prev,
        clients,
        client: clients[0] ?? null,
      }
    })
  }, [metaClients])

  const selectedFormClientIds = useMemo(
    () => normalizeSelectedClientIds(form.clientIds, form.clientId),
    [form.clientIds, form.clientId],
  )

  const selectedBookedClientIds = useMemo(
    () => normalizeSelectedClientIds(selectedBookedSession?.clients?.map((c: any) => c?.id), selectedBookedSession?.client?.id),
    [selectedBookedSession],
  )

  const visibleClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    const active = metaClients.filter((c: any) => c.active !== false)
    if (!q) return active
    return active.filter((c: any) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    )
  }, [metaClients, clientSearch])

  const visibleGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase()
    const active = metaGroups.filter((g: any) => g.active !== false)
    if (!q) return active
    return active.filter((g: any) => (g.name || '').toLowerCase().includes(q))
  }, [metaGroups, groupSearch])

  const selectedGroup = useMemo(() => {
    if (!form.groupId) return null
    return metaGroups.find((g: any) => g.id === form.groupId) || null
  }, [metaGroups, form.groupId])

  /** Single-group mode: show selected name in the field (button), not only raw input. */
  const bookSessionGroupFieldCompact = !!selectedGroup && !editingGroupSearch

  const visibleBookedClients = useMemo(() => {
    const q = bookedClientSearch.trim().toLowerCase()
    const active = metaClients.filter((c: any) => c.active !== false)
    if (!q) return active
    return active.filter((c: any) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    )
  }, [metaClients, bookedClientSearch])

  const voiceReviewSelectedClient = useMemo(() => {
    if (voiceReviewClientId == null) return null
    return metaClients.find((c: any) => c.id === voiceReviewClientId) || null
  }, [metaClients, voiceReviewClientId])

  const voiceReviewClients = useMemo(() => {
    const active = metaClients.filter((c: any) => c.active !== false)
    if (voicePendingCancellation?.clientId != null && !active.some((c: any) => c.id === voicePendingCancellation.clientId)) {
      const pendingClient = metaClients.find((c: any) => c.id === voicePendingCancellation.clientId)
      if (pendingClient) return [...active, pendingClient]
    }
    return active
  }, [metaClients, voicePendingCancellation])

  const voiceReviewClientLabel = voiceReviewSelectedClient
    ? fullName(voiceReviewSelectedClient)
    : (voicePendingCancellation?.clientName || (locale === 'sl' ? 'Ni določena' : 'Not specified'))

  useEffect(() => {
    if (!voiceReviewOpen) {
      setVoiceReviewClientDropdownOpen(false)
      return
    }
    if (voiceReviewSelectedClient) {
      setVoiceReviewClientQuery(fullName(voiceReviewSelectedClient))
      return
    }
    setVoiceReviewClientQuery(voicePendingCancellation?.clientName || '')
  }, [voiceReviewOpen, voiceReviewSelectedClient, voicePendingCancellation?.clientName])

  useEffect(() => {
    if (!voiceReviewOpen || voicePendingCancellation?.targetType !== 'booking') return
    const id = requestAnimationFrame(() => voiceReviewClientInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [voiceReviewOpen, voicePendingCancellation?.targetType])

  const visibleVoiceReviewClients = useMemo(() => {
    const q = voiceReviewClientQuery.trim().toLowerCase()
    if (!q) return voiceReviewClients
    return voiceReviewClients.filter((client: any) =>
      fullName(client).toLowerCase().includes(q) ||
      (client.email || '').toLowerCase().includes(q) ||
      (client.phone || '').toLowerCase().includes(q)
    )
  }, [voiceReviewClients, voiceReviewClientQuery])

  const voiceReviewResolvedClientName = useMemo(() => {
    const typed = voiceReviewClientQuery.trim()
    if (!typed) return null
    const selectedName = voiceReviewSelectedClient ? fullName(voiceReviewSelectedClient) : ''
    if (voiceReviewClientId != null && selectedName.toLowerCase() === typed.toLowerCase()) {
      return null
    }
    return typed
  }, [voiceReviewClientId, voiceReviewClientQuery, voiceReviewSelectedClient])

  const bookSessionSelectedClients = useMemo(() => {
    if (form.todo || form.personal) return []
    return selectedFormClientIds
      .map((id) => metaClients.find((c: any) => c.id === id) ?? null)
      .filter((c: any) => c && c.active !== false)
  }, [form.todo, form.personal, selectedFormClientIds, metaClients])

  const bookedSessionSelectedClients = useMemo(() => {
    return selectedBookedClientIds
      .map((id) => metaClients.find((c: any) => c.id === id && c.active !== false) || selectedBookedSession?.clients?.find((c: any) => c?.id === id) || (selectedBookedSession?.client?.id === id ? selectedBookedSession.client : null))
      .filter(Boolean)
  }, [selectedBookedClientIds, metaClients, selectedBookedSession])

  const bookSessionSelectedClient = bookSessionSelectedClients[0] ?? null
  const bookedSessionSelectedClient = bookedSessionSelectedClients[0] ?? null

  const bookedSessionGroupIdRaw = selectedBookedSession?.groupId
  const bookedSessionGroupId =
    bookedSessionGroupIdRaw != null && Number.isFinite(Number(bookedSessionGroupIdRaw)) && Number(bookedSessionGroupIdRaw) > 0
      ? Number(bookedSessionGroupIdRaw)
      : null
  const bookedSessionIsGroup = groupBookingEnabled && bookedSessionGroupId != null
  const bookedSessionResolvedGroup = useMemo(() => {
    if (!bookedSessionGroupId) return null
    return metaGroups.find((g: any) => g.id === bookedSessionGroupId) || null
  }, [metaGroups, bookedSessionGroupId])

  /** Single-client mode: show selected name in the field (button), not as chips below. */
  const bookSessionClientFieldCompact =
    !multipleClientsPerSessionEnabled && !!bookSessionSelectedClient && !editingClientSearch
  const bookedSessionClientFieldCompact =
    !multipleClientsPerSessionEnabled && !!bookedSessionSelectedClient && !editingBookedClientSearch
  const visibleBookSessionClientChips = bookSessionClientsExpanded
    ? bookSessionSelectedClients
    : bookSessionSelectedClients.slice(0, 3)
  const hiddenBookSessionClientCount = Math.max(0, bookSessionSelectedClients.length - visibleBookSessionClientChips.length)
  const visibleBookedSessionClientChips = bookedSessionClientsExpanded
    ? bookedSessionSelectedClients
    : bookedSessionSelectedClients.slice(0, 3)
  const hiddenBookedSessionClientCount = Math.max(0, bookedSessionSelectedClients.length - visibleBookedSessionClientChips.length)
  const clientSearchPlaceholder = locale === 'sl' ? 'Išči ali dodaj stranko…' : 'Search or add client…'
  const groupSearchPlaceholder = t('formSearchOrAddGroupPlaceholder')
  const addClientInlineTitle = locale === 'sl' ? 'Dodaj stranko' : 'Add client'
  const addGroupInlineTitle = t('addGroupInlineTitle')
  const clearSingleClientTitle = locale === 'sl' ? 'Odstrani stranko' : 'Remove client'
  const clearSingleGroupTitle = locale === 'sl' ? 'Odstrani skupino' : 'Remove group'
  const showLessClientsLabel = locale === 'sl' ? 'Prikaži manj' : 'Show less'

  function getMoreClientsLabel(hiddenCount: number) {
    return locale === 'sl' ? `+ ${hiddenCount} več` : `+ ${hiddenCount} more`
  }

  function openCalendarClientDetails(clientId?: number | null) {
    if (!clientId) return
    setCalendarClientDetailRestrictLifecycle(true)
    setCalendarClientDetailId(clientId)
  }

  function openCalendarGroupDetails(groupId?: number | null, bookingId?: number | null) {
    if (!groupId) return
    setCalendarGroupDetailId(groupId)
    setCalendarGroupDetailBookingId(
      bookingId != null && Number.isFinite(bookingId) && bookingId > 0 ? bookingId : null,
    )
  }

  function formatBookingClientsLabel(bookingLike: any) {
    const gidRaw = bookingLike?.groupId
    const gid =
      gidRaw != null && Number.isFinite(Number(gidRaw)) && Number(gidRaw) > 0 ? Number(gidRaw) : null
    if (groupBookingEnabled && gid != null) {
      const g = metaGroups.find((x: any) => x.id === gid)
      const rawClients = Array.isArray(bookingLike?.clients) ? bookingLike.clients : []
      const count =
        rawClients.length > 0 ? rawClients.length : bookingLike?.client?.id ? 1 : 0
      const name = (g?.name && String(g.name).trim()) || `Group #${gid}`
      const maxRaw = bookingLike?.type?.maxParticipantsPerSession ?? getTypeMaxParticipants(bookingLike?.type?.id)
      const max =
        maxRaw != null &&
        Number.isFinite(Number(maxRaw)) &&
        Number(maxRaw) >= 1 &&
        Number(maxRaw) <= 99
          ? Number(maxRaw)
          : null
      if (max != null) {
        return `${name} (${count}/${max})`
      }
      return count > 0 ? `${name} (${count})` : name
    }

    const ids = normalizeSelectedClientIds(bookingLike?.clients?.map((c: any) => c?.id), bookingLike?.client?.id)
    const clients = ids
      .map((id) => metaClients.find((c: any) => c.id === id) || bookingLike?.clients?.find((c: any) => c?.id === id) || (bookingLike?.client?.id === id ? bookingLike.client : null))
      .filter(Boolean)
    if (clients.length === 0) return '-'
    const first = nameLastFirst(clients[0] || { firstName: '', lastName: '' }) || '-'
    return clients.length > 1 ? `${first} +${clients.length - 1}` : first
  }

  /** FullCalendar draws a blue/teal `.fc-highlight` during select; we show a colored draft event instead. */
  const hideNativeSelectionWhileDraftPreview = useMemo(
    () =>
      !isNativeAndroid &&
      !isViewOnly &&
      !selectedBookedSession &&
      !selectedPersonalBlock &&
      !selectedTodo &&
      (!!selection || !!availabilitySelection),
    [
      isNativeAndroid,
      isViewOnly,
      selectedBookedSession,
      selectedPersonalBlock,
      selectedTodo,
      selection,
      availabilitySelection,
    ],
  )
  const personalTaskPresets = useMemo(() => {
    const out: string[] = []
    const unique = new Set<string>()

    const rawJson = String(settings[PERSONAL_TASK_PRESETS_KEY] || '')
    if (rawJson.trim()) {
      try {
        const parsed = JSON.parse(rawJson)
        if (Array.isArray(parsed)) {
          for (const row of parsed) {
            const name = String(row?.name || '').trim()
            if (name && !unique.has(name.toLowerCase())) {
              unique.add(name.toLowerCase())
              out.push(name)
            }
          }
        }
      } catch {
        // Ignore parse errors and try legacy format below.
      }
    }

    // Legacy fallback: one task per line from previous setting key.
    const legacyRaw = String(settings.PERSONAL_TASK_PRESETS || '')
    if (legacyRaw.trim()) {
      for (const line of legacyRaw.split(/\r?\n/)) {
        const name = line.trim()
        if (name && !unique.has(name.toLowerCase())) {
          unique.add(name.toLowerCase())
          out.push(name)
        }
      }
    }

    return out
  }, [settings])
  useEffect(() => {
    if (!editingClientSearch || !selection || form.todo || form.personal) return
    const id = requestAnimationFrame(() => clientSearchInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [editingClientSearch, selection, form.todo, form.personal])

  useEffect(() => {
    if (!editingGroupSearch || !selection || form.todo || form.personal || !bookingGroupMode || !groupBookingEnabled) return
    const id = requestAnimationFrame(() => groupSearchInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [editingGroupSearch, selection, form.todo, form.personal, bookingGroupMode, groupBookingEnabled])

  useEffect(() => {
    if (!form.personal) setPersonalTaskPresetDropdownOpen(false)
  }, [form.personal])

  useEffect(() => {
    if (!selection || form.todo || form.personal || availabilitySelection) return
    setForm((f: any) => {
      const updates: Record<string, unknown> = {}
      if (user.role === 'ADMIN' && metaConsultants.length === 1) {
        updates.consultantId = metaConsultants[0].id
      }
      if (settings.SPACES_ENABLED !== 'false') {
        if (metaSpaces.length === 1) {
          updates.spaceId = metaSpaces[0].id
        } else if (metaSpaces.length === 0) {
          updates.spaceId = null
        }
      }
      if (metaTypes.length === 0) {
        updates.typeId = null
      }
      if (Object.keys(updates).length === 0) return f
      let changed = false
      for (const [k, v] of Object.entries(updates)) {
        if (f[k] !== v) changed = true
      }
      return changed ? { ...f, ...updates } : f
    })
  }, [selection, form.todo, form.personal, availabilitySelection, user.role, metaConsultants, metaSpaces, metaTypes.length, settings.SPACES_ENABLED])

  useEffect(() => {
    if (!availabilitySelection || user.role !== 'ADMIN' || metaConsultants.length !== 1) return
    const id = metaConsultants[0].id
    if (availabilitySelection.consultantId === id) return
    setAvailabilitySelection({ ...availabilitySelection, consultantId: id })
  }, [availabilitySelection, metaConsultants, user.role])

  useEffect(() => {
    if (!selectedPersonalBlock) setPersonalTaskPresetDropdownOpen(false)
  }, [selectedPersonalBlock])

  useEffect(() => {
    if (calendarFiltersBottomBar) setMonthHoverCard(null)
  }, [calendarFiltersBottomBar])

  useEffect(() => {
    if (!selectedBookedSession) return
    setBookedClientSearch('')
    setBookedClientDropdownOpen(false)
    setEditingBookedClientSearch(false)
    setBookedSessionClientsExpanded(false)
  }, [selectedBookedSession?.id])

  useEffect(() => {
    if (!editingBookedClientSearch || !selectedBookedSession) return
    const id = requestAnimationFrame(() => bookedClientSearchInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [editingBookedClientSearch, selectedBookedSession])

  useEffect(() => {
    if (bookSessionSelectedClients.length <= 3) setBookSessionClientsExpanded(false)
  }, [bookSessionSelectedClients.length])

  useEffect(() => {
    if (bookedSessionSelectedClients.length <= 3) setBookedSessionClientsExpanded(false)
  }, [bookedSessionSelectedClients.length])

  useEffect(() => {
    if (selection) setBookSessionClientsExpanded(false)
  }, [selection])

  const createClientFromBooking = async () => {
    setClientError('')
    if (!newClientForm.lastName.trim() && !newClientForm.firstName.trim()) {
      setClientError('Last name (or first and last name) is required.')
      return
    }
    setSavingClient(true)
    try {
      const payload: any = {
        firstName: newClientForm.firstName.trim() || '',
        lastName: newClientForm.lastName.trim() || '',
        email: newClientForm.email.trim() || null,
        phone: newClientForm.phone.trim() || null,
        preferredSlots: [],
      }
      if (user.role === 'ADMIN') {
        payload.assignedToId = selectedBookedSession?.consultant?.id ?? form.consultantId
      }
      const { data } = await api.post('/clients', payload)
      setMeta((m: any) => ({ ...m, clients: [...m.clients, data] }))
      if (selectedBookedSession) {
        const nextIds = multipleClientsPerSessionEnabled
          ? Array.from(new Set([...(selectedBookedClientIds || []), data.id]))
          : [data.id]
        setSelectedBookedSession((prev: any) => prev ? {
          ...prev,
          client: data,
          clients: nextIds
            .map((id) => (id === data.id ? data : metaClients.find((c: any) => c.id === id) || prev.clients?.find((c: any) => c.id === id) || null))
            .filter(Boolean),
        } : prev)
        setBookedClientDropdownOpen(false)
        setEditingBookedClientSearch(false)
      } else {
        const nextIds = multipleClientsPerSessionEnabled
          ? Array.from(new Set([...(selectedFormClientIds || []), data.id]))
          : [data.id]
        setForm((f: any) => ({ ...f, clientId: data.id, clientIds: nextIds }))
        setClientDropdownOpen(false)
        setEditingClientSearch(false)
      }
      setShowAddClientModal(false)
      setNewClientForm({ firstName: '', lastName: '', email: '', phone: '' })
    } catch (e: any) {
      setClientError(e?.response?.data?.message || 'Failed to create client.')
    } finally {
      setSavingClient(false)
    }
  }

  const createGroupFromBooking = async () => {
    setGroupModalError('')
    const name = newGroupForm.name.trim()
    if (!name) {
      setGroupModalError(locale === 'sl' ? 'Ime skupine je obvezno.' : 'Group name is required.')
      return
    }
    setSavingNewGroupModal(true)
    try {
      const { data } = await api.post('/groups', { name, email: newGroupForm.email.trim() || null })
      setMeta((m: any) => ({ ...m, groups: [...(m.groups || []), data] }))
      setForm((f: any) => ({ ...f, groupId: data.id, clientIds: [], clientId: null }))
      setGroupSearch('')
      setEditingGroupSearch(false)
      setGroupDropdownOpen(false)
      setShowAddGroupModal(false)
      setNewGroupForm({ name: '', email: '' })
    } catch (e: any) {
      setGroupModalError(e?.response?.data?.message || e?.message || 'Failed to create group.')
    } finally {
      setSavingNewGroupModal(false)
    }
  }

  const postClientFromTypedName = async (typed: string, assignedToIdForAdmin: number | null | undefined) => {
    const { firstName, lastName } = parseClientNameInput(typed)
    if (!lastName.trim() && !firstName.trim()) {
      throw new Error('Client name is required.')
    }
    const payload: any = {
      firstName: firstName.trim() || '',
      lastName: lastName.trim() || '',
      email: null,
      phone: null,
      preferredSlots: [],
    }
    if (user.role === 'ADMIN') {
      if (!assignedToIdForAdmin) {
        throw new Error('Choose a consultant before creating a client.')
      }
      payload.assignedToId = assignedToIdForAdmin
    }
    const { data } = await api.post('/clients', payload)
    setMeta((m: any) => ({ ...m, clients: [...m.clients, data] }))
    return data
  }

  const postGroupFromTypedName = async (typed: string) => {
    const name = typed.trim()
    if (!name) {
      throw new Error('Group name is required.')
    }
    const { data } = await api.post('/groups', { name })
    setMeta((m: any) => ({ ...m, groups: [...(m.groups || []), data] }))
    return data
  }

  const openBookingModal = (
    start: string,
    end: string,
    consultantId?: number,
    keepProvidedEnd = false,
    preselectedSpaceId?: number | null,
    preselectedClientId?: number | null,
    selectedOutsideBookable = false,
    anchorEl?: HTMLElement | null,
    /** Resource column id when using Spaces/Bookings ALL columns (keeps highlight on one column only). */
    selectionResourceId?: string | null,
    opts?: { skipCompactNavigate?: boolean },
  ) => {
    setConfirmNonBookable(null)
    bookingEndEditedManuallyRef.current = false
    setSelectedBookedSession(null)
    setCalendarGroupDetailId(null)
    setCalendarGroupDetailBookingId(null)
    const startLocal = normalizeToLocalDateTime(start)
    const defaultTypeId: number | null = metaTypes?.[0]?.id ?? null
    const endLocal = keepProvidedEnd
      ? normalizeToLocalDateTime(end)
      : toLocalDateTimeString(
          new Date(new Date(startLocal).getTime() + getTypeDurationMinutes(defaultTypeId) * 60000),
        )
    const availableConsultants = metaUsers.filter((u: any) => u.consultant)
    const defaultConsultantId = consultantId || availableConsultants[0]?.id || user.id
    setSelection({
      start: startLocal,
      end: endLocal,
      ...(selectionResourceId !== undefined ? { resourceId: selectionResourceId } : {}),
    })
    setClientSearch('')
    setClientDropdownOpen(false)
    setEditingClientSearch(false)
    setSaveBookingError(null)
    setMeetingProviderPickerOpen(false)
    setMeetingPickerCancelUnchecksOnline(false)
    setBookSessionNotesExpanded(false)
    setBookingGroupMode(false)
    setGroupSearch('')
    setGroupDropdownOpen(false)
    setEditingGroupSearch(false)
    setForm({
      clientId: preselectedClientId != null ? preselectedClientId : null,
      clientIds: preselectedClientId != null ? [preselectedClientId] : [],
      groupId: null,
      consultantId: defaultConsultantId,
      startTime: startLocal,
      endTime: endLocal,
      spaceId: preselectedSpaceId !== undefined ? preselectedSpaceId : (metaSpaces[0]?.id ?? null),
      typeId: defaultTypeId,
      notes: '',
      personal: false,
      online: false,
      meetingProvider: 'zoom',
      task: '',
      todo: false,
      outsideBookable: selectedOutsideBookable,
    })
    placeSessionPopup(anchorEl)
    if (useBookingSidePanel && !opts?.skipCompactNavigate) {
      const defaultSpaceId = preselectedSpaceId !== undefined ? preselectedSpaceId : (metaSpaces[0]?.id ?? null)
      const ridForUrl =
        selectionResourceId !== undefined && selectionResourceId !== null && selectionResourceId !== ''
          ? String(selectionResourceId)
          : undefined
      const qs = buildNewSlotSearchParams({
        start: startLocal,
        end: endLocal,
        consultantId: defaultConsultantId,
        spaceId: defaultSpaceId,
        clientId: preselectedClientId != null ? preselectedClientId : undefined,
        resourceId: ridForUrl,
        outsideBookable: selectedOutsideBookable,
      })
      pushCompactFormRoute(`${pathForNewForm('booking')}?${qs}`)
    }
  }

  useEffect(() => {
    if (!useBookingSidePanel) return
    const routeMatch = matchCalendarFormRoute(location.pathname)
    const fullKey = `${location.pathname}${location.search || ''}`
    if (!routeMatch) {
      lastHydratedFormRouteKeyRef.current = ''
      return
    }
    if (compactFormHydrateSkipKeyRef.current === fullKey) {
      compactFormHydrateSkipKeyRef.current = null
      lastHydratedFormRouteKeyRef.current = fullKey
      return
    }
    if (lastHydratedFormRouteKeyRef.current === fullKey) return

    if (routeMatch.kind === 'new') {
      const sp = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search)
      if (sp.has('fromWh')) {
        const a = parseAvailabilityQuery(location.search)
        if (a) {
          setSelection({ start: a.start, end: a.end })
          setAvailabilityError(null)
          setAvailabilityIntent('add')
          setAvailabilitySelection({
            slotId: a.fromWorkingHours ? null : a.slotId,
            consultantId: a.consultantId,
            startTime: a.start,
            endTime: a.end,
            indefinite: a.indefinite,
            rangeStartDate: a.rangeStartDate,
            rangeEndDate: a.rangeEndDate,
          })
          lastHydratedFormRouteKeyRef.current = fullKey
          return
        }
      }
      if (sp.get('panel') === 'personal' && personalModuleEnabled) {
        const q = parseNewSlotQuery(location.search)
        if (!q.start || !q.end) return
        const startLocal = normalizeToLocalDateTime(q.start)
        const endLocal = normalizeToLocalDateTime(q.end)
        const availableConsultants = metaUsers.filter((u: any) => u.consultant)
        const defaultConsultantId = q.consultantId || availableConsultants[0]?.id || user.id
        const defaultTypeId: number | null = metaTypes?.[0]?.id ?? null
        setConfirmNonBookable(null)
        bookingEndEditedManuallyRef.current = false
        setSelection({
          start: startLocal,
          end: endLocal,
          ...(q.resourceId ? { resourceId: q.resourceId } : {}),
        })
        setClientSearch('')
        setClientDropdownOpen(false)
        setEditingClientSearch(false)
        setSaveBookingError(null)
        setMeetingProviderPickerOpen(false)
        setMeetingPickerCancelUnchecksOnline(false)
        setBookSessionNotesExpanded(false)
        setForm({
          clientId: null,
          consultantId: defaultConsultantId,
          startTime: startLocal,
          endTime: endLocal,
          spaceId: q.spaceId !== undefined ? q.spaceId : (metaSpaces[0]?.id ?? null),
          typeId: defaultTypeId,
          notes: '',
          personal: true,
          online: false,
          meetingProvider: 'zoom',
          task: '',
          todo: false,
          outsideBookable: false,
        })
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      if (sp.get('panel') === 'todo' && todosModuleEnabled) {
        const q = parseNewSlotQuery(location.search)
        if (!q.start || !q.end) return
        const startLocal = normalizeToLocalDateTime(q.start)
        const endLocal = normalizeToLocalDateTime(q.end)
        const availableConsultants = metaUsers.filter((u: any) => u.consultant)
        const defaultConsultantId = q.consultantId || availableConsultants[0]?.id || user.id
        const defaultTypeId: number | null = metaTypes?.[0]?.id ?? null
        setConfirmNonBookable(null)
        bookingEndEditedManuallyRef.current = false
        setSelection({
          start: startLocal,
          end: endLocal,
          ...(q.resourceId ? { resourceId: q.resourceId } : {}),
        })
        setClientSearch('')
        setClientDropdownOpen(false)
        setEditingClientSearch(false)
        setSaveBookingError(null)
        setMeetingProviderPickerOpen(false)
        setMeetingPickerCancelUnchecksOnline(false)
        setBookSessionNotesExpanded(false)
        setForm({
          clientId: null,
          consultantId: defaultConsultantId,
          startTime: startLocal,
          endTime: endLocal,
          spaceId: q.spaceId !== undefined ? q.spaceId : (metaSpaces[0]?.id ?? null),
          typeId: defaultTypeId,
          notes: '',
          personal: false,
          online: false,
          meetingProvider: 'zoom',
          task: '',
          todo: true,
          outsideBookable: false,
        })
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      const q = parseNewSlotQuery(location.search)
      if (!q.start || !q.end) return
      openBookingModal(
        q.start,
        q.end,
        q.consultantId != null ? q.consultantId : undefined,
        true,
        q.spaceId !== undefined ? q.spaceId : undefined,
        q.clientId ?? null,
        q.outsideBookable ?? false,
        null,
        q.resourceId ?? null,
        { skipCompactNavigate: true },
      )
      lastHydratedFormRouteKeyRef.current = fullKey
      return
    }

    if (routeMatch.kind === 'edit' && routeMatch.form === 'booking') {
      const b = (calendarData.booked || []).find((x: any) => x.id === routeMatch.id)
      if (!b) return
      if (selectedBookedSession?.id === routeMatch.id) {
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      sessionPopupAnchorRectRef.current = null
      setSelection(null)
      calendarRef.current?.getApi()?.unselect()
      setSelectedBookedSession({
        ...b,
        online: Boolean(b.online ?? b.meetingLink),
        meetingProvider: b.meetingProvider || 'zoom',
      })
      lastHydratedFormRouteKeyRef.current = fullKey
      return
    }

    if (routeMatch.kind === 'edit' && routeMatch.form === 'personal') {
      const p = (calendarData.personal || []).find((x: any) => x.id === routeMatch.id)
      if (!p) return
      if (selectedPersonalBlock?.id === routeMatch.id) {
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      sessionPopupAnchorRectRef.current = null
      setSelection(null)
      calendarRef.current?.getApi()?.unselect()
      setSelectedPersonalBlock(p)
      lastHydratedFormRouteKeyRef.current = fullKey
      return
    }

    if (routeMatch.kind === 'edit' && routeMatch.form === 'todo') {
      const td = (calendarData.todos || []).find((x: any) => x.id === routeMatch.id)
      if (!td) return
      if (selectedTodo?.id === routeMatch.id) {
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      sessionPopupAnchorRectRef.current = null
      setSelection(null)
      calendarRef.current?.getApi()?.unselect()
      setSelectedTodo(td)
      lastHydratedFormRouteKeyRef.current = fullKey
    }
  }, [
    useBookingSidePanel,
    location.pathname,
    location.search,
    personalModuleEnabled,
    todosModuleEnabled,
    calendarData.booked,
    calendarData.personal,
    calendarData.todos,
    metaUsers,
    metaSpaces,
    metaTypes,
    user.id,
    selectedBookedSession?.id,
    selectedPersonalBlock?.id,
    selectedTodo?.id,
    openBookingModal,
  ])

  const formatVoiceReviewDateTime = (value?: string | null) => {
    if (!value) return '—'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return value
    return dt.toLocaleString(locale === 'sl' ? 'sl-SI' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const submitVoiceBookingTranscript = async (text: string, confirmCancellation = false, clientIdOverride?: number | null, clientNameOverride?: string | null) => {
    const genericVoiceFailure = locale === 'sl' ? 'Glasovno dejanje ni uspelo.' : 'Voice action failed.'
    const trimmed = text.trim()
    if (!trimmed) {
      setVoiceBookingError(locale === 'sl' ? 'Besedilo je prazno.' : 'The text is empty.')
      return
    }
    if (!confirmCancellation) {
      setVoicePendingCancellation(null)
    }
    setVoiceBookingError(null)
    setVoiceBookingLoading(true)
    try {
      const payload: { transcript: string; confirmCancellation: boolean; locale: string; clientId?: number; clientName?: string } = { transcript: trimmed, confirmCancellation, locale }
      if (clientIdOverride != null) payload.clientId = clientIdOverride
      if (clientNameOverride && clientNameOverride.trim()) payload.clientName = clientNameOverride.trim()
      const res = await api.post('/ai/voice-booking', payload)
      const action = typeof res.data?.action === 'string' ? res.data.action : ''
      if (res.data?.confirmationRequired && (action === 'cancel_review' || action === 'book_review')) {
        setVoiceBookingError(null)
        setVoiceReviewClientId(res.data?.clientId ?? null)
        setVoicePendingCancellation({
          action,
          targetType: res.data?.targetType ?? null,
          targetId: res.data?.targetId ?? null,
          message: res.data?.message,
          bookingId: res.data?.bookingId,
          clientId: res.data?.clientId ?? null,
          clientName: res.data?.clientName ?? null,
          title: res.data?.title ?? null,
          startTime: res.data?.startTime ?? null,
          endTime: res.data?.endTime ?? null,
          confirmationRequired: true,
        })
        setVoiceReviewOpen(true)
        return
      }
      setVoiceReviewOpen(false)
      setVoicePendingCancellation(null)
      setVoiceReviewClientId(null)
      setVoiceReviewClientQuery('')
      setVoiceReviewClientDropdownOpen(false)
      setVoiceBookingError(null)
      await loadRef.current()
      showToast('success', res.data?.message || (locale === 'sl' ? (action === 'cancelled' ? 'Dejanje je uspešno izvedeno.' : 'Dejanje je uspešno izvedeno.') : 'Action completed successfully.'))
      const startStr = res.data?.startTime as string | undefined
      if (startStr) {
        const d = new Date(startStr)
        if (!Number.isNaN(d.getTime())) {
          calendarRef.current?.getApi().gotoDate(d)
        }
      }
    } catch (e: unknown) {
      const err = e as {
        response?: {
          status?: number
          data?: { message?: string; startTime?: string; endTime?: string; clientId?: number; code?: string }
        }
        message?: string
      }
      const d = err?.response?.data
      const status = err?.response?.status
      if (
        d &&
        typeof d.startTime === 'string' &&
        typeof d.endTime === 'string' &&
        (status === 400 || status === 409)
      ) {
        setVoicePendingCancellation(null)
        setVoiceReviewOpen(false)
        setVoiceReviewClientId(null)
        setVoiceReviewClientQuery('')
        setVoiceReviewClientDropdownOpen(false)
        setCalendarMode('bookings')
        setVoiceBookingError(null)
        setSaveBookingError(d.message ?? 'Ta termin ni na voljo.')
        const startS = normalizeToLocalDateTime(d.startTime)
        const endS = normalizeToLocalDateTime(d.endTime)
        window.setTimeout(() => {
          openBookingModal(startS, endS, user.id, true, undefined, d.clientId ?? null)
          const dt = new Date(startS)
          if (!Number.isNaN(dt.getTime())) {
            calendarRef.current?.getApi().gotoDate(dt)
          }
        }, 0)
        return
      }
      const msg = d?.message ?? err?.message ?? genericVoiceFailure
      setVoiceBookingError(String(msg))
    } finally {
      setVoiceBookingLoading(false)
    }
  }

  const showVoiceBookingFallbackError = (fallbackMessage?: string) => {
    if (!fallbackMessage || voiceFallbackErrorShownRef.current) return
    voiceFallbackErrorShownRef.current = true
    setVoiceBookingError(fallbackMessage)
  }

  const startVoiceBooking = () => {
    setVoiceBookingError(null)
    setVoicePendingCancellation(null)
    setVoiceReviewClientId(null)
    setVoiceReviewClientQuery('')
    setVoiceReviewClientDropdownOpen(false)
    voiceFallbackErrorShownRef.current = false
    webSpeechHadTranscriptRef.current = false
    if (!aiBookingEnabled) {
      setVoiceBookingError(locale === 'sl' ? 'AI glasovna dejanja so izklopljena v konfiguraciji.' : 'AI voice actions are disabled in configuration.')
      return
    }
    if (isNativeAndroid) {
      if (nativeReleaseStopTimerRef.current != null) {
        window.clearTimeout(nativeReleaseStopTimerRef.current)
        nativeReleaseStopTimerRef.current = null
      }
      nativeSessionFinalizedRef.current = false
      nativeTranscriptRef.current = ''
      nativeTranscriptBestRef.current = ''
      androidMicShouldListenRef.current = true
      androidMicHoldActiveRef.current = true
      void startVoiceBookingAndroidNative()
      return
    }
    const win = window as unknown as {
      SpeechRecognition?: new () => { start: () => void; stop: () => void }
      webkitSpeechRecognition?: new () => { start: () => void; stop: () => void }
    }
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition
    if (!Ctor) {
      showVoiceBookingFallbackError(locale === 'sl' ? 'Ta brskalnik ne podpira glasovnega vnosa.' : 'This browser does not support voice input.')
      return
    }
    if (voiceBookingConfigured === false) {
      setVoiceBookingError(locale === 'sl' ? 'Glasovna dejanja niso na voljo. Na strežniku nastavite OPENAI_API_KEY.' : 'Voice actions are unavailable. Configure OPENAI_API_KEY on the server.')
      return
    }
    if (voiceBookingLoading) return
    if (speechRecognitionRef.current) return
    try {
      const r = new Ctor() as {
        lang: string
        interimResults: boolean
        continuous: boolean
        maxAlternatives: number
        onstart: (() => void) | null
        onend: (() => void) | null
        onerror: ((event: { error?: string }) => void) | null
        onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
        start: () => void
        stop: () => void
      }
      speechRecognitionRef.current = r
      voiceStopRequestedRef.current = false
      webSpeechBestTranscriptRef.current = ''
      webSpeechSubmittedRef.current = false
      webSpeechHadTranscriptRef.current = false
      voiceFallbackErrorShownRef.current = false
      r.lang = voiceRecognitionLang
      r.interimResults = isAndroidWeb
      r.continuous = isAndroidWeb
      r.maxAlternatives = 1
      r.onstart = () => setVoiceListening(true)
      r.onend = () => {
        setVoiceListening(false)
        speechRecognitionRef.current = null
        if (isAndroidWeb && !webSpeechSubmittedRef.current) {
          const text = webSpeechBestTranscriptRef.current.trim()
          if (text) {
            webSpeechSubmittedRef.current = true
            setVoicePendingCancellation(null)
            setVoiceReviewText(text)
            void submitVoiceBookingTranscript(text, false)
          } else if (!voiceStopRequestedRef.current && !webSpeechHadTranscriptRef.current) {
            showVoiceBookingFallbackError(locale === 'sl' ? 'Govor ni bil zaznan.' : 'No speech was detected.')
          }
        }
        voiceStopRequestedRef.current = false
      }
      r.onerror = (event: { error?: string }) => {
        setVoiceListening(false)
        speechRecognitionRef.current = null
        const wasRequested = voiceStopRequestedRef.current
        voiceStopRequestedRef.current = false
        if (wasRequested || webSpeechSubmittedRef.current) return
        if (event?.error === 'no-speech') return
        if (event?.error === 'aborted') return
        const msg = locale === 'sl' ? 'Prepoznavanje govora ni uspelo ali je bilo preklicano.' : 'Speech recognition failed or was cancelled.'
        showVoiceBookingFallbackError(msg)
      }
      r.onresult = (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => {
        const text = Array.from(event.results)
          .map((row) => row[0]?.transcript ?? '')
          .join(' ')
          .trim()
        if (!text) {
          return
        }
        webSpeechHadTranscriptRef.current = true
        webSpeechBestTranscriptRef.current = text
        if (isAndroidWeb && !voiceStopRequestedRef.current) {
          return
        }
        if (webSpeechSubmittedRef.current) return
        webSpeechSubmittedRef.current = true
        setVoicePendingCancellation(null)
        setVoiceReviewText(text)
        void submitVoiceBookingTranscript(text, false)
      }
      r.start()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (locale === 'sl' ? 'Mikrofona ni bilo mogoče zagnati.' : 'The microphone could not be started.')
      setVoiceBookingError(msg)
    }
  }

  const startVoiceBookingAndroidNative = async () => {
    if (!aiBookingEnabled) {
      setVoiceBookingError(locale === 'sl' ? 'AI glasovna dejanja so izklopljena v konfiguraciji.' : 'AI voice actions are disabled in configuration.')
      return
    }
    if (voiceBookingConfigured === false) {
      setVoiceBookingError(locale === 'sl' ? 'Glasovna dejanja niso na voljo. Na strežniku nastavite OPENAI_API_KEY.' : 'Voice actions are unavailable. Configure OPENAI_API_KEY on the server.')
      return
    }
    if (voiceBookingLoading || voiceListening || nativeStartingRef.current) return
    if (!androidMicShouldListenRef.current) return
    nativeStartingRef.current = true
    try {
      const available = await NativeSpeechRecognition.available()
      if (!available?.available) {
        setVoiceBookingError(locale === 'sl' ? 'Naprava ne podpira glasovnega vnosa.' : 'This device does not support voice input.')
        return
      }
      const perms = await NativeSpeechRecognition.checkPermissions()
      if (perms?.speechRecognition !== 'granted') {
        const req = await NativeSpeechRecognition.requestPermissions()
        if (req?.speechRecognition !== 'granted') {
          setVoiceBookingError(locale === 'sl' ? 'Dovoljenje za mikrofon ni odobreno.' : 'Microphone permission was not granted.')
          return
        }
      }
      if (!androidMicShouldListenRef.current) return

      if (nativeSpeechHandleRef.current) {
        await nativeSpeechHandleRef.current.remove()
        nativeSpeechHandleRef.current = null
      }
      if (!nativeListeningHandleRef.current) {
        nativeListeningHandleRef.current = await NativeSpeechRecognition.addListener(
          'listeningState',
          (event: { status?: 'started' | 'stopped' }) => {
            if (event?.status === 'started') {
              // Ignore stale "started" callbacks that can arrive after finger release.
              if (!androidMicShouldListenRef.current || !androidMicHoldActiveRef.current) {
                setVoiceListening(false)
                void NativeSpeechRecognition.stop().catch(() => {})
                return
              }
              if (nativeRestartTimerRef.current != null) {
                window.clearTimeout(nativeRestartTimerRef.current)
                nativeRestartTimerRef.current = null
              }
              setVoiceListening(true)
            }
            if (event?.status === 'stopped') {
              setVoiceListening(false)
              // In tap mode, recognizer can auto-stop when user finishes speaking.
              // Delay finalize slightly: Android can emit final results just after "stopped".
              if (androidMicShouldListenRef.current) {
                androidMicShouldListenRef.current = false
                androidMicHoldActiveRef.current = false
                if (nativeFinalizeTimerRef.current != null) {
                  window.clearTimeout(nativeFinalizeTimerRef.current)
                }
                nativeFinalizeTimerRef.current = window.setTimeout(() => {
                  nativeFinalizeTimerRef.current = null
                  finalizeNativeTranscript(true)
                }, 420)
              }
            }
          }
        )
      }
      nativeSpeechHandleRef.current = await NativeSpeechRecognition.addListener('partialResults', (event: { matches?: string[] }) => {
        const text = (event?.matches || []).join(' ').trim()
        if (!text) return
        nativeTranscriptRef.current = text
        if (text.length > nativeTranscriptBestRef.current.length) {
          nativeTranscriptBestRef.current = text
        }
      })

      setVoiceListening(true)
      void NativeSpeechRecognition.start({
        language: voiceRecognitionLang,
        partialResults: true,
        maxResults: 1,
        popup: false,
        prompt: locale === 'sl' ? 'Govorite' : 'Speak',
      }).then((result: { matches?: string[] }) => {
        const finalText = (result?.matches || []).join(' ').trim()
        if (finalText) {
          nativeTranscriptRef.current = finalText
          if (finalText.length > nativeTranscriptBestRef.current.length) {
            nativeTranscriptBestRef.current = finalText
          }
        }
      }).catch((e: unknown) => {
        setVoiceListening(false)
        const msg = e instanceof Error ? e.message : (locale === 'sl' ? 'Mikrofona ni bilo mogoče zagnati.' : 'The microphone could not be started.')
        setVoiceBookingError(msg)
      })
    } catch (e: unknown) {
      setVoiceListening(false)
      const msg = e instanceof Error ? e.message : (locale === 'sl' ? 'Mikrofona ni bilo mogoče zagnati.' : 'The microphone could not be started.')
      setVoiceBookingError(msg)
    } finally {
      nativeStartingRef.current = false
    }
  }

  const stopVoiceBooking = async () => {
    if (isNativeAndroid) {
      androidMicShouldListenRef.current = false
      if (nativeRestartTimerRef.current != null) {
        window.clearTimeout(nativeRestartTimerRef.current)
        nativeRestartTimerRef.current = null
      }
      setVoiceListening(false)
      if (nativeReleaseStopTimerRef.current != null) {
        window.clearTimeout(nativeReleaseStopTimerRef.current)
      }
      if (nativeFinalizeTimerRef.current != null) {
        window.clearTimeout(nativeFinalizeTimerRef.current)
        nativeFinalizeTimerRef.current = null
      }
      nativeReleaseStopTimerRef.current = window.setTimeout(() => {
        nativeReleaseStopTimerRef.current = null
        void NativeSpeechRecognition.stop().catch(() => {
          // Ignore; some devices throw when already stopped.
        })
      }, 220)
      if (nativeSpeechHandleRef.current) {
        await nativeSpeechHandleRef.current.remove()
        nativeSpeechHandleRef.current = null
      }
      const text = (nativeTranscriptRef.current.length >= nativeTranscriptBestRef.current.length
        ? nativeTranscriptRef.current
        : nativeTranscriptBestRef.current).trim()
      nativeTranscriptRef.current = text
      nativeTranscriptBestRef.current = text
      if (nativeFinalizeTimerRef.current != null) {
        window.clearTimeout(nativeFinalizeTimerRef.current)
      }
      nativeFinalizeTimerRef.current = window.setTimeout(() => {
        nativeFinalizeTimerRef.current = null
        finalizeNativeTranscript(true)
      }, 250)
      return
    }

    const sr = speechRecognitionRef.current
    if (!sr) return
    voiceStopRequestedRef.current = true
    try {
      sr.stop()
    } catch {
      // Ignore browser-specific stop errors.
    }
  }

  const startVoiceBookingForShellRef = useRef(startVoiceBooking)
  const stopVoiceBookingForShellRef = useRef(stopVoiceBooking)
  startVoiceBookingForShellRef.current = startVoiceBooking
  stopVoiceBookingForShellRef.current = stopVoiceBooking

  const shellCalendarSlots = useMemo(() => {
    if (isNativeAndroid) return null
    const dateNav = (
      <CalendarHeaderDateNav
        calendarRef={calendarRef}
        title={calendarToolbarTitle}
        arrowsPlacement={calendarDateNavArrowsInRail ? 'rail' : 'inline'}
      />
    )
    const viewDropdown = (
      <CalendarHeaderViewDropdown
        calendarRef={calendarRef}
        view={view}
        t={t}
        useResourceViews={useResourceColumns}
      />
    )
    const modeGroupEl =
      calendarMobileHeaderNav && calendarSpacesFeatureActive ? (
        <CalendarHeaderModeGroup
          calendarMode={calendarMode}
          onModeChange={setCalendarModeView}
          bookableEnabled={bookableEnabled}
          spacesEnabled={spacesEnabled}
        />
      ) : null
    const voiceInHeader = showWebMobileBottomPanel && aiBookingEnabled
    const voiceButton = voiceInHeader ? (
      <button
        type="button"
        className={`calendar-voice-fab calendar-voice-fab--bottom-panel calendar-voice-fab--header-toolbar${
          voiceListening ? ' calendar-voice-fab--listening' : ''
        }`}
        disabled={voiceBookingLoading}
        onClick={() => {
          if (voiceListening) {
            void stopVoiceBookingForShellRef.current()
            return
          }
          startVoiceBookingForShellRef.current()
        }}
        title={
          voiceBookingConfigured === false
            ? locale === 'sl'
              ? 'AI glasovna dejanja zahtevajo OPENAI_API_KEY na strežniku'
              : 'AI voice actions require OPENAI_API_KEY on the server'
            : voiceBookingLoading
              ? locale === 'sl'
                ? 'Obdelava…'
                : 'Processing…'
              : voiceListening
                ? locale === 'sl'
                  ? 'Poslušam…'
                  : 'Listening…'
                : locale === 'sl'
                  ? 'Zaženi AI glasovna dejanja'
                  : 'Start AI voice actions'
        }
        aria-label={locale === 'sl' ? 'Zaženi AI glasovna dejanja' : 'Start AI voice actions'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
    ) : null
    const showWebToolbarMonthChip =
      (calendarFiltersBottomBar || calendarMobileHeaderNav) && isWebTimeGridLikeView(view)
    const toolbarMonthLabel = showWebToolbarMonthChip ? (
      <span className="calendar-toolbar-month-chip" aria-hidden="true">
        {calendarToolbarMonthLabel}
      </span>
    ) : null
    return {
      /* Narrow calendar: arrows removed — prev/next remains via rail (wider) or swipe; controls stay in header right */
      left: calendarMobileHeaderNav ? null : calendarHeaderCompact ? dateNav : null,
      center: calendarMobileHeaderNav ? null : calendarHeaderCompact ? null : dateNav,
      filters: !calendarFiltersBottomBar ? shellCalendarFilters : null,
      modeGroup: modeGroupEl,
      showMobileToolbar: calendarMobileHeaderNav,
      toolbarMonthLabel,
      viewDropdown,
      voiceButton,
    }
  }, [
    isNativeAndroid,
    calendarHeaderCompact,
    calendarFiltersBottomBar,
    calendarDateNavArrowsInRail,
    calendarMobileHeaderNav,
    calendarSpacesFeatureActive,
    calendarToolbarMonthLabel,
    calendarToolbarTitle,
    shellCalendarFilters,
    calendarMode,
    bookableEnabled,
    spacesEnabled,
    setCalendarModeView,
    view,
    t,
    useResourceColumns,
    showWebMobileBottomPanel,
    aiBookingEnabled,
    voiceListening,
    voiceBookingLoading,
    voiceBookingConfigured,
    locale,
  ])

  useLayoutEffect(() => {
    if (!shellCalendarSlots) {
      setShellCalendarSlots(null)
      return
    }
    setShellCalendarSlots(shellCalendarSlots)
    return () => setShellCalendarSlots(null)
  }, [shellCalendarSlots, setShellCalendarSlots])

  useEffect(() => {
    const onGlobalVoiceStart = () => {
      if (aiBookingEnabled && !voiceListening && !voiceBookingLoading) {
        startVoiceBooking()
      }
    }
    window.addEventListener('global-voice-start', onGlobalVoiceStart)
    return () => window.removeEventListener('global-voice-start', onGlobalVoiceStart)
  }, [aiBookingEnabled, voiceListening, voiceBookingLoading])

  useEffect(() => {
    return () => {
      androidMicShouldListenRef.current = false
      androidMicHoldActiveRef.current = false
      void stopVoiceBooking()
      if (nativeListeningHandleRef.current) {
        void nativeListeningHandleRef.current.remove()
        nativeListeningHandleRef.current = null
      }
      if (nativeRestartTimerRef.current != null) {
        window.clearTimeout(nativeRestartTimerRef.current)
        nativeRestartTimerRef.current = null
      }
      if (nativeReleaseStopTimerRef.current != null) {
        window.clearTimeout(nativeReleaseStopTimerRef.current)
        nativeReleaseStopTimerRef.current = null
      }
      if (nativeFinalizeTimerRef.current != null) {
        window.clearTimeout(nativeFinalizeTimerRef.current)
        nativeFinalizeTimerRef.current = null
      }
    }
  }, [])

  const finalizeNativeTranscript = (showNoSpeechError: boolean) => {
    if (nativeSessionFinalizedRef.current) return
    nativeSessionFinalizedRef.current = true
    const text = (nativeTranscriptRef.current.length >= nativeTranscriptBestRef.current.length
      ? nativeTranscriptRef.current
      : nativeTranscriptBestRef.current).trim()
    nativeTranscriptRef.current = ''
    nativeTranscriptBestRef.current = ''
    if (text) {
      setVoicePendingCancellation(null)
      setVoiceReviewText(text)
      void submitVoiceBookingTranscript(text, false)
    } else if (showNoSpeechError) {
      setVoiceBookingError(locale === 'sl' ? 'Govor ni bil zaznan.' : 'No speech was detected.')
    }
  }

  useEffect(() => {
    if (!voiceBookingError) return
    showToast('error', voiceBookingError)
    setVoiceBookingError(null)
  }, [showToast, voiceBookingError])

  const getBookableSelectionInfo = (start: string, end: string): { isBookable: boolean; consultantId?: number } => {
    const selectionStartMs = new Date(start).getTime()
    const selectionEndMs = new Date(end).getTime()
    if (!Number.isFinite(selectionStartMs) || !Number.isFinite(selectionEndMs) || selectionEndMs <= selectionStartMs) {
      return { isBookable: false }
    }

    // In Bookings mode, validate against the visible 30-minute availability chunks so
    // users can drag across consecutive chunks and still create one booking.
    if (calendarMode === 'bookings') {
      const rangesByConsultant = new Map<number, Array<{ startMs: number; endMs: number }>>()

      for (const ev of events as any[]) {
        if (ev?.extendedProps?.kind !== 'bookable') continue
        const consultantId = ev?.extendedProps?.consultant?.id
        if (!Number.isFinite(consultantId)) continue
        const eventStartMs = new Date(ev.start).getTime()
        const eventEndMs = new Date(ev.end).getTime()
        if (!Number.isFinite(eventStartMs) || !Number.isFinite(eventEndMs) || eventEndMs <= eventStartMs) continue
        if (eventEndMs <= selectionStartMs || eventStartMs >= selectionEndMs) continue
        const clippedStartMs = Math.max(eventStartMs, selectionStartMs)
        const clippedEndMs = Math.min(eventEndMs, selectionEndMs)
        if (clippedEndMs <= clippedStartMs) continue
        const arr = rangesByConsultant.get(consultantId) || []
        arr.push({ startMs: clippedStartMs, endMs: clippedEndMs })
        rangesByConsultant.set(consultantId, arr)
      }

      const fullyCoveringConsultants: number[] = []
      for (const [consultantId, ranges] of rangesByConsultant.entries()) {
        ranges.sort((a, b) => a.startMs - b.startMs)
        let cursor = selectionStartMs
        for (const r of ranges) {
          if (r.endMs <= cursor) continue
          if (r.startMs > cursor) break
          cursor = Math.max(cursor, r.endMs)
          if (cursor >= selectionEndMs) break
        }
        if (cursor >= selectionEndMs) {
          fullyCoveringConsultants.push(consultantId)
        }
      }

      if (fullyCoveringConsultants.length === 0) return { isBookable: false }
      if (fullyCoveringConsultants.length === 1) {
        return { isBookable: true, consultantId: fullyCoveringConsultants[0] }
      }
      if (consultantFilterId != null && fullyCoveringConsultants.includes(consultantFilterId)) {
        return { isBookable: true, consultantId: consultantFilterId }
      }
      return { isBookable: true, consultantId: fullyCoveringConsultants[0] }
    }

    const startDate = new Date(start)
    const endDate = new Date(end)
    const isoDate = startDate.toISOString().slice(0, 10)
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    const dayOfWeek = dayNames[startDate.getDay()]
    const startTime = startDate.toTimeString().slice(0, 8)
    const endTime = endDate.toTimeString().slice(0, 8)

    const visibleSlots = filterByConsultantRole(calendarData.bookable)
    const matchingSlot = visibleSlots.find((slot: any) => {
      if (slot.dayOfWeek !== dayOfWeek) return false
      if (!slot.indefinite && ((slot.startDate && isoDate < slot.startDate) || (slot.endDate && isoDate > slot.endDate))) return false
      return slot.startTime <= startTime && slot.endTime >= endTime
    })
    if (matchingSlot) {
      const cid = matchingSlot.consultant?.id
      const st = new Date(start)
      const w = consultantDayWindow(
        st.getFullYear(),
        st.getMonth(),
        st.getDate(),
        cid,
        metaUsers,
        whWindowParseHm(slotMinTime),
        whWindowParseHm(slotMaxTime),
      )
      if (w != null && 'closed' in w && w.closed) return { isBookable: false }
      if (w != null && 'startMin' in w) {
        const span = windowToDayMs(st.getFullYear(), st.getMonth(), st.getDate(), w.startMin, w.endMin)
        if (selectionEndMs <= span.startMs || selectionStartMs >= span.endMs) return { isBookable: false }
      }
      return { isBookable: true, consultantId: cid }
    }

    const whCandidates = metaUsers.filter((u: any) => {
      if (!u?.workingHours || typeof u.workingHours !== 'object') return false
      if (!(u.consultant || u.role === 'CONSULTANT')) return false
      if (user.role !== 'ADMIN') return u.id === user.id
      if (effectiveConsultantFilterId != null) return u.id === effectiveConsultantFilterId
      return true
    })
    const st0 = new Date(start)
    for (const cu of whCandidates) {
      const w = consultantDayWindow(
        st0.getFullYear(),
        st0.getMonth(),
        st0.getDate(),
        cu.id,
        metaUsers,
        whWindowParseHm(slotMinTime),
        whWindowParseHm(slotMaxTime),
      )
      if (w == null || ('closed' in w && w.closed) || !('startMin' in w)) continue
      const span = windowToDayMs(st0.getFullYear(), st0.getMonth(), st0.getDate(), w.startMin, w.endMin)
      if (selectionStartMs >= span.startMs && selectionEndMs <= span.endMs) {
        return { isBookable: true, consultantId: cu.id }
      }
    }
    return { isBookable: false }
  }

  /** Same green-chunk coverage as create, but only for the session's consultant (bookings mode + bookable overlay). */
  const isBookedMoveIntervalBookable = (start: string, end: string, consultantId: number | undefined, breakMinutes = 0): boolean => {
    if (calendarMode === 'spaces') return true
    if (!bookableEnabled || calendarMode !== 'bookings' || view === 'dayGridMonth' || view === 'resourceDayGridMonth') {
      return true
    }
    if (!Number.isFinite(consultantId)) return true
    const selectionStartMs = new Date(start).getTime()
    const baseSelectionEndMs = new Date(end).getTime()
    const selectionEndMs = baseSelectionEndMs + Math.max(0, Number(breakMinutes) || 0) * 60000
    if (!Number.isFinite(selectionStartMs) || !Number.isFinite(selectionEndMs) || selectionEndMs <= selectionStartMs) {
      return false
    }
    const ranges: Array<{ startMs: number; endMs: number }> = []
    for (const ev of events as any[]) {
      if (ev?.extendedProps?.kind !== 'bookable') continue
      if (ev?.extendedProps?.consultant?.id !== consultantId) continue
      const eventStartMs = new Date(ev.start).getTime()
      const eventEndMs = new Date(ev.end).getTime()
      if (!Number.isFinite(eventStartMs) || !Number.isFinite(eventEndMs) || eventEndMs <= eventStartMs) continue
      if (eventEndMs <= selectionStartMs || eventStartMs >= selectionEndMs) continue
      const clippedStartMs = Math.max(eventStartMs, selectionStartMs)
      const clippedEndMs = Math.min(eventEndMs, selectionEndMs)
      if (clippedEndMs <= clippedStartMs) continue
      ranges.push({ startMs: clippedStartMs, endMs: clippedEndMs })
    }
    ranges.sort((a, b) => a.startMs - b.startMs)
    let cursor = selectionStartMs
    for (const r of ranges) {
      if (r.endMs <= cursor) continue
      if (r.startMs > cursor) break
      cursor = Math.max(cursor, r.endMs)
      if (cursor >= selectionEndMs) break
    }
    return cursor >= selectionEndMs
  }

  const handleCalendarSelection = (
    start: string,
    end: string,
    options?: {
      preserveDraggedRange?: boolean
      anchorEl?: HTMLElement | null
      spaceResourceId?: string | null
      consultantResourceId?: string | null
    },
  ) => {
    const preserveDraggedRange = !!options?.preserveDraggedRange
    const anchorEl = options?.anchorEl ?? null
    if (calendarMode === 'availability') {
      openAvailabilityModalFromSelection(start, end)
      return
    }
    if (calendarMode === 'spaces') {
      if (isNativeAndroid) return
      let preselectedSpaceId: number | null
      if (spaceFilterId != null) {
        preselectedSpaceId = spaceFilterId
      } else if (options?.spaceResourceId == null || options.spaceResourceId === SPACE_RESOURCE_UNASSIGNED_ID) {
        preselectedSpaceId = null
      } else {
        preselectedSpaceId = Number(options.spaceResourceId)
      }
      const selectionInfo = getBookableSelectionInfo(start, end)
      openBookingModal(
        start,
        end,
        selectionInfo.consultantId ?? consultantFilterId ?? user.id,
        preserveDraggedRange,
        preselectedSpaceId,
        undefined,
        !selectionInfo.isBookable,
        anchorEl,
        spacesUseResourceColumns ? options?.spaceResourceId : undefined,
      )
      return
    }
    if (calendarMode === 'bookings' && bookingsUseResourceColumns && options?.consultantResourceId != null) {
      const crid = options.consultantResourceId
      const resolvedConsultant =
        crid === CONSULTANT_RESOURCE_UNASSIGNED_ID ? user.id : Number(crid)
      openBookingModal(
        start,
        end,
        resolvedConsultant,
        preserveDraggedRange,
        undefined,
        undefined,
        false,
        anchorEl,
        crid,
      )
      return
    }
    if (!bookableEnabled) {
      openBookingModal(start, end, user.id, preserveDraggedRange, undefined, undefined, false, anchorEl)
      return
    }
    const selectionInfo = getBookableSelectionInfo(start, end)
    if (selectionInfo.isBookable) {
      openBookingModal(start, end, selectionInfo.consultantId ?? user.id, preserveDraggedRange, undefined, undefined, false, anchorEl)
      return
    }
    openBookingModal(start, end, user.id, preserveDraggedRange, undefined, undefined, true, anchorEl)
  }

  const handleCalendarSelectionFromUi = (
    start: string,
    end: string,
    preserveDraggedRange = false,
    resourceId?: string | null,
  ) => {
    if (isNativeAndroid) {
      const t = Date.now()
      if (t - androidSelectionAtRef.current < 450) return
      androidSelectionAtRef.current = t
      calendarRef.current?.getApi().unselect()
    }
    handleCalendarSelection(start, end, {
      preserveDraggedRange,
      spaceResourceId: spacesUseResourceColumns ? resourceId : undefined,
      consultantResourceId: bookingsUseResourceColumns ? resourceId : undefined,
    })
  }

  const findOverlappingSessionsForBooking = (start: string, end: string, consultantId: number | null, typeId?: number | null) => {
    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime()
    const requestedBusyEndMs = endMs + getTypeBreakMinutes(typeId) * 60000
    return (calendarData.booked || []).filter((b: any) => {
      if (b.consultant?.id !== consultantId) return false
      const bStart = new Date(b.startTime).getTime()
      const bEnd = getBookingBusyEndMs(b)
      return startMs < bEnd && requestedBusyEndMs > bStart
    })
  }

  const findOverlappingPersonalBlocksForBooking = (start: string, end: string, consultantId: number | null, breakMinutes = 0) => {
    if (!personalModuleEnabled) return []
    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime() + Math.max(0, Number(breakMinutes) || 0) * 60000
    return (calendarData.personal || []).filter((p: any) => {
      const ownerId = p.consultant?.id ?? p.consultantId ?? p.ownerId
      if (ownerId !== consultantId) return false
      const pStart = new Date(p.startTime).getTime()
      const pEnd = new Date(p.endTime).getTime()
      return startMs < pEnd && endMs > pStart
    })
  }

  const saveBooking = async (skipBookedOverlapCheck = false, skipNonBookableConfirm = false, skipPersonalOverlapConfirm = false) => {
    setSaveBookingError(null)
    if (form.personal && !personalModuleEnabled) {
      setForm((f: any) => ({ ...f, personal: false }))
      setSaveBookingError(t('calendarErrorPersonalModuleDisabled'))
      return
    }
    if (form.todo && !todosModuleEnabled) {
      setForm((f: any) => ({ ...f, todo: false }))
      setSaveBookingError(t('calendarErrorTodosModuleDisabled'))
      return
    }
    let resolvedClientIds: number[] = []
    let resolvedGroupId: number | null = form.groupId ?? null
    if (form.personal || form.todo) {
      if (!form.task?.trim()) {
        setSaveBookingError(t('calendarErrorEnterTaskName'))
        return
      }
    } else if (bookingGroupMode) {
      const typed = groupSearch.trim()
      /** When user types a full group name on save, setForm has not re-rendered yet — seed clients from this value. */
      let sessionClientsFromTypedGroup: number[] | null = null
      if (typed) {
        const exact = metaGroups.find(
          (g: any) => g.active !== false && (g.name || '').toLowerCase() === typed.toLowerCase(),
        )
        if (exact) {
          resolvedGroupId = exact.id
          const seedIds = (exact.members ?? []).map((m: any) => m.id).filter((id: number) => Number.isFinite(id) && id > 0)
          sessionClientsFromTypedGroup = seedIds.length > 0 ? [...seedIds] : []
          setForm((f: any) => ({
            ...f,
            groupId: exact.id,
            ...(seedIds.length > 0
              ? { clientIds: seedIds, clientId: seedIds[0] ?? null }
              : { clientIds: [], clientId: null }),
          }))
          setGroupSearch('')
          setEditingGroupSearch(false)
          setGroupDropdownOpen(false)
        } else {
          try {
            const created = await postGroupFromTypedName(typed)
            resolvedGroupId = created.id
            sessionClientsFromTypedGroup = []
            setForm((f: any) => ({ ...f, groupId: created.id, clientIds: [], clientId: null }))
            setGroupSearch('')
            setEditingGroupSearch(false)
            setGroupDropdownOpen(false)
          } catch (e: any) {
            setSaveBookingError(e?.response?.data?.message || e?.message || 'Failed to create group.')
            setEditingGroupSearch(true)
            setGroupDropdownOpen(true)
            return
          }
        }
      }
      if (resolvedGroupId == null) {
        setSaveBookingError(t('calendarErrorSelectGroup'))
        setEditingGroupSearch(true)
        setGroupDropdownOpen(true)
        return
      }
      resolvedClientIds =
        sessionClientsFromTypedGroup !== null ? [...sessionClientsFromTypedGroup] : [...selectedFormClientIds]
      if (resolvedClientIds.length === 0) {
        const g = metaGroups.find((x: any) => x.id === resolvedGroupId)
        const fromGroup = (g?.members ?? []).map((m: any) => m.id).filter((id: number) => Number.isFinite(id) && id > 0)
        resolvedClientIds = fromGroup
        if (resolvedClientIds.length > 0) {
          setForm((f: any) => ({
            ...f,
            clientIds: resolvedClientIds,
            clientId: resolvedClientIds[0] ?? null,
          }))
        }
      }
    } else {
      resolvedClientIds = [...selectedFormClientIds]
      const typed = clientSearch.trim()
      if (typed) {
        const exact = metaClients.find(
          (c: any) => c.active !== false && fullName(c).toLowerCase() === typed.toLowerCase(),
        )
        if (exact) {
          resolvedClientIds = multipleClientsPerSessionEnabled
            ? Array.from(new Set([...resolvedClientIds, exact.id]))
            : [exact.id]
          setForm((f: any) => ({ ...f, clientId: exact.id, clientIds: resolvedClientIds }))
          setClientSearch('')
          setEditingClientSearch(false)
          setClientDropdownOpen(false)
        } else {
          try {
            const created = await postClientFromTypedName(typed, form.consultantId ?? undefined)
            resolvedClientIds = multipleClientsPerSessionEnabled
              ? Array.from(new Set([...resolvedClientIds, created.id]))
              : [created.id]
            setForm((f: any) => ({ ...f, clientId: created.id, clientIds: resolvedClientIds }))
            setClientSearch('')
            setEditingClientSearch(false)
            setClientDropdownOpen(false)
          } catch (e: any) {
            setSaveBookingError(e?.response?.data?.message || e?.message || 'Failed to create client.')
            setEditingClientSearch(true)
            setClientDropdownOpen(true)
            return
          }
        }
      }
      if (resolvedClientIds.length === 0) {
        setSaveBookingError(t('calendarErrorSelectClient'))
        setEditingClientSearch(true)
        setClientDropdownOpen(true)
        return
      }
    }
    if (!form.personal && !form.todo && form.online && form.consultantId === user.id) {
      const provider = form.meetingProvider || 'zoom'
      const needsConnect = provider === 'google' ? googleConnected === false : zoomConnected === false
      if (needsConnect) {
        const groupPending = bookingGroupMode && resolvedGroupId != null
        sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify({
          clientId: resolvedClientIds[0] ?? null,
          clientIds: resolvedClientIds,
          groupId: groupPending ? resolvedGroupId : null,
          consultantId: form.consultantId,
          startTime: form.startTime,
          endTime: form.endTime,
          spaceId: form.spaceId ?? null,
          typeId: form.typeId ?? null,
          notes: form.notes ?? '',
          meetingProvider: provider,
        }))
        if (provider === 'google') connectGoogle()
        else connectZoom()
        return
      }
    }
    if (!form.personal && !form.todo) {
      const typeMaxParticipants = getTypeMaxParticipants(form.typeId)
      if (typeMaxParticipants != null && resolvedClientIds.length > typeMaxParticipants) {
        setSaveBookingError(`This service type allows at most ${typeMaxParticipants} participants per session.`)
        return
      }
    }
    if (!form.personal && !form.todo && form.outsideBookable && !skipNonBookableConfirm) {
      setSelection(null)
      setClientDropdownOpen(false)
      setEditingClientSearch(false)
      calendarRef.current?.getApi()?.unselect()
      setConfirmNonBookable({})
      return
    }
    if (!form.personal && !form.todo) {
      if (!skipPersonalOverlapConfirm) {
        const overlappingPersonal = findOverlappingPersonalBlocksForBooking(
          form.startTime,
          form.endTime,
          form.consultantId,
          getTypeBreakMinutes(form.typeId),
        )
        if (overlappingPersonal.length > 0) {
          setConfirmBookedPersonalOverlap({ type: 'create' })
          return
        }
      }
      if (!skipBookedOverlapCheck) {
        const overlapping = findOverlappingSessionsForBooking(form.startTime, form.endTime, form.consultantId, form.typeId)
        if (overlapping.length > 0) {
          setConfirmOverlap({ overlapping, start: form.startTime, end: form.endTime })
          return
        }
      }
    }
    setSaveBookingLoading(true)
    try {
      if (form.todo) {
        await api.post('/bookings/todos', {
          startTime: form.startTime,
          task: form.task.trim(),
          notes: form.notes || '',
        })
      } else if (form.personal) {
        await api.post('/bookings/personal-blocks', {
          consultantId: form.consultantId ?? user.id,
          startTime: form.startTime,
          endTime: form.endTime,
          task: form.task.trim(),
          notes: form.notes || '',
        })
      } else {
        if (confirmOverlap) {
          for (const b of confirmOverlap.overlapping) {
            await api.delete(`/bookings/${b.id}`)
          }
          setConfirmOverlap(null)
        }
        const groupBookingNoClients =
          bookingGroupMode && resolvedGroupId != null && resolvedClientIds.length === 0
        const bookingPayloadBase = {
          ...(groupBookingNoClients
            ? { clientIds: [] as number[] }
            : { clientId: resolvedClientIds[0]!, clientIds: resolvedClientIds }),
          groupId: bookingGroupMode && resolvedGroupId != null ? resolvedGroupId : undefined,
          consultantId: form.consultantId,
          spaceId: form.spaceId ?? null,
          typeId: form.typeId ?? null,
          notes: form.notes ?? '',
          meetingLink: form.meetingLink ?? null,
          online: form.online ?? false,
          meetingProvider: form.meetingProvider || 'zoom',
          groupEmailOverride: null,
          groupBillingCompanyIdOverride: null,
          ...(skipPersonalOverlapConfirm ? { allowPersonalBlockOverlap: true } : {}),
        }
        const bookingDates: Array<{ startTime: string; endTime: string }> = []
        if (form.repeats) {
          const baseStart = new Date(form.startTime)
          const baseEnd = new Date(form.endTime)
          const durationMs = baseEnd.getTime() - baseStart.getTime()
          const repeatInterval = form.repeatInterval ?? 1
          const repeatUnit = form.repeatUnit ?? 'weeks'
          const repeatEndType = form.repeatEndType ?? 'after'
          const repeatEndCount = form.repeatEndCount ?? 5
          const repeatEndDate = form.repeatEndDate ?? ''
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          const targetDayIndex = repeatUnit === 'weeks' ? dayNames.indexOf(form.repeatDay ?? dayNames[baseStart.getDay()]) : -1

          const maxOccurrences = repeatEndType === 'after' ? repeatEndCount : 200
          const endDateMs = repeatEndType === 'on' && repeatEndDate ? new Date(repeatEndDate + 'T23:59:59').getTime() : Infinity

          let cursor = new Date(baseStart)
          // If weekly, adjust first occurrence to the target day
          if (repeatUnit === 'weeks' && targetDayIndex >= 0 && cursor.getDay() !== targetDayIndex) {
            let diff = targetDayIndex - cursor.getDay()
            if (diff < 0) diff += 7
            cursor.setDate(cursor.getDate() + diff)
          }
          for (let i = 0; i < maxOccurrences && cursor.getTime() <= endDateMs; i++) {
            const s = new Date(cursor)
            const e = new Date(s.getTime() + durationMs)
            bookingDates.push({
              startTime: toLocalDateTimeString(s),
              endTime: toLocalDateTimeString(e),
            })
            // Advance cursor
            if (repeatUnit === 'days') {
              cursor.setDate(cursor.getDate() + repeatInterval)
            } else if (repeatUnit === 'weeks') {
              cursor.setDate(cursor.getDate() + 7 * repeatInterval)
            } else if (repeatUnit === 'months') {
              cursor.setMonth(cursor.getMonth() + repeatInterval)
            }
          }
        } else {
          bookingDates.push({ startTime: form.startTime, endTime: form.endTime })
        }
        for (const dt of bookingDates) {
          await api.post('/bookings', {
            ...bookingPayloadBase,
            startTime: dt.startTime,
            endTime: dt.endTime,
          }, {
            headers: { 'X-Skip-Conflict-Toast': 'true' },
          })
        }
      }
      // Keep the booking form open (with saving state) until calendar data refreshes,
      // so users see the new booking immediately after the modal closes.
      await load()
      setSelection(null)
      setConfirmNonBookable(null)
      setEditingClientSearch(false)
      setEditingGroupSearch(false)
      calendarRef.current?.getApi()?.unselect()
      window.dispatchEvent(new Event('todos-updated'))
      leaveCompactFormRouteIfNeeded()
    } catch (e: any) {
      const data = e?.response?.data
      const msg = (data?.message ?? data?.error ?? e?.message) || 'Failed to book session.'
      setSaveBookingError(String(msg))
    } finally {
      setSaveBookingLoading(false)
    }
  }

  const deleteBookedSession = async () => {
    if (!selectedBookedSession?.id) return
    await api.delete(`/bookings/${selectedBookedSession.id}`)
    setSelectedBookedSession(null)
    setConfirmDelete(false)
    setCalendarGroupDetailId(null)
    setCalendarGroupDetailBookingId(null)
    load()
    leaveCompactFormRouteIfNeeded()
  }

  const closeBookedModal = () => {
    setSelectedBookedSession(null)
    setConfirmDelete(false)
    setCalendarGroupDetailId(null)
    setCalendarGroupDetailBookingId(null)
    leaveCompactFormRouteIfNeeded()
  }

  const closePersonalModal = () => {
    setSelectedPersonalBlock(null)
    leaveCompactFormRouteIfNeeded()
  }

  useEffect(() => {
    if (useBookingSidePanel) return
    const hasPopup = !!(selection || selectedBookedSession || selectedPersonalBlock || selectedTodo || availabilitySelection)
    if (!hasPopup) {
      sessionPopupAnchorRectRef.current = null
      return
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && sessionPopupRef.current?.contains(target)) return
      // Don't close the booking form while the meeting provider picker is open
      if (target && target.closest('.meeting-provider-picker-backdrop')) return
      // Nested modals (new client, overlap / personal confirm) sit outside sessionPopupRef
      if (target && target.closest('.calendar-booking-supplement')) return
      if (target && target.closest('.calendar-client-detail-backdrop')) return
      if (target && target.closest('.calendar-group-detail-backdrop')) return
      // Check if the click is on the calendar's selectable time grid area.
      // If so, just close the popup React state — do NOT call unselect() because
      // FullCalendar will handle creating a new selection from this same mousedown.
      const isOnCalendarGrid = !!(target && (
        target.closest('.fc-timegrid-slots') ||
        target.closest('.fc-timegrid-cols') ||
        target.closest('.fc-timegrid-slot') ||
        target.closest('.fc-timegrid-body') ||
        target.closest('.fc-daygrid-body') ||
        target.closest('.fc-scrollgrid-sync-table')
      ))
      if (isOnCalendarGrid) {
        suppressNextCalendarSelectionRef.current = true
        // Keep blocking until after FullCalendar runs select + dateClick for this gesture
        // (select was clearing the flag too early, so dateClick still opened a new session).
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            suppressNextCalendarSelectionRef.current = false
          })
        })
      }
      setConfirmDelete(false)
      setSelectedBookedSession(null)
      setSelectedPersonalBlock(null)
      setSelectedTodo(null)
      setAvailabilitySelection(null)
      setAvailabilityIntent('add')
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setSelection(null)
      setClientDropdownOpen(false)
      setEditingClientSearch(false)
      setCalendarGroupDetailId(null)
      setCalendarGroupDetailBookingId(null)
      if (!isOnCalendarGrid) {
        calendarRef.current?.getApi()?.unselect()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (calendarGroupDetailId != null) {
        setCalendarGroupDetailId(null)
        setCalendarGroupDetailBookingId(null)
        return
      }
      if (calendarClientDetailId != null) {
        setCalendarClientDetailId(null)
        setCalendarClientDetailRestrictLifecycle(false)
        return
      }
      if (showAddGroupModal) {
        setShowAddGroupModal(false)
        return
      }
      if (showAddClientModal) {
        setShowAddClientModal(false)
        return
      }
      setConfirmDelete(false)
      setSelectedBookedSession(null)
      setSelectedPersonalBlock(null)
      setSelectedTodo(null)
      setAvailabilitySelection(null)
      setAvailabilityIntent('add')
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setSelection(null)
      setClientDropdownOpen(false)
      setEditingClientSearch(false)
      setCalendarGroupDetailId(null)
      setCalendarGroupDetailBookingId(null)
      calendarRef.current?.getApi()?.unselect()
    }
    const onResize = () => {
      setSessionPopupPosition(getSessionPopupPosition())
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [useBookingSidePanel, selection, selectedBookedSession, selectedPersonalBlock, selectedTodo, availabilitySelection, showAddClientModal, showAddGroupModal, calendarClientDetailId, calendarGroupDetailId])

  // Re-select the calendar highlight when form start/end changes (user edits datetime inputs)
  useEffect(() => {
    if (useBookingSidePanel || !selection || !form) return
    const api = calendarRef.current?.getApi()
    if (!api) return
    const formStart = form.startTime
    const formEnd = form.endTime
    if (!formStart || !formEnd) return
    // Only re-select if form times differ from selection state (user edited the inputs)
    if (formStart !== selection.start || formEnd !== selection.end) {
      const rid = selection.resourceId
      setSelection({ ...selection, start: formStart, end: formEnd })
      try {
        ignoreNextSelectionRef.current = true
        if (
          rid != null &&
          (bookingsUseResourceColumns || spacesUseResourceColumns) &&
          typeof (api as any).select === 'function'
        ) {
          ;(api as any).select({ start: new Date(formStart), end: new Date(formEnd), resourceId: rid })
        } else {
          api.select(new Date(formStart), new Date(formEnd))
        }
      } catch {
        ignoreNextSelectionRef.current = false
      }
    }
  }, [useBookingSidePanel, form?.startTime, form?.endTime, bookingsUseResourceColumns, spacesUseResourceColumns]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateBookedSession = async (skipPersonalOverlapConfirm = false, allowPersonalBlockOverlap = false) => {
    if (!selectedBookedSession?.id) return
    let resolvedClientIds = [...selectedBookedClientIds]
    const typed = bookedClientSearch.trim()
    if (typed) {
      const exact = metaClients.find(
        (c: any) => c.active !== false && fullName(c).toLowerCase() === typed.toLowerCase(),
      )
      if (exact) {
        resolvedClientIds = multipleClientsPerSessionEnabled
          ? Array.from(new Set([...resolvedClientIds, exact.id]))
          : [exact.id]
        setSelectedBookedSession((prev: any) => prev ? {
          ...prev,
          client: exact,
          clients: resolvedClientIds
            .map((id) => metaClients.find((c: any) => c.id === id) || prev.clients?.find((c: any) => c.id === id) || null)
            .filter(Boolean),
        } : prev)
        setBookedClientSearch('')
        setEditingBookedClientSearch(false)
      } else {
        try {
          const created = await postClientFromTypedName(typed, selectedBookedSession.consultant?.id ?? form.consultantId ?? undefined)
          resolvedClientIds = multipleClientsPerSessionEnabled
            ? Array.from(new Set([...resolvedClientIds, created.id]))
            : [created.id]
          setSelectedBookedSession((s: any) => (s ? {
            ...s,
            client: created,
            clients: resolvedClientIds
              .map((id) => (id === created.id ? created : metaClients.find((c: any) => c.id === id) || s.clients?.find((c: any) => c.id === id) || null))
              .filter(Boolean),
          } : s))
          setBookedClientSearch('')
          setEditingBookedClientSearch(false)
          setBookedClientDropdownOpen(false)
        } catch (e: any) {
          showToast('error', e?.response?.data?.message || e?.message || 'Failed to create client.')
          return
        }
      }
    }
    const bookedIsGroupSession = Number.isFinite(selectedBookedSession.groupId) && selectedBookedSession.groupId > 0
    if (resolvedClientIds.length === 0 && !bookedIsGroupSession) return
    const consultantId = selectedBookedSession.consultant?.id
    if (
      !skipPersonalOverlapConfirm &&
      Number.isFinite(consultantId) &&
      findOverlappingPersonalBlocksForBooking(
        selectedBookedSession.startTime,
        selectedBookedSession.endTime,
        consultantId,
        getTypeBreakMinutes(selectedBookedSession.type?.id),
      ).length > 0
    ) {
      setConfirmBookedPersonalOverlap({ type: 'edit' })
      return
    }
    const online = !!selectedBookedSession.online
    const bookedPayloadClients =
      bookedIsGroupSession && resolvedClientIds.length === 0
        ? { clientIds: [] as number[] }
        : { clientId: resolvedClientIds[0], clientIds: resolvedClientIds }
    await api.put(`/bookings/${selectedBookedSession.id}`, {
      ...bookedPayloadClients,
      consultantId: selectedBookedSession.consultant?.id ?? null,
      startTime: selectedBookedSession.startTime,
      endTime: selectedBookedSession.endTime,
      spaceId: selectedBookedSession.space?.id ?? null,
      typeId: selectedBookedSession.type?.id ?? null,
      notes: selectedBookedSession.notes ?? '',
      meetingLink: online ? (selectedBookedSession.meetingLink ?? null) : null,
      online,
      meetingProvider: online ? (selectedBookedSession.meetingProvider || 'zoom') : null,
      groupEmailOverride: null,
      groupBillingCompanyIdOverride: null,
      ...(allowPersonalBlockOverlap ? { allowPersonalBlockOverlap: true } : {}),
    })
    // Create repeated future bookings if repeats is enabled
    if (selectedBookedSession.repeats) {
      const baseStart = new Date(selectedBookedSession.startTime)
      const baseEnd = new Date(selectedBookedSession.endTime)
      const durationMs = baseEnd.getTime() - baseStart.getTime()
      const repeatInterval = selectedBookedSession.repeatInterval ?? 1
      const repeatUnit = selectedBookedSession.repeatUnit ?? 'weeks'
      const repeatEndType = selectedBookedSession.repeatEndType ?? 'after'
      const repeatEndCount = selectedBookedSession.repeatEndCount ?? 5
      const repeatEndDate = selectedBookedSession.repeatEndDate ?? ''
      const dayNamesArr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const targetDayIndex = repeatUnit === 'weeks' ? dayNamesArr.indexOf(selectedBookedSession.repeatDay ?? dayNamesArr[baseStart.getDay()]) : -1

      const maxOccurrences = repeatEndType === 'after' ? repeatEndCount : 200
      const endDateMs = repeatEndType === 'on' && repeatEndDate ? new Date(repeatEndDate + 'T23:59:59').getTime() : Infinity

      let cursor = new Date(baseStart)
      if (repeatUnit === 'weeks' && targetDayIndex >= 0 && cursor.getDay() !== targetDayIndex) {
        let diff = targetDayIndex - cursor.getDay()
        if (diff < 0) diff += 7
        cursor.setDate(cursor.getDate() + diff)
      }
      // Skip the first occurrence (that's the current session being edited)
      if (repeatUnit === 'days') cursor.setDate(cursor.getDate() + repeatInterval)
      else if (repeatUnit === 'weeks') cursor.setDate(cursor.getDate() + 7 * repeatInterval)
      else if (repeatUnit === 'months') cursor.setMonth(cursor.getMonth() + repeatInterval)

      for (let i = 1; i < maxOccurrences && cursor.getTime() <= endDateMs; i++) {
        const s = new Date(cursor)
        const e = new Date(s.getTime() + durationMs)
        try {
          await api.post('/bookings', {
            ...bookedPayloadClients,
            ...(bookedIsGroupSession ? { groupId: selectedBookedSession.groupId } : {}),
            consultantId: selectedBookedSession.consultant?.id ?? null,
            startTime: toLocalDateTimeString(s),
            endTime: toLocalDateTimeString(e),
            spaceId: selectedBookedSession.space?.id ?? null,
            typeId: selectedBookedSession.type?.id ?? null,
            notes: selectedBookedSession.notes ?? '',
            meetingLink: online ? (selectedBookedSession.meetingLink ?? null) : null,
            online,
            meetingProvider: online ? (selectedBookedSession.meetingProvider || 'zoom') : null,
            groupEmailOverride: null,
            groupBillingCompanyIdOverride: null,
          }, { headers: { 'X-Skip-Conflict-Toast': 'true' } })
        } catch { /* skip failed occurrences */ }
        if (repeatUnit === 'days') cursor.setDate(cursor.getDate() + repeatInterval)
        else if (repeatUnit === 'weeks') cursor.setDate(cursor.getDate() + 7 * repeatInterval)
        else if (repeatUnit === 'months') cursor.setMonth(cursor.getMonth() + repeatInterval)
      }
    }
    setSelectedBookedSession(null)
    load()
    leaveCompactFormRouteIfNeeded()
  }

  const saveCalendarGroupSessionOverrides = async (payload: {
    groupEmailOverride: string
    groupBillingCompanyIdOverride: number
  }) => {
    if (!selectedBookedSession?.id) return
    const resolvedClientIds = [...selectedBookedClientIds]
    const overridesGroupSession = Number.isFinite(selectedBookedSession.groupId) && selectedBookedSession.groupId > 0
    if (resolvedClientIds.length === 0 && !overridesGroupSession) return
    const online = !!selectedBookedSession.online
    const overridesPayloadClients =
      overridesGroupSession && resolvedClientIds.length === 0
        ? { clientIds: [] as number[] }
        : { clientId: resolvedClientIds[0], clientIds: resolvedClientIds }
    try {
      const { data } = await api.put(`/bookings/${selectedBookedSession.id}`, {
        ...overridesPayloadClients,
        consultantId: selectedBookedSession.consultant?.id ?? null,
        startTime: selectedBookedSession.startTime,
        endTime: selectedBookedSession.endTime,
        spaceId: selectedBookedSession.space?.id ?? null,
        typeId: selectedBookedSession.type?.id ?? null,
        notes: selectedBookedSession.notes ?? '',
        meetingLink: online ? (selectedBookedSession.meetingLink ?? null) : null,
        online,
        meetingProvider: online ? (selectedBookedSession.meetingProvider || 'zoom') : null,
        groupEmailOverride: payload.groupEmailOverride,
        groupBillingCompanyIdOverride: payload.groupBillingCompanyIdOverride,
      })
      const bid = selectedBookedSession.id
      setSelectedBookedSession((prev: any) =>
        prev && prev.id === bid
          ? {
              ...prev,
              sessionGroupEmailOverride: data.sessionGroupEmailOverride,
              sessionGroupBillingCompany: data.sessionGroupBillingCompany,
            }
          : prev,
      )
      await load()
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || e?.message || 'Failed to save.')
    }
  }

  const calendarGroupSessionMembers = useMemo((): any[] | null => {
    if (calendarGroupDetailId == null) return null
    const isNewBookingFlow = !!selection && !form.personal && !form.todo
    if (isNewBookingFlow && form.groupId === calendarGroupDetailId) {
      return selectedFormClientIds
        .map((id) => metaClients.find((c: any) => c.id === id))
        .filter(Boolean)
    }
    const editingBookedGroup =
      !isNewBookingFlow &&
      calendarGroupDetailBookingId != null &&
      selectedBookedSession?.id === calendarGroupDetailBookingId &&
      selectedBookedSession?.groupId === calendarGroupDetailId
    if (editingBookedGroup) {
      const raw = Array.isArray(selectedBookedSession.clients) && selectedBookedSession.clients.length > 0
        ? selectedBookedSession.clients
        : selectedBookedSession.client
          ? [selectedBookedSession.client]
          : []
      return raw.filter(Boolean)
    }
    if (form.groupId === calendarGroupDetailId) {
      return selectedFormClientIds
        .map((id) => metaClients.find((c: any) => c.id === id))
        .filter(Boolean)
    }
    return []
  }, [
    calendarGroupDetailId,
    calendarGroupDetailBookingId,
    selectedBookedSession,
    form.groupId,
    form.personal,
    form.todo,
    selection,
    selectedFormClientIds,
    metaClients,
  ])

  const persistCalendarGroupSessionMembers = useCallback(
    async (clientIds: number[]) => {
      const normalized = normalizeSelectedClientIds(clientIds)
      const isNewBookingFlow = !!selection && !form.personal && !form.todo
      if (isNewBookingFlow && form.groupId === calendarGroupDetailId) {
        applyFormClientIds(normalized)
        return
      }
      const editingBookedGroup =
        !isNewBookingFlow &&
        calendarGroupDetailBookingId != null &&
        selectedBookedSession?.id === calendarGroupDetailBookingId &&
        selectedBookedSession?.groupId === calendarGroupDetailId
      if (editingBookedGroup && selectedBookedSession?.id) {
        applyBookedSessionClientIds(normalized)
        const online = !!selectedBookedSession.online
        const memberPayloadClients =
          normalized.length === 0 ? { clientIds: [] as number[] } : { clientId: normalized[0], clientIds: normalized }
        try {
          await api.put(`/bookings/${selectedBookedSession.id}`, {
            ...memberPayloadClients,
            consultantId: selectedBookedSession.consultant?.id ?? null,
            startTime: selectedBookedSession.startTime,
            endTime: selectedBookedSession.endTime,
            spaceId: selectedBookedSession.space?.id ?? null,
            typeId: selectedBookedSession.type?.id ?? null,
            notes: selectedBookedSession.notes ?? '',
            meetingLink: online ? (selectedBookedSession.meetingLink ?? null) : null,
            online,
            meetingProvider: online ? (selectedBookedSession.meetingProvider || 'zoom') : null,
            groupEmailOverride: null,
            groupBillingCompanyIdOverride: null,
          })
          await load()
        } catch (e: any) {
          showToast('error', e?.response?.data?.message || e?.message || 'Failed to save.')
          await load()
        }
      } else if (form.groupId === calendarGroupDetailId) {
        applyFormClientIds(normalized)
      }
    },
    [
      calendarGroupDetailBookingId,
      selectedBookedSession,
      calendarGroupDetailId,
      form.groupId,
      form.personal,
      form.todo,
      selection,
      applyBookedSessionClientIds,
      applyFormClientIds,
      load,
      showToast,
      locale,
    ],
  )

  const updatePersonalBlock = async () => {
    if (!selectedPersonalBlock?.id) return
    if (!personalModuleEnabled) {
      setSelectedPersonalBlock(null)
      showToast('error', t('calendarErrorPersonalModuleDisabled'))
      return
    }
    await api.put(`/bookings/personal-blocks/${selectedPersonalBlock.id}`, {
      startTime: selectedPersonalBlock.startTime,
      endTime: selectedPersonalBlock.endTime,
      task: selectedPersonalBlock.task,
      notes: selectedPersonalBlock.notes || '',
    })
    setSelectedPersonalBlock(null)
    load()
    leaveCompactFormRouteIfNeeded()
  }

  const deletePersonalBlock = async () => {
    if (!selectedPersonalBlock?.id) return
    if (!personalModuleEnabled) {
      setSelectedPersonalBlock(null)
      return
    }
    await api.delete(`/bookings/personal-blocks/${selectedPersonalBlock.id}`)
    setSelectedPersonalBlock(null)
    load()
    leaveCompactFormRouteIfNeeded()
  }

  const closeTodoModal = () => {
    setSelectedTodo(null)
    leaveCompactFormRouteIfNeeded()
  }
  const updateTodo = async () => {
    if (!selectedTodo?.id) return
    if (!todosModuleEnabled) {
      setSelectedTodo(null)
      showToast('error', t('calendarErrorTodosModuleDisabled'))
      return
    }
    await api.put(`/bookings/todos/${selectedTodo.id}`, {
      startTime: selectedTodo.startTime,
      task: selectedTodo.task,
      notes: selectedTodo.notes || '',
    })
    setSelectedTodo(null)
    load()
    window.dispatchEvent(new Event('todos-updated'))
    leaveCompactFormRouteIfNeeded()
  }
  const deleteTodo = async () => {
    if (!selectedTodo?.id) return
    if (!todosModuleEnabled) {
      setSelectedTodo(null)
      return
    }
    await api.delete(`/bookings/todos/${selectedTodo.id}`)
    setSelectedTodo(null)
    load()
    window.dispatchEvent(new Event('todos-updated'))
    leaveCompactFormRouteIfNeeded()
  }

  /** When moving across consultant columns, pass targetConsultantId (null = unassigned) so overlaps match the destination pool. */
  const findOverlappingBooked = (
    newStart: Date,
    newEnd: Date,
    excludeId: number,
    targetConsultantId?: number | null,
    draggedBreakMinutes = 0,
  ) => {
    const bookedList = calendarData.booked || []
    const dragged = bookedList.find((b: any) => b.id === excludeId)
    const sourceCid = dragged?.consultant?.id ?? null
    const effectiveCid = targetConsultantId !== undefined ? targetConsultantId : sourceCid

    const booked =
      effectiveCid == null
        ? bookedList.filter((b: any) => !b.consultant?.id)
        : bookedList.filter((b: any) => b.consultant?.id === effectiveCid)

    const draggedBusyEndMs = newEnd.getTime() + Math.max(0, Number(draggedBreakMinutes) || 0) * 60000
    return booked.find((b: any) => {
      if (b.id === excludeId) return false
      const bStartMs = new Date(b.startTime).getTime()
      const bEndMs = getBookingBusyEndMs(b)
      return newStart.getTime() < bEndMs && draggedBusyEndMs > bStartMs
    })
  }

  const performMove = async (
    booking: any,
    newStartStr: string,
    newEndStr: string,
    allowPersonalBlockOverlap = false,
    spaceIdOverride?: number | null,
    consultantIdOverride?: number | null,
  ) => {
    const online = Boolean(
      booking.online ?? (booking.meetingLink != null && String(booking.meetingLink).trim() !== ''),
    )
    const resolvedSpaceId = spaceIdOverride !== undefined ? spaceIdOverride : (booking.space?.id ?? null)
    let resolvedConsultantId = consultantIdOverride !== undefined ? consultantIdOverride : (booking.consultant?.id ?? null)
    if (typeof resolvedConsultantId === 'number' && !Number.isFinite(resolvedConsultantId)) {
      resolvedConsultantId = booking.consultant?.id ?? null
    }
    await api.put(`/bookings/${booking.id}`, {
      clientId: (booking.clients?.[0]?.id ?? booking.client?.id),
      clientIds: (booking.clients || []).map((c: any) => c.id),
      consultantId: resolvedConsultantId,
      startTime: newStartStr,
      endTime: newEndStr,
      spaceId: resolvedSpaceId,
      typeId: booking.type?.id ?? null,
      notes: booking.notes ?? '',
      meetingLink: online ? (booking.meetingLink ?? null) : null,
      online,
      meetingProvider: online ? (booking.meetingProvider || 'zoom') : null,
      groupEmailOverride: null,
      groupBillingCompanyIdOverride: null,
      ...(allowPersonalBlockOverlap ? { allowPersonalBlockOverlap: true } : {}),
    })
  }

  const performMovePersonal = async (block: any, newStartStr: string, newEndStr: string) => {
    if (!personalModuleEnabled) throw new Error('PERSONAL_MODULE_DISABLED')
    await api.put(`/bookings/personal-blocks/${block.id}`, {
      startTime: newStartStr,
      endTime: newEndStr,
      task: block.task,
      notes: block.notes || '',
    })
  }

  const performMoveTodo = async (todo: any, newStartStr: string) => {
    if (!todosModuleEnabled) throw new Error('TODOS_MODULE_DISABLED')
    await api.put(`/bookings/todos/${todo.id}`, {
      startTime: newStartStr,
      task: todo.task,
      notes: todo.notes || '',
    })
  }

  const isHttpConflict = (err: any) => Number(err?.response?.status) === 409

  const handleEventDrop = async (info: any) => {
    isDraggingEventRef.current = false
    dragEdgeSideRef.current = 0
    calendarSwipeStartRef.current = null
    const props = info.event.extendedProps
    const newStart = info.event.start!
    const newStartStr = toLocalDateTimeString(newStart)

    // Extract resource change info early so all checks below can use the TARGET resource
    const rawResourceId = info.newResource?.id ?? info.event.getResources?.()[0]?.id
    const newResourceId =
      rawResourceId !== undefined && rawResourceId !== null ? String(rawResourceId) : undefined

    const spaceIdOverride =
      spacesUseResourceColumns && newResourceId !== undefined
        ? newResourceId === SPACE_RESOURCE_UNASSIGNED_ID
          ? null
          : (() => {
              const n = Number(newResourceId)
              return Number.isFinite(n) ? n : undefined
            })()
        : undefined
    const consultantIdOverride: number | null | undefined =
      bookingsUseResourceColumns && newResourceId !== undefined
        ? newResourceId === CONSULTANT_RESOURCE_UNASSIGNED_ID
          ? null
          : (() => {
              const n = Number(newResourceId)
              return Number.isFinite(n) ? n : undefined
            })()
        : undefined

    if (props.kind === 'personal') {
      if (!personalModuleEnabled) {
        info.revert()
        return
      }
      const newEnd = info.event.end || new Date(newStart.getTime() + 60 * 60000)
      const newEndStr = toLocalDateTimeString(newEnd)
      setCalendarData((prev: any) => ({ ...prev, personal: (prev.personal || []).map((p: any) => p.id === props.id ? { ...p, startTime: newStartStr, endTime: newEndStr } : p) }))
      if (selectedPersonalBlock?.id === props.id) setSelectedPersonalBlock({ ...selectedPersonalBlock, startTime: newStartStr, endTime: newEndStr })
      cleanupDragArtifacts()
      try {
        await performMovePersonal(props, newStartStr, newEndStr)
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({ ...prev, personal: (prev.personal || []).map((p: any) => p.id === props.id ? { ...p, startTime: props.startTime, endTime: props.endTime } : p) }))
        info.revert()
      }
      return
    }

    if (props.kind === 'todo') {
      if (!todosModuleEnabled) {
        info.revert()
        return
      }
      const newEnd = info.event.end || new Date(newStart.getTime() + 30 * 60 * 1000)
      const newEndStr = toLocalDateTimeString(newEnd)
      setCalendarData((prev: any) => ({
        ...prev,
        todos: (prev.todos || []).map((t: any) =>
          t.id === props.id ? { ...t, startTime: newStartStr, endTime: newEndStr } : t,
        ),
      }))
      setSelectedTodo((st: any) =>
        st?.id === props.id ? { ...st, startTime: newStartStr, endTime: newEndStr } : st,
      )
      cleanupDragArtifacts()
      try {
        await performMoveTodo(props, newStartStr)
        window.dispatchEvent(new Event('todos-updated'))
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({
          ...prev,
          todos: (prev.todos || []).map((t: any) =>
            t.id === props.id ? { ...t, startTime: props.startTime, endTime: props.endTime } : t,
          ),
        }))
        setSelectedTodo((st: any) =>
          st?.id === props.id ? { ...st, startTime: props.startTime, endTime: props.endTime } : st,
        )
        info.revert()
      }
      return
    }

    if (props.kind !== 'booked') return

    const typeDuration = props.type?.durationMinutes ?? fallbackSessionLengthMinutes ?? 60
    const newEnd = info.event.end || new Date(newStart.getTime() + Number(typeDuration) * 60000)
    const newEndStr = toLocalDateTimeString(newEnd)

    const typeBreakMinutes = props.type?.breakMinutes ?? getTypeBreakMinutes(props.type?.id)
    const overlapping = findOverlappingBooked(newStart, newEnd, props.id, consultantIdOverride, typeBreakMinutes)
    if (overlapping) {
      cleanupDragArtifacts()
      setConfirmSwap({ dragged: props, target: overlapping, revert: info.revert })
      return
    }

    const targetConsultantId = consultantIdOverride !== undefined ? consultantIdOverride : (props.consultant?.id ?? null)

    if (
      targetConsultantId != null &&
      Number.isFinite(targetConsultantId) &&
      findOverlappingPersonalBlocksForBooking(newStartStr, newEndStr, targetConsultantId, typeBreakMinutes).length > 0
    ) {
      cleanupDragArtifacts()
      info.revert()
      setConfirmBookedPersonalOverlap({ type: 'move', booking: props, newStartStr, newEndStr, spaceIdOverride, consultantIdOverride })
      return
    }

    if (targetConsultantId != null && !isBookedMoveIntervalBookable(newStartStr, newEndStr, targetConsultantId, typeBreakMinutes)) {
      cleanupDragArtifacts()
      info.revert()
      setConfirmNonBookableMove({
        booking: props,
        newStartStr,
        newEndStr,
        spaceIdOverride,
        consultantIdOverride,
        allowPersonalBlockOverlap: true,
      })
      return
    }

    const mapBookingAfterDrop = (b: any) => {
      if (b.id !== props.id) return b
      let next = { ...b, startTime: newStartStr, endTime: newEndStr }
      if (spaceIdOverride !== undefined) {
        const sid = spaceIdOverride
        const spaceObj =
          sid == null ? null : (metaSpaces).find((s: any) => s.id === sid) ?? { id: sid, name: '' }
        next = { ...next, space: spaceObj }
      }
      if (consultantIdOverride !== undefined) {
        const consultantObj = consultantIdOverride == null
          ? null
          : metaUsers.find((u: any) => u.id === consultantIdOverride) ?? { id: consultantIdOverride, firstName: '', lastName: '' }
        next = { ...next, consultant: consultantObj }
      }
      return next
    }

    setCalendarData((prev: any) => ({
      ...prev,
      booked: (prev.booked || []).map((b: any) => mapBookingAfterDrop(b)),
    }))
    cleanupDragArtifacts()
    try {
      await performMove(props, newStartStr, newEndStr, false, spaceIdOverride, consultantIdOverride)
    } catch (e) {
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) =>
          b.id === props.id
            ? { ...b, startTime: props.startTime, endTime: props.endTime, space: props.space, consultant: props.consultant }
            : b,
        ),
      }))
      info.revert()
      if (isHttpConflict(e)) {
        await loadCalendarRangeOnly(true)
        return
      }
      console.error(e)
    }
  }

  const handleEventResize = async (info: any) => {
    const props = info.event.extendedProps
    if (props.kind === 'personal') {
      if (!personalModuleEnabled) {
        info.revert()
        return
      }
      const newStart = info.event.start!
      const newEnd = info.event.end || new Date(newStart.getTime() + 60 * 60000)
      const newStartStr = toLocalDateTimeString(newStart)
      const newEndStr = toLocalDateTimeString(newEnd)
      setCalendarData((prev: any) => ({
        ...prev,
        personal: (prev.personal || []).map((p: any) =>
          p.id === props.id ? { ...p, startTime: newStartStr, endTime: newEndStr } : p,
        ),
      }))
      if (selectedPersonalBlock?.id === props.id) {
        setSelectedPersonalBlock({ ...selectedPersonalBlock, startTime: newStartStr, endTime: newEndStr })
      }
      try {
        await performMovePersonal(props, newStartStr, newEndStr)
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({
          ...prev,
          personal: (prev.personal || []).map((p: any) =>
            p.id === props.id ? { ...p, startTime: props.startTime, endTime: props.endTime } : p,
          ),
        }))
        if (selectedPersonalBlock?.id === props.id) {
          setSelectedPersonalBlock({ ...selectedPersonalBlock, startTime: props.startTime, endTime: props.endTime })
        }
        info.revert()
      }
      return
    }
    if (props.kind !== 'booked') return
    const newStart = info.event.start!
    const typeDuration = props.type?.durationMinutes ?? fallbackSessionLengthMinutes ?? 60
    const newEnd = info.event.end || new Date(newStart.getTime() + Number(typeDuration) * 60000)
    const newStartStr = toLocalDateTimeString(newStart)
    const newEndStr = toLocalDateTimeString(newEnd)

    const typeBreakMinutes = props.type?.breakMinutes ?? getTypeBreakMinutes(props.type?.id)
    const overlapping = findOverlappingBooked(newStart, newEnd, props.id, undefined, typeBreakMinutes)
    if (overlapping) {
      setConfirmSwap({ dragged: props, target: overlapping, revert: info.revert })
      return
    }

    const consultantId = props.consultant?.id
    if (
      Number.isFinite(consultantId) &&
      findOverlappingPersonalBlocksForBooking(newStartStr, newEndStr, consultantId, typeBreakMinutes).length > 0
    ) {
      info.revert()
      setConfirmBookedPersonalOverlap({ type: 'move', booking: props, newStartStr, newEndStr })
      return
    }

    if (!isBookedMoveIntervalBookable(newStartStr, newEndStr, consultantId, typeBreakMinutes)) {
      info.revert()
      setConfirmNonBookableMove({ booking: props, newStartStr, newEndStr, allowPersonalBlockOverlap: true })
      return
    }

    // Optimistic update before await so the re-render has correct times immediately (no flash)
    setCalendarData((prev: any) => ({ ...prev, booked: (prev.booked || []).map((b: any) => b.id === props.id ? { ...b, startTime: newStartStr, endTime: newEndStr } : b) }))
    try {
      await performMove(props, newStartStr, newEndStr)
    } catch (e) {
      setCalendarData((prev: any) => ({ ...prev, booked: (prev.booked || []).map((b: any) => b.id === props.id ? { ...b, startTime: props.startTime, endTime: props.endTime } : b) }))
      info.revert()
      if (isHttpConflict(e)) {
        await loadCalendarRangeOnly(true)
        return
      }
      console.error(e)
    }
  }

  const confirmSwapSessions = async () => {
    if (!confirmSwap) return
    const { dragged, target } = confirmSwap
    try {
      await api.post('/bookings/swap', { firstId: dragged.id, secondId: target.id })
      setConfirmSwap(null)
      load()
    } catch (e) {
      console.error(e)
      confirmSwap.revert()
      setConfirmSwap(null)
    }
  }

  const cancelSwap = () => {
    if (confirmSwap) {
      confirmSwap.revert()
      setConfirmSwap(null)
    }
  }

  const cancelBookedPersonalOverlap = () => setConfirmBookedPersonalOverlap(null)

  const cancelNonBookableMove = () => setConfirmNonBookableMove(null)

  const confirmNonBookableMoveYes = async () => {
    const c = confirmNonBookableMove
    if (!c) return
    setConfirmNonBookableMove(null)
    try {
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) => {
          if (b.id !== c.booking.id) return b
          let next = { ...b, startTime: c.newStartStr, endTime: c.newEndStr }
          if (c.consultantIdOverride !== undefined) {
            next = { ...next, consultant: c.consultantIdOverride == null ? null : metaUsers.find((u: any) => u.id === c.consultantIdOverride) ?? { id: c.consultantIdOverride, firstName: '', lastName: '' } }
          }
          if (c.spaceIdOverride !== undefined) {
            next = { ...next, space: c.spaceIdOverride == null ? null : metaSpaces.find((s: any) => s.id === c.spaceIdOverride) ?? { id: c.spaceIdOverride, name: '' } }
          }
          return next
        }),
      }))
      await performMove(c.booking, c.newStartStr, c.newEndStr, !!c.allowPersonalBlockOverlap, c.spaceIdOverride, c.consultantIdOverride)
      load()
    } catch (e) {
      if (!isHttpConflict(e)) {
        console.error(e)
      }
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) =>
          b.id === c.booking.id ? { ...b, startTime: c.booking.startTime, endTime: c.booking.endTime, consultant: c.booking.consultant, space: c.booking.space } : b,
        ),
      }))
    }
  }

  const confirmBookedPersonalOverlapYes = async () => {
    const c = confirmBookedPersonalOverlap
    if (!c) return
    setConfirmBookedPersonalOverlap(null)
    if (c.type === 'create') {
      await saveBooking(false, false, true)
      return
    }
    if (c.type === 'edit') {
      await updateBookedSession(true, true)
      return
    }
    const moveSpaceId = c.type === 'move' ? c.spaceIdOverride : undefined
    const moveCid = c.type === 'move' ? c.consultantIdOverride : undefined
    const targetCid = moveCid !== undefined ? moveCid : (c.booking.consultant?.id ?? null)
    try {
      if (targetCid != null && !isBookedMoveIntervalBookable(c.newStartStr, c.newEndStr, targetCid)) {
        setConfirmNonBookableMove({
          booking: c.booking,
          newStartStr: c.newStartStr,
          newEndStr: c.newEndStr,
          allowPersonalBlockOverlap: true,
          spaceIdOverride: moveSpaceId,
          consultantIdOverride: moveCid,
        })
        return
      }
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) => {
          if (b.id !== c.booking.id) return b
          let next = { ...b, startTime: c.newStartStr, endTime: c.newEndStr }
          if (moveCid !== undefined) {
            next = { ...next, consultant: moveCid == null ? null : metaUsers.find((u: any) => u.id === moveCid) ?? { id: moveCid, firstName: '', lastName: '' } }
          }
          if (moveSpaceId !== undefined) {
            next = { ...next, space: moveSpaceId == null ? null : metaSpaces.find((s: any) => s.id === moveSpaceId) ?? { id: moveSpaceId, name: '' } }
          }
          return next
        }),
      }))
      await performMove(c.booking, c.newStartStr, c.newEndStr, true, moveSpaceId, moveCid)
      load()
    } catch (e) {
      if (!isHttpConflict(e)) {
        console.error(e)
      }
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) =>
          b.id === c.booking.id ? { ...b, startTime: c.booking.startTime, endTime: c.booking.endTime, consultant: c.booking.consultant, space: c.booking.space } : b,
        ),
      }))
    }
  }

  const clearDraggingState = useCallback(() => {
    isDraggingEventRef.current = false
    dragEdgeSideRef.current = 0
    cleanupDragArtifacts()
    if (calendarSwipeIsHorizontalRef.current) {
      const wrap = swipeWrapRef.current
      if (wrap) {
        wrap.style.setProperty('--calendar-slide-x', '0px')
        wrap.classList.remove('calendar-sliding-enabled', 'calendar-is-swiping', 'calendar-not-swiping')
      }
      setCalendarIsSwiping(false)
      setCalendarSlideX(0)
      if (calendarSnapshotRef.current) {
        calendarSnapshotRef.current.remove()
        calendarSnapshotRef.current = null
      }
      setSwipeTransitionActive(false)
    }
    calendarSwipeAxisDecidedRef.current = false
    calendarSwipeIsHorizontalRef.current = false
    calendarSwipeStartRef.current = null
  }, [cleanupDragArtifacts])

  const closeBookingSelection = () => {
    setSelection(null)
    setAvailabilitySelection(null)
    setAvailabilityIntent('add')
    setAvailabilityError(null)
    setAvailabilitySaving(false)
    setClientDropdownOpen(false)
    setMeetingProviderPickerOpen(false)
    setMeetingPickerCancelUnchecksOnline(false)
    setEditingClientSearch(false)
    calendarRef.current?.getApi()?.unselect()
    leaveCompactFormRouteIfNeeded()
  }

  const renderBookingModeTitle = () => {
    const helpId = calendarBookingPanelHelpId({
      hasAvailabilitySelection: Boolean(availabilitySelection),
      todo: Boolean(form.todo),
      personal: Boolean(form.personal),
    })
    const title = helpTitle(t, helpId)
    const tooltip = helpTooltip(t, helpId)
    const aria = helpAria(t, helpId)
    return (
      <span className="booking-title-with-help">
        <span>{title}</span>
        <span className="config-help-hint booking-mode-help" data-tooltip={tooltip} role="img" aria-label={aria} tabIndex={0}>?</span>
      </span>
    )
  }

  const formatTooltipTime = (date: Date | null) => {
    if (!date) return ''
    return date.toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  const buildMonthEventTooltip = (event: any) => {
    const props: any = event.extendedProps || {}
    if (props.kind !== 'booked' && props.kind !== 'personal') return null
    if (props.masked) return null
    const start = formatTooltipTime(event.start || null)
    const end = formatTooltipTime(event.end || null)
    const timeRange = start && end ? `${start} - ${end}` : (start || end || '')
    const typeLabel = props.kind === 'personal' ? t('formPersonal') : (props.type?.name || t('calendarEventTypeBooked'))
    const clientLabel = props.kind === 'booked' ? formatBookingClientsLabel(props) : null
    const gidRaw = props.groupId
    const bookingIsGroup =
      groupBookingEnabled &&
      props.kind === 'booked' &&
      gidRaw != null &&
      Number.isFinite(Number(gidRaw)) &&
      Number(gidRaw) > 0
    const consultantId = props.consultant?.id ?? props.consultantId ?? props.ownerId ?? null
    const consultantFromMeta = Number.isFinite(consultantId)
      ? metaUsers.find((u: any) => u.id === consultantId)
      : null
    const consultantLabel = fullName(props.consultant || consultantFromMeta || { firstName: '', lastName: '' }) || '-'
    const meetingLink = props.kind === 'booked' ? (props.meetingLink ?? null) : null
    const meetingProvider = props.kind === 'booked' ? (props.meetingProvider ?? null) : null
    return {
      timeRange,
      typeLabel,
      clientLabel,
      bookingIsGroup,
      consultantLabel,
      meetingLink,
      meetingProvider,
    }
  }

  const getHoverCardPosition = useCallback((viewType: string, eventEl: HTMLElement) => {
    const cardWidth = 250
    const estimatedCardHeight = 138
    const gap = 10
    const rect = eventEl.getBoundingClientRect()
    const bounds = calendarAndroidWeekRef.current?.getBoundingClientRect()
    const minX = (bounds?.left ?? 0) + 8
    const maxX = Math.max(minX, (bounds?.right ?? window.innerWidth) - cardWidth - 8)
    const minY = (bounds?.top ?? 0) + 8
    const maxY = Math.max(minY, (bounds?.bottom ?? window.innerHeight) - estimatedCardHeight - 8)

    if (
      viewType === 'timeGridWeek' ||
      viewType === 'timeGridThreeDay' ||
      viewType === 'resourceTimeGridWeek' ||
      viewType === 'resourceTimeGridThreeDay'
    ) {
      let x = rect.left - cardWidth - gap
      if (x < minX) x = Math.min(maxX, rect.right + gap)
      const y = Math.max(minY, Math.min(maxY, rect.top + (rect.height / 2) - (estimatedCardHeight / 2)))
      return { x, y, transform: 'none' }
    }

    if (viewType === 'timeGridDay' || viewType === 'resourceTimeGridDay') {
      const x = Math.max(minX, Math.min(maxX, rect.left))
      let y = rect.bottom + gap
      let transform = 'none'
      if (y + estimatedCardHeight > (bounds?.bottom ?? window.innerHeight) - 8) {
        y = rect.top - gap
        transform = 'translateY(-100%)'
      }
      return { x, y, transform }
    }

    const x = Math.max(10, Math.min(window.innerWidth - cardWidth - 10, rect.left + (rect.width / 2) - (cardWidth / 2)))
    const y = Math.max(12, rect.top - 10)
    return { x, y, transform: 'translateY(-100%)' }
  }, [])

  const getSessionPopupPosition = useCallback((anchorEl?: HTMLElement | null) => {
    const pad = 12
    const gap = 12
    const width = Math.min(560, Math.max(360, window.innerWidth - (pad * 2)))
    const height = Math.min(760, Math.max(420, window.innerHeight - (pad * 2)))

    const hostRect = calendarAndroidWeekRef.current?.getBoundingClientRect()
    const fallback = {
      left: hostRect ? hostRect.left + (hostRect.width * 0.58) : (window.innerWidth * 0.52),
      right: hostRect ? hostRect.left + (hostRect.width * 0.58) : (window.innerWidth * 0.52),
      top: hostRect ? hostRect.top + 24 : 48,
      bottom: hostRect ? hostRect.top + 120 : 200,
    }

    const nextAnchor = anchorEl
      ? anchorEl.getBoundingClientRect()
      : sessionPopupAnchorRectRef.current
        ? sessionPopupAnchorRectRef.current
        : fallback

    sessionPopupAnchorRectRef.current = {
      left: nextAnchor.left,
      right: nextAnchor.right,
      top: nextAnchor.top,
      bottom: nextAnchor.bottom,
    }

    const rightCandidate = nextAnchor.right + gap
    const leftCandidate = nextAnchor.left - width - gap
    const canUseRight = rightCandidate + width <= window.innerWidth - pad
    const rawLeft = canUseRight ? rightCandidate : leftCandidate
    const left = Math.min(window.innerWidth - width - pad, Math.max(pad, rawLeft))

    const rawTop = nextAnchor.top
    const top = Math.min(window.innerHeight - height - pad, Math.max(pad, rawTop))

    return { left, top }
  }, [])

  const placeSessionPopup = useCallback((anchorEl?: HTMLElement | null) => {
    if (isNativeAndroid) return
    setSessionPopupPosition(getSessionPopupPosition(anchorEl))
  }, [getSessionPopupPosition, isNativeAndroid])

  useLayoutEffect(() => {
    if (isNativeAndroid || !selectedTodo?.id) return
    placeSessionPopup()
  }, [selectedTodo?.id, isNativeAndroid, placeSessionPopup])

  const todayRemainingSessions = useMemo(() => {
    const now = new Date()
    const todayKey = toIsoDateKey(now)
    return (events as any[])
      .filter((ev) => ev?.extendedProps?.kind === 'booked')
      .map((ev) => {
        const start = ev?.start ? new Date(ev.start) : null
        const end = ev?.end ? new Date(ev.end) : null
        const props = ev?.extendedProps || {}
        const title = String(ev?.title || `${props?.client?.firstName || ''} ${props?.client?.lastName || ''}`).trim() || 'Session'
        const durationMinutes = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)) : 0
        return { start, end, props, title, durationMinutes }
      })
      .filter((row) => row.start && row.end && toIsoDateKey(row.start) === todayKey && row.end.getTime() > now.getTime())
      .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0))
  }, [events])

  const bottomPillLabel = useMemo(() => {
    const useTodayWord = calendarFiltersBottomBar || isNativeAndroid
    const dateLabel = useTodayWord
      ? t('calendarToday')
      : new Date().toLocaleDateString(calendarLocaleTag, { day: 'numeric', month: 'short' })
    const count = todayRemainingSessions.length
    const sessionsWord =
      locale === 'sl' ? slovenianTerminCountForm(count) : count === 1 ? 'session' : 'sessions'
    return `${dateLabel} · ${count} ${sessionsWord}`
  }, [calendarFiltersBottomBar, calendarLocaleTag, isNativeAndroid, locale, t, todayRemainingSessions.length])

  const openSessionsSheet = useCallback(() => {
    setSessionsSheetDragOffset(0)
    setSessionsSheetState('expanded')
  }, [])

  const closeSessionsSheet = useCallback(() => {
    setSessionsSheetDragOffset(0)
    setSessionsSheetState('closed')
  }, [])

  const openBookedSessionFromSheet = useCallback((row: any, anchorEl?: HTMLElement | null) => {
    if (!row?.props || row.props.masked) return
    setMonthHoverCard(null)
    setSelection(null)
    calendarRef.current?.getApi()?.unselect()
    if (!isNativeAndroid) placeSessionPopup(anchorEl || undefined)
    setSelectedBookedSession({
      ...row.props,
      clients: Array.isArray(row.props.clients) && row.props.clients.length > 0 ? row.props.clients : (row.props.client ? [row.props.client] : []),
      online: Boolean(row.props.online ?? row.props.meetingLink),
      meetingProvider: row.props.meetingProvider || 'zoom',
    })
    if (useBookingSidePanel && row.props.id != null) {
      pushCompactFormRoute(`/calendar/booking/${row.props.id}`)
    }
    closeSessionsSheet()
  }, [closeSessionsSheet, isNativeAndroid, placeSessionPopup, useBookingSidePanel, pushCompactFormRoute])

  const onSessionsSheetHandlePointerDown = useCallback((e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) => {
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY
    if (clientY == null || sessionsSheetState === 'closed') return
    sessionsSheetStartYRef.current = clientY
    sessionsSheetStartStateRef.current = sessionsSheetState === 'expanded' ? 'expanded' : 'collapsed'
    setSessionsSheetDragOffset(0)
  }, [sessionsSheetState])

  const onSessionsSheetHandlePointerMove = useCallback((e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) => {
    const startY = sessionsSheetStartYRef.current
    if (startY == null) return
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY
    if (clientY == null) return
    const delta = clientY - startY
    setSessionsSheetDragOffset(Math.max(-260, Math.min(260, delta)))
  }, [])

  const onSessionsSheetHandlePointerUp = useCallback(() => {
    const startY = sessionsSheetStartYRef.current
    if (startY == null) return
    const delta = sessionsSheetDragOffset
    const startState = sessionsSheetStartStateRef.current
    if (startState === 'collapsed') {
      if (delta < -54) setSessionsSheetState('expanded')
      else if (delta > 90) setSessionsSheetState('closed')
      else setSessionsSheetState('collapsed')
    } else {
      if (delta > 90) setSessionsSheetState('collapsed')
      else setSessionsSheetState('expanded')
    }
    sessionsSheetStartYRef.current = null
    setSessionsSheetDragOffset(0)
  }, [sessionsSheetDragOffset])

  const sessionsSheetTransform = sessionsSheetState === 'expanded'
    ? `translateY(${sessionsSheetDragOffset}px)`
    : `translateY(calc(46% + ${sessionsSheetDragOffset}px))`

  return (
    <div className={isNativeAndroid ? 'calendar-page-android-root' : 'calendar-page-web-root'}>
      <Card className={isNativeAndroid ? 'calendar-card-android' : 'calendar-web-flush'}>
        {voiceReviewOpen && (
          <div
            className="modal-backdrop"
            style={{ zIndex: 20 }}
            onClick={() => {
              if (!voiceBookingLoading) {
                setVoiceReviewOpen(false)
                setVoicePendingCancellation(null)
                setVoiceReviewClientId(null)
                setVoiceReviewClientQuery('')
                setVoiceReviewClientDropdownOpen(false)
              }
            }}
          >
            <div className="modal" style={{ maxWidth: 440, width: 'min(440px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
              <PageHeader
                title={t('calendarVoiceConfirmTitle')}
                subtitle={t('calendarVoiceConfirmSubtitle')}
              />
              <div className="stack gap-md" style={{ marginTop: 12 }}>
                {voicePendingCancellation && (
                  <div style={{ border: '1px solid var(--border-color, #d6d3d1)', borderRadius: 12, padding: 12, background: 'rgba(245, 158, 11, 0.08)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      {t('calendarVoiceActionToConfirm')}
                    </div>
                    {voicePendingCancellation.targetType === 'booking' ? (
                      <div><strong>{locale === 'sl' ? 'Stranka' : 'Client'}:</strong> {voiceReviewClientLabel}</div>
                    ) : (
                      <div><strong>{locale === 'sl' ? 'Naziv' : 'Title'}:</strong> {voicePendingCancellation.title || (locale === 'sl' ? 'Ni določen' : 'Not specified')}</div>
                    )}
                    <div><strong>{locale === 'sl' ? 'Začetek' : 'Start'}:</strong> {formatVoiceReviewDateTime(voicePendingCancellation.startTime)}</div>
                    {voicePendingCancellation.endTime && (
                      <div><strong>{locale === 'sl' ? 'Konec' : 'End'}:</strong> {formatVoiceReviewDateTime(voicePendingCancellation.endTime)}</div>
                    )}
                    <div style={{ marginTop: 8 }}>{voicePendingCancellation.message || (locale === 'sl' ? 'Potrdite dejanje.' : 'Please confirm the action.')}</div>
                  </div>
                )}
                {voicePendingCancellation?.targetType === 'booking' && (
                  <Field label={t('formClient')}>
                    <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                      <div className="calendar-client-picker__search-row">
                        <div className="client-search-wrap calendar-client-picker__search-wrap">
                          <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          </span>
                          <input
                            ref={voiceReviewClientInputRef}
                            className="input"
                            placeholder={locale === 'sl' ? 'Iščite ali vpišite stranko' : 'Search or type a client'}
                            value={voiceReviewClientQuery}
                            onChange={(e) => {
                              const nextValue = e.target.value
                              const normalized = nextValue.trim().toLowerCase()
                              const exact = normalized
                                ? voiceReviewClients.find((client: any) => fullName(client).toLowerCase() === normalized)
                                : null
                              setVoiceReviewClientQuery(nextValue)
                              setVoiceReviewClientId(exact?.id ?? null)
                              setVoiceReviewClientDropdownOpen(true)
                            }}
                            onFocus={() => setVoiceReviewClientDropdownOpen(true)}
                            onBlur={() => {
                              window.setTimeout(() => setVoiceReviewClientDropdownOpen(false), 0)
                            }}
                          />
                        </div>
                        <div className="calendar-client-picker__actions">
                          {(voiceReviewClientId != null || voiceReviewClientQuery.trim()) && (
                            <button
                              type="button"
                              className="secondary calendar-client-picker__clear-btn"
                              title={locale === 'sl' ? 'Počisti stranko' : 'Clear client'}
                              aria-label={locale === 'sl' ? 'Počisti stranko' : 'Clear client'}
                              onClick={(e) => {
                                e.stopPropagation()
                                setVoiceReviewClientId(null)
                                setVoiceReviewClientQuery('')
                                setVoiceReviewClientDropdownOpen(false)
                                requestAnimationFrame(() => voiceReviewClientInputRef.current?.focus())
                              }}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          )}
                        </div>
                        {voiceReviewClientDropdownOpen && (
                          <div className="client-dropdown-panel calendar-client-picker__dropdown" onMouseDown={(e) => e.preventDefault()}>
                            {visibleVoiceReviewClients.slice(0, 10).map((client: any) => (
                              <button
                                key={client.id}
                                type="button"
                                className={`client-list-item ${voiceReviewClientId === client.id ? 'selected' : ''}`}
                                onClick={() => {
                                  setVoiceReviewClientId(client.id)
                                  setVoiceReviewClientQuery(fullName(client))
                                  setVoiceReviewClientDropdownOpen(false)
                                }}
                              >
                                {fullName(client)}
                              </button>
                            ))}
                            {voiceReviewClientQuery.trim() && !visibleVoiceReviewClients.some((client: any) => fullName(client).toLowerCase() === voiceReviewClientQuery.trim().toLowerCase()) && (
                              <div className="muted" style={{ padding: '8px 4px 0' }}>
                                {voicePendingCancellation?.action === 'book_review'
                                  ? (locale === 'sl'
                                    ? 'Če stranke ni na seznamu, jo samo vpišite in ob potrditvi bo ustvarjena.'
                                    : 'If the client is not in the list, just type the name and it will be created when you confirm.')
                                  : (locale === 'sl'
                                    ? 'Vpišite ali izberite obstoječo stranko.'
                                    : 'Type or choose an existing client.')}
                              </div>
                            )}
                            {visibleVoiceReviewClients.length === 0 && !voiceReviewClientQuery.trim() && <span className="muted">{t('formNoClientsFoundAddOne')}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </Field>
                )}
                <div className="row gap" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" className="secondary" disabled={voiceBookingLoading} onClick={() => { setVoiceReviewOpen(false); setVoicePendingCancellation(null); setVoiceReviewClientId(null); setVoiceReviewClientQuery(''); setVoiceReviewClientDropdownOpen(false) }}>
                    {locale === 'sl' ? 'Prekliči' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={voiceBookingLoading}
                    onClick={() => {
                      setVoiceReviewOpen(false)
                      setVoicePendingCancellation(null)
                      setVoiceReviewClientId(null)
                      setVoiceReviewClientQuery('')
                      setVoiceReviewClientDropdownOpen(false)
                      window.setTimeout(() => startVoiceBooking(), 0)
                    }}
                  >
                    {locale === 'sl' ? 'Poslušaj znova' : 'Listen again'}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={voiceBookingLoading || !voicePendingCancellation || (voicePendingCancellation?.action === 'book_review' && voicePendingCancellation?.targetType === 'booking' && !(voiceReviewClientId != null || voiceReviewResolvedClientName))}
                    onClick={() => submitVoiceBookingTranscript(
                      voiceReviewText,
                      !!voicePendingCancellation,
                      voicePendingCancellation?.targetType === 'booking' && !voiceReviewResolvedClientName ? voiceReviewClientId : undefined,
                      voicePendingCancellation?.targetType === 'booking' ? voiceReviewResolvedClientName : undefined,
                    )}
                  >
                    {voiceBookingLoading
                      ? '…'
                        : (locale === 'sl' ? 'Potrdi dejanje' : 'Confirm action')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div
          ref={calendarAndroidWeekRef}
          className={isNativeAndroid ? 'calendar-android-week' : 'calendar-web-main'}
          onTouchStartCapture={handleCalendarSwipeTouchStart}
          onTouchEndCapture={handleCalendarSwipeTouchEnd}
          onTouchCancelCapture={clearDraggingState}
          onTouchMoveCapture={handleCalendarTouchMove}
          onMouseDownCapture={!isNativeAndroid ? handleCalendarSwipeTouchStart : undefined}
          onMouseUpCapture={!isNativeAndroid ? handleCalendarSwipeTouchEnd : undefined}
          onMouseMoveCapture={!isNativeAndroid ? handleCalendarTouchMove : undefined}
          onMouseLeave={!isNativeAndroid ? clearDraggingState : undefined}
        >
        {isNativeAndroid && (
          <div
            className="calendar-android-toolbar"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className="calendar-android-toolbar-leading">
              {isWebTimeGridLikeView(view) ? (
                <span className="calendar-android-toolbar-month" aria-hidden="true">
                  {calendarToolbarMonthLabel}
                </span>
              ) : null}
            </div>
            {isWebTimeGridLikeView(view) ? (
              <div className="calendar-android-toolbar-spacer" aria-hidden="true" />
            ) : (
              <div className="calendar-android-toolbar-title">{calendarToolbarTitle}</div>
            )}
            <div className="fc-button-group calendar-android-view-toggle" ref={androidScheduleRef} style={{ position: 'relative' }}>
              {todosModuleEnabled && (
              <button
                type="button"
                className="calendar-android-toolbar-icon-btn calendar-android-todo-btn"
                onClick={() => setAndroidTodoOpen(true)}
                title={t('calendarTodo')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M22 5.18 10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83L20.59 3.76 22 5.18ZM19.79 11.22c.05.25.05.51.05.78 0 4.31-3.48 7.8-7.79 7.8s-7.79-3.49-7.79-7.8 3.48-7.8 7.79-7.8c1.08 0 2.11.22 3.06.62l1.57-1.57A9.86 9.86 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-.8-.1-1.58-.29-2.33l-1.92 1.55Z" />
                </svg>
              </button>
              )}
              <button
                type="button"
                className="fc-button fc-button-primary"
                onClick={() => { setAndroidScheduleOpen((o) => !o); setAndroidConfigOpen(false) }}
              >
                {t('calendarSchedule')}
              </button>
              {androidScheduleOpen && (
                <div className="config-dropdown" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 140, zIndex: 10 }}>
                  <button type="button" className="config-dropdown-item" onClick={() => { goToTodayAndroid(); setAndroidScheduleOpen(false) }}>{t('calendarToday')}</button>
                  <button type="button" className="config-dropdown-item" onClick={() => { calendarRef.current?.getApi().changeView('timeGridWeek'); setAndroidScheduleOpen(false) }}>{t('viewWeek')}</button>
                  <button type="button" className="config-dropdown-item" onClick={() => { calendarRef.current?.getApi().changeView('dayGridMonth'); setAndroidScheduleOpen(false) }}>{t('viewMonth')}</button>
                </div>
              )}
            </div>
            <div className="calendar-android-config-wrap" ref={androidConfigRef}>
              <button
                type="button"
                className="calendar-android-toolbar-icon-btn"
                onClick={() => { setAndroidConfigOpen((o) => !o); setAndroidScheduleOpen(false) }}
                title={t('calendarConfiguration')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              {androidConfigOpen && (
                <div className="config-dropdown" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180, zIndex: 11 }}>
                  <button type="button" className="config-dropdown-item" onClick={() => { navigate('/configuration'); setAndroidConfigOpen(false) }}>
                    {t('settingsGroup')}
                  </button>
                  <button
                    type="button"
                    className="config-dropdown-item"
                    onClick={() => {
                      setAndroidConfigOpen(false)
                      setAndroidLanguageModal(true)
                    }}
                  >
                    {t('language')}
                  </button>
                  <button type="button" className="config-dropdown-item" onClick={() => { toggleTheme(); setAndroidConfigOpen(false) }}>
                    {theme === 'dark' ? t('lightMode') : t('darkMode')}
                  </button>
                  <button type="button" className="config-dropdown-item" onClick={() => { setAndroidConfigOpen(false); logout() }}>{t('logout')}</button>
                </div>
              )}
            </div>
          </div>
        )}
        <div
          ref={isNativeAndroid ? calendarPinchLayerRef : undefined}
          className={isNativeAndroid ? 'calendar-android-pinch-scale' : undefined}
          style={
            isNativeAndroid
              ? {
                  overflow: 'auto',
                  overflowX: view === 'dayGridMonth' ? 'hidden' : 'auto',
                }
              : undefined
          }
        >
        <div
          ref={swipeWrapRef}
          className={[
            calendarMode === 'spaces' ? 'calendar-mode-spaces' : (calendarMode === 'bookings' ? 'calendar-mode-bookings' : ''),
            modeSwitching ? 'calendar-mode-switching' : '',
            !isNativeAndroid ? 'calendar-web-wrap' : '',
            calendarIsSwiping ? 'calendar-is-swiping' : 'calendar-not-swiping',
            swipeTransitionActive ? 'calendar-sliding-enabled' : ''
          ].filter(Boolean).join(' ')}
          style={{
            ...(isNativeAndroid ? {
              width: `${(view === 'dayGridMonth' ? 1 : calendarPinchZoom) * 100}%`,
              height: `${(view === 'dayGridMonth' ? 1 : calendarPinchZoom) * 100}%`,
              transformOrigin: `${pinchOriginPct.x}% ${pinchOriginPct.y}%`
            } : {}),
            '--calendar-slide-x': `${calendarSlideX}px`,
          } as React.CSSProperties}
        >
        <div
          className={
            isNativeAndroid
              ? 'calendar-android-inner'
              : [
                  'calendar-web-inner',
                  calendarFiltersBottomBar ? 'calendar-web-inner--bottom-panel' : '',
                  !showCalendarRightRail ? 'calendar-web-inner--no-right-rail' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
          }
        >
        <div
          className={
            !isNativeAndroid
              ? ['calendar-fc-shell', hideNativeSelectionWhileDraftPreview ? 'calendar-hide-native-selection-highlight' : '']
                  .filter(Boolean)
                  .join(' ')
              : undefined
          }
        >
        {resourceDayViewHeaderFallbackEl}
        <FullCalendar
          /* Remount when resource *meaning* changes (e.g. bookings-all → spaces-all). Otherwise FC can keep
             stale custom resourceLabelContent (consultant avatars) over the new space column headers. */
          key={`fc-${calendarMode}-${bookingsUseResourceColumns}-${spacesUseResourceColumns}`}
          ref={calendarRef}
          locales={FULLCALENDAR_LOCALES}
          locale={locale === 'sl' ? 'sl' : 'en-gb'}
          schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
          plugins={calendarPlugins}
          resources={calendarResources}
          /* Multi-column resource views (Space mode, or Bookings “Vsi termini” / po osebju): weekday row above resource labels. */
          datesAboveResources={useResourceColumns}
          eventResourceEditable={true}
          resourceLabelClassNames={
            useResourceColumns
              ? (arg) => {
                  const rid = String(arg.resource.id)
                  if (bookingsUseResourceColumns && rid === CONSULTANT_RESOURCE_UNASSIGNED_ID) {
                    return ['calendar-resource-label--unassigned']
                  }
                  if (spacesUseResourceColumns && rid === SPACE_RESOURCE_UNASSIGNED_ID) {
                    return ['calendar-resource-label--unassigned']
                  }
                  if (!bookingsUseResourceColumns) return []
                  if (!consultantResourceLabelsCompact) return []
                  const u = metaUsers.find((x: any) => String(x.id) === rid)
                  return u ? ['calendar-resource-label--initials'] : []
                }
              : undefined
          }
          resourceLabelContent={
            useResourceColumns
              ? (arg) => {
                  const rid = String(arg.resource.id)
                  if (spacesUseResourceColumns && rid === SPACE_RESOURCE_UNASSIGNED_ID) {
                    const unassignedTitle = arg.resource.title
                    return (
                      <span className="calendar-resource-label-wrap" title={unassignedTitle}>
                        <span className="calendar-resource-label-avatar calendar-resource-label-avatar--na" aria-hidden="true">
                          N/A
                        </span>
                        <span className="calendar-resource-label-sr">{unassignedTitle}</span>
                      </span>
                    )
                  }
                  if (!bookingsUseResourceColumns) {
                    return arg.resource.title
                  }
                  if (rid === CONSULTANT_RESOURCE_UNASSIGNED_ID) {
                    const unassignedTitle = arg.resource.title
                    return (
                      <span className="calendar-resource-label-wrap" title={unassignedTitle}>
                        <span className="calendar-resource-label-avatar calendar-resource-label-avatar--na" aria-hidden="true">
                          N/A
                        </span>
                        <span className="calendar-resource-label-sr">{unassignedTitle}</span>
                      </span>
                    )
                  }
                  if (!consultantResourceLabelsCompact) {
                    return arg.resource.title
                  }
                  const u = metaUsers.find((x: any) => String(x.id) === rid)
                  if (!u) return arg.resource.title
                  const name = fullName(u)
                  return (
                    <span className="calendar-resource-label-wrap" title={name}>
                      <span className="calendar-resource-label-avatar" aria-hidden="true">
                        {personInitials(u)}
                      </span>
                      <span className="calendar-resource-label-sr">{name}</span>
                    </span>
                  )
                }
              : undefined
          }
          initialView={view}
          eventOrder="order"
          firstDay={isNativeAndroid && view === 'dayGridMonth' ? androidMonthFirstDay : 1}
          weekends
          dayHeaderFormat={undefined}
          dayHeaderContent={
            (arg) => {
              const d = arg.date
              const isMonthView = arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth'
              if (isMonthView) {
                const monthDow = d
                  .toLocaleDateString(calendarLocaleTag, { weekday: 'short' })
                  .replace(/\.$/, '')
                  .slice(0, 3)
                  .toUpperCase()
                return <span className="fc-day-header-month-label">{monthDow}</span>
              }
              const dowRaw = d.toLocaleDateString(calendarLocaleTag, { weekday: 'short' })
              const dowBase = dowRaw.replace(/\.$/, '').slice(0, 3)
              const dow = dowBase.charAt(0).toUpperCase() + dowBase.slice(1).toLowerCase()
              const dayNum = d.getDate()
              const holidayName = holidaysByDate[toIsoDateKey(d)]
              const viewType = arg.view.type
              const isResourceWeekLike =
                viewType === 'resourceTimeGridWeek' || viewType === 'resourceTimeGridThreeDay'
              const holidayPillText =
                holidayName && isResourceWeekLike
                  ? truncateCalendarHolidayPillText(holidayName, 18)
                  : holidayName
              const isToday = (() => {
                const now = new Date()
                return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
              })()
              return (
                <div
                  className={`fc-day-header-stack${isNativeAndroid ? ' fc-day-header-stack--android' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCalendarDayView(d)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openCalendarDayView(d)
                    }
                  }}
                >
                  <span className={`calendar-header-holiday-pill${holidayName ? '' : ' calendar-header-holiday-pill--empty'}`} title={holidayName || ''}>
                    {holidayPillText || '\u00A0'}
                  </span>
                  <span className="fc-day-header-dow">{dow}</span>
                  <span className={`fc-day-header-dom${isToday ? ' fc-day-header-dom--today' : ''}`}>{dayNum}</span>
                </div>
              )
            }
          }
          dayCellDidMount={(arg) => {
            if (arg.view.type !== 'dayGridMonth' && arg.view.type !== 'resourceDayGridMonth') return
            const dayNumberEl = arg.el.querySelector('.fc-daygrid-day-number') as HTMLElement | null
            if (!dayNumberEl) return
            dayNumberEl.classList.add('calendar-month-day-number-link')
            dayNumberEl.setAttribute('role', 'button')
            dayNumberEl.setAttribute('tabindex', '0')
            const openFromDayNumber = () => {
              ignoreNextSelectionRef.current = true
              window.setTimeout(() => {
                ignoreNextSelectionRef.current = false
              }, 0)
              openCalendarDayView(arg.date)
            }
            dayNumberEl.onmousedown = (e) => {
              e.preventDefault()
              e.stopPropagation()
            }
            dayNumberEl.onclick = (e) => {
              e.preventDefault()
              e.stopPropagation()
              openFromDayNumber()
            }
            dayNumberEl.onkeydown = (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                openFromDayNumber()
              }
            }
            const existingLabel = arg.el.querySelector('.calendar-holiday-label')
            if (existingLabel) existingLabel.remove()
            const dayTop = arg.el.querySelector('.fc-daygrid-day-top') as HTMLElement | null
            const holidayName = holidaysByDate[toIsoDateKey(arg.date)]
            if (dayTop && holidayName) {
              const label = document.createElement('div')
              label.className = 'calendar-holiday-label'
              label.title = holidayName
              label.textContent = holidayName
              dayTop.appendChild(label)
            }
          }}
          datesSet={(arg) => {
            setView(arg.view.type)
            setMonthHoverCard(null)
            setVisibleRange({ start: arg.startStr, end: arg.endStr })
            if (datesSetCalendarLoadTimerRef.current != null) {
              window.clearTimeout(datesSetCalendarLoadTimerRef.current)
            }
            datesSetCalendarLoadTimerRef.current = window.setTimeout(() => {
              datesSetCalendarLoadTimerRef.current = null
              loadCalendarRangeOnly().catch(() => {})
            }, DATE_SET_CALENDAR_DEBOUNCE_MS)
            if (isDraggingEventRef.current) {
              document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
              requestAnimationFrame(() => {
                document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
              })
            }
            if (isNativeAndroid) {
              requestAnimationFrame(() => {
                const api = calendarRef.current?.getApi()
                const anchor = api?.getDate() ?? new Date(arg.start)
                if (arg.view.type === 'dayGridMonth') {
                  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
                  setAndroidMonthFirstDay(first.getDay())
                }
                const vtAndroid = arg.view.type
                setCalendarToolbarTitle(
                  isWebTimeGridLikeView(vtAndroid)
                    ? ''
                    : anchor.toLocaleDateString(calendarLocaleTag, { month: 'long', year: 'numeric' }),
                )
                renderAndroidCornerViewToggle(vtAndroid)
                api?.updateSize()
              })
            } else {
              setCalendarToolbarTitle(arg.view.title)
              const vt = arg.view.type
              if (
                vt === 'timeGridDay' ||
                vt === 'timeGridThreeDay' ||
                vt === 'resourceTimeGridDay' ||
                vt === 'resourceTimeGridThreeDay'
              ) {
                requestAnimationFrame(() => {
                  calendarRef.current?.getApi().updateSize()
                })
              }
            }
          }}
          editable={!isNativeAndroid && !isViewOnly}
          customButtons={{}}
          buttonText={{
            week: t('viewWeek'),
            month: t('viewMonth'),
          }}
          headerToolbar={false}
          {...(isNativeAndroid
            ? {
                views: {
                  timeGridWeek: { allDaySlot: false },
                  timeGridDay: { allDaySlot: false },
                  timeGridThreeDay: {
                    type: 'timeGrid',
                    duration: { days: 3 },
                    dateAlignment: 'day',
                    allDaySlot: false,
                  },
                  dayGridMonth: { dayHeaders: false, showNonCurrentDates: false, fixedWeekCount: false },
                },
              }
            : {
                views: {
                  timeGridDay: { dayHeaderFormat: { weekday: 'long' }, allDaySlot: false },
                  timeGridWeek: { allDaySlot: false },
                  timeGridThreeDay: {
                    type: 'timeGrid',
                    duration: { days: 3 },
                    dateAlignment: 'day',
                    allDaySlot: false,
                  },
                  dayGridMonth: { dayHeaderFormat: { weekday: 'long' } },
                  resourceTimeGridDay: {
                    dayHeaderFormat: { weekday: 'long' },
                    allDaySlot: false,
                    datesAboveResources: true,
                  },
                  resourceTimeGridWeek: { allDaySlot: false },
                  resourceTimeGridThreeDay: {
                    type: 'resourceTimeGrid',
                    duration: { days: 3 },
                    dateAlignment: 'day',
                    allDaySlot: false,
                    datesAboveResources: true,
                  },
                  resourceDayGridMonth: { dayHeaderFormat: { weekday: 'long' } },
                },
              })}
          dateClick={(arg) => {
            if (suppressNextCalendarSelectionRef.current) {
              calendarRef.current?.getApi()?.unselect()
              return
            }
            if (arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth') {
              if (isNativeAndroid) {
                const api = calendarRef.current?.getApi()
                if (!api) return
                api.gotoDate(arg.date)
                api.changeView('timeGridDay')
                return
              }
              if (isViewOnly) return
              if (calendarMode === 'bookings') {
                const [startHour, startMinute] = slotMinTime.split(':').map((value) => Number(value) || 0)
                const startDate = new Date(arg.date)
                startDate.setHours(startHour, startMinute, 0, 0)
                const crid = (arg as { resource?: { id?: string } }).resource?.id
                const resolvedConsultant =
                  bookingsUseResourceColumns && crid && crid !== CONSULTANT_RESOURCE_UNASSIGNED_ID
                    ? Number(crid)
                    : (consultantFilterId ?? undefined)
                openBookingModal(
                  toLocalDateTimeString(startDate),
                  toLocalDateTimeString(startDate),
                  resolvedConsultant,
                  false,
                  undefined,
                  undefined,
                  false,
                  undefined,
                  bookingsUseResourceColumns && crid != null ? String(crid) : undefined,
                )
                return
              }
              if (calendarMode === 'spaces') {
                const [startHour, startMinute] = slotMinTime.split(':').map((value) => Number(value) || 0)
                const startDate = new Date(arg.date)
                startDate.setHours(startHour, startMinute, 0, 0)
                const rid = (arg as { resource?: { id?: string } }).resource?.id
                let preselectedSpaceId: number | null
                if (spaceFilterId != null) preselectedSpaceId = spaceFilterId
                else if (rid == null || rid === SPACE_RESOURCE_UNASSIGNED_ID) preselectedSpaceId = null
                else preselectedSpaceId = Number(rid)
                const selectionInfo = getBookableSelectionInfo(
                  toLocalDateTimeString(startDate),
                  toLocalDateTimeString(startDate),
                )
                openBookingModal(
                  toLocalDateTimeString(startDate),
                  toLocalDateTimeString(startDate),
                  selectionInfo.consultantId ?? consultantFilterId ?? user.id,
                  false,
                  preselectedSpaceId,
                  undefined,
                  !selectionInfo.isBookable,
                  undefined,
                  spacesUseResourceColumns && rid != null ? String(rid) : undefined,
                )
                return
              }
              return
            }
            if (arg.allDay) {
              if (!isNativeAndroid) return
              const startDate = new Date(arg.date)
              startDate.setHours(0, 0, 0, 0)
              const endDate = new Date(startDate)
              endDate.setHours(23, 59, 0, 0)
              handleCalendarSelectionFromUi(toLocalDateTimeString(startDate), toLocalDateTimeString(endDate), true)
              return
            }
            if (
              arg.view.type !== 'timeGridWeek' &&
              arg.view.type !== 'timeGridDay' &&
              arg.view.type !== 'timeGridThreeDay' &&
              arg.view.type !== 'resourceTimeGridWeek' &&
              arg.view.type !== 'resourceTimeGridDay' &&
              arg.view.type !== 'resourceTimeGridThreeDay'
            )
              return
            if (!isNativeAndroid && calendarMode !== 'bookings' && calendarMode !== 'spaces') return
            if (isViewOnly) return
            const start = new Date(arg.date)
            const end = new Date(start.getTime() + SLOT_MS)
            const rid = (arg as { resource?: { id?: string } }).resource?.id
            handleCalendarSelectionFromUi(toLocalDateTimeString(start), toLocalDateTimeString(end), false, rid)
          }}
          slotDuration="00:15:00"
          snapDuration="00:15:00"
          slotLabelInterval="00:30:00"
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          height={isNativeAndroid ? '100%' : 'auto'}
          contentHeight={isNativeAndroid ? undefined : 'auto'}
          expandRows={false}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          nowIndicator
          stickyHeaderDates
          stickyFooterScrollbar={false}
          selectable={!isNativeAndroid && !isViewOnly}
          unselectAuto={false}
          selectMinDistance={0}
          selectAllow={(info) => {
            if (!isNativeAndroid && (calendarMode === 'bookings' || calendarMode === 'spaces') && !info.allDay) {
              const now =
                typeof performance !== 'undefined' && typeof performance.now === 'function'
                  ? performance.now()
                  : Date.now()
              if (now - dragSelectThrottleAtRef.current < 56) return true
              dragSelectThrottleAtRef.current = now
              const res = (info as { resource?: { id?: string } }).resource
              setDragSelection({
                start: toLocalDateTimeString(info.start),
                end: toLocalDateTimeString(info.end),
                resourceId: res?.id != null ? String(res.id) : undefined,
              })
              // Inject time label directly into the highlight element
              const hl = document.querySelector('.fc-highlight') as HTMLElement | null
              if (hl) {
                hl.style.position = 'relative'
                let label = hl.querySelector('.fc-highlight-time-label') as HTMLElement | null
                const fmt = (d: Date) => d.toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
                const text = `${fmt(info.start)} – ${fmt(info.end)}`
                if (!label) {
                  label = document.createElement('div')
                  label.className = 'fc-highlight-time-label'
                  label.style.cssText = 'position:absolute;top:4px;left:6px;font-size:0.78rem;font-weight:600;color:#3b82f6;pointer-events:none;white-space:nowrap;line-height:1.2;z-index:1'
                  hl.appendChild(label)
                }
                label.textContent = text
              }
            }
            return true
          }}
          selectOverlap={(event) => {
            if (calendarMode === 'bookings' || calendarMode === 'spaces') return true
            const kind = event?.extendedProps?.kind
            return kind === 'bookable' || kind === 'non-bookable'
          }}
          events={events}
          select={
            isNativeAndroid
              ? undefined
              : (info) => {
                  setDragSelection(null)
                  if (isViewOnly) return
                  if (ignoreNextSelectionRef.current) {
                    ignoreNextSelectionRef.current = false
                    return
                  }
                  if (suppressNextCalendarSelectionRef.current) {
                    calendarRef.current?.getApi()?.unselect()
                    return
                  }
                  let startDate: Date
                  let endDate: Date
                  if (info.allDay) {
                    startDate = new Date(info.start)
                    startDate.setHours(0, 0, 0, 0)
                    endDate = new Date(info.end.getTime() - 1)
                    endDate.setHours(23, 59, 0, 0)
                  } else {
                    startDate = info.start
                    endDate = info.end
                  }
                  const start = toLocalDateTimeString(startDate)
                  const end = toLocalDateTimeString(endDate)
                  const highlightEl = document.querySelector('.fc-highlight') as HTMLElement | null
                  const resourceId = (info as { resource?: { id?: string } }).resource?.id ?? null
                  handleCalendarSelection(start, end, {
                    preserveDraggedRange: true,
                    anchorEl: highlightEl,
                    spaceResourceId: spacesUseResourceColumns ? resourceId : undefined,
                    consultantResourceId: bookingsUseResourceColumns ? resourceId : undefined,
                  })
                }
          }
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventDidMount={(info) => {
            // Prevent native browser drag ghost while keeping FullCalendar drag/drop active.
            info.el.setAttribute('draggable', 'false')
            info.el.style.userSelect = 'none'
            ;(info.el.style as any).webkitUserDrag = 'none'
            ;(info.el.style as any).webkitTouchCallout = 'none'
            const k = info.event.extendedProps?.kind

            const isResourceTimeGrid =
              info.view.type === 'resourceTimeGridWeek' ||
              info.view.type === 'resourceTimeGridDay' ||
              info.view.type === 'resourceTimeGridThreeDay'

            // Reserve a lane on the right in normal week/day views (columns are wide enough).
            // In resource week (Consultant ALL / Space ALL) each day cell is already narrow — 34px makes events look like slivers.
            if (
              !isResourceTimeGrid &&
              (info.view.type === 'timeGridWeek' ||
                info.view.type === 'timeGridDay' ||
                info.view.type === 'timeGridThreeDay') &&
              (k === 'booked' || k === 'personal' || k === 'todo' || k === 'draft-preview')
            ) {
              const isNarrowMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 780px)').matches
              const harness = info.el.closest('.fc-timegrid-event-harness') as HTMLElement | null
              if (harness) harness.style.setProperty('right', isNarrowMobile ? '0' : '34px', 'important')
            } else if (
              isResourceTimeGrid &&
              (k === 'booked' || k === 'personal' || k === 'todo' || k === 'draft-preview')
            ) {
              const harness = info.el.closest('.fc-timegrid-event-harness') as HTMLElement | null
              if (harness) harness.style.setProperty('right', '0', 'important')
            }

            const z =
              k === 'draft-preview'
                ? 8
                : k === 'todo'
                  ? 6
                  : k === 'personal'
                    ? 5
                    : k === 'booked'
                      ? 4
                      : k === 'booking-break'
                        ? 3
                        : k === 'bookable'
                          ? 2
                          : 1
            info.el.style.zIndex = String(z)
            if (k === 'draft-preview') info.el.style.pointerEvents = 'none'
            info.el.removeAttribute('title')
            if (k === 'booked' && info.event.extendedProps?.breakConflict) {
              info.el.title = 'Break overlaps another booking or a personal block.'
            } else if (k === 'booking-break') {
              info.el.title = info.event.extendedProps?.breakConflict
                ? 'Break time overlaps another booking or a personal block.'
                : 'Break time kept unavailable after the session.'
            }
          }}
          eventMouseEnter={(info) => {
            if (isNativeAndroid) return
            if (calendarFiltersBottomBar) return
            if (hideCardTimerRef.current) {
              clearTimeout(hideCardTimerRef.current)
              hideCardTimerRef.current = null
            }
            const tooltip = buildMonthEventTooltip(info.event)
            if (!tooltip) {
              setMonthHoverCard(null)
              return
            }
            const position = getHoverCardPosition(info.view.type, info.el)
            setMonthHoverCard({
              x: position.x,
              y: position.y,
              transform: position.transform,
              timeRange: tooltip.timeRange,
              typeLabel: tooltip.typeLabel,
              clientLabel: tooltip.clientLabel,
              bookingIsGroup: tooltip.bookingIsGroup,
              consultantLabel: tooltip.consultantLabel,
              meetingLink: tooltip.meetingLink,
              meetingProvider: tooltip.meetingProvider,
            })
          }}
          eventMouseLeave={(info) => {
            const hasMeetingLink = !!info.event.extendedProps?.meetingLink
            if (!hasMeetingLink) {
              if (hideCardTimerRef.current) {
                clearTimeout(hideCardTimerRef.current)
                hideCardTimerRef.current = null
              }
              setMonthHoverCard(null)
              return
            }
            const related = (info.jsEvent as MouseEvent).relatedTarget as Node | null
            if (related && hoverCardRef.current?.contains(related)) return
            if (hideCardTimerRef.current) clearTimeout(hideCardTimerRef.current)
            hideCardTimerRef.current = setTimeout(() => {
              setMonthHoverCard(null)
              hideCardTimerRef.current = null
            }, 200)
          }}
          eventDragStart={(info) => {
            setMonthHoverCard(null)
            if (info.event.extendedProps?.kind === 'draft-preview') return
            isDraggingEventRef.current = true
            dragEdgeSideRef.current = 0
            dragEdgeNavAtRef.current = 0
            // Drag mirror can inherit layout; keep harness full-width in dense resource grids.
            requestAnimationFrame(() => {
              document
                .querySelectorAll(
                  '.fc-resourceTimeGridWeek-view .fc-timegrid-event-harness, .fc-resourceTimeGridDay-view .fc-timegrid-event-harness, .fc-resourceTimeGridThreeDay-view .fc-timegrid-event-harness',
                )
                .forEach((el) => (el as HTMLElement).style.setProperty('right', '0', 'important'))
            })
            const kind = info.event.extendedProps?.kind
            if (kind === 'booked' || kind === 'personal' || kind === 'todo') {
              teardownCalendarDragAxisHint()
              const onMove = (ev: PointerEvent) => positionCalendarDragAxisHint(ev.clientY)
              const onTouchMove = (ev: TouchEvent) => {
                const y = ev.touches[0]?.clientY
                if (y != null) positionCalendarDragAxisHint(y)
              }
              const onEnd = () => {
                document.removeEventListener('pointermove', onMove, true)
                document.removeEventListener('pointerup', onEnd, true)
                document.removeEventListener('pointercancel', onEnd, true)
                document.removeEventListener('touchmove', onTouchMove, true)
                calendarDragPointerCleanupRef.current = null
              }
              document.addEventListener('pointermove', onMove, true)
              document.addEventListener('pointerup', onEnd, true)
              document.addEventListener('pointercancel', onEnd, true)
              document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true })
              calendarDragPointerCleanupRef.current = onEnd
              window.requestAnimationFrame(() => positionCalendarDragAxisHint(info.jsEvent.clientY))
            }
          }}
          eventDragStop={() => {
            setMonthHoverCard(null)
            isDraggingEventRef.current = false
            dragEdgeNavAtRef.current = 0
            dragEdgeSideRef.current = 0
            teardownCalendarDragAxisHint()
            // Delay cleanup so eventDrop/eventResize can read newResource before DOM is altered
            setTimeout(cleanupDragArtifacts, 150)
          }}
          eventClassNames={(arg) => {
            const kind = arg.event.extendedProps?.kind
            if (kind === 'draft-preview') {
              const dk = arg.event.extendedProps?.draftKind || 'booked'
              const previewKind =
                dk === 'availability' && arg.event.extendedProps?.availabilityIntent === 'block'
                  ? 'availability-block'
                  : dk
              return ['calendar-event-draft-preview', `calendar-event-draft-preview--${previewKind}`, 'calendar-event-hover-scale']
            }
            if (kind === 'booked') {
              return [
                'calendar-event-hover-scale',
                'calendar-event-booked-visual',
                ...(arg.event.extendedProps?.breakConflict ? ['calendar-event-booked-break-conflict'] : []),
              ]
            }
            if (kind === 'booking-break') {
              return [
                'calendar-booking-break-background',
                ...(arg.event.extendedProps?.breakConflict ? ['calendar-booking-break-background--conflict'] : []),
              ]
            }
            if (kind === 'personal') {
              return ['calendar-event-hover-scale', 'calendar-event-personal-visual']
            }
            if (kind === 'todo') {
              return ['calendar-event-hover-scale', 'calendar-event-todo-visual']
            }
            if (kind === 'bookable' && (calendarMode === 'bookings' || calendarMode === 'spaces')) {
              const classes = ['calendar-availability-bookings-selectable']
              const chunkIndex = Number(arg.event.extendedProps?.bookableChunkIndex)
              const chunkCount = Number(arg.event.extendedProps?.bookableChunkCount)
              if (Number.isFinite(chunkIndex) && Number.isFinite(chunkCount) && chunkCount > 1) {
                if (chunkIndex > 0) classes.push('calendar-availability-chunk-continued-up')
                if (chunkIndex < chunkCount - 1) classes.push('calendar-availability-chunk-continued-down')
              }
              const activeSelection = dragSelection ?? selection
              if (activeSelection?.start && activeSelection?.end && arg.event.start && arg.event.end) {
                const selectionStartMs = new Date(activeSelection.start).getTime()
                const selectionEndMs = new Date(activeSelection.end).getTime()
                const eventStartMs = arg.event.start.getTime()
                const eventEndMs = arg.event.end.getTime()
                const overlapsSelection = selectionStartMs < eventEndMs && selectionEndMs > eventStartMs
                if (bookingsUseResourceColumns) {
                  const selRid = activeSelection.resourceId
                  if (selRid == null) {
                    return classes
                  }
                  const evRid = arg.event.getResources?.()?.[0]?.id
                  if (String(evRid ?? '') !== String(selRid)) {
                    return classes
                  }
                }
                if (spacesUseResourceColumns) {
                  const selRid = activeSelection.resourceId
                  if (selRid == null) {
                    return classes
                  }
                  const evRid = arg.event.getResources?.()?.[0]?.id
                  if (String(evRid ?? '') !== String(selRid)) {
                    return classes
                  }
                }
                if (Number.isFinite(selectionStartMs) && Number.isFinite(selectionEndMs) && overlapsSelection) {
                  classes.push('calendar-availability-bookings-selected')
                  // Mark if the selection extends into the adjacent chunk so we can remove the shared border
                  if (chunkIndex > 0 && selectionStartMs < eventStartMs) classes.push('calendar-availability-selection-joined-up')
                  if (chunkIndex < chunkCount - 1 && selectionEndMs > eventEndMs) classes.push('calendar-availability-selection-joined-down')
                }
              }
              return classes
            }
            if (kind === 'bookable' && calendarMode === 'availability') {
              return ['calendar-availability-clickable']
            }
            if (kind === 'non-bookable' && (calendarMode === 'bookings' || calendarMode === 'spaces')) {
              return ['calendar-non-bookable-background']
            }
            return []
          }}
          eventClick={(info) => {
            setMonthHoverCard(null)
            const props = info.event.extendedProps
            if (props.kind === 'draft-preview') {
              info.jsEvent.preventDefault()
              return
            }
            if (props.kind === 'booked') {
              if (props.masked) return
              setSelection(null)
              calendarRef.current?.getApi()?.unselect()
              placeSessionPopup(info.el)
              setSelectedBookedSession({
                ...props,
                clients: Array.isArray(props.clients) && props.clients.length > 0 ? props.clients : (props.client ? [props.client] : []),
                online: Boolean(props.online ?? props.meetingLink),
                meetingProvider: props.meetingProvider || 'zoom',
              })
              if (useBookingSidePanel && props.id != null) {
                pushCompactFormRoute(`/calendar/booking/${props.id}`)
              }
              clearSessionEventClickChrome(info.el)
              return
            }
            if (props.kind === 'personal') {
              if (props.masked) return
              setSelection(null)
              calendarRef.current?.getApi()?.unselect()
              placeSessionPopup(info.el)
              setSelectedPersonalBlock(props)
              if (useBookingSidePanel && props.id != null) {
                pushCompactFormRoute(`/calendar/personal/${props.id}`)
              }
              clearSessionEventClickChrome(info.el)
              return
            }
            if (props.kind === 'todo') {
              if (props.masked) return
              setSelection(null)
              calendarRef.current?.getApi()?.unselect()
              placeSessionPopup(info.el)
              setSelectedTodo(props)
              if (useBookingSidePanel && props.id != null) {
                pushCompactFormRoute(`/calendar/todo/${props.id}`)
              }
              clearSessionEventClickChrome(info.el)
              return
            }
            if (props.kind === 'bookable' && calendarMode === 'availability') {
              openAvailabilityModalFromSlot(props)
              return
            }
            if (props.kind === 'bookable') {
              if (calendarMode === 'bookings') {
                const start = info.event.start ? toLocalDateTimeString(info.event.start) : selection?.start
                const end = info.event.end ? toLocalDateTimeString(info.event.end) : selection?.end
                const res0 = info.event.getResources?.()?.[0]
                const sr =
                  bookingsUseResourceColumns && res0?.id != null ? String(res0.id) : undefined
                openBookingModal(start, end, props.consultant?.id, false, undefined, undefined, false, info.el, sr)
              }
              if (calendarMode === 'spaces') {
                const start = info.event.start ? toLocalDateTimeString(info.event.start) : selection?.start
                const end = info.event.end ? toLocalDateTimeString(info.event.end) : selection?.end
                const res0 = info.event.getResources?.()?.[0]
                const rid = res0?.id
                let preselectedSpaceId: number | null
                if (spaceFilterId != null) preselectedSpaceId = spaceFilterId
                else if (rid == null || rid === SPACE_RESOURCE_UNASSIGNED_ID) preselectedSpaceId = null
                else preselectedSpaceId = Number(rid)
                const selectionInfo = getBookableSelectionInfo(start, end)
                const sr = spacesUseResourceColumns && rid != null ? String(rid) : undefined
                openBookingModal(
                  start,
                  end,
                  selectionInfo.consultantId ?? props.consultant?.id ?? consultantFilterId ?? user.id,
                  false,
                  preselectedSpaceId,
                  undefined,
                  !selectionInfo.isBookable,
                  info.el,
                  sr,
                )
              }
              return
            }
            if (props.kind === 'booking-break' || props.kind === 'non-bookable') {
              return
            }
            const start = info.event.start ? toLocalDateTimeString(info.event.start) : selection?.start
            const end = info.event.end ? toLocalDateTimeString(info.event.end) : selection?.end
            openBookingModal(start, end, props.consultant?.id, false, undefined, undefined, false, info.el)
          }}
          eventContent={(arg) => {
            const props: any = arg.event.extendedProps
            if (props.kind === 'draft-preview') {
              return <div className="calendar-event-draft-preview-fill" aria-hidden />
            }
            if ((props.kind === 'booked' || props.kind === 'personal' || props.kind === 'todo') && props.masked) {
              return <div style={{ width: '100%', height: '100%' }} />
            }
            if (
              (arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth') &&
              props.kind === 'booked'
            ) {
              const startTime = arg.event.start
                ? arg.event.start.toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })
                : ''
              if (groupBookingEnabled && props.groupId != null && Number(props.groupId) > 0) {
                const label = String(arg.event.title || '').trim() || '—'
                return (
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <span className="calendar-event-booked-label--narrow">{label}</span>
                      <span className="calendar-event-booked-label--wide">{label}</span>
                    </span>
                    <span style={{ flexShrink: 0, fontSize: '0.82em', opacity: 0.95 }}>{startTime}</span>
                  </div>
                )
              }
              const fn = String(props?.client?.firstName || '').trim()
              const ln = String(props?.client?.lastName || '').trim()
              const narrow = ln || fn || arg.event.title
              const wide = ln && fn ? `${ln}, ${fn}` : narrow
              return (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    <span className="calendar-event-booked-label--narrow">{narrow}</span>
                    <span className="calendar-event-booked-label--wide">{wide}</span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: '0.82em', opacity: 0.95 }}>{startTime}</span>
                </div>
              )
            }
            if (
              (arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth') &&
              props.kind === 'personal'
            ) {
              const startTime = arg.event.start
                ? arg.event.start.toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })
                : ''
              return (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arg.event.title}</span>
                  <span style={{ flexShrink: 0, fontSize: '0.82em', opacity: 0.95 }}>{startTime}</span>
                </div>
              )
            }
            if (props.kind === 'booked') {
              if (groupBookingEnabled && props.groupId != null && Number(props.groupId) > 0) {
                const label = String(arg.event.title || '').trim() || '—'
                return (
                  <div className="calendar-event-mobile-content calendar-event-mobile-content--single">
                    <div className="calendar-event-mobile-title calendar-event-booked-label--narrow">{label}</div>
                    <div className="calendar-event-mobile-title calendar-event-booked-label--wide">{label}</div>
                  </div>
                )
              }
              const fn = String(props?.client?.firstName || '').trim()
              const ln = String(props?.client?.lastName || '').trim()
              const fallbackTitle = String(arg.event.title || '').trim()
              const titleParts = fallbackTitle.split(/\s+/).filter(Boolean)
              const resolvedLastName = ln || (titleParts.length > 1 ? titleParts[titleParts.length - 1] : fallbackTitle)
              const wide = ln && fn ? `${ln}, ${fn}` : (fallbackTitle || resolvedLastName)
              return (
                <div className="calendar-event-mobile-content calendar-event-mobile-content--single">
                  <div className="calendar-event-mobile-title calendar-event-booked-label--narrow">{resolvedLastName}</div>
                  <div className="calendar-event-mobile-title calendar-event-booked-label--wide">{wide}</div>
                </div>
              )
            }
            if (props.kind === 'personal') {
              const fullTitle = String(arg.event.title || '').trim() || '—'
              const titleParts = fullTitle.split(/\s+/).filter(Boolean)
              const shortTitle =
                titleParts.length > 1 ? String(titleParts[titleParts.length - 1]) : fullTitle
              return (
                <div className="calendar-event-mobile-content calendar-event-mobile-content--single">
                  <div className="calendar-event-mobile-title calendar-event-personal-title--full">{fullTitle}</div>
                  <div className="calendar-event-mobile-title calendar-event-personal-title--short">{shortTitle}</div>
                </div>
              )
            }
            if (props.kind !== 'todo') {
              return (
                <div style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {arg.event.title}
                </div>
              )
            }
            const icon = (
              <svg className="calendar-event-todo-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12.5l2.4 2.4L16 9.5" />
              </svg>
            )
            return (
              <div className="calendar-event-todo-row">
                <span className="calendar-event-todo-title">{arg.event.title}</span>
                {icon}
              </div>
            )
          }}
        />
        </div>
        {!isNativeAndroid && showCalendarRightRail ? (
          <div className="calendar-rail-stack">
            {calendarSpacesFeatureActive ? (
              <div className="calendar-mode-toolbar calendar-mode-toolbar--rail">
                <CalendarHeaderModeGroup
                  calendarMode={calendarMode}
                  onModeChange={setCalendarModeView}
                  bookableEnabled={bookableEnabled}
                  spacesEnabled={spacesEnabled}
                />
              </div>
            ) : null}
            {calendarDateNavArrowsInRail && !calendarMobileHeaderNav ? (
              <div className="calendar-rail-stack__tail">
                <div className="calendar-rail-date-nav">
                  <CalendarHeaderDateNavArrows calendarRef={calendarRef} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {showWebMobileBottomPanel && (
          <>
            <div className="calendar-bottom-panel-spacer" aria-hidden />
            <div className="calendar-bottom-panel calendar-bottom-panel--fixed">
            <div className="calendar-bottom-panel__start">
              {showAdminConsultantFilter ? (
                <CalendarRailIconFilters
                  layout="footer"
                  showConsultant
                  showSpace={false}
                  consultantFilterId={consultantFilterId}
                  onConsultantFilterChange={setConsultantFilterId}
                  spaceFilterId={spaceFilterId}
                  onSpaceFilterChange={setSpaceFilterId}
                  consultantUsers={metaUsers.filter((u: any) => u.consultant)}
                  spaces={metaSpaces}
                />
              ) : null}
            </div>
            <div className="calendar-bottom-panel__center" style={{ gap: 12 }}>
              <button type="button" className="calendar-bottom-panel-pill calendar-bottom-panel-pill--button" onClick={openSessionsSheet}>
                {bottomPillLabel}
              </button>
            </div>
            <div className="calendar-bottom-panel__end">
              {calendarSpacesFeatureActive && calendarMode !== 'availability' ? (
                <CalendarRailIconFilters
                  layout="footer"
                  showConsultant={false}
                  showSpace
                  consultantFilterId={consultantFilterId}
                  onConsultantFilterChange={setConsultantFilterId}
                  spaceFilterId={spaceFilterId}
                  onSpaceFilterChange={setSpaceFilterId}
                  consultantUsers={metaUsers.filter((u: any) => u.consultant)}
                  spaces={metaSpaces}
                />
              ) : null}
            </div>
          </div>
          </>
        )}
        </div>
        {monthHoverCard && !calendarFiltersBottomBar && (
          <div
            ref={hoverCardRef}
            className="calendar-month-hover-card"
            style={{ left: monthHoverCard.x, top: monthHoverCard.y, transform: monthHoverCard.transform }}
            onMouseEnter={() => {
              if (hideCardTimerRef.current) {
                clearTimeout(hideCardTimerRef.current)
                hideCardTimerRef.current = null
              }
            }}
            onMouseLeave={() => {
              setMonthHoverCard(null)
            }}
          >
            <div className="calendar-month-hover-row calendar-month-hover-time">{monthHoverCard.timeRange}</div>
            <div className="calendar-month-hover-row">{t('calendarHoverType')}: {monthHoverCard.typeLabel}</div>
            {monthHoverCard.clientLabel && (
              <div className="calendar-month-hover-row">
                {monthHoverCard.bookingIsGroup ? t('formGroup') : t('formClient')}: {monthHoverCard.clientLabel}
              </div>
            )}
            <div className="calendar-month-hover-row">{t('calendarConsultant')}: {monthHoverCard.consultantLabel}</div>
            {monthHoverCard.meetingLink && (
              <div className="calendar-month-hover-row">
                {t('calendarHoverMeetingLink')}:{' '}
                <a
                  href={monthHoverCard.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="linkish"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(monthHoverCard.meetingProvider === 'google' || monthHoverCard.meetingLink.includes('meet.google.com')) ? t('formOpenGoogleMeet') : t('formOpenZoom')}
                </a>
              </div>
            )}
          </div>
        )}
        </div>
        </div>
        {isNativeAndroid && (user.role === 'ADMIN' || spacesEnabled) && (
          <div
            className="calendar-android-filters-footer"
            style={{ position: 'relative', zIndex: 5 }}
          >
            <div className="calendar-android-filter-footer-left">
              {showAdminConsultantFilter && (
                <button
                  type="button"
                  className="calendar-android-filter-chip"
                  title={t('calendarConsultant')}
                  onClick={() => setAndroidFilterPicker('consultant')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span>{selectedConsultantLabel}</span>
                </button>
              )}
            </div>
            <div className="calendar-android-filter-footer-center">
              <button type="button" className="calendar-bottom-panel-pill calendar-bottom-panel-pill--button calendar-bottom-panel-pill--android" onClick={openSessionsSheet}>
                {bottomPillLabel}
              </button>
            </div>
            <div className="calendar-android-filter-footer-right">
              {calendarSpacesFeatureActive && calendarMode !== 'availability' && (
                <button
                  type="button"
                  className="calendar-android-filter-chip"
                  title={t('calendarSpace')}
                  onClick={() => setAndroidFilterPicker('space')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  <span>{selectedSpaceLabel}</span>
                </button>
              )}
            </div>
          </div>
        )}
        {isNativeAndroid && androidFilterPicker && (
          <div className="modal-backdrop" onClick={() => setAndroidFilterPicker(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <PageHeader title={androidFilterPicker === 'consultant' ? t('calendarConsultant') : t('calendarSpace')} />
              <div className="stack gap-sm">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (androidFilterPicker === 'consultant') setConsultantFilterId(null)
                    else setSpaceFilterId(null)
                    setAndroidFilterPicker(null)
                  }}
                >
                  {androidFilterPicker === 'consultant' ? t('calendarFilterByStaffColumns') : t('calendarSpaceFilterAllLocations')}
                </button>
                {androidFilterPicker === 'consultant' && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setConsultantFilterId(CONSULTANT_FILTER_ALL_SESSION)
                      setAndroidFilterPicker(null)
                    }}
                  >
                    {t('calendarFilterAllSessionsMerged')}
                  </button>
                )}
                {androidFilterPicker === 'consultant'
                  ? metaUsers.filter((u: any) => u.consultant).map((u: any) => (
                      <button
                        key={u.id}
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setConsultantFilterId(u.id)
                          setAndroidFilterPicker(null)
                        }}
                      >
                        {fullName(u)}
                      </button>
                    ))
                  : (metaSpaces).map((s: any) => (
                      <button
                        key={s.id}
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setSpaceFilterId(s.id)
                          setAndroidFilterPicker(null)
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
              </div>
            </div>
          </div>
        )}
        {isNativeAndroid && todosModuleEnabled && androidTodoOpen && (
          <div className="modal-backdrop" onClick={() => setAndroidTodoOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <PageHeader title={t('calendarTodoTasks')} />
              <div className="stack gap-sm">
                {(todosModuleEnabled ? calendarData.todos || [] : []).length === 0 ? (
                  <div className="muted">{t('calendarNoTasks')}</div>
                ) : (
                  (todosModuleEnabled ? calendarData.todos || [] : []).map((t: any) => (
                    <button
                      key={t.id}
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setSelectedTodo(t)
                        setAndroidTodoOpen(false)
                      }}
                    >
                      {t.task || t('calendarTodo')}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        </div>

      </Card>

      {sessionsSheetState !== 'closed' && (
        <div className="calendar-sessions-sheet-layer" onClick={closeSessionsSheet}>
          <div
            className={`calendar-sessions-sheet calendar-sessions-sheet--${sessionsSheetState}`}
            style={{ transform: sessionsSheetTransform }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="calendar-sessions-sheet-handle-wrap"
              onMouseDown={onSessionsSheetHandlePointerDown}
              onMouseMove={onSessionsSheetHandlePointerMove}
              onMouseUp={onSessionsSheetHandlePointerUp}
              onMouseLeave={onSessionsSheetHandlePointerUp}
              onTouchStart={onSessionsSheetHandlePointerDown}
              onTouchMove={onSessionsSheetHandlePointerMove}
              onTouchEnd={onSessionsSheetHandlePointerUp}
            >
              <div className="calendar-sessions-sheet-handle" />
              <div className="calendar-sessions-sheet-title">{bottomPillLabel}</div>
            </div>
            <div className="calendar-sessions-sheet-list">
              {todayRemainingSessions.length === 0 ? (
                <div className="calendar-sessions-sheet-empty">{t('calendarSessionsRemainingEmpty')}</div>
              ) : (
                todayRemainingSessions.map((row) => (
                  <button
                    key={`${row.props?.id || row.title}-${row.start?.toISOString() || ''}`}
                    type="button"
                    className="calendar-sessions-sheet-card"
                    onClick={(e) => openBookedSessionFromSheet(row, e.currentTarget)}
                  >
                    <div className="calendar-sessions-sheet-card-top">
                      <strong>{row.title}</strong>
                      <span>{fullName(row.props?.consultant || { firstName: '', lastName: '' })}</span>
                    </div>
                    <div className="calendar-sessions-sheet-card-meta">
                      <span>{row.start?.toLocaleTimeString(calendarLocaleTag, { hour: '2-digit', minute: '2-digit', hour12: false })} - {row.end?.toLocaleTimeString(calendarLocaleTag, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                      <span>{row.durationMinutes} min</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {confirmSwap && (
        <div className="modal-backdrop" onClick={cancelSwap}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title="Switch sessions?"
              subtitle={`This will swap "${fullName(confirmSwap.dragged.client)}" with "${fullName(confirmSwap.target.client)}". Both sessions will exchange their time slots.`}
            />
            <div className="row gap">
              <button onClick={confirmSwapSessions}>Yes, switch</button>
              <button className="secondary" onClick={cancelSwap}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmOverlap && (
        <div className="modal-backdrop calendar-booking-supplement" onClick={() => { setConfirmOverlap(null) }}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title="Overlapping sessions"
              subtitle={`There are ${confirmOverlap.overlapping.length} existing session(s) at this time. Do you want to delete them and create the new one?`}
            />
            <div className="row gap">
              <button onClick={() => saveBooking(true, false, true)} disabled={saveBookingLoading}>Yes, delete and create</button>
              <button className="secondary" onClick={() => { setConfirmOverlap(null) }}>No, keep booking form</button>
            </div>
          </div>
        </div>
      )}

      {confirmBookedPersonalOverlap && (
        <div className="modal-backdrop calendar-booking-supplement" onClick={cancelBookedPersonalOverlap}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title="Personal time"
              subtitle="You already have a session planned at this time. Are you sure?"
            />
            <div className="row gap">
              <button type="button" onClick={() => void confirmBookedPersonalOverlapYes()} disabled={saveBookingLoading}>
                Yes
              </button>
              <button type="button" className="secondary" onClick={cancelBookedPersonalOverlap}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmNonBookableMove && (
        <div
          className={`modal-backdrop calendar-booking-supplement${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onClick={cancelNonBookableMove}
        >
          <div
            className={`modal confirm-modal${isNativeAndroid ? ' confirm-modal-non-bookable-android' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {isNativeAndroid ? (
              <p className="confirm-modal-non-bookable-text">
                Do you really want to book a client on non bookable time slot?
              </p>
            ) : (
              <PageHeader title="Warning" subtitle="Do you really want to book a client on non bookable time slot?" />
            )}
            <div className="row gap">
              <button type="button" onClick={() => void confirmNonBookableMoveYes()}>
                Yes
              </button>
              <button type="button" className="secondary" onClick={cancelNonBookableMove}>
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmNonBookable && (
        <div
          className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onClick={() => setConfirmNonBookable(null)}
        >
          <div
            className={`modal confirm-modal${isNativeAndroid ? ' confirm-modal-non-bookable-android' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {isNativeAndroid ? (
              <p className="confirm-modal-non-bookable-text">
                Do you really want to book a client on non bookable time slot?
              </p>
            ) : (
              <PageHeader title="Warning" subtitle="Do you really want to book a client on non bookable time slot?" />
            )}
            <div className="row gap">
              <button onClick={() => { setConfirmNonBookable(null); saveBooking(false, true) }} disabled={saveBookingLoading}>Yes</button>
              <button className="secondary" onClick={() => setConfirmNonBookable(null)}>No</button>
            </div>
          </div>
        </div>
      )}

      {selectedBookedSession && (
        <div
          className={useBookingSidePanel ? 'modal-backdrop booking-side-panel-backdrop' : 'calendar-session-popup-layer'}
          onClick={useBookingSidePanel ? closeBookedModal : undefined}
        >
          <div
            ref={!useBookingSidePanel ? sessionPopupRef : undefined}
            className={useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel'}
            style={!useBookingSidePanel && sessionPopupPosition ? { left: sessionPopupPosition.left, top: sessionPopupPosition.top, maxHeight: `calc(100vh - ${sessionPopupPosition.top + 12}px)` } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${compactSessionEditHeader ? ' booking-side-panel-header--compact-booking' : ''}`}>
              {compactSessionEditHeader ? (
                !confirmDelete ? (
                  <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit">
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeBookedModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                    <div className="booking-side-panel-header-ico-group">
                      <button
                        type="button"
                        className="calendar-form-footer-btn calendar-form-footer-btn--delete"
                        onClick={() => setConfirmDelete(true)}
                        aria-label={t('formDeleteSession')}
                        title={t('formDeleteSession')}
                      >
                        <CalendarFormFooterDeleteIcon />
                        <span className="calendar-form-footer-btn__label">{t('formDeleteSession')}</span>
                      </button>
                      <button
                        type="button"
                        className="calendar-form-footer-btn calendar-form-footer-btn--save"
                        onClick={() => void updateBookedSession()}
                        disabled={selectedBookedClientIds.length === 0 && !bookedClientSearch.trim()}
                        aria-label={t('formSave')}
                        title={t('formSave')}
                      >
                        <CalendarFormFooterSaveIcon />
                        <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit">
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeBookedModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                  </div>
                )
              ) : (
                <PageHeader
                  title={t('formBookedSession')}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeBookedModal} aria-label={t('mobileNavClose')}>×</button>}
                />
              )}
            </div>
            <div className="booking-side-panel-body">
            {selectedBookedSession.billedAt && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <span
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                  }}
                >
                  {t('formPaid')}
                </span>
              </div>
            )}
            {selectedBookedSession.breakConflict && (
              <div className="toast toast-error calendar-booking-inline-toast" role="alert" style={{ marginBottom: 12 }}>
                Break overlaps another booking or a personal block during the configured break time.
              </div>
            )}
            <div className="form-row-layout">
              {bookedSessionIsGroup ? (
                <div className="form-row form-row-infield calendar-booking-client-with-group">
                  <div className="calendar-booking-service-infield-head">
                    <span className="form-field-inline-label">{t('formGroup')}</span>
                  </div>
                  <div className="form-field-inline-control">
                    <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                      <div className="calendar-client-picker__search-row">
                        <div className="client-search-wrap calendar-client-picker__search-wrap client-search-wrap--compact-client">
                          <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          </span>
                          <button
                            type="button"
                            className="client-selected-display"
                            disabled
                            title={bookedSessionResolvedGroup?.name ?? ''}
                          >
                            {bookedSessionResolvedGroup?.name ?? (locale === 'sl' ? `Skupina #${bookedSessionGroupId}` : `Group #${bookedSessionGroupId}`)}
                          </button>
                        </div>
                        <div className="calendar-client-picker__actions">
                          <button
                            type="button"
                            className="secondary calendar-client-picker__details-btn"
                            title={t('calendarGroupDetails')}
                            aria-label={t('calendarGroupDetails')}
                            disabled={!bookedSessionGroupId}
                            onClick={() => openCalendarGroupDetails(bookedSessionGroupId, selectedBookedSession?.id)}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M20 21a8 8 0 0 0-16 0"/>
                              <circle cx="12" cy="7" r="4"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="form-row form-row-infield">
                <span className="form-field-inline-label">{t(multipleClientsPerSessionEnabled ? 'formClients' : 'formClient')}</span>
                <div className="form-field-inline-control">
                <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                  <div className="calendar-client-picker__search-row">
                    <div className={`client-search-wrap calendar-client-picker__search-wrap${bookedSessionClientFieldCompact ? ' client-search-wrap--compact-client' : ''}`}>
                      <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      </span>
                      {bookedSessionClientFieldCompact ? (
                        <button
                          type="button"
                          className="client-selected-display"
                          onClick={() => {
                            setEditingBookedClientSearch(true)
                            setBookedClientSearch('')
                            setBookedClientDropdownOpen(true)
                          }}
                        >
                          {fullName(bookedSessionSelectedClient!)}
                        </button>
                      ) : (
                        <input
                          ref={bookedClientSearchInputRef}
                          placeholder={clientSearchPlaceholder}
                          value={bookedClientSearch}
                          onChange={(e) => {
                            setBookedClientSearch(e.target.value)
                            setEditingBookedClientSearch(true)
                            setBookedClientDropdownOpen(true)
                          }}
                          onFocus={() => {
                            setEditingBookedClientSearch(true)
                            setBookedClientDropdownOpen(true)
                          }}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setBookedClientDropdownOpen(false)
                              if (multipleClientsPerSessionEnabled) {
                                setEditingBookedClientSearch(false)
                                return
                              }
                              const typed = bookedClientSearch.trim()
                              if (typed && bookedSessionSelectedClient) {
                                if (fullName(bookedSessionSelectedClient).toLowerCase() !== typed.toLowerCase()) {
                                  applyBookedSessionClientIds([])
                                } else {
                                  setBookedClientSearch('')
                                }
                              } else if (!typed) {
                                setBookedClientSearch('')
                              }
                              setEditingBookedClientSearch(false)
                            }, 0)
                          }}
                        />
                      )}
                    </div>
                    <div className="calendar-client-picker__actions">
                      {!multipleClientsPerSessionEnabled && bookedSessionSelectedClient?.id && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__clear-btn"
                          title={clearSingleClientTitle}
                          aria-label={clearSingleClientTitle}
                          onClick={(e) => {
                            e.stopPropagation()
                            applyBookedSessionClientIds([])
                            setBookedClientSearch('')
                            setEditingBookedClientSearch(false)
                            setBookedClientDropdownOpen(false)
                          }}
                        >
                          <span aria-hidden>×</span>
                        </button>
                      )}
                      {!multipleClientsPerSessionEnabled && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__details-btn"
                          title={t('calendarClientDetails')}
                          aria-label={t('calendarClientDetails')}
                          disabled={!bookedSessionSelectedClient?.id}
                          onClick={() => openCalendarClientDetails(bookedSessionSelectedClient?.id)}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M20 21a8 8 0 0 0-16 0"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary client-add-btn calendar-client-picker__add-btn"
                        title={addClientInlineTitle}
                        aria-label={addClientInlineTitle}
                        onClick={() => {
                          setBookedClientDropdownOpen(false)
                          const p = parseClientNameInput(bookedClientSearch)
                          setNewClientForm((prev) => ({ ...prev, firstName: p.firstName, lastName: p.lastName }))
                          setShowAddClientModal(true)
                        }}
                      >
                        <span aria-hidden>+</span>
                      </button>
                    </div>
                    {bookedClientDropdownOpen && (
                      <div className="client-dropdown-panel calendar-client-picker__dropdown" onMouseDown={(e) => e.preventDefault()}>
                        {visibleBookedClients.slice(0, 10).map((client: any) => (
                          <button
                            key={client.id}
                            type="button"
                            className={`client-list-item ${selectedBookedClientIds.includes(client.id) ? 'selected' : ''}`}
                            onClick={() => {
                              if (multipleClientsPerSessionEnabled) {
                                const nextIds = selectedBookedClientIds.includes(client.id)
                                  ? selectedBookedClientIds.filter((id) => id !== client.id)
                                  : [...selectedBookedClientIds, client.id]
                                applyBookedSessionClientIds(nextIds)
                              } else {
                                setSelectedBookedSession({ ...selectedBookedSession, client, clients: [client] })
                                setBookedClientDropdownOpen(false)
                                setEditingBookedClientSearch(false)
                              }
                              setBookedClientSearch('')
                            }}
                          >
                            {fullName(client)}
                          </button>
                        ))}
                        {visibleBookedClients.length === 0 && <span className="muted">{t('formNoClientsFoundAddOne')}</span>}
                      </div>
                    )}
                  </div>
                  {multipleClientsPerSessionEnabled && bookedSessionSelectedClients.length > 0 && (
                    <div className="calendar-multi-client-chips">
                      {visibleBookedSessionClientChips.map((client: any) => (
                        <div key={client.id} className="calendar-multi-client-chip">
                          <button
                            type="button"
                            className="calendar-multi-client-chip__label"
                            onClick={() => openCalendarClientDetails(client.id)}
                            title={t('calendarClientDetails')}
                          >
                            {fullName(client)}
                          </button>
                          <button
                            type="button"
                            className="calendar-multi-client-chip__remove"
                            aria-label={`${t('formDelete')} ${fullName(client)}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              applyBookedSessionClientIds(selectedBookedClientIds.filter((id) => id !== client.id))
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {hiddenBookedSessionClientCount > 0 && !bookedSessionClientsExpanded && (
                        <button
                          type="button"
                          className="calendar-multi-client-more"
                          onClick={() => setBookedSessionClientsExpanded(true)}
                        >
                          {getMoreClientsLabel(hiddenBookedSessionClientCount)}
                        </button>
                      )}
                      {bookedSessionClientsExpanded && bookedSessionSelectedClients.length > 3 && (
                        <button
                          type="button"
                          className="calendar-multi-client-more calendar-multi-client-more--secondary"
                          onClick={() => setBookedSessionClientsExpanded(false)}
                        >
                          {showLessClientsLabel}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                </div>
              </div>
              )}
              {showBookingConsultantRow && (
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formConsultant')}</span>
                  <div className="form-field-inline-control">
                  <select
                    value={selectedBookedSession.consultant?.id ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        setSelectedBookedSession({ ...selectedBookedSession, consultant: null })
                      } else {
                        setSelectedBookedSession({ ...selectedBookedSession, consultant: metaUsers.find((u: any) => u.id === Number(val)) })
                      }
                    }}
                  >
                    <option value="">{t('formUnassigned')}</option>
                    {metaConsultants.map((c: any) => (
                      <option key={c.id} value={c.id}>{fullName(c)}</option>
                    ))}
                  </select>
                  </div>
                </div>
              )}
              {showBookingTypeRow && (
                <div className="form-row form-row-infield calendar-booking-service-with-online">
                  <div className="calendar-booking-service-infield-head">
                    <span className="form-field-inline-label">{t('formCalendarBookingService')}</span>
                    <div className="calendar-booking-service-online-line" role="group" aria-label={t('formSessionOnlineShort')}>
                      <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formSessionOnlineShort')}>
                        <input
                          type="checkbox"
                          checked={!!selectedBookedSession.online}
                          aria-labelledby={bookedSessionOnlineCaptionId}
                          onChange={(e) => {
                            const on = e.target.checked
                            if (on) {
                              setSelectedBookedSession({
                                ...selectedBookedSession,
                                online: true,
                                meetingProvider: selectedBookedSession.meetingProvider || 'zoom',
                              })
                            } else {
                              setSelectedBookedSession({ ...selectedBookedSession, online: false, meetingLink: null })
                            }
                          }}
                        />
                        <span className="repeats-toggle-slider" />
                      </label>
                      <span id={bookedSessionOnlineCaptionId} className="calendar-booking-service-online-caption">
                        {t('formSessionOnlineShort')}
                      </span>
                    </div>
                  </div>
                  <div className="form-field-inline-control calendar-booking-service-select-only">
                    <select value={selectedBookedSession.type?.id ?? ''} onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, type: metaTypes.find((ty: any) => ty.id === Number(e.target.value)) })}>
                      <option value="">{t('formNoType')}</option>
                      {metaTypes.map((ty: any) => (
                        <option key={ty.id} value={ty.id}>{ty.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {showBookingSpaceRow && (
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formCalendarBookingSpace')}</span>
                  <div className="form-field-inline-control">
                  <select value={selectedBookedSession.space?.id ?? ''} onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, space: metaSpaces.find((s: any) => s.id === Number(e.target.value)) })}>
                    <option value="">{t('formNoSpace')}</option>
                    {metaSpaces.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  </div>
                </div>
              )}
              <div className="form-row form-row-timespan">
                <CalendarLocalTimespanRow
                  startValue={selectedBookedSession.startTime}
                  endValue={selectedBookedSession.endTime}
                  onCommitStart={(s) =>
                    setSelectedBookedSession((prev: any) => (prev ? { ...prev, startTime: s } : prev))
                  }
                  onCommitEnd={(s) =>
                    setSelectedBookedSession((prev: any) => (prev ? { ...prev, endTime: s } : prev))
                  }
                  normalize={normalizeToLocalDateTime}
                  labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                  allDayToggle={{
                    checked: isLocalBookingAllDay(selectedBookedSession.startTime, selectedBookedSession.endTime),
                    onToggle: () => {
                      setSelectedBookedSession((prev: any) => {
                        if (!prev) return prev
                        if (isLocalBookingAllDay(prev.startTime, prev.endTime)) {
                          const d =
                            splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                          const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                          const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                          const end = getBookingEndTimeForStart(start, prev.type?.id ?? null)
                          return { ...prev, startTime: start, endTime: end }
                        }
                        const d =
                          splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                        return {
                          ...prev,
                          startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                          endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                        }
                      })
                    },
                    label: t('formAllDay'),
                    captionId: editBookedAllDayCaptionId,
                  }}
                  onCommitAllDayDate={(ymd) => {
                    setSelectedBookedSession((prev: any) =>
                      prev
                        ? {
                            ...prev,
                            startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                            endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                          }
                        : prev,
                    )
                  }}
                />
              </div>
              {(() => {
                const dateLoc = locale === 'sl' ? 'sl-SI' : 'en-GB'
                const startDate = selectedBookedSession.startTime ? new Date(selectedBookedSession.startTime) : null
                const sessionDay = startDate ? REPEAT_WEEKDAY_EN[startDate.getDay()] : 'Monday'
                const sessionDateStr = startDate
                  ? startDate.toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                  : ''
                const repeatInterval = selectedBookedSession.repeatInterval ?? 1
                const repeatUnit = selectedBookedSession.repeatUnit ?? 'weeks'
                const repeatEndType = selectedBookedSession.repeatEndType ?? 'after'
                const repeatEndCount = selectedBookedSession.repeatEndCount ?? 5
                const repeatEndDate = selectedBookedSession.repeatEndDate ?? ''
                const summaryTail = repeatEndType === 'after'
                  ? t('formRepeatEndsAfter').replace('{count}', String(repeatEndCount))
                  : repeatEndDate
                    ? t('formRepeatEndsOn').replace(
                        '{date}',
                        new Date(repeatEndDate).toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
                      )
                    : t('formRepeatNoEndDate')
                const summaryLine = t('formRepeatSummaryLine').replace('{from}', sessionDateStr).replace('{tail}', summaryTail)
                return (
                  <div className="form-row-repeats-section">
                    <div className="form-row form-row-infield form-row--bare">
                      <span className="form-field-inline-label">{t('formRepeats')}</span>
                      <div className="form-field-inline-control">
                        <label className="repeats-toggle-switch">
                          <input
                            type="checkbox"
                            checked={!!selectedBookedSession.repeats}
                            onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeats: e.target.checked, repeatDay: sessionDay })}
                          />
                          <span className="repeats-toggle-slider" />
                        </label>
                      </div>
                    </div>
                    {selectedBookedSession.repeats && (
                      <div className="form-repeats-config">
                        <div className="form-repeats-row">
                          <span className="form-repeats-label">{t('formRepeatsEvery')}</span>
                          <input
                            type="number"
                            min={1}
                            max={52}
                            className="form-repeats-number"
                            value={repeatInterval}
                            onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatInterval: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <select
                            className="form-repeats-select"
                            value={repeatUnit}
                            onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatUnit: e.target.value })}
                          >
                            <option value="days">{t('formRepeatUnitDays')}</option>
                            <option value="weeks">{t('formRepeatUnitWeeks')}</option>
                            <option value="months">{t('formRepeatUnitMonths')}</option>
                          </select>
                        </div>
                        {repeatUnit === 'weeks' && (
                          <div className="form-repeats-row">
                            <span className="form-repeats-label">{t('formRepeatsOnDay')}</span>
                            <select
                              className="form-repeats-select"
                              value={selectedBookedSession.repeatDay ?? sessionDay}
                              onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatDay: e.target.value })}
                            >
                              {REPEAT_WEEKDAY_EN.map((d) => (
                                <option key={d} value={d}>{formatRepeatWeekdayLabel(locale, d)}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="form-repeats-row">
                          <span className="form-repeats-label">{t('formRepeatsEnds')}</span>
                          <select
                            className="form-repeats-select"
                            value={repeatEndType}
                            onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatEndType: e.target.value })}
                          >
                            <option value="after">{t('formRepeatEndAfter')}</option>
                            <option value="on">{t('formRepeatEndOnDate')}</option>
                          </select>
                          {repeatEndType === 'after' && (
                            <input
                              type="number"
                              min={2}
                              max={100}
                              className="form-repeats-number"
                              value={repeatEndCount}
                              onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatEndCount: Math.max(2, Number(e.target.value) || 2) })}
                            />
                          )}
                          {repeatEndType === 'on' && (
                            <input
                              type="date"
                              className="form-repeats-date"
                              value={repeatEndDate}
                              onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatEndDate: e.target.value })}
                            />
                          )}
                        </div>
                        <p className="form-repeats-summary muted">
                          {summaryLine}
                        </p>
                        <p className="form-repeats-note muted">
                          {t('formRepeatsSameDurationNote')}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}
              {selectedBookedSession.online && (
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formMeeting')}</span>
                  <div className="form-field-inline-control">
                  <div className="online-live-toggle">
                    <button
                      type="button"
                      className={(selectedBookedSession.meetingProvider || 'zoom') === 'zoom' ? 'toggle-btn active' : 'toggle-btn'}
                      onClick={() => setSelectedBookedSession({ ...selectedBookedSession, meetingProvider: 'zoom' })}
                    >
                      Zoom
                    </button>
                    <button
                      type="button"
                      className={(selectedBookedSession.meetingProvider || 'zoom') === 'google' ? 'toggle-btn active' : 'toggle-btn'}
                      onClick={() => setSelectedBookedSession({ ...selectedBookedSession, meetingProvider: 'google' })}
                    >
                      Google Meet
                    </button>
                  </div>
                  </div>
                </div>
              )}
              {(selectedBookedSession.meetingLink || (selectedBookedSession.notes || '').includes('Zoom meeting:')) && (
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formMeetingLink')}</span>
                  <div className="form-field-inline-control">
                  <a href={selectedBookedSession.meetingLink || (selectedBookedSession.notes || '').match(/Zoom meeting:\s*(https?:\/\/[^\s\n]+)/)?.[1]} target="_blank" rel="noopener noreferrer" className="linkish">
                    {(selectedBookedSession.meetingProvider === 'google' || (selectedBookedSession.meetingLink || '').includes('meet.google.com')) ? t('formOpenGoogleMeet') : t('formOpenZoom')}
                  </a>
                  </div>
                </div>
              )}
              <div className="form-row form-row-infield stretch">
                <span className="form-field-inline-label">{t('formNotes')}</span>
                <div className="form-field-inline-control">
                <SessionNotesTextarea
                  value={(selectedBookedSession.meetingLink ? (selectedBookedSession.notes || '').replace(/\n?Zoom meeting:\s*https?:\/\/[^\s\n]+/g, '').trim() : selectedBookedSession.notes) || ''}
                  onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, notes: e.target.value })}
                />
                </div>
              </div>
            </div>
            </div>
            <div
              className={`row gap booking-side-panel-footer${compactSessionEditHeader && !confirmDelete ? ' booking-side-panel-footer--hidden' : ''}`}
              style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            >
              {confirmDelete ? (
                <>
                  <span className="muted">{t('formDeleteSessionQuestion')}</span>
                  <button className="danger" onClick={deleteBookedSession}>{t('formYesDelete')}</button>
                  <button className="secondary" onClick={() => setConfirmDelete(false)}>{t('formCancel')}</button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="calendar-form-footer-btn calendar-form-footer-btn--delete"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <CalendarFormFooterDeleteIcon />
                    <span className="calendar-form-footer-btn__label">{t('formDeleteSession')}</span>
                  </button>
                  <button
                    type="button"
                    className="calendar-form-footer-btn calendar-form-footer-btn--save"
                    onClick={() => void updateBookedSession()}
                    disabled={selectedBookedClientIds.length === 0 && !bookedClientSearch.trim()}
                  >
                    <CalendarFormFooterSaveIcon />
                    <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedPersonalBlock && (
        <div className={useBookingSidePanel ? 'modal-backdrop booking-side-panel-backdrop' : 'calendar-session-popup-layer'} onClick={useBookingSidePanel ? closePersonalModal : undefined}>
          <div
            ref={!useBookingSidePanel ? sessionPopupRef : undefined}
            className={useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel'}
            style={!useBookingSidePanel && sessionPopupPosition ? { left: sessionPopupPosition.left, top: sessionPopupPosition.top } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${compactSessionEditHeader ? ' booking-side-panel-header--compact-booking' : ''}`}>
              {compactSessionEditHeader ? (
                <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit">
                  <button type="button" className="secondary booking-side-panel-close" onClick={closePersonalModal} aria-label={t('mobileNavClose')}>
                    ×
                  </button>
                  <div className="booking-side-panel-header-ico-group">
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--delete"
                      onClick={deletePersonalBlock}
                      aria-label={t('formDelete')}
                      title={t('formDelete')}
                    >
                      <CalendarFormFooterDeleteIcon />
                      <span className="calendar-form-footer-btn__label">{t('formDelete')}</span>
                    </button>
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--save"
                      onClick={updatePersonalBlock}
                      aria-label={t('formSave')}
                      title={t('formSave')}
                    >
                      <CalendarFormFooterSaveIcon />
                      <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <PageHeader
                  title={t('formPersonalBlockEditTitle')}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={closePersonalModal} aria-label={t('mobileNavClose')}>×</button>}
                />
              )}
            </div>
            <div className="booking-side-panel-body">
            <div className="form-row-layout">
              <div className="form-row form-row-infield">
                <span className="form-field-inline-label">{t('formTask')}</span>
                <div className="form-field-inline-control">
                <PersonalTaskCombo
                  value={selectedPersonalBlock.task || ''}
                  onChange={(task) => setSelectedPersonalBlock({ ...selectedPersonalBlock, task })}
                  placeholder={t('formTaskCalendarNamePlaceholder')}
                  presets={personalTaskPresets}
                  dropdownOpen={personalTaskPresetDropdownOpen}
                  onDropdownOpenChange={setPersonalTaskPresetDropdownOpen}
                  selectPredefinedLabel={t('formSelectPredefinedTask')}
                  noMatchLabel={t('formNoTaskPresetsMatch')}
                />
                </div>
              </div>
              <div className="form-row form-row-timespan">
                <CalendarLocalTimespanRow
                  startValue={selectedPersonalBlock.startTime}
                  endValue={selectedPersonalBlock.endTime}
                  onCommitStart={(s) =>
                    setSelectedPersonalBlock((prev: any) => (prev ? { ...prev, startTime: s } : prev))
                  }
                  onCommitEnd={(s) =>
                    setSelectedPersonalBlock((prev: any) => (prev ? { ...prev, endTime: s } : prev))
                  }
                  normalize={normalizeToLocalDateTime}
                  labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                  allDayToggle={{
                    checked: isLocalBookingAllDay(selectedPersonalBlock.startTime, selectedPersonalBlock.endTime),
                    onToggle: () => {
                      setSelectedPersonalBlock((prev: any) => {
                        if (!prev) return prev
                        if (isLocalBookingAllDay(prev.startTime, prev.endTime)) {
                          const d =
                            splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                          const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                          const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                          const end = getBookingEndTimeForStart(start, null)
                          return { ...prev, startTime: start, endTime: end }
                        }
                        const d =
                          splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                        return {
                          ...prev,
                          startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                          endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                        }
                      })
                    },
                    label: t('formAllDay'),
                    captionId: personalEditAllDayCaptionId,
                  }}
                  onCommitAllDayDate={(ymd) => {
                    setSelectedPersonalBlock((prev: any) =>
                      prev
                        ? {
                            ...prev,
                            startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                            endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                          }
                        : prev,
                    )
                  }}
                />
              </div>
              <div className="form-row form-row-infield stretch">
                <span className="form-field-inline-label">{t('formNotes')}</span>
                <div className="form-field-inline-control">
                <SessionNotesTextarea value={selectedPersonalBlock.notes || ''} onChange={(e) => setSelectedPersonalBlock({ ...selectedPersonalBlock, notes: e.target.value })} />
                </div>
              </div>
            </div>
            </div>
            <div
              className={`row gap booking-side-panel-footer${compactSessionEditHeader ? ' booking-side-panel-footer--hidden' : ''}`}
              style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            >
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--delete" onClick={deletePersonalBlock}>
                <CalendarFormFooterDeleteIcon />
                <span className="calendar-form-footer-btn__label">{t('formDelete')}</span>
              </button>
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--save" onClick={updatePersonalBlock}>
                <CalendarFormFooterSaveIcon />
                <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTodo && (
        <div
          className={useBookingSidePanel ? 'modal-backdrop booking-side-panel-backdrop' : 'calendar-session-popup-layer'}
          onClick={useBookingSidePanel ? closeTodoModal : undefined}
        >
          <div
            ref={!useBookingSidePanel ? sessionPopupRef : undefined}
            className={useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel'}
            style={!useBookingSidePanel && sessionPopupPosition ? { left: sessionPopupPosition.left, top: sessionPopupPosition.top } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${compactSessionEditHeader ? ' booking-side-panel-header--compact-booking' : ''}`}>
              {compactSessionEditHeader ? (
                <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit">
                  <button type="button" className="secondary booking-side-panel-close" onClick={closeTodoModal} aria-label={t('mobileNavClose')}>
                    ×
                  </button>
                  <div className="booking-side-panel-header-ico-group">
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--delete"
                      onClick={deleteTodo}
                      aria-label={t('formDelete')}
                      title={t('formDelete')}
                    >
                      <CalendarFormFooterDeleteIcon />
                      <span className="calendar-form-footer-btn__label">{t('formDelete')}</span>
                    </button>
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--save"
                      onClick={updateTodo}
                      aria-label={t('formSave')}
                      title={t('formSave')}
                    >
                      <CalendarFormFooterSaveIcon />
                      <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <PageHeader
                  title={t('formTodoEditTitle')}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeTodoModal} aria-label={t('mobileNavClose')}>×</button>}
                />
              )}
            </div>
            <div className="booking-side-panel-body">
              <div className="form-row-layout">
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formTask')}</span>
                  <div className="form-field-inline-control">
                  <input value={selectedTodo.task || ''} onChange={(e) => setSelectedTodo({ ...selectedTodo, task: e.target.value })} />
                  </div>
                </div>
                <div className="form-row form-row-timespan">
                  <CalendarLocalTimeDateRow
                    value={selectedTodo.startTime}
                    onCommit={(s) => setSelectedTodo((prev: any) => (prev ? { ...prev, startTime: s } : prev))}
                    normalize={normalizeToLocalDateTime}
                    labels={{ time: t('formTimeFrom'), date: t('formCalendarDate') }}
                    allDayToggle={{
                      checked: isLocalTodoAllDayStart(selectedTodo.startTime),
                      onToggle: () => {
                        setSelectedTodo((prev: any) => {
                          if (!prev) return prev
                          if (isLocalTodoAllDayStart(prev.startTime)) {
                            const d =
                              splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                            const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                            return { ...prev, startTime: normalizeToLocalDateTime(`${d}T${hm}:00`) }
                          }
                          const d =
                            splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                          return { ...prev, startTime: normalizeToLocalDateTime(`${d}T00:00:00`) }
                        })
                      },
                      label: t('formAllDay'),
                      captionId: todoEditAllDayCaptionId,
                    }}
                    onCommitAllDayDate={(ymd) => {
                      setSelectedTodo((prev: any) =>
                        prev ? { ...prev, startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`) } : prev,
                      )
                    }}
                  />
                </div>
                <div className="form-row form-row-infield stretch">
                  <span className="form-field-inline-label">{t('formNotes')}</span>
                  <div className="form-field-inline-control">
                  <SessionNotesTextarea value={selectedTodo.notes || ''} onChange={(e) => setSelectedTodo({ ...selectedTodo, notes: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
            <div
              className={`row gap booking-side-panel-footer${compactSessionEditHeader ? ' booking-side-panel-footer--hidden' : ''}`}
              style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            >
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--delete" onClick={deleteTodo}>
                <CalendarFormFooterDeleteIcon />
                <span className="calendar-form-footer-btn__label">{t('formDelete')}</span>
              </button>
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--save" onClick={updateTodo}>
                <CalendarFormFooterSaveIcon />
                <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selection && (
        <div
          className={useBookingSidePanel ? 'modal-backdrop booking-side-panel-backdrop' : 'calendar-session-popup-layer'}
          onClick={useBookingSidePanel ? closeBookingSelection : undefined}
        >
          <div
            ref={!useBookingSidePanel ? sessionPopupRef : undefined}
            className={useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel'}
            style={!useBookingSidePanel && sessionPopupPosition ? { left: sessionPopupPosition.left, top: sessionPopupPosition.top, maxHeight: `calc(100vh - ${sessionPopupPosition.top + 12}px)` } : undefined}
            onClick={(e) => {
              e.stopPropagation()
              setClientDropdownOpen(false)
              setEditingClientSearch(false)
            }}
          >
            <div
              className={`booking-side-panel-header${
                compactSelectionHeader ? ' booking-side-panel-header--compact-booking' : ''
              }`}
            >
              {compactSelectionHeader ? (
                <div className="booking-side-panel-header-toolbar">
                  <button
                    type="button"
                    className="secondary booking-side-panel-close"
                    onClick={closeBookingSelection}
                    aria-label={t('formBookSessionCloseAria')}
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    className={`booking-side-panel-submit-check${
                      availabilitySelection != null && availabilityIntent === 'block' ? ' booking-side-panel-submit-check--block' : ''
                    }`}
                    onClick={() =>
                      void (availabilitySelection != null ? confirmAvailabilityFromHeader() : saveBooking(false))
                    }
                    disabled={availabilitySelection != null ? availabilitySaving : saveBookingLoading}
                    aria-label={compactSelectionCheckAria}
                    title={compactSelectionCheckAria}
                  >
                    {availabilitySelection != null ? (
                      availabilitySaving ? (
                        <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )
                    ) : saveBookingLoading ? (
                      <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                </div>
              ) : (
                <PageHeader
                  title={renderBookingModeTitle()}
                  actions={
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeBookingSelection} aria-label={t('formBookSessionCloseAria')}>
                      ×
                    </button>
                  }
                />
              )}
            </div>
            <div
              className="booking-side-panel-body"
              style={
                useBookingSidePanel && !isNativeAndroid ? { touchAction: 'pan-y' as const } : undefined
              }
              onTouchStart={useBookingSidePanel && !isNativeAndroid ? onNewFormPanelTouchStart : undefined}
              onTouchEnd={useBookingSidePanel && !isNativeAndroid ? onNewFormPanelTouchEnd : undefined}
            >
            {!isNativeAndroid && (
              <div className="booking-type-switcher">
                <button
                  type="button"
                  className={!availabilitySelection && !form.todo && !form.personal ? 'booking-type-btn active' : 'booking-type-btn'}
                  onClick={() => activateNewFormPanel('booking')}
                >
                  <span className="booking-type-btn-label">{t('formBooking')}</span>
                </button>
                {personalModuleEnabled && (
                <button
                  type="button"
                  className={!availabilitySelection && form.personal ? 'booking-type-btn active' : 'booking-type-btn'}
                  onClick={() => activateNewFormPanel('personal')}
                >
                  <span className="booking-type-btn-label">{t('formPersonal')}</span>
                </button>
                )}
                {todosModuleEnabled && (
                <button
                  type="button"
                  className={!availabilitySelection && form.todo ? 'booking-type-btn active' : 'booking-type-btn'}
                  onClick={() => activateNewFormPanel('todo')}
                >
                  <span className="booking-type-btn-label">{t('formTodo')}</span>
                </button>
                )}
                <button
                  type="button"
                  className={availabilitySelection ? 'booking-type-btn active' : 'booking-type-btn'}
                  onClick={() => {
                    const start = form.startTime || selection?.start
                    const end = form.endTime || selection?.end
                    if (!start || !end) return
                    openAvailabilityModalFromSelection(start, end, form.consultantId ?? null, {
                      skipCompactNavigate: useBookingSidePanel && location.pathname === ROUTE_NEW_BOOKING,
                    })
                  }}
                >
                  <span className="booking-type-btn-label">{t('calendarModeAvailability')}</span>
                </button>
              </div>
            )}
            <div className="form-row-layout">
              {availabilitySelection ? (
                <>
                  {showBookingConsultantRow && (
                    <div className="form-row form-row-infield">
                      <span className="form-field-inline-label">{t('formConsultant')}</span>
                      <div className="form-field-inline-control">
                      <select
                        value={availabilitySelection.consultantId || ''}
                        onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, consultantId: Number(e.target.value) || null })}
                      >
                        <option value="">{t('formSelectConsultant')}</option>
                        {metaConsultants.map((c: any) => (
                          <option key={c.id} value={c.id}>{fullName(c)}</option>
                        ))}
                      </select>
                      </div>
                    </div>
                  )}
                  <div className="form-row form-row-infield form-row--bare">
                    <span className="form-field-inline-label">{t('formAvailabilityAction')}</span>
                    <div className="form-field-inline-control">
                      <div className="online-live-switch-row online-live-switch-row--inline" role="group" aria-label={`${t('formAvailabilityOpenShort')} / ${t('formBlockAvailabilityShort')}`}>
                        <span className={`online-live-switch-text${availabilityIntent === 'add' ? ' online-live-switch-text--active' : ''}`}>{t('formAvailabilityOpenShort')}</span>
                        <label className="repeats-toggle-switch online-live-repeats-switch availability-intent-toggle">
                          <input
                            type="checkbox"
                            checked={availabilityIntent === 'block'}
                            onChange={(e) => setAvailabilityIntent(e.target.checked ? 'block' : 'add')}
                            aria-label={t('formAvailabilityAction')}
                          />
                          <span className="repeats-toggle-slider" />
                        </label>
                        <span className={`online-live-switch-text${availabilityIntent === 'block' ? ' online-live-switch-text--active' : ''}`}>{t('formBlockAvailabilityShort')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="form-row form-row-timespan">
                    <CalendarLocalTimespanRow
                      startValue={availabilitySelection.startTime}
                      endValue={availabilitySelection.endTime}
                      onCommitStart={(s) =>
                        setAvailabilitySelection((prev: any) => (prev ? { ...prev, startTime: s } : prev))
                      }
                      onCommitEnd={(s) =>
                        setAvailabilitySelection((prev: any) => (prev ? { ...prev, endTime: s } : prev))
                      }
                      normalize={normalizeToLocalDateTime}
                      labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                      allDayToggle={{
                        checked: isLocalBookingAllDay(
                          availabilitySelection.startTime,
                          availabilitySelection.endTime,
                        ),
                        onToggle: () => {
                          setAvailabilitySelection((prev: any) => {
                            if (!prev) return prev
                            if (isLocalBookingAllDay(prev.startTime, prev.endTime)) {
                              const d =
                                splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date ||
                                localTodayYmd()
                              const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                              const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                              const end = getBookingEndTimeForStart(start, null)
                              return { ...prev, startTime: start, endTime: end }
                            }
                            const d =
                              splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                            return {
                              ...prev,
                              startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                              endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                            }
                          })
                        },
                        label: t('formAllDay'),
                        captionId: availabilityAllDayCaptionId,
                      }}
                      onCommitAllDayDate={(ymd) => {
                        setAvailabilitySelection((prev: any) =>
                          prev
                            ? {
                                ...prev,
                                startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                                endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                              }
                            : prev,
                        )
                      }}
                    />
                  </div>
                  <div className="form-row form-row-infield form-row--bare">
                    <span className="form-field-inline-label">{t('calendarRepeat')}</span>
                    <div className="form-field-inline-control">
                      <div className="online-live-switch-row online-live-switch-row--inline" role="group" aria-label={`${t('formLimited')} / ${t('formIndefinite')}`}>
                        <span className={`online-live-switch-text${!availabilitySelection.indefinite ? ' online-live-switch-text--active' : ''}`}>{t('formLimited')}</span>
                        <label className="repeats-toggle-switch online-live-repeats-switch availability-repeat-toggle">
                          <input
                            type="checkbox"
                            checked={!!availabilitySelection.indefinite}
                            onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, indefinite: e.target.checked })}
                            aria-label={t('calendarRepeat')}
                          />
                          <span className="repeats-toggle-slider" />
                        </label>
                        <span className={`online-live-switch-text${availabilitySelection.indefinite ? ' online-live-switch-text--active' : ''}`}>{t('formIndefinite')}</span>
                      </div>
                    </div>
                  </div>
                  {!availabilitySelection.indefinite && (
                    <div className="form-row form-row-timespan">
                      <div className="calendar-timespan-row calendar-timespan-row--two calendar-availability-datum-row">
                        <div className="calendar-timespan-field calendar-timespan-field--date">
                          <div className="calendar-timespan-input-inner">
                            <span className="calendar-timespan-label">{t('formStartDate')}</span>
                            <input
                              ref={availabilityRangeStartInputRef}
                              type="date"
                              value={availabilitySelection.rangeStartDate || availabilitySelection.startTime?.slice(0, 10) || ''}
                              onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, rangeStartDate: e.target.value })}
                              aria-label={t('formStartDate')}
                            />
                          </div>
                        </div>
                        <div className="calendar-timespan-field calendar-timespan-field--date">
                          <div className="calendar-timespan-input-inner">
                            <span className="calendar-timespan-label">{t('formEndDate')}</span>
                            <input
                              ref={availabilityRangeEndInputRef}
                              type="date"
                              value={availabilitySelection.rangeEndDate || availabilitySelection.endTime?.slice(0, 10) || ''}
                              onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, rangeEndDate: e.target.value })}
                              aria-label={t('formEndDate')}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : form.todo ? (
                <>
                  <div className="form-row form-row-infield">
                    <span className="form-field-inline-label">{t('formTask')}</span>
                    <div className="form-field-inline-control">
                    <input placeholder={t('formTaskNamePlaceholder')} value={form.task || ''} onChange={(e) => setForm({ ...form, task: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row form-row-timespan">
                    <CalendarLocalTimeDateRow
                      value={form.startTime}
                      onCommit={(s) => setForm((f: any) => ({ ...f, startTime: s }))}
                      normalize={normalizeToLocalDateTime}
                      labels={{ time: t('formTimeFrom'), date: t('formCalendarDate') }}
                      allDayToggle={{
                        checked: isLocalTodoAllDayStart(form.startTime),
                        onToggle: () => {
                          setForm((f: any) => {
                            if (isLocalTodoAllDayStart(f.startTime)) {
                              const d =
                                splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                              const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                              return { ...f, startTime: normalizeToLocalDateTime(`${d}T${hm}:00`) }
                            }
                            const d =
                              splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                            return { ...f, startTime: normalizeToLocalDateTime(`${d}T00:00:00`) }
                          })
                        },
                        label: t('formAllDay'),
                        captionId: todoFormAllDayCaptionId,
                      }}
                      onCommitAllDayDate={(ymd) => {
                        setForm((f: any) => ({ ...f, startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`) }))
                      }}
                    />
                  </div>
                  <div className="form-row form-row-infield stretch">
                    <span className="form-field-inline-label">{t('formNotes')}</span>
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : form.personal ? (
                <>
                  <div className="form-row form-row-infield">
                    <span className="form-field-inline-label">{t('formTask')}</span>
                    <div className="form-field-inline-control">
                    <PersonalTaskCombo
                      value={form.task || ''}
                      onChange={(task) => setForm({ ...form, task })}
                      placeholder={t('formTaskCalendarNamePlaceholder')}
                      presets={personalTaskPresets}
                      dropdownOpen={personalTaskPresetDropdownOpen}
                      onDropdownOpenChange={setPersonalTaskPresetDropdownOpen}
                      selectPredefinedLabel={t('formSelectPredefinedTask')}
                      noMatchLabel={t('formNoTaskPresetsMatch')}
                    />
                    </div>
                  </div>
                  <div className="form-row form-row-timespan">
                    <CalendarLocalTimespanRow
                      startValue={form.startTime}
                      endValue={form.endTime}
                      onCommitStart={(s) => setForm((f: any) => ({ ...f, startTime: s }))}
                      onCommitEnd={(s) => setForm((f: any) => ({ ...f, endTime: s }))}
                      normalize={normalizeToLocalDateTime}
                      labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                      allDayToggle={{
                        checked: isLocalBookingAllDay(form.startTime, form.endTime),
                        onToggle: () => {
                          setForm((f: any) => {
                            if (isLocalBookingAllDay(f.startTime, f.endTime)) {
                              const d =
                                splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                              const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                              const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                              const end = getBookingEndTimeForStart(start, null)
                              return { ...f, startTime: start, endTime: end }
                            }
                            const d =
                              splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                            return {
                              ...f,
                              startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                              endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                            }
                          })
                        },
                        label: t('formAllDay'),
                        captionId: personalFormAllDayCaptionId,
                      }}
                      onCommitAllDayDate={(ymd) => {
                        setForm((f: any) => ({
                          ...f,
                          startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                          endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                        }))
                      }}
                    />
                  </div>
                  <div className="form-row form-row-infield stretch">
                    <span className="form-field-inline-label">{t('formNotes')}</span>
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
              <div className={`form-row form-row-infield${groupBookingEnabled ? ' calendar-booking-client-with-group' : ''}`}>
                {groupBookingEnabled ? (
                  <div className="calendar-booking-service-infield-head">
                    <span className="form-field-inline-label">
                      {bookingGroupMode ? t('formGroup') : t(multipleClientsPerSessionEnabled ? 'formClients' : 'formClient')}
                    </span>
                    <div className="calendar-booking-service-online-line" role="group" aria-label={t('formGroupToggle')}>
                      <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formGroupToggle')}>
                        <input
                          type="checkbox"
                          checked={bookingGroupMode}
                          aria-labelledby={addBookingGroupCaptionId}
                          onChange={(e) => {
                            const on = e.target.checked
                            setBookingGroupMode(on)
                            if (on) {
                              setForm((prev: any) => ({ ...prev, clientId: null, clientIds: [] }))
                            } else {
                              setForm((prev: any) => ({ ...prev, groupId: null }))
                              setGroupSearch('')
                              setGroupDropdownOpen(false)
                              setEditingGroupSearch(false)
                            }
                          }}
                        />
                        <span className="repeats-toggle-slider" />
                      </label>
                      <span id={addBookingGroupCaptionId} className="calendar-booking-service-online-caption">
                        {t('formGroupToggle')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="form-field-inline-label">{t(multipleClientsPerSessionEnabled ? 'formClients' : 'formClient')}</span>
                )}
                <div className="form-field-inline-control">
                  {groupBookingEnabled && bookingGroupMode ? (
                    <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                      <div className="calendar-client-picker__search-row">
                        <div className={`client-search-wrap calendar-client-picker__search-wrap${bookSessionGroupFieldCompact ? ' client-search-wrap--compact-client' : ''}`}>
                          <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          </span>
                          {bookSessionGroupFieldCompact ? (
                            <button
                              type="button"
                              className="client-selected-display"
                              onClick={() => {
                                setEditingGroupSearch(true)
                                setGroupSearch('')
                                setGroupDropdownOpen(true)
                              }}
                            >
                              {selectedGroup!.name}
                            </button>
                          ) : (
                            <input
                              ref={groupSearchInputRef}
                              placeholder={groupSearchPlaceholder}
                              value={groupSearch}
                              onChange={(e) => {
                                setGroupSearch(e.target.value)
                                setEditingGroupSearch(true)
                                setGroupDropdownOpen(true)
                              }}
                              onFocus={() => {
                                setEditingGroupSearch(true)
                                setGroupDropdownOpen(true)
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setGroupDropdownOpen(false)
                                  const typed = groupSearch.trim()
                                  if (typed && selectedGroup) {
                                    if ((selectedGroup.name || '').toLowerCase() !== typed.toLowerCase()) {
                                      setForm((prev: any) => ({ ...prev, groupId: null }))
                                    } else {
                                      setGroupSearch('')
                                    }
                                  } else if (!typed) {
                                    setGroupSearch('')
                                  }
                                  setEditingGroupSearch(false)
                                }, 0)
                              }}
                            />
                          )}
                        </div>
                        <div className="calendar-client-picker__actions">
                          {!!selectedGroup && (
                            <button
                              type="button"
                              className="secondary calendar-client-picker__clear-btn"
                              title={clearSingleGroupTitle}
                              aria-label={clearSingleGroupTitle}
                              onClick={(e) => {
                                e.stopPropagation()
                                setForm((prev: any) => ({ ...prev, groupId: null }))
                                setGroupSearch('')
                                setEditingGroupSearch(false)
                                setGroupDropdownOpen(false)
                              }}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="secondary calendar-client-picker__details-btn"
                            title={t('calendarGroupDetails')}
                            aria-label={t('calendarGroupDetails')}
                            disabled={!form.groupId}
                            onClick={() => openCalendarGroupDetails(form.groupId)}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M20 21a8 8 0 0 0-16 0"/>
                              <circle cx="12" cy="7" r="4"/>
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="secondary client-add-btn calendar-client-picker__add-btn"
                            title={addGroupInlineTitle}
                            aria-label={addGroupInlineTitle}
                            onClick={() => {
                              setGroupDropdownOpen(false)
                              setNewGroupForm((prev) => ({ ...prev, name: groupSearch.trim() }))
                              setGroupModalError('')
                              setShowAddGroupModal(true)
                            }}
                          >
                            <span aria-hidden>+</span>
                          </button>
                        </div>
                      </div>
                      {groupDropdownOpen && (
                        <div className="client-dropdown-panel calendar-client-picker__dropdown" onMouseDown={(e) => e.preventDefault()}>
                          {visibleGroups.slice(0, 10).map((g: any) => (
                            <button
                              key={g.id}
                              type="button"
                              className={`client-list-item${form.groupId === g.id ? ' selected' : ''}`}
                              onClick={() => {
                                const seedIds = (g.members ?? []).map((m: any) => m.id).filter((id: number) => Number.isFinite(id) && id > 0)
                                setForm((prev: any) => ({
                                  ...prev,
                                  groupId: g.id,
                                  ...(seedIds.length > 0
                                    ? { clientIds: seedIds, clientId: seedIds[0] ?? null }
                                    : { clientIds: [], clientId: null }),
                                }))
                                setGroupDropdownOpen(false)
                                setEditingGroupSearch(false)
                                setGroupSearch('')
                              }}
                            >
                              {g.name}
                              <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                                ({(g.members ?? []).length})
                              </span>
                            </button>
                          ))}
                          {visibleGroups.length === 0 && <span className="muted">{t('formNoGroupsFoundAddOne')}</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                  <div className="calendar-client-picker__search-row">
                    <div className={`client-search-wrap calendar-client-picker__search-wrap${bookSessionClientFieldCompact ? ' client-search-wrap--compact-client' : ''}`}>
                      <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      </span>
                      {bookSessionClientFieldCompact ? (
                        <button
                          type="button"
                          className="client-selected-display"
                          onClick={() => {
                            setEditingClientSearch(true)
                            setClientSearch('')
                            setClientDropdownOpen(true)
                          }}
                        >
                          {fullName(bookSessionSelectedClient!)}
                        </button>
                      ) : (
                        <input
                          ref={clientSearchInputRef}
                          placeholder={clientSearchPlaceholder}
                          value={clientSearch}
                          onChange={(e) => {
                            setClientSearch(e.target.value)
                            setEditingClientSearch(true)
                            setClientDropdownOpen(true)
                          }}
                          onFocus={() => {
                            setEditingClientSearch(true)
                            setClientDropdownOpen(true)
                          }}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setClientDropdownOpen(false)
                              if (multipleClientsPerSessionEnabled) {
                                setEditingClientSearch(false)
                                return
                              }
                              const typed = clientSearch.trim()
                              if (typed && bookSessionSelectedClient) {
                                if (fullName(bookSessionSelectedClient).toLowerCase() !== typed.toLowerCase()) {
                                  applyFormClientIds([])
                                } else {
                                  setClientSearch('')
                                }
                              } else if (!typed) {
                                setClientSearch('')
                              }
                              setEditingClientSearch(false)
                            }, 0)
                          }}
                        />
                      )}
                    </div>
                    <div className="calendar-client-picker__actions">
                      {!multipleClientsPerSessionEnabled && bookSessionSelectedClient?.id && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__clear-btn"
                          title={clearSingleClientTitle}
                          aria-label={clearSingleClientTitle}
                          onClick={(e) => {
                            e.stopPropagation()
                            applyFormClientIds([])
                            setClientSearch('')
                            setEditingClientSearch(false)
                            setClientDropdownOpen(false)
                          }}
                        >
                          <span aria-hidden>×</span>
                        </button>
                      )}
                      {!multipleClientsPerSessionEnabled && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__details-btn"
                          title={t('calendarClientDetails')}
                          aria-label={t('calendarClientDetails')}
                          disabled={!bookSessionSelectedClient?.id}
                          onClick={() => openCalendarClientDetails(bookSessionSelectedClient?.id)}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M20 21a8 8 0 0 0-16 0"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary client-add-btn calendar-client-picker__add-btn"
                        title={addClientInlineTitle}
                        aria-label={addClientInlineTitle}
                        onClick={() => {
                          setClientDropdownOpen(false)
                          const p = parseClientNameInput(clientSearch)
                          setNewClientForm((prev) => ({ ...prev, firstName: p.firstName, lastName: p.lastName }))
                          setShowAddClientModal(true)
                        }}
                      >
                        <span aria-hidden>+</span>
                      </button>
                    </div>
                    {clientDropdownOpen && (
                      <div className="client-dropdown-panel calendar-client-picker__dropdown" onMouseDown={(e) => e.preventDefault()}>
                        {visibleClients.slice(0, 10).map((client: any) => (
                          <button
                            key={client.id}
                            type="button"
                            className={`client-list-item ${selectedFormClientIds.includes(client.id) ? 'selected' : ''}`}
                            onClick={() => {
                              if (multipleClientsPerSessionEnabled) {
                                const nextIds = selectedFormClientIds.includes(client.id)
                                  ? selectedFormClientIds.filter((id) => id !== client.id)
                                  : [...selectedFormClientIds, client.id]
                                applyFormClientIds(nextIds)
                              } else {
                                setForm({ ...form, clientId: client.id, clientIds: [client.id] })
                                setClientDropdownOpen(false)
                                setEditingClientSearch(false)
                              }
                              setClientSearch('')
                            }}
                          >
                            {fullName(client)}
                          </button>
                        ))}
                        {visibleClients.length === 0 && <span className="muted">{t('formNoClientsFoundAddOne')}</span>}
                      </div>
                    )}
                  </div>
                  {multipleClientsPerSessionEnabled && bookSessionSelectedClients.length > 0 && (
                    <div className="calendar-multi-client-chips">
                      {visibleBookSessionClientChips.map((client: any) => (
                        <div key={client.id} className="calendar-multi-client-chip">
                          <button
                            type="button"
                            className="calendar-multi-client-chip__label"
                            onClick={() => openCalendarClientDetails(client.id)}
                            title={t('calendarClientDetails')}
                          >
                            {fullName(client)}
                          </button>
                          <button
                            type="button"
                            className="calendar-multi-client-chip__remove"
                            aria-label={`${t('formDelete')} ${fullName(client)}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              applyFormClientIds(selectedFormClientIds.filter((id) => id !== client.id))
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {hiddenBookSessionClientCount > 0 && !bookSessionClientsExpanded && (
                        <button
                          type="button"
                          className="calendar-multi-client-more"
                          onClick={() => setBookSessionClientsExpanded(true)}
                        >
                          {getMoreClientsLabel(hiddenBookSessionClientCount)}
                        </button>
                      )}
                      {bookSessionClientsExpanded && bookSessionSelectedClients.length > 3 && (
                        <button
                          type="button"
                          className="calendar-multi-client-more calendar-multi-client-more--secondary"
                          onClick={() => setBookSessionClientsExpanded(false)}
                        >
                          {showLessClientsLabel}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                  )}
                </div>
              </div>
              {showBookingConsultantRow && (
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formConsultant')}</span>
                  <div className="form-field-inline-control">
                  <select disabled={form.todo || form.personal} value={form.consultantId ?? ''} onChange={(e) => setForm({ ...form, consultantId: e.target.value === '' ? null : Number(e.target.value) })}><option value="">{t('formUnassigned')}</option>{metaConsultants.map((c: any) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}                  </select>
                  </div>
                </div>
              )}
              {!form.todo && !form.personal && !availabilitySelection && showBookingTypeRow && (
                <div className={`form-row form-row-infield${!isNativeAndroid ? ' calendar-booking-service-with-online' : ''}`}>
                  {!isNativeAndroid ? (
                    <>
                      <div className="calendar-booking-service-infield-head">
                        <span className="form-field-inline-label">{t('formCalendarBookingService')}</span>
                        <div className="calendar-booking-service-online-line" role="group" aria-label={t('formSessionOnlineShort')}>
                          <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formSessionOnlineShort')}>
                            <input
                              type="checkbox"
                              checked={!!form.online}
                              aria-labelledby={addBookingOnlineCaptionId}
                              onChange={(e) => {
                                const on = e.target.checked
                                if (on) {
                                  setForm({ ...form, online: true })
                                  setMeetingPickerCancelUnchecksOnline(true)
                                  setMeetingProviderPickerOpen(true)
                                } else {
                                  setForm({ ...form, online: false })
                                  setMeetingProviderPickerOpen(false)
                                  setMeetingPickerCancelUnchecksOnline(false)
                                }
                              }}
                            />
                            <span className="repeats-toggle-slider" />
                          </label>
                          <span id={addBookingOnlineCaptionId} className="calendar-booking-service-online-caption">
                            {t('formSessionOnlineShort')}
                          </span>
                        </div>
                      </div>
                      <div className="form-field-inline-control calendar-booking-service-select-only">
                        <select
                          value={form.typeId || ''}
                          onChange={(e) => updateBookingFormType(Number(e.target.value) || null)}
                        >
                          <option value="">{t('formNoType')}</option>
                          {metaTypes.map((ty: any) => (
                            <option key={ty.id} value={ty.id}>
                              {ty.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="form-field-inline-label">{t('formCalendarBookingService')}</span>
                      <div className="form-field-inline-control">
                        <select
                          value={form.typeId || ''}
                          onChange={(e) => updateBookingFormType(Number(e.target.value) || null)}
                        >
                          <option value="">{t('formNoType')}</option>
                          {metaTypes.map((ty: any) => (
                            <option key={ty.id} value={ty.id}>
                              {ty.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!form.todo && !form.personal && !availabilitySelection && showBookingSpaceRow && (
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formCalendarBookingSpace')}</span>
                  <div className="form-field-inline-control">
                  <select value={form.spaceId || ''} onChange={(e) => setForm({ ...form, spaceId: Number(e.target.value) || null })}><option value="">{t('formNoSpace')}</option>{metaSpaces.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  </div>
                </div>
              )}
              <div className="form-row form-row-timespan">
                <CalendarLocalTimespanRow
                  startValue={form.startTime}
                  endValue={form.endTime}
                  onCommitStart={(s) => updateBookingFormStartTime(s)}
                  onCommitEnd={(s) => updateBookingFormEndTime(s)}
                  normalize={normalizeToLocalDateTime}
                  labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                  allDayToggle={{
                    checked: isLocalBookingAllDay(form.startTime, form.endTime),
                    onToggle: () => {
                      setForm((f: any) => {
                        if (isLocalBookingAllDay(f.startTime, f.endTime)) {
                          const d =
                            splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                          const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                          const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                          bookingEndEditedManuallyRef.current = false
                          return {
                            ...f,
                            startTime: start,
                            endTime: getBookingEndTimeForStart(start, f.typeId),
                          }
                        }
                        const d =
                          splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                        bookingEndEditedManuallyRef.current = true
                        return {
                          ...f,
                          startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                          endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                        }
                      })
                    },
                    label: t('formAllDay'),
                    captionId: newBookingAllDayCaptionId,
                  }}
                  onCommitAllDayDate={(ymd) => {
                    bookingEndEditedManuallyRef.current = true
                    setForm((f: any) => ({
                      ...f,
                      startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                      endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                    }))
                  }}
                />
              </div>
              {!form.todo && !form.personal && !availabilitySelection && (() => {
                const dateLoc = locale === 'sl' ? 'sl-SI' : 'en-GB'
                const startDate = form.startTime ? new Date(form.startTime) : null
                const sessionDay = startDate ? REPEAT_WEEKDAY_EN[startDate.getDay()] : 'Monday'
                const sessionDateStr = startDate
                  ? startDate.toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                  : ''
                const repeatInterval = form.repeatInterval ?? 1
                const repeatUnit = form.repeatUnit ?? 'weeks'
                const repeatEndType = form.repeatEndType ?? 'after'
                const repeatEndCount = form.repeatEndCount ?? 5
                const repeatEndDate = form.repeatEndDate ?? ''
                const summaryTail = repeatEndType === 'after'
                  ? t('formRepeatEndsAfter').replace('{count}', String(repeatEndCount))
                  : repeatEndDate
                    ? t('formRepeatEndsOn').replace(
                        '{date}',
                        new Date(repeatEndDate).toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
                      )
                    : t('formRepeatNoEndDate')
                const summaryLine = t('formRepeatSummaryLine').replace('{from}', sessionDateStr).replace('{tail}', summaryTail)
                return (
                  <div className="form-row-repeats-section">
                    <div className="form-row form-row-infield form-row--bare">
                      <span className="form-field-inline-label">{t('formRepeats')}</span>
                      <div className="form-field-inline-control">
                        <label className="repeats-toggle-switch">
                          <input
                            type="checkbox"
                            checked={!!form.repeats}
                            onChange={(e) => setForm({ ...form, repeats: e.target.checked, repeatDay: sessionDay })}
                          />
                          <span className="repeats-toggle-slider" />
                        </label>
                      </div>
                    </div>
                    {form.repeats && (
                      <div className="form-repeats-config">
                        <div className="form-repeats-row">
                          <span className="form-repeats-label">{t('formRepeatsEvery')}</span>
                          <input
                            type="number"
                            min={1}
                            max={52}
                            className="form-repeats-number"
                            value={repeatInterval}
                            onChange={(e) => setForm({ ...form, repeatInterval: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <select
                            className="form-repeats-select"
                            value={repeatUnit}
                            onChange={(e) => setForm({ ...form, repeatUnit: e.target.value })}
                          >
                            <option value="days">{t('formRepeatUnitDays')}</option>
                            <option value="weeks">{t('formRepeatUnitWeeks')}</option>
                            <option value="months">{t('formRepeatUnitMonths')}</option>
                          </select>
                        </div>
                        {repeatUnit === 'weeks' && (
                          <div className="form-repeats-row">
                            <span className="form-repeats-label">{t('formRepeatsOnDay')}</span>
                            <select
                              className="form-repeats-select"
                              value={form.repeatDay ?? sessionDay}
                              onChange={(e) => setForm({ ...form, repeatDay: e.target.value })}
                            >
                              {REPEAT_WEEKDAY_EN.map((d) => (
                                <option key={d} value={d}>{formatRepeatWeekdayLabel(locale, d)}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="form-repeats-row">
                          <span className="form-repeats-label">{t('formRepeatsEnds')}</span>
                          <select
                            className="form-repeats-select"
                            value={repeatEndType}
                            onChange={(e) => setForm({ ...form, repeatEndType: e.target.value })}
                          >
                            <option value="after">{t('formRepeatEndAfter')}</option>
                            <option value="on">{t('formRepeatEndOnDate')}</option>
                          </select>
                          {repeatEndType === 'after' && (
                            <input
                              type="number"
                              min={2}
                              max={100}
                              className="form-repeats-number"
                              value={repeatEndCount}
                              onChange={(e) => setForm({ ...form, repeatEndCount: Math.max(2, Number(e.target.value) || 2) })}
                            />
                          )}
                          {repeatEndType === 'on' && (
                            <input
                              type="date"
                              className="form-repeats-date"
                              value={repeatEndDate}
                              onChange={(e) => setForm({ ...form, repeatEndDate: e.target.value })}
                            />
                          )}
                        </div>
                        <p className="form-repeats-summary muted">
                          {summaryLine}
                        </p>
                        <p className="form-repeats-note muted">
                          {t('formRepeatsSameDurationNote')}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}
              {isNativeAndroid ? (
                <>
                  <div className="form-row form-row-infield book-session-flags-row">
                    <span className="form-field-inline-label">{t('formOptions')}</span>
                    <div className="form-field-inline-control">
                    <div className="checkbox-row book-session-checkbox-row">
                      {todosModuleEnabled && <label><input type="checkbox" checked={!!form.todo} onChange={(e) => setForm({ ...form, todo: e.target.checked, personal: false, online: false, consultantId: e.target.checked ? user.id : form.consultantId })} /> {t('formTodo')}</label>}
                      {personalModuleEnabled && <label><input type="checkbox" checked={!!form.personal} onChange={(e) => setForm({ ...form, personal: e.target.checked, todo: false, consultantId: e.target.checked ? user.id : form.consultantId })} disabled={!!form.todo} /> {t('formPersonal')}</label>}
                      <label><input type="checkbox" checked={!!form.online} onChange={(e) => { const on = e.target.checked; if (on) { setForm({ ...form, online: true }); setMeetingPickerCancelUnchecksOnline(true); setMeetingProviderPickerOpen(true) } else { setForm({ ...form, online: false }); setMeetingProviderPickerOpen(false); setMeetingPickerCancelUnchecksOnline(false) } }} disabled={!!form.personal || !!form.todo} /> {t('formOnline')}</label>
                    </div>
                    </div>
                  </div>
                  {form.online && (
                    <div className="form-row form-row-infield">
                      <span className="form-field-inline-label">{t('formMeeting')}</span>
                      <div className="form-field-inline-control">
                      <div className="meeting-provider-summary">
                        <span>{form.meetingProvider === 'google' ? 'Google Meet' : 'Zoom'}</span>
                        <button
                          type="button"
                          className="secondary meeting-provider-change-btn"
                          onClick={() => {
                            setMeetingPickerCancelUnchecksOnline(false)
                            setMeetingProviderPickerOpen(true)
                          }}
                        >
                          {t('formChange')}
                        </button>
                      </div>
                      </div>
                    </div>
                  )}
                  <div className="form-row form-row-infield stretch book-session-notes-android">
                    <span className="form-field-inline-label">{t('formNotes')}</span>
                    <div className="form-field-inline-control">
                    <div className="book-session-notes-android-wrap">
                      <button
                        type="button"
                        className="secondary book-session-notes-toggle"
                        aria-expanded={bookSessionNotesExpanded}
                        aria-label={bookSessionNotesExpanded ? t('formHideNotes') : t('formAddNotes')}
                        onClick={() => setBookSessionNotesExpanded((v) => !v)}
                      >
                        {bookSessionNotesExpanded ? '−' : '+'}
                      </button>
                      {bookSessionNotesExpanded && (
                        <SessionNotesTextarea
                          className="book-session-notes-textarea"
                          value={form.notes || ''}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        />
                      )}
                    </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-row form-row-infield stretch">
                    <span className="form-field-inline-label">{t('formNotes')}</span>
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                  {form.online && (
                    <div className="form-row form-row-infield">
                      <span className="form-field-inline-label">{t('formMeeting')}</span>
                      <div className="form-field-inline-control">
                        <div className="meeting-provider-summary">
                          <span>{form.meetingProvider === 'google' ? 'Google Meet' : 'Zoom'}</span>
                          <button
                            type="button"
                            className="secondary meeting-provider-change-btn"
                            onClick={() => {
                              setMeetingPickerCancelUnchecksOnline(false)
                              setMeetingProviderPickerOpen(true)
                            }}
                          >
                            {t('formChange')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
                </>
              )}
            </div>
            </div>
            {(availabilitySelection ? availabilityError : saveBookingError) && (
              <div className="calendar-booking-inline-toast-wrap">
                <div className="toast toast-error calendar-booking-inline-toast" role="alert">
                  <span className="toast-message">{availabilitySelection ? availabilityError : saveBookingError}</span>
                  <button
                    type="button"
                    className="toast-dismiss"
                    onClick={() => {
                      if (availabilitySelection) setAvailabilityError(null)
                      else setSaveBookingError(null)
                    }}
                    aria-label="Dismiss booking error"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
            {showSelectionFormFooter && (
            <div className="row gap booking-side-panel-footer" style={{ justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <button
                type="button"
                className="calendar-form-footer-btn calendar-form-footer-btn--save"
                onClick={() => void saveBooking(false)}
                disabled={saveBookingLoading}
              >
                <CalendarFormFooterSaveIcon />
                <span className="calendar-form-footer-btn__label">
                  {saveBookingLoading ? t('formSaving') : form.todo ? t('formAddTodo') : form.personal ? t('formAddBlock') : t('formBookSession')}
                </span>
              </button>
            </div>
            )}
            {!calendarFiltersBottomBar && availabilitySelection != null && (
              <div className="row gap booking-side-panel-footer" style={{ justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <button
                  type="button"
                  className={`calendar-form-footer-btn ${
                    availabilityIntent === 'block' ? 'calendar-form-footer-btn--delete' : 'calendar-form-footer-btn--save'
                  }`}
                  onClick={() => void confirmAvailabilityFromHeader()}
                  disabled={availabilitySaving}
                >
                  <CalendarFormFooterSaveIcon />
                  <span className="calendar-form-footer-btn__label">
                    {availabilitySaving
                      ? t('formSaving')
                      : availabilityIntent === 'block'
                        ? t('formBlockAvailabilityShort')
                        : availabilitySelection.slotId
                          ? t('formSaveChanges')
                          : t('formAvailabilityFooterAdd')}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {meetingProviderPickerOpen && selection && (
        <div
          className="modal-backdrop meeting-provider-picker-backdrop"
          onClick={() => {
            setMeetingProviderPickerOpen(false)
            if (meetingPickerCancelUnchecksOnline) {
              setForm((f: any) => ({ ...f, online: false }))
            }
            setMeetingPickerCancelUnchecksOnline(false)
          }}
        >
          <div className="modal meeting-provider-picker-modal" onClick={(e) => e.stopPropagation()}>
            <p className="meeting-provider-picker-title">Choose meeting</p>
            <p className="muted meeting-provider-picker-hint">Google Meet or Zoom</p>
            <div className="meeting-provider-picker-actions">
              <button
                type="button"
                onClick={() => {
                  setForm((f: any) => ({ ...f, meetingProvider: 'zoom', online: true }))
                  setMeetingProviderPickerOpen(false)
                  setMeetingPickerCancelUnchecksOnline(false)
                }}
              >
                Zoom
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm((f: any) => ({ ...f, meetingProvider: 'google', online: true }))
                  setMeetingProviderPickerOpen(false)
                  setMeetingPickerCancelUnchecksOnline(false)
                }}
              >
                Google Meet
              </button>
            </div>
            <button
              type="button"
              className="secondary meeting-provider-picker-cancel"
              onClick={() => {
                setMeetingProviderPickerOpen(false)
                if (meetingPickerCancelUnchecksOnline) {
                  setForm((f: any) => ({ ...f, online: false }))
                }
                setMeetingPickerCancelUnchecksOnline(false)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {androidLanguageModal && <LanguageModal onClose={() => setAndroidLanguageModal(false)} />}

      {showAddClientModal && (
        <div
          className="modal-backdrop booking-side-panel-backdrop calendar-booking-supplement"
          onClick={() => setShowAddClientModal(false)}
        >
          <div className="modal large-modal booking-side-panel clients-detail-side-panel clients-detail-panel-modern clients-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className={`booking-side-panel-header${calendarFiltersBottomBar ? ' booking-side-panel-header--compact-booking' : ''}`}>
              {calendarFiltersBottomBar ? (
                <div className="booking-side-panel-header-toolbar">
                  <button type="button" className="secondary booking-side-panel-close" onClick={() => setShowAddClientModal(false)} aria-label={t('mobileNavClose')}>
                    ×
                  </button>
                  <button
                    type="button"
                    className="booking-side-panel-submit-check"
                    onClick={() => void createClientFromBooking()}
                    disabled={savingClient}
                    aria-label={locale === 'sl' ? 'Ustvari stranko' : 'Create client'}
                    title={locale === 'sl' ? 'Ustvari stranko' : 'Create client'}
                  >
                    {savingClient ? (
                      <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                </div>
              ) : (
                <PageHeader
                  title={locale === 'sl' ? 'Nova stranka' : 'New client'}
                  subtitle={locale === 'sl' ? 'STRANKA' : 'CLIENT'}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => setShowAddClientModal(false)} aria-label={t('mobileNavClose')}>×</button>}
                />
              )}
            </div>
            <div className="booking-side-panel-body">
              <div className="clients-detail-shell clients-create-shell">
                <div className="clients-detail-hero clients-detail-head-card clients-create-head-card">
                  <span className="clients-name-avatar clients-detail-avatar" aria-hidden>{newClientInitials(newClientForm.firstName, newClientForm.lastName)}</span>
                  <div className="clients-name-stack">
                    <span className="clients-name">{[newClientForm.firstName, newClientForm.lastName].filter(Boolean).join(' ').trim() || (locale === 'sl' ? 'Nova stranka' : 'New client')}</span>
                    <span className="clients-id">{locale === 'sl' ? 'Ustvari stranko in jo poveži s tem terminom.' : 'Create a client and attach them to this session.'}</span>
                  </div>
                </div>

                <div className="clients-detail-fields clients-create-fields">
                  <label className="clients-detail-field-card">
                    <span>{locale === 'sl' ? 'Ime' : 'First name'}</span>
                    <input value={newClientForm.firstName} onChange={(e) => setNewClientForm({ ...newClientForm, firstName: e.target.value })} required />
                  </label>
                  <label className="clients-detail-field-card">
                    <span>{locale === 'sl' ? 'Priimek' : 'Last name'}</span>
                    <input value={newClientForm.lastName} onChange={(e) => setNewClientForm({ ...newClientForm, lastName: e.target.value })} required />
                  </label>
                  <label className="clients-detail-field-card clients-detail-field-card--wide">
                    <span>{locale === 'sl' ? 'E-pošta' : 'Email'}</span>
                    <input type="email" value={newClientForm.email} onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })} />
                  </label>
                  <label className="clients-detail-field-card clients-detail-field-card--wide">
                    <span>{locale === 'sl' ? 'Telefon' : 'Phone'}</span>
                    <input value={newClientForm.phone} onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })} />
                  </label>
                </div>

                {clientError && <div className="error">{clientError}</div>}
              </div>
            </div>
            {!calendarFiltersBottomBar && (
              <div className="form-actions booking-side-panel-footer clients-create-footer">
                <button type="button" onClick={() => void createClientFromBooking()} disabled={savingClient}>{savingClient ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…') : (locale === 'sl' ? 'Ustvari stranko' : 'Create client')}</button>
                <button type="button" className="secondary" onClick={() => setShowAddClientModal(false)}>{t('cancel')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddGroupModal && (
        <div
          className="modal-backdrop booking-side-panel-backdrop calendar-booking-supplement"
          onClick={() => setShowAddGroupModal(false)}
        >
          <div className="modal large-modal booking-side-panel clients-detail-side-panel clients-detail-panel-modern clients-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className={`booking-side-panel-header${calendarFiltersBottomBar ? ' booking-side-panel-header--compact-booking' : ''}`}>
              {calendarFiltersBottomBar ? (
                <div className="booking-side-panel-header-toolbar">
                  <button type="button" className="secondary booking-side-panel-close" onClick={() => setShowAddGroupModal(false)} aria-label={t('mobileNavClose')}>
                    ×
                  </button>
                  <button
                    type="button"
                    className="booking-side-panel-submit-check"
                    onClick={() => void createGroupFromBooking()}
                    disabled={savingNewGroupModal}
                    aria-label={locale === 'sl' ? 'Ustvari skupino' : 'Create group'}
                    title={locale === 'sl' ? 'Ustvari skupino' : 'Create group'}
                  >
                    {savingNewGroupModal ? (
                      <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                </div>
              ) : (
                <PageHeader
                  title={locale === 'sl' ? 'Nova skupina' : 'New group'}
                  subtitle={locale === 'sl' ? 'SKUPINA' : 'GROUP'}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => setShowAddGroupModal(false)} aria-label={t('mobileNavClose')}>×</button>}
                />
              )}
            </div>
            <div className="booking-side-panel-body">
              <div className="clients-detail-shell clients-create-shell">
                <div className="clients-detail-hero clients-detail-head-card clients-create-head-card">
                  <span className="clients-name-avatar clients-detail-avatar" aria-hidden>{(newGroupForm.name?.[0] || 'G').toUpperCase()}</span>
                  <div className="clients-name-stack">
                    <span className="clients-name">{newGroupForm.name.trim() || (locale === 'sl' ? 'Nova skupina' : 'New group')}</span>
                    <span className="clients-id">{locale === 'sl' ? 'Ustvari skupino in jo poveži s tem terminom.' : 'Create a group and attach it to this session.'}</span>
                  </div>
                </div>
                <div className="clients-detail-fields clients-create-fields">
                  <label className="clients-detail-field-card clients-detail-field-card--wide">
                    <span>{locale === 'sl' ? 'Ime skupine' : 'Group name'}</span>
                    <input value={newGroupForm.name} onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })} required />
                  </label>
                  <label className="clients-detail-field-card clients-detail-field-card--wide">
                    <span>{locale === 'sl' ? 'E-pošta (opcijsko)' : 'Email (optional)'}</span>
                    <input type="email" value={newGroupForm.email} onChange={(e) => setNewGroupForm({ ...newGroupForm, email: e.target.value })} />
                  </label>
                </div>
                {groupModalError && <div className="error">{groupModalError}</div>}
              </div>
            </div>
            {!calendarFiltersBottomBar && (
              <div className="form-actions booking-side-panel-footer clients-create-footer">
                <button type="button" onClick={() => void createGroupFromBooking()} disabled={savingNewGroupModal}>
                  {savingNewGroupModal ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…') : (locale === 'sl' ? 'Ustvari skupino' : 'Create group')}
                </button>
                <button type="button" className="secondary" onClick={() => setShowAddGroupModal(false)}>{t('cancel')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      <ClientDetailSidePanel
        clientId={calendarClientDetailId}
        onClose={() => {
          setCalendarClientDetailId(null)
          setCalendarClientDetailRestrictLifecycle(false)
        }}
        showLifecycleActions={!calendarClientDetailRestrictLifecycle}
      />

      <GroupDetailSidePanel
        groupId={calendarGroupDetailId}
        bookingSessionContext={
          calendarGroupDetailBookingId != null && selectedBookedSession?.id === calendarGroupDetailBookingId
            ? {
                bookingId: calendarGroupDetailBookingId,
                sessionGroupEmailOverride: selectedBookedSession.sessionGroupEmailOverride,
                sessionGroupBillingCompany: selectedBookedSession.sessionGroupBillingCompany,
              }
            : null
        }
        onSaveSessionOverrides={
          calendarGroupDetailBookingId != null && selectedBookedSession?.id === calendarGroupDetailBookingId
            ? saveCalendarGroupSessionOverrides
            : undefined
        }
        manageMembersFromCalendar={calendarGroupDetailId != null}
        sessionMembersOverride={calendarGroupSessionMembers ?? undefined}
        onSessionMembersPersist={calendarGroupDetailId != null ? persistCalendarGroupSessionMembers : undefined}
        consultantIdForNewClient={form?.consultantId ?? null}
        onAfterMembersChange={() => {
          void load()
        }}
        onClose={() => {
          setCalendarGroupDetailId(null)
          setCalendarGroupDetailBookingId(null)
        }}
      />

      {aiBookingEnabled &&
        (isNativeAndroid || !calendarFiltersBottomBar) &&
        createPortal(
          <button
            type="button"
            className={`calendar-voice-fab${isNativeAndroid ? ' calendar-voice-fab--android' : ''}${voiceListening ? ' calendar-voice-fab--listening' : ''}`}
            disabled={voiceBookingLoading}
            onClick={() => {
              if (voiceListening) {
                void stopVoiceBooking()
                return
              }
              startVoiceBooking()
            }}
            title={
              voiceBookingConfigured === false
                ? (locale === 'sl' ? 'AI glasovna dejanja zahtevajo OPENAI_API_KEY na strežniku' : 'AI voice actions require OPENAI_API_KEY on the server')
                : voiceBookingLoading
                  ? (locale === 'sl' ? 'Obdelava…' : 'Processing…')
                  : voiceListening
                    ? (locale === 'sl' ? 'Poslušam…' : 'Listening…')
                    : (locale === 'sl' ? 'Zaženi AI glasovna dejanja' : 'Start AI voice actions')
            }
            aria-label={locale === 'sl' ? 'Zaženi AI glasovna dejanja' : 'Start AI voice actions'}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>,
          document.body,
        )}
    </div>
  )
}
