import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { EntitlementCard } from '../components/EntitlementCard'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'
import { entitlementLabel, formatDateTime, formatMoney, humanizeStatus } from '../utils'

type Tab = 'all' | 'Paket' | 'Članstvo' | 'Bon' | 'orders'

export function WalletPage() {
  const [tab, setTab] = useState<Tab>('all')
  const query = useQuery({ queryKey: ['customer-wallet'], queryFn: customerApi.wallet })
  const filtered = useMemo(() => {
    const items = query.data?.entitlements || []
    if (tab === 'all') return items
    if (tab === 'orders') return []
    return items.filter(item => entitlementLabel(item.entitlement.entitlementType) === tab)
  }, [query.data, tab])

  if (query.isLoading) return <PageLoader/>
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()}/>
  const data = query.data!

  return <div className="page-stack"><div className="page-intro"><div><span className="overline">Vaše ugodnosti</span><h2>Denarnica</h2><p>Paketi, članstva, boni in nakupi pri vseh vaših ponudnikih.</p></div><Link className="button button--primary" to="/discover">Poišči ponudbe</Link></div><div className="tabs tabs--scroll">{(['all','Paket','Članstvo','Bon','orders'] as Tab[]).map(key => <button key={key} className={tab === key ? 'tab tab--active' : 'tab'} onClick={() => setTab(key)}>{key === 'all' ? 'Vse' : key === 'orders' ? 'Nakupi' : key}</button>)}</div>{tab === 'orders' ? data.orders.length ? <div className="order-list">{data.orders.map(order => <article className="order-card" key={order.orderId}><div><span className="overline">{order.provider.companyName}</span><h3>{order.productName || 'Nakup'}</h3><p>{formatDateTime(order.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><div className="order-card__right"><strong>{formatMoney(order.totalGross, order.currency || 'EUR')}</strong><span className="status-pill">{humanizeStatus(order.status)}</span></div></article>)}</div> : <EmptyState title="Ni nakupov" description="Ko kupite paket, članstvo ali bon, bo nakup prikazan tukaj."/> : filtered.length ? <div className="card-grid card-grid--3">{filtered.map(item => <EntitlementCard key={item.entitlement.entitlementId} item={item}/>)}</div> : <EmptyState title="Ni aktivnih ugodnosti" description="Aktivni paketi, članstva in boni se bodo prikazali tukaj." action={<Link className="button button--primary" to="/discover">Razišči ponudnike</Link>}/>}</div>
}
