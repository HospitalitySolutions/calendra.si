import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '../locale'

type ModernTimePickerLabels = {
  selectTime: string
  hour: string
  minute: string
  cancel: string
  confirm: string
}

type ModernTimePickerProps = {
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
  disabled?: boolean
  labels?: Partial<ModernTimePickerLabels>
  onOpen?: (trigger: HTMLElement) => void
}

type PickerMode = 'hour' | 'minute'

type ClockOption = {
  value: number
  label: string
  radius: number
  angle: number
}

const CLOCK_SIZE = 240
const CLOCK_CENTER = CLOCK_SIZE / 2
const HOUR_OUTER_RADIUS = 94
const HOUR_INNER_RADIUS = 61
const MINUTE_RADIUS = 94

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatTime(hour: number, minute: number) {
  const totalMinutes = ((((hour * 60) + minute) % 1440) + 1440) % 1440
  const normalizedHour = Math.floor(totalMinutes / 60)
  const normalizedMinute = totalMinutes % 60
  return `${pad(normalizedHour)}:${pad(normalizedMinute)}`
}

function parseTimeValue(value: string | null | undefined) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return { hour: 9, minute: 0 }
  return {
    hour: Math.max(0, Math.min(23, Number(match[1]) || 0)),
    minute: Math.max(0, Math.min(59, Number(match[2]) || 0)),
  }
}

function nearestFiveMinutes(minute: number) {
  const rounded = Math.round(minute / 5) * 5
  return rounded >= 60 ? 0 : rounded
}

function pointForClock(angle: number, radius: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: CLOCK_CENTER + Math.cos(radians) * radius,
    y: CLOCK_CENTER + Math.sin(radians) * radius,
  }
}

function localizedDefaults(locale: string): ModernTimePickerLabels {
  if (locale === 'sl') {
    return {
      selectTime: 'Izberite uro',
      hour: 'Ura',
      minute: 'Minute',
      cancel: 'Prekliči',
      confirm: 'V redu',
    }
  }
  if (locale === 'sr') {
    return {
      selectTime: 'Izaberite vreme',
      hour: 'Sat',
      minute: 'Minuti',
      cancel: 'Otkaži',
      confirm: 'U redu',
    }
  }
  return {
    selectTime: 'Select time',
    hour: 'Hour',
    minute: 'Minute',
    cancel: 'Cancel',
    confirm: 'OK',
  }
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.6V12l3.1 2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KeyboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 10h.01M9.5 10h.01M12.5 10h.01M15.5 10h.01M18.5 10h.01M7.5 13h.01M10.5 13h.01M13.5 13h.01M16.5 13h.01M8 16h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ModernTimePicker({ value, onChange, ariaLabel, className, disabled, labels, onOpen }: ModernTimePickerProps) {
  const { locale } = useLocale()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const parsed = useMemo(() => parseTimeValue(value), [value])
  const mergedLabels = useMemo(() => ({ ...localizedDefaults(locale), ...(labels || {}) }), [labels, locale])
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PickerMode>('hour')
  const [draftHour, setDraftHour] = useState(parsed.hour)
  const [draftMinute, setDraftMinute] = useState(nearestFiveMinutes(parsed.minute))

  const hourOptions = useMemo<ClockOption[]>(() => {
    const outer = Array.from({ length: 12 }, (_, value) => ({
      value,
      label: pad(value),
      radius: HOUR_OUTER_RADIUS,
      angle: value * 30,
    }))
    const inner = Array.from({ length: 12 }, (_, index) => ({
      value: index + 12,
      label: pad(index + 12),
      radius: HOUR_INNER_RADIUS,
      angle: index * 30,
    }))
    return [...outer, ...inner]
  }, [])

  const minuteOptions = useMemo<ClockOption[]>(() => (
    Array.from({ length: 12 }, (_, index) => ({
      value: index * 5,
      label: pad(index * 5),
      radius: MINUTE_RADIUS,
      angle: index * 30,
    }))
  ), [])

  const activeValue = mode === 'hour' ? draftHour : draftMinute
  const activeOption = (mode === 'hour' ? hourOptions : minuteOptions).find((option) => option.value === activeValue)
    || (mode === 'hour' ? hourOptions[0] : minuteOptions[0])
  const handEnd = pointForClock(activeOption.angle, activeOption.radius)

  const openPicker = useCallback(() => {
    if (disabled) return
    const current = parseTimeValue(value)
    setDraftHour(current.hour)
    setDraftMinute(nearestFiveMinutes(current.minute))
    setMode('hour')
    setOpen(true)
    if (triggerRef.current) onOpen?.(triggerRef.current)
  }, [disabled, onOpen, value])

  const closePicker = useCallback(() => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const confirmPicker = useCallback(() => {
    onChange(formatTime(draftHour, draftMinute))
    closePicker()
  }, [closePicker, draftHour, draftMinute, onChange])

  const selectHour = useCallback((hour: number) => {
    setDraftHour(hour)
    setMode('minute')
  }, [])

  const selectMinute = useCallback((minute: number) => {
    setDraftMinute(minute)
  }, [])

  const adjustActiveValue = useCallback((delta: number) => {
    if (mode === 'hour') {
      setDraftHour((current) => (current + delta + 24) % 24)
      return
    }
    setDraftMinute((current) => {
      const currentIndex = Math.max(0, Math.round(current / 5))
      const nextIndex = (currentIndex + delta + 12) % 12
      return nextIndex * 5
    })
  }, [mode])

  const handleDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      confirmPicker()
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      adjustActiveValue(1)
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      adjustActiveValue(-1)
    }
  }, [adjustActiveValue, closePicker, confirmPicker])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const triggerClasses = ['modern-time-picker__trigger', className || '', open ? 'is-open' : '']
    .filter(Boolean)
    .join(' ')

  const options = mode === 'hour' ? hourOptions : minuteOptions
  const dialog = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="modern-time-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePicker()
          }}
        >
          <div
            ref={dialogRef}
            className="modern-time-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel || mergedLabels.selectTime}
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modern-time-picker-dialog__eyebrow">{mergedLabels.selectTime}</div>
            <div className="modern-time-picker-dialog__display" aria-live="polite">
              <button
                type="button"
                className={mode === 'hour' ? 'is-active' : ''}
                aria-label={mergedLabels.hour}
                onClick={() => setMode('hour')}
              >
                {pad(draftHour)}
              </button>
              <span aria-hidden="true">:</span>
              <button
                type="button"
                className={mode === 'minute' ? 'is-active' : ''}
                aria-label={mergedLabels.minute}
                onClick={() => setMode('minute')}
              >
                {pad(draftMinute)}
              </button>
            </div>

            <div className="modern-time-picker-dialog__clock" style={{ '--clock-size': `${CLOCK_SIZE}px` } as CSSProperties}>
              <svg className="modern-time-picker-dialog__hand" viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`} aria-hidden="true">
                <line x1={CLOCK_CENTER} y1={CLOCK_CENTER} x2={handEnd.x} y2={handEnd.y} />
                <circle cx={CLOCK_CENTER} cy={CLOCK_CENTER} r="4" />
              </svg>
              {options.map((option) => {
                const point = pointForClock(option.angle, option.radius)
                const selected = option.value === activeValue
                return (
                  <button
                    key={`${mode}-${option.value}`}
                    type="button"
                    className={selected ? 'modern-time-picker-dialog__number is-selected' : 'modern-time-picker-dialog__number'}
                    style={{ left: `${point.x}px`, top: `${point.y}px` }}
                    aria-pressed={selected}
                    onClick={() => (mode === 'hour' ? selectHour(option.value) : selectMinute(option.value))}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            <div className="modern-time-picker-dialog__footer">
              <span className="modern-time-picker-dialog__keyboard" aria-hidden="true"><KeyboardIcon /></span>
              <div className="modern-time-picker-dialog__actions">
                <button type="button" onClick={closePicker}>{mergedLabels.cancel}</button>
                <button type="button" onClick={confirmPicker}>{mergedLabels.confirm}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClasses}
        onClick={openPicker}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="modern-time-picker__value">{formatTime(parsed.hour, parsed.minute)}</span>
        <span className="modern-time-picker__icon" aria-hidden="true"><ClockIcon /></span>
      </button>
      {dialog}
    </>
  )
}
