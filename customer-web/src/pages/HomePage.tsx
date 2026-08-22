import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { useAuth } from '../auth/AuthContext'
import { ArrowUpRightIcon, CalendarIcon, ClockIcon, WalletIcon } from '../components/Icons'
import { ErrorState, PageLoader } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'
import { entitlementLabel, formatDate, formatDateTime } from '../utils'

export function HomePage() {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['customer-home'], queryFn: customerApi.home })

  if (query.isLoading) return <PageLoader />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  const data = query.data!

  const visibleEntitlements = data.activeEntitlements.slice(0, 3)
  const visibleProviders = data.recentProviders.slice(0, 3)

  return <div className="page-stack home-page home-page--connect-dashboard">
    <section className="dashboard-hero">
      <div className="dashboard-hero__intro">
        <span className="overline">Vaša nadzorna plošča</span>
        <h2>
          Pozdravljeni, <span className="welcome-name">{user?.firstName || 'Gost'}.</span>
        </h2>
        <p>Veseli smo, počutite se ugodno! Tu so vaše storitve.</p>
      </div>

      {data.nextBooking
        ? <div className="dashboard-upcoming dashboard-upcoming--booking">
          <div className="dashboard-upcoming__art dashboard-upcoming__art--booking">
            <ProviderAvatar name={data.nextBooking.provider.companyName} logoUrl={data.nextBooking.provider.logoUrl} size="lg" />
          </div>
          <div className="dashboard-upcoming__content">
            <h3>Vaš naslednji termin</h3>
            <p>{data.nextBooking.provider.companyName}</p>
            <div className="dashboard-upcoming__meta">
              <span>{formatDateTime(data.nextBooking.startsAt, { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span>{data.nextBooking.sessionTypeName || data.nextBooking.services?.[0]?.name || 'Rezervirana storitev'}</span>
            </div>
            <Link className="button button--primary" to={`/termini/${data.nextBooking.bookingId}`}>Odpri termin</Link>
          </div>
        </div>
        : <div className="dashboard-upcoming dashboard-upcoming--empty">
          <div className="dashboard-upcoming__art">
            <span className="home-empty-illustration">
              <CalendarIcon size={88} />
              <span className="home-empty-illustration__clock"><ClockIcon size={26} /></span>
            </span>
          </div>
          <div className="dashboard-upcoming__content">
            <h3>Trenutno nimate prihajajočih terminov</h3>
            <p>Počakajte na prihodnji in izkoristite svoj čas na enem mestu.</p>
            <Link className="button button--primary" to="/isci">Poišči termine</Link>
          </div>
        </div>}
    </section>

    {visibleEntitlements.length > 0 && <section className="dashboard-section dashboard-section--entitlements">
      <div className="dashboard-section__header">
        <div>
          <span className="overline">Vaše ugodnosti</span>
          <h3>Aktivne ugodnosti</h3>
        </div>
        <Link to="/denarnica">Oglej si denarnico <ArrowUpRightIcon size={17} /></Link>
      </div>

      <div className={`dashboard-entitlement-list ${visibleEntitlements.length === 1 ? 'dashboard-entitlement-list--single' : ''}`}>
        {visibleEntitlements.map(({ entitlement }, index) => {
          const total = entitlement.totalUses ?? entitlement.visitCount ?? 0
          const remaining = entitlement.remainingUses ?? 0
          const used = total > 0 ? Math.max(0, total - remaining) : 0
          const progress = total > 0 ? Math.max(6, Math.min(100, (used / total) * 100)) : 0
          const detailLabel = total > 0 ? `${remaining} / ${total} preostalo` : (entitlement.remainingValueGross != null ? 'Na voljo za koriščenje' : 'Aktivna ugodnost')

          return <article className="dashboard-entitlement-card" key={`${entitlement.entitlementId}-${index}`}>
            <div className="dashboard-entitlement-card__top">
              <span className="dashboard-entitlement-card__icon"><WalletIcon size={24} /></span>
              <div className="dashboard-entitlement-card__copy">
                <span className="dashboard-entitlement-card__tag">{entitlementLabel(entitlement.entitlementType)}</span>
                <strong>{entitlement.productName}</strong>
                <small>{entitlement.validUntil ? `Velja do: ${formatDate(entitlement.validUntil)}` : 'Aktivna ugodnost'}</small>
              </div>
              <span className="dashboard-entitlement-card__arrow"><ArrowUpRightIcon size={18} /></span>
            </div>
            <div className="dashboard-entitlement-card__bottom">
              <div className="dashboard-entitlement-card__progress-copy">{detailLabel}</div>
              <div className="dashboard-entitlement-card__progress"><span style={{ width: `${progress}%` }} /></div>
              <div className="dashboard-entitlement-card__link">Več o paketu</div>
            </div>
          </article>
        })}
      </div>
    </section>}

    {visibleProviders.length > 0 && <section className="dashboard-section dashboard-section--providers">
      <div className="dashboard-section__header">
        <div>
          <span className="overline">Vaši obiski</span>
          <h3>Nedavno obiskani</h3>
        </div>
        <Link to="/isci">Razišči vse <ArrowUpRightIcon size={17} /></Link>
      </div>

      <div className="dashboard-provider-list">
        {visibleProviders.map((provider, index) => (
          <article className="dashboard-provider-card" key={`${provider.companyId}-${provider.locationId || index}`}>
            <ProviderAvatar name={provider.companyName} logoUrl={provider.logoUrl} size="md" />
            <div className="dashboard-provider-card__copy">
              <strong>{provider.companyName}</strong>
              <small>{provider.locationName || provider.locationAddress || 'Ponudnik'}</small>
            </div>
            <span className="dashboard-provider-card__arrow"><ArrowUpRightIcon size={18} /></span>
          </article>
        ))}
      </div>
    </section>}
  </div>
}
