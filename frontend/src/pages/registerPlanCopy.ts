import {
  getBillableAdditionalUserSlots,
  isBasicMonthlyTrial,
  type RegisterBillingCycle,
  type RegisterPlanKey,
  type RegisterSelection,
} from "./registerFlow";

export type RegisterLocale = "en" | "sl";

export type RegisterPlanFeatureKey = string;

export type RegisterPlanAddonKey = string;

export type RegisterCatalogFeatureItem = {
  key: RegisterPlanFeatureKey;
  name: string;
  nameSl?: string;
  description: string;
  descriptionSl?: string;
  minPlan: RegisterPlanKey;
  active?: boolean;
};

export type RegisterUsagePriceCatalog = {
  additionalUserMonthly: number;
  smsPerMessage: number;
};

export type RegisterPlanNameCatalogItem = {
  name?: string;
  nameSl?: string;
};

export type RegisterAddonCatalogItem = {
  key: RegisterPlanAddonKey;
  name: string;
  nameSl?: string;
  monthly: number;
  description: string;
  descriptionSl?: string;
  active?: boolean;
};

export type PlanConfig = {
  name: string;
  monthly: number;
  description: string;
  features: RegisterPlanFeatureKey[];
};

/** Monthly EUR amounts; mutated when `/api/register/catalog` loads. */
const planCore: Record<
  RegisterPlanKey,
  { monthly: number; features: RegisterPlanFeatureKey[] }
> = {
  basic: { monthly: 18.9, features: ["appointments", "staff"] },
  pro: {
    monthly: 34.9,
    features: [
      "appointments",
      "staff",
      "group",
      "resources",
      "payments",
      "reminders",
      "ai",
      "integrations",
    ],
  },
  business: {
    monthly: 59.9,
    features: [
      "appointments",
      "staff",
      "group",
      "resources",
      "payments",
      "reminders",
      "ai",
      "integrations",
      "reporting",
      "multilocation",
    ],
  },
};

const DEFAULT_ADDON_ITEMS: RegisterAddonCatalogItem[] = [
  {
    key: "voice",
    name: "AI voice booking",
    nameSl: "AI glasovne rezervacije",
    monthly: 12,
    description: "Hands-free assistant for faster scheduling.",
    descriptionSl: "Pomočnik brez rok za hitrejše naročanje terminov.",
    active: true,
  },
  {
    key: "billing",
    name: "Billing & invoices",
    nameSl: "Obračun in računi",
    monthly: 8,
    description: "Invoices, payment records, and exports.",
    descriptionSl: "Računi, evidence plačil in izvozi.",
    active: true,
  },
  {
    key: "whitelabel",
    name: "Branded booking experience",
    nameSl: "Blagovna znamka pri rezervacijah",
    monthly: 10,
    description: "Custom colors, domain, and branded notifications.",
    descriptionSl: "Barve, domena in obvestila v vaši blagovni znamki.",
    active: true,
  },
];

const DEFAULT_FEATURE_ITEMS: RegisterCatalogFeatureItem[] = [
  {
    key: "appointments",
    name: "Unlimited appointments",
    nameSl: "Neomejeno terminov",
    description: "Accept bookings without monthly caps.",
    descriptionSl: "Sprejemajte rezervacije brez mesečne omejitve.",
    minPlan: "basic",
    active: true,
  },
  {
    key: "staff",
    name: "Team members",
    nameSl: "Člani ekipe",
    description: "Manage staff schedules and availability.",
    descriptionSl: "Upravljajte urnike in razpoložljivost osebja.",
    minPlan: "basic",
    active: true,
  },
  {
    key: "group",
    name: "Group bookings",
    nameSl: "Skupinske rezervacije",
    description: "Classes, sessions, workshops, and shared slots.",
    descriptionSl: "Tečaji, delavnice in deljene kapacitete.",
    minPlan: "pro",
    active: true,
  },
  {
    key: "resources",
    name: "Resource scheduling",
    nameSl: "Razporeditev virov",
    description: "Rooms, chairs, courts, equipment, and assets.",
    descriptionSl: "Sobe, stoli, igrišča, oprema in drugi viri.",
    minPlan: "pro",
    active: true,
  },
  {
    key: "payments",
    name: "Online payments",
    nameSl: "Spletna plačila",
    description: "Deposits and prepayments during booking.",
    descriptionSl: "Akontacije in predplačila med rezervacijo.",
    minPlan: "pro",
    active: true,
  },
  {
    key: "reminders",
    name: "SMS & email reminders",
    nameSl: "SMS in e-poštni opomniki",
    description: "Reduce no-shows automatically.",
    descriptionSl: "Manj neprihodov z avtomatskimi opomniki.",
    minPlan: "pro",
    active: true,
  },
  {
    key: "ai",
    name: "AI booking assistant",
    nameSl: "AI pomočnik za rezervacije",
    description: "Voice booking and intelligent scheduling help.",
    descriptionSl: "Glasovne rezervacije in pametna pomoč pri urniku.",
    minPlan: "pro",
    active: true,
  },
  {
    key: "integrations",
    name: "Integrations",
    nameSl: "Integracije",
    description: "Google, Outlook, Zoom, payments, automation.",
    descriptionSl: "Google, Outlook, Zoom, plačila, avtomatizacija.",
    minPlan: "pro",
    active: true,
  },
  {
    key: "reporting",
    name: "Advanced reporting",
    nameSl: "Napredno poročanje",
    description: "Revenue, utilization, and booking analytics.",
    descriptionSl: "Prihodki, izkoriščenost in analitika rezervacij.",
    minPlan: "business",
    active: true,
  },
  {
    key: "multilocation",
    name: "Multi-location support",
    nameSl: "Več lokacij",
    description: "Manage multiple branches in one account.",
    descriptionSl: "Več podružnic v enem računu.",
    minPlan: "business",
    active: true,
  },
];

const DEFAULT_USAGE_PRICES: RegisterUsagePriceCatalog = {
  additionalUserMonthly: 9.9,
  smsPerMessage: 0.05,
};

const DEFAULT_PLAN_NAMES: Record<
  RegisterPlanKey,
  { name: string; nameSl: string }
> = {
  basic: { name: "Basic", nameSl: "Osnovni" },
  pro: { name: "Pro", nameSl: "Pro" },
  business: { name: "Business", nameSl: "Poslovni" },
};

const PLAN_ORDER: Record<RegisterPlanKey, number> = {
  basic: 0,
  pro: 1,
  business: 2,
};

let addonCatalogItems: RegisterAddonCatalogItem[] = DEFAULT_ADDON_ITEMS.map(
  (item) => ({ ...item }),
);
let featureCatalogItems: RegisterCatalogFeatureItem[] =
  DEFAULT_FEATURE_ITEMS.map((item) => ({ ...item }));
let usagePrices: RegisterUsagePriceCatalog = { ...DEFAULT_USAGE_PRICES };
let annualDiscountPercent = 15;

function clampCatalogMoney(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100_000;
}

function clampAnnualDiscount(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

function normalizeAddonKey(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeFeatureKey(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizePlanKey(
  raw: unknown,
  fallback: RegisterPlanKey = "pro",
): RegisterPlanKey {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "basic" || value === "pro" || value === "business"
    ? value
    : fallback;
}

function planHasFeature(plan: RegisterPlanKey, minPlan: RegisterPlanKey) {
  return PLAN_ORDER[plan] >= PLAN_ORDER[minPlan];
}

function cleanText(raw: unknown, fallback: string) {
  const value = String(raw ?? "").trim();
  return value || fallback;
}

function defaultAddonForKey(key: string): RegisterAddonCatalogItem | undefined {
  return DEFAULT_ADDON_ITEMS.find((item) => item.key === key);
}

function addonItemFromApi(raw: unknown): RegisterAddonCatalogItem | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const key = normalizeAddonKey(obj.key);
  const monthly = typeof obj.monthly === "number" ? obj.monthly : Number.NaN;
  if (!key || !clampCatalogMoney(monthly)) return null;
  const fallback = defaultAddonForKey(key);
  return {
    key,
    name: cleanText(obj.name, fallback?.name ?? key.replace(/-/g, " ")),
    nameSl: cleanText(
      obj.nameSl,
      fallback?.nameSl ??
        cleanText(obj.name, fallback?.name ?? key.replace(/-/g, " ")),
    ),
    description: cleanText(
      obj.description,
      fallback?.description ?? "Optional platform add-on.",
    ),
    descriptionSl: cleanText(
      obj.descriptionSl,
      fallback?.descriptionSl ??
        cleanText(obj.description, "Dodatek za platformo."),
    ),
    monthly: Math.round(monthly * 100) / 100,
    active: obj.active !== false,
  };
}

function defaultFeatureForKey(
  key: string,
): RegisterCatalogFeatureItem | undefined {
  return DEFAULT_FEATURE_ITEMS.find((item) => item.key === key);
}

function featureItemFromApi(raw: unknown): RegisterCatalogFeatureItem | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const key = normalizeFeatureKey(obj.key);
  if (!key) return null;
  const fallback = defaultFeatureForKey(key);
  const nameFallback = fallback?.name ?? key.replace(/-/g, " ");
  return {
    key,
    name: cleanText(obj.name, nameFallback),
    nameSl: cleanText(
      obj.nameSl,
      fallback?.nameSl ?? cleanText(obj.name, nameFallback),
    ),
    description: cleanText(
      obj.description,
      fallback?.description ?? "Plan feature.",
    ),
    descriptionSl: cleanText(
      obj.descriptionSl,
      fallback?.descriptionSl ?? cleanText(obj.description, "Funkcija paketa."),
    ),
    minPlan: normalizePlanKey(obj.minPlan, fallback?.minPlan ?? "pro"),
    active: obj.active !== false,
  };
}

/** Apply server catalog (public register + platform admin). Unknown plan keys ignored; add-on and feature keys are dynamic. */
export function hydrateRegisterCatalogFromApi(
  data:
    | {
        plans?: Record<string, unknown>;
        planNames?: Partial<
          Record<RegisterPlanKey, RegisterPlanNameCatalogItem>
        >;
        addons?: Record<string, unknown>;
        annualDiscountPercent?: unknown;
        addonItems?: unknown[];
        featureItems?: unknown[];
        additionalUserMonthly?: unknown;
        smsPerMessage?: unknown;
        usagePrices?: {
          additionalUserMonthly?: unknown;
          smsPerMessage?: unknown;
        };
      }
    | null
    | undefined,
) {
  if (!data) return;
  if (data.plans) {
    for (const k of ["basic", "pro", "business"] as const) {
      const v = data.plans[k];
      if (typeof v === "number" && clampCatalogMoney(v)) {
        planCore[k].monthly = Math.round(v * 100) / 100;
      }
    }
  }
  if (data.planNames) {
    const next = { en: { ...planNamesDesc.en }, sl: { ...planNamesDesc.sl } };
    for (const k of ["basic", "pro", "business"] as const) {
      const currentEn = next.en[k];
      const currentSl = next.sl[k];
      const raw = data.planNames[k];
      const nameEn = cleanText(raw?.name, currentEn.name);
      const nameSl = cleanText(raw?.nameSl, currentSl.name);
      next.en[k] = { ...currentEn, name: nameEn };
      next.sl[k] = { ...currentSl, name: nameSl };
    }
    planNamesDesc = next;
  }
  if (
    typeof data.annualDiscountPercent === "number" &&
    clampAnnualDiscount(data.annualDiscountPercent)
  ) {
    annualDiscountPercent = Math.round(data.annualDiscountPercent * 100) / 100;
  }
  const additionalUserMonthly =
    typeof data.additionalUserMonthly === "number"
      ? data.additionalUserMonthly
      : data.usagePrices?.additionalUserMonthly;
  if (
    typeof additionalUserMonthly === "number" &&
    clampCatalogMoney(additionalUserMonthly)
  ) {
    usagePrices.additionalUserMonthly =
      Math.round(additionalUserMonthly * 100) / 100;
  }
  const smsPerMessage =
    typeof data.smsPerMessage === "number"
      ? data.smsPerMessage
      : data.usagePrices?.smsPerMessage;
  if (typeof smsPerMessage === "number" && clampCatalogMoney(smsPerMessage)) {
    usagePrices.smsPerMessage = Math.round(smsPerMessage * 10000) / 10000;
  }
  if (Array.isArray(data.addonItems)) {
    const next = data.addonItems
      .map(addonItemFromApi)
      .filter((item): item is RegisterAddonCatalogItem => Boolean(item));
    addonCatalogItems = next;
  } else if (data.addons) {
    const next = DEFAULT_ADDON_ITEMS.map((item) => ({ ...item }));
    Object.entries(data.addons).forEach(([keyRaw, value]) => {
      const key = normalizeAddonKey(keyRaw);
      if (typeof value !== "number" || !clampCatalogMoney(value) || !key)
        return;
      const existing = next.find((item) => item.key === key);
      if (existing) existing.monthly = Math.round(value * 100) / 100;
      else
        next.push({
          key,
          name: key.replace(/-/g, " "),
          monthly: Math.round(value * 100) / 100,
          description: "Optional platform add-on.",
          active: true,
        });
    });
    addonCatalogItems = next;
  }
  if (Array.isArray(data.featureItems)) {
    const next = data.featureItems
      .map(featureItemFromApi)
      .filter((item): item is RegisterCatalogFeatureItem => Boolean(item));
    featureCatalogItems = next;
  }
}

export function getAnnualDiscountPercent() {
  return annualDiscountPercent;
}

export function getAnnualDiscountFactor() {
  return Math.max(0, Math.min(1, (100 - annualDiscountPercent) / 100));
}

export function getAdditionalUserMonthlyPrice() {
  return usagePrices.additionalUserMonthly;
}

export function getSmsPerMessagePrice() {
  return usagePrices.smsPerMessage;
}

function annualDiscountFactor() {
  return getAnnualDiscountFactor();
}

let planNamesDesc: Record<
  RegisterLocale,
  Record<RegisterPlanKey, { name: string; description: string }>
> = {
  en: {
    basic: {
      name: DEFAULT_PLAN_NAMES.basic.name,
      description:
        "Ideal for solo providers starting with simple one-on-one bookings and a low-friction onboarding path.",
    },
    pro: {
      name: DEFAULT_PLAN_NAMES.pro.name,
      description:
        "Best for growing businesses with reminders, payments, and more advanced booking flows.",
    },
    business: {
      name: DEFAULT_PLAN_NAMES.business.name,
      description:
        "For larger teams, multiple locations, and advanced reporting.",
    },
  },
  sl: {
    basic: {
      name: DEFAULT_PLAN_NAMES.basic.nameSl,
      description:
        "Za samostojne izvajalce, ki začnejo z enostavnimi rezervacijami in hitro uvedbo brez zapletov.",
    },
    pro: {
      name: DEFAULT_PLAN_NAMES.pro.nameSl,
      description:
        "Za rastoča podjetja z opomniki, plačili in naprednejšimi poteki rezervacij.",
    },
    business: {
      name: DEFAULT_PLAN_NAMES.business.nameSl,
      description: "Za večje ekipe, več lokacij in naprednejše poročanje.",
    },
  },
};

function featureKeysForPlan(plan: RegisterPlanKey): RegisterPlanFeatureKey[] {
  return featureCatalogItems
    .filter(
      (item) => item.active !== false && planHasFeature(plan, item.minPlan),
    )
    .map((item) => item.key);
}

export function plansForLocale(
  locale: RegisterLocale,
): Record<RegisterPlanKey, PlanConfig> {
  const names = planNamesDesc[locale];
  return {
    basic: {
      ...planCore.basic,
      features: featureKeysForPlan("basic"),
      ...names.basic,
    },
    pro: { ...planCore.pro, features: featureKeysForPlan("pro"), ...names.pro },
    business: {
      ...planCore.business,
      features: featureKeysForPlan("business"),
      ...names.business,
    },
  };
}

/** English defaults for imports that expect a static `plans` object. */
export const plans = plansForLocale("en");

export function formatEuro(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return rounded % 1 === 0
    ? `€${rounded.toFixed(0)}`
    : `€${rounded.toFixed(2)}`;
}

function annualPrice(monthly: number) {
  return Number((monthly * 12 * annualDiscountFactor()).toFixed(2));
}

const perMo: Record<RegisterLocale, string> = { en: "/mo", sl: "/mes." };

const cardStrings: Record<
  RegisterLocale,
  {
    planCardAnnualNote: (yr: string, discountPercent: string) => string;
    planCardAnnualNoteShort: (yr: string) => string;
    planCardNotePro: string;
    planCardNoteBusiness: string;
    trialHighlight: string;
    trialUnlessCancelled: (priceWithSuffix: string) => string;
  }
> = {
  en: {
    planCardAnnualNote: (yr: string, discountPercent: string) =>
      `Billed annually at ${yr}/yr (${discountPercent}% off).`,
    planCardAnnualNoteShort: (yr: string) => `Billed annually at ${yr}/yr.`,
    planCardNotePro: "For growing businesses.",
    planCardNoteBusiness:
      "For larger teams that want the best user experience.",
    trialHighlight: "Free for 14 days",
    trialUnlessCancelled: (priceWithSuffix: string) =>
      `, then ${priceWithSuffix} unless cancelled. For individuals getting started.`,
  },
  sl: {
    planCardAnnualNote: (yr: string, discountPercent: string) =>
      `Letno obračunavanje: ${yr}/leto (popust ${discountPercent} %).`,
    planCardAnnualNoteShort: (yr: string) => `Letno obračunavanje: ${yr}/leto.`,
    planCardNotePro: "Za rastoča podjetja.",
    planCardNoteBusiness:
      "Za večje ekipe, ki želijo najboljšo uporabniško izkušnjo.",
    trialHighlight: "Prvih 14 dni brezplačno",
    trialUnlessCancelled: (priceWithSuffix: string) =>
      `, nato ${priceWithSuffix}, razen če prekličete. Za posameznike, ki začenjajo.`,
  },
};

function cardLoc(locale: RegisterLocale) {
  return cardStrings[locale];
}

export function getPlanDisplay(
  planKey: RegisterPlanKey,
  billing: RegisterBillingCycle,
  locale: RegisterLocale,
) {
  const plan = planCore[planKey];
  const pm = perMo[locale];
  const basicMonthly = formatEuro(planCore.basic.monthly);

  if (planKey === "basic" && billing === "monthly") {
    const secondary =
      locale === "sl"
        ? `14-dnevni brezplačni preizkus, nato ${basicMonthly}${pm}`
        : `14-day free trial, then ${basicMonthly}${pm}`;
    return {
      primary: `${basicMonthly}${pm}`,
      secondary,
    };
  }

  if (billing === "annual") {
    const annual = annualPrice(plan.monthly);
    const yr = formatEuro(annual);
    const secondary =
      locale === "sl"
        ? `Letno obračunavanje: ${yr}/leto`
        : `Billed annually at ${yr}/yr`;
    return {
      primary: `${formatEuro(annual / 12)}${pm}`,
      secondary,
    };
  }

  return {
    primary: `${formatEuro(plan.monthly)}${pm}`,
    secondary: locale === "sl" ? "Mesečno obračunavanje" : "Billed monthly",
  };
}

export function getPlanCardPriceNote(
  planKey: RegisterPlanKey,
  billing: RegisterBillingCycle,
  locale: RegisterLocale,
) {
  const pm = perMo[locale];
  const loc = cardLoc(locale);
  const priceWithSuffix = `${formatEuro(planCore.basic.monthly)}${pm}`;

  if (planKey === "basic") {
    if (billing === "monthly") {
      return {
        badgeVisible: true,
        price: formatEuro(planCore.basic.monthly),
        per: pm,
        oldPriceVisible: false,
        oldPrice: "",
        note: "",
        noteIsTrial: true,
        trialHighlight: loc.trialHighlight,
        trialUnlessCancelled: loc.trialUnlessCancelled(priceWithSuffix),
      };
    }

    const annual = annualPrice(planCore.basic.monthly);
    return {
      badgeVisible: false,
      price: formatEuro(annual / 12),
      per: pm,
      oldPriceVisible: false,
      oldPrice: "",
      note: loc.planCardAnnualNote(
        formatEuro(annual),
        formatDiscountPercent(annualDiscountPercent),
      ),
      noteIsTrial: false,
      trialHighlight: "",
      trialUnlessCancelled: "",
    };
  }

  if (billing === "annual") {
    const annual = annualPrice(planCore[planKey].monthly);
    return {
      badgeVisible: false,
      price: formatEuro(annual / 12),
      per: pm,
      oldPriceVisible: false,
      oldPrice: "",
      note: loc.planCardAnnualNoteShort(formatEuro(annual)),
      noteIsTrial: false,
      trialHighlight: "",
      trialUnlessCancelled: "",
    };
  }

  return {
    badgeVisible: false,
    price: formatEuro(planCore[planKey].monthly),
    per: pm,
    oldPriceVisible: false,
    oldPrice: "",
    note: planKey === "pro" ? loc.planCardNotePro : loc.planCardNoteBusiness,
    noteIsTrial: false,
    trialHighlight: "",
    trialUnlessCancelled: "",
  };
}

function addonMonthly(
  locale: RegisterLocale,
): Record<
  RegisterPlanAddonKey,
  { name: string; monthly: number; description: string }
> {
  const out: Record<
    string,
    { name: string; monthly: number; description: string }
  > = {};
  addonCatalogItems
    .filter((item) => item.active !== false)
    .forEach((item) => {
      out[item.key] = {
        name: locale === "sl" ? item.nameSl || item.name : item.name,
        monthly: item.monthly,
        description:
          locale === "sl"
            ? item.descriptionSl || item.description
            : item.description,
      };
    });
  return out;
}

export function getAddonCatalog(locale: RegisterLocale) {
  return addonMonthly(locale);
}

export function getActiveAddonKeys() {
  return addonCatalogItems
    .filter((item) => item.active !== false)
    .map((item) => item.key);
}

export function countSelectedAddons(selection: RegisterSelection) {
  if (isBasicMonthlyTrial(selection)) return 0;
  const active = getActiveAddonKeys();
  return active.reduce(
    (count, key) => count + (selection.addons?.[key] ? 1 : 0),
    0,
  );
}

export function selectionRequiresBillingDetails(selection: RegisterSelection) {
  const monthly = getSelectionMonthlyAmounts(selection);
  const estimatedMonthlyPayable =
    selection.billing === "annual"
      ? (monthly.planMonthly + monthly.usersMonthly + monthly.addonsMonthly) *
          annualDiscountFactor() +
        monthly.smsMonthly
      : monthly.totalMonthly;

  return estimatedMonthlyPayable > 0.005;
}

export function getSelectionMonthlyAmounts(selection: RegisterSelection) {
  const selectedPlan = selection.plan;
  const trialLocked = isBasicMonthlyTrial(selection);
  const planMonthly = trialLocked ? 0 : planCore[selectedPlan].monthly;
  const usersMonthly =
    getBillableAdditionalUserSlots(selection) *
    usagePrices.additionalUserMonthly;
  const smsMonthly = trialLocked
    ? 0
    : selection.additionalSms * usagePrices.smsPerMessage;
  const addons = addonMonthly("en");
  const addonsMonthly = trialLocked
    ? 0
    : Object.entries(selection.addons || {}).reduce(
        (sum, [addonKey, selected]) => {
          if (!selected) return sum;
          return sum + (addons[addonKey]?.monthly ?? 0);
        },
        0,
      );

  return {
    planMonthly,
    usersMonthly,
    smsMonthly,
    addonsMonthly,
    totalMonthly: planMonthly + usersMonthly + smsMonthly + addonsMonthly,
  };
}

export type RegisterSummary = {
  rows: Array<{ label: string; value: string }>;
  totalPrimary: string;
  totalSecondary: string;
  annualSavingsYr?: number;
};

export function buildSummary(
  selection: RegisterSelection,
  locale: RegisterLocale = "en",
): RegisterSummary {
  const monthly = getSelectionMonthlyAmounts(selection);
  const rows: Array<{ label: string; value: string }> = [];
  const pm = perMo[locale];
  const planNames = plansForLocale(locale);
  const addons = getAddonCatalog(locale);
  const trialLocked = isBasicMonthlyTrial(selection);

  const planLabel = (key: RegisterPlanKey) =>
    locale === "sl"
      ? `${planNames[key].name} paket`
      : `${planNames[key].name} plan`;

  if (trialLocked) {
    rows.push({
      label: planLabel("basic"),
      value: locale === "sl" ? "€0 zdaj" : "€0 now",
    });
    rows.push({
      label: locale === "sl" ? "Po 14-dnevnem preizkusu" : "After 14-day trial",
      value: `${formatEuro(planCore.basic.monthly)}${pm}`,
    });
  } else if (selection.billing === "annual") {
    rows.push({
      label: planLabel(selection.plan),
      value: `${formatEuro(monthly.planMonthly * annualDiscountFactor())}${pm}`,
    });
  } else {
    rows.push({
      label: planLabel(selection.plan),
      value: `${formatEuro(monthly.planMonthly)}${pm}`,
    });
  }

  if (getBillableAdditionalUserSlots(selection) > 0) {
    const usersValue =
      selection.billing === "annual"
        ? `${formatEuro(monthly.usersMonthly * annualDiscountFactor())}${pm}`
        : `${formatEuro(monthly.usersMonthly)}${pm}`;
    rows.push({
      label:
        locale === "sl"
          ? `Dodatni uporabniki × ${getBillableAdditionalUserSlots(selection)}`
          : `Additional users × ${getBillableAdditionalUserSlots(selection)}`,
      value: usersValue,
    });
  }

  if (!trialLocked && selection.additionalSms > 0) {
    rows.push({
      label:
        locale === "sl"
          ? `SMS sporočila × ${selection.additionalSms}`
          : `SMS messages × ${selection.additionalSms}`,
      value: `${formatEuro(monthly.smsMonthly)}${pm}`,
    });
  }

  if (!trialLocked) {
    Object.entries(selection.addons || {}).forEach(([addonKey, selected]) => {
      if (!selected) return;
      const addon = addons[addonKey];
      if (!addon) return;
      const displayValue =
        selection.billing === "annual"
          ? `${formatEuro(addon.monthly * annualDiscountFactor())}${pm}`
          : `${formatEuro(addon.monthly)}${pm}`;
      rows.push({ label: addon.name, value: displayValue });
    });
  }

  if (trialLocked) {
    const addOnsOnly =
      monthly.usersMonthly + monthly.smsMonthly + monthly.addonsMonthly;
    const zeroAddons = locale === "sl" ? "€0 zdaj" : "€0 now";
    const formatted = formatEuro(addOnsOnly);
    return {
      rows,
      totalPrimary:
        addOnsOnly > 0
          ? locale === "sl"
            ? `samo dodatki ${formatted}${pm}`
            : `${formatted}${pm} add-ons only`
          : zeroAddons,
      totalSecondary: "",
    };
  }

  if (selection.billing === "annual") {
    const totalAnnual =
      (monthly.planMonthly + monthly.usersMonthly + monthly.addonsMonthly) *
        12 *
        annualDiscountFactor() +
      monthly.smsMonthly * 12;
    const undiscountedAnnual =
      (monthly.planMonthly + monthly.usersMonthly + monthly.addonsMonthly) *
        12 +
      monthly.smsMonthly * 12;
    const annualSavingsYr = Math.max(0, undiscountedAnnual - totalAnnual);
    return {
      rows,
      totalPrimary: `${formatEuro(totalAnnual / 12)}${pm}`,
      totalSecondary: "",
      annualSavingsYr,
    };
  }

  return {
    rows,
    totalPrimary: `${formatEuro(monthly.totalMonthly)}${pm}`,
    totalSecondary: "",
  };
}

export function getFeatureItems(locale: RegisterLocale): Array<{
  key: RegisterPlanFeatureKey;
  index: number;
  name: string;
  description: string;
  minPlan: RegisterPlanKey;
}> {
  return featureCatalogItems
    .filter((item) => item.active !== false)
    .map((item, index) => ({
      key: item.key,
      index: index + 1,
      name: locale === "sl" ? item.nameSl || item.name : item.name,
      description:
        locale === "sl"
          ? item.descriptionSl || item.description
          : item.description,
      minPlan: item.minPlan,
    }));
}

function estimateLinesSl(n: number): string {
  if (n === 1) return "1 vrstica ocene";
  if (n === 2) return "2 vrstici ocene";
  if (n === 3 || n === 4) return `${n} vrstice ocene`;
  return `${n} vrstic ocene`;
}

export type RegisterPlanPageCopy = {
  brandAlt: string;
  srOnlyPlanTitle: string;
  stepperAria: string;
  step1: string;
  step2: string;
  step3: string;
  billingCycleAria: string;
  monthly: string;
  annual: string;
  annualSaveBanner: string;
  badgeRecommended: string;
  badgePremium: string;
  badgeTrial14: string;
  miniBasic: [string, string];
  miniPro: [string, string];
  miniBusiness: [string, string];
  planPreviewHeading: string;
  customCta: string;
  customCtaDescription: string;
  customCtaButton: string;
  backWebsite: string;
  footerShowDetails: string;
  footerHideDetails: string;
  footerEstTotal: string;
  footerPlanPeek: string;
  footerUsagePeek: string;
  footerItemSingular: string;
  footerItemPlural: string;
  footerBreakdownTitle: string;
  footerContinueScrollAria: string;
  addonsBelow: string;
  continueAddons: string;
  continueAccountBasic: string;
  continueWithPlan: string;
  continueToAddons: string;
  /** Screen reader title for the compact add-ons step (/register/add-ons). */
  srOnlyAddonsTitle: string;
  addonsBackToPlan: string;
  contactCloseBackdrop: string;
  contactTitle: string;
  contactIntro: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactPhoneHint: string;
  contactMessage: string;
  contactPlaceholder: string;
  contactCancel: string;
  contactSubmit: string;
  /** Legacy mailto subject used by contact forms on later registration steps. */
  contactSubject: string;
  /** Legacy success notice used by contact forms on later registration steps. */
  toastOpenMail: string;
  contactSubmitting: string;
  contactErrRequired: string;
  contactErrEmail: string;
  contactSendError: string;
  toastContactSent: string;
  annualBilling: string;
  monthlyBilling: string;
  planFeaturesCount: (n: number) => string;
  estimateLinesCount: (n: number) => string;
  usageAddonsExtra: (n: number) => string;
  planTitleWithBilling: (planName: string, billingLabel: string) => string;
  selectFreeTrial: string;
  selectBasic: string;
  selectPro: string;
  selectBusiness: string;
  selectedCheck: string;
  usageAddonsSectionAria: string;
  usageAddonsDivider: string;
  usersStrong: string;
  usersHint: string;
  userSingular: string;
  userPlural: string;
  firstUserFreeNote: string;
  smsStrong: string;
  smsHint: string;
  smsCount: (n: number) => string;
  smsPriceNote: string;
  smsZeroPerMo: string;
  featureAddonsAria: string;
  featureAddonsDivider: string;
};

const registerPlanPageCopy: Record<RegisterLocale, RegisterPlanPageCopy> = {
  en: {
    brandAlt: "Calendra — Simplify Your Booking",
    srOnlyPlanTitle: "Calendra — plan selection",
    stepperAria: "Registration progress",
    step1: "1 Plan Selection",
    step2: "2 Account Setup",
    step3: "3 Billing Details",
    billingCycleAria: "Billing cycle selector",
    monthly: "Monthly",
    annual: "Annual",
    annualSaveBanner: "Save with annual billing",
    badgeRecommended: "Recommended",
    badgePremium: "Premium",
    badgeTrial14: "14-day free trial",
    miniBasic: [
      "Email support",
      "30-minute introductory call",
    ],
    miniPro: [
      "Phone support",
      "60-minute personal onboarding",
    ],
    miniBusiness: [
      "24/7 support",
      "Comprehensive personal onboarding and setup assistance",
    ],
    planPreviewHeading: "What’s included in this plan",
    customCta: "Need a custom solution? Contact us",
    customCtaDescription:
      "We can prepare a tailored package or adapt the setup to your business needs.",
    customCtaButton: "Contact us",
    backWebsite: "← Back to website",
    footerShowDetails: "Show estimate details",
    footerHideDetails: "Hide estimate details",
    footerEstTotal: "Est. total",
    footerPlanPeek: "Plan",
    footerUsagePeek: "Usage & add-ons",
    footerItemSingular: "item",
    footerItemPlural: "items",
    footerBreakdownTitle: "Estimate breakdown",
    footerContinueScrollAria:
      "Scroll down to review feature add-ons and usage options on this page",
    addonsBelow: "Add-ons below",
    continueAddons: "Continue to add-ons selection",
    continueAccountBasic: "Continue to account creation",
    continueWithPlan: "Continue with selected plan",
    continueToAddons: "To Feature Add-ons",
    srOnlyAddonsTitle: "Calendra — usage and feature add-ons",
    addonsBackToPlan: "← Back to plan",
    contactCloseBackdrop: "Close contact form",
    contactTitle: "Contact us",
    contactIntro: "Tell us what you need. We will follow up by email.",
    contactName: "Name",
    contactEmail: "Email",
    contactPhone: "Phone",
    contactPhoneHint: "Optional",
    contactMessage: "Message",
    contactPlaceholder: "Describe your needs…",
    contactCancel: "Cancel",
    contactSubmit: "Send message",
    contactSubject: "Calendra — Custom solution inquiry",
    toastOpenMail: "Opening your email client…",
    contactSubmitting: "Sending…",
    contactErrRequired: "Please fill in your name, email, and message.",
    contactErrEmail: "Please enter a valid email address.",
    contactSendError: "We could not send your message. Please try again.",
    toastContactSent: "Your message was sent. A confirmation email is on its way.",
    annualBilling: "Annual billing",
    monthlyBilling: "Monthly billing",
    planFeaturesCount: (n) => `${n} plan feature${n === 1 ? "" : "s"}`,
    estimateLinesCount: (n) => `${n} estimate line${n === 1 ? "" : "s"}`,
    usageAddonsExtra: (n) => `${n} usage & add-on${n === 1 ? "" : "s"}`,
    planTitleWithBilling: (planName, billingLabel) =>
      `${planName} plan · ${billingLabel}`,
    selectFreeTrial: "Select Free Trial",
    selectBasic: "Select Basic",
    selectPro: "Select Pro",
    selectBusiness: "Select Business",
    selectedCheck: "✓ Selected",
    usageAddonsSectionAria: "Usage-based add-ons",
    usageAddonsDivider: "Usage-based add-ons",
    usersStrong: "Users",
    usersHint:
      "Choose the total number of team users. The first user is included.",
    userSingular: "user",
    userPlural: "users",
    firstUserFreeNote: "First user included; extra users €9.90 / user / month",
    smsStrong: "SMS messages",
    smsHint: "Increase reminder volume in blocks of 50 SMS messages.",
    smsCount: (n) => `${n} SMS`,
    smsPriceNote: "€0.05 per SMS (€2.50 per 50)",
    smsZeroPerMo: "€0/mo",
    featureAddonsAria: "Feature add-ons",
    featureAddonsDivider: "Feature add-ons",
  },
  sl: {
    brandAlt: "Calendra — poenostavite rezervacije",
    srOnlyPlanTitle: "Calendra — izbira paketa",
    stepperAria: "Napredek registracije",
    step1: "1 Izbor paketa",
    step2: "2 Nastavitev računa",
    step3: "3 Podatki za obračun",
    billingCycleAria: "Izbor obračunskega obdobja",
    monthly: "Mesečno",
    annual: "Letno",
    annualSaveBanner: "Pri letnem obračunu prihranite",
    badgeRecommended: "Priporočeno",
    badgePremium: "Premium",
    badgeTrial14: "14-dnevni brezplačni preizkus",
    miniBasic: [
      "E-poštna podpora",
      "30-minutni predstavitveni klic",
    ],
    miniPro: [
      "Telefonska podpora",
      "60-minutno osebno uvajanje",
    ],
    miniBusiness: [
      "24/7 podpora",
      "Celovito osebno uvajanje in pomoč pri nastavitvi",
    ],
    planPreviewHeading: "Kaj vključuje ta paket",
    customCta: "Potrebujete prilagoditev? Kontaktirajte nas",
    customCtaDescription:
      "Pripravimo vam paket po meri ali prilagodimo nastavitve vašim potrebam.",
    customCtaButton: "Kontaktirajte nas",
    backWebsite: "← Nazaj na spletno stran",
    footerShowDetails: "Prikaži podrobnosti ocene",
    footerHideDetails: "Skrij podrobnosti",
    footerEstTotal: "Skupaj (ocena)",
    footerPlanPeek: "Paket",
    footerUsagePeek: "Poraba in dodatki",
    footerItemSingular: "postavka",
    footerItemPlural: "postavke",
    footerBreakdownTitle: "Razčlenitev ocene",
    footerContinueScrollAria:
      "Pomaknite se navzdol za pregled dodatkov in možnosti porabe",
    addonsBelow: "Dodatki spodaj",
    continueAddons: "Nadaljuj na izbiro dodatkov",
    continueAccountBasic: "Nadaljuj na ustvarjanje računa",
    continueWithPlan: "Nadaljuj z izbranim paketom",
    continueToAddons: "K dodatkom",
    srOnlyAddonsTitle: "Calendra — dodatki glede na porabo in funkcije",
    addonsBackToPlan: "← Nazaj na paket",
    contactCloseBackdrop: "Zapri obrazec za stik",
    contactTitle: "Kontaktirajte nas",
    contactIntro: "Napišite, kaj potrebujete. Odgovorili bomo po e-pošti.",
    contactName: "Ime",
    contactEmail: "E-pošta",
    contactPhone: "Telefon",
    contactPhoneHint: "Neobvezno",
    contactMessage: "Sporočilo",
    contactPlaceholder: "Opišite svoje potrebe …",
    contactCancel: "Prekliči",
    contactSubmit: "Pošlji sporočilo",
    contactSubject: "Calendra — povpraševanje po prilagoditvi",
    toastOpenMail: "Odpiram e-poštni program …",
    contactSubmitting: "Pošiljam …",
    contactErrRequired: "Izpolnite ime, e-pošto in sporočilo.",
    contactErrEmail: "Vnesite veljaven e-poštni naslov.",
    contactSendError: "Sporočila ni bilo mogoče poslati. Poskusite znova.",
    toastContactSent: "Sporočilo je bilo poslano. Na e-pošto boste prejeli potrdilo.",
    annualBilling: "Letno obračunavanje",
    monthlyBilling: "Mesečno obračunavanje",
    planFeaturesCount: (n) =>
      `${n} ${n === 1 ? "funkcija paketa" : "funkcij paketa"}`,
    estimateLinesCount: (n) => estimateLinesSl(n),
    usageAddonsExtra: (n) =>
      `${n} ${n === 1 ? "postavka porabe ali dodatka" : "postavk porabe ali dodatkov"}`,
    planTitleWithBilling: (planName, billingLabel) =>
      `Paket ${planName} · ${billingLabel}`,
    selectFreeTrial: "Začni brezplačni preizkus",
    selectBasic: "Izberi Osnovni",
    selectPro: "Izberi Pro",
    selectBusiness: "Izberi Poslovni",
    selectedCheck: "✓ Izbrano",
    usageAddonsSectionAria: "Dodatki glede na porabo",
    usageAddonsDivider: "Dodatki glede na porabo",
    usersStrong: "Uporabniki",
    usersHint:
      "Izberite skupno število uporabnikov ekipe. Prvi uporabnik je vključen.",
    userSingular: "uporabnik",
    userPlural: "uporabniki",
    firstUserFreeNote:
      "Prvi uporabnik je vključen; dodatni uporabniki 9,90 € / uporabnik / mesec",
    smsStrong: "SMS sporočila",
    smsHint: "Povečajte obseg opomnikov v blokih po 50 SMS sporočilih.",
    smsCount: (n) => `${n} SMS`,
    smsPriceNote: "0,05 € na SMS (2,50 € na 50)",
    smsZeroPerMo: "0 €/mes.",
    featureAddonsAria: "Dodatne funkcije",
    featureAddonsDivider: "Dodatne funkcije",
  },
};

export function getRegisterPlanPageCopy(
  locale: RegisterLocale,
): RegisterPlanPageCopy {
  return registerPlanPageCopy[locale];
}

export function buildRegisterFooterPill(
  selection: RegisterSelection,
  summary: RegisterSummary,
  locale: RegisterLocale,
): { title: string; sub: string } {
  const c = getRegisterPlanPageCopy(locale);
  const plan = plansForLocale(locale)[selection.plan];
  const featureCount = plan.features.length;
  const lineCount = summary.rows.length;
  const extraLines = Math.max(0, lineCount - 1);
  const billingLabel =
    selection.billing === "annual" ? c.annualBilling : c.monthlyBilling;
  const title = c.planTitleWithBilling(plan.name, billingLabel);
  const detailParts = [
    `${c.planFeaturesCount(featureCount)} · ${c.estimateLinesCount(lineCount)}`,
  ];
  if (extraLines > 0) {
    detailParts.push(c.usageAddonsExtra(extraLines));
  }
  return { title, sub: detailParts.join(" · ") };
}

function formatDiscountPercent(value: number) {
  return (Math.round(value * 100) / 100) % 1 === 0
    ? String(Math.round(value))
    : (Math.round(value * 100) / 100).toFixed(2);
}

export function annualSaveBannerText(locale: RegisterLocale) {
  const pct = formatDiscountPercent(annualDiscountPercent);
  return locale === "sl"
    ? `Pri letnem obračunu prihranite ${pct} %`
    : `Save ${pct}% with annual billing`;
}

export function annualSaveBadgeText(amount: string, locale: RegisterLocale) {
  const pct = formatDiscountPercent(annualDiscountPercent);
  return locale === "sl"
    ? `Prihranek ${amount}/leto (${pct} %)`
    : `You save ${amount}/yr (${pct}%)`;
}
