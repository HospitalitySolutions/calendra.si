import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import loginLogo from '../assets/login-logo.png'
import { useToast } from '../components/Toast'
import { Field } from '../components/ui'
import { useLocale } from '../locale'
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
  buildSummary,
  formatEuro,
  getSelectionMonthlyAmounts,
  plans,
} from './RegisterPage'

export function RegisterPlanAddonsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, setLocale } = useLocale()
  const { showToast } = useToast()
  const [selection, setSelection] = useState<RegisterSelection>(() => parseRegisterSelection(location.search))
  const [footerExpanded, setFooterExpanded] = useState(false)
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
          <h1 className="register-sr-only">Calendra — usage and feature add-ons</h1>
          <div className="register-addons-page">
            <button
              type="button"
              className="back-link register-addons-back"
              onClick={() => navigate(`/register?${selectionToSearch(selection)}`)}
            >
              ← Back to plan
            </button>
            <RegisterPlanAddonSections
              selection={selection}
              setSelection={setSelection}
              featureAddonsSectionRef={featureAddonsSectionRef}
              featureAddonsEndRef={featureAddonsEndRef}
              addonsModalPresentation
            />
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
              <button
                className="continue-button"
                type="button"
                onClick={onFooterPrimaryClick}
                aria-label={
                  featureAddonsFullySeen
                    ? undefined
                    : 'Scroll to feature add-ons to review options before continuing'
                }
              >
                {!featureAddonsFullySeen
                  ? 'To Feature Add-ons'
                  : selection.plan === 'basic' && selection.billing === 'monthly'
                    ? 'Continue to account creation'
                    : 'Continue with selected plan'}
              </button>
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
                  <span className="register-footer-peek-label">Usage & add-ons</span>
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
