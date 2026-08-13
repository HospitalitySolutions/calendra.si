import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Spinner } from '../components/Loading'
import { AuthLayout } from './LoginPage'
import { returnToCustomerPage } from '../auth/returnTo'

type Step = 'details' | 'verify'

export function RegisterPage() {
  const { isAuthenticated, setSession } = useAuth()
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
      const challenge = await customerApi.signupStart({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), language: 'sl' })
      setChallengeId(challenge.challengeId)
      setEmail(challenge.email)
      setStep('verify')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Računa ni bilo mogoče ustvariti.')
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
      setError(err instanceof ApiError ? err.message : 'Koda ni veljavna ali je potekla.')
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
      setNotice('Poslali smo vam novo potrditveno kodo.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kode ni bilo mogoče ponovno poslati.')
    }
  }

  if (step === 'verify') return <AuthLayout title="Preverite e-pošto" subtitle={`Na ${email} smo poslali potrditveno kodo.`}>
    <form className="auth-form" onSubmit={verify}>
      {error && <div className="form-alert form-alert--error">{error}</div>}
      {notice && <div className="form-alert form-alert--success">{notice}</div>}
      <label>Potrditvena koda<input className="code-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} required autoFocus placeholder="000000"/></label>
      <button className="button button--primary button--full" disabled={loading || code.length < 4}>{loading ? <><Spinner small/> Preverjam …</> : 'Potrdi in nadaljuj'}</button>
      <button type="button" className="button button--text button--full" onClick={resend}>Pošlji novo kodo</button>
      <button type="button" className="button button--text button--full" onClick={() => setStep('details')}>Spremeni podatke</button>
    </form>
  </AuthLayout>

  return <AuthLayout title="Ustvarite Calendra račun" subtitle="Brezplačen račun za vaše rezervacije, pakete, članstva in bone.">
    <form className="auth-form" onSubmit={start}>
      {error && <div className="form-alert form-alert--error">{error}</div>}
      <div className="form-grid form-grid--2"><label>Ime<input value={firstName} onChange={e => setFirstName(e.target.value)} required autoComplete="given-name"/></label><label>Priimek<input value={lastName} onChange={e => setLastName(e.target.value)} required autoComplete="family-name"/></label></div>
      <label>E-pošta<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="ime@primer.si"/></label>
      <label>Telefon <span className="label-optional">neobvezno</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="040 123 456"/></label>
      <label>Geslo<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Vsaj 8 znakov"/><small>Naj vsebuje veliko in malo črko ter številko.</small></label>
      <button className="button button--primary button--full" disabled={loading}>{loading ? <><Spinner small/> Ustvarjam …</> : 'Ustvari račun'}</button>
      <p className="auth-legal">Z ustvarjanjem računa se strinjate s <a href="https://calendra.si/pogoji-uporabe">pogoji uporabe</a> in <a href="https://calendra.si/zasebnost">politiko zasebnosti</a>.</p>
      <p className="auth-switch">Že imate račun? <Link to={`/prijava${nextSuffix}`}>Prijavite se</Link></p>
    </form>
  </AuthLayout>
}
