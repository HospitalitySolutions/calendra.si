import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Spinner } from '../components/Loading'

export function LoginPage() {
  const { isAuthenticated, setSession } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const session = await customerApi.login(email.trim(), password)
      setSession(session)
      const next = searchParams.get('next')
      navigate(next && next.startsWith('/') ? next : '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Prijava ni uspela. Preverite podatke in poskusite znova.')
    } finally {
      setLoading(false)
    }
  }

  return <AuthLayout title="Dobrodošli nazaj" subtitle="Prijavite se in imejte vse svoje termine, pakete in sporočila na enem mestu.">
    <form className="auth-form" onSubmit={submit}>
      {error && <div className="form-alert form-alert--error">{error}</div>}
      <label>E-pošta<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="ime@primer.si"/></label>
      <label>Geslo<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Vaše geslo"/></label>
      <div className="auth-form__between auth-form__between--right"><Link to="/forgot-password">Pozabljeno geslo?</Link></div>
      <button className="button button--primary button--full" disabled={loading}>{loading ? <><Spinner small/> Prijavljam …</> : 'Prijava'}</button>
      <p className="auth-switch">Še nimate računa? <Link to="/register">Ustvarite brezplačen račun</Link></p>
    </form>
  </AuthLayout>
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="auth-page">
    <div className="auth-page__visual">
      <a href="https://calendra.si/za-stranke" className="auth-brand"><img src="/calendra-connect-logo.png" alt="Calendra Connect"/></a>
      <div className="auth-visual-copy"><span>Vaš čas. Vaši ponudniki.</span><h2>Vse rezervacije na enem mestu.</h2><p>Rezervirajte, spremljajte termine in upravljajte svoje pakete, članstva ter bone.</p></div>
    </div>
    <div className="auth-page__form"><div className="auth-panel"><a className="auth-brand auth-brand--mobile" href="https://calendra.si/za-stranke"><img src="/calendra-connect-logo.png" alt="Calendra Connect"/></a><div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>{children}<div className="auth-footer"><a href="https://calendra.si/za-stranke">Nazaj na Calendra.si</a><span>·</span><a href="https://calendra.si/zasebnost">Zasebnost</a></div></div></div>
  </div>
}
