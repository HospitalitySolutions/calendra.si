import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocale } from '../locale'
import { captureReferralCode } from '../lib/referralRef'
import {
  normalizeRegisterSelection,
  parseRegisterSelection,
  selectionToSearch,
  type RegisterSelection,
} from './registerFlow'
import {
  RegisterOnboardingHeader,
  RegisterOptionIcon,
  RegisterTrustNote,
} from './RegisterOnboardingShell'
import { registerOnboardingStyles } from './registerOnboardingStyles'
import { TENANT_CONFIG_TYPE_OPTIONS, normalizeTenantConfigType, type TenantConfigType } from './configuration/guestWebsiteSettings'

export function RegisterPage() {
  const navigate = useNavigate()
  const { locale } = useLocale()
  const sl = locale === 'sl'
  const initial = useMemo(() => parseRegisterSelection(window.location.search), [])
  const [companyName, setCompanyName] = useState(initial.companyName || '')
  const [userCount, setUserCount] = useState(Math.min(20, Math.max(1, initial.additionalUsers || 1)))
  const [businessType, setBusinessType] = useState<TenantConfigType>(normalizeTenantConfigType(initial.businessType))
  const [error, setError] = useState('')

  useEffect(() => {
    captureReferralCode(window.location.search)
  }, [])

  const continueStep = () => {
    const name = companyName.trim()
    if (!name) {
      setError(sl ? 'Vnesite naziv podjetja.' : 'Enter your business name.')
      return
    }
    const next: RegisterSelection = normalizeRegisterSelection({
      ...initial,
      plan: initial.plan || 'basic',
      billing: initial.billing || 'monthly',
      additionalUsers: Math.max(1, userCount),
      additionalSms: 0,
      companyName: name,
      businessType,
    })
    navigate(`/register/add-ons?${selectionToSearch(next)}`)
  }

  const sliderPercent = ((Math.max(1, Math.min(20, userCount)) - 1) / 19) * 100

  return (
    <div className="register-onboarding register-onboarding-step-one">
      <style>{registerOnboardingStyles}</style>
      <div className="register-onboarding-shell">
        <RegisterOnboardingHeader
          activeStep={1}
          locale={locale}
          onBack={() => {
            if (window.history.length > 1) navigate(-1)
            else navigate('/login')
          }}
          onContinue={continueStep}
        />

        <main className="register-onboarding-main">
          <div className="register-onboarding-grid">
            <section className="register-onboarding-intro">
              <h1 className="register-onboarding-title">
                {sl ? 'Povejte nam nekaj o vašem podjetju' : 'Tell us about your business'}
              </h1>
              <p className="register-onboarding-description">
                {sl
                  ? 'Ti podatki nam pomagajo pripraviti vaš račun in prilagoditi Calendra izkušnjo vašim potrebam.'
                  : 'These details help us prepare your account and tailor Calendra to your business.'}
              </p>
            </section>

            <section className="register-onboarding-fields" aria-label={sl ? 'Osnovni podatki podjetja' : 'Business details'}>
              <div className="register-onboarding-section">
                <label className="register-onboarding-label" htmlFor="register-company-name">
                  {sl ? 'Naziv podjetja' : 'Business name'}
                </label>
                <input
                  id="register-company-name"
                  className="register-onboarding-input"
                  value={companyName}
                  onChange={(event) => {
                    setCompanyName(event.target.value)
                    if (error) setError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') continueStep()
                  }}
                  placeholder={sl ? 'Vnesite naziv vašega podjetja' : 'Enter your business name'}
                  autoComplete="organization"
                />
                {error ? <div className="register-onboarding-error">{error}</div> : null}
              </div>

              <div className="register-onboarding-section">
                <label className="register-onboarding-label" htmlFor="register-user-count">
                  {sl ? 'Število uporabnikov' : 'Number of users'}
                </label>
                <div className="register-user-slider-wrap">
                  <input
                    id="register-user-count"
                    className="register-user-slider"
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={userCount}
                    onChange={(event) => setUserCount(Math.max(1, Number(event.target.value) || 1))}
                    style={{ '--range-progress': `${sliderPercent}%` } as CSSProperties}
                    aria-valuetext={sl ? `${userCount} uporabnikov` : `${userCount} users`}
                  />
                  <div className="register-user-slider-value">
                    {userCount === 1
                      ? (sl ? '1 uporabnik' : '1 user')
                      : (sl ? `${userCount} uporabnikov` : `${userCount} users`)}
                  </div>
                </div>
              </div>

              <div className="register-onboarding-section">
                <div className="register-onboarding-label">{sl ? 'Tip podjetja' : 'Business type'}</div>
                <div className="register-business-grid">
                  {TENANT_CONFIG_TYPE_OPTIONS.map((item) => {
                    const selected = businessType === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`register-business-card${selected ? ' is-selected' : ''}`}
                        onClick={() => setBusinessType(item.id)}
                        aria-pressed={selected}
                      >
                        <span className="register-business-icon"><RegisterOptionIcon kind={item.id} /></span>
                        <span>{sl ? item.labelSl : item.labelEn}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <RegisterTrustNote>
                {sl
                  ? 'Vaši podatki so varni in bodo uporabljeni samo za nastavitev vašega računa.'
                  : 'Your details are secure and will only be used to set up your account.'}
              </RegisterTrustNote>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

export function RegisterFooterListIcon() {
  return (
    <svg
      className="register-footer-pill-svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function RegisterFooterChevron({
  up,
  className,
  size = 18,
}: {
  up: boolean
  className?: string
  size?: number
}) {
  return (
    <svg
      className={["register-footer-chevron-svg", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {up ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
    </svg>
  )
}
