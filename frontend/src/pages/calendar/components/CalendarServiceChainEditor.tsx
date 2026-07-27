import { useMemo, useState } from 'react'
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
  const name = String(type?.name || '').trim()
  const description = String(type?.description || '').trim()
  if (name && description && name.toLowerCase() !== description.toLowerCase()) return `${name} – ${description}`
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
      price: 'Cena',
      totalDuration: 'Skupno trajanje',
      total: 'Skupaj',
      moveUp: 'Premakni navzgor',
      moveDown: 'Premakni navzdol',
      change: 'Zamenjaj storitev',
      remove: 'Odstrani storitev',
      auto: 'Čas do se izračuna samodejno glede na izbrane storitve.',
      one: '1 storitev',
      many: '{count} storitve',
      choose: 'Izberite storitev',
      conflict: 'Preverite kombinacijo storitev',
      pickerTitle: 'Dodaj storitev',
      pickerDescription: 'Izberite storitev, ki jo želite dodati v termin.',
      pickerEmpty: 'Ni razpoložljivih storitev.',
      close: 'Zapri',
      addAction: 'Dodaj',
      searchPlaceholder: 'Išči storitev ...',
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
      price: 'Cena',
      totalDuration: 'Ukupno trajanje',
      total: 'Ukupno',
      moveUp: 'Pomeri nagore',
      moveDown: 'Pomeri nadole',
      change: 'Zameni uslugu',
      remove: 'Ukloni uslugu',
      auto: 'Vreme završetka se automatski računa prema izabranim uslugama.',
      one: '1 usluga',
      many: '{count} usluge',
      choose: 'Izaberite uslugu',
      conflict: 'Proverite kombinaciju usluga',
      pickerTitle: 'Dodaj uslugu',
      pickerDescription: 'Izaberite uslugu koju želite da dodate u termin.',
      pickerEmpty: 'Nema dostupnih usluga.',
      close: 'Zatvori',
      addAction: 'Dodaj',
      searchPlaceholder: 'Pretraži uslugu ...',
    }
  }
  return {
    services: 'Services',
    service: 'Service',
    addTitle: 'Add service',
    space: 'Space',
    noSpace: 'No location',
    duration: 'Duration',
    price: 'Price',
    totalDuration: 'Total duration',
    total: 'Total',
    moveUp: 'Move up',
    moveDown: 'Move down',
    change: 'Change service',
    remove: 'Remove service',
    auto: 'End time is calculated automatically from the selected services.',
    one: '1 service',
    many: '{count} services',
    choose: 'Select service',
    conflict: 'Check the service combination',
    pickerTitle: 'Add service',
    pickerDescription: 'Choose a service to add to this appointment.',
    pickerEmpty: 'No services available.',
    close: 'Close',
    addAction: 'Add',
    searchPlaceholder: 'Search services ...',
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
}) {
  const copy = labels(locale)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerReplaceIndex, setPickerReplaceIndex] = useState<number | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [menuIndex, setMenuIndex] = useState<number | null>(null)

  const count = services.filter((service) => service.typeId != null).length
  const isMultiMode = count > 1

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
    () => [...sessionTypes].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), locale)),
    [locale, sessionTypes],
  )

  const filteredSessionTypes = useMemo(() => {
    const query = pickerQuery.trim().toLocaleLowerCase(locale)
    if (!query) return sortedSessionTypes
    return sortedSessionTypes.filter((entry) => serviceName(entry, locale).toLocaleLowerCase(locale).includes(query))
  }, [locale, pickerQuery, sortedSessionTypes])

  const updateAt = (index: number, patch: Partial<CalendarServiceDraft>) => {
    onChange(services.map((service, idx) => (idx === index ? { ...service, ...patch } : service)))
  }

  const removeAt = (index: number) => {
    const next = services.filter((_, idx) => idx !== index)
    onChange(next.length > 0 ? next : [{ typeId: null, spaceId: defaultSpaceId ?? null }])
    setMenuIndex(null)
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= services.length) return
    const next = [...services]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    onChange(next)
    setMenuIndex(null)
  }

  const openAddPicker = () => {
    setPickerReplaceIndex(null)
    setPickerQuery('')
    setMenuIndex(null)
    setPickerOpen(true)
  }

  const openReplacePicker = (index: number) => {
    setPickerReplaceIndex(index)
    setPickerQuery('')
    setMenuIndex(null)
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
              <button
                type="button"
                className="secondary client-add-btn calendar-client-picker__add-btn calendar-service-chain__head-add"
                aria-label={copy.addTitle}
                title={copy.addTitle}
                onClick={openAddPicker}
              >
                <span aria-hidden><PlusIcon /></span>
              </button>
            </div>

            <div className="calendar-service-chain__list">
              {services.filter((service) => service.typeId != null).map((service, index) => {
                const segment = segments[index]
                const type = sessionTypes.find((entry) => Number(entry?.id) === Number(service.typeId))
                return (
                  <article className="calendar-service-chain__item" key={`${service.id ?? 'new'}-${index}`}>
                    <div className="calendar-service-chain__body">
                      <div className="calendar-service-chain__card-top">
                        <div className="calendar-service-chain__title-block">
                          <strong className="calendar-service-chain__title">{serviceName(type, locale)}</strong>
                          <span className="calendar-service-chain__duration-pill"><ClockIcon /> {formatMinutes(segment?.durationMinutes ?? Number(type?.durationMinutes ?? 0), locale)}</span>
                        </div>
                        <div className="calendar-service-chain__item-actions">
                          <div className="calendar-service-chain__menu-wrap">
                            <button
                              type="button"
                              className="calendar-service-chain__icon-btn calendar-service-chain__more-btn"
                              aria-label={copy.change}
                              title={copy.change}
                              onClick={() => setMenuIndex((current) => (current === index ? null : index))}
                            >
                              <MoreIcon />
                            </button>
                            {menuIndex === index ? (
                              <div className="calendar-service-chain__menu">
                                <button type="button" onClick={() => openReplacePicker(index)}>{copy.change}</button>
                                <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>{copy.moveUp}</button>
                                <button type="button" disabled={index === services.filter((entry) => entry.typeId != null).length - 1} onClick={() => move(index, 1)}>{copy.moveDown}</button>
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
                          <strong>{formatMinutes(segment?.durationMinutes ?? Number(type?.durationMinutes ?? 0), locale)}</strong>
                          <span className="calendar-service-chain__time">{timePart(segment?.startTime)}–{timePart(segment?.endTime)}</span>
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
            <div className="calendar-service-chain__single-row">
              <select
                className="calendar-service-chain__single-select"
                value={services[0]?.typeId ?? ''}
                aria-label={copy.service}
                onChange={(event) => updateAt(0, { typeId: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">{copy.choose}</option>
                {sortedSessionTypes.map((entry) => (
                  <option key={entry.id} value={entry.id}>{serviceName(entry, locale)}</option>
                ))}
              </select>
              <button
                type="button"
                className="secondary client-add-btn calendar-client-picker__add-btn calendar-service-chain__head-add"
                aria-label={copy.addTitle}
                title={copy.addTitle}
                onClick={openAddPicker}
              >
                <span aria-hidden><PlusIcon /></span>
              </button>
            </div>
          </label>
        )}

        {warnings && warnings.length > 0 ? (
          <div className="calendar-service-chain__warning" role="alert">
            <strong>{copy.conflict}</strong>
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        ) : null}
      </section>

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
    </>
  )
}
