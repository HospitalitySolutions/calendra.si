import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { Spinner } from '../components/Loading'
import { AuthLayout } from './LoginPage'

type Step = 'email' | 'code' | 'password' | 'done'

export function ForgotPasswordPage() {
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

  async function submitEmail(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true)
    try { await customerApi.forgotPassword(email.trim()); setStep('code') }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Zahteve ni bilo mogoče poslati.') }
    finally { setLoading(false) }
  }
  async function submitCode(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true)
    try { const response = await customerApi.verifyResetCode(email.trim(), code.trim()); setResetToken(response.resetToken); setStep('password') }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Koda ni veljavna ali je potekla.') }
    finally { setLoading(false) }
  }
  async function submitPassword(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true)
    try { await customerApi.resetPassword(resetToken, password); setStep('done') }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Gesla ni bilo mogoče spremeniti.') }
    finally { setLoading(false) }
  }

  if (step === 'done') return <AuthLayout title="Geslo je spremenjeno" subtitle="Sedaj se lahko prijavite z novim geslom."><div className="auth-form"><div className="success-mark">✓</div><Link className="button button--primary button--full" to={`/prijava${nextSuffix}`}>Nazaj na prijavo</Link></div></AuthLayout>
  if (step === 'code') return <AuthLayout title="Vnesite potrditveno kodo" subtitle={`Kodo smo poslali na ${email}.`}><form className="auth-form" onSubmit={submitCode}>{error && <div className="form-alert form-alert--error">{error}</div>}<label>Potrditvena koda<input className="code-input" inputMode="numeric" autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required/></label><button className="button button--primary button--full" disabled={loading}>{loading ? <Spinner small/> : 'Nadaljuj'}</button></form></AuthLayout>
  if (step === 'password') return <AuthLayout title="Nastavite novo geslo" subtitle="Izberite varno geslo za svoj Calendra račun."><form className="auth-form" onSubmit={submitPassword}>{error && <div className="form-alert form-alert--error">{error}</div>}<label>Novo geslo<input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} minLength={8} required/><small>Naj vsebuje veliko in malo črko ter številko.</small></label><button className="button button--primary button--full" disabled={loading}>{loading ? <Spinner small/> : 'Shrani novo geslo'}</button></form></AuthLayout>
  return <AuthLayout title="Pozabljeno geslo" subtitle="Vnesite e-pošto računa in poslali vam bomo potrditveno kodo."><form className="auth-form" onSubmit={submitEmail}>{error && <div className="form-alert form-alert--error">{error}</div>}<label>E-pošta<input type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} required/></label><button className="button button--primary button--full" disabled={loading}>{loading ? <Spinner small/> : 'Pošlji kodo'}</button><p className="auth-switch"><Link to={`/prijava${nextSuffix}`}>Nazaj na prijavo</Link></p></form></AuthLayout>
}
