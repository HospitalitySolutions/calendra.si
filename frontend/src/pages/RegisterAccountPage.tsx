import { useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'
import loginLogo from '../assets/login-logo.png'
import { getPackageLabel } from '../lib/packageAccess'
import { storeAuthenticatedSession } from '../lib/session'
import { getBillingInterval, getEstimatedUserCount, parseRegisterSelection, selectionToSearch } from './registerFlow'

export function RegisterAccountPage() {
  const navigate = useNavigate()
  const { locale, setLocale, t } = useLocale()
  const selection = useMemo(() => parseRegisterSelection(window.location.search), [])
  const [companyName, setCompanyName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const packageName = selection.plan === 'basic' ? 'BASIC' : selection.plan === 'pro' ? 'PROFESSIONAL' : 'PREMIUM'
  const packageLabel = getPackageLabel(packageName, locale)
  const billingLabel = selection.billing === 'annual' ? 'Annual' : 'Monthly'
  const selectedAddons = [
    selection.addons.voice ? 'AI voice booking' : null,
    selection.addons.billing ? 'Billing & invoices' : null,
    selection.addons.whitelabel ? 'Branded booking experience' : null,
  ].filter(Boolean) as string[]

  const submitSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setSubmitting(true)
    try {
      const { data } = await api.post('/auth/signup', {
        companyName: companyName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        packageName,
        userCount: getEstimatedUserCount(selection),
        smsCount: selection.additionalSms,
        billingInterval: getBillingInterval(selection),
        fiscalizationNeeded: false,
      })

      if (data?.token && data?.user) {
        storeAuthenticatedSession(data)
        window.location.reload()
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
            <p className="eyebrow">Create your account</p>
            <h1 className="signup-title">Account setup</h1>
            <p className="muted signup-subtitle">Your plan selection is saved. Enter your account details to continue.</p>
          </div>
          <div className="signup-package-pill">{packageLabel}</div>
        </div>

        <div className="signup-info-card signup-info-card--modern">
          <div className="signup-info-row">
            <div>
              <span className="signup-info-label">Selected plan</span>
              <strong>{packageLabel}</strong>
            </div>
            <div>
              <span className="signup-info-label">Billing</span>
              <strong>{billingLabel}</strong>
            </div>
          </div>
          <div className="signup-info-row">
            <div>
              <span className="signup-info-label">Estimated users</span>
              <strong>{getEstimatedUserCount(selection)}</strong>
            </div>
            <div>
              <span className="signup-info-label">Additional SMS</span>
              <strong>{selection.additionalSms}</strong>
            </div>
          </div>
          {selectedAddons.length > 0 && (
            <div className="signup-trial-note">Add-ons: {selectedAddons.join(', ')}</div>
          )}
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
        </div>

        {error && <div className="error">{error}</div>}
        {successMessage && <div className="success">{successMessage}</div>}

        <button type="submit" disabled={submitting} className="login-primary-btn signup-submit-btn">
          {submitting ? t('signupSubmitting') : t('signupSubmit')}
        </button>

        <div className="form-actions full-span signup-actions-row">
          <button type="button" className="secondary signup-back-btn" onClick={() => navigate(`/register?${selectionToSearch(selection)}`)}>
            Back to plan selection
          </button>
        </div>
      </form>
    </div>
  )
}
