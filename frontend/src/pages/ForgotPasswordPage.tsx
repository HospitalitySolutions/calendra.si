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

  return (
    <div className="login-wrap login-bg">
      <div className="login-brand-above login-brand-above--desktop">
        <div className="login-modern-logo-mark" aria-hidden>
          <img src={loginLogo} alt="" />
        </div>
      </div>
      <div
        className="card login polished-login polished-login--modern auth-flow-card forgot-password-card"
        style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}
      >
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

        {step === 'request' ? (
          <div className="forgot-password-request-body">
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
          </div>
        ) : (
          <div className="auth-flow-success-state">
            <div className="auth-flow-mail-icon" aria-hidden>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 8.5A2 2 0 0 1 6 6.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Z"
                  fill="#ffffff"
                  stroke="rgba(37, 99, 235, 0.22)"
                  strokeWidth="1.15"
                  strokeLinejoin="round"
                />
                <path
                  d="m5 9 7 4.5 7-4.5"
                  fill="none"
                  stroke="rgba(37, 99, 235, 0.18)"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                />
                <circle cx="17.25" cy="16.75" r="4.25" fill="var(--color-primary)" />
                <path
                  d="M14.55 16.75 16.35 18.55 19.95 13.95"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.35"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="auth-flow-heading">
              <h1 className="login-modern-title">{t('forgotPasswordCheckEmailTitle')}</h1>
            </div>
            {status && <div className="success auth-flow-feedback">{status}</div>}
            <div className="auth-flow-actions">
              <button type="button" className="login-primary-btn" disabled={submitting} onClick={() => void sendResetEmail()}>
                {submitting ? t('forgotPasswordSending') : t('forgotPasswordResend')}
              </button>
              <div className="login-social-separator"><span>{t('loginOr')}</span></div>
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
