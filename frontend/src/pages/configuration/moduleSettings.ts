import { normalizePackageType } from "../../lib/packageAccess";
import {
  TENANT_CONFIG_TYPE_OPTIONS,
  normalizeTenantConfigType,
  type GuestAppSettingsForm,
  type TenantConfigType,
} from "./guestWebsiteSettings";

export type ModulesDraft = {
  MODULE_CONFIG_TYPE: TenantConfigType;
  SPACES_ENABLED: string;
  TYPES_ENABLED: string;
  COURSES_ENABLED: string;
  BOOKABLE_ENABLED: string;
  NO_SHOW_ENABLED: string;
  ONLINE_SESSION_BOOKING_ENABLED: string;
  WEBSITE_WIDGET_ENABLED: string;
  AI_BOOKING_ENABLED: string;
  PERSONAL_ENABLED: string;
  TODOS_ENABLED: string;
  MULTIPLE_SESSIONS_PER_SPACE_ENABLED: string;
  MULTIPLE_CLIENTS_PER_SESSION_ENABLED: string;
  GROUP_BOOKING_ENABLED: string;
  BILLING_ENABLED: string;
  BILLING_INVOICES_ENABLED: string;
  BILLING_ONLINE_CARD_PAYMENTS_ENABLED: string;
  BILLING_BANK_TRANSFER_ENABLED: string;
  BILLING_PAYPAL_ENABLED: string;
  BILLING_GIFT_CARDS_ENABLED: string;
  BILLING_FISCAL_CASH_REGISTER_ENABLED: string;
  BILLING_ADVANCE_ENABLED: string;
  COMMUNICATION_ENABLED: string;
  NOTIFICATIONS_ENABLED: string;
  NOTIFICATIONS_EMAIL_ALERTS_ENABLED: string;
  NOTIFICATIONS_SMS_ALERTS_ENABLED: string;
  NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED: string;
  NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED: string;
  GOOGLE_CALENDAR_MODULE_ENABLED: string;
  SCANNER_MODULE_ENABLED: string;
  INBOX_ENABLED: string;
  WHATSAPP_MODULE_ENABLED: string;
  VIBER_MODULE_ENABLED: string;
  SECURITY_MODULE_ENABLED: string;
  SECURITY_SESSION_SECURITY_ENABLED: string;
  SECURITY_PASSKEYS_ENABLED: string;
  SECURITY_API_INTEGRATIONS_ENABLED: string;
  guestAppEnabled: boolean;
  guestWalletEnabled: boolean;
  guestOrdersEnabled: boolean;
  guestBuyTabEnabled: boolean;
  guestEntitlementsEnabled: boolean;
  guestInboxEnabled: boolean;
};

export type ModulesStringKey = {
  [K in keyof ModulesDraft]: ModulesDraft[K] extends string
    ? K extends "MODULE_CONFIG_TYPE"
      ? never
      : K
    : never;
}[keyof ModulesDraft];
export type ModulesBooleanKey = {
  [K in keyof ModulesDraft]: ModulesDraft[K] extends boolean ? K : never;
}[keyof ModulesDraft];

export const PLATFORM_MODULE_VISIBILITY_RULES_KEY =
  "PLATFORM_MODULE_VISIBILITY_RULES_JSON";
export type ModuleVisibilityPackage = "BASIC" | "PROFESSIONAL" | "PREMIUM";
export type ModuleVisibilityRuleKey = ModulesStringKey | ModulesBooleanKey;
export type ModuleVisibilityRule = {
  minPackage: ModuleVisibilityPackage;
  configType: TenantConfigType | "";
};
export type ModuleVisibilityRules = Partial<
  Record<ModuleVisibilityRuleKey, ModuleVisibilityRule>
>;

export const MODULE_VISIBILITY_PACKAGES: Array<{
  id: ModuleVisibilityPackage;
  labelEn: string;
  labelSl: string;
}> = [
  { id: "BASIC", labelEn: "Basic", labelSl: "Osnovni" },
  { id: "PROFESSIONAL", labelEn: "Professional", labelSl: "Pro" },
  { id: "PREMIUM", labelEn: "Premium", labelSl: "Premium" },
];

const MODULE_VISIBILITY_KEYS = new Set<string>([
  "SPACES_ENABLED",
  "TYPES_ENABLED",
  "COURSES_ENABLED",
  "BOOKABLE_ENABLED",
  "NO_SHOW_ENABLED",
  "ONLINE_SESSION_BOOKING_ENABLED",
  "WEBSITE_WIDGET_ENABLED",
  "AI_BOOKING_ENABLED",
  "PERSONAL_ENABLED",
  "TODOS_ENABLED",
  "MULTIPLE_SESSIONS_PER_SPACE_ENABLED",
  "MULTIPLE_CLIENTS_PER_SESSION_ENABLED",
  "GROUP_BOOKING_ENABLED",
  "BILLING_ENABLED",
  "BILLING_INVOICES_ENABLED",
  "BILLING_ONLINE_CARD_PAYMENTS_ENABLED",
  "BILLING_BANK_TRANSFER_ENABLED",
  "BILLING_PAYPAL_ENABLED",
  "BILLING_GIFT_CARDS_ENABLED",
  "BILLING_FISCAL_CASH_REGISTER_ENABLED",
  "BILLING_ADVANCE_ENABLED",
  "COMMUNICATION_ENABLED",
  "NOTIFICATIONS_ENABLED",
  "NOTIFICATIONS_EMAIL_ALERTS_ENABLED",
  "NOTIFICATIONS_SMS_ALERTS_ENABLED",
  "NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED",
  "NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED",
  "GOOGLE_CALENDAR_MODULE_ENABLED",
  "SCANNER_MODULE_ENABLED",
  "INBOX_ENABLED",
  "WHATSAPP_MODULE_ENABLED",
  "VIBER_MODULE_ENABLED",
  "SECURITY_MODULE_ENABLED",
  "SECURITY_SESSION_SECURITY_ENABLED",
  "SECURITY_PASSKEYS_ENABLED",
  "SECURITY_API_INTEGRATIONS_ENABLED",
  "guestAppEnabled",
  "guestWalletEnabled",
  "guestOrdersEnabled",
  "guestBuyTabEnabled",
  "guestEntitlementsEnabled",
  "guestInboxEnabled",
]);

export const normalizeModuleVisibilityPackage = (
  raw: unknown,
): ModuleVisibilityPackage => {
  const normalized = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "PREMIUM") return "PREMIUM";
  if (normalized === "PROFESSIONAL" || normalized === "PRO")
    return "PROFESSIONAL";
  return "BASIC";
};

export const normalizeOptionalModuleConfigType = (
  raw: unknown,
): TenantConfigType | "" => {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized || normalized === "all" || normalized === "any") return "";
  return TENANT_CONFIG_TYPE_OPTIONS.some((option) => option.id === normalized)
    ? (normalized as TenantConfigType)
    : "";
};

const defaultModuleVisibilityPackage = (
  key: ModuleVisibilityRuleKey,
): ModuleVisibilityPackage => {
  switch (key) {
    case "BILLING_ENABLED":
    case "BILLING_INVOICES_ENABLED":
    case "BILLING_ONLINE_CARD_PAYMENTS_ENABLED":
    case "BILLING_BANK_TRANSFER_ENABLED":
    case "BILLING_PAYPAL_ENABLED":
    case "BILLING_GIFT_CARDS_ENABLED":
    case "BILLING_FISCAL_CASH_REGISTER_ENABLED":
    case "BILLING_ADVANCE_ENABLED":
    case "SPACES_ENABLED":
    case "MULTIPLE_SESSIONS_PER_SPACE_ENABLED":
    case "GROUP_BOOKING_ENABLED":
    case "MULTIPLE_CLIENTS_PER_SESSION_ENABLED":
      return "PROFESSIONAL";
    case "INBOX_ENABLED":
    case "AI_BOOKING_ENABLED":
      return "PREMIUM";
    default:
      return "BASIC";
  }
};

const defaultModuleVisibilityRule = (
  key: ModuleVisibilityRuleKey,
): ModuleVisibilityRule => ({
  minPackage: defaultModuleVisibilityPackage(key),
  configType: "",
});

export const parseModuleVisibilityRules = (raw: string | undefined) => {
  if (!raw) return {} as ModuleVisibilityRules;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as ModuleVisibilityRules;
    }
    const next: ModuleVisibilityRules = {};
    Object.entries(parsed as Record<string, any>).forEach(([key, value]) => {
      if (!MODULE_VISIBILITY_KEYS.has(key) || !value || typeof value !== "object")
        return;
      next[key as ModuleVisibilityRuleKey] = {
        minPackage: normalizeModuleVisibilityPackage(value.minPackage),
        configType: normalizeOptionalModuleConfigType(value.configType),
      };
    });
    return next;
  } catch {
    return {} as ModuleVisibilityRules;
  }
};

export const serializeModuleVisibilityRules = (rules: ModuleVisibilityRules) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(rules).map(([key, value]) => [
        key,
        {
          minPackage: normalizeModuleVisibilityPackage(value?.minPackage),
          configType: normalizeOptionalModuleConfigType(value?.configType),
        },
      ]),
    ),
  );

export const getModuleVisibilityRule = (
  rules: ModuleVisibilityRules,
  key: ModuleVisibilityRuleKey,
): ModuleVisibilityRule => rules[key] || defaultModuleVisibilityRule(key);

export const moduleVisibilityAllowed = (
  rules: ModuleVisibilityRules,
  key: ModuleVisibilityRuleKey,
  currentPackage: string | null | undefined,
  tenantConfigType: TenantConfigType,
) => {
  const rule = getModuleVisibilityRule(rules, key);
  if (modulePackageRank(currentPackage) < modulePackageRank(rule.minPackage)) {
    return false;
  }
  return !rule.configType || rule.configType === tenantConfigType;
};

const modulesStringSetting = (
  s: Record<string, string>,
  key: string,
  defaultValue: boolean,
) => {
  if (s[key] === "true") return "true";
  if (s[key] === "false") return "false";
  return defaultValue ? "true" : "false";
};

export const buildModulesDraftFromCommitted = (
  s: Record<string, string>,
  g: GuestAppSettingsForm,
): ModulesDraft => ({
  MODULE_CONFIG_TYPE: normalizeTenantConfigType(
    s.MODULE_CONFIG_TYPE || g.tenantType,
  ),
  SPACES_ENABLED: s.SPACES_ENABLED === "true" ? "true" : "false",
  TYPES_ENABLED: modulesStringSetting(s, "TYPES_ENABLED", true),
  COURSES_ENABLED: modulesStringSetting(s, "COURSES_ENABLED", true),
  BOOKABLE_ENABLED: s.BOOKABLE_ENABLED === "true" ? "true" : "false",
  NO_SHOW_ENABLED: modulesStringSetting(s, "NO_SHOW_ENABLED", true),
  ONLINE_SESSION_BOOKING_ENABLED: modulesStringSetting(
    s,
    "ONLINE_SESSION_BOOKING_ENABLED",
    true,
  ),
  WEBSITE_WIDGET_ENABLED: modulesStringSetting(
    s,
    "WEBSITE_WIDGET_ENABLED",
    true,
  ),
  AI_BOOKING_ENABLED: s.AI_BOOKING_ENABLED === "true" ? "true" : "false",
  PERSONAL_ENABLED: s.PERSONAL_ENABLED === "false" ? "false" : "true",
  TODOS_ENABLED: s.TODOS_ENABLED === "false" ? "false" : "true",
  MULTIPLE_SESSIONS_PER_SPACE_ENABLED:
    s.SPACES_ENABLED === "true" &&
    s.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === "true"
      ? "true"
      : "false",
  MULTIPLE_CLIENTS_PER_SESSION_ENABLED:
    s.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === "true" ? "true" : "false",
  GROUP_BOOKING_ENABLED: s.GROUP_BOOKING_ENABLED === "true" ? "true" : "false",
  BILLING_ENABLED: modulesStringSetting(s, "BILLING_ENABLED", true),
  BILLING_INVOICES_ENABLED: modulesStringSetting(
    s,
    "BILLING_INVOICES_ENABLED",
    true,
  ),
  BILLING_ONLINE_CARD_PAYMENTS_ENABLED: modulesStringSetting(
    s,
    "BILLING_ONLINE_CARD_PAYMENTS_ENABLED",
    true,
  ),
  BILLING_BANK_TRANSFER_ENABLED: modulesStringSetting(
    s,
    "BILLING_BANK_TRANSFER_ENABLED",
    true,
  ),
  BILLING_PAYPAL_ENABLED: modulesStringSetting(
    s,
    "BILLING_PAYPAL_ENABLED",
    true,
  ),
  BILLING_GIFT_CARDS_ENABLED: modulesStringSetting(
    s,
    "BILLING_GIFT_CARDS_ENABLED",
    false,
  ),
  BILLING_FISCAL_CASH_REGISTER_ENABLED: modulesStringSetting(
    s,
    "BILLING_FISCAL_CASH_REGISTER_ENABLED",
    false,
  ),
  BILLING_ADVANCE_ENABLED: modulesStringSetting(
    s,
    "BILLING_ADVANCE_ENABLED",
    true,
  ),
  COMMUNICATION_ENABLED: modulesStringSetting(s, "COMMUNICATION_ENABLED", true),
  NOTIFICATIONS_ENABLED: modulesStringSetting(s, "NOTIFICATIONS_ENABLED", true),
  NOTIFICATIONS_EMAIL_ALERTS_ENABLED: modulesStringSetting(
    s,
    "NOTIFICATIONS_EMAIL_ALERTS_ENABLED",
    true,
  ),
  NOTIFICATIONS_SMS_ALERTS_ENABLED: modulesStringSetting(
    s,
    "NOTIFICATIONS_SMS_ALERTS_ENABLED",
    false,
  ),
  NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED: modulesStringSetting(
    s,
    "NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED",
    true,
  ),
  NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED: modulesStringSetting(
    s,
    "NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED",
    true,
  ),
  GOOGLE_CALENDAR_MODULE_ENABLED: modulesStringSetting(
    s,
    "GOOGLE_CALENDAR_MODULE_ENABLED",
    true,
  ),
  SCANNER_MODULE_ENABLED: modulesStringSetting(
    s,
    "SCANNER_MODULE_ENABLED",
    true,
  ),
  INBOX_ENABLED: modulesStringSetting(s, "INBOX_ENABLED", true),
  WHATSAPP_MODULE_ENABLED: modulesStringSetting(
    s,
    "WHATSAPP_MODULE_ENABLED",
    true,
  ),
  VIBER_MODULE_ENABLED: modulesStringSetting(s, "VIBER_MODULE_ENABLED", false),
  SECURITY_MODULE_ENABLED: modulesStringSetting(
    s,
    "SECURITY_MODULE_ENABLED",
    true,
  ),
  SECURITY_SESSION_SECURITY_ENABLED: modulesStringSetting(
    s,
    "SECURITY_SESSION_SECURITY_ENABLED",
    true,
  ),
  SECURITY_PASSKEYS_ENABLED: modulesStringSetting(
    s,
    "SECURITY_PASSKEYS_ENABLED",
    true,
  ),
  SECURITY_API_INTEGRATIONS_ENABLED: modulesStringSetting(
    s,
    "SECURITY_API_INTEGRATIONS_ENABLED",
    false,
  ),
  guestAppEnabled: g.guestAppEnabled,
  guestWalletEnabled: g.walletEnabled,
  guestOrdersEnabled: g.ordersEnabled,
  guestBuyTabEnabled: g.buyTabEnabled,
  guestEntitlementsEnabled: g.entitlementsEnabled,
  guestInboxEnabled: g.inboxEnabled,
});

export type ModulesPresetPackage = "BASIC" | "PROFESSIONAL" | "PREMIUM";
type ModulesPresetValue = "on" | "off" | "coming_soon";

export const modulePackageRank = (raw?: string | null) => {
  switch (normalizePackageType(raw)) {
    case "PREMIUM":
    case "CUSTOM":
      return 3;
    case "PROFESSIONAL":
    case "TRIAL":
      return 2;
    case "BASIC":
    default:
      return 1;
  }
};

const moduleMinPackageAllowed = (
  currentPackage: string | null | undefined,
  minPackage: ModulesPresetPackage,
) => {
  return modulePackageRank(currentPackage) >= modulePackageRank(minPackage);
};

type ModulesPresetRule = {
  key: ModulesStringKey;
  minPackage: ModulesPresetPackage;
  values: Record<TenantConfigType, ModulesPresetValue>;
};

const MODULE_CONFIG_PRESET_RULES: ModulesPresetRule[] = [
  {
    key: "NO_SHOW_ENABLED",
    minPackage: "BASIC",
    values: {
      therapy: "on",
      gym: "on",
      salon: "on",
      spa: "on",
      personal_training: "on",
    },
  },

  {
    key: "BILLING_ADVANCE_ENABLED",
    minPackage: "BASIC",
    values: {
      therapy: "on",
      gym: "on",
      salon: "on",
      spa: "on",
      personal_training: "on",
    },
  },
  {
    key: "ONLINE_SESSION_BOOKING_ENABLED",
    minPackage: "BASIC",
    values: {
      therapy: "on",
      gym: "off",
      salon: "off",
      spa: "off",
      personal_training: "on",
    },
  },
  {
    key: "SPACES_ENABLED",
    minPackage: "PROFESSIONAL",
    values: {
      therapy: "on",
      gym: "on",
      salon: "on",
      spa: "on",
      personal_training: "on",
    },
  },
  {
    key: "MULTIPLE_SESSIONS_PER_SPACE_ENABLED",
    minPackage: "PROFESSIONAL",
    values: {
      therapy: "off",
      gym: "on",
      salon: "off",
      spa: "off",
      personal_training: "on",
    },
  },
  {
    key: "GROUP_BOOKING_ENABLED",
    minPackage: "PROFESSIONAL",
    values: {
      therapy: "off",
      gym: "on",
      salon: "off",
      spa: "off",
      personal_training: "on",
    },
  },
  {
    key: "MULTIPLE_CLIENTS_PER_SESSION_ENABLED",
    minPackage: "PROFESSIONAL",
    values: {
      therapy: "off",
      gym: "on",
      salon: "off",
      spa: "off",
      personal_training: "on",
    },
  },
  {
    key: "AI_BOOKING_ENABLED",
    minPackage: "PREMIUM",
    values: {
      therapy: "coming_soon",
      gym: "coming_soon",
      salon: "coming_soon",
      spa: "coming_soon",
      personal_training: "coming_soon",
    },
  },
];

export const normalizeModulesDraftDependencies = (
  draft: ModulesDraft,
): ModulesDraft => ({
  ...draft,
  AI_BOOKING_ENABLED: "false",
  COURSES_ENABLED:
    draft.TYPES_ENABLED === "true" && draft.COURSES_ENABLED === "true"
      ? "true"
      : "false",
  MULTIPLE_SESSIONS_PER_SPACE_ENABLED:
    draft.SPACES_ENABLED === "true" &&
    draft.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === "true"
      ? "true"
      : "false",
  GROUP_BOOKING_ENABLED:
    draft.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === "true" &&
    draft.GROUP_BOOKING_ENABLED === "true"
      ? "true"
      : "false",
  BILLING_FISCAL_CASH_REGISTER_ENABLED:
    draft.BILLING_ENABLED === "true" &&
    draft.BILLING_FISCAL_CASH_REGISTER_ENABLED === "true"
      ? "true"
      : "false",
});

export const applyModuleConfigPreset = (
  draft: ModulesDraft,
  rawConfigType: TenantConfigType,
  currentPackage: string | null | undefined,
): ModulesDraft => {
  const configType = normalizeTenantConfigType(rawConfigType);
  const next: ModulesDraft = { ...draft, MODULE_CONFIG_TYPE: configType };
  MODULE_CONFIG_PRESET_RULES.forEach((rule) => {
    const presetValue = rule.values[configType] || "off";
    next[rule.key] =
      presetValue === "on" &&
      moduleMinPackageAllowed(currentPackage, rule.minPackage)
        ? "true"
        : "false";
  });
  return normalizeModulesDraftDependencies(next);
};

export const modulesDraftToSettingsPatch = (
  draft: ModulesDraft,
): Record<string, string> => ({
  MODULE_CONFIG_TYPE: normalizeTenantConfigType(draft.MODULE_CONFIG_TYPE),
  SPACES_ENABLED: draft.SPACES_ENABLED,
  TYPES_ENABLED: draft.TYPES_ENABLED,
  COURSES_ENABLED: draft.COURSES_ENABLED,
  BOOKABLE_ENABLED: draft.BOOKABLE_ENABLED,
  NO_SHOW_ENABLED: draft.NO_SHOW_ENABLED,
  ONLINE_SESSION_BOOKING_ENABLED: draft.ONLINE_SESSION_BOOKING_ENABLED,
  WEBSITE_WIDGET_ENABLED: draft.WEBSITE_WIDGET_ENABLED,
  AI_BOOKING_ENABLED: draft.AI_BOOKING_ENABLED,
  PERSONAL_ENABLED: draft.PERSONAL_ENABLED,
  TODOS_ENABLED: draft.TODOS_ENABLED,
  MULTIPLE_SESSIONS_PER_SPACE_ENABLED:
    draft.MULTIPLE_SESSIONS_PER_SPACE_ENABLED,
  MULTIPLE_CLIENTS_PER_SESSION_ENABLED:
    draft.MULTIPLE_CLIENTS_PER_SESSION_ENABLED,
  GROUP_BOOKING_ENABLED: draft.GROUP_BOOKING_ENABLED,
  BILLING_ENABLED: draft.BILLING_ENABLED,
  BILLING_INVOICES_ENABLED: draft.BILLING_INVOICES_ENABLED,
  BILLING_ONLINE_CARD_PAYMENTS_ENABLED:
    draft.BILLING_ONLINE_CARD_PAYMENTS_ENABLED,
  BILLING_BANK_TRANSFER_ENABLED: draft.BILLING_BANK_TRANSFER_ENABLED,
  BILLING_PAYPAL_ENABLED: draft.BILLING_PAYPAL_ENABLED,
  BILLING_GIFT_CARDS_ENABLED: draft.BILLING_GIFT_CARDS_ENABLED,
  BILLING_FISCAL_CASH_REGISTER_ENABLED:
    draft.BILLING_FISCAL_CASH_REGISTER_ENABLED,
  BILLING_ADVANCE_ENABLED: draft.BILLING_ADVANCE_ENABLED,
  COMMUNICATION_ENABLED: draft.COMMUNICATION_ENABLED,
  NOTIFICATIONS_ENABLED: draft.NOTIFICATIONS_ENABLED,
  NOTIFICATIONS_EMAIL_ALERTS_ENABLED: draft.NOTIFICATIONS_EMAIL_ALERTS_ENABLED,
  NOTIFICATIONS_SMS_ALERTS_ENABLED: draft.NOTIFICATIONS_SMS_ALERTS_ENABLED,
  NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED:
    draft.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED,
  NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED:
    draft.NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED,
  GOOGLE_CALENDAR_MODULE_ENABLED: draft.GOOGLE_CALENDAR_MODULE_ENABLED,
  SCANNER_MODULE_ENABLED: draft.SCANNER_MODULE_ENABLED,
  INBOX_ENABLED: draft.INBOX_ENABLED,
  WHATSAPP_MODULE_ENABLED: draft.WHATSAPP_MODULE_ENABLED,
  VIBER_MODULE_ENABLED: draft.VIBER_MODULE_ENABLED,
  SECURITY_MODULE_ENABLED: draft.SECURITY_MODULE_ENABLED,
  SECURITY_SESSION_SECURITY_ENABLED: draft.SECURITY_SESSION_SECURITY_ENABLED,
  SECURITY_PASSKEYS_ENABLED: draft.SECURITY_PASSKEYS_ENABLED,
  SECURITY_API_INTEGRATIONS_ENABLED: draft.SECURITY_API_INTEGRATIONS_ENABLED,
});

