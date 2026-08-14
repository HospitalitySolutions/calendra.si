import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ArrowRightIcon, GlobeIcon, LockIcon, MailIcon } from '../components/Icons'
import { Spinner } from '../components/Loading'
import { returnToCustomerPage } from '../auth/returnTo'

export function LoginPage() {
  const { isAuthenticated, setSession } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      setError(err instanceof ApiError ? err.message : 'Prijava ni uspela. Preverite podatke in poskusite znova.')
    } finally {
      setLoading(false)
    }
  }

  return <AuthLayout title="Dobrodošli nazaj" subtitle="Prijavite se in imejte vse svoje termine, pakete in sporočila na enem mestu." headingIcon={<LockIcon size={25}/>}> 
    <form className="auth-form" onSubmit={submit}>
      {error && <div className="form-alert form-alert--error">{error}</div>}
      <label>E-pošta
        <span className="auth-input-wrap"><MailIcon size={19}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="vnesite@primer.com"/></span>
      </label>
      <label>Geslo
        <span className="auth-input-wrap"><LockIcon size={19}/><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Vaše geslo"/></span>
      </label>
      <div className="auth-form__between auth-form__between--right"><Link to={`/pozabljeno-geslo${nextSuffix}`}>Pozabljeno geslo?</Link></div>
      <button className="button button--primary button--full auth-submit" disabled={loading}>{loading ? <><Spinner small/> Prijavljam …</> : <>Prijava <ArrowRightIcon size={18}/></>}</button>
      <p className="auth-switch">Še nimate računa? <Link to={`/registracija${nextSuffix}`}>Ustvarite brezplačen račun</Link></p>
    </form>
  </AuthLayout>
}

export function AuthLayout({ title, subtitle, children, headingIcon }: { title: string; subtitle: string; children: React.ReactNode; headingIcon?: React.ReactNode }) {
  return <div className="auth-page">
    <div className="auth-page__visual">
      <a href="/za-stranke" className="auth-brand"><img src="/racun/calendra-wordmark.webp" alt="Calendra"/></a>
      <div className="auth-visual-copy"><span>Vaš čas. Vaši ponudniki.</span><h2>Vse rezervacije na enem mestu.</h2><p>Rezervirajte, spremljajte termine in upravljajte svoje pakete, članstva ter bone.</p></div>
    </div>
    <div className="auth-page__form">
      <div className="auth-language"><GlobeIcon size={18}/><span>Slovenščina</span><span aria-hidden="true">⌄</span></div>
      <div className="auth-panel"><a className="auth-brand auth-brand--mobile" href="/za-stranke"><img src="/racun/calendra-wordmark.webp" alt="Calendra"/></a><div className="auth-heading">{headingIcon && <div className="auth-heading__icon">{headingIcon}</div>}<h1>{title}</h1><p>{subtitle}</p></div>{children}<div className="auth-footer"><a href="/za-stranke">Nazaj na Calendro</a><span>·</span><a href="https://calendra.si/zasebnost">Zasebnost</a></div></div>
    </div>
  </div>
}
