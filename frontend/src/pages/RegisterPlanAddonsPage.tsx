import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocale } from '../locale'
import { ensureRegisterCatalogLoaded } from '../lib/registerCatalogBootstrap'
import {
  normalizeRegisterSelection,
  parseRegisterSelection,
  selectionToSearch,
  type RegisterPlanKey,
  type RegisterSelection,
} from './registerFlow'
import { getAddonCatalog, getFeatureItems, type RegisterLocale } from './registerPlanCopy'
import { getRegisterFeatureIconKind } from './registerFeatureKeys'
import { RegisterOnboardingHeader, RegisterOptionIcon } from './RegisterOnboardingShell'
import { registerOnboardingStyles } from './registerOnboardingStyles'

const PLAN_RANK: Record<RegisterPlanKey, number> = { basic: 0, pro: 1, business: 2 }

function isOnlinePaymentsFeature(item: { key: string; name?: string }) {
  const key = item.key.trim().toLowerCase().replace(/[\s_]+/g, '-')
  const name = (item.name || '').trim().toLowerCase()
  return key === 'payments'
    || key === 'online-payments'
    || name === 'spletna plačila'
    || name === 'spletno plačevanje'
    || name === 'online payments'
}

export function RegisterPlanAddonsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale } = useLocale()
  const lang: RegisterLocale = locale === 'sl' ? 'sl' : 'en'
  const sl = lang === 'sl'
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [selection, setSelection] = useState<RegisterSelection>(() => parseRegisterSelection(location.search))

  useEffect(() => {
    let alive = true
    void ensureRegisterCatalogLoaded().then((changed) => {
      if (alive && changed) setCatalogRevision((value) => value + 1)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    setSelection(parseRegisterSelection(location.search))
  }, [location.search])

  const optionalFeatures = useMemo(
    () => getFeatureItems(lang).filter((item) => item.minPlan !== 'basic' && !isOnlinePaymentsFeature(item)),
    [lang, catalogRevision],
  )
  const addonCatalog = useMemo(() => getAddonCatalog(lang), [lang, catalogRevision])
  const addonOptions = useMemo(
    () => Object.entries(addonCatalog).map(([key, value]) => ({ key, ...value })),
    [addonCatalog],
  )

  const derivePlan = (features: Record<string, boolean>, addons: Record<string, boolean>): RegisterPlanKey => {
    let next: RegisterPlanKey = 'basic'
    for (const feature of optionalFeatures) {
      if (!features[feature.key]) continue
      if (PLAN_RANK[feature.minPlan] > PLAN_RANK[next]) next = feature.minPlan
    }
    // The existing Basic monthly signup is a zero-add-on trial. If the customer
    // asks for any optional add-on, move them to at least Professional so the
    // selected add-on is not discarded during provisioning.
    if (next === 'basic' && Object.values(addons).some(Boolean)) next = 'pro'
    return next
  }

  const toggleFeature = (key: string) => {
    setSelection((current) => {
      const features = { ...(current.features || {}), [key]: !current.features?.[key] }
      const addons = { ...(current.addons || {}) }
      return normalizeRegisterSelection({ ...current, features, addons, plan: derivePlan(features, addons), additionalSms: 0 })
    })
  }

  const toggleAddon = (key: string) => {
    setSelection((current) => {
      const features = { ...(current.features || {}) }
      const addons = { ...(current.addons || {}), [key]: !current.addons?.[key] }
      return normalizeRegisterSelection({ ...current, features, addons, plan: derivePlan(features, addons), additionalSms: 0 })
    })
  }

  const selectedCount = useMemo(() => {
    const featureCount = optionalFeatures.filter((item) => selection.features?.[item.key]).length
    const addonCount = addonOptions.filter((item) => selection.addons?.[item.key]).length
    return featureCount + addonCount
  }, [addonOptions, optionalFeatures, selection.addons, selection.features])
  const totalCount = optionalFeatures.length + addonOptions.length

  const continueStep = () => {
    const features = { ...(selection.features || {}) }
    for (const key of Object.keys(features)) {
      if (isOnlinePaymentsFeature({ key })) delete features[key]
    }
    const normalized = normalizeRegisterSelection({
      ...selection,
      features,
      plan: derivePlan(features, selection.addons || {}),
      additionalSms: 0,
    })
    navigate(`/register/account?${selectionToSearch(normalized)}`)
  }

  return (
    <div className="register-onboarding register-onboarding-step-two">
      <style>{registerOnboardingStyles}</style>
      <div className="register-onboarding-shell">
        <RegisterOnboardingHeader
          activeStep={2}
          locale={locale}
          onBack={() => navigate(`/register?${selectionToSearch(selection)}`)}
          onContinue={continueStep}
        />

        <main className="register-onboarding-main">
          <div className="register-onboarding-grid">
            <section className="register-onboarding-intro">
              <h1 className="register-onboarding-title">
                {sl ? 'Izberite dodatne funkcionalnosti' : 'Choose additional features'}
              </h1>
              <p className="register-onboarding-description">
                {sl
                  ? 'Osnovne funkcionalnosti so že vključene. Dodajte le tisto, kar potrebujete – ta korak je popolnoma opcijski.'
                  : 'Core features are already included. Add only what you need — this step is completely optional.'}
              </p>
              <div className="register-onboarding-info">
                <span className="register-onboarding-info-icon" aria-hidden>i</span>
                <span>{sl ? 'Funkcionalnosti osnovnega paketa so že vključene.' : 'Basic plan features are already included.'}</span>
              </div>
            </section>

            <section className="register-onboarding-fields" aria-label={sl ? 'Opcijske funkcionalnosti' : 'Optional features'}>
              <div className="register-onboarding-label">{sl ? 'Opcijski dodatki' : 'Optional features'}</div>
              <div className="register-addons-grid">
                {optionalFeatures.map((feature) => {
                  const selected = Boolean(selection.features?.[feature.key])
                  return (
                    <button
                      key={`feature-${feature.key}`}
                      type="button"
                      className={`register-addon-card${selected ? ' is-selected' : ''}`}
                      onClick={() => toggleFeature(feature.key)}
                      aria-pressed={selected}
                    >
                      <span className="register-addon-icon-new"><RegisterOptionIcon kind={getRegisterFeatureIconKind(feature.key)} /></span>
                      <span>
                        <span className="register-addon-card-title">{feature.name}</span>
                        <span className="register-addon-card-copy">{feature.description}</span>
                      </span>
                      <span className="register-addon-switch" aria-hidden />
                    </button>
                  )
                })}
                {addonOptions.map((addon) => {
                  const selected = Boolean(selection.addons?.[addon.key])
                  return (
                    <button
                      key={`addon-${addon.key}`}
                      type="button"
                      className={`register-addon-card${selected ? ' is-selected' : ''}`}
                      onClick={() => toggleAddon(addon.key)}
                      aria-pressed={selected}
                    >
                      <span className="register-addon-icon-new"><RegisterOptionIcon kind={`${addon.key} ${addon.name}`} /></span>
                      <span>
                        <span className="register-addon-card-title">{addon.name}</span>
                        <span className="register-addon-card-copy">{addon.description}</span>
                      </span>
                      <span className="register-addon-switch" aria-hidden />
                    </button>
                  )
                })}
              </div>

              <div className="register-addons-footer">
                <span>
                  {sl
                    ? 'Dodatke lahko pozneje kadarkoli vključite ali izključite v nastavitvah.'
                    : 'You can enable or disable optional features later in settings.'}
                </span>
                <span className="register-addons-count">
                  {sl ? `Izbranih dodatkov: ${selectedCount} od ${totalCount}` : `Selected: ${selectedCount} of ${totalCount}`}
                </span>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
