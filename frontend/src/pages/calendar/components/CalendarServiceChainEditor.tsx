import type { CalendarServiceDraft, CalendarServiceSegment } from '../calendarTypes'

function formatMinutes(totalMinutes: number, locale: string) {
  const minutes = Math.max(0, Math.round(totalMinutes || 0))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours <= 0) return locale === 'sr' ? `${rest} min` : `${rest} min`
  if (rest <= 0) return `${hours} h`
  return `${hours} h ${rest} min`
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
      services: 'Storitve', service: 'Storitev', add: 'Dodaj storitev', space: 'Prostor', noSpace: 'Brez prostora',
      duration: 'Trajanje', price: 'Cena', totalDuration: 'Skupno trajanje', total: 'Skupaj',
      moveUp: 'Premakni navzgor', moveDown: 'Premakni navzdol', remove: 'Odstrani storitev',
      auto: 'Čas do se izračuna samodejno glede na izbrane storitve.', one: '1 storitev', many: '{count} storitve',
      choose: 'Izberite storitev', conflict: 'Preverite kombinacijo storitev',
    }
  }
  if (locale === 'sr') {
    return {
      services: 'Usluge', service: 'Usluga', add: 'Dodaj uslugu', space: 'Prostor', noSpace: 'Bez prostora',
      duration: 'Trajanje', price: 'Cena', totalDuration: 'Ukupno trajanje', total: 'Ukupno',
      moveUp: 'Pomeri nagore', moveDown: 'Pomeri nadole', remove: 'Ukloni uslugu',
      auto: 'Vreme završetka se automatski računa prema izabranim uslugama.', one: '1 usluga', many: '{count} usluge',
      choose: 'Izaberite uslugu', conflict: 'Proverite kombinaciju usluga',
    }
  }
  return {
    services: 'Services', service: 'Service', add: 'Add service', space: 'Space', noSpace: 'No space',
    duration: 'Duration', price: 'Price', totalDuration: 'Total duration', total: 'Total',
    moveUp: 'Move up', moveDown: 'Move down', remove: 'Remove service',
    auto: 'End time is calculated automatically from the selected services.', one: '1 service', many: '{count} services',
    choose: 'Select service', conflict: 'Check the service combination',
  }
}

function MoveIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7m-8.5 0 .7 13h9.6l.7-13M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  onAdd,
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
  onAdd: () => void
}) {
  const copy = labels(locale)
  const count = services.filter((service) => service.typeId != null).length
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

  const updateAt = (index: number, patch: Partial<CalendarServiceDraft>) => {
    onChange(services.map((service, idx) => (idx === index ? { ...service, ...patch } : service)))
  }
  const removeAt = (index: number) => {
    const next = services.filter((_, idx) => idx !== index)
    onChange(next.length > 0 ? next : [{ typeId: null, spaceId: null }])
  }
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= services.length) return
    const next = [...services]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    onChange(next)
  }

  return (
    <section className="calendar-service-chain" aria-label={copy.services}>
      <div className="calendar-service-chain__head">
        <strong>{copy.services}</strong>
        <span>{countLabel}</span>
      </div>

      <div className="calendar-service-chain__list">
        {services.map((service, index) => {
          const segment = segments[index]
          const type = sessionTypes.find((entry) => Number(entry?.id) === Number(service.typeId))
          const selectedSpace = spaces.find((entry) => Number(entry?.id) === Number(service.spaceId))
          return (
            <article className="calendar-service-chain__item" key={`${service.id ?? 'new'}-${index}`}>
              <div className="calendar-service-chain__order" aria-hidden>{index + 1}</div>
              <div className="calendar-service-chain__body">
                <div className="calendar-service-chain__select-row">
                  <select
                    className="calendar-service-chain__type-select"
                    value={service.typeId ?? ''}
                    aria-label={`${copy.service} ${index + 1}`}
                    onChange={(event) => updateAt(index, { typeId: event.target.value ? Number(event.target.value) : null })}
                  >
                    <option value="">{copy.choose}</option>
                    {sessionTypes.map((entry) => (
                      <option key={entry.id} value={entry.id}>{serviceName(entry, locale)}</option>
                    ))}
                  </select>
                  <div className="calendar-service-chain__actions">
                    <button type="button" className="calendar-service-chain__move" disabled={index === 0} title={copy.moveUp} aria-label={copy.moveUp} onClick={() => move(index, -1)}><MoveIcon direction="up" /></button>
                    <button type="button" className="calendar-service-chain__move" disabled={index === services.length - 1} title={copy.moveDown} aria-label={copy.moveDown} onClick={() => move(index, 1)}><MoveIcon direction="down" /></button>
                    <button type="button" className="calendar-service-chain__remove" title={copy.remove} aria-label={copy.remove} onClick={() => removeAt(index)}><TrashIcon /></button>
                  </div>
                </div>

                <div className="calendar-service-chain__meta">
                  <label>
                    <span>{copy.space}</span>
                    <select value={service.spaceId ?? ''} onChange={(event) => updateAt(index, { spaceId: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">{copy.noSpace}</option>
                      {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                    </select>
                  </label>
                  <span><b>{copy.duration}:</b> {formatMinutes(segment?.durationMinutes ?? Number(type?.durationMinutes ?? 0), locale)}</span>
                  {segment?.grossPrice != null ? <span><b>{copy.price}:</b> {currency(segment.grossPrice)}</span> : null}
                  <span className="calendar-service-chain__time">{timePart(segment?.startTime)}–{timePart(segment?.endTime)}</span>
                </div>
                {selectedSpace && !service.typeId ? <span className="calendar-service-chain__legacy-space">{selectedSpace.name}</span> : null}
              </div>
            </article>
          )
        })}
      </div>

      <button type="button" className="calendar-service-chain__add" onClick={onAdd}>+ {copy.add}</button>

      <div className="calendar-service-chain__summary">
        <div><span>{copy.totalDuration}</span><strong>{formatMinutes(totalSpanMinutes, locale)}</strong></div>
        <div><span>{copy.total}</span><strong>{displayedTotalGross == null ? '—' : currency(displayedTotalGross)}</strong></div>
      </div>

      <p className="calendar-service-chain__auto-note">{copy.auto}</p>

      {warnings && warnings.length > 0 ? (
        <div className="calendar-service-chain__warning" role="alert">
          <strong>{copy.conflict}</strong>
          {warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
    </section>
  )
}
