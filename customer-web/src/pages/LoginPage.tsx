import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ArrowRightIcon, CheckIcon, EyeIcon, EyeOffIcon, GlobeIcon, LockIcon, MailIcon } from '../components/Icons'
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

export function AuthLayout({ title, subtitle, children, locale, onLocaleChange, footerPrimaryLabel, footerPrimaryHref }: { title: string; subtitle: string; children: React.ReactNode; locale: AuthLocale; onLocaleChange: (locale: AuthLocale) => void; footerPrimaryLabel?: string; footerPrimaryHref?: string }) {
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
        <div className="auth-footer"><a href={footerPrimaryHref || "/za-stranke"}>{footerPrimaryLabel || t.footerBack}</a><span>•</span><a href="https://calendra.si/zasebnost">{t.footerPrivacy}</a></div>
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
      <span className="auth-language__lead"><GlobeIcon size={18}/><span>{current.nativeLabel}</span></span>
      <svg className="auth-language__chevron" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
    </button>
    {open && <div className="auth-language-menu" role="listbox" aria-label="Select language">
      {AUTH_LOCALE_OPTIONS.map(option => <button key={option.code} type="button" role="option" aria-selected={option.code === locale} className={`auth-language-option${option.code === locale ? ' is-active' : ''}`} onClick={() => { onChange(option.code); setOpen(false) }}><LanguageFlag locale={option.code}/><span className="auth-language-option__label">{option.nativeLabel}</span><span className="auth-language-option__check" aria-hidden="true">{option.code === locale ? <CheckIcon size={20}/> : null}</span></button>)}
    </div>}
  </div>
}

function LanguageFlag({ locale }: { locale: AuthLocale }) {
  if (locale === 'en') {
    return <svg className="auth-language-option__flag" viewBox="0 0 60 40" role="img" aria-label="United Kingdom flag">
      <rect width="60" height="40" rx="4" fill="#21468B"/>
      <path d="M0 0 60 40M60 0 0 40" stroke="#fff" strokeWidth="9"/>
      <path d="M0 0 60 40M60 0 0 40" stroke="#CF142B" strokeWidth="4"/>
      <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="13"/>
      <path d="M30 0v40M0 20h60" stroke="#CF142B" strokeWidth="7"/>
    </svg>
  }

  if (locale === 'sr') {
    return <svg className="auth-language-option__flag" viewBox="0 0 60 40" role="img" aria-label="Serbian flag">
      <defs><clipPath id="sr-flag-clip"><rect width="60" height="40" rx="4"/></clipPath></defs>
      <g clipPath="url(#sr-flag-clip)"><rect width="60" height="13.34" fill="#C6363C"/><rect y="13.33" width="60" height="13.34" fill="#0C4076"/><rect y="26.66" width="60" height="13.34" fill="#fff"/></g>
      <g transform="translate(14 8)"><path d="M8 0 14 3.2v8.3c0 5.1-2.8 8.8-6 11-3.2-2.2-6-5.9-6-11V3.2Z" fill="#fff" stroke="#B32235" strokeWidth="1"/><path d="M8 3.2v14.2M4.7 8.2h6.6" stroke="#B32235" strokeWidth="1.3"/><path d="m5 3.2 3-2 3 2-1.2 2.1H6.2Z" fill="#F6C445"/></g>
    </svg>
  }

  return <svg className="auth-language-option__flag" viewBox="0 0 60 40" role="img" aria-label="Slovenian flag">
    <defs><clipPath id="sl-flag-clip"><rect width="60" height="40" rx="4"/></clipPath></defs>
    <g clipPath="url(#sl-flag-clip)"><rect width="60" height="13.34" fill="#fff"/><rect y="13.33" width="60" height="13.34" fill="#005DA4"/><rect y="26.66" width="60" height="13.34" fill="#ED1C24"/></g>
    <g transform="translate(13 4)"><path d="M0 0h12v9.5c0 4.2-2.7 7.1-6 8.7-3.3-1.6-6-4.5-6-8.7Z" fill="#0B63B6" stroke="#fff" strokeWidth=".9"/><path d="m1.8 9.7 2.3-3 1.9 2.1 2.2-3.6 2 4.5" fill="none" stroke="#fff" strokeWidth="1"/><path d="M1.7 11.4c2.5-1 6.1-1 8.6 0M2.4 13.2c2.1-.8 5.1-.8 7.2 0" fill="none" stroke="#fff" strokeWidth=".8"/></g>
  </svg>
}
