import { normalizePackageType } from '../lib/packageAccess'

export type RegisterPlanKey = 'basic' | 'pro' | 'business'
export type RegisterBillingCycle = 'monthly' | 'annual'

export type RegisterSelection = {
  plan: RegisterPlanKey
  billing: RegisterBillingCycle
  additionalUsers: number
  additionalSms: number
  addons: {
    voice: boolean
    billing: boolean
    whitelabel: boolean
  }
}

export const registerPlanToPackage = {
  basic: 'BASIC',
  pro: 'PROFESSIONAL',
  business: 'PREMIUM',
} as const

export function getRegisterPlanFromPackage(raw?: string | null): RegisterPlanKey {
  const normalized = normalizePackageType(raw)
  switch (normalized) {
    case 'BASIC':
    case 'TRIAL':
      return 'basic'
    case 'PREMIUM':
      return 'business'
    case 'PROFESSIONAL':
    default:
      return 'pro'
  }
}

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function parseBool(value: string | null) {
  return value === '1' || value === 'true' || value === 'yes'
}

export function parseRegisterSelection(search: string): RegisterSelection {
  const params = new URLSearchParams(search)
  const rawPlan = params.get('plan')?.trim().toLowerCase()
  const rawBilling = params.get('billing')?.trim().toLowerCase()

  const plan: RegisterPlanKey = rawPlan === 'basic' || rawPlan === 'pro' || rawPlan === 'business'
    ? rawPlan
    : getRegisterPlanFromPackage(params.get('package'))

  const billing: RegisterBillingCycle = rawBilling === 'annual' || rawBilling === 'yearly' ? 'annual' : 'monthly'

  return {
    plan,
    billing,
    additionalUsers: clampInt(params.get('users'), 1, 10, 1),
    additionalSms: clampInt(params.get('sms'), 0, 1000, 0),
    addons: {
      voice: parseBool(params.get('voice')),
      billing: parseBool(params.get('billingAddon')),
      whitelabel: parseBool(params.get('whitelabel')),
    },
  }
}

export function selectionToSearch(selection: RegisterSelection) {
  const params = new URLSearchParams()
  params.set('plan', selection.plan)
  params.set('package', registerPlanToPackage[selection.plan])
  params.set('billing', selection.billing)
  params.set('interval', selection.billing === 'annual' ? 'YEARLY' : 'MONTHLY')
  params.set('users', String(selection.additionalUsers))
  params.set('sms', String(selection.additionalSms))
  if (selection.addons.voice) params.set('voice', '1')
  if (selection.addons.billing) params.set('billingAddon', '1')
  if (selection.addons.whitelabel) params.set('whitelabel', '1')
  return params.toString()
}

/** Additional users on the signup slider (min 1). The first additional user is not billed. */
export function getBillableAdditionalUserSlots(selection: RegisterSelection): number {
  return Math.max(0, selection.additionalUsers - 1)
}

export function getEstimatedUserCount(selection: RegisterSelection) {
  const baseAllowance = selection.plan === 'basic' ? 1 : selection.plan === 'pro' ? 5 : 10
  return baseAllowance + selection.additionalUsers
}

export function getBillingInterval(selection: RegisterSelection) {
  return selection.billing === 'annual' ? 'YEARLY' : 'MONTHLY'
}

/** After email confirmation creates the tenant, land on account setup with plan params preserved. */
export function buildPostProvisionVerifyPath(email: string, returnSearch: string | null | undefined) {
  const rs = (returnSearch ?? '').trim()
  const q = new URLSearchParams(rs.replace(/^\?/, ''))
  q.set('verifyEmail', '1')
  q.set('email', email)
  q.delete('pendingAccountCreation')
  q.delete('finishVerify')
  q.delete('existingAccount')
  return `/register/account?${q.toString()}`
}
