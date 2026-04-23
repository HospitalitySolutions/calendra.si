import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'
import loginLogo from '../assets/login-logo.png'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { locale, setLocale, t } = useLocale()
  const initialEmail = useMemo(() => params.get('email')?.trim() ?? '', [params])
  const [email, setEmail] = useState(initialEmail)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<'request' | 'sent'>('request')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const sendResetEmail = async () => {
    const normalized = email.trim()
    if (!normalized) return
    setSubmitting(true)
    try {
      await api.post('/auth/forgot-password', { email: normalized })
      setStatus(t('forgotPasswordSentSuccess'))
      setError('')
      setStep('sent')
    } catch {
      setError(t('forgotPasswordSendError'))
    } finally {
      setSubmitting(false)
    }
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await sendResetEmail()
  }

  const openEmailApp = () => {
    const normalized = email.trim()
    if (!normalized) return
    window.location.href = `mailto:${encodeURIComponent(normalized)}`
  }

  return (
    <div className="login-wrap login-bg">
      <div className="login-brand-above">
        <div className="login-modern-logo-mark" aria-hidden>
          <img src={loginLogo} alt="" />
        </div>
      </div>
      <div className="card login polished-login auth-flow-card" style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}>
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

        {step === 'request' ? (
          <>
            <div className="auth-flow-heading">
              <h1 className="login-modern-title">{t('forgotPasswordTitle')}</h1>
              <p className="login-note auth-flow-note">{t('forgotPasswordModalHint')}</p>
            </div>
            <form onSubmit={submit} className="login-forgot-form">
              <label className="login-modern-label" htmlFor="forgot-password-email">{t('loginEmailLabel')}</label>
              <input
                id="forgot-password-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('loginEmailLabel')}
                autoComplete="email"
                required
              />
              {error && <div className="error">{error}</div>}
              <button type="submit" className="login-primary-btn" disabled={submitting}>
                {submitting ? t('forgotPasswordSending') : t('forgotPasswordSendResetLink')}
              </button>
              <div className="login-social-separator"><span>{t('loginOr')}</span></div>
              <button type="button" className="secondary auth-flow-back-btn" onClick={() => navigate('/login')}>
                {t('forgotPasswordBackToLogin')}
              </button>
            </form>
          </>
        ) : (
          <div className="auth-flow-success-state">
            <div className="auth-flow-mail-icon" aria-hidden>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
                <path d="m5 8 7 5 7-5" />
                <circle cx="18.2" cy="17.6" r="2.8" />
                <path d="m17.1 17.6 0.8 0.8 1.5-1.6" />
              </svg>
            </div>
            <div className="auth-flow-heading">
              <h1 className="login-modern-title">{t('forgotPasswordCheckEmailTitle')}</h1>
              <p className="login-note auth-flow-note">{t('forgotPasswordCheckEmailBody')}</p>
            </div>
            {status && <div className="success auth-flow-feedback">{status}</div>}
            <div className="auth-flow-email-pill">{email.trim()}</div>
            <div className="auth-flow-actions">
              <button type="button" className="login-primary-btn" onClick={openEmailApp}>
                {t('forgotPasswordOpenEmail')}
              </button>
              <div className="login-social-separator"><span>{t('loginOr')}</span></div>
              <button type="button" className="secondary" disabled={submitting} onClick={() => void sendResetEmail()}>
                {t('forgotPasswordResend')}
              </button>
              <button type="button" className="secondary auth-flow-back-btn" onClick={() => navigate('/login')}>
                {t('forgotPasswordBackToLogin')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
