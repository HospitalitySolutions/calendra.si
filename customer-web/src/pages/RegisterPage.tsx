import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Spinner } from '../components/Loading'
import { AuthLayout } from './LoginPage'
import { returnToCustomerPage } from '../auth/returnTo'
import { authCopy, useAuthLocale } from '../auth/authLocale'

type Step = 'details' | 'verify'

export function RegisterPage() {
  const { isAuthenticated, setSession } = useAuth()
  const { locale, setLocale } = useAuthLocale()
  const t = authCopy[locale]
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState<Step>('details')
  const [challengeId, setChallengeId] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const next = searchParams.get('next')
  const nextSuffix = next ? `?next=${encodeURIComponent(next)}` : ''

  useEffect(() => {
    if (isAuthenticated) returnToCustomerPage(next)
  }, [isAuthenticated, next])

  if (isAuthenticated) return null

  async function start(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const challenge = await customerApi.signupStart({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), language: locale })
      setChallengeId(challenge.challengeId)
      setEmail(challenge.email)
      setStep('verify')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.registerError)
    } finally {
      setLoading(false)
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const session = await customerApi.signupVerify(challengeId, code.trim())
      setSession(session)
      returnToCustomerPage(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.verifyCodeError)
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    setError('')
    setNotice('')
    try {
      const challenge = await customerApi.signupResend(challengeId)
      setChallengeId(challenge.challengeId)
      setNotice(t.resendCodeSuccess)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.resendCodeError)
    }
  }

  if (step === 'verify') return <AuthLayout locale={locale} onLocaleChange={setLocale} title={t.verifyEmailTitle} subtitle={t.verifyEmailSubtitle(email)}>
    <form className="auth-form" onSubmit={verify}>
      {error && <div className="form-alert form-alert--error">{error}</div>}
      {notice && <div className="form-alert form-alert--success">{notice}</div>}
      <label>{t.confirmationCode}<input className="code-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} required autoFocus placeholder="000000"/></label>
      <button className="button button--primary button--full" disabled={loading || code.length < 4}>{loading ? <><Spinner small/> {t.verifying}</> : t.confirmAndContinue}</button>
      <button type="button" className="button button--text button--full" onClick={resend}>{t.resendCode}</button>
      <button type="button" className="button button--text button--full" onClick={() => setStep('details')}>{t.changeDetails}</button>
    </form>
  </AuthLayout>

  return <AuthLayout locale={locale} onLocaleChange={setLocale} title={t.registerTitle} subtitle={t.registerSubtitle}>
    <form className="auth-form" onSubmit={start}>
      {error && <div className="form-alert form-alert--error">{error}</div>}
      <div className="form-grid form-grid--2"><label>{t.registerFirstName}<input value={firstName} onChange={e => setFirstName(e.target.value)} required autoComplete="given-name"/></label><label>{t.registerLastName}<input value={lastName} onChange={e => setLastName(e.target.value)} required autoComplete="family-name"/></label></div>
      <label>{t.emailLabel}<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder={t.emailPlaceholder}/></label>
      <label>{t.registerPhone} <span className="label-optional">{t.optional}</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="040 123 456"/></label>
      <label>{t.passwordLabel}<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder={t.passwordPlaceholder}/><small>{t.passwordHelp}</small></label>
      <button className="button button--primary button--full" disabled={loading}>{loading ? <><Spinner small/> {t.creatingAccount}</> : t.registerButton}</button>
      <p className="auth-legal">{t.registerLegalPrefix} <a href="https://calendra.si/pogoji-uporabe">{t.termsOfUse}</a> in <a href="https://calendra.si/zasebnost">{t.privacyPolicy}</a>.</p>
      <p className="auth-switch">{t.alreadyHaveAccount} <Link to={`/prijava${nextSuffix}`}>{t.signIn}</Link></p>
    </form>
  </AuthLayout>
}
