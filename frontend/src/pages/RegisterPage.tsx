import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { useNavigate } from 'react-router-dom'
import loginLogo from '../assets/login-logo.png'
import { useToast } from '../components/Toast'
import { Field } from '../components/ui'
import { useLocale } from '../locale'
import { ensureRegisterCatalogLoaded } from '../lib/registerCatalogBootstrap'
import { useRegisterFooterClickOutside } from '../lib/useRegisterFooterClickOutside'
import { registerPageStyles } from './registerPageStyles'
import {
  getBillableAdditionalUserSlots,
  parseRegisterSelection,
  selectionToSearch,
  type RegisterPlanKey,
  type RegisterSelection,
} from './registerFlow'
import {
  annualSaveBadgeText,
  buildRegisterFooterPill,
  buildSummary,
  formatEuro,
  getAddonCatalog,
  getFeatureItems,
  getPlanCardPriceNote,
  getPlanDisplay,
  getRegisterPlanPageCopy,
  getSelectionMonthlyAmounts,
  plansForLocale,
  type RegisterLocale,
  type RegisterPlanPageCopy,
  type RegisterSummary,
} from './registerPlanCopy'

export type { RegisterSummary } from './registerPlanCopy'
export { buildSummary, formatEuro, getSelectionMonthlyAmounts, plans } from './registerPlanCopy'

type RegisterPlanAddonSectionsProps = {
  selection: RegisterSelection
  setSelection: Dispatch<SetStateAction<RegisterSelection>>
  pageCopy: RegisterPlanPageCopy
  locale: RegisterLocale
  featureAddonsSectionRef?: RefObject<HTMLElement | null> | null
  /** Bottom sentinel for scroll / “fully viewed” detection (e.g. add-ons page footer CTA). */
  featureAddonsEndRef?: RefObject<HTMLDivElement | null> | null
  /** Compact add-ons dialog: flatter layout and shorter user-tier copy. */
  addonsModalPresentation?: boolean
}

function linearRangePercent(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return ((value - min) / (max - min)) * 100
}

function sliderThumbLabelStyle(percent: number): { left: string; transform: string } {
  return {
    left: `clamp(14px, ${percent}%, calc(100% - 14px))`,
    transform: 'translateX(-50%)',
  }
}

export function RegisterPlanAddonSections({
  selection,
  setSelection,
  pageCopy,
  locale,
  featureAddonsSectionRef,
  featureAddonsEndRef,
  addonsModalPresentation = false,
}: RegisterPlanAddonSectionsProps) {
  const addonCatalog = getAddonCatalog(locale)
  const pm = locale === 'sl' ? '/mes.' : '/mo'

  return (
    <>
      <section className="slider-section" aria-label={pageCopy.usageAddonsSectionAria}>
        <div className="section-divider"><span>{pageCopy.usageAddonsDivider}</span></div>

        <div className="slider-stack">
          <div className="slider-card">
            <div className="slider-head">
              <div className="slider-meta">
                <strong>{pageCopy.usersStrong}</strong>
                <span>{pageCopy.usersHint}</span>
              </div>
            </div>

            <div className="slider-input-wrap">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={selection.additionalUsers}
                onChange={(event) => setSelection((current) => ({ ...current, additionalUsers: Number(event.target.value) }))}
                style={
                  { '--fill-pct': linearRangePercent(selection.additionalUsers, 1, 10) } as CSSProperties
                }
              />
              <div className="slider-scale">
                <span
                  className="slider-scale-thumb"
                  style={sliderThumbLabelStyle(linearRangePercent(selection.additionalUsers, 1, 10))}
                >
                  {selection.additionalUsers}{' '}
                  {selection.additionalUsers === 1 ? pageCopy.userSingular : pageCopy.userPlural}
                </span>
              </div>
            </div>

            <div className="slider-price-note">
              {!addonsModalPresentation ? (
                <span>{pageCopy.firstUserFreeNote}</span>
              ) : null}
              <strong>{`${formatEuro(getBillableAdditionalUserSlots(selection) * 9.9)}${pm}`}</strong>
            </div>
          </div>

          <div className="slider-card">
            <div className="slider-head">
              <div className="slider-meta">
                <strong>{pageCopy.smsStrong}</strong>
                <span>{pageCopy.smsHint}</span>
              </div>
            </div>

            <div className="slider-input-wrap">
              <input
                type="range"
                min="0"
                max="1000"
                step="50"
                value={selection.additionalSms}
                onChange={(event) =>
                  setSelection((current) => ({ ...current, additionalSms: Number(event.target.value) }))
                }
                style={
                  { '--fill-pct': linearRangePercent(selection.additionalSms, 0, 1000) } as CSSProperties
                }
              />
              <div className="slider-scale">
                <span
                  className="slider-scale-thumb"
                  style={sliderThumbLabelStyle(linearRangePercent(selection.additionalSms, 0, 1000))}
                >
                  {pageCopy.smsCount(selection.additionalSms)}
                </span>
              </div>
            </div>

            <div className="slider-price-note">
              <span>{pageCopy.smsPriceNote}</span>
              <strong>
                {selection.additionalSms > 0 ? `${formatEuro(selection.additionalSms * 0.05)}${pm}` : pageCopy.smsZeroPerMo}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section
        ref={featureAddonsSectionRef ?? undefined}
        id="register-feature-add-ons"
        className="feature-addons-section"
        aria-label={pageCopy.featureAddonsAria}
      >
        <div className="addons-divider"><span>{pageCopy.featureAddonsDivider}</span></div>

        <div className="feature-addons-list">
          {(['voice', 'billing', 'whitelabel'] as const).map((addonKey) => {
            const addon = addonCatalog[addonKey]
            return (
              <div key={addonKey} className="feature-addon-card">
                <label className="feature-addon-card-label">
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
                  <span className="addon-price">+{formatEuro(addon.monthly)}{pm}</span>
                  <span className="addon-meta">
                    <span className="addon-name">{addon.name}</span>
                    <span className="addon-desc">{addon.description}</span>
                  </span>
                </label>
              </div>
            )
          })}
        </div>
        <div ref={featureAddonsEndRef ?? undefined} className="register-feature-addons-end-sentinel" aria-hidden />
      </section>
    </>
  )
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
  const { locale, setLocale, t } = useLocale()
  const lang: RegisterLocale = locale === 'sl' ? 'sl' : 'en'
  const pc = useMemo(() => getRegisterPlanPageCopy(lang), [lang])
  const plansLoc = useMemo(() => plansForLocale(lang), [lang])
  const featureItems = useMemo(() => getFeatureItems(lang), [lang])
  const pm = lang === 'sl' ? '/mes.' : '/mo'
  const { showToast } = useToast()
  const [selection, setSelection] = useState<RegisterSelection>(() => parseRegisterSelection(window.location.search))
  const [previewPlan, setPreviewPlan] = useState<RegisterPlanKey>(selection.plan)
  const [footerExpanded, setFooterExpanded] = useState(false)
  const registerFooterRef = useRef<HTMLElement | null>(null)
  useRegisterFooterClickOutside(registerFooterRef, footerExpanded, setFooterExpanded)
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
    void ensureRegisterCatalogLoaded()
  }, [])

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

  const planDisplay = useMemo(() => getPlanDisplay(previewPlan, selection.billing, lang), [previewPlan, selection.billing, lang])
  const summary = useMemo(() => buildSummary(selection, lang), [selection, lang])
  const monthlyAmounts = useMemo(() => getSelectionMonthlyAmounts(selection), [selection])
  const websiteUrl = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.trim() || 'https://calendra.si'

  const footerPill = useMemo(() => buildRegisterFooterPill(selection, summary, lang), [selection, summary, lang])

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
      setContactError(pc.contactErrRequired)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setContactError(pc.contactErrEmail)
      return
    }
    const subject = encodeURIComponent(pc.contactSubject)
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\n\n${message}`)
    window.location.href = `mailto:${contactSalesEmail}?subject=${subject}&body=${body}`
    showToast('success', pc.toastOpenMail)
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

  const planForPreview = plansLoc[previewPlan]

  return (
    <div className="register-flow">
      <style>{registerPageStyles}</style>
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={loginLogo} alt={pc.brandAlt} />
        </div>

        <div className="top-actions">
          <div className="lang-switch" role="group" aria-label={t('language')}>
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

      <div className="app">
        <main className="content">
          <h1 className="register-sr-only">{pc.srOnlyPlanTitle}</h1>
          <div className="register-plan-page-stack">
            <section className="layout">
            <div className="register-stepper-row">
              <div className="stepper" aria-label={pc.stepperAria}>
                <div className="step active">{pc.step1}</div>
                <div className="step">{pc.step2}</div>
                <div className="step">{pc.step3}</div>
              </div>
            </div>

            <section className="panel right-panel">
              <div className="billing-toggle-wrap">
                <div>
                  <div className="billing-toggle" aria-label={pc.billingCycleAria}>
                    <button
                      className={selection.billing === 'monthly' ? 'billing-option active' : 'billing-option'}
                      type="button"
                      onClick={() => setSelection((current) => ({ ...current, billing: 'monthly' }))}
                    >
                      {pc.monthly}
                    </button>
                    <button
                      className={selection.billing === 'annual' ? 'billing-option active' : 'billing-option'}
                      type="button"
                      onClick={() => setSelection((current) => ({ ...current, billing: 'annual' }))}
                    >
                      {pc.annual}
                    </button>
                  </div>
                </div>
                <div className="annual-save">{pc.annualSaveBanner}</div>
              </div>

              <div className="plans-grid">
                {(['basic', 'pro', 'business'] as const).map((planKey) => {
                  const plan = plansLoc[planKey]
                  const priceBlock = getPlanCardPriceNote(planKey, selection.billing, lang)
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
                        {planKey === 'pro' && <span className="badge gold">{pc.badgeRecommended}</span>}
                        {planKey === 'business' && <span className="badge soft">{pc.badgePremium}</span>}
                        {planKey === 'basic' && priceBlock.badgeVisible && <span className="badge green">{pc.badgeTrial14}</span>}
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
                          {priceBlock.noteIsTrial ? <span className="trial-note">{priceBlock.trialHighlight}</span> : null}
                          {priceBlock.noteIsTrial ? priceBlock.trialUnlessCancelled : priceBlock.note}
                        </div>
                      </div>
                      <div className="mini-points">
                        {planKey === 'basic' && (
                          <>
                            {pc.miniBasic.map((line) => (
                              <div key={line}><span className="check">✓</span><span>{line}</span></div>
                            ))}
                          </>
                        )}
                        {planKey === 'pro' && (
                          <>
                            {pc.miniPro.map((line) => (
                              <div key={line}><span className="check">✓</span><span>{line}</span></div>
                            ))}
                          </>
                        )}
                        {planKey === 'business' && (
                          <>
                            {pc.miniBusiness.map((line) => (
                              <div key={line}><span className="check">✓</span><span>{line}</span></div>
                            ))}
                          </>
                        )}
                      </div>
                      <div className="spacer" />
                      <button className={isSelected ? 'plan-button selected' : 'plan-button unselected'} type="button" onClick={(event) => {
                        event.stopPropagation()
                        setPlan(planKey)
                      }}>
                        {isSelected
                          ? pc.selectedCheck
                          : planKey === 'basic'
                            ? (selection.billing === 'monthly' ? pc.selectFreeTrial : pc.selectBasic)
                            : planKey === 'pro'
                              ? pc.selectPro
                              : pc.selectBusiness}
                      </button>
                    </article>
                  )
                })}
              </div>

              <button type="button" className="custom-cta custom-cta--inline" onClick={openContactModal}>
                {pc.customCta}
              </button>

              {!isCompactLayout ? (
                <RegisterPlanAddonSections
                  selection={selection}
                  setSelection={setSelection}
                  pageCopy={pc}
                  locale={lang}
                  featureAddonsSectionRef={featureAddonsSectionRef}
                />
              ) : null}
            </section>

            <aside ref={planPreviewPanelRef} className="panel left-panel">
              <h2 className="plan-preview-heading">{pc.planPreviewHeading}</h2>

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

      <footer
        ref={registerFooterRef}
        className={`register-fixed-footer${footerExpanded ? ' is-expanded' : ''}`}
        role="contentinfo"
      >
        <div className={`register-fixed-footer-inner register-footer-panel${footerExpanded ? ' is-expanded' : ''}`}>
          <div className="register-footer-toolbar">
            <div className="register-footer-toolbar-lead">
              <div className="register-footer-back">
                <button className="back-link" type="button" onClick={() => window.location.assign(websiteUrl)}>{pc.backWebsite}</button>
              </div>

              <button type="button" className="custom-cta custom-cta--footer-toolbar" onClick={openContactModal}>
                {pc.customCta}
              </button>
            </div>

            <div className="register-footer-center-cluster">
              <div className="register-footer-toolbar-mid">
                <button
                  type="button"
                  className="register-footer-pill"
                  aria-expanded={footerExpanded}
                  aria-controls="register-footer-details"
                  aria-label={footerExpanded ? pc.footerHideDetails : pc.footerShowDetails}
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
                    <span className="register-footer-total-label">{pc.footerEstTotal}</span>
                    <strong className="register-footer-total-value">{summary.totalPrimary}</strong>
                  </span>
                  <span className="register-footer-pill-chevron" aria-hidden>
                    <RegisterFooterChevron up={!footerExpanded} />
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
                    ? pc.continueAddons
                    : selection.plan === 'basic' && selection.billing === 'monthly'
                      ? pc.continueAccountBasic
                      : pc.continueWithPlan}
                </button>
              ) : (
                <button
                  className="continue-button continue-button-scroll-hint"
                  type="button"
                  onClick={revealPlanExtrasAndAllowContinue}
                  aria-label={pc.footerContinueScrollAria}
                >
                  <RegisterFooterChevron up={false} size={22} className="continue-button-scroll-chevron" />
                  <span className="continue-button-scroll-hint-text">{pc.addonsBelow}</span>
                </button>
              )}
            </div>
          </div>

          {footerExpanded ? (
            <div className="register-footer-expanded" id="register-footer-details">
              <div className="register-footer-peek">
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">{pc.footerPlanPeek}</span>
                  <strong className="register-footer-peek-name">{plansLoc[selection.plan].name}</strong>
                  <span className="register-footer-peek-value">{summary.rows[0]?.value ?? '—'}</span>
                </div>
                <div className="register-footer-peek-plus" aria-hidden>
                  +
                </div>
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">{pc.footerUsagePeek}</span>
                  <strong className="register-footer-peek-name">
                    {usageAddonLineCount}{' '}
                    {usageAddonLineCount === 1 ? pc.footerItemSingular : pc.footerItemPlural}
                  </strong>
                  <span className="register-footer-peek-value">{formatEuro(peekAddonMonthly)}{pm}</span>
                </div>
              </div>

              <div className="register-footer-detail-card">
                <h3 className="register-footer-detail-title">{pc.footerBreakdownTitle}</h3>
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
                      {annualSaveBadgeText(formatEuro(summary.annualSavingsYr), lang)}
                    </span>
                  ) : null}
                  <div className="register-footer-detail-total">
                    <span className="register-footer-detail-total-label">{pc.footerEstTotal}</span>
                    <strong className="register-footer-detail-total-value">{summary.totalPrimary}</strong>
                  </div>
                </div>
              </div>

              <button type="button" className="register-footer-hide-link" onClick={() => setFooterExpanded(false)}>
                {pc.footerHideDetails}
                <RegisterFooterChevron up />
              </button>
            </div>
          ) : null}
        </div>
      </footer>

      {contactOpen ? (
        <div className="register-contact-modal-root" role="presentation">
          <button type="button" className="register-contact-modal-backdrop" aria-label={pc.contactCloseBackdrop} onClick={closeContactModal} />
          <div
            className="register-contact-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-contact-title"
          >
            <h2 id="register-contact-title" className="register-contact-modal-title">{pc.contactTitle}</h2>
            <p className="register-contact-modal-intro">{pc.contactIntro}</p>
            <div className="register-contact-form stack gap-md">
              <Field label={pc.contactName}>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label={pc.contactEmail}>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label={pc.contactPhone} hint={pc.contactPhoneHint}>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} autoComplete="tel" />
              </Field>
              <Field label={pc.contactMessage}>
                <textarea rows={4} value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} placeholder={pc.contactPlaceholder} />
              </Field>
              {contactError ? <p className="register-contact-error" role="alert">{contactError}</p> : null}
            </div>
            <div className="register-contact-modal-actions">
              <button type="button" className="register-contact-cancel" onClick={closeContactModal}>
                {pc.contactCancel}
              </button>
              <button type="button" className="register-contact-submit" onClick={submitContactModal}>
                {pc.contactSubmit}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
