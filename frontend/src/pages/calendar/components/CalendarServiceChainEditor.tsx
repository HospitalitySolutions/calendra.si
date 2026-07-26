import type { DragEvent } from 'react'
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
      more: 'Več možnosti', drag: 'Povlecite za spremembo vrstnega reda', one: '1 storitev', many: '{count} storitve',
      choose: 'Izberite storitev', conflict: 'Preverite kombinacijo storitev',
    }
  }
  if (locale === 'sr') {
    return {
      services: 'Usluge', service: 'Usluga', add: 'Dodaj uslugu', space: 'Prostor', noSpace: 'Bez prostora',
      duration: 'Trajanje', price: 'Cena', totalDuration: 'Ukupno trajanje', total: 'Ukupno',
      moveUp: 'Pomeri nagore', moveDown: 'Pomeri nadole', remove: 'Ukloni uslugu',
      more: 'Više opcija', drag: 'Prevucite da promenite redosled', one: '1 usluga', many: '{count} usluge',
      choose: 'Izaberite uslugu', conflict: 'Proverite kombinaciju usluga',
    }
  }
  return {
    services: 'Services', service: 'Service', add: 'Add service', space: 'Space', noSpace: 'No space',
    duration: 'Duration', price: 'Price', totalDuration: 'Total duration', total: 'Total',
    moveUp: 'Move up', moveDown: 'Move down', remove: 'Remove service',
    more: 'More options', drag: 'Drag to reorder', one: '1 service', many: '{count} services',
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7m-8.5 0 .7 13h9.6l.7-13M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SpaceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 18V7.5M4 14h16v4M7 14V9h4.5a3 3 0 0 1 3 3v2M20 18V11.5A2.5 2.5 0 0 0 17.5 9H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  )
}

function DragHandleIcon() {
  return (
    <svg width="18" height="28" viewBox="0 0 18 28" fill="currentColor" aria-hidden>
      <circle cx="5" cy="5" r="1.6" /><circle cx="13" cy="5" r="1.6" />
      <circle cx="5" cy="14" r="1.6" /><circle cx="13" cy="14" r="1.6" />
      <circle cx="5" cy="23" r="1.6" /><circle cx="13" cy="23" r="1.6" />
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
  const moveTo = (from: number, target: number) => {
    if (from < 0 || target < 0 || from >= services.length || target >= services.length || from === target) return
    const next = [...services]
    const [row] = next.splice(from, 1)
    next.splice(target, 0, row)
    onChange(next)
  }
  const move = (index: number, direction: -1 | 1) => moveTo(index, index + direction)
  const startDrag = (event: DragEvent<HTMLSpanElement>, index: number) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/calendar-service-index', String(index))
  }
  const dropAt = (event: DragEvent<HTMLElement>, index: number) => {
    event.preventDefault()
    const from = Number(event.dataTransfer.getData('text/calendar-service-index'))
    if (Number.isInteger(from)) moveTo(from, index)
  }

  return (
    <section className="calendar-service-chain" aria-label={copy.services}>
      <div className="calendar-service-chain__head">
        <div className="calendar-service-chain__title">
          <strong>{copy.services}</strong>
          <span>{countLabel}</span>
        </div>
        <button type="button" className="calendar-service-chain__add" onClick={onAdd}>
          <PlusIcon />
          <span>{copy.add}</span>
        </button>
      </div>

      <div className="calendar-service-chain__list">
        {services.map((service, index) => {
          const segment = segments[index]
          const type = sessionTypes.find((entry) => Number(entry?.id) === Number(service.typeId))
          const durationMinutes = segment?.durationMinutes ?? Number(type?.durationMinutes ?? 0)
          return (
            <article
              className="calendar-service-chain__item"
              key={`${service.id ?? 'new'}-${index}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropAt(event, index)}
            >
              <span
                className="calendar-service-chain__drag"
                draggable={services.length > 1}
                onDragStart={(event) => startDrag(event, index)}
                title={copy.drag}
                aria-hidden
              >
                <DragHandleIcon />
              </span>

              <div className="calendar-service-chain__order" aria-hidden>{index + 1}</div>

              <div className="calendar-service-chain__service">
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
                <span className="calendar-service-chain__duration-chip">
                  <ClockIcon />
                  {formatMinutes(durationMinutes, locale)}
                </span>
              </div>

              <label className="calendar-service-chain__space">
                <span className="calendar-service-chain__field-label">{copy.space}</span>
                <span className="calendar-service-chain__space-control">
                  <SpaceIcon />
                  <select value={service.spaceId ?? ''} onChange={(event) => updateAt(index, { spaceId: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">{copy.noSpace}</option>
                    {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                  </select>
                </span>
              </label>

              <div className="calendar-service-chain__duration">
                <span className="calendar-service-chain__field-label">{copy.duration}</span>
                <strong>{formatMinutes(durationMinutes, locale)}</strong>
                <span className="calendar-service-chain__time">{timePart(segment?.startTime)}–{timePart(segment?.endTime)}</span>
              </div>

              <div className="calendar-service-chain__price">
                <span className="calendar-service-chain__field-label">{copy.price}</span>
                <strong>{segment?.grossPrice == null ? '—' : currency(segment.grossPrice)}</strong>
              </div>

              <details className="calendar-service-chain__more">
                <summary title={copy.more} aria-label={copy.more}><MoreIcon /></summary>
                <div className="calendar-service-chain__menu">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                    <MoveIcon direction="up" />
                    <span>{copy.moveUp}</span>
                  </button>
                  <button type="button" disabled={index === services.length - 1} onClick={() => move(index, 1)}>
                    <MoveIcon direction="down" />
                    <span>{copy.moveDown}</span>
                  </button>
                </div>
              </details>

              <button type="button" className="calendar-service-chain__remove" title={copy.remove} aria-label={copy.remove} onClick={() => removeAt(index)}>
                <TrashIcon />
              </button>
            </article>
          )
        })}
      </div>

      <span className="calendar-service-chain__sr-summary">
        {copy.totalDuration}: {formatMinutes(totalSpanMinutes, locale)}. {copy.total}: {displayedTotalGross == null ? '—' : currency(displayedTotalGross)}.
      </span>

      {warnings && warnings.length > 0 ? (
        <div className="calendar-service-chain__warning" role="alert">
          <strong>{copy.conflict}</strong>
          {warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
    </section>
  )
}
