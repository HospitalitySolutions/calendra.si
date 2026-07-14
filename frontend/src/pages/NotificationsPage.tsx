import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'

type Item = {
  key: string
  category: string
  type: string
  severity: string
  title: string
  message: string
  actionUrl?: string | null
  createdAt: string
  unread: boolean
}

function localizedNotificationTitle(item: Item, locale: string) {
  const type = String(item.type || '').toUpperCase()
  if (type === 'BOOKING_CREATED') return locale === 'sl' ? 'Nova rezervacija' : locale === 'sr' ? 'Nova rezervacija' : 'New booking'
  if (type === 'BOOKING_RESCHEDULED' || type === 'BOOKING_UPDATED') return locale === 'sl' ? 'Termin je bil prestavljen' : locale === 'sr' ? 'Termin je pomeren' : 'Booking rescheduled'
  if (type === 'BOOKING_CANCELLED') return locale === 'sl' ? 'Termin je bil odpovedan' : locale === 'sr' ? 'Termin je otkazan' : 'Booking cancelled'
  return item.title
}

export function NotificationsPage() {
  const { locale } = useLocale()
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    setLoading(true)
    api.get('/notifications', { params: { category: 'ALL', limit: 50 } })
      .then((response) => setItems(Array.isArray(response.data?.items) ? response.data.items : []))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])
  const title = locale === 'sl' ? 'Vsa obvestila' : locale === 'sr' ? 'Sva obaveštenja' : 'All notifications'
  const empty = locale === 'sl' ? 'Ni obvestil.' : locale === 'sr' ? 'Nema obaveštenja.' : 'No notifications.'
  const markAll = async () => {
    await api.put('/notifications/read-all')
    setItems((current) => current.map((item) => ({ ...item, unread: false })))
  }
  const open = async (item: Item) => {
    if (item.unread) await api.put(`/notifications/${encodeURIComponent(item.key)}/read`).catch(() => undefined)
    if (item.actionUrl) navigate(item.actionUrl)
  }
  return (
    <div className="notifications-page">
      <header>
        <div>
          <span>CALENDRA</span>
          <h1>{title}</h1>
        </div>
        <button type="button" onClick={() => void markAll()}>{locale === 'sl' ? 'Označi vse kot prebrano' : locale === 'sr' ? 'Označi sve kao pročitano' : 'Mark all as read'}</button>
      </header>
      <section>
        {loading ? <p>…</p> : items.length === 0 ? <p>{empty}</p> : items.map((item) => (
          <button key={item.key} type="button" className={item.unread ? 'unread' : ''} onClick={() => void open(item)}>
            <div><strong>{localizedNotificationTitle(item, locale)}</strong><span>{item.message}</span></div>
            <time>{new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time>
          </button>
        ))}
      </section>
      <style>{`
        .notifications-page{max-width:980px;margin:0 auto;padding:36px 28px 70px}.notifications-page>header{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:24px}.notifications-page header span{color:#2563eb;font-weight:800;letter-spacing:.12em;font-size:12px}.notifications-page h1{margin:5px 0 0;color:#10264b;font-size:32px}.notifications-page header button{border:0;background:#eaf2ff;color:#2563eb;border-radius:12px;padding:11px 15px;font-weight:800;cursor:pointer}.notifications-page section{background:#fff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 16px 38px rgba(15,23,42,.06)}.notifications-page section>button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:20px;padding:20px 22px;border:0;border-bottom:1px solid #edf1f7;background:#fff;text-align:left;cursor:pointer}.notifications-page section>button.unread{background:#f7fbff}.notifications-page section>button:last-child{border-bottom:0}.notifications-page section strong,.notifications-page section span{display:block}.notifications-page section strong{color:#17253d;font-size:15px}.notifications-page section span{margin-top:5px;color:#64748b}.notifications-page time{color:#64748b;font-size:12px;white-space:nowrap}.notifications-page section>p{padding:30px;text-align:center;color:#64748b}@media(max-width:640px){.notifications-page{padding:24px 16px}.notifications-page>header{align-items:flex-start;flex-direction:column}.notifications-page section>button{align-items:flex-start;flex-direction:column}}
      `}</style>
    </div>
  )
}
