import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ArrowRightIcon, EyeIcon, EyeOffIcon, GlobeIcon, LockIcon, MailIcon } from '../components/Icons'
import { Spinner } from '../components/Loading'
import { returnToCustomerPage } from '../auth/returnTo'
import { AUTH_LOCALE_OPTIONS, authCopy, getLocaleOption, type AuthLocale, useAuthLocale } from '../auth/authLocale'

export function LoginPage() {
  const { isAuthenticated, setSession } = useAuth()
  const { locale, setLocale } = useAuthLocale()
  const t = authCopy[locale]
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const next = searchParams.get('next')
  const nextSuffix = next ? `?next=${encodeURIComponent(next)}` : ''

  useEffect(() => {
    if (isAuthenticated) returnToCustomerPage(next)
  }, [isAuthenticated, next])

  if (isAuthenticated) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const session = await customerApi.login(email.trim(), password)
      setSession(session)
      returnToCustomerPage(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.loginError)
    } finally {
      setLoading(false)
    }
  }

  return <AuthLayout locale={locale} onLocaleChange={setLocale} title={t.loginTitle} subtitle={t.loginSubtitle}>
    <form className="auth-form" onSubmit={submit}>
      {error && <div className="form-alert form-alert--error">{error}</div>}
      <label>{t.emailLabel}
        <span className="auth-input-wrap"><MailIcon size={18}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder={t.emailPlaceholder}/></span>
      </label>
      <label>{t.passwordLabel}
        <span className="auth-input-wrap"><LockIcon size={18}/><input type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder={t.passwordPlaceholder}/><button type="button" className="auth-input-wrap__action" aria-label={passwordVisible ? 'Hide password' : 'Show password'} onClick={() => setPasswordVisible(value => !value)}>{passwordVisible ? <EyeOffIcon size={18}/> : <EyeIcon size={18}/>}</button></span>
      </label>
      <div className="auth-form__between auth-form__between--right"><Link to={`/pozabljeno-geslo${nextSuffix}`}>{t.forgotPassword}</Link></div>
      <button className="button button--primary button--full auth-submit" disabled={loading}>{loading ? <><Spinner small/> {t.loggingIn}</> : <>{t.loginButton} <ArrowRightIcon size={18}/></>}</button>
      <p className="auth-switch">{t.noAccount} <Link to={`/registracija${nextSuffix}`}>{t.createFreeAccount}</Link></p>
    </form>
  </AuthLayout>
}

export function AuthLayout({ title, subtitle, children, locale, onLocaleChange }: { title: string; subtitle: string; children: React.ReactNode; locale: AuthLocale; onLocaleChange: (locale: AuthLocale) => void }) {
  const t = authCopy[locale]
  return <div className="auth-page">
    <div className="auth-page__visual">
      <a href="/za-stranke" className="auth-brand auth-brand--visual"><img src="/racun/calendra-wordmark-white.png" alt="Calendra"/></a>
      <div className="auth-visual-copy"><span>{t.authVisualEyebrow}</span><h2><span>{t.authVisualTitleBefore}</span><strong>{t.authVisualTitleAccent}</strong></h2><p>{t.authVisualBody}</p></div>
    </div>
    <div className="auth-page__form">
      <LanguageSelector locale={locale} onChange={onLocaleChange}/>
      <div className="auth-panel">
        <a className="auth-brand auth-brand--mobile" href="/za-stranke"><img src="/racun/calendra-wordmark.webp" alt="Calendra"/></a>
        <div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>
        {children}
        <div className="auth-footer"><a href="/za-stranke">{t.footerBack}</a><span>•</span><a href="https://calendra.si/zasebnost">{t.footerPrivacy}</a></div>
      </div>
    </div>
  </div>
}

function LanguageSelector({ locale, onChange }: { locale: AuthLocale; onChange: (locale: AuthLocale) => void }) {
  const [open, setOpen] = useState(false)
  const selectorRef = useRef<HTMLDivElement | null>(null)
  const current = getLocaleOption(locale)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return <div ref={selectorRef} className={`auth-language-picker${open ? ' is-open' : ''}`}>
    <button type="button" className="auth-language" onClick={() => setOpen(value => !value)} aria-haspopup="listbox" aria-expanded={open}>
      <span className="auth-language__lead"><GlobeIcon size={17}/><span>{current.nativeLabel}</span></span>
      <span className="auth-language__chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="auth-language-menu" role="listbox" aria-label="Select language">
      {AUTH_LOCALE_OPTIONS.map(option => <button key={option.code} type="button" role="option" aria-selected={option.code === locale} className={`auth-language-option${option.code === locale ? ' is-active' : ''}`} onClick={() => { onChange(option.code); setOpen(false) }}><span className={`auth-language-option__flag auth-language-option__flag--${option.code}`} aria-hidden="true"/><span>{option.nativeLabel}</span><span className="auth-language-option__check" aria-hidden="true">{option.code === locale ? '✓' : ''}</span></button>)}
    </div>}
  </div>
}
