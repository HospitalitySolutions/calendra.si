import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'

type ModernTimePickerLabels = {
  quickTitle: string
  hour: string
  minute: string
  plus15: string
  plus30: string
  plus45: string
  plus1h: string
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

const DEFAULT_LABELS: ModernTimePickerLabels = {
  quickTitle: 'Hitre izbire',
  hour: 'Ura',
  minute: 'Minute',
  plus15: '+15m',
  plus30: '+30m',
  plus45: '+45m',
  plus1h: '+1h',
}

const HOURS = Array.from({ length: 24 }, (_, index) => index)
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5)

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

function getNearestMinuteStep(minute: number) {
  const rounded = Math.round(minute / 5) * 5
  return rounded >= 60 ? 0 : rounded
}

function getLoopedOptions(values: number[], selected: number, radius = 2) {
  const selectedIndex = Math.max(0, values.indexOf(selected))
  return Array.from({ length: radius * 2 + 1 }, (_, index) => {
    const offset = index - radius
    const optionIndex = (selectedIndex + offset + values.length) % values.length
    return {
      value: values[optionIndex],
      offset,
      key: `${values[optionIndex]}-${offset}`,
    }
  })
}

function addMinutes(value: { hour: number; minute: number }, minutesToAdd: number) {
  return formatTime(value.hour, value.minute + minutesToAdd)
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.6V12l3.1 2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ModernTimePicker({ value, onChange, ariaLabel, className, disabled, labels, onOpen }: ModernTimePickerProps) {
  const mergedLabels = { ...DEFAULT_LABELS, ...(labels || {}) }
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 264, pointerX: 24 })

  const parsed = useMemo(() => parseTimeValue(value), [value])
  const selectedMinute = useMemo(() => getNearestMinuteStep(parsed.minute), [parsed.minute])
  const hourOptions = useMemo(() => getLoopedOptions(HOURS, parsed.hour, 2), [parsed.hour])
  const minuteOptions = useMemo(() => getLoopedOptions(MINUTES, selectedMinute, 2), [selectedMinute])

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return

    const rect = trigger.getBoundingClientRect()
    const viewportPadding = 16
    const availableWidth = window.innerWidth - viewportPadding * 2
    const safeWidth = Math.min(Math.max(244, Math.min(264, rect.width + 92)), availableWidth)
    let left = rect.left
    if (left + safeWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - viewportPadding - safeWidth
    }
    left = Math.max(viewportPadding, left)

    const estimatedHeight = 274
    let top = rect.bottom + 8
    if (top + estimatedHeight > window.innerHeight - viewportPadding && rect.top > estimatedHeight + viewportPadding) {
      top = rect.top - estimatedHeight - 8
    }

    const pointerX = Math.max(24, Math.min(rect.left + 30 - left, safeWidth - 24))
    setPosition({ top, left, width: safeWidth, pointerX })
  }, [])

  const openPicker = useCallback(() => {
    if (disabled) return
    updatePosition()
    setOpen(true)
    const trigger = triggerRef.current
    if (trigger) onOpen?.(trigger)
  }, [disabled, onOpen, updatePosition])

  const closePicker = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    updatePosition()
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, updatePosition])

  const commit = useCallback((nextValue: string) => {
    onChange(nextValue)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        updatePosition()
      })
    }
  }, [onChange, updatePosition])

  const applyQuickOffset = useCallback((minutesToAdd: number) => {
    setOpen(true)
    commit(addMinutes(parsed, minutesToAdd))
  }, [commit, parsed])

  const selectHour = useCallback((hour: number) => {
    commit(formatTime(hour, selectedMinute))
  }, [commit, selectedMinute])

  const selectMinute = useCallback((minute: number) => {
    commit(formatTime(parsed.hour, minute))
  }, [commit, parsed.hour])

  const shiftHour = useCallback((direction: number) => {
    selectHour(parsed.hour + direction)
  }, [parsed.hour, selectHour])

  const shiftMinute = useCallback((direction: number) => {
    const currentIndex = Math.max(0, MINUTES.indexOf(selectedMinute))
    const nextIndex = (currentIndex + direction + MINUTES.length) % MINUTES.length
    selectMinute(MINUTES[nextIndex])
  }, [selectMinute, selectedMinute])

  const triggerClasses = ['modern-time-picker__trigger', className || '', open ? 'is-open' : '']
    .filter(Boolean)
    .join(' ')

  const popover = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={popoverRef}
          className="modern-time-picker-popover"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
            '--modern-time-picker-pointer-x': `${position.pointerX}px`,
          } as CSSProperties}
          role="dialog"
          aria-label={ariaLabel || 'Time picker'}
        >
          <div className="modern-time-picker-popover__quick">
            <div className="modern-time-picker-popover__quick-title">{mergedLabels.quickTitle}</div>
            <div className="modern-time-picker-popover__quick-grid">
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyQuickOffset(15)}>{mergedLabels.plus15}</button>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyQuickOffset(30)}>{mergedLabels.plus30}</button>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyQuickOffset(45)}>{mergedLabels.plus45}</button>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyQuickOffset(60)}>{mergedLabels.plus1h}</button>
            </div>
          </div>
          <div className="modern-time-picker-popover__wheel" aria-live="polite">
            <div
              className="modern-time-picker-popover__column"
              onWheel={(event) => {
                event.preventDefault()
                shiftHour(event.deltaY > 0 ? 1 : -1)
              }}
            >
              <div className="modern-time-picker-popover__column-title">{mergedLabels.hour}</div>
              <div className="modern-time-picker-popover__options">
                {hourOptions.map(({ value: hour, offset, key }) => (
                  <button
                    key={key}
                    type="button"
                    className={['modern-time-picker-popover__option', offset === 0 ? 'is-selected' : '', Math.abs(offset) >= 2 ? 'is-faded' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => selectHour(hour)}
                  >
                    {pad(hour)}
                  </button>
                ))}
              </div>
            </div>
            <div className="modern-time-picker-popover__separator" aria-hidden="true">:</div>
            <div
              className="modern-time-picker-popover__column"
              onWheel={(event) => {
                event.preventDefault()
                shiftMinute(event.deltaY > 0 ? 1 : -1)
              }}
            >
              <div className="modern-time-picker-popover__column-title">{mergedLabels.minute}</div>
              <div className="modern-time-picker-popover__options">
                {minuteOptions.map(({ value: minute, offset, key }) => (
                  <button
                    key={key}
                    type="button"
                    className={['modern-time-picker-popover__option', offset === 0 ? 'is-selected' : '', Math.abs(offset) >= 2 ? 'is-faded' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => selectMinute(minute)}
                  >
                    {pad(minute)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="modern-time-picker-popover__grab" aria-hidden="true" />
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
        onClick={() => (open ? closePicker() : openPicker())}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="modern-time-picker__value">{formatTime(parsed.hour, parsed.minute)}</span>
        <span className="modern-time-picker__icon" aria-hidden="true">
          <ClockIcon />
        </span>
      </button>
      {popover}
    </>
  )
}
