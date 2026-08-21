import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { EntitlementCard } from '../components/EntitlementCard'
import { WalletIcon } from '../components/Icons'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'
import { CUSTOMER_ACCOUNT_BASE_PATH, MARKETING_BASE_URL } from '../config'
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

  return <div className="page-stack wallet-page">
    <div className="page-intro">
      <div><span className="overline">Vaše ugodnosti</span><h2>Denarnica</h2><p>Paketi, članstva, boni in nakupi pri vseh vaših ponudnikih.</p></div>
    </div>

    <div className="tabs tabs--scroll">{(['all','Paket','Članstvo','Bon','orders'] as Tab[]).map(key => <button key={key} className={tab === key ? 'tab tab--active' : 'tab'} onClick={() => setTab(key)}>{key === 'all' ? 'Vse' : key === 'orders' ? 'Nakupi' : key}</button>)}</div>

    {tab === 'orders' ? data.orders.length ? <div className="order-list">{data.orders.map(order => <article className="order-card" key={order.orderId}><div><span className="overline">{order.provider.companyName}</span><h3>{order.productName || 'Nakup'}</h3><p>{formatDateTime(order.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><div className="order-card__right"><strong>{formatMoney(order.totalGross, order.currency || 'EUR')}</strong><span className="status-pill">{humanizeStatus(order.status)}</span></div></article>)}</div> : <EmptyState title="Ni nakupov" description="Ko kupite paket, članstvo ali bon, bo nakup prikazan tukaj." icon={<WalletIcon size={34}/>}/> : filtered.length ? <div className="card-grid wallet-grid">{filtered.map(item => <EntitlementCard key={item.entitlement.entitlementId} item={item}/>)}</div> : <EmptyState title="Ni aktivnih ugodnosti" description="Aktivni paketi, članstva in boni se bodo prikazali tukaj." icon={<WalletIcon size={34}/>} action={<a className="button button--primary" href={`${CUSTOMER_ACCOUNT_BASE_PATH}/isci`}>Razišči ponudnike</a>}/>}

    <aside className="page-callout page-callout--wallet">
      <span className="page-callout__icon"><WalletIcon size={24}/></span>
      <div><strong>Vse na enem mestu</strong><p>Tukaj spremljate svoje pakete, članstva, bone in nakupe pri vseh ponudnikih.</p></div>
      <a href={`${MARKETING_BASE_URL}/za-stranke`}>Kako deluje denarnica? <span>→</span></a>
    </aside>
  </div>
}
