import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { useNavigate } from 'react-router-dom'
import loginLogo from '../assets/login-logo.png'
import { useToast } from '../components/Toast'
import { Field } from '../components/ui'
import { useLocale } from '../locale'
import { registerPageStyles } from './registerPageStyles'
import {
  getBillableAdditionalUserSlots,
  parseRegisterSelection,
  selectionToSearch,
  type RegisterBillingCycle,
  type RegisterPlanKey,
  type RegisterSelection,
} from './registerFlow'

type FeatureKey =
  | 'appointments'
  | 'staff'
  | 'group'
  | 'resources'
  | 'payments'
  | 'reminders'
  | 'ai'
  | 'integrations'
  | 'reporting'
  | 'multilocation'

type AddonKey = 'voice' | 'billing' | 'whitelabel'

type PlanConfig = {
  name: string
  monthly: number
  description: string
  recommendation: string
  upsell: string
  features: FeatureKey[]
}

export const plans: Record<RegisterPlanKey, PlanConfig> = {
  basic: {
    name: 'Basic',
    monthly: 9,
    description: 'Ideal for solo providers starting with simple one-on-one bookings and a low-friction onboarding path.',
    recommendation: 'Recommended: Basic for solo one-on-one businesses that want the lightest start',
    upsell: 'Basic is the cleanest entry offer here because the 14-day free trial removes friction before account creation and billing.',
    features: ['appointments', 'staff'],
  },
  pro: {
    name: 'Pro',
    monthly: 19,
    description: 'Best for growing businesses with reminders, payments, and more advanced booking flows.',
    recommendation: 'Recommended: Pro for small teams with mixed booking needs',
    upsell: 'Pro is the best fit when you need reminders, payments, team coordination, or richer scheduling from the start.',
    features: ['appointments', 'staff', 'group', 'resources', 'payments', 'reminders', 'ai', 'integrations'],
  },
  business: {
    name: 'Business',
    monthly: 39,
    description: 'For larger teams, multiple locations, and advanced reporting.',
    recommendation: 'Recommended: Business for larger teams, resources, and multi-location workflows',
    upsell: 'Business is the strongest fit when you manage multiple branches, broader operations, or advanced reporting needs.',
    features: ['appointments', 'staff', 'group', 'resources', 'payments', 'reminders', 'ai', 'integrations', 'reporting', 'multilocation'],
  },
}

const featureItems: Array<{ key: FeatureKey; index: number; name: string; description: string }> = [
  { key: 'appointments', index: 1, name: 'Unlimited appointments', description: 'Accept bookings without monthly caps.' },
  { key: 'staff', index: 2, name: 'Team members', description: 'Manage staff schedules and availability.' },
  { key: 'group', index: 3, name: 'Group bookings', description: 'Classes, sessions, workshops, and shared slots.' },
  { key: 'resources', index: 4, name: 'Resource scheduling', description: 'Rooms, chairs, courts, equipment, and assets.' },
  { key: 'payments', index: 5, name: 'Online payments', description: 'Deposits and prepayments during booking.' },
  { key: 'reminders', index: 6, name: 'SMS & email reminders', description: 'Reduce no-shows automatically.' },
  { key: 'ai', index: 7, name: 'AI booking assistant', description: 'Voice booking and intelligent scheduling help.' },
  { key: 'integrations', index: 8, name: 'Integrations', description: 'Google, Outlook, Zoom, payments, automation.' },
  { key: 'reporting', index: 9, name: 'Advanced reporting', description: 'Revenue, utilization, and booking analytics.' },
  { key: 'multilocation', index: 10, name: 'Multi-location support', description: 'Manage multiple branches in one account.' },
]

const addonCatalog: Record<AddonKey, { name: string; monthly: number; description: string }> = {
  voice: { name: 'AI voice booking', monthly: 12, description: 'Hands-free assistant for faster scheduling.' },
  billing: { name: 'Billing & invoices', monthly: 8, description: 'Invoices, payment records, and exports.' },
  whitelabel: { name: 'Branded booking experience', monthly: 10, description: 'Custom colors, domain, and branded notifications.' },
}

type RegisterPlanAddonSectionsProps = {
  selection: RegisterSelection
  setSelection: Dispatch<SetStateAction<RegisterSelection>>
  featureAddonsSectionRef?: RefObject<HTMLElement | null> | null
  /** Bottom sentinel for scroll / “fully viewed” detection (e.g. add-ons page footer CTA). */
  featureAddonsEndRef?: RefObject<HTMLDivElement | null> | null
  /** Compact add-ons dialog: flatter layout and shorter user-tier copy. */
  addonsModalPresentation?: boolean
}

export function RegisterPlanAddonSections({
  selection,
  setSelection,
  featureAddonsSectionRef,
  featureAddonsEndRef,
  addonsModalPresentation = false,
}: RegisterPlanAddonSectionsProps) {
  return (
    <>
      <section className="slider-section" aria-label="Usage-based add-ons">
        <div className="section-divider"><span>Usage-based add-ons</span></div>

        <div className="slider-stack">
          <div className="slider-card">
            <div className="slider-head">
              <div className="slider-meta">
                <strong>Users</strong>
                <span>Add extra team members on top of your selected plan allowance.</span>
              </div>
              <div className="slider-value">{selection.additionalUsers} {selection.additionalUsers === 1 ? 'user' : 'users'}</div>
            </div>

            <div className="slider-input-wrap">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={selection.additionalUsers}
                onChange={(event) => setSelection((current) => ({ ...current, additionalUsers: Number(event.target.value) }))}
              />
              <div className="slider-scale">
                <span>1</span>
                <span>10 users</span>
              </div>
            </div>

            <div className="slider-price-note">
              {!addonsModalPresentation ? (
                <span>First additional user free; then €9.90 / user / month</span>
              ) : null}
              <strong>{`${formatEuro(getBillableAdditionalUserSlots(selection) * 9.9)}/mo`}</strong>
            </div>
          </div>

          <div className="slider-card">
            <div className="slider-head">
              <div className="slider-meta">
                <strong>SMS messages</strong>
                <span>Increase reminder volume in blocks of 100 SMS messages.</span>
              </div>
              <div className="slider-value">{selection.additionalSms} SMS</div>
            </div>

            <div className="slider-input-wrap">
              <input
                type="range"
                min="0"
                max="1000"
                step="100"
                value={selection.additionalSms}
                onChange={(event) => setSelection((current) => ({ ...current, additionalSms: Number(event.target.value) }))}
              />
              <div className="slider-scale">
                <span>0</span>
                <span>1000 SMS</span>
              </div>
            </div>

            <div className="slider-price-note">
              <span>€0.05 per SMS (€5.00 per 100)</span>
              <strong>{selection.additionalSms > 0 ? `${formatEuro(selection.additionalSms * 0.05)}/mo` : '€0/mo'}</strong>
            </div>
          </div>
        </div>
      </section>

      <section
        ref={featureAddonsSectionRef ?? undefined}
        id="register-feature-add-ons"
        className="feature-addons-section"
        aria-label="Feature add-ons"
      >
        <div className="addons-divider"><span>Feature add-ons</span></div>

        <div className="feature-addons-list">
          {(['voice', 'billing', 'whitelabel'] as const).map((addonKey) => {
            const addon = addonCatalog[addonKey]
            return (
              <div key={addonKey} className="feature-addon-card">
                <label>
                  <input
                    type="checkbox"
                    checked={selection.addons[addonKey]}
                    onChange={(event) => setSelection((current) => ({
                      ...current,
                      addons: {
                        ...current.addons,
                        [addonKey]: event.target.checked,
                      },
                    }))}
                  />
                  <span className="addon-meta">
                    <span className="addon-name">{addon.name}</span>
                    <span className="addon-desc">{addon.description}</span>
                  </span>
                </label>
                <span className="addon-price">+{formatEuro(addon.monthly)}/mo</span>
              </div>
            )
          })}
        </div>
        <div ref={featureAddonsEndRef ?? undefined} className="register-feature-addons-end-sentinel" aria-hidden />
      </section>
    </>
  )
}

function annualPrice(monthly: number) {
  return Number((monthly * 12 * 0.85).toFixed(2))
}

export function formatEuro(value: number) {
  const rounded = Math.round(value * 100) / 100
  return rounded % 1 === 0 ? `€${rounded.toFixed(0)}` : `€${rounded.toFixed(2)}`
}

function getPlanDisplay(planKey: RegisterPlanKey, billing: RegisterBillingCycle) {
  const plan = plans[planKey]

  if (planKey === 'basic' && billing === 'monthly') {
    return {
      primary: '€0/mo',
      secondary: '14-day free trial, then €9/mo',
    }
  }

  if (billing === 'annual') {
    const annual = annualPrice(plan.monthly)
    return {
      primary: `${formatEuro(annual / 12)}/mo`,
      secondary: `Billed annually at ${formatEuro(annual)}/yr`,
    }
  }

  return {
    primary: `${formatEuro(plan.monthly)}/mo`,
    secondary: 'Billed monthly',
  }
}

function getPlanCardPriceNote(planKey: RegisterPlanKey, billing: RegisterBillingCycle) {
  if (planKey === 'basic') {
    if (billing === 'monthly') {
      return {
        badgeVisible: true,
        price: '€0',
        per: '/mo',
        oldPriceVisible: true,
        oldPrice: '€9/mo',
        note: 'Free for 14 days, then €9/mo unless cancelled.',
        noteIsTrial: true,
      }
    }

    const annual = annualPrice(plans.basic.monthly)
    return {
      badgeVisible: false,
      price: formatEuro(annual / 12),
      per: '/mo',
      oldPriceVisible: false,
      oldPrice: '',
      note: `Billed annually at ${formatEuro(annual)}/yr (15% off).`,
      noteIsTrial: false,
    }
  }

  if (billing === 'annual') {
    const annual = annualPrice(plans[planKey].monthly)
    return {
      badgeVisible: false,
      price: formatEuro(annual / 12),
      per: '/mo',
      oldPriceVisible: false,
      oldPrice: '',
      note: `Billed annually at ${formatEuro(annual)}/yr.`,
      noteIsTrial: false,
    }
  }

  return {
    badgeVisible: false,
    price: formatEuro(plans[planKey].monthly),
    per: '/mo',
    oldPriceVisible: false,
    oldPrice: '',
    note: planKey === 'pro'
      ? 'Best for growing businesses with up to 5 team members.'
      : 'Built for larger operations and multi-location teams.',
    noteIsTrial: false,
  }
}

export function getSelectionMonthlyAmounts(selection: RegisterSelection) {
  const selectedPlan = selection.plan
  const planMonthly = selectedPlan === 'basic' && selection.billing === 'monthly' ? 0 : plans[selectedPlan].monthly
  const usersMonthly = getBillableAdditionalUserSlots(selection) * 9.9
  const smsMonthly = selection.additionalSms * 0.05
  const addonsMonthly = (selection.addons.voice ? addonCatalog.voice.monthly : 0)
    + (selection.addons.billing ? addonCatalog.billing.monthly : 0)
    + (selection.addons.whitelabel ? addonCatalog.whitelabel.monthly : 0)

  return {
    planMonthly,
    usersMonthly,
    smsMonthly,
    addonsMonthly,
    totalMonthly: planMonthly + usersMonthly + smsMonthly + addonsMonthly,
  }
}

export type RegisterSummary = {
  rows: Array<{ label: string; value: string }>
  totalPrimary: string
  totalSecondary: string
  /** Annual-only: savings vs undiscounted plan+usage bundle (15% on plan/users/feature add-ons). */
  annualSavingsYr?: number
}

export function buildSummary(selection: RegisterSelection): RegisterSummary {
  const monthly = getSelectionMonthlyAmounts(selection)
  const rows: Array<{ label: string; value: string }> = []

  if (selection.plan === 'basic' && selection.billing === 'monthly') {
    rows.push({ label: 'Basic plan', value: '€0 now' })
    rows.push({ label: 'After 14-day trial', value: '€9/mo' })
  } else if (selection.billing === 'annual') {
    rows.push({ label: `${plans[selection.plan].name} plan`, value: `${formatEuro(monthly.planMonthly * 0.85)}/mo` })
  } else {
    rows.push({ label: `${plans[selection.plan].name} plan`, value: `${formatEuro(monthly.planMonthly)}/mo` })
  }

  if (getBillableAdditionalUserSlots(selection) > 0) {
    const usersValue = selection.billing === 'annual'
      ? `${formatEuro(monthly.usersMonthly * 0.85)}/mo`
      : `${formatEuro(monthly.usersMonthly)}/mo`
    rows.push({ label: `Users × ${selection.additionalUsers}`, value: usersValue })
  }

  if (selection.additionalSms > 0) {
    rows.push({ label: `SMS messages × ${selection.additionalSms}`, value: `${formatEuro(monthly.smsMonthly)}/mo` })
  }

  ;(['voice', 'billing', 'whitelabel'] as const).forEach((addonKey) => {
    if (!selection.addons[addonKey]) return
    const addon = addonCatalog[addonKey]
    const displayValue = selection.billing === 'annual'
      ? `${formatEuro(addon.monthly * 0.85)}/mo`
      : `${formatEuro(addon.monthly)}/mo`
    rows.push({ label: addon.name, value: displayValue })
  })

  if (selection.plan === 'basic' && selection.billing === 'monthly') {
    const addOnsOnly = monthly.usersMonthly + monthly.smsMonthly + monthly.addonsMonthly
    return {
      rows,
      totalPrimary: addOnsOnly > 0 ? `${formatEuro(addOnsOnly)}/mo add-ons only` : '€0 now',
      totalSecondary: '',
    }
  }

  if (selection.billing === 'annual') {
    const totalAnnual = (monthly.planMonthly + monthly.usersMonthly + monthly.addonsMonthly) * 10.2 + monthly.smsMonthly * 12
    const undiscountedAnnual = (monthly.planMonthly + monthly.usersMonthly + monthly.addonsMonthly) * 12 + monthly.smsMonthly * 12
    const annualSavingsYr = Math.max(0, undiscountedAnnual - totalAnnual)
    return {
      rows,
      totalPrimary: `${formatEuro(totalAnnual / 12)}/mo`,
      totalSecondary: '',
      annualSavingsYr,
    }
  }

  return {
    rows,
    totalPrimary: `${formatEuro(monthly.totalMonthly)}/mo`,
    totalSecondary: '',
  }
}

export function RegisterFooterListIcon() {
  return (
    <svg className="register-footer-pill-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function RegisterFooterChevron({ up, className, size = 18 }: { up: boolean; className?: string; size?: number }) {
  return (
    <svg
      className={['register-footer-chevron-svg', className].filter(Boolean).join(' ')}
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

export function RegisterPage() {
  const navigate = useNavigate()
  const { locale, setLocale } = useLocale()
  const { showToast } = useToast()
  const [selection, setSelection] = useState<RegisterSelection>(() => parseRegisterSelection(window.location.search))
  const [previewPlan, setPreviewPlan] = useState<RegisterPlanKey>(selection.plan)
  const [footerExpanded, setFooterExpanded] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactError, setContactError] = useState('')
  const planPreviewPanelRef = useRef<HTMLElement | null>(null)
  const featureAddonsSectionRef = useRef<HTMLElement | null>(null)
  const continueUnlockTimerRef = useRef(0)
  const [planExtrasInView, setPlanExtrasInView] = useState(false)
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const sync = () => setIsCompactLayout(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (isCompactLayout) {
      setPlanExtrasInView(true)
      return
    }
    setPlanExtrasInView(false)
    const el = featureAddonsSectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPlanExtrasInView(true)
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -88px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isCompactLayout])

  useEffect(
    () => () => {
      window.clearTimeout(continueUnlockTimerRef.current)
    },
    [],
  )

  const revealPlanExtrasAndAllowContinue = useCallback(() => {
    if (isCompactLayout) {
      navigate(`/register/add-ons?${selectionToSearch(selection)}`)
      return
    }
    featureAddonsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.clearTimeout(continueUnlockTimerRef.current)
    continueUnlockTimerRef.current = window.setTimeout(() => {
      setPlanExtrasInView(true)
      continueUnlockTimerRef.current = 0
    }, 1100)
  }, [isCompactLayout, navigate, selection])

  const continueToAccount = useCallback(() => {
    navigate(`/register/account?${selectionToSearch(selection)}`)
  }, [navigate, selection])

  const planDisplay = useMemo(() => getPlanDisplay(previewPlan, selection.billing), [previewPlan, selection.billing])
  const summary = useMemo(() => buildSummary(selection), [selection])
  const monthlyAmounts = useMemo(() => getSelectionMonthlyAmounts(selection), [selection])
  const websiteUrl = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.trim() || 'https://calendra.si'

  const footerPill = useMemo(() => {
    const plan = plans[selection.plan]
    const featureCount = plan.features.length
    const lineCount = summary.rows.length
    const extraLines = Math.max(0, lineCount - 1)
    const title = `${featureCount} plan feature${featureCount === 1 ? '' : 's'} · ${lineCount} estimate line${lineCount === 1 ? '' : 's'}`
    const subParts = [`${plan.name} plan`, selection.billing === 'annual' ? 'Annual billing' : 'Monthly billing']
    if (extraLines > 0) {
      subParts.push(`${extraLines} usage & add-on${extraLines === 1 ? '' : 's'}`)
    }
    return { title, sub: subParts.join(' · ') }
  }, [selection, summary])

  const peekAddonMonthly = useMemo(() => {
    const m = monthlyAmounts
    if (selection.billing === 'annual') {
      return (m.usersMonthly + m.addonsMonthly) * 0.85 + m.smsMonthly
    }
    return m.usersMonthly + m.smsMonthly + m.addonsMonthly
  }, [monthlyAmounts, selection.billing])

  const usageAddonLineCount = useMemo(() => {
    let n = 0
    if (getBillableAdditionalUserSlots(selection) > 0) n++
    if (selection.additionalSms > 0) n++
    if (selection.addons.voice) n++
    if (selection.addons.billing) n++
    if (selection.addons.whitelabel) n++
    return n
  }, [selection])

  const contactSalesEmail = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || 'info@calendra.si'

  const openContactModal = () => {
    setContactError('')
    setContactOpen(true)
  }

  const closeContactModal = () => {
    setContactOpen(false)
    setContactError('')
  }

  const submitContactModal = () => {
    const name = contactName.trim()
    const email = contactEmail.trim()
    const phone = contactPhone.trim()
    const message = contactMessage.trim()
    if (!name || !email || !message) {
      setContactError('Please fill in your name, email, and message.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setContactError('Please enter a valid email address.')
      return
    }
    const subject = encodeURIComponent('Calendra — Custom solution inquiry')
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\n\n${message}`)
    window.location.href = `mailto:${contactSalesEmail}?subject=${subject}&body=${body}`
    showToast('success', 'Opening your email client…')
    closeContactModal()
    setContactName('')
    setContactEmail('')
    setContactPhone('')
    setContactMessage('')
  }

  const setPlan = (plan: RegisterPlanKey) => {
    setSelection((current) => ({ ...current, plan }))
    setPreviewPlan(plan)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches) {
      window.requestAnimationFrame(() => {
        planPreviewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const planForPreview = plans[previewPlan]

  return (
    <div className="register-flow">
      <style>{registerPageStyles}</style>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img className="brand-logo" src={loginLogo} alt="Calendra — Simplify Your Booking" />
          </div>

          <div className="top-actions">
            <div className="lang-switch" role="group" aria-label="Language">
              <button
                type="button"
                className={locale === 'sl' ? 'lang-switch-btn active' : 'lang-switch-btn'}
                aria-pressed={locale === 'sl'}
                onClick={() => setLocale('sl')}
              >
                SL
              </button>
              <button
                type="button"
                className={locale === 'en' ? 'lang-switch-btn active' : 'lang-switch-btn'}
                aria-pressed={locale === 'en'}
                onClick={() => setLocale('en')}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        <main className="content">
          <h1 className="register-sr-only">Calendra — plan selection</h1>
          <div className="register-plan-page-stack">
            <section className="layout">
            <div className="register-stepper-row">
              <div className="stepper" aria-label="Registration progress">
                <div className="step active">1 Plan Selection</div>
                <div className="step">2 Account Setup</div>
                <div className="step">3 Billing Details</div>
              </div>
              <div className="recommendation">{planForPreview.recommendation}</div>
            </div>

            <section className="panel right-panel">
              <div className="billing-toggle-wrap">
                <div>
                  <div className="billing-toggle" aria-label="Billing cycle selector">
                    <button
                      className={selection.billing === 'monthly' ? 'billing-option active' : 'billing-option'}
                      type="button"
                      onClick={() => setSelection((current) => ({ ...current, billing: 'monthly' }))}
                    >
                      Monthly
                    </button>
                    <button
                      className={selection.billing === 'annual' ? 'billing-option active' : 'billing-option'}
                      type="button"
                      onClick={() => setSelection((current) => ({ ...current, billing: 'annual' }))}
                    >
                      Annual
                    </button>
                  </div>
                </div>
                <div className="annual-save">Save 15% with annual billing</div>
              </div>

              <div className="plans-grid">
                {(['basic', 'pro', 'business'] as const).map((planKey) => {
                  const plan = plans[planKey]
                  const priceBlock = getPlanCardPriceNote(planKey, selection.billing)
                  const isSelected = selection.plan === planKey
                  return (
                    <article
                      key={planKey}
                      className={[
                        'plan-card',
                        planKey === 'pro' ? 'recommended' : '',
                        isSelected ? 'active' : '',
                      ].filter(Boolean).join(' ')}
                      tabIndex={0}
                      onMouseEnter={() => setPreviewPlan(planKey)}
                      onFocus={() => setPreviewPlan(planKey)}
                      onMouseLeave={() => setPreviewPlan(selection.plan)}
                      onBlur={() => setPreviewPlan(selection.plan)}
                      onClick={() => setPlan(planKey)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setPlan(planKey)
                        }
                      }}
                    >
                      <div className="badge-row">
                        {planKey === 'basic' && <span className="badge soft">Starter</span>}
                        {planKey === 'pro' && <span className="badge gold">Recommended</span>}
                        {planKey === 'business' && <span className="badge soft">Business</span>}
                        {planKey === 'basic' && priceBlock.badgeVisible && <span className="badge green">14-day free trial</span>}
                        {planKey === 'pro' && <span className="badge soft">Most popular</span>}
                        {planKey === 'business' && <span />}
                      </div>
                      <h3 className="plan-name">{plan.name}</h3>
                      <div className="price-stack">
                        <div className="price-row">
                          <div className="price">{priceBlock.price}</div>
                          <div className="per">{priceBlock.per}</div>
                        </div>
                        {priceBlock.oldPriceVisible && (
                          <div className="price-row">
                            <div className="old-price">{priceBlock.oldPrice}</div>
                          </div>
                        )}
                        <div className="price-note">
                          {priceBlock.noteIsTrial ? <span className="trial-note">Free for 14 days</span> : null}
                          {priceBlock.noteIsTrial ? ', then €9/mo unless cancelled.' : priceBlock.note}
                        </div>
                      </div>
                      <div className="plan-desc">
                        {planKey === 'basic' && 'For solo providers with simple one-on-one appointments and the easiest possible start.'}
                        {planKey === 'pro' && 'Best for growing businesses with reminders, payments, and more advanced booking flows.'}
                        {planKey === 'business' && 'For larger teams, multiple locations, and advanced reporting.'}
                      </div>
                      <div className="mini-points">
                        {planKey === 'basic' && (
                          <>
                            <div><span className="check">✓</span><span>Simple booking page</span></div>
                            <div><span className="check">✓</span><span>Email confirmations</span></div>
                            <div><span className="check">✓</span><span>Single user setup</span></div>
                          </>
                        )}
                        {planKey === 'pro' && (
                          <>
                            <div><span className="check">✓</span><span>Payments and reminders</span></div>
                            <div><span className="check">✓</span><span>Up to 5 team members</span></div>
                            <div><span className="check">✓</span><span>Group and resource scheduling</span></div>
                          </>
                        )}
                        {planKey === 'business' && (
                          <>
                            <div><span className="check">✓</span><span>Unlimited staff and resources</span></div>
                            <div><span className="check">✓</span><span>Advanced reporting</span></div>
                            <div><span className="check">✓</span><span>Multi-location control</span></div>
                          </>
                        )}
                      </div>
                      <div className="spacer" />
                      <button className={isSelected ? 'plan-button selected' : 'plan-button unselected'} type="button" onClick={(event) => {
                        event.stopPropagation()
                        setPlan(planKey)
                      }}>
                        {isSelected ? '✓ Selected' : planKey === 'basic' ? (selection.billing === 'monthly' ? 'Select Free Trial' : 'Select Basic') : planKey === 'pro' ? 'Select Pro' : 'Select Business'}
                      </button>
                    </article>
                  )
                })}
              </div>

              <button type="button" className="custom-cta custom-cta--inline" onClick={openContactModal}>
                Need a custom solution? Contact us
              </button>

              {!isCompactLayout ? (
                <RegisterPlanAddonSections
                  selection={selection}
                  setSelection={setSelection}
                  featureAddonsSectionRef={featureAddonsSectionRef}
                />
              ) : null}
            </section>

            <aside ref={planPreviewPanelRef} className="panel left-panel">
              <div className="plan-preview-head-row">
                <div className="eyebrow">Plan preview</div>
                <span className="plan-preview-name">{planForPreview.name}</span>
              </div>
              <h2 className="plan-preview-heading">What’s included in this plan</h2>

              <div className="selected-box">
                <div>
                  <strong>{planForPreview.name}</strong>
                  <div className="selected-meta">{planForPreview.description}</div>
                </div>
                <div className="selected-price-block">
                  <span className="selected-price">{planDisplay.primary}</span>
                  <span className="selected-subprice">{planDisplay.secondary}</span>
                </div>
              </div>

              <ul className="feature-list">
                {featureItems.map((feature) => {
                  const enabled = planForPreview.features.includes(feature.key)
                  return (
                    <li key={feature.key} className={enabled ? 'feature-item enabled' : 'feature-item'}>
                      <span className="icon">{feature.index}</span>
                      <span className="meta">
                        <span className="name">{feature.name}</span>
                        <span className="desc">{feature.description}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </aside>

            </section>
          </div>
        </main>
      </div>

      <footer className={`register-fixed-footer${footerExpanded ? ' is-expanded' : ''}`} role="contentinfo">
        <div className={`register-fixed-footer-inner register-footer-panel${footerExpanded ? ' is-expanded' : ''}`}>
          <div className="register-footer-toolbar">
            <div className="register-footer-back">
              <button className="back-link" type="button" onClick={() => window.location.assign(websiteUrl)}>← Back to website</button>
            </div>

            <button type="button" className="custom-cta custom-cta--footer-toolbar" onClick={openContactModal}>
              Need a custom solution? Contact us
            </button>

            <div className="register-footer-center-cluster">
              <div className="register-footer-toolbar-mid">
                <button
                  type="button"
                  className="register-footer-pill"
                  aria-expanded={footerExpanded}
                  aria-controls="register-footer-details"
                  aria-label={footerExpanded ? 'Hide estimate details' : 'Show estimate details'}
                  onClick={() => setFooterExpanded((v) => !v)}
                >
                  <span className="register-footer-pill-icon" aria-hidden>
                    <RegisterFooterListIcon />
                  </span>
                  <span className="register-footer-pill-text">
                    <strong className="register-footer-pill-title">{footerPill.title}</strong>
                    <span className="register-footer-pill-sub">{footerPill.sub}</span>
                  </span>
                  <span className="register-footer-pill-total-inline">
                    <span className="register-footer-total-label">Est. total</span>
                    <strong className="register-footer-total-value">{summary.totalPrimary}</strong>
                  </span>
                  <span className="register-footer-pill-chevron" aria-hidden>
                    <RegisterFooterChevron up={footerExpanded} />
                  </span>
                </button>
              </div>
            </div>

            <div className="register-footer-continue">
              {planExtrasInView ? (
                <button
                  className="continue-button"
                  type="button"
                  onClick={() => {
                    if (isCompactLayout) {
                      navigate(`/register/add-ons?${selectionToSearch(selection)}`)
                      return
                    }
                    continueToAccount()
                  }}
                >
                  {isCompactLayout
                    ? 'Continue to add-ons selection'
                    : selection.plan === 'basic' && selection.billing === 'monthly'
                      ? 'Continue to account creation'
                      : 'Continue with selected plan'}
                </button>
              ) : (
                <button
                  className="continue-button continue-button-scroll-hint"
                  type="button"
                  onClick={revealPlanExtrasAndAllowContinue}
                  aria-label="Scroll down to review feature add-ons and usage options on this page"
                >
                  <RegisterFooterChevron up={false} size={22} className="continue-button-scroll-chevron" />
                  <span className="continue-button-scroll-hint-text">Add-ons below</span>
                </button>
              )}
            </div>
          </div>

          {footerExpanded ? (
            <div className="register-footer-expanded" id="register-footer-details">
              <div className="register-footer-peek">
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">Plan</span>
                  <strong className="register-footer-peek-name">{plans[selection.plan].name}</strong>
                  <span className="register-footer-peek-value">{summary.rows[0]?.value ?? '—'}</span>
                </div>
                <div className="register-footer-peek-plus" aria-hidden>
                  +
                </div>
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">Usage &amp; add-ons</span>
                  <strong className="register-footer-peek-name">
                    {usageAddonLineCount} {usageAddonLineCount === 1 ? 'item' : 'items'}
                  </strong>
                  <span className="register-footer-peek-value">{formatEuro(peekAddonMonthly)}/mo</span>
                </div>
              </div>

              <div className="register-footer-detail-card">
                <h3 className="register-footer-detail-title">Estimate breakdown</h3>
                <ul className="register-footer-detail-list">
                  {summary.rows.map((row) => (
                    <li key={`${row.label}-${row.value}`} className="register-footer-detail-row">
                      <span className="register-footer-detail-check" aria-hidden>✓</span>
                      <span className="register-footer-detail-label">{row.label}</span>
                      <strong className="register-footer-detail-price">{row.value}</strong>
                    </li>
                  ))}
                </ul>
                <div className="register-footer-detail-foot">
                  {summary.annualSavingsYr != null && summary.annualSavingsYr > 0 ? (
                    <span className="register-footer-save-badge">
                      You save {formatEuro(summary.annualSavingsYr)}/yr (15%)
                    </span>
                  ) : null}
                  <div className="register-footer-detail-total">
                    <span className="register-footer-detail-total-label">Est. total</span>
                    <strong className="register-footer-detail-total-value">{summary.totalPrimary}</strong>
                  </div>
                </div>
              </div>

              <button type="button" className="register-footer-hide-link" onClick={() => setFooterExpanded(false)}>
                Hide details
                <RegisterFooterChevron up />
              </button>
            </div>
          ) : null}
        </div>
      </footer>

      {contactOpen ? (
        <div className="register-contact-modal-root" role="presentation">
          <button type="button" className="register-contact-modal-backdrop" aria-label="Close contact form" onClick={closeContactModal} />
          <div
            className="register-contact-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-contact-title"
          >
            <h2 id="register-contact-title" className="register-contact-modal-title">Contact us</h2>
            <p className="register-contact-modal-intro">Tell us what you need. We will follow up by email.</p>
            <div className="register-contact-form stack gap-md">
              <Field label="Name">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label="Email">
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Phone" hint="Optional">
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} autoComplete="tel" />
              </Field>
              <Field label="Message">
                <textarea rows={4} value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} placeholder="Describe your needs…" />
              </Field>
              {contactError ? <p className="register-contact-error" role="alert">{contactError}</p> : null}
            </div>
            <div className="register-contact-modal-actions">
              <button type="button" className="register-contact-cancel" onClick={closeContactModal}>
                Cancel
              </button>
              <button type="button" className="register-contact-submit" onClick={submitContactModal}>
                Send via email
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
