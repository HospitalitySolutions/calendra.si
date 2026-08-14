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
  const k = kind.toLowerCase().replace(/[\s-]+/g, '_')
  const body =
    k.includes('hair') || k === 'salon'
      ? <><circle cx="7" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><path d="m10 8 10-4"/><path d="m10 16 10 4"/><path d="m11 6 9 12"/></>
      : k.includes('beauty')
        ? <><path d="M12 3c4 0 6 3.5 6 7.3 0 4.5-2.4 8.5-6 10.7-3.6-2.2-6-6.2-6-10.7C6 6.5 8 3 12 3Z"/><path d="M9 9c2-1 4-1 6 0"/><path d="M9.5 14c1.5 1 3.5 1 5 0"/></>
        : k.includes('massage')
          ? <><circle cx="12" cy="6" r="2.5"/><path d="M4 15c2.5 0 3.5 1.5 4 3h8c.5-1.5 1.5-3 4-3"/><path d="M5 18h14"/><path d="M7 12c1.5-1 3-1.5 5-1.5s3.5.5 5 1.5"/></>
          : k.includes('spa_sauna') || (k.includes('spa') && !k.includes('massage'))
            ? <><path d="M7 19h10a2 2 0 0 0 2-2v-2H5v2a2 2 0 0 0 2 2Z"/><path d="M8 11c0-1.5 1-2 1-3.5S8 5.5 8 4"/><path d="M12 11c0-1.5 1-2 1-3.5S12 5.5 12 4"/><path d="M16 11c0-1.5 1-2 1-3.5S16 5.5 16 4"/></>
            : k.includes('tattoo') || k.includes('piercing')
              ? <><path d="M4 19l6-6"/><path d="m9 14 6-6"/><path d="m13 5 6 6"/><path d="m11 7 6 6"/><path d="m6 17 2 2"/></>
              : k.includes('fitness_personal_training') || k.includes('personal_training') || k.includes('trainer') || k.includes('gym')
                ? <><path d="M3 10v4"/><path d="M6 8v8"/><path d="M18 8v8"/><path d="M21 10v4"/><path d="M6 12h12"/></>
                : k.includes('physical_therapy')
                  ? <><path d="M6 18h3l3-5h7"/><path d="M9 12h10"/><circle cx="8" cy="8" r="2.5"/><path d="M10 10.5 13 13"/></>
                  : k.includes('psychology') || k.includes('counselling') || k.includes('counseling') || k === 'therapy'
                    ? <><path d="M10 18c-3.5-1.7-6-5.1-6-9.2C4 5 6.7 3 10 3c3.2 0 5.5 2.1 5.5 4.9 0 1.8-.9 3.3-2.2 4.3"/><path d="M14 12c0 3.3 2.6 6 6 6"/><path d="M14 18v3l2.2-1.4"/></>
                    : k.includes('yoga') || k.includes('pilates')
                      ? <><path d="M12 5c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2Z"/><path d="M6 18c1.5-3 3.6-4.5 6-4.5s4.5 1.5 6 4.5"/><path d="M8 18h8"/><path d="M9.5 12 12 9.8 14.5 12"/></>
                      : k.includes('pet')
                        ? <><circle cx="7" cy="10" r="1.5"/><circle cx="11" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="19" cy="10" r="1.5"/><path d="M13 20c3 0 5-2.1 5-4.3 0-1.7-1.3-3.2-3-3.2-1.1 0-1.8.4-2 .7-.2-.3-.9-.7-2-.7-1.7 0-3 1.5-3 3.2C8 17.9 10 20 13 20Z"/></>
                        : k.includes('education') || k.includes('coaching')
                          ? <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H12v14H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M20 6.5A2.5 2.5 0 0 0 17.5 4H12v14h5.5A2.5 2.5 0 0 1 20 20.5Z"/></>
                          : k.includes('other')
                            ? <><rect x="4" y="4" width="5" height="5" rx="1.2"/><rect x="15" y="4" width="5" height="5" rx="1.2"/><rect x="4" y="15" width="5" height="5" rx="1.2"/><rect x="15" y="15" width="5" height="5" rx="1.2"/></>
                            : k.includes('appointment') || k.includes('calendar') ? <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></>
                            : k.includes('staff') || k.includes('user') || k.includes('team') ? <><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V20"/></>
                            : k.includes('billing') || k.includes('fiscal') || k.includes('invoice') ? <><path d="M6 3h12v5H6zM5 8h14v13H5z"/><path d="M8 12h8M8 16h5"/></>
                            : k.includes('course') || k.includes('group') ? <><path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/></>
                            : k.includes('location') || k.includes('multi') ? <><path d="M12 21s7-5.4 7-12a7 7 0 1 0-14 0c0 6.6 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/></>
                            : k.includes('consum') || k.includes('material') ? <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>
                            : k.includes('no_show') || k.includes('show') || k.includes('absence') ? <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 14l6 6M15 14l-6 6"/></>
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
