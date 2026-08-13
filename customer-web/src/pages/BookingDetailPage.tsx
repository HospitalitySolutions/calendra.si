import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { launchCustomerBooking } from '../bookingHandoff'
import { CalendarIcon, ChevronLeftIcon, ClockIcon, MapPinIcon } from '../components/Icons'
import { ErrorState, PageLoader, Spinner } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'
import { formatDateTime, formatMoney, formatTime, humanizeStatus } from '../utils'

function localIsoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function BookingDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState(localIsoDate())
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [error, setError] = useState('')
  const [bookingLaunchError, setBookingLaunchError] = useState('')

  const query = useQuery({ queryKey: ['customer-booking', id], queryFn: () => customerApi.booking(id), enabled: Boolean(id) })
  const booking = query.data
  const sessionTypeId = booking?.sessionTypeId || booking?.services?.[0]?.sessionTypeId || ''
  const locationId = booking?.provider.locationId || ''
  const companyId = booking?.provider.companyId || ''

  const availability = useQuery({
    queryKey: ['customer-reschedule-availability', id, rescheduleDate, sessionTypeId, locationId],
    queryFn: () => customerApi.availability(companyId, sessionTypeId, rescheduleDate, locationId || null),
    enabled: rescheduleOpen && Boolean(companyId && sessionTypeId && rescheduleDate),
    staleTime: 15_000,
  })

  const cancel = useMutation({
    mutationFn: () => customerApi.cancelBooking(id),
    onSuccess: async () => {
      setConfirmCancel(false)
      setError('')
      await invalidateBookingQueries()
    },
    onError: err => setError(err instanceof ApiError ? err.message : 'Termina ni bilo mogoče odpovedati.'),
  })


  const prepareReschedule = useMutation({
    mutationFn: () => {
      if (!locationId || !sessionTypeId) throw new Error('Lokacija ali storitev ni na voljo.')
      return customerApi.bookingHandoff(locationId, sessionTypeId)
    },
    onSuccess: () => {
      setError('')
      setSelectedSlotId('')
      setRescheduleDate(localIsoDate())
      setRescheduleOpen(true)
    },
    onError: err => setError(err instanceof ApiError || err instanceof Error ? err.message : 'Prestavljanja ni bilo mogoče pripraviti.'),
  })

  const reschedule = useMutation({
    mutationFn: (slotId: string) => customerApi.rescheduleBooking(id, slotId),
    onSuccess: async () => {
      setRescheduleOpen(false)
      setSelectedSlotId('')
      setError('')
      await invalidateBookingQueries()
    },
    onError: err => setError(err instanceof ApiError ? err.message : 'Termina ni bilo mogoče prestaviti.'),
  })

  const launchBooking = useMutation({
    mutationFn: (withSameService: boolean) => {
      if (!locationId) throw new Error('Lokacija ponudnika ni na voljo.')
      return launchCustomerBooking(locationId, withSameService ? sessionTypeId || null : null)
    },
    onMutate: () => setBookingLaunchError(''),
    onError: err => setBookingLaunchError(err instanceof ApiError || err instanceof Error ? err.message : 'Rezervacije ni bilo mogoče odpreti.'),
  })

  async function invalidateBookingQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customer-booking', id] }),
      queryClient.invalidateQueries({ queryKey: ['customer-bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['customer-home'] }),
    ])
  }

  const availableSlots = useMemo(
    () => (availability.data?.slots || []).filter(slot => slot.available !== false),
    [availability.data],
  )

  if (query.isLoading) return <PageLoader/>
  if (query.isError || !booking) return <ErrorState onRetry={() => void query.refetch()}/>

  const serviceName = booking.sessionTypeName || booking.services?.[0]?.name || 'Termin'
  const futureBooking = new Date(booking.startsAt).getTime() > Date.now()
  const terminalStatus = ['CANCELLED', 'COMPLETED', 'CHECKED_OUT'].includes(booking.bookingStatus.toUpperCase())
  const cancellable = !terminalStatus && futureBooking
  const reschedulable = !terminalStatus && futureBooking && Boolean(sessionTypeId && companyId && locationId)

  return <div className="detail-page">
    <button className="back-link" onClick={() => navigate(-1)}><ChevronLeftIcon size={18}/> Nazaj</button>
    <section className="detail-card detail-card--hero">
      <div className="detail-provider"><ProviderAvatar name={booking.provider.companyName} logoUrl={booking.provider.logoUrl} size="lg"/><div><span className="overline">{booking.provider.companyName}</span><h2>{serviceName}</h2>{booking.consultantName && <p>{booking.consultantName}</p>}</div></div>
      <span className={`status-pill status-pill--${booking.bookingStatus.toLowerCase()}`}>{humanizeStatus(booking.bookingStatus)}</span>
      <div className="detail-facts"><div><CalendarIcon/><span><small>Datum</small><strong>{formatDateTime(booking.startsAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></span></div><div><ClockIcon/><span><small>Čas</small><strong>{formatTime(booking.startsAt)}{booking.endsAt ? `–${formatTime(booking.endsAt)}` : ''}</strong></span></div><div><MapPinIcon/><span><small>Lokacija</small><strong>{booking.provider.locationName || booking.provider.locationAddress || '—'}</strong></span></div></div>
    </section>

    <section className="detail-card"><div className="section-heading"><div><span className="overline">Podrobnosti</span><h2>Rezervacija</h2></div></div><div className="detail-list">{booking.services?.map(service => <div key={`${service.sessionTypeId}-${service.position}`}><span>{service.name}</span><strong>{formatMoney(service.priceGross, service.currency || booking.currency || 'EUR')}</strong></div>)}<div><span>Skupaj</span><strong>{formatMoney(booking.totalPriceGross, booking.currency || 'EUR')}</strong></div>{booking.paymentStatus && <div><span>Plačilo</span><strong>{humanizeStatus(booking.paymentStatus)}</strong></div>}</div></section>

    {bookingLaunchError && <div className="form-alert form-alert--error">{bookingLaunchError}</div>}
    {error && !rescheduleOpen && !confirmCancel && <div className="form-alert form-alert--error">{error}</div>}
    <section className="detail-actions">
      {locationId && <button className="button button--primary" onClick={() => launchBooking.mutate(true)} disabled={launchBooking.isPending}>{launchBooking.isPending ? <><Spinner small/> Odpiram …</> : 'Rezerviraj ponovno'}</button>}
      {reschedulable && <button className="button button--secondary" onClick={() => { setError(''); prepareReschedule.mutate() }} disabled={prepareReschedule.isPending}>{prepareReschedule.isPending ? <><Spinner small/> Pripravljam …</> : 'Prestavi termin'}</button>}
      {cancellable && <button className="button button--danger-outline" onClick={() => { setError(''); setConfirmCancel(true) }}>Odpovej termin</button>}
    </section>

    {rescheduleOpen && <div className="modal-backdrop" role="presentation"><div className="modal modal--wide" role="dialog" aria-modal="true"><h3>Prestavi termin</h3><p>Izberite nov datum in prost termin za <strong>{serviceName}</strong>. Storitev in lokacija ostaneta enaki.</p><label className="reschedule-date"><span>Datum</span><input type="date" min={localIsoDate()} value={rescheduleDate} onChange={event => { setRescheduleDate(event.target.value); setSelectedSlotId(''); setError('') }}/></label>{availability.isLoading ? <div className="reschedule-loading"><Spinner/> Iščem proste termine …</div> : availability.isError ? <div className="form-alert form-alert--error">{availability.error instanceof ApiError ? availability.error.message : 'Prostih terminov ni bilo mogoče naložiti.'}</div> : availableSlots.length === 0 ? <div className="reschedule-empty">Za ta datum ni prostih terminov.</div> : <div className="reschedule-slots">{availableSlots.map(slot => <button key={slot.slotId} type="button" className={selectedSlotId === slot.slotId ? 'reschedule-slot reschedule-slot--selected' : 'reschedule-slot'} onClick={() => { setSelectedSlotId(slot.slotId); setError('') }}><strong>{formatTime(slot.startsAt)}</strong><span>{formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}</span></button>)}</div>}{error && <div className="form-alert form-alert--error">{error}</div>}<div className="modal__actions"><button className="button button--secondary" onClick={() => { setRescheduleOpen(false); setSelectedSlotId(''); setError('') }} disabled={reschedule.isPending}>Prekliči</button><button className="button button--primary" onClick={() => selectedSlotId && reschedule.mutate(selectedSlotId)} disabled={!selectedSlotId || reschedule.isPending}>{reschedule.isPending ? <><Spinner small/> Prestavljam …</> : 'Potrdi nov termin'}</button></div></div></div>}

    {confirmCancel && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true"><h3>Odpovem termin?</h3><p>Termin {formatDateTime(booking.startsAt)} bo odpovedan. Pravila ponudnika lahko vplivajo na vračilo dobroimetja.</p>{error && <div className="form-alert form-alert--error">{error}</div>}<div className="modal__actions"><button className="button button--secondary" onClick={() => setConfirmCancel(false)} disabled={cancel.isPending}>Ne, obdrži termin</button><button className="button button--danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>{cancel.isPending ? <><Spinner small/> Odpovedujem …</> : 'Da, odpovej'}</button></div></div></div>}
  </div>
}
