import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { CheckIcon, CloseIcon, RefreshIcon } from '../components/Icons'
import { PageLoader } from '../components/Loading'
import { formatMoney, humanizeStatus } from '../utils'

export function CheckoutReturnPage() {
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const processedRef = useRef(false)
  const [processing, setProcessing] = useState(true)
  const [actionError, setActionError] = useState('')
  const provider = (params.get('provider') || 'stripe').toLowerCase()
  const status = (params.get('status') || 'success').toLowerCase()
  const orderId = params.get('orderId') || ''
  const sessionId = params.get('session_id')
  const token = params.get('token')

  useEffect(() => {
    if (!orderId || processedRef.current) { setProcessing(false); return }
    processedRef.current = true
    const run = async () => {
      try {
        if (status === 'cancelled' || status === 'canceled' || status === 'cancel') {
          await customerApi.cancelCommerceCheckout(orderId, { sessionId, token })
        } else if (provider === 'paypal') {
          await customerApi.completeCommercePayPal(orderId, token)
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['customer-wallet'] }),
          queryClient.invalidateQueries({ queryKey: ['customer-home'] }),
        ])
      } catch (error) {
        setActionError(error instanceof ApiError ? error.message : 'Stanja plačila ni bilo mogoče potrditi.')
      } finally {
        setProcessing(false)
      }
    }
    void run()
  }, [orderId, provider, queryClient, sessionId, status, token])

  const orderQuery = useQuery({
    queryKey: ['customer-commerce-order', orderId],
    queryFn: () => customerApi.commerceOrder(orderId),
    enabled: Boolean(orderId) && !processing,
    // Stripe and PayPal may settle asynchronously via webhook/capture.
    // Poll while the customer remains on the return page; the page unmounts
    // as soon as they navigate away.
    refetchInterval: status === 'cancelled' || status === 'canceled' ? false : 1500,
  })

  if (processing) return <PageLoader/>
  if (!orderId) return <div className="commerce-result-page"><section className="commerce-result-card"><div className="commerce-result-mark commerce-result-mark--error"><CloseIcon size={28}/></div><h2>Manjka podatek o naročilu</h2><Link className="button button--primary" to="/wallet">Odpri denarnico</Link></section></div>

  const order = orderQuery.data
  const cancelled = status === 'cancelled' || status === 'canceled' || order?.status?.toUpperCase() === 'CANCELLED'
  const paid = order?.status?.toUpperCase() === 'PAID'
  const pending = order?.status?.toUpperCase() === 'PENDING'
  const error = actionError || (orderQuery.error instanceof ApiError ? orderQuery.error.message : '')

  return <div className="commerce-result-page"><section className="commerce-result-card">{cancelled ? <div className="commerce-result-mark commerce-result-mark--error"><CloseIcon size={28}/></div> : paid ? <div className="commerce-result-mark commerce-result-mark--success"><CheckIcon size={30}/></div> : <div className="commerce-result-mark"><RefreshIcon size={28}/></div>}<span className="overline">{cancelled ? 'Plačilo preklicano' : paid ? 'Plačilo uspešno' : 'Preverjam plačilo'}</span><h2>{cancelled ? 'Nakup ni bil zaključen' : paid ? 'Nakup je uspešno zaključen' : 'Plačilo še obdelujemo'}</h2>{paid && <p>Kupljena ugodnost je zdaj na voljo v vaši Denarnici.</p>}{pending && !cancelled && <p>Potrditev plačila lahko traja nekaj trenutkov. Stran se samodejno osvežuje.</p>}{cancelled && <p>Naročilo je bilo preklicano. Če želite, lahko ponudbo ponovno kupite pri ponudniku.</p>}{order && <div className="checkout-order-summary"><div><span>Ponudnik</span><strong>{order.provider.locationName || order.provider.companyName}</strong></div><div><span>Znesek</span><strong>{formatMoney(order.totalGross, order.currency || 'EUR')}</strong></div><div><span>Status</span><strong>{humanizeStatus(order.status)}</strong></div>{order.referenceCode && <div><span>Naročilo</span><strong>{order.referenceCode}</strong></div>}</div>}{error && <div className="form-alert form-alert--error">{error}</div>}<div className="commerce-result-actions"><Link className="button button--primary" to="/wallet">Odpri denarnico</Link><Link className="button button--secondary" to="/discover">Razišči ponudnike</Link></div></section></div>
}
