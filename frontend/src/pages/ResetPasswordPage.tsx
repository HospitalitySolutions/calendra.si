import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import loginLogo from '../assets/login-logo.png'
import { useLocale } from '../locale'
import { getPasswordRuleChecks, passwordMeetsRequirements } from '../lib/passwordRules'

function PasswordVisibilityButton({
  visible,
  onToggle,
  label,
}: {
  visible: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      className="login-password-toggle"
      aria-label={label}
      aria-pressed={visible}
      onClick={onToggle}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {visible ? (
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
  )
}

export function ResetPasswordPage() {
  const { locale, setLocale, t } = useLocale()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')?.trim() ?? ''
  const initialEmail = useMemo(() => params.get('email')?.trim().toLowerCase() ?? '', [params])
  const [email, setEmail] = useState(initialEmail)
  const [validating, setValidating] = useState(true)
  const [valid, setValid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const passwordRules = useMemo(() => getPasswordRuleChecks(password), [password])

  useEffect(() => {
    if (!token) {
      setValidating(false)
      setValid(false)
      setError(t('resetPasswordMissingToken'))
      return
    }
    api.get<{ valid?: boolean; email?: string }>('/auth/reset-password/validate', { params: { token } })
      .then(({ data }) => {
        setValid(Boolean(data?.valid))
        setError('')
        const resolvedEmail = String(data?.email || initialEmail).trim().toLowerCase()
        if (resolvedEmail) setEmail(resolvedEmail)
      })
      .catch(() => {
        setValid(false)
        setError(t('resetPasswordInvalidLink'))
      })
      .finally(() => setValidating(false))
  }, [initialEmail, t, token])

  const goToLogin = () => {
    const q = new URLSearchParams()
    q.set('reset', 'success')
    if (email.trim()) q.set('email', email.trim())
    navigate(`/login?${q.toString()}`, { replace: true })
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!passwordMeetsRequirements(password)) {
      setError(t('resetPasswordWeakPassword'))
      return
    }
    if (password !== confirm) {
      setError(t('resetPasswordMismatch'))
      return
    }
    setSubmitting(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setSuccess(true)
    } catch (err: any) {
      setError(err?.response?.data?.message || t('resetPasswordFailedGeneric'))
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
            <button type="button" className={locale === 'sl' ? 'login-lang-btn active' : 'login-lang-btn'} onClick={() => setLocale('sl')}>
              SL
            </button>
            <button type="button" className={locale === 'en' ? 'login-lang-btn active' : 'login-lang-btn'} onClick={() => setLocale('en')}>
              EN
            </button>
          </div>
        </div>

        {validating ? (
          <p className="login-note auth-flow-note">{t('resetPasswordValidating')}</p>
        ) : success ? (
          <div className="auth-flow-success-state">
            <div className="auth-flow-success-icon" aria-hidden>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m8 12.5 2.6 2.6L16.5 9" />
              </svg>
            </div>
            <div className="auth-flow-heading">
              <h1 className="login-modern-title">{t('resetPasswordSuccessTitle')}</h1>
              <p className="login-note auth-flow-note">{t('resetPasswordSuccessBody')}</p>
            </div>
            <button type="button" className="login-primary-btn" onClick={goToLogin}>
              {t('resetPasswordContinueLogin')}
            </button>
            <div className="login-social-separator"><span>{t('loginOr')}</span></div>
            <button type="button" className="secondary auth-flow-back-btn" onClick={() => navigate('/login')}>
              {t('resetPasswordBackToLogin')}
            </button>
          </div>
        ) : !valid ? (
          <div className="auth-flow-invalid-state">
            <div className="auth-flow-heading">
              <h1 className="login-modern-title">{t('resetPasswordTitle')}</h1>
              <p className="login-note auth-flow-note">{error || t('resetPasswordInvalidLink')}</p>
            </div>
            <button type="button" className="secondary auth-flow-back-btn" onClick={() => navigate('/login')}>
              {t('resetPasswordBackToLogin')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="login-forgot-form">
            <div className="auth-flow-heading">
              <h1 className="login-modern-title">{t('resetPasswordTitle')}</h1>
              <p className="login-note auth-flow-note">{t('resetPasswordIntro')}</p>
            </div>

            <label className="login-modern-label" htmlFor="reset-password-new">{t('resetPasswordNewPlaceholder')}</label>
            <div className="login-password-wrap">
              <input
                id="reset-password-new"
                type={passwordVisible ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('resetPasswordNewPlaceholder')}
                autoComplete="new-password"
                required
              />
              <PasswordVisibilityButton
                visible={passwordVisible}
                onToggle={() => setPasswordVisible((v) => !v)}
                label={passwordVisible ? t('loginHidePassword') : t('loginShowPassword')}
              />
            </div>

            <label className="login-modern-label" htmlFor="reset-password-confirm">{t('resetPasswordConfirmPlaceholder')}</label>
            <div className="login-password-wrap">
              <input
                id="reset-password-confirm"
                type={confirmVisible ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t('resetPasswordConfirmPlaceholder')}
                autoComplete="new-password"
                required
              />
              <PasswordVisibilityButton
                visible={confirmVisible}
                onToggle={() => setConfirmVisible((v) => !v)}
                label={confirmVisible ? t('loginHidePassword') : t('loginShowPassword')}
              />
            </div>

            <div className="auth-flow-min-hint">{t('resetPasswordMinLength')}</div>
            <ul className="password-rule-list" aria-label={t('resetPasswordRequirementsTitle')}>
              <li className={passwordRules.minLength ? 'met' : ''}>{t('resetPasswordRuleMinLength')}</li>
              <li className={passwordRules.hasNumber ? 'met' : ''}>{t('resetPasswordRuleNumber')}</li>
              <li className={passwordRules.hasUppercase ? 'met' : ''}>{t('resetPasswordRuleUppercase')}</li>
              <li className={passwordRules.hasLowercase ? 'met' : ''}>{t('resetPasswordRuleLowercase')}</li>
            </ul>

            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={submitting} className="login-primary-btn">
              {submitting ? t('resetPasswordSaving') : t('resetPasswordSubmit')}
            </button>
            <div className="login-social-separator"><span>{t('loginOr')}</span></div>
            <button type="button" className="secondary auth-flow-back-btn" onClick={() => navigate('/login')}>
              {t('resetPasswordBackToLogin')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
