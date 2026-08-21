import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { Spinner } from '../components/Loading'
import { AuthLayout } from './LoginPage'
import { authCopy, useAuthLocale } from '../auth/authLocale'

type Step = 'email' | 'code' | 'password' | 'done'

export function ForgotPasswordPage() {
  const { locale, setLocale } = useAuthLocale()
  const t = authCopy[locale]
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  const nextSuffix = next ? `?next=${encodeURIComponent(next)}` : ''
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const forgotLayoutProps = { locale, onLocaleChange: setLocale, footerPrimaryLabel: t.footerTerms, footerPrimaryHref: 'https://calendra.si/pogoji-uporabe' }

  async function submitEmail(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true)
    try { await customerApi.forgotPassword(email.trim(), locale); setStep('code') }
    catch (err) { setError(err instanceof ApiError ? err.message : t.requestFailed) }
    finally { setLoading(false) }
  }
  async function submitCode(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true)
    try { const response = await customerApi.verifyResetCode(email.trim(), code.trim()); setResetToken(response.resetToken); setStep('password') }
    catch (err) { setError(err instanceof ApiError ? err.message : t.verifyCodeError) }
    finally { setLoading(false) }
  }
  async function submitPassword(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true)
    try { await customerApi.resetPassword(resetToken, password); setStep('done') }
    catch (err) { setError(err instanceof ApiError ? err.message : t.resetPasswordError) }
    finally { setLoading(false) }
  }

  if (step === 'done') return <AuthLayout {...forgotLayoutProps} title={t.passwordChangedTitle} subtitle={t.passwordChangedSubtitle}><div className="auth-form"><div className="success-mark">✓</div><Link className="button button--primary button--full" to={`/prijava${nextSuffix}`}>{t.backToLogin}</Link></div></AuthLayout>
  if (step === 'code') return <AuthLayout {...forgotLayoutProps} title={t.enterCodeTitle} subtitle={t.enterCodeSubtitle(email)}><form className="auth-form" onSubmit={submitCode}>{error && <div className="form-alert form-alert--error">{error}</div>}<label>{t.confirmationCode}<input className="code-input" inputMode="numeric" autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required/></label><button className="button button--primary button--full" disabled={loading}>{loading ? <Spinner small/> : t.continueButton}</button></form></AuthLayout>
  if (step === 'password') return <AuthLayout {...forgotLayoutProps} title={t.setNewPasswordTitle} subtitle={t.setNewPasswordSubtitle}><form className="auth-form" onSubmit={submitPassword}>{error && <div className="form-alert form-alert--error">{error}</div>}<label>{t.newPassword}<input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} minLength={8} required/><small>{t.passwordHelp}</small></label><button className="button button--primary button--full" disabled={loading}>{loading ? <Spinner small/> : t.saveNewPassword}</button></form></AuthLayout>
  return <AuthLayout {...forgotLayoutProps} title={t.forgotTitle} subtitle={t.forgotSubtitle}><form className="auth-form" onSubmit={submitEmail}>{error && <div className="form-alert form-alert--error">{error}</div>}<label>{t.emailLabel}<input type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} required placeholder={t.emailPlaceholder}/></label><button className="button button--primary button--full" disabled={loading}>{loading ? <Spinner small/> : t.sendCode}</button><p className="auth-switch"><Link to={`/prijava${nextSuffix}`}>{t.backToLogin}</Link></p></form></AuthLayout>
}
