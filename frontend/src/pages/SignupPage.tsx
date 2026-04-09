import { useMemo, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'
import loginLogo from '../assets/login-logo.png'
import { getDefaultAllowedRoute, getPackageLabel, normalizePackageType } from '../lib/packageAccess'
import { storeAuthenticatedSession } from '../lib/session'

type PricingSummary = {
  totalUsers: number
  additionalSms: number
  fiscalCashRegister: boolean
  websiteCreation: boolean
  businessPremises: boolean
  monthlyTotal: number
  oneTimeTotal: number
  firstInvoiceEstimate: number
}

type SignupContext = {
  flow: 'trial' | 'register'
  packageType: 'TRIAL' | 'BASIC' | 'PROFESSIONAL' | 'PREMIUM'
  summary: PricingSummary | null
}

function coerceNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parsePricingSummary(rawValue: string | null): PricingSummary | null {
  if (!rawValue) return null
  try {
    const parsed = JSON.parse(rawValue) as Partial<PricingSummary>
    return {
      totalUsers: Math.max(1, Math.round(coerceNumber(parsed.totalUsers, 1))),
      additionalSms: Math.max(0, Math.round(coerceNumber(parsed.additionalSms, 0))),
      fiscalCashRegister: Boolean(parsed.fiscalCashRegister),
      websiteCreation: Boolean(parsed.websiteCreation),
      businessPremises: Boolean(parsed.businessPremises),
      monthlyTotal: Math.max(0, coerceNumber(parsed.monthlyTotal, 0)),
      oneTimeTotal: Math.max(0, coerceNumber(parsed.oneTimeTotal, 0)),
      firstInvoiceEstimate: Math.max(0, coerceNumber(parsed.firstInvoiceEstimate, 0)),
    }
  } catch {
    return null
  }
}

function resolveSignupContext(search: string): SignupContext {
  const params = new URLSearchParams(search)
  const flow = params.get('flow')?.trim().toLowerCase()
  const requestedPackage = normalizePackageType(params.get('package'))
  const summary = parsePricingSummary(params.get('summary'))

  if (flow === 'trial') {
    return {
      flow: 'trial',
      packageType: 'TRIAL',
      summary: null,
    }
  }

  if (requestedPackage === 'BASIC' || requestedPackage === 'PROFESSIONAL' || requestedPackage === 'PREMIUM') {
    return {
      flow: 'register',
      packageType: requestedPackage,
      summary,
    }
  }

  return {
    flow: 'register',
    packageType: 'PROFESSIONAL',
    summary,
  }
}

function validateSignupPassword(password: string, t: (key: string) => string) {
  if (password.length < 8) return t('resetPasswordMinLength')
  if (!/[0-9]/.test(password)) return t('resetPasswordRuleNumber')
  if (!/[A-Z]/.test(password)) return t('resetPasswordRuleUppercase')
  if (!/[a-z]/.test(password)) return t('resetPasswordRuleLowercase')
  return ''
}

export function SignupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, setLocale, t } = useLocale()
  const signupContext = useMemo(() => resolveSignupContext(location.search), [location.search])
  const [companyName, setCompanyName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const packageLabel = getPackageLabel(signupContext.packageType, locale)
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'sl' ? 'sl-SI' : 'en-US', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  )

  const summaryItems = useMemo(() => {
    const summary = signupContext.summary
    if (!summary) return []

    const items: string[] = []
    if (summary.totalUsers > 1) items.push(`${t('signupUsers')}: ${summary.totalUsers}`)
    if (summary.additionalSms > 0) items.push(`${t('signupSms')}: ${summary.additionalSms}`)
    if (summary.fiscalCashRegister) items.push(t('signupOptionFiscalCashRegister'))
    if (summary.websiteCreation) items.push(t('signupOptionWebsiteCreation'))
    if (summary.businessPremises) items.push(t('signupOptionBusinessPremises'))
    return items
  }, [signupContext.summary, t])

  const accessItems = useMemo(() => {
    const items = [t('signupAccessCalendar'), t('signupAccessClients'), t('signupAccessAnalytics')]
    if (signupContext.packageType === 'PROFESSIONAL' || signupContext.packageType === 'PREMIUM') {
      items.push(t('signupAccessBilling'))
    }
    if (signupContext.packageType === 'PREMIUM') {
      items.push(t('signupAccessInbox'))
    }
    return items
  }, [signupContext.packageType, t])

  const passwordChecks = useMemo(
    () => [
      { label: t('resetPasswordRuleMinLength'), met: password.length >= 8 },
      { label: t('resetPasswordRuleNumber'), met: /[0-9]/.test(password) },
      { label: t('resetPasswordRuleUppercase'), met: /[A-Z]/.test(password) },
      { label: t('resetPasswordRuleLowercase'), met: /[a-z]/.test(password) },
    ],
    [password, t],
  )

  const submitSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')

    const passwordValidationMessage = validateSignupPassword(password, t)
    if (passwordValidationMessage) {
      setError(passwordValidationMessage)
      return
    }

    setSubmitting(true)
    try {
      const summary = signupContext.summary
      const { data } = await api.post('/auth/signup', {
        companyName: companyName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        password,
        packageName: signupContext.packageType,
        locale,
        userCount: summary?.totalUsers ?? null,
        smsCount: summary?.additionalSms ?? null,
        fiscalizationNeeded: summary?.fiscalCashRegister ?? null,
        pricingSummary: summary,
      })

      if (data?.token && data?.user) {
        storeAuthenticatedSession(data)
        navigate(getDefaultAllowedRoute(data?.user?.packageType || signupContext.packageType), { replace: true })
        return
      }

      setSuccessMessage(t('signupSuccess'))
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || t('signupFailed'))
      } else {
        setError(t('signupFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-wrap login-bg signup-wrap">
      <div className="login-brand-above login-brand-above--desktop">
        <div className="login-modern-logo-mark" aria-hidden>
          <img src={loginLogo} alt="" />
        </div>
      </div>

      <form className="card login polished-login polished-login--modern signup-card signup-card--compact signup-card--modern" onSubmit={submitSignup} style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}>
        <div className="auth-card-topbar">
          <div className="login-brand-inline" aria-hidden>
            <div className="login-modern-logo-mark">
              <img src={loginLogo} alt="" />
            </div>
          </div>
          <div className="login-lang-switch" role="group" aria-label={t('language')}>
            <button
              type="button"
              className={locale === 'sl' ? 'login-lang-btn active' : 'login-lang-btn'}
              onClick={() => setLocale('sl')}
            >
              SL
            </button>
            <button
              type="button"
              className={locale === 'en' ? 'login-lang-btn active' : 'login-lang-btn'}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
        </div>

        <div className="signup-hero">
          <div className="signup-hero-copy">
            <p className="eyebrow">{t('signupTitle')}</p>
            <h1 className="signup-title">{t('signupFormTitle')}</h1>
            <p className="muted signup-subtitle">{t('signupSubtitle')}</p>
          </div>
          <div className="signup-package-pill">{packageLabel}</div>
        </div>

        {signupContext.flow === 'register' && signupContext.summary ? (
          <div className="signup-info-card signup-info-card--modern signup-summary-surface">
            <div className="signup-summary-head">
              <div>
                <span className="signup-info-label">{t('signupSummary')}</span>
                <strong>{packageLabel}</strong>
              </div>
            </div>

            <div className="signup-summary-chip-row">
              {summaryItems.length > 0 ? (
                summaryItems.map((item) => (
                  <span key={item} className="signup-summary-chip">{item}</span>
                ))
              ) : (
                <span className="muted">{t('signupSummaryNoExtras')}</span>
              )}
            </div>

            <div className="signup-summary-totals">
              <div>
                <span className="signup-info-label">{t('signupSummaryMonthly')}</span>
                <strong>{currencyFormatter.format(signupContext.summary.monthlyTotal)}</strong>
              </div>
              <div>
                <span className="signup-info-label">{t('signupSummaryOneTime')}</span>
                <strong>{currencyFormatter.format(signupContext.summary.oneTimeTotal)}</strong>
              </div>
              <div>
                <span className="signup-info-label">{t('signupSummaryFirstInvoice')}</span>
                <strong className="signup-summary-total-highlight">{currencyFormatter.format(signupContext.summary.firstInvoiceEstimate)}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="signup-info-card signup-info-card--modern signup-trial-surface">
            <div className="signup-info-row">
              <div>
                <span className="signup-info-label">{t('signupSelectedPackage')}</span>
                <strong>{packageLabel}</strong>
              </div>
              {signupContext.flow === 'trial' && <span className="signup-trial-badge">7 days</span>}
            </div>
            {signupContext.flow === 'trial' && (
              <div className="signup-trial-note signup-trial-note--prominent">{t('signupTrialNote')}</div>
            )}
          </div>
        )}

        <div className="signup-access-card">
          <span className="signup-info-label">{t('signupAccessTitle')}</span>
          <div className="signup-summary-chip-row signup-summary-chip-row--access">
            {accessItems.map((item) => (
              <span key={item} className="signup-summary-chip signup-summary-chip--soft">{item}</span>
            ))}
          </div>
        </div>

        <div className="signup-form-panel">
          <div className="signup-field-stack">
            <label htmlFor="signup-company-name">{t('signupCompanyName')}</label>
            <input
              id="signup-company-name"
              name="companyName"
              autoComplete="organization"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t('signupCompanyName')}
              type="text"
              required
            />
          </div>

          <div className="signup-field-grid signup-name-grid">
            <div className="signup-field-stack">
              <label htmlFor="signup-first-name">{t('signupFirstName')}</label>
              <input
                id="signup-first-name"
                name="firstName"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t('signupFirstName')}
                type="text"
                required
              />
            </div>
            <div className="signup-field-stack">
              <label htmlFor="signup-last-name">{t('signupLastName')}</label>
              <input
                id="signup-last-name"
                name="lastName"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('signupLastName')}
                type="text"
                required
              />
            </div>
          </div>

          <div className="signup-field-stack">
            <label htmlFor="signup-email">{t('signupEmail')}</label>
            <input
              id="signup-email"
              name="signupEmail"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('signupEmail')}
              type="email"
              required
            />
          </div>

          <div className="signup-field-stack">
            <label htmlFor="signup-phone">{t('signupPhoneOptional')}</label>
            <input
              id="signup-phone"
              name="phone"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('signupPhoneOptional')}
              type="tel"
            />
          </div>

          <div className="signup-field-stack">
            <label htmlFor="signup-password">{t('signupPassword')}</label>
            <div className="login-password-wrap signup-password-wrap">
              <input
                id="signup-password"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('signupPassword')}
                type={passwordVisible ? 'text' : 'password'}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={passwordVisible ? t('loginHidePassword') : t('loginShowPassword')}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((current) => !current)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {passwordVisible ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            <ul className="password-rule-list" aria-label={t('resetPasswordRequirementsTitle')}>
              {passwordChecks.map((rule) => (
                <li key={rule.label} className={rule.met ? 'met' : ''}>{rule.label}</li>
              ))}
            </ul>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {successMessage && <div className="success">{successMessage}</div>}

        <button type="submit" disabled={submitting} className="login-primary-btn signup-submit-btn">
          {submitting ? t('signupSubmitting') : t('signupSubmit')}
        </button>

        <div className="form-actions full-span signup-actions-row">
          <button type="button" className="secondary signup-back-btn" onClick={() => navigate('/login')}>
            {t('signupBack')}
          </button>
        </div>
      </form>
    </div>
  )
}
