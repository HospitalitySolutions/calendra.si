import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { BookingCard } from '../components/BookingCard'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'

type Tab = 'upcoming' | 'past' | 'cancelled'
const tabs: { key: Tab; label: string }[] = [{ key: 'upcoming', label: 'Prihajajoči' }, { key: 'past', label: 'Pretekli' }, { key: 'cancelled', label: 'Odpovedani' }]

export function BookingsPage() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const query = useQuery({ queryKey: ['customer-bookings', tab], queryFn: () => customerApi.bookings(tab) })
  return <div className="page-stack">
    <div className="page-intro"><div><span className="overline">Vsi ponudniki</span><h2>Vaši termini</h2><p>Pregled terminov pri vseh ponudnikih, povezanih z vašim Calendra računom.</p></div></div>
    <div className="tabs">{tabs.map(item => <button key={item.key} className={tab === item.key ? 'tab tab--active' : 'tab'} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    {query.isLoading ? <PageLoader/> : query.isError ? <ErrorState onRetry={() => void query.refetch()}/> : query.data?.length ? <div className="booking-list">{query.data.map(item => <BookingCard key={item.bookingId} booking={item}/>)}</div> : <EmptyState title={tab === 'upcoming' ? 'Ni prihodnjih terminov' : tab === 'past' ? 'Ni preteklih terminov' : 'Ni odpovedanih terminov'} description={tab === 'upcoming' ? 'Ko rezervirate termin, se bo prikazal tukaj.' : undefined}/>} 
  </div>
}
