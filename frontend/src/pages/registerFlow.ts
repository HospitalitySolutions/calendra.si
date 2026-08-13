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
  /** Business information collected in step 1 of the onboarding flow. */
  companyName?: string
  businessType?: string
  /** Optional platform feature choices. Basic-plan features are implicit and therefore omitted. */
  features?: Record<string, boolean>
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
 * Basic monthly still starts without SMS usage. The redesigned onboarding keeps the
 * requested company user count and optional selections so the next steps can derive
 * the appropriate package and billing requirements.
 */
export function normalizeRegisterSelection(selection: RegisterSelection): RegisterSelection {
  // The new onboarding flow collects the requested user count before a package is
  // derived from optional features. Keep that count intact even for a fresh Basic
  // trial so it can be used if the user selects a paid feature in step 2.
  if (!isBasicMonthlyTrial(selection)) return selection
  return {
    ...selection,
    additionalSms: 0,
    addons: selection.addons || {},
    features: selection.features || {},
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
    : (params.get('package') ? getRegisterPlanFromPackage(params.get('package')) : 'basic')

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

  const features: Record<string, boolean> = {}
  params.getAll('feature').forEach((key) => {
    const normalized = normalizeAddonKey(key)
    if (normalized) features[normalized] = true
  })

  return normalizeRegisterSelection({
    plan,
    billing,
    additionalUsers: clampInt(params.get('users'), 1, 100, 1),
    additionalSms,
    addons,
    companyName: params.get('company')?.trim() || '',
    businessType: params.get('businessType')?.trim() || '',
    features,
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
  if (normalized.companyName?.trim()) params.set('company', normalized.companyName.trim())
  if (normalized.businessType?.trim()) params.set('businessType', normalized.businessType.trim())
  Object.entries(normalized.features || {})
    .filter(([, selected]) => selected)
    .map(([key]) => normalizeAddonKey(key))
    .filter(Boolean)
    .sort()
    .forEach((key) => params.append('feature', key))
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
  return Math.max(0, selection.additionalUsers - 1)
}

export function getEstimatedUserCount(selection: RegisterSelection) {
  return Math.max(1, selection.additionalUsers)
}

export function getBillingInterval(selection: RegisterSelection) {
  return selection.billing === 'annual' ? 'YEARLY' : 'MONTHLY'
}