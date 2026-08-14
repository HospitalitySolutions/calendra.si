import type { WalletEntitlement } from '../api/types'
import { entitlementLabel, formatDate, formatMoney } from '../utils'
import { ChevronRightIcon } from './Icons'
import { ProviderAvatar } from './ProviderAvatar'

export function EntitlementCard({ item }: { item: WalletEntitlement }) {
  const { entitlement, provider } = item
  const typeLabel = entitlementLabel(entitlement.entitlementType)
  const usage = entitlement.totalUses != null && entitlement.remainingUses != null
    ? `${entitlement.remainingUses} / ${entitlement.totalUses} preostalo`
    : entitlement.remainingValueGross != null
      ? `${formatMoney(entitlement.remainingValueGross, entitlement.currency || 'EUR')} vrednost`
      : entitlement.visitCount != null
        ? `${entitlement.visitCount} obiskov`
        : 'Aktivno'
  const pct = entitlement.totalUses && entitlement.remainingUses != null
    ? Math.max(0, Math.min(100, (entitlement.remainingUses / entitlement.totalUses) * 100))
    : entitlement.remainingValueGross != null
      ? 100
      : null
  const accentClass = typeLabel === 'Bon' ? 'entitlement-card--orange' : 'entitlement-card--blue'

  return <article className={`entitlement-card ${accentClass}`}>
    <div className="entitlement-card__top">
      <ProviderAvatar name={provider.companyName} logoUrl={provider.logoUrl} size="sm"/>
      <div className="entitlement-card__title"><span className="entitlement-type-pill">{typeLabel}</span><h3>{entitlement.productName}</h3><p>{provider.companyName}</p></div>
      <ChevronRightIcon className="entitlement-card__chevron" size={20}/>
    </div>
    <div className="entitlement-card__balance">{usage}</div>
    {pct != null && <div className="progress"><span style={{ width: `${pct}%` }}/></div>}
    <div className="entitlement-card__meta">
      <span>{entitlement.validUntil ? `Velja do ${formatDate(entitlement.validUntil)}` : 'Brez roka veljavnosti'}</span>
      {entitlement.displayCode && <span>{entitlement.displayCode}</span>}
    </div>
  </article>
}
