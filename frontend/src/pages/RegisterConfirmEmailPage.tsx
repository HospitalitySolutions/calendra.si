import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import loginLogo from '../assets/login-logo.png'
import { api } from '../api'
import { useToast } from '../components/Toast'
import { Field } from '../components/ui'
import { useLocale } from '../locale'
import { storeAuthenticatedSession } from '../lib/session'
import { parseRegisterSelection, selectionToSearch } from './registerFlow'
import {
  RegisterFooterChevron,
  RegisterFooterListIcon,
  buildSummary,
  formatEuro,
  getSelectionMonthlyAmounts,
  plans,
} from './RegisterPage'
import { registerPageStyles } from './registerPageStyles'

const confirmEmailStyles = `
  .register-confirm-shell .register-account-card {
    width: min(100%, 760px);
    display: grid;
    gap: 22px;
    padding: 30px;
  }
  .register-flow.register-account-page.register-confirm-shell .register-account-card {
    margin-top: auto;
    margin-bottom: auto;
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
  .register-flow.register-account-page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }
  .register-flow.register-account-page .app {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
  }
  .register-flow.register-account-page .content {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    padding: 36px 28px 164px;
    min-width: 0;
  }
  .register-flow.register-account-page:has(.register-fixed-footer.is-expanded) .content {
    padding-bottom: clamp(280px, 52vh, 520px);
  }
  .register-flow.register-account-page .register-account-main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
  }
  .register-flow.register-account-page .register-account-page-stack {
    width: 100%;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 0;
  }
  .register-flow.register-account-page .register-account-stepper-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 10px 14px;
    margin-bottom: 18px;
    flex-shrink: 0;
    align-self: flex-start;
    width: auto;
    max-width: 100%;
  }
  .register-flow.register-account-page.register-confirm-shell .register-footer-continue { display: none; }
  .register-flow.register-account-page.register-confirm-shell .register-account-stepper-row .step.step-done {
    background: #d4e4ff;
    color: #17253d;
    border: 1px solid #b8cffc;
  }
  .register-flow.register-account-page.register-confirm-shell .register-account-stepper-row .step.step-current {
    background: #ebf2ff;
    color: var(--blue);
    border: 1px solid transparent;
  }
  .register-confirm-billing-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
    width: 100%;
    max-width: 1180px;
  }
  .register-confirm-billing-panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 28px;
    border-radius: 28px;
    border: 1px solid rgba(223, 231, 245, 0.95);
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 16px 34px rgba(47, 109, 246, 0.08);
    min-width: 0;
  }
  .register-confirm-billing-trust {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    padding: 9px 14px;
    border-radius: 999px;
    font-size: 0.88rem;
    font-weight: 900;
    background: #f4f8ff;
    border: 1px solid #e2eafb;
    color: #4b5e81;
  }
  .register-confirm-billing-eyebrow {
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    font-weight: 900;
    font-size: 0.86rem;
    background: #ebf2ff;
    color: var(--blue);
    width: fit-content;
  }
  .register-confirm-billing-headline { margin: 0; font-size: clamp(1.65rem, 2.4vw, 2.15rem); line-height: 1.02; letter-spacing: -0.05em; color: #17253d; }
  .register-confirm-billing-sub { margin: 0; color: #70809b; font-size: 1rem; line-height: 1.58; }
  .register-confirm-billing-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .register-confirm-billing-field { display: grid; gap: 8px; }
  .register-confirm-billing-field label { font-size: 0.92rem; font-weight: 800; color: #2a3a56; }
  .register-confirm-billing-field input {
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
  .register-confirm-billing-field input:focus {
    border-color: #b8d0ff;
    box-shadow: 0 0 0 4px rgba(47, 109, 246, 0.1);
    background: #fff;
  }
  .register-confirm-billing-pay-title { margin: 0; font-size: 1.38rem; letter-spacing: -0.04em; color: #17253d; }
  .register-confirm-billing-method-grid { display: grid; gap: 14px; }
  .register-confirm-billing-method {
    display: grid;
    gap: 14px;
    padding: 18px;
    border-radius: 24px;
    border: 1px solid #dbe6f7;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(239, 245, 255, 0.94));
    box-shadow: 0 10px 28px rgba(58, 89, 150, 0.06);
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }
  .register-confirm-billing-method:hover,
  .register-confirm-billing-method.is-active {
    transform: translateY(-2px);
    border-color: #cddcff;
    box-shadow: 0 18px 36px rgba(47, 109, 246, 0.14);
  }
  .register-confirm-billing-method.is-upcoming {
    cursor: default;
    opacity: 0.82;
    box-shadow: none;
  }
  .register-confirm-billing-method.is-upcoming:hover { transform: none; border-color: #dbe6f7; box-shadow: none; }
  .register-confirm-billing-method-top { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
  .register-confirm-billing-method-row { display: flex; gap: 14px; min-width: 0; align-items: flex-start; }
  .register-confirm-billing-radio {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 2px solid #c4d0e6;
    background: #fff;
    flex-shrink: 0;
    margin-top: 10px;
  }
  .register-confirm-billing-method.is-active .register-confirm-billing-radio {
    border-color: var(--blue);
    box-shadow: inset 0 0 0 5px var(--blue);
  }
  .register-confirm-billing-method-icon {
    width: 50px;
    height: 50px;
    border-radius: 18px;
    display: grid;
    place-items: center;
    background: linear-gradient(180deg, #f4f8ff, #e8f0ff);
    color: var(--blue);
    border: 1px solid #dbe6fb;
    flex-shrink: 0;
  }
  .register-confirm-billing-method-icon svg { width: 28px; height: 28px; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
  .register-confirm-billing-method-title strong { display: block; font-size: 1rem; letter-spacing: -0.03em; color: #17253d; }
  .register-confirm-billing-method-title span { display: block; color: #70809b; font-size: 0.88rem; line-height: 1.45; margin-top: 4px; }
  .register-confirm-billing-badge {
    padding: 6px 11px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 900;
    background: #eafaf0;
    color: #1f8b4c;
    border: 1px solid #cfead8;
    white-space: nowrap;
  }
  .register-confirm-billing-badge--muted {
    background: #fff4d7;
    color: #8a6200;
    border-color: #fde68a;
  }
  .register-confirm-billing-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .register-confirm-billing-chip {
    padding: 7px 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #e3ebf8;
    font-size: 0.8rem;
    font-weight: 800;
    color: #43516c;
  }
  .register-confirm-billing-brands { display: flex; flex-wrap: wrap; gap: 8px; }
  .register-confirm-billing-brand {
    min-width: 54px;
    height: 30px;
    padding: 0 9px;
    border-radius: 9px;
    border: 1px solid #dfe7f5;
    background: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #43516c;
    font-size: 0.72rem;
    font-weight: 950;
  }
  .register-confirm-billing-stripe-note { font-size: 0.78rem; font-weight: 950; color: #635bff; }
  .register-confirm-billing-expand {
    display: none;
    gap: 14px;
    padding-top: 4px;
  }
  .register-confirm-billing-expand.is-visible { display: grid; }
  .register-confirm-billing-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .register-confirm-billing-detail {
    padding: 14px;
    border-radius: 16px;
    border: 1px solid #dbe6f7;
    background: rgba(255, 255, 255, 0.92);
  }
  .register-confirm-billing-detail strong {
    display: block;
    font-size: 0.8rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #70809b;
    margin-bottom: 6px;
  }
  .register-confirm-billing-detail span { font-weight: 800; color: #17253d; word-break: break-word; }
  .register-confirm-billing-mini {
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid #e7eef9;
    color: #70809b;
    font-size: 0.9rem;
    line-height: 1.45;
  }
  .register-confirm-billing-consent {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    color: #70809b;
    font-size: 0.9rem;
    line-height: 1.45;
    cursor: pointer;
  }
  .register-confirm-billing-consent input { margin-top: 3px; accent-color: var(--blue); }
  .register-confirm-billing-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; margin-top: 6px; }
  .register-confirm-billing-secondary {
    min-height: 52px;
    padding: 0 18px;
    border-radius: 16px;
    border: 1px solid #dfe7f5;
    background: rgba(255, 255, 255, 0.88);
    color: #70809b;
    font-size: 0.96rem;
    font-weight: 900;
    cursor: pointer;
  }
  .register-confirm-billing-primary {
    min-height: 52px;
    padding: 0 22px;
    border-radius: 16px;
    border: 0;
    background: linear-gradient(90deg, #2f6df6, #1f56d7);
    color: #fff;
    font-size: 0.96rem;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 12px 28px rgba(47, 109, 246, 0.18);
  }
  .register-confirm-billing-primary:disabled { opacity: 0.65; cursor: wait; }
  .register-confirm-billing-paypal-pill {
    min-width: 92px;
    height: 42px;
    padding: 0 14px;
    border-radius: 14px;
    border: 1px solid #dfe7f5;
    background: rgba(255, 255, 255, 0.96);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-style: italic;
    color: #003087;
    font-size: 0.95rem;
  }
  .register-confirm-billing-paypal-pill .pay { color: #0070e0; }
  @media (max-width: 960px) {
    .register-confirm-billing-hero { grid-template-columns: 1fr; }
    .register-confirm-billing-grid2,
    .register-confirm-billing-detail-grid { grid-template-columns: 1fr; }
    .register-confirm-billing-actions { flex-direction: column-reverse; align-items: stretch; }
    .register-confirm-billing-primary,
    .register-confirm-billing-secondary { width: 100%; }
  }
`

type ConfirmTokenKind = 'intent' | 'reset'

type FlowStep = 'password' | 'billing'

type PaymentMethod = 'bank' | 'card' | ''

type CompleteEmailResponse = {
  user?: unknown
  token?: string
  returnSearch?: string
}

const footerPlanCopy: Record<'en' | 'sl', { annual: string; monthly: string }> = {
  en: { annual: 'Annual billing', monthly: 'Monthly billing' },
  sl: { annual: 'Letno obračunavanje', monthly: 'Mesečno obračunavanje' },
}

const billingStrings: Record<
  'en' | 'sl',
  {
    trust: string
    eyebrow: string
    headline: string
    sub: string
    firstName: string
    lastName: string
    company: string
    vat: string
    address: string
    postal: string
    city: string
    paymentTitle: string
    paymentSub: string
    bankTitle: string
    bankSub: string
    bankChip1: string
    bankChip2: string
    cardTitle: string
    cardSub: string
    paypalTitle: string
    paypalSub: string
    upcoming: string
    available: string
    stripePowered: string
    bankDetailsTitle: string
    bankDetailsSub: string
    recipient: string
    iban: string
    bic: string
    reference: string
    purpose: string
    purposeVal: string
    amount: string
    cardBoxTitle: string
    cardBoxSub: string
    cardholder: string
    cardNumber: string
    expiry: string
    cvc: string
    cardNote: string
    consent: string
    backPlan: string
    submit: string
    selectPayment: string
    fillCard: string
  }
> = {
  en: {
    trust: 'Secure billing step',
    eyebrow: 'Billing details',
    headline: 'Confirm billing and payment',
    sub: 'Enter the billing profile for your workspace, then choose how you want to pay.',
    firstName: 'First name *',
    lastName: 'Last name *',
    company: 'Company name / Billing entity',
    vat: 'VAT ID',
    address: 'Billing address',
    postal: 'Postal code',
    city: 'City',
    paymentTitle: 'Payment method',
    paymentSub: 'Choose bank transfer or card. Card payments are processed securely by Stripe.',
    bankTitle: 'Bank transfer',
    bankSub: 'Pay from your banking app using the payment details we show after you choose this option.',
    bankChip1: 'Invoice-friendly',
    bankChip2: 'QR-ready',
    cardTitle: 'Credit or debit card',
    cardSub: 'Visa, Mastercard, Amex, and Diners supported.',
    paypalTitle: 'PayPal',
    paypalSub: 'PayPal checkout will be available in a later release.',
    upcoming: 'Upcoming',
    available: 'Available',
    stripePowered: 'Powered by Stripe',
    bankDetailsTitle: 'Bank transfer details',
    bankDetailsSub: 'Use these details in your bank app after you continue. Reference will be finalized on the next screen.',
    recipient: 'Recipient',
    iban: 'IBAN',
    bic: 'BIC / SWIFT',
    reference: 'Reference',
    purpose: 'Purpose',
    purposeVal: 'Calendra subscription',
    amount: 'Amount',
    cardBoxTitle: 'Card details',
    cardBoxSub: 'Required when paying by card.',
    cardholder: 'Cardholder name *',
    cardNumber: 'Card number *',
    expiry: 'Expiry *',
    cvc: 'CVC *',
    cardNote: 'Card data is sent to Stripe. Calendra does not store your full card number.',
    consent: 'I confirm that my billing details are correct and I agree to the Terms of Service, Privacy Policy, and subscription billing terms.',
    backPlan: '← Edit plan selection',
    submit: 'Continue to workspace',
    selectPayment: 'Select a payment method to continue.',
    fillCard: 'Please complete all card fields.',
  },
  sl: {
    trust: 'Varen korak obračuna',
    eyebrow: 'Podatki za obračun',
    headline: 'Potrdite obračun in plačilo',
    sub: 'Vnesite obračunski profil delovnega prostora in izberite način plačila.',
    firstName: 'Ime *',
    lastName: 'Priimek *',
    company: 'Ime podjetja / obračunski subjekt',
    vat: 'ID za DDV',
    address: 'Naslov za račun',
    postal: 'Poštna številka',
    city: 'Mesto',
    paymentTitle: 'Način plačila',
    paymentSub: 'Izberite bančno nakazilo ali kartico. Plačila s kartico varno obdeluje Stripe.',
    bankTitle: 'Bančno nakazilo',
    bankSub: 'Plačajte iz bančne aplikacije s podatki, ki jih prikažemo po izbiri te možnosti.',
    bankChip1: 'Primerno za račun',
    bankChip2: 'Pripravljeno za QR',
    cardTitle: 'Kreditna ali debetna kartica',
    cardSub: 'Podprte so Visa, Mastercard, Amex in Diners.',
    paypalTitle: 'PayPal',
    paypalSub: 'PayPal blagajna bo na voljo v poznejši izdaji.',
    upcoming: 'Kmalu',
    available: 'Na voljo',
    stripePowered: 'Omogoča Stripe',
    bankDetailsTitle: 'Podatki za bančno nakazilo',
    bankDetailsSub: 'Te podatke uporabite v bančni aplikaciji po nadaljevanju. Referenca bo dokončana v naslednjem koraku.',
    recipient: 'Prejemnik',
    iban: 'IBAN',
    bic: 'BIC / SWIFT',
    reference: 'Referenca',
    purpose: 'Namen',
    purposeVal: 'Naročnina Calendra',
    amount: 'Znesek',
    cardBoxTitle: 'Podatki kartice',
    cardBoxSub: 'Obvezno pri plačilu s kartico.',
    cardholder: 'Ime imetnika kartice *',
    cardNumber: 'Številka kartice *',
    expiry: 'Veljavnost *',
    cvc: 'CVC *',
    cardNote: 'Podatki kartice se pošljejo Stripe. Calendra ne shranjuje polne številke kartice.',
    consent: 'Potrjujem pravilnost podatkov za obračun ter se strinjam s Pogoji uporabe, Politiko zasebnosti in pogoji obračunavanja naročnine.',
    backPlan: '← Uredi izbiro paketa',
    submit: 'Nadaljuj v delovni prostor',
    selectPayment: 'Izberite način plačila.',
    fillCard: 'Izpolnite vsa polja kartice.',
  },
}

export function RegisterConfirmEmailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, setLocale, t } = useLocale()
  const { showToast } = useToast()
  const [params] = useSearchParams()
  const token = useMemo(() => params.get('token')?.trim() ?? '', [params])
  const fallbackEmail = useMemo(() => params.get('email')?.trim().toLowerCase() ?? '', [params])
  const [email, setEmail] = useState(fallbackEmail)
  const tokenKindRef = useRef<ConfirmTokenKind | null>(null)
  const [validating, setValidating] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [flowStep, setFlowStep] = useState<FlowStep>('password')
  const [savedReturnSearch, setSavedReturnSearch] = useState('')
  const [footerExpanded, setFooterExpanded] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactError, setContactError] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [vatId, setVatId] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('')
  const [cardholderName, setCardholderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [billingConsent, setBillingConsent] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [billingSubmitting, setBillingSubmitting] = useState(false)

  const lang = (locale === 'sl' ? 'sl' : 'en') as 'en' | 'sl'
  const bc = billingStrings[lang]
  const planFooterWords = footerPlanCopy[lang]

  const selection = useMemo(() => {
    const urlParams = new URLSearchParams(location.search)
    if (urlParams.get('plan') || urlParams.get('package')) {
      return parseRegisterSelection(location.search)
    }
    const rs = savedReturnSearch.trim()
    if (rs) {
      return parseRegisterSelection(rs.startsWith('?') ? rs : `?${rs}`)
    }
    return parseRegisterSelection('')
  }, [location.search, savedReturnSearch])

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
    const subParts = [plan.name, selection.billing === 'annual' ? planFooterWords.annual : planFooterWords.monthly]
    if (extraLines > 0) {
      subParts.push(`${extraLines} usage & add-on${extraLines === 1 ? '' : 's'}`)
    }
    return { title, sub: subParts.join(' · ') }
  }, [planFooterWords.annual, planFooterWords.monthly, selection, summary.rows.length])

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

  useEffect(() => {
    tokenKindRef.current = null
    if (!token) {
      const q = new URLSearchParams()
      q.set('invalidVerify', '1')
      if (fallbackEmail) q.set('email', fallbackEmail)
      navigate(`/register/account?${q.toString()}`, { replace: true })
      return
    }
    let cancelled = false
    void (async () => {
      const goInvalid = (em: string) => {
        const q = new URLSearchParams()
        q.set('invalidVerify', '1')
        if (em) q.set('email', em)
        navigate(`/register/account?${q.toString()}`, { replace: true })
      }

      try {
        const { data } = await api.get<{ valid?: boolean; email?: string }>('/auth/signup/validate-email-intent', { params: { token } })
        if (cancelled) return
        if (data?.valid) {
          tokenKindRef.current = 'intent'
          setEmail(String(data?.email || fallbackEmail))
          setInvalid(false)
          return
        }
      } catch (err) {
        if (cancelled) return
        const body = axios.isAxiosError(err) ? (err.response?.data as { email?: string } | undefined) : undefined
        const hint = String(body?.email || fallbackEmail)
        try {
          const { data: resetData } = await api.get<{ valid?: boolean; email?: string }>('/auth/reset-password/validate', { params: { token } })
          if (cancelled) return
          if (resetData?.valid) {
            tokenKindRef.current = 'reset'
            setEmail(String(resetData?.email || hint || fallbackEmail).toLowerCase())
            setInvalid(false)
            return
          }
        } catch {
          // fall through
        }
        goInvalid(hint)
        return
      }

      try {
        const { data: resetData } = await api.get<{ valid?: boolean; email?: string }>('/auth/reset-password/validate', { params: { token } })
        if (cancelled) return
        if (resetData?.valid) {
          tokenKindRef.current = 'reset'
          setEmail(String(resetData?.email || fallbackEmail).toLowerCase())
          setInvalid(false)
          return
        }
      } catch {
        // fall through
      }

      if (!cancelled) goInvalid(fallbackEmail)
    })()
      .finally(() => {
        if (!cancelled) setValidating(false)
      })
    return () => {
      cancelled = true
    }
  }, [fallbackEmail, navigate, token])

  const submitPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!token || invalid) return
    const kind = tokenKindRef.current
    if (!kind) return
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
      if (kind === 'reset') {
        await api.post('/auth/reset-password', { token, password })
        const loginQ = new URLSearchParams()
        loginQ.set('reset', 'success')
        if (email.trim()) loginQ.set('email', email.trim())
        navigate(`/login?${loginQ.toString()}`, { replace: true })
        return
      }

      const { data } = await api.post<CompleteEmailResponse>('/auth/signup/complete-email', { token, password })
      if (data?.user) {
        storeAuthenticatedSession({ user: data.user, token: data.token })
        const rs = typeof data.returnSearch === 'string' ? data.returnSearch : ''
        setSavedReturnSearch(rs)
        setFlowStep('billing')
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

  const submitBilling = (e: React.FormEvent) => {
    e.preventDefault()
    setBillingError('')
    if (!firstName.trim() || !lastName.trim()) {
      setBillingError(lang === 'sl' ? 'Ime in priimek sta obvezna.' : 'First and last name are required.')
      return
    }
    if (!billingConsent) {
      setBillingError(lang === 'sl' ? 'Potrdite soglasje za nadaljevanje.' : 'Please accept the confirmation to continue.')
      return
    }
    if (!paymentMethod) {
      setBillingError(bc.selectPayment)
      return
    }
    if (paymentMethod === 'card') {
      if (!cardholderName.trim() || !cardNumber.trim() || !cardExpiry.trim() || !cardCvc.trim()) {
        setBillingError(bc.fillCard)
        return
      }
    }
    setBillingSubmitting(true)
    try {
      window.location.assign('/calendar')
    } finally {
      setBillingSubmitting(false)
    }
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

  const renderFooter = () => (
    <footer className={`register-fixed-footer${footerExpanded ? ' is-expanded' : ''}`} role="contentinfo">
      <div className={`register-fixed-footer-inner register-footer-panel${footerExpanded ? ' is-expanded' : ''}`}>
        <div className="register-footer-toolbar">
          <div className="register-footer-back">
            <button className="back-link" type="button" onClick={() => window.location.assign(websiteUrl)}>
              ← Back to website
            </button>
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
                    <span className="register-footer-detail-check" aria-hidden>
                      ✓
                    </span>
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
  )

  const sharedStyles = registerPageStyles + confirmEmailStyles

  if (validating) {
    return (
      <div className="register-flow register-account-page register-confirm-shell register-confirm-flow">
        <style>{sharedStyles}</style>
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
            <div className="register-account-main">
              <div className="register-account-page-stack">
                <section className="panel register-account-card">
                  <p className="register-confirm-copy">Validating your verification link…</p>
                </section>
              </div>
            </div>
          </main>
        </div>
        {renderFooter()}
      </div>
    )
  }

  if (invalid) {
    return null
  }

  if (tokenKindRef.current === 'reset') {
    return (
      <div className="register-flow register-confirm-shell">
        <style>{sharedStyles}</style>
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
              </div>
              <h1 className="register-confirm-title">Set a new password</h1>
              <p className="register-confirm-copy">Choose a new password for your account.</p>
              <form className="register-confirm-card" onSubmit={submitPassword}>
                <p className="register-confirm-next">Reset password</p>
                <div className="register-confirm-pill">
                  <span aria-hidden>✉</span>
                  <span>{email}</span>
                </div>
                <div className="register-confirm-field">
                  <label htmlFor="confirm-password">Password</label>
                  <div className="register-confirm-password-wrap">
                    <input
                      id="confirm-password"
                      value={password}
                      onChange={(ev) => setPassword(ev.target.value)}
                      placeholder="New password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                    />
                    <button type="button" className="register-confirm-show" onClick={() => setShowPassword((v) => !v)}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="register-confirm-hint">Use at least 8 characters, with uppercase, lowercase, and a number.</p>
                </div>
                <div className="register-confirm-field">
                  <label htmlFor="confirm-password-repeat">Confirm password</label>
                  <div className="register-confirm-password-wrap">
                    <input
                      id="confirm-password-repeat"
                      value={confirmPassword}
                      onChange={(ev) => setConfirmPassword(ev.target.value)}
                      placeholder="Repeat password"
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
                  {submitting ? 'Saving…' : 'Save password'}
                </button>
              </form>
            </section>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="register-flow register-account-page register-confirm-shell register-confirm-flow">
      <style>{sharedStyles}</style>
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
          {flowStep === 'password' ? (
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
                  <div className="register-confirm-badges">
                    <span className="register-confirm-badge register-confirm-badge--blue">Account update</span>
                    <span className="register-confirm-badge register-confirm-badge--green">Email verified</span>
                  </div>
                  <h1 className="register-confirm-title">Create your password to continue</h1>
                  <p className="register-confirm-copy">
                    Your email is confirmed. Set a password for your Calendra account, then continue directly to Billing details.
                  </p>

                  <form className="register-confirm-card" onSubmit={submitPassword}>
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
              </div>
            </div>
          ) : (
            <div className="register-account-main">
              <div className="register-account-page-stack" style={{ alignSelf: 'stretch', width: '100%' }}>
                <div className="register-stepper-row register-account-stepper-row">
                  <div className="stepper" aria-label="Registration progress">
                    <div className="step step-done">1 Plan Selection ✓</div>
                    <div className="step step-done">2 Account Setup ✓</div>
                    <div className="step step-current">3 Billing Details</div>
                  </div>
                </div>

                <form className="register-confirm-billing-hero" onSubmit={submitBilling}>
                  <div className="register-confirm-billing-panel">
                    <div className="register-confirm-billing-trust">{bc.trust}</div>
                    <div className="register-confirm-billing-eyebrow">{bc.eyebrow}</div>
                    <h1 className="register-confirm-billing-headline">{bc.headline}</h1>
                    <p className="register-confirm-billing-sub">{bc.sub}</p>

                    <div className="register-confirm-billing-grid2">
                      <div className="register-confirm-billing-field">
                        <label htmlFor="reg-bill-fn">{bc.firstName}</label>
                        <input id="reg-bill-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required />
                      </div>
                      <div className="register-confirm-billing-field">
                        <label htmlFor="reg-bill-ln">{bc.lastName}</label>
                        <input id="reg-bill-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
                      </div>
                    </div>
                    <div className="register-confirm-billing-grid2">
                      <div className="register-confirm-billing-field">
                        <label htmlFor="reg-bill-co">{bc.company}</label>
                        <input id="reg-bill-co" value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="organization" />
                      </div>
                      <div className="register-confirm-billing-field">
                        <label htmlFor="reg-bill-vat">{bc.vat}</label>
                        <input id="reg-bill-vat" value={vatId} onChange={(e) => setVatId(e.target.value)} />
                      </div>
                    </div>
                    <div className="register-confirm-billing-field">
                      <label htmlFor="reg-bill-addr">{bc.address}</label>
                      <input id="reg-bill-addr" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} autoComplete="street-address" />
                    </div>
                    <div className="register-confirm-billing-grid2">
                      <div className="register-confirm-billing-field">
                        <label htmlFor="reg-bill-post">{bc.postal}</label>
                        <input id="reg-bill-post" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} autoComplete="postal-code" />
                      </div>
                      <div className="register-confirm-billing-field">
                        <label htmlFor="reg-bill-city">{bc.city}</label>
                        <input id="reg-bill-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
                      </div>
                    </div>
                  </div>

                  <div className="register-confirm-billing-panel">
                    <h2 className="register-confirm-billing-pay-title">{bc.paymentTitle}</h2>
                    <p className="register-confirm-billing-sub">{bc.paymentSub}</p>

                    <div className="register-confirm-billing-method-grid">
                      <button
                        type="button"
                        className={`register-confirm-billing-method${paymentMethod === 'bank' ? ' is-active' : ''}`}
                        onClick={() => setPaymentMethod('bank')}
                      >
                        <div className="register-confirm-billing-method-top">
                          <div className="register-confirm-billing-method-row">
                            <span className="register-confirm-billing-radio" aria-hidden />
                            <span className="register-confirm-billing-method-icon" aria-hidden>
                              <svg viewBox="0 0 24 24">
                                <path d="M12 3 3.5 7.6v2.1h17V7.6L12 3Z" />
                                <path d="M5.5 10v7.2" />
                                <path d="M9.8 10v7.2" />
                                <path d="M14.2 10v7.2" />
                                <path d="M18.5 10v7.2" />
                                <path d="M4.2 17.2h15.6" />
                                <path d="M2.8 21h18.4" />
                                <path d="M10.2 7.3h3.6" />
                              </svg>
                            </span>
                            <span className="register-confirm-billing-method-title">
                              <strong>{bc.bankTitle}</strong>
                              <span>{bc.bankSub}</span>
                            </span>
                          </div>
                          <span className="register-confirm-billing-badge">{bc.available}</span>
                        </div>
                        <div className="register-confirm-billing-chips">
                          <span className="register-confirm-billing-chip">{bc.bankChip1}</span>
                          <span className="register-confirm-billing-chip">{bc.bankChip2}</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className={`register-confirm-billing-method${paymentMethod === 'card' ? ' is-active' : ''}`}
                        onClick={() => setPaymentMethod('card')}
                      >
                        <div className="register-confirm-billing-method-top">
                          <div className="register-confirm-billing-method-row">
                            <span className="register-confirm-billing-radio" aria-hidden />
                            <span className="register-confirm-billing-method-icon" aria-hidden>
                              <svg viewBox="0 0 24 24">
                                <rect x="4.5" y="6" width="16" height="11.5" rx="2.6" />
                                <path d="M4.5 10h16" />
                                <path d="M8 14.3h4.2" />
                                <path d="M15.2 14.3h2.4" />
                                <path d="M2.8 8.2V7a3 3 0 0 1 3-3h11.5" opacity="0.55" />
                              </svg>
                            </span>
                            <span className="register-confirm-billing-method-title">
                              <strong>{bc.cardTitle}</strong>
                              <span>{bc.cardSub}</span>
                            </span>
                          </div>
                          <span className="register-confirm-billing-badge">{bc.available}</span>
                        </div>
                        <div className="register-confirm-billing-brands">
                          <span className="register-confirm-billing-brand">VISA</span>
                          <span className="register-confirm-billing-brand">Mastercard</span>
                          <span className="register-confirm-billing-brand">Amex</span>
                          <span className="register-confirm-billing-brand">Diners</span>
                        </div>
                        <div className="register-confirm-billing-stripe-note">{bc.stripePowered}</div>
                      </button>

                      <div className="register-confirm-billing-method is-upcoming" aria-disabled>
                        <div className="register-confirm-billing-method-top">
                          <div className="register-confirm-billing-method-row">
                            <span className="register-confirm-billing-radio" aria-hidden />
                            <span className="register-confirm-billing-method-icon" aria-hidden>
                              <svg viewBox="0 0 24 24">
                                <path d="M8.3 20h3.2l.8-4.4h2.3c3.4 0 5.7-1.9 6.2-5.1.5-3.5-1.9-5.7-5.9-5.7H8.5L6.1 20h2.2Z" />
                                <path d="M10.8 8h3.4c1.5 0 2.3.8 2.1 2-.2 1.4-1.2 2.1-2.8 2.1h-2l-.8 4.2" />
                                <path d="M6.8 6.6h7.4" opacity="0.5" />
                              </svg>
                            </span>
                            <span className="register-confirm-billing-method-title">
                              <strong>{bc.paypalTitle}</strong>
                              <span>{bc.paypalSub}</span>
                            </span>
                          </div>
                          <span className="register-confirm-billing-badge register-confirm-billing-badge--muted">{bc.upcoming}</span>
                        </div>
                        <div className="register-confirm-billing-paypal-pill" aria-hidden>
                          <span className="pay">Pay</span>Pal
                        </div>
                      </div>
                    </div>

                    <div className={`register-confirm-billing-expand${paymentMethod === 'bank' ? ' is-visible' : ''}`}>
                      <p className="register-confirm-billing-sub" style={{ margin: 0 }}>
                        <strong>{bc.bankDetailsTitle}</strong> — {bc.bankDetailsSub}
                      </p>
                      <div className="register-confirm-billing-detail-grid">
                        <div className="register-confirm-billing-detail">
                          <strong>{bc.recipient}</strong>
                          <span>Calendra d.o.o.</span>
                        </div>
                        <div className="register-confirm-billing-detail">
                          <strong>{bc.iban}</strong>
                          <span>SI56 0000 0000 0000 000</span>
                        </div>
                        <div className="register-confirm-billing-detail">
                          <strong>{bc.bic}</strong>
                          <span>HDELSI22</span>
                        </div>
                        <div className="register-confirm-billing-detail">
                          <strong>{bc.reference}</strong>
                          <span>CAL-ORDER-…</span>
                        </div>
                        <div className="register-confirm-billing-detail">
                          <strong>{bc.purpose}</strong>
                          <span>{bc.purposeVal}</span>
                        </div>
                        <div className="register-confirm-billing-detail">
                          <strong>{bc.amount}</strong>
                          <span>{summary.totalPrimary}</span>
                        </div>
                      </div>
                    </div>

                    <div className={`register-confirm-billing-expand${paymentMethod === 'card' ? ' is-visible' : ''}`}>
                      <p className="register-confirm-billing-sub" style={{ margin: 0 }}>
                        <strong>{bc.cardBoxTitle}</strong> — {bc.cardBoxSub}
                      </p>
                      <div className="register-confirm-billing-field">
                        <label htmlFor="reg-cc-name">{bc.cardholder}</label>
                        <input id="reg-cc-name" value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} autoComplete="cc-name" />
                      </div>
                      <div className="register-confirm-billing-field">
                        <label htmlFor="reg-cc-num">{bc.cardNumber}</label>
                        <input
                          id="reg-cc-num"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          inputMode="numeric"
                          autoComplete="cc-number"
                          placeholder="4242 4242 4242 4242"
                        />
                      </div>
                      <div className="register-confirm-billing-grid2">
                        <div className="register-confirm-billing-field">
                          <label htmlFor="reg-cc-exp">{bc.expiry}</label>
                          <input
                            id="reg-cc-exp"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            inputMode="numeric"
                            autoComplete="cc-exp"
                            placeholder="MM / YY"
                          />
                        </div>
                        <div className="register-confirm-billing-field">
                          <label htmlFor="reg-cc-cvc">{bc.cvc}</label>
                          <input
                            id="reg-cc-cvc"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value)}
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            placeholder="123"
                          />
                        </div>
                      </div>
                      <p className="register-confirm-billing-mini">{bc.cardNote}</p>
                    </div>

                    <label className="register-confirm-billing-consent">
                      <input type="checkbox" checked={billingConsent} onChange={(e) => setBillingConsent(e.target.checked)} />
                      <span>{bc.consent}</span>
                    </label>

                    {billingError ? <div className="error">{billingError}</div> : null}

                    <div className="register-confirm-billing-actions">
                      <button type="button" className="register-confirm-billing-secondary" onClick={() => navigate(`/register?${selectionToSearch(selection)}`)}>
                        {bc.backPlan}
                      </button>
                      <button type="submit" className="register-confirm-billing-primary" disabled={billingSubmitting}>
                        {bc.submit}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {renderFooter()}

      {contactOpen ? (
        <div className="register-contact-modal-root" role="presentation">
          <button type="button" className="register-contact-modal-backdrop" aria-label="Close contact form" onClick={closeContactModal} />
          <div className="register-contact-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="register-contact-title">
            <h2 id="register-contact-title" className="register-contact-modal-title">
              Contact us
            </h2>
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
              {contactError ? (
                <p className="register-contact-error" role="alert">
                  {contactError}
                </p>
              ) : null}
            </div>
            <div className="register-contact-modal-actions">
              <button type="button" className="register-contact-modal-cancel" onClick={closeContactModal}>
                Cancel
              </button>
              <button type="button" className="register-contact-modal-submit" onClick={submitContactModal}>
                Send via email
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
