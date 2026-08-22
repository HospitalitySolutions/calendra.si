import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ArrowRightIcon, CheckIcon, EyeIcon, EyeOffIcon, GlobeIcon, LockIcon, MailIcon } from '../components/Icons'
import { Spinner } from '../components/Loading'
import { returnToCustomerPage } from '../auth/returnTo'
import { renderGoogleIdentityButton, signInWithApple } from '../auth/socialAuth'
import { CUSTOMER_ACCOUNT_BASE_PATH } from '../config'
import type { GuestSession, SocialAuthConfig } from '../api/types'
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
  const [socialConfig, setSocialConfig] = useState<SocialAuthConfig | null>(null)
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const next = searchParams.get('next')
  const nextSuffix = next ? `?next=${encodeURIComponent(next)}` : ''

  useEffect(() => {
    if (isAuthenticated) returnToCustomerPage(next)
  }, [isAuthenticated, next])

  useEffect(() => {
    let active = true
    void customerApi.socialAuthConfig()
      .then(config => { if (active) setSocialConfig(config) })
      .catch(() => { if (active) setSocialConfig({}) })
    return () => { active = false }
  }, [])

  async function completeSocialLogin(provider: 'google' | 'apple', sessionPromise: Promise<GuestSession>) {
    setError('')
    setSocialLoading(provider)
    try {
      const session = await sessionPromise
      setSession(session)
      returnToCustomerPage(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.socialLoginError)
    } finally {
      setSocialLoading(null)
    }
  }

  useEffect(() => {
    const clientId = socialConfig?.googleClientId?.trim()
    const host = googleButtonRef.current
    if (!clientId || !host) return

    let active = true
    const render = () => {
      if (!active || !googleButtonRef.current) return
      void renderGoogleIdentityButton(googleButtonRef.current, clientId, idToken => {
        if (!active) return
        void completeSocialLogin('google', customerApi.loginWithGoogle(idToken))
      }).catch(() => {
        if (active && googleButtonRef.current) googleButtonRef.current.innerHTML = ''
      })
    }

    render()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(render)
    observer?.observe(host)
    return () => {
      active = false
      observer?.disconnect()
    }
  }, [socialConfig?.googleClientId])

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

  async function handleAppleLogin() {
    const clientId = socialConfig?.appleClientId?.trim()
    if (!clientId) {
      setError(t.socialLoginUnavailable)
      return
    }

    setError('')
    setSocialLoading('apple')
    try {
      const redirectUri = socialConfig?.appleRedirectUri?.trim()
        || `${window.location.origin}${CUSTOMER_ACCOUNT_BASE_PATH}/prijava`
      const identity = await signInWithApple({ clientId, redirectUri })
      const session = await customerApi.loginWithApple(identity.idToken, identity)
      setSession(session)
      returnToCustomerPage(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.socialLoginError)
    } finally {
      setSocialLoading(null)
    }
  }

  function handleUnavailableGoogle() {
    if (!socialConfig?.googleClientId?.trim()) setError(t.socialLoginUnavailable)
  }

  const socialBusy = socialLoading !== null

  return <AuthLayout
    locale={locale}
    onLocaleChange={setLocale}
    title={t.loginTitle}
    subtitle=""
    panelClassName="auth-panel--login"
    footerPrimaryLabel={t.footerTerms}
    footerPrimaryHref="https://calendra.si/pogoji-uporabe"
  >
    <form className="auth-form auth-form--login" onSubmit={submit}>
      {error && <div className="form-alert form-alert--error">{error}</div>}
      <label>{t.emailLabel}
        <span className="auth-input-wrap"><MailIcon size={18}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder={t.emailPlaceholder}/></span>
      </label>
      <label>{t.passwordLabel}
        <span className="auth-input-wrap"><LockIcon size={18}/><input type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder={t.passwordPlaceholder}/><button type="button" className="auth-input-wrap__action" aria-label={passwordVisible ? 'Hide password' : 'Show password'} onClick={() => setPasswordVisible(value => !value)}>{passwordVisible ? <EyeOffIcon size={18}/> : <EyeIcon size={18}/>}</button></span>
      </label>
      <div className="auth-form__between auth-form__between--right"><Link to={`/pozabljeno-geslo${nextSuffix}`}>{t.forgotPassword}</Link></div>
      <button className="button button--primary button--full auth-submit" disabled={loading || socialBusy}>{loading ? <><Spinner small/> {t.loggingIn}</> : <>{t.loginButton} <ArrowRightIcon size={18}/></>}</button>

      <div className="auth-social-separator" aria-hidden="true"><span>{t.orSeparator}</span></div>

      <div className={`auth-social-button-shell${socialLoading === 'google' ? ' is-loading' : ''}`}>
        <button
          type="button"
          className="auth-social-button"
          onClick={handleUnavailableGoogle}
          tabIndex={socialConfig?.googleClientId?.trim() ? -1 : 0}
          disabled={socialBusy && socialLoading !== 'google'}
        >
          {socialLoading === 'google' ? <Spinner small/> : <GoogleLogo/>}
          <span>{socialLoading === 'google' ? t.googleSigningIn : t.continueWithGoogle}</span>
        </button>
        <div
          ref={googleButtonRef}
          className={`auth-google-provider-hitarea${socialConfig?.googleClientId?.trim() && !socialBusy ? ' is-active' : ''}`}
        />
      </div>

      <button type="button" className="auth-social-button" onClick={() => void handleAppleLogin()} disabled={socialBusy}>
        {socialLoading === 'apple' ? <Spinner small/> : <AppleLogo/>}
        <span>{socialLoading === 'apple' ? t.appleSigningIn : t.continueWithApple}</span>
      </button>

      <p className="auth-switch">{t.noAccount} <Link to={`/registracija${nextSuffix}`}>{t.createFreeAccount}</Link></p>
    </form>
  </AuthLayout>
}

function GoogleLogo() {
  return <svg className="auth-social-logo auth-social-logo--google" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.23-.2-1.78H12v3.4h5.52a4.7 4.7 0 0 1-2.05 3.08l-.02.11 2.97 2.3.2.02c1.84-1.7 2.98-4.2 2.98-7.13Z"/>
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.62-2.43l-3.15-2.44c-.84.57-1.96.97-3.47.97-2.6 0-4.8-1.76-5.6-4.19l-.1.01-3.09 2.39-.04.1A10 10 0 0 0 12 22Z"/>
    <path fill="#FBBC05" d="M6.4 13.91A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.3.32-1.91v-.12L3.27 7.54l-.1.05A10 10 0 0 0 2 12c0 1.6.38 3.12 1.17 4.41l3.23-2.5Z"/>
    <path fill="#EA4335" d="M12 5.9c1.88 0 3.15.81 3.87 1.48l2.82-2.75C16.96 3.03 14.7 2 12 2a10 10 0 0 0-8.83 5.59l3.22 2.5C7.2 7.66 9.4 5.9 12 5.9Z"/>
  </svg>
}

function AppleLogo() {
  return <svg className="auth-social-logo auth-social-logo--apple" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M16.73 12.36c-.02-2.23 1.82-3.3 1.9-3.35a4.07 4.07 0 0 0-3.2-1.73c-1.35-.14-2.67.8-3.35.8-.69 0-1.73-.78-2.86-.76a4.22 4.22 0 0 0-3.55 2.17c-1.56 2.7-.4 6.67 1.1 8.86.75 1.08 1.63 2.28 2.75 2.24 1.1-.04 1.5-.72 2.82-.72 1.31 0 1.69.72 2.84.69 1.17-.02 1.91-1.08 2.64-2.17a8.8 8.8 0 0 0 1.2-2.44 3.85 3.85 0 0 1-2.3-3.59ZM14.55 5.85a3.92 3.92 0 0 0 .9-2.82 4 4 0 0 0-2.6 1.34 3.74 3.74 0 0 0-.92 2.71 3.3 3.3 0 0 0 2.62-1.23Z"/>
  </svg>
}

export function AuthLayout({ title, subtitle, children, locale, onLocaleChange, footerPrimaryLabel, footerPrimaryHref, panelClassName }: { title: string; subtitle: string; children: React.ReactNode; locale: AuthLocale; onLocaleChange: (locale: AuthLocale) => void; footerPrimaryLabel?: string; footerPrimaryHref?: string; panelClassName?: string }) {
  const t = authCopy[locale]
  const isLogin = panelClassName === 'auth-panel--login'
  const pageClassName = isLogin ? 'auth-page auth-page--login' : 'auth-page'
  return <div className={pageClassName}>
    <div className="auth-page__visual">
      <a href="/za-stranke" className="auth-brand auth-brand--visual"><picture><source media="(max-width: 1100px)" srcSet="/racun/calendra-connect-logo.png"/><img src="/racun/calendra-connect-logo-on-blue.png" alt="Calendra Connect"/></picture></a>
      <div className="auth-visual-copy"><span>{t.authVisualEyebrow}</span><h2><span>{t.authVisualTitleBefore}</span><strong>{t.authVisualTitleAccent}</strong></h2><p>{t.authVisualBody}</p></div>
    </div>
    <div className="auth-page__form">
      <LanguageSelector locale={locale} onChange={onLocaleChange}/>
      <div className={`auth-panel${panelClassName ? ` ${panelClassName}` : ''}`}>
        {!isLogin && <a className="auth-brand auth-brand--mobile" href="/za-stranke"><img src="/racun/calendra-connect-logo.png" alt="Calendra Connect"/></a>}
        <div className="auth-heading"><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
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
