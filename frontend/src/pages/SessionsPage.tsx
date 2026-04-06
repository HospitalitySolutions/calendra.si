import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Card, PageHeader } from '../components/ui'
import { BookableSessionsPage } from './BookableSessionsPage'
import { BookedSessionsPage } from './BookedSessionsPage'

type Tab = 'booked' | 'bookable'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export function SessionsPage() {
  const navigate = useNavigate()
  const query = useQuery()
  const [tab, setTab] = useState<Tab>('booked')
  const [bookableEnabled, setBookableEnabled] = useState(true)

  useEffect(() => {
    api.get('/settings')
      .then((r) => setBookableEnabled(r.data?.BOOKABLE_ENABLED !== 'false'))
      .catch(() => setBookableEnabled(true))
  }, [])

  useEffect(() => {
    const q = query.get('tab')
    if (q === 'bookable' || q === 'booked') {
      if (q === 'bookable' && !bookableEnabled) {
        setTab('booked')
        navigate('/sessions?tab=booked', { replace: true })
      } else {
        setTab(q)
      }
    }
  }, [query, bookableEnabled, navigate])

  const setTabAndUrl = (next: Tab) => {
    setTab(next)
    navigate(`/sessions?tab=${next}`)
  }

  return (
    <div className="stack gap-lg">
      <PageHeader
        title="Sessions"
        subtitle="Booked sessions and consultant availability."
        actions={
          <div className="header-actions">
            <button className={tab === 'booked' ? '' : 'secondary'} onClick={() => setTabAndUrl('booked')}>Booked</button>
            {bookableEnabled && <button className={tab === 'bookable' ? '' : 'secondary'} onClick={() => setTabAndUrl('bookable')}>Bookable</button>}
          </div>
        }
      />
      <Card>
        {tab === 'booked' ? <BookedSessionsPage /> : <BookableSessionsPage />}
      </Card>
    </div>
  )
}

