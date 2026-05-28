import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import loginLogo from '../assets/login-logo.png'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { useToast } from '../components/Toast'
import { ensureRegisterCatalogLoaded } from '../lib/registerCatalogBootstrap'
import { useLocale } from '../locale'
import { registerPageStyles } from './registerPageStyles'
import {
  getBillingInterval,
  getEstimatedUserCount,
  parseRegisterSelection,
  registerPlanToPackage,
  selectionToSearch,
} from './registerFlow'
import {
  buildSummary,
  getActiveAddonKeys,
  getRegisterPlanPageCopy,
  plansForLocale,
  selectionRequiresBillingDetails,
  type RegisterLocale,
} from './registerPlanCopy'

const REGISTER_BILLING_DETAILS_REQUIRED_KEY = 'calendra.register.requiresBillingDetails'
const REGISTER_BILLING_DETAILS_SEARCH_KEY = 'calendra.register.billingDetailsSearch'
type RegisterPaymentMethod = 'BANK_TRANSFER' | 'CARD' | 'PAYPAL'
type RegisterPaymentCapabilities = { stripeEnabled: boolean; paypalEnabled: boolean }

function clearPendingBillingDetailsRedirect() {
  try {
    window.sessionStorage.removeItem(REGISTER_BILLING_DETAILS_REQUIRED_KEY)
    window.sessionStorage.removeItem(REGISTER_BILLING_DETAILS_SEARCH_KEY)
  } catch {
    // Session storage is best-effort only.
  }
}

function getSelectedAddonKeys(selection: ReturnType<typeof parseRegisterSelection>) {
  return getActiveAddonKeys().filter((key) => Boolean(selection.addons[key]))
}

const registerBillingDetailsStyles = `
  .register-flow.register-billing-details-page {
    --billing-card-radius: 18px;
    --billing-blue: #2f6df6;
    --billing-blue-dark: #155be7;
    --billing-blue-soft: #edf4ff;
    --billing-text: #152442;
    --billing-muted: #6d7d98;
    --billing-border: #dbe6f7;
    --billing-orange: #ff9f2f;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow-x: hidden;
    background:
      radial-gradient(circle at 86% 41%, rgba(47, 109, 246, 0.085), transparent 17%),
      radial-gradient(circle at 10% 68%, rgba(47, 109, 246, 0.070), transparent 23%),
      linear-gradient(180deg, #fbfdff 0%, #f4f8ff 48%, #eef5ff 100%);
  }

  .register-flow.register-billing-details-page::before,
  .register-flow.register-billing-details-page::after {
    content: '';
    position: absolute;
    width: 220px;
    height: 180px;
    pointer-events: none;
    opacity: 0.38;
    background-image: radial-gradient(circle, rgba(47, 109, 246, 0.22) 1.25px, transparent 1.25px);
    background-size: 18px 18px;
    z-index: 0;
  }

  .register-flow.register-billing-details-page::before {
    left: max(0px, calc(50% - 780px));
    top: 220px;
  }

  .register-flow.register-billing-details-page::after {
    right: max(0px, calc(50% - 780px));
    bottom: 170px;
  }

  .register-flow.register-billing-details-page .topbar,
  .register-flow.register-billing-details-page .app {
    position: relative;
    z-index: 1;
  }

  .register-flow.register-billing-details-page .topbar {
    width: min(100%, 1160px);
    max-width: 1160px;
    margin: 0 auto;
    padding: max(14px, calc(10px + env(safe-area-inset-top, 0px))) clamp(18px, 3vw, 28px) 12px;
    background: rgba(255, 255, 255, 0.64);
    border-bottom: 1px solid rgba(216, 226, 244, 0.86);
    backdrop-filter: blur(10px);
  }

  .register-flow.register-billing-details-page .brand-logo {
    width: 176px;
    max-height: 54px;
    object-fit: contain;
  }

  .register-flow.register-billing-details-page .lang-switch {
    padding: 4px;
    border-radius: 999px;
    box-shadow: 0 12px 26px rgba(45, 84, 156, 0.08), 0 1px 0 rgba(255,255,255,0.95) inset;
  }

  .register-flow.register-billing-details-page .lang-switch-btn {
    padding: 6px 12px;
    font-size: 0.78rem;
  }

  .register-flow.register-billing-details-page .app {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .register-flow.register-billing-details-page .content {
    flex: 1 1 auto;
    padding: 22px 0 48px;
  }

  .register-billing-wrap {
    width: min(100%, 1100px);
    margin: 0 auto;
    padding: 0 clamp(18px, 3vw, 34px);
    display: grid;
    gap: 22px;
  }

  .register-billing-stepper-row {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .register-billing-stepper {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .register-billing-stepper-line {
    width: 42px;
    height: 1px;
    background: #bfcdea;
    opacity: 0.75;
  }

  .register-billing-step {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    min-height: 36px;
    padding: 8px 14px 8px 10px;
    border-radius: 999px;
    border: 1px solid #d8e4f6;
    background: rgba(255,255,255,0.78);
    color: #1b2a46;
    box-shadow: 0 10px 24px rgba(33, 73, 145, 0.06);
    font-size: 0.85rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .register-billing-step-icon {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: #ffffff;
    color: var(--billing-blue);
    border: 1px solid #b9d0ff;
    font-size: 0.78rem;
    font-weight: 950;
  }

  .register-billing-step--done .register-billing-step-icon,
  .register-billing-step--current .register-billing-step-icon {
    background: var(--billing-blue);
    color: #fff;
    border-color: var(--billing-blue);
  }

  .register-billing-step--current {
    color: var(--billing-blue);
    border-color: #b9d0ff;
    background: #f4f8ff;
  }

  .register-billing-card {
    display: grid;
    grid-template-columns: minmax(0, 620px) minmax(260px, 310px);
    gap: 34px;
    align-items: start;
    justify-content: center;
  }

  .register-billing-main,
  .register-billing-summary {
    border: 1px solid rgba(216, 226, 244, 0.95);
    background: rgba(255, 255, 255, 0.92);
    border-radius: var(--billing-card-radius);
    box-shadow: 0 24px 60px rgba(34, 78, 160, 0.12);
    backdrop-filter: blur(14px);
  }

  .register-billing-main {
    padding: 24px;
    display: grid;
    gap: 18px;
  }

  .register-billing-notice {
    display: grid;
    grid-template-columns: 46px 1fr;
    gap: 14px;
    align-items: center;
    padding: 14px 18px;
    border-radius: 8px;
    border-left: 3px solid var(--billing-orange);
    background: linear-gradient(135deg, #eef4ff 0%, #f6f9ff 100%);
    color: var(--billing-text);
  }

  .register-billing-notice-icon {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: #dbe9ff;
    color: var(--billing-blue);
    font-size: 1.1rem;
    box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset;
  }

  .register-billing-notice strong,
  .register-billing-notice span span {
    display: block;
  }

  .register-billing-notice strong {
    font-size: 0.98rem;
    font-weight: 950;
    color: var(--billing-text);
  }

  .register-billing-notice span span {
    margin-top: 3px;
    color: #4d5f7c;
    line-height: 1.45;
    font-size: 0.9rem;
  }

  .register-billing-header {
    display: grid;
    gap: 8px;
  }

  .register-billing-title {
    margin: 0;
    color: var(--billing-text);
    font-size: clamp(1.8rem, 2.8vw, 2.35rem);
    line-height: 1.04;
    letter-spacing: -0.05em;
    font-weight: 950;
  }

  .register-billing-copy {
    margin: 0;
    color: var(--billing-muted);
    line-height: 1.55;
    font-size: 0.95rem;
  }

  .register-billing-form {
    display: grid;
    gap: 16px;
  }

  .register-billing-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 18px;
  }

  .register-billing-field {
    display: grid;
    gap: 7px;
    min-width: 0;
  }

  .register-billing-field--full {
    grid-column: 1 / -1;
  }

  .register-billing-field label,
  .register-billing-payment-label {
    color: #253653;
    font-size: 0.82rem;
    font-weight: 900;
  }

  .register-billing-required {
    color: #e14a4a;
  }

  .register-billing-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .register-billing-field-icon {
    position: absolute;
    left: 14px;
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    color: #6c7d99;
    font-size: 0.9rem;
    z-index: 1;
  }

  .register-billing-field input,
  .register-billing-field select {
    width: 100%;
    height: 43px;
    border-radius: 8px;
    border: 1px solid #d8e2f1;
    background: rgba(255, 255, 255, 0.96);
    color: var(--billing-text);
    font-size: 0.92rem;
    font-weight: 650;
    outline: none;
    padding: 0 14px 0 42px;
    transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
    box-shadow: 0 1px 0 rgba(255,255,255,0.86) inset;
  }

  .register-billing-field select {
    appearance: none;
    padding-right: 42px;
    cursor: pointer;
  }

  .register-billing-input-wrap--select::after {
    content: '⌄';
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-58%);
    color: #6d7d98;
    pointer-events: none;
    font-weight: 900;
  }

  .register-billing-field input:focus,
  .register-billing-field select:focus {
    border-color: #8db1ff;
    box-shadow: 0 0 0 4px rgba(47, 109, 246, 0.10);
    background: #fff;
  }

  .register-billing-payment-section {
    display: grid;
    gap: 10px;
  }

  .register-billing-payment-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .register-billing-payment-option {
    position: relative;
    display: grid;
    grid-template-columns: 56px 1fr;
    gap: 13px;
    align-items: center;
    min-height: 78px;
    padding: 14px 44px 14px 18px;
    border: 1px solid #dfe7f5;
    border-radius: 8px;
    background: rgba(255,255,255,0.92);
    color: var(--billing-text);
    cursor: pointer;
    transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease, transform 180ms ease;
  }

  .register-billing-payment-option:hover {
    border-color: #b8cdf9;
    transform: translateY(-1px);
  }

  .register-billing-payment-option.is-selected {
    border-color: var(--billing-blue);
    background: linear-gradient(180deg, #ffffff 0%, #f6f9ff 100%);
    box-shadow: 0 10px 25px rgba(47, 109, 246, 0.10);
  }

  .register-billing-payment-radio {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .register-billing-payment-check {
    position: absolute;
    right: 14px;
    top: 13px;
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1.5px solid #d2ddec;
    color: transparent;
    font-size: 0.7rem;
    font-weight: 950;
  }

  .register-billing-payment-option.is-selected .register-billing-payment-check {
    background: var(--billing-blue);
    border-color: var(--billing-blue);
    color: #fff;
  }

  .register-billing-payment-icon {
    display: inline-grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 999px;
    background: #eaf2ff;
    color: var(--billing-blue);
    font-size: 1.15rem;
  }

  .register-billing-payment-option:not(.is-selected) .register-billing-payment-icon.is-card {
    background: #fff3e6;
    color: var(--billing-orange);
  }

  .register-billing-payment-text {
    display: grid;
    gap: 3px;
  }

  .register-billing-payment-text strong {
    font-size: 0.94rem;
    font-weight: 950;
    color: var(--billing-text);
  }

  .register-billing-payment-text small {
    color: #657693;
    font-size: 0.82rem;
    line-height: 1.35;
    font-weight: 650;
  }

  .register-billing-help {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 34px;
    padding: 8px 12px;
    border-radius: 7px;
    background: #f1f6ff;
    color: #687991;
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .register-billing-help-icon,
  .register-billing-summary-note-icon {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #fff1df;
    color: var(--billing-orange);
    font-size: 0.82rem;
  }

  .register-billing-error {
    padding: 11px 13px;
    border-radius: 8px;
    border: 1px solid #f2b8b8;
    background: #fff2f2;
    color: #a12828;
    font-size: 0.88rem;
    font-weight: 850;
  }

  .register-billing-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 8px;
  }

  .register-billing-back,
  .register-billing-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-height: 42px;
    border-radius: 8px;
    padding: 0 19px;
    font-size: 0.86rem;
    font-weight: 950;
    cursor: pointer;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease;
  }

  .register-billing-back {
    border: 1px solid #bfd1fb;
    background: #fff;
    color: var(--billing-blue);
  }

  .register-billing-submit {
    border: 1px solid var(--billing-blue);
    background: linear-gradient(180deg, #2f6df6 0%, #125eea 100%);
    color: #fff;
    box-shadow: 0 16px 30px rgba(47, 109, 246, 0.22);
  }

  .register-billing-back:hover,
  .register-billing-submit:hover {
    transform: translateY(-1px);
  }

  .register-billing-submit:disabled {
    opacity: 0.64;
    cursor: not-allowed;
    transform: none;
  }

  .register-billing-summary {
    padding: 22px;
    position: sticky;
    top: 84px;
    display: grid;
    gap: 16px;
    align-self: start;
  }

  .register-billing-summary-heading {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .register-billing-summary-badge {
    display: inline-grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 999px;
    background: #fff0df;
    color: var(--billing-orange);
    font-size: 1rem;
  }

  .register-billing-summary-title {
    margin: 0;
    color: var(--billing-text);
    font-size: 1.1rem;
    font-weight: 950;
    letter-spacing: -0.02em;
  }

  .register-billing-summary-box {
    overflow: hidden;
    display: grid;
    border: 1px solid #dfe7f5;
    border-radius: 8px;
    background: #fff;
  }

  .register-billing-summary-plan {
    display: grid;
    gap: 7px;
    padding: 18px 16px;
    background: #f3f7ff;
  }

  .register-billing-summary-plan span,
  .register-billing-summary-total span {
    color: var(--billing-blue);
    text-transform: uppercase;
    letter-spacing: 0.11em;
    font-size: 0.72rem;
    font-weight: 950;
  }

  .register-billing-summary-plan strong {
    color: var(--billing-text);
    font-size: 1rem;
    font-weight: 950;
  }

  .register-billing-summary-list {
    margin: 0;
    padding: 15px 16px 0;
    list-style: none;
    display: grid;
    gap: 12px;
  }

  .register-billing-summary-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
    color: #5c6c86;
    font-size: 0.9rem;
    font-weight: 650;
  }

  .register-billing-summary-row strong {
    color: var(--billing-text);
    font-size: 0.9rem;
    white-space: nowrap;
    font-weight: 900;
  }

  .register-billing-summary-total {
    display: grid;
    gap: 7px;
    padding: 18px 16px 20px;
    margin-top: 14px;
    border-top: 1px solid #dfe7f5;
  }

  .register-billing-summary-total strong {
    color: var(--billing-text);
    font-size: 1.85rem;
    line-height: 1;
    letter-spacing: -0.035em;
    font-weight: 950;
  }

  .register-billing-summary-note {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #687991;
    font-size: 0.85rem;
    line-height: 1.4;
    padding: 0 2px;
  }

  @media (max-width: 980px) {
    .register-billing-card {
      grid-template-columns: 1fr;
      gap: 18px;
    }

    .register-billing-summary {
      position: static;
      max-width: none;
    }
  }

  @media (max-width: 720px) {
    .register-flow.register-billing-details-page .topbar {
      padding-left: 16px;
      padding-right: 16px;
    }

    .register-billing-stepper {
      width: 100%;
      overflow-x: auto;
      justify-content: flex-start;
      padding-bottom: 3px;
    }

    .register-billing-stepper-line {
      width: 28px;
      flex: 0 0 auto;
    }

    .register-billing-main,
    .register-billing-summary {
      border-radius: 16px;
    }

    .register-billing-main {
      padding: 18px;
    }

    .register-billing-notice {
      grid-template-columns: 38px 1fr;
      padding: 12px;
    }

    .register-billing-notice-icon {
      width: 34px;
      height: 34px;
    }

    .register-billing-grid,
    .register-billing-payment-options {
      grid-template-columns: 1fr;
    }

    .register-billing-actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .register-billing-back,
    .register-billing-submit {
      width: 100%;
    }
  }
`

const copyByLocale = {
  en: {
    noticeTitle: 'Almost there!',
    noticeText: 'Add your billing details to activate your plan. You won’t be charged until the end of your trial.',
    title: 'Billing details',
    subtitle: 'Please provide your billing information. All fields marked with * are required.',
    firstName: 'First name',
    lastName: 'Last name',
    companyName: 'Company / business name',
    tenantType: 'Tenant type',
    vatId: 'VAT ID / Tax number',
    address: 'Address',
    postalCode: 'Postal code',
    city: 'City',
    paymentMethod: 'Preferred payment method',
    bankTransfer: 'Bank transfer',
    bankTransferDescription: 'Pay via bank transfer',
    card: 'Card payment',
    cardDescription: 'Pay securely by card',
    paypal: 'PayPal',
    paypalDescription: 'Pay securely with PayPal',
    paymentHelp: 'Your payment information is secure and encrypted.',
    summaryTitle: 'Selected package',
    summaryLabel: 'Package',
    estimatedTotal: 'Estimated total',
    summaryHelp: 'You can change or cancel anytime.',
    back: 'Back to account setup',
    submit: 'Save and continue to app',
    saving: 'Saving…',
    required: 'Please fill in all required billing fields.',
    saved: 'Billing details saved.',
    failed: 'Could not save billing details. Please try again.',
  },
  sl: {
    noticeTitle: 'Skoraj končano!',
    noticeText: 'Dodajte podatke za obračun za aktivacijo paketa. Do konca preizkusnega obdobja vam ne bomo zaračunali.',
    title: 'Podatki za obračun',
    subtitle: 'Vnesite podatke za obračun. Vsa polja, označena z *, so obvezna.',
    firstName: 'Ime',
    lastName: 'Priimek',
    companyName: 'Naziv podjetja / dejavnosti',
    tenantType: 'Vrsta podjetja',
    vatId: 'ID za DDV / Davčna številka',
    address: 'Naslov',
    postalCode: 'Poštna številka',
    city: 'Kraj',
    paymentMethod: 'Želeni način plačila',
    bankTransfer: 'Bančno nakazilo',
    bankTransferDescription: 'Plačilo z bančnim nakazilom',
    card: 'Plačilna kartica',
    cardDescription: 'Varno plačilo s kartico',
    paypal: 'PayPal',
    paypalDescription: 'Varno plačilo s PayPalom',
    paymentHelp: 'Vaši plačilni podatki so varni in šifrirani.',
    summaryTitle: 'Izbrani paket',
    summaryLabel: 'Paket',
    estimatedTotal: 'Skupaj (ocena)',
    summaryHelp: 'Paket lahko kadarkoli spremenite ali prekličete.',
    back: 'Nazaj na nastavitev računa',
    submit: 'Shrani in nadaljuj v aplikacijo',
    saving: 'Shranjevanje…',
    required: 'Izpolnite vsa obvezna polja za obračun.',
    saved: 'Podatki za obračun so shranjeni.',
    failed: 'Podatkov za obračun ni bilo mogoče shraniti. Poskusite znova.',
  },
} as const

type RegisterTenantType = 'salon' | 'gym' | 'therapy' | 'spa' | 'personal_training'

const tenantTypeOptions: Record<RegisterLocale, Array<{ value: RegisterTenantType; label: string }>> = {
  en: [
    { value: 'salon', label: 'Salon' },
    { value: 'gym', label: 'Gym' },
    { value: 'therapy', label: 'Therapy' },
    { value: 'spa', label: 'Spa' },
    { value: 'personal_training', label: 'Personal Training' },
  ],
  sl: [
    { value: 'salon', label: 'Salon' },
    { value: 'gym', label: 'Fitnes' },
    { value: 'therapy', label: 'Terapija' },
    { value: 'spa', label: 'Spa' },
    { value: 'personal_training', label: 'Osebni trening' },
  ],
}

function stepLabel(raw: string) {
  return raw.replace(/^\d+\s*/, '')
}

function fieldLabel(label: string, required = false) {
  return (
    <>
      {label}{required ? <span className="register-billing-required"> *</span> : null}
    </>
  )
}

export function RegisterBillingDetailsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, setLocale, t } = useLocale()
  const { showToast } = useToast()
  const lang: RegisterLocale = locale === 'sl' ? 'sl' : 'en'
  const copy = copyByLocale[lang]
  const pageCopy = useMemo(() => getRegisterPlanPageCopy(lang), [lang])
  const selection = useMemo(() => parseRegisterSelection(location.search), [location.search])
  const summary = useMemo(() => buildSummary(selection, lang), [selection, lang])
  const plans = useMemo(() => plansForLocale(lang), [lang])
  const storedUser = getStoredUser()

  const [firstName, setFirstName] = useState(storedUser?.firstName || '')
  const [lastName, setLastName] = useState(storedUser?.lastName || '')
  const [companyName, setCompanyName] = useState('')
  const [vatId, setVatId] = useState('')
  const [address, setAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [tenantType, setTenantType] = useState<RegisterTenantType>('salon')
  const [paymentMethod, setPaymentMethod] = useState<RegisterPaymentMethod>('BANK_TRANSFER')
  const [paymentCapabilities, setPaymentCapabilities] = useState<RegisterPaymentCapabilities>({
    stripeEnabled: true,
    paypalEnabled: false,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [, setRegisterCatalogRevision] = useState(0)

  useEffect(() => {
    let alive = true
    void ensureRegisterCatalogLoaded().then((changed) => {
      if (alive && changed) setRegisterCatalogRevision((value) => value + 1)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void api.get<RegisterPaymentCapabilities>('/register/payment-capabilities')
      .then(({ data }) => {
        if (cancelled || !data) return
        setPaymentCapabilities({
          stripeEnabled: data.stripeEnabled !== false,
          paypalEnabled: data.paypalEnabled === true,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setPaymentCapabilities({ stripeEnabled: true, paypalEnabled: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const availablePaymentMethods = useMemo<RegisterPaymentMethod[]>(() => {
    const methods: RegisterPaymentMethod[] = ['BANK_TRANSFER']
    if (paymentCapabilities.stripeEnabled) methods.push('CARD')
    if (paymentCapabilities.paypalEnabled) methods.push('PAYPAL')
    return methods
  }, [paymentCapabilities.paypalEnabled, paymentCapabilities.stripeEnabled])

  useEffect(() => {
    if (availablePaymentMethods.includes(paymentMethod)) return
    setPaymentMethod(availablePaymentMethods[0] || 'BANK_TRANSFER')
  }, [availablePaymentMethods, paymentMethod])

  useEffect(() => {
    if (!selectionRequiresBillingDetails(selection)) {
      clearPendingBillingDetailsRedirect()
      navigate('/calendar', { replace: true })
    }
  }, [navigate, selection])

  useEffect(() => {
    let cancelled = false
    api.get('/auth/me')
      .then((res) => {
        if (cancelled) return
        const user = res.data?.user
        if (user) {
          if (!firstName.trim() && user.firstName) setFirstName(String(user.firstName))
          if (!lastName.trim() && user.lastName) setLastName(String(user.lastName))
        }
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          navigate('/login', { replace: true })
        }
      })
    return () => {
      cancelled = true
    }
    // Intentionally only hydrate once on entry; the form itself owns edits afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const submitBillingDetails = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    const required = [firstName, lastName, companyName, address, postalCode, city, tenantType].every((value) => value.trim())
    if (!required) {
      setError(copy.required)
      return
    }

    setSaving(true)
    try {
      const { data } = await api.post('/auth/signup/billing-details', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        companyName: companyName.trim(),
        vatId: vatId.trim() || null,
        address: address.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
        tenantType,
        packageName: registerPlanToPackage[selection.plan],
        userCount: getEstimatedUserCount(selection),
        smsCount: selection.additionalSms,
        addonKeys: getSelectedAddonKeys(selection),
        billingInterval: getBillingInterval(selection),
        paymentMethod,
      })
      clearPendingBillingDetailsRedirect()
      showToast('success', copy.saved)
      if (data?.checkoutUrl) {
        window.location.assign(String(data.checkoutUrl))
        return
      }
      window.location.assign('/calendar')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || copy.failed)
      } else {
        setError(copy.failed)
      }
    } finally {
      setSaving(false)
    }
  }

  const backToAccount = () => {
    navigate(`/register/account?${selectionToSearch(selection)}`)
  }

  return (
    <div className="register-flow register-billing-details-page">
      <style>{registerPageStyles}</style>
      <style>{registerBillingDetailsStyles}</style>
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={loginLogo} alt={pageCopy.brandAlt} />
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

      <div className="app">
        <main className="content">
          <div className="register-billing-wrap">
            <div className="register-billing-stepper-row">
              <div className="register-billing-stepper" aria-label={pageCopy.stepperAria}>
                <span className="register-billing-step register-billing-step--done">
                  <span className="register-billing-step-icon" aria-hidden="true">✓</span>
                  <span>{stepLabel(pageCopy.step1)}</span>
                </span>
                <span className="register-billing-stepper-line" aria-hidden="true" />
                <span className="register-billing-step register-billing-step--done">
                  <span className="register-billing-step-icon" aria-hidden="true">✓</span>
                  <span>{stepLabel(pageCopy.step2)}</span>
                </span>
                <span className="register-billing-stepper-line" aria-hidden="true" />
                <span className="register-billing-step register-billing-step--current">
                  <span className="register-billing-step-icon" aria-hidden="true">3</span>
                  <span>{stepLabel(pageCopy.step3)}</span>
                </span>
              </div>
            </div>

            <div className="register-billing-card">
              <section className="register-billing-main" aria-labelledby="register-billing-title">
                <div className="register-billing-notice">
                  <span className="register-billing-notice-icon" aria-hidden="true">▣</span>
                  <span>
                    <strong>{copy.noticeTitle}</strong>
                    <span>{copy.noticeText}</span>
                  </span>
                </div>

                <div className="register-billing-header">
                  <h1 id="register-billing-title" className="register-billing-title">{copy.title}</h1>
                  <p className="register-billing-copy">{copy.subtitle}</p>
                </div>

                <form className="register-billing-form" onSubmit={submitBillingDetails}>
                  <div className="register-billing-grid">
                    <div className="register-billing-field">
                      <label htmlFor="billing-first-name">{fieldLabel(copy.firstName, true)}</label>
                      <div className="register-billing-input-wrap">
                        <span className="register-billing-field-icon" aria-hidden="true">♡</span>
                        <input id="billing-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
                      </div>
                    </div>

                    <div className="register-billing-field">
                      <label htmlFor="billing-last-name">{fieldLabel(copy.lastName, true)}</label>
                      <div className="register-billing-input-wrap">
                        <span className="register-billing-field-icon" aria-hidden="true">♡</span>
                        <input id="billing-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
                      </div>
                    </div>

                    <div className="register-billing-field register-billing-field--full">
                      <label htmlFor="billing-company-name">{fieldLabel(copy.companyName, true)}</label>
                      <div className="register-billing-input-wrap">
                        <span className="register-billing-field-icon" aria-hidden="true">▥</span>
                        <input id="billing-company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} autoComplete="organization" />
                      </div>
                    </div>

                    <div className="register-billing-field register-billing-field--full">
                      <label htmlFor="billing-tenant-type">{fieldLabel(copy.tenantType, true)}</label>
                      <div className="register-billing-input-wrap register-billing-input-wrap--select">
                        <span className="register-billing-field-icon" aria-hidden="true">▦</span>
                        <select
                          id="billing-tenant-type"
                          value={tenantType}
                          onChange={(event) => setTenantType(event.target.value as RegisterTenantType)}
                        >
                          {tenantTypeOptions[lang].map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="register-billing-field">
                      <label htmlFor="billing-vat-id">{copy.vatId}</label>
                      <div className="register-billing-input-wrap">
                        <span className="register-billing-field-icon" aria-hidden="true">▤</span>
                        <input id="billing-vat-id" value={vatId} onChange={(event) => setVatId(event.target.value)} autoComplete="off" placeholder="SI12345678" />
                      </div>
                    </div>

                    <div className="register-billing-field">
                      <label htmlFor="billing-city">{fieldLabel(copy.city, true)}</label>
                      <div className="register-billing-input-wrap">
                        <span className="register-billing-field-icon" aria-hidden="true">⌖</span>
                        <input id="billing-city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" />
                      </div>
                    </div>

                    <div className="register-billing-field register-billing-field--full">
                      <label htmlFor="billing-address">{fieldLabel(copy.address, true)}</label>
                      <div className="register-billing-input-wrap">
                        <span className="register-billing-field-icon" aria-hidden="true">⌖</span>
                        <input id="billing-address" value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" />
                      </div>
                    </div>

                    <div className="register-billing-field register-billing-field--full">
                      <label htmlFor="billing-postal-code">{fieldLabel(copy.postalCode, true)}</label>
                      <div className="register-billing-input-wrap">
                        <span className="register-billing-field-icon" aria-hidden="true">✉</span>
                        <input id="billing-postal-code" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} autoComplete="postal-code" />
                      </div>
                    </div>
                  </div>

                  <div className="register-billing-payment-section">
                    <span className="register-billing-payment-label">{fieldLabel(copy.paymentMethod, true)}</span>
                    <div className="register-billing-payment-options">
                      {availablePaymentMethods.map((method) => {
                        const selected = paymentMethod === method
                        const title = method === 'BANK_TRANSFER' ? copy.bankTransfer : method === 'CARD' ? copy.card : copy.paypal
                        const description = method === 'BANK_TRANSFER' ? copy.bankTransferDescription : method === 'CARD' ? copy.cardDescription : copy.paypalDescription
                        return (
                          <label className={selected ? 'register-billing-payment-option is-selected' : 'register-billing-payment-option'} key={method}>
                            <input
                              className="register-billing-payment-radio"
                              type="radio"
                              name="billing-payment-method"
                              checked={selected}
                              onChange={() => setPaymentMethod(method)}
                            />
                            <span className="register-billing-payment-check" aria-hidden="true">✓</span>
                            <span className={method === 'CARD' ? 'register-billing-payment-icon is-card' : 'register-billing-payment-icon'} aria-hidden="true">
                              {method === 'BANK_TRANSFER' ? '▥' : method === 'CARD' ? '▭' : 'P'}
                            </span>
                            <span className="register-billing-payment-text">
                              <strong>{title}</strong>
                              <small>{description}</small>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="register-billing-help">
                      <span className="register-billing-help-icon" aria-hidden="true">♢</span>
                      <span>{copy.paymentHelp}</span>
                    </div>
                  </div>

                  {error ? <div className="register-billing-error" role="alert">{error}</div> : null}

                  <div className="register-billing-actions">
                    <button type="button" className="register-billing-back" onClick={backToAccount}>
                      <span aria-hidden="true">←</span>
                      <span>{copy.back}</span>
                    </button>
                    <button type="submit" className="register-billing-submit" disabled={saving}>
                      <span>{saving ? copy.saving : copy.submit}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              </section>

              <aside className="register-billing-summary" aria-label={copy.summaryTitle}>
                <div className="register-billing-summary-heading">
                  <span className="register-billing-summary-badge" aria-hidden="true">★</span>
                  <h2 className="register-billing-summary-title">{copy.summaryTitle}</h2>
                </div>

                <div className="register-billing-summary-box">
                  <div className="register-billing-summary-plan">
                    <span>{copy.summaryLabel}</span>
                    <strong>{plans[selection.plan].name}</strong>
                  </div>
                  <ul className="register-billing-summary-list">
                    {summary.rows.map((row) => (
                      <li key={`${row.label}-${row.value}`} className="register-billing-summary-row">
                        <span>{row.label}</span>
                        <strong>{row.value}</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="register-billing-summary-total">
                    <span>{copy.estimatedTotal}</span>
                    <strong>{summary.totalPrimary}</strong>
                  </div>
                </div>

                <div className="register-billing-summary-note">
                  <span className="register-billing-summary-note-icon" aria-hidden="true">▣</span>
                  <span>{copy.summaryHelp}</span>
                </div>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
