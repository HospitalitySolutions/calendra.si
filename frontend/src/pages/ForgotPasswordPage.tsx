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
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage('')
    setSubmitting(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSuccess(true)
      setMessage(t('forgotPasswordSentSuccess'))
    } catch {
      setSuccess(false)
      setMessage(t('forgotPasswordSendError'))
    } finally {
      setSubmitting(false)
    }
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

        {!success ? (
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
              {message && <div className="error">{message}</div>}
              <button type="submit" className="login-primary-btn" disabled={submitting}>
                {submitting ? t('forgotPasswordSending') : t('forgotPasswordSendResetLink')}
              </button>
              <button type="button" className="secondary auth-flow-back-btn" onClick={() => navigate('/login')}>
                {t('forgotPasswordBackToLogin')}
              </button>
            </form>
          </>
        ) : (
          <div className="auth-flow-success-state">
            <div className="auth-flow-heading">
              <h1 className="login-modern-title">{t('forgotPasswordCheckEmailTitle')}</h1>
              <p className="login-note auth-flow-note">{t('forgotPasswordCheckEmailBody')}</p>
            </div>
            {message && <div className="success auth-flow-feedback">{message}</div>}
            <div className="auth-flow-email-pill">{email.trim()}</div>
            <div className="auth-flow-actions">
              <button type="button" className="login-primary-btn" onClick={() => navigate('/login')}>
                {t('forgotPasswordBackToLogin')}
              </button>
              <button type="button" className="secondary" onClick={() => { setSuccess(false); setMessage('') }}>
                {t('forgotPasswordResend')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
