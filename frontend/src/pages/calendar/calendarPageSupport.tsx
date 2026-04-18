import enGbLocale from '@fullcalendar/core/locales/en-gb'
import slLocale from '@fullcalendar/core/locales/sl'
import type { AppLocale } from '../../locale'

export const WORKING_HOURS_FALLBACK_KEY = 'workingHoursFallback'
export const PERSONAL_TASK_PRESETS_KEY = 'PERSONAL_TASK_PRESETS_JSON'
export const AVAILABILITY_BLOCK_TASK = '__availability_block__'
/** Visible calendar data only; full meta/settings use CALENDAR_META_POLL_MS and focus/settings events. */
export const CALENDAR_POLL_MS = 30000
export const CALENDAR_META_POLL_MS = 180000
export const DATE_SET_CALENDAR_DEBOUNCE_MS = 300
export const FULLCALENDAR_LOCALES = [enGbLocale, slLocale]

export const REPEAT_WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** Android calendar pinch zoom scale bounds (see CalendarPage pinch handlers). */
export const ANDROID_PINCH_ZOOM_MIN = 0.5
export const ANDROID_PINCH_ZOOM_MAX = 2.5

/** Local calendar date key YYYY-MM-DD (matches `holidaysByDate` and day comparisons). */
export function toIsoDateKey(input: Date | string | null | undefined): string {
  if (input == null || input === '') return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatRepeatWeekdayLabel(loc: AppLocale, englishDay: string): string {
  const idx = (REPEAT_WEEKDAY_EN as readonly string[]).indexOf(englishDay)
  if (idx < 0) return englishDay
  return new Date(2024, 0, 7 + idx).toLocaleDateString(loc === 'sl' ? 'sl-SI' : 'en-GB', { weekday: 'long' })
}

/** FullCalendar resource id for bookings with no room (Spaces mode, ALL columns). */
export const SPACE_RESOURCE_UNASSIGNED_ID = '__unassigned'

/** FullCalendar resource id for bookings with no consultant (Bookings mode, ALL columns). */
export const CONSULTANT_RESOURCE_UNASSIGNED_ID = '__unassigned_consultant'

/** Web: normal + resource (Spaces, ALL) time-grid view types. */
export function isWebTimeGridLikeView(v: string) {
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

/** Centers the field in the scrollport so Android WebView does not clip the native picker. */
function scrollIntoViewForAndroidPicker(el: HTMLElement) {
  if (typeof document === 'undefined') return
  if (!document.documentElement.classList.contains('layout-android')) return
  window.requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  })
}

/** Time first, then date (DD/MM/YYYY via browser locale on `type="date"`). */
export function CalendarLocalDateTimeSplit({
  value,
  onCommit,
  normalize,
}: {
  value: string | undefined
  onCommit: (localIso: string) => void
  normalize: (v: string) => string
}) {
  const { date, time } = splitLocalDateTimeParts(value)

  return (
    <div className="calendar-datetime-split">
      <div className="calendar-datetime-split-inner">
        <input
          type="time"
          className="calendar-datetime-split-time"
          value={time}
          onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
          onChange={(e) => {
            const t = e.target.value
            if (!t) return
            const d = date || localTodayYmd()
            onCommit(normalize(`${d}T${t}`))
          }}
          aria-label="Time"
        />
        <span className="calendar-datetime-split-divider" aria-hidden />
        <input
          type="date"
          className="calendar-datetime-split-date"
          value={date}
          onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
          onChange={(e) => {
            const d = e.target.value
            if (!d) return
            const t = time || '09:00'
            onCommit(normalize(`${d}T${t}`))
          }}
          aria-label="Date"
        />
      </div>
    </div>
  )
}

/** Personal block task: type freely or open client-style dropdown for predefined tasks. */
export function PersonalTaskCombo({
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
  const visiblePresets = presets.filter((p) => !value.trim() || p.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 20)

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
