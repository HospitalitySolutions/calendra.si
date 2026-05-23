import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import loginLogo from '../assets/login-logo.png'
import { useToast } from '../components/Toast'
import { Field } from '../components/ui'
import { api } from '../api'
import { useLocale } from '../locale'
import { ensureRegisterCatalogLoaded } from '../lib/registerCatalogBootstrap'
import { useRegisterFooterClickOutside } from '../lib/useRegisterFooterClickOutside'
import { storeAuthenticatedSession } from '../lib/session'
import { registerPageStyles } from './registerPageStyles'
import { getBillingInterval, getEstimatedUserCount, parseRegisterSelection, selectionToSearch, type RegisterSelection } from './registerFlow'
import { RegisterFooterChevron, RegisterFooterListIcon } from './RegisterPage'
import {
  annualSaveBadgeText,
  buildRegisterFooterPill,
  buildSummary,
  formatEuro,
  getRegisterPlanPageCopy,
  getSelectionMonthlyAmounts,
  plansForLocale,
  selectionRequiresBillingDetails,
  type RegisterLocale,
} from './registerPlanCopy'

const registerAccountPageStyles = `
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
    padding: 6px 0 164px;
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
    margin-bottom: 4px;
    flex-shrink: 0;
    align-self: flex-start;
    width: auto;
    max-width: 100%;
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
    max-width: 100%;
    padding: 30px;
    display: grid;
    gap: 22px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(223, 231, 245, 0.95);
    box-shadow: 0 20px 48px rgba(34, 78, 160, 0.12);
    flex-shrink: 0;
    margin-top: auto;
    margin-bottom: auto;
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
    appearance: none;
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    margin: 0;
    margin-top: 0.22em;
    border: 2px solid #b8cce8;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background-color 0.15s ease;
  }

  .register-flow.register-account-page .register-account-consent input[type='checkbox']:hover {
    border-color: #2f6df6;
  }

  .register-flow.register-account-page .register-account-consent input[type='checkbox']:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.28);
  }

  .register-flow.register-account-page .register-account-consent input[type='checkbox']:checked {
    background-color: #fff;
    border-color: #2f6df6;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath stroke='%232f6df6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.2 6.5 11.2 12.5 4.5'/%3E%3C/svg%3E");
    background-size: 11px 11px;
    background-position: center;
    background-repeat: no-repeat;
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

  .register-flow.register-account-page .register-account-verify-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #70809b;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .register-flow.register-account-page .register-account-verify-divider::before,
  .register-flow.register-account-page .register-account-verify-divider::after {
    content: '';
    height: 1px;
    background: #dfe7f5;
    flex: 1;
  }

  .register-flow.register-account-page .register-account-verify-link {
    border: 0;
    background: transparent;
    color: #17253d;
    font-size: 1.05rem;
    font-weight: 800;
    cursor: pointer;
    padding: 6px 0 0;
    width: 100%;
    height: auto;
    min-height: 0;
    border-radius: 0;
    box-shadow: none;
    line-height: 1.25;
  }

  .register-flow.register-account-page .register-account-verify-link:hover {
    text-decoration: underline;
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


const REGISTER_SELECTION_STORAGE_KEY = 'calendra.register.selectionSearch'
const REGISTER_SELECTION_PARAM_KEYS = [
  'plan',
  'package',
  'billing',
  'interval',
  'users',
  'sms',
  'voice',
  'billingAddon',
  'whitelabel',
] as const

type SignupSelectionPayload = {
  returnSearch?: string | null
  packageName?: string | null
  billingInterval?: string | null
}

type SignupResendCodeResponse = SignupSelectionPayload & {
  challengeId?: string
  email?: string
}

type SignupVerifyCodeResponse = SignupSelectionPayload & {
  token?: string
  user?: unknown
}

function hasExplicitRegisterSelection(search?: string | null) {
  const raw = (search || '').trim()
  if (!raw) return false
  const params = new URLSearchParams(raw.replace(/^\?/, ''))
  return REGISTER_SELECTION_PARAM_KEYS.some((key) => params.has(key))
}

function normalizeRegisterSelectionSearch(search?: string | null) {
  if (!hasExplicitRegisterSelection(search)) return ''
  return selectionToSearch(parseRegisterSelection(search || ''))
}

function getStoredRegisterSelectionSearch() {
  if (typeof window === 'undefined') return ''
  try {
    const stored = window.sessionStorage.getItem(REGISTER_SELECTION_STORAGE_KEY)
    return normalizeRegisterSelectionSearch(stored)
  } catch {
    return ''
  }
}

function storeRegisterSelectionSearch(search?: string | null) {
  const normalized = normalizeRegisterSelectionSearch(search)
  if (!normalized || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(REGISTER_SELECTION_STORAGE_KEY, normalized)
  } catch {
    // Best-effort only. The server returnSearch still keeps the flow correct.
  }
}

function selectionSearchFromPayload(payload?: SignupSelectionPayload | null) {
  const direct = normalizeRegisterSelectionSearch(payload?.returnSearch)
  if (direct) return direct

  const packageName = payload?.packageName?.trim()
  const billingInterval = payload?.billingInterval?.trim().toUpperCase()
  if (!packageName && !billingInterval) return ''

  const params = new URLSearchParams()
  if (packageName) params.set('package', packageName)
  params.set('billing', billingInterval === 'YEARLY' ? 'annual' : 'monthly')
  return selectionToSearch(parseRegisterSelection(params.toString()))
}

function resolveRegisterSelectionSearch(
  payload: SignupSelectionPayload | null | undefined,
  currentSearch: string,
  fallbackSelection: RegisterSelection,
) {
  return (
    selectionSearchFromPayload(payload) ||
    normalizeRegisterSelectionSearch(currentSearch) ||
    getStoredRegisterSelectionSearch() ||
    selectionToSearch(fallbackSelection)
  )
}

function queryWithRegisterSelection(currentSearch: string, payload?: SignupSelectionPayload | null) {
  const q = new URLSearchParams(currentSearch.replace(/^\?/, ''))
  const selectionSearch = selectionSearchFromPayload(payload) || normalizeRegisterSelectionSearch(currentSearch) || getStoredRegisterSelectionSearch()
  if (selectionSearch) {
    REGISTER_SELECTION_PARAM_KEYS.forEach((key) => q.delete(key))
    const selectionParams = new URLSearchParams(selectionSearch)
    selectionParams.forEach((value, key) => q.set(key, value))
    storeRegisterSelectionSearch(selectionSearch)
  }
  return q
}

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
  verifyCodeLabel: string
  verifyCodePlaceholder: string
  verifyPasswordLabel: string
  verifyPasswordPlaceholder: string
  verifyConfirmPasswordLabel: string
  verifyConfirmPasswordPlaceholder: string
  verifyNextStep: string
  verifyHelp: string
  finishVerifyTitle: string
  finishVerifySubtitle: string
  finishVerifyNextStep: string
  finishVerifyHelp: string
  verifyResend: string
  verifyResending: string
  verifySubmitting: string
  verifyAction: string
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
      'We sent a 6-digit verification code to your email. Enter the code below to continue.',
    verifyCodeLabel: 'Verification code',
    verifyCodePlaceholder: '000000',
    verifyPasswordLabel: 'Create password',
    verifyPasswordPlaceholder: 'Create a password',
    verifyConfirmPasswordLabel: 'Confirm password',
    verifyConfirmPasswordPlaceholder: 'Repeat your password',
    verifyNextStep: 'Next step',
    verifyHelp: 'Enter the newest code from your inbox. If needed, resend a fresh code or use another email.',
    finishVerifyTitle: 'Finish verifying your account',
    finishVerifySubtitle: 'This email already started account setup but is waiting for verification. Enter the newest code to continue.',
    finishVerifyNextStep: 'Continue your setup',
    finishVerifyHelp: 'We can resend a fresh code, or you can switch to another email.',
    verifyResend: 'Resend verification code',
    verifyResending: 'Sending…',
    verifySubmitting: 'Verifying…',
    verifyAction: 'Verify code and continue',
    verifyUseOther: 'Use another email',
    termsRequired: 'Please accept the terms to continue.',
    invalidWorkEmail: 'Enter a valid work email.',
    sessionSaveFailed: 'Could not save your signup session. Try again.',
    resetLinkSentHint: 'If an account exists, we sent a link.',
    emailAlreadyRegistered: 'An account with this email already exists.',
    verifySubtitleIntent:
      'We sent a code to verify your email. Enter it here to create your workspace.',
    intentEmailSentToast: 'Check your email for a verification code to continue.',
    registeredBadgeExists: 'Account already exists',
    registeredTitle: 'Sign in to continue your setup',
    registeredSubtitle: 'This email already belongs to a verified account. Sign in to continue where you left off.',
    registeredNextStep: 'Continue with your account',
    registeredHelp: 'Sign in to return to your existing account.',
    registeredSignIn: 'Sign in',
    registeredResetPassword: 'Reset password',
    invalidBadge: 'Verification link invalid',
    invalidTitle: 'This verification link is no longer valid',
    invalidSubtitle: 'The verification challenge may have expired or already been used. We can send you a fresh code.',
    invalidNextStep: 'Request a new code',
    invalidHelp: 'Send a new verification code, or switch to another email.',
    invalidResend: 'Send new verification code',
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
      'Na vaš e-mail smo poslali 6-mestno kodo za potrditev. Vnesite jo spodaj za nadaljevanje.',
    verifyCodeLabel: 'Verifikacijska koda',
    verifyCodePlaceholder: '000000',
    verifyPasswordLabel: 'Ustvarite geslo',
    verifyPasswordPlaceholder: 'Ustvarite geslo',
    verifyConfirmPasswordLabel: 'Potrdite geslo',
    verifyConfirmPasswordPlaceholder: 'Ponovite geslo',
    verifyNextStep: 'Naslednji korak',
    verifyHelp: 'Vnesite najnovejšo kodo iz e-pošte. Po potrebi pošljite novo kodo ali uporabite drug e-mail.',
    finishVerifyTitle: 'Dokončajte potrditev računa',
    finishVerifySubtitle: 'Ta e-mail je že začel nastavitev računa, vendar še čaka potrditev. Vnesite najnovejšo kodo.',
    finishVerifyNextStep: 'Nadaljujte z nastavitvijo',
    finishVerifyHelp: 'Lahko pošljemo novo kodo ali izberete drug e-mail.',
    verifyResend: 'Znova pošlji verifikacijsko kodo',
    verifyResending: 'Pošiljanje…',
    verifySubmitting: 'Preverjanje…',
    verifyAction: 'Preveri kodo in nadaljuj',
    verifyUseOther: 'Uporabi drug e-mail',
    termsRequired: 'Strinjajte se s pogoji za nadaljevanje.',
    invalidWorkEmail: 'Vnesite veljaven poslovni e-mail.',
    sessionSaveFailed: 'Seje ni bilo mogoče shraniti. Poskusite znova.',
    resetLinkSentHint: 'Če račun obstaja, smo poslali povezavo.',
    emailAlreadyRegistered: 'Račun s tem e-mailom že obstaja.',
    verifySubtitleIntent:
      'Poslali smo kodo za potrditev e-maila. Vnesite jo tukaj za ustvaritev okolja.',
    intentEmailSentToast: 'Preverite e-pošto za verifikacijsko kodo.',
    registeredBadgeExists: 'Račun že obstaja',
    registeredTitle: 'Prijavite se za nadaljevanje',
    registeredSubtitle: 'Ta e-mail pripada že potrjenemu računu. Prijavite se in nadaljujte.',
    registeredNextStep: 'Nadaljujte z obstoječim računom',
    registeredHelp: 'Prijavite se, da se vrnete v svoj račun.',
    registeredSignIn: 'Prijava',
    registeredResetPassword: 'Ponastavi geslo',
    invalidBadge: 'Verifikacijska povezava ni veljavna',
    invalidTitle: 'Ta verifikacijska povezava ni več veljavna',
    invalidSubtitle: 'Verifikacijski izziv je morda potekel ali že uporabljen. Lahko pošljemo novo kodo.',
    invalidNextStep: 'Zahtevaj novo kodo',
    invalidHelp: 'Pošljite novo verifikacijsko kodo ali uporabite drug naslov.',
    invalidResend: 'Pošlji novo verifikacijsko kodo',
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
  const [verifyEmailAddr, setVerifyEmailAddr] = useState('')
  const [verifyChallengeId, setVerifyChallengeId] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verifyPassword, setVerifyPassword] = useState('')
  const [verifyConfirmPassword, setVerifyConfirmPassword] = useState('')
  const [resending, setResending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [registeredResetSending, setRegisteredResetSending] = useState(false)
  const [footerExpanded, setFooterExpanded] = useState(false)
  const registerFooterRef = useRef<HTMLElement | null>(null)
  useRegisterFooterClickOutside(registerFooterRef, footerExpanded, setFooterExpanded)
  const [contactOpen, setContactOpen] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactError, setContactError] = useState('')

  useEffect(() => {
    void ensureRegisterCatalogLoaded()
  }, [])

  useEffect(() => {
    storeRegisterSelectionSearch(location.search)
  }, [location.search])

  const copy = accountPageCopy[locale as 'en' | 'sl'] ?? accountPageCopy.en
  const lang: RegisterLocale = locale === 'sl' ? 'sl' : 'en'
  const registerShell = useMemo(() => getRegisterPlanPageCopy(lang), [lang])
  const plans = useMemo(() => plansForLocale(lang), [lang])
  const pm = lang === 'sl' ? '/mes.' : '/mo'
  const packageName = selection.plan === 'basic' ? 'BASIC' : selection.plan === 'pro' ? 'PROFESSIONAL' : 'PREMIUM'
  const summary = useMemo(() => buildSummary(selection, lang), [selection, lang])
  const monthlyAmounts = useMemo(() => getSelectionMonthlyAmounts(selection), [selection])
  const websiteUrl = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.trim() || 'https://calendra.si'
  const contactSalesEmail = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || 'info@calendra.si'

  const footerPill = useMemo(() => buildRegisterFooterPill(selection, summary, lang), [selection, summary, lang])

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
        returnSearch: resolveRegisterSelectionSearch(null, location.search, selection),
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
      const challenge = q.get('challengeId')
      setVerifyChallengeId(challenge ? challenge : '')
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
        setVerifyChallengeId(q.get('challengeId') || '')
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
        setVerifyChallengeId(q.get('challengeId') || '')
        setView('verify')
      }
    }
  }, [location.search])

  const navigateToFinishVerify = (addr: string, challengeId?: string, payload?: SignupSelectionPayload | null) => {
    const q = queryWithRegisterSelection(location.search, payload)
    q.set('finishVerify', '1')
    q.delete('invalidVerify')
    q.delete('verifyEmail')
    q.delete('pendingAccountCreation')
    q.delete('existingAccount')
    q.set('email', addr)
    if (challengeId) q.set('challengeId', challengeId)
    else q.delete('challengeId')
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const navigateToVerify = (addr: string, challengeId?: string, payload?: SignupSelectionPayload | null) => {
    setVerifyScenario('new')
    const q = queryWithRegisterSelection(location.search, payload)
    q.set('verifyEmail', '1')
    q.delete('invalidVerify')
    q.delete('finishVerify')
    q.delete('existingAccount')
    q.delete('pendingAccountCreation')
    q.set('email', addr)
    if (challengeId) q.set('challengeId', challengeId)
    else q.delete('challengeId')
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const navigateToExistingAccount = (addr: string, payload?: SignupSelectionPayload | null) => {
    const q = queryWithRegisterSelection(location.search, payload)
    q.set('existingAccount', '1')
    q.delete('invalidVerify')
    q.delete('verifyEmail')
    q.delete('finishVerify')
    q.delete('pendingAccountCreation')
    q.delete('challengeId')
    q.set('email', addr)
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const navigateToInvalidVerify = (addr: string, challengeId?: string, payload?: SignupSelectionPayload | null) => {
    const q = queryWithRegisterSelection(location.search, payload)
    q.set('invalidVerify', '1')
    q.delete('verifyEmail')
    q.delete('finishVerify')
    q.delete('existingAccount')
    q.delete('pendingAccountCreation')
    q.set('email', addr)
    if (challengeId) q.set('challengeId', challengeId)
    else q.delete('challengeId')
    navigate(`/register/account?${q.toString()}`, { replace: true })
  }

  const openVerify = (addr: string, challengeId?: string, payload?: SignupSelectionPayload | null) => {
    setError('')
    setVerifyEmailAddr(addr)
    setEmail(addr)
    setVerifyScenario('new')
    setVerifyChallengeId(challengeId || '')
    setVerificationCode('')
    setVerifyPassword('')
    setVerifyConfirmPassword('')
    setView('verify')
    navigateToVerify(addr, challengeId, payload)
  }

  const openFinishVerify = (addr: string, challengeId?: string, payload?: SignupSelectionPayload | null) => {
    setError('')
    setVerifyEmailAddr(addr)
    setEmail(addr)
    setVerifyScenario('existing')
    setVerifyChallengeId(challengeId || '')
    setVerificationCode('')
    setVerifyPassword('')
    setVerifyConfirmPassword('')
    setView('verify')
    navigateToFinishVerify(addr, challengeId, payload)
  }

  const openRegisteredAccount = (addr: string) => {
    setError('')
    setVerifyEmailAddr(addr)
    setEmail(addr)
    setView('registered')
    navigateToExistingAccount(addr)
  }

  const openInvalidVerify = (addr: string, challengeId?: string, payload?: SignupSelectionPayload | null) => {
    setError('')
    setVerifyEmailAddr(addr)
    setEmail(addr)
    setVerifyChallengeId(challengeId || '')
    setVerificationCode('')
    setVerifyPassword('')
    setVerifyConfirmPassword('')
    setView('invalid')
    navigateToInvalidVerify(addr, challengeId, payload)
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
        const pendingEmail = String(check.email || addr)
        const { data: resend } = await api.post<SignupResendCodeResponse>('/auth/signup/resend-code', { email: pendingEmail })
        const nextEmail = String(resend?.email || pendingEmail)
        const nextChallenge = String(resend?.challengeId || '')
        setVerifyEmailAddr(nextEmail)
        setVerifyChallengeId(nextChallenge)
        setVerificationCode('')
        setVerifyPassword('')
        setVerifyConfirmPassword('')
        openFinishVerify(nextEmail, nextChallenge, resend)
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
        returnSearch: resolveRegisterSelectionSearch(null, location.search, selection),
      })

      if (data?.token && data?.user) {
        storeAuthenticatedSession(data)
        window.location.reload()
        return
      }

      if (data?.pendingAccountCreation && data?.email && data?.challengeId) {
        const nextEmail = String(data.email)
        const nextChallenge = String(data.challengeId)
        openVerify(nextEmail, nextChallenge, data)
        showToast('success', copy.intentEmailSentToast)
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
          const pendingEmail = String(d.email)
          try {
            const { data: resend } = await api.post<SignupResendCodeResponse>('/auth/signup/resend-code', { email: pendingEmail })
            openFinishVerify(String(resend?.email || pendingEmail), String(resend?.challengeId || ''), resend)
          } catch {
            openFinishVerify(pendingEmail)
          }
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
      const currentScenario = verifyScenario
      const wasInvalidView = view === 'invalid'
      const { data } = await api.post<SignupResendCodeResponse>('/auth/signup/resend-code', {
        challengeId: verifyChallengeId || undefined,
        email: verifyEmailAddr,
      })
      const nextEmail = String(data?.email || verifyEmailAddr)
      const nextChallenge = String(data?.challengeId || verifyChallengeId || '')
      setVerifyEmailAddr(nextEmail)
      setVerifyChallengeId(nextChallenge)
      setVerificationCode('')
      if (wasInvalidView) {
        if (currentScenario === 'existing') {
          openFinishVerify(nextEmail, nextChallenge, data)
        } else {
          openVerify(nextEmail, nextChallenge, data)
        }
      } else if (currentScenario === 'existing') {
        navigateToFinishVerify(nextEmail, nextChallenge, data)
      } else {
        navigateToVerify(nextEmail, nextChallenge, data)
      }
      showToast('success', copy.intentEmailSentToast)
    } catch {
      showToast('success', copy.intentEmailSentToast)
    } finally {
      setResending(false)
    }
  }

  const submitVerification = async () => {
    if (!verifyChallengeId) {
      setError('Missing verification challenge. Please resend code.')
      return
    }
    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError('Enter a valid 6-digit verification code.')
      return
    }
    if (verifyPassword.length < 8 || !/\d/.test(verifyPassword) || !/[A-Z]/.test(verifyPassword) || !/[a-z]/.test(verifyPassword)) {
      setError('Password must include at least 8 characters, uppercase, lowercase, and a number.')
      return
    }
    if (verifyPassword !== verifyConfirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const { data } = await api.post<SignupVerifyCodeResponse>('/auth/signup/verify-code', {
        challengeId: verifyChallengeId,
        code: verificationCode.trim(),
        password: verifyPassword,
      })
      // Web signup verify succeeds via auth cookie and may omit JSON token.
      if (data?.user) {
        storeAuthenticatedSession({ token: data.token, user: data.user })
        const nextSearch = resolveRegisterSelectionSearch(data, location.search, selection)
        storeRegisterSelectionSearch(nextSearch)
        const nextSelection = parseRegisterSelection(nextSearch)
        const nextPath = selectionRequiresBillingDetails(nextSelection)
          ? `/register/billing-details?${selectionToSearch(nextSelection)}`
          : '/calendar'
        window.location.assign(nextPath)
        return
      }
      setError(t('signupFailed'))
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.message || t('signupFailed')
        setError(message)
        if (err.response?.data?.invalidVerificationCode || err.response?.data?.invalidVerificationLink) {
          openInvalidVerify(verifyEmailAddr, verifyChallengeId, err.response?.data as SignupSelectionPayload)
        }
      } else {
        setError(t('signupFailed'))
      }
    } finally {
      setVerifying(false)
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
    const q = queryWithRegisterSelection(location.search)
    q.delete('invalidVerify')
    q.delete('verifyEmail')
    q.delete('finishVerify')
    q.delete('existingAccount')
    q.delete('pendingAccountCreation')
    q.delete('challengeId')
    q.delete('email')
    const next = q.toString()
    navigate(next ? `/register/account?${next}` : '/register/account', { replace: true })
    setView('form')
    setVerifyScenario('new')
    setVerifyChallengeId('')
    setVerificationCode('')
    setVerifyPassword('')
    setVerifyConfirmPassword('')
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
      setContactError(registerShell.contactErrRequired)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setContactError(registerShell.contactErrEmail)
      return
    }
    const subject = encodeURIComponent(registerShell.contactSubject)
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${emailValue}\nPhone: ${phoneValue || '—'}\n\n${message}`)
    window.location.href = `mailto:${contactSalesEmail}?subject=${subject}&body=${body}`
    showToast('success', registerShell.toastOpenMail)
    closeContactModal()
    setContactName('')
    setContactEmail('')
    setContactPhone('')
    setContactMessage('')
  }

  return (
    <div className="register-flow register-account-page">
      <style>{registerPageStyles + registerAccountPageStyles}</style>
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={loginLogo} alt={registerShell.brandAlt} />
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
          <h1 className="register-sr-only">Calendra — account setup</h1>
          <div className="register-account-main">
            <div className="register-stepper-row register-account-stepper-row">
              <div className="stepper" aria-label={registerShell.stepperAria}>
                <div className="step step-done">{registerShell.step1} ✓</div>
                <div className="step step-current">{registerShell.step2}</div>
                <div className="step">{registerShell.step3}</div>
              </div>
            </div>
            <div className="register-account-page-stack">
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
                    <button type="button" className="register-account-verify-link" onClick={useAnotherEmail}>
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
                            : copy.verifySubtitleIntent}
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
                    <div className="register-account-field">
                      <label htmlFor="register-account-verify-code">{copy.verifyCodeLabel}</label>
                      <input
                        id="register-account-verify-code"
                        name="verifyCode"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
                        placeholder={copy.verifyCodePlaceholder}
                        type="text"
                      />
                    </div>
                    <div className="register-account-field">
                      <label htmlFor="register-account-verify-password">{copy.verifyPasswordLabel}</label>
                      <input
                        id="register-account-verify-password"
                        name="verifyPassword"
                        autoComplete="new-password"
                        value={verifyPassword}
                        onChange={(e) => setVerifyPassword(e.target.value)}
                        placeholder={copy.verifyPasswordPlaceholder}
                        type="password"
                      />
                    </div>
                    <div className="register-account-field">
                      <label htmlFor="register-account-verify-password-repeat">{copy.verifyConfirmPasswordLabel}</label>
                      <input
                        id="register-account-verify-password-repeat"
                        name="verifyPasswordRepeat"
                        autoComplete="new-password"
                        value={verifyConfirmPassword}
                        onChange={(e) => setVerifyConfirmPassword(e.target.value)}
                        placeholder={copy.verifyConfirmPasswordPlaceholder}
                        type="password"
                      />
                    </div>
                    {error ? <div className="error">{error}</div> : null}
                    <button
                      type="button"
                      className="register-account-submit"
                      disabled={verifying}
                      onClick={() => void submitVerification()}
                    >
                      {verifying ? copy.verifySubmitting : copy.verifyAction}
                    </button>
                    <button
                      type="button"
                      className="register-account-back-plan"
                      disabled={resending}
                      onClick={() => void resendVerificationEmail()}
                    >
                      {resending ? copy.verifyResending : copy.verifyResend}
                    </button>
                    <div className="register-account-verify-divider">{copy.divider}</div>
                    <button type="button" className="register-account-verify-link" onClick={useAnotherEmail}>
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

      <footer
        ref={registerFooterRef}
        className={`register-fixed-footer${footerExpanded ? ' is-expanded' : ''}`}
        role="contentinfo"
      >
        <div className={`register-fixed-footer-inner register-footer-panel${footerExpanded ? ' is-expanded' : ''}`}>
          <div className="register-footer-toolbar">
            <div className="register-footer-toolbar-lead">
              <div className="register-footer-back">
                <button className="back-link" type="button" onClick={() => window.location.assign(websiteUrl)}>{registerShell.backWebsite}</button>
              </div>

              <button type="button" className="custom-cta custom-cta--footer-toolbar" onClick={openContactModal}>
                {registerShell.customCta}
              </button>
            </div>

            <div className="register-footer-center-cluster">
              <div className="register-footer-toolbar-mid">
                <button
                  type="button"
                  className="register-footer-pill"
                  aria-expanded={footerExpanded}
                  aria-controls="register-footer-details"
                  aria-label={footerExpanded ? registerShell.footerHideDetails : registerShell.footerShowDetails}
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
                    <span className="register-footer-total-label">{registerShell.footerEstTotal}</span>
                    <strong className="register-footer-total-value">{summary.totalPrimary}</strong>
                  </span>
                  <span className="register-footer-pill-chevron" aria-hidden>
                    <RegisterFooterChevron up={!footerExpanded} />
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
                  <span className="register-footer-peek-label">{registerShell.footerPlanPeek}</span>
                  <strong className="register-footer-peek-name">{plans[selection.plan].name}</strong>
                  <span className="register-footer-peek-value">{summary.rows[0]?.value ?? '—'}</span>
                </div>
                <div className="register-footer-peek-plus" aria-hidden>
                  +
                </div>
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">{registerShell.footerUsagePeek}</span>
                  <strong className="register-footer-peek-name">
                    {usageAddonLineCount}{' '}
                    {usageAddonLineCount === 1 ? registerShell.footerItemSingular : registerShell.footerItemPlural}
                  </strong>
                  <span className="register-footer-peek-value">{formatEuro(peekAddonMonthly)}{pm}</span>
                </div>
              </div>

              <div className="register-footer-detail-card">
                <h3 className="register-footer-detail-title">{registerShell.footerBreakdownTitle}</h3>
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
                      {annualSaveBadgeText(formatEuro(summary.annualSavingsYr), lang)}
                    </span>
                  ) : null}
                  <div className="register-footer-detail-total">
                    <span className="register-footer-detail-total-label">{registerShell.footerEstTotal}</span>
                    <strong className="register-footer-detail-total-value">{summary.totalPrimary}</strong>
                  </div>
                </div>
              </div>

              <button type="button" className="register-footer-hide-link" onClick={() => setFooterExpanded(false)}>
                {registerShell.footerHideDetails}
                <RegisterFooterChevron up />
              </button>
            </div>
          ) : null}
        </div>
      </footer>

      {contactOpen ? (
        <div className="register-contact-modal-root" role="presentation">
          <button type="button" className="register-contact-modal-backdrop" aria-label={registerShell.contactCloseBackdrop} onClick={closeContactModal} />
          <div
            className="register-contact-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-contact-title"
          >
            <h2 id="register-contact-title" className="register-contact-modal-title">{registerShell.contactTitle}</h2>
            <p className="register-contact-modal-intro">{registerShell.contactIntro}</p>
            <div className="register-contact-form stack gap-md">
              <Field label={registerShell.contactName}>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label={registerShell.contactEmail}>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label={registerShell.contactPhone} hint={registerShell.contactPhoneHint}>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} autoComplete="tel" />
              </Field>
              <Field label={registerShell.contactMessage}>
                <textarea rows={4} value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} placeholder={registerShell.contactPlaceholder} />
              </Field>
              {contactError ? <p className="register-contact-error" role="alert">{contactError}</p> : null}
            </div>
            <div className="register-contact-modal-actions">
              <button type="button" className="register-contact-cancel" onClick={closeContactModal}>
                {registerShell.contactCancel}
              </button>
              <button type="button" className="register-contact-submit" onClick={submitContactModal}>
                {registerShell.contactSubmit}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
