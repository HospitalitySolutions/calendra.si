import { useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'
import loginLogo from '../assets/login-logo.png'

const PACKAGES = [
  { key: 'basic', minUsers: 1, titleKey: 'signupPackageBasic', descriptionKey: 'signupPackageBasicDesc' },
  { key: 'professional', minUsers: 1, titleKey: 'signupPackageProfessional', descriptionKey: 'signupPackageProfessionalDesc' },
  { key: 'premium', minUsers: 1, titleKey: 'signupPackagePremium', descriptionKey: 'signupPackagePremiumDesc' },
  { key: 'enterprise', minUsers: 5, titleKey: 'signupPackageEnterprise', descriptionKey: 'signupPackageEnterpriseDesc' },
] as const

function formatSmsValue(value: number) {
  return new Intl.NumberFormat().format(value)
}

export function SignupPage() {
  const navigate = useNavigate()
  const { locale, setLocale, t } = useLocale()
  const [companyName, setCompanyName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [selectedPackage, setSelectedPackage] = useState<(typeof PACKAGES)[number]['key']>('professional')
  const [userCount, setUserCount] = useState(3)
  const [smsCount, setSmsCount] = useState(200)
  const [fiscalizationNeeded, setFiscalizationNeeded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const activePackage = useMemo(
    () => PACKAGES.find((pkg) => pkg.key === selectedPackage) ?? PACKAGES[0],
    [selectedPackage],
  )

  const handlePackageSelect = (packageKey: (typeof PACKAGES)[number]['key']) => {
    const nextPackage = PACKAGES.find((pkg) => pkg.key === packageKey)
    setSelectedPackage(packageKey)
    if (nextPackage && userCount < nextPackage.minUsers) {
      setUserCount(nextPackage.minUsers)
    }
  }

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
        packageName: activePackage.key,
        userCount,
        smsCount,
        fiscalizationNeeded,
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

  return (
    <div className="login-wrap login-bg signup-wrap">
      <div className="login-brand-above">
        <div className="login-modern-logo-mark" aria-hidden>
          <img src={loginLogo} alt="" />
        </div>
      </div>

      <form className="card login polished-login signup-card" onSubmit={submitSignup} style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}>
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

        <div className="signup-section">
          <div className="signup-section-title">{t('signupSectionCompany')}</div>
          <input name="companyName" autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('signupCompanyName')} type="text" required />
          <div className="signup-name-grid">
            <input name="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t('signupFirstName')} type="text" required />
            <input name="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t('signupLastName')} type="text" required />
          </div>
          <input name="signupEmail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('signupEmail')} type="email" required />
        </div>

        <div className="signup-section">
          <div className="signup-section-title">{t('signupSelectPackage')}</div>
          <div className="signup-package-grid">
            {PACKAGES.map((pkg) => {
              const selected = pkg.key === selectedPackage
              return (
                <button
                  key={pkg.key}
                  type="button"
                  className={selected ? 'signup-package-card selected' : 'signup-package-card'}
                  onClick={() => handlePackageSelect(pkg.key)}
                >
                  <span className="signup-package-title">{t(pkg.titleKey)}</span>
                  <span className="signup-package-description">{t(pkg.descriptionKey)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="signup-section">
          <div className="signup-slider-row">
            <div>
              <div className="signup-section-title">{t('signupUsers')}</div>
              <p className="muted signup-slider-help">{t('signupUsersHelp')}</p>
            </div>
            <div className="signup-slider-value">{userCount}</div>
          </div>
          <input
            className="signup-range"
            type="range"
            min={activePackage.minUsers}
            max={50}
            step={1}
            value={userCount}
            onChange={(e) => setUserCount(Number(e.target.value))}
          />

          <div className="signup-slider-row signup-slider-row-top">
            <div>
              <div className="signup-section-title">{t('signupSms')}</div>
              <p className="muted signup-slider-help">{t('signupSmsHelp')}</p>
            </div>
            <div className="signup-slider-value">{formatSmsValue(smsCount)}</div>
          </div>
          <input
            className="signup-range"
            type="range"
            min={0}
            max={5000}
            step={50}
            value={smsCount}
            onChange={(e) => setSmsCount(Number(e.target.value))}
          />
        </div>

        <div className="signup-fiscal-row">
          <div>
            <div className="signup-section-title">{t('signupFiscalization')}</div>
            <p className="muted signup-slider-help">{t('signupFiscalizationHelp')}</p>
          </div>
          <label className="signup-toggle">
            <input
              type="checkbox"
              checked={fiscalizationNeeded}
              onChange={(e) => setFiscalizationNeeded(e.target.checked)}
            />
            <span>{fiscalizationNeeded ? t('signupFiscalizationYes') : t('signupFiscalizationNo')}</span>
          </label>
        </div>

        <div className="signup-summary-card">
          <div className="signup-summary-title">{t('signupSummary')}</div>
          <div className="signup-summary-grid">
            <div>
              <span className="muted">{t('signupSelectPackage')}</span>
              <strong>{t(activePackage.titleKey)}</strong>
            </div>
            <div>
              <span className="muted">{t('signupUsers')}</span>
              <strong>{userCount}</strong>
            </div>
            <div>
              <span className="muted">{t('signupSms')}</span>
              <strong>{formatSmsValue(smsCount)}</strong>
            </div>
            <div>
              <span className="muted">{t('signupFiscalization')}</span>
              <strong>{fiscalizationNeeded ? t('signupFiscalizationYes') : t('signupFiscalizationNo')}</strong>
            </div>
          </div>
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
