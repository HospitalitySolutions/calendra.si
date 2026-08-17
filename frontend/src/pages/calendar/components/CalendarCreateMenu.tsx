import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'

export type CalendarCreateMenuOption = 'booking' | 'todo' | 'personal' | 'availability'

type Props = {
  left: number
  top: number
  placement: 'above' | 'below'
  arrowLeft: number
  locale: string
  todoEnabled: boolean
  personalEnabled: boolean
  availabilityEnabled: boolean
  onSelect: (option: CalendarCreateMenuOption) => void
  onClose: () => void
}

function MenuIcon({ option }: { option: CalendarCreateMenuOption }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (option === 'booking') {
    return (
      <svg {...common}>
        <rect x="3.5" y="6" width="17" height="14" rx="2.5" />
        <path d="M8 3.5v5M16 3.5v5M3.5 10h17" />
      </svg>
    )
  }

  if (option === 'todo') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2.5" />
        <path d="m8 11 2.2 2.2L16 7.8" />
      </svg>
    )
  }

  if (option === 'personal') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 1.9" />
    </svg>
  )
}

export function CalendarCreateMenu({
  left,
  top,
  placement,
  arrowLeft,
  locale,
  todoEnabled,
  personalEnabled,
  availabilityEnabled,
  onSelect,
  onClose,
}: Props) {
  const sl = locale === 'sl'
  const style = {
    left,
    top,
    '--calendar-create-menu-arrow-left': `${arrowLeft}px`,
  } as CSSProperties

  const swallow = (event: ReactMouseEvent) => event.stopPropagation()

  const options: Array<{
    key: CalendarCreateMenuOption
    label: string
    enabled: boolean
  }> = [
    { key: 'booking', label: sl ? 'Termin' : 'Appointment', enabled: true },
    { key: 'todo', label: sl ? 'Opravilo' : 'Task', enabled: todoEnabled },
    { key: 'personal', label: sl ? 'Osebno' : 'Personal', enabled: personalEnabled },
    { key: 'availability', label: sl ? 'Dostopnost' : 'Availability', enabled: availabilityEnabled },
  ]

  return (
    <div
      className="calendar-create-menu-layer"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
    >
      <div
        className={`calendar-create-menu calendar-create-menu--${placement}`}
        style={style}
        role="menu"
        aria-label={sl ? 'Kaj želite dodati?' : 'What would you like to add?'}
        onMouseDown={swallow}
        onClick={swallow}
      >
        <div className="calendar-create-menu__title">{sl ? 'Kaj želite dodati?' : 'What would you like to add?'}</div>
        <div className="calendar-create-menu__items">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              className="calendar-create-menu__item"
              disabled={!option.enabled}
              onClick={() => onSelect(option.key)}
            >
              <span className="calendar-create-menu__icon"><MenuIcon option={option.key} /></span>
              <span className="calendar-create-menu__label">{option.label}</span>
              <span className="calendar-create-menu__chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
