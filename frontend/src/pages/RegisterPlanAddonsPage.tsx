import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  type RegisterSelection,
} from './registerFlow'
import {
  RegisterFooterChevron,
  RegisterFooterListIcon,
  RegisterPlanAddonSections,
} from './RegisterPage'
import {
  annualSaveBadgeText,
  buildRegisterFooterPill,
  buildSummary,
  formatEuro,
  getRegisterPlanPageCopy,
  getSelectionMonthlyAmounts,
  plansForLocale,
  type RegisterLocale,
} from './registerPlanCopy'

export function RegisterPlanAddonsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, setLocale, t } = useLocale()
  const lang: RegisterLocale = locale === 'sl' ? 'sl' : 'en'
  const pc = useMemo(() => getRegisterPlanPageCopy(lang), [lang])
  const plansLoc = useMemo(() => plansForLocale(lang), [lang])
  const pm = lang === 'sl' ? '/mes.' : '/mo'
  const { showToast } = useToast()
  const [selection, setSelection] = useState<RegisterSelection>(() => parseRegisterSelection(location.search))
  const [footerExpanded, setFooterExpanded] = useState(false)
  const registerFooterRef = useRef<HTMLElement | null>(null)
  useRegisterFooterClickOutside(registerFooterRef, footerExpanded, setFooterExpanded)
  const [contactOpen, setContactOpen] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactError, setContactError] = useState('')
  const featureAddonsSectionRef = useRef<HTMLElement | null>(null)
  const featureAddonsEndRef = useRef<HTMLDivElement | null>(null)
  const [featureAddonsFullySeen, setFeatureAddonsFullySeen] = useState(false)

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    setFeatureAddonsFullySeen(false)
  }, [location.key])

  useEffect(() => {
    void ensureRegisterCatalogLoaded()
  }, [])

  useEffect(() => {
    const sentinel = featureAddonsEndRef.current
    if (!sentinel || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting)
        if (hit) setFeatureAddonsFullySeen(true)
      },
      {
        root: null,
        rootMargin: '0px 0px -110px 0px',
        threshold: 0,
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [location.key])

  useEffect(() => {
    const parsed = parseRegisterSelection(location.search)
    setSelection((prev) => (selectionToSearch(prev) === selectionToSearch(parsed) ? prev : parsed))
  }, [location.search])

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

  const continueToAccount = useCallback(() => {
    navigate(`/register/account?${selectionToSearch(selection)}`)
  }, [navigate, selection])

  const scrollToFeatureAddons = useCallback(() => {
    featureAddonsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const onFooterPrimaryClick = useCallback(() => {
    if (!featureAddonsFullySeen) {
      scrollToFeatureAddons()
      return
    }
    continueToAccount()
  }, [continueToAccount, featureAddonsFullySeen, scrollToFeatureAddons])

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
          <h1 className="register-sr-only">{pc.srOnlyAddonsTitle}</h1>
          <div className="register-addons-page">
            <button
              type="button"
              className="back-link register-addons-back"
              onClick={() => navigate(`/register?${selectionToSearch(selection)}`)}
            >
              {pc.addonsBackToPlan}
            </button>
            <RegisterPlanAddonSections
              selection={selection}
              setSelection={setSelection}
              pageCopy={pc}
              locale={lang}
              featureAddonsSectionRef={featureAddonsSectionRef}
              featureAddonsEndRef={featureAddonsEndRef}
              addonsModalPresentation
            />
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
              <button
                className="continue-button"
                type="button"
                onClick={onFooterPrimaryClick}
                aria-label={featureAddonsFullySeen ? undefined : pc.footerContinueScrollAria}
              >
                {!featureAddonsFullySeen
                  ? pc.continueToAddons
                  : selection.plan === 'basic' && selection.billing === 'monthly'
                    ? pc.continueAccountBasic
                    : pc.continueWithPlan}
              </button>
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
