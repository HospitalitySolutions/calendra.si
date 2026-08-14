import { useEffect, useMemo, useState, type FormEvent } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useToast } from '../components/Toast'
import { useLocale } from '../locale'
import { captureReferralCode } from '../lib/referralRef'
import { getCalendraLegalLinks } from '../lib/legalLinks'
import { markOnboardingTourPending } from '../lib/onboardingTour'
import { storeAuthenticatedSession } from '../lib/session'
import {
  getBillingInterval,
  getEstimatedUserCount,
  parseRegisterSelection,
  registerPlanToPackage,
  selectionToSearch,
} from './registerFlow'
import {
  RegisterBenefitsVisual,
  RegisterOnboardingHeader,
} from './RegisterOnboardingShell'
import { registerOnboardingStyles } from './registerOnboardingStyles'
import { normalizeTenantConfigType } from './configuration/guestWebsiteSettings'

const REGISTER_SELECTION_STORAGE_KEY = 'calendra.register.selectionSearch'

type RegisterView = 'form' | 'verify' | 'registered' | 'invalid'

type SignupResponse = {
  token?: string
  user?: unknown
  pendingAccountCreation?: boolean
  requiresEmailVerification?: boolean
  email?: string
  challengeId?: string
  registeredAccountExists?: boolean
  pendingVerification?: boolean
  invalidVerificationCode?: boolean
  invalidVerificationLink?: boolean
  message?: string
  returnSearch?: string
}

function selectedAddonKeys(addons: Record<string, boolean>) {
  return Object.entries(addons || {}).filter(([, enabled]) => enabled).map(([key]) => key)
}

function tenantTypeForBusinessType(raw?: string) {
  return normalizeTenantConfigType(raw)
}

function googleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden>
      <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.86 2.7-6.62Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.72H.96v2.34A9 9 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.6.1-1.2.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.34Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A8.95 8.95 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.34C4.65 5.16 6.64 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

function appleMark() {
  return (
    <svg viewBox="0 0 14 16" aria-hidden>
      <path d="M11.47 8.52c.03 2.44 2.1 3.25 2.12 3.26-.02.06-.33 1.14-1.09 2.25-.65.96-1.33 1.91-2.39 1.93-1.05.02-1.39-.62-2.6-.62-1.2 0-1.58.6-2.58.64-1.02.04-1.8-1.03-2.46-1.99C1.16 11.97.1 8.31 1.45 5.98a3.77 3.77 0 0 1 3.2-1.92c1-.02 1.94.68 2.6.68.66 0 1.9-.84 3.2-.72.55.02 2.07.22 3.06 1.68-.08.05-1.82 1.06-1.8 2.82ZM9.95 2.32c.55-.67.92-1.6.82-2.52-.8.03-1.77.53-2.34 1.2-.51.6-.96 1.55-.84 2.46.9.07 1.81-.45 2.36-1.14Z" fill="currentColor"/>
    </svg>
  )
}

export function RegisterAccountPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, t } = useLocale()
  const { showToast } = useToast()
  const sl = locale === 'sl'
  const selection = useMemo(() => parseRegisterSelection(location.search), [location.search])
  const legalLinks = useMemo(() => getCalendraLegalLinks(locale), [locale])
  const [view, setView] = useState<RegisterView>('form')
  const [email, setEmail] = useState('')
  const [verifyEmail, setVerifyEmail] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    captureReferralCode(location.search)
    try { sessionStorage.setItem(REGISTER_SELECTION_STORAGE_KEY, selectionToSearch(selection)) } catch { /* noop */ }
  }, [location.search, selection])

  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const qEmail = q.get('email') || ''
    if (qEmail) {
      setEmail(qEmail)
      setVerifyEmail(qEmail)
    }
    setChallengeId(q.get('challengeId') || '')
    if (q.get('invalidVerify') === '1') setView('invalid')
    else if (q.get('existingAccount') === '1') setView('registered')
    else if (q.get('verifyEmail') === '1' || q.get('finishVerify') === '1') setView('verify')
    else setView('form')
  }, [location.search])

  const packageName = registerPlanToPackage[selection.plan]
  const tenantType = tenantTypeForBusinessType(selection.businessType)
  const returnSearch = `?${selectionToSearch(selection)}`

  const updateViewQuery = (nextView: RegisterView, addr: string, nextChallenge?: string) => {
    const q = new URLSearchParams(selectionToSearch(selection))
    q.set('email', addr)
    if (nextChallenge) q.set('challengeId', nextChallenge)
    if (nextView === 'verify') q.set('verifyEmail', '1')
    if (nextView === 'registered') q.set('existingAccount', '1')
    if (nextView === 'invalid') q.set('invalidVerify', '1')
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const persistSignupSession = async (addr = '') => {
    await api.post('/auth/signup/pending-session', {
      email: addr,
      companyName: selection.companyName || '',
      tenantType,
      firstName: '',
      lastName: '',
      phone: null,
      packageName,
      userCount: getEstimatedUserCount(selection),
      smsCount: 0,
      spaceCount: null,
      addonKeys: selectedAddonKeys(selection.addons),
      billingInterval: getBillingInterval(selection),
      fiscalizationNeeded: false,
      trialRequested: true,
      returnSearch,
    })
  }

  const finishAuthenticatedSignup = (data: SignupResponse) => {
    if (!data.user) return false
    markOnboardingTourPending()
    storeAuthenticatedSession({ token: data.token, user: data.user })
    try {
      sessionStorage.removeItem('calendra.register.requiresBillingDetails')
      sessionStorage.removeItem('calendra.register.billingDetailsSearch')
    } catch {
      // Best-effort cleanup for registrations started before trial onboarding was enabled.
    }
    window.location.assign('/calendar')
    return true
  }

  const submitEmail = async (event?: FormEvent) => {
    event?.preventDefault()
    setError('')
    const addr = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError(sl ? 'Vnesite veljaven e-poštni naslov.' : 'Enter a valid email address.')
      return
    }
    setSubmitting(true)
    try {
      const { data: availability } = await api.get<SignupResponse>('/auth/signup/email-available', { params: { email: addr } })
      if (availability?.registeredAccountExists) {
        setVerifyEmail(addr)
        setView('registered')
        updateViewQuery('registered', addr)
        return
      }
      if (availability?.pendingVerification) {
        const { data } = await api.post<SignupResponse>('/auth/signup/resend-code', { email: addr })
        const nextChallenge = String(data?.challengeId || '')
        setVerifyEmail(addr)
        setChallengeId(nextChallenge)
        setView('verify')
        updateViewQuery('verify', addr, nextChallenge)
        return
      }

      await persistSignupSession(addr)
      const { data } = await api.post<SignupResponse>('/auth/signup', {
        companyName: selection.companyName || '',
        tenantType,
        firstName: '',
        lastName: '',
        email: addr,
        phone: null,
        password: null,
        packageName,
        userCount: getEstimatedUserCount(selection),
        smsCount: 0,
        spaceCount: null,
        addonKeys: selectedAddonKeys(selection.addons),
        billingInterval: getBillingInterval(selection),
        fiscalizationNeeded: false,
        trialRequested: true,
        returnSearch,
      })
      if (finishAuthenticatedSignup(data)) return
      if (data?.pendingAccountCreation || data?.requiresEmailVerification) {
        const nextEmail = String(data.email || addr)
        const nextChallenge = String(data.challengeId || '')
        setVerifyEmail(nextEmail)
        setChallengeId(nextChallenge)
        setVerificationCode('')
        setPassword('')
        setPasswordRepeat('')
        setView('verify')
        updateViewQuery('verify', nextEmail, nextChallenge)
        showToast('success', sl ? 'Preverite e-pošto za verifikacijsko kodo.' : 'Check your email for the verification code.')
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const data = err.response.data as SignupResponse
        if (data?.registeredAccountExists) {
          setVerifyEmail(addr)
          setView('registered')
          updateViewQuery('registered', addr)
          return
        }
        if (data?.pendingVerification) {
          try {
            const { data: resent } = await api.post<SignupResponse>('/auth/signup/resend-code', { email: addr })
            const nextChallenge = String(resent?.challengeId || '')
            setVerifyEmail(addr)
            setChallengeId(nextChallenge)
            setView('verify')
            updateViewQuery('verify', addr, nextChallenge)
            return
          } catch { /* fall through to error */ }
        }
      }
      setError(axios.isAxiosError(err) ? (err.response?.data?.message || t('signupFailed')) : t('signupFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const startOAuthSignup = async (provider: 'google' | 'apple') => {
    setError('')
    setSubmitting(true)
    try {
      await persistSignupSession('')
      markOnboardingTourPending()
      window.location.assign(`/api/auth/${provider}?register=1`)
    } catch {
      setError(sl ? 'Registracijske seje ni bilo mogoče pripraviti. Poskusite znova.' : 'Could not prepare the signup session. Please try again.')
      setSubmitting(false)
    }
  }

  const submitVerification = async () => {
    setError('')
    if (!challengeId) {
      setError(sl ? 'Manjka verifikacijska zahteva. Pošljite novo kodo.' : 'Verification challenge is missing. Request a new code.')
      return
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      setError(sl ? 'Vnesite veljavno 6-mestno kodo.' : 'Enter a valid 6-digit code.')
      return
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setError(sl ? 'Geslo naj vsebuje vsaj 8 znakov, veliko in malo črko ter številko.' : 'Password must have at least 8 characters, upper/lowercase letters and a number.')
      return
    }
    if (password !== passwordRepeat) {
      setError(sl ? 'Gesli se ne ujemata.' : 'Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await api.post<SignupResponse>('/auth/signup/verify-code', {
        challengeId,
        code: verificationCode,
        password,
      })
      if (!finishAuthenticatedSignup(data)) setError(t('signupFailed'))
    } catch (err) {
      const data = axios.isAxiosError(err) ? err.response?.data as SignupResponse : undefined
      if (data?.invalidVerificationCode || data?.invalidVerificationLink) {
        setView('invalid')
        updateViewQuery('invalid', verifyEmail || email, challengeId)
      }
      setError(data?.message || t('signupFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const resendCode = async () => {
    const addr = (verifyEmail || email).trim().toLowerCase()
    if (!addr) return
    setResending(true)
    setError('')
    try {
      const { data } = await api.post<SignupResponse>('/auth/signup/resend-code', {
        challengeId: challengeId || undefined,
        email: addr,
      })
      const nextChallenge = String(data?.challengeId || challengeId || '')
      setChallengeId(nextChallenge)
      setVerificationCode('')
      setView('verify')
      updateViewQuery('verify', addr, nextChallenge)
      showToast('success', sl ? 'Nova koda je bila poslana.' : 'A new code was sent.')
    } catch {
      setError(sl ? 'Kode ni bilo mogoče poslati.' : 'Could not send a new code.')
    } finally {
      setResending(false)
    }
  }

  const useAnotherEmail = () => {
    setView('form')
    setVerifyEmail('')
    setChallengeId('')
    setVerificationCode('')
    setPassword('')
    setPasswordRepeat('')
    setError('')
    navigate(`/register/account?${selectionToSearch(selection)}`, { replace: true })
  }

  const headerContinue = () => {
    if (view === 'form') void submitEmail()
    else if (view === 'verify') void submitVerification()
    else if (view === 'invalid') void resendCode()
    else navigate(`/login?email=${encodeURIComponent(verifyEmail || email)}`)
  }

  return (
    <div className="register-onboarding register-onboarding-step-three">
      <style>{registerOnboardingStyles}</style>
      <div className="register-onboarding-shell">
        <RegisterOnboardingHeader
          activeStep={3}
          locale={locale}
          onBack={() => navigate(`/register/add-ons?${selectionToSearch(selection)}`)}
          onContinue={headerContinue}
          continueDisabled={submitting || resending}
        />

        <main className="register-onboarding-main">
          <div className="register-account-layout">
            <section className="register-account-left">
              {view === 'form' ? (
                <>
                  <h1 className="register-account-heading">{sl ? 'Ustvarite svoj račun' : 'Create your account'}</h1>
                  <p className="register-account-subtitle">
                    {sl ? 'Le še en korak vas loči od popolne organizacije vašega podjetja z Calendro.' : 'One last step before your business is ready to run with Calendra.'}
                  </p>
                  <form onSubmit={submitEmail}>
                    <div className="register-account-field-new">
                      <label htmlFor="register-email">{sl ? 'E-pošta' : 'Email'}</label>
                      <div className="register-account-input-wrap">
                        <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
                        <input
                          id="register-email"
                          className="register-onboarding-input"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder={sl ? 'Vnesite vašo e-pošto' : 'Enter your email'}
                        />
                      </div>
                    </div>
                    {error ? <div className="register-form-error-new">{error}</div> : null}
                    <button type="submit" className="register-account-primary" disabled={submitting}>
                      {submitting ? (sl ? 'Nadaljevanje…' : 'Continuing…') : (sl ? 'Nadaljuj z e-pošto →' : 'Continue with email →')}
                    </button>
                  </form>

                  <div className="register-account-divider-new">{sl ? 'ALI' : 'OR'}</div>
                  <button type="button" className="register-social-btn-new" disabled={submitting} onClick={() => void startOAuthSignup('google')}>
                    {googleMark()} <span>{sl ? 'Nadaljuj z Google' : 'Continue with Google'}</span>
                  </button>
                  <button type="button" className="register-social-btn-new" disabled={submitting} onClick={() => void startOAuthSignup('apple')}>
                    {appleMark()} <span>{sl ? 'Nadaljuj z Apple' : 'Continue with Apple'}</span>
                  </button>

                  <div className="register-existing-account">
                    {sl ? 'Že imate račun? ' : 'Already have an account? '}
                    <button type="button" onClick={() => navigate('/login')}>{sl ? 'Prijavite se' : 'Sign in'}</button>
                  </div>

                  <div className="register-account-legal">
                    <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3 20 6v5c0 5.2-3 8.7-8 10-5-1.3-8-4.8-8-10V6l8-3Z"/><path d="m8.7 12 2.1 2.1 4.6-4.7"/></svg>
                    <span>
                      {sl ? 'Vaši podatki so varni. Z registracijo se strinjate s ' : 'Your data is secure. By registering you agree to our '}
                      <a href={legalLinks.terms} target="_blank" rel="noreferrer">{sl ? 'Pogoji uporabe' : 'Terms of Service'}</a>
                      {sl ? ' in ' : ' and '}
                      <a href={legalLinks.privacy} target="_blank" rel="noreferrer">{sl ? 'Politiko zasebnosti' : 'Privacy Policy'}</a>.
                    </span>
                  </div>
                </>
              ) : view === 'verify' ? (
                <>
                  <h1 className="register-account-heading">{sl ? 'Potrdite e-pošto' : 'Verify your email'}</h1>
                  <p className="register-account-subtitle">
                    {sl ? 'Na vaš e-poštni naslov smo poslali 6-mestno kodo. Vnesite jo in ustvarite geslo.' : 'We sent a 6-digit code to your email. Enter it and create your password.'}
                  </p>
                  <div className="register-verification-pill">✉ {verifyEmail || email}</div>
                  <div className="register-verification-box">
                    <div className="register-account-field-new">
                      <label htmlFor="verify-code">{sl ? 'Verifikacijska koda' : 'Verification code'}</label>
                      <input id="verify-code" className="register-onboarding-input" inputMode="numeric" maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
                    </div>
                    <div className="register-account-field-new">
                      <label htmlFor="verify-password">{sl ? 'Ustvarite geslo' : 'Create password'}</label>
                      <input id="verify-password" className="register-onboarding-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <div className="register-account-field-new">
                      <label htmlFor="verify-password-repeat">{sl ? 'Potrdite geslo' : 'Confirm password'}</label>
                      <input id="verify-password-repeat" className="register-onboarding-input" type="password" autoComplete="new-password" value={passwordRepeat} onChange={(e) => setPasswordRepeat(e.target.value)} />
                    </div>
                    {error ? <div className="register-form-error-new">{error}</div> : null}
                    <div className="register-verification-actions">
                      <button type="button" className="register-account-primary" disabled={submitting} onClick={() => void submitVerification()}>{submitting ? (sl ? 'Preverjanje…' : 'Verifying…') : (sl ? 'Preveri kodo in nadaljuj' : 'Verify and continue')}</button>
                      <button type="button" className="register-secondary-btn-new" disabled={resending} onClick={() => void resendCode()}>{resending ? (sl ? 'Pošiljanje…' : 'Sending…') : (sl ? 'Znova pošlji kodo' : 'Send a new code')}</button>
                      <button type="button" className="register-inline-link" onClick={useAnotherEmail}>{sl ? 'Uporabi drug e-poštni naslov' : 'Use another email'}</button>
                    </div>
                  </div>
                </>
              ) : view === 'registered' ? (
                <>
                  <h1 className="register-account-heading">{sl ? 'Račun že obstaja' : 'Account already exists'}</h1>
                  <p className="register-account-subtitle">{sl ? 'Ta e-poštni naslov je že povezan z računom Calendra. Prijavite se za nadaljevanje.' : 'This email is already linked to a Calendra account. Sign in to continue.'}</p>
                  <div className="register-verification-pill">✉ {verifyEmail || email}</div>
                  {error ? <div className="register-form-error-new">{error}</div> : null}
                  <div className="register-verification-actions">
                    <button type="button" className="register-account-primary" onClick={() => navigate(`/login?email=${encodeURIComponent(verifyEmail || email)}`)}>{sl ? 'Prijava' : 'Sign in'}</button>
                    <button type="button" className="register-secondary-btn-new" onClick={useAnotherEmail}>{sl ? 'Uporabi drug e-poštni naslov' : 'Use another email'}</button>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="register-account-heading">{sl ? 'Koda ni več veljavna' : 'The code is no longer valid'}</h1>
                  <p className="register-account-subtitle">{sl ? 'Verifikacijska koda je potekla ali je bila že uporabljena. Pošljemo vam lahko novo.' : 'The verification code expired or was already used. We can send a new one.'}</p>
                  <div className="register-verification-pill">✉ {verifyEmail || email}</div>
                  {error ? <div className="register-form-error-new">{error}</div> : null}
                  <div className="register-verification-actions">
                    <button type="button" className="register-account-primary" disabled={resending} onClick={() => void resendCode()}>{resending ? (sl ? 'Pošiljanje…' : 'Sending…') : (sl ? 'Pošlji novo kodo' : 'Send a new code')}</button>
                    <button type="button" className="register-secondary-btn-new" onClick={useAnotherEmail}>{sl ? 'Uporabi drug e-poštni naslov' : 'Use another email'}</button>
                  </div>
                </>
              )}
            </section>

            <RegisterBenefitsVisual locale={locale} />
          </div>
        </main>
      </div>
    </div>
  )
}
