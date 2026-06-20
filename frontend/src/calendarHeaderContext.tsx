import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type CalendarShellHeaderSlots = {
  /** Empty balancing column (keeps date centered) or null */
  left: ReactNode
  center: ReactNode
  /** Consultant / Space — rendered before the week view dropdown */
  filters: ReactNode
  /** Bookings / Spaces mode toggle — narrow layouts; null when spaces feature off */
  modeGroup: ReactNode
  /** When true, header uses compact row ( Week before todo ). */
  showMobileToolbar: boolean
  /** Month name — narrow layouts, left of the view dropdown (time-grid views). */
  toolbarMonthLabel: ReactNode | null
  viewDropdown: ReactNode
  /** AI voice control — rendered in header after todo when bottom-strip mic is not used */
  voiceButton: ReactNode | null
}

type CalendarShellHeaderContextValue = {
  slots: CalendarShellHeaderSlots | null
  setSlots: (next: CalendarShellHeaderSlots | null) => void
}

const CalendarShellHeaderContext = createContext<CalendarShellHeaderContextValue | null>(null)

export function CalendarShellHeaderProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<CalendarShellHeaderSlots | null>(null)
  const value = useMemo(() => ({ slots, setSlots }), [slots])
  return (
    <CalendarShellHeaderContext.Provider value={value}>{children}</CalendarShellHeaderContext.Provider>
  )
}

export function useCalendarShellHeader() {
  const ctx = useContext(CalendarShellHeaderContext)
  if (!ctx) throw new Error('useCalendarShellHeader must be used within CalendarShellHeaderProvider')
  return ctx
}
