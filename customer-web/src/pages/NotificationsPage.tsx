import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { BellIcon, CheckIcon } from '../components/Icons'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'
import { formatDateTime } from '../utils'

export function NotificationsPage() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['customer-notifications'], queryFn: customerApi.notifications })
  const markOne = useMutation({ mutationFn: customerApi.markNotificationRead, onSuccess: () => { void client.invalidateQueries({ queryKey: ['customer-notifications'] }); void client.invalidateQueries({ queryKey: ['customer-home-shell'] }) } })
  const markAll = useMutation({ mutationFn: customerApi.markAllNotificationsRead, onSuccess: () => { void client.invalidateQueries({ queryKey: ['customer-notifications'] }); void client.invalidateQueries({ queryKey: ['customer-home-shell'] }) } })
  if (query.isLoading) return <PageLoader/>
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()}/>
  const data = query.data!
  return <div className="page-stack"><div className="page-intro page-intro--actions"><div><span className="overline">Center obvestil</span><h2>Obvestila</h2><p>Spremembe terminov, opomniki in informacije ponudnikov.</p></div>{data.unreadCount > 0 && <button className="button button--secondary" onClick={() => markAll.mutate()}><CheckIcon size={17}/> Označi vse kot prebrano</button>}</div>{data.items.length ? <div className="notification-list">{data.items.map(item => <button key={item.notificationId} className={`notification-card ${!item.readAt ? 'notification-card--unread' : ''}`} onClick={() => { if (!item.readAt) markOne.mutate(item.notificationId) }}><div className="notification-card__icon">{item.provider ? <ProviderAvatar name={item.provider.companyName} logoUrl={item.provider.logoUrl} size="sm"/> : <BellIcon size={20}/>}</div><div><div className="notification-card__title"><strong>{item.title}</strong><time>{formatDateTime(item.createdAt)}</time></div><p>{item.body}</p>{item.provider?.companyName && <span>{item.provider.companyName}</span>}</div>{!item.readAt && <i/>}</button>)}</div> : <EmptyState title="Ni obvestil" description="Pomembne spremembe in opomniki se bodo prikazali tukaj."/>}</div>
}
