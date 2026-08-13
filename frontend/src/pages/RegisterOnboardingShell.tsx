import type { ReactNode } from 'react'
import loginLogo from '../assets/login-logo.png'

export type RegisterOnboardingStep = 1 | 2 | 3

export function RegisterOnboardingHeader({
  activeStep,
  locale,
  onLogo,
  onContinue,
  continueDisabled = false,
  continueLabel,
}: {
  activeStep: RegisterOnboardingStep
  locale: string
  onLogo: () => void
  onContinue?: () => void
  continueDisabled?: boolean
  continueLabel?: string
}) {
  const sl = locale === 'sl'
  const steps = sl
    ? ['Osnovni podatki', 'Funkcionalnosti', 'Registracija']
    : ['Business details', 'Features', 'Registration']
  const cta = continueLabel || (sl ? 'Nadaljuj' : 'Continue')

  return (
    <header className="register-onboarding-header">
      <button type="button" className="register-onboarding-brand" onClick={onLogo} aria-label="Calendra">
        <img src={loginLogo} alt="Calendra" />
      </button>
      <div className="register-onboarding-steps" aria-label={sl ? 'Napredek registracije' : 'Registration progress'}>
        {steps.map((label, index) => {
          const step = (index + 1) as RegisterOnboardingStep
          const done = step < activeStep
          const current = step === activeStep
          return (
            <div key={label} className={`register-onboarding-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}>
              <span className="register-onboarding-step-circle" aria-hidden>{done ? '✓' : step}</span>
              <span className="register-onboarding-step-label">{label}</span>
            </div>
          )
        })}
      </div>
      {onContinue ? (
        <button type="button" className="register-onboarding-continue" disabled={continueDisabled} onClick={onContinue}>
          {cta} <span aria-hidden>→</span>
        </button>
      ) : <span />}
    </header>
  )
}

export function RegisterTrustNote({ children }: { children: ReactNode }) {
  return (
    <div className="register-onboarding-trust">
      <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3 20 6v5c0 5.2-3 8.7-8 10-5-1.3-8-4.8-8-10V6l8-3Z"/><path d="m8.7 12 2.1 2.1 4.6-4.7"/></svg>
      <span>{children}</span>
    </div>
  )
}

export function RegisterOptionIcon({ kind }: { kind: string }) {
  const k = kind.toLowerCase()
  const body = k.includes('beaut') ? <><path d="M12 3c4 0 6 3.4 6 7.4 0 4.6-2.4 8.6-6 10.6-3.6-2-6-6-6-10.6C6 6.4 8 3 12 3Z"/><path d="M8 9c2-1 5-1 8 0M9 14c2 1 4 1 6 0"/></>
    : k.includes('hair') || k === 'salon' || k.includes('hair-salon') ? <><path d="m4 19 16-14"/><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m9 8 11 11"/></>
    : k.includes('massage') || k.includes('spa') ? <><circle cx="12" cy="5.5" r="2.5"/><path d="M7 21v-4a5 5 0 0 1 10 0v4M3 12c2 0 3 1.2 3 3M21 12c-2 0-3 1.2-3 3"/></>
    : k.includes('personal') || k.includes('trainer') ? <><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></>
    : k.includes('studio') || k.includes('gym') ? <><path d="M5 20h14M8 20l2-8M16 20l-2-8"/><rect x="8" y="3" width="8" height="9" rx="2"/><path d="m16 6 4-2v7l-4-2"/></>
    : k.includes('appointment') || k.includes('calendar') ? <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></>
    : k.includes('staff') || k.includes('user') || k.includes('team') ? <><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V20"/></>
    : k.includes('billing') || k.includes('fiscal') || k.includes('invoice') ? <><path d="M6 3h12v5H6zM5 8h14v13H5z"/><path d="M8 12h8M8 16h5"/></>
    : k.includes('course') || k.includes('group') ? <><path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/></>
    : k.includes('location') || k.includes('multi') ? <><path d="M12 21s7-5.4 7-12a7 7 0 1 0-14 0c0 6.6 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/></>
    : k.includes('consum') || k.includes('material') ? <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>
    : k.includes('no-show') || k.includes('show') || k.includes('absence') ? <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 14l6 6M15 14l-6 6"/></>
    : k.includes('entitle') || k.includes('benefit') || k.includes('gift') || k.includes('loyal') ? <><rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9v11M3 9h18v4H3zM12 9c-3 0-5-1.2-5-3 0-1.3 1-2 2.1-2C11 4 12 6 12 9ZM12 9c3 0 5-1.2 5-3 0-1.3-1-2-2.1-2C13 4 12 6 12 9Z"/></>
    : k.includes('payment') ? <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>
    : k.includes('reminder') || k.includes('notification') || k.includes('sms') ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>
    : k.includes('resource') || k.includes('space') ? <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M14 12h.01"/></>
    : k.includes('report') || k.includes('analytic') ? <><path d="M4 20V10M10 20V5M16 20v-8M22 20H2"/></>
    : k.includes('ai') || k.includes('voice') ? <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z"/><path d="M5 15v6M2 18h6"/></>
    : k.includes('integration') ? <><rect x="8" y="8" width="8" height="8" rx="2"/><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/></>
    : <><path d="M12 3v18M3 12h18"/></>
  return <svg viewBox="0 0 24 24" aria-hidden>{body}</svg>
}

export function RegisterBenefitsVisual({ locale }: { locale: string }) {
  const sl = locale === 'sl'
  return (
    <div className="register-account-right">
      <div className="register-product-visual" aria-hidden>
        <div className="register-visual-calendar" />
        <div className="register-visual-chip register-visual-chip--left"><strong>24</strong><span>{sl ? 'Zaposleni' : 'Team members'}</span></div>
        <div className="register-visual-chip register-visual-chip--right"><strong>+32%</strong><span>{sl ? 'Prihranek časa' : 'Time saved'}</span></div>
        <div className="register-visual-check">✓</div>
      </div>
      <div className="register-benefits">
        <h2>{sl ? 'Vse, kar potrebujete za uspešno poslovanje' : 'Everything you need to run your business'}</h2>
        <Benefit icon="users" title={sl ? 'Centralizirano upravljanje' : 'Centralized management'} text={sl ? 'Upravljajte zaposlene, storitve in stranke na enem mestu.' : 'Manage staff, services and clients in one place.'} />
        <Benefit icon="calendar" title={sl ? 'Pametno načrtovanje' : 'Smarter scheduling'} text={sl ? 'Optimizirajte urnik in zmanjšajte prazne termine.' : 'Optimize your schedule and reduce empty slots.'} />
        <Benefit icon="report" title={sl ? 'Poročila in vpogledi' : 'Reports and insights'} text={sl ? 'Spremljajte rast podjetja z naprednimi poročili.' : 'Track business growth with clear reporting.'} />
      </div>
    </div>
  )
}

function Benefit({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="register-benefit">
      <div className="register-benefit-icon"><RegisterOptionIcon kind={icon} /></div>
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  )
}
