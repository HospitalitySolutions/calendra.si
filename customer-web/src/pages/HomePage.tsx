import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { useAuth } from '../auth/AuthContext'
import { BookingCard } from '../components/BookingCard'
import { EntitlementCard } from '../components/EntitlementCard'
import { ArrowUpRightIcon, CalendarIcon, ClockIcon, SearchIcon } from '../components/Icons'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'

export function HomePage() {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['customer-home'], queryFn: customerApi.home })

  if (query.isLoading) return <PageLoader />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  const data = query.data!

  return <div className="page-stack home-page">
    <section className="welcome-row">
      <div><span className="overline">Moj Calendra račun</span><h2>Pozdravljeni, <span className="welcome-name">{user?.firstName || 'dobrodošli'}.</span></h2><p>Vaši termini, ponudniki in ugodnosti na enem mestu.</p></div>
      <Link to="/isci" className="button button--primary"><SearchIcon size={18}/> Poišči termin</Link>
    </section>

    {data.nextBooking ? <section className="section-block"><div className="section-heading"><div><span className="overline">Naslednji termin</span><h2>Prihaja kmalu</h2></div><Link to="/termini">Vsi termini <ArrowUpRightIcon size={17}/></Link></div><BookingCard booking={data.nextBooking}/></section>
      : <EmptyState title="Trenutno nimate prihodnjih terminov" description="Poiščite ponudnika in rezervirajte naslednji termin." icon={<span className="home-empty-illustration"><CalendarIcon size={44}/><span className="home-empty-illustration__clock"><ClockIcon size={15}/></span></span>} />}

    {data.upcomingBookings.length > 1 && <section className="section-block"><div className="section-heading"><div><span className="overline">Prihajajoče</span><h2>Naslednji termini</h2></div></div><div className="compact-list">{data.upcomingBookings.slice(1, 4).map(item => <BookingCard key={item.bookingId} booking={item} compact/>)}</div></section>}

    {data.activeEntitlements.length > 0 && <section className="section-block home-entitlements"><div className="section-heading"><div><span className="overline">Vaša denarnica</span><h2>Aktivne ugodnosti</h2></div><Link to="/denarnica">Odpri denarnico <ArrowUpRightIcon size={17}/></Link></div><div className={`card-grid card-grid--3 ${data.activeEntitlements.length === 1 ? 'card-grid--single' : ''}`}>{data.activeEntitlements.slice(0, 3).map(item => <EntitlementCard key={item.entitlement.entitlementId} item={item}/>)}</div></section>}

    {data.recentProviders.length > 0 && <section className="section-block home-providers"><div className="section-heading"><div><span className="overline">Vaši ponudniki</span><h2>Nedavno obiskani</h2></div><Link to="/isci">Razišči več <ArrowUpRightIcon size={17}/></Link></div><div className="provider-strip">{data.recentProviders.slice(0, 5).map((provider, index) => <article className="provider-mini" key={`${provider.companyId}-${provider.locationId || index}`}><ProviderAvatar name={provider.companyName} logoUrl={provider.logoUrl}/><div><strong>{provider.companyName}</strong><span>{provider.locationName || provider.locationAddress || 'Ponudnik'}</span></div></article>)}</div></section>}
  </div>
}
