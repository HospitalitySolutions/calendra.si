import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { MARKETING_BASE_URL } from '../config'
import { CalendarIcon, ChevronLeftIcon, ClockIcon, MapPinIcon } from '../components/Icons'
import { ErrorState, PageLoader, Spinner } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'
import { formatDateTime, formatMoney, formatTime, humanizeStatus } from '../utils'

export function BookingDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState('')
  const query = useQuery({ queryKey: ['customer-booking', id], queryFn: () => customerApi.booking(id), enabled: Boolean(id) })
  const cancel = useMutation({
    mutationFn: () => customerApi.cancelBooking(id),
    onSuccess: async () => {
      setConfirmCancel(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer-booking', id] }),
        queryClient.invalidateQueries({ queryKey: ['customer-bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-home'] }),
      ])
    },
    onError: err => setError(err instanceof ApiError ? err.message : 'Termina ni bilo mogoče odpovedati.'),
  })

  if (query.isLoading) return <PageLoader/>
  if (query.isError || !query.data) return <ErrorState onRetry={() => void query.refetch()}/>
  const booking = query.data
  const serviceName = booking.sessionTypeName || booking.services?.[0]?.name || 'Termin'
  const cancellable = !['CANCELLED', 'COMPLETED', 'CHECKED_OUT'].includes(booking.bookingStatus.toUpperCase()) && new Date(booking.startsAt).getTime() > Date.now()

  return <div className="detail-page">
    <button className="back-link" onClick={() => navigate(-1)}><ChevronLeftIcon size={18}/> Nazaj</button>
    <section className="detail-card detail-card--hero">
      <div className="detail-provider"><ProviderAvatar name={booking.provider.companyName} logoUrl={booking.provider.logoUrl} size="lg"/><div><span className="overline">{booking.provider.companyName}</span><h2>{serviceName}</h2>{booking.consultantName && <p>{booking.consultantName}</p>}</div></div>
      <span className={`status-pill status-pill--${booking.bookingStatus.toLowerCase()}`}>{humanizeStatus(booking.bookingStatus)}</span>
      <div className="detail-facts"><div><CalendarIcon/><span><small>Datum</small><strong>{formatDateTime(booking.startsAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></span></div><div><ClockIcon/><span><small>Čas</small><strong>{formatTime(booking.startsAt)}{booking.endsAt ? `–${formatTime(booking.endsAt)}` : ''}</strong></span></div><div><MapPinIcon/><span><small>Lokacija</small><strong>{booking.provider.locationName || booking.provider.locationAddress || '—'}</strong></span></div></div>
    </section>

    <section className="detail-card"><div className="section-heading"><div><span className="overline">Podrobnosti</span><h2>Rezervacija</h2></div></div><div className="detail-list">{booking.services?.map(service => <div key={`${service.sessionTypeId}-${service.position}`}><span>{service.name}</span><strong>{formatMoney(service.priceGross, service.currency || booking.currency || 'EUR')}</strong></div>)}<div><span>Skupaj</span><strong>{formatMoney(booking.totalPriceGross, booking.currency || 'EUR')}</strong></div>{booking.paymentStatus && <div><span>Plačilo</span><strong>{humanizeStatus(booking.paymentStatus)}</strong></div>}</div></section>

    <section className="detail-actions"><a className="button button--primary" href={`${MARKETING_BASE_URL}/ponudniki`}>Rezerviraj nov termin</a>{cancellable && <button className="button button--danger-outline" onClick={() => { setError(''); setConfirmCancel(true) }}>Odpovej termin</button>}</section>
    <p className="detail-note">Prestavljanje termina bomo povezali neposredno z razpoložljivostjo ponudnika v naslednji integracijski fazi. Trenutno lahko termin odpoveste ali ustvarite novo rezervacijo.</p>

    {confirmCancel && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true"><h3>Odpovem termin?</h3><p>Termin {formatDateTime(booking.startsAt)} bo odpovedan. Pravila ponudnika lahko vplivajo na vračilo dobroimetja.</p>{error && <div className="form-alert form-alert--error">{error}</div>}<div className="modal__actions"><button className="button button--secondary" onClick={() => setConfirmCancel(false)} disabled={cancel.isPending}>Ne, obdrži termin</button><button className="button button--danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>{cancel.isPending ? <><Spinner small/> Odpovedujem …</> : 'Da, odpovej'}</button></div></div></div>}
  </div>
}
