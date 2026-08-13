import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { launchCustomerBooking } from '../bookingHandoff'
import { ArrowUpRightIcon, CalendarIcon, ClockIcon, MapPinIcon, StarIcon, WalletIcon } from '../components/Icons'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'
import { formatMoney } from '../utils'

function productTypeLabel(type: string) {
  switch ((type || '').toUpperCase()) {
    case 'PACK': return 'Paket'
    case 'MEMBERSHIP': return 'Članstvo'
    case 'GIFT_CARD': return 'Darilni bon'
    default: return 'Ugodnost'
  }
}

export function ProviderPage() {
  const { slug = '' } = useParams()
  const [bookingServiceId, setBookingServiceId] = useState<number | null>(null)
  const [bookingError, setBookingError] = useState('')
  const query = useQuery({
    queryKey: ['public-storefront', slug],
    queryFn: () => customerApi.storefront(slug),
    enabled: Boolean(slug),
  })
  const booking = useMutation({
    mutationFn: (payload: { locationId: number; serviceId?: number | null }) => launchCustomerBooking(payload.locationId, payload.serviceId),
    onMutate: payload => { setBookingServiceId(payload.serviceId || 0); setBookingError('') },
    onError: error => {
      setBookingServiceId(null)
      setBookingError(error instanceof ApiError ? error.message : 'Rezervacije ni bilo mogoče odpreti.')
    },
  })

  if (query.isLoading) return <PageLoader/>
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()}/>
  const storefront = query.data
  if (!storefront) return <EmptyState title="Ponudnik ni na voljo" description="Profila ponudnika ni bilo mogoče najti."/>

  const { location, services, products, team } = storefront
  const address = location.publicAddress || [location.physicalAddress?.address, location.physicalAddress?.postalCode, location.physicalAddress?.city].filter(Boolean).join(', ')

  return <div className="page-stack provider-detail-page">
    <section className="provider-detail-hero">
      <div className="provider-detail-hero__identity">
        <ProviderAvatar name={location.publicName} logoUrl={location.logoUrl} size="lg"/>
        <div><span className="overline">Ponudnik</span><h2>{location.publicName}</h2><div className="provider-detail-meta">{address && <span><MapPinIcon size={16}/>{address}</span>}{location.googleRating != null && <span><StarIcon size={16}/>{location.googleRating.toFixed(1)} {location.googleReviewCount ? `(${location.googleReviewCount})` : ''}</span>}</div></div>
      </div>
      {location.publicBookingEnabled && <button className="button button--primary" disabled={booking.isPending} onClick={() => booking.mutate({ locationId: location.locationId })}><CalendarIcon size={18}/> {booking.isPending && bookingServiceId === 0 ? 'Odpiram …' : 'Rezerviraj termin'}</button>}
    </section>

    {location.publicDescription && <section className="provider-detail-section provider-about"><span className="overline">O ponudniku</span><p>{location.publicDescription}</p></section>}
    {bookingError && <div className="form-alert form-alert--error">{bookingError}</div>}

    <section className="provider-detail-section" id="services"><div className="section-heading"><div><span className="overline">Storitve</span><h3>Rezervirajte svoj naslednji termin</h3></div></div>
      {services.length ? <div className="storefront-service-list">{services.map(service => <article className="storefront-service" key={service.id}><div><h4>{service.name}</h4>{service.description && <p>{service.description}</p>}<div className="storefront-service__meta">{service.durationMinutes != null && <span><ClockIcon size={15}/>{service.durationMinutes} min</span>}<strong>{service.priceLabel || (service.priceGross != null ? formatMoney(service.priceGross, 'EUR') : '')}</strong></div></div><button className="button button--secondary" disabled={booking.isPending && bookingServiceId === service.id} onClick={() => booking.mutate({ locationId: location.locationId, serviceId: service.id })}>{booking.isPending && bookingServiceId === service.id ? 'Odpiram …' : 'Rezerviraj'}</button></article>)}</div> : <EmptyState title="Storitve še niso objavljene" description="Ponudnik trenutno nima javno objavljenih storitev."/>}
    </section>

    <section className="provider-detail-section" id="offers"><div className="section-heading"><div><span className="overline">Paketi, članstva in boni</span><h3>Kupite neposredno v Calendra Connect</h3></div><WalletIcon size={26}/></div>
      {products.length ? <div className="commerce-product-grid">{products.map(product => <article className="commerce-product-card" key={product.productId}>{product.promoText && <span className="commerce-product-card__badge">{product.promoText}</span>}<span className="overline">{productTypeLabel(product.productType)}</span><h4>{product.name}</h4>{product.description && <p>{product.description}</p>}<div className="commerce-product-card__facts">{product.usageLimit != null && <span>{product.usageLimit} obiskov</span>}{product.validityDays != null && <span>Velja {product.validityDays} dni</span>}{product.voucherSessionTypeNames?.length ? <span>{product.voucherSessionTypeNames.join(', ')}</span> : null}</div><div className="commerce-product-card__bottom"><strong>{formatMoney(product.priceGross, product.currency || 'EUR')}</strong><Link className="button button--primary" to={`/providers/${encodeURIComponent(slug)}/buy/${encodeURIComponent(product.productId)}`}>Kupi <ArrowUpRightIcon size={16}/></Link></div></article>)}</div> : <EmptyState title="Ni ponudb za nakup" description="Paketi, članstva in darilni boni se bodo prikazali tukaj, ko jih ponudnik objavi."/>}
    </section>

    {team.length > 0 && <section className="provider-detail-section"><div className="section-heading"><div><span className="overline">Ekipa</span><h3>Spoznajte izvajalce</h3></div></div><div className="team-grid">{team.map(member => <div className="team-card" key={member.id}><ProviderAvatar name={member.name} size="md"/><strong>{member.name}</strong></div>)}</div></section>}
  </div>
}
