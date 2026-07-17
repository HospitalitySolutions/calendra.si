export type AccountSubscriptionInterval = "MONTHLY" | "YEARLY";
export type AccountPlanPackageKey = "BASIC" | "PROFESSIONAL" | "PREMIUM" | "CUSTOM";
export type AccountRegisterCatalogAddonItem = {
  key?: string | null;
  name?: string | null;
  nameSl?: string | null;
  description?: string | null;
  descriptionSl?: string | null;
  monthly?: number | null;
  active?: boolean | null;
};

export type AccountRegisterCatalogFeatureItem = {
  key?: string | null;
  name?: string | null;
  nameSl?: string | null;
  description?: string | null;
  descriptionSl?: string | null;
  minPlan?: string | null;
  active?: boolean | null;
};

export type AccountRegisterCatalogPlanName = {
  name?: string | null;
  nameSl?: string | null;
};

export type AccountRegisterPlanKey = "basic" | "pro" | "business";

export type AccountPlanDetailsFeature = {
  key: string;
  index: number;
  name: string;
  description: string;
  minPlan: AccountRegisterPlanKey;
};

export type AccountRegisterCatalog = {
  plans?: Record<string, number>;
  planNames?: Partial<
    Record<AccountRegisterPlanKey, AccountRegisterCatalogPlanName>
  > | null;
  addons?: Record<string, number>;
  addonItems?: AccountRegisterCatalogAddonItem[] | null;
  featureItems?: AccountRegisterCatalogFeatureItem[] | null;
  annualDiscountPercent?: number | null;
  additionalUserMonthly?: number | null;
  additionalUserMonthlyAfterFive?: number | null;
  smsPerMessage?: number | null;
  usagePrices?: {
    additionalUserMonthly?: number | null;
    additionalUserMonthlyAfterFive?: number | null;
    smsPerMessage?: number | null;
  } | null;
};
export type AccountUserResponse = { id: number; active?: boolean };

export const DEFAULT_ACCOUNT_REGISTER_CATALOG: Required<
  Pick<AccountRegisterCatalog, "plans">
> &
  AccountRegisterCatalog = {
  plans: { basic: 18.9, pro: 34.9, business: 59.9 },
  planNames: {
    basic: { name: "Basic", nameSl: "Osnovni" },
    pro: { name: "Pro", nameSl: "Pro" },
    business: { name: "Business", nameSl: "Poslovni" },
  },
  annualDiscountPercent: (2 * 100) / 12,
  additionalUserMonthly: 9.9,
  additionalUserMonthlyAfterFive: 6.9,
  smsPerMessage: 0.05,
  usagePrices: {
    additionalUserMonthly: 9.9,
    additionalUserMonthlyAfterFive: 6.9,
    smsPerMessage: 0.05,
  },
  addonItems: [
    {
      key: "voice",
      name: "AI voice booking",
      nameSl: "AI glasovne rezervacije",
      description: "Hands-free assistant for faster scheduling.",
      descriptionSl: "Pomočnik brez rok za hitrejše naročanje terminov.",
      monthly: 12,
      active: true,
    },
    {
      key: "billing",
      name: "Billing & invoices",
      nameSl: "Obračun in računi",
      description: "Invoices, payment records, and exports.",
      descriptionSl: "Računi, evidence plačil in izvozi.",
      monthly: 8,
      active: true,
    },
    {
      key: "whitelabel",
      name: "Branded booking experience",
      nameSl: "Blagovna znamka pri rezervacijah",
      description: "Custom colors, domain, and branded notifications.",
      descriptionSl: "Barve, domena in obvestila v vaši blagovni znamki.",
      monthly: 10,
      active: true,
    },
  ],
  featureItems: [
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
  ],
};

export const roundAccountMoney = (value: number) => Math.round(value * 100) / 100;
export const positiveAccountNumber = (value: unknown, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
export const accountCatalogText = (value: unknown, fallback: string) => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

export const accountPlanLabel = (
  catalog: AccountRegisterCatalog,
  key: AccountRegisterPlanKey,
  locale: "en" | "sl",
) => {
  const defaults = DEFAULT_ACCOUNT_REGISTER_CATALOG.planNames?.[key] || {};
  const raw = catalog.planNames?.[key];
  const fallbackEn = accountCatalogText(
    defaults.name,
    key === "business" ? "Business" : key === "pro" ? "Pro" : "Basic",
  );
  const fallbackSl = accountCatalogText(defaults.nameSl, fallbackEn);
  return locale === "sl"
    ? accountCatalogText(raw?.nameSl, fallbackSl)
    : accountCatalogText(raw?.name, fallbackEn);
};

export const positiveAccountInteger = (value: unknown, fallback: number) => {
  const n =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
};
export const normalizeAccountAddonKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const normalizeAccountRegisterPlanKey = (
  value: unknown,
  fallback: AccountRegisterPlanKey = "pro",
): AccountRegisterPlanKey => {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (key === "basic" || key === "pro" || key === "business") return key;
  return fallback;
};
export const accountPackageToRegisterPlanKey = (
  key: AccountPlanPackageKey,
): AccountRegisterPlanKey => {
  if (key === "BASIC") return "basic";
  if (key === "PREMIUM" || key === "CUSTOM") return "business";
  return "pro";
};
export const accountRegisterPlanRank = (key: AccountRegisterPlanKey) =>
  key === "business" ? 3 : key === "pro" ? 2 : 1;
export const parseAccountAddonKeyCsv = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [] as string[];
  const out: string[] = [];
  raw.split(",").forEach((part) => {
    const key = normalizeAccountAddonKey(part);
    if (key && !out.includes(key)) out.push(key);
  });
  return out;
};
export const accountAddonKeysToCsv = (keys: string[]) =>
  keys
    .map(normalizeAccountAddonKey)
    .filter(Boolean)
    .filter((key, index, all) => all.indexOf(key) === index)
    .join(",");
export const normalizeAccountRegisterCatalog = (
  catalog: AccountRegisterCatalog | null | undefined,
): AccountRegisterCatalog => ({
  ...DEFAULT_ACCOUNT_REGISTER_CATALOG,
  ...(catalog || {}),
  plans: {
    ...DEFAULT_ACCOUNT_REGISTER_CATALOG.plans,
    ...(catalog?.plans || {}),
  },
  planNames: {
    ...(DEFAULT_ACCOUNT_REGISTER_CATALOG.planNames || {}),
    ...(catalog?.planNames || {}),
  },
  usagePrices: {
    ...(DEFAULT_ACCOUNT_REGISTER_CATALOG.usagePrices || {}),
    ...(catalog?.usagePrices || {}),
  },
  addonItems: Array.isArray(catalog?.addonItems)
    ? catalog?.addonItems
    : DEFAULT_ACCOUNT_REGISTER_CATALOG.addonItems,
  featureItems: Array.isArray(catalog?.featureItems)
    ? catalog?.featureItems
    : DEFAULT_ACCOUNT_REGISTER_CATALOG.featureItems,
  addons: {
    ...(DEFAULT_ACCOUNT_REGISTER_CATALOG.addons || {}),
    ...(catalog?.addons || {}),
  },
});
export const accountUsagePercent = (current: number, max: number) =>
  max > 0 ? Math.min(100, (current / max) * 100) : 0;

