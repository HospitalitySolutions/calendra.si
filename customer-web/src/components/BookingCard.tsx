import { Link } from 'react-router-dom'
import type { CustomerBooking } from '../api/types'
import { formatDateTime, formatMoney, formatTime, humanizeStatus } from '../utils'
import { CalendarIcon, ChevronRightIcon, ClockIcon, MapPinIcon } from './Icons'
import { ProviderAvatar } from './ProviderAvatar'

export function BookingCard({ booking, compact = false }: { booking: CustomerBooking; compact?: boolean }) {
  const serviceName = booking.sessionTypeName || booking.services?.[0]?.name || 'Termin'
  return (
    <Link to={`/termini/${booking.bookingId}`} className={`booking-card ${compact ? 'booking-card--compact' : ''}`}>
      <div className="booking-card__date">
        <CalendarIcon size={18}/>
        <span>{formatDateTime(booking.startsAt, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="booking-card__main">
        <ProviderAvatar name={booking.provider.companyName} logoUrl={booking.provider.logoUrl} size={compact ? 'sm' : 'md'} />
        <div className="booking-card__copy">
          <div className="booking-card__eyebrow">{booking.provider.companyName}</div>
          <h3>{serviceName}</h3>
          <div className="meta-row">
            <span><ClockIcon size={15}/>{formatTime(booking.startsAt)}{booking.endsAt ? `–${formatTime(booking.endsAt)}` : ''}</span>
            {booking.provider.locationName && <span><MapPinIcon size={15}/>{booking.provider.locationName}</span>}
          </div>
        </div>
      </div>
      {!compact && <div className="booking-card__footer"><span className={`status-pill status-pill--${booking.bookingStatus.toLowerCase()}`}>{humanizeStatus(booking.bookingStatus)}</span><strong>{formatMoney(booking.totalPriceGross, booking.currency || 'EUR')}</strong></div>}
      <ChevronRightIcon className="booking-card__chevron" size={19}/>
    </Link>
  )
}
