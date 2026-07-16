import { normalizePackageType } from '../lib/packageAccess'

export type RegisterPlanKey = 'basic' | 'pro' | 'business'
export type RegisterBillingCycle = 'monthly' | 'annual'

export type RegisterSelection = {
  plan: RegisterPlanKey
  billing: RegisterBillingCycle
  additionalUsers: number
  additionalSms: number
  /** Selected feature add-ons by catalog key. Dynamic keys are allowed because platform admin can edit the public add-on catalog. */
  addons: Record<string, boolean>
}

export const registerPlanToPackage = {
  basic: 'BASIC',
  pro: 'PROFESSIONAL',
  business: 'PREMIUM',
} as const

export function isBasicMonthlyTrial(selection: Pick<RegisterSelection, 'plan' | 'billing'>) {
  return selection.plan === 'basic' && selection.billing === 'monthly'
}

/**
 * The 14-day Basic monthly trial always starts with one user and no paid usage/add-ons.
 * Extra users, SMS and feature add-ons can be scheduled later from the tenant subscription page.
 */
export function normalizeRegisterSelection(selection: RegisterSelection): RegisterSelection {
  if (!isBasicMonthlyTrial(selection)) return selection
  return {
    ...selection,
    additionalUsers: 1,
    additionalSms: 0,
    addons: {},
  }
}

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

function normalizeAddonKey(raw: string | null | undefined) {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function parseRegisterSelection(search: string): RegisterSelection {
  const params = new URLSearchParams(search)
  const rawPlan = params.get('plan')?.trim().toLowerCase()
  const rawBilling = params.get('billing')?.trim().toLowerCase()

  const plan: RegisterPlanKey = rawPlan === 'basic' || rawPlan === 'pro' || rawPlan === 'business'
    ? rawPlan
    : getRegisterPlanFromPackage(params.get('package'))

  const billing: RegisterBillingCycle = rawBilling === 'annual' || rawBilling === 'yearly' ? 'annual' : 'monthly'

  const rawSms = clampInt(params.get('sms'), 0, 1000, 0)
  const additionalSms = Math.min(1000, Math.max(0, Math.round(rawSms / 50) * 50))

  const addons: Record<string, boolean> = {}
  params.getAll('addon').forEach((key) => {
    const normalized = normalizeAddonKey(key)
    if (normalized) addons[normalized] = true
  })
  if (parseBool(params.get('voice'))) addons.voice = true
  if (parseBool(params.get('billingAddon'))) addons.billing = true
  if (parseBool(params.get('whitelabel'))) addons.whitelabel = true

  return normalizeRegisterSelection({
    plan,
    billing,
    additionalUsers: clampInt(params.get('users'), 1, 10, 1),
    additionalSms,
    addons,
  })
}

export function selectionToSearch(selection: RegisterSelection) {
  const normalized = normalizeRegisterSelection(selection)
  const params = new URLSearchParams()
  params.set('plan', normalized.plan)
  params.set('package', registerPlanToPackage[normalized.plan])
  params.set('billing', normalized.billing)
  params.set('interval', normalized.billing === 'annual' ? 'YEARLY' : 'MONTHLY')
  params.set('users', String(normalized.additionalUsers))
  params.set('sms', String(normalized.additionalSms))
  Object.entries(normalized.addons || {})
    .filter(([, selected]) => selected)
    .map(([key]) => normalizeAddonKey(key))
    .filter(Boolean)
    .sort()
    .forEach((key) => params.append('addon', key))
  if (normalized.addons.voice) params.set('voice', '1')
  if (normalized.addons.billing) params.set('billingAddon', '1')
  if (normalized.addons.whitelabel) params.set('whitelabel', '1')
  return params.toString()
}

/** Total user seats selected on signup (min 1). The first user is included; every extra seat is billed. */
export function getBillableAdditionalUserSlots(selection: RegisterSelection): number {
  if (isBasicMonthlyTrial(selection)) return 0
  return Math.max(0, selection.additionalUsers - 1)
}

export function getEstimatedUserCount(selection: RegisterSelection) {
  if (isBasicMonthlyTrial(selection)) return 1
  return Math.max(1, selection.additionalUsers)
}

export function getBillingInterval(selection: RegisterSelection) {
  return selection.billing === 'annual' ? 'YEARLY' : 'MONTHLY'
}

/** Build OTP verification return path for account setup with plan params preserved. */
export function buildPostProvisionVerifyPath(email: string, returnSearch: string | null | undefined, challengeId?: string) {
  const rs = (returnSearch ?? '').trim()
  const q = new URLSearchParams(rs.replace(/^\?/, ''))
  q.set('verifyEmail', '1')
  q.set('email', email)
  if (challengeId) q.set('challengeId', challengeId)
  else q.delete('challengeId')
  q.delete('pendingAccountCreation')
  q.delete('finishVerify')
  q.delete('existingAccount')
  return `/register/account?${q.toString()}`
}
