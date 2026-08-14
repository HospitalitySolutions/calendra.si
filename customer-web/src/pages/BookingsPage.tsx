import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { BookingCard } from '../components/BookingCard'
import { CalendarIcon, SearchIcon } from '../components/Icons'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'
import { MARKETING_BASE_URL } from '../config'

type Tab = 'upcoming' | 'past' | 'cancelled'
const tabs: { key: Tab; label: string }[] = [{ key: 'upcoming', label: 'Prihajajoči' }, { key: 'past', label: 'Pretekli' }, { key: 'cancelled', label: 'Odpovedani' }]

export function BookingsPage() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const query = useQuery({ queryKey: ['customer-bookings', tab], queryFn: () => customerApi.bookings(tab) })
  const marketplaceUrl = `${MARKETING_BASE_URL}/za-stranke`

  return <div className="page-stack bookings-page">
    <div className="page-intro"><div><span className="overline">Vsi ponudniki</span><h2>Termini</h2><p>Preglejte svoje prihajajoče, pretekle in odpovedane termine.</p></div></div>
    <div className="tabs">{tabs.map(item => <button key={item.key} className={tab === item.key ? 'tab tab--active' : 'tab'} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    {query.isLoading ? <PageLoader/> : query.isError ? <ErrorState onRetry={() => void query.refetch()}/> : query.data?.length ? <div className="booking-list">{query.data.map(item => <BookingCard key={item.bookingId} booking={item}/>)}</div> : <EmptyState icon={<CalendarIcon size={42}/>} title={tab === 'upcoming' ? 'Ni prihajajočih terminov' : tab === 'past' ? 'Ni preteklih terminov' : 'Ni odpovedanih terminov'} description={tab === 'upcoming' ? 'Ko rezervirate termin, se bo prikazal tukaj.' : undefined} action={tab === 'upcoming' ? <a className="button button--primary" href={marketplaceUrl}>Poišči termin</a> : undefined}/>} 

    <aside className="page-callout page-callout--search">
      <span className="page-callout__icon"><SearchIcon size={25}/></span>
      <div><strong>Iščete nov termin?</strong><p>Poiščite storitev in rezervirajte naslednji termin pri ponudnikih v svoji bližini.</p></div>
      <a href={marketplaceUrl}>Razišči ponudbo <span>→</span></a>
    </aside>
  </div>
}
