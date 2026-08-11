import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../api'
import type { CalendarServiceDraft, CalendarServiceSegment } from '../calendarTypes'

function formatMinutes(totalMinutes: number, locale: string) {
  const minutes = Math.max(0, Math.round(totalMinutes || 0))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours <= 0) return `${rest} min`
  if (rest <= 0) return `${hours}h`
  return locale === 'sl' || locale === 'sr' ? `${hours}h ${rest} min` : `${hours}h ${rest} min`
}

function timePart(value: string | null | undefined) {
  const match = String(value || '').match(/T(\d{2}:\d{2})/)
  return match?.[1] || '—'
}

function serviceName(type: any, locale: string) {
  const visible = serviceDescription(type, locale)
  const internal = String(type?.internalDescription || '').trim()
  return internal ? `${visible} — ${internal}` : visible
}

function serviceDescription(type: any, locale: string) {
  const description = String(type?.description || '').trim()
  const name = String(type?.name || '').trim()
  return description || name || (locale === 'sl' ? 'Izberite storitev' : locale === 'sr' ? 'Izaberite uslugu' : 'Select service')
}

function labels(locale: string) {
  if (locale === 'sl') {
    return {
      services: 'Storitve',
      service: 'Storitev',
      addTitle: 'Dodaj storitev',
      space: 'Prostor',
      noSpace: 'Brez lokacije',
      duration: 'Trajanje',
      decreaseDuration: 'Skrajšaj trajanje',
      increaseDuration: 'Podaljšaj trajanje',
      price: 'Cena',
      maxParticipants: 'Največ udeležencev v skupini',
      totalDuration: 'Skupno trajanje',
      total: 'Skupaj',
      moveUp: 'Premakni navzgor',
      moveDown: 'Premakni navzdol',
      change: 'Zamenjaj storitev',
      edit: 'Uredi storitev',
      remove: 'Odstrani storitev',
      one: '1 storitev',
      many: '{count} storitve',
      choose: 'Izberite storitev',
      pickerTitle: 'Dodaj storitev',
      pickerDescription: 'Izberite storitev, ki jo želite dodati v termin.',
      pickerEmpty: 'Ni razpoložljivih storitev.',
      close: 'Zapri',
      addAction: 'Izberi',
      searchPlaceholder: 'Išči storitev ...',
      saveChanges: 'Shrani spremembe',
      serviceName: 'Ime storitve',
      editServiceTitle: 'Uredi storitev',
      reorder: 'Premakni storitev',
    }
  }
  if (locale === 'sr') {
    return {
      services: 'Usluge',
      service: 'Usluga',
      addTitle: 'Dodaj uslugu',
      space: 'Prostor',
      noSpace: 'Bez lokacije',
      duration: 'Trajanje',
      decreaseDuration: 'Smanji trajanje',
      increaseDuration: 'Povećaj trajanje',
      price: 'Cena',
      maxParticipants: 'Najviše učesnika u grupi',
      totalDuration: 'Ukupno trajanje',
      total: 'Ukupno',
      moveUp: 'Pomeri nagore',
      moveDown: 'Pomeri nadole',
      change: 'Zameni uslugu',
      edit: 'Uredi uslugu',
      remove: 'Ukloni uslugu',
      one: '1 usluga',
      many: '{count} usluge',
      choose: 'Izaberite uslugu',
      pickerTitle: 'Dodaj uslugu',
      pickerDescription: 'Izaberite uslugu koju želite da dodate u termin.',
      pickerEmpty: 'Nema dostupnih usluga.',
      close: 'Zatvori',
      addAction: 'Izaberi',
      searchPlaceholder: 'Pretraži uslugu ...',
      saveChanges: 'Sačuvaj izmene',
      serviceName: 'Naziv usluge',
      editServiceTitle: 'Uredi uslugu',
      reorder: 'Pomeri uslugu',
    }
  }
  return {
    services: 'Services',
    service: 'Service',
    addTitle: 'Add service',
    space: 'Space',
    noSpace: 'No location',
    duration: 'Duration',
    decreaseDuration: 'Decrease duration',
    increaseDuration: 'Increase duration',
    price: 'Price',
    maxParticipants: 'Maximum participants in group',
    totalDuration: 'Total duration',
    total: 'Total',
    moveUp: 'Move up',
    moveDown: 'Move down',
    change: 'Change service',
    edit: 'Edit service',
    remove: 'Remove service',
    one: '1 service',
    many: '{count} services',
    choose: 'Select service',
    pickerTitle: 'Add service',
    pickerDescription: 'Choose a service to add to this appointment.',
    pickerEmpty: 'No services available.',
    close: 'Close',
    addAction: 'Select',
    searchPlaceholder: 'Search services ...',
    saveChanges: 'Save changes',
    serviceName: 'Service name',
    editServiceTitle: 'Edit service',
    reorder: 'Reorder service',
  }
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7m-8.5 0 .7 13h9.6l.7-13M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5.5a1.5 1.5 0 1 0 0 .01V5.5Zm0 5a1.5 1.5 0 1 0 0 .01v-.01Zm0 5a1.5 1.5 0 1 0 0 .01v-.01Z" fill="currentColor" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.8v4.6l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.7" stroke="currentColor" strokeWidth="1.9" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function ReorderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 5l-3 3 3 3M15 19l3-3-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 8h11M17.5 16h-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20l3.4-.7 10-10a2 2 0 0 0-2.8-2.8l-10 10L4 20Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.5 6.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SwapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3-3m-3 3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type SessionConsumableDraft = {
  consumableId: number
  itemName: string
  unit: string
  quantity: number
  quantityMode: 'PER_SESSION' | 'PER_PARTICIPANT'
  billable: boolean
  salePriceSnapshot?: number | null
  vatRateSnapshot?: 'VAT_22' | 'VAT_9_5' | 'VAT_0' | 'NO_VAT' | string | null
  notes?: string | null
}

type ConsumableCatalogItem = {
  id: number
  name: string
  unit?: string | null
  billable?: boolean
  salePrice?: number | null
  vatRate?: 'VAT_22' | 'VAT_9_5' | 'VAT_0' | 'NO_VAT' | string | null
  active?: boolean
}

export function CalendarServiceChainEditor({
  locale,
  services,
  segments,
  sessionTypes,
  spaces,
  currency,
  totalSpanMinutes,
  totalGross,
  clientCount = 1,
  warnings,
  onChange,
  defaultSpaceId = null,
  multipleServicesEnabled = false,
  allowServiceEdit = true,
  showSessionMaxParticipants = false,
  sessionMaxParticipants = null,
  onSessionMaxParticipantsChange,
  consumablesEnabled = false,
  bookingId = null,
  sessionConsumables,
  resetSessionConsumablesToDefaults = false,
  sessionConsumablesOverridden = false,
  onSessionConsumablesChange,
}: {
  locale: string
  services: CalendarServiceDraft[]
  segments: CalendarServiceSegment[]
  sessionTypes: any[]
  spaces: any[]
  currency: (value: number) => string
  totalSpanMinutes: number
  totalGross: number | null
  clientCount?: number
  warnings?: string[]
  onChange: (next: CalendarServiceDraft[]) => void
  defaultSpaceId?: number | null
  multipleServicesEnabled?: boolean
  allowServiceEdit?: boolean
  showSessionMaxParticipants?: boolean
  sessionMaxParticipants?: number | null
  onSessionMaxParticipantsChange?: (value: number | null) => void
  consumablesEnabled?: boolean
  bookingId?: number | null
  sessionConsumables?: SessionConsumableDraft[] | null
  resetSessionConsumablesToDefaults?: boolean
  sessionConsumablesOverridden?: boolean
  onSessionConsumablesChange?: (rows: SessionConsumableDraft[] | null, resetToDefaults: boolean) => void
}) {
  const copy = labels(locale)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerReplaceIndex, setPickerReplaceIndex] = useState<number | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const [reorderMenuIndex, setReorderMenuIndex] = useState<number | null>(null)
  const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null)
  const [editingServiceDuration, setEditingServiceDuration] = useState('60')
  const [editingServicePrice, setEditingServicePrice] = useState('0,00')
  const [editingSessionMaxParticipants, setEditingSessionMaxParticipants] = useState('')
  const [consumablesOpen, setConsumablesOpen] = useState(false)
  const [consumablesLoading, setConsumablesLoading] = useState(false)
  const [consumablePreview, setConsumablePreview] = useState<SessionConsumableDraft[]>([])
  const [workingConsumables, setWorkingConsumables] = useState<SessionConsumableDraft[]>([])
  const [workingConsumablesReset, setWorkingConsumablesReset] = useState(false)
  const [consumableCatalog, setConsumableCatalog] = useState<ConsumableCatalogItem[]>([])
  const [consumableToAdd, setConsumableToAdd] = useState('')

  const count = services.filter((service) => service.typeId != null).length
  const isMultiMode = count > 1
  const canAddServices = multipleServicesEnabled === true
  const showSingleEditButton = count === 1 && services[0]?.typeId != null && allowServiceEdit
  const singleServiceGross = count === 1 && services[0]?.typeId != null
    ? segments[0]?.grossPrice ?? services[0]?.grossPriceOverride ?? null
    : null

  const primaryTypeId = services.find((service) => service.typeId != null)?.typeId ?? null

  const loadConsumableCatalog = async (): Promise<ConsumableCatalogItem[]> => {
    try {
      const response = await api.get('/consumables/items')
      const unique = new Map<number, ConsumableCatalogItem>()
      ;(Array.isArray(response.data) ? response.data : []).forEach((item: ConsumableCatalogItem) => {
        if (item?.id != null && item.active !== false) unique.set(Number(item.id), item)
      })
      const items = Array.from(unique.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)))
      setConsumableCatalog(items)
      return items
    } catch {
      setConsumableCatalog([])
      return []
    }
  }

  const loadServiceConsumableDefaults = async (): Promise<SessionConsumableDraft[]> => {
    if (!primaryTypeId) return []
    try {
      const [defaultsResponse, catalog] = await Promise.all([
        api.get(`/consumables/service-types/${primaryTypeId}/defaults`),
        loadConsumableCatalog(),
      ])
      const catalogById = new Map<number, ConsumableCatalogItem>(catalog.map((item: ConsumableCatalogItem) => [Number(item.id), item] as [number, ConsumableCatalogItem]))
      return (Array.isArray(defaultsResponse.data) ? defaultsResponse.data : []).map((row: any) => {
        const item = catalogById.get(Number(row.consumableId))
        const baseQuantity = Math.max(0, Number(row.defaultQuantity ?? 0) || 0)
        const quantityMode = row.quantityMode === 'PER_PARTICIPANT' ? 'PER_PARTICIPANT' : 'PER_SESSION'
        return {
          consumableId: Number(row.consumableId),
          itemName: String(row.itemName || item?.name || `#${row.consumableId}`),
          unit: String(row.unit || item?.unit || 'kos'),
          quantity: baseQuantity,
          quantityMode,
          billable: row.billableOverride == null ? item?.billable === true : row.billableOverride === true,
          salePriceSnapshot: item?.salePrice ?? null,
          vatRateSnapshot: item?.vatRate ?? 'NO_VAT',
          notes: row.notes || null,
        } satisfies SessionConsumableDraft
      })
    } catch {
      return []
    }
  }

  const loadCurrentConsumables = async () => {
    if (!consumablesEnabled || !primaryTypeId) {
      setConsumablePreview([])
      return
    }
    if (Array.isArray(sessionConsumables)) {
      setConsumablePreview(sessionConsumables)
      return
    }
    setConsumablesLoading(true)
    try {
      if (bookingId != null && !resetSessionConsumablesToDefaults) {
        const response = await api.get(`/consumables/bookings/${bookingId}/session-consumables`)
        const rows: SessionConsumableDraft[] = (Array.isArray(response.data) ? response.data : []).map((row: any) => ({
          consumableId: Number(row.consumableId),
          itemName: String(row.itemName || `#${row.consumableId}`),
          unit: String(row.unit || 'kos'),
          quantity: Math.max(0, Number(row.quantity ?? 0) || 0),
          quantityMode: row.quantityMode === 'PER_PARTICIPANT' ? 'PER_PARTICIPANT' : 'PER_SESSION',
          billable: row.billable === true,
          salePriceSnapshot: row.salePriceSnapshot == null ? null : Number(row.salePriceSnapshot),
          vatRateSnapshot: row.vatRateSnapshot ?? 'NO_VAT',
          notes: row.notes || null,
        }))
        // Older appointments may predate material snapshots. Show their service defaults unless
        // an explicitly empty appointment override was saved.
        setConsumablePreview(rows.length === 0 && !sessionConsumablesOverridden ? await loadServiceConsumableDefaults() : rows)
      } else {
        setConsumablePreview(await loadServiceConsumableDefaults())
      }
    } finally {
      setConsumablesLoading(false)
    }
  }

  useEffect(() => {
    void loadCurrentConsumables()
    // The appointment/service key is intentionally the refresh boundary. Parent-provided manual rows
    // are applied through sessionConsumables without writing inventory until the appointment is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumablesEnabled, bookingId, primaryTypeId, sessionConsumables, resetSessionConsumablesToDefaults, sessionConsumablesOverridden])

  const openConsumablesEditor = async () => {
    setWorkingConsumables(consumablePreview.map((row) => ({ ...row })))
    setWorkingConsumablesReset(resetSessionConsumablesToDefaults)
    setConsumableToAdd('')
    setConsumablesOpen(true)
    if (consumableCatalog.length === 0) await loadConsumableCatalog()
  }

  const resetWorkingConsumables = async () => {
    setConsumablesLoading(true)
    try {
      setWorkingConsumables(await loadServiceConsumableDefaults())
      setWorkingConsumablesReset(true)
    } finally {
      setConsumablesLoading(false)
    }
  }

  const mutateWorkingConsumables = (next: SessionConsumableDraft[]) => {
    setWorkingConsumables(next)
    setWorkingConsumablesReset(false)
  }

  const saveConsumablesEditor = () => {
    if (workingConsumablesReset) {
      onSessionConsumablesChange?.(null, true)
      setConsumablePreview(workingConsumables)
    } else {
      const normalized = workingConsumables.map((row) => ({ ...row, quantity: Math.max(0, Number(row.quantity) || 0) }))
      onSessionConsumablesChange?.(normalized, false)
      setConsumablePreview(normalized)
    }
    setConsumablesOpen(false)
  }

  const countLabel = (() => {
    if (locale === 'sl') {
      if (count === 1) return '1 storitev'
      if (count === 2) return '2 storitvi'
      if (count === 3 || count === 4) return `${count} storitve`
      return `${count} storitev`
    }
    if (locale === 'sr') {
      if (count % 10 === 1 && count % 100 !== 11) return `${count} usluga`
      if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} usluge`
      return `${count} usluga`
    }
    return count === 1 ? copy.one : copy.many.replace('{count}', String(count))
  })()

  const pricingModes = new Set(services
    .filter((service) => service.typeId != null)
    .map((service) => sessionTypes.find((entry) => Number(entry?.id) === Number(service.typeId)))
    .filter(Boolean)
    .map((entry) => String(entry?.priceCalculationMode || 'PER_CLIENT')))
  const totalMultiplier = pricingModes.size === 1 && pricingModes.has('PER_CLIENT')
    ? Math.max(1, Number(clientCount) || 0)
    : 1
  const displayedTotalGross = totalGross == null ? null : totalGross * totalMultiplier

  const sortedSessionTypes = useMemo(
    () => [...sessionTypes].sort((left, right) =>
      serviceDescription(left, locale).localeCompare(serviceDescription(right, locale), locale, { sensitivity: 'base', numeric: true }),
    ),
    [locale, sessionTypes],
  )

  const filteredSessionTypes = useMemo(() => {
    const query = pickerQuery.trim().toLocaleLowerCase(locale)
    if (!query) return sortedSessionTypes
    return sortedSessionTypes.filter((entry) => serviceName(entry, locale).toLocaleLowerCase(locale).includes(query))
  }, [locale, pickerQuery, sortedSessionTypes])

  const durationOptions = useMemo(() => {
    const items: Array<{ value: string; label: string }> = []
    for (let minutes = 5; minutes <= 720; minutes += 5) {
      items.push({ value: String(minutes), label: formatMinutes(minutes, locale) })
    }
    return items
  }, [locale])

  const updateAt = (index: number, patch: Partial<CalendarServiceDraft>) => {
    onChange(services.map((service, idx) => (idx === index ? { ...service, ...patch } : service)))
  }

  const removeAt = (index: number) => {
    const next = services.filter((_, idx) => idx !== index)
    onChange(next.length > 0 ? next : [{ typeId: null, spaceId: defaultSpaceId ?? null }])
    setMenuIndex(null)
    setReorderMenuIndex(null)
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= services.length) return
    const next = [...services]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    onChange(next)
    setMenuIndex(null)
    setReorderMenuIndex(null)
  }

  const openAddPicker = () => {
    if (!canAddServices) return
    setPickerReplaceIndex(null)
    setPickerQuery('')
    setMenuIndex(null)
    setReorderMenuIndex(null)
    setPickerOpen(true)
  }

  const openReplacePicker = (index: number) => {
    setPickerReplaceIndex(index)
    setPickerQuery('')
    setMenuIndex(null)
    setReorderMenuIndex(null)
    setPickerOpen(true)
  }

  const closePicker = () => {
    setPickerOpen(false)
    setPickerReplaceIndex(null)
    setPickerQuery('')
  }

  const addOrReplaceService = (typeId: number) => {
    if (pickerReplaceIndex != null) {
      updateAt(pickerReplaceIndex, { typeId })
      setPickerReplaceIndex(null)
      setPickerOpen(false)
      return
    }
    if (!canAddServices) {
      closePicker()
      return
    }
    const fallbackSpaceId = services[services.length - 1]?.spaceId ?? defaultSpaceId ?? null
    if (services.length === 1 && services[0]?.typeId == null) {
      onChange([{ ...services[0], typeId }])
      setPickerOpen(false)
      return
    }
    const firstBlankIndex = services.findIndex((service) => service.typeId == null)
    if (firstBlankIndex >= 0) {
      onChange(services.map((service, idx) => (idx === firstBlankIndex ? { ...service, typeId } : service)))
      setPickerOpen(false)
      return
    }
    onChange([...services, { typeId, spaceId: fallbackSpaceId }])
    setPickerOpen(false)
  }

  const openEditService = (index: number) => {
    const service = services[index]
    const segment = segments[index]
    const type = sessionTypes.find((entry) => Number(entry?.id) === Number(service?.typeId))
    const duration = Math.max(
      1,
      Number(service?.durationMinutesOverride ?? segment?.durationMinutes ?? type?.durationMinutes ?? 60) || 60,
    )
    const price = Number(service?.grossPriceOverride ?? segment?.grossPrice ?? 0) || 0
    setEditingServiceIndex(index)
    setEditingServiceDuration(String(duration))
    setEditingServicePrice(price.toFixed(2).replace('.', ','))
    const effectiveMaxParticipants = Number(sessionMaxParticipants ?? type?.maxParticipantsPerSession ?? 0)
    setEditingSessionMaxParticipants(effectiveMaxParticipants > 0 ? String(Math.round(effectiveMaxParticipants)) : '')
    setMenuIndex(null)
    setReorderMenuIndex(null)
  }

  const closeEditService = () => {
    setEditingServiceIndex(null)
  }

  const saveEditService = () => {
    if (editingServiceIndex == null) return
    const durationMinutesOverride = Math.max(1, Number(editingServiceDuration) || 60)
    const normalizedPrice = Number(String(editingServicePrice || '0').replace(',', '.'))
    updateAt(editingServiceIndex, {
      durationMinutesOverride,
      grossPriceOverride: Number.isFinite(normalizedPrice) ? Math.max(0, normalizedPrice) : 0,
    })
    if (showSessionMaxParticipants && onSessionMaxParticipantsChange) {
      const parsedMaxParticipants = Number(editingSessionMaxParticipants)
      onSessionMaxParticipantsChange(Number.isFinite(parsedMaxParticipants) && parsedMaxParticipants > 0 ? Math.round(parsedMaxParticipants) : null)
    }
    setEditingServiceIndex(null)
  }

  const changeEditingServiceDuration = (delta: number) => {
    setEditingServiceDuration((current) => {
      const parsed = Number(current)
      const base = Number.isFinite(parsed) ? parsed : 60
      return String(Math.min(720, Math.max(5, base + delta)))
    })
  }

  return (
    <>
      <section className={`calendar-service-chain ${isMultiMode ? 'calendar-service-chain--multi' : 'calendar-service-chain--single'}`} aria-label={isMultiMode ? copy.services : copy.service}>
        {isMultiMode ? (
          <>
            <div className="calendar-service-chain__head">
              <div className="calendar-service-chain__head-copy">
                <strong>{copy.services}</strong>
                <span>{countLabel}</span>
              </div>
              {canAddServices ? (
                <button
                  type="button"
                  className="secondary client-add-btn calendar-client-picker__add-btn calendar-service-chain__head-add"
                  aria-label={copy.addTitle}
                  title={copy.addTitle}
                  onClick={openAddPicker}
                >
                  <span aria-hidden><PlusIcon /></span>
                </button>
              ) : null}
            </div>

            <div className="calendar-service-chain__list">
              {services.filter((service) => service.typeId != null).map((service, index) => {
                const segment = segments[index]
                const type = sessionTypes.find((entry) => Number(entry?.id) === Number(service.typeId))
                const typedServicesCount = services.filter((entry) => entry.typeId != null).length
                return (
                  <article className="calendar-service-chain__item" key={`${service.id ?? 'new'}-${index}`}>
                    <div className="calendar-service-chain__body">
                      <div className="calendar-service-chain__card-top">
                        <div className="calendar-service-chain__title-block">
                          <strong className="calendar-service-chain__title">{serviceDescription(type, locale)}</strong>
                        </div>
                        <div className="calendar-service-chain__item-actions">
                          <div className="calendar-service-chain__menu-wrap">
                            <button
                              type="button"
                              className="calendar-service-chain__icon-btn calendar-service-chain__reorder-btn"
                              aria-label={copy.reorder}
                              title={copy.reorder}
                              onClick={() => {
                                setReorderMenuIndex((current) => (current === index ? null : index))
                                setMenuIndex(null)
                              }}
                            >
                              <ReorderIcon />
                            </button>
                            {reorderMenuIndex === index ? (
                              <div className="calendar-service-chain__menu calendar-service-chain__menu--compact">
                                <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>{copy.moveUp}</button>
                                <button type="button" disabled={index === typedServicesCount - 1} onClick={() => move(index, 1)}>{copy.moveDown}</button>
                              </div>
                            ) : null}
                          </div>
                          {allowServiceEdit ? (
                            <button
                              type="button"
                              className="calendar-service-chain__icon-btn calendar-service-chain__mobile-edit-btn"
                              aria-label={copy.edit}
                              title={copy.edit}
                              onClick={() => openEditService(index)}
                            >
                              <PencilIcon />
                            </button>
                          ) : null}
                          <div className="calendar-service-chain__menu-wrap calendar-service-chain__desktop-service-menu">
                            <button
                              type="button"
                              className="calendar-service-chain__icon-btn calendar-service-chain__more-btn"
                              aria-label={copy.change}
                              title={copy.change}
                              onClick={() => {
                                setMenuIndex((current) => (current === index ? null : index))
                                setReorderMenuIndex(null)
                              }}
                            >
                              <MoreIcon />
                            </button>
                            {menuIndex === index ? (
                              <div className="calendar-service-chain__menu">
                                {allowServiceEdit ? <button type="button" onClick={() => openEditService(index)}><PencilIcon /> {copy.edit}</button> : null}
                                <button type="button" onClick={() => openReplacePicker(index)}><SwapIcon /> {copy.change}</button>
                              </div>
                            ) : null}
                          </div>
                          <button type="button" className="calendar-service-chain__icon-btn calendar-service-chain__remove" title={copy.remove} aria-label={copy.remove} onClick={() => removeAt(index)}><TrashIcon /></button>
                        </div>
                      </div>

                      <div className="calendar-service-chain__meta calendar-service-chain__meta--cards">
                        <label className="calendar-service-chain__meta-block calendar-service-chain__meta-block--space">
                          <span>{copy.space}</span>
                          <select value={service.spaceId ?? ''} onChange={(event) => updateAt(index, { spaceId: event.target.value ? Number(event.target.value) : null })}>
                            <option value="">{copy.noSpace}</option>
                            {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                          </select>
                        </label>
                        <div className="calendar-service-chain__metric">
                          <small>{copy.duration}</small>
                          <div className="calendar-service-chain__duration-line">
                            <strong>{formatMinutes(segment?.durationMinutes ?? Number(type?.durationMinutes ?? 0), locale)}</strong>
                            <span className="calendar-service-chain__time">{timePart(segment?.startTime)}–{timePart(segment?.endTime)}</span>
                          </div>
                        </div>
                        <div className="calendar-service-chain__metric">
                          <small>{copy.price}</small>
                          <strong>{segment?.grossPrice != null ? currency(segment.grossPrice) : '—'}</strong>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="calendar-service-chain__summary">
              <div><span>{copy.totalDuration}</span><strong>{formatMinutes(totalSpanMinutes, locale)}</strong></div>
              <div><span>{copy.total}</span><strong>{displayedTotalGross == null ? '—' : currency(displayedTotalGross)}</strong></div>
            </div>

          </>
        ) : (
          <label className="calendar-service-chain__single-field">
            <span className="calendar-service-chain__single-label">{copy.service}</span>
            <div className={`calendar-service-chain__single-row${canAddServices ? '' : ' calendar-service-chain__single-row--single-only'}${showSingleEditButton ? ' calendar-service-chain__single-row--with-edit' : ''}`}>
              <div className={`calendar-service-chain__single-select-wrap${singleServiceGross != null ? ' calendar-service-chain__single-select-wrap--with-price' : ''}`}>
                <select
                  className="calendar-service-chain__single-select calendar-service-chain__single-select--desktop"
                  value={services[0]?.typeId ?? ''}
                  aria-label={copy.service}
                  onChange={(event) => updateAt(0, { typeId: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">{copy.choose}</option>
                  {sortedSessionTypes.map((entry) => (
                    <option key={entry.id} value={entry.id}>{serviceName(entry, locale)}</option>
                  ))}
                </select>
                <select
                  className="calendar-service-chain__single-select calendar-service-chain__single-select--mobile"
                  value={services[0]?.typeId ?? ''}
                  aria-label={copy.service}
                  onChange={(event) => updateAt(0, { typeId: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">{copy.choose}</option>
                  {sortedSessionTypes.map((entry) => (
                    <option key={entry.id} value={entry.id}>{serviceName(entry, locale)}</option>
                  ))}
                </select>
                {singleServiceGross != null ? (
                  <span className="calendar-service-chain__single-price" aria-hidden>{currency(singleServiceGross)}</span>
                ) : null}
              </div>
              {showSingleEditButton ? (
                <button
                  type="button"
                  className="secondary client-add-btn calendar-client-picker__add-btn calendar-service-chain__head-add calendar-service-chain__single-edit"
                  aria-label={copy.edit}
                  title={copy.edit}
                  onClick={() => openEditService(0)}
                >
                  <span aria-hidden><PencilIcon /></span>
                </button>
              ) : null}
              {canAddServices ? (
                <button
                  type="button"
                  className="secondary client-add-btn calendar-client-picker__add-btn calendar-service-chain__head-add"
                  aria-label={copy.addTitle}
                  title={copy.addTitle}
                  onClick={openAddPicker}
                >
                  <span aria-hidden><PlusIcon /></span>
                </button>
              ) : null}
            </div>
          </label>
        )}

        {consumablesEnabled && primaryTypeId ? (
          <div className="calendar-consumables-summary">
            <div className="calendar-consumables-summary__header">
              <div>
                <strong>{locale === 'sl' ? 'Porabni material' : locale === 'sr' ? 'Potrošni materijal' : 'Consumables'}</strong>
                <span>{consumablePreview.length} {locale === 'sl' ? 'privzeti artikli' : locale === 'sr' ? 'artikla' : 'default items'}</span>
              </div>
              <button type="button" className="secondary slim-btn" onClick={openConsumablesEditor}>
                {locale === 'sl' ? 'Uredi' : locale === 'sr' ? 'Uredi' : 'Edit'}
              </button>
            </div>
            {consumablesLoading ? (
              <div className="calendar-consumables-summary__empty">{locale === 'sl' ? 'Nalaganje …' : 'Loading…'}</div>
            ) : consumablePreview.length > 0 ? (
              <div className="calendar-consumables-summary__list">
                {consumablePreview.slice(0, 4).map((row) => (
                  <div key={row.consumableId}>
                    <span>{row.itemName}</span>
                    <strong>{Number(row.quantity).toLocaleString(locale === 'sl' ? 'sl-SI' : undefined)} {row.unit}</strong>
                  </div>
                ))}
                {consumablePreview.length > 4 ? <small>+{consumablePreview.length - 4}</small> : null}
              </div>
            ) : (
              <div className="calendar-consumables-summary__empty">{locale === 'sl' ? 'Za storitev ni nastavljenega porabnega materiala.' : 'No consumables are configured for this service.'}</div>
            )}
            <p>{locale === 'sl' ? 'Privzeto iz storitve. Za ta termin lahko količine prilagodite.' : 'Defaults from the service. Quantities can be adjusted for this appointment.'}</p>
          </div>
        ) : null}

        {warnings && warnings.length > 0 ? (
          <div className="calendar-service-chain__warning" role="alert">
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        ) : null}
      </section>

      {consumablesOpen ? (
        <div className="calendar-service-picker-backdrop calendar-consumables-editor-backdrop" onClick={() => setConsumablesOpen(false)}>
          <div className="calendar-consumables-editor" role="dialog" aria-modal="true" aria-label={locale === 'sl' ? 'Uredi porabni material' : 'Edit consumables'} onClick={(event) => event.stopPropagation()}>
            <div className="calendar-consumables-editor__header">
              <div>
                <h3>{locale === 'sl' ? 'Uredi porabni material' : locale === 'sr' ? 'Uredi potrošni materijal' : 'Edit consumables'}</h3>
                <p>{locale === 'sl' ? 'Prilagodite porabni material za ta termin.' : 'Adjust consumables for this appointment.'}</p>
              </div>
              <button type="button" className="calendar-service-picker-modal__close" onClick={() => setConsumablesOpen(false)}><CloseIcon /></button>
            </div>
            <div className="calendar-consumables-editor__toolbar">
              <div className="calendar-consumables-editor__add">
                <select value={consumableToAdd} onChange={(event) => setConsumableToAdd(event.target.value)}>
                  <option value="">{locale === 'sl' ? 'Dodaj artikel …' : 'Add item…'}</option>
                  {consumableCatalog.filter((item) => !workingConsumables.some((row) => row.consumableId === item.id)).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <button type="button" className="secondary slim-btn" disabled={!consumableToAdd} onClick={() => {
                  const item = consumableCatalog.find((entry) => String(entry.id) === consumableToAdd)
                  if (!item) return
                  mutateWorkingConsumables([...workingConsumables, { consumableId: item.id, itemName: item.name, unit: item.unit || 'kos', quantity: 1, quantityMode: 'PER_SESSION', billable: item.billable === true, salePriceSnapshot: item.salePrice ?? null, vatRateSnapshot: item.vatRate ?? 'NO_VAT', notes: null }])
                  setConsumableToAdd('')
                }}>{locale === 'sl' ? 'Dodaj artikel' : 'Add item'}</button>
              </div>
              <button type="button" className="calendar-consumables-editor__reset" onClick={resetWorkingConsumables}>↻ {locale === 'sl' ? 'Ponastavi na privzeto' : 'Reset to defaults'}</button>
            </div>
            <div className="calendar-consumables-editor__head" aria-hidden>
              <span>{locale === 'sl' ? 'Artikel' : 'Item'}</span><span>{locale === 'sl' ? 'Količina' : 'Quantity'}</span><span>{locale === 'sl' ? 'Obračun' : 'Calculation'}</span><span>{locale === 'sl' ? 'Zaračunaj' : 'Bill'}</span><span>{locale === 'sl' ? 'Cena' : 'Price'}</span><span />
            </div>
            <div className="calendar-consumables-editor__rows">
              {workingConsumables.map((row, index) => (
                <div className="calendar-consumables-editor__row" key={`${row.consumableId}-${index}`}>
                  <strong>{row.itemName}</strong>
                  <div className="calendar-consumables-editor__quantity"><input type="number" min="0" step="0.01" value={row.quantity} onChange={(event) => mutateWorkingConsumables(workingConsumables.map((item, rowIndex) => rowIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /><span>{row.unit}</span></div>
                  <select value={row.quantityMode} onChange={(event) => mutateWorkingConsumables(workingConsumables.map((item, rowIndex) => rowIndex === index ? { ...item, quantityMode: event.target.value === 'PER_PARTICIPANT' ? 'PER_PARTICIPANT' : 'PER_SESSION' } : item))}>
                    <option value="PER_SESSION">{locale === 'sl' ? 'Na termin' : 'Per appointment'}</option>
                    <option value="PER_PARTICIPANT">{locale === 'sl' ? 'Na udeleženca' : 'Per participant'}</option>
                  </select>
                  <label className="switch calendar-consumables-editor__switch"><input type="checkbox" checked={row.billable} onChange={(event) => mutateWorkingConsumables(workingConsumables.map((item, rowIndex) => rowIndex === index ? { ...item, billable: event.target.checked } : item))} /><span className="slider" /></label>
                  <span className="calendar-consumables-editor__price">{row.billable ? currency(Number(row.salePriceSnapshot ?? 0)) : '—'}</span>
                  <button type="button" className="calendar-consumables-editor__remove" aria-label={locale === 'sl' ? 'Odstrani' : 'Remove'} onClick={() => mutateWorkingConsumables(workingConsumables.filter((_, rowIndex) => rowIndex !== index))}><TrashIcon /></button>
                </div>
              ))}
            </div>
            <div className="calendar-consumables-editor__note">ⓘ {locale === 'sl' ? 'Spremembe veljajo samo za ta termin in ne spremenijo privzetih nastavitev storitve.' : 'Changes apply only to this appointment and do not change the service defaults.'}</div>
            <div className="calendar-consumables-editor__footer">
              <button type="button" className="secondary" onClick={() => setConsumablesOpen(false)}>{locale === 'sl' ? 'Prekliči' : 'Cancel'}</button>
              <button type="button" className="primary" onClick={saveConsumablesEditor}>{locale === 'sl' ? 'Shrani spremembe' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {pickerOpen ? (
        <div className="calendar-service-picker-backdrop" onClick={closePicker}>
          <div className="calendar-service-picker-modal" role="dialog" aria-modal="true" aria-label={copy.pickerTitle} onClick={(event) => event.stopPropagation()}>
            <div className="calendar-service-picker-modal__header">
              <div className="calendar-service-picker-modal__heading">
                <h3>{pickerReplaceIndex != null ? copy.change : copy.pickerTitle}</h3>
                <p>{copy.pickerDescription}</p>
              </div>
              <button type="button" className="calendar-service-picker-modal__close" onClick={closePicker} aria-label={copy.close}>
                <CloseIcon />
              </button>
            </div>

            <div className="calendar-service-picker-modal__toolbar">
              <label className="calendar-service-picker-modal__search">
                <span aria-hidden><SearchIcon /></span>
                <input
                  type="search"
                  value={pickerQuery}
                  placeholder={copy.searchPlaceholder}
                  aria-label={copy.searchPlaceholder}
                  autoComplete="off"
                  onChange={(event) => setPickerQuery(event.target.value)}
                />
              </label>
            </div>

            <div className="calendar-service-picker-modal__list">
              {filteredSessionTypes.length === 0 ? (
                <div className="calendar-service-picker-modal__empty">{copy.pickerEmpty}</div>
              ) : filteredSessionTypes.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="calendar-service-picker-modal__item"
                  onClick={() => addOrReplaceService(Number(entry.id))}
                >
                  <div className="calendar-service-picker-modal__item-copy">
                    <strong>{serviceName(entry, locale)}</strong>
                    <span className="calendar-service-picker-modal__duration">
                      <ClockIcon />
                      {formatMinutes(Number(entry?.durationMinutes ?? 0), locale)}
                      {Number.isFinite(Number(entry?.priceGross)) ? ` • ${currency(Number(entry.priceGross))}` : ''}
                    </span>
                  </div>
                  <span className="calendar-service-picker-modal__item-action">{copy.addAction}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {editingServiceIndex != null ? (
        <div className="calendar-service-edit-backdrop" onClick={closeEditService}>
          <div className="calendar-service-edit-modal" role="dialog" aria-modal="true" aria-label={copy.editServiceTitle} onClick={(event) => event.stopPropagation()}>
            <div className="calendar-service-edit-modal__header">
              <button type="button" className="calendar-service-edit-modal__close" onClick={closeEditService} aria-label={copy.close}>
                <CloseIcon />
              </button>
              <div className="calendar-service-edit-modal__heading">
                <h3>{copy.editServiceTitle}</h3>
              </div>
              <span className="calendar-service-edit-modal__header-spacer" aria-hidden />
            </div>
            <div className="calendar-service-edit-modal__body">
              <label className="calendar-service-edit-modal__field">
                <span>{copy.serviceName}</span>
                <input
                  type="text"
                  readOnly
                  value={serviceDescription(sessionTypes.find((entry) => Number(entry?.id) === Number(services[editingServiceIndex]?.typeId)), locale)}
                />
              </label>
              <label className="calendar-service-edit-modal__field">
                <span>{copy.duration}</span>
                <select className="calendar-service-edit-modal__duration-select" value={editingServiceDuration} onChange={(event) => setEditingServiceDuration(event.target.value)}>
                  {durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <div className="calendar-service-edit-modal__duration-stepper" role="group" aria-label={copy.duration}>
                  <button
                    type="button"
                    aria-label={copy.decreaseDuration}
                    disabled={Number(editingServiceDuration) <= 5}
                    onClick={() => changeEditingServiceDuration(-5)}
                  >
                    <MinusIcon />
                  </button>
                  <strong>{formatMinutes(Number(editingServiceDuration) || 0, locale)}</strong>
                  <button
                    type="button"
                    aria-label={copy.increaseDuration}
                    disabled={Number(editingServiceDuration) >= 720}
                    onClick={() => changeEditingServiceDuration(5)}
                  >
                    <PlusIcon />
                  </button>
                </div>
              </label>
              <label className="calendar-service-edit-modal__field">
                <span>{copy.price}</span>
                <div className="calendar-service-edit-modal__price-wrap">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editingServicePrice}
                    onChange={(event) => setEditingServicePrice(event.target.value)}
                  />
                  <span>€</span>
                </div>
              </label>
              {showSessionMaxParticipants ? (
                <label className="calendar-service-edit-modal__field">
                  <span>{copy.maxParticipants}</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={editingSessionMaxParticipants}
                    onChange={(event) => setEditingSessionMaxParticipants(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
            <div className="calendar-service-edit-modal__footer">
              <button type="button" className="primary" onClick={saveEditService}>{copy.saveChanges}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
