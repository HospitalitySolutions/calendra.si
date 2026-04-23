import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import loginLogo from '../assets/login-logo.png'
import { useToast } from '../components/Toast'
import { Field } from '../components/ui'
import { api } from '../api'
import { useLocale } from '../locale'
import { storeAuthenticatedSession } from '../lib/session'
import { registerPageStyles } from './registerPageStyles'
import { getBillingInterval, getEstimatedUserCount, parseRegisterSelection, selectionToSearch } from './registerFlow'
import {
  RegisterFooterChevron,
  RegisterFooterListIcon,
  buildSummary,
  formatEuro,
  getSelectionMonthlyAmounts,
  plans,
} from './RegisterPage'

const registerAccountPageStyles = `
  .register-flow.register-account-page .content {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 220px);
    padding-top: 36px;
    padding-bottom: 164px;
  }

  .register-flow.register-account-page .register-account-main {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .register-flow.register-account-page .register-account-page-stack {
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .register-flow.register-account-page .register-account-stepper-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 10px 14px;
    margin-bottom: 22px;
  }

  .register-flow.register-account-page .register-account-stepper-row .stepper {
    flex: 0 0 auto;
  }

  .register-flow.register-account-page .register-account-stepper-row .step {
    color: var(--muted);
    background: transparent;
  }

  .register-flow.register-account-page .register-account-stepper-row .step.step-done {
    background: #d4e4ff;
    color: #17253d;
    border: 1px solid #b8cffc;
  }

  .register-flow.register-account-page .register-account-stepper-row .step.step-current {
    background: #ebf2ff;
    color: var(--blue);
    border: 1px solid transparent;
  }

  .register-flow.register-account-page .register-account-card {
    width: min(100%, 760px);
    padding: 30px;
    display: grid;
    gap: 22px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(223, 231, 245, 0.95);
    box-shadow: 0 20px 48px rgba(34, 78, 160, 0.12);
  }

  .register-flow.register-account-page .register-account-trust,
  .register-flow.register-account-page .register-account-selection-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    padding: 9px 14px;
    border-radius: 999px;
    font-size: 0.88rem;
    font-weight: 900;
  }

  .register-flow.register-account-page .register-account-trust {
    background: #edf4ff;
    color: #2f6df6;
    border: 1px solid #d9e6ff;
  }

  .register-flow.register-account-page .register-account-header {
    display: grid;
    gap: 12px;
  }

  .register-flow.register-account-page .register-account-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .register-flow.register-account-page .register-account-title-block {
    display: grid;
    gap: 10px;
  }

  .register-flow.register-account-page .register-account-title {
    margin: 0;
    font-size: clamp(2rem, 3vw, 2.6rem);
    line-height: 0.98;
    letter-spacing: -0.055em;
    color: #17253d;
  }

  .register-flow.register-account-page .register-account-copy {
    margin: 0;
    color: #70809b;
    font-size: 1rem;
    line-height: 1.58;
    max-width: 560px;
  }

  .register-flow.register-account-page .register-account-selection-chip {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #dfe7f5;
    color: #47607f;
  }

  .register-flow.register-account-page .register-account-form-card {
    display: grid;
    gap: 18px;
    padding: 22px;
    border-radius: 24px;
    border: 1px solid #dbe6f7;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 248, 255, 0.96));
    box-shadow: 0 16px 34px rgba(47, 109, 246, 0.08);
  }

  .register-flow.register-account-page .register-account-social-button {
    width: 100%;
    padding: 14px 16px;
    border-radius: 999px;
    border: 1px solid #dadce0;
    background: #f1f3f4;
    color: #3c4043;
    font-size: 0.98rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
  }

  .register-flow.register-account-page .register-account-social-button:hover {
    background: #e8eaed;
    border-color: #c8ccd0;
    box-shadow: 0 1px 3px rgba(60, 64, 67, 0.14);
    transform: translateY(-1px);
  }

  .register-flow.register-account-page .register-account-google-mark {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
    background: #fff;
    border: 1px solid #e8eaed;
    box-shadow: 0 1px 2px rgba(60, 64, 67, 0.12);
  }

  .register-flow.register-account-page .register-account-google-mark svg {
    display: block;
  }

  .register-flow.register-account-page .register-account-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #70809b;
    font-size: 0.84rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .register-flow.register-account-page .register-account-divider::before,
  .register-flow.register-account-page .register-account-divider::after {
    content: '';
    height: 1px;
    background: #dfe7f5;
    flex: 1;
  }

  .register-flow.register-account-page .register-account-form {
    display: grid;
    gap: 14px;
  }

  .register-flow.register-account-page .register-account-field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .register-flow.register-account-page .register-account-field {
    display: grid;
    gap: 8px;
  }

  .register-flow.register-account-page .register-account-field label {
    font-size: 0.92rem;
    font-weight: 800;
    color: #2a3a56;
  }

  .register-flow.register-account-page .register-account-field input {
    width: 100%;
    height: 52px;
    border-radius: 16px;
    border: 1px solid #dfe7f5;
    background: rgba(255, 255, 255, 0.92);
    padding: 0 16px;
    font-size: 0.98rem;
    color: #17253d;
    outline: none;
    transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
  }

  .register-flow.register-account-page .register-account-field input:focus {
    border-color: #b8d0ff;
    box-shadow: 0 0 0 4px rgba(47, 109, 246, 0.10);
    background: #fff;
  }

  .register-flow.register-account-page .register-account-helper-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .register-flow.register-account-page .register-account-helper-text {
    color: #70809b;
    font-size: 0.88rem;
    line-height: 1.45;
  }

  .register-flow.register-account-page .register-account-link-button {
    border: 0;
    background: transparent;
    padding: 0;
    color: #2f6df6;
    font-weight: 800;
    font-size: 0.88rem;
    cursor: pointer;
  }

  .register-flow.register-account-page .register-account-consent {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 12px;
    margin: 0;
    text-align: left;
    cursor: pointer;
    color: #5a6b85;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .register-flow.register-account-page .register-account-consent input[type='checkbox'] {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin: 0;
    margin-top: 0.22em;
    border-radius: 4px;
    cursor: pointer;
    accent-color: #2f6df6;
  }

  .register-flow.register-account-page .register-account-consent-text {
    flex: 1 1 0;
    min-width: 0;
    display: block;
  }

  .register-flow.register-account-page .register-account-consent a {
    color: #2f6df6;
    text-decoration: none;
    font-weight: 800;
  }

  .register-flow.register-account-page .register-account-submit {
    width: 100%;
    height: 54px;
    border: 0;
    border-radius: 16px;
    background: linear-gradient(90deg, #2f6df6, #1f56d7);
    color: #fff;
    font-size: 1rem;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 12px 28px rgba(47, 109, 246, 0.18);
    transition: transform 180ms ease, filter 180ms ease;
  }

  .register-flow.register-account-page .register-account-submit:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.02);
  }

  .register-flow.register-account-page .register-account-submit:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .register-flow.register-account-page .register-account-back-plan {
    width: 100%;
    height: 54px;
    border-radius: 16px;
    border: 1px solid #dfe7f5;
    background: #fff;
    color: #17253d;
    font-size: 1rem;
    font-weight: 900;
    cursor: pointer;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .register-flow.register-account-page .register-account-back-plan:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 28px rgba(47, 109, 246, 0.1);
    border-color: #cfe0ff;
  }

  .register-flow.register-account-page .register-account-card .error,
  .register-flow.register-account-page .register-account-card .success {
    margin: 0;
  }

  .register-flow.register-account-page .register-footer-continue {
    display: none;
  }

  .register-flow.register-account-page .register-account-top-note {
    color: #70809b;
    font-size: 0.92rem;
    line-height: 1.45;
    margin: 0;
  }

  .register-flow.register-account-page .register-account-verify-badges {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 4px;
  }

  .register-flow.register-account-page .register-account-verify-badge {
    display: inline-flex;
    align-items: center;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .register-flow.register-account-page .register-account-verify-badge--blue {
    background: #edf4ff;
    color: #2f6df6;
    border: 1px solid #d9e6ff;
  }

  .register-flow.register-account-page .register-account-verify-badge--green {
    background: #ecfdf3;
    color: #15803d;
    border: 1px solid #bbf7d0;
  }

  .register-flow.register-account-page .register-account-verify-badge--gold {
    background: #fffbeb;
    color: #a16207;
    border: 1px solid #fde68a;
  }

  .register-flow.register-account-page .register-account-verify-card {
    display: grid;
    gap: 14px;
    padding: 22px;
    border-radius: 24px;
    border: 1px solid #dbe6f7;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 248, 255, 0.96));
    box-shadow: 0 16px 34px rgba(47, 109, 246, 0.08);
  }

  .register-flow.register-account-page .register-account-verify-next {
    margin: 0;
    font-size: 1rem;
    font-weight: 900;
    color: #17253d;
  }

  .register-flow.register-account-page .register-account-verify-hint {
    margin: 0;
    color: #70809b;
    font-size: 0.92rem;
    line-height: 1.5;
  }

  .register-flow.register-account-page .register-account-verify-email-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 999px;
    background: #fff;
    border: 1px solid #d9e6ff;
    font-size: 0.92rem;
    font-weight: 700;
    color: #17253d;
    width: fit-content;
    max-width: 100%;
  }

  @media (max-width: 1024px) {
    .register-flow.register-account-page .content {
      padding-top: 24px;
    }
  }

  @media (max-width: 860px) {
    .register-flow.register-account-page .register-account-card {
      padding: 22px 18px;
    }

    .register-flow.register-account-page .register-account-field-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .register-flow.register-account-page .content {
      align-items: flex-start;
      padding-bottom: 150px;
    }

    .register-flow.register-account-page .register-account-title-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .register-flow.register-account-page .register-account-form-card {
      padding: 18px;
    }
  }
`

type AccountPageCopy = {
  trust: string
  selectionChip: string
  title: string
  subtitle: string
  google: string
  divider: string
  workEmailLabel: string
  helperText: string
  alreadyHaveAccount: string
  consent: string
  continue: string
  back: string
  passwordHint: string
  annualBilling: string
  monthlyBilling: string
  verifyBadgeAccount: string
  verifyBadgeSent: string
  verifyBadgeExisting: string
  verifyTitle: string
  verifySubtitle: string
  verifyNextStep: string
  verifyHelp: string
  finishVerifyTitle: string
  finishVerifySubtitle: string
  finishVerifyNextStep: string
  finishVerifyHelp: string
  verifyResend: string
  verifyResending: string
  verifyUseOther: string
  termsRequired: string
  invalidWorkEmail: string
  sessionSaveFailed: string
  resetLinkSentHint: string
  emailAlreadyRegistered: string
  verifySubtitleIntent: string
  intentEmailSentToast: string
  registeredBadgeExists: string
  registeredTitle: string
  registeredSubtitle: string
  registeredNextStep: string
  registeredHelp: string
  registeredSignIn: string
  registeredResetPassword: string
  invalidBadge: string
  invalidTitle: string
  invalidSubtitle: string
  invalidNextStep: string
  invalidHelp: string
  invalidResend: string
}

const accountPageCopy: Record<'en' | 'sl', AccountPageCopy> = {
  en: {
    trust: 'Secure account setup',
    selectionChip: 'Plan selected',
    title: 'Account setup',
    subtitle: 'Continue with your work email or Google. Your selected plan and add-ons stay attached while you finish creating your account.',
    google: 'Signup with Google',
    divider: 'or',
    workEmailLabel: 'Work email *',
    helperText: 'You will set up your password after email verification if your account needs one.',
    alreadyHaveAccount: 'Already have an account?',
    consent: 'I agree to the Terms of Service and Privacy Policy, and I understand my selected plan will continue to the next steps of signup.',
    continue: 'Continue',
    back: 'Back to plan selection',
    passwordHint: 'The page now uses the same register shell, with the account setup card centered.',
    annualBilling: 'Annual billing',
    monthlyBilling: 'Monthly billing',
    verifyBadgeAccount: 'Account update',
    verifyBadgeSent: 'Verification sent',
    verifyBadgeExisting: 'Existing account found',
    verifyTitle: 'Verify your email to continue',
    verifySubtitle:
      'We sent a verification link to your email. After you confirm, continue in the app to finish billing details for your plan.',
    verifyNextStep: 'Next step',
    verifyHelp: 'If you did not receive the email, you can resend it or use another email.',
    finishVerifyTitle: 'Finish verifying your account',
    finishVerifySubtitle: 'This email was already used to start an account, but it has not been verified yet.',
    finishVerifyNextStep: 'Continue your setup',
    finishVerifyHelp: 'We can send a fresh verification email, or you can switch to another email.',
    verifyResend: 'Resend verification email',
    verifyResending: 'Sending…',
    verifyUseOther: 'Use another email',
    termsRequired: 'Please accept the terms to continue.',
    invalidWorkEmail: 'Enter a valid work email.',
    sessionSaveFailed: 'Could not save your signup session. Try again.',
    resetLinkSentHint: 'If an account exists, we sent a link.',
    emailAlreadyRegistered: 'An account with this email already exists.',
    verifySubtitleIntent:
      'We sent a link to confirm your email. Open it to create your workspace—no account exists until you confirm.',
    intentEmailSentToast: 'Check your email for a link to confirm and create your account.',
    registeredBadgeExists: 'Account already exists',
    registeredTitle: 'Sign in to continue your setup',
    registeredSubtitle: 'This email already belongs to a verified account. Sign in to continue where you left off.',
    registeredNextStep: 'Continue with your account',
    registeredHelp: 'Sign in to return to your existing account.',
    registeredSignIn: 'Sign in',
    registeredResetPassword: 'Reset password',
    invalidBadge: 'Verification link invalid',
    invalidTitle: 'This verification link is no longer valid',
    invalidSubtitle: 'The link may have expired or already been used. We can send you a fresh one.',
    invalidNextStep: 'Request a new link',
    invalidHelp: 'Send a new verification email, or switch to another email.',
    invalidResend: 'Send new verification email',
  },
  sl: {
    trust: 'Varna nastavitev računa',
    selectionChip: 'Paket izbran',
    title: 'Nastavitev računa',
    subtitle: 'Nadaljujte s poslovnim e-mailom ali Google računom. Vaš izbrani paket in dodatki ostanejo povezani med ustvarjanjem računa.',
    google: 'Registracija z Google',
    divider: 'ali',
    workEmailLabel: 'Poslovni e-mail *',
    helperText: 'Geslo boste nastavili po verifikaciji e-maila, če ga vaš račun potrebuje.',
    alreadyHaveAccount: 'Že imate račun?',
    consent: 'Strinjam se s Pogoji uporabe in Politiko zasebnosti ter razumem, da bo moj izbrani paket prenesen v naslednje korake registracije.',
    continue: 'Nadaljuj',
    back: 'Nazaj na izbiro paketa',
    passwordHint: 'Stran zdaj uporablja isto register ogrodje, kartica za nastavitev računa pa je na sredini.',
    annualBilling: 'Letno obračunavanje',
    monthlyBilling: 'Mesečno obračunavanje',
    verifyBadgeAccount: 'Posodobitev računa',
    verifyBadgeSent: 'Verifikacija poslana',
    verifyBadgeExisting: 'Obstoječ račun najden',
    verifyTitle: 'Potrdite e-mail za nadaljevanje',
    verifySubtitle:
      'Na vaš e-mail smo poslali povezavo za potrditev. Po potrditvi nadaljujte v aplikaciji z nastavitvijo obračuna za izbrani paket.',
    verifyNextStep: 'Naslednji korak',
    verifyHelp: 'Če e-maila niste prejeli, ga lahko znova pošljete ali uporabite drug naslov.',
    finishVerifyTitle: 'Dokončajte potrditev računa',
    finishVerifySubtitle: 'Ta e-mail je bil že uporabljen za začetek računa, vendar še ni potrjen.',
    finishVerifyNextStep: 'Nadaljujte z nastavitvijo',
    finishVerifyHelp: 'Lahko pošljemo nov verifikacijski e-mail ali izberete drug naslov.',
    verifyResend: 'Znova pošlji verifikacijski e-mail',
    verifyResending: 'Pošiljanje…',
    verifyUseOther: 'Uporabi drug e-mail',
    termsRequired: 'Strinjajte se s pogoji za nadaljevanje.',
    invalidWorkEmail: 'Vnesite veljaven poslovni e-mail.',
    sessionSaveFailed: 'Seje ni bilo mogoče shraniti. Poskusite znova.',
    resetLinkSentHint: 'Če račun obstaja, smo poslali povezavo.',
    emailAlreadyRegistered: 'Račun s tem e-mailom že obstaja.',
    verifySubtitleIntent:
      'Poslali smo povezavo za potrditev e-maila. Odprite jo za ustvaritev okolja—račun nastane šele po potrditvi.',
    intentEmailSentToast: 'Preverite e-pošto za povezavo za potrditev in ustvaritev računa.',
    registeredBadgeExists: 'Račun že obstaja',
    registeredTitle: 'Prijavite se za nadaljevanje',
    registeredSubtitle: 'Ta e-mail pripada že potrjenemu računu. Prijavite se in nadaljujte.',
    registeredNextStep: 'Nadaljujte z obstoječim računom',
    registeredHelp: 'Prijavite se, da se vrnete v svoj račun.',
    registeredSignIn: 'Prijava',
    registeredResetPassword: 'Ponastavi geslo',
    invalidBadge: 'Verifikacijska povezava ni veljavna',
    invalidTitle: 'Ta verifikacijska povezava ni več veljavna',
    invalidSubtitle: 'Povezava je morda potekla ali že uporabljena. Lahko pošljemo novo.',
    invalidNextStep: 'Zahtevaj novo povezavo',
    invalidHelp: 'Pošljite nov verifikacijski e-mail ali uporabite drug naslov.',
    invalidResend: 'Pošlji novo verifikacijsko povezavo',
  },
}

export function RegisterAccountPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, setLocale, t } = useLocale()
  const { showToast } = useToast()
  const selection = useMemo(() => parseRegisterSelection(location.search), [location.search])
  const [email, setEmail] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'form' | 'verify' | 'registered' | 'invalid'>('form')
  const [verifyScenario, setVerifyScenario] = useState<'new' | 'existing'>('new')
  const [verifyResendMode, setVerifyResendMode] = useState<'signupIntent' | 'passwordReset'>('passwordReset')
  const [verifyEmailAddr, setVerifyEmailAddr] = useState('')
  const [resending, setResending] = useState(false)
  const [registeredResetSending, setRegisteredResetSending] = useState(false)
  const [footerExpanded, setFooterExpanded] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactError, setContactError] = useState('')

  const copy = accountPageCopy[locale as 'en' | 'sl'] ?? accountPageCopy.en
  const packageName = selection.plan === 'basic' ? 'BASIC' : selection.plan === 'pro' ? 'PROFESSIONAL' : 'PREMIUM'
  const summary = useMemo(() => buildSummary(selection), [selection])
  const monthlyAmounts = useMemo(() => getSelectionMonthlyAmounts(selection), [selection])
  const websiteUrl = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.trim() || 'https://calendra.si'
  const contactSalesEmail = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || 'info@calendra.si'

  const footerPill = useMemo(() => {
    const plan = plans[selection.plan]
    const featureCount = plan.features.length
    const lineCount = summary.rows.length
    const extraLines = Math.max(0, lineCount - 1)
    const title = `${featureCount} plan feature${featureCount === 1 ? '' : 's'} · ${lineCount} estimate line${lineCount === 1 ? '' : 's'}`
    const subParts = [plan.name, selection.billing === 'annual' ? copy.annualBilling : copy.monthlyBilling]
    if (extraLines > 0) {
      subParts.push(`${extraLines} usage & add-on${extraLines === 1 ? '' : 's'}`)
    }
    return { title, sub: subParts.join(' · ') }
  }, [copy.annualBilling, copy.monthlyBilling, selection, summary])

  const peekAddonMonthly = useMemo(() => {
    if (selection.billing === 'annual') {
      return (monthlyAmounts.usersMonthly + monthlyAmounts.addonsMonthly) * 0.85 + monthlyAmounts.smsMonthly
    }
    return monthlyAmounts.usersMonthly + monthlyAmounts.smsMonthly + monthlyAmounts.addonsMonthly
  }, [monthlyAmounts, selection.billing])

  const usageAddonLineCount = useMemo(() => {
    let n = 0
    if (selection.additionalUsers > 1) n++
    if (selection.additionalSms > 0) n++
    if (selection.addons.voice) n++
    if (selection.addons.billing) n++
    if (selection.addons.whitelabel) n++
    return n
  }, [selection])

  const persistSignupSession = async (
    emailOverride?: string,
    opts?: { allowEmptyEmail?: boolean; rethrowOnError?: boolean },
  ) => {
    const addr = (emailOverride !== undefined ? emailOverride : email).trim().toLowerCase()
    const allowEmpty = opts?.allowEmptyEmail ?? false
    if (!allowEmpty && !addr) return
    try {
      await api.post('/auth/signup/pending-session', {
        email: addr,
        companyName: '',
        firstName: '',
        lastName: '',
        phone: null,
        packageName,
        userCount: getEstimatedUserCount(selection),
        smsCount: selection.additionalSms,
        spaceCount: null,
        billingInterval: getBillingInterval(selection),
        fiscalizationNeeded: false,
        returnSearch: location.search || '',
      })
    } catch (e) {
      if (opts?.rethrowOnError) throw e
      // session is optional for email-only signup; required before Google+register=1
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (q.get('invalidVerify') === '1') {
      const em = q.get('email')
      if (em) {
        setVerifyEmailAddr(em)
        setEmail(em)
      }
      setVerifyResendMode('signupIntent')
      setView('invalid')
      return
    }
    if (q.get('existingAccount') === '1') {
      const em = q.get('email')
      if (em) {
        setVerifyEmailAddr(em)
        setEmail(em)
        setView('registered')
      }
      return
    }
    if (q.get('finishVerify') === '1') {
      const em = q.get('email')
      if (em) {
        setVerifyEmailAddr(em)
        setEmail(em)
        setVerifyScenario('existing')
        setVerifyResendMode('passwordReset')
        setView('verify')
      }
      return
    }
    if (q.get('verifyEmail') === '1') {
      const em = q.get('email')
      if (em) {
        setVerifyEmailAddr(em)
        setEmail(em)
        setVerifyScenario('new')
        setVerifyResendMode(q.get('pendingAccountCreation') === '1' ? 'signupIntent' : 'passwordReset')
        setView('verify')
      }
    }
  }, [location.search])

  const navigateToFinishVerify = (addr: string) => {
    const q = new URLSearchParams(location.search.replace(/^\?/, ''))
    q.set('finishVerify', '1')
    q.delete('verifyEmail')
    q.delete('pendingAccountCreation')
    q.delete('existingAccount')
    q.set('email', addr)
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const navigateToVerify = (addr: string, opts?: { intentPending?: boolean }) => {
    setVerifyScenario('new')
    const q = new URLSearchParams(location.search.replace(/^\?/, ''))
    q.set('verifyEmail', '1')
    q.delete('finishVerify')
    q.delete('existingAccount')
    if (opts?.intentPending) {
      q.set('pendingAccountCreation', '1')
    } else {
      q.delete('pendingAccountCreation')
    }
    q.set('email', addr)
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const navigateToExistingAccount = (addr: string) => {
    const q = new URLSearchParams(location.search.replace(/^\?/, ''))
    q.set('existingAccount', '1')
    q.delete('verifyEmail')
    q.delete('finishVerify')
    q.delete('pendingAccountCreation')
    q.set('email', addr)
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const navigateToInvalidVerify = (addr: string) => {
    const q = new URLSearchParams(location.search.replace(/^\?/, ''))
    q.set('invalidVerify', '1')
    q.delete('verifyEmail')
    q.delete('finishVerify')
    q.delete('existingAccount')
    q.delete('invalidVerify')
    q.delete('pendingAccountCreation')
    q.set('email', addr)
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const openFinishVerify = (addr: string) => {
    setError('')
    setVerifyEmailAddr(addr)
    setEmail(addr)
    setVerifyScenario('existing')
    setVerifyResendMode('passwordReset')
    setView('verify')
    navigateToFinishVerify(addr)
  }

  const openRegisteredAccount = (addr: string) => {
    setError('')
    setVerifyEmailAddr(addr)
    setEmail(addr)
    setView('registered')
    navigateToExistingAccount(addr)
  }

  const openInvalidVerify = (addr: string) => {
    setError('')
    setVerifyEmailAddr(addr)
    setEmail(addr)
    setVerifyResendMode('signupIntent')
    setView('invalid')
    navigateToInvalidVerify(addr)
  }

  const submitSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!acceptedTerms) {
      setError(copy.termsRequired)
      return
    }

    const addr = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError(copy.invalidWorkEmail)
      return
    }

    setSubmitting(true)
    try {
      const { data: check } = await api.get<{
        available?: boolean
        pendingVerification?: boolean
        registeredAccountExists?: boolean
        email?: string
      }>('/auth/signup/email-available', { params: { email: addr } })
      if (check?.registeredAccountExists) {
        openRegisteredAccount(String(check.email || addr))
        return
      }
      if (check?.pendingVerification) {
        openFinishVerify(String(check.email || addr))
        return
      }

      await persistSignupSession(addr)
      const { data } = await api.post('/auth/signup', {
        companyName: '',
        firstName: '',
        lastName: '',
        email: addr,
        phone: null,
        packageName,
        userCount: getEstimatedUserCount(selection),
        smsCount: selection.additionalSms,
        billingInterval: getBillingInterval(selection),
        fiscalizationNeeded: false,
        returnSearch: location.search || '',
      })

      if (data?.token && data?.user) {
        storeAuthenticatedSession(data)
        window.location.reload()
        return
      }

      if (data?.pendingAccountCreation && data?.email) {
        setVerifyEmailAddr(String(data.email))
        setVerifyScenario('new')
        setVerifyResendMode('signupIntent')
        setView('verify')
        navigateToVerify(String(data.email), { intentPending: true })
        showToast('success', copy.intentEmailSentToast)
        return
      }

      if (data?.requiresPasswordSetup && data?.email) {
        setVerifyEmailAddr(String(data.email))
        setVerifyScenario('new')
        setVerifyResendMode('passwordReset')
        setView('verify')
        navigateToVerify(String(data.email))
        showToast('success', t('signupSuccess'))
        return
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const d = err.response?.data as {
          pendingVerification?: boolean
          registeredAccountExists?: boolean
          email?: string
          message?: string
        }
        if (d?.registeredAccountExists && d?.email) {
          openRegisteredAccount(String(d.email))
          return
        }
        if (d?.pendingVerification && d?.email) {
          openFinishVerify(String(d.email))
          return
        }
      }
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || t('signupFailed'))
      } else {
        setError(t('signupFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const sendRegisteredPasswordReset = async () => {
    if (!verifyEmailAddr.trim()) return
    setRegisteredResetSending(true)
    try {
      await api.post('/auth/forgot-password', { email: verifyEmailAddr.trim() })
      showToast('success', copy.resetLinkSentHint)
    } catch {
      showToast('success', copy.resetLinkSentHint)
    } finally {
      setRegisteredResetSending(false)
    }
  }

  const resendVerificationEmail = async () => {
    if (!verifyEmailAddr) return
    setResending(true)
    setError('')
    try {
      if (verifyResendMode === 'signupIntent') {
        await api.post('/auth/signup/resend-email-intent', { email: verifyEmailAddr })
        showToast('success', copy.intentEmailSentToast)
      } else {
        await api.post('/auth/forgot-password', { email: verifyEmailAddr })
        showToast('success', copy.resetLinkSentHint)
      }
    } catch {
      showToast('success', verifyResendMode === 'signupIntent' ? copy.intentEmailSentToast : copy.resetLinkSentHint)
    } finally {
      setResending(false)
    }
  }

  const startGoogleSignup = async () => {
    setError('')
    if (!acceptedTerms) {
      setError(copy.termsRequired)
      return
    }
    const optionalWork = email.trim().toLowerCase()
    if (optionalWork) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(optionalWork)) {
        setError(copy.invalidWorkEmail)
        return
      }
      try {
        const { data } = await api.get<{
          available?: boolean
          pendingVerification?: boolean
          registeredAccountExists?: boolean
          email?: string
        }>('/auth/signup/email-available', { params: { email: optionalWork } })
        if (data?.registeredAccountExists) {
          openRegisteredAccount(String(data.email || optionalWork))
          return
        }
        if (data?.pendingVerification) {
          openFinishVerify(String(data.email || optionalWork))
          return
        }
      } catch {
        setError(t('signupFailed'))
        return
      }
    }
    try {
      await persistSignupSession(optionalWork, { allowEmptyEmail: true, rethrowOnError: true })
    } catch {
      setError(copy.sessionSaveFailed)
      return
    }
    window.location.assign('/api/auth/google?register=1')
  }

  const useAnotherEmail = () => {
    const q = new URLSearchParams(location.search.replace(/^\?/, ''))
    q.delete('verifyEmail')
    q.delete('finishVerify')
    q.delete('existingAccount')
    q.delete('pendingAccountCreation')
    q.delete('email')
    const next = q.toString()
    navigate(next ? `/register/account?${next}` : '/register/account', { replace: true })
    setView('form')
    setVerifyScenario('new')
    setVerifyResendMode('passwordReset')
    setEmail('')
    setVerifyEmailAddr('')
  }

  const openContactModal = () => {
    setContactError('')
    setContactOpen(true)
  }

  const closeContactModal = () => {
    setContactOpen(false)
    setContactError('')
  }

  const submitContactModal = () => {
    const name = contactName.trim()
    const emailValue = contactEmail.trim()
    const phoneValue = contactPhone.trim()
    const message = contactMessage.trim()
    if (!name || !emailValue || !message) {
      setContactError('Please fill in your name, email, and message.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setContactError('Please enter a valid email address.')
      return
    }
    const subject = encodeURIComponent('Calendra — Custom solution inquiry')
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${emailValue}\nPhone: ${phoneValue || '—'}\n\n${message}`)
    window.location.href = `mailto:${contactSalesEmail}?subject=${subject}&body=${body}`
    showToast('success', 'Opening your email client…')
    closeContactModal()
    setContactName('')
    setContactEmail('')
    setContactPhone('')
    setContactMessage('')
  }

  return (
    <div className="register-flow register-account-page">
      <style>{registerPageStyles + registerAccountPageStyles}</style>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img className="brand-logo" src={loginLogo} alt="Calendra — Simplify Your Booking" />
          </div>

          <div className="top-actions">
            <div className="lang-switch" role="group" aria-label={t('language')}>
              <button
                type="button"
                className={locale === 'sl' ? 'lang-switch-btn active' : 'lang-switch-btn'}
                aria-pressed={locale === 'sl'}
                onClick={() => setLocale('sl')}
              >
                SL
              </button>
              <button
                type="button"
                className={locale === 'en' ? 'lang-switch-btn active' : 'lang-switch-btn'}
                aria-pressed={locale === 'en'}
                onClick={() => setLocale('en')}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        <main className="content">
          <h1 className="register-sr-only">Calendra — account setup</h1>
          <div className="register-account-main">
            <div className="register-account-page-stack">
              <div className="register-stepper-row register-account-stepper-row">
                <div className="stepper" aria-label="Registration progress">
                  <div className="step step-done">1 Plan Selection ✓</div>
                  <div className="step step-current">2 Account Setup</div>
                  <div className="step">3 Billing Details</div>
                </div>
              </div>
              <section className="panel register-account-card">
              {view === 'invalid' ? (
                <>
                  <div className="register-account-verify-badges">
                    <span className="register-account-verify-badge register-account-verify-badge--blue">{copy.verifyBadgeAccount}</span>
                    <span className="register-account-verify-badge register-account-verify-badge--gold">{copy.invalidBadge}</span>
                  </div>

                  <div className="register-account-header">
                    <div className="register-account-title-row">
                      <div className="register-account-title-block">
                        <h1 className="register-account-title">{copy.invalidTitle}</h1>
                        <p className="register-account-copy">{copy.invalidSubtitle}</p>
                      </div>
                    </div>
                  </div>

                  <div className="register-account-verify-card">
                    <p className="register-account-verify-next">{copy.invalidNextStep}</p>
                    <p className="register-account-verify-hint">{copy.invalidHelp}</p>
                    <div className="register-account-verify-email-pill">
                      <span aria-hidden>✉</span>
                      <span>{verifyEmailAddr}</span>
                    </div>
                    {error ? <div className="error">{error}</div> : null}
                    <button
                      type="button"
                      className="register-account-submit"
                      disabled={resending}
                      onClick={() => void resendVerificationEmail()}
                    >
                      {resending ? copy.verifyResending : copy.invalidResend}
                    </button>
                    <button type="button" className="register-account-back-plan" onClick={useAnotherEmail}>
                      {copy.verifyUseOther}
                    </button>
                  </div>
                </>
              ) : view === 'registered' ? (
                <>
                  <div className="register-account-verify-badges">
                    <span className="register-account-verify-badge register-account-verify-badge--blue">{copy.verifyBadgeAccount}</span>
                    <span className="register-account-verify-badge register-account-verify-badge--gold">{copy.registeredBadgeExists}</span>
                  </div>

                  <div className="register-account-header">
                    <div className="register-account-title-row">
                      <div className="register-account-title-block">
                        <h1 className="register-account-title">{copy.registeredTitle}</h1>
                        <p className="register-account-copy">{copy.registeredSubtitle}</p>
                      </div>
                    </div>
                  </div>

                  <div className="register-account-verify-card">
                    <p className="register-account-verify-next">{copy.registeredNextStep}</p>
                    <p className="register-account-verify-hint">{copy.registeredHelp}</p>
                    <div className="register-account-verify-email-pill">
                      <span aria-hidden>✉</span>
                      <span>{verifyEmailAddr}</span>
                    </div>
                    <button
                      type="button"
                      className="register-account-submit"
                      onClick={() => navigate(`/login?email=${encodeURIComponent(verifyEmailAddr)}`)}
                    >
                      {copy.registeredSignIn}
                    </button>
                    <button
                      type="button"
                      className="register-account-back-plan"
                      disabled={registeredResetSending}
                      onClick={() => void sendRegisteredPasswordReset()}
                    >
                      {registeredResetSending ? copy.verifyResending : copy.registeredResetPassword}
                    </button>
                  </div>
                </>
              ) : view === 'verify' ? (
                <>
                  <div className="register-account-verify-badges">
                    <span className="register-account-verify-badge register-account-verify-badge--blue">{copy.verifyBadgeAccount}</span>
                    {verifyScenario === 'existing' ? (
                      <span className="register-account-verify-badge register-account-verify-badge--gold">{copy.verifyBadgeExisting}</span>
                    ) : (
                      <span className="register-account-verify-badge register-account-verify-badge--green">{copy.verifyBadgeSent}</span>
                    )}
                  </div>

                  <div className="register-account-header">
                    <div className="register-account-title-row">
                      <div className="register-account-title-block">
                        <h1 className="register-account-title">
                          {verifyScenario === 'existing' ? copy.finishVerifyTitle : copy.verifyTitle}
                        </h1>
                        <p className="register-account-copy">
                          {verifyScenario === 'existing'
                            ? copy.finishVerifySubtitle
                            : verifyResendMode === 'signupIntent'
                              ? copy.verifySubtitleIntent
                              : copy.verifySubtitle}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="register-account-verify-card">
                    <p className="register-account-verify-next">
                      {verifyScenario === 'existing' ? copy.finishVerifyNextStep : copy.verifyNextStep}
                    </p>
                    <p className="register-account-verify-hint">
                      {verifyScenario === 'existing' ? copy.finishVerifyHelp : copy.verifyHelp}
                    </p>
                    <div className="register-account-verify-email-pill">
                      <span aria-hidden>✉</span>
                      <span>{verifyEmailAddr}</span>
                    </div>
                    {error ? <div className="error">{error}</div> : null}
                    <button
                      type="button"
                      className="register-account-submit"
                      disabled={resending}
                      onClick={() => void resendVerificationEmail()}
                    >
                      {resending ? copy.verifyResending : copy.verifyResend}
                    </button>
                    <button type="button" className="register-account-back-plan" onClick={useAnotherEmail}>
                      {copy.verifyUseOther}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="register-account-trust">{copy.trust}</div>

                  <div className="register-account-header">
                    <div className="register-account-title-row">
                      <div className="register-account-title-block">
                        <div className="register-account-selection-chip">{copy.selectionChip}</div>
                        <h1 className="register-account-title">{copy.title}</h1>
                        <p className="register-account-copy">{copy.subtitle}</p>
                      </div>
                    </div>
                  </div>

                  <div className="register-account-form-card">
                    <form className="register-account-form" onSubmit={submitSignup}>
                      <div className="register-account-field">
                        <label htmlFor="register-account-email">{copy.workEmailLabel}</label>
                        <input
                          id="register-account-email"
                          name="signupEmail"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('signupEmail')}
                          type="email"
                          required
                        />
                      </div>

                      <div className="register-account-divider">{copy.divider}</div>

                      <button className="register-account-social-button" type="button" onClick={() => void startGoogleSignup()}>
                        <span className="register-account-google-mark" aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.86 2.7-6.62Z"
                              fill="#4285F4"
                            />
                            <path
                              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.72H.96v2.34A9 9 0 0 0 9 18Z"
                              fill="#34A853"
                            />
                            <path
                              d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.6.1-1.2.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.34Z"
                              fill="#FBBC05"
                            />
                            <path
                              d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A8.95 8.95 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.34C4.65 5.16 6.64 3.58 9 3.58Z"
                              fill="#EA4335"
                            />
                          </svg>
                        </span>
                        <span>{copy.google}</span>
                      </button>

                      <div className="register-account-helper-row">
                        <div className="register-account-helper-text">{copy.helperText}</div>
                        <button className="register-account-link-button" type="button" onClick={() => navigate('/login')}>
                          {copy.alreadyHaveAccount}
                        </button>
                      </div>

                      <label className="register-account-consent">
                        <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
                        <span className="register-account-consent-text">{copy.consent}</span>
                      </label>

                      {error ? <div className="error">{error}</div> : null}

                      <button type="submit" disabled={submitting} className="register-account-submit">
                        {submitting ? t('signupSubmitting') : copy.continue}
                      </button>

                      <button
                        type="button"
                        className="register-account-back-plan"
                        onClick={() => navigate(`/register?${selectionToSearch(selection)}`)}
                      >
                        {copy.back}
                      </button>
                    </form>
                  </div>
                </>
              )}
              </section>
            </div>
          </div>
        </main>
      </div>

      <footer className={`register-fixed-footer${footerExpanded ? ' is-expanded' : ''}`} role="contentinfo">
        <div className={`register-fixed-footer-inner register-footer-panel${footerExpanded ? ' is-expanded' : ''}`}>
          <div className="register-footer-toolbar">
            <div className="register-footer-back">
              <button className="back-link" type="button" onClick={() => window.location.assign(websiteUrl)}>← Back to website</button>
            </div>

            <button type="button" className="custom-cta custom-cta--footer-toolbar" onClick={openContactModal}>
              Need a custom solution? Contact us
            </button>

            <div className="register-footer-center-cluster">
              <div className="register-footer-toolbar-mid">
                <button
                  type="button"
                  className="register-footer-pill"
                  aria-expanded={footerExpanded}
                  aria-controls="register-footer-details"
                  aria-label={footerExpanded ? 'Hide estimate details' : 'Show estimate details'}
                  onClick={() => setFooterExpanded((v) => !v)}
                >
                  <span className="register-footer-pill-icon" aria-hidden>
                    <RegisterFooterListIcon />
                  </span>
                  <span className="register-footer-pill-text">
                    <strong className="register-footer-pill-title">{footerPill.title}</strong>
                    <span className="register-footer-pill-sub">{footerPill.sub}</span>
                  </span>
                  <span className="register-footer-pill-total-inline">
                    <span className="register-footer-total-label">Est. total</span>
                    <strong className="register-footer-total-value">{summary.totalPrimary}</strong>
                  </span>
                  <span className="register-footer-pill-chevron" aria-hidden>
                    <RegisterFooterChevron up={footerExpanded} />
                  </span>
                </button>
              </div>
            </div>

            <div className="register-footer-continue" aria-hidden />
          </div>

          {footerExpanded ? (
            <div className="register-footer-expanded" id="register-footer-details">
              <div className="register-footer-peek">
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">Plan</span>
                  <strong className="register-footer-peek-name">{plans[selection.plan].name}</strong>
                  <span className="register-footer-peek-value">{summary.rows[0]?.value ?? '—'}</span>
                </div>
                <div className="register-footer-peek-plus" aria-hidden>
                  +
                </div>
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">Usage &amp; add-ons</span>
                  <strong className="register-footer-peek-name">
                    {usageAddonLineCount} {usageAddonLineCount === 1 ? 'item' : 'items'}
                  </strong>
                  <span className="register-footer-peek-value">{formatEuro(peekAddonMonthly)}/mo</span>
                </div>
              </div>

              <div className="register-footer-detail-card">
                <h3 className="register-footer-detail-title">Estimate breakdown</h3>
                <ul className="register-footer-detail-list">
                  {summary.rows.map((row) => (
                    <li key={`${row.label}-${row.value}`} className="register-footer-detail-row">
                      <span className="register-footer-detail-check" aria-hidden>✓</span>
                      <span className="register-footer-detail-label">{row.label}</span>
                      <strong className="register-footer-detail-price">{row.value}</strong>
                    </li>
                  ))}
                </ul>
                <div className="register-footer-detail-foot">
                  {summary.annualSavingsYr != null && summary.annualSavingsYr > 0 ? (
                    <span className="register-footer-save-badge">
                      You save {formatEuro(summary.annualSavingsYr)}/yr (15%)
                    </span>
                  ) : null}
                  <div className="register-footer-detail-total">
                    <span className="register-footer-detail-total-label">Est. total</span>
                    <strong className="register-footer-detail-total-value">{summary.totalPrimary}</strong>
                  </div>
                </div>
              </div>

              <button type="button" className="register-footer-hide-link" onClick={() => setFooterExpanded(false)}>
                Hide details
                <RegisterFooterChevron up />
              </button>
            </div>
          ) : null}
        </div>
      </footer>

      {contactOpen ? (
        <div className="register-contact-modal-root" role="presentation">
          <button type="button" className="register-contact-modal-backdrop" aria-label="Close contact form" onClick={closeContactModal} />
          <div
            className="register-contact-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-contact-title"
          >
            <h2 id="register-contact-title" className="register-contact-modal-title">Contact us</h2>
            <p className="register-contact-modal-intro">Tell us what you need. We will follow up by email.</p>
            <div className="register-contact-form stack gap-md">
              <Field label="Name">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label="Email">
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Phone" hint="Optional">
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} autoComplete="tel" />
              </Field>
              <Field label="Message">
                <textarea rows={4} value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} placeholder="Describe your needs…" />
              </Field>
              {contactError ? <p className="register-contact-error" role="alert">{contactError}</p> : null}
            </div>
            <div className="register-contact-modal-actions">
              <button type="button" className="register-contact-cancel" onClick={closeContactModal}>
                Cancel
              </button>
              <button type="button" className="register-contact-submit" onClick={submitContactModal}>
                Send via email
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
