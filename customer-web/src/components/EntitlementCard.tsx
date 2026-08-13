import type { WalletEntitlement } from '../api/types'
import { entitlementLabel, formatDate, formatMoney } from '../utils'
import { ProviderAvatar } from './ProviderAvatar'

export function EntitlementCard({ item }: { item: WalletEntitlement }) {
  const { entitlement, provider } = item
  const usage = entitlement.totalUses != null && entitlement.remainingUses != null
    ? `${entitlement.remainingUses} / ${entitlement.totalUses} preostalo`
    : entitlement.remainingValueGross != null
      ? `${formatMoney(entitlement.remainingValueGross, entitlement.currency || 'EUR')} preostalo`
      : entitlement.visitCount != null
        ? `${entitlement.visitCount} obiskov`
        : 'Aktivno'
  const pct = entitlement.totalUses && entitlement.remainingUses != null
    ? Math.max(0, Math.min(100, (entitlement.remainingUses / entitlement.totalUses) * 100))
    : null
  return <article className="entitlement-card">
    <div className="entitlement-card__top">
      <ProviderAvatar name={provider.companyName} logoUrl={provider.logoUrl} size="sm"/>
      <div><span className="overline">{entitlementLabel(entitlement.entitlementType)}</span><h3>{entitlement.productName}</h3><p>{provider.companyName}</p></div>
    </div>
    <div className="entitlement-card__balance">{usage}</div>
    {pct != null && <div className="progress"><span style={{ width: `${pct}%` }}/></div>}
    <div className="entitlement-card__meta">
      {entitlement.validUntil && <span>Velja do {formatDate(entitlement.validUntil)}</span>}
      {entitlement.displayCode && <span>{entitlement.displayCode}</span>}
    </div>
  </article>
}
