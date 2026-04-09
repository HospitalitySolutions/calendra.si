import { useMemo, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'
import loginLogo from '../assets/login-logo.png'
import { getPackageLabel, normalizePackageType } from '../lib/packageAccess'

function resolveSignupContext(search: string) {
  const params = new URLSearchParams(search)
  const flow = params.get('flow')?.trim().toLowerCase()
  const requestedPackage = normalizePackageType(params.get('package'))

  if (flow === 'trial') {
    return {
      flow: 'trial' as const,
      packageType: 'TRIAL' as const,
    }
  }

  if (requestedPackage === 'BASIC' || requestedPackage === 'PROFESSIONAL' || requestedPackage === 'PREMIUM') {
    return {
      flow: 'register' as const,
      packageType: requestedPackage,
    }
  }

  return {
    flow: 'register' as const,
    packageType: 'PROFESSIONAL' as const,
  }
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

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
        packageName: signupContext.packageType,
      })

      if (data?.token && data?.user) {
        sessionStorage.setItem('token', data.token)
        sessionStorage.setItem('user', JSON.stringify(data.user))
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

  const packageLabel = getPackageLabel(signupContext.packageType, locale)

  return (
    <div className="login-wrap login-bg signup-wrap">
      <div className="login-brand-above">
        <div className="login-modern-logo-mark" aria-hidden>
          <img src={loginLogo} alt="" />
        </div>
      </div>

      <form className="card login polished-login signup-card signup-card--compact" onSubmit={submitSignup} style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}>
        <div className="login-modern-header">
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

        <div>
          <p className="eyebrow">{t('signupTitle')}</p>
          <h1 style={{ marginTop: 4 }}>{t('signupFormTitle')}</h1>
          <p className="muted">{t('signupSubtitle')}</p>
        </div>

        <div className="signup-info-card">
          <div>
            <span className="muted">{t('signupSelectedPackage')}</span>
            <strong>{packageLabel}</strong>
          </div>
          {signupContext.flow === 'trial' && (
            <div className="signup-trial-note">{t('signupTrialNote')}</div>
          )}
        </div>

        <div className="signup-section">
          <input name="companyName" autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('signupCompanyName')} type="text" required />
          <div className="signup-name-grid">
            <input name="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t('signupFirstName')} type="text" required />
            <input name="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t('signupLastName')} type="text" required />
          </div>
          <input name="signupEmail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('signupEmail')} type="email" required />
          <input name="phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('signupPhoneOptional')} type="tel" />
        </div>

        {error && <div className="error">{error}</div>}
        {successMessage && <div className="success">{successMessage}</div>}

        <button type="submit" disabled={submitting} className="login-primary-btn">
          {submitting ? t('signupSubmitting') : t('signupSubmit')}
        </button>

        <div className="form-actions full-span" style={{ marginTop: 8 }}>
          <button type="button" className="secondary" onClick={() => navigate('/login')}>
            {t('signupBack')}
          </button>
        </div>
      </form>
    </div>
  )
}
