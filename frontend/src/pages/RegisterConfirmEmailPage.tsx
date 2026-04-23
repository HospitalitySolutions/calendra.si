import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import loginLogo from '../assets/login-logo.png'
import { api } from '../api'
import { storeAuthenticatedSession } from '../lib/session'
import { registerPageStyles } from './registerPageStyles'

const confirmEmailStyles = `
  .register-confirm-shell .register-account-card {
    width: min(100%, 760px);
    display: grid;
    gap: 22px;
    padding: 30px;
  }
  .register-confirm-shell .register-confirm-badges { display: grid; gap: 8px; }
  .register-confirm-shell .register-confirm-badge {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: .82rem;
    font-weight: 800;
  }
  .register-confirm-shell .register-confirm-badge--blue { background: #edf4ff; color: #2f6df6; border: 1px solid #d9e6ff; }
  .register-confirm-shell .register-confirm-badge--green { background: #ecfdf3; color: #15803d; border: 1px solid #bbf7d0; }
  .register-confirm-shell .register-confirm-title { margin: 0; font-size: clamp(2rem, 3vw, 2.6rem); line-height: .98; letter-spacing: -.055em; color: #17253d; }
  .register-confirm-shell .register-confirm-copy { margin: 0; color: #70809b; font-size: 1rem; line-height: 1.58; max-width: 560px; }
  .register-confirm-shell .register-confirm-card {
    display: grid; gap: 14px; padding: 22px; border-radius: 24px;
    border: 1px solid #dbe6f7; background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(244,248,255,.96));
    box-shadow: 0 16px 34px rgba(47,109,246,.08);
  }
  .register-confirm-shell .register-confirm-next { margin: 0; font-size: 1rem; font-weight: 900; color: #17253d; }
  .register-confirm-shell .register-confirm-help { margin: 0; color: #70809b; font-size: .92rem; line-height: 1.5; }
  .register-confirm-shell .register-confirm-pill {
    display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px;
    border-radius: 999px; background: #fff; border: 1px solid #d9e6ff; width: fit-content;
    max-width: 100%; font-size: .92rem; font-weight: 700; color: #17253d;
  }
  .register-confirm-shell .register-confirm-field { display: grid; gap: 8px; }
  .register-confirm-shell .register-confirm-field label { font-size: .92rem; font-weight: 800; color: #2a3a56; }
  .register-confirm-shell .register-confirm-password-wrap {
    display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px;
    height: 56px; padding: 0 14px; border-radius: 16px; border: 1px solid #dfe7f5; background: rgba(255,255,255,.92);
  }
  .register-confirm-shell .register-confirm-password-wrap input {
    border: 0; outline: 0; background: transparent; color: #17253d; font-size: 1.15rem;
  }
  .register-confirm-shell .register-confirm-show {
    border: 0; background: transparent; color: #70809b; font-weight: 800; font-size: 1rem; cursor: pointer;
  }
  .register-confirm-shell .register-confirm-hint { margin: 0; color: #70809b; font-size: .92rem; line-height: 1.45; }
  .register-confirm-shell .register-confirm-submit {
    width: 100%; height: 60px; border-radius: 16px; border: 0; cursor: pointer;
    background: linear-gradient(180deg,#2f6df6,#1957e6); color: #fff; font-size: 1rem; font-weight: 900;
  }
`

export function RegisterConfirmEmailPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = useMemo(() => params.get('token')?.trim() ?? '', [params])
  const fallbackEmail = useMemo(() => params.get('email')?.trim().toLowerCase() ?? '', [params])
  const [email, setEmail] = useState(fallbackEmail)
  const [validating, setValidating] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      const q = new URLSearchParams()
      q.set('invalidVerify', '1')
      if (fallbackEmail) q.set('email', fallbackEmail)
      navigate(`/register/account?${q.toString()}`, { replace: true })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { data } = await api.get<{ valid?: boolean; email?: string }>('/auth/signup/validate-email-intent', { params: { token } })
        if (cancelled) return
        setEmail(String(data?.email || fallbackEmail))
        setInvalid(!data?.valid)
      } catch (err) {
        if (cancelled) return
        const body = axios.isAxiosError(err) ? (err.response?.data as { email?: string } | undefined) : undefined
        const em = String(body?.email || fallbackEmail)
        const q = new URLSearchParams()
        q.set('invalidVerify', '1')
        if (em) q.set('email', em)
        navigate(`/register/account?${q.toString()}`, { replace: true })
        return
      } finally {
        if (!cancelled) setValidating(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fallbackEmail, navigate, token])

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!token || invalid) return
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!/\d/.test(password) || !/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
      setError('Password must include uppercase, lowercase, and a number.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await api.post('/auth/signup/complete-email', { token, password })
      if (data?.user) {
        storeAuthenticatedSession(data)
        window.location.assign('/calendar')
        return
      }
      setError('Could not complete account setup.')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { invalidVerificationLink?: boolean; email?: string; message?: string } | undefined
        if (d?.invalidVerificationLink) {
          const q = new URLSearchParams()
          q.set('invalidVerify', '1')
          q.set('email', String(d.email || email || fallbackEmail))
          navigate(`/register/account?${q.toString()}`, { replace: true })
          return
        }
        setError(d?.message || 'Could not complete account setup.')
      } else {
        setError('Could not complete account setup.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (validating) {
    return (
      <div className="register-flow register-confirm-shell">
        <style>{registerPageStyles + confirmEmailStyles}</style>
        <div className="app">
          <main className="content">
            <section className="panel register-account-card">
              <p className="register-confirm-copy">Validating your verification link…</p>
            </section>
          </main>
        </div>
      </div>
    )
  }

  if (invalid) {
    return null
  }

  return (
    <div className="register-flow register-confirm-shell">
      <style>{registerPageStyles + confirmEmailStyles}</style>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img className="brand-logo" src={loginLogo} alt="Calendra — Simplify Your Booking" />
          </div>
        </header>
        <main className="content">
          <section className="panel register-account-card">
            <div className="register-confirm-badges">
              <span className="register-confirm-badge register-confirm-badge--blue">Account update</span>
              <span className="register-confirm-badge register-confirm-badge--green">Email verified</span>
            </div>
            <h1 className="register-confirm-title">Create your password to continue</h1>
            <p className="register-confirm-copy">
              Your email is confirmed. Set a password for your Calendra account, then continue directly to Billing details.
            </p>

            <form className="register-confirm-card" onSubmit={submit}>
              <p className="register-confirm-next">Final account step</p>
              <p className="register-confirm-help">Create your password now to finish account setup.</p>
              <div className="register-confirm-pill">
                <span aria-hidden>✓</span>
                <span>{email} confirmed</span>
              </div>

              <div className="register-confirm-field">
                <label htmlFor="confirm-password">Password</label>
                <div className="register-confirm-password-wrap">
                  <input
                    id="confirm-password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    placeholder="Create a password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" className="register-confirm-show" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="register-confirm-hint">Use at least 8 characters, with a mix of letters and numbers.</p>
              </div>

              <div className="register-confirm-field">
                <label htmlFor="confirm-password-repeat">Confirm password</label>
                <div className="register-confirm-password-wrap">
                  <input
                    id="confirm-password-repeat"
                    value={confirmPassword}
                    onChange={(ev) => setConfirmPassword(ev.target.value)}
                    placeholder="Repeat your password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" className="register-confirm-show" onClick={() => setShowConfirmPassword((v) => !v)}>
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {error ? <div className="error">{error}</div> : null}
              <button type="submit" className="register-confirm-submit" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create password and continue'}
              </button>
            </form>
          </section>
        </main>
      </div>
    </div>
  )
}
