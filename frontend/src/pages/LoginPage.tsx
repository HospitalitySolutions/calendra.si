import { useEffect, useState } from 'react'
import axios from 'axios'
import { api } from '../api'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocale } from '../locale'
import loginLogo from '../assets/login-logo.png'

function localizeOauthErrorMessage(message: string, locale: 'en' | 'sl', t: (key: string) => string) {
  const normalized = message.trim()
  if (locale !== 'sl') return normalized

  if (normalized.toLowerCase() === 'no account exists for this email. please sign up first or contact your administrator.') {
    return t('loginOAuthNoAccountForEmail')
  }
  return normalized
}

export function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { locale, setLocale, t } = useLocale()
  const [email, setEmail] = useState('tenancy1@terminko.eu')
  const [password, setPassword] = useState('Admin123!')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oauthError = params.get('oauth_error')
    if (oauthError) {
      try {
        const decoded = decodeURIComponent(oauthError)
        const localizedMessage = localizeOauthErrorMessage(decoded, locale, t)
        setError(`${t('loginOAuthFailedPrefix')} ${localizedMessage}`)
      } catch {
        setError(t('loginOAuthFailedGeneric'))
      }
      return
    }

    if (params.get('error') != null) {
      setError(t('loginOAuthFailedGeneric'))
    }
  }, [location.search, locale, t])

  const submitLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    const emailVal = String(fd.get('email') ?? email).trim()
    const passwordVal = String(fd.get('password') ?? password)
    setSubmitting(true)
    try {
      const { data } = await api.post('/auth/login', { email: emailVal, password: passwordVal })
      sessionStorage.setItem('token', data.token)
      sessionStorage.setItem('user', JSON.stringify(data.user))
      window.location.reload()
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        const base = String(api.defaults.baseURL || '(missing)')
        const parts = [`No response from ${base}.`]
        if (base.includes('localhost')) parts.push('On Android, localhost is the phone, not your PC.')
        if (base.includes('127.0.0.1')) {
          parts.push(
            'On Android, 127.0.0.1 is the device itself unless you ran adb reverse tcp:4000 tcp:4000. Rebuild with http://10.0.2.2:4000/api (emulator) or your PC Wi‑Fi IP in .env.android (phone).',
          )
        }
        if (base.includes('10.0.2.2')) {
          parts.push(
            'Open http://10.0.2.2:4000/api/auth/ping in the emulator browser. If that fails: run Spring on the host (not only WSL), check firewall.',
          )
        } else if (!base.includes('127.0.0.1')) {
          parts.push('Fix: .env.android (phone) or .env.androidemu (emulator) → npm run build:android[:emu] → npx cap sync android → reinstall.')
        }
        setError(parts.join(' '))
      } else if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError(t('loginInvalidCredentials'))
      } else if (axios.isAxiosError(err) && err.code === 'ECONNABORTED') {
        setError('Request timed out. Is the API running on port 4000?')
      } else {
        setError(t('loginSignInFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const submitForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setForgotMessage('')
    setForgotSubmitting(true)
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail.trim() })
      setForgotMessage(t('forgotPasswordSentSuccess'))
    } catch {
      setForgotMessage(t('forgotPasswordSendError'))
    } finally {
      setForgotSubmitting(false)
    }
  }

  return (
    <div className="login-wrap login-bg">
      <>
        <div className="login-brand-above">
          <div className="login-modern-logo-mark" aria-hidden>
            <img src={loginLogo} alt="" />
          </div>
        </div>
        <form className="card login polished-login" onSubmit={submitLogin} style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}>
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
          <label className="login-modern-label" htmlFor="login-email">{t('loginEmailLabel')}</label>
          <input
            id="login-email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('loginEmailLabel')}
            type="email"
          />
          <label className="login-modern-label" htmlFor="login-password">{t('loginPasswordLabel')}</label>
          <div className="login-password-wrap">
            <input
              id="login-password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('loginPasswordLabel')}
              type={loginPasswordVisible ? 'text' : 'password'}
            />
            <button
              type="button"
              className="login-password-toggle"
              aria-label={t('loginShowPassword')}
              aria-pressed={loginPasswordVisible}
              onMouseEnter={() => setLoginPasswordVisible(true)}
              onMouseLeave={() => setLoginPasswordVisible(false)}
              onFocus={() => setLoginPasswordVisible(true)}
              onBlur={() => setLoginPasswordVisible(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {loginPasswordVisible ? (
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
          <button
            type="button"
            className="login-forgot-open"
            onClick={() => {
              setForgotEmail(email || '')
              setForgotMessage('')
              setShowForgotModal(true)
            }}
          >
            {t('loginForgotPassword')}
          </button>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={submitting} className="login-primary-btn">
            {submitting ? t('loginSubmitting') : t('loginSubmit')}
          </button>
          <div className="login-social-separator"><span>{t('loginOr')}</span></div>
          <button
            type="button"
            className="login-social-btn"
            onClick={() => {
              window.location.assign('/api/auth/google')
            }}
          >
            <span className="social-icon google" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.86 2.7-6.62Z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.72H.96v2.34A9 9 0 0 0 9 18Z" fill="#34A853"/>
                <path d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.6.1-1.2.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.34Z" fill="#FBBC05"/>
                <path d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A8.95 8.95 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.34C4.65 5.16 6.64 3.58 9 3.58Z" fill="#EA4335"/>
              </svg>
            </span>
            <span>{t('loginContinueGoogle')}</span>
          </button>
          <button
            type="button"
            className="login-social-btn"
            onClick={() => {
              window.location.assign('/api/auth/apple')
            }}
          >
            <span className="social-icon apple" aria-hidden>
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.47 8.52c.03 2.44 2.1 3.25 2.12 3.26-.02.06-.33 1.14-1.09 2.25-.65.96-1.33 1.91-2.39 1.93-1.05.02-1.39-.62-2.6-.62-1.2 0-1.58.6-2.58.64-1.02.04-1.8-1.03-2.46-1.99C1.16 11.97.1 8.31 1.45 5.98a3.77 3.77 0 0 1 3.2-1.92c1-.02 1.94.68 2.6.68.66 0 1.9-.84 3.2-.72.55.02 2.07.22 3.06 1.68-.08.05-1.82 1.06-1.8 2.82ZM9.95 2.32c.55-.67.92-1.6.82-2.52-.8.03-1.77.53-2.34 1.2-.51.6-.96 1.55-.84 2.46.9.07 1.81-.45 2.36-1.14Z" fill="currentColor"/>
              </svg>
            </span>
            <span>{t('loginContinueApple')}</span>
          </button>
          <div className="login-signup-row">
            <span className="muted">{t('loginNoAccount')}</span>
            <button type="button" className="linkish-btn login-register-link" onClick={() => navigate('/signup')}>
              {t('loginRegister')}
            </button>
          </div>
        </form>
      </>
      {showForgotModal && (
        <div className="modal-backdrop" onClick={() => setShowForgotModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{t('loginForgotPassword')}</h2>
            <p className="muted">{t('forgotPasswordModalHint')}</p>
            <form onSubmit={submitForgotPassword} className="login-forgot-form">
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder={t('loginEmailLabel')}
                required
              />
              {forgotMessage && <div className="success">{forgotMessage}</div>}
              <div className="form-actions" style={{ marginTop: 8 }}>
                <button type="button" className="secondary" onClick={() => setShowForgotModal(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" disabled={forgotSubmitting}>
                  {forgotSubmitting ? t('forgotPasswordSending') : t('forgotPasswordSendResetLink')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
