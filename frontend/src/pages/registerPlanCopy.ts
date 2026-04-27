import { getBillableAdditionalUserSlots, type RegisterBillingCycle, type RegisterPlanKey, type RegisterSelection } from './registerFlow'

export type RegisterLocale = 'en' | 'sl'

export type RegisterPlanFeatureKey =
  | 'appointments'
  | 'staff'
  | 'group'
  | 'resources'
  | 'payments'
  | 'reminders'
  | 'ai'
  | 'integrations'
  | 'reporting'
  | 'multilocation'

export type RegisterPlanAddonKey = 'voice' | 'billing' | 'whitelabel'

export type PlanConfig = {
  name: string
  monthly: number
  description: string
  features: RegisterPlanFeatureKey[]
}

/** Monthly EUR amounts; mutated when `/api/register/catalog` loads. */
const planCore: Record<RegisterPlanKey, { monthly: number; features: RegisterPlanFeatureKey[] }> = {
  basic: { monthly: 18.9, features: ['appointments', 'staff'] },
  pro: {
    monthly: 34.9,
    features: ['appointments', 'staff', 'group', 'resources', 'payments', 'reminders', 'ai', 'integrations'],
  },
  business: {
    monthly: 59.9,
    features: [
      'appointments',
      'staff',
      'group',
      'resources',
      'payments',
      'reminders',
      'ai',
      'integrations',
      'reporting',
      'multilocation',
    ],
  },
}

const addonMonthlyAmounts: Record<RegisterPlanAddonKey, number> = {
  voice: 12,
  billing: 8,
  whitelabel: 10,
}

function clampCatalogMoney(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100_000
}

/** Apply server catalog (public register + platform admin). Unknown keys ignored. */
export function hydrateRegisterCatalogFromApi(data: { plans?: Record<string, unknown>; addons?: Record<string, unknown> } | null | undefined) {
  if (!data) return
  if (data.plans) {
    for (const k of ['basic', 'pro', 'business'] as const) {
      const v = data.plans[k]
      if (typeof v === 'number' && clampCatalogMoney(v)) {
        planCore[k].monthly = Math.round(v * 100) / 100
      }
    }
  }
  if (data.addons) {
    for (const k of ['voice', 'billing', 'whitelabel'] as const) {
      const v = data.addons[k]
      if (typeof v === 'number' && clampCatalogMoney(v)) {
        addonMonthlyAmounts[k] = Math.round(v * 100) / 100
      }
    }
  }
}

const planNamesDesc: Record<RegisterLocale, Record<RegisterPlanKey, { name: string; description: string }>> = {
  en: {
    basic: {
      name: 'Basic',
      description:
        'Ideal for solo providers starting with simple one-on-one bookings and a low-friction onboarding path.',
    },
    pro: {
      name: 'Pro',
      description: 'Best for growing businesses with reminders, payments, and more advanced booking flows.',
    },
    business: {
      name: 'Business',
      description: 'For larger teams, multiple locations, and advanced reporting.',
    },
  },
  sl: {
    basic: {
      name: 'Osnovni',
      description:
        'Za samostojne izvajalce, ki začnejo z enostavnimi rezervacijami in hitro uvedbo brez zapletov.',
    },
    pro: {
      name: 'Pro',
      description:
        'Za rastoča podjetja z opomniki, plačili in naprednejšimi poteki rezervacij.',
    },
    business: {
      name: 'Poslovni',
      description: 'Za večje ekipe, več lokacij in naprednejše poročanje.',
    },
  },
}

export function plansForLocale(locale: RegisterLocale): Record<RegisterPlanKey, PlanConfig> {
  const names = planNamesDesc[locale]
  return {
    basic: { ...planCore.basic, ...names.basic },
    pro: { ...planCore.pro, ...names.pro },
    business: { ...planCore.business, ...names.business },
  }
}

/** English defaults for imports that expect a static `plans` object. */
export const plans = plansForLocale('en')

export function formatEuro(value: number) {
  const rounded = Math.round(value * 100) / 100
  return rounded % 1 === 0 ? `€${rounded.toFixed(0)}` : `€${rounded.toFixed(2)}`
}

function annualPrice(monthly: number) {
  return Number((monthly * 12 * 0.85).toFixed(2))
}

const perMo: Record<RegisterLocale, string> = { en: '/mo', sl: '/mes.' }

const cardStrings: Record<
  RegisterLocale,
  {
    planCardAnnualNote: (yr: string) => string
    planCardAnnualNoteShort: (yr: string) => string
    planCardNotePro: string
    planCardNoteBusiness: string
    trialHighlight: string
    trialUnlessCancelled: (priceWithSuffix: string) => string
  }
> = {
  en: {
    planCardAnnualNote: (yr: string) => `Billed annually at ${yr}/yr (15% off).`,
    planCardAnnualNoteShort: (yr: string) => `Billed annually at ${yr}/yr.`,
    planCardNotePro: 'Best for growing businesses with up to 5 team members.',
    planCardNoteBusiness: 'Built for larger operations and multi-location teams.',
    trialHighlight: 'Free for 14 days',
    trialUnlessCancelled: (priceWithSuffix: string) => `, then ${priceWithSuffix} unless cancelled.`,
  },
  sl: {
    planCardAnnualNote: (yr: string) => `Letno obračunavanje: ${yr}/leto (popust 15 %).`,
    planCardAnnualNoteShort: (yr: string) => `Letno obračunavanje: ${yr}/leto.`,
    planCardNotePro: 'Za rastoča podjetja z do 5 člani ekipe.',
    planCardNoteBusiness: 'Za večje operacije in ekipe na več lokacijah.',
    trialHighlight: 'Prvih 14 dni brezplačno',
    trialUnlessCancelled: (priceWithSuffix: string) => `, nato ${priceWithSuffix}, razen če prekličete.`,
  },
}

function cardLoc(locale: RegisterLocale) {
  return cardStrings[locale]
}

export function getPlanDisplay(planKey: RegisterPlanKey, billing: RegisterBillingCycle, locale: RegisterLocale) {
  const plan = planCore[planKey]
  const pm = perMo[locale]
  const basicMonthly = formatEuro(planCore.basic.monthly)

  if (planKey === 'basic' && billing === 'monthly') {
    const secondary =
      locale === 'sl'
        ? `14-dnevni brezplačni preizkus, nato ${basicMonthly}${pm}`
        : `14-day free trial, then ${basicMonthly}${pm}`
    return {
      primary: `${basicMonthly}${pm}`,
      secondary,
    }
  }

  if (billing === 'annual') {
    const annual = annualPrice(plan.monthly)
    const yr = formatEuro(annual)
    const secondary =
      locale === 'sl' ? `Letno obračunavanje: ${yr}/leto` : `Billed annually at ${yr}/yr`
    return {
      primary: `${formatEuro(annual / 12)}${pm}`,
      secondary,
    }
  }

  return {
    primary: `${formatEuro(plan.monthly)}${pm}`,
    secondary: locale === 'sl' ? 'Mesečno obračunavanje' : 'Billed monthly',
  }
}

export function getPlanCardPriceNote(planKey: RegisterPlanKey, billing: RegisterBillingCycle, locale: RegisterLocale) {
  const pm = perMo[locale]
  const loc = cardLoc(locale)
  const priceWithSuffix = `${formatEuro(planCore.basic.monthly)}${pm}`

  if (planKey === 'basic') {
    if (billing === 'monthly') {
      return {
        badgeVisible: true,
        price: formatEuro(planCore.basic.monthly),
        per: pm,
        oldPriceVisible: false,
        oldPrice: '',
        note: '',
        noteIsTrial: true,
        trialHighlight: loc.trialHighlight,
        trialUnlessCancelled: loc.trialUnlessCancelled(priceWithSuffix),
      }
    }

    const annual = annualPrice(planCore.basic.monthly)
    return {
      badgeVisible: false,
      price: formatEuro(annual / 12),
      per: pm,
      oldPriceVisible: false,
      oldPrice: '',
      note: loc.planCardAnnualNote(formatEuro(annual)),
      noteIsTrial: false,
      trialHighlight: '',
      trialUnlessCancelled: '',
    }
  }

  if (billing === 'annual') {
    const annual = annualPrice(planCore[planKey].monthly)
    return {
      badgeVisible: false,
      price: formatEuro(annual / 12),
      per: pm,
      oldPriceVisible: false,
      oldPrice: '',
      note: loc.planCardAnnualNoteShort(formatEuro(annual)),
      noteIsTrial: false,
      trialHighlight: '',
      trialUnlessCancelled: '',
    }
  }

  return {
    badgeVisible: false,
    price: formatEuro(planCore[planKey].monthly),
    per: pm,
    oldPriceVisible: false,
    oldPrice: '',
    note: planKey === 'pro' ? loc.planCardNotePro : loc.planCardNoteBusiness,
    noteIsTrial: false,
    trialHighlight: '',
    trialUnlessCancelled: '',
  }
}

function addonMonthly(locale: RegisterLocale): Record<RegisterPlanAddonKey, { name: string; monthly: number; description: string }> {
  const en = {
    voice: {
      name: 'AI voice booking',
      monthly: addonMonthlyAmounts.voice,
      description: 'Hands-free assistant for faster scheduling.',
    },
    billing: {
      name: 'Billing & invoices',
      monthly: addonMonthlyAmounts.billing,
      description: 'Invoices, payment records, and exports.',
    },
    whitelabel: {
      name: 'Branded booking experience',
      monthly: addonMonthlyAmounts.whitelabel,
      description: 'Custom colors, domain, and branded notifications.',
    },
  }
  const sl = {
    voice: {
      name: 'AI glasovne rezervacije',
      monthly: addonMonthlyAmounts.voice,
      description: 'Pomočnik brez rok za hitrejše naročanje terminov.',
    },
    billing: {
      name: 'Obračun in računi',
      monthly: addonMonthlyAmounts.billing,
      description: 'Računi, evidence plačil in izvozi.',
    },
    whitelabel: {
      name: 'Blagovna znamka pri rezervacijah',
      monthly: addonMonthlyAmounts.whitelabel,
      description: 'Barve, domena in obvestila v vaši blagovni znamki.',
    },
  }
  return locale === 'sl' ? sl : en
}

export function getAddonCatalog(locale: RegisterLocale) {
  return addonMonthly(locale)
}

export function getSelectionMonthlyAmounts(selection: RegisterSelection) {
  const selectedPlan = selection.plan
  const planMonthly = selectedPlan === 'basic' && selection.billing === 'monthly' ? 0 : planCore[selectedPlan].monthly
  const usersMonthly = getBillableAdditionalUserSlots(selection) * 9.9
  const smsMonthly = selection.additionalSms * 0.05
  const addons = addonMonthly('en')
  const addonsMonthly =
    (selection.addons.voice ? addons.voice.monthly : 0)
    + (selection.addons.billing ? addons.billing.monthly : 0)
    + (selection.addons.whitelabel ? addons.whitelabel.monthly : 0)

  return {
    planMonthly,
    usersMonthly,
    smsMonthly,
    addonsMonthly,
    totalMonthly: planMonthly + usersMonthly + smsMonthly + addonsMonthly,
  }
}

export type RegisterSummary = {
  rows: Array<{ label: string; value: string }>
  totalPrimary: string
  totalSecondary: string
  annualSavingsYr?: number
}

export function buildSummary(selection: RegisterSelection, locale: RegisterLocale = 'en'): RegisterSummary {
  const monthly = getSelectionMonthlyAmounts(selection)
  const rows: Array<{ label: string; value: string }> = []
  const pm = perMo[locale]
  const planNames = plansForLocale(locale)
  const addons = getAddonCatalog(locale)

  const planLabel = (key: RegisterPlanKey) =>
    locale === 'sl' ? `${planNames[key].name} paket` : `${planNames[key].name} plan`

  if (selection.plan === 'basic' && selection.billing === 'monthly') {
    rows.push({
      label: locale === 'sl' ? 'Osnovni paket' : 'Basic plan',
      value: locale === 'sl' ? '€0 zdaj' : '€0 now',
    })
    rows.push({
      label: locale === 'sl' ? 'Po 14-dnevnem preizkusu' : 'After 14-day trial',
      value: `${formatEuro(planCore.basic.monthly)}${pm}`,
    })
  } else if (selection.billing === 'annual') {
    rows.push({
      label: planLabel(selection.plan),
      value: `${formatEuro(monthly.planMonthly * 0.85)}${pm}`,
    })
  } else {
    rows.push({
      label: planLabel(selection.plan),
      value: `${formatEuro(monthly.planMonthly)}${pm}`,
    })
  }

  if (getBillableAdditionalUserSlots(selection) > 0) {
    const usersValue =
      selection.billing === 'annual'
        ? `${formatEuro(monthly.usersMonthly * 0.85)}${pm}`
        : `${formatEuro(monthly.usersMonthly)}${pm}`
    rows.push({
      label:
        locale === 'sl'
          ? `Uporabniki × ${selection.additionalUsers}`
          : `Users × ${selection.additionalUsers}`,
      value: usersValue,
    })
  }

  if (selection.additionalSms > 0) {
    rows.push({
      label:
        locale === 'sl'
          ? `SMS sporočila × ${selection.additionalSms}`
          : `SMS messages × ${selection.additionalSms}`,
      value: `${formatEuro(monthly.smsMonthly)}${pm}`,
    })
  }

  ;(['voice', 'billing', 'whitelabel'] as const).forEach((addonKey) => {
    if (!selection.addons[addonKey]) return
    const addon = addons[addonKey]
    const displayValue =
      selection.billing === 'annual' ? `${formatEuro(addon.monthly * 0.85)}${pm}` : `${formatEuro(addon.monthly)}${pm}`
    rows.push({ label: addon.name, value: displayValue })
  })

  if (selection.plan === 'basic' && selection.billing === 'monthly') {
    const addOnsOnly = monthly.usersMonthly + monthly.smsMonthly + monthly.addonsMonthly
    const zeroAddons = locale === 'sl' ? '€0 zdaj' : '€0 now'
    const formatted = formatEuro(addOnsOnly)
    return {
      rows,
      totalPrimary:
        addOnsOnly > 0
          ? locale === 'sl'
            ? `samo dodatki ${formatted}${pm}`
            : `${formatted}${pm} add-ons only`
          : zeroAddons,
      totalSecondary: '',
    }
  }

  if (selection.billing === 'annual') {
    const totalAnnual = (monthly.planMonthly + monthly.usersMonthly + monthly.addonsMonthly) * 10.2 + monthly.smsMonthly * 12
    const undiscountedAnnual = (monthly.planMonthly + monthly.usersMonthly + monthly.addonsMonthly) * 12 + monthly.smsMonthly * 12
    const annualSavingsYr = Math.max(0, undiscountedAnnual - totalAnnual)
    return {
      rows,
      totalPrimary: `${formatEuro(totalAnnual / 12)}${pm}`,
      totalSecondary: '',
      annualSavingsYr,
    }
  }

  return {
    rows,
    totalPrimary: `${formatEuro(monthly.totalMonthly)}${pm}`,
    totalSecondary: '',
  }
}

export function getFeatureItems(locale: RegisterLocale): Array<{
  key: RegisterPlanFeatureKey
  index: number
  name: string
  description: string
}> {
  const en: Array<{ key: RegisterPlanFeatureKey; index: number; name: string; description: string }> = [
    { key: 'appointments', index: 1, name: 'Unlimited appointments', description: 'Accept bookings without monthly caps.' },
    { key: 'staff', index: 2, name: 'Team members', description: 'Manage staff schedules and availability.' },
    { key: 'group', index: 3, name: 'Group bookings', description: 'Classes, sessions, workshops, and shared slots.' },
    { key: 'resources', index: 4, name: 'Resource scheduling', description: 'Rooms, chairs, courts, equipment, and assets.' },
    { key: 'payments', index: 5, name: 'Online payments', description: 'Deposits and prepayments during booking.' },
    { key: 'reminders', index: 6, name: 'SMS & email reminders', description: 'Reduce no-shows automatically.' },
    { key: 'ai', index: 7, name: 'AI booking assistant', description: 'Voice booking and intelligent scheduling help.' },
    { key: 'integrations', index: 8, name: 'Integrations', description: 'Google, Outlook, Zoom, payments, automation.' },
    { key: 'reporting', index: 9, name: 'Advanced reporting', description: 'Revenue, utilization, and booking analytics.' },
    { key: 'multilocation', index: 10, name: 'Multi-location support', description: 'Manage multiple branches in one account.' },
  ]
  const sl: typeof en = [
    { key: 'appointments', index: 1, name: 'Neomejeno terminov', description: 'Sprejemajte rezervacije brez mesečne omejitve.' },
    { key: 'staff', index: 2, name: 'Člani ekipe', description: 'Upravljajte urnike in razpoložljivost osebja.' },
    { key: 'group', index: 3, name: 'Skupinske rezervacije', description: 'Tečaji, delavnice in deljene kapacitete.' },
    { key: 'resources', index: 4, name: 'Razporeditev virov', description: 'Sobe, stoli, igrišča, oprema in drugi viri.' },
    { key: 'payments', index: 5, name: 'Spletna plačila', description: 'Akontacije in predplačila med rezervacijo.' },
    { key: 'reminders', index: 6, name: 'SMS in e-poštni opomniki', description: 'Manj neprihodov z avtomatskimi opomniki.' },
    { key: 'ai', index: 7, name: 'AI pomočnik za rezervacije', description: 'Glasovne rezervacije in pametna pomoč pri urniku.' },
    { key: 'integrations', index: 8, name: 'Integracije', description: 'Google, Outlook, Zoom, plačila, avtomatizacija.' },
    { key: 'reporting', index: 9, name: 'Napredno poročanje', description: 'Prihodki, izkoriščenost in analitika rezervacij.' },
    { key: 'multilocation', index: 10, name: 'Več lokacij', description: 'Več podružnic v enem računu.' },
  ]
  return locale === 'sl' ? sl : en
}

function estimateLinesSl(n: number): string {
  if (n === 1) return '1 vrstica ocene'
  if (n === 2) return '2 vrstici ocene'
  if (n === 3 || n === 4) return `${n} vrstice ocene`
  return `${n} vrstic ocene`
}

export type RegisterPlanPageCopy = {
  brandAlt: string
  srOnlyPlanTitle: string
  stepperAria: string
  step1: string
  step2: string
  step3: string
  billingCycleAria: string
  monthly: string
  annual: string
  annualSaveBanner: string
  badgeRecommended: string
  badgePremium: string
  badgeTrial14: string
  miniBasic: [string, string, string]
  miniPro: [string, string, string]
  miniBusiness: [string, string, string]
  planPreviewHeading: string
  customCta: string
  backWebsite: string
  footerShowDetails: string
  footerHideDetails: string
  footerEstTotal: string
  footerPlanPeek: string
  footerUsagePeek: string
  footerItemSingular: string
  footerItemPlural: string
  footerBreakdownTitle: string
  footerContinueScrollAria: string
  addonsBelow: string
  continueAddons: string
  continueAccountBasic: string
  continueWithPlan: string
  continueToAddons: string
  /** Screen reader title for the compact add-ons step (/register/add-ons). */
  srOnlyAddonsTitle: string
  addonsBackToPlan: string
  contactCloseBackdrop: string
  contactTitle: string
  contactIntro: string
  contactName: string
  contactEmail: string
  contactPhone: string
  contactPhoneHint: string
  contactMessage: string
  contactPlaceholder: string
  contactCancel: string
  contactSubmit: string
  contactErrRequired: string
  contactErrEmail: string
  contactSubject: string
  toastOpenMail: string
  annualBilling: string
  monthlyBilling: string
  planFeaturesCount: (n: number) => string
  estimateLinesCount: (n: number) => string
  usageAddonsExtra: (n: number) => string
  planTitleWithBilling: (planName: string, billingLabel: string) => string
  selectFreeTrial: string
  selectBasic: string
  selectPro: string
  selectBusiness: string
  selectedCheck: string
  usageAddonsSectionAria: string
  usageAddonsDivider: string
  usersStrong: string
  usersHint: string
  userSingular: string
  userPlural: string
  firstUserFreeNote: string
  smsStrong: string
  smsHint: string
  smsCount: (n: number) => string
  smsPriceNote: string
  smsZeroPerMo: string
  featureAddonsAria: string
  featureAddonsDivider: string
}

const registerPlanPageCopy: Record<RegisterLocale, RegisterPlanPageCopy> = {
  en: {
    brandAlt: 'Calendra — Simplify Your Booking',
    srOnlyPlanTitle: 'Calendra — plan selection',
    stepperAria: 'Registration progress',
    step1: '1 Plan Selection',
    step2: '2 Account Setup',
    step3: '3 Billing Details',
    billingCycleAria: 'Billing cycle selector',
    monthly: 'Monthly',
    annual: 'Annual',
    annualSaveBanner: 'Save 15% with annual billing',
    badgeRecommended: 'Recommended',
    badgePremium: 'Premium',
    badgeTrial14: '14-day free trial',
    miniBasic: ['Simple booking page', 'Email confirmations', 'Single user setup'],
    miniPro: ['Payments and reminders', 'Up to 5 team members', 'Group and resource scheduling'],
    miniBusiness: ['Unlimited staff and resources', 'Advanced reporting', 'Multi-location control'],
    planPreviewHeading: 'What’s included in this plan',
    customCta: 'Need a custom solution? Contact us',
    backWebsite: '← Back to website',
    footerShowDetails: 'Show estimate details',
    footerHideDetails: 'Hide estimate details',
    footerEstTotal: 'Est. total',
    footerPlanPeek: 'Plan',
    footerUsagePeek: 'Usage & add-ons',
    footerItemSingular: 'item',
    footerItemPlural: 'items',
    footerBreakdownTitle: 'Estimate breakdown',
    footerContinueScrollAria: 'Scroll down to review feature add-ons and usage options on this page',
    addonsBelow: 'Add-ons below',
    continueAddons: 'Continue to add-ons selection',
    continueAccountBasic: 'Continue to account creation',
    continueWithPlan: 'Continue with selected plan',
    continueToAddons: 'To Feature Add-ons',
    srOnlyAddonsTitle: 'Calendra — usage and feature add-ons',
    addonsBackToPlan: '← Back to plan',
    contactCloseBackdrop: 'Close contact form',
    contactTitle: 'Contact us',
    contactIntro: 'Tell us what you need. We will follow up by email.',
    contactName: 'Name',
    contactEmail: 'Email',
    contactPhone: 'Phone',
    contactPhoneHint: 'Optional',
    contactMessage: 'Message',
    contactPlaceholder: 'Describe your needs…',
    contactCancel: 'Cancel',
    contactSubmit: 'Send via email',
    contactErrRequired: 'Please fill in your name, email, and message.',
    contactErrEmail: 'Please enter a valid email address.',
    contactSubject: 'Calendra — Custom solution inquiry',
    toastOpenMail: 'Opening your email client…',
    annualBilling: 'Annual billing',
    monthlyBilling: 'Monthly billing',
    planFeaturesCount: (n) => `${n} plan feature${n === 1 ? '' : 's'}`,
    estimateLinesCount: (n) => `${n} estimate line${n === 1 ? '' : 's'}`,
    usageAddonsExtra: (n) => `${n} usage & add-on${n === 1 ? '' : 's'}`,
    planTitleWithBilling: (planName, billingLabel) => `${planName} plan · ${billingLabel}`,
    selectFreeTrial: 'Select Free Trial',
    selectBasic: 'Select Basic',
    selectPro: 'Select Pro',
    selectBusiness: 'Select Business',
    selectedCheck: '✓ Selected',
    usageAddonsSectionAria: 'Usage-based add-ons',
    usageAddonsDivider: 'Usage-based add-ons',
    usersStrong: 'Users',
    usersHint: 'Add extra team members on top of your selected plan allowance.',
    userSingular: 'user',
    userPlural: 'users',
    firstUserFreeNote: 'First additional user free; then €9.90 / user / month',
    smsStrong: 'SMS messages',
    smsHint: 'Increase reminder volume in blocks of 50 SMS messages.',
    smsCount: (n) => `${n} SMS`,
    smsPriceNote: '€0.05 per SMS (€2.50 per 50)',
    smsZeroPerMo: '€0/mo',
    featureAddonsAria: 'Feature add-ons',
    featureAddonsDivider: 'Feature add-ons',
  },
  sl: {
    brandAlt: 'Calendra — poenostavite rezervacije',
    srOnlyPlanTitle: 'Calendra — izbira paketa',
    stepperAria: 'Napredek registracije',
    step1: '1 Izbor paketa',
    step2: '2 Nastavitev računa',
    step3: '3 Podatki za obračun',
    billingCycleAria: 'Izbor obračunskega obdobja',
    monthly: 'Mesečno',
    annual: 'Letno',
    annualSaveBanner: 'Pri letnem obračunu prihranite 15 %',
    badgeRecommended: 'Priporočeno',
    badgePremium: 'Premium',
    badgeTrial14: '14-dnevni brezplačni preizkus',
    miniBasic: ['Preprosta stran za rezervacije', 'E-poštne potrditve', 'Nastavitev za enega uporabnika'],
    miniPro: ['Plačila in opomniki', 'Do 5 članov ekipe', 'Skupinsko naročanje in razporeditev virov'],
    miniBusiness: ['Neomejeno osebja in virov', 'Napredno poročanje', 'Upravljanje več lokacij'],
    planPreviewHeading: 'Kaj vključuje ta paket',
    customCta: 'Potrebujete prilagoditev? Kontaktirajte nas',
    backWebsite: '← Nazaj na spletno stran',
    footerShowDetails: 'Prikaži podrobnosti ocene',
    footerHideDetails: 'Skrij podrobnosti',
    footerEstTotal: 'Skupaj (ocena)',
    footerPlanPeek: 'Paket',
    footerUsagePeek: 'Poraba in dodatki',
    footerItemSingular: 'postavka',
    footerItemPlural: 'postavke',
    footerBreakdownTitle: 'Razčlenitev ocene',
    footerContinueScrollAria: 'Pomaknite se navzdol za pregled dodatkov in možnosti porabe',
    addonsBelow: 'Dodatki spodaj',
    continueAddons: 'Nadaljuj na izbiro dodatkov',
    continueAccountBasic: 'Nadaljuj na ustvarjanje računa',
    continueWithPlan: 'Nadaljuj z izbranim paketom',
    continueToAddons: 'K dodatkom',
    srOnlyAddonsTitle: 'Calendra — dodatki glede na porabo in funkcije',
    addonsBackToPlan: '← Nazaj na paket',
    contactCloseBackdrop: 'Zapri obrazec za stik',
    contactTitle: 'Kontaktirajte nas',
    contactIntro: 'Napišite, kaj potrebujete. Odgovorili bomo po e-pošti.',
    contactName: 'Ime',
    contactEmail: 'E-pošta',
    contactPhone: 'Telefon',
    contactPhoneHint: 'Neobvezno',
    contactMessage: 'Sporočilo',
    contactPlaceholder: 'Opišite svoje potrebe …',
    contactCancel: 'Prekliči',
    contactSubmit: 'Pošlji po e-pošti',
    contactErrRequired: 'Izpolnite ime, e-pošto in sporočilo.',
    contactErrEmail: 'Vnesite veljaven e-poštni naslov.',
    contactSubject: 'Calendra — povpraševanje po prilagoditvi',
    toastOpenMail: 'Odpiram e-poštni program …',
    annualBilling: 'Letno obračunavanje',
    monthlyBilling: 'Mesečno obračunavanje',
    planFeaturesCount: (n) => `${n} ${n === 1 ? 'funkcija paketa' : 'funkcij paketa'}`,
    estimateLinesCount: (n) => estimateLinesSl(n),
    usageAddonsExtra: (n) => `${n} ${n === 1 ? 'postavka porabe ali dodatka' : 'postavk porabe ali dodatkov'}`,
    planTitleWithBilling: (planName, billingLabel) => `Paket ${planName} · ${billingLabel}`,
    selectFreeTrial: 'Začni brezplačni preizkus',
    selectBasic: 'Izberi Osnovni',
    selectPro: 'Izberi Pro',
    selectBusiness: 'Izberi Poslovni',
    selectedCheck: '✓ Izbrano',
    usageAddonsSectionAria: 'Dodatki glede na porabo',
    usageAddonsDivider: 'Dodatki glede na porabo',
    usersStrong: 'Uporabniki',
    usersHint: 'Dodajte dodatne člane ekipe ob kvoti izbranega paketa.',
    userSingular: 'uporabnik',
    userPlural: 'uporabniki',
    firstUserFreeNote: 'Prvi dodatni uporabnik brezplačno; nato 9,90 € / uporabnik / mesec',
    smsStrong: 'SMS sporočila',
    smsHint: 'Povečajte obseg opomnikov v blokih po 50 SMS sporočilih.',
    smsCount: (n) => `${n} SMS`,
    smsPriceNote: '0,05 € na SMS (2,50 € na 50)',
    smsZeroPerMo: '0 €/mes.',
    featureAddonsAria: 'Dodatne funkcije',
    featureAddonsDivider: 'Dodatne funkcije',
  },
}

export function getRegisterPlanPageCopy(locale: RegisterLocale): RegisterPlanPageCopy {
  return registerPlanPageCopy[locale]
}

export function buildRegisterFooterPill(
  selection: RegisterSelection,
  summary: RegisterSummary,
  locale: RegisterLocale,
): { title: string; sub: string } {
  const c = getRegisterPlanPageCopy(locale)
  const plan = plansForLocale(locale)[selection.plan]
  const featureCount = plan.features.length
  const lineCount = summary.rows.length
  const extraLines = Math.max(0, lineCount - 1)
  const billingLabel = selection.billing === 'annual' ? c.annualBilling : c.monthlyBilling
  const title = c.planTitleWithBilling(plan.name, billingLabel)
  const detailParts = [`${c.planFeaturesCount(featureCount)} · ${c.estimateLinesCount(lineCount)}`]
  if (extraLines > 0) {
    detailParts.push(c.usageAddonsExtra(extraLines))
  }
  return { title, sub: detailParts.join(' · ') }
}

export function annualSaveBadgeText(amount: string, locale: RegisterLocale) {
  return locale === 'sl' ? `Prihranek ${amount}/leto (15 %)` : `You save ${amount}/yr (15%)`
}
