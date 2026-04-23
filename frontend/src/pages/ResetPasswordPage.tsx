import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import loginLogo from '../assets/login-logo.png'
import { useLocale } from '../locale'

/** Legacy route: reset links open RegisterConfirmEmailPage at `/confirm-email`. */
export function ResetPasswordPage() {
  const { locale, setLocale, t } = useLocale()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  useEffect(() => {
    if (!token) return
    const emailParam = params.get('email')?.trim()
    const q = new URLSearchParams()
    q.set('token', token)
    if (emailParam) q.set('email', emailParam)
    navigate(`/confirm-email?${q.toString()}`, { replace: true })
  }, [navigate, params, token])

  if (!token) {
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
              <button type="button" className={locale === 'sl' ? 'login-lang-btn active' : 'login-lang-btn'} onClick={() => setLocale('sl')}>
                SL
              </button>
              <button type="button" className={locale === 'en' ? 'login-lang-btn active' : 'login-lang-btn'} onClick={() => setLocale('en')}>
                EN
              </button>
            </div>
          </div>
          <p className="error">{t('resetPasswordMissingToken')}</p>
          <button type="button" className="secondary auth-flow-back-btn" onClick={() => navigate('/login')}>
            {t('resetPasswordBackToLogin')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap login-bg">
      <div className="login-brand-above">
        <div className="login-modern-logo-mark" aria-hidden>
          <img src={loginLogo} alt="" />
        </div>
      </div>
      <div className="card login polished-login auth-flow-card" style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}>
        <p className="login-note auth-flow-note">{t('resetPasswordValidating')}</p>
      </div>
    </div>
  )
}
