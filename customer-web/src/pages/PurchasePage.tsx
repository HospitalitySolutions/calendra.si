import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import type { CheckoutResponse } from '../api/types'
import { CheckIcon, ChevronLeftIcon, MapPinIcon, WalletIcon } from '../components/Icons'
import { ErrorState, PageLoader } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'
import { formatMoney } from '../utils'

const METHOD_LABELS: Record<string, string> = {
  CARD: 'Plačilna kartica',
  BANK_TRANSFER: 'Bančno nakazilo',
  PAYPAL: 'PayPal',
}

function productTypeLabel(type: string) {
  switch ((type || '').toUpperCase()) {
    case 'PACK': return 'Paket'
    case 'MEMBERSHIP': return 'Članstvo'
    case 'GIFT_CARD': return 'Darilni bon'
    default: return 'Ugodnost'
  }
}

export function PurchasePage() {
  const { slug = '', productId = '' } = useParams()
  const queryClient = useQueryClient()
  const orderIdRef = useRef<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [result, setResult] = useState<CheckoutResponse | null>(null)
  const storefrontQuery = useQuery({ queryKey: ['public-storefront', slug], queryFn: () => customerApi.storefront(slug), enabled: Boolean(slug) })
  const locationId = storefrontQuery.data?.location.locationId
  const catalogQuery = useQuery({
    queryKey: ['customer-commerce-catalog', locationId],
    queryFn: () => customerApi.commerceCatalog(locationId!),
    enabled: locationId != null,
  })
  const product = useMemo(() => catalogQuery.data?.products.find(item => item.productId === productId), [catalogQuery.data, productId])

  useEffect(() => {
    const methods = catalogQuery.data?.acceptedPaymentMethods || []
    if (!paymentMethod || !methods.includes(paymentMethod)) setPaymentMethod(methods[0] || '')
  }, [catalogQuery.data, paymentMethod])

  const purchase = useMutation({
    mutationFn: async () => {
      if (!locationId || !product || !paymentMethod) throw new Error('Izberite način plačila.')
      let orderId = orderIdRef.current
      if (!orderId) {
        const created = await customerApi.createCommerceOrder({ locationId, productId: product.productId, paymentMethodType: paymentMethod, locale: 'sl' })
        orderId = created.order.orderId
        orderIdRef.current = orderId
      }
      return customerApi.checkoutCommerceOrder(orderId, paymentMethod, 'sl')
    },
    onSuccess: checkout => {
      if (checkout.nextAction === 'REDIRECT' && checkout.checkoutUrl) {
        window.location.assign(checkout.checkoutUrl)
        return
      }
      setResult(checkout)
      void queryClient.invalidateQueries({ queryKey: ['customer-wallet'] })
      void queryClient.invalidateQueries({ queryKey: ['customer-home'] })
    },
  })

  if (storefrontQuery.isLoading || catalogQuery.isLoading) return <PageLoader/>
  if (storefrontQuery.isError || catalogQuery.isError) return <ErrorState onRetry={() => { void storefrontQuery.refetch(); void catalogQuery.refetch() }}/>
  if (!product || !catalogQuery.data || !storefrontQuery.data) return <ErrorState message="Izbrana ponudba ni več na voljo."/>

  const provider = catalogQuery.data.provider
  const methods = catalogQuery.data.acceptedPaymentMethods
  const error = purchase.error instanceof ApiError ? purchase.error.message : purchase.error instanceof Error ? purchase.error.message : ''

  if (result) {
    const bank = result.bankTransfer
    const complete = result.status.toUpperCase() === 'PAID' || result.nextAction === 'COMPLETE'
    return <div className="commerce-result-page"><section className="commerce-result-card"><div className={complete ? 'commerce-result-mark commerce-result-mark--success' : 'commerce-result-mark'}><CheckIcon size={30}/></div><span className="overline">{complete ? 'Nakup zaključen' : 'Naročilo ustvarjeno'}</span><h2>{complete ? 'Ugodnost je v vaši denarnici' : 'Navodila za plačilo so pripravljena'}</h2><p>{complete ? `${product.name} je bil uspešno dodan v vašo denarnico.` : 'Po prejetem plačilu se bo ugodnost samodejno aktivirala v vaši denarnici.'}</p>{bank && <div className="bank-instructions"><div><span>Znesek</span><strong>{formatMoney(bank.amount, bank.currency)}</strong></div><div><span>Sklic</span><strong>{bank.referenceCode}</strong></div><p>{bank.instructions}</p></div>}<div className="commerce-result-actions"><Link className="button button--primary" to="/denarnica">Odpri denarnico</Link><Link className="button button--secondary" to={`/ponudniki/${slug}`}>Nazaj k ponudniku</Link></div></section></div>
  }

  return <div className="purchase-page page-stack"><Link className="back-link" to={`/ponudniki/${slug}`}><ChevronLeftIcon size={17}/> Nazaj k ponudniku</Link><div className="purchase-layout"><section className="purchase-summary"><div className="purchase-provider"><ProviderAvatar name={provider.locationName || provider.companyName} logoUrl={provider.logoUrl} size="md"/><div><span className="overline">{productTypeLabel(product.productType)}</span><strong>{provider.locationName || provider.companyName}</strong>{provider.locationAddress && <small><MapPinIcon size={13}/>{provider.locationAddress}</small>}</div></div><h1>{product.name}</h1>{product.description && <p>{product.description}</p>}<div className="purchase-facts">{product.usageLimit != null && <div><span>Obiski</span><strong>{product.usageLimit}</strong></div>}{product.validityDays != null && <div><span>Veljavnost</span><strong>{product.validityDays} dni</strong></div>}{product.voucherFaceValueGross != null && <div><span>Vrednost bona</span><strong>{formatMoney(product.voucherFaceValueGross, product.currency)}</strong></div>}</div><div className="purchase-total"><span>Skupaj</span><strong>{formatMoney(product.priceGross, product.currency || 'EUR')}</strong></div></section><section className="purchase-checkout"><div><span className="overline">Plačilo</span><h2>Izberite način plačila</h2><p>Po uspešnem spletnem plačilu bo ugodnost takoj vidna v Denarnici.</p></div>{methods.length ? <div className="payment-method-list">{methods.map(method => <label className={paymentMethod === method ? 'payment-method payment-method--selected' : 'payment-method'} key={method}><input type="radio" name="paymentMethod" checked={paymentMethod === method} onChange={() => setPaymentMethod(method)}/><span><strong>{METHOD_LABELS[method] || method}</strong><small>{method === 'BANK_TRANSFER' ? 'Prejeli boste navodila in sklic za nakazilo.' : method === 'PAYPAL' ? 'Nadaljevali boste na varno PayPal plačilo.' : 'Nadaljevali boste na varno kartično plačilo.'}</small></span></label>)}</div> : <div className="form-alert form-alert--error">Ponudnik trenutno nima omogočenega načina plačila za spletni nakup.</div>}{error && <div className="form-alert form-alert--error">{error}</div>}<button className="button button--primary button--full purchase-button" disabled={!paymentMethod || purchase.isPending} onClick={() => purchase.mutate()}><WalletIcon size={18}/>{purchase.isPending ? 'Pripravljam nakup …' : `Kupi za ${formatMoney(product.priceGross, product.currency || 'EUR')}`}</button><p className="purchase-security">Plačilo obdeluje ponudnikov izbrani plačilni ponudnik. Calendra ne shranjuje podatkov vaše kartice.</p></section></div></div>
}
