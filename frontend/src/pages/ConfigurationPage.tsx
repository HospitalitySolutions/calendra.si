import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent, ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { getStoredUser } from "../auth";
import type { PaymentMethod, PaymentType } from "../lib/types";
import { normalizePaymentMethod } from "../lib/types";
import {
  Card,
  EmptyState,
  Field,
  PageHeader,
  SectionTitle,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { currency, formatDate } from "../lib/format";
import {
  ConfigurationViberSection,
  ConfigurationWhatsAppSection,
} from "./ConfigurationInboxMessagingSections";
import { ConfigurationInvoiceDeliverySection } from "./ConfigurationInvoiceDeliverySection";
import { ConfigurationDeliveryLogsSection } from "./ConfigurationDeliveryLogsSection";
import { FolioLayoutEditor } from "./FolioLayoutEditor";
import { SecurityPage } from "./SecurityPage";
import { GoogleCalendarIntegrationSection } from "./GoogleCalendarIntegrationSection";
import googleCalendarLogo from "../assets/google-calendar-logo.png";
import { GuestConfigSaveIcon as GuestSaveIcon } from "../components/GuestConfigSaveIcon";
import { ModernTimePicker } from "../components/ModernTimePicker";
import { useLocale } from "../locale";
import {
  getDefaultAllowedRoute,
  normalizePackageType,
} from "../lib/packageAccess";

type Tab =
  | "company"
  | "booking"
  | "billing"
  | "guestApp"
  | "website"
  | "notifications"
  | "deliveryLogs"
  | "integrations"
  | "whatsapp"
  | "viber"
  | "modules";
type BookingSubtab = "general" | "spaces";
type BillingSubtab =
  | "settings"
  | "paymentMethods"
  | "stripe"
  | "paypal"
  | "fiscal"
  | "invoiceDelivery"
  | "folioLayout";
type IntegrationSubtab = "status" | "googleCalendar";
type PersonalTaskPreset = { id: string; name: string; color: string };

type CompanyProfileForm = {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  vatId: string;
  email: string;
  telephone: string;
  iban: string;
  bic: string;
  bankQrPurposeCode: string;
  bankQrPurposeText: string;
  isDefault: boolean;
};

const createCompanyProfileId = () =>
  `company-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sanitizeCompanyProfile = (
  profile: Partial<CompanyProfileForm>,
  fallbackId?: string,
): CompanyProfileForm => ({
  id:
    typeof profile.id === "string" && profile.id
      ? profile.id
      : fallbackId || createCompanyProfileId(),
  name: typeof profile.name === "string" ? profile.name : "",
  address: typeof profile.address === "string" ? profile.address : "",
  postalCode: typeof profile.postalCode === "string" ? profile.postalCode : "",
  city: typeof profile.city === "string" ? profile.city : "",
  vatId: typeof profile.vatId === "string" ? profile.vatId : "",
  email: typeof profile.email === "string" ? profile.email : "",
  telephone: typeof profile.telephone === "string" ? profile.telephone : "",
  iban: typeof profile.iban === "string" ? profile.iban : "",
  bic: typeof profile.bic === "string" ? profile.bic : "",
  bankQrPurposeCode:
    typeof profile.bankQrPurposeCode === "string"
      ? profile.bankQrPurposeCode
      : "OTHR",
  bankQrPurposeText:
    typeof profile.bankQrPurposeText === "string"
      ? profile.bankQrPurposeText
      : "PLACILO FOLIA",
  isDefault: Boolean(profile.isDefault),
});

const companyProfileFromSettings = (
  settings: Record<string, string>,
): CompanyProfileForm =>
  sanitizeCompanyProfile({
    id: "default-company-profile",
    name: settings.COMPANY_NAME || "",
    address: settings.COMPANY_ADDRESS || "",
    postalCode: settings.COMPANY_POSTAL_CODE || "",
    city: settings.COMPANY_CITY || "",
    vatId: settings.COMPANY_VAT_ID || "",
    email: settings.COMPANY_EMAIL || "",
    telephone: settings.COMPANY_TELEPHONE || "",
    iban: settings.COMPANY_IBAN || "",
    bic: settings.COMPANY_BIC || "",
    bankQrPurposeCode: settings.BANK_QR_PURPOSE_CODE || "OTHR",
    bankQrPurposeText: settings.BANK_QR_PURPOSE_TEXT || "PLACILO FOLIA",
    isDefault: true,
  });

const companyProfileToSettings = (
  settings: Record<string, string>,
  profile: CompanyProfileForm,
  profiles: CompanyProfileForm[],
): Record<string, string> => {
  const mainProfile = profiles.find((entry) => entry.isDefault) || profile;
  return {
    ...settings,
    COMPANY_NAME: mainProfile.name,
    COMPANY_ADDRESS: mainProfile.address,
    COMPANY_POSTAL_CODE: mainProfile.postalCode,
    COMPANY_CITY: mainProfile.city,
    COMPANY_VAT_ID: mainProfile.vatId,
    COMPANY_EMAIL: mainProfile.email,
    COMPANY_TELEPHONE: mainProfile.telephone,
    COMPANY_IBAN: mainProfile.iban,
    COMPANY_BIC: mainProfile.bic,
    BANK_QR_PURPOSE_CODE: mainProfile.bankQrPurposeCode || "OTHR",
    BANK_QR_PURPOSE_TEXT: mainProfile.bankQrPurposeText || "PLACILO FOLIA",
    COMPANY_PROFILES: JSON.stringify(profiles),
    COMPANY_SELECTED_PROFILE_ID: profile.id,
  };
};

const loadCompanyProfilesFromSettings = (
  settings: Record<string, string>,
): CompanyProfileForm[] => {
  if (settings.COMPANY_PROFILES) {
    try {
      const parsed = JSON.parse(settings.COMPANY_PROFILES);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const profiles = parsed.map((profile, index) =>
          sanitizeCompanyProfile(
            profile,
            index === 0 ? "default-company-profile" : undefined,
          ),
        );
        return profiles.some((profile) => profile.isDefault)
          ? profiles
          : profiles.map((profile, index) => ({
              ...profile,
              isDefault: index === 0,
            }));
      }
    } catch {
      // Fall back to legacy single-profile settings below.
    }
  }
  return [companyProfileFromSettings(settings)];
};

type ConfigNavIcon =
  | "company"
  | "booking"
  | "billing"
  | "guestApp"
  | "website"
  | "notifications"
  | "deliveryLogs"
  | "integrations"
  | "googleCalendar"
  | "whatsapp"
  | "viber"
  | "modules"
  | "security";

type ConfigNavItem = { id: Tab; icon: ConfigNavIcon };
type InboxGlobalCapabilities = {
  whatsappEnabled: boolean;
  viberEnabled: boolean;
};
type PaymentGlobalCapabilities = {
  stripeEnabled: boolean;
  paypalEnabled: boolean;
};
type AccountReceivedInvoice = {
  id: number;
  billNumber: string;
  orderId?: string | null;
  billType: string;
  issueDate: string;
  totalGross: number;
  pendingPaymentGross?: number | null;
  paymentStatus: string;
  paidAt?: string | null;
  issuerName?: string | null;
  issuerTenantCode?: string | null;
  recipientCompanyName?: string | null;
  itemDescriptions?: string[];
  pdfAvailable?: boolean;
  stripeHostedInvoiceUrl?: string | null;
};

type IntegrationGoogleCalendarConnection = {
  id: number;
  googleAccountEmail?: string | null;
  calendarSummary?: string | null;
  calendarId?: string | null;
  status?: string | null;
  lastError?: string | null;
  lastFullSyncAt?: string | null;
  lastIncrementalSyncAt?: string | null;
};

type AccountSubscriptionInterval = "MONTHLY" | "YEARLY";
type AccountPlanPackageKey = "BASIC" | "PROFESSIONAL" | "PREMIUM";
type AccountRegisterCatalogAddonItem = {
  key?: string | null;
  name?: string | null;
  nameSl?: string | null;
  description?: string | null;
  descriptionSl?: string | null;
  monthly?: number | null;
  active?: boolean | null;
};

type AccountRegisterCatalogFeatureItem = {
  key?: string | null;
  name?: string | null;
  nameSl?: string | null;
  description?: string | null;
  descriptionSl?: string | null;
  minPlan?: string | null;
  active?: boolean | null;
};

type AccountRegisterCatalogPlanName = {
  name?: string | null;
  nameSl?: string | null;
};

type AccountRegisterPlanKey = "basic" | "pro" | "business";

type AccountPlanDetailsFeature = {
  key: string;
  index: number;
  name: string;
  description: string;
  minPlan: AccountRegisterPlanKey;
};

type AccountRegisterCatalog = {
  plans?: Record<string, number>;
  planNames?: Partial<
    Record<AccountRegisterPlanKey, AccountRegisterCatalogPlanName>
  > | null;
  addons?: Record<string, number>;
  addonItems?: AccountRegisterCatalogAddonItem[] | null;
  featureItems?: AccountRegisterCatalogFeatureItem[] | null;
  annualDiscountPercent?: number | null;
  additionalUserMonthly?: number | null;
  smsPerMessage?: number | null;
  usagePrices?: {
    additionalUserMonthly?: number | null;
    smsPerMessage?: number | null;
  } | null;
};
type AccountUserResponse = { id: number; active?: boolean };

const DEFAULT_ACCOUNT_REGISTER_CATALOG: Required<
  Pick<AccountRegisterCatalog, "plans">
> &
  AccountRegisterCatalog = {
  plans: { basic: 18.9, pro: 34.9, business: 59.9 },
  planNames: {
    basic: { name: "Basic", nameSl: "Osnovni" },
    pro: { name: "Pro", nameSl: "Pro" },
    business: { name: "Business", nameSl: "Poslovni" },
  },
  annualDiscountPercent: 15,
  additionalUserMonthly: 9.9,
  smsPerMessage: 0.05,
  usagePrices: { additionalUserMonthly: 9.9, smsPerMessage: 0.05 },
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

const roundAccountMoney = (value: number) => Math.round(value * 100) / 100;
const positiveAccountNumber = (value: unknown, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const accountCatalogText = (value: unknown, fallback: string) => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const accountPlanLabel = (
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

const positiveAccountInteger = (value: unknown, fallback: number) => {
  const n =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
};
const normalizeAccountAddonKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const normalizeAccountRegisterPlanKey = (
  value: unknown,
  fallback: AccountRegisterPlanKey = "pro",
): AccountRegisterPlanKey => {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (key === "basic" || key === "pro" || key === "business") return key;
  return fallback;
};
const accountPackageToRegisterPlanKey = (
  key: AccountPlanPackageKey,
): AccountRegisterPlanKey => {
  if (key === "BASIC") return "basic";
  if (key === "PREMIUM") return "business";
  return "pro";
};
const accountRegisterPlanRank = (key: AccountRegisterPlanKey) =>
  key === "business" ? 3 : key === "pro" ? 2 : 1;
const parseAccountAddonKeyCsv = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [] as string[];
  const out: string[] = [];
  raw.split(",").forEach((part) => {
    const key = normalizeAccountAddonKey(part);
    if (key && !out.includes(key)) out.push(key);
  });
  return out;
};
const accountAddonKeysToCsv = (keys: string[]) =>
  keys
    .map(normalizeAccountAddonKey)
    .filter(Boolean)
    .filter((key, index, all) => all.indexOf(key) === index)
    .join(",");
const normalizeAccountRegisterCatalog = (
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
const accountUsagePercent = (current: number, max: number) =>
  max > 0 ? Math.min(100, (current / max) * 100) : 0;

const CONFIG_TAB_IDS: readonly Tab[] = [
  "company",
  "booking",
  "billing",
  "guestApp",
  "website",
  "notifications",
  "deliveryLogs",
  "integrations",
  "whatsapp",
  "viber",
  "modules",
];

const CONFIG_TAB_LABEL_KEY: Record<Tab, string> = {
  company: "tabCompany",
  booking: "configBookingSpacesTab",
  billing: "tabBilling",
  guestApp: "tabGuestApp",
  website: "tabWebsite",
  notifications: "tabNotifications",
  deliveryLogs: "tabDeliveryLogs",
  integrations: "tabIntegrations",
  whatsapp: "tabWhatsapp",
  viber: "tabViber",
  modules: "tabModules",
};

const isConfigTab = (value: string | null): value is Tab =>
  Boolean(value && (CONFIG_TAB_IDS as readonly string[]).includes(value));

function ConfigSettingsIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.5a2 2 0 0 1-1 1.72l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.5a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IntegrationStatusCardIcon() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 8V5a2 2 0 0 1 2-2h1" />
      <path d="M16 8V5a2 2 0 0 0-2-2h-1" />
      <path d="M9 12H6a2 2 0 0 1-2-2V9" />
      <path d="M15 12h3a2 2 0 0 0 2-2V9" />
      <path d="M8 16v3a2 2 0 0 0 2 2h1" />
      <path d="M16 16v3a2 2 0 0 1-2 2h-1" />
      <path d="M7.5 7.5 16.5 16.5" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="2.2" />
    </svg>
  );
}

function IntegrationGoogleCalendarIcon() {
  return <img src={googleCalendarLogo} alt="" aria-hidden />;
}

function ConfigTabIcon({ kind }: { kind: ConfigNavIcon }) {
  if (kind === "company") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
      </svg>
    );
  }
  if (kind === "booking") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  if (kind === "billing") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M7 15h2M12 15h5" />
      </svg>
    );
  }
  if (kind === "guestApp") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
        <path d="M9 5h6" />
      </svg>
    );
  }
  if (kind === "website") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a13.5 13.5 0 0 1 0 18" />
        <path d="M12 3a13.5 13.5 0 0 0 0 18" />
      </svg>
    );
  }
  if (kind === "notifications") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    );
  }
  if (kind === "deliveryLogs") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 4h16v16H4z" />
        <path d="M8 8h8" />
        <path d="M8 12h5" />
        <path d="M8 16h6" />
        <path d="M17 15l1.5 1.5 2.5-3" />
      </svg>
    );
  }
  if (kind === "integrations") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <path d="M10 6.5h4" />
        <path d="M6.5 10v4" />
        <path d="M10 17.5h4.5a3.5 3.5 0 0 0 0-7H14" />
      </svg>
    );
  }
  if (kind === "googleCalendar") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
        <path d="M9 15l2 2 4-5" />
      </svg>
    );
  }
  if (kind === "whatsapp") {
    /* Vector mark (Simple Icons, CC0) on white — avoids raster “transparency” checkerboard artifacts. */
    return (
      <span className="config-nav-tab-brand-wrap" aria-hidden>
        <svg
          width={15}
          height={15}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <path
            fill="#25D366"
            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
          />
        </svg>
      </span>
    );
  }
  if (kind === "viber") {
    return (
      <span className="config-nav-tab-brand-wrap" aria-hidden>
        <svg
          width={15}
          height={15}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <path
            fill="#7360F2"
            d="M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.326 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.017zm.058 1.693c.545-.004.88.017.88.017 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.604 4.878-4.174 5.184-4.832 5.395-.28.09-2.882.737-6.153.524 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.165-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.03zm.38 2.602c-.167 0-.303.135-.304.302 0 .167.133.303.3.305 1.624.01 2.946.537 4.028 1.592 1.073 1.046 1.62 2.468 1.633 4.334.002.167.14.3.307.3.166-.002.3-.138.3-.304-.014-1.984-.618-3.596-1.816-4.764-1.19-1.16-2.692-1.753-4.447-1.765zm-3.96.695c-.19-.032-.4.005-.616.117l-.01.002c-.43.247-.816.562-1.146.932-.002.004-.006.004-.008.008-.267.323-.42.638-.46.948-.008.046-.01.093-.007.14 0 .136.022.27.065.4l.013.01c.135.48.473 1.276 1.205 2.604.42.768.903 1.5 1.446 2.186.27.344.56.673.87.984l.132.132c.31.308.64.6.984.87.686.543 1.418 1.027 2.186 1.447 1.328.733 2.126 1.07 2.604 1.206l.01.014c.13.042.265.064.402.063.046.002.092 0 .138-.008.31-.036.627-.19.948-.46.004 0 .003-.002.008-.005.37-.33.683-.72.93-1.148l.003-.01c.225-.432.15-.842-.18-1.12-.004 0-.698-.58-1.037-.83-.36-.255-.73-.492-1.113-.71-.51-.285-1.032-.106-1.248.174l-.447.564c-.23.283-.657.246-.657.246-3.12-.796-3.955-3.955-3.955-3.955s-.037-.426.248-.656l.563-.448c.277-.215.456-.737.17-1.248-.217-.383-.454-.756-.71-1.115-.25-.34-.826-1.033-.83-1.035-.137-.165-.31-.265-.502-.297zm4.49.88c-.158.002-.29.124-.3.282-.01.167.115.312.282.324 1.16.085 2.017.466 2.645 1.15.63.688.93 1.524.906 2.57-.002.168.13.306.3.31.166.003.305-.13.31-.297.025-1.175-.334-2.193-1.067-2.994-.74-.81-1.777-1.253-3.05-1.346h-.024zm.463 1.63c-.16.002-.29.127-.3.287-.008.167.12.31.288.32.523.028.875.175 1.113.422.24.245.388.62.416 1.164.01.167.15.295.318.287.167-.008.295-.15.287-.317-.03-.644-.215-1.178-.58-1.557-.367-.378-.893-.574-1.52-.607h-.018z"
          />
        </svg>
      </span>
    );
  }
  if (kind === "modules") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (kind === "security") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
        <path d="M9.5 12.5l1.5 1.5 3.5-4" />
      </svg>
    );
  }
  const _exhaustive: never = kind;
  void _exhaustive;
  return null;
}

type GuestFieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
};

function GuestField({ label, hint, children, className }: GuestFieldProps) {
  return (
    <label className={className ? `gapp-field ${className}` : "gapp-field"}>
      <span className="gapp-label">{label}</span>
      {children}
      {hint ? <span className="gapp-hint">{hint}</span> : null}
    </label>
  );
}

function GuestSegmentedToggle({
  value,
  onChange,
  className,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={className ? `gapp-segmented ${className}` : "gapp-segmented"}
    >
      <button
        type="button"
        className={!value ? "active" : ""}
        onClick={() => onChange(false)}
      >
        OFF
      </button>
      <button
        type="button"
        className={value ? "active" : ""}
        onClick={() => onChange(true)}
      >
        ON
      </button>
    </div>
  );
}

function GuestSwitch({
  checked,
  onChange,
  label = "ON",
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  const className = `gapp-switch${checked ? " active" : ""}${disabled ? " is-disabled" : ""}`;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      aria-pressed={checked}
      disabled={disabled}
    >
      <span className="gapp-switch-knob" />
      <span className="gapp-switch-label">{checked ? label : "OFF"}</span>
    </button>
  );
}

type ModulesDesignTone =
  | "blue"
  | "green"
  | "purple"
  | "amber"
  | "rose"
  | "cyan";
type ModulesDesignIconKind =
  | "booking"
  | "billing"
  | "services"
  | "guestApp"
  | "communication"
  | "security"
  | "spaces"
  | "availability"
  | "noShow"
  | "spark"
  | "personal"
  | "todo"
  | "group"
  | "invoice"
  | "wallet"
  | "calendar"
  | "website"
  | "message"
  | "shield"
  | "key"
  | "link"
  | "sliders"
  | "scanner";

type ModulesDesignLine = {
  id: string;
  icon: ModulesDesignIconKind;
  title: string;
  subtitle?: string;
  checked?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onChange?: (checked: boolean) => void;
  valueControl?: ReactNode;
  visibilityControl?: ReactNode;
  children?: ModulesDesignLine[];
};

type ModulesDesignGroup = {
  id: string;
  title: string;
  subtitle: string;
  icon: ModulesDesignIconKind;
  tone: ModulesDesignTone;
  checked: boolean;
  hideSwitch?: boolean;
  onChange: (checked: boolean) => void;
  rows: ModulesDesignLine[];
};

const DEFAULT_EXPANDED_MODULE_ROWS = [
  "booking-spaces",
  "booking-availability",
  "booking-group-booking",
  "billing-billing",
  "guest-app-main",
  "communication-notifications",
  "guest-app-wallet",
];

function ModulesDesignIcon({ kind }: { kind: ModulesDesignIconKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === "booking" ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="3" {...common} />
          <path d="M8 3v4M16 3v4M4 10h16" {...common} />
        </>
      ) : kind === "billing" ? (
        <>
          <rect x="4" y="6" width="16" height="12" rx="3" {...common} />
          <path d="M7 10h10M8 14h4M16 14h1" {...common} />
        </>
      ) : kind === "services" ? (
        <>
          <path
            d="M20 13.2 13.2 20a2.4 2.4 0 0 1-3.4 0L4 14.2V4h10.2L20 9.8a2.4 2.4 0 0 1 0 3.4Z"
            {...common}
          />
          <path d="M8.2 8.2h.01" {...common} />
          <path d="M10.5 13.5 14 10" {...common} />
        </>
      ) : kind === "guestApp" ? (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2.5" {...common} />
          <path d="M11 18h2M10 6h4" {...common} />
        </>
      ) : kind === "communication" ? (
        <>
          <path
            d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"
            {...common}
          />
          <path d="M9.5 20a3 3 0 0 0 5 0" {...common} />
        </>
      ) : kind === "security" ? (
        <>
          <path
            d="M12 3 5.5 5.5v5.7c0 4.2 2.7 7.6 6.5 9.1 3.8-1.5 6.5-4.9 6.5-9.1V5.5L12 3Z"
            {...common}
          />
          <path d="m9.5 12 1.8 1.8 3.6-4" {...common} />
        </>
      ) : kind === "spaces" ? (
        <>
          <path d="M5 10.5 12 5l7 5.5" {...common} />
          <path d="M7 10v9h10v-9" {...common} />
          <path d="M10 19v-5h4v5" {...common} />
        </>
      ) : kind === "availability" || kind === "calendar" ? (
        <>
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M12 8v4l3 2" {...common} />
        </>
      ) : kind === "noShow" ? (
        <>
          <circle cx="12" cy="12" r="8.2" {...common} />
          <path d="M12 7.8v5.2M12 16.4h.01" {...common} />
        </>
      ) : kind === "spark" ? (
        <>
          <path
            d="M12 3.5 13.8 9l5.2 1.8-5.2 1.8L12 18l-1.8-5.4L5 10.8 10.2 9 12 3.5Z"
            {...common}
          />
        </>
      ) : kind === "personal" ? (
        <>
          <path
            d="M8.5 10.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0Z"
            {...common}
          />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" {...common} />
        </>
      ) : kind === "todo" || kind === "invoice" ? (
        <>
          <rect x="6" y="4" width="12" height="16" rx="2" {...common} />
          <path d="M9 9h6M9 13h6M9 17h3" {...common} />
        </>
      ) : kind === "group" ? (
        <>
          <path
            d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            {...common}
          />
          <path d="M3.5 20a5 5 0 0 1 9 0M11.5 20a5 5 0 0 1 9 0" {...common} />
        </>
      ) : kind === "wallet" ? (
        <>
          <rect x="4" y="7" width="16" height="11" rx="3" {...common} />
          <path d="M17 11.5h3v3h-3a1.5 1.5 0 0 1 0-3ZM7 7V5.5h9" {...common} />
        </>
      ) : kind === "website" ? (
        <>
          <rect x="4" y="5" width="16" height="12" rx="2.5" {...common} />
          <path d="M8 21h8M12 17v4M4 9h16M8 13h2M12 13h4" {...common} />
        </>
      ) : kind === "message" ? (
        <>
          <path d="M5 6h14v10H9l-4 4V6Z" {...common} />
          <path d="M8 10h8M8 13h5" {...common} />
        </>
      ) : kind === "shield" ? (
        <>
          <path
            d="M12 3 5.5 5.5v5.7c0 4.2 2.7 7.6 6.5 9.1 3.8-1.5 6.5-4.9 6.5-9.1V5.5L12 3Z"
            {...common}
          />
        </>
      ) : kind === "key" ? (
        <>
          <circle cx="8" cy="13" r="3" {...common} />
          <path d="m11 13 8-8M16 8l2 2M14 10l2 2" {...common} />
        </>
      ) : kind === "sliders" ? (
        <>
          <path
            d="M5 7h14M5 17h14M9 7a2 2 0 1 0 0 .01M15 17a2 2 0 1 0 0 .01M14 12H5M19 12h-4M15 12a2 2 0 1 0 0 .01"
            {...common}
          />
        </>
      ) : kind === "scanner" ? (
        <>
          <path d="M4 7V5a1 1 0 0 1 1-1h2" {...common} />
          <path d="M17 4h2a1 1 0 0 1 1 1v2" {...common} />
          <path d="M20 17v2a1 1 0 0 1-1 1h-2" {...common} />
          <path d="M7 20H5a1 1 0 0 1-1-1v-2" {...common} />
          <path d="M7 8h10M7 12h10M7 16h6" {...common} />
        </>
      ) : (
        <>
          <path d="M9.5 14.5 14.5 9.5" {...common} />
          <path d="M8 9.5 6.8 10.7a4 4 0 0 0 5.7 5.7L14 15" {...common} />
          <path d="m10 9 1.5-1.5a4 4 0 0 1 5.7 5.7L16 14.5" {...common} />
        </>
      )}
    </svg>
  );
}

function ModulesDesignSettingLine({
  line,
  expandedRows,
  onToggleExpanded,
  nested = false,
}: {
  line: ModulesDesignLine;
  expandedRows: string[];
  onToggleExpanded: (id: string) => void;
  nested?: boolean;
}) {
  if (line.hidden) return null;
  const visibleChildren = (line.children || []).filter((child) => !child.hidden);
  const hasChildren = visibleChildren.length > 0;
  const expanded = hasChildren && expandedRows.includes(line.id);
  const disabled = Boolean(line.disabled);
  const hasValueControl = Boolean(line.valueControl);
  const checked = Boolean(line.checked);
  const lineClassName = [
    "modules-design-setting-line",
    nested ? "is-subparameter" : "",
    hasChildren ? "has-children" : "",
    hasValueControl ? "is-value-row" : "",
    disabled ? "is-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const copy = (
    <>
      <strong>{line.title}</strong>
      {line.subtitle ? <span>{line.subtitle}</span> : null}
    </>
  );
  return (
    <div className={nested ? "modules-design-subtree" : "modules-design-tree"}>
      <div className={lineClassName}>
        <span className="modules-design-setting-icon">
          <ModulesDesignIcon kind={line.icon} />
        </span>
        {hasValueControl ? (
          <span className="modules-design-setting-copy modules-design-setting-copy--static">
            {copy}
          </span>
        ) : (
          <button
            type="button"
            className="modules-design-setting-copy"
            onClick={() => {
              if (!disabled)
                hasChildren
                  ? onToggleExpanded(line.id)
                  : line.onChange?.(!checked);
            }}
            disabled={disabled}
          >
            {copy}
          </button>
        )}
        {hasValueControl ? (
          <span className="modules-design-row-control">
            {line.valueControl}
          </span>
        ) : (
          <GuestSwitch
            checked={checked}
            onChange={(nextChecked) => line.onChange?.(nextChecked)}
            disabled={disabled}
          />
        )}
        {hasChildren ? (
          <button
            type="button"
            className={
              expanded
                ? "modules-design-row-chevron is-open"
                : "modules-design-row-chevron"
            }
            onClick={() => onToggleExpanded(line.id)}
            aria-label={
              expanded ? "Collapse sub settings" : "Expand sub settings"
            }
            aria-expanded={expanded}
          >
            <span>⌄</span>
          </button>
        ) : null}
      </div>
      {line.visibilityControl ? (
        <div
          className={
            nested
              ? "modules-design-visibility-row is-subparameter"
              : "modules-design-visibility-row"
          }
        >
          {line.visibilityControl}
        </div>
      ) : null}
      {expanded ? (
        <div className="modules-design-sub-list">
          {visibleChildren.map((child) => (
            <ModulesDesignSettingLine
              key={child.id}
              line={child}
              expandedRows={expandedRows}
              onToggleExpanded={onToggleExpanded}
              nested
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModulesDesignGroupCard({
  group,
  expandedRows,
  onToggleExpanded,
}: {
  group: ModulesDesignGroup;
  expandedRows: string[];
  onToggleExpanded: (id: string) => void;
}) {
  const visibleRows = group.rows.filter((line) => !line.hidden);
  if (visibleRows.length === 0) return null;
  return (
    <section
      className={`modules-design-group-card modules-design-group-card--${group.tone} modules-design-group-card--id-${group.id}`}
    >
      <div
        className={
          group.hideSwitch
            ? "modules-design-group-header no-group-switch"
            : "modules-design-group-header"
        }
      >
        <span className="modules-design-group-icon">
          <ModulesDesignIcon kind={group.icon} />
        </span>
        <span className="modules-design-group-title">
          <strong>{group.title}</strong>
          <span>{group.subtitle}</span>
        </span>
        {group.hideSwitch ? null : (
          <GuestSwitch checked={group.checked} onChange={group.onChange} />
        )}
      </div>
      <div className="modules-design-settings-panel">
        {visibleRows.map((line) => (
          <ModulesDesignSettingLine
            key={line.id}
            line={line}
            expandedRows={expandedRows}
            onToggleExpanded={onToggleExpanded}
          />
        ))}
      </div>
    </section>
  );
}

type NotificationChannel = "email" | "sms" | "guestApp";
type NotificationEventKind =
  | "newSession"
  | "sessionChanged"
  | "sessionCancelled"
  | "beforeSession"
  | "afterSession";

type NotificationEventDefinition = {
  id: NotificationEventKind;
  title: string;
  description: string;
  icon: "calendar" | "edit" | "x" | "bell" | "check" | "message";
  reminder?: "before" | "after";
};

type ConfigurationNotificationsSectionProps = {
  settings: Record<string, string>;
  setSettings: (
    value:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  savingSettings: boolean;
  onSave: () => void | Promise<void>;
  t: (key: string) => string;
};

const notificationEvents: NotificationEventDefinition[] = [
  {
    id: "newSession",
    title: "Nova seja",
    description: "Pošlje se, ko je seja uspešno ustvarjena.",
    icon: "calendar",
  },
  {
    id: "sessionChanged",
    title: "Sprememba seje",
    description: "Pošlje se, ko so podrobnosti seje spremenjene.",
    icon: "edit",
  },
  {
    id: "sessionCancelled",
    title: "Preklic seje",
    description: "Pošlje se, ko je seja preklicana.",
    icon: "x",
  },
  {
    id: "beforeSession",
    title: "Pred sejo",
    description: "Opomnik pošlje pred začetkom seje.",
    icon: "bell",
    reminder: "before",
  },
  {
    id: "afterSession",
    title: "Po seji",
    description: "Povzetek pošlje po koncu seje.",
    icon: "check",
    reminder: "after",
  },
];

const reminderBeforeOptions = [
  "15 min pred terminom",
  "30 min pred terminom",
  "1 ura pred terminom",
  "2 uri pred terminom",
  "24 ur pred terminom",
];
const reminderAfterOptions = [
  "Takoj po seji",
  "30 min po seji",
  "1 ura po seji",
  "2 uri po seji",
  "24 ur po seji",
];

function notificationEnabledKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${id.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}_ENABLED`;
}

function notificationReminderKey(
  channel: NotificationChannel,
  reminder: "before" | "after",
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${reminder.toUpperCase()}_REMINDER_TIME`;
}

function getNotificationEnabled(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return settings[notificationEnabledKey(channel, id)] !== "false";
}

function getReminderValue(
  settings: Record<string, string>,
  channel: NotificationChannel,
  reminder: "before" | "after",
) {
  const fallback =
    reminder === "before" ? "24 ur pred terminom" : "2 uri po seji";
  return settings[notificationReminderKey(channel, reminder)] || fallback;
}

function notificationEventSettingName(id: NotificationEventKind) {
  return id.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase();
}

function notificationTemplateTitleKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_TEMPLATE_TITLE`;
}

function notificationTemplateBodyKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_TEMPLATE_BODY`;
}

type NotificationTemplateDefaults = Record<
  NotificationEventKind,
  { title: string; body: string }
>;

const emailTemplateDefaults: NotificationTemplateDefaults = {
  newSession: {
    title: "Potrditev rezervacije",
    body: "Pozdravljeni {{ime_stranke}},\n\nvaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.\n\nVeselimo se srečanja z vami.\n{{ime_podjetja}}",
  },
  sessionChanged: {
    title: "Sprememba rezervacije",
    body: "Pozdravljeni {{ime_stranke}},\n\npodrobnosti vaše rezervacije so bile spremenjene. Nov termin je {{datum}} ob {{cas}}.\n\n{{ime_podjetja}}",
  },
  sessionCancelled: {
    title: "Preklic rezervacije",
    body: "Pozdravljeni {{ime_stranke}},\n\nvaša rezervacija za {{ime_storitve}} je bila preklicana.\n\n{{ime_podjetja}}",
  },
  beforeSession: {
    title: "Opomnik pred terminom",
    body: "Pozdravljeni {{ime_stranke}},\n\nspomnimo vas na termin {{ime_storitve}} dne {{datum}} ob {{cas}}.\n\nSe vidimo kmalu.\n{{ime_podjetja}}",
  },
  afterSession: {
    title: "Hvala za obisk",
    body: "Pozdravljeni {{ime_stranke}},\n\nhvala za obisk. Veseli bomo vaših povratnih informacij.\n\n{{ime_podjetja}}",
  },
};

const smsTemplateDefaults: NotificationTemplateDefaults = {
  newSession: {
    title: "Nova seja",
    body: "Pozdravljeni {{ime_stranke}}, vaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.",
  },
  sessionChanged: {
    title: "Sprememba seje",
    body: "Pozdravljeni {{ime_stranke}}, vaš termin je bil spremenjen na {{datum}} ob {{cas}}.",
  },
  sessionCancelled: {
    title: "Preklic seje",
    body: "Pozdravljeni {{ime_stranke}}, vaša rezervacija za {{ime_storitve}} je bila preklicana.",
  },
  beforeSession: {
    title: "Opomnik pred sejo",
    body: "Pozdravljeni {{ime_stranke}}, opomnik na termin {{ime_storitve}} dne {{datum}} ob {{cas}}.",
  },
  afterSession: {
    title: "Po seji",
    body: "Hvala za obisk, {{ime_stranke}}. Veselimo se vaših povratnih informacij.",
  },
};

const guestAppTemplateDefaults: NotificationTemplateDefaults = {
  newSession: {
    title: "Nova seja",
    body: "Vaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.",
  },
  sessionChanged: {
    title: "Sprememba seje",
    body: "Podrobnosti vaše seje so bile spremenjene. Nov termin je {{datum}} ob {{cas}}.",
  },
  sessionCancelled: {
    title: "Preklic seje",
    body: "Vaša rezervacija za {{ime_storitve}} je bila preklicana.",
  },
  beforeSession: {
    title: "Opomnik pred sejo",
    body: "Opomnik: vaš termin {{ime_storitve}} je dne {{datum}} ob {{cas}}.",
  },
  afterSession: {
    title: "Po seji",
    body: "Hvala za obisk. Veseli bomo vaših povratnih informacij.",
  },
};

const notificationTemplateDefaults: Record<
  NotificationChannel,
  NotificationTemplateDefaults
> = {
  email: emailTemplateDefaults,
  sms: smsTemplateDefaults,
  guestApp: guestAppTemplateDefaults,
};

const NOTIFICATION_SETTINGS_KEY = "NOTIFICATION_SETTINGS_JSON";

const notificationChannels = ["email", "sms", "guestApp"] as const;

function notificationChannelSettingName(channel: NotificationChannel) {
  return channel === "guestApp" ? "GUEST_APP" : channel.toUpperCase();
}

function isNotificationChannelAvailable(
  settings: Record<string, string>,
  channel: NotificationChannel,
) {
  if (settings.NOTIFICATIONS_ENABLED === "false") return false;
  if (channel === "email") {
    return settings.NOTIFICATIONS_EMAIL_ALERTS_ENABLED !== "false";
  }
  if (channel === "sms") {
    return settings.NOTIFICATIONS_SMS_ALERTS_ENABLED === "true";
  }
  return settings.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED !== "false";
}

function applyNotificationModuleAvailability(
  settings: Record<string, string>,
): Record<string, string> {
  const next = { ...settings };
  if (next.NOTIFICATIONS_ENABLED === "false") {
    next.NOTIFICATIONS_EMAIL_ALERTS_ENABLED = "false";
    next.NOTIFICATIONS_SMS_ALERTS_ENABLED = "false";
    next.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED = "false";
  }

  notificationChannels.forEach((channel) => {
    if (!isNotificationChannelAvailable(next, channel)) {
      notificationEvents.forEach((event) => {
        next[notificationEnabledKey(channel, event.id)] = "false";
      });
    }
  });

  return next;
}

function notificationJsonEventKey(id: NotificationEventKind) {
  switch (id) {
    case "sessionChanged":
      return "changeSession";
    case "sessionCancelled":
      return "cancelSession";
    default:
      return id;
  }
}

function parseNotificationOffset(value: string, reminder: "before" | "after") {
  const normalized = String(value || "").toLowerCase();
  if (reminder === "after" && (normalized.includes("takoj") || normalized.includes("immediate"))) {
    return { offsetValue: 1, offsetUnit: "minutes" };
  }
  if (normalized.includes("15")) return { offsetValue: 15, offsetUnit: "minutes" };
  if (normalized.includes("30")) return { offsetValue: 30, offsetUnit: "minutes" };
  if (normalized.includes("24") || normalized.includes("day") || normalized.includes("dan")) {
    return { offsetValue: 24, offsetUnit: "hours" };
  }
  if (normalized.includes("2")) return { offsetValue: 2, offsetUnit: "hours" };
  return { offsetValue: 1, offsetUnit: "hours" };
}

function offsetToReminderValue(
  offsetValue: unknown,
  offsetUnit: unknown,
  reminder: "before" | "after",
) {
  const value = Number(offsetValue);
  const unit = String(offsetUnit || "hours").toLowerCase();
  const minutes =
    unit.startsWith("day")
      ? value * 24 * 60
      : unit.startsWith("minute")
        ? value
        : value * 60;

  if (reminder === "after") {
    if (!Number.isFinite(minutes) || minutes <= 1) return "Takoj po seji";
    if (minutes <= 30) return "30 min po seji";
    if (minutes <= 60) return "1 ura po seji";
    if (minutes <= 120) return "2 uri po seji";
    return "24 ur po seji";
  }

  if (!Number.isFinite(minutes) || minutes <= 15) return "15 min pred terminom";
  if (minutes <= 30) return "30 min pred terminom";
  if (minutes <= 60) return "1 ura pred terminom";
  if (minutes <= 120) return "2 uri pred terminom";
  return "24 ur pred terminom";
}

function buildNotificationSettingsJson(settings: Record<string, string>) {
  const normalizedSettings = applyNotificationModuleAvailability(settings);
  const root: Record<string, Record<string, Record<string, unknown>>> = {};

  notificationChannels.forEach((channel) => {
    root[channel] = {};
    notificationEvents.forEach((event) => {
      const title = getNotificationTemplateTitle(normalizedSettings, channel, event.id);
      const body = getNotificationTemplateBody(normalizedSettings, channel, event.id);
      const channelEnabled = isNotificationChannelAvailable(
        normalizedSettings,
        channel,
      );
      const node: Record<string, unknown> = {
        enabled:
          channelEnabled &&
          getNotificationEnabled(normalizedSettings, channel, event.id),
      };

      if (channel === "email") {
        node.subject = title;
        node.bodyHtml = body;
      } else if (channel === "sms") {
        node.title = title;
        node.body = body;
      } else {
        node.title = title;
        node.body = body;
      }

      if (event.reminder) {
        Object.assign(
          node,
          parseNotificationOffset(
            getReminderValue(normalizedSettings, channel, event.reminder),
            event.reminder,
          ),
        );
      }

      root[channel][notificationJsonEventKey(event.id)] = node;
    });
  });

  return JSON.stringify(root);
}

function mergeNotificationSettingsJsonIntoFlat(settings: Record<string, string>): Record<string, string> {
  const raw = settings[NOTIFICATION_SETTINGS_KEY];
  if (!raw) return settings;

  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, Record<string, unknown>>>;
    const next = { ...settings };

    notificationChannels.forEach((channel) => {
      notificationEvents.forEach((event) => {
        const node = parsed?.[channel]?.[notificationJsonEventKey(event.id)];
        if (!node || typeof node !== "object") return;

        if (typeof node.enabled === "boolean") {
          next[notificationEnabledKey(channel, event.id)] = node.enabled
            ? "true"
            : "false";
        }

        const title = String(
          channel === "email" ? node.subject || node.title || "" : node.title || "",
        );
        const body = String(
          channel === "email" ? node.bodyHtml || node.body || "" : node.body || "",
        );
        if (title) next[notificationTemplateTitleKey(channel, event.id)] = title;
        if (body) next[notificationTemplateBodyKey(channel, event.id)] = body;

        if (event.reminder) {
          next[notificationReminderKey(channel, event.reminder)] =
            offsetToReminderValue(node.offsetValue, node.offsetUnit, event.reminder);
        }
      });
    });

    return next;
  } catch {
    return settings;
  }
}

const notificationTemplateTags = [
  { label: "Ime podjetja", token: "{{ime_podjetja}}" },
  { label: "Ime stranke", token: "{{ime_stranke}}" },
  { label: "Priimek stranke", token: "{{priimek_stranke}}" },
  { label: "Ime storitve", token: "{{ime_storitve}}" },
  { label: "Datum", token: "{{datum}}" },
  { label: "Čas", token: "{{cas}}" },
  { label: "Naslov lokacije", token: "{{naslov_lokacije}}" },
  { label: "Ime lokacije", token: "{{ime_lokacije}}" },
  { label: "Telefonska številka lokacije", token: "{{telefon_lokacije}}" },
  { label: "Povezava za prenaročanje", token: "{{povezava_za_prenarocanje}}" },
  { label: "Kategorija storitve", token: "{{kategorija_storitve}}" },
  { label: "Ime izvajalca", token: "{{ime_izvajalca}}" },
  { label: "Telefonska številka izvajalca", token: "{{telefon_izvajalca}}" },
  { label: "Datum in čas prvotnega termina", token: "{{prvotni_termin}}" },
];

function getNotificationTemplateTitle(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return (
    settings[notificationTemplateTitleKey(channel, id)] ||
    notificationTemplateDefaults[channel][id].title
  );
}

function getNotificationTemplateBody(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return (
    settings[notificationTemplateBodyKey(channel, id)] ||
    notificationTemplateDefaults[channel][id].body
  );
}

function NotificationInfoIcon({
  kind,
}: {
  kind: Exclude<NotificationChannel, "email">;
}) {
  if (kind === "guestApp") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
        <path d="M10 6h4" />
      </svg>
    );
  }

  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function NotificationEventIcon({
  icon,
}: {
  icon: NotificationEventDefinition["icon"];
}) {
  if (icon === "calendar") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M12 14v5M9.5 16.5h5" />
      </svg>
    );
  }
  if (icon === "edit") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }
  if (icon === "x") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m15 9-6 6M9 9l6 6" />
      </svg>
    );
  }
  if (icon === "bell") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    );
  }
  if (icon === "message") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
    );
  }
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

function NotificationChevronIcon({ expanded = false }: { expanded?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={expanded ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function NotificationSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={checked ? "notif-switch is-on" : "notif-switch"}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function NotificationToolbarIcon({
  kind,
}: {
  kind:
    | "bold"
    | "italic"
    | "underline"
    | "link"
    | "bullets"
    | "numbers"
    | "quote"
    | "preview";
}) {
  if (kind === "bold") return <span aria-hidden>B</span>;
  if (kind === "italic") return <em aria-hidden>I</em>;
  if (kind === "underline")
    return (
      <span style={{ textDecoration: "underline" }} aria-hidden>
        U
      </span>
    );
  if (kind === "link") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
      </svg>
    );
  }
  if (kind === "bullets") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    );
  }
  if (kind === "numbers") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10 6h11M10 12h11M10 18h11" />
        <path d="M4 6h1v4M4 10h2M4 14h2l-2 4h2" />
      </svg>
    );
  }
  if (kind === "quote") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 21c3 0 7-1 7-8V5H3v8h4c0 4-2 6-4 8Z" />
        <path d="M14 21c3 0 7-1 7-8V5h-7v8h4c0 4-2 6-4 8Z" />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const keepTemplateSelectionOnToolbarMouseDown = (
  event: React.MouseEvent<HTMLButtonElement | HTMLSelectElement>,
) => {
  event.preventDefault();
};

function ConfigurationNotificationsSection({
  settings,
  setSettings,
  savingSettings,
  onSave,
  t,
}: ConfigurationNotificationsSectionProps) {
  const [channel, setChannel] = useState<NotificationChannel>("email");
  const [editingEvent, setEditingEvent] =
    useState<NotificationEventKind | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState(false);
  const templateBodyRef = useRef<HTMLDivElement | null>(null);

  const channelCopy: Record<
    NotificationChannel,
    { title: string; subtitle: string; editLabel: string }
  > = {
    email: {
      title: "Sprožilci e-pošte",
      subtitle:
        "E-poštna sporočila se pošiljajo samodejno na podlagi dogodkov.",
      editLabel: "Uredi predlogo",
    },
    sms: {
      title: "Sprožilci SMS",
      subtitle:
        "Besedilna sporočila se samodejno pošiljajo za ključne dogodke.",
      editLabel: "Uredi besedilo",
    },
    guestApp: {
      title: "Sporočilni dogodki",
      subtitle: "Izberite, kdaj naj bo obvestilo poslano v Guest aplikaciji.",
      editLabel: "Uredi vsebino",
    },
  };

  const channelAvailability: Record<NotificationChannel, boolean> = {
    email: isNotificationChannelAvailable(settings, "email"),
    sms: isNotificationChannelAvailable(settings, "sms"),
    guestApp: isNotificationChannelAvailable(settings, "guestApp"),
  };
  const availableChannels = (["email", "sms", "guestApp"] as const).filter(
    (id) => channelAvailability[id],
  );

  useEffect(() => {
    if (availableChannels.length === 0) return;
    if (!channelAvailability[channel]) {
      setChannel(availableChannels[0]);
    }
  }, [channelAvailability, availableChannels, channel]);

  useEffect(() => {
    setEditingEvent(null);
    setPreviewTemplate(false);
  }, [channel]);

  useEffect(() => {
    setPreviewTemplate(false);
  }, [editingEvent]);

  const selectedEvent = editingEvent
    ? notificationEvents.find((event) => event.id === editingEvent) || null
    : null;
  const selectedTemplateBody = selectedEvent
    ? getNotificationTemplateBody(settings, channel, selectedEvent.id)
    : "";

  useEffect(() => {
    if (!selectedEvent) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditingEvent(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) return;
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 640px)").matches
    )
      return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedEvent]);

  const setNotificationEnabled = (
    id: NotificationEventKind,
    checked: boolean,
  ) => {
    const key = notificationEnabledKey(channel, id);
    setSettings((prev) => ({ ...prev, [key]: checked ? "true" : "false" }));
  };

  const setReminderValue = (reminder: "before" | "after", value: string) => {
    const key = notificationReminderKey(channel, reminder);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const setTemplateTitle = (id: NotificationEventKind, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [notificationTemplateTitleKey(channel, id)]: value,
    }));
  };

  const setTemplateBody = (id: NotificationEventKind, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [notificationTemplateBodyKey(channel, id)]: value,
    }));
  };

  const templateBodyToEditorHtml = (raw: string) => {
    const value = String(raw || "");
    if (/<[a-z][\s\S]*>/i.test(value)) return value;
    return escapeHtml(value).replace(/\n/g, "<br>");
  };

  const syncTemplateBodyFromEditor = (id: NotificationEventKind) => {
    const element = templateBodyRef.current;
    if (!element) return;
    setTemplateBody(id, element.innerHTML);
  };

  const execTemplateCommand = (
    id: NotificationEventKind,
    command: string,
    value?: string,
  ) => {
    const element = templateBodyRef.current;
    if (!element) return;
    element.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // ignore browser execCommand failures
    }
    syncTemplateBodyFromEditor(id);
  };

  const applyTemplateBlockStyle = (
    id: NotificationEventKind,
    style: string,
  ) => {
    if (style === "normal") execTemplateCommand(id, "formatBlock", "p");
    else if (style === "heading") execTemplateCommand(id, "formatBlock", "h2");
    else if (style === "subheading")
      execTemplateCommand(id, "formatBlock", "h3");
    else if (style === "small") execTemplateCommand(id, "formatBlock", "small");
  };

  const insertTemplateLink = (id: NotificationEventKind) => {
    const url = window.prompt("URL", "https://");
    if (!url) return;
    execTemplateCommand(id, "createLink", url);
  };

  const appendTemplateToken = (id: NotificationEventKind, token: string) => {
    execTemplateCommand(id, "insertText", token);
  };

  const getTemplatePreviewText = (body: string) => {
    const replacements: Record<string, string> = {
      "{{ime_podjetja}}": "2TEN",
      "{{ime_stranke}}": "Maja",
      "{{priimek_stranke}}": "Novak",
      "{{ime_storitve}}": "Individualni trening",
      "{{datum}}": "12. junij 2026",
      "{{cas}}": "09:30",
      "{{naslov_lokacije}}": "Dunajska cesta 10",
      "{{ime_lokacije}}": "Studio Center",
      "{{telefon_lokacije}}": "+386 40 123 456",
      "{{povezava_za_prenarocanje}}": "https://2ten.si/book/2TEN",
      "{{kategorija_storitve}}": "Fitnes",
      "{{ime_izvajalca}}": "Ana",
      "{{telefon_izvajalca}}": "+386 41 555 111",
      "{{prvotni_termin}}": "10. junij 2026 ob 10:00",
    };
    const plain = body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|blockquote|li)>/gi, "\n")
      .replace(/<li>/gi, "• ")
      .replace(/<[^>]+>/g, "");
    return Object.entries(replacements).reduce(
      (text, [token, value]) => text.split(token).join(value),
      plain,
    );
  };

  useEffect(() => {
    if (!selectedEvent || previewTemplate) return;
    const element = templateBodyRef.current;
    if (!element) return;
    if (document.activeElement === element) return;
    const nextHtml = templateBodyToEditorHtml(selectedTemplateBody);
    if (element.innerHTML !== nextHtml) {
      element.innerHTML = nextHtml;
    }
  }, [selectedEvent, previewTemplate, selectedTemplateBody]);

  return (
    <section className="notif-page-shell">
      <style>{`
        .notif-page-shell {
          --notif-blue: #0f62fe;
          --notif-blue-dark: #0b4bd3;
          --notif-ink: #07173b;
          --notif-muted: #64708b;
          --notif-line: #dce3ef;
          --notif-soft: #f5f8ff;
          width: min(100%, 1540px);
        }
        .notif-page-title {
          margin: 0 0 22px;
          font-size: clamp(30px, 3vw, 38px);
          line-height: 1.1;
          color: var(--notif-ink);
          letter-spacing: -0.04em;
          font-weight: 800;
        }
        .notif-tabs {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 20px 0 10px;
          border-bottom: 1px solid #edf2f7;
        }
        .notif-tab {
          position: relative;
          appearance: none;
          border: 0;
          background: transparent;
          color: #334155;
          font-weight: 700;
          font-size: 15px;
          padding: 10px 14px;
          cursor: pointer;
          border-radius: 10px;
          box-shadow: none;
          outline: none;
          transition: color .18s ease, background .18s ease, box-shadow .18s ease;
        }
        .notif-tab:hover {
          color: #0f172a;
          background: #f8fafc;
        }
        .notif-tab.is-active {
          color: var(--notif-blue);
          background: #eaf2ff;
          box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16), 0 3px 10px rgba(37, 99, 235, 0.18);
        }
        .notif-card {
          position: relative;
          padding: clamp(24px, 3vw, 38px);
          border: 1px solid var(--notif-line);
          border-radius: 24px;
          background: rgba(255,255,255,0.96);
          box-shadow: 0 22px 50px rgba(13, 32, 67, 0.10);
          overflow: hidden;
        }
        .notif-card::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 14% 0%, rgba(34, 112, 255, 0.06), transparent 30%),
            radial-gradient(circle at 84% 100%, rgba(34, 112, 255, 0.05), transparent 28%);
        }
        .notif-card-content {
          position: relative;
        }
        .notif-mobile-channel-note {
          display: none;
        }
        .notif-layout {
          display: grid;
          gap: 28px;
        }
        .notif-layout.has-editor {
          grid-template-columns: minmax(0, 0.96fr) minmax(390px, 0.82fr);
          align-items: start;
        }
        .notif-section-heading {
          margin-bottom: 24px;
        }
        .notif-section-heading h3 {
          margin: 0 0 8px;
          color: var(--notif-ink);
          font-size: 22px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .notif-section-heading p {
          margin: 0;
          color: var(--notif-muted);
          font-size: 15px;
        }
        .notif-event-list {
          display: grid;
          gap: 13px;
        }
        .notif-event-row {
          display: grid;
          grid-template-columns: 52px minmax(220px, 1fr) minmax(218px, 0.34fr) 52px auto;
          align-items: center;
          gap: 18px;
          min-height: 88px;
          padding: 16px 22px 16px 16px;
          border: 1px solid var(--notif-line);
          border-radius: 16px;
          background: rgba(255,255,255,0.92);
          box-shadow: 0 8px 20px rgba(8, 23, 58, 0.035);
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .notif-layout.has-editor .notif-event-row {
          grid-template-columns: 52px minmax(170px, 1fr) minmax(190px, 0.34fr) 52px auto;
          gap: 14px;
        }
        .notif-event-row.is-editing {
          border-color: rgba(15, 98, 254, 0.46);
          box-shadow: 0 10px 24px rgba(15, 98, 254, 0.10);
        }
        .notif-event-icon {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          border-radius: 13px;
          color: var(--notif-blue);
          background: linear-gradient(180deg, #eef4ff 0%, #e7efff 100%);
        }
        .notif-event-copy strong {
          display: block;
          margin-bottom: 5px;
          color: var(--notif-ink);
          font-size: 16px;
          font-weight: 800;
        }
        .notif-event-copy span {
          display: block;
          color: var(--notif-muted);
          font-size: 14px;
          line-height: 1.35;
        }
        .notif-switch {
          position: relative;
          width: 52px;
          height: 30px;
          padding: 0;
          border: 1px solid #cfd8e7;
          border-radius: 999px;
          background: #e8edf6;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-switch span {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 2px 7px rgba(3, 17, 44, 0.24);
          transition: transform 160ms ease;
        }
        .notif-switch.is-on {
          border-color: var(--notif-blue);
          background: linear-gradient(180deg, #1b73ff 0%, #0f62fe 100%);
          box-shadow: 0 6px 14px rgba(15, 98, 254, 0.18);
        }
        .notif-switch.is-on span {
          transform: translateX(22px);
        }
        .notif-row-action {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 0;
          background: transparent;
          color: var(--notif-ink);
          font-size: 14px;
          font-weight: 800;
          white-space: nowrap;
          cursor: pointer;
        }
        .notif-row-action-icon {
          display: inline-grid;
          place-items: center;
          width: 19px;
          height: 19px;
          flex: 0 0 auto;
          transition: transform 160ms ease;
        }
        .notif-row-action:hover,
        .notif-row-action.is-active {
          color: var(--notif-blue);
        }
        .notif-row-action.is-active .notif-row-action-icon {
          transform: rotate(180deg);
        }
        .notif-row-chevron {
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          color: #0b1c45;
          cursor: pointer;
          padding: 4px;
        }
        .notif-row-chevron.is-active {
          color: var(--notif-blue);
        }
        .notif-reminder-select-wrap,
        .notif-reminder-placeholder {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .notif-reminder-select-wrap label {
          color: var(--notif-muted);
          font-size: 12px;
          font-weight: 800;
        }
        .notif-reminder-placeholder {
          min-height: 44px;
          visibility: hidden;
        }
        .notif-reminder-select {
          min-height: 44px;
          width: 100%;
          border: 1px solid #cfd8e7;
          border-radius: 11px;
          background: #fff;
          color: var(--notif-ink);
          padding: 0 40px 0 14px;
          font-size: 14px;
          font-weight: 700;
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #0b1c45 50%), linear-gradient(135deg, #0b1c45 50%, transparent 50%);
          background-position: calc(100% - 18px) 19px, calc(100% - 12px) 19px;
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
        }
        .notif-template-panel {
          min-height: 100%;
          padding-left: 30px;
          border-left: 1px solid var(--notif-line);
        }
        .notif-template-card {
          padding: 28px;
          border: 1px solid rgba(220, 227, 239, 0.96);
          border-radius: 20px;
          background: rgba(255,255,255,0.94);
          box-shadow: 0 18px 38px rgba(8, 23, 58, 0.06);
        }
        .notif-template-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 6px;
        }
        .notif-template-header h4 {
          margin: 0;
          color: var(--notif-ink);
          font-size: 22px;
          line-height: 1.18;
          font-weight: 850;
          letter-spacing: -0.035em;
        }
        .notif-template-subtitle {
          margin: 0 0 24px;
          color: var(--notif-muted);
          font-size: 14px;
          line-height: 1.45;
        }
        .notif-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 30px;
          padding: 0 14px;
          border-radius: 999px;
          background: #e8f8ef;
          color: #087443;
          font-size: 12px;
          font-weight: 850;
          white-space: nowrap;
        }
        .notif-status-pill::before {
          content: '';
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: currentColor;
          box-shadow: 0 0 0 3px rgba(8, 116, 67, 0.10);
        }
        .notif-status-pill.is-off {
          background: #f3f4f6;
          color: #5b6475;
        }
        .notif-template-tags {
          margin: 0 0 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e6edf6;
          color: var(--notif-ink);
          font-size: 13px;
          font-weight: 850;
          line-height: 1.4;
        }
        .notif-template-tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .notif-template-tag {
          border: 1px solid rgba(18, 148, 74, 0.18);
          border-radius: 999px;
          background: #eaf8f0;
          color: #098342;
          padding: 6px 11px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 5px 12px rgba(21, 148, 71, 0.06);
          transition: transform 150ms ease, background 150ms ease, border-color 150ms ease;
        }
        .notif-template-tag:hover {
          background: #ddf3e7;
          border-color: rgba(18, 148, 74, 0.32);
          transform: translateY(-1px);
        }
        .notif-template-field {
          display: grid;
          gap: 9px;
          margin-top: 16px;
        }
        .notif-template-field label {
          color: var(--notif-ink);
          font-size: 13px;
          font-weight: 850;
        }
        .notif-template-input,
        .notif-template-textarea {
          width: 100%;
          border: 1px solid #cfd8e7;
          border-radius: 12px;
          background: #fff;
          color: var(--notif-ink);
          font-size: 14px;
          line-height: 1.5;
          padding: 12px 14px;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-template-input:focus,
        .notif-template-textarea:focus,
        .notif-reminder-select:focus {
          border-color: rgba(15, 98, 254, 0.62);
          box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
        }
        .notif-template-editor {
          overflow: hidden;
          border: 1px solid #cfd8e7;
          border-radius: 13px;
          background: #fff;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-template-editor:focus-within {
          border-color: rgba(15, 98, 254, 0.62);
          box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
        }
        .notif-template-toolbar {
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 46px;
          padding: 7px 9px;
          border-bottom: 1px solid #e6edf6;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }
        .notif-template-format,
        .notif-template-toolbar-button,
        .notif-template-preview-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #23345d;
          font-size: 13px;
          font-weight: 800;
          height: 32px;
          padding: 0 10px;
          cursor: pointer;
          transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
        }
        .notif-template-format {
          min-width: 126px;
          justify-content: space-between;
          border: 1px solid #e1e8f3;
          background: #f4f7fb;
          color: #243655;
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #475569 50%), linear-gradient(135deg, #475569 50%, transparent 50%);
          background-position: calc(100% - 16px) 14px, calc(100% - 11px) 14px;
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
          padding-right: 28px;
        }
        .notif-template-toolbar-button {
          min-width: 32px;
          padding: 0 8px;
        }
        .notif-template-toolbar-button:hover,
        .notif-template-toolbar-button.is-active,
        .notif-template-preview-button:hover,
        .notif-template-preview-button.is-active {
          background: #eef4ff;
          color: var(--notif-blue);
          box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.10);
        }
        .notif-template-toolbar-divider {
          width: 1px;
          align-self: stretch;
          margin: 4px 3px;
          background: #e6edf6;
        }
        .notif-template-toolbar-spacer {
          flex: 1 1 auto;
        }
        .notif-template-preview-button {
          gap: 7px;
          background: #eef4ff;
          color: var(--notif-blue);
          padding: 0 10px;
        }
        .notif-template-textarea {
          min-height: 220px;
          resize: vertical;
          border: 0;
          border-radius: 0;
          box-shadow: none !important;
        }
        .notif-template-preview-pane {
          min-height: 220px;
          padding: 16px 16px 18px;
          color: var(--notif-ink);
          font-size: 14px;
          line-height: 1.62;
          white-space: pre-wrap;
          background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
        }
        .notif-template-preview-empty {
          color: var(--notif-muted);
          font-style: italic;
        }
        .notif-template-close {
          display: none;
          border: 0;
          background: transparent;
          color: #07173b;
          cursor: pointer;
        }
        .notif-savebar {
          display: flex;
          justify-content: flex-end;
          margin-top: 28px;
        }
        .notif-save-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-width: 220px;
          min-height: 48px;
          border: 0;
          border-radius: 12px;
          background: linear-gradient(180deg, #1c78ff 0%, #0f62fe 100%);
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 12px 22px rgba(15, 98, 254, 0.25);
        }
        .notif-save-button:disabled {
          opacity: 0.72;
          cursor: progress;
        }
        @media (max-width: 1180px) {
          .notif-layout.has-editor {
            grid-template-columns: 1fr;
          }
          .notif-template-panel {
            padding-left: 0;
            padding-top: 24px;
            border-left: 0;
            border-top: 1px solid var(--notif-line);
          }
        }
        @media (max-width: 980px) {
          .notif-page-shell { width: 100%; }
          .notif-tabs { display: flex; width: 100%; overflow-x: auto; }
          .notif-tab { flex: 0 0 auto; }
          .notif-event-row,
          .notif-layout.has-editor .notif-event-row {
            grid-template-columns: 48px minmax(0, 1fr) auto;
            gap: 14px;
          }
          .notif-row-action {
            display: inline-flex;
          }
          .notif-reminder-select-wrap,
          .notif-reminder-placeholder {
            grid-column: 2 / -1;
            grid-row: auto;
          }
        }
        @media (max-width: 640px) {
          .notif-page-shell {
            width: 100%;
          }
          .notif-card {
            padding: 0 12px 18px;
            border: 0;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
            overflow: visible;
          }
          .notif-card::before {
            display: none;
          }
          .notif-card-content {
            display: grid;
            gap: 14px;
          }
          .notif-tabs {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0;
            width: 100%;
            margin: 0;
            overflow: visible;
            border-bottom: 1px solid #dbe5f3;
          }
          .notif-tab {
            min-width: 0;
            padding: 13px 4px 14px;
            border-radius: 0;
            color: #07173b;
            font-size: 13px;
            line-height: 1.15;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            background: transparent;
          }
          .notif-tab:hover {
            background: transparent;
          }
          .notif-tab::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            bottom: -1px;
            height: 2px;
            border-radius: 999px 999px 0 0;
            background: transparent;
            transform: scaleX(0.3);
            opacity: 0;
            transition: transform 160ms ease, opacity 160ms ease, background 160ms ease;
          }
          .notif-tab.is-active {
            color: var(--notif-blue);
            background: transparent;
            box-shadow: none;
          }
          .notif-tab.is-active::after {
            background: var(--notif-blue);
            transform: scaleX(1);
            opacity: 1;
          }
          .notif-mobile-channel-note {
            display: flex;
            align-items: center;
            gap: 14px;
            margin: 10px 0 2px;
            padding: 16px 14px;
            border: 1px solid rgba(226, 234, 246, 0.95);
            border-radius: 13px;
            background: linear-gradient(135deg, #f6f9ff 0%, #eef4ff 100%);
            color: #596886;
            font-size: 13px;
            line-height: 1.35;
            font-weight: 600;
            box-shadow: 0 8px 18px rgba(8, 23, 58, 0.04);
          }
          .notif-mobile-channel-note-icon {
            display: grid;
            place-items: center;
            flex: 0 0 auto;
            width: 38px;
            height: 38px;
            border-radius: 12px;
            color: var(--notif-blue);
            background: rgba(255, 255, 255, 0.78);
          }
          .notif-layout,
          .notif-layout.has-editor {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .notif-event-list {
            gap: 14px;
          }
          .notif-event-row,
          .notif-layout.has-editor .notif-event-row {
            display: grid;
            grid-template-columns: 48px minmax(0, 1fr) auto;
            grid-template-areas:
              'icon copy switch'
              'reminder reminder reminder'
              'action action action';
            align-items: center;
            gap: 0 14px;
            min-height: 0;
            padding: 14px 14px 0;
            border: 1px solid #dfe7f3;
            border-radius: 13px;
            background: rgba(255, 255, 255, 0.98);
            box-shadow: 0 8px 20px rgba(8, 23, 58, 0.045);
            overflow: hidden;
          }
          .notif-event-row.is-editing {
            border-color: rgba(15, 98, 254, 0.42);
            box-shadow: 0 10px 24px rgba(15, 98, 254, 0.10);
          }
          .notif-event-icon {
            grid-area: icon;
            align-self: start;
            width: 44px;
            height: 44px;
            border-radius: 12px;
          }
          .notif-event-icon svg {
            width: 22px;
            height: 22px;
          }
          .notif-event-copy {
            grid-area: copy;
            min-width: 0;
            padding: 2px 0 14px;
          }
          .notif-event-copy strong {
            margin-bottom: 4px;
            font-size: 15px;
            line-height: 1.22;
            letter-spacing: -0.01em;
          }
          .notif-event-copy span {
            font-size: 13px;
            line-height: 1.28;
          }
          .notif-switch {
            grid-area: switch;
            align-self: center;
            width: 48px;
            height: 28px;
          }
          .notif-switch span {
            top: 3px;
            left: 3px;
            width: 20px;
            height: 20px;
          }
          .notif-switch.is-on span {
            transform: translateX(20px);
          }
          .notif-reminder-placeholder {
            display: none;
          }
          .notif-reminder-select-wrap {
            grid-area: reminder;
            display: block;
            margin: 0 -14px;
            padding: 0 14px;
            border-top: 1px solid #e8eef7;
          }
          .notif-reminder-select-wrap label {
            display: none;
          }
          .notif-reminder-select {
            min-height: 42px;
            border: 0;
            border-radius: 0;
            background-color: transparent;
            padding: 0 34px 0 0;
            color: #07173b;
            font-size: 13px;
            font-weight: 800;
            box-shadow: none !important;
            background-position: calc(100% - 14px) 18px, calc(100% - 9px) 18px;
            background-size: 5px 5px, 5px 5px;
          }
          .notif-row-action {
            grid-area: action;
            display: flex !important;
            align-items: center;
            min-height: 42px;
            margin: 0 -14px;
            padding: 0 14px;
            border-top: 1px solid #e8eef7;
            color: var(--notif-blue);
            font-size: 13px;
            font-weight: 850;
            text-align: left;
          }
          .notif-row-action-icon svg {
            width: 19px;
            height: 19px;
          }
          .notif-row-chevron {
            grid-area: chevron;
            align-self: stretch;
            display: grid;
            place-items: center;
            min-height: 42px;
            margin: 0 -14px 0 0;
            padding: 0 14px 0 6px;
            border-top: 1px solid #e8eef7;
            color: #07173b;
          }
          .notif-row-chevron svg {
            width: 19px;
            height: 19px;
          }
          .notif-template-panel {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: block;
            width: 100vw;
            height: 100vh;
            height: 100dvh;
            padding: 0;
            border: 0;
            background: #fff;
            overflow: hidden;
            overscroll-behavior: contain;
          }
          .notif-template-card {
            width: 100vw;
            max-width: 100vw;
            min-height: 100vh;
            min-height: 100dvh;
            max-height: none;
            overflow-y: auto;
            overflow-x: hidden;
            padding: max(18px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
            border: 0;
            border-radius: 0;
            background: #fff;
            box-shadow: none;
            animation: notif-template-fullscreen-in 160ms ease-out;
          }
          @keyframes notif-template-fullscreen-in {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .notif-template-header {
            position: sticky;
            top: 0;
            z-index: 2;
            align-items: flex-start;
            gap: 10px;
            margin: calc(-1 * max(18px, env(safe-area-inset-top))) -16px 12px;
            padding: max(18px, env(safe-area-inset-top)) 70px 14px 16px;
            border-bottom: 1px solid #edf2f8;
            background: rgba(255, 255, 255, 0.97);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }
          .notif-template-header h4 {
            font-size: 18px;
          }
          .notif-template-close {
            position: absolute;
            top: max(10px, env(safe-area-inset-top));
            right: 16px;
            display: grid;
            place-items: center;
            flex: 0 0 auto;
            width: 44px;
            height: 44px;
            margin: 0;
            border-radius: 999px;
            color: #07173b;
            background: #f2f6ff;
            box-shadow: 0 8px 18px rgba(8, 23, 58, 0.08);
          }
          .notif-template-close:active {
            transform: scale(0.98);
          }
          .notif-status-pill {
            display: none;
          }
          .notif-template-subtitle {
            display: none;
          }
          .notif-template-toolbar {
            gap: 3px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .notif-template-format {
            min-width: 116px;
          }
          .notif-template-preview-button {
            flex: 0 0 auto;
          }
          .notif-template-textarea,
          .notif-template-preview-pane {
            min-height: 190px;
          }
          .notif-template-tags {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: 0;
          }
          .notif-template-tag-list {
            flex-wrap: wrap;
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
            overflow-y: visible;
            padding-bottom: 0;
          }
          .notif-template-tag {
            flex: 0 1 auto;
            min-width: 0;
            max-width: 100%;
            white-space: normal;
            word-break: break-word;
            overflow-wrap: anywhere;
            font-size: 11px;
          }
          .notif-savebar {
            position: sticky;
            bottom: 0;
            z-index: 3;
            justify-content: stretch;
            margin: 10px -16px 0;
            padding: 12px 16px max(2px, env(safe-area-inset-bottom));
            background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.94) 28%, #fff 100%);
          }
          .notif-save-button {
            width: 100%;
            min-width: 0;
            min-height: 50px;
            border: 1px solid rgba(15, 98, 254, 0.12);
            border-radius: 11px;
            background: linear-gradient(180deg, #f7fbff 0%, #eef5ff 100%);
            color: var(--notif-blue);
            font-size: 14px;
            box-shadow: 0 6px 16px rgba(15, 98, 254, 0.08);
          }
        }
      `}</style>
      <div className="notif-card">
        <div className="notif-card-content">
          <div className="notif-tabs" role="tablist" aria-label="Obvestila">
            {(
              [
                ["email", "E-pošta"],
                ["sms", "SMS"],
                ["guestApp", "Aplikacija za goste"],
              ] as const
            )
              .filter(([id]) => channelAvailability[id])
              .map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={
                    channel === id ? "notif-tab is-active" : "notif-tab"
                  }
                  onClick={() => setChannel(id)}
                  role="tab"
                  aria-selected={channel === id}
                >
                  {label}
                </button>
              ))}
          </div>
          {availableChannels.length === 0 ? (
            <div className="notif-mobile-channel-note" role="note">
              <span>
                Vsi kanali obvestil so izklopljeni. Vklopite jih v Nastavitve →
                App nastavitve → Komunikacija.
              </span>
            </div>
          ) : channel !== "email" && channelAvailability[channel] ? (
            <div className="notif-mobile-channel-note" role="note">
              <span className="notif-mobile-channel-note-icon">
                <NotificationInfoIcon kind={channel} />
              </span>
              <span>
                {channel === "sms"
                  ? "SMS obvestila se pošiljajo na telefonsko številko gosta, ki jo imate shranjeno v rezervaciji."
                  : "Push obvestila bodo prikazana v aplikaciji za vaše goste."}
              </span>
            </div>
          ) : null}
          {availableChannels.length > 0 ? (
            <div
              className={
                selectedEvent ? "notif-layout has-editor" : "notif-layout"
              }
            >
              <div>
                <div className="notif-event-list">
                  {notificationEvents.map((event) => {
                    const checked = getNotificationEnabled(
                      settings,
                      channel,
                      event.id,
                    );
                    const reminderValue = event.reminder
                      ? getReminderValue(settings, channel, event.reminder)
                      : "";
                    const reminderOptions =
                      event.reminder === "after"
                        ? reminderAfterOptions
                        : reminderBeforeOptions;
                    const isEditing = selectedEvent?.id === event.id;
                    const openEditor = () =>
                      setEditingEvent((prev) =>
                        prev === event.id ? null : event.id,
                      );
                    return (
                      <div
                        className={
                          isEditing
                            ? "notif-event-row is-editing"
                            : "notif-event-row"
                        }
                        key={`${channel}-${event.id}`}
                      >
                        <span className="notif-event-icon">
                          <NotificationEventIcon icon={event.icon} />
                        </span>
                        <span className="notif-event-copy">
                          <strong>{event.title}</strong>
                          <span>{event.description}</span>
                        </span>
                        {event.reminder && checked ? (
                          <span className="notif-reminder-select-wrap">
                            <label>Privzeti čas opomnika</label>
                            <select
                              className="notif-reminder-select"
                              value={reminderValue}
                              onChange={(e) =>
                                setReminderValue(
                                  event.reminder!,
                                  e.target.value,
                                )
                              }
                            >
                              {reminderOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </span>
                        ) : (
                          <span
                            className="notif-reminder-placeholder"
                            aria-hidden
                          />
                        )}
                        <NotificationSwitch
                          checked={checked}
                          onChange={(next) =>
                            setNotificationEnabled(event.id, next)
                          }
                        />
                        <button
                          type="button"
                          className={
                            isEditing
                              ? "notif-row-action is-active"
                              : "notif-row-action"
                          }
                          aria-label={`${channelCopy[channel].editLabel}: ${event.title}`}
                          onClick={openEditor}
                        >
                          <span>{channelCopy[channel].editLabel}</span>
                          <span className="notif-row-action-icon" aria-hidden>
                            <NotificationChevronIcon expanded={isEditing} />
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedEvent ? (
                <aside
                  className="notif-template-panel"
                  aria-label={`${channelCopy[channel].editLabel}: ${selectedEvent.title}`}
                  onClick={(event) => {
                    if (event.currentTarget === event.target)
                      setEditingEvent(null);
                  }}
                >
                  <div
                    className="notif-template-card"
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="notif-template-header">
                      <h4>
                        {channelCopy[channel].editLabel}: {selectedEvent.title}
                      </h4>
                      <button
                        type="button"
                        className="notif-template-close"
                        aria-label="Zapri predlogo"
                        onClick={() => setEditingEvent(null)}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                      <span
                        className={
                          getNotificationEnabled(
                            settings,
                            channel,
                            selectedEvent.id,
                          )
                            ? "notif-status-pill"
                            : "notif-status-pill is-off"
                        }
                      >
                        {getNotificationEnabled(
                          settings,
                          channel,
                          selectedEvent.id,
                        )
                          ? "VKLOPLJENO"
                          : "IZKLOPLJENO"}
                      </span>
                    </div>
                    <p className="notif-template-subtitle">
                      {channel === "email"
                        ? "Uredite vsebino e-pošte, ki bo poslana gostu ob izbranem dogodku."
                        : channel === "sms"
                          ? "Uredite kratko SMS sporočilo, ki bo poslano gostu ob izbranem dogodku."
                          : "Uredite obvestilo, ki se prikaže gostu v aplikaciji."}
                    </p>
                    <div className="notif-template-field">
                      <label
                        htmlFor={`notif-template-title-${channel}-${selectedEvent.id}`}
                      >
                        Naslov
                      </label>
                      <input
                        id={`notif-template-title-${channel}-${selectedEvent.id}`}
                        className="notif-template-input"
                        value={getNotificationTemplateTitle(
                          settings,
                          channel,
                          selectedEvent.id,
                        )}
                        onChange={(event) =>
                          setTemplateTitle(selectedEvent.id, event.target.value)
                        }
                      />
                    </div>
                    <div className="notif-template-field">
                      <label
                        htmlFor={`notif-template-body-${channel}-${selectedEvent.id}`}
                      >
                        Vsebina
                      </label>
                      <div className="notif-template-editor">
                        <div
                          className="notif-template-toolbar"
                          aria-label="Orodna vrstica predloge"
                        >
                          <select
                            className="notif-template-format"
                            aria-label="Slog besedila"
                            value="normal"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onChange={(event) =>
                              applyTemplateBlockStyle(
                                selectedEvent.id,
                                event.target.value,
                              )
                            }
                          >
                            <option value="normal">Normalno</option>
                            <option value="heading">Naslov</option>
                            <option value="subheading">Podnaslov</option>
                            <option value="small">Drobno</option>
                          </select>
                          <span
                            className="notif-template-toolbar-divider"
                            aria-hidden
                          />
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Krepko"
                            title="Krepko"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(selectedEvent.id, "bold")
                            }
                          >
                            <NotificationToolbarIcon kind="bold" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Ležeče"
                            title="Ležeče"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(selectedEvent.id, "italic")
                            }
                          >
                            <NotificationToolbarIcon kind="italic" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Podčrtano"
                            title="Podčrtano"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(selectedEvent.id, "underline")
                            }
                          >
                            <NotificationToolbarIcon kind="underline" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Vstavi povezavo"
                            title="Vstavi povezavo"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() => insertTemplateLink(selectedEvent.id)}
                          >
                            <NotificationToolbarIcon kind="link" />
                          </button>
                          <span
                            className="notif-template-toolbar-divider"
                            aria-hidden
                          />
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Označen seznam"
                            title="Označen seznam"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(
                                selectedEvent.id,
                                "insertUnorderedList",
                              )
                            }
                          >
                            <NotificationToolbarIcon kind="bullets" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Oštevilčen seznam"
                            title="Oštevilčen seznam"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(
                                selectedEvent.id,
                                "insertOrderedList",
                              )
                            }
                          >
                            <NotificationToolbarIcon kind="numbers" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Citat"
                            title="Citat"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(
                                selectedEvent.id,
                                "formatBlock",
                                "blockquote",
                              )
                            }
                          >
                            <NotificationToolbarIcon kind="quote" />
                          </button>
                          <span className="notif-template-toolbar-spacer" />
                          <button
                            type="button"
                            className={
                              previewTemplate
                                ? "notif-template-preview-button is-active"
                                : "notif-template-preview-button"
                            }
                            aria-label="Predogled"
                            aria-pressed={previewTemplate}
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              setPreviewTemplate((value) => !value)
                            }
                          >
                            <NotificationToolbarIcon kind="preview" />
                            Predogled
                          </button>
                        </div>
                        {previewTemplate ? (
                          <div
                            className={
                              getNotificationTemplateBody(
                                settings,
                                channel,
                                selectedEvent.id,
                              ).trim()
                                ? "notif-template-preview-pane"
                                : "notif-template-preview-pane notif-template-preview-empty"
                            }
                          >
                            {getNotificationTemplateBody(
                              settings,
                              channel,
                              selectedEvent.id,
                            ).trim()
                              ? getTemplatePreviewText(
                                  getNotificationTemplateBody(
                                    settings,
                                    channel,
                                    selectedEvent.id,
                                  ),
                                )
                              : "Predloga je prazna."}
                          </div>
                        ) : (
                          <div
                            ref={templateBodyRef}
                            id={`notif-template-body-${channel}-${selectedEvent.id}`}
                            className="notif-template-textarea"
                            contentEditable
                            suppressContentEditableWarning
                            onInput={() =>
                              syncTemplateBodyFromEditor(selectedEvent.id)
                            }
                            onBlur={() =>
                              syncTemplateBodyFromEditor(selectedEvent.id)
                            }
                          />
                        )}
                      </div>
                    </div>
                    <div className="notif-template-tags">
                      Razpoložljive oznake
                      <div className="notif-template-tag-list">
                        {notificationTemplateTags.map((tag) => (
                          <button
                            key={tag.token}
                            type="button"
                            className="notif-template-tag"
                            onClick={() =>
                              appendTemplateToken(selectedEvent.id, tag.token)
                            }
                            title={tag.label}
                          >
                            {tag.token}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </aside>
              ) : null}
            </div>
          ) : null}
          <div className="notif-savebar">
            <button
              type="button"
              className="notif-save-button"
              onClick={() => void onSave()}
              disabled={savingSettings}
            >
              <GuestSaveIcon />
              {savingSettings ? t("formSaving") : t("configSaveConfiguration")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function GuestDownloadIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function GuestCopyIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function GuestLinkIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
    </svg>
  );
}

function GuestEyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function GuestInfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function GuestShieldIcon() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function GuestPaymentMethodIcon({ kind }: { kind: GuestPaymentMethodId }) {
  if (kind === "online_card") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
      </svg>
    );
  }
  if (kind === "paypal") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M7 21l1.5-9h4a4 4 0 0 0 0-8H8L5 21" />
        <path d="M9.5 17h3.2a4 4 0 0 0 4-3.4l.1-.6a3 3 0 0 0-3-3.5H10" />
      </svg>
    );
  }
  if (kind === "bank_transfer") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 10h18" />
        <path d="M5 10V8l7-4 7 4v2" />
        <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
        <path d="M4 21h16M3 17h18" />
      </svg>
    );
  }
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" />
    </svg>
  );
}

function BillingPlusIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function BillingEditIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 5 4 4" />
      <path d="M3 21l3.9-.9L19 8 16 5 3.9 17.1 3 21z" />
    </svg>
  );
}

function BillingTrashIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function BillingPaypalIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 21l1.5-9h4a4 4 0 0 0 0-8H8L5 21" />
      <path d="M9.5 17h3.2a4 4 0 0 0 4-3.4l.1-.6a3 3 0 0 0-3-3.5H10" />
    </svg>
  );
}

function BillingUploadIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

function BillingCertificateIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 15h8M8 18h5" />
      <path d="M9 11l2 2 4-4" />
    </svg>
  );
}

function BillingLockIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function BillingSaveIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function BillingInfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function BillingReceiptIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 2h12a1 1 0 0 1 1 1v19l-3-2-3 2-3-2-3 2-2-1.5V3a1 1 0 0 1 1-1Z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h3" />
    </svg>
  );
}

function BillingLinkIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.08-7.08l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.08 7.08l1.71-1.71" />
    </svg>
  );
}

function BillingUserBadgeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22a8 8 0 0 1 16 0" />
    </svg>
  );
}

function BillingTagIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.59 13.41 12 22l-9-9V4h9l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function BillingPaymentTypeIcon({ type }: { type: PaymentType }) {
  if (type === "CASH") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 9h.01M18 15h.01" />
      </svg>
    );
  }
  if (type === "CARD") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3M14 15h3" />
      </svg>
    );
  }
  if (type === "ADVANCE") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (type === "BANK_TRANSFER") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 10h18" />
        <path d="M5 10V8l7-4 7 4v2" />
        <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
        <path d="M4 21h16M3 17h18" />
      </svg>
    );
  }
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function GuestUploadGlyph({ kind }: { kind: "image" | "logo" | "icon" }) {
  if (kind === "icon") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M4.93 4.93l2.83 2.83" />
        <path d="M16.24 16.24l2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
        <path d="M4.93 19.07l2.83-2.83" />
        <path d="M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function GuestUploadDropzone({
  title,
  subtitle,
  hint,
  accept,
  uploading,
  currentUrl,
  previewAlt,
  previewShape = "wide",
  iconKind = "image",
  onFile,
}: {
  title: string;
  subtitle: string;
  hint: string;
  accept?: string;
  uploading?: boolean;
  currentUrl?: string;
  previewAlt: string;
  previewShape?: "wide" | "round" | "square";
  iconKind?: "image" | "logo" | "icon";
  onFile: (file: File | null) => void;
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const acceptPattern = accept || "image/*";
  const onDropFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const selected = event.dataTransfer?.files?.[0] || null;
    if (!selected) return;
    onFile(selected);
  };

  return (
    <div className="gapp-upload-wrap">
      <label
        className={`gapp-upload-zone${isDragActive ? " drag-active" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isDragActive) setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          const related = event.relatedTarget as Node | null;
          if (related && event.currentTarget.contains(related)) return;
          setIsDragActive(false);
        }}
        onDrop={onDropFile}
      >
        <span className="gapp-upload-icon">
          <GuestUploadGlyph kind={iconKind} />
        </span>
        <span className="gapp-upload-copy">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <input
          className="gapp-file-input"
          type="file"
          accept={acceptPattern}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0] || null;
            onFile(selected);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <span className="gapp-hint">{uploading ? "Uploading..." : hint}</span>
      {currentUrl ? (
        <div className="gapp-upload-preview-row">
          <img
            className={`gapp-upload-preview ${previewShape}`}
            src={currentUrl}
            alt={previewAlt}
          />
          <a href={currentUrl} target="_blank" rel="noreferrer">
            Open uploaded image
          </a>
        </div>
      ) : null}
    </div>
  );
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

type Space = {
  id: number;
  name: string;
  description?: string;
  createdAt?: string;
};
const toTimeInputValue = (value: string | undefined, fallback: string) => {
  const v = (value || "").trim();
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5);
  return fallback;
};

function spaceListInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  const s = name.trim();
  if (s.length >= 2) return s.slice(0, 2).toUpperCase();
  return (s.charAt(0) || "S").toUpperCase();
}
const WORKING_HOURS_FALLBACK_KEY = "workingHoursFallback";
const getWorkingHoursFallback = () => {
  try {
    const raw = localStorage.getItem(WORKING_HOURS_FALLBACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};
const setWorkingHoursFallback = (start: string, end: string) => {
  try {
    localStorage.setItem(
      WORKING_HOURS_FALLBACK_KEY,
      JSON.stringify({
        WORKING_HOURS_START: start,
        WORKING_HOURS_END: end,
      }),
    );
  } catch {
    // ignore storage errors
  }
};

const PERSONAL_TASK_PRESETS_KEY = "PERSONAL_TASK_PRESETS_JSON";
const DEFAULT_PERSONAL_TASK_COLOR = "#F97316";
const GUEST_PUBLIC_NAME_MAX_LENGTH = 15;
const GUEST_PUBLIC_CITY_MAX_LENGTH = 14;
const GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH = 22;
const normalizePublicName = (value: string | undefined) =>
  String(value || "").slice(0, GUEST_PUBLIC_NAME_MAX_LENGTH);
const normalizePublicCity = (value: string | undefined) =>
  String(value || "").slice(0, GUEST_PUBLIC_CITY_MAX_LENGTH);
const normalizeHexColor = (value: string | undefined) => {
  const v = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v)
    ? v.toUpperCase()
    : DEFAULT_PERSONAL_TASK_COLOR;
};
const normalizePublicDescription = (value: string | undefined) =>
  String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH);
const normalizePublicDescriptionInput = (value: string | undefined) =>
  String(value || "")
    .replace(/[\r\n]+/g, " ")
    .slice(0, GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH);
const normalizeGuestQrColor = (value: string | undefined) => {
  const v = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : "#2563EB";
};
const parsePersonalTaskPresets = (
  raw: string | undefined,
): PersonalTaskPreset[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: PersonalTaskPreset[] = [];
    for (const row of parsed) {
      const name = String(row?.name || "").trim();
      if (!name) continue;
      out.push({
        id: String(row?.id || `${Date.now()}-${Math.random()}`),
        name,
        color: normalizeHexColor(row?.color),
      });
    }
    return out;
  } catch {
    return [];
  }
};
const serializePersonalTaskPresets = (presets: PersonalTaskPreset[]) =>
  JSON.stringify(
    presets.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      color: normalizeHexColor(p.color),
    })),
  );
const REGISTERED_PREMISES_KEY = "FISCAL_REGISTERED_PREMISES_JSON";
const parseRegisteredPremises = (raw: string | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalize = (v: any): string => {
      if (typeof v === "string" || typeof v === "number")
        return String(v).trim();
      if (v && typeof v === "object") {
        const candidate = v.id ?? v.premiseId ?? v.businessPremiseId ?? v.value;
        if (candidate != null) return String(candidate).trim();
      }
      return "";
    };
    return parsed
      .map(normalize)
      .filter((v) => v.length > 0)
      .filter((v) => v.toLowerCase() !== "[object object]");
  } catch {
    return [];
  }
};

type GuestPaymentMethodId =
  | "online_card"
  | "bank_transfer"
  | "paypal"
  | "gift_card";

type GuestAppSettingsForm = {
  guestAppEnabled: boolean;
  walletEnabled: boolean;
  ordersEnabled: boolean;
  buyTabEnabled: boolean;
  entitlementsEnabled: boolean;
  inboxEnabled: boolean;
  publicDiscoverable: boolean;
  publicName: string;
  publicDescription: string;
  publicCity: string;
  tenantType: TenantConfigType;
  cardImageUrl: string;
  logoImageUrl: string;
  iconImageUrl: string;
  defaultLanguage: "sl" | "en";
  employeeSelectionStep: boolean;
  useEmployeeContact: boolean;
  acceptedPaymentMethodIds: GuestPaymentMethodId[];
  paymentDefaultMethodId: GuestPaymentMethodId;
  paymentCurrency: string;
  paymentTaxRate: string;
  paymentOnLocation: boolean;
  paymentSendInvoiceEmail: boolean;
  paymentCustomerDescription: string;
  paymentProvider: string;
  qrGuestUrl: string;
  qrSize: string;
  qrColor: string;
  qrIncludeLogo: boolean;
  qrCaption: string;
  qrExportFormat: "png" | "svg" | "pdf";
};

type GuestBookingRulesForm = {
  cancelUntilHours: string;
  rescheduleUntilHours: string;
  lateCancelConsumesCredit: boolean;
  noShowConsumesCredit: boolean;
  sameDayBankTransferAllowed: boolean;
  bankTransferReservesSlot: boolean;
  requireOnlinePayment: boolean;
  allowBankTransferFor: string[];
  allowCardFor: string[];
  minBookingNotice: string;
  maxAdvanceDays: string;
  cancellationEnabled: boolean;
  freeCancelUntilHours: string;
  autoConfirmReservation: boolean;
  bufferBeforeMinutes: string;
  bufferAfterMinutes: string;
  paymentRequirement: "none" | "deposit" | "full";
  depositPercent: string;
  noShowPolicy: string;
  refundPolicy: string;
  policyText: string;
};

type GuestAppSubtab = "general" | "bookingRules" | "paymentMethods" | "qrCode";
type WebsiteSubtab = "general" | "paymentMethods";

type WebsiteWidgetSettingsForm = {
  employeeSelectionStep: boolean;
  acceptedPaymentMethodIds: GuestPaymentMethodId[];
  paymentDefaultMethodId: GuestPaymentMethodId;
  paymentOnLocation: boolean;
};

type WebsiteBookingRulesForm = {
  paymentRequirement: GuestBookingRulesForm["paymentRequirement"];
  depositPercent: string;
};

type GuestAppAssetField = "cardImageUrl" | "logoImageUrl" | "iconImageUrl";

type StripeConnectMode = "sandbox" | "production";
type StripeConnectAccountStatus = {
  mode: StripeConnectMode | string;
  accountId: string;
  connected: boolean;
  onboardingStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsJson: string;
};
type StripeConnectTenantStatus = {
  activeMode: StripeConnectMode | string;
  country: string;
  businessType: string;
  sandbox: StripeConnectAccountStatus;
  production: StripeConnectAccountStatus;
  sandboxPlatformEnabled: boolean;
  productionPlatformEnabled: boolean;
};

const GUEST_APP_SETTINGS_KEY = "GUEST_APP_SETTINGS_JSON";
const GUEST_BOOKING_RULES_KEY = "GUEST_BOOKING_RULES_JSON";
const WEBSITE_WIDGET_SETTINGS_KEY = "WEBSITE_WIDGET_SETTINGS_JSON";
const WEBSITE_BOOKING_RULES_KEY = "WEBSITE_BOOKING_RULES_JSON";

const GUEST_PAYMENT_METHOD_OPTIONS: {
  id: GuestPaymentMethodId;
  label: string;
}[] = [
  { id: "online_card", label: "Spletno plačilo s kartico" },
  { id: "bank_transfer", label: "Bančno nakazilo" },
  { id: "paypal", label: "PayPal" },
  { id: "gift_card", label: "Darilni bon" },
];

const DEFAULT_GUEST_PAYMENT_METHOD_IDS: GuestPaymentMethodId[] = [
  "online_card",
  "bank_transfer",
  "paypal",
  "gift_card",
];

type TenantConfigType =
  | "salon"
  | "gym"
  | "therapy"
  | "spa"
  | "personal_training";

const TENANT_CONFIG_TYPE_OPTIONS: Array<{
  id: TenantConfigType;
  labelEn: string;
  labelSl: string;
}> = [
  { id: "salon", labelEn: "Salon", labelSl: "Salon" },
  { id: "gym", labelEn: "Gym", labelSl: "Fitnes" },
  { id: "therapy", labelEn: "Therapy", labelSl: "Terapija" },
  { id: "spa", labelEn: "Spa", labelSl: "Spa" },
  {
    id: "personal_training",
    labelEn: "Personal Training",
    labelSl: "Osebni trening",
  },
];

const normalizeTenantConfigType = (raw: any): TenantConfigType => {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return TENANT_CONFIG_TYPE_OPTIONS.some((option) => option.id === value)
    ? (value as TenantConfigType)
    : "salon";
};

const isGuestPaymentMethodId = (value: string): value is GuestPaymentMethodId =>
  GUEST_PAYMENT_METHOD_OPTIONS.some((option) => option.id === value);
const normalizeGuestPaymentMethods = (value: any): GuestPaymentMethodId[] => {
  if (!Array.isArray(value)) return DEFAULT_GUEST_PAYMENT_METHOD_IDS;
  const normalized = value
    .map((row) => String(row || ""))
    .filter(isGuestPaymentMethodId);
  return normalized.length > 0 ? normalized : DEFAULT_GUEST_PAYMENT_METHOD_IDS;
};

const normalizeWebsitePaymentMethods = (value: any): GuestPaymentMethodId[] => {
  if (!Array.isArray(value)) return DEFAULT_GUEST_PAYMENT_METHOD_IDS;
  return value.map((row) => String(row || "")).filter(isGuestPaymentMethodId);
};

const removeStripePaymentMethod = (
  ids: GuestPaymentMethodId[],
  fallback: GuestPaymentMethodId = "bank_transfer",
): GuestPaymentMethodId[] => {
  const filtered = ids.filter((id) => id !== "online_card");
  return filtered.length > 0 ? filtered : [fallback];
};

function guestAppSubtabs(
  t: (key: string) => string,
): { id: GuestAppSubtab; label: string }[] {
  return [
    { id: "general", label: t("configGuestSubtabGeneral") },
    { id: "bookingRules", label: t("configGuestSubtabBookingRules") },
    { id: "paymentMethods", label: t("configGuestSubtabPaymentMethods") },
    { id: "qrCode", label: t("configGuestSubtabQrCode") },
  ];
}

function websiteSubtabs(
  t: (key: string) => string,
): { id: WebsiteSubtab; label: string }[] {
  return [
    { id: "general", label: t("configGuestSubtabGeneral") },
    { id: "paymentMethods", label: t("configGuestSubtabPaymentMethods") },
  ];
}
const GUEST_PRODUCT_TYPES = [
  "SESSION_SINGLE",
  "CLASS_TICKET",
  "PACK",
  "MEMBERSHIP",
  "GIFT_CARD",
  "COURSE",
] as const;
const ALL_GUEST_PRODUCT_TYPES: string[] = [...GUEST_PRODUCT_TYPES];

const defaultGuestAppSettings = (): GuestAppSettingsForm => ({
  guestAppEnabled: true,
  walletEnabled: true,
  ordersEnabled: true,
  buyTabEnabled: true,
  entitlementsEnabled: false,
  inboxEnabled: true,
  publicDiscoverable: false,
  publicName: "",
  publicDescription: "",
  publicCity: "",
  tenantType: "salon",
  cardImageUrl: "",
  logoImageUrl: "",
  iconImageUrl: "",
  defaultLanguage: "sl",
  employeeSelectionStep: false,
  useEmployeeContact: false,
  acceptedPaymentMethodIds: DEFAULT_GUEST_PAYMENT_METHOD_IDS,
  paymentDefaultMethodId: "online_card",
  paymentCurrency: "EUR",
  paymentTaxRate: "22",
  paymentOnLocation: true,
  paymentSendInvoiceEmail: true,
  paymentCustomerDescription:
    "Sprejemamo gotovino, kartice in spletna plačila. Hvala, ker ste izbrali naše storitve!",
  paymentProvider: "stripe",
  qrGuestUrl: "",
  qrSize: "1024 x 1024",
  qrColor: "#2563EB",
  qrIncludeLogo: true,
  qrCaption: "Rezerviraj svoj termin",
  qrExportFormat: "png",
});

const defaultGuestBookingRules = (): GuestBookingRulesForm => ({
  cancelUntilHours: "24",
  rescheduleUntilHours: "12",
  lateCancelConsumesCredit: true,
  noShowConsumesCredit: true,
  sameDayBankTransferAllowed: false,
  bankTransferReservesSlot: false,
  requireOnlinePayment: true,
  allowBankTransferFor: ["PACK", "MEMBERSHIP", "GIFT_CARD"],
  allowCardFor: [
    "SESSION_SINGLE",
    "CLASS_TICKET",
    "PACK",
    "MEMBERSHIP",
    "GIFT_CARD",
  ],
  minBookingNotice: "2 uri",
  maxAdvanceDays: "60",
  cancellationEnabled: true,
  freeCancelUntilHours: "24",
  autoConfirmReservation: true,
  bufferBeforeMinutes: "15",
  bufferAfterMinutes: "10",
  paymentRequirement: "full",
  depositPercent: "20",
  noShowPolicy: "charge_deposit",
  refundPolicy: "auto_by_cancellation_deadline",
  policyText:
    "Rezervacijo lahko brezplačno odpoveste do navedenega roka pred terminom.\n\nPri kasnejši odpovedi ali no-show se zaračuna polog.\n\nPolog ni prenosljiv in se ne vrača.",
});

const defaultWebsiteWidgetSettings = (): WebsiteWidgetSettingsForm => ({
  employeeSelectionStep: false,
  acceptedPaymentMethodIds: DEFAULT_GUEST_PAYMENT_METHOD_IDS,
  paymentDefaultMethodId: "online_card",
  paymentOnLocation: true,
});

const defaultWebsiteBookingRules = (): WebsiteBookingRulesForm => ({
  paymentRequirement: "full",
  depositPercent: "20",
});

const QR_QUIET_ZONE = 4;
const QR_DATA_CODEWORDS_L: Record<number, number> = {
  1: 19,
  2: 34,
  3: 55,
  4: 80,
};
const QR_EC_CODEWORDS_L: Record<number, number> = { 1: 7, 2: 10, 3: 15, 4: 20 };

type QrMatrix = { size: number; modules: boolean[][] };

const buildQrGfTables = () => {
  const exp = new Array<number>(512).fill(0);
  const log = new Array<number>(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if ((x & 0x100) !== 0) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) exp[i] = exp[i - 255];
  return { exp, log };
};

const QR_GF = buildQrGfTables();

const qrGfMultiply = (a: number, b: number) => {
  if (a === 0 || b === 0) return 0;
  return QR_GF.exp[QR_GF.log[a] + QR_GF.log[b]];
};

const qrReedSolomonGenerator = (degree: number) => {
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(result.length + 1).fill(0);
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= qrGfMultiply(result[j], 1);
      next[j + 1] ^= qrGfMultiply(result[j], QR_GF.exp[i]);
    }
    result = next;
  }
  return result;
};

const qrReedSolomonRemainder = (data: number[], degree: number) => {
  const generator = qrReedSolomonGenerator(degree);
  const result = new Array<number>(degree).fill(0);
  data.forEach((dataByte) => {
    const factor = dataByte ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= qrGfMultiply(generator[i + 1], factor);
    }
  });
  return result;
};

const appendQrBits = (out: number[], value: number, length: number) => {
  for (let i = length - 1; i >= 0; i -= 1) out.push((value >>> i) & 1);
};

const qrPayloadBytes = (payload: string) =>
  Array.from(new TextEncoder().encode(payload));

const selectQrVersion = (bytesLength: number) => {
  for (let version = 1; version <= 4; version += 1) {
    const dataCodewords = QR_DATA_CODEWORDS_L[version];
    if (bytesLength <= Math.floor((dataCodewords * 8 - 12) / 8)) return version;
  }
  return null;
};

const makeQrDataCodewords = (payload: string, version: number) => {
  const bytes = qrPayloadBytes(payload);
  const dataCodewordCount = QR_DATA_CODEWORDS_L[version];
  const capacityBits = dataCodewordCount * 8;
  const bits: number[] = [];
  appendQrBits(bits, 0b0100, 4); // byte mode
  appendQrBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendQrBits(bits, byte, 8));
  if (bits.length > capacityBits)
    throw new Error("QR payload is too long for this QR version.");
  const terminator = Math.min(4, capacityBits - bits.length);
  appendQrBits(bits, 0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j];
    codewords.push(value);
  }
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < dataCodewordCount) {
    codewords.push(padBytes[padIndex % 2]);
    padIndex += 1;
  }
  return codewords;
};

const qrAlignmentPatternCenters: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
};

const qrMaskAt = (mask: number, x: number, y: number) => {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return false;
  }
};

const qrFormatBits = (mask: number) => {
  const eclBits = 1; // Error correction L
  const data = (eclBits << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if (((rem >>> i) & 1) !== 0) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
};

const makeQrMatrix = (payload: string): QrMatrix | null => {
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) return null;
  const bytes = qrPayloadBytes(trimmedPayload);
  const version = selectQrVersion(bytes.length);
  if (!version) return null;
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const reserved = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  const setModule = (x: number, y: number, dark: boolean, reserve = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    if (reserve) reserved[y][x] = true;
  };

  const reserveModule = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    reserved[y][x] = true;
  };

  const drawFinder = (left: number, top: number) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const x = left + dx;
        const y = top + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const dark =
          inPattern &&
          (dx === 0 ||
            dx === 6 ||
            dy === 0 ||
            dy === 6 ||
            (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setModule(x, y, dark);
      }
    }
  };

  const drawAlignment = (centerX: number, centerY: number) => {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const max = Math.max(Math.abs(dx), Math.abs(dy));
        setModule(centerX + dx, centerY + dy, max === 2 || max === 0);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  for (let i = 8; i <= size - 9; i += 1) {
    const dark = i % 2 === 0;
    setModule(i, 6, dark);
    setModule(6, i, dark);
  }

  const centers = qrAlignmentPatternCenters[version];
  centers.forEach((centerY) => {
    centers.forEach((centerX) => {
      const overlapsFinder =
        (centerX === 6 && centerY === 6) ||
        (centerX === 6 && centerY === size - 7) ||
        (centerX === size - 7 && centerY === 6);
      if (!overlapsFinder) drawAlignment(centerX, centerY);
    });
  });

  for (let i = 0; i <= 8; i += 1) {
    reserveModule(8, i);
    reserveModule(i, 8);
  }
  for (let i = size - 8; i < size; i += 1) reserveModule(i, 8);
  for (let i = size - 7; i < size; i += 1) reserveModule(8, i);
  setModule(8, size - 8, true);

  const dataCodewords = makeQrDataCodewords(trimmedPayload, version);
  const ecc = qrReedSolomonRemainder(dataCodewords, QR_EC_CODEWORDS_L[version]);
  const bits: number[] = [];
  [...dataCodewords, ...ecc].forEach((codeword) =>
    appendQrBits(bits, codeword, 8),
  );

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        if (reserved[y][x]) continue;
        modules[y][x] = (bits[bitIndex] || 0) === 1;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  const mask = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!reserved[y][x] && qrMaskAt(mask, x, y))
        modules[y][x] = !modules[y][x];
    }
  }

  const format = qrFormatBits(mask);
  const formatBit = (i: number) => ((format >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) setModule(8, i, formatBit(i));
  setModule(8, 7, formatBit(6));
  setModule(8, 8, formatBit(7));
  setModule(7, 8, formatBit(8));
  for (let i = 9; i < 15; i += 1) setModule(14 - i, 8, formatBit(i));
  for (let i = 0; i < 8; i += 1) setModule(size - 1 - i, 8, formatBit(i));
  for (let i = 8; i < 15; i += 1) setModule(8, size - 15 + i, formatBit(i));
  setModule(8, size - 8, true);

  return { size, modules };
};

const qrModulesToPath = (matrix: QrMatrix, quietZone = QR_QUIET_ZONE) =>
  matrix.modules
    .flatMap((row, y) =>
      row.map((dark, x) =>
        dark ? `M${x + quietZone} ${y + quietZone}h1v1h-1z` : "",
      ),
    )
    .filter(Boolean)
    .join("");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeDownloadPart = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "tenant";

const buildGuestQrPayloadLink = (
  configuredLink: string,
  fallbackLink: string,
  tenantCode: string,
) => {
  const safeTenantCode = (tenantCode || "2TEN").trim() || "2TEN";
  const normalizedConfigured = (configuredLink || "").trim();
  const candidate = normalizedConfigured || fallbackLink;
  const baseOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://2ten.si";
  try {
    const url = new URL(candidate, baseOrigin);
    url.searchParams.set("tenantCode", safeTenantCode);
    return url.toString();
  } catch {
    return fallbackLink;
  }
};

const parseGuestAppSettings = (
  raw: string | undefined,
): GuestAppSettingsForm => {
  if (!raw) return defaultGuestAppSettings();
  try {
    const parsed = JSON.parse(raw);
    return {
      guestAppEnabled: parsed?.guestAppEnabled !== false,
      walletEnabled: parsed?.walletEnabled !== false,
      ordersEnabled: parsed?.ordersEnabled !== false,
      buyTabEnabled: parsed?.buyTabEnabled !== false,
      entitlementsEnabled: parsed?.entitlementsEnabled === true,
      inboxEnabled: parsed?.inboxEnabled !== false,
      publicDiscoverable: parsed?.publicDiscoverable === true,
      publicName: normalizePublicName(parsed?.publicName),
      publicDescription: String(parsed?.publicDescription || ""),
      publicCity: normalizePublicCity(parsed?.publicCity),
      tenantType: normalizeTenantConfigType(parsed?.tenantType),
      cardImageUrl: String(parsed?.cardImageUrl || ""),
      logoImageUrl: String(parsed?.logoImageUrl || ""),
      iconImageUrl: String(parsed?.iconImageUrl || ""),
      defaultLanguage: parsed?.defaultLanguage === "en" ? "en" : "sl",
      employeeSelectionStep: parsed?.employeeSelectionStep === true,
      useEmployeeContact: parsed?.useEmployeeContact === true,
      acceptedPaymentMethodIds: normalizeGuestPaymentMethods(
        parsed?.acceptedPaymentMethodIds,
      ),
      paymentDefaultMethodId: isGuestPaymentMethodId(
        String(parsed?.paymentDefaultMethodId || ""),
      )
        ? parsed.paymentDefaultMethodId
        : "online_card",
      paymentCurrency: String(parsed?.paymentCurrency || "EUR"),
      paymentTaxRate: String(parsed?.paymentTaxRate ?? "22"),
      paymentOnLocation: parsed?.paymentOnLocation !== false,
      paymentSendInvoiceEmail: parsed?.paymentSendInvoiceEmail !== false,
      paymentCustomerDescription: String(
        parsed?.paymentCustomerDescription ||
          "Sprejemamo gotovino, kartice in spletna plačila. Hvala, ker ste izbrali naše storitve!",
      ),
      paymentProvider: String(parsed?.paymentProvider || "stripe"),
      qrGuestUrl: String(parsed?.qrGuestUrl || ""),
      qrSize: String(parsed?.qrSize || "1024 x 1024"),
      qrColor: normalizeGuestQrColor(parsed?.qrColor || "#2563EB"),
      qrIncludeLogo: parsed?.qrIncludeLogo !== false,
      qrCaption: String(parsed?.qrCaption || "Rezerviraj svoj termin"),
      qrExportFormat:
        parsed?.qrExportFormat === "svg" || parsed?.qrExportFormat === "pdf"
          ? parsed.qrExportFormat
          : "png",
    };
  } catch {
    return defaultGuestAppSettings();
  }
};

const parseGuestBookingRules = (
  raw: string | undefined,
): GuestBookingRulesForm => {
  if (!raw) return defaultGuestBookingRules();
  try {
    const parsed = JSON.parse(raw);
    const normalizeAllowed = (value: any, fallback: string[]) =>
      Array.isArray(value)
        ? value.map((row) => String(row || "").trim()).filter(Boolean)
        : fallback;
    return {
      cancelUntilHours: String(parsed?.cancelUntilHours ?? 24),
      rescheduleUntilHours: String(parsed?.rescheduleUntilHours ?? 12),
      lateCancelConsumesCredit: parsed?.lateCancelConsumesCredit !== false,
      noShowConsumesCredit: parsed?.noShowConsumesCredit !== false,
      sameDayBankTransferAllowed: parsed?.sameDayBankTransferAllowed === true,
      bankTransferReservesSlot: parsed?.bankTransferReservesSlot === true,
      requireOnlinePayment: parsed?.requireOnlinePayment !== false,
      allowBankTransferFor: normalizeAllowed(parsed?.allowBankTransferFor, [
        "PACK",
        "MEMBERSHIP",
        "GIFT_CARD",
      ]),
      allowCardFor: normalizeAllowed(parsed?.allowCardFor, [
        "SESSION_SINGLE",
        "CLASS_TICKET",
        "PACK",
        "MEMBERSHIP",
        "GIFT_CARD",
      ]),
      minBookingNotice: String(parsed?.minBookingNotice || "2 uri"),
      maxAdvanceDays: String(parsed?.maxAdvanceDays ?? "60"),
      cancellationEnabled: parsed?.cancellationEnabled !== false,
      freeCancelUntilHours: String(
        parsed?.freeCancelUntilHours ?? parsed?.cancelUntilHours ?? 24,
      ),
      autoConfirmReservation: parsed?.autoConfirmReservation !== false,
      bufferBeforeMinutes: String(parsed?.bufferBeforeMinutes ?? 15),
      bufferAfterMinutes: String(parsed?.bufferAfterMinutes ?? 10),
      paymentRequirement:
        parsed?.paymentRequirement === "none" ||
        parsed?.paymentRequirement === "deposit"
          ? parsed.paymentRequirement
          : "full",
      depositPercent: String(parsed?.depositPercent ?? 20),
      noShowPolicy: String(parsed?.noShowPolicy || "charge_deposit"),
      refundPolicy: String(
        parsed?.refundPolicy || "auto_by_cancellation_deadline",
      ),
      policyText: String(
        parsed?.policyText ||
          "Rezervacijo lahko brezplačno odpoveste do navedenega roka pred terminom.\n\nPri kasnejši odpovedi ali no-show se zaračuna polog.\n\nPolog ni prenosljiv in se ne vrača.",
      ),
    };
  } catch {
    return defaultGuestBookingRules();
  }
};

const normalizeBookingRulesForPaymentLocation = (
  rules: GuestBookingRulesForm,
  paymentOnLocation: boolean,
): GuestBookingRulesForm => {
  if (paymentOnLocation) {
    return {
      ...rules,
      paymentRequirement: "none",
      requireOnlinePayment: false,
    };
  }
  const nextRequirement =
    rules.paymentRequirement === "none" ? "full" : rules.paymentRequirement;
  return {
    ...rules,
    paymentRequirement: nextRequirement,
    requireOnlinePayment: true,
  };
};

const parseWebsiteWidgetSettings = (
  raw: string | undefined,
): WebsiteWidgetSettingsForm => {
  if (!raw) return defaultWebsiteWidgetSettings();
  try {
    const parsed = JSON.parse(raw);
    return {
      employeeSelectionStep: parsed?.employeeSelectionStep === true,
      acceptedPaymentMethodIds: normalizeWebsitePaymentMethods(
        parsed?.acceptedPaymentMethodIds,
      ),
      paymentDefaultMethodId: isGuestPaymentMethodId(
        String(parsed?.paymentDefaultMethodId || ""),
      )
        ? parsed.paymentDefaultMethodId
        : "online_card",
      paymentOnLocation: parsed?.paymentOnLocation !== false,
    };
  } catch {
    return defaultWebsiteWidgetSettings();
  }
};

const parseWebsiteBookingRules = (
  raw: string | undefined,
): WebsiteBookingRulesForm => {
  if (!raw) return defaultWebsiteBookingRules();
  try {
    const parsed = JSON.parse(raw);
    return {
      paymentRequirement:
        parsed?.paymentRequirement === "none" ||
        parsed?.paymentRequirement === "deposit"
          ? parsed.paymentRequirement
          : "full",
      depositPercent: String(parsed?.depositPercent ?? 20),
    };
  } catch {
    return defaultWebsiteBookingRules();
  }
};

const normalizeWebsiteSettingsForPaymentLocation = (
  settings: WebsiteWidgetSettingsForm,
): WebsiteWidgetSettingsForm => {
  if (settings.paymentOnLocation) {
    return { ...settings, acceptedPaymentMethodIds: [] };
  }

  const acceptedPaymentMethodIds = normalizeWebsitePaymentMethods(
    settings.acceptedPaymentMethodIds,
  );
  const fallbackMethodId = isGuestPaymentMethodId(
    String(settings.paymentDefaultMethodId || ""),
  )
    ? settings.paymentDefaultMethodId
    : "online_card";
  const nextAcceptedPaymentMethodIds =
    acceptedPaymentMethodIds.length > 0
      ? acceptedPaymentMethodIds
      : [fallbackMethodId];
  const paymentDefaultMethodId = nextAcceptedPaymentMethodIds.includes(
    settings.paymentDefaultMethodId,
  )
    ? settings.paymentDefaultMethodId
    : nextAcceptedPaymentMethodIds[0];

  return {
    ...settings,
    acceptedPaymentMethodIds: nextAcceptedPaymentMethodIds,
    paymentDefaultMethodId,
  };
};

const normalizeWebsiteBookingRulesForPaymentLocation = (
  rules: WebsiteBookingRulesForm,
  paymentOnLocation: boolean,
): WebsiteBookingRulesForm => {
  if (paymentOnLocation) {
    return { ...rules, paymentRequirement: "none" };
  }

  const nextRequirement =
    rules.paymentRequirement === "none" ? "full" : rules.paymentRequirement;
  return { ...rules, paymentRequirement: nextRequirement };
};

const serializeWebsiteWidgetSettings = (value: WebsiteWidgetSettingsForm) => {
  const normalized = normalizeWebsiteSettingsForPaymentLocation(value);
  return JSON.stringify({
    employeeSelectionStep: normalized.employeeSelectionStep,
    acceptedPaymentMethodIds: normalized.acceptedPaymentMethodIds,
    paymentDefaultMethodId: normalized.paymentDefaultMethodId,
    paymentOnLocation: normalized.paymentOnLocation,
  });
};

const serializeWebsiteBookingRules = (value: WebsiteBookingRulesForm) =>
  JSON.stringify({
    requireOnlinePayment: value.paymentRequirement !== "none",
    paymentRequirement: value.paymentRequirement,
    depositPercent: String(value.depositPercent || "20").trim() || "20",
    allowBankTransferFor: [
      "SESSION_SINGLE",
      "CLASS_TICKET",
      "PACK",
      "MEMBERSHIP",
      "GIFT_CARD",
    ],
    allowCardFor: [
      "SESSION_SINGLE",
      "CLASS_TICKET",
      "PACK",
      "MEMBERSHIP",
      "GIFT_CARD",
    ],
    allowPaypalFor: [
      "SESSION_SINGLE",
      "CLASS_TICKET",
      "PACK",
      "MEMBERSHIP",
      "GIFT_CARD",
    ],
  });

const serializeGuestAppSettings = (value: GuestAppSettingsForm) =>
  JSON.stringify({
    guestAppEnabled: value.guestAppEnabled,
    walletEnabled: value.walletEnabled,
    ordersEnabled: value.ordersEnabled,
    buyTabEnabled: value.buyTabEnabled,
    entitlementsEnabled: value.entitlementsEnabled,
    inboxEnabled: value.inboxEnabled,
    publicDiscoverable: value.publicDiscoverable,
    publicName: normalizePublicName(value.publicName).trim(),
    publicDescription: normalizePublicDescription(value.publicDescription),
    publicCity: normalizePublicCity(value.publicCity).trim(),
    tenantType: normalizeTenantConfigType(value.tenantType),
    cardImageUrl: value.cardImageUrl.trim(),
    logoImageUrl: value.logoImageUrl.trim(),
    iconImageUrl: value.iconImageUrl.trim(),
    defaultLanguage: value.defaultLanguage,
    employeeSelectionStep: value.employeeSelectionStep,
    useEmployeeContact: value.useEmployeeContact,
    acceptedPaymentMethodIds: normalizeWebsitePaymentMethods(
      value.acceptedPaymentMethodIds,
    ),
    paymentDefaultMethodId: isGuestPaymentMethodId(
      String(value.paymentDefaultMethodId || ""),
    )
      ? value.paymentDefaultMethodId
      : "online_card",
    paymentCurrency: value.paymentCurrency.trim() || "EUR",
    paymentTaxRate: value.paymentTaxRate.trim(),
    paymentOnLocation: value.paymentOnLocation,
    paymentSendInvoiceEmail: value.paymentSendInvoiceEmail,
    paymentCustomerDescription: value.paymentCustomerDescription.trim(),
    paymentProvider: value.paymentProvider.trim() || "stripe",
    qrGuestUrl: value.qrGuestUrl.trim(),
    qrSize: value.qrSize.trim() || "1024 x 1024",
    qrColor: normalizeGuestQrColor(value.qrColor),
    qrIncludeLogo: value.qrIncludeLogo,
    qrCaption: value.qrCaption.trim(),
    qrExportFormat: value.qrExportFormat,
  });

const serializeGuestBookingRules = (value: GuestBookingRulesForm) =>
  JSON.stringify({
    cancelUntilHours: Math.max(
      0,
      Number(value.freeCancelUntilHours || value.cancelUntilHours || 0),
    ),
    rescheduleUntilHours: Math.max(0, Number(value.rescheduleUntilHours || 0)),
    lateCancelConsumesCredit: value.lateCancelConsumesCredit,
    noShowConsumesCredit: value.noShowConsumesCredit,
    sameDayBankTransferAllowed: value.sameDayBankTransferAllowed,
    bankTransferReservesSlot: value.bankTransferReservesSlot,
    requireOnlinePayment: value.paymentRequirement !== "none",
    allowBankTransferFor: value.allowBankTransferFor,
    allowCardFor: value.allowCardFor,
    minBookingNotice: value.minBookingNotice.trim(),
    maxAdvanceDays: value.maxAdvanceDays.trim(),
    cancellationEnabled: value.cancellationEnabled,
    freeCancelUntilHours: value.freeCancelUntilHours.trim(),
    autoConfirmReservation: value.autoConfirmReservation,
    bufferBeforeMinutes: value.bufferBeforeMinutes.trim(),
    bufferAfterMinutes: value.bufferAfterMinutes.trim(),
    paymentRequirement: value.paymentRequirement,
    depositPercent: value.depositPercent.trim(),
    noShowPolicy: value.noShowPolicy,
    refundPolicy: value.refundPolicy,
    policyText: value.policyText.trim(),
  });

type ModulesDraft = {
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

type ModulesStringKey = {
  [K in keyof ModulesDraft]: ModulesDraft[K] extends string
    ? K extends "MODULE_CONFIG_TYPE"
      ? never
      : K
    : never;
}[keyof ModulesDraft];
type ModulesBooleanKey = {
  [K in keyof ModulesDraft]: ModulesDraft[K] extends boolean ? K : never;
}[keyof ModulesDraft];

const PLATFORM_MODULE_VISIBILITY_RULES_KEY =
  "PLATFORM_MODULE_VISIBILITY_RULES_JSON";
type ModuleVisibilityPackage = "BASIC" | "PROFESSIONAL" | "PREMIUM";
type ModuleVisibilityRuleKey = ModulesStringKey | ModulesBooleanKey;
type ModuleVisibilityRule = {
  minPackage: ModuleVisibilityPackage;
  configType: TenantConfigType | "";
};
type ModuleVisibilityRules = Partial<
  Record<ModuleVisibilityRuleKey, ModuleVisibilityRule>
>;

const MODULE_VISIBILITY_PACKAGES: Array<{
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

const normalizeModuleVisibilityPackage = (
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

const normalizeOptionalModuleConfigType = (
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

const parseModuleVisibilityRules = (raw: string | undefined) => {
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

const serializeModuleVisibilityRules = (rules: ModuleVisibilityRules) =>
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

const getModuleVisibilityRule = (
  rules: ModuleVisibilityRules,
  key: ModuleVisibilityRuleKey,
): ModuleVisibilityRule => rules[key] || defaultModuleVisibilityRule(key);

const moduleVisibilityAllowed = (
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

const buildModulesDraftFromCommitted = (
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

type ModulesPresetPackage = "BASIC" | "PROFESSIONAL" | "PREMIUM";
type ModulesPresetValue = "on" | "off" | "coming_soon";

const modulePackageRank = (raw?: string | null) => {
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

const normalizeModulesDraftDependencies = (
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
  MULTIPLE_CLIENTS_PER_SESSION_ENABLED:
    draft.GROUP_BOOKING_ENABLED === "true" &&
    draft.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === "true"
      ? "true"
      : "false",
});

const applyModuleConfigPreset = (
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

const modulesDraftToSettingsPatch = (
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

export function ConfigurationPage() {
  const me = getStoredUser()!;
  const isAdmin = me.role === "ADMIN" || me.role === "SUPER_ADMIN";
  const navigate = useNavigate();
  const query = useQuery();
  const { t, locale } = useLocale();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>("company");
  const [accountSubtab, setAccountSubtab] = useState<
    "company" | "receivedInvoices" | "subscription" | "security"
  >("company");
  const [accountReceivedInvoices, setAccountReceivedInvoices] = useState<
    AccountReceivedInvoice[]
  >([]);
  const [accountReceivedInvoicesLoading, setAccountReceivedInvoicesLoading] =
    useState(false);
  const [subscriptionPackage, setSubscriptionPackage] =
    useState<AccountPlanPackageKey>("PROFESSIONAL");
  const [subscriptionBillingInterval, setSubscriptionBillingInterval] =
    useState<AccountSubscriptionInterval>("MONTHLY");
  const [accountRegisterCatalog, setAccountRegisterCatalog] =
    useState<AccountRegisterCatalog>(DEFAULT_ACCOUNT_REGISTER_CATALOG);
  const [tenantUsersCount, setTenantUsersCount] = useState(1);
  const [extraUsersAddonEnabled, setExtraUsersAddonEnabled] = useState(true);
  const [smsAddonEnabled, setSmsAddonEnabled] = useState(true);
  const [extraUsersCount, setExtraUsersCount] = useState(5);
  const [smsPackCount, setSmsPackCount] = useState(0);
  const [currentCycleUserAddCount, setCurrentCycleUserAddCount] = useState(0);
  const [nextCycleUserLimit, setNextCycleUserLimit] = useState(1);
  const [currentCycleSmsAddCount, setCurrentCycleSmsAddCount] = useState(0);
  const [nextCycleSmsCount, setNextCycleSmsCount] = useState(0);
  const [currentCycleAddonKeys, setCurrentCycleAddonKeys] = useState<string[]>(
    [],
  );
  const [nextCycleAddonKeys, setNextCycleAddonKeys] = useState<string[]>([]);
  const [savingSubscriptionAddons, setSavingSubscriptionAddons] =
    useState(false);
  const [packageChangeTarget, setPackageChangeTarget] =
    useState<AccountPlanPackageKey | null>(null);
  const [savingPackageChange, setSavingPackageChange] = useState(false);
  const [accountPlanDetailsOpen, setAccountPlanDetailsOpen] = useState(false);
  const [bookingSubtab, setBookingSubtab] = useState<BookingSubtab>("spaces");
  const [billingSubtab, setBillingSubtab] =
    useState<BillingSubtab>("paymentMethods");
  const [integrationSubtab, setIntegrationSubtab] =
    useState<IntegrationSubtab>("status");
  const [expandedIntegrationCard, setExpandedIntegrationCard] = useState<
    "stripe" | "googleCalendar" | null
  >(null);
  const [guestAppSubtab, setGuestAppSubtab] =
    useState<GuestAppSubtab>("general");
  const [websiteSubtab, setWebsiteSubtab] = useState<WebsiteSubtab>("general");
  const [startingPaypalOnboarding, setStartingPaypalOnboarding] =
    useState(false);
  const [startingStripeOnboarding, setStartingStripeOnboarding] =
    useState(false);
  const [refreshingStripeStatus, setRefreshingStripeStatus] = useState(false);
  const [stripeConnectStatus, setStripeConnectStatus] =
    useState<StripeConnectTenantStatus | null>(null);
  const [googleCalendarStatusLoading, setGoogleCalendarStatusLoading] =
    useState(false);
  const [googleCalendarConnections, setGoogleCalendarConnections] = useState<
    IntegrationGoogleCalendarConnection[]
  >([]);
  const [googleCalendarConflictCount, setGoogleCalendarConflictCount] =
    useState(0);

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfileForm[]>(
    [],
  );
  const [selectedCompanyProfileId, setSelectedCompanyProfileId] =
    useState<string>("");
  const [companyProfilesInitialized, setCompanyProfilesInitialized] =
    useState(false);
  const [companyProfileMenuOpenId, setCompanyProfileMenuOpenId] = useState<
    string | null
  >(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingGuestAsset, setUploadingGuestAsset] =
    useState<GuestAppAssetField | null>(null);
  const [guestAppSettings, setGuestAppSettings] =
    useState<GuestAppSettingsForm>(defaultGuestAppSettings);
  const [guestBookingRules, setGuestBookingRules] =
    useState<GuestBookingRulesForm>(defaultGuestBookingRules);
  const [websiteSettings, setWebsiteSettings] =
    useState<WebsiteWidgetSettingsForm>(defaultWebsiteWidgetSettings);
  const [websiteBookingRules, setWebsiteBookingRules] =
    useState<WebsiteBookingRulesForm>(defaultWebsiteBookingRules);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [editingSpaceId, setEditingSpaceId] = useState<number | null>(null);
  const [spaceEditDraft, setSpaceEditDraft] = useState({
    name: "",
    description: "",
  });
  const [newSpaceDrafts, setNewSpaceDrafts] = useState<
    Array<{ tempId: string; name: string; description: string }>
  >([]);
  const [openSpaceMenuId, setOpenSpaceMenuId] = useState<number | null>(null);
  const [personalTaskPresets, setPersonalTaskPresets] = useState<
    PersonalTaskPreset[]
  >([]);
  const [showTaskPresetModal, setShowTaskPresetModal] = useState(false);
  const [editingTaskPresetId, setEditingTaskPresetId] = useState<string | null>(
    null,
  );
  const [savingTaskPreset, setSavingTaskPreset] = useState(false);
  const [taskPresetForm, setTaskPresetForm] = useState<{
    name: string;
    color: string;
  }>({ name: "", color: DEFAULT_PERSONAL_TASK_COLOR });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [inlineEditingPaymentMethodId, setInlineEditingPaymentMethodId] =
    useState<number | null>(null);
  const [inlinePaymentMethodForm, setInlinePaymentMethodForm] = useState<{
    name: string;
    paymentType: PaymentType;
    fiscalized: boolean;
    stripeEnabled: boolean;
    widgetEnabled: boolean;
    guestDisplayOrder: number;
  } | null>(null);
  const [registeringPremise, setRegisteringPremise] = useState(false);
  const [premiseRegisterResult, setPremiseRegisterResult] =
    useState<string>("");
  const [certificateMeta, setCertificateMeta] = useState<{
    uploaded: boolean;
    fileName?: string;
    uploadedAt?: string;
    expiresAt?: string;
  } | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [registeringPremiseId, setRegisteringPremiseId] = useState<
    string | null
  >(null);
  const [premisePickerOpen, setPremisePickerOpen] = useState(false);
  const [inboxGlobalCapabilities, setInboxGlobalCapabilities] =
    useState<InboxGlobalCapabilities>({
      whatsappEnabled: false,
      viberEnabled: false,
    });
  const [paymentGlobalCapabilities, setPaymentGlobalCapabilities] =
    useState<PaymentGlobalCapabilities>({
      stripeEnabled: false,
      paypalEnabled: false,
    });
  const [inboxCapabilitiesLoaded, setInboxCapabilitiesLoaded] = useState(false);
  const [paymentCapabilitiesLoaded, setPaymentCapabilitiesLoaded] =
    useState(false);
  const [modulesDraft, setModulesDraft] = useState<ModulesDraft | null>(null);
  const [expandedModuleRows, setExpandedModuleRows] = useState<string[]>(
    DEFAULT_EXPANDED_MODULE_ROWS,
  );
  const prevTabRef = useRef<Tab>(tab);
  const tabRef = useRef<Tab>(tab);
  tabRef.current = tab;
  const [isCompactConfigViewport, setIsCompactConfigViewport] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 920px)").matches
      : false,
  );

  const selectedCompanyProfile =
    companyProfiles.find(
      (profile) => profile.id === selectedCompanyProfileId,
    ) || companyProfiles[0];
  const companyTenantType = normalizeTenantConfigType(
    settings.MODULE_CONFIG_TYPE || guestAppSettings.tenantType,
  );
  const isPlatformAdminTenant = me.role === "SUPER_ADMIN";
  const moduleVisibilityRules = useMemo(
    () =>
      parseModuleVisibilityRules(
        settings[PLATFORM_MODULE_VISIBILITY_RULES_KEY],
      ),
    [settings],
  );

  const activeSubscriptionPackage = useMemo<AccountPlanPackageKey>(() => {
    const configured = normalizePackageType(
      settings.SIGNUP_PACKAGE_NAME || me.packageType || subscriptionPackage,
    );
    if (
      configured === "BASIC" ||
      configured === "PROFESSIONAL" ||
      configured === "PREMIUM"
    )
      return configured;
    return "PROFESSIONAL";
  }, [settings.SIGNUP_PACKAGE_NAME, me.packageType, subscriptionPackage]);

  useEffect(() => {
    setSubscriptionPackage(activeSubscriptionPackage);
  }, [activeSubscriptionPackage]);

  const setModuleVisibilityRule = (
    key: ModuleVisibilityRuleKey,
    patch: Partial<ModuleVisibilityRule>,
  ) => {
    setSettings((prev) => {
      const current = parseModuleVisibilityRules(
        prev[PLATFORM_MODULE_VISIBILITY_RULES_KEY],
      );
      const nextRule = {
        ...getModuleVisibilityRule(current, key),
        ...patch,
      };
      const next = {
        ...current,
        [key]: {
          minPackage: normalizeModuleVisibilityPackage(nextRule.minPackage),
          configType: normalizeOptionalModuleConfigType(nextRule.configType),
        },
      };
      return {
        ...prev,
        [PLATFORM_MODULE_VISIBILITY_RULES_KEY]:
          serializeModuleVisibilityRules(next),
      };
    });
  };

  const moduleVisibilityControl = (
    key: ModuleVisibilityRuleKey,
  ): ReactNode => {
    if (!isPlatformAdminTenant) return null;
    const rule = getModuleVisibilityRule(moduleVisibilityRules, key);
    return (
      <div className="modules-design-visibility-controls">
        <label>
          <span>{locale === "sl" ? "Min. paket" : "Min. package"}</span>
          <select
            value={rule.minPackage}
            onChange={(event) =>
              setModuleVisibilityRule(key, {
                minPackage: normalizeModuleVisibilityPackage(
                  event.target.value,
                ),
              })
            }
          >
            {MODULE_VISIBILITY_PACKAGES.map((option) => (
              <option key={option.id} value={option.id}>
                {locale === "sl" ? option.labelSl : option.labelEn}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{locale === "sl" ? "Tip podjetja" : "Config type"}</span>
          <select
            value={rule.configType}
            onChange={(event) =>
              setModuleVisibilityRule(key, {
                configType: normalizeOptionalModuleConfigType(
                  event.target.value,
                ),
              })
            }
          >
            <option value="">{locale === "sl" ? "Vsi tipi" : "All types"}</option>
            {TENANT_CONFIG_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {locale === "sl" ? option.labelSl : option.labelEn}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  const moduleVisibilityProps = (
    key: ModuleVisibilityRuleKey,
  ): Pick<ModulesDesignLine, "hidden" | "visibilityControl"> => ({
    hidden:
      !isPlatformAdminTenant &&
      !moduleVisibilityAllowed(
        moduleVisibilityRules,
        key,
        activeSubscriptionPackage,
        companyTenantType,
      ),
    visibilityControl: moduleVisibilityControl(key),
  });

  const accountCatalogAnnualDiscount = positiveAccountNumber(
    accountRegisterCatalog.annualDiscountPercent,
    DEFAULT_ACCOUNT_REGISTER_CATALOG.annualDiscountPercent || 0,
  );
  const accountCatalogAnnualFactor = Math.max(
    0,
    1 - accountCatalogAnnualDiscount / 100,
  );
  const accountPlanCatalog = useMemo(() => {
    const plans =
      accountRegisterCatalog.plans || DEFAULT_ACCOUNT_REGISTER_CATALOG.plans;
    const basicMonthly = roundAccountMoney(
      positiveAccountNumber(
        plans.basic,
        DEFAULT_ACCOUNT_REGISTER_CATALOG.plans.basic,
      ),
    );
    const professionalMonthly = roundAccountMoney(
      positiveAccountNumber(
        plans.pro,
        DEFAULT_ACCOUNT_REGISTER_CATALOG.plans.pro,
      ),
    );
    const premiumMonthly = roundAccountMoney(
      positiveAccountNumber(
        plans.business,
        DEFAULT_ACCOUNT_REGISTER_CATALOG.plans.business,
      ),
    );
    const annual = (monthly: number) =>
      roundAccountMoney(monthly * 12 * accountCatalogAnnualFactor);
    const catalogLocale = locale === "sl" ? "sl" : "en";
    return {
      BASIC: {
        label: accountPlanLabel(accountRegisterCatalog, "basic", catalogLocale),
        subtitle: "Za manjše nastanitve",
        monthly: basicMonthly,
        annual: annual(basicMonthly),
        icon: "leaf",
        features: ["Do 2 nastanitvi", "Osnovni moduli", "Email podpora"],
      },
      PROFESSIONAL: {
        label: accountPlanLabel(accountRegisterCatalog, "pro", catalogLocale),
        subtitle: "Za rastoča podjetja",
        monthly: professionalMonthly,
        annual: annual(professionalMonthly),
        icon: "star",
        features: [
          "Do 10 nastanitev",
          "Napredni moduli",
          "Prednostna podpora",
          "Poročila in analitika",
        ],
      },
      PREMIUM: {
        label: accountPlanLabel(
          accountRegisterCatalog,
          "business",
          catalogLocale,
        ),
        subtitle: "Za večje verige",
        monthly: premiumMonthly,
        annual: annual(premiumMonthly),
        icon: "crown",
        features: [
          "Neomejeno nastanitev",
          "Vsi moduli",
          "Prioritetna podpora 24/7",
          "Namenski skrbnik",
        ],
      },
    };
  }, [accountCatalogAnnualFactor, accountRegisterCatalog, locale]);

  const accountPlanDetailsFeatures = useMemo<
    AccountPlanDetailsFeature[]
  >(() => {
    const rawItems =
      Array.isArray(accountRegisterCatalog.featureItems) &&
      accountRegisterCatalog.featureItems.length > 0
        ? accountRegisterCatalog.featureItems
        : DEFAULT_ACCOUNT_REGISTER_CATALOG.featureItems || [];
    return rawItems
      .filter((item) => item && item.active !== false)
      .map((item, index) => {
        const key =
          normalizeAccountAddonKey(item.key || `feature-${index + 1}`) ||
          `feature-${index + 1}`;
        const name =
          locale === "sl"
            ? item.nameSl || item.name || key
            : item.name || item.nameSl || key;
        const description =
          locale === "sl"
            ? item.descriptionSl || item.description || ""
            : item.description || item.descriptionSl || "";
        return {
          key,
          index: index + 1,
          name,
          description,
          minPlan: normalizeAccountRegisterPlanKey(item.minPlan, "pro"),
        };
      });
  }, [accountRegisterCatalog.featureItems, locale]);

  const accountReceivedInvoiceMetrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const unpaidGross = accountReceivedInvoices.reduce((sum, invoice) => {
      const status = String(invoice.paymentStatus || "").toUpperCase();
      if (status === "PAID" || status === "CANCELLED") return sum;
      return (
        sum + Number(invoice.pendingPaymentGross ?? invoice.totalGross ?? 0)
      );
    }, 0);
    const paidThisMonth = accountReceivedInvoices.reduce((sum, invoice) => {
      const status = String(invoice.paymentStatus || "").toUpperCase();
      if (status !== "PAID") return sum;
      const paidDate = invoice.paidAt ? new Date(invoice.paidAt) : null;
      if (!paidDate || Number.isNaN(paidDate.getTime())) return sum;
      return paidDate.getMonth() === currentMonth &&
        paidDate.getFullYear() === currentYear
        ? sum + Number(invoice.totalGross ?? 0)
        : sum;
    }, 0);
    const firstIssuer = accountReceivedInvoices.find(
      (invoice) => invoice.issuerName || invoice.issuerTenantCode,
    );
    const issuerLabel =
      [firstIssuer?.issuerTenantCode, firstIssuer?.issuerName]
        .filter(Boolean)
        .join(" – ") || "Platform Admin";
    return {
      totalCount: accountReceivedInvoices.length,
      unpaidGross,
      paidThisMonth,
      issuerLabel,
    };
  }, [accountReceivedInvoices]);

  const buildAccountReceivedInvoicePdfUrl = (
    invoiceId: number,
    inline = false,
  ) => {
    const base = String(api.defaults.baseURL || "").replace(/\/+$/, "");
    const suffix = `/account-management/received-invoices/${invoiceId}/pdf${inline ? "?inline=true" : ""}`;
    return `${base}${suffix}`;
  };

  const accountReceivedInvoiceStatusLabel = (
    invoice: AccountReceivedInvoice,
  ) => {
    const status = String(invoice.paymentStatus || "").toUpperCase();
    if (status === "PAID") return "Plačano";
    if (status === "PARTIAL") return "Delno plačano";
    if (status === "CANCELLED") return "Preklicano";
    return "V plačilo";
  };

  const accountReceivedInvoiceStatusClass = (
    invoice: AccountReceivedInvoice,
  ) => {
    const status = String(invoice.paymentStatus || "").toUpperCase();
    if (status === "PAID") return "success";
    if (status === "CANCELLED") return "danger";
    return "warning";
  };

  const accountReceivedInvoiceTypeLabel = (invoice: AccountReceivedInvoice) => {
    const type = String(invoice.billType || "").toUpperCase();
    if (type === "ADVANCE") return "Avansni račun";
    return "Račun";
  };

  const formatAccountEuro = (value: number) =>
    new Intl.NumberFormat(locale === "sl" ? "sl-SI" : "en-US", {
      style: "currency",
      currency: "EUR",
    }).format(value);

  const activePlanDetails =
    accountPlanCatalog[subscriptionPackage] || accountPlanCatalog.PROFESSIONAL;
  const subscriptionInterval = subscriptionBillingInterval;
  const subscriptionPeriodLabel =
    subscriptionInterval === "YEARLY" ? "leto" : "mesec";
  const subscriptionPeriodSummaryLabel =
    subscriptionInterval === "YEARLY" ? "Skupaj letno" : "Skupaj mesečno";
  const planPeriodAmount =
    subscriptionInterval === "YEARLY"
      ? activePlanDetails.annual
      : activePlanDetails.monthly;
  const accountPlanDetailsPlanKey =
    accountPackageToRegisterPlanKey(subscriptionPackage);
  const accountPlanDetailsRank = accountRegisterPlanRank(
    accountPlanDetailsPlanKey,
  );
  const accountPlanDetailsPrice =
    subscriptionInterval === "YEARLY"
      ? `${formatAccountEuro(planPeriodAmount)} / leto`
      : `${formatAccountEuro(planPeriodAmount)} / mes.`;
  const accountPlanDetailsBillingLabel =
    subscriptionInterval === "YEARLY"
      ? "Letno obračunavanje"
      : "Mesečno obračunavanje";
  const additionalUserUnitMonthly = roundAccountMoney(
    positiveAccountNumber(
      accountRegisterCatalog.additionalUserMonthly ??
        accountRegisterCatalog.usagePrices?.additionalUserMonthly,
      DEFAULT_ACCOUNT_REGISTER_CATALOG.additionalUserMonthly || 0,
    ),
  );
  const smsUnitPrice = positiveAccountNumber(
    accountRegisterCatalog.smsPerMessage ??
      accountRegisterCatalog.usagePrices?.smsPerMessage,
    DEFAULT_ACCOUNT_REGISTER_CATALOG.smsPerMessage || 0,
  );
  const usersAddonUnitPrice =
    subscriptionInterval === "YEARLY"
      ? roundAccountMoney(
          additionalUserUnitMonthly * 12 * accountCatalogAnnualFactor,
        )
      : additionalUserUnitMonthly;
  const smsAddonUnitPrice =
    subscriptionInterval === "YEARLY"
      ? roundAccountMoney(smsUnitPrice * 12)
      : smsUnitPrice;
  const activeAccountAddonItems = useMemo(() => {
    const fromItems = Array.isArray(accountRegisterCatalog.addonItems)
      ? accountRegisterCatalog.addonItems
      : [];
    const catalogItems = fromItems
      .filter((item) => item && item.active !== false)
      .map((item) => {
        const key = normalizeAccountAddonKey(item.key);
        if (!key) return null;
        return {
          key,
          name:
            locale === "sl"
              ? item.nameSl || item.name || key
              : item.name || item.nameSl || key,
          description:
            locale === "sl"
              ? item.descriptionSl || item.description || ""
              : item.description || item.descriptionSl || "",
          monthly: roundAccountMoney(
            positiveAccountNumber(
              item.monthly,
              accountRegisterCatalog.addons?.[key] ?? 0,
            ),
          ),
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      name: string;
      description: string;
      monthly: number;
    }>;
    if (catalogItems.length > 0) return catalogItems;
    return Object.entries(accountRegisterCatalog.addons || {})
      .map(([rawKey, amount]) => {
        const key = normalizeAccountAddonKey(rawKey);
        return key
          ? {
              key,
              name: key.replace(/-/g, " "),
              description: "",
              monthly: roundAccountMoney(positiveAccountNumber(amount, 0)),
            }
          : null;
      })
      .filter(Boolean) as Array<{
      key: string;
      name: string;
      description: string;
      monthly: number;
    }>;
  }, [
    accountRegisterCatalog.addonItems,
    accountRegisterCatalog.addons,
    locale,
  ]);
  const addonUnitPeriodPrice = (addon: { monthly: number }) =>
    subscriptionInterval === "YEARLY"
      ? roundAccountMoney(addon.monthly * 12 * accountCatalogAnnualFactor)
      : roundAccountMoney(addon.monthly);
  const currentBaseAddonKeys = parseAccountAddonKeyCsv(
    settings.SIGNUP_ADDON_KEYS,
  );
  const currentEffectiveAddonKeys = Array.from(
    new Set([...currentBaseAddonKeys, ...currentCycleAddonKeys]),
  );
  const nextInvoiceAddonKeys = nextCycleAddonKeys;
  const currentCycleAddonAmount = roundAccountMoney(
    activeAccountAddonItems
      .filter((addon) => currentCycleAddonKeys.includes(addon.key))
      .reduce((sum, addon) => sum + addonUnitPeriodPrice(addon), 0),
  );
  const nextCycleAddonAmount = roundAccountMoney(
    activeAccountAddonItems
      .filter((addon) => nextInvoiceAddonKeys.includes(addon.key))
      .reduce((sum, addon) => sum + addonUnitPeriodPrice(addon), 0),
  );
  const currentUserCount = Math.max(1, tenantUsersCount);
  const currentPaidUserLimit = Math.max(1, extraUsersCount, currentUserCount);
  const minimumCurrentCycleUserAdd = Math.max(
    0,
    currentUserCount - currentPaidUserLimit,
  );
  const currentBillingCycleUserAdd = Math.max(
    minimumCurrentCycleUserAdd,
    currentCycleUserAddCount,
  );
  const currentEffectiveUserLimit = Math.max(
    currentUserCount,
    currentPaidUserLimit + currentBillingCycleUserAdd,
  );
  const nextInvoiceUserLimit = Math.max(
    1,
    currentUserCount,
    nextCycleUserLimit,
  );
  const currentPaidSmsLimit = Math.max(0, smsPackCount);
  const currentSmsUsage = positiveAccountInteger(
    settings.TENANCY_SMS_SENT_COUNT,
    0,
  );
  const minimumCurrentCycleSmsAdd = Math.max(
    0,
    currentSmsUsage - currentPaidSmsLimit,
  );
  const currentBillingCycleSmsAdd = Math.max(
    minimumCurrentCycleSmsAdd,
    currentCycleSmsAddCount,
  );
  const currentEffectiveSmsLimit = Math.max(
    currentSmsUsage,
    currentPaidSmsLimit + currentBillingCycleSmsAdd,
  );
  const nextInvoiceSmsCount = Math.max(0, nextCycleSmsCount);
  const selectedExtraUsersCount = nextInvoiceUserLimit;
  const billableNextInvoiceUsers = Math.max(0, selectedExtraUsersCount - 1);
  const selectedSmsCount = nextInvoiceSmsCount;
  const usersAddonAmount = roundAccountMoney(
    billableNextInvoiceUsers * usersAddonUnitPrice,
  );
  const smsAddonAmount = roundAccountMoney(
    selectedSmsCount * smsAddonUnitPrice,
  );
  const currentCycleUserAddonAmount = roundAccountMoney(
    currentBillingCycleUserAdd * usersAddonUnitPrice,
  );
  const currentCycleSmsAddonAmount = roundAccountMoney(
    currentBillingCycleSmsAdd * smsAddonUnitPrice,
  );
  const subscriptionSubtotal = roundAccountMoney(
    planPeriodAmount +
      usersAddonAmount +
      smsAddonAmount +
      currentCycleUserAddonAmount +
      currentCycleSmsAddonAmount +
      nextCycleAddonAmount +
      currentCycleAddonAmount,
  );
  const subscriptionVat = roundAccountMoney(subscriptionSubtotal * 0.22);
  const pendingNextPackageKey = useMemo<AccountPlanPackageKey | null>(() => {
    const normalized = normalizePackageType(
      (settings.BILLING_SUBSCRIPTION_NEXT_PACKAGE_NAME || "").trim(),
    );
    return normalized === "BASIC" ||
      normalized === "PROFESSIONAL" ||
      normalized === "PREMIUM"
      ? normalized
      : null;
  }, [settings.BILLING_SUBSCRIPTION_NEXT_PACKAGE_NAME]);
  const pendingUpgradeDiff = roundAccountMoney(
    Math.max(
      0,
      positiveAccountNumber(
        settings.BILLING_SUBSCRIPTION_UPGRADE_DIFF_AMOUNT,
        0,
      ),
    ),
  );
  const estimatedNextInvoice = roundAccountMoney(
    subscriptionSubtotal + subscriptionVat + pendingUpgradeDiff,
  );
  const accountUserLimit = currentEffectiveUserLimit;
  const accountSmsLimit = currentEffectiveSmsLimit;
  const companyOverviewCreatedAt = me.createdAt || "2024-03-15T00:00:00Z";
  const companyOverviewUpdatedAt = "2024-05-24T00:00:00Z";
  const companyOwnerName =
    [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
    "Sašo Admin";

  const exportCompanyProfile = () => {
    const payload = JSON.stringify(
      selectedCompanyProfile || companyProfileFromSettings(settings),
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(selectedCompanyProfile?.name || "company-profile").replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const changeCurrentCycleUserAdd = (delta: number) => {
    const next = Math.max(
      minimumCurrentCycleUserAdd,
      currentBillingCycleUserAdd + delta,
    );
    setCurrentCycleUserAddCount(next);
    setNextCycleUserLimit((limit) =>
      Math.max(currentUserCount, limit, currentPaidUserLimit + next),
    );
  };

  const changeNextCycleUserLimit = (delta: number) => {
    setNextCycleUserLimit((current) =>
      Math.max(currentUserCount, 1, current + delta),
    );
  };

  const changeCurrentCycleSmsAdd = (delta: number) => {
    const next = Math.max(
      minimumCurrentCycleSmsAdd,
      currentBillingCycleSmsAdd + delta,
    );
    const rounded = Math.ceil(next / 50) * 50;
    setCurrentCycleSmsAddCount(rounded);
    setNextCycleSmsCount((limit) =>
      Math.max(0, limit, currentPaidSmsLimit + rounded),
    );
  };

  const changeNextCycleSmsCount = (delta: number) => {
    setNextCycleSmsCount((current) => Math.max(0, current + delta));
  };

  const toggleCurrentCycleAddon = (key: string, checked: boolean) => {
    const normalized = normalizeAccountAddonKey(key);
    if (!normalized || currentBaseAddonKeys.includes(normalized)) return;
    setCurrentCycleAddonKeys((current) =>
      checked
        ? current.includes(normalized)
          ? current
          : [...current, normalized]
        : current.filter((item) => item !== normalized),
    );
    if (checked) {
      setNextCycleAddonKeys((current) =>
        current.includes(normalized) ? current : [...current, normalized],
      );
    }
  };

  const toggleNextCycleAddon = (key: string, checked: boolean) => {
    const normalized = normalizeAccountAddonKey(key);
    if (!normalized) return;
    setNextCycleAddonKeys((current) =>
      checked
        ? current.includes(normalized)
          ? current
          : [...current, normalized]
        : current.filter((item) => item !== normalized),
    );
  };

  const saveSubscriptionCapacity = async () => {
    if (!isAdmin) return;
    const normalizedCurrentUserAdd = Math.max(
      minimumCurrentCycleUserAdd,
      currentBillingCycleUserAdd,
    );
    const normalizedCurrentSmsAdd = Math.max(
      minimumCurrentCycleSmsAdd,
      currentBillingCycleSmsAdd,
    );
    const normalizedNextUserLimit = Math.max(
      1,
      currentUserCount,
      nextInvoiceUserLimit,
    );
    const normalizedNextSmsLimit = Math.max(0, nextInvoiceSmsCount);
    const normalizedCurrentAddonKeys = currentCycleAddonKeys.filter(
      (key) => !currentBaseAddonKeys.includes(key),
    );
    const normalizedNextAddonKeys = nextCycleAddonKeys;
    setSavingSubscriptionAddons(true);
    try {
      const payload = {
        ...settings,
        SIGNUP_USER_COUNT: String(
          Math.max(1, currentUserCount, currentPaidUserLimit),
        ),
        SIGNUP_SMS_COUNT: String(Math.max(0, currentPaidSmsLimit)),
        BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT: String(
          normalizedCurrentUserAdd,
        ),
        BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT: String(
          normalizedCurrentSmsAdd,
        ),
        BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS: accountAddonKeysToCsv(
          normalizedCurrentAddonKeys,
        ),
        BILLING_SUBSCRIPTION_NEXT_USER_COUNT: String(normalizedNextUserLimit),
        BILLING_SUBSCRIPTION_NEXT_SMS_COUNT: String(normalizedNextSmsLimit),
        BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS: accountAddonKeysToCsv(
          normalizedNextAddonKeys,
        ),
      };
      const { data } = await api.put("/settings", payload);
      const merged = { ...payload, ...data };
      setSettings(merged);
      setExtraUsersCount(Math.max(1, currentUserCount, currentPaidUserLimit));
      setSmsPackCount(Math.max(0, currentPaidSmsLimit));
      setCurrentCycleUserAddCount(normalizedCurrentUserAdd);
      setCurrentCycleSmsAddCount(normalizedCurrentSmsAdd);
      setCurrentCycleAddonKeys(normalizedCurrentAddonKeys);
      setNextCycleUserLimit(normalizedNextUserLimit);
      setNextCycleSmsCount(normalizedNextSmsLimit);
      setNextCycleAddonKeys(normalizedNextAddonKeys);
      window.dispatchEvent(new Event("settings-updated"));
      showToast("success", "Naročniške kapacitete so posodobljene.");
    } catch (e: any) {
      showToast(
        "error",
        e?.response?.data?.message ||
          "Kapacitet naročnine ni bilo mogoče posodobiti.",
      );
    } finally {
      setSavingSubscriptionAddons(false);
    }
  };

  const storedSubscriptionInterval: AccountSubscriptionInterval =
    String(
      settings.BILLING_SUBSCRIPTION_INTERVAL || "MONTHLY",
    ).toUpperCase() === "YEARLY"
      ? "YEARLY"
      : "MONTHLY";
  const planGrossForInterval = (
    planKey: AccountPlanPackageKey,
    interval: AccountSubscriptionInterval,
  ) =>
    interval === "YEARLY"
      ? accountPlanCatalog[planKey].annual
      : accountPlanCatalog[planKey].monthly;
  const accountPlanRank = (planKey: AccountPlanPackageKey) =>
    planKey === "PREMIUM" ? 3 : planKey === "PROFESSIONAL" ? 2 : 1;

  const packageChangePreview = useMemo(() => {
    if (!packageChangeTarget) return null;
    const current = activeSubscriptionPackage;
    const target = packageChangeTarget;
    const targetInterval = subscriptionBillingInterval;
    const currentGross = planGrossForInterval(
      current,
      storedSubscriptionInterval,
    );
    const targetGross = planGrossForInterval(target, targetInterval);
    const isUpgrade =
      accountPlanRank(target) !== accountPlanRank(current)
        ? accountPlanRank(target) > accountPlanRank(current)
        : targetGross > currentGross;
    const diff = roundAccountMoney(Math.max(0, targetGross - currentGross));
    return {
      current,
      target,
      targetInterval,
      currentGross,
      targetGross,
      isUpgrade,
      diff,
    };
  }, [
    packageChangeTarget,
    activeSubscriptionPackage,
    subscriptionBillingInterval,
    storedSubscriptionInterval,
    accountPlanCatalog,
  ]);

  const requestPackageChange = (target: AccountPlanPackageKey) => {
    if (!isAdmin) return;
    if (
      target === activeSubscriptionPackage &&
      subscriptionBillingInterval === storedSubscriptionInterval
    )
      return;
    setPackageChangeTarget(target);
  };

  const confirmPackageChange = async () => {
    if (!packageChangeTarget) return;
    setSavingPackageChange(true);
    try {
      await api.post("/account-management/change-package", {
        packageName: packageChangeTarget,
        interval: subscriptionBillingInterval,
      });
      await load();
      window.dispatchEvent(new Event("settings-updated"));
      showToast("success", "Paket je posodobljen.");
      setPackageChangeTarget(null);
    } catch (e: any) {
      showToast(
        "error",
        e?.response?.data?.message || "Paketa ni bilo mogoče spremeniti.",
      );
    } finally {
      setSavingPackageChange(false);
    }
  };

  const renderAccountPlanIcon = (kind: "leaf" | "star" | "crown") => {
    if (kind === "leaf") {
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 19c9 0 12-9 12-14C13 5 4 8 4 17c0 1 .2 2 .6 3" />
          <path d="M6 13c1.2 0 2.8.4 4 1.4" />
        </svg>
      );
    }
    if (kind === "crown") {
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 7l4.5 5L12 5l4.5 7L21 7l-2 11H5L3 7Z" />
        </svg>
      );
    }
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
      </svg>
    );
  };

  const renderCompanyOverviewValue = (value?: string | null, fallback = "—") =>
    value && value.trim() ? value : fallback;
  const companyProfileDisplayName = (value?: string | null) => {
    const normalized = (value || "").trim();
    if (!normalized) return "Naziv podjetja";
    if (/^Profil podjetja \d+$/i.test(normalized)) return "Naziv podjetja";
    return normalized;
  };

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const mq = window.matchMedia("(max-width: 920px)");
    const syncCompactViewport = () => setIsCompactConfigViewport(mq.matches);
    syncCompactViewport();
    mq.addEventListener("change", syncCompactViewport);
    return () => mq.removeEventListener("change", syncCompactViewport);
  }, []);

  useEffect(() => {
    if (companyProfilesInitialized || Object.keys(settings).length === 0)
      return;
    const profiles = loadCompanyProfilesFromSettings(settings);
    const selectedId =
      settings.COMPANY_SELECTED_PROFILE_ID &&
      profiles.some(
        (profile) => profile.id === settings.COMPANY_SELECTED_PROFILE_ID,
      )
        ? settings.COMPANY_SELECTED_PROFILE_ID
        : (profiles.find((profile) => profile.isDefault) || profiles[0]).id;
    const selected =
      profiles.find((profile) => profile.id === selectedId) || profiles[0];
    setCompanyProfiles(profiles);
    setSelectedCompanyProfileId(selected.id);
    setSettings((prev) => companyProfileToSettings(prev, selected, profiles));
    setCompanyProfilesInitialized(true);
  }, [companyProfilesInitialized, settings]);

  const updateSelectedCompanyProfile = (patch: Partial<CompanyProfileForm>) => {
    const selected = selectedCompanyProfile;
    if (!selected) return;
    const updatedSelected = sanitizeCompanyProfile(
      { ...selected, ...patch },
      selected.id,
    );
    const nextProfiles = companyProfiles.map((profile) =>
      profile.id === selected.id ? updatedSelected : profile,
    );
    setCompanyProfiles(nextProfiles);
    setSettings((prev) =>
      companyProfileToSettings(prev, updatedSelected, nextProfiles),
    );
  };

  const selectCompanyProfile = (profileId: string) => {
    const profile = companyProfiles.find((entry) => entry.id === profileId);
    if (!profile) return;
    setSelectedCompanyProfileId(profile.id);
    setCompanyProfileMenuOpenId(null);
    setSettings((prev) =>
      companyProfileToSettings(prev, profile, companyProfiles),
    );
  };

  const addCompanyProfile = () => {
    const nextProfile = sanitizeCompanyProfile({
      id: createCompanyProfileId(),
      name: "",
      bankQrPurposeCode: "OTHR",
      bankQrPurposeText: "PLACILO FOLIA",
      isDefault: companyProfiles.length === 0,
    });
    const nextProfiles = [...companyProfiles, nextProfile];
    setCompanyProfiles(nextProfiles);
    setSelectedCompanyProfileId(nextProfile.id);
    setCompanyProfileMenuOpenId(null);
    setSettings((prev) =>
      companyProfileToSettings(prev, nextProfile, nextProfiles),
    );
  };

  const setDefaultCompanyProfile = (profileId: string) => {
    const nextProfiles = companyProfiles.map((profile) => ({
      ...profile,
      isDefault: profile.id === profileId,
    }));
    const selected =
      nextProfiles.find((profile) => profile.id === profileId) ||
      nextProfiles[0];
    if (!selected) return;
    setCompanyProfiles(nextProfiles);
    setSelectedCompanyProfileId(selected.id);
    setCompanyProfileMenuOpenId(null);
    setSettings((prev) =>
      companyProfileToSettings(prev, selected, nextProfiles),
    );
  };

  const deleteCompanyProfile = (profileId: string) => {
    const target = companyProfiles.find((profile) => profile.id === profileId);
    if (!target) return;
    if (companyProfiles.length <= 1) {
      window.alert("Zadnjega profila ni mogoče izbrisati.");
      return;
    }
    if (
      !window.confirm(`Izbrišem profil "${target.name || "Profil podjetja"}"?`)
    )
      return;
    let nextProfiles = companyProfiles.filter(
      (profile) => profile.id !== profileId,
    );
    if (
      !nextProfiles.some((profile) => profile.isDefault) &&
      nextProfiles.length > 0
    ) {
      const fallbackDefaultId = nextProfiles[0].id;
      nextProfiles = nextProfiles.map((profile) => ({
        ...profile,
        isDefault: profile.id === fallbackDefaultId,
      }));
    }
    const nextSelected =
      nextProfiles.find((profile) => profile.id === selectedCompanyProfileId) ||
      nextProfiles.find((profile) => profile.isDefault) ||
      nextProfiles[0];
    if (!nextSelected) return;
    setCompanyProfiles(nextProfiles);
    setSelectedCompanyProfileId(nextSelected.id);
    setCompanyProfileMenuOpenId(null);
    setSettings((prev) =>
      companyProfileToSettings(prev, nextSelected, nextProfiles),
    );
  };

  const setCompanyTenantType = (rawValue: string) => {
    const nextType = normalizeTenantConfigType(rawValue);
    const nextGuestAppSettings = { ...guestAppSettings, tenantType: nextType };
    const presetDraft = applyModuleConfigPreset(
      buildModulesDraftFromCommitted(settings, nextGuestAppSettings),
      nextType,
      settings.SIGNUP_PACKAGE_NAME || me.packageType,
    );
    setGuestAppSettings(nextGuestAppSettings);
    setSettings((prev) => ({
      ...prev,
      ...modulesDraftToSettingsPatch(presetDraft),
      MODULE_CONFIG_TYPE: nextType,
    }));
    setModulesDraft((prev) =>
      prev
        ? applyModuleConfigPreset(
            prev,
            nextType,
            settings.SIGNUP_PACKAGE_NAME || me.packageType,
          )
        : prev,
    );
  };

  useEffect(() => {
    if (!companyProfileMenuOpenId) return;
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(".company-profile-menu-popover") ||
        target.closest(".account-menu-button")
      )
        return;
      setCompanyProfileMenuOpenId(null);
    };
    const onEscape = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setCompanyProfileMenuOpenId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [companyProfileMenuOpenId]);

  const guestAppEnabledCommitted = useMemo(
    () =>
      parseGuestAppSettings(settings[GUEST_APP_SETTINGS_KEY]).guestAppEnabled &&
      (isPlatformAdminTenant ||
        moduleVisibilityAllowed(
          moduleVisibilityRules,
          "guestAppEnabled",
          activeSubscriptionPackage,
          companyTenantType,
        )),
    [
      settings[GUEST_APP_SETTINGS_KEY],
      isPlatformAdminTenant,
      moduleVisibilityRules,
      activeSubscriptionPackage,
      companyTenantType,
    ],
  );
  const billingEnabledCommitted =
    settingsLoaded && settings.BILLING_ENABLED !== "false";
  const stripeModuleEnabledCommitted =
    billingEnabledCommitted &&
    settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED !== "false";
  const stripePaymentsAvailableCommitted =
    paymentCapabilitiesLoaded &&
    stripeModuleEnabledCommitted &&
    paymentGlobalCapabilities.stripeEnabled;
  const notificationsEnabledCommitted =
    settingsLoaded && settings.NOTIFICATIONS_ENABLED !== "false";
  const websiteWidgetEnabledCommitted =
    settingsLoaded && settings.WEBSITE_WIDGET_ENABLED !== "false";
  const googleCalendarModuleEnabledCommitted =
    settingsLoaded && settings.GOOGLE_CALENDAR_MODULE_ENABLED !== "false";

  const isConfigTabAvailable = (tabId: Tab) => {
    if (tabId === "company" || tabId === "modules" || tabId === "integrations")
      return true;
    if (!settingsLoaded) return false;
    if (tabId === "billing") return billingEnabledCommitted;
    if (tabId === "notifications") return notificationsEnabledCommitted;
    if (tabId === "whatsapp")
      return inboxCapabilitiesLoaded && inboxGlobalCapabilities.whatsappEnabled;
    if (tabId === "viber")
      return inboxCapabilitiesLoaded && inboxGlobalCapabilities.viberEnabled;
    if (tabId === "guestApp") return guestAppEnabledCommitted;
    if (tabId === "website") return websiteWidgetEnabledCommitted;
    return true;
  };

  const getUnavailableConfigTabFallback = (tabId: Tab): Tab => {
    if (tabId === "billing") return "modules";
    return firstAvailableConfigTab();
  };

  const firstAvailableConfigTab = (): Tab => {
    if (isConfigTabAvailable("company")) return "company";
    return "company";
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (
      !settingsLoaded ||
      !inboxCapabilitiesLoaded ||
      !paymentCapabilitiesLoaded
    )
      return;
    const q = query.get("tab");
    if (q === "sessionTypes") {
      navigate("/session-types", { replace: true });
      return;
    }
    if (q === "consultants") {
      navigate("/consultants", { replace: true });
      return;
    }
    if (q === "services") {
      navigate("/session-types?subtab=transaction-services", { replace: true });
      return;
    }
    const subtabQuery = query.get("subtab");
    if (q === "security") {
      setTab("company");
      setAccountSubtab("security");
      navigate("/configuration?tab=company&subtab=security", { replace: true });
    } else if (q === "googleCalendar") {
      setTab("integrations");
      if (googleCalendarModuleEnabledCommitted) {
        setIntegrationSubtab("googleCalendar");
        navigate("/configuration?tab=integrations&subtab=googleCalendar", {
          replace: true,
        });
      } else {
        setIntegrationSubtab("status");
        navigate("/configuration?tab=integrations", { replace: true });
      }
    } else if (isConfigTab(q)) {
      if (isConfigTabAvailable(q)) {
        setTab(q);
      } else {
        const fallback = getUnavailableConfigTabFallback(q);
        setTab(fallback);
        navigate(`/configuration?tab=${fallback}`, { replace: true });
      }
    }
    if (
      q === "company" &&
      (subtabQuery === "company" ||
        subtabQuery === "receivedInvoices" ||
        subtabQuery === "subscription" ||
        subtabQuery === "security")
    ) {
      setAccountSubtab(subtabQuery);
    }
    if (q === "integrations") {
      if (
        subtabQuery === "googleCalendar" &&
        googleCalendarModuleEnabledCommitted
      ) {
        setIntegrationSubtab("googleCalendar");
      } else {
        setIntegrationSubtab("status");
        if (
          subtabQuery === "googleCalendar" &&
          !googleCalendarModuleEnabledCommitted
        ) {
          navigate("/configuration?tab=integrations", { replace: true });
        }
      }
    }
    if (
      subtabQuery === "settings" ||
      subtabQuery === "paymentMethods" ||
      subtabQuery === "stripe" ||
      subtabQuery === "paypal" ||
      subtabQuery === "fiscal" ||
      subtabQuery === "invoiceDelivery" ||
      subtabQuery === "folioLayout"
    ) {
      if (subtabQuery === "stripe" && !stripePaymentsAvailableCommitted) {
        setBillingSubtab("paymentMethods");
        if (q === "billing")
          navigate("/configuration?tab=billing&subtab=paymentMethods", {
            replace: true,
          });
      } else if (
        subtabQuery === "paypal" &&
        !paymentGlobalCapabilities.paypalEnabled
      ) {
        setBillingSubtab("paymentMethods");
      } else {
        setBillingSubtab(subtabQuery);
      }
    }
    if (
      q === "guestApp" &&
      (subtabQuery === "general" ||
        subtabQuery === "bookingRules" ||
        subtabQuery === "paymentMethods" ||
        subtabQuery === "qrCode")
    ) {
      setGuestAppSubtab(subtabQuery);
    }
    if (
      q === "website" &&
      (subtabQuery === "general" || subtabQuery === "paymentMethods")
    ) {
      setWebsiteSubtab(subtabQuery);
    }
  }, [
    query,
    navigate,
    isAdmin,
    settingsLoaded,
    inboxCapabilitiesLoaded,
    paymentCapabilitiesLoaded,
    paymentGlobalCapabilities.paypalEnabled,
    stripePaymentsAvailableCommitted,
    billingEnabledCommitted,
    notificationsEnabledCommitted,
    guestAppEnabledCommitted,
    websiteWidgetEnabledCommitted,
    googleCalendarModuleEnabledCommitted,
    inboxGlobalCapabilities.whatsappEnabled,
    inboxGlobalCapabilities.viberEnabled,
  ]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<InboxGlobalCapabilities>(
          "/inbox/global-capabilities",
        );
        if (cancelled || !data) return;
        setInboxGlobalCapabilities({
          whatsappEnabled: data.whatsappEnabled !== false,
          viberEnabled: data.viberEnabled !== false,
        });
      } catch {
        if (!cancelled) {
          setInboxGlobalCapabilities({
            whatsappEnabled: true,
            viberEnabled: true,
          });
        }
      } finally {
        if (!cancelled) setInboxCapabilitiesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<PaymentGlobalCapabilities>(
          "/settings/payment-capabilities",
        );
        if (cancelled || !data) return;
        setPaymentGlobalCapabilities({
          stripeEnabled: data.stripeEnabled !== false,
          paypalEnabled: data.paypalEnabled === true,
        });
      } catch {
        if (!cancelled) {
          setPaymentGlobalCapabilities({
            stripeEnabled: true,
            paypalEnabled: false,
          });
        }
      } finally {
        if (!cancelled) setPaymentCapabilitiesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!settingsLoaded || !inboxCapabilitiesLoaded) return;
    if (!isConfigTabAvailable(tab)) {
      const fallback = getUnavailableConfigTabFallback(tab);
      setTab(fallback);
      navigate(`/configuration?tab=${fallback}`, { replace: true });
    }
  }, [
    tab,
    settingsLoaded,
    inboxCapabilitiesLoaded,
    inboxGlobalCapabilities.whatsappEnabled,
    inboxGlobalCapabilities.viberEnabled,
    guestAppEnabledCommitted,
    websiteWidgetEnabledCommitted,
    billingEnabledCommitted,
    notificationsEnabledCommitted,
    navigate,
  ]);

  useEffect(() => {
    const prev = prevTabRef.current;
    if (tab === "modules" && prev !== "modules") {
      setModulesDraft(
        buildModulesDraftFromCommitted(settings, guestAppSettings),
      );
    }
    if (prev === "modules" && tab !== "modules") {
      setModulesDraft(null);
    }
    prevTabRef.current = tab;
  }, [tab, settings, guestAppSettings]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    const onNarrow = () => {
      if (mq.matches)
        setBillingSubtab((cur) =>
          cur === "folioLayout" ? "paymentMethods" : cur,
        );
    };
    onNarrow();
    mq.addEventListener("change", onNarrow);
    return () => mq.removeEventListener("change", onNarrow);
  }, []);

  const setTabAndUrl = (next: Tab) => {
    if (!isConfigTabAvailable(next)) {
      const fallback = getUnavailableConfigTabFallback(next);
      setTab(fallback);
      navigate(`/configuration?tab=${fallback}`);
      return;
    }
    setTab(next);
    if (next === "integrations") setIntegrationSubtab("status");
    if (next === "website") setWebsiteSubtab("general");
    navigate(`/configuration?tab=${next}`);
  };

  const setWebsiteSubtabAndUrl = (next: WebsiteSubtab) => {
    setWebsiteSubtab(next);
    navigate(
      next === "general"
        ? "/configuration?tab=website"
        : `/configuration?tab=website&subtab=${next}`,
    );
  };

  const setAccountSubtabAndUrl = (next: typeof accountSubtab) => {
    setAccountSubtab(next);
    navigate(
      next === "company"
        ? "/configuration?tab=company"
        : `/configuration?tab=company&subtab=${next}`,
    );
  };

  const load = async () => {
    setAccountReceivedInvoicesLoading(true);
    const [
      settingsRes,
      spacesRes,
      paymentMethodsRes,
      certificateMetaRes,
      paypalConfigRes,
      stripeConnectRes,
      receivedInvoicesRes,
      catalogRes,
      tenantUsersRes,
    ] = await Promise.all([
      api.get("/settings"),
      api.get("/spaces").catch(() => ({ data: [] })),
      api.get("/billing/payment-methods").catch(() => ({ data: [] })),
      api
        .get("/fiscal/certificate/meta")
        .catch(() => ({ data: { uploaded: false } })),
      api.get("/paypal/onboarding/config").catch(() => ({ data: null })),
      api.get("/stripe/connect/config").catch(() => ({ data: null })),
      api
        .get("/account-management/received-invoices")
        .catch(() => ({ data: [] })),
      api
        .get<AccountRegisterCatalog>("/register/catalog")
        .catch(() => ({ data: DEFAULT_ACCOUNT_REGISTER_CATALOG })),
      api.get<AccountUserResponse[]>("/users").catch(() => ({ data: [] })),
    ]);
    const paypalData = paypalConfigRes.data || {};
    const settingsData: Record<string, string> = applyNotificationModuleAvailability(
      mergeNotificationSettingsJsonIntoFlat({
      ...(settingsRes.data || {}),
      ...(paypalData.merchantId
        ? { PAYPAL_MERCHANT_ID: paypalData.merchantId }
        : {}),
      ...(paypalData.trackingId
        ? { PAYPAL_TRACKING_ID: paypalData.trackingId }
        : {}),
      ...(paypalData.status
        ? { PAYPAL_ONBOARDING_STATUS: paypalData.status }
        : {}),
      PAYPAL_CREDENTIALS_CONFIGURED: paypalData.credentialsConfigured
        ? "true"
        : "false",
    } as Record<string, string>),
    );
    const fallback = getWorkingHoursFallback();
    const parsedGuestApp = parseGuestAppSettings(
      settingsData[GUEST_APP_SETTINGS_KEY],
    );
    const unifiedTenantType = normalizeTenantConfigType(
      settingsData.MODULE_CONFIG_TYPE || parsedGuestApp.tenantType,
    );
    const nextSettings: Record<string, string> = {
      ...settingsData,
      MODULE_CONFIG_TYPE: unifiedTenantType,
      ...(!settingsData.WORKING_HOURS_START && !settingsData.WORKING_HOURS_END
        ? fallback
        : {}),
    };
    const parsedGuestBookingRules = parseGuestBookingRules(
      settingsData[GUEST_BOOKING_RULES_KEY],
    );
    const nextGuestApp = {
      ...parsedGuestApp,
      tenantType: unifiedTenantType,
      paymentOnLocation: parsedGuestBookingRules.paymentRequirement === "none",
    };
    const nextGuestBookingRules = normalizeBookingRulesForPaymentLocation(
      parsedGuestBookingRules,
      nextGuestApp.paymentOnLocation,
    );
    const parsedWebsiteBookingRules = settingsData[WEBSITE_BOOKING_RULES_KEY]
      ? parseWebsiteBookingRules(settingsData[WEBSITE_BOOKING_RULES_KEY])
      : {
          paymentRequirement: nextGuestBookingRules.paymentRequirement,
          depositPercent: nextGuestBookingRules.depositPercent,
        };
    const parsedWebsiteSettings = settingsData[WEBSITE_WIDGET_SETTINGS_KEY]
      ? parseWebsiteWidgetSettings(settingsData[WEBSITE_WIDGET_SETTINGS_KEY])
      : {
          employeeSelectionStep: nextGuestApp.employeeSelectionStep,
          acceptedPaymentMethodIds: nextGuestApp.acceptedPaymentMethodIds,
          paymentDefaultMethodId: nextGuestApp.paymentDefaultMethodId,
          paymentOnLocation: nextGuestApp.paymentOnLocation,
        };
    const nextWebsiteSettings = normalizeWebsiteSettingsForPaymentLocation(
      parsedWebsiteSettings,
    );
    const nextWebsiteBookingRules =
      normalizeWebsiteBookingRulesForPaymentLocation(
        parsedWebsiteBookingRules,
        nextWebsiteSettings.paymentOnLocation,
      );
    setSettings(nextSettings);
    setSubscriptionBillingInterval(
      String(
        nextSettings.BILLING_SUBSCRIPTION_INTERVAL || "MONTHLY",
      ).toUpperCase() === "YEARLY"
        ? "YEARLY"
        : "MONTHLY",
    );
    const activeTenantUserCount = Math.max(
      1,
      Array.isArray(tenantUsersRes.data)
        ? tenantUsersRes.data.filter((user) => user.active !== false).length
        : 1,
    );
    const paidUserLimit = Math.max(
      1,
      positiveAccountInteger(nextSettings.SIGNUP_USER_COUNT, 1),
      activeTenantUserCount,
    );
    const paidSmsLimit =
      Math.ceil(positiveAccountInteger(nextSettings.SIGNUP_SMS_COUNT, 0) / 50) *
      50;
    const currentCycleUserAdd = Math.max(
      0,
      positiveAccountInteger(
        nextSettings.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT,
        0,
      ),
      activeTenantUserCount - paidUserLimit,
    );
    const currentSmsUsageForLimit = positiveAccountInteger(
      nextSettings.TENANCY_SMS_SENT_COUNT,
      0,
    );
    const currentCycleSmsAdd =
      Math.ceil(
        Math.max(
          0,
          positiveAccountInteger(
            nextSettings.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT,
            0,
          ),
          currentSmsUsageForLimit - paidSmsLimit,
        ) / 50,
      ) * 50;
    const plannedUserLimit = Math.max(
      1,
      activeTenantUserCount,
      positiveAccountInteger(
        nextSettings.BILLING_SUBSCRIPTION_NEXT_USER_COUNT,
        paidUserLimit,
      ),
    );
    const plannedSmsLimit =
      Math.ceil(
        positiveAccountInteger(
          nextSettings.BILLING_SUBSCRIPTION_NEXT_SMS_COUNT,
          paidSmsLimit,
        ) / 50,
      ) * 50;
    const signupAddonKeys = parseAccountAddonKeyCsv(
      nextSettings.SIGNUP_ADDON_KEYS,
    );
    const currentAddonKeys = parseAccountAddonKeyCsv(
      nextSettings.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS,
    ).filter((key) => !signupAddonKeys.includes(key));
    const plannedAddonKeys = parseAccountAddonKeyCsv(
      nextSettings.BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS ||
        nextSettings.SIGNUP_ADDON_KEYS,
    );
    setExtraUsersCount(paidUserLimit);
    setSmsPackCount(paidSmsLimit);
    setCurrentCycleUserAddCount(currentCycleUserAdd);
    setCurrentCycleSmsAddCount(currentCycleSmsAdd);
    setCurrentCycleAddonKeys(currentAddonKeys);
    setNextCycleUserLimit(plannedUserLimit);
    setNextCycleSmsCount(plannedSmsLimit);
    setNextCycleAddonKeys(plannedAddonKeys);
    setAccountRegisterCatalog(normalizeAccountRegisterCatalog(catalogRes.data));
    setTenantUsersCount(activeTenantUserCount);
    setGuestAppSettings(nextGuestApp);
    if (tabRef.current === "modules") {
      setModulesDraft(
        buildModulesDraftFromCommitted(nextSettings, nextGuestApp),
      );
    }
    setGuestBookingRules(nextGuestBookingRules);
    setWebsiteSettings(nextWebsiteSettings);
    setWebsiteBookingRules(nextWebsiteBookingRules);
    setPersonalTaskPresets(
      parsePersonalTaskPresets(settingsData[PERSONAL_TASK_PRESETS_KEY]),
    );
    setSpaces(spacesRes.data || []);
    setPaymentMethods(
      (paymentMethodsRes.data || [])
        .map((p: PaymentMethod) => normalizePaymentMethod(p)!)
        .filter((method: PaymentMethod) => method.paymentType !== "ADVANCE"),
    );
    setCertificateMeta(certificateMetaRes.data || { uploaded: false });
    setStripeConnectStatus(stripeConnectRes.data || null);
    setAccountReceivedInvoices(
      Array.isArray(receivedInvoicesRes.data) ? receivedInvoicesRes.data : [],
    );
    setSettingsLoaded(true);
    setAccountReceivedInvoicesLoading(false);
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !billingEnabledCommitted) return;
    const merchantId =
      query.get("merchantIdInPayPal") ||
      query.get("merchantId") ||
      query.get("merchant_id");
    const trackingId = query.get("tracking_id") || query.get("trackingId");
    if (!merchantId && !trackingId) return;

    let cancelled = false;
    (async () => {
      try {
        await api.post("/paypal/onboarding/complete", {
          merchantId,
          trackingId,
        });
        if (!cancelled) {
          await load();
          setTab("billing");
          setBillingSubtab(
            paymentGlobalCapabilities.paypalEnabled
              ? "paypal"
              : "paymentMethods",
          );
          showToast(
            "success",
            merchantId
              ? "PayPal seller connected."
              : "PayPal onboarding returned. Please review the merchant ID below and save if needed.",
          );
          navigate(
            `/configuration?tab=billing&subtab=${paymentGlobalCapabilities.paypalEnabled ? "paypal" : "paymentMethods"}`,
            { replace: true },
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast(
            "error",
            err?.response?.data?.message ||
              "Failed to save PayPal onboarding result.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isAdmin,
    query,
    navigate,
    showToast,
    paymentGlobalCapabilities.paypalEnabled,
    billingEnabledCommitted,
  ]);

  useEffect(() => {
    if (!isAdmin || !billingEnabledCommitted) return;
    const stripeMode = query.get("stripeMode");
    if (!stripeMode) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post(
          `/stripe/connect/refresh?mode=${encodeURIComponent(stripeMode)}`,
        );
        if (!cancelled) {
          setStripeConnectStatus(data || null);
          setTab("billing");
          setBillingSubtab("stripe");
          showToast("success", "Stripe onboarding returned. Status refreshed.");
          navigate("/configuration?tab=billing&subtab=stripe", {
            replace: true,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast(
            "error",
            err?.response?.data?.message ||
              "Failed to refresh Stripe onboarding status.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, query, navigate, showToast, billingEnabledCommitted]);

  useEffect(() => {
    const connected = query.get("google_calendar_connected");
    const error = query.get("google_calendar_error");
    if (!connected && !error) return;
    setTab("integrations");
    setIntegrationSubtab("googleCalendar");
    if (connected)
      showToast("success", "Google Calendar connected. Full sync was queued.");
    if (error) showToast("error", error);
    navigate("/configuration?tab=integrations&subtab=googleCalendar", {
      replace: true,
    });
  }, [query, navigate, showToast]);

  const modulesDraftDisplay = useMemo(() => {
    if (tab !== "modules") return null;
    return (
      modulesDraft ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
    );
  }, [tab, modulesDraft, settings, guestAppSettings]);

  const configNavItems = useMemo((): ConfigNavItem[] => {
    const items: ConfigNavItem[] = [
      { id: "company", icon: "company" },
      { id: "booking", icon: "booking" },
      { id: "billing", icon: "billing" },
      { id: "guestApp", icon: "guestApp" },
      { id: "website", icon: "website" },
      { id: "notifications", icon: "notifications" },
      { id: "deliveryLogs", icon: "deliveryLogs" },
      { id: "integrations", icon: "integrations" },
      { id: "whatsapp", icon: "whatsapp" },
      { id: "viber", icon: "viber" },
      { id: "modules", icon: "modules" },
    ];
    return items.filter((entry) => isConfigTabAvailable(entry.id));
  }, [
    settingsLoaded,
    inboxCapabilitiesLoaded,
    inboxGlobalCapabilities.whatsappEnabled,
    inboxGlobalCapabilities.viberEnabled,
    guestAppEnabledCommitted,
    websiteWidgetEnabledCommitted,
    billingEnabledCommitted,
    notificationsEnabledCommitted,
  ]);

  useEffect(() => {
    if (bookingSubtab !== "spaces") {
      setBookingSubtab("spaces");
    }
  }, [bookingSubtab]);

  useEffect(() => {
    setOpenSpaceMenuId(null);
  }, [bookingSubtab]);

  useEffect(() => {
    if (openSpaceMenuId == null) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest(".config-entity-menu-wrap")) return;
      setOpenSpaceMenuId(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openSpaceMenuId]);

  const saveSettings = async (opts?: { applyModulesDraft?: boolean }) => {
    if (!isAdmin) return;
    setSavingSettings(true);
    try {
      const normalizedStart = toTimeInputValue(
        settings.WORKING_HOURS_START,
        "05:00",
      );
      const normalizedEnd = toTimeInputValue(
        settings.WORKING_HOURS_END,
        "23:00",
      );
      let effectiveSettings = settings;
      let effectiveGuestApp = guestAppSettings;
      let effectiveWebsiteSettings = websiteSettings;
      if (opts?.applyModulesDraft && modulesDraft) {
        const modulesDraftForSave: ModulesDraft = {
          ...modulesDraft,
          MODULE_CONFIG_TYPE: normalizeTenantConfigType(
            modulesDraft.MODULE_CONFIG_TYPE,
          ),
          AI_BOOKING_ENABLED: "false",
          COURSES_ENABLED:
            modulesDraft.TYPES_ENABLED === "true" &&
            modulesDraft.COURSES_ENABLED === "true"
              ? "true"
              : "false",
          MULTIPLE_SESSIONS_PER_SPACE_ENABLED:
            modulesDraft.SPACES_ENABLED === "true" &&
            modulesDraft.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === "true"
              ? "true"
              : "false",
          MULTIPLE_CLIENTS_PER_SESSION_ENABLED:
            modulesDraft.GROUP_BOOKING_ENABLED === "true" &&
            modulesDraft.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === "true"
              ? "true"
              : "false",
        };
        if (modulesDraftForSave.BILLING_ENABLED !== "true") {
          modulesDraftForSave.BILLING_INVOICES_ENABLED = "false";
          modulesDraftForSave.BILLING_ONLINE_CARD_PAYMENTS_ENABLED = "false";
          modulesDraftForSave.BILLING_BANK_TRANSFER_ENABLED = "false";
          modulesDraftForSave.BILLING_PAYPAL_ENABLED = "false";
          modulesDraftForSave.BILLING_GIFT_CARDS_ENABLED = "false";
          modulesDraftForSave.BILLING_ADVANCE_ENABLED = "false";
        }
        if (!modulesDraftForSave.guestAppEnabled) {
          modulesDraftForSave.guestInboxEnabled = false;
        }
        if (!modulesDraftForSave.guestWalletEnabled) {
          modulesDraftForSave.guestOrdersEnabled = false;
          modulesDraftForSave.guestBuyTabEnabled = false;
          modulesDraftForSave.guestEntitlementsEnabled = false;
        }
        effectiveSettings = {
          ...settings,
          MODULE_CONFIG_TYPE: modulesDraftForSave.MODULE_CONFIG_TYPE,
          SPACES_ENABLED: modulesDraftForSave.SPACES_ENABLED,
          TYPES_ENABLED: modulesDraftForSave.TYPES_ENABLED,
          COURSES_ENABLED: modulesDraftForSave.COURSES_ENABLED,
          BOOKABLE_ENABLED: modulesDraftForSave.BOOKABLE_ENABLED,
          NO_SHOW_ENABLED: modulesDraftForSave.NO_SHOW_ENABLED,
          ONLINE_SESSION_BOOKING_ENABLED:
            modulesDraftForSave.ONLINE_SESSION_BOOKING_ENABLED,
          WEBSITE_WIDGET_ENABLED: modulesDraftForSave.WEBSITE_WIDGET_ENABLED,
          AI_BOOKING_ENABLED: modulesDraftForSave.AI_BOOKING_ENABLED,
          PERSONAL_ENABLED: modulesDraftForSave.PERSONAL_ENABLED,
          TODOS_ENABLED: modulesDraftForSave.TODOS_ENABLED,
          MULTIPLE_SESSIONS_PER_SPACE_ENABLED:
            modulesDraftForSave.MULTIPLE_SESSIONS_PER_SPACE_ENABLED,
          MULTIPLE_CLIENTS_PER_SESSION_ENABLED:
            modulesDraftForSave.MULTIPLE_CLIENTS_PER_SESSION_ENABLED,
          GROUP_BOOKING_ENABLED: modulesDraftForSave.GROUP_BOOKING_ENABLED,
          BILLING_ENABLED: modulesDraftForSave.BILLING_ENABLED,
          BILLING_INVOICES_ENABLED:
            modulesDraftForSave.BILLING_INVOICES_ENABLED,
          BILLING_ONLINE_CARD_PAYMENTS_ENABLED:
            modulesDraftForSave.BILLING_ONLINE_CARD_PAYMENTS_ENABLED,
          BILLING_BANK_TRANSFER_ENABLED:
            modulesDraftForSave.BILLING_BANK_TRANSFER_ENABLED,
          BILLING_PAYPAL_ENABLED: modulesDraftForSave.BILLING_PAYPAL_ENABLED,
          BILLING_GIFT_CARDS_ENABLED:
            modulesDraftForSave.BILLING_GIFT_CARDS_ENABLED,
          BILLING_ADVANCE_ENABLED: modulesDraftForSave.BILLING_ADVANCE_ENABLED,
          COMMUNICATION_ENABLED: modulesDraftForSave.COMMUNICATION_ENABLED,
          NOTIFICATIONS_ENABLED: modulesDraftForSave.NOTIFICATIONS_ENABLED,
          NOTIFICATIONS_EMAIL_ALERTS_ENABLED:
            modulesDraftForSave.NOTIFICATIONS_EMAIL_ALERTS_ENABLED,
          NOTIFICATIONS_SMS_ALERTS_ENABLED:
            modulesDraftForSave.NOTIFICATIONS_SMS_ALERTS_ENABLED,
          NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED:
            modulesDraftForSave.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED,
          NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED:
            modulesDraftForSave.NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED,
          GOOGLE_CALENDAR_MODULE_ENABLED:
            modulesDraftForSave.GOOGLE_CALENDAR_MODULE_ENABLED,
          SCANNER_MODULE_ENABLED: modulesDraftForSave.SCANNER_MODULE_ENABLED,
          INBOX_ENABLED: modulesDraftForSave.INBOX_ENABLED,
          WHATSAPP_MODULE_ENABLED: modulesDraftForSave.WHATSAPP_MODULE_ENABLED,
          VIBER_MODULE_ENABLED: modulesDraftForSave.VIBER_MODULE_ENABLED,
          SECURITY_MODULE_ENABLED: modulesDraftForSave.SECURITY_MODULE_ENABLED,
          SECURITY_SESSION_SECURITY_ENABLED:
            modulesDraftForSave.SECURITY_SESSION_SECURITY_ENABLED,
          SECURITY_PASSKEYS_ENABLED:
            modulesDraftForSave.SECURITY_PASSKEYS_ENABLED,
          SECURITY_API_INTEGRATIONS_ENABLED:
            modulesDraftForSave.SECURITY_API_INTEGRATIONS_ENABLED,
        };
        effectiveGuestApp = {
          ...guestAppSettings,
          tenantType: modulesDraftForSave.MODULE_CONFIG_TYPE,
          guestAppEnabled: modulesDraftForSave.guestAppEnabled,
          walletEnabled: modulesDraftForSave.guestWalletEnabled,
          ordersEnabled: modulesDraftForSave.guestOrdersEnabled,
          buyTabEnabled: modulesDraftForSave.guestBuyTabEnabled,
          entitlementsEnabled: modulesDraftForSave.guestEntitlementsEnabled,
          inboxEnabled: modulesDraftForSave.guestInboxEnabled,
        };
        if (
          modulesDraftForSave.BILLING_ONLINE_CARD_PAYMENTS_ENABLED !== "true"
        ) {
          const acceptedPaymentMethodIds = removeStripePaymentMethod(
            effectiveGuestApp.acceptedPaymentMethodIds,
          );
          const paymentDefaultMethodId = acceptedPaymentMethodIds.includes(
            effectiveGuestApp.paymentDefaultMethodId,
          )
            ? effectiveGuestApp.paymentDefaultMethodId
            : acceptedPaymentMethodIds[0];
          effectiveGuestApp = {
            ...effectiveGuestApp,
            acceptedPaymentMethodIds,
            paymentDefaultMethodId,
            paymentProvider:
              effectiveGuestApp.paymentProvider === "stripe"
                ? paymentGlobalCapabilities.paypalEnabled
                  ? "paypal"
                  : "bankart"
                : effectiveGuestApp.paymentProvider,
          };
          effectiveWebsiteSettings = effectiveWebsiteSettings.paymentOnLocation
            ? { ...effectiveWebsiteSettings, acceptedPaymentMethodIds: [] }
            : {
                ...effectiveWebsiteSettings,
                acceptedPaymentMethodIds: removeStripePaymentMethod(
                  effectiveWebsiteSettings.acceptedPaymentMethodIds,
                ),
                paymentDefaultMethodId:
                  effectiveWebsiteSettings.paymentDefaultMethodId ===
                  "online_card"
                    ? "bank_transfer"
                    : effectiveWebsiteSettings.paymentDefaultMethodId,
              };
        }
      }
      const unifiedTenantType = normalizeTenantConfigType(
        effectiveSettings.MODULE_CONFIG_TYPE || effectiveGuestApp.tenantType,
      );
      effectiveSettings = {
        ...effectiveSettings,
        MODULE_CONFIG_TYPE: unifiedTenantType,
      };
      effectiveGuestApp = {
        ...effectiveGuestApp,
        tenantType: unifiedTenantType,
      };
      effectiveSettings = applyNotificationModuleAvailability(effectiveSettings);

      const payload = {
        ...effectiveSettings,
        WORKING_HOURS_START: normalizedStart,
        WORKING_HOURS_END: normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]:
          serializePersonalTaskPresets(personalTaskPresets),
        [NOTIFICATION_SETTINGS_KEY]:
          buildNotificationSettingsJson(effectiveSettings),
        [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(effectiveGuestApp),
        [GUEST_BOOKING_RULES_KEY]:
          serializeGuestBookingRules(guestBookingRules),
        [WEBSITE_WIDGET_SETTINGS_KEY]: serializeWebsiteWidgetSettings(
          effectiveWebsiteSettings,
        ),
        [WEBSITE_BOOKING_RULES_KEY]: serializeWebsiteBookingRules(
          normalizeWebsiteBookingRulesForPaymentLocation(
            websiteBookingRules,
            effectiveWebsiteSettings.paymentOnLocation,
          ),
        ),
      };
      const { data } = await api.put("/settings", payload);
      setWorkingHoursFallback(normalizedStart, normalizedEnd);
      const responseHasPresets = Object.prototype.hasOwnProperty.call(
        data || {},
        PERSONAL_TASK_PRESETS_KEY,
      );
      const persistedPresetsRaw = responseHasPresets
        ? data?.[PERSONAL_TASK_PRESETS_KEY]
        : payload[PERSONAL_TASK_PRESETS_KEY];
      const merged = {
        ...payload,
        ...data,
        WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
        WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]: String(persistedPresetsRaw || ""),
      };
      setSettings(merged);
      setGuestAppSettings(
        parseGuestAppSettings(merged[GUEST_APP_SETTINGS_KEY]),
      );
      setPersonalTaskPresets(
        parsePersonalTaskPresets(String(persistedPresetsRaw || "")),
      );
      if (opts?.applyModulesDraft && modulesDraft && tab === "modules") {
        setModulesDraft(
          buildModulesDraftFromCommitted(
            merged,
            parseGuestAppSettings(merged[GUEST_APP_SETTINGS_KEY]),
          ),
        );
      }
      window.dispatchEvent(new Event("settings-updated"));
      showToast("success", t("configConfigurationSaved"));
    } catch (e: any) {
      window.alert(
        e?.response?.data?.message || "Failed to save configuration.",
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const paypalStatusLabel = useMemo(() => {
    const status = (settings.PAYPAL_ONBOARDING_STATUS || "").trim();
    if (!status || status === "NOT_CONNECTED") return "Not connected";
    if (status === "ONBOARDING_LINK_CREATED") return "Onboarding link created";
    if (status === "ONBOARDING_RETURNED") return "Connected";
    return status.replace(/_/g, " ");
  }, [settings.PAYPAL_ONBOARDING_STATUS]);

  const startPaypalOnboarding = async () => {
    setStartingPaypalOnboarding(true);
    try {
      const returnUrl = `${window.location.origin}/configuration?tab=billing&subtab=paypal`;
      const { data } = await api.post("/paypal/onboarding/start", {
        returnUrl,
      });
      if (!data?.actionUrl)
        throw new Error("PayPal did not return an onboarding URL.");
      setSettings((prev) => ({
        ...prev,
        PAYPAL_TRACKING_ID: data.trackingId || prev.PAYPAL_TRACKING_ID || "",
        PAYPAL_ONBOARDING_STATUS: "ONBOARDING_LINK_CREATED",
      }));
      window.open(data.actionUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      showToast(
        "error",
        err?.response?.data?.message ||
          err?.message ||
          "Failed to start PayPal onboarding.",
      );
    } finally {
      setStartingPaypalOnboarding(false);
    }
  };

  const savePaypalConfiguration = async () => {
    setSavingSettings(true);
    try {
      const { data } = await api.put("/paypal/onboarding/config", {
        merchantId: settings.PAYPAL_MERCHANT_ID || "",
        trackingId: settings.PAYPAL_TRACKING_ID || "",
      });
      setSettings((prev) => ({
        ...prev,
        PAYPAL_MERCHANT_ID: data?.merchantId || "",
        PAYPAL_TRACKING_ID: data?.trackingId || "",
        PAYPAL_ONBOARDING_STATUS:
          data?.status || prev.PAYPAL_ONBOARDING_STATUS || "NOT_CONNECTED",
      }));
      showToast("success", "PayPal configuration saved.");
    } catch (err: any) {
      showToast(
        "error",
        err?.response?.data?.message || "Failed to save PayPal configuration.",
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const activeStripeAccount = useMemo(() => {
    if (!stripeConnectStatus) return null;
    return stripeConnectStatus.activeMode === "production"
      ? stripeConnectStatus.production
      : stripeConnectStatus.sandbox;
  }, [stripeConnectStatus]);

  const stripeStatusLabel = useMemo(() => {
    if (!stripeConnectStatus || !activeStripeAccount)
      return locale === "sl" ? "Ni povezano" : "Not connected";
    if (!activeStripeAccount.connected)
      return locale === "sl" ? "Ni povezano" : "Not connected";
    if (
      activeStripeAccount.chargesEnabled &&
      activeStripeAccount.payoutsEnabled
    )
      return locale === "sl"
        ? "Plačila in izplačila omogočena"
        : "Payments and payouts enabled";
    if (activeStripeAccount.chargesEnabled)
      return locale === "sl"
        ? "Plačila omogočena · izplačila v čakanju"
        : "Payments enabled · payouts pending";
    if (activeStripeAccount.detailsSubmitted)
      return locale === "sl" ? "Preverjanje v teku" : "Verification pending";
    if (activeStripeAccount.onboardingStatus === "ONBOARDING_LINK_CREATED")
      return locale === "sl" ? "Onboarding začet" : "Onboarding started";
    return (
      activeStripeAccount.onboardingStatus?.replace(/_/g, " ") ||
      (locale === "sl" ? "Potrebno ukrepanje" : "Action required")
    );
  }, [stripeConnectStatus, activeStripeAccount, locale]);

  const activeGoogleCalendarConnection = useMemo(
    () =>
      googleCalendarConnections.find(
        (entry) => entry.status && entry.status !== "DISABLED",
      ) || null,
    [googleCalendarConnections],
  );

  const googleCalendarStatusLabel = useMemo(() => {
    if (googleCalendarStatusLoading && googleCalendarConnections.length === 0)
      return locale === "sl" ? "Preverjanje…" : "Checking…";
    if (!activeGoogleCalendarConnection)
      return locale === "sl" ? "Ni povezano" : "Not connected";
    if (activeGoogleCalendarConnection.status === "ACTIVE")
      return locale === "sl" ? "Povezano" : "Connected";
    if (activeGoogleCalendarConnection.status === "NEEDS_RECONNECT")
      return locale === "sl"
        ? "Potrebna ponovna povezava"
        : "Reconnect required";
    if (activeGoogleCalendarConnection.status === "ERROR")
      return locale === "sl" ? "Napaka povezave" : "Connection error";
    return (
      activeGoogleCalendarConnection.status?.replace(/_/g, " ") ||
      (locale === "sl" ? "Ni povezano" : "Not connected")
    );
  }, [
    activeGoogleCalendarConnection,
    googleCalendarConnections.length,
    googleCalendarStatusLoading,
    locale,
  ]);

  const googleCalendarStatusTone = useMemo(() => {
    if (!activeGoogleCalendarConnection) return "neutral";
    if (activeGoogleCalendarConnection.status === "ACTIVE") return "success";
    if (activeGoogleCalendarConnection.status === "ERROR") return "danger";
    if (activeGoogleCalendarConnection.status === "NEEDS_RECONNECT")
      return "warning";
    return "neutral";
  }, [activeGoogleCalendarConnection]);

  const stripeStatusTone = useMemo(() => {
    if (!activeStripeAccount?.connected) return "neutral";
    if (
      activeStripeAccount.chargesEnabled &&
      activeStripeAccount.payoutsEnabled
    )
      return "success";
    if (
      activeStripeAccount.chargesEnabled ||
      activeStripeAccount.detailsSubmitted ||
      activeStripeAccount.onboardingStatus === "ONBOARDING_LINK_CREATED"
    )
      return "warning";
    return "neutral";
  }, [activeStripeAccount]);

  const stripeCompactStatusLabel = useMemo(() => {
    if (locale === "sl")
      return activeStripeAccount?.connected ? "Povezano" : "Ni povezano";
    return activeStripeAccount?.connected ? "Connected" : "Not connected";
  }, [activeStripeAccount?.connected, locale]);

  const googleCalendarCompactStatusLabel = useMemo(() => {
    if (locale === "sl")
      return activeGoogleCalendarConnection ? "Povezano" : "Ni povezano";
    return activeGoogleCalendarConnection ? "Connected" : "Not connected";
  }, [activeGoogleCalendarConnection, locale]);

  const toggleIntegrationDetails = (
    integration: "stripe" | "googleCalendar",
  ) => {
    setExpandedIntegrationCard((current) =>
      current === integration ? null : integration,
    );
  };

  const refreshGoogleCalendarStatusSummary = useCallback(async () => {
    setGoogleCalendarStatusLoading(true);
    try {
      const params = me.companyId ? { companyId: me.companyId } : undefined;
      const [{ data: statusData }, { data: conflictData }] = await Promise.all([
        api
          .get("/google/calendar/status", { params })
          .catch(() => ({ data: [] })),
        api
          .get("/google/calendar/conflicts", { params })
          .catch(() => ({ data: [] })),
      ]);
      const activeStatusData: IntegrationGoogleCalendarConnection[] = (
        Array.isArray(statusData) ? statusData : []
      ).filter((connection) => connection.status !== "DISABLED");
      setGoogleCalendarConnections(activeStatusData);
      setGoogleCalendarConflictCount(
        Array.isArray(conflictData) ? conflictData.length : 0,
      );
    } finally {
      setGoogleCalendarStatusLoading(false);
    }
  }, [me.companyId]);

  const refreshIntegrationStatuses = async () => {
    if (!googleCalendarModuleEnabledCommitted) {
      setGoogleCalendarConnections([]);
      setGoogleCalendarConflictCount(0);
      setExpandedIntegrationCard((current) =>
        current === "googleCalendar" ? null : current,
      );
    }
    await Promise.all([
      ...(googleCalendarModuleEnabledCommitted
        ? [refreshGoogleCalendarStatusSummary()]
        : []),
      ...(stripePaymentsAvailableCommitted
        ? [
            api
              .get("/stripe/connect/config")
              .then(({ data }) => setStripeConnectStatus(data || null))
              .catch(() => undefined),
          ]
        : []),
    ]);
  };

  const setIntegrationSubtabAndUrl = (next: IntegrationSubtab) => {
    const safeNext: IntegrationSubtab =
      next === "googleCalendar" && !googleCalendarModuleEnabledCommitted
        ? "status"
        : next;
    setIntegrationSubtab(safeNext);
    navigate(
      safeNext === "status"
        ? "/configuration?tab=integrations"
        : `/configuration?tab=integrations&subtab=${safeNext}`,
    );
    if (safeNext === "status") void refreshIntegrationStatuses();
  };

  const openStripeIntegration = () => {
    if (!stripePaymentsAvailableCommitted) {
      setTab("modules");
      navigate("/configuration?tab=modules");
      return;
    }
    setTab("billing");
    setBillingSubtab("stripe");
    navigate("/configuration?tab=billing&subtab=stripe");
  };

  const openGoogleCalendarIntegration = () => {
    setTab("integrations");
    if (!googleCalendarModuleEnabledCommitted) {
      setIntegrationSubtab("status");
      navigate("/configuration?tab=integrations");
      return;
    }
    setIntegrationSubtab("googleCalendar");
    navigate("/configuration?tab=integrations&subtab=googleCalendar");
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (tab !== "integrations") return;
    if (googleCalendarModuleEnabledCommitted) {
      void refreshGoogleCalendarStatusSummary();
      return;
    }
    setGoogleCalendarConnections([]);
    setGoogleCalendarConflictCount(0);
    setExpandedIntegrationCard((current) =>
      current === "googleCalendar" ? null : current,
    );
  }, [
    isAdmin,
    tab,
    googleCalendarModuleEnabledCommitted,
    refreshGoogleCalendarStatusSummary,
  ]);

  useEffect(() => {
    if (!stripePaymentsAvailableCommitted) {
      setStripeConnectStatus(null);
      setExpandedIntegrationCard((current) =>
        current === "stripe" ? null : current,
      );
      if (billingSubtab === "stripe") setBillingSubtab("paymentMethods");
    }
  }, [stripePaymentsAvailableCommitted, billingSubtab]);

  const saveStripePreference = async (
    patch: Partial<{ mode: string; country: string; businessType: string }>,
  ) => {
    const nextMode = patch.mode ?? stripeConnectStatus?.activeMode ?? "sandbox";
    const nextCountry = patch.country ?? stripeConnectStatus?.country ?? "SI";
    const nextBusinessType =
      patch.businessType ?? stripeConnectStatus?.businessType ?? "company";
    try {
      const { data } = await api.put("/stripe/connect/config", {
        mode: nextMode,
        country: nextCountry,
        businessType: nextBusinessType,
      });
      setStripeConnectStatus(data || null);
    } catch (err: any) {
      showToast(
        "error",
        err?.response?.data?.message ||
          "Failed to save Stripe Connect settings.",
      );
    }
  };

  const startStripeOnboarding = async () => {
    const mode = stripeConnectStatus?.activeMode || "sandbox";
    setStartingStripeOnboarding(true);
    try {
      const returnUrl = `${window.location.origin}/configuration?tab=billing&subtab=stripe&stripeMode=${mode}`;
      const { data } = await api.post("/stripe/connect/onboarding-link", {
        mode,
        country: stripeConnectStatus?.country || "SI",
        businessType: stripeConnectStatus?.businessType || "company",
        returnUrl,
        refreshUrl: returnUrl,
      });
      if (!data?.url)
        throw new Error("Stripe did not return an onboarding URL.");
      await load();
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      showToast(
        "error",
        err?.response?.data?.message ||
          err?.message ||
          "Failed to start Stripe onboarding.",
      );
    } finally {
      setStartingStripeOnboarding(false);
    }
  };

  const refreshStripeConnectStatus = async () => {
    const mode = stripeConnectStatus?.activeMode || "sandbox";
    setRefreshingStripeStatus(true);
    try {
      const { data } = await api.post(
        `/stripe/connect/refresh?mode=${encodeURIComponent(mode)}`,
      );
      setStripeConnectStatus(data || null);
      showToast("success", "Stripe status refreshed.");
    } catch (err: any) {
      showToast(
        "error",
        err?.response?.data?.message || "Failed to refresh Stripe status.",
      );
    } finally {
      setRefreshingStripeStatus(false);
    }
  };

  const saveGuestAppConfiguration = async () => {
    if (!isAdmin) return;
    setSavingSettings(true);
    try {
      const normalizedStart = toTimeInputValue(
        settings.WORKING_HOURS_START,
        "05:00",
      );
      const normalizedEnd = toTimeInputValue(
        settings.WORKING_HOURS_END,
        "23:00",
      );
      const unifiedTenantType = normalizeTenantConfigType(
        settings.MODULE_CONFIG_TYPE || guestAppSettings.tenantType,
      );
      const effectiveSettings = {
        ...settings,
        MODULE_CONFIG_TYPE: unifiedTenantType,
      };
      const effectiveGuestAppSettings = {
        ...guestAppSettings,
        tenantType: unifiedTenantType,
      };
      const effectiveGuestBookingRules =
        normalizeBookingRulesForPaymentLocation(
          guestBookingRules,
          effectiveGuestAppSettings.paymentOnLocation,
        );
      const payload = {
        ...effectiveSettings,
        WORKING_HOURS_START: normalizedStart,
        WORKING_HOURS_END: normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]:
          serializePersonalTaskPresets(personalTaskPresets),
        [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(
          effectiveGuestAppSettings,
        ),
        [GUEST_BOOKING_RULES_KEY]: serializeGuestBookingRules(
          effectiveGuestBookingRules,
        ),
      };
      const { data } = await api.put("/settings", payload);
      const persistedRules = parseGuestBookingRules(
        data?.[GUEST_BOOKING_RULES_KEY] ?? payload[GUEST_BOOKING_RULES_KEY],
      );
      setGuestBookingRules(
        normalizeBookingRulesForPaymentLocation(
          persistedRules,
          effectiveGuestAppSettings.paymentOnLocation,
        ),
      );
      setSettings({
        ...payload,
        ...data,
        WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
        WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
      });
      window.dispatchEvent(new Event("settings-updated"));
      await load();
      showToast("success", t("configConfigurationSaved"));
    } catch (e: any) {
      window.alert(
        e?.response?.data?.message || "Failed to save guest app configuration.",
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const saveWebsiteConfiguration = async () => {
    if (!isAdmin) return;
    setSavingSettings(true);
    try {
      const normalizedStart = toTimeInputValue(
        settings.WORKING_HOURS_START,
        "05:00",
      );
      const normalizedEnd = toTimeInputValue(
        settings.WORKING_HOURS_END,
        "23:00",
      );
      const unifiedTenantType = normalizeTenantConfigType(
        settings.MODULE_CONFIG_TYPE || guestAppSettings.tenantType,
      );
      const effectiveSettings = {
        ...settings,
        MODULE_CONFIG_TYPE: unifiedTenantType,
      };
      const effectiveGuestAppSettings = {
        ...guestAppSettings,
        tenantType: unifiedTenantType,
      };
      const effectiveWebsiteBookingRules =
        normalizeWebsiteBookingRulesForPaymentLocation(
          websiteBookingRules,
          websiteSettings.paymentOnLocation,
        );
      const payload = {
        ...effectiveSettings,
        WORKING_HOURS_START: normalizedStart,
        WORKING_HOURS_END: normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]:
          serializePersonalTaskPresets(personalTaskPresets),
        [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(
          effectiveGuestAppSettings,
        ),
        [GUEST_BOOKING_RULES_KEY]:
          serializeGuestBookingRules(guestBookingRules),
        [WEBSITE_WIDGET_SETTINGS_KEY]:
          serializeWebsiteWidgetSettings(websiteSettings),
        [WEBSITE_BOOKING_RULES_KEY]: serializeWebsiteBookingRules(
          effectiveWebsiteBookingRules,
        ),
      };
      const { data } = await api.put("/settings", payload);
      const persistedSettings = parseWebsiteWidgetSettings(
        data?.[WEBSITE_WIDGET_SETTINGS_KEY] ??
          payload[WEBSITE_WIDGET_SETTINGS_KEY],
      );
      const persistedRules = parseWebsiteBookingRules(
        data?.[WEBSITE_BOOKING_RULES_KEY] ?? payload[WEBSITE_BOOKING_RULES_KEY],
      );
      const nextWebsiteSettings =
        normalizeWebsiteSettingsForPaymentLocation(persistedSettings);
      setWebsiteSettings(nextWebsiteSettings);
      setWebsiteBookingRules(
        normalizeWebsiteBookingRulesForPaymentLocation(
          persistedRules,
          nextWebsiteSettings.paymentOnLocation,
        ),
      );
      setSettings({
        ...payload,
        ...data,
        WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
        WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
      });
      window.dispatchEvent(new Event("settings-updated"));
      await load();
      showToast("success", t("configConfigurationSaved"));
    } catch (e: any) {
      window.alert(
        e?.response?.data?.message ||
          "Failed to save website widget configuration.",
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const uploadGuestAppAsset = async (
    field: GuestAppAssetField,
    file: File | null,
  ) => {
    if (!isAdmin || !file) return;
    const assetTypeByField: Record<
      GuestAppAssetField,
      "card" | "logo" | "icon"
    > = {
      cardImageUrl: "card",
      logoImageUrl: "logo",
      iconImageUrl: "icon",
    };
    setUploadingGuestAsset(field);
    try {
      const body = new FormData();
      body.append("file", file);
      const { data } = await api.post(
        `/settings/guest-app/assets/${assetTypeByField[field]}`,
        body,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      const settingField = String(
        data?.settingField || field,
      ) as GuestAppAssetField;
      const publicUrl = String(data?.publicUrl || "");
      if (!publicUrl) {
        throw new Error("Upload did not return a public URL.");
      }
      setGuestAppSettings((prev) => ({ ...prev, [settingField]: publicUrl }));
      showToast("success", "Guest app asset uploaded.");
    } catch (err: any) {
      showToast(
        "error",
        err?.response?.data?.message || "Failed to upload guest app asset.",
      );
    } finally {
      setUploadingGuestAsset(null);
    }
  };

  const saveTaskPresets = async (nextPresets: PersonalTaskPreset[]) => {
    const normalizedStart = toTimeInputValue(
      settings.WORKING_HOURS_START,
      "05:00",
    );
    const normalizedEnd = toTimeInputValue(settings.WORKING_HOURS_END, "23:00");
    const payload = {
      ...settings,
      WORKING_HOURS_START: normalizedStart,
      WORKING_HOURS_END: normalizedEnd,
      [PERSONAL_TASK_PRESETS_KEY]: serializePersonalTaskPresets(nextPresets),
      [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(guestAppSettings),
      [GUEST_BOOKING_RULES_KEY]: serializeGuestBookingRules(guestBookingRules),
    };
    const { data } = await api.put("/settings", payload);
    const responseHasPresets = Object.prototype.hasOwnProperty.call(
      data || {},
      PERSONAL_TASK_PRESETS_KEY,
    );
    const persistedPresetsRaw = responseHasPresets
      ? data?.[PERSONAL_TASK_PRESETS_KEY]
      : payload[PERSONAL_TASK_PRESETS_KEY];
    setSettings({
      ...payload,
      ...data,
      WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
      WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
      [PERSONAL_TASK_PRESETS_KEY]: String(persistedPresetsRaw || ""),
    });
    const parsed = parsePersonalTaskPresets(String(persistedPresetsRaw || ""));
    setPersonalTaskPresets(
      parsed.length > 0 || nextPresets.length === 0 ? parsed : nextPresets,
    );
    window.dispatchEvent(new Event("settings-updated"));
    showToast("success", t("configConfigurationSaved"));
  };

  const openNewTaskPresetModal = () => {
    setEditingTaskPresetId(null);
    setTaskPresetForm({ name: "", color: DEFAULT_PERSONAL_TASK_COLOR });
    setShowTaskPresetModal(true);
  };

  const openEditTaskPresetModal = (preset: PersonalTaskPreset) => {
    setEditingTaskPresetId(preset.id);
    setTaskPresetForm({
      name: preset.name,
      color: normalizeHexColor(preset.color),
    });
    setShowTaskPresetModal(true);
  };

  const submitTaskPreset = async (e: FormEvent) => {
    e.preventDefault();
    const name = taskPresetForm.name.trim();
    if (!name) return;
    const color = normalizeHexColor(taskPresetForm.color);
    const duplicate = personalTaskPresets.find(
      (p) =>
        p.name.toLowerCase() === name.toLowerCase() &&
        p.id !== editingTaskPresetId,
    );
    if (duplicate) {
      window.alert("A task preset with this name already exists.");
      return;
    }
    const next = editingTaskPresetId
      ? personalTaskPresets.map((p) =>
          p.id === editingTaskPresetId ? { ...p, name, color } : p,
        )
      : [
          ...personalTaskPresets,
          { id: `${Date.now()}-${Math.random()}`, name, color },
        ];
    setSavingTaskPreset(true);
    try {
      await saveTaskPresets(next);
      setShowTaskPresetModal(false);
      setEditingTaskPresetId(null);
      setTaskPresetForm({ name: "", color: DEFAULT_PERSONAL_TASK_COLOR });
    } catch (e: any) {
      window.alert(
        e?.response?.data?.message ||
          "Failed to save predefined personal task.",
      );
    } finally {
      setSavingTaskPreset(false);
    }
  };

  const deleteTaskPreset = async (id: string) => {
    if (!window.confirm("Delete this predefined personal task?")) return;
    const next = personalTaskPresets.filter((p) => p.id !== id);
    setSavingTaskPreset(true);
    try {
      await saveTaskPresets(next);
    } catch (e: any) {
      window.alert(
        e?.response?.data?.message ||
          "Failed to delete predefined personal task.",
      );
    } finally {
      setSavingTaskPreset(false);
    }
  };

  const saveEditedSpace = async (spaceId: number) => {
    if (!isAdmin) return;
    const name = spaceEditDraft.name.trim();
    if (!name) return;
    await api.put(`/spaces/${spaceId}`, {
      name,
      description: spaceEditDraft.description.trim(),
    });
    setEditingSpaceId(null);
    setSpaceEditDraft({ name: "", description: "" });
    load();
  };

  const createSpaceFromDraft = async (tempId: string) => {
    if (!isAdmin) return;
    const draft = newSpaceDrafts.find((item) => item.tempId === tempId);
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    await api.post("/spaces", { name, description: draft.description.trim() });
    setNewSpaceDrafts((prev) => prev.filter((item) => item.tempId !== tempId));
    load();
  };

  const removeSpace = async (id: number) => {
    if (!isAdmin) return;
    if (!window.confirm("Delete this space?")) return;
    await api.delete(`/spaces/${id}`);
    load();
  };

  const startInlinePaymentMethodEdit = (method: PaymentMethod) => {
    setInlineEditingPaymentMethodId(method.id);
    setInlinePaymentMethodForm({
      name: method.name,
      paymentType: method.paymentType,
      fiscalized: method.fiscalized,
      stripeEnabled: method.stripeEnabled,
      widgetEnabled: method.widgetEnabled,
      guestDisplayOrder: method.guestDisplayOrder,
    });
  };

  const cancelInlinePaymentMethodEdit = () => {
    setInlineEditingPaymentMethodId(null);
    setInlinePaymentMethodForm(null);
  };

  const saveInlinePaymentMethodEdit = async (id: number) => {
    if (!isAdmin || !inlinePaymentMethodForm) return;
    const payload = {
      name: inlinePaymentMethodForm.name.trim(),
      paymentType: inlinePaymentMethodForm.paymentType,
      fiscalized: inlinePaymentMethodForm.fiscalized,
      stripeEnabled: inlinePaymentMethodForm.stripeEnabled,
      widgetEnabled: inlinePaymentMethodForm.widgetEnabled,
      guestDisplayOrder: inlinePaymentMethodForm.guestDisplayOrder,
      allowedGuestProductTypes: [...ALL_GUEST_PRODUCT_TYPES],
    };
    if (!payload.name) return;
    if (id === -1) {
      await api.post("/billing/payment-methods", payload);
    } else {
      await api.put(`/billing/payment-methods/${id}`, payload);
    }
    cancelInlinePaymentMethodEdit();
    load();
  };

  const registerBusinessPremise = async () => {
    if (!isAdmin || registeringPremise) return;
    const premiseId = (settings.FISCAL_BUSINESS_PREMISE_ID || "").trim();
    if (!premiseId) {
      setPremiseRegisterResult(t("configFiscalPremiseRequired"));
      return;
    }
    setRegisteringPremise(true);
    setRegisteringPremiseId(premiseId);
    setPremiseRegisterResult("");
    try {
      const { data } = await api.post("/fiscal/premises/register");
      if (data?.success) {
        const existing = parseRegisteredPremises(
          settings[REGISTERED_PREMISES_KEY],
        );
        const next = existing.includes(premiseId)
          ? existing
          : [...existing, premiseId];
        const premisesJson = JSON.stringify(next);
        await api.put("/settings", { [REGISTERED_PREMISES_KEY]: premisesJson });
        setSettings((prev) => ({
          ...prev,
          [REGISTERED_PREMISES_KEY]: premisesJson,
        }));
        setPremiseRegisterResult(
          `${t("configFiscalRegisteredSuccess")} ${data.messageId || "n/a"}`,
        );
      } else {
        setPremiseRegisterResult(
          `${t("configFiscalRegistrationFailed")} ${data?.error || t("configFiscalUnknownError")}`,
        );
      }
    } catch (e: any) {
      setPremiseRegisterResult(
        `${t("configFiscalRegistrationFailed")} ${e?.response?.data?.message || e?.message || t("configFiscalUnknownError")}`,
      );
    } finally {
      setRegisteringPremise(false);
      setRegisteringPremiseId(null);
    }
  };

  const uploadCertificate = async () => {
    if (uploadingCertificate) return;
    if (!certificateFile) {
      window.alert("Please choose a certificate file first (.p12 or .pfx).");
      return;
    }
    setUploadingCertificate(true);
    try {
      const formData = new FormData();
      formData.append("file", certificateFile);
      const { data } = await api.post("/fiscal/certificate", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCertificateMeta(data);
      setCertificateFile(null);
    } catch (e: any) {
      window.alert(
        e?.response?.data?.message || "Failed to upload certificate.",
      );
    } finally {
      setUploadingCertificate(false);
    }
  };

  const removeCertificate = async () => {
    if (!window.confirm("Remove uploaded fiscal certificate?")) return;
    await api.delete("/fiscal/certificate");
    setCertificateMeta({ uploaded: false });
  };

  const registeredPremises = parseRegisteredPremises(
    settings[REGISTERED_PREMISES_KEY],
  );
  const selectedPremiseId = (settings.FISCAL_BUSINESS_PREMISE_ID || "").trim();
  const selectedPremiseConfirmed =
    selectedPremiseId.length > 0 &&
    registeredPremises.includes(selectedPremiseId);
  const tenantQrPayload = String(me.tenantCode || "").trim();
  const guestQrDefaultLink = useMemo(() => {
    const tenant = tenantQrPayload || "2TEN";
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://2ten.si";
    return `${origin}/book/${tenant}`;
  }, [tenantQrPayload]);
  const guestQrInputLink = (
    guestAppSettings.qrGuestUrl || guestQrDefaultLink
  ).trim();
  const guestQrLink = useMemo(
    () =>
      buildGuestQrPayloadLink(
        guestQrInputLink,
        guestQrDefaultLink,
        tenantQrPayload,
      ),
    [guestQrDefaultLink, guestQrInputLink, tenantQrPayload],
  );
  const guestQrColor = normalizeGuestQrColor(guestAppSettings.qrColor);
  const guestQrMatrix = useMemo(() => makeQrMatrix(guestQrLink), [guestQrLink]);
  const guestQrPath = useMemo(
    () => (guestQrMatrix ? qrModulesToPath(guestQrMatrix) : ""),
    [guestQrMatrix],
  );
  const guestQrViewBoxSize = guestQrMatrix
    ? guestQrMatrix.size + QR_QUIET_ZONE * 2
    : 0;
  const guestQrTitle =
    locale === "sl" ? "QR koda za rezervacijo gosta" : "Guest booking QR code";
  const guestQrSvgMarkup = useMemo(() => {
    if (!guestQrMatrix) return "";
    const viewBoxSize = guestQrMatrix.size + QR_QUIET_ZONE * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" role="img" aria-label="${escapeHtml(guestQrTitle)}"><title>${escapeHtml(guestQrTitle)}</title><rect width="100%" height="100%" fill="#ffffff"/><path d="${guestQrPath}" fill="${guestQrColor}"/></svg>`;
  }, [guestQrColor, guestQrMatrix, guestQrPath, guestQrTitle]);

  const saveGuestQrSvg = () => {
    if (!guestQrSvgMarkup) return;
    const link = document.createElement("a");
    link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(guestQrSvgMarkup)}`;
    link.download = `guest-app-${sanitizeDownloadPart(tenantQrPayload || "tenant")}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const saveGuestQrPng = () => {
    if (!guestQrSvgMarkup) return;
    const desiredSize = Math.max(
      256,
      Number.parseInt(guestAppSettings.qrSize, 10) || 1024,
    );
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(guestQrSvgMarkup)}`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = desiredSize;
      canvas.height = desiredSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, desiredSize, desiredSize);
      ctx.drawImage(img, 0, 0, desiredSize, desiredSize);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `guest-app-${sanitizeDownloadPart(tenantQrPayload || "tenant")}-qr.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(pngUrl), 0);
      }, "image/png");
    };
    img.src = svgDataUrl;
  };

  const saveGuestQrPdf = () => {
    if (!guestQrSvgMarkup) return;
    const desiredSize = Math.max(
      256,
      Number.parseInt(guestAppSettings.qrSize, 10) || 1024,
    );
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(guestQrSvgMarkup)}`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = desiredSize;
      canvas.height = desiredSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, desiredSize, desiredSize);
      ctx.drawImage(img, 0, 0, desiredSize, desiredSize);

      const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const base64 = jpegDataUrl.split(",")[1] || "";
      const binary = atob(base64);
      const jpegBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1)
        jpegBytes[i] = binary.charCodeAt(i);

      const pageW = 595.28;
      const pageH = 841.89;
      const maxW = pageW - 80;
      const maxH = pageH - 80;
      const scale = Math.min(maxW / desiredSize, maxH / desiredSize);
      const drawW = desiredSize * scale;
      const drawH = desiredSize * scale;
      const offsetX = (pageW - drawW) / 2;
      const offsetY = (pageH - drawH) / 2;

      const enc = new TextEncoder();
      const objects: BlobPart[] = [];
      const objectOffsets: number[] = [];
      let cursor = 0;
      const pushText = (text: string) => {
        const bytes = enc.encode(text);
        objects.push(bytes);
        cursor += bytes.length;
      };
      const pushBytes = (bytes: Uint8Array) => {
        const chunk = new Uint8Array(bytes.byteLength);
        chunk.set(bytes);
        objects.push(chunk);
        cursor += bytes.length;
      };

      const header = enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
      pushBytes(header);
      const markObj = () => objectOffsets.push(cursor);

      markObj();
      pushText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
      markObj();
      pushText("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n");
      markObj();
      pushText(
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
      );
      markObj();
      pushText(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${desiredSize} /Height ${desiredSize} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
      );
      pushBytes(jpegBytes);
      pushText("\nendstream\nendobj\n");
      const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
      const contentBytes = enc.encode(content);
      markObj();
      pushText(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
      pushBytes(contentBytes);
      pushText("endstream\nendobj\n");

      const xrefStart = cursor;
      pushText(`xref\n0 ${objectOffsets.length + 1}\n0000000000 65535 f \n`);
      for (const off of objectOffsets)
        pushText(`${String(off).padStart(10, "0")} 00000 n \n`);
      pushText(
        `trailer\n<< /Size ${objectOffsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
      );

      const pdfBlob = new Blob(objects, { type: "application/pdf" });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `guest-app-${sanitizeDownloadPart(tenantQrPayload || "tenant")}-qr.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 0);
    };
    img.src = svgDataUrl;
  };

  const copyGuestQrLink = async () => {
    try {
      await navigator.clipboard.writeText(guestQrLink);
      showToast(
        "success",
        locale === "sl" ? "Povezava je kopirana." : "Link copied.",
      );
    } catch {
      window.prompt(
        locale === "sl" ? "Kopirajte povezavo:" : "Copy this link:",
        guestQrLink,
      );
    }
  };

  const visibleGuestPaymentMethodOptions = useMemo(
    () =>
      GUEST_PAYMENT_METHOD_OPTIONS.filter((method) => {
        if (method.id === "online_card")
          return stripePaymentsAvailableCommitted;
        if (method.id === "paypal")
          return paymentGlobalCapabilities.paypalEnabled;
        return true;
      }),
    [paymentGlobalCapabilities.paypalEnabled, stripePaymentsAvailableCommitted],
  );

  useEffect(() => {
    const allowed = new Set(
      visibleGuestPaymentMethodOptions.map((method) => method.id),
    );
    setGuestAppSettings((prev) => {
      const filteredAccepted = prev.acceptedPaymentMethodIds.filter(
        (methodId) => allowed.has(methodId),
      );
      const acceptedPaymentMethodIds =
        filteredAccepted.length > 0
          ? filteredAccepted
          : [visibleGuestPaymentMethodOptions[0]?.id ?? "bank_transfer"];
      const paymentDefaultMethodId = allowed.has(prev.paymentDefaultMethodId)
        ? prev.paymentDefaultMethodId
        : acceptedPaymentMethodIds[0];
      const paymentProvider =
        prev.paymentProvider === "paypal"
          ? paymentGlobalCapabilities.paypalEnabled
            ? "paypal"
            : stripePaymentsAvailableCommitted
              ? "stripe"
              : "bankart"
          : stripePaymentsAvailableCommitted
            ? "stripe"
            : paymentGlobalCapabilities.paypalEnabled
              ? "paypal"
              : "bankart";
      if (
        acceptedPaymentMethodIds.length ===
          prev.acceptedPaymentMethodIds.length &&
        acceptedPaymentMethodIds.every(
          (id, index) => prev.acceptedPaymentMethodIds[index] === id,
        ) &&
        paymentDefaultMethodId === prev.paymentDefaultMethodId &&
        paymentProvider === prev.paymentProvider
      ) {
        return prev;
      }
      return {
        ...prev,
        acceptedPaymentMethodIds,
        paymentDefaultMethodId,
        paymentProvider,
      };
    });
    setWebsiteSettings((prev) => {
      if (prev.paymentOnLocation) {
        return prev.acceptedPaymentMethodIds.length === 0
          ? prev
          : { ...prev, acceptedPaymentMethodIds: [] };
      }
      const filteredAccepted = prev.acceptedPaymentMethodIds.filter(
        (methodId) => allowed.has(methodId),
      );
      const acceptedPaymentMethodIds =
        filteredAccepted.length > 0
          ? filteredAccepted
          : [visibleGuestPaymentMethodOptions[0]?.id ?? "bank_transfer"];
      const paymentDefaultMethodId = allowed.has(prev.paymentDefaultMethodId)
        ? prev.paymentDefaultMethodId
        : acceptedPaymentMethodIds[0];
      if (
        acceptedPaymentMethodIds.length ===
          prev.acceptedPaymentMethodIds.length &&
        acceptedPaymentMethodIds.every(
          (id, index) => prev.acceptedPaymentMethodIds[index] === id,
        ) &&
        paymentDefaultMethodId === prev.paymentDefaultMethodId
      ) {
        return prev;
      }
      return { ...prev, acceptedPaymentMethodIds, paymentDefaultMethodId };
    });
  }, [
    paymentGlobalCapabilities.paypalEnabled,
    stripePaymentsAvailableCommitted,
    visibleGuestPaymentMethodOptions,
  ]);

  const toggleGuestPaymentMethod = (id: GuestPaymentMethodId) => {
    setGuestAppSettings((prev) => {
      const has = prev.acceptedPaymentMethodIds.includes(id);
      const acceptedPaymentMethodIds = has
        ? prev.acceptedPaymentMethodIds.filter((row) => row !== id)
        : [...prev.acceptedPaymentMethodIds, id];
      return {
        ...prev,
        acceptedPaymentMethodIds:
          acceptedPaymentMethodIds.length > 0
            ? acceptedPaymentMethodIds
            : prev.acceptedPaymentMethodIds,
      };
    });
  };

  const toggleWebsitePaymentMethod = (id: GuestPaymentMethodId) => {
    setWebsiteSettings((prev) => {
      const has =
        !prev.paymentOnLocation && prev.acceptedPaymentMethodIds.includes(id);
      const acceptedPaymentMethodIds = has
        ? prev.acceptedPaymentMethodIds.filter((row) => row !== id)
        : [...prev.acceptedPaymentMethodIds.filter((row) => row !== id), id];
      if (acceptedPaymentMethodIds.length === 0) return prev;
      const paymentDefaultMethodId = acceptedPaymentMethodIds.includes(
        prev.paymentDefaultMethodId,
      )
        ? prev.paymentDefaultMethodId
        : acceptedPaymentMethodIds[0];
      return {
        ...prev,
        paymentOnLocation: false,
        acceptedPaymentMethodIds,
        paymentDefaultMethodId,
      };
    });
    setWebsiteBookingRules((prev) =>
      normalizeWebsiteBookingRulesForPaymentLocation(prev, false),
    );
  };

  const toggleWebsitePaymentOnLocation = (checked: boolean) => {
    setWebsiteSettings((prev) => {
      if (checked) {
        return {
          ...prev,
          paymentOnLocation: true,
          acceptedPaymentMethodIds: [],
        };
      }

      const acceptedPaymentMethodIds = normalizeWebsitePaymentMethods(
        prev.acceptedPaymentMethodIds,
      );
      const fallbackMethodId =
        visibleGuestPaymentMethodOptions[0]?.id ?? "bank_transfer";
      const nextAcceptedPaymentMethodIds =
        acceptedPaymentMethodIds.length > 0
          ? acceptedPaymentMethodIds
          : [fallbackMethodId];
      const paymentDefaultMethodId = nextAcceptedPaymentMethodIds.includes(
        prev.paymentDefaultMethodId,
      )
        ? prev.paymentDefaultMethodId
        : nextAcceptedPaymentMethodIds[0];
      return {
        ...prev,
        paymentOnLocation: false,
        acceptedPaymentMethodIds: nextAcceptedPaymentMethodIds,
        paymentDefaultMethodId,
      };
    });
    setWebsiteBookingRules((prev) =>
      normalizeWebsiteBookingRulesForPaymentLocation(prev, checked),
    );
  };

  const billingSubtabs: Array<{ id: BillingSubtab; label: string }> = [
    { id: "settings", label: t("configBillingSettingsTab") },
    { id: "paymentMethods", label: t("configBillingPaymentMethodsTab") },
    ...(stripePaymentsAvailableCommitted
      ? [
          { id: "stripe", label: "Stripe" } satisfies {
            id: BillingSubtab;
            label: string;
          },
        ]
      : []),
    ...(paymentGlobalCapabilities.paypalEnabled
      ? [
          { id: "paypal", label: "PayPal" } satisfies {
            id: BillingSubtab;
            label: string;
          },
        ]
      : []),
    { id: "fiscal", label: t("configBillingFiscalTab") },
    { id: "invoiceDelivery", label: t("configBillingInvoiceDeliveryTab") },
    {
      id: "folioLayout",
      label: locale === "sl" ? "Postavitev računa" : "Invoice layout",
    },
  ];

  useEffect(() => {
    if (!stripePaymentsAvailableCommitted && billingSubtab === "stripe") {
      setBillingSubtab("paymentMethods");
    }
    if (
      !paymentGlobalCapabilities.paypalEnabled &&
      billingSubtab === "paypal"
    ) {
      setBillingSubtab("paymentMethods");
    }
  }, [
    billingSubtab,
    paymentGlobalCapabilities.paypalEnabled,
    stripePaymentsAvailableCommitted,
  ]);

  const resetAndOpenPaymentMethodModal = () => {
    setInlineEditingPaymentMethodId(-1);
    setInlinePaymentMethodForm({
      name: "",
      paymentType: "CASH",
      fiscalized: true,
      stripeEnabled: false,
      widgetEnabled: true,
      guestDisplayOrder: 0,
    });
  };

  const togglePaymentMethodFiscalized = async (method: PaymentMethod) => {
    if (!isAdmin) return;
    const nextFiscalized = !method.fiscalized;
    await api.put(`/billing/payment-methods/${method.id}`, {
      name: method.name,
      paymentType: method.paymentType,
      fiscalized: nextFiscalized,
      stripeEnabled: method.stripeEnabled,
      widgetEnabled: method.widgetEnabled,
      guestDisplayOrder: method.guestDisplayOrder ?? 0,
      allowedGuestProductTypes: [...ALL_GUEST_PRODUCT_TYPES],
    });
    load();
  };

  const visibleBillingPaymentMethods = useMemo(
    () =>
      paymentMethods.filter(
        (method) =>
          stripePaymentsAvailableCommitted ||
          !(method.stripeEnabled || method.paymentType === "CARD"),
      ),
    [paymentMethods, stripePaymentsAvailableCommitted],
  );

  const moduleDraftForDesign =
    modulesDraftDisplay ??
    buildModulesDraftFromCommitted(settings, guestAppSettings);
  const setModuleStringSetting = (key: ModulesStringKey, checked: boolean) => {
    setModulesDraft((prev) => {
      const d =
        prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings);
      if (key === "TYPES_ENABLED") {
        return {
          ...d,
          TYPES_ENABLED: checked ? "true" : "false",
          COURSES_ENABLED: checked ? d.COURSES_ENABLED : "false",
        };
      }
      if (key === "COURSES_ENABLED" && d.TYPES_ENABLED !== "true") {
        return { ...d, COURSES_ENABLED: "false" };
      }
      if (key === "AI_BOOKING_ENABLED") {
        return { ...d, AI_BOOKING_ENABLED: "false" };
      }
      if (key === "SPACES_ENABLED") {
        return {
          ...d,
          SPACES_ENABLED: checked ? "true" : "false",
          MULTIPLE_SESSIONS_PER_SPACE_ENABLED: checked
            ? d.MULTIPLE_SESSIONS_PER_SPACE_ENABLED
            : "false",
        };
      }
      if (
        key === "MULTIPLE_SESSIONS_PER_SPACE_ENABLED" &&
        d.SPACES_ENABLED !== "true"
      ) {
        return { ...d, MULTIPLE_SESSIONS_PER_SPACE_ENABLED: "false" };
      }
      if (key === "GROUP_BOOKING_ENABLED") {
        return {
          ...d,
          GROUP_BOOKING_ENABLED: checked ? "true" : "false",
          MULTIPLE_CLIENTS_PER_SESSION_ENABLED: checked
            ? d.MULTIPLE_CLIENTS_PER_SESSION_ENABLED
            : "false",
        };
      }
      if (
        key === "MULTIPLE_CLIENTS_PER_SESSION_ENABLED" &&
        d.GROUP_BOOKING_ENABLED !== "true"
      ) {
        return { ...d, MULTIPLE_CLIENTS_PER_SESSION_ENABLED: "false" };
      }
      if (key === "BILLING_ENABLED") {
        return {
          ...d,
          BILLING_ENABLED: checked ? "true" : "false",
          BILLING_INVOICES_ENABLED: checked ? "true" : "false",
          BILLING_ONLINE_CARD_PAYMENTS_ENABLED: checked ? "true" : "false",
          BILLING_BANK_TRANSFER_ENABLED: checked ? "true" : "false",
          BILLING_PAYPAL_ENABLED: checked ? "true" : "false",
          BILLING_GIFT_CARDS_ENABLED: checked
            ? d.BILLING_GIFT_CARDS_ENABLED
            : "false",
          BILLING_ADVANCE_ENABLED: checked
            ? d.BILLING_ADVANCE_ENABLED
            : "false",
        };
      }
      if (key === "NOTIFICATIONS_ENABLED" && !checked) {
        return {
          ...d,
          NOTIFICATIONS_ENABLED: "false",
          NOTIFICATIONS_EMAIL_ALERTS_ENABLED: "false",
          NOTIFICATIONS_SMS_ALERTS_ENABLED: "false",
          NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED: "false",
        };
      }
      return { ...d, [key]: checked ? "true" : "false" };
    });
  };
  const setModuleStringSettings = (
    keys: ModulesStringKey[],
    checked: boolean,
  ) => {
    setModulesDraft((prev) => {
      const d =
        prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings);
      const next = { ...d };
      keys.forEach((key) => {
        next[key] =
          key === "AI_BOOKING_ENABLED" ? "false" : checked ? "true" : "false";
      });
      if (next.SPACES_ENABLED !== "true") {
        next.MULTIPLE_SESSIONS_PER_SPACE_ENABLED = "false";
      }
      if (next.TYPES_ENABLED !== "true") {
        next.COURSES_ENABLED = "false";
      }
      if (next.GROUP_BOOKING_ENABLED !== "true") {
        next.MULTIPLE_CLIENTS_PER_SESSION_ENABLED = "false";
      }
      if (next.BILLING_ENABLED !== "true") {
        next.BILLING_INVOICES_ENABLED = "false";
        next.BILLING_ONLINE_CARD_PAYMENTS_ENABLED = "false";
        next.BILLING_BANK_TRANSFER_ENABLED = "false";
        next.BILLING_PAYPAL_ENABLED = "false";
        next.BILLING_GIFT_CARDS_ENABLED = "false";
      }
      if (next.NOTIFICATIONS_ENABLED !== "true") {
        next.NOTIFICATIONS_EMAIL_ALERTS_ENABLED = "false";
        next.NOTIFICATIONS_SMS_ALERTS_ENABLED = "false";
        next.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED = "false";
      }
      return next;
    });
  };
  const setModuleBooleanSetting = (
    key: ModulesBooleanKey,
    checked: boolean,
  ) => {
    setModulesDraft((prev) => {
      const d =
        prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings);
      if (key === "guestAppEnabled" && !checked) {
        return {
          ...d,
          guestAppEnabled: false,
          guestWalletEnabled: false,
          guestOrdersEnabled: false,
          guestBuyTabEnabled: false,
          guestEntitlementsEnabled: false,
          guestInboxEnabled: false,
          NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED: "false",
        };
      }
      if (key === "guestWalletEnabled" && !checked) {
        return {
          ...d,
          guestWalletEnabled: false,
          guestOrdersEnabled: false,
          guestBuyTabEnabled: false,
          guestEntitlementsEnabled: false,
        };
      }
      return { ...d, [key]: checked };
    });
  };
  const setModuleBooleanSettings = (
    keys: ModulesBooleanKey[],
    checked: boolean,
  ) => {
    setModulesDraft((prev) => {
      const d =
        prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings);
      const next = { ...d };
      keys.forEach((key) => {
        next[key] = checked;
      });
      if (!checked && keys.includes("guestAppEnabled")) {
        next.guestWalletEnabled = false;
        next.guestOrdersEnabled = false;
        next.guestBuyTabEnabled = false;
        next.guestEntitlementsEnabled = false;
        next.guestInboxEnabled = false;
        next.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED = "false";
      }
      if (!checked && keys.includes("guestWalletEnabled")) {
        next.guestOrdersEnabled = false;
        next.guestBuyTabEnabled = false;
        next.guestEntitlementsEnabled = false;
      }
      return next;
    });
  };
  const moduleOn = (key: ModulesStringKey) =>
    moduleDraftForDesign[key] === "true";
  const moduleBool = (key: ModulesBooleanKey) => moduleDraftForDesign[key];
  const setModuleConfigType = (value: TenantConfigType) => {
    setModulesDraft((prev) => {
      const d =
        prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings);
      return applyModuleConfigPreset(
        d,
        value,
        settings.SIGNUP_PACKAGE_NAME || me.packageType,
      );
    });
  };
  const toggleExpandedModuleRow = (id: string) => {
    setExpandedModuleRows((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    );
  };

  const billingModuleKeys: ModulesStringKey[] = [
    "BILLING_ENABLED",
    "BILLING_INVOICES_ENABLED",
    "BILLING_ONLINE_CARD_PAYMENTS_ENABLED",
    "BILLING_BANK_TRANSFER_ENABLED",
    "BILLING_PAYPAL_ENABLED",
    "BILLING_GIFT_CARDS_ENABLED",
    "BILLING_ADVANCE_ENABLED",
  ];
  const servicesModuleKeys: ModulesStringKey[] = [
    "TYPES_ENABLED",
    "COURSES_ENABLED",
  ];
  const guestModuleKeys: ModulesBooleanKey[] = [
    "guestAppEnabled",
    "guestWalletEnabled",
    "guestOrdersEnabled",
    "guestBuyTabEnabled",
    "guestEntitlementsEnabled",
    "guestInboxEnabled",
  ];
  const communicationModuleKeys: ModulesStringKey[] = [
    "COMMUNICATION_ENABLED",
    "NOTIFICATIONS_ENABLED",
    "NOTIFICATIONS_EMAIL_ALERTS_ENABLED",
    "NOTIFICATIONS_SMS_ALERTS_ENABLED",
    "NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED",
    "INBOX_ENABLED",
  ];
  const integrationModuleKeys: ModulesStringKey[] = [
    "GOOGLE_CALENDAR_MODULE_ENABLED",
    "SCANNER_MODULE_ENABLED",
  ];

  const modulesDesignGroups: ModulesDesignGroup[] = [
    {
      id: "booking",
      title: t("tabBooking"),
      subtitle: "Manage bookings, spaces and availability.",
      icon: "booking",
      tone: "blue",
      checked: true,
      hideSwitch: true,
      onChange: () => undefined,
      rows: [
        {
          id: "booking-spaces",
          ...moduleVisibilityProps("SPACES_ENABLED"),
          icon: "spaces",
          title: t("configModulesSpacesLabel"),
          checked: moduleOn("SPACES_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("SPACES_ENABLED", checked),
          children: [
            {
              id: "booking-multiple-sessions",
              ...moduleVisibilityProps("MULTIPLE_SESSIONS_PER_SPACE_ENABLED"),
              icon: "spaces",
              title: t("configModulesMultipleSessionsPerSpaceLabel"),
              checked:
                moduleOn("SPACES_ENABLED") &&
                moduleOn("MULTIPLE_SESSIONS_PER_SPACE_ENABLED"),
              disabled: !moduleOn("SPACES_ENABLED"),
              onChange: (checked) =>
                setModuleStringSetting(
                  "MULTIPLE_SESSIONS_PER_SPACE_ENABLED",
                  checked,
                ),
            },
          ],
        },
        {
          id: "booking-online-session-booking",
          ...moduleVisibilityProps("ONLINE_SESSION_BOOKING_ENABLED"),
          icon: "calendar",
          title: "Online Session Booking",
          subtitle: "Allow option to book guest to an online session.",
          checked: moduleOn("ONLINE_SESSION_BOOKING_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("ONLINE_SESSION_BOOKING_ENABLED", checked),
        },
        {
          id: "booking-website-widget",
          ...moduleVisibilityProps("WEBSITE_WIDGET_ENABLED"),
          icon: "website",
          title: t("tabWebsite"),
          checked: moduleOn("WEBSITE_WIDGET_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("WEBSITE_WIDGET_ENABLED", checked),
        },
        {
          id: "booking-no-show",
          ...moduleVisibilityProps("NO_SHOW_ENABLED"),
          icon: "noShow",
          title: t("configModulesNoShowLabel"),
          checked: moduleOn("NO_SHOW_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("NO_SHOW_ENABLED", checked),
        },
        {
          id: "booking-ai",
          ...moduleVisibilityProps("AI_BOOKING_ENABLED"),
          icon: "spark",
          title: `${t("configModulesAiLabel")} (Prihaja kmalu)`,
          checked: false,
          disabled: true,
          onChange: () => setModuleStringSetting("AI_BOOKING_ENABLED", false),
        },
        {
          id: "booking-personal",
          ...moduleVisibilityProps("PERSONAL_ENABLED"),
          icon: "personal",
          title: t("configModulesPersonalLabel"),
          checked: moduleOn("PERSONAL_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("PERSONAL_ENABLED", checked),
        },
        {
          id: "booking-todos",
          ...moduleVisibilityProps("TODOS_ENABLED"),
          icon: "todo",
          title: t("configModulesTodosLabel"),
          checked: moduleOn("TODOS_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("TODOS_ENABLED", checked),
        },
        {
          id: "booking-group-booking",
          ...moduleVisibilityProps("GROUP_BOOKING_ENABLED"),
          icon: "group",
          title: t("configModulesGroupBookingLabel"),
          checked: moduleOn("GROUP_BOOKING_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("GROUP_BOOKING_ENABLED", checked),
          children: [
            {
              id: "booking-multiple-clients",
              ...moduleVisibilityProps("MULTIPLE_CLIENTS_PER_SESSION_ENABLED"),
              icon: "group",
              title: t("configModulesMultipleClientsPerSessionLabel"),
              checked:
                moduleOn("GROUP_BOOKING_ENABLED") &&
                moduleOn("MULTIPLE_CLIENTS_PER_SESSION_ENABLED"),
              disabled: !moduleOn("GROUP_BOOKING_ENABLED"),
              onChange: (checked) =>
                setModuleStringSetting(
                  "MULTIPLE_CLIENTS_PER_SESSION_ENABLED",
                  checked,
                ),
            },
          ],
        },
        {
          id: "booking-session-length",
          icon: "calendar",
          title:
            locale === "sl"
              ? "Dolžina termina (minute)"
              : "Session length (minutes)",
          valueControl: (
            <span className="modules-design-inline-control modules-design-inline-control--with-suffix">
              <input
                type="number"
                min="15"
                step="15"
                value={settings.SESSION_LENGTH_MINUTES || "60"}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    SESSION_LENGTH_MINUTES: event.target.value,
                  })
                }
                aria-label={
                  locale === "sl"
                    ? "Dolžina termina v minutah"
                    : "Session length in minutes"
                }
              />
              <span>min</span>
            </span>
          ),
        },
        {
          id: "booking-calendar-start",
          icon: "calendar",
          title: locale === "sl" ? "Koledar od" : "Calendar from",
          valueControl: (
            <ModernTimePicker
              className="modules-design-inline-control modules-design-time-control"
              value={toTimeInputValue(settings.WORKING_HOURS_START, "05:00")}
              onChange={(nextValue) =>
                setSettings({ ...settings, WORKING_HOURS_START: nextValue })
              }
              ariaLabel={locale === "sl" ? "Koledar od" : "Calendar from"}
            />
          ),
        },
        {
          id: "booking-calendar-end",
          icon: "calendar",
          title: locale === "sl" ? "Koledar do" : "Calendar to",
          valueControl: (
            <ModernTimePicker
              className="modules-design-inline-control modules-design-time-control"
              value={toTimeInputValue(settings.WORKING_HOURS_END, "23:00")}
              onChange={(nextValue) =>
                setSettings({ ...settings, WORKING_HOURS_END: nextValue })
              }
              ariaLabel={locale === "sl" ? "Koledar do" : "Calendar to"}
            />
          ),
        },
      ],
    },
    {
      id: "billing",
      title: t("tabBilling"),
      subtitle: "Invoices, payments and financial management.",
      icon: "billing",
      tone: "green",
      checked: moduleOn("BILLING_ENABLED"),
      hideSwitch: true,
      onChange: (checked) =>
        setModuleStringSettings(billingModuleKeys, checked),
      rows: [
        {
          id: "billing-billing",
          ...moduleVisibilityProps("BILLING_ENABLED"),
          icon: "invoice",
          title: t("tabBilling"),
          checked: moduleOn("BILLING_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("BILLING_ENABLED", checked),
          children: [
            {
              id: "billing-stripe",
              ...moduleVisibilityProps("BILLING_ONLINE_CARD_PAYMENTS_ENABLED"),
              icon: "billing",
              title: "Stripe",
              checked:
                moduleOn("BILLING_ENABLED") &&
                moduleOn("BILLING_ONLINE_CARD_PAYMENTS_ENABLED"),
              disabled: !moduleOn("BILLING_ENABLED"),
              onChange: (checked) =>
                setModuleStringSetting(
                  "BILLING_ONLINE_CARD_PAYMENTS_ENABLED",
                  checked,
                ),
            },
            {
              id: "billing-advance",
              ...moduleVisibilityProps("BILLING_ADVANCE_ENABLED"),
              icon: "wallet",
              title: locale === "sl" ? "Predplačilo" : "Advance",
              checked:
                moduleOn("BILLING_ENABLED") &&
                moduleOn("BILLING_ADVANCE_ENABLED"),
              disabled: !moduleOn("BILLING_ENABLED"),
              onChange: (checked) =>
                setModuleStringSetting("BILLING_ADVANCE_ENABLED", checked),
            },
          ],
        },
      ],
    },
    {
      id: "services",
      title: locale === "sl" ? "Storitve" : "Services",
      subtitle:
        locale === "sl"
          ? "Upravljanje storitev, tipov terminov in ponudbe."
          : "Manage services, booking types and the offer catalog.",
      icon: "services",
      tone: "cyan",
      checked: servicesModuleKeys.some(moduleOn),
      hideSwitch: true,
      onChange: (checked) =>
        setModuleStringSettings(servicesModuleKeys, checked),
      rows: [
        {
          id: "services-service-types",
          ...moduleVisibilityProps("TYPES_ENABLED"),
          icon: "services",
          title: locale === "sl" ? "Storitve" : "Services",
          subtitle:
            locale === "sl"
              ? "Prikaže stran Storitve in izbiro tipa storitve."
              : "Shows the Services page and service type selection.",
          checked: moduleOn("TYPES_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("TYPES_ENABLED", checked),
          children: [
            {
              id: "services-courses",
              ...moduleVisibilityProps("COURSES_ENABLED"),
              icon: "services",
              title: locale === "sl" ? "Tečaji" : "Courses",
              subtitle:
                locale === "sl"
                  ? "Skrije zavihek Tečaji in onemogoči prodajo dostopa do tečajev. Izklop je mogoč samo brez aktivnih dostopov in obstoječih tečajev."
                  : "Hides the Courses tab and blocks course-access sales. Can only be turned off when there are no active course accesses or existing courses.",
              checked: moduleOn("TYPES_ENABLED") && moduleOn("COURSES_ENABLED"),
              disabled: !moduleOn("TYPES_ENABLED"),
              onChange: (checked) =>
                setModuleStringSetting("COURSES_ENABLED", checked),
            },
          ],
        },
      ],
    },
    {
      id: "guest-app",
      title: t("tabGuestApp"),
      subtitle: "Manage the guest experience and in-app features.",
      icon: "guestApp",
      tone: "purple",
      checked: moduleBool("guestAppEnabled"),
      hideSwitch: true,
      onChange: (checked) => setModuleBooleanSettings(guestModuleKeys, checked),
      rows: [
        {
          id: "guest-app-main",
          ...moduleVisibilityProps("guestAppEnabled"),
          icon: "guestApp",
          title: t("tabGuestApp"),
          checked: moduleBool("guestAppEnabled"),
          onChange: (checked) =>
            setModuleBooleanSetting("guestAppEnabled", checked),
          children: [
            {
              id: "guest-app-inbox",
              ...moduleVisibilityProps("guestInboxEnabled"),
              icon: "message",
              title: locale === "sl" ? "Prejeto" : "Inbox",
              checked:
                moduleBool("guestAppEnabled") &&
                moduleBool("guestInboxEnabled"),
              disabled: !moduleBool("guestAppEnabled"),
              onChange: (checked) =>
                setModuleBooleanSetting("guestInboxEnabled", checked),
            },
            {
              id: "guest-app-wallet",
              ...moduleVisibilityProps("guestWalletEnabled"),
              icon: "wallet",
              title: locale === "sl" ? "Denarnica" : "Wallet",
              checked:
                moduleBool("guestAppEnabled") &&
                moduleBool("guestWalletEnabled"),
              disabled: !moduleBool("guestAppEnabled"),
              onChange: (checked) =>
                setModuleBooleanSetting("guestWalletEnabled", checked),
              children: [
                {
                  id: "guest-app-orders",
                  ...moduleVisibilityProps("guestOrdersEnabled"),
                  icon: "invoice",
                  title: locale === "sl" ? "Naročila" : "Orders",
                  checked:
                    moduleBool("guestAppEnabled") &&
                    moduleBool("guestWalletEnabled") &&
                    moduleBool("guestOrdersEnabled"),
                  disabled:
                    !moduleBool("guestAppEnabled") ||
                    !moduleBool("guestWalletEnabled"),
                  onChange: (checked) =>
                    setModuleBooleanSetting("guestOrdersEnabled", checked),
                },
                {
                  id: "guest-app-buy-tab",
                  ...moduleVisibilityProps("guestBuyTabEnabled"),
                  icon: "billing",
                  title: locale === "sl" ? "Nakup" : "Buy",
                  checked:
                    moduleBool("guestAppEnabled") &&
                    moduleBool("guestWalletEnabled") &&
                    moduleOn("BILLING_ENABLED") &&
                    moduleBool("guestBuyTabEnabled"),
                  disabled:
                    !moduleBool("guestAppEnabled") ||
                    !moduleBool("guestWalletEnabled") ||
                    !moduleOn("BILLING_ENABLED"),
                  onChange: (checked) =>
                    setModuleBooleanSetting("guestBuyTabEnabled", checked),
                },
                {
                  id: "guest-app-entitlements",
                  ...moduleVisibilityProps("guestEntitlementsEnabled"),
                  icon: "wallet",
                  title: locale === "sl" ? "Ugodnosti" : "Entitlements",
                  checked:
                    moduleBool("guestAppEnabled") &&
                    moduleBool("guestWalletEnabled") &&
                    moduleBool("guestEntitlementsEnabled"),
                  disabled:
                    !moduleBool("guestAppEnabled") ||
                    !moduleBool("guestWalletEnabled"),
                  onChange: (checked) =>
                    setModuleBooleanSetting(
                      "guestEntitlementsEnabled",
                      checked,
                    ),
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "communication",
      title: locale === "sl" ? "Komunikacija" : "Communication",
      subtitle:
        locale === "sl"
          ? "Obvestila in kanali za obveščanje uporabnikov."
          : "Notifications and channels to keep your users informed.",
      icon: "communication",
      tone: "amber",
      checked: communicationModuleKeys.some(moduleOn),
      hideSwitch: true,
      onChange: (checked) =>
        setModuleStringSettings(communicationModuleKeys, checked),
      rows: [
        {
          id: "communication-notifications",
          ...moduleVisibilityProps("NOTIFICATIONS_ENABLED"),
          icon: "communication",
          title: t("tabNotifications"),
          checked: moduleOn("NOTIFICATIONS_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("NOTIFICATIONS_ENABLED", checked),
          children: [
            {
              id: "communication-email-alerts",
              ...moduleVisibilityProps("NOTIFICATIONS_EMAIL_ALERTS_ENABLED"),
              icon: "message",
              title: locale === "sl" ? "E-poštna obvestila" : "Email alerts",
              checked:
                moduleOn("NOTIFICATIONS_ENABLED") &&
                moduleOn("NOTIFICATIONS_EMAIL_ALERTS_ENABLED"),
              disabled: !moduleOn("NOTIFICATIONS_ENABLED"),
              onChange: (checked) =>
                setModuleStringSetting(
                  "NOTIFICATIONS_EMAIL_ALERTS_ENABLED",
                  checked,
                ),
            },
            {
              id: "communication-sms-alerts",
              ...moduleVisibilityProps("NOTIFICATIONS_SMS_ALERTS_ENABLED"),
              icon: "message",
              title: locale === "sl" ? "SMS obvestila" : "SMS alerts",
              checked:
                moduleOn("NOTIFICATIONS_ENABLED") &&
                moduleOn("NOTIFICATIONS_SMS_ALERTS_ENABLED"),
              disabled: !moduleOn("NOTIFICATIONS_ENABLED"),
              onChange: (checked) =>
                setModuleStringSetting(
                  "NOTIFICATIONS_SMS_ALERTS_ENABLED",
                  checked,
                ),
            },
            {
              id: "communication-guest-app-alerts",
              ...moduleVisibilityProps("NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED"),
              icon: "guestApp",
              title:
                locale === "sl"
                  ? "Obvestila v aplikaciji za goste"
                  : "Guest app alerts",
              checked:
                moduleOn("NOTIFICATIONS_ENABLED") &&
                moduleBool("guestAppEnabled") &&
                moduleOn("NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED"),
              disabled:
                !moduleOn("NOTIFICATIONS_ENABLED") ||
                !moduleBool("guestAppEnabled"),
              onChange: (checked) =>
                setModuleStringSetting(
                  "NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED",
                  checked,
                ),
            },
          ],
        },
        {
          id: "communication-inbox",
          ...moduleVisibilityProps("INBOX_ENABLED"),
          icon: "message",
          title: locale === "sl" ? "Prejeto" : "Inbox",
          checked: moduleOn("INBOX_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("INBOX_ENABLED", checked),
        },
      ],
    },
    {
      id: "integrations",
      title: t("tabIntegrations"),
      subtitle:
        locale === "sl"
          ? "Nastavitve integracij tretjih oseb."
          : "Third-party integrations.",
      icon: "link",
      tone: "rose",
      checked: integrationModuleKeys.some(moduleOn),
      hideSwitch: true,
      onChange: (checked) =>
        setModuleStringSettings(integrationModuleKeys, checked),
      rows: [
        {
          id: "integrations-google-calendar",
          ...moduleVisibilityProps("GOOGLE_CALENDAR_MODULE_ENABLED"),
          icon: "calendar",
          title: t("tabGoogleCalendar"),
          checked: moduleOn("GOOGLE_CALENDAR_MODULE_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("GOOGLE_CALENDAR_MODULE_ENABLED", checked),
        },
        {
          id: "integrations-scanner",
          ...moduleVisibilityProps("SCANNER_MODULE_ENABLED"),
          icon: "scanner",
          title: locale === "sl" ? "Skener" : "Scanner",
          checked: moduleOn("SCANNER_MODULE_ENABLED"),
          onChange: (checked) =>
            setModuleStringSetting("SCANNER_MODULE_ENABLED", checked),
        },
      ],
    },
  ];

  if (!isAdmin) {
    return <Navigate to={getDefaultAllowedRoute(me.packageType)} replace />;
  }

  const tabQuery = query.get("tab");
  const showCompactConfigOverview =
    isCompactConfigViewport && !isConfigTab(tabQuery);
  const getConfigTabLabel = useCallback(
    (tabId: Tab) => {
      if (tabId === "modules")
        return locale === "sl" ? "App nastavitve" : "App settings";
      return t(CONFIG_TAB_LABEL_KEY[tabId]);
    },
    [locale, t],
  );
  const configDetailTitle = getConfigTabLabel(tab);
  const configShellClassName = showCompactConfigOverview
    ? "config-shell config-shell--overview"
    : isCompactConfigViewport
      ? "config-shell config-shell--detail"
      : "config-shell";
  const integrationSubtabs: { id: IntegrationSubtab; label: string }[] = [
    { id: "status", label: locale === "sl" ? "Status" : "Status" },
    ...(googleCalendarModuleEnabledCommitted
      ? [
          {
            id: "googleCalendar" as IntegrationSubtab,
            label: "Google Calendar",
          },
        ]
      : []),
  ];

  return (
    <div className="stack gap-lg">
      <div
        className={configShellClassName}
        data-onboarding-panel="configuration"
      >
        {showCompactConfigOverview ? (
          <section
            className="config-overview-panel"
            aria-label={t("settingsGroup")}
          >
            <div className="config-overview-heading">
              <span className="config-overview-heading-icon">
                <ConfigSettingsIcon />
              </span>
              <span>{t("settingsGroup")}</span>
            </div>
            <div className="config-overview-grid">
              {configNavItems.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={
                    entry.id === "company"
                      ? "config-overview-tile is-featured"
                      : "config-overview-tile"
                  }
                  onClick={() => setTabAndUrl(entry.id)}
                >
                  <span className="config-overview-tile-icon">
                    <ConfigTabIcon kind={entry.icon} />
                  </span>
                  <span className="config-overview-tile-label">
                    {getConfigTabLabel(entry.id)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            {isCompactConfigViewport ? (
              tab === "integrations" ? null : (
                <div className="config-detail-bar">
                  {tab === "company" ? null : (
                    <button
                      type="button"
                      className="config-detail-back"
                      onClick={() => navigate("/configuration")}
                      aria-label={t("settingsGroup")}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M19 12H5" />
                        <path d="M12 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  {tab === "company" ? null : <span>{configDetailTitle}</span>}
                </div>
              )
            ) : (
              <aside className="config-nav">
                <div className="config-nav-title">{t("settingsGroup")}</div>
                {configNavItems.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={
                      tab === entry.id
                        ? "config-nav-item active"
                        : "config-nav-item"
                    }
                    onClick={() => setTabAndUrl(entry.id)}
                  >
                    <ConfigTabIcon kind={entry.icon} />
                    <span>{getConfigTabLabel(entry.id)}</span>
                  </button>
                ))}
              </aside>
            )}
            <div className="config-content">
              {tab === "company" ? (
                <div className="account-management-shell">
                  <style>{`
            .account-management-shell {
              --account-blue: #2167ff;
              --account-blue-soft: #eef4ff;
              --account-ink: #142655;
              --account-muted: #67748e;
              --account-line: #dbe5f2;
              --account-surface: #ffffff;
              --account-soft: #f7f9fc;
              --account-success: #dff6e7;
              --account-success-ink: #2e8a57;
              --account-warn: #fff2c7;
              --account-warn-ink: #d09105;
              --account-danger: #fee2e2;
              --account-danger-ink: #dc2626;
              color: var(--account-ink);
              width: min(100%, 1560px);
            }
            .account-heading {
              margin: 0 0 18px;
              font-size: clamp(30px, 2.8vw, 42px);
              line-height: 1.08;
              letter-spacing: -0.04em;
              font-weight: 800;
            }
            .account-subtabs {
              display: flex;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
              border-bottom: 1px solid rgba(226, 232, 240, 0.95);
              padding-bottom: 10px;
              margin-bottom: 18px;
            }
            .account-subtab {
              appearance: none;
              border: 1px solid transparent;
              background: transparent;
              color: #475569;
              font-weight: 700;
              font-size: 15px;
              padding: 10px 14px;
              border-radius: 10px;
              cursor: pointer;
              box-shadow: none;
              outline: none;
              transition: color .18s ease, background .18s ease, box-shadow .18s ease, border-color .18s ease;
            }
            .account-subtab:hover {
              color: #0f172a;
              background: #f8fafc;
            }
            .account-subtab.active {
              color: #2563eb;
              background: #eaf2ff;
              border-color: rgba(37, 99, 235, 0.16);
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1), 0 3px 10px rgba(37, 99, 235, 0.18);
            }
            .account-card {
              background: var(--account-surface);
              border: 1px solid var(--account-line);
              border-radius: 24px;
              box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
            }
            .account-pill {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: 0 12px;
              min-height: 30px;
              border-radius: 999px;
              font-size: 13px;
              font-weight: 700;
            }
            .account-pill.success { background: var(--account-success); color: var(--account-success-ink); }
            .account-pill.warning { background: var(--account-warn); color: var(--account-warn-ink); }
            .account-pill.danger { background: var(--account-danger); color: var(--account-danger-ink); }
            .account-button,
            .account-button-secondary,
            .account-button-ghost {
              appearance: none;
              border-radius: 14px;
              min-height: 48px;
              padding: 0 20px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              font-weight: 700;
              font-size: 14px;
              cursor: pointer;
              transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
            }
            .account-button:hover,
            .account-button-secondary:hover,
            .account-button-ghost:hover { transform: translateY(-1px); }
            .account-button {
              border: 1px solid transparent;
              color: #fff;
              background: linear-gradient(180deg, #2f73ff 0%, #1a63ff 100%);
              box-shadow: 0 12px 24px rgba(33, 103, 255, 0.24);
            }
            .account-button-secondary {
              border: 1px solid #d5def0;
              background: #fff;
              color: var(--account-ink);
            }
            .account-button-ghost {
              border: 1px solid #d8e4fb;
              background: var(--account-blue-soft);
              color: var(--account-blue);
            }
            .account-company-grid {
              display: grid;
              grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
              gap: 24px;
              margin-bottom: 24px;
            }
            .account-company-section {
              padding: 28px;
            }
            .account-section-title-row,
            .account-company-overview-header,
            .account-form-card-header,
            .account-table-header,
            .account-plan-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
            }
            .account-section-title,
            .account-form-card-header h3,
            .account-table-title,
            .account-plan-header h3,
            .account-company-overview-header h3 {
              margin: 0;
              font-size: 18px;
              line-height: 1.2;
              font-weight: 800;
              color: var(--account-ink);
            }
            .account-profile-list {
              display: grid;
              gap: 16px;
              margin-top: 22px;
            }
            .account-profile-card {
              appearance: none;
              width: 100%;
              border: 1.5px solid var(--account-line);
              background: #fff;
              border-radius: 18px;
              padding: 18px 18px;
              display: grid;
              grid-template-columns: 48px minmax(0, 1fr) auto auto;
              align-items: center;
              gap: 14px;
              text-align: left;
              cursor: pointer;
            }
            .account-profile-card.active {
              border-color: rgba(33, 103, 255, 0.55);
              box-shadow: 0 8px 18px rgba(33, 103, 255, 0.12);
            }
            .account-profile-icon,
            .account-overview-icon,
            .account-metric-icon,
            .account-addon-icon {
              width: 48px;
              height: 48px;
              border-radius: 16px;
              display: grid;
              place-items: center;
              color: var(--account-blue);
              background: linear-gradient(180deg, #f0f5ff 0%, #eaf1ff 100%);
              flex: none;
            }
            .account-profile-name {
              font-size: 16px;
              font-weight: 700;
              color: var(--account-ink);
              line-height: 1.25;
              display: block;
              min-width: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .account-pill-placeholder {
              display: inline-block;
              min-width: 56px;
              height: 28px;
            }
            .account-menu-button {
              appearance: none;
              border: 0;
              background: transparent;
              color: var(--account-blue);
              font-size: 24px;
              cursor: pointer;
              padding: 0 4px;
              border-radius: 10px;
            }
            .account-menu-button:hover { background: #eef4ff; }
            .company-profile-menu-popover {
              position: absolute;
              right: 0;
              top: calc(100% + 8px);
              min-width: 150px;
              padding: 6px;
              border: 1px solid #dbe5f2;
              border-radius: 12px;
              background: #fff;
              box-shadow: 0 16px 30px rgba(15, 23, 42, 0.14);
              z-index: 12;
            }
            .company-profile-menu-item {
              width: 100%;
              border: 0;
              background: transparent;
              min-height: 38px;
              border-radius: 10px;
              padding: 0 12px;
              text-align: left;
              color: #c62828;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
            }
            .company-profile-menu-item:hover { background: #fff2f2; }
            .account-company-overview {
              padding: 28px;
            }
            .account-company-overview-body {
              display: grid;
              grid-template-columns: minmax(240px, 1.2fr) repeat(2, minmax(160px, .6fr));
              gap: 22px;
              margin-top: 20px;
            }
            .account-company-overview-main {
              display: flex;
              align-items: flex-start;
              gap: 16px;
            }
            .account-overview-name {
              display: flex;
              align-items: center;
              gap: 12px;
              margin-bottom: 16px;
            }
            .account-overview-name strong {
              font-size: 16px;
            }
            .account-overview-block {
              padding-left: 22px;
              border-left: 1px solid #e6edf8;
              display: grid;
              gap: 18px;
              align-content: start;
            }
            .account-overview-kv small,
            .account-field-label,
            .account-plan-muted,
            .account-summary-row span,
            .account-usage-row span,
            .account-metric-copy small,
            .account-table td small,
            .account-table th,
            .account-overview-kv div small {
              color: var(--account-muted);
            }
            .account-overview-kv {
              display: grid;
              gap: 4px;
            }
            .account-overview-kv strong {
              font-size: 15px;
            }
            .account-company-form-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 24px;
              margin-bottom: 26px;
            }
            .account-form-card {
              padding: 28px;
            }
            .account-form-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 18px 22px;
              margin-top: 22px;
            }
            .account-field {
              display: grid;
              gap: 10px;
            }
            .account-field.span-2 { grid-column: span 2; }
            .account-field-label {
              font-size: 14px;
              font-weight: 700;
            }
            .account-field-control,
            .account-field-control[readonly] {
              width: 100%;
              min-height: 54px;
              border: 1px solid var(--account-line);
              border-radius: 14px;
              background: #fff;
              padding: 0 16px;
              font-size: 15px;
              color: var(--account-ink);
              outline: none;
            }
            .account-company-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              margin-top: 28px;
            }
            .account-company-footer-actions {
              display: flex;
              align-items: center;
              gap: 14px;
            }
            .account-metrics-grid {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 18px;
              margin-bottom: 22px;
            }
            .account-metric-card {
              padding: 24px;
              display: flex;
              align-items: center;
              gap: 16px;
            }
            .account-metric-copy {
              display: grid;
              gap: 6px;
            }
            .account-metric-copy strong {
              font-size: 18px;
            }
            .account-table-card {
              padding: 0;
              overflow: hidden;
            }
            .account-table-header {
              padding: 18px 24px 14px;
            }
            .account-table-filter {
              border: 1px solid var(--account-line);
              border-radius: 12px;
              background: #fff;
              color: var(--account-muted);
              min-height: 42px;
              padding: 0 16px;
              display: inline-flex;
              align-items: center;
              gap: 10px;
              font-weight: 700;
            }
            .account-table {
              width: 100%;
              border-collapse: collapse;
            }
            .account-table thead th {
              text-align: left;
              font-size: 13px;
              font-weight: 700;
              padding: 16px 24px;
              border-top: 1px solid #edf2fb;
              border-bottom: 1px solid #edf2fb;
              white-space: nowrap;
            }
            .account-table tbody td {
              padding: 16px 24px;
              border-bottom: 1px solid #edf2fb;
              vertical-align: top;
              font-size: 14px;
              color: var(--account-ink);
            }
            .account-table-actions {
              display: flex;
              align-items: center;
              gap: 18px;
              color: var(--account-blue);
              font-weight: 700;
              white-space: nowrap;
            }
            .account-table-actions button,
            .account-table-actions a {
              appearance: none;
              border: 0;
              background: transparent;
              padding: 0;
              color: inherit;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              cursor: pointer;
              font-weight: inherit;
              text-decoration: none;
            }
            .account-table-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 18px 24px;
              color: var(--account-muted);
              font-size: 14px;
            }
            .account-pagination {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .account-page-button {
              width: 38px;
              height: 38px;
              border: 1px solid var(--account-line);
              border-radius: 10px;
              background: #fff;
              display: grid;
              place-items: center;
              color: var(--account-ink);
              font-weight: 700;
            }
            .account-page-button.active {
              border-color: rgba(33, 103, 255, 0.7);
              color: var(--account-blue);
            }
            .account-subscription-grid {
              display: grid;
              grid-template-columns: minmax(0, 1.06fr) minmax(0, 1.34fr);
              gap: 22px;
              margin-bottom: 22px;
            }
            .account-subscription-card {
              padding: 24px;
            }
            .account-current-plan-layout {
              margin-top: 18px;
              border: 1px solid #e6edf8;
              border-radius: 18px;
              padding: 20px;
              display: grid;
              grid-template-columns: 170px minmax(0, 1fr);
              gap: 18px;
            }
            .account-current-plan-brand {
              display: grid;
              align-content: start;
              gap: 14px;
            }
            .account-plan-icon-badge {
              width: 42px;
              height: 42px;
              border-radius: 14px;
              display: grid;
              place-items: center;
              color: #fff;
              background: linear-gradient(180deg, #2f73ff 0%, #165eff 100%);
            }
            .account-current-plan-brand strong {
              font-size: 22px;
              line-height: 1.15;
            }
            .account-price-main {
              font-size: 18px;
              font-weight: 800;
            }
            .account-current-plan-details {
              display: grid;
              gap: 14px;
            }
            .account-current-plan-details-row {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 14px 18px;
            }
            .account-subscription-actions {
              display: flex;
              justify-content: flex-end;
              gap: 14px;
              margin-top: 16px;
            }
            .account-plan-chooser-copy {
              margin: 6px 0 0;
              color: var(--account-muted);
              font-size: 14px;
            }
            .account-plan-interval-toggle {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 4px;
              margin-top: 16px;
              border: 1px solid #dce6f5;
              border-radius: 14px;
              background: #f7faff;
            }
            .account-plan-interval-toggle button {
              min-height: 34px;
              padding: 0 16px;
              border: 0;
              border-radius: 10px;
              background: transparent;
              color: var(--account-muted);
              font-weight: 800;
              cursor: pointer;
            }
            .account-plan-interval-toggle button.active {
              background: #fff;
              color: var(--account-blue);
              box-shadow: 0 6px 14px rgba(15, 35, 80, 0.08);
            }
            .account-plan-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 16px;
              margin-top: 18px;
            }
            .account-plan-option {
              border: 1.5px solid #e3ebf6;
              border-radius: 18px;
              padding: 18px;
              display: grid;
              gap: 14px;
              min-height: 100%;
            }
            .account-plan-option.active {
              border-color: rgba(33, 103, 255, 0.65);
              box-shadow: 0 10px 18px rgba(33, 103, 255, 0.08);
            }
            .account-plan-top {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 12px;
            }
            .account-plan-tag {
              display: inline-flex;
              align-items: center;
              min-height: 28px;
              padding: 0 12px;
              border-radius: 999px;
              background: #edf3ff;
              color: var(--account-blue);
              font-size: 12px;
              font-weight: 700;
            }
            .account-plan-option h4 {
              margin: 0 0 6px;
              font-size: 18px;
              font-weight: 800;
            }
            .account-plan-option ul {
              list-style: none;
              padding: 0;
              margin: 0;
              display: grid;
              gap: 8px;
              font-size: 14px;
              color: var(--account-ink);
            }
            .account-plan-option li {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .account-check {
              width: 16px;
              height: 16px;
              display: inline-grid;
              place-items: center;
              color: var(--account-blue);
              font-size: 16px;
            }
            .account-bottom-grid {
              display: grid;
              grid-template-columns: minmax(0, 1.25fr) minmax(0, .9fr) minmax(0, .9fr);
              gap: 22px;
            }
            .account-addon-list {
              margin-top: 18px;
              display: grid;
              gap: 14px;
            }
            .account-addon-row {
              border: 1px solid #e6edf8;
              border-radius: 16px;
              padding: 16px 18px;
              display: grid;
              grid-template-columns: 48px minmax(0, 1fr);
              gap: 14px;
              align-items: start;
            }
            .account-addon-copy strong {
              display: block;
              margin-bottom: 4px;
            }
            .account-addon-copy small,
            .account-addon-control-card small {
              color: var(--account-muted);
              line-height: 1.35;
            }
            .account-addon-controls {
              grid-column: 1 / -1;
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 12px;
            }
            .account-addon-control-card {
              border: 1px solid #e8eef8;
              border-radius: 14px;
              background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
              padding: 14px;
              display: grid;
              gap: 12px;
            }
            .account-addon-control-top {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              align-items: flex-start;
            }
            .account-addon-control-label {
              display: block;
              color: var(--account-ink);
              font-weight: 800;
              margin-bottom: 3px;
            }
            .account-price-chip {
              flex: 0 0 auto;
              border-radius: 999px;
              padding: 6px 10px;
              background: #eef4ff;
              color: var(--account-blue);
              font-size: 12px;
              font-weight: 800;
              white-space: nowrap;
            }
            .account-addon-footnote {
              color: var(--account-muted);
              font-size: 13px;
            }
            .account-addon-row-full {
              align-items: flex-start;
            }
            .account-addon-sublist {
              grid-column: 2 / -1;
              display: grid;
              gap: 10px;
              min-width: 0;
            }
            .account-addon-option-row {
              border: 1px solid rgba(30, 96, 255, 0.12);
              border-radius: 16px;
              padding: 12px;
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 12px;
              align-items: center;
              background: rgba(248, 251, 255, 0.92);
            }
            .account-addon-option-row strong {
              display: block;
              color: #0f1f4d;
              font-size: 13px;
            }
            .account-addon-option-row small {
              display: block;
              margin-top: 3px;
              color: #7c8db8;
              font-size: 11px;
            }
            .account-addon-option-controls {
              display: flex;
              flex-wrap: wrap;
              justify-content: flex-end;
              gap: 8px;
              align-items: center;
              color: #12245a;
              font-size: 12px;
            }
            .account-addon-option-controls label {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              white-space: nowrap;
            }
            .account-stepper {
              display: inline-flex;
              align-items: center;
              border: 1px solid #e1e9f7;
              border-radius: 12px;
              overflow: hidden;
              min-height: 38px;
            }
            .account-stepper button {
              width: 34px;
              height: 38px;
              border: 0;
              background: #fff;
              color: var(--account-muted);
              cursor: pointer;
              font-size: 18px;
            }
            .account-stepper span {
              min-width: 34px;
              text-align: center;
              font-weight: 700;
            }
            .account-toggle {
              position: relative;
              width: 44px;
              height: 24px;
              border-radius: 999px;
              background: #dbe4ef;
              border: 0;
              cursor: pointer;
              transition: background 160ms ease;
            }
            .account-toggle::after {
              content: '';
              position: absolute;
              top: 3px;
              left: 3px;
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: #fff;
              box-shadow: 0 3px 8px rgba(15, 23, 42, 0.14);
              transition: transform 160ms ease;
            }
            .account-toggle.on {
              background: #30c85a;
            }
            .account-toggle.on::after {
              transform: translateX(20px);
            }
            .account-usage-list {
              margin-top: 18px;
              display: grid;
              gap: 18px;
            }
            .account-usage-row {
              display: grid;
              gap: 8px;
            }
            .account-usage-row strong {
              font-size: 14px;
              font-weight: 700;
            }
            .account-usage-bar {
              height: 6px;
              border-radius: 999px;
              background: #e8eff9;
              overflow: hidden;
            }
            .account-usage-bar span {
              display: block;
              height: 100%;
              border-radius: inherit;
              background: linear-gradient(90deg, #1f67ff 0%, #2e79ff 100%);
            }
            .account-inline-link {
              appearance: none;
              border: 0;
              background: transparent;
              color: var(--account-blue);
              font-weight: 700;
              padding: 0;
              cursor: pointer;
            }
            .account-summary-list {
              margin-top: 18px;
              display: grid;
              gap: 14px;
            }
            .account-summary-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              font-size: 15px;
            }
            .account-summary-row.total strong {
              font-size: 18px;
            }
            .account-summary-row.muted {
              color: var(--account-muted);
              font-size: 13px;
            }
            .account-next-invoice {
              margin-top: 14px;
              border-radius: 16px;
              background: #f2f6ff;
              padding: 18px;
              display: grid;
              gap: 8px;
            }
            .account-next-invoice strong:last-child {
              color: var(--account-blue);
              font-size: 22px;
              justify-self: end;
            }
            @media (max-width: 1320px) {
              .account-addon-controls { grid-template-columns: 1fr; }
              .account-company-grid,
              .account-subscription-grid,
              .account-bottom-grid,
              .account-metrics-grid,
              .account-company-overview-body,
              .account-company-form-grid,
              .account-form-grid,
              .account-plan-grid,
              .account-current-plan-layout,
              .account-current-plan-details-row {
                grid-template-columns: 1fr;
              }
              .account-overview-block { border-left: 0; padding-left: 0; }
              .account-addon-row { grid-template-columns: 48px minmax(0, 1fr); }
              .account-addon-sublist { grid-column: 1 / -1; }
              .account-addon-option-row { grid-template-columns: 1fr; }
              .account-addon-option-controls { justify-content: flex-start; }
              .account-company-footer,
              .account-table-footer { flex-direction: column; align-items: stretch; }
              .account-company-footer-actions,
              .account-pagination,
              .account-subscription-actions { justify-content: stretch; }
              .account-company-footer-actions > *,
              .account-subscription-actions > *,
              .account-section-title-row > *:last-child,
              .account-table-header > *:last-child {
                width: 100%;
              }
            }
            .account-plan-pending-note {
              margin-top: 14px;
              border-radius: 12px;
              background: #fff7ed;
              border: 1px solid #fed7aa;
              color: #9a3412;
              padding: 12px 14px;
              font-size: 14px;
              line-height: 1.45;
            }
            .account-modal-overlay {
              position: fixed;
              inset: 0;
              background: rgba(7, 23, 59, 0.45);
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
              z-index: 1000;
            }
            .account-modal-card {
              width: min(100%, 460px);
              background: #fff;
              border-radius: 18px;
              padding: 24px;
              box-shadow: 0 24px 60px rgba(7, 23, 59, 0.28);
            }
            .account-modal-card h3 {
              margin: 0 0 12px;
              font-size: 18px;
              color: var(--account-ink);
            }
            .account-modal-card p {
              margin: 0;
              color: var(--account-muted);
              font-size: 14px;
              line-height: 1.55;
            }
            .account-modal-actions {
              display: flex;
              justify-content: flex-end;
              gap: 12px;
              margin-top: 22px;
            }
            .account-plan-details-modal {
              width: min(100%, 860px);
              max-height: min(88vh, 920px);
              overflow: auto;
              border-radius: 28px;
              padding: 28px;
            }
            .account-plan-details-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 16px;
            }
            .account-plan-details-header h3 {
              margin: 0;
              font-size: clamp(22px, 2vw, 30px);
              letter-spacing: -0.04em;
            }
            .account-plan-details-close {
              width: 38px;
              height: 38px;
              border-radius: 14px;
              border: 1px solid #d7e2f4;
              background: #fff;
              color: var(--account-muted);
              display: inline-flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              font-weight: 800;
            }
            .account-plan-preview-selected {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 18px;
              border: 1px solid #cfe0ff;
              border-radius: 18px;
              padding: 18px 20px;
              background: #fff;
              margin-bottom: 18px;
            }
            .account-plan-preview-selected strong {
              display: block;
              color: var(--account-ink);
              font-size: 18px;
            }
            .account-plan-preview-selected small {
              color: var(--account-muted);
              line-height: 1.45;
            }
            .account-plan-preview-price {
              text-align: right;
              white-space: nowrap;
            }
            .account-plan-preview-price strong {
              color: #1d4ed8;
              font-size: 26px;
              letter-spacing: -0.04em;
            }
            .account-feature-preview-list {
              list-style: none;
              margin: 0;
              padding: 0;
              display: grid;
              gap: 10px;
            }
            .account-feature-preview-item {
              display: grid;
              grid-template-columns: auto 1fr;
              gap: 14px;
              align-items: center;
              border: 1px solid #dbe7f7;
              border-radius: 16px;
              padding: 14px 16px;
              background: #fff;
              color: #94a3b8;
            }
            .account-feature-preview-item.enabled {
              border-color: #bcd5ff;
              background: #edf5ff;
              color: var(--account-ink);
            }
            .account-feature-preview-number {
              width: 32px;
              height: 32px;
              border-radius: 999px;
              background: #eef4ff;
              color: #8aa3cc;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
            }
            .account-feature-preview-item.enabled .account-feature-preview-number {
              background: #dbeafe;
              color: #2563eb;
            }
            .account-feature-preview-copy strong {
              display: block;
              font-size: 16px;
              color: currentColor;
            }
            .account-feature-preview-copy span {
              display: block;
              margin-top: 3px;
              color: currentColor;
              opacity: 0.88;
              font-size: 14px;
              line-height: 1.4;
            }
            @media (max-width: 640px) {
              .account-plan-details-modal { padding: 22px; border-radius: 22px; }
              .account-plan-preview-selected { flex-direction: column; align-items: flex-start; }
              .account-plan-preview-price { text-align: left; }
            }
          `}</style>
                  <div
                    className="account-subtabs"
                    role="tablist"
                    aria-label="Account management subtabs"
                  >
                    <button
                      type="button"
                      className={
                        accountSubtab === "company"
                          ? "account-subtab active"
                          : "account-subtab"
                      }
                      onClick={() => setAccountSubtabAndUrl("company")}
                    >
                      Podjetje
                    </button>
                    <button
                      type="button"
                      className={
                        accountSubtab === "receivedInvoices"
                          ? "account-subtab active"
                          : "account-subtab"
                      }
                      onClick={() => setAccountSubtabAndUrl("receivedInvoices")}
                    >
                      Prejeti računi
                    </button>
                    <button
                      type="button"
                      className={
                        accountSubtab === "subscription"
                          ? "account-subtab active"
                          : "account-subtab"
                      }
                      onClick={() => setAccountSubtabAndUrl("subscription")}
                    >
                      Naročnina
                    </button>
                    <button
                      type="button"
                      className={
                        accountSubtab === "security"
                          ? "account-subtab active"
                          : "account-subtab"
                      }
                      onClick={() => setAccountSubtabAndUrl("security")}
                    >
                      Varnost
                    </button>
                  </div>

                  {accountSubtab === "company" ? (
                    <>
                      <div className="account-company-grid">
                        <section className="account-card account-company-section">
                          <div className="account-section-title-row">
                            <h3 className="account-section-title">
                              Profil podjetja
                            </h3>
                            <button
                              type="button"
                              className="account-button"
                              onClick={addCompanyProfile}
                            >
                              <span aria-hidden>＋</span>
                              <span>Novo podjetje</span>
                            </button>
                          </div>
                          <div className="account-profile-list">
                            {(companyProfiles.length > 0
                              ? companyProfiles
                              : [companyProfileFromSettings(settings)]
                            ).map((profile) => (
                              <button
                                key={profile.id}
                                type="button"
                                className={
                                  profile.id === selectedCompanyProfile?.id
                                    ? "account-profile-card active"
                                    : "account-profile-card"
                                }
                                onClick={() => selectCompanyProfile(profile.id)}
                              >
                                <span
                                  className="account-profile-icon"
                                  aria-hidden
                                >
                                  <svg
                                    width="22"
                                    height="22"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 21h18" />
                                    <path d="M6 21V7l6-3 6 3v14" />
                                    <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
                                  </svg>
                                </span>
                                <span className="account-profile-name">
                                  {companyProfileDisplayName(profile.name)}
                                </span>
                                {profile.isDefault ? (
                                  <span className="account-pill success">
                                    Glavni
                                  </span>
                                ) : (
                                  <span
                                    className="account-pill-placeholder"
                                    aria-hidden
                                  />
                                )}
                                <span style={{ position: "relative" }}>
                                  <button
                                    type="button"
                                    className="account-menu-button"
                                    aria-label={`Dejanja za profil ${profile.name || "Profil podjetja"}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCompanyProfileMenuOpenId((prev) =>
                                        prev === profile.id ? null : profile.id,
                                      );
                                    }}
                                  >
                                    ⋮
                                  </button>
                                  {companyProfileMenuOpenId === profile.id ? (
                                    <div
                                      className="company-profile-menu-popover"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        className="company-profile-menu-item"
                                        onClick={() =>
                                          deleteCompanyProfile(profile.id)
                                        }
                                      >
                                        Izbriši profil
                                      </button>
                                    </div>
                                  ) : null}
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>

                        <section className="account-card account-company-overview">
                          <div className="account-company-overview-header">
                            <h3>Pregled podjetja</h3>
                          </div>
                          <div className="account-company-overview-body">
                            <div className="account-company-overview-main">
                              <span
                                className="account-overview-icon"
                                aria-hidden
                              >
                                <svg
                                  width="22"
                                  height="22"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3 21h18" />
                                  <path d="M6 21V7l6-3 6 3v14" />
                                  <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
                                </svg>
                              </span>
                              <div>
                                <div className="account-overview-name">
                                  <strong>
                                    {renderCompanyOverviewValue(
                                      companyProfileDisplayName(
                                        selectedCompanyProfile?.name,
                                      ),
                                      "Naziv podjetja",
                                    )}
                                  </strong>
                                  {selectedCompanyProfile?.isDefault ? (
                                    <span className="account-pill success">
                                      Glavni
                                    </span>
                                  ) : selectedCompanyProfile?.id ? (
                                    <button
                                      type="button"
                                      className="account-button-secondary"
                                      onClick={() =>
                                        setDefaultCompanyProfile(
                                          selectedCompanyProfile.id,
                                        )
                                      }
                                    >
                                      Glavni
                                    </button>
                                  ) : null}
                                </div>
                                <div className="account-overview-kv">
                                  <small>ID podjetja</small>
                                  <strong>
                                    {selectedCompanyProfile?.id ||
                                      "550e8400-e29b-41d4-a716-4466555440000"}
                                  </strong>
                                </div>
                              </div>
                            </div>
                            <div className="account-overview-block">
                              <div className="account-overview-kv">
                                <small>Ustvarjeno</small>
                                <strong>
                                  {formatDate(companyOverviewCreatedAt)}
                                </strong>
                              </div>
                              <div className="account-overview-kv">
                                <small>Zadnja posodobitev</small>
                                <strong>
                                  {formatDate(companyOverviewUpdatedAt)}
                                </strong>
                              </div>
                            </div>
                            <div className="account-overview-block">
                              <div className="account-overview-kv">
                                <small>Ustvaril</small>
                                <strong>{companyOwnerName}</strong>
                              </div>
                              <div className="account-overview-kv">
                                <small>Vloga</small>
                                <strong>
                                  {me.role === "CONSULTANT"
                                    ? "Uporabnik"
                                    : "Lastnik"}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>

                      <div className="account-company-form-grid">
                        <section className="account-card account-form-card">
                          <div className="account-form-card-header">
                            <h3>Osnovni podatki</h3>
                          </div>
                          <div className="account-form-grid">
                            <label className="account-field">
                              <span className="account-field-label">
                                Naziv podjetja
                              </span>
                              <input
                                className="account-field-control"
                                value={selectedCompanyProfile?.name || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    name: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                Naslov
                              </span>
                              <input
                                className="account-field-control"
                                value={selectedCompanyProfile?.address || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    address: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                Poštna številka
                              </span>
                              <input
                                className="account-field-control"
                                value={selectedCompanyProfile?.postalCode || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    postalCode: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">Mesto</span>
                              <input
                                className="account-field-control"
                                value={selectedCompanyProfile?.city || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    city: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                Davčna številka
                              </span>
                              <input
                                className="account-field-control"
                                value={selectedCompanyProfile?.vatId || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    vatId: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                E-pošta
                              </span>
                              <input
                                className="account-field-control"
                                type="email"
                                value={selectedCompanyProfile?.email || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    email: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                Telefon
                              </span>
                              <input
                                className="account-field-control"
                                value={selectedCompanyProfile?.telephone || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    telephone: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                Tip podjetja
                              </span>
                              <select
                                className="account-field-control"
                                value={companyTenantType}
                                onChange={(e) =>
                                  setCompanyTenantType(e.target.value)
                                }
                              >
                                {TENANT_CONFIG_TYPE_OPTIONS.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {locale === "sl"
                                      ? option.labelSl
                                      : option.labelEn}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </section>

                        <section className="account-card account-form-card">
                          <div className="account-form-card-header">
                            <h3>Podatki za plačila</h3>
                          </div>
                          <div className="account-form-grid">
                            <label className="account-field">
                              <span className="account-field-label">IBAN</span>
                              <input
                                className="account-field-control"
                                value={selectedCompanyProfile?.iban || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    iban: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                BIC / SWIFT (neobvezno)
                              </span>
                              <input
                                className="account-field-control"
                                value={selectedCompanyProfile?.bic || ""}
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    bic: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                Bank QR purpose code (neobvezno)
                              </span>
                              <input
                                className="account-field-control"
                                value={
                                  selectedCompanyProfile?.bankQrPurposeCode ||
                                  "OTHR"
                                }
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    bankQrPurposeCode: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="account-field">
                              <span className="account-field-label">
                                Bank QR purpose text (neobvezno)
                              </span>
                              <input
                                className="account-field-control"
                                value={
                                  selectedCompanyProfile?.bankQrPurposeText ||
                                  "Plačilo po računu"
                                }
                                onChange={(e) =>
                                  updateSelectedCompanyProfile({
                                    bankQrPurposeText: e.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        </section>
                      </div>

                      <div className="account-company-footer">
                        <button
                          type="button"
                          className="account-button-ghost"
                          onClick={exportCompanyProfile}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M12 3v12" />
                            <path d="m7 10 5 5 5-5" />
                            <path d="M5 21h14" />
                          </svg>
                          Izvozi podatke
                        </button>
                        <div className="account-company-footer-actions">
                          <button
                            type="button"
                            className="account-button"
                            onClick={() => void saveSettings()}
                            disabled={savingSettings}
                          >
                            <GuestSaveIcon />
                            {savingSettings
                              ? "Shranjevanje…"
                              : "Shrani spremembe"}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : accountSubtab === "receivedInvoices" ? (
                    <>
                      <div className="account-metrics-grid">
                        <section className="account-card account-metric-card">
                          <span className="account-metric-icon" aria-hidden>
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M7 3h8l4 4v14H5V3h2z" />
                              <path d="M15 3v5h5" />
                            </svg>
                          </span>
                          <div className="account-metric-copy">
                            <small>Skupaj računov</small>
                            <strong>
                              {accountReceivedInvoiceMetrics.totalCount}
                            </strong>
                            <small>vseh časov</small>
                          </div>
                        </section>
                        <section className="account-card account-metric-card">
                          <span className="account-metric-icon" aria-hidden>
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="2" y="5" width="20" height="14" rx="2" />
                              <path d="M2 10h20" />
                            </svg>
                          </span>
                          <div className="account-metric-copy">
                            <small>Neplačan znesek</small>
                            <strong>
                              {formatAccountEuro(
                                accountReceivedInvoiceMetrics.unpaidGross,
                              )}
                            </strong>
                            <small>skupaj</small>
                          </div>
                        </section>
                        <section className="account-card account-metric-card">
                          <span className="account-metric-icon" aria-hidden>
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="m3 17 6-6 4 4 7-7" />
                              <path d="M14 8h6v6" />
                            </svg>
                          </span>
                          <div className="account-metric-copy">
                            <small>Plačano ta mesec</small>
                            <strong>
                              {formatAccountEuro(
                                accountReceivedInvoiceMetrics.paidThisMonth,
                              )}
                            </strong>
                            <small>tekoči mesec</small>
                          </div>
                        </section>
                        <section className="account-card account-metric-card">
                          <span className="account-metric-icon" aria-hidden>
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 21h18" />
                              <path d="M6 21V7l6-3 6 3v14" />
                            </svg>
                          </span>
                          <div className="account-metric-copy">
                            <small>Izdajatelj</small>
                            <strong>
                              {accountReceivedInvoiceMetrics.issuerLabel}
                            </strong>
                            <small>Glavni najemnik (Platform Admin)</small>
                          </div>
                        </section>
                      </div>

                      <section className="account-card account-table-card">
                        <div className="account-table-header">
                          <h3 className="account-table-title">
                            Prejeti računi
                          </h3>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table className="account-table">
                            <thead>
                              <tr>
                                <th>Št. računa</th>
                                <th>Datum</th>
                                <th>Izdajatelj</th>
                                <th>Vrsta</th>
                                <th>Obdobje</th>
                                <th>Znesek</th>
                                <th>Status</th>
                                <th>Dejanja</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accountReceivedInvoicesLoading ? (
                                <tr>
                                  <td
                                    colSpan={8}
                                    style={{
                                      textAlign: "center",
                                      padding: "28px 16px",
                                    }}
                                  >
                                    Nalagam prejete račune…
                                  </td>
                                </tr>
                              ) : accountReceivedInvoices.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={8}
                                    style={{
                                      textAlign: "center",
                                      padding: "28px 16px",
                                    }}
                                  >
                                    Ni prejetih računov iz Platform Admin
                                    najemnika za povezano podjetje tega tenanta.
                                  </td>
                                </tr>
                              ) : (
                                accountReceivedInvoices.map((invoice) => {
                                  const issuer =
                                    [
                                      invoice.issuerTenantCode,
                                      invoice.issuerName,
                                    ]
                                      .filter(Boolean)
                                      .join(" – ") || "Platform Admin";
                                  const firstDescription =
                                    invoice.itemDescriptions &&
                                    invoice.itemDescriptions.length > 0
                                      ? invoice.itemDescriptions[0]
                                      : "";
                                  const periodLabel = invoice.issueDate
                                    ? formatDate(invoice.issueDate)
                                    : "—";
                                  return (
                                    <tr key={invoice.id}>
                                      <td>
                                        {invoice.billNumber ||
                                          invoice.orderId ||
                                          `#${invoice.id}`}
                                      </td>
                                      <td>
                                        {invoice.issueDate
                                          ? formatDate(invoice.issueDate)
                                          : "—"}
                                      </td>
                                      <td>
                                        <strong>{issuer}</strong>
                                        <br />
                                        <small>Glavni najemnik</small>
                                      </td>
                                      <td>
                                        <strong>
                                          {accountReceivedInvoiceTypeLabel(
                                            invoice,
                                          )}
                                        </strong>
                                        <br />
                                        {firstDescription ? (
                                          <small>{firstDescription}</small>
                                        ) : null}
                                      </td>
                                      <td>{periodLabel}</td>
                                      <td>
                                        <strong>
                                          {formatAccountEuro(
                                            Number(invoice.totalGross || 0),
                                          )}
                                        </strong>
                                        <br />
                                        <small>Skupaj z DDV</small>
                                      </td>
                                      <td>
                                        <span
                                          className={`account-pill ${accountReceivedInvoiceStatusClass(invoice)}`}
                                        >
                                          {accountReceivedInvoiceStatusLabel(
                                            invoice,
                                          )}
                                        </span>
                                      </td>
                                      <td>
                                        <div className="account-table-actions">
                                          <a
                                            href={buildAccountReceivedInvoicePdfUrl(
                                              invoice.id,
                                              true,
                                            )}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <svg
                                              width="16"
                                              height="16"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              aria-hidden
                                            >
                                              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                                              <circle cx="12" cy="12" r="3" />
                                            </svg>{" "}
                                            Ogled
                                          </a>
                                          <a
                                            href={buildAccountReceivedInvoicePdfUrl(
                                              invoice.id,
                                            )}
                                          >
                                            <svg
                                              width="16"
                                              height="16"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              aria-hidden
                                            >
                                              <path d="M12 3v12" />
                                              <path d="m7 10 5 5 5-5" />
                                              <path d="M5 21h14" />
                                            </svg>{" "}
                                            Prenesi
                                          </a>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="account-table-footer">
                          <span>
                            {accountReceivedInvoices.length === 0
                              ? "Prikazujem 0 računov"
                              : `Prikazujem 1–${accountReceivedInvoices.length} od ${accountReceivedInvoices.length} računov`}
                          </span>
                          <div className="account-pagination">
                            <button
                              type="button"
                              className="account-page-button"
                              disabled
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              className="account-page-button active"
                            >
                              1
                            </button>
                            <button
                              type="button"
                              className="account-page-button"
                              disabled
                            >
                              ›
                            </button>
                          </div>
                        </div>
                      </section>
                    </>
                  ) : accountSubtab === "subscription" ? (
                    <>
                      <div className="account-subscription-grid">
                        <section className="account-card account-subscription-card">
                          <div className="account-plan-header">
                            <h3>Trenutni paket</h3>
                            <span className="account-pill success">
                              Aktivno
                            </span>
                          </div>
                          <div className="account-current-plan-layout">
                            <div className="account-current-plan-brand">
                              <span
                                className="account-plan-icon-badge"
                                aria-hidden
                              >
                                {renderAccountPlanIcon(
                                  accountPlanCatalog[subscriptionPackage]
                                    .icon as "leaf" | "star" | "crown",
                                )}
                              </span>
                              <div>
                                <strong>
                                  {
                                    accountPlanCatalog[subscriptionPackage]
                                      .label
                                  }
                                </strong>
                                <div className="account-plan-muted">
                                  {subscriptionInterval === "YEARLY"
                                    ? "Letno obračunavanje"
                                    : "Mesečno obračunavanje"}
                                </div>
                              </div>
                              <div>
                                <div className="account-price-main">
                                  {formatAccountEuro(planPeriodAmount)}{" "}
                                  <span className="account-plan-muted">
                                    / {subscriptionPeriodLabel}
                                  </span>
                                </div>
                                <div className="account-plan-muted">
                                  {subscriptionInterval === "YEARLY"
                                    ? `${formatAccountEuro(accountPlanCatalog[subscriptionPackage].monthly)} / mesec`
                                    : `${formatAccountEuro(accountPlanCatalog[subscriptionPackage].annual)} z DDV / leto`}
                                </div>
                              </div>
                            </div>
                            <div className="account-current-plan-details">
                              <div className="account-current-plan-details-row">
                                <div className="account-overview-kv">
                                  <small>Naslednje podaljšanje</small>
                                  <strong>
                                    {formatDate(
                                      settings.BILLING_SUBSCRIPTION_END ||
                                        "2025-03-15",
                                    )}
                                  </strong>
                                </div>
                                <div className="account-overview-kv">
                                  <small>Status</small>
                                  <strong>
                                    <span className="account-pill success">
                                      Aktivno
                                    </span>
                                  </strong>
                                </div>
                                <div className="account-overview-kv">
                                  <small>Pogodba velja do</small>
                                  <strong>
                                    {formatDate(
                                      settings.BILLING_SUBSCRIPTION_END ||
                                        "2026-03-15",
                                    )}
                                  </strong>
                                </div>
                                <div className="account-overview-kv">
                                  <small>ID naročnine</small>
                                  <strong>{`SUB-${me.tenantCode || "550e8400"}-${String(me.id).padStart(4, "0")}`}</strong>
                                </div>
                              </div>
                            </div>
                          </div>
                          {pendingNextPackageKey && (
                            <div className="account-plan-pending-note">
                              Od{" "}
                              {formatDate(
                                settings.BILLING_SUBSCRIPTION_END || "",
                              )}{" "}
                              preide na paket{" "}
                              <strong>
                                {
                                  accountPlanCatalog[pendingNextPackageKey]
                                    .label
                                }
                              </strong>
                              .
                            </div>
                          )}
                          {pendingUpgradeDiff > 0 && (
                            <div className="account-plan-pending-note">
                              Nadgradnja je aktivna. Razlika{" "}
                              <strong>
                                {formatAccountEuro(pendingUpgradeDiff)}
                              </strong>{" "}
                              bo zaračunana ob naslednjem obračunu.
                            </div>
                          )}
                          <div className="account-subscription-actions">
                            <button
                              type="button"
                              className="account-button-secondary"
                              onClick={() => setAccountPlanDetailsOpen(true)}
                            >
                              Podrobnosti paketa
                            </button>
                          </div>
                        </section>

                        <section className="account-card account-subscription-card">
                          <div className="account-plan-header">
                            <h3>Izberi paket</h3>
                          </div>
                          <p className="account-plan-chooser-copy">
                            Spremeni paket kadarkoli. Spremembe se uporabijo ob
                            naslednjem obračunskem obdobju.
                          </p>
                          <div
                            className="account-plan-interval-toggle"
                            role="group"
                            aria-label="Obračunsko obdobje"
                          >
                            <button
                              type="button"
                              className={
                                subscriptionInterval === "MONTHLY"
                                  ? "active"
                                  : ""
                              }
                              onClick={() =>
                                setSubscriptionBillingInterval("MONTHLY")
                              }
                            >
                              Mesečno
                            </button>
                            <button
                              type="button"
                              className={
                                subscriptionInterval === "YEARLY"
                                  ? "active"
                                  : ""
                              }
                              onClick={() =>
                                setSubscriptionBillingInterval("YEARLY")
                              }
                            >
                              Letno
                            </button>
                          </div>
                          <div className="account-plan-grid">
                            {(
                              Object.keys(accountPlanCatalog) as Array<
                                keyof typeof accountPlanCatalog
                              >
                            ).map((planKey) => {
                              const plan = accountPlanCatalog[planKey];
                              const active = subscriptionPackage === planKey;
                              return (
                                <section
                                  key={planKey}
                                  className={
                                    active
                                      ? "account-plan-option active"
                                      : "account-plan-option"
                                  }
                                >
                                  <div className="account-plan-top">
                                    <span
                                      className="account-overview-icon"
                                      aria-hidden
                                    >
                                      {renderAccountPlanIcon(
                                        plan.icon as "leaf" | "star" | "crown",
                                      )}
                                    </span>
                                    {active ? (
                                      <span className="account-plan-tag">
                                        Trenutni paket
                                      </span>
                                    ) : null}
                                  </div>
                                  <div>
                                    <h4>{plan.label}</h4>
                                    <div className="account-plan-muted">
                                      {plan.subtitle}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="account-price-main">
                                      {formatAccountEuro(
                                        subscriptionInterval === "YEARLY"
                                          ? plan.annual
                                          : plan.monthly,
                                      )}{" "}
                                      <span className="account-plan-muted">
                                        / {subscriptionPeriodLabel}
                                      </span>
                                    </div>
                                    <div className="account-plan-muted">
                                      {subscriptionInterval === "YEARLY"
                                        ? `${formatAccountEuro(plan.monthly)} / mesec`
                                        : `${formatAccountEuro(plan.annual)} z DDV / leto`}
                                    </div>
                                  </div>
                                  <ul>
                                    {plan.features.map((feature) => (
                                      <li key={feature}>
                                        <span className="account-check">✓</span>
                                        <span>{feature}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  <button
                                    type="button"
                                    className="account-button-secondary"
                                    disabled={!isAdmin}
                                    onClick={() =>
                                      requestPackageChange(planKey)
                                    }
                                  >
                                    {active ? "Izbran" : "Izberi paket"}
                                  </button>
                                </section>
                              );
                            })}
                          </div>
                        </section>
                      </div>

                      <div className="account-bottom-grid">
                        <section className="account-card account-subscription-card">
                          <div className="account-plan-header">
                            <h3>Dodatki in razširitve</h3>
                          </div>
                          <p className="account-plan-chooser-copy">
                            Dodaj dodatne kapacitete in storitve glede na
                            potrebe.
                          </p>
                          <div className="account-addon-list">
                            <div className="account-addon-row">
                              <span className="account-addon-icon" aria-hidden>
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                  <circle cx="9" cy="7" r="4" />
                                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                              </span>
                              <div className="account-addon-copy">
                                <strong>Dodatni uporabniki</strong>
                                <small>
                                  Trenutni maksimum je {currentPaidUserLimit}.
                                  Nikoli ne more biti nižji od trenutno aktivnih
                                  uporabnikov ({currentUserCount}).
                                </small>
                              </div>
                              <div className="account-addon-controls">
                                <div className="account-addon-control-card">
                                  <div className="account-addon-control-top">
                                    <div>
                                      <span className="account-addon-control-label">
                                        Dodaj v tekoče obdobje
                                      </span>
                                      <small>
                                        Poveča obstoječi maksimum za ta
                                        obračunski cikel.
                                      </small>
                                    </div>
                                    <span className="account-price-chip">
                                      {formatAccountEuro(
                                        currentCycleUserAddonAmount,
                                      )}{" "}
                                      / {subscriptionPeriodLabel}
                                    </span>
                                  </div>
                                  <div className="account-stepper">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeCurrentCycleUserAdd(-1)
                                      }
                                      disabled={
                                        currentBillingCycleUserAdd <=
                                        minimumCurrentCycleUserAdd
                                      }
                                    >
                                      −
                                    </button>
                                    <span>+{currentBillingCycleUserAdd}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeCurrentCycleUserAdd(1)
                                      }
                                    >
                                      ＋
                                    </button>
                                  </div>
                                  <div className="account-addon-footnote">
                                    Maksimum v tekočem obdobju:{" "}
                                    <strong>{currentEffectiveUserLimit}</strong>
                                  </div>
                                </div>
                                <div className="account-addon-control-card">
                                  <div className="account-addon-control-top">
                                    <div>
                                      <span className="account-addon-control-label">
                                        Skupaj uporabnikov naslednje obdobje
                                      </span>
                                      <small>
                                        Uporabljeno za naslednji predvideni
                                        račun.
                                      </small>
                                    </div>
                                    <span className="account-price-chip">
                                      {formatAccountEuro(usersAddonAmount)} /{" "}
                                      {subscriptionPeriodLabel}
                                    </span>
                                  </div>
                                  <div className="account-stepper">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeNextCycleUserLimit(-1)
                                      }
                                      disabled={
                                        nextInvoiceUserLimit <=
                                        Math.max(1, currentUserCount)
                                      }
                                    >
                                      −
                                    </button>
                                    <span>{nextInvoiceUserLimit}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeNextCycleUserLimit(1)
                                      }
                                    >
                                      ＋
                                    </button>
                                  </div>
                                  <div className="account-addon-footnote">
                                    Minimum:{" "}
                                    <strong>
                                      {Math.max(1, currentUserCount)}
                                    </strong>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="account-addon-row">
                              <span className="account-addon-icon" aria-hidden>
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                              </span>
                              <div className="account-addon-copy">
                                <strong>Dodatni SMSi</strong>
                                <small>
                                  Trenutni SMS maksimum je {currentPaidSmsLimit}
                                  . Naslednje obdobje je lahko tudi 0.
                                </small>
                              </div>
                              <div className="account-addon-controls">
                                <div className="account-addon-control-card">
                                  <div className="account-addon-control-top">
                                    <div>
                                      <span className="account-addon-control-label">
                                        Dodaj v tekoče obdobje
                                      </span>
                                      <small>
                                        Dodajte SMS-e k že zakupljenemu paketu.
                                      </small>
                                    </div>
                                    <span className="account-price-chip">
                                      {formatAccountEuro(
                                        currentCycleSmsAddonAmount,
                                      )}{" "}
                                      / {subscriptionPeriodLabel}
                                    </span>
                                  </div>
                                  <div className="account-stepper">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeCurrentCycleSmsAdd(-50)
                                      }
                                      disabled={
                                        currentBillingCycleSmsAdd <=
                                        minimumCurrentCycleSmsAdd
                                      }
                                    >
                                      −
                                    </button>
                                    <span>+{currentBillingCycleSmsAdd}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeCurrentCycleSmsAdd(50)
                                      }
                                    >
                                      ＋
                                    </button>
                                  </div>
                                  <div className="account-addon-footnote">
                                    Maksimum v tekočem obdobju:{" "}
                                    <strong>{currentEffectiveSmsLimit}</strong>
                                  </div>
                                </div>
                                <div className="account-addon-control-card">
                                  <div className="account-addon-control-top">
                                    <div>
                                      <span className="account-addon-control-label">
                                        Skupaj SMS naslednje obdobje
                                      </span>
                                      <small>
                                        Uporabljeno za naslednji predvideni
                                        račun.
                                      </small>
                                    </div>
                                    <span className="account-price-chip">
                                      {formatAccountEuro(smsAddonAmount)} /{" "}
                                      {subscriptionPeriodLabel}
                                    </span>
                                  </div>
                                  <div className="account-stepper">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeNextCycleSmsCount(-50)
                                      }
                                      disabled={nextInvoiceSmsCount <= 0}
                                    >
                                      −
                                    </button>
                                    <span>{nextInvoiceSmsCount}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeNextCycleSmsCount(50)
                                      }
                                    >
                                      ＋
                                    </button>
                                  </div>
                                  <div className="account-addon-footnote">
                                    Minimum: <strong>0</strong>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {activeAccountAddonItems.length > 0 && (
                              <div className="account-addon-row account-addon-row-full">
                                <span
                                  className="account-addon-icon"
                                  aria-hidden
                                >
                                  <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z" />
                                  </svg>
                                </span>
                                <div className="account-addon-copy">
                                  <strong>Dodatki</strong>
                                  <small>
                                    Dodatki iz registracije so že aktivni. Nove
                                    dodatke lahko aktivirate za tekoče obdobje
                                    ali odstranite iz naslednjega računa.
                                  </small>
                                </div>
                                <div className="account-addon-sublist">
                                  {activeAccountAddonItems.map((addon) => {
                                    const activeNow =
                                      currentEffectiveAddonKeys.includes(
                                        addon.key,
                                      );
                                    const baseActive =
                                      currentBaseAddonKeys.includes(addon.key);
                                    const nextActive =
                                      nextInvoiceAddonKeys.includes(addon.key);
                                    const price = addonUnitPeriodPrice(addon);
                                    return (
                                      <div
                                        key={addon.key}
                                        className="account-addon-option-row"
                                      >
                                        <div>
                                          <strong>{addon.name}</strong>
                                          {addon.description && (
                                            <small>{addon.description}</small>
                                          )}
                                          {baseActive && (
                                            <small>
                                              Aktivno iz registracije do konca
                                              trenutnega obdobja.
                                            </small>
                                          )}
                                        </div>
                                        <div className="account-addon-option-controls">
                                          <label>
                                            <input
                                              type="checkbox"
                                              checked={activeNow}
                                              disabled={baseActive}
                                              onChange={(event) =>
                                                toggleCurrentCycleAddon(
                                                  addon.key,
                                                  event.target.checked,
                                                )
                                              }
                                            />{" "}
                                            Tekoče obdobje
                                          </label>
                                          <label>
                                            <input
                                              type="checkbox"
                                              checked={nextActive}
                                              onChange={(event) =>
                                                toggleNextCycleAddon(
                                                  addon.key,
                                                  event.target.checked,
                                                )
                                              }
                                            />{" "}
                                            Naslednje obdobje
                                          </label>
                                          <span className="account-price-chip">
                                            {formatAccountEuro(price)} /{" "}
                                            {subscriptionPeriodLabel}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          <div
                            className="account-subscription-actions"
                            style={{
                              marginTop: 18,
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              type="button"
                              className="account-button-secondary"
                              onClick={saveSubscriptionCapacity}
                              disabled={savingSubscriptionAddons}
                            >
                              {savingSubscriptionAddons
                                ? "Shranjujem…"
                                : "Shrani dodatke"}
                            </button>
                          </div>
                        </section>

                        <section className="account-card account-subscription-card">
                          <div className="account-plan-header">
                            <h3>Poraba in uporaba</h3>
                          </div>
                          <div className="account-usage-list">
                            <div className="account-usage-row">
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                }}
                              >
                                <strong>Uporabniki</strong>
                                <span>{`${currentUserCount} / ${accountUserLimit}`}</span>
                              </div>
                              <div className="account-usage-bar">
                                <span
                                  style={{
                                    width: `${accountUsagePercent(currentUserCount, accountUserLimit)}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <div className="account-usage-row">
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                }}
                              >
                                <strong>SMS sporočila</strong>
                                <span>{`${currentSmsUsage} / ${accountSmsLimit}`}</span>
                              </div>
                              <div className="account-usage-bar">
                                <span
                                  style={{
                                    width: `${accountUsagePercent(currentSmsUsage, accountSmsLimit)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          <div
                            className="account-subscription-actions"
                            style={{
                              justifyContent: "space-between",
                              marginTop: 24,
                            }}
                          >
                            <button
                              type="button"
                              className="account-inline-link"
                            >
                              Poglej podrobno poročilo
                            </button>
                            <span
                              style={{
                                color: "var(--account-blue)",
                                fontSize: 18,
                              }}
                            >
                              ›
                            </span>
                          </div>
                        </section>

                        <section className="account-card account-subscription-card">
                          <div className="account-plan-header">
                            <h3>Povzetek obračuna</h3>
                          </div>
                          <div className="account-summary-list">
                            <div className="account-summary-row">
                              <span>Paket ({activePlanDetails.label})</span>
                              <strong>
                                {formatAccountEuro(planPeriodAmount)}
                              </strong>
                            </div>
                            {pendingUpgradeDiff > 0 && (
                              <div className="account-summary-row">
                                <span>Razlika ob nadgradnji</span>
                                <strong>
                                  {formatAccountEuro(pendingUpgradeDiff)}
                                </strong>
                              </div>
                            )}
                            {currentBillingCycleUserAdd > 0 && (
                              <div className="account-summary-row">
                                <span>
                                  Uporabniki tekoče obdobje (+
                                  {currentBillingCycleUserAdd})
                                </span>
                                <strong>
                                  {formatAccountEuro(
                                    currentCycleUserAddonAmount,
                                  )}
                                </strong>
                              </div>
                            )}
                            <div className="account-summary-row">
                              <span>
                                Uporabniki naslednje obdobje (
                                {selectedExtraUsersCount} max /{" "}
                                {billableNextInvoiceUsers} dodatnih)
                              </span>
                              <strong>
                                {formatAccountEuro(usersAddonAmount)}
                              </strong>
                            </div>
                            {currentBillingCycleSmsAdd > 0 && (
                              <div className="account-summary-row">
                                <span>
                                  SMS tekoče obdobje (+
                                  {currentBillingCycleSmsAdd})
                                </span>
                                <strong>
                                  {formatAccountEuro(
                                    currentCycleSmsAddonAmount,
                                  )}
                                </strong>
                              </div>
                            )}
                            <div className="account-summary-row">
                              <span>
                                SMS naslednje obdobje ({selectedSmsCount})
                              </span>
                              <strong>
                                {formatAccountEuro(smsAddonAmount)}
                              </strong>
                            </div>
                            {currentCycleAddonAmount > 0 && (
                              <div className="account-summary-row">
                                <span>Dodatki tekoče obdobje</span>
                                <strong>
                                  {formatAccountEuro(currentCycleAddonAmount)}
                                </strong>
                              </div>
                            )}
                            {nextCycleAddonAmount > 0 && (
                              <div className="account-summary-row">
                                <span>Dodatki naslednje obdobje</span>
                                <strong>
                                  {formatAccountEuro(nextCycleAddonAmount)}
                                </strong>
                              </div>
                            )}
                            <div className="account-summary-row total">
                              <span>{subscriptionPeriodSummaryLabel}</span>
                              <strong>
                                {formatAccountEuro(subscriptionSubtotal)}
                              </strong>
                            </div>
                            <div className="account-summary-row">
                              <span>DDV (22%)</span>
                              <strong>
                                {formatAccountEuro(subscriptionVat)}
                              </strong>
                            </div>
                          </div>
                          <div className="account-next-invoice">
                            <span className="account-plan-muted">
                              Ocenjen naslednji račun
                            </span>
                            <strong>
                              {formatDate(
                                settings.BILLING_SUBSCRIPTION_END ||
                                  "2025-03-15",
                              )}
                            </strong>
                            <strong>
                              {formatAccountEuro(estimatedNextInvoice)}
                            </strong>
                          </div>
                          <div
                            className="account-subscription-actions"
                            style={{ marginTop: 16 }}
                          >
                            <button
                              type="button"
                              className="account-button-secondary"
                              style={{ width: "100%" }}
                              onClick={() =>
                                setAccountSubtabAndUrl("receivedInvoices")
                              }
                            >
                              Poglej vse račune
                            </button>
                          </div>
                        </section>
                      </div>

                      {accountPlanDetailsOpen && (
                        <div
                          className="account-modal-overlay"
                          role="presentation"
                          onClick={() => setAccountPlanDetailsOpen(false)}
                        >
                          <div
                            className="account-modal-card account-plan-details-modal"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Podrobnosti paketa"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="account-plan-details-header">
                              <h3>Kaj vključuje ta paket</h3>
                              <button
                                type="button"
                                className="account-plan-details-close"
                                aria-label="Zapri podrobnosti paketa"
                                onClick={() => setAccountPlanDetailsOpen(false)}
                              >
                                ×
                              </button>
                            </div>
                            <div className="account-plan-preview-selected">
                              <div>
                                <strong>
                                  {
                                    accountPlanCatalog[subscriptionPackage]
                                      .label
                                  }
                                </strong>
                                <small>
                                  {
                                    accountPlanCatalog[subscriptionPackage]
                                      .subtitle
                                  }
                                </small>
                              </div>
                              <div className="account-plan-preview-price">
                                <strong>{accountPlanDetailsPrice}</strong>
                                <small>{accountPlanDetailsBillingLabel}</small>
                              </div>
                            </div>
                            <ul className="account-feature-preview-list">
                              {accountPlanDetailsFeatures.map((feature) => {
                                const enabled =
                                  accountPlanDetailsRank >=
                                  accountRegisterPlanRank(feature.minPlan);
                                return (
                                  <li
                                    key={feature.key}
                                    className={
                                      enabled
                                        ? "account-feature-preview-item enabled"
                                        : "account-feature-preview-item"
                                    }
                                  >
                                    <span className="account-feature-preview-number">
                                      {feature.index}
                                    </span>
                                    <span className="account-feature-preview-copy">
                                      <strong>{feature.name}</strong>
                                      <span>{feature.description}</span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                      )}

                      {packageChangeTarget && packageChangePreview && (
                        <div
                          className="account-modal-overlay"
                          role="presentation"
                          onClick={() => {
                            if (!savingPackageChange)
                              setPackageChangeTarget(null);
                          }}
                        >
                          <div
                            className="account-modal-card"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Sprememba paketa"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <h3>Sprememba paketa</h3>
                            {packageChangePreview.isUpgrade ? (
                              <p>
                                Paket nadgrajujete na{" "}
                                <strong>
                                  {
                                    accountPlanCatalog[
                                      packageChangePreview.target
                                    ].label
                                  }
                                </strong>{" "}
                                (
                                {packageChangePreview.targetInterval ===
                                "YEARLY"
                                  ? "letno"
                                  : "mesečno"}
                                ). Nadgradnja se uporabi <strong>takoj</strong>.
                                Razliko{" "}
                                <strong>
                                  {formatAccountEuro(packageChangePreview.diff)}
                                </strong>{" "}
                                bomo zaračunali ob naslednjem obračunu (
                                {formatDate(
                                  settings.BILLING_SUBSCRIPTION_END || "",
                                )}
                                ) skupaj z novim paketom.
                              </p>
                            ) : (
                              <p>
                                Trenutni paket{" "}
                                <strong>
                                  {
                                    accountPlanCatalog[
                                      packageChangePreview.current
                                    ].label
                                  }
                                </strong>{" "}
                                ostane aktiven do konca obračunskega obdobja (
                                {formatDate(
                                  settings.BILLING_SUBSCRIPTION_END || "",
                                )}
                                ). Nato preide na paket{" "}
                                <strong>
                                  {
                                    accountPlanCatalog[
                                      packageChangePreview.target
                                    ].label
                                  }
                                </strong>{" "}
                                (
                                {packageChangePreview.targetInterval ===
                                "YEARLY"
                                  ? "letno"
                                  : "mesečno"}
                                ) z nižjo ceno in funkcionalnostmi.
                              </p>
                            )}
                            <div className="account-modal-actions">
                              <button
                                type="button"
                                className="account-button-secondary"
                                onClick={() => setPackageChangeTarget(null)}
                                disabled={savingPackageChange}
                              >
                                Prekliči
                              </button>
                              <button
                                type="button"
                                className="account-button"
                                onClick={confirmPackageChange}
                                disabled={savingPackageChange}
                              >
                                {savingPackageChange
                                  ? "Shranjujem…"
                                  : "Potrdi spremembo"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : accountSubtab === "security" ? (
                    <SecurityPage embedded />
                  ) : null}
                </div>
              ) : tab === "booking" ? (
                <div className="booking-modern-shell">
                  <style>{`
            .booking-modern-shell {
              --booking-blue: #0f62fe;
              --booking-ink: #07173b;
              --booking-muted: #64708b;
              --booking-line: #dce3ef;
              --booking-soft: #f8fbff;
              width: min(100%, 1540px);
              color: var(--booking-ink);
            }
            .booking-modern-title {
              margin: 0 0 8px;
              font-size: clamp(30px, 3vw, 38px);
              line-height: 1.1;
              letter-spacing: -0.04em;
              font-weight: 850;
              color: var(--booking-ink);
            }
            .booking-modern-subtitle {
              margin: 0 0 26px;
              color: var(--booking-muted);
              font-size: 15px;
              line-height: 1.5;
            }
            .booking-tabs-card {
              margin: 0 0 18px;
            }
            .booking-tabs {
              display: flex;
              align-items: center;
              gap: 10px;
              margin: 0 0 10px;
              border-bottom: 1px solid #edf2f7;
            }
            .booking-tab {
              position: relative;
              appearance: none;
              border: 0;
              background: transparent;
              color: #334155;
              font-weight: 700;
              font-size: 15px;
              padding: 10px 14px;
              cursor: pointer;
              border-radius: 10px;
              box-shadow: none;
              outline: none;
              transition: color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .booking-tab:hover {
              color: #0f172a;
              background: #f8fafc;
            }
            .booking-tab.is-active {
              color: var(--booking-blue);
              background: #eaf2ff;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16), 0 3px 10px rgba(37, 99, 235, 0.18);
            }
            .booking-panel-card {
              max-width: 1320px;
              border: 1px solid rgba(203, 213, 225, 0.88);
              border-radius: 24px;
              background: rgba(255,255,255,0.96);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              padding: clamp(26px, 3vw, 38px);
              overflow: hidden;
            }
            .booking-panel-heading {
              margin-bottom: 28px;
            }
            .booking-panel-heading h3 {
              margin: 0 0 8px;
              color: var(--booking-ink);
              font-size: 24px;
              line-height: 1.2;
              letter-spacing: -0.03em;
              font-weight: 850;
            }
            .booking-panel-heading p {
              margin: 0;
              color: var(--booking-muted);
              font-size: 15px;
              line-height: 1.5;
            }
            .booking-general-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 28px 44px;
            }
            .booking-modern-field {
              display: grid;
              gap: 10px;
              min-width: 0;
            }
            .booking-modern-label-row {
              display: inline-flex;
              align-items: center;
              gap: 7px;
              color: var(--booking-ink);
              font-size: 14px;
              font-weight: 850;
            }
            .booking-input-wrap {
              position: relative;
              display: flex;
              align-items: center;
            }
            .booking-modern-input,
            .booking-modern-select {
              width: 100%;
              min-height: 50px;
              border: 1px solid var(--booking-line);
              border-radius: 12px;
              background: #fff;
              color: var(--booking-ink);
              padding: 0 44px 0 16px;
              font: inherit;
              font-size: 15px;
              font-weight: 650;
              outline: none;
              box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.02);
              transition: border-color 160ms ease, box-shadow 160ms ease;
            }
            .booking-modern-input:focus,
            .booking-modern-select:focus {
              border-color: rgba(15, 98, 254, 0.62);
              box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
            }
            .booking-modern-input[type='time'] {
              position: relative;
            }
            .booking-modern-input[type='time']::-webkit-calendar-picker-indicator {
              position: absolute;
              right: 14px;
              margin: 0;
            }
            .booking-modern-select {
              appearance: none;
              background-image: linear-gradient(45deg, transparent 50%, #0b1c45 50%), linear-gradient(135deg, #0b1c45 50%, transparent 50%);
              background-position: calc(100% - 20px) 22px, calc(100% - 14px) 22px;
              background-size: 6px 6px, 6px 6px;
              background-repeat: no-repeat;
            }
            .booking-input-suffix,
            .booking-input-icon {
              position: absolute;
              right: 14px;
              color: #64748b;
              font-weight: 750;
              pointer-events: none;
            }
            .booking-field-hint {
              margin: -2px 0 0;
              color: var(--booking-muted);
              font-size: 13px;
              line-height: 1.45;
            }
            .booking-save-row {
              display: flex;
              justify-content: flex-end;
              margin-top: 34px;
            }
            .booking-primary-button {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              min-height: 48px;
              min-width: 220px;
              border: 0;
              border-radius: 12px;
              color: #fff;
              background: linear-gradient(180deg, #1c78ff 0%, #0f62fe 100%);
              box-shadow: 0 12px 24px rgba(15, 98, 254, 0.25);
              font-size: 15px;
              font-weight: 850;
              cursor: pointer;
            }
            .booking-primary-button--compact {
              min-height: 34px;
              min-width: 0;
              padding: 0 12px;
              border-radius: 9px;
              font-size: 13px;
              font-weight: 500;
              gap: 6px;
            }
            .booking-primary-button:disabled { opacity: .72; cursor: progress; }
            .booking-content-panel {
              margin-top: 6px;
              border: 1px solid rgba(203, 213, 225, 0.86);
              border-radius: 22px;
              background: #fff;
              padding: 34px;
              box-shadow: 0 18px 50px rgba(15, 23, 42, 0.07);
            }
            .booking-spaces-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 18px;
              margin-bottom: 28px;
            }
            .booking-spaces-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(240px, 1fr));
              gap: 24px;
            }
            .booking-space-card {
              position: relative;
              min-height: 172px;
              border: 1px solid var(--booking-line);
              border-radius: 18px;
              background: #fff;
              padding: 28px 28px 24px;
              box-shadow: 0 12px 28px rgba(8, 23, 58, 0.055);
              overflow: visible;
              transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
            }
            .booking-space-card:hover {
              transform: translateY(-2px);
              border-color: rgba(15, 98, 254, 0.32);
              box-shadow: 0 18px 36px rgba(8, 23, 58, 0.09);
            }
            .booking-space-icon {
              display: grid;
              place-items: center;
              width: 58px;
              height: 58px;
              border-radius: 999px;
              color: var(--booking-blue);
              background: linear-gradient(180deg, #eef4ff 0%, #e7efff 100%);
              margin-bottom: 24px;
            }
            .booking-space-card h4 {
              margin: 0 0 7px;
              color: var(--booking-ink);
              font-size: 22px;
              line-height: 1.1;
              font-weight: 850;
              letter-spacing: -0.03em;
            }
            .booking-space-card p {
              margin: 0 0 16px;
              color: var(--booking-muted);
              font-size: 15px;
            }
            .booking-space-input,
            .booking-space-textarea {
              width: 100%;
              border: 1px solid #d5deee;
              border-radius: 10px;
              padding: 10px 12px;
              font: inherit;
              color: var(--booking-ink);
              background: #fff;
            }
            .booking-space-input {
              margin: 0 0 10px;
              font-size: 18px;
              font-weight: 750;
            }
            .booking-space-textarea {
              min-height: 64px;
              margin: 0 0 14px;
              resize: vertical;
              font-size: 14px;
            }
            .booking-space-inline-actions {
              display: flex;
              gap: 8px;
              margin-bottom: 12px;
            }
            .booking-space-inline-btn {
              min-height: 32px;
              border-radius: 8px;
              border: 1px solid #c8d6f3;
              background: #f8fbff;
              color: var(--booking-ink);
              padding: 0 10px;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
            }
            .booking-space-inline-btn.primary {
              border-color: #0f62fe;
              background: #0f62fe;
              color: #fff;
            }
            .booking-status-pill {
              display: inline-flex;
              align-items: center;
              min-height: 28px;
              padding: 0 12px;
              border-radius: 999px;
              background: #dcfce7;
              color: #087443;
              font-size: 13px;
              font-weight: 850;
            }
            .booking-space-menu-wrap {
              position: absolute;
              top: 24px;
              right: 24px;
            }
            .booking-space-menu-trigger {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 32px;
              height: 32px;
              padding: 0;
              margin: 0;
              border: 0;
              border-radius: 9px;
              background: transparent;
              color: #0b1c45;
              cursor: pointer;
            }
            .booking-space-menu-trigger svg {
              display: block;
              flex-shrink: 0;
            }
            .booking-space-menu-trigger:hover { background: #eef4ff; color: var(--booking-blue); }
            .booking-space-menu-popover {
              position: absolute;
              right: 0;
              top: calc(100% + 8px);
              min-width: 132px;
              padding: 6px;
              border: 1px solid #dbe4f0;
              border-radius: 10px;
              background: #fff;
              box-shadow: 0 12px 28px rgba(8, 23, 58, 0.12);
              z-index: 20;
            }
            .booking-space-menu-popover button {
              width: 100%;
              min-height: 34px;
              border: 0;
              border-radius: 8px;
              padding: 0 10px;
              text-align: left;
              background: transparent;
              color: var(--booking-ink);
              font-size: 13px;
              font-weight: 750;
              cursor: pointer;
            }
            .booking-space-menu-popover button:hover { background: #f1f5ff; }
            .booking-space-menu-popover button.danger { color: #b42318; }
            .booking-space-menu-popover button.danger:hover { background: #fef3f2; }
            .booking-empty-spaces {
              padding: 52px 20px;
              border: 1px dashed #cbd5e1;
              border-radius: 18px;
              background: #f8fbff;
              text-align: center;
              color: var(--booking-muted);
              font-weight: 700;
            }
            @media (max-width: 1180px) {
              .booking-spaces-grid { grid-template-columns: repeat(2, minmax(220px, 1fr)); }
            }
            @media (max-width: 920px) {
              .booking-modern-shell {
                width: 100%;
              }
              .booking-panel-card {
                border: 0;
                border-radius: 0;
                background: transparent;
                box-shadow: none;
                padding: 0 clamp(18px, 4.8vw, 30px) 38px;
                overflow: visible;
              }
              .booking-tabs-card {
                width: 100%;
                min-width: 0;
                margin: 0 0 clamp(42px, 9vw, 58px);
                padding: 10px;
                border: 1px solid rgba(203, 213, 225, 0.92);
                border-radius: 24px;
                background: rgba(255, 255, 255, 0.98);
                box-shadow: 0 12px 28px rgba(15, 23, 42, 0.035), inset 0 1px 0 rgba(255, 255, 255, 0.95);
              }
              .booking-tabs {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                margin: 0;
                overflow: visible;
                border-bottom: 0;
              }
              .booking-tab {
                min-height: 74px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 10px 12px;
                border-radius: 19px;
                color: #17223a;
                font-size: clamp(18px, 4.4vw, 23px);
                line-height: 1.12;
                font-weight: 850;
                text-align: center;
                white-space: normal;
              }
              .booking-tab:hover {
                background: #f7faff;
              }
              .booking-tab.is-active {
                color: var(--booking-blue);
                background: linear-gradient(180deg, #f0f6ff 0%, #e9f2ff 100%);
                box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12), 0 10px 24px rgba(37, 99, 235, 0.12);
              }
              .booking-tabs .booking-tab:only-child {
                grid-column: 1 / -1;
              }
              .booking-content-panel {
                margin-top: 0;
                border: 0;
                border-radius: 0;
                background: transparent;
                box-shadow: none;
                padding: 0;
              }
              .booking-panel-heading {
                margin-bottom: clamp(30px, 6.8vw, 42px);
              }
              .booking-panel-heading h3 {
                margin: 0 0 20px;
                font-size: clamp(44px, 11.5vw, 64px);
                line-height: .98;
                letter-spacing: -0.06em;
              }
              .booking-panel-heading p {
                max-width: 100%;
                font-size: clamp(21px, 5.2vw, 31px);
                line-height: 1.45;
              }
              .booking-general-grid,
              .booking-spaces-grid {
                grid-template-columns: 1fr;
              }
              .booking-general-grid {
                gap: 22px;
              }
              .booking-modern-field {
                width: 100%;
              }
              .booking-modern-input,
              .booking-modern-select {
                min-height: 58px;
                border-radius: 14px;
                font-size: 17px;
              }
              .booking-save-row {
                margin-top: 30px;
              }
              .booking-spaces-header {
                flex-direction: column;
                align-items: stretch;
                gap: 30px;
                margin-bottom: 38px;
              }
              .booking-primary-button {
                width: 100%;
                min-height: 64px;
                border-radius: 12px;
                font-size: clamp(18px, 4.6vw, 24px);
                box-shadow: 0 16px 30px rgba(15, 98, 254, 0.26);
              }
              .booking-primary-button--compact {
                width: 100%;
                min-height: 64px;
                padding: 0 18px;
                font-size: clamp(18px, 4.5vw, 24px);
              }
              .booking-spaces-grid {
                gap: 28px;
              }
              .booking-space-card {
                width: 100%;
                min-height: 154px;
                display: grid;
                grid-template-columns: auto minmax(0, 1fr);
                grid-template-rows: auto auto;
                align-items: center;
                column-gap: 26px;
                row-gap: 8px;
                padding: 24px 66px 24px 24px;
                border-radius: 18px;
                box-shadow: 0 12px 28px rgba(8, 23, 58, 0.045);
              }
              .booking-space-icon {
                grid-column: 1;
                grid-row: 1 / 3;
                width: 82px;
                height: 82px;
                margin: 0;
              }
              .booking-space-card h4 {
                grid-column: 2;
                grid-row: 1;
                margin: 0 0 -2px;
                min-width: 0;
                font-size: clamp(30px, 7.2vw, 44px);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .booking-space-card p {
                grid-column: 2;
                grid-row: 2;
                margin: 0;
                min-width: 0;
                font-size: clamp(20px, 4.8vw, 29px);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .booking-status-pill {
                display: none;
              }
              .booking-space-menu-wrap {
                top: 22px;
                right: 18px;
              }
              .booking-space-menu-trigger {
                width: 40px;
                height: 40px;
                border-radius: 12px;
              }
              .booking-space-card .booking-space-input,
              .booking-space-card .booking-space-textarea,
              .booking-space-card .booking-space-inline-actions {
                grid-column: 2 / -1;
              }
            }
            @media (max-width: 460px) {
              .booking-panel-card {
                padding: 0 14px 34px;
              }
              .booking-tabs-card {
                margin-bottom: 38px;
                padding: 8px;
                border-radius: 22px;
              }
              .booking-tab {
                min-height: 62px;
                border-radius: 16px;
                font-size: 18px;
              }
              .booking-panel-heading {
                margin-bottom: 28px;
              }
              .booking-panel-heading h3 {
                margin-bottom: 18px;
                font-size: 42px;
              }
              .booking-panel-heading p {
                font-size: 23px;
              }
              .booking-spaces-header {
                gap: 28px;
                margin-bottom: 34px;
              }
              .booking-primary-button,
              .booking-primary-button--compact {
                min-height: 58px;
                font-size: 18px;
              }
              .booking-space-card {
                min-height: 132px;
                column-gap: 18px;
                padding: 20px 52px 20px 18px;
              }
              .booking-space-icon {
                width: 72px;
                height: 72px;
              }
              .booking-space-card h4 {
                font-size: 28px;
              }
              .booking-space-card p {
                font-size: 21px;
              }
              .booking-space-menu-wrap {
                top: 16px;
                right: 12px;
              }
            }
          `}</style>
                  <section className="booking-panel-card">
                    <div className="booking-content-panel">
                      {bookingSubtab === "spaces" ? (
                        <div>
                          <div className="booking-spaces-header">
                            <div
                              className="booking-panel-heading"
                              style={{ marginBottom: 0 }}
                            >
                              <p>
                                Upravljajte prostore, v katerih se izvajajo
                                storitve ali aktivnosti.
                              </p>
                            </div>
                            <button
                              type="button"
                              className="booking-primary-button booking-primary-button--compact"
                              onClick={() => {
                                const tempId = `new-space-${Date.now()}`;
                                setNewSpaceDrafts((prev) => [
                                  { tempId, name: "", description: "" },
                                  ...prev,
                                ]);
                              }}
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                              Novi prostor
                            </button>
                          </div>
                          {spaces.length === 0 &&
                          newSpaceDrafts.length === 0 ? (
                            <div className="booking-empty-spaces">
                              Ni prostorov. Kliknite »Novi prostor«, da
                              ustvarite prvi prostor.
                            </div>
                          ) : (
                            <div className="booking-spaces-grid">
                              {newSpaceDrafts.map((draft, index) => (
                                <article
                                  key={draft.tempId}
                                  className="booking-space-card"
                                >
                                  <span
                                    className="booking-space-icon"
                                    aria-hidden
                                  >
                                    <svg
                                      width="28"
                                      height="28"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3 21h18" />
                                      <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                                      <path d="M10 12h.01" />
                                    </svg>
                                  </span>
                                  <input
                                    className="booking-space-input"
                                    value={draft.name}
                                    placeholder="Ime prostora"
                                    onChange={(e) =>
                                      setNewSpaceDrafts((prev) =>
                                        prev.map((item) =>
                                          item.tempId === draft.tempId
                                            ? { ...item, name: e.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  <textarea
                                    className="booking-space-textarea"
                                    value={draft.description}
                                    placeholder="Opis (neobvezno)"
                                    onChange={(e) =>
                                      setNewSpaceDrafts((prev) =>
                                        prev.map((item) =>
                                          item.tempId === draft.tempId
                                            ? {
                                                ...item,
                                                description: e.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  <div className="booking-space-inline-actions">
                                    <button
                                      type="button"
                                      className="booking-space-inline-btn primary"
                                      onClick={() =>
                                        void createSpaceFromDraft(draft.tempId)
                                      }
                                    >
                                      Shrani
                                    </button>
                                    <button
                                      type="button"
                                      className="booking-space-inline-btn"
                                      onClick={() =>
                                        setNewSpaceDrafts((prev) =>
                                          prev.filter(
                                            (item) =>
                                              item.tempId !== draft.tempId,
                                          ),
                                        )
                                      }
                                    >
                                      Prekliči
                                    </button>
                                  </div>
                                  <span className="booking-status-pill">
                                    Novo
                                  </span>
                                </article>
                              ))}
                              {spaces.map((space) => (
                                <article
                                  key={space.id}
                                  className="booking-space-card"
                                >
                                  <span
                                    className="booking-space-icon"
                                    aria-hidden
                                  >
                                    <svg
                                      width="28"
                                      height="28"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3 21h18" />
                                      <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                                      <path d="M10 12h.01" />
                                    </svg>
                                  </span>
                                  {editingSpaceId === space.id ? (
                                    <>
                                      <input
                                        className="booking-space-input"
                                        value={spaceEditDraft.name}
                                        placeholder="Ime prostora"
                                        onChange={(e) =>
                                          setSpaceEditDraft((prev) => ({
                                            ...prev,
                                            name: e.target.value,
                                          }))
                                        }
                                      />
                                      <textarea
                                        className="booking-space-textarea"
                                        value={spaceEditDraft.description}
                                        placeholder="Opis (neobvezno)"
                                        onChange={(e) =>
                                          setSpaceEditDraft((prev) => ({
                                            ...prev,
                                            description: e.target.value,
                                          }))
                                        }
                                      />
                                      <div className="booking-space-inline-actions">
                                        <button
                                          type="button"
                                          className="booking-space-inline-btn primary"
                                          onClick={() =>
                                            void saveEditedSpace(space.id)
                                          }
                                        >
                                          Shrani
                                        </button>
                                        <button
                                          type="button"
                                          className="booking-space-inline-btn"
                                          onClick={() => {
                                            setEditingSpaceId(null);
                                            setSpaceEditDraft({
                                              name: "",
                                              description: "",
                                            });
                                          }}
                                        >
                                          Prekliči
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <h4>{space.name}</h4>
                                      <p>{space.description || "Prostor"}</p>
                                    </>
                                  )}
                                  <span className="booking-status-pill">
                                    Aktivno
                                  </span>
                                  <div className="booking-space-menu-wrap">
                                    <button
                                      type="button"
                                      className="booking-space-menu-trigger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenSpaceMenuId((prev) =>
                                          prev === space.id ? null : space.id,
                                        );
                                      }}
                                      aria-label="Dejanja prostora"
                                      aria-expanded={
                                        openSpaceMenuId === space.id
                                      }
                                    >
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 16 16"
                                        aria-hidden="true"
                                        fill="currentColor"
                                      >
                                        <circle cx="8" cy="3.5" r="1.35" />
                                        <circle cx="8" cy="8" r="1.35" />
                                        <circle cx="8" cy="12.5" r="1.35" />
                                      </svg>
                                    </button>
                                    {openSpaceMenuId === space.id ? (
                                      <div
                                        className="booking-space-menu-popover"
                                        role="dialog"
                                        aria-label="Dejanja prostora"
                                      >
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenSpaceMenuId(null);
                                            setEditingSpaceId(space.id);
                                            setSpaceEditDraft({
                                              name: space.name,
                                              description:
                                                space.description || "",
                                            });
                                          }}
                                        >
                                          Uredi
                                        </button>
                                        <button
                                          type="button"
                                          className="danger"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenSpaceMenuId(null);
                                            void removeSpace(space.id);
                                          }}
                                        >
                                          Izbriši
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </section>
                </div>
              ) : tab === "billing" ? (
                <div className="billing-modern-shell">
                  <style>{`
            .billing-modern-shell {
              --billing-blue: #2563eb;
              --billing-blue-dark: #1d4ed8;
              --billing-ink: #0f1b3d;
              --billing-muted: #64748b;
              --billing-line: #dbe4f0;
              --billing-soft: #f8fafc;
              --billing-soft-blue: #eff6ff;
              --billing-green: #16a34a;
              --billing-red: #ef4444;
              width: min(100%, 1600px);
              color: var(--billing-ink);
            }
            .billing-modern-shell button { font-family: inherit; }
            .billing-tabs-card {
              border-bottom: 1px solid rgba(226, 232, 240, 0.95);
              padding-bottom: 10px;
              margin-bottom: 14px;
            }
            .billing-subtabs {
              display: flex;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
            }
            .billing-subtab {
              appearance: none;
              border: 1px solid transparent;
              background: transparent;
              color: #475569;
              font-weight: 700;
              font-size: 15px;
              padding: 10px 14px;
              border-radius: 10px;
              cursor: pointer;
              box-shadow: none;
              outline: none;
              transition: color .18s ease, background .18s ease, box-shadow .18s ease, border-color .18s ease;
            }
            .billing-subtab:hover {
              color: #0f172a;
              background: #f8fafc;
            }
            .billing-subtab.active {
              color: #2563eb;
              background: #eaf2ff;
              border-color: rgba(37, 99, 235, 0.16);
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1), 0 3px 10px rgba(37, 99, 235, 0.18);
            }
            .billing-main-panel { padding: 22px; }
            .billing-page-head {
              margin: 0 0 22px;
            }
            .billing-page-head h2 {
              margin: 0 0 8px;
              font-size: clamp(28px, 2.75vw, 38px);
              line-height: 1.05;
              letter-spacing: -0.045em;
              font-weight: 900;
              color: var(--billing-ink);
            }
            .billing-page-head p {
              margin: 0;
              color: var(--billing-muted);
              font-size: 16px;
              line-height: 1.5;
              max-width: 820px;
            }
            .billing-card {
              border: 1px solid rgba(203, 213, 225, 0.82);
              border-radius: 24px;
              background: rgba(255,255,255,0.98);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              overflow: hidden;
            }
            .billing-card-pad { padding: 28px 34px 30px; }
            .billing-section-title {
              margin: 0;
              font-size: 18px;
              font-weight: 900;
              letter-spacing: -0.025em;
              color: var(--billing-ink);
            }
            .billing-section-kicker {
              display: block;
              color: var(--billing-muted);
              font-size: 13px;
              line-height: 1.4;
              margin-top: 4px;
            }
            .billing-section-heading-row {
              display: flex;
              align-items: center;
              gap: 16px;
              margin-bottom: 34px;
            }
            .billing-section-icon {
              width: 54px;
              height: 54px;
              border-radius: 18px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              color: var(--billing-blue);
              background: #eaf2ff;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1);
              flex: 0 0 auto;
            }
            .billing-settings-card {
              padding: 30px 32px;
            }
            .billing-settings-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 0;
              align-items: start;
            }
            .billing-settings-field {
              display: grid;
              gap: 10px;
              padding-right: 34px;
            }
            .billing-settings-field + .billing-settings-field {
              padding-right: 0;
              padding-left: 34px;
              border-left: 1px solid #e5edf7;
            }
            .billing-label {
              display: block;
              color: var(--billing-ink);
              font-size: 14px;
              font-weight: 850;
              line-height: 1.2;
            }
            .billing-hint {
              color: var(--billing-muted);
              font-size: 13px;
              line-height: 1.45;
            }
            .billing-input,
            .billing-select,
            .billing-textarea {
              width: 100%;
              min-height: 48px;
              border: 1px solid var(--billing-line);
              border-radius: 12px;
              background: #fff;
              color: #172554;
              font-size: 14px;
              line-height: 1.35;
              padding: 12px 14px;
              outline: none;
              box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.02);
              transition: border-color .18s ease, box-shadow .18s ease;
            }
            .billing-textarea { min-height: 88px; resize: vertical; }
            .billing-input:focus,
            .billing-select:focus,
            .billing-textarea:focus {
              border-color: rgba(37, 99, 235, 0.68);
              box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.10);
            }
            .billing-input[readonly],
            .billing-input:disabled {
              background: #f8fafc;
              color: #64748b;
            }
            .billing-actions-row {
              display: flex;
              align-items: center;
              justify-content: flex-end;
              gap: 12px;
              margin-top: 28px;
            }
            .billing-bottom-bar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 18px;
              margin-top: 38px;
              padding: 14px 14px 14px 18px;
              border: 1px solid rgba(37, 99, 235, 0.18);
              border-radius: 14px;
              background: linear-gradient(180deg, #f8fbff 0%, #f3f8ff 100%);
            }
            .billing-bottom-left {
              display: flex;
              align-items: center;
              gap: 12px;
              color: #4b5875;
              font-size: 14px;
              line-height: 1.45;
            }
            .billing-bottom-status {
              margin-left: auto;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              color: #4b5875;
              font-size: 14px;
              font-weight: 750;
              white-space: nowrap;
            }
            .billing-info-dot {
              width: 25px;
              height: 25px;
              border-radius: 50%;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              flex: 0 0 auto;
              background: #eaf2ff;
              color: var(--billing-blue);
              font-weight: 900;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
            }
            .billing-primary-button,
            .billing-secondary-button,
            .billing-danger-button {
              appearance: none;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              min-height: 44px;
              border-radius: 12px;
              padding: 10px 20px;
              font-size: 14px;
              font-weight: 850;
              cursor: pointer;
              transition: transform .18s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
            }
            .billing-primary-button {
              border: 1px solid transparent;
              color: #fff;
              background: linear-gradient(180deg, #2674ff 0%, var(--billing-blue) 100%);
              box-shadow: 0 12px 22px rgba(37, 99, 235, 0.28), inset 0 1px 0 rgba(255,255,255,0.2);
            }
            .billing-primary-button:hover { transform: translateY(-1px); box-shadow: 0 16px 28px rgba(37, 99, 235, 0.32); }
            .billing-secondary-button {
              border: 1px solid rgba(203, 213, 225, 0.92);
              color: #172554;
              background: #fff;
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
            }
            .billing-secondary-button:hover { border-color: rgba(37, 99, 235, 0.42); color: var(--billing-blue); }
            .billing-danger-button {
              border: 1px solid rgba(239, 68, 68, 0.46);
              color: var(--billing-red);
              background: #fff;
            }
            .billing-danger-button:hover { background: #fff7f7; }
            .billing-primary-button:disabled,
            .billing-secondary-button:disabled,
            .billing-danger-button:disabled { opacity: .62; cursor: not-allowed; transform: none; }
            .billing-table-card { width: 100%; }
            .billing-card-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 26px 30px 22px;
            }
            .billing-card-header-main {
              display: flex;
              align-items: center;
              gap: 16px;
              min-width: 0;
            }
            .billing-method-table {
              padding: 0 24px 24px;
            }
            .billing-method-head,
            .billing-method-row {
              display: grid;
              grid-template-columns: minmax(240px, 1.2fr) minmax(150px, .7fr) minmax(180px, .8fr) 180px;
              gap: 20px;
              align-items: center;
            }
            .billing-method-head {
              padding: 18px 18px 12px;
              color: #475569;
              font-size: 13px;
              font-weight: 850;
            }
            .billing-head-with-info {
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .billing-method-row {
              border-top: 1px solid #e8eef6;
              min-height: 72px;
              padding: 12px 18px;
              transition: background .18s ease;
            }
            .billing-method-row:first-of-type { border-top: 0; }
            .billing-method-row:hover { background: #f8fbff; }
            .billing-method-table-body {
              border: 1px solid #e2e8f0;
              border-radius: 15px;
              overflow: hidden;
              background: #fff;
            }
            .billing-method-name {
              display: flex;
              align-items: center;
              gap: 14px;
              min-width: 0;
              font-weight: 800;
              color: #16213e;
            }
            .billing-method-icon {
              width: 44px;
              height: 44px;
              border-radius: 999px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              flex: 0 0 auto;
              background: #f1f5f9;
              color: #334155;
            }
            .billing-method-icon--cash { color: #16a34a; background: #dcfce7; }
            .billing-method-icon--card { color: #2563eb; background: #dbeafe; }
            .billing-method-icon--bank-transfer { color: #d97706; background: #fef3c7; }
            .billing-method-icon--other { color: #7c3aed; background: #f3e8ff; }
            .billing-pill {
              display: inline-flex;
              align-items: center;
              gap: 7px;
              width: fit-content;
              min-height: 28px;
              border-radius: 999px;
              padding: 6px 11px;
              font-size: 12.5px;
              font-weight: 850;
              line-height: 1;
              white-space: nowrap;
            }
            .billing-pill--neutral { background: #f1f5f9; color: #475569; }
            .billing-pill--success { background: #dcfce7; color: #16a34a; }
            .billing-pill--danger { background: #fee2e2; color: #ef4444; }
            .billing-status-dot {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: currentColor;
            }
            .billing-row-switch-button {
              appearance: none;
              border: 0;
              background: transparent;
              padding: 0;
              width: fit-content;
              cursor: pointer;
            }
            .billing-row-switch {
              position: relative;
              display: inline-flex;
              width: 46px;
              height: 26px;
              border-radius: 999px;
              background: #cbd5e1;
              box-shadow: inset 0 1px 3px rgba(15, 23, 42, .16);
              transition: background .18s ease;
            }
            .billing-row-switch::after {
              content: '';
              position: absolute;
              width: 20px;
              height: 20px;
              top: 3px;
              left: 3px;
              border-radius: 50%;
              background: #fff;
              box-shadow: 0 3px 8px rgba(15, 23, 42, .22);
              transition: transform .18s ease;
            }
            .billing-row-switch.is-on { background: var(--billing-blue); }
            .billing-row-switch.is-on::after { transform: translateX(20px); }
            .billing-row-actions {
              display: flex;
              align-items: center;
              gap: 10px;
              justify-content: flex-end;
            }
            .billing-action-btn {
              appearance: none;
              width: 48px;
              height: 48px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border-radius: 11px;
              border: 1px solid #dde6f2;
              background: #fff;
              box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
              color: #172554;
              cursor: pointer;
              transition: color .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .billing-action-btn--edit:hover {
              border-color: rgba(37, 99, 235, 0.34);
              color: #1d4ed8;
              background: #f8fbff;
              box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
            }
            .billing-action-btn--delete {
              color: #ef4444;
              border-color: rgba(239, 68, 68, 0.24);
            }
            .billing-action-btn--delete:hover {
              background: #fff7f7;
              border-color: rgba(239, 68, 68, 0.46);
              box-shadow: 0 4px 12px rgba(239, 68, 68, 0.16);
            }
            .billing-fiscal-toggle-button {
              appearance: none;
              border: 0;
              background: transparent;
              padding: 0;
              width: fit-content;
              cursor: pointer;
            }
            .billing-empty-wrap { padding: 30px; }
            .billing-overview-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 22px;
              margin-bottom: 22px;
            }
            .billing-overview-card {
              display: flex;
              align-items: center;
              gap: 18px;
              min-height: 94px;
              padding: 20px 24px;
            }
            .billing-overview-icon {
              width: 50px;
              height: 50px;
              border-radius: 50%;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              background: #eaf2ff;
              color: var(--billing-blue);
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.13);
              flex: 0 0 auto;
            }
            .billing-overview-label {
              display: block;
              color: var(--billing-muted);
              font-size: 13px;
              font-weight: 850;
              margin-bottom: 8px;
            }
            .billing-overview-value { color: #172554; font-weight: 850; }
            .billing-form-card { padding: 28px 30px; }
            .billing-form-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 24px 34px;
            }
            .billing-field { display: grid; gap: 9px; }
            .billing-input-with-icon { position: relative; display: block; }
            .billing-input-with-icon .billing-input { padding-right: 42px; }
            .billing-input-icon {
              position: absolute;
              right: 13px;
              top: 50%;
              transform: translateY(-50%);
              color: #94a3b8;
              pointer-events: none;
            }
            .billing-info-note {
              margin-top: 20px;
              display: flex;
              align-items: flex-start;
              gap: 12px;
              border: 1px solid rgba(37, 99, 235, 0.22);
              border-radius: 14px;
              background: #f8fbff;
              color: #385077;
              padding: 15px 18px;
              font-size: 14px;
              line-height: 1.5;
            }
            .billing-fiscal-grid {
              display: grid;
              grid-template-columns: minmax(520px, 1fr) minmax(460px, 1.05fr);
              gap: 22px;
              align-items: start;
            }
            .billing-fiscal-card { padding: 24px; }
            .billing-fiscal-fields {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 20px 24px;
            }
            .billing-fiscal-fields .full-span { grid-column: 1 / -1; }
            .billing-fiscal-fields .span-2 { grid-column: span 2; }
            .billing-env-toggle {
              display: grid;
              grid-template-columns: 1fr 1fr;
              border: 1px solid var(--billing-line);
              border-radius: 12px;
              overflow: hidden;
              background: #f8fafc;
              min-height: 48px;
            }
            .billing-env-option {
              appearance: none;
              border: 0;
              background: transparent;
              color: #475569;
              font-size: 14px;
              font-weight: 850;
              cursor: pointer;
            }
            .billing-env-option.active {
              color: #fff;
              background: linear-gradient(180deg, #2674ff 0%, var(--billing-blue) 100%);
              box-shadow: 0 8px 18px rgba(37, 99, 235, 0.24);
            }
            .billing-input-row {
              display: flex;
              align-items: stretch;
              gap: 10px;
            }
            .billing-input-row .billing-input { min-width: 0; }
            .billing-upload-zone {
              position: relative;
              border: 1.5px dashed rgba(37, 99, 235, 0.58);
              border-radius: 14px;
              background: #f8fbff;
              min-height: 92px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 12px;
              color: #172554;
              font-weight: 800;
              text-align: center;
              cursor: pointer;
              padding: 18px;
            }
            .billing-upload-zone input {
              position: absolute;
              inset: 0;
              opacity: 0;
              cursor: pointer;
            }
            .billing-upload-zone small {
              display: block;
              margin-top: 4px;
              color: var(--billing-muted);
              font-weight: 650;
            }
            .billing-certificate-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              border: 1px solid #e2e8f0;
              border-radius: 14px;
              padding: 14px 16px;
              background: #fff;
            }
            .billing-certificate-main {
              display: flex;
              align-items: center;
              gap: 12px;
              min-width: 0;
            }
            .billing-certificate-icon {
              width: 44px;
              height: 44px;
              border-radius: 12px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              color: var(--billing-blue);
              background: #eaf2ff;
              flex: 0 0 auto;
            }
            .billing-certificate-name { display: block; font-weight: 850; color: var(--billing-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .billing-certificate-meta { display: block; color: var(--billing-muted); font-size: 12.5px; margin-top: 2px; }
            .billing-fiscal-actions {
              margin-top: 24px;
              padding-top: 22px;
              border-top: 1px solid #e8eef6;
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 14px;
            }
            .billing-fiscal-note {
              margin: 0;
              color: var(--billing-muted);
              font-size: 13px;
              line-height: 1.45;
            }
            .billing-folio-panel { width: 100%; }
            .billing-folio-card {
              border-radius: 24px;
              border: 1px solid rgba(203, 213, 225, 0.82);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              overflow: hidden;
              background: #fff;
            }
            .billing-folio-card :is(input, select, textarea) {
              border-radius: 10px;
              border-color: var(--billing-line);
            }
            .billing-folio-card :is(button:not(.clients-session-tab)) {
              border-radius: 12px;
              font-weight: 800;
            }
            @media (max-width: 1180px) {
              .billing-fiscal-grid,
              .billing-overview-grid { grid-template-columns: 1fr; }
              .billing-method-head { display: none; }
              .billing-method-row { grid-template-columns: 1fr; gap: 12px; align-items: start; }
              .billing-row-actions { justify-content: flex-start; }
            }
            @media (max-width: 780px) {
              .billing-main-panel { padding: 14px; }
              .billing-subtabs { gap: 8px; }
              .billing-subtab { flex: 1 1 150px; min-width: 0; }
              .billing-settings-grid,
              .billing-form-grid,
              .billing-fiscal-fields { grid-template-columns: 1fr; }
              .billing-settings-field,
              .billing-settings-field + .billing-settings-field { padding: 0; border-left: 0; }
              .billing-settings-field + .billing-settings-field { padding-top: 22px; margin-top: 22px; border-top: 1px solid #e6edf6; }
              .billing-card-pad,
              .billing-settings-card,
              .billing-form-card,
              .billing-fiscal-card { padding: 22px; }
              .billing-fiscal-fields .span-2 { grid-column: auto; }
              .billing-fiscal-actions { grid-template-columns: 1fr; }
              .billing-bottom-bar { flex-direction: column; align-items: stretch; }
              .billing-bottom-status { margin-left: 0; }
            }
          `}</style>

                  <div className="billing-card billing-main-panel">
                    <div className="billing-tabs-card">
                      <div
                        className="billing-subtabs"
                        role="tablist"
                        aria-label="Billing settings"
                      >
                        {billingSubtabs.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            role="tab"
                            aria-selected={billingSubtab === entry.id}
                            className={
                              billingSubtab === entry.id
                                ? "billing-subtab active"
                                : "billing-subtab"
                            }
                            onClick={() => setBillingSubtab(entry.id)}
                          >
                            {entry.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {billingSubtab === "settings" ? (
                      <div className="billing-card billing-settings-card">
                        <div className="billing-section-heading-row">
                          <span className="billing-section-icon">
                            <BillingReceiptIcon />
                          </span>
                          <span>
                            <h3 className="billing-section-title">
                              {locale === "sl"
                                ? "Osnovne nastavitve računov"
                                : "Basic invoice settings"}
                            </h3>
                            <span className="billing-section-kicker">
                              {locale === "sl"
                                ? "Določite številčenje računov in plačilne roke."
                                : "Set invoice numbering and payment deadlines."}
                            </span>
                          </span>
                        </div>
                        <div className="billing-settings-grid">
                          <label className="billing-settings-field">
                            <span className="billing-label">
                              {locale === "sl"
                                ? "Števec računov"
                                : "Invoice counter"}
                            </span>
                            <input
                              className="billing-input"
                              value={settings.INVOICE_COUNTER ?? ""}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  INVOICE_COUNTER: e.target.value,
                                })
                              }
                            />
                            <span className="billing-hint">
                              {locale === "sl"
                                ? "Naslednja številka računa. Predpona računa je lahko npr. I, II ali NV-0001."
                                : "The next invoice number to use. Supports alphanumeric prefixes such as I, II or INV-0001."}
                            </span>
                          </label>
                          <label className="billing-settings-field">
                            <span className="billing-label">
                              {locale === "sl"
                                ? "Rok plačila (dni)"
                                : "Payment deadline (days)"}
                            </span>
                            <input
                              className="billing-input"
                              type="number"
                              min="0"
                              step="1"
                              value={settings.PAYMENT_DEADLINE_DAYS ?? ""}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  PAYMENT_DEADLINE_DAYS: e.target.value,
                                })
                              }
                            />
                            <span className="billing-hint">
                              {locale === "sl"
                                ? "Rok zapadlosti je datum računa + to število dni."
                                : "Due date is invoice date + this number of days."}
                            </span>
                          </label>
                        </div>
                        <div className="billing-bottom-bar">
                          <span className="billing-bottom-left">
                            <span className="billing-info-dot">
                              <BillingInfoIcon />
                            </span>
                            <span>
                              {locale === "sl"
                                ? "Spremembe se uporabijo za nove račune in ne vplivajo na že izdane račune."
                                : "Changes apply to new invoices and do not affect already issued invoices."}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="billing-primary-button"
                            onClick={() => void saveSettings()}
                            disabled={savingSettings}
                          >
                            <BillingSaveIcon />
                            {savingSettings
                              ? t("formSaving")
                              : t("configSaveConfiguration")}
                          </button>
                        </div>
                      </div>
                    ) : billingSubtab === "paymentMethods" ? (
                      <>
                        <div className="billing-card billing-table-card">
                          <div className="billing-card-header">
                            <div className="billing-card-header-main">
                              <span className="billing-section-icon">
                                <BillingPaymentTypeIcon type="CARD" />
                              </span>
                              <span>
                                <h3 className="billing-section-title">
                                  {locale === "sl"
                                    ? "Seznam načinov plačila"
                                    : "Payment method list"}
                                </h3>
                                <span className="billing-section-kicker">
                                  {locale === "sl"
                                    ? "Ustvarite, uredite in upravljajte načine plačila, ki so na voljo v sistemu."
                                    : "Create, edit and manage available payment methods."}
                                </span>
                              </span>
                            </div>
                            <button
                              type="button"
                              className="billing-primary-button"
                              onClick={resetAndOpenPaymentMethodModal}
                              disabled
                            >
                              <BillingPlusIcon />
                              {locale === "sl"
                                ? "Nov način plačila"
                                : "New payment method"}
                            </button>
                          </div>
                          {visibleBillingPaymentMethods.length === 0 &&
                          inlineEditingPaymentMethodId !== -1 ? (
                            <div className="billing-empty-wrap">
                              <EmptyState
                                title="No payment methods"
                                text="Click New to create your first payment method."
                              />
                            </div>
                          ) : (
                            <div className="billing-method-table">
                              <div className="billing-method-head" aria-hidden>
                                <span>
                                  {locale === "sl" ? "Naziv" : "Name"}
                                </span>
                                <span>{locale === "sl" ? "Tip" : "Type"}</span>
                                <span className="billing-head-with-info">
                                  {locale === "sl"
                                    ? "Fiskalizacija"
                                    : "Fiscalization"}{" "}
                                  <BillingInfoIcon />
                                </span>
                                <span>
                                  {locale === "sl" ? "Dejanja" : "Actions"}
                                </span>
                              </div>
                              <div className="billing-method-table-body">
                                {inlineEditingPaymentMethodId === -1 &&
                                inlinePaymentMethodForm ? (
                                  <div className="billing-method-row">
                                    <div className="billing-method-name">
                                      <span
                                        className={`billing-method-icon billing-method-icon--${inlinePaymentMethodForm.paymentType.toLowerCase().replace("_", "-")}`}
                                      >
                                        <BillingPaymentTypeIcon
                                          type={
                                            inlinePaymentMethodForm.paymentType
                                          }
                                        />
                                      </span>
                                      <input
                                        className="billing-input"
                                        placeholder={
                                          locale === "sl" ? "Naziv" : "Name"
                                        }
                                        value={inlinePaymentMethodForm.name}
                                        onChange={(e) =>
                                          setInlinePaymentMethodForm({
                                            ...inlinePaymentMethodForm,
                                            name: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                    <select
                                      className="billing-select"
                                      value={
                                        inlinePaymentMethodForm.paymentType
                                      }
                                      onChange={(e) => {
                                        const paymentType = e.target
                                          .value as PaymentType;
                                        setInlinePaymentMethodForm({
                                          ...inlinePaymentMethodForm,
                                          paymentType,
                                          fiscalized: paymentType !== "CARD",
                                          stripeEnabled: paymentType === "CARD",
                                        });
                                      }}
                                    >
                                      <option value="CASH">CASH</option>
                                      <option value="CARD">CARD</option>
                                      <option value="BANK_TRANSFER">
                                        BANK TRANSFER
                                      </option>
                                      <option value="OTHER">OTHER</option>
                                    </select>
                                    <button
                                      type="button"
                                      className="billing-fiscal-toggle-button"
                                      onClick={() =>
                                        setInlinePaymentMethodForm({
                                          ...inlinePaymentMethodForm,
                                          fiscalized:
                                            !inlinePaymentMethodForm.fiscalized,
                                        })
                                      }
                                    >
                                      <span
                                        className={
                                          inlinePaymentMethodForm.fiscalized
                                            ? "billing-pill billing-pill--success"
                                            : "billing-pill billing-pill--danger"
                                        }
                                      >
                                        <span className="billing-status-dot" />
                                        {inlinePaymentMethodForm.fiscalized
                                          ? locale === "sl"
                                            ? "Vklopljeno"
                                            : "On"
                                          : locale === "sl"
                                            ? "Izklopljeno"
                                            : "Off"}
                                      </span>
                                    </button>
                                    <div className="billing-row-actions">
                                      <button
                                        type="button"
                                        className="billing-secondary-button"
                                        onClick={cancelInlinePaymentMethodEdit}
                                      >
                                        {locale === "sl"
                                          ? "Prekliči"
                                          : "Cancel"}
                                      </button>
                                      <button
                                        type="button"
                                        className="billing-primary-button"
                                        onClick={() =>
                                          void saveInlinePaymentMethodEdit(-1)
                                        }
                                      >
                                        {locale === "sl" ? "Shrani" : "Save"}
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                                {visibleBillingPaymentMethods.map((method) => {
                                  const methodTypeLabel =
                                    method.paymentType === "BANK_TRANSFER"
                                      ? "BANK TRANSFER"
                                      : method.paymentType === "OTHER"
                                        ? "OTHER"
                                        : method.paymentType;
                                  const methodTypeClass = method.paymentType
                                    .toLowerCase()
                                    .replace("_", "-");
                                  const isInlineEditing =
                                    inlineEditingPaymentMethodId ===
                                      method.id && inlinePaymentMethodForm;
                                  return (
                                    <div
                                      key={method.id}
                                      className="billing-method-row"
                                    >
                                      <div className="billing-method-name">
                                        <span
                                          className={`billing-method-icon billing-method-icon--${methodTypeClass}`}
                                        >
                                          <BillingPaymentTypeIcon
                                            type={method.paymentType}
                                          />
                                        </span>
                                        {isInlineEditing ? (
                                          <input
                                            className="billing-input"
                                            value={inlinePaymentMethodForm.name}
                                            onChange={(e) =>
                                              setInlinePaymentMethodForm({
                                                ...inlinePaymentMethodForm,
                                                name: e.target.value,
                                              })
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        ) : (
                                          <span>{method.name}</span>
                                        )}
                                      </div>
                                      <span className="billing-pill billing-pill--neutral">
                                        {methodTypeLabel}
                                      </span>
                                      <button
                                        type="button"
                                        className="billing-fiscal-toggle-button"
                                        onClick={() => {
                                          if (!isInlineEditing) {
                                            void togglePaymentMethodFiscalized(
                                              method,
                                            );
                                          } else {
                                            setInlinePaymentMethodForm({
                                              ...inlinePaymentMethodForm,
                                              fiscalized:
                                                !inlinePaymentMethodForm.fiscalized,
                                            });
                                          }
                                        }}
                                      >
                                        <span
                                          className={
                                            (
                                              isInlineEditing
                                                ? inlinePaymentMethodForm.fiscalized
                                                : method.fiscalized
                                            )
                                              ? "billing-pill billing-pill--success"
                                              : "billing-pill billing-pill--danger"
                                          }
                                        >
                                          <span className="billing-status-dot" />
                                          {(
                                            isInlineEditing
                                              ? inlinePaymentMethodForm.fiscalized
                                              : method.fiscalized
                                          )
                                            ? locale === "sl"
                                              ? "Vklopljeno"
                                              : "On"
                                            : locale === "sl"
                                              ? "Izklopljeno"
                                              : "Off"}
                                        </span>
                                      </button>
                                      <div className="billing-row-actions">
                                        {isInlineEditing ? (
                                          <>
                                            <button
                                              type="button"
                                              className="billing-secondary-button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                cancelInlinePaymentMethodEdit();
                                              }}
                                            >
                                              {locale === "sl"
                                                ? "Prekliči"
                                                : "Cancel"}
                                            </button>
                                            <button
                                              type="button"
                                              className="billing-primary-button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void saveInlinePaymentMethodEdit(
                                                  method.id,
                                                );
                                              }}
                                            >
                                              {locale === "sl"
                                                ? "Shrani"
                                                : "Save"}
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            type="button"
                                            className="billing-action-btn billing-action-btn--edit"
                                            aria-label="Edit payment method"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              startInlinePaymentMethodEdit(
                                                method,
                                              );
                                            }}
                                          >
                                            <BillingEditIcon />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : billingSubtab === "stripe" ? (
                      <>
                        <div className="billing-overview-grid">
                          <div className="billing-card billing-overview-card">
                            <span className="billing-overview-icon">
                              <BillingLinkIcon />
                            </span>
                            <span>
                              <span className="billing-overview-label">
                                {locale === "sl"
                                  ? "Status Stripe Connect"
                                  : "Stripe Connect status"}
                              </span>
                              <span
                                className={
                                  activeStripeAccount?.chargesEnabled
                                    ? "billing-pill billing-pill--success"
                                    : "billing-pill billing-pill--neutral"
                                }
                              >
                                <span className="billing-status-dot" />{" "}
                                {stripeStatusLabel}
                              </span>
                            </span>
                          </div>
                          <div className="billing-card billing-overview-card">
                            <span className="billing-overview-icon">
                              <BillingUserBadgeIcon />
                            </span>
                            <span>
                              <span className="billing-overview-label">
                                {locale === "sl" ? "ID računa" : "Account ID"}
                              </span>
                              <span className="billing-overview-value">
                                {activeStripeAccount?.accountId || "—"}
                              </span>
                            </span>
                          </div>
                          <div className="billing-card billing-overview-card">
                            <span className="billing-overview-icon">
                              <BillingTagIcon />
                            </span>
                            <span>
                              <span className="billing-overview-label">
                                {locale === "sl" ? "Okolje" : "Environment"}
                              </span>
                              <span className="billing-overview-value">
                                {stripeConnectStatus?.activeMode ===
                                "production"
                                  ? "Production"
                                  : "Sandbox"}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="billing-card billing-form-card">
                          <div className="billing-section-heading-row">
                            <span className="billing-section-icon">
                              <BillingPaymentTypeIcon type="CARD" />
                            </span>
                            <span>
                              <h3 className="billing-section-title">
                                Ponudnik spletnega plačila
                              </h3>
                              <span className="billing-section-kicker">
                                Tenant poveže svoj Stripe račun. Platformni
                                ključi so v Platform Admin → Payment providers →
                                Stripe.
                              </span>
                            </span>
                          </div>

                          <div className="billing-form-grid">
                            <label className="billing-field">
                              <span className="billing-label">Ponudnik</span>
                              <select
                                className="billing-select"
                                value={guestAppSettings.paymentProvider}
                                onChange={(e) =>
                                  setGuestAppSettings({
                                    ...guestAppSettings,
                                    paymentProvider: e.target.value,
                                  })
                                }
                              >
                                <option value="stripe">Stripe Connect</option>
                                <option value="paypal">PayPal</option>
                                <option value="bankart">Bankart</option>
                              </select>
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">Okolje</span>
                              <select
                                className="billing-select"
                                value={
                                  stripeConnectStatus?.activeMode || "sandbox"
                                }
                                onChange={(e) =>
                                  void saveStripePreference({
                                    mode: e.target.value,
                                  })
                                }
                                disabled={
                                  guestAppSettings.paymentProvider !== "stripe"
                                }
                              >
                                <option value="sandbox">Sandbox</option>
                                <option value="production">Production</option>
                              </select>
                              <span className="billing-hint">
                                Sandbox je za testiranje. Production uporabite
                                šele po vnosu live ključev v Platform Admin.
                              </span>
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">
                                Država računa
                              </span>
                              <input
                                className="billing-input"
                                maxLength={2}
                                value={stripeConnectStatus?.country || "SI"}
                                onChange={(e) =>
                                  void saveStripePreference({
                                    country: e.target.value.toUpperCase(),
                                  })
                                }
                                disabled={
                                  guestAppSettings.paymentProvider !== "stripe"
                                }
                              />
                              <span className="billing-hint">
                                Stripe to uporabi pri ustvarjanju povezanega
                                računa.
                              </span>
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">
                                Tip poslovanja
                              </span>
                              <select
                                className="billing-select"
                                value={
                                  stripeConnectStatus?.businessType || "company"
                                }
                                onChange={(e) =>
                                  void saveStripePreference({
                                    businessType: e.target.value,
                                  })
                                }
                                disabled={
                                  guestAppSettings.paymentProvider !== "stripe"
                                }
                              >
                                <option value="company">Podjetje</option>
                                <option value="individual">
                                  Fizična oseba / samozaposlen
                                </option>
                                <option value="non_profit">
                                  Neprofitna organizacija
                                </option>
                              </select>
                            </label>
                          </div>

                          <div className="billing-info-note">
                            <span className="billing-info-dot">
                              <BillingLockIcon />
                            </span>
                            <span>
                              <strong>Stripe zbira občutljive podatke</strong>
                              <br />
                              Tenant se onboarda na Stripe hosted strani.
                              Calendra shrani samo connected account ID in
                              status; IBAN, KYC in dokumenti ostanejo pri
                              Stripe.
                              <br />
                              {locale === "sl"
                                ? "ID računa"
                                : "Account ID"}:{" "}
                              {activeStripeAccount?.accountId || "—"} ·{" "}
                              {locale === "sl" ? "Plačila" : "Charges"}:{" "}
                              {activeStripeAccount?.chargesEnabled
                                ? "ON"
                                : "OFF"}{" "}
                              · {locale === "sl" ? "Izplačila" : "Payouts"}:{" "}
                              {activeStripeAccount?.payoutsEnabled
                                ? "ON"
                                : "OFF"}
                            </span>
                          </div>

                          <div className="billing-actions-row">
                            <button
                              type="button"
                              className="billing-primary-button"
                              onClick={() => void startStripeOnboarding()}
                              disabled={
                                startingStripeOnboarding ||
                                guestAppSettings.paymentProvider !== "stripe"
                              }
                            >
                              <BillingLinkIcon />
                              {startingStripeOnboarding
                                ? "Odpiram Stripe…"
                                : activeStripeAccount?.connected
                                  ? "Nadaljuj Stripe onboarding"
                                  : "Poveži Stripe"}
                            </button>
                            <button
                              type="button"
                              className="billing-secondary-button"
                              onClick={() => void refreshStripeConnectStatus()}
                              disabled={
                                refreshingStripeStatus ||
                                !activeStripeAccount?.connected ||
                                guestAppSettings.paymentProvider !== "stripe"
                              }
                            >
                              {refreshingStripeStatus
                                ? "Osvežujem…"
                                : "Osveži status"}
                            </button>
                            <button
                              type="button"
                              className="billing-secondary-button"
                              onClick={saveGuestAppConfiguration}
                              disabled={savingSettings}
                            >
                              <BillingSaveIcon />
                              {savingSettings
                                ? t("formSaving")
                                : t("configSaveConfiguration")}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : billingSubtab === "paypal" ? (
                      <>
                        <div className="billing-overview-grid">
                          <div className="billing-card billing-overview-card">
                            <span className="billing-overview-icon">
                              <BillingLinkIcon />
                            </span>
                            <span>
                              <span className="billing-overview-label">
                                {locale === "sl"
                                  ? "Stanje povezave"
                                  : "Connection status"}
                              </span>
                              <span
                                className={
                                  paypalStatusLabel
                                    .toLowerCase()
                                    .includes("connected") ||
                                  paypalStatusLabel
                                    .toLowerCase()
                                    .includes("povezan")
                                    ? "billing-pill billing-pill--success"
                                    : "billing-pill billing-pill--neutral"
                                }
                              >
                                <span className="billing-status-dot" />{" "}
                                {paypalStatusLabel}
                              </span>
                            </span>
                          </div>
                          <div className="billing-card billing-overview-card">
                            <span className="billing-overview-icon">
                              <BillingUserBadgeIcon />
                            </span>
                            <span>
                              <span className="billing-overview-label">
                                Merchant ID
                              </span>
                              <span className="billing-overview-value">
                                {settings.PAYPAL_MERCHANT_ID || "—"}
                              </span>
                            </span>
                          </div>
                          <div className="billing-card billing-overview-card">
                            <span className="billing-overview-icon">
                              <BillingTagIcon />
                            </span>
                            <span>
                              <span className="billing-overview-label">
                                Tracking ID
                              </span>
                              <span className="billing-overview-value">
                                {settings.PAYPAL_TRACKING_ID || "—"}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="billing-card billing-form-card">
                          <div className="billing-form-grid">
                            <label className="billing-field">
                              <span className="billing-label">
                                {locale === "sl"
                                  ? "Status povezave"
                                  : "Connection status"}
                              </span>
                              <input
                                className="billing-input"
                                value={paypalStatusLabel}
                                readOnly
                              />
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">
                                {locale === "sl"
                                  ? "Poverilnice (sandbox / live)"
                                  : "Sandbox / live credentials"}
                              </span>
                              <span className="billing-input-with-icon">
                                <input
                                  className="billing-input"
                                  value={
                                    settings.PAYPAL_CREDENTIALS_CONFIGURED ===
                                    "true"
                                      ? locale === "sl"
                                        ? "Konfigurirano v zaledju"
                                        : "Configured on backend"
                                      : locale === "sl"
                                        ? "Potrebne poverilnice v zaledju"
                                        : "Backend credentials required"
                                  }
                                  readOnly
                                />
                                <span className="billing-input-icon">
                                  <BillingLockIcon />
                                </span>
                              </span>
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">
                                PayPal merchant ID
                              </span>
                              <input
                                className="billing-input"
                                value={settings.PAYPAL_MERCHANT_ID || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    PAYPAL_MERCHANT_ID: e.target.value,
                                  })
                                }
                                placeholder="Example: 9ABCD12345EFG"
                              />
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">Tracking ID</span>
                              <input
                                className="billing-input"
                                value={settings.PAYPAL_TRACKING_ID || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    PAYPAL_TRACKING_ID: e.target.value,
                                  })
                                }
                                placeholder="Auto-generated by PayPal onboarding"
                              />
                            </label>
                          </div>
                          <div className="billing-actions-row">
                            <button
                              type="button"
                              className="billing-primary-button"
                              onClick={startPaypalOnboarding}
                              disabled={startingPaypalOnboarding}
                            >
                              <BillingPaypalIcon />
                              {startingPaypalOnboarding
                                ? locale === "sl"
                                  ? "Odpiranje PayPal…"
                                  : "Opening PayPal…"
                                : locale === "sl"
                                  ? "Poveži PayPal"
                                  : "Connect PayPal"}
                            </button>
                            <button
                              type="button"
                              className="billing-secondary-button"
                              onClick={savePaypalConfiguration}
                              disabled={savingSettings}
                            >
                              <BillingSaveIcon />
                              {savingSettings
                                ? t("formSaving")
                                : locale === "sl"
                                  ? "Shrani konfiguracijo"
                                  : "Save configuration"}
                            </button>
                          </div>
                        </div>
                        <div className="billing-info-note">
                          <span className="billing-info-dot">
                            <BillingInfoIcon />
                          </span>
                          <span>
                            {locale === "sl"
                              ? "Onboarding PayPal računa se odpre v novem oknu. Po zaključku boste samodejno preusmerjeni nazaj na to stran."
                              : "PayPal onboarding opens in a new window. After completion you will be returned to this page automatically."}
                          </span>
                        </div>
                      </>
                    ) : billingSubtab === "fiscal" ? (
                      <div className="billing-fiscal-grid">
                        <div className="billing-card billing-fiscal-card">
                          <div className="billing-fiscal-fields">
                            <div className="billing-field">
                              <span className="billing-label">
                                {t("configFiscalEnvironment")}
                              </span>
                              <div
                                className="billing-env-toggle"
                                role="group"
                                aria-label={t("configFiscalEnvironment")}
                              >
                                {(["TEST", "PROD"] as const).map((env) => (
                                  <button
                                    key={env}
                                    type="button"
                                    className={
                                      (settings.FISCAL_ENVIRONMENT ||
                                        "TEST") === env
                                        ? "billing-env-option active"
                                        : "billing-env-option"
                                    }
                                    onClick={() =>
                                      setSettings({
                                        ...settings,
                                        FISCAL_ENVIRONMENT: env,
                                      })
                                    }
                                  >
                                    {env}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <label className="billing-field">
                              <span className="billing-label">
                                {t("configFiscalTaxNumberFromVat")}
                              </span>
                              <input
                                className="billing-input"
                                value={(settings.COMPANY_VAT_ID || "").replace(
                                  /^SI/i,
                                  "",
                                )}
                                readOnly
                              />
                            </label>
                            <div className="billing-field full-span">
                              <span className="billing-label">
                                {t("configFiscalBusinessPremiseId")}
                              </span>
                              <div className="billing-input-row">
                                <input
                                  className="billing-input"
                                  placeholder={t(
                                    "configFiscalBusinessPremiseId",
                                  )}
                                  value={
                                    settings.FISCAL_BUSINESS_PREMISE_ID || ""
                                  }
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      FISCAL_BUSINESS_PREMISE_ID:
                                        e.target.value,
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  className="billing-secondary-button"
                                  onClick={registerBusinessPremise}
                                  disabled={registeringPremise}
                                >
                                  {registeringPremise &&
                                  registeringPremiseId === selectedPremiseId
                                    ? t("configFiscalRegistering")
                                    : t("configFiscalRegister")}
                                </button>
                              </div>
                              {selectedPremiseConfirmed ? (
                                <span className="billing-hint">
                                  ✓ {t("configFiscalConfirmedPremise")}
                                </span>
                              ) : null}
                            </div>
                            <label className="billing-field full-span">
                              <span className="billing-label">
                                {t("configFiscalElectronicDeviceId")}
                              </span>
                              <input
                                className="billing-input"
                                value={settings.FISCAL_DEVICE_ID || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    FISCAL_DEVICE_ID: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">
                                {t("configFiscalCadastralNumber")}
                              </span>
                              <input
                                className="billing-input"
                                value={settings.FISCAL_CADASTRAL_NUMBER || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    FISCAL_CADASTRAL_NUMBER: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">
                                {t("configFiscalBuildingNumber")}
                              </span>
                              <input
                                className="billing-input"
                                value={settings.FISCAL_BUILDING_NUMBER || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    FISCAL_BUILDING_NUMBER: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">
                                {t("configFiscalBuildingSectionNumber")}
                              </span>
                              <input
                                className="billing-input"
                                value={
                                  settings.FISCAL_BUILDING_SECTION_NUMBER || ""
                                }
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    FISCAL_BUILDING_SECTION_NUMBER:
                                      e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="billing-field">
                              <span className="billing-label">
                                {t("configFiscalHouseNumber")}
                              </span>
                              <input
                                className="billing-input"
                                value={settings.FISCAL_HOUSE_NUMBER || ""}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    FISCAL_HOUSE_NUMBER: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="billing-field span-2">
                              <span className="billing-label">
                                {t("configFiscalHouseNumberAdditional")}
                              </span>
                              <input
                                className="billing-input"
                                value={
                                  settings.FISCAL_HOUSE_NUMBER_ADDITIONAL || ""
                                }
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    FISCAL_HOUSE_NUMBER_ADDITIONAL:
                                      e.target.value,
                                  })
                                }
                              />
                            </label>
                            <p className="billing-fiscal-note full-span">
                              Fiscal URLs are managed globally in the Platform
                              Admin Console.
                            </p>
                            {premiseRegisterResult ? (
                              <p className="billing-fiscal-note full-span">
                                {premiseRegisterResult}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="billing-card billing-fiscal-card">
                          <div className="billing-fiscal-fields">
                            <label className="billing-field full-span">
                              <span className="billing-label">
                                {t("configFiscalSoftwareSupplierTaxOptional")}
                              </span>
                              <input
                                className="billing-input"
                                value={
                                  settings.FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER ||
                                  ""
                                }
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER:
                                      e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="billing-field full-span">
                              <span className="billing-label">
                                {t("configFiscalCertificatePassword")}
                              </span>
                              <span className="billing-input-with-icon">
                                <input
                                  className="billing-input"
                                  type="password"
                                  value={
                                    settings.FISCAL_CERTIFICATE_PASSWORD || ""
                                  }
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      FISCAL_CERTIFICATE_PASSWORD:
                                        e.target.value,
                                    })
                                  }
                                />
                                <span className="billing-input-icon">
                                  <GuestEyeIcon />
                                </span>
                              </span>
                            </label>
                            <div className="billing-field full-span">
                              <span className="billing-label">
                                {t("configFiscalCertificateFile")}
                              </span>
                              <label className="billing-upload-zone">
                                <input
                                  type="file"
                                  accept=".p12,.pfx,application/x-pkcs12"
                                  onChange={(e) =>
                                    setCertificateFile(
                                      e.target.files?.[0] || null,
                                    )
                                  }
                                />
                                <BillingUploadIcon />
                                <span>
                                  {certificateFile
                                    ? certificateFile.name
                                    : locale === "sl"
                                      ? "Povlecite datoteko sem ali kliknite za izbiro"
                                      : "Drop a file here or click to choose"}
                                  <small>
                                    {locale === "sl"
                                      ? "Dovoljene vrste: .p12, .pfx"
                                      : "Allowed types: .p12, .pfx"}
                                  </small>
                                </span>
                              </label>
                            </div>
                            <div className="full-span">
                              <div className="billing-certificate-row">
                                <div className="billing-certificate-main">
                                  <span className="billing-certificate-icon">
                                    <BillingCertificateIcon />
                                  </span>
                                  <span>
                                    <span className="billing-certificate-name">
                                      {certificateMeta?.uploaded
                                        ? certificateMeta.fileName ||
                                          "certificate"
                                        : locale === "sl"
                                          ? "Digitalno potrdilo ni naloženo"
                                          : "No digital certificate uploaded"}
                                    </span>
                                    <span className="billing-certificate-meta">
                                      {certificateMeta?.uploaded
                                        ? `${certificateMeta.expiresAt ? `${t("configFiscalExpiresAt")}: ${certificateMeta.expiresAt}` : locale === "sl" ? "Potrdilo je naloženo." : "Certificate uploaded."}`
                                        : locale === "sl"
                                          ? "Naložite .p12 ali .pfx potrdilo za fiskalizacijo."
                                          : "Upload a .p12 or .pfx certificate for fiscalization."}
                                    </span>
                                  </span>
                                </div>
                                {certificateMeta?.uploaded ? (
                                  <span className="billing-pill billing-pill--success">
                                    <span className="billing-status-dot" />{" "}
                                    {locale === "sl" ? "Naloženo" : "Uploaded"}
                                  </span>
                                ) : (
                                  <span className="billing-pill billing-pill--neutral">
                                    {locale === "sl"
                                      ? "Ni naloženo"
                                      : "Not uploaded"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="billing-fiscal-actions">
                            <button
                              type="button"
                              className="billing-primary-button"
                              onClick={() => void saveSettings()}
                              disabled={savingSettings}
                            >
                              <BillingSaveIcon />
                              {savingSettings
                                ? t("formSaving")
                                : t("configFiscalSaveSettings")}
                            </button>
                            <button
                              type="button"
                              className="billing-secondary-button"
                              onClick={uploadCertificate}
                              disabled={uploadingCertificate}
                            >
                              <BillingUploadIcon />
                              {uploadingCertificate
                                ? t("configFiscalUploadingCertificate")
                                : t("configFiscalUploadCertificate")}
                            </button>
                            {certificateMeta?.uploaded ? (
                              <button
                                type="button"
                                className="billing-danger-button"
                                onClick={removeCertificate}
                              >
                                <BillingTrashIcon />
                                {t("configFiscalRemoveCertificate")}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="billing-danger-button"
                                disabled
                              >
                                <BillingTrashIcon />
                                {t("configFiscalRemoveCertificate")}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : billingSubtab === "invoiceDelivery" ? (
                      <ConfigurationInvoiceDeliverySection
                        settings={settings}
                        setSettings={setSettings}
                        savingSettings={savingSettings}
                        onSave={() => saveSettings()}
                        t={t}
                        locale={locale}
                      />
                    ) : (
                      <div className="billing-folio-panel">
                        <Card className="billing-folio-card">
                          <FolioLayoutEditor />
                        </Card>
                      </div>
                    )}
                  </div>
                </div>
              ) : tab === "guestApp" ? (
                <Card className="settings-card guest-app-settings-card gapp-modern-card">
                  <style>{`
            .gapp-modern-card {
              --gapp-blue: #2563eb;
              --gapp-blue-dark: #1d4ed8;
              --gapp-text: #0f1b3d;
              --gapp-muted: #64748b;
              --gapp-line: #dbe4f0;
              --gapp-soft: #f8fafc;
              --gapp-soft-blue: #eff6ff;
              border-radius: 24px;
              border: 1px solid rgba(203, 213, 225, 0.78);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              background: #fff;
              padding: 28px 34px 32px;
              color: var(--gapp-text);
            }
            .gapp-modern-card button { font-family: inherit; }
            .gapp-subtabs {
              display: flex;
              align-items: center;
              gap: 10px;
              margin: 20px 0 10px;
              border-bottom: 1px solid #edf2f7;
            }
            .gapp-subtab {
              position: relative;
              appearance: none;
              border: 0;
              background: transparent;
              color: #334155;
              font-weight: 700;
              font-size: 15px;
              padding: 10px 14px;
              cursor: pointer;
              border-radius: 10px;
              box-shadow: none;
              outline: none;
              transition: color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .gapp-subtab:hover { color: #0f172a; background: #f8fafc; }
            .gapp-subtab.active {
              color: #2563eb;
              background: #eaf2ff;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16), 0 3px 10px rgba(37, 99, 235, 0.18);
            }
            .gapp-panel {
              margin-top: 12px;
              border: 1px solid rgba(203, 213, 225, 0.86);
              border-radius: 22px;
              background: #fff;
              padding: 34px;
              box-shadow: 0 18px 50px rgba(15, 23, 42, 0.07);
            }
            .gapp-grid,
            .gapp-form-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 38px 70px;
            }
            .gapp-column { display: grid; gap: 22px; align-content: start; }
            .gapp-field { display: grid; gap: 8px; }
            .gapp-label {
              font-size: 14px;
              font-weight: 800;
              color: var(--gapp-text);
              line-height: 1.2;
            }
            .gapp-hint {
              display: block;
              color: var(--gapp-muted);
              font-size: 12.5px;
              line-height: 1.45;
            }
            .gapp-input,
            .gapp-select,
            .gapp-textarea {
              width: 100%;
              min-height: 42px;
              border: 1px solid var(--gapp-line);
              border-radius: 11px;
              background: #fff;
              color: #172554;
              font-size: 14px;
              line-height: 1.3;
              padding: 10px 14px;
              outline: none;
              box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.02);
              transition: border-color .18s ease, box-shadow .18s ease;
            }
            .gapp-textarea { min-height: 92px; resize: vertical; }
            .gapp-input:focus,
            .gapp-select:focus,
            .gapp-textarea:focus {
              border-color: rgba(37, 99, 235, 0.65);
              box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.11);
            }
            .gapp-segmented {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              overflow: hidden;
              border: 1px solid var(--gapp-line);
              border-radius: 11px;
              background: #f8fafc;
              min-height: 42px;
            }
            .gapp-segmented button {
              appearance: none;
              border: 0;
              background: transparent;
              color: #334155;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
              transition: background .18s ease, color .18s ease, box-shadow .18s ease;
            }
            .gapp-segmented button.active {
              background: var(--gapp-blue);
              color: #fff;
              box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28);
            }
            .gapp-segmented-choice { grid-template-columns: repeat(var(--segments, 3), 1fr); }
            .gapp-segmented-icon { display: inline-flex; margin-right: 8px; vertical-align: -3px; }
            .gapp-section-heading { margin-bottom: 20px; }
            .gapp-section-heading h3 { margin: 0 0 6px; font-size: 19px; color: var(--gapp-text); }
            .gapp-section-heading p { margin: 0; color: var(--gapp-muted); font-size: 13px; }
            .gapp-upload-wrap { display: grid; gap: 8px; }
            .gapp-upload-zone {
              display: grid;
              grid-template-columns: 50px minmax(0, 1fr);
              align-items: center;
              gap: 14px;
              min-height: 74px;
              border: 1.5px dashed #9fb0c5;
              border-radius: 13px;
              background: linear-gradient(180deg, #fff, #fbfdff);
              padding: 12px 14px;
              cursor: pointer;
              transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .gapp-upload-zone.drag-active {
              border-color: var(--gapp-blue);
              background: #eff6ff;
              box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
            }
            .gapp-upload-icon {
              display: grid;
              place-items: center;
              width: 46px;
              height: 46px;
              border-radius: 11px;
              color: #1e3a8a;
              background: #f1f5f9;
              border: 1px solid #dbe4f0;
            }
            .gapp-upload-copy { display: grid; gap: 3px; color: #334155; }
            .gapp-upload-copy strong { font-size: 14px; }
            .gapp-upload-copy small { color: var(--gapp-muted); font-size: 12.5px; }
            .gapp-file-input { display: none; }
            .gapp-upload-preview-row {
              display: flex;
              gap: 12px;
              align-items: center;
              min-width: 0;
              color: var(--gapp-blue);
              font-size: 12.5px;
            }
            .gapp-upload-preview { object-fit: cover; border: 1px solid #dbe4f0; background: #fff; }
            .gapp-upload-preview.wide { width: 132px; height: 76px; border-radius: 12px; }
            .gapp-upload-preview.round { width: 58px; height: 58px; border-radius: 999px; }
            .gapp-upload-preview.square { width: 58px; height: 58px; border-radius: 14px; }
            .gapp-inline-switch-row {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              gap: 14px;
              align-items: center;
            }
            .gapp-switch {
              position: relative;
              display: inline-flex;
              align-items: center;
              justify-content: flex-end;
              width: 68px;
              height: 34px;
              border: 1px solid #cbd5e1;
              border-radius: 999px;
              background: #e2e8f0;
              color: #64748b;
              padding: 0 9px 0 34px;
              font-size: 10px;
              font-weight: 900;
              cursor: pointer;
              transition: background .18s ease, border-color .18s ease;
            }
            .gapp-switch.active {
              justify-content: flex-start;
              padding: 0 34px 0 9px;
              background: var(--gapp-blue);
              border-color: var(--gapp-blue);
              color: #fff;
            }
            .gapp-switch-knob {
              position: absolute;
              left: 4px;
              width: 26px;
              height: 26px;
              border-radius: 999px;
              background: #fff;
              box-shadow: 0 4px 10px rgba(15, 23, 42, .18);
              transition: transform .18s ease;
            }
            .gapp-switch.active .gapp-switch-knob { transform: translateX(34px); }
            .gapp-payment-layout { grid-template-columns: minmax(0, 1fr); gap: 34px; }
            .gapp-pane { min-width: 0; }
            .gapp-divider-pane { border-left: 1px solid #edf2f7; padding-left: 34px; }
            .gapp-payment-list { display: grid; gap: 10px; margin-bottom: 20px; }
            .gapp-payment-row {
              display: grid;
              grid-template-columns: 46px minmax(0, 1fr) auto;
              align-items: center;
              gap: 14px;
              min-height: 58px;
              border: 1px solid var(--gapp-line);
              border-radius: 13px;
              padding: 8px 12px;
              background: #fff;
            }
            .gapp-payment-icon {
              display: grid;
              place-items: center;
              width: 42px;
              height: 42px;
              border-radius: 11px;
              background: #f8fafc;
              color: #1e3a8a;
              border: 1px solid #e2e8f0;
            }
            .gapp-payment-row strong { color: #172554; font-size: 14px; }
            .gapp-payment-toggle-row {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 14px;
              margin-top: 4px;
            }
            .gapp-payment-toggle-card {
              border: 1px solid #dbe7fb;
              border-radius: 14px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              box-shadow: 0 6px 16px rgba(30, 64, 175, 0.06);
              padding: 12px 14px;
              align-content: start;
            }
            .gapp-toggle-head {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 12px;
            }
            .gapp-toggle-head .gapp-label { margin-top: 2px; }
            .gapp-field.gapp-deposit-field { margin-top: 12px; }
            .gapp-deposit-input-wrap {
              position: relative;
              display: flex;
              align-items: center;
            }
            .gapp-deposit-input {
              width: 100%;
              min-height: 44px;
              border: 1px solid #cddcf5;
              border-radius: 12px;
              background: #f8fbff;
              color: #1e3a8a;
              font-size: 16px;
              font-weight: 800;
              letter-spacing: .02em;
              line-height: 1.2;
              padding: 10px 40px 10px 14px;
              outline: none;
              box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05);
              transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
            }
            .gapp-deposit-input:focus {
              border-color: rgba(37, 99, 235, 0.65);
              background: #fff;
              box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
            }
            .gapp-deposit-input-suffix {
              position: absolute;
              right: 10px;
              top: 50%;
              transform: translateY(-50%);
              min-width: 24px;
              height: 24px;
              border-radius: 999px;
              display: grid;
              place-items: center;
              padding: 0 7px;
              background: #e7efff;
              color: #1d4ed8;
              font-size: 12px;
              font-weight: 900;
              pointer-events: none;
            }
            .gapp-mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; }
            .gapp-provider-card { display: grid; gap: 20px; }
            .gapp-password-wrap,
            .gapp-link-input-wrap { position: relative; }
            .gapp-input-icon-button {
              position: absolute;
              right: 10px;
              top: 50%;
              transform: translateY(-50%);
              display: grid;
              place-items: center;
              width: 30px;
              height: 30px;
              border: 0;
              border-radius: 9px;
              color: #1d4ed8;
              background: #eff6ff;
              cursor: pointer;
            }
            .gapp-link-copy-button {
              color: #111111;
              background: transparent;
              border-radius: 0;
              top: 38%;
            }
            .gapp-link-copy-button:hover,
            .gapp-link-copy-button:focus,
            .gapp-link-copy-button:focus-visible,
            .gapp-link-copy-button:active {
              background: transparent;
              box-shadow: none;
              outline: none;
            }
            .gapp-link-copy-button svg {
              display: block;
            }
            .gapp-status-pill {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              width: fit-content;
              border-radius: 999px;
              padding: 10px 16px;
              background: #dcfce7;
              color: #047857;
              font-weight: 800;
              font-size: 14px;
            }
            .gapp-security-note,
            .gapp-help-panel {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              gap: 14px;
              align-items: start;
              border: 1px solid #bfdbfe;
              border-radius: 15px;
              background: linear-gradient(180deg, #eff6ff, #f8fbff);
              color: #1e3a8a;
              padding: 18px;
            }
            .gapp-security-note strong,
            .gapp-help-panel strong { display: block; margin-bottom: 5px; color: #1e3a8a; }
            .gapp-security-note p,
            .gapp-help-panel p { margin: 0; color: #334155; font-size: 13px; line-height: 1.5; }
            .gapp-help-panel ul { margin: 4px 0 0 18px; padding: 0; color: #334155; font-size: 13px; line-height: 1.55; }
            .gapp-qr-layout { grid-template-columns: .96fr 1fr; gap: 38px; }
            .gapp-color-input { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 10px; }
            .gapp-color-input input[type='color'] {
              width: 48px;
              height: 42px;
              border: 1px solid var(--gapp-line);
              border-radius: 11px;
              padding: 4px;
              background: #fff;
            }
            .gapp-export-tabs { --segments: 3; }
            .gapp-qr-preview-panel { display: grid; gap: 18px; }
            .gapp-qr-card {
              border: 1px solid var(--gapp-line);
              border-radius: 18px;
              background: #fff;
              text-align: center;
              padding: 26px 24px 18px;
            }
            .gapp-qr-card h3 { margin: 0 0 6px; font-size: 22px; color: var(--gapp-text); }
            .gapp-qr-card p { margin: 0; color: var(--gapp-muted); font-size: 13px; }
            .gapp-qr-frame {
              display: inline-grid;
              place-items: center;
              margin: 16px auto 8px;
              width: 244px;
              height: 244px;
              border: 1px solid #dbeafe;
              border-radius: 14px;
              background: #fff;
            }
            .gapp-qr-svg { width: 214px; height: 214px; image-rendering: pixelated; }
            .gapp-qr-caption { margin-top: 4px; font-weight: 800; color: #1e3a8a; }
            .gapp-qr-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
            .gapp-qr-actions .gapp-outline-button { min-height: 42px; padding: 0 14px; }
            @media (max-width: 980px) {
              .gapp-grid,
              .gapp-form-grid,
              .gapp-payment-layout,
              .gapp-qr-layout,
              .gapp-mini-grid { grid-template-columns: 1fr; }
              .gapp-payment-toggle-row { grid-template-columns: 1fr; }
              .gapp-divider-pane { border-left: 0; padding-left: 0; border-top: 1px solid #edf2f7; padding-top: 24px; }
              .gapp-subtabs { gap: 18px; overflow-x: auto; }
              .gapp-panel { padding: 22px; }
              .gapp-qr-actions { grid-template-columns: 1fr; }
            }
          `}</style>
                  <div
                    className="gapp-subtabs"
                    role="tablist"
                    aria-label="Guest app settings"
                  >
                    {guestAppSubtabs(t).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={guestAppSubtab === entry.id}
                        className={
                          guestAppSubtab === entry.id
                            ? "gapp-subtab active"
                            : "gapp-subtab"
                        }
                        onClick={() => setGuestAppSubtab(entry.id)}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>

                  <div className="gapp-panel">
                    {guestAppSubtab === "general" ? (
                      <>
                        <div className="gapp-form-grid">
                          <div className="gapp-column">
                            <GuestField
                              label={
                                locale === "sl"
                                  ? "Koda podjetja"
                                  : "Tenant code"
                              }
                              hint={
                                locale === "sl"
                                  ? "Gostje uporabijo to kodo za pridružitev vašemu podjetju v mobilni aplikaciji."
                                  : "Guests use this code to join your tenant from the mobile app."
                              }
                            >
                              <input
                                className="gapp-input"
                                value={me.tenantCode || ""}
                                readOnly
                              />
                            </GuestField>
                            <GuestField
                              label={
                                locale === "sl"
                                  ? "Javno najdljivo"
                                  : "Public discoverable"
                              }
                              hint={
                                locale === "sl"
                                  ? "Ko je VKLOPLJENO, se to podjetje lahko prikaže v javnih rezultatih iskanja aplikacije za goste."
                                  : "When ON, this tenant can appear in guest-app public search results."
                              }
                            >
                              <GuestSegmentedToggle
                                value={guestAppSettings.publicDiscoverable}
                                onChange={(value) =>
                                  setGuestAppSettings({
                                    ...guestAppSettings,
                                    publicDiscoverable: value,
                                  })
                                }
                              />
                            </GuestField>
                            <GuestField
                              label={
                                locale === "sl" ? "Javno ime" : "Public name"
                              }
                            >
                              <input
                                className="gapp-input"
                                maxLength={GUEST_PUBLIC_NAME_MAX_LENGTH}
                                value={guestAppSettings.publicName}
                                onChange={(e) =>
                                  setGuestAppSettings({
                                    ...guestAppSettings,
                                    publicName: normalizePublicName(
                                      e.target.value,
                                    ),
                                  })
                                }
                              />
                            </GuestField>
                            <GuestField
                              label={
                                locale === "sl" ? "Javno mesto" : "Public city"
                              }
                            >
                              <input
                                className="gapp-input"
                                maxLength={GUEST_PUBLIC_CITY_MAX_LENGTH}
                                value={guestAppSettings.publicCity}
                                onChange={(e) =>
                                  setGuestAppSettings({
                                    ...guestAppSettings,
                                    publicCity: normalizePublicCity(
                                      e.target.value,
                                    ),
                                  })
                                }
                              />
                            </GuestField>
                            <GuestField
                              label={
                                locale === "sl"
                                  ? "Javni opis"
                                  : "Public description"
                              }
                              hint={
                                locale === "sl"
                                  ? "Prikazano v iskanju gostov (1 vrstica, omejena dolžina)."
                                  : "Shown in guest browse results (single line, limited length)."
                              }
                            >
                              <input
                                className="gapp-input"
                                maxLength={GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH}
                                value={guestAppSettings.publicDescription}
                                onChange={(e) =>
                                  setGuestAppSettings({
                                    ...guestAppSettings,
                                    publicDescription:
                                      normalizePublicDescriptionInput(
                                        e.target.value,
                                      ),
                                  })
                                }
                              />
                            </GuestField>
                          </div>
                          <div className="gapp-column">
                            <GuestField
                              label={
                                locale === "sl"
                                  ? "Korak izbire zaposlenega"
                                  : "Employee selection step"
                              }
                              hint={
                                locale === "sl"
                                  ? "Ko je VKLOPLJENO, gost po izbiri storitve v mobilni aplikaciji in spletnem gradniku izbere zaposlenega."
                                  : "When ON, guest clients pick an employee after choosing the service in the mobile app and website booking widget."
                              }
                            >
                              <GuestSegmentedToggle
                                value={guestAppSettings.employeeSelectionStep}
                                onChange={(value) =>
                                  setGuestAppSettings({
                                    ...guestAppSettings,
                                    employeeSelectionStep: value,
                                  })
                                }
                              />
                            </GuestField>
                            <GuestField
                              label={
                                locale === "sl"
                                  ? "Uporabi kontakt zaposlenega"
                                  : "Use employee contact"
                              }
                              hint={
                                locale === "sl"
                                  ? "Ko je VKLOPLJENO, prihajajoče rezervacije na začetnem zaslonu gostov uporabijo telefon dodeljenega zaposlenega za Klic/Sporočilo, kjer je na voljo."
                                  : "When ON, upcoming bookings on guest Home use assigned employee phone for Call/Message when available."
                              }
                            >
                              <GuestSegmentedToggle
                                value={guestAppSettings.useEmployeeContact}
                                onChange={(value) =>
                                  setGuestAppSettings({
                                    ...guestAppSettings,
                                    useEmployeeContact: value,
                                  })
                                }
                              />
                            </GuestField>
                            <GuestField
                              label={
                                locale === "sl"
                                  ? "Slika kartice v karuselu"
                                  : "Carousel card image"
                              }
                            >
                              <GuestUploadDropzone
                                title={
                                  locale === "sl"
                                    ? "Povlecite sliko sem ali kliknite za izbiro"
                                    : "Drag image here or click to choose"
                                }
                                subtitle={
                                  locale === "sl"
                                    ? "PNG, JPG ali WebP · Priporočeno 16:9"
                                    : "PNG, JPG or WebP · Recommended 16:9"
                                }
                                hint={
                                  locale === "sl"
                                    ? "Naložite sliko, uporabljeno kot večji vizual kartice v karuselu podjetij v mobilni aplikaciji za goste."
                                    : "Upload image used as the large card visual on guest-mobile tenancy carousel."
                                }
                                currentUrl={guestAppSettings.cardImageUrl}
                                previewAlt="Current carousel card image"
                                previewShape="wide"
                                iconKind="image"
                                onFile={(selected) =>
                                  void uploadGuestAppAsset(
                                    "cardImageUrl",
                                    selected,
                                  )
                                }
                                uploading={
                                  uploadingGuestAsset === "cardImageUrl"
                                }
                              />
                            </GuestField>
                            <GuestField
                              label={
                                locale === "sl"
                                  ? "Logotip v karuselu"
                                  : "Carousel logo"
                              }
                            >
                              <GuestUploadDropzone
                                title={
                                  locale === "sl"
                                    ? "Povlecite logotip sem ali kliknite za izbiro"
                                    : "Drag logo here or click to choose"
                                }
                                subtitle={
                                  locale === "sl"
                                    ? "PNG ali WebP · Priporočeno 512×512"
                                    : "PNG or WebP · Recommended 512×512"
                                }
                                hint={
                                  locale === "sl"
                                    ? "Naložite krožni logotip, prikazan čez kartico karusela v mobilni aplikaciji za goste."
                                    : "Upload circular logo shown over the guest-mobile carousel card."
                                }
                                currentUrl={guestAppSettings.logoImageUrl}
                                previewAlt="Current carousel logo image"
                                previewShape="round"
                                iconKind="logo"
                                onFile={(selected) =>
                                  void uploadGuestAppAsset(
                                    "logoImageUrl",
                                    selected,
                                  )
                                }
                                uploading={
                                  uploadingGuestAsset === "logoImageUrl"
                                }
                              />
                            </GuestField>
                          </div>
                        </div>
                        <div className="gapp-savebar">
                          <button
                            type="button"
                            className="gapp-primary-button"
                            onClick={saveGuestAppConfiguration}
                            disabled={savingSettings}
                          >
                            <GuestSaveIcon />
                            {savingSettings
                              ? t("formSaving")
                              : t("configSaveConfiguration")}
                          </button>
                        </div>
                      </>
                    ) : guestAppSubtab === "bookingRules" ? (
                      <>
                        <div className="gapp-form-grid">
                          <div className="gapp-column">
                            <GuestField
                              label="Minimalni čas pred rezervacijo"
                              hint="Najkasnejši čas pred začetkom termina, ko lahko gost opravi rezervacijo."
                            >
                              <input
                                className="gapp-input"
                                value={guestBookingRules.minBookingNotice}
                                onChange={(e) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    minBookingNotice: e.target.value,
                                  })
                                }
                              />
                            </GuestField>
                            <GuestField
                              label="Maksimalni čas vnaprej"
                              hint="Največje časovno obdobje vnaprej, za katero je mogoče ustvariti rezervacijo."
                            >
                              <select
                                className="gapp-select"
                                value={guestBookingRules.maxAdvanceDays}
                                onChange={(e) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    maxAdvanceDays: e.target.value,
                                  })
                                }
                              >
                                <option value="30">30 dni</option>
                                <option value="60">60 dni</option>
                                <option value="90">90 dni</option>
                                <option value="180">180 dni</option>
                              </select>
                            </GuestField>
                            <GuestField
                              label="Odpoved rezervacije"
                              hint="Ko je vklopljeno, lahko gostje odpovejo rezervacijo po pravilih odpovedi."
                            >
                              <GuestSegmentedToggle
                                value={guestBookingRules.cancellationEnabled}
                                onChange={(value) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    cancellationEnabled: value,
                                  })
                                }
                              />
                            </GuestField>
                            <GuestField
                              label="Brezplačna odpoved do"
                              hint="Gost lahko odpove brez stroškov do izteka nastavljenega časa pred terminom."
                            >
                              <input
                                className="gapp-input"
                                value={`${guestBookingRules.freeCancelUntilHours} ur`}
                                onChange={(e) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    freeCancelUntilHours:
                                      e.target.value.replace(/[^0-9]/g, ""),
                                  })
                                }
                              />
                            </GuestField>
                            <div className="gapp-inline-switch-row">
                              <GuestSwitch
                                checked={
                                  guestBookingRules.autoConfirmReservation
                                }
                                onChange={(checked) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    autoConfirmReservation: checked,
                                  })
                                }
                              />
                              <div>
                                <span className="gapp-label">
                                  Samodejna potrditev rezervacije
                                </span>
                                <span className="gapp-hint">
                                  Ko je vklopljeno, se rezervacije samodejno
                                  potrdijo, če ni potrebna ročna odobritev.
                                </span>
                              </div>
                            </div>
                            <GuestField
                              label="Varnostni čas pred terminom"
                              hint="Dodatni čas pred začetkom termina za pripravo storitve."
                            >
                              <input
                                className="gapp-input"
                                value={`${guestBookingRules.bufferBeforeMinutes} min`}
                                onChange={(e) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    bufferBeforeMinutes: e.target.value.replace(
                                      /[^0-9]/g,
                                      "",
                                    ),
                                  })
                                }
                              />
                            </GuestField>
                            <GuestField
                              label="Varnostni čas po terminu"
                              hint="Dodatni čas po koncu termina za zaključek in čiščenje."
                            >
                              <input
                                className="gapp-input"
                                value={`${guestBookingRules.bufferAfterMinutes} min`}
                                onChange={(e) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    bufferAfterMinutes: e.target.value.replace(
                                      /[^0-9]/g,
                                      "",
                                    ),
                                  })
                                }
                              />
                            </GuestField>
                          </div>
                          <div className="gapp-column">
                            <GuestField
                              label="Politika za no-show"
                              hint="Izberite, kako ravnati v primeru, da se gost ne pojavi."
                            >
                              <select
                                className="gapp-select"
                                value={guestBookingRules.noShowPolicy}
                                onChange={(e) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    noShowPolicy: e.target.value,
                                  })
                                }
                              >
                                <option value="charge_deposit">
                                  Zaračunaj polog
                                </option>
                                <option value="consume_credit">
                                  Porabi dobroimetje
                                </option>
                                <option value="mark_only">
                                  Samo označi no-show
                                </option>
                              </select>
                            </GuestField>
                            <GuestField
                              label="Pravila vračila"
                              hint="Vračila se obdelajo samodejno na podlagi pravil odpovedi."
                            >
                              <select
                                className="gapp-select"
                                value={guestBookingRules.refundPolicy}
                                onChange={(e) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    refundPolicy: e.target.value,
                                  })
                                }
                              >
                                <option value="auto_by_cancellation_deadline">
                                  Samodejno glede na rok odpovedi
                                </option>
                                <option value="manual_review">
                                  Ročni pregled
                                </option>
                                <option value="no_refund_after_payment">
                                  Brez vračila po plačilu
                                </option>
                              </select>
                            </GuestField>
                            <GuestField
                              label="Besedilo pravil"
                              hint="To besedilo se prikaže gostu v aplikaciji pri postopku rezervacije."
                            >
                              <textarea
                                className="gapp-textarea"
                                rows={5}
                                value={guestBookingRules.policyText}
                                onChange={(e) =>
                                  setGuestBookingRules({
                                    ...guestBookingRules,
                                    policyText: e.target.value,
                                  })
                                }
                              />
                            </GuestField>
                          </div>
                        </div>
                        <div className="gapp-savebar">
                          <button
                            type="button"
                            className="gapp-primary-button"
                            onClick={saveGuestAppConfiguration}
                            disabled={savingSettings}
                          >
                            <GuestSaveIcon />
                            {savingSettings
                              ? t("formSaving")
                              : t("configSaveConfiguration")}
                          </button>
                        </div>
                      </>
                    ) : guestAppSubtab === "paymentMethods" ? (
                      <>
                        <div className="gapp-grid gapp-payment-layout">
                          <div className="gapp-pane">
                            <div className="gapp-section-heading">
                              <h3>Sprejeti načini plačila</h3>
                              <p>
                                Izberite, katere načine plačila želite omogočiti
                                gostom.
                              </p>
                            </div>
                            <div className="gapp-payment-list">
                              {visibleGuestPaymentMethodOptions.map(
                                (method) => (
                                  <div
                                    className="gapp-payment-row"
                                    key={method.id}
                                  >
                                    <span className="gapp-payment-icon">
                                      <GuestPaymentMethodIcon
                                        kind={method.id}
                                      />
                                    </span>
                                    <strong>{method.label}</strong>
                                    <GuestSwitch
                                      checked={guestAppSettings.acceptedPaymentMethodIds.includes(
                                        method.id,
                                      )}
                                      onChange={() =>
                                        toggleGuestPaymentMethod(method.id)
                                      }
                                    />
                                  </div>
                                ),
                              )}
                            </div>
                            <div className="gapp-payment-toggle-row">
                              <div className="gapp-payment-toggle-card">
                                <div className="gapp-toggle-head">
                                  <span className="gapp-label">
                                    Delno plačilo
                                  </span>
                                  <GuestSwitch
                                    checked={
                                      guestBookingRules.paymentRequirement ===
                                      "deposit"
                                    }
                                    onChange={(checked) => {
                                      setGuestBookingRules({
                                        ...guestBookingRules,
                                        paymentRequirement: checked
                                          ? "deposit"
                                          : "full",
                                      });
                                    }}
                                  />
                                </div>
                                <span className="gapp-hint">
                                  Ko je izklopljeno, se samodejno zaračuna polni
                                  znesek.
                                </span>
                                {guestBookingRules.paymentRequirement ===
                                "deposit" ? (
                                  <GuestField
                                    className="gapp-deposit-field"
                                    label="Znesek pologa"
                                    hint="Odstotek od skupnega zneska, ki ga gost plača ob rezervaciji."
                                  >
                                    <div className="gapp-deposit-input-wrap">
                                      <input
                                        className="gapp-deposit-input"
                                        value={guestBookingRules.depositPercent}
                                        onChange={(e) =>
                                          setGuestBookingRules({
                                            ...guestBookingRules,
                                            depositPercent:
                                              e.target.value.replace(
                                                /[^0-9]/g,
                                                "",
                                              ),
                                          })
                                        }
                                      />
                                      <span className="gapp-deposit-input-suffix">
                                        %
                                      </span>
                                    </div>
                                  </GuestField>
                                ) : null}
                              </div>
                              <div className="gapp-payment-toggle-card">
                                <div className="gapp-toggle-head">
                                  <span className="gapp-label">
                                    Plačilo na lokaciji
                                  </span>
                                  <GuestSwitch
                                    checked={guestAppSettings.paymentOnLocation}
                                    onChange={(checked) => {
                                      setGuestAppSettings({
                                        ...guestAppSettings,
                                        paymentOnLocation: checked,
                                      });
                                      setGuestBookingRules((prev) =>
                                        normalizeBookingRulesForPaymentLocation(
                                          prev,
                                          checked,
                                        ),
                                      );
                                    }}
                                  />
                                </div>
                                <span className="gapp-hint">
                                  Ko je vklopljeno, gost rezervira brez
                                  spletnega plačila in poravna na lokaciji.
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="gapp-savebar">
                          <button
                            type="button"
                            className="gapp-primary-button"
                            onClick={saveGuestAppConfiguration}
                            disabled={savingSettings}
                          >
                            <GuestSaveIcon />
                            {savingSettings
                              ? t("formSaving")
                              : t("configSaveConfiguration")}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="gapp-grid gapp-qr-layout">
                          <div className="gapp-column">
                            <GuestField
                              label="Povezava za goste"
                              hint="To je povezava, na katero bo uporabnik preusmerjen po skeniranju QR kode."
                            >
                              <div className="gapp-link-input-wrap">
                                <input
                                  className="gapp-input"
                                  value={guestQrInputLink}
                                  onChange={(e) =>
                                    setGuestAppSettings({
                                      ...guestAppSettings,
                                      qrGuestUrl: e.target.value,
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  className="gapp-input-icon-button gapp-link-copy-button"
                                  onClick={() => void copyGuestQrLink()}
                                  aria-label="Kopiraj povezavo"
                                >
                                  <GuestCopyIcon />
                                </button>
                              </div>
                            </GuestField>
                            <GuestField
                              label="Velikost QR kode"
                              hint="Izberite velikost QR kode za najboljšo kakovost."
                            >
                              <select
                                className="gapp-select"
                                value={guestAppSettings.qrSize}
                                onChange={(e) =>
                                  setGuestAppSettings({
                                    ...guestAppSettings,
                                    qrSize: e.target.value,
                                  })
                                }
                              >
                                <option value="512 x 512">512 x 512</option>
                                <option value="1024 x 1024">1024 x 1024</option>
                                <option value="2048 x 2048">2048 x 2048</option>
                              </select>
                            </GuestField>
                            <GuestField
                              label="Barva QR kode"
                              hint="Izberite barvo modulov QR kode."
                            >
                              <div className="gapp-color-input">
                                <input
                                  type="color"
                                  value={guestQrColor}
                                  onChange={(e) =>
                                    setGuestAppSettings({
                                      ...guestAppSettings,
                                      qrColor: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  className="gapp-input"
                                  value={guestQrColor}
                                  onChange={(e) =>
                                    setGuestAppSettings({
                                      ...guestAppSettings,
                                      qrColor: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </GuestField>
                          </div>
                          <div className="gapp-qr-preview-panel">
                            <div>
                              <span className="gapp-label">
                                Predogled QR kode
                              </span>
                              <div className="gapp-qr-card">
                                {guestQrMatrix ? (
                                  <div
                                    className="gapp-qr-frame"
                                    aria-label={guestQrTitle}
                                  >
                                    <svg
                                      className="gapp-qr-svg"
                                      viewBox={`0 0 ${guestQrViewBoxSize} ${guestQrViewBoxSize}`}
                                      role="img"
                                      aria-label={guestQrTitle}
                                    >
                                      <title>{guestQrTitle}</title>
                                      <rect
                                        width="100%"
                                        height="100%"
                                        fill="#fff"
                                      />
                                      <path
                                        d={guestQrPath}
                                        fill={guestQrColor}
                                      />
                                    </svg>
                                  </div>
                                ) : (
                                  <EmptyState
                                    title="QR koda ni na voljo"
                                    text="Povezava je predolga ali ni veljavna za prikaz QR kode."
                                  />
                                )}
                                <div className="gapp-qr-actions">
                                  <button
                                    type="button"
                                    className="gapp-outline-button"
                                    onClick={saveGuestQrPng}
                                    disabled={!guestQrMatrix}
                                  >
                                    <GuestDownloadIcon /> Prenesi PNG
                                  </button>
                                  <button
                                    type="button"
                                    className="gapp-outline-button"
                                    onClick={saveGuestQrSvg}
                                    disabled={!guestQrMatrix}
                                  >
                                    <GuestDownloadIcon /> Prenesi SVG
                                  </button>
                                  <button
                                    type="button"
                                    className="gapp-outline-button"
                                    onClick={saveGuestQrPdf}
                                    disabled={!guestQrMatrix}
                                  >
                                    <GuestDownloadIcon /> Prenesi PDF
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="gapp-help-panel">
                              <GuestInfoIcon />
                              <div>
                                <strong>Kje lahko uporabite QR kodo?</strong>
                                <ul>
                                  <li>
                                    Na spletni strani in v e-poštnih podpisih
                                  </li>
                                  <li>
                                    Na vizitkah, letakih in promocijskih
                                    gradivih
                                  </li>
                                  <li>
                                    V salonu, na recepciji ali na informacijskih
                                    tablah
                                  </li>
                                  <li>V družbenih omrežjih in oglasih</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="gapp-savebar">
                          <button
                            type="button"
                            className="gapp-primary-button"
                            onClick={saveGuestAppConfiguration}
                            disabled={savingSettings}
                          >
                            <GuestSaveIcon />
                            {savingSettings
                              ? t("formSaving")
                              : t("configSaveConfiguration")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              ) : tab === "website" ? (
                <Card className="settings-card guest-app-settings-card gapp-modern-card website-settings-card">
                  <style>{`
            .website-settings-card {
              --gapp-blue: #2563eb;
              --gapp-blue-dark: #1d4ed8;
              --gapp-text: #0f1b3d;
              --gapp-muted: #64748b;
              --gapp-line: #dbe4f0;
              --gapp-soft: #f8fafc;
              --gapp-soft-blue: #eff6ff;
              border-radius: 24px;
              border: 1px solid rgba(203, 213, 225, 0.78);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              background: #fff;
              padding: 28px 34px 32px;
              color: var(--gapp-text);
              overflow: visible;
            }
            .website-settings-card button { font-family: inherit; }
            .website-settings-card .gapp-subtabs {
              display: flex;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
              margin: 20px 0 10px;
              padding: 0;
              border-bottom: 1px solid #edf2f7;
            }
            .website-settings-card .gapp-subtab {
              position: relative;
              appearance: none;
              border: 0;
              background: transparent;
              color: #334155;
              font-weight: 700;
              font-size: 15px;
              padding: 10px 14px;
              cursor: pointer;
              border-radius: 10px;
              box-shadow: none;
              outline: none;
              transition: color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .website-settings-card .gapp-subtab:hover { color: #0f172a; background: #f8fafc; }
            .website-settings-card .gapp-subtab.active {
              color: #2563eb;
              background: #eaf2ff;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16), 0 3px 10px rgba(37, 99, 235, 0.18);
            }
            .website-settings-card .gapp-subtab.active::after { content: none; }
            .website-settings-card .gapp-panel {
              margin-top: 12px;
              border: 1px solid rgba(203, 213, 225, 0.86);
              border-radius: 22px;
              background: #fff;
              padding: 34px;
              box-shadow: 0 18px 50px rgba(15, 23, 42, 0.07);
            }
            .website-settings-card .gapp-grid,
            .website-settings-card .gapp-form-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 38px 70px;
            }
            .website-settings-card .gapp-column { display: grid; gap: 22px; align-content: start; }
            .website-settings-card .gapp-field { display: grid; gap: 8px; }
            .website-settings-card .gapp-label {
              display: block;
              font-size: 14px;
              font-weight: 800;
              color: var(--gapp-text);
              line-height: 1.2;
            }
            .website-settings-card .gapp-hint {
              display: block;
              margin-top: 0;
              color: var(--gapp-muted);
              font-size: 12.5px;
              line-height: 1.45;
            }
            .website-settings-card .gapp-section-heading { margin: 0 0 20px; }
            .website-settings-card .gapp-section-heading h3 { margin: 0 0 6px; font-size: 19px; line-height: 1.2; color: var(--gapp-text); letter-spacing: 0; font-weight: 800; }
            .website-settings-card .gapp-section-heading p { margin: 0; color: var(--gapp-muted); font-size: 13px; line-height: 1.45; }
            .website-settings-card .gapp-payment-layout { grid-template-columns: minmax(0, 1fr); gap: 34px; }
            .website-settings-card .gapp-pane { min-width: 0; }
            .website-settings-card .gapp-payment-list { display: grid; gap: 10px; margin-bottom: 20px; }
            .website-settings-card .gapp-payment-row {
              display: grid;
              grid-template-columns: 46px minmax(0, 1fr) auto;
              align-items: center;
              gap: 14px;
              min-height: 58px;
              border: 1px solid var(--gapp-line);
              border-radius: 13px;
              padding: 8px 12px;
              background: #fff;
              box-shadow: none;
            }
            .website-settings-card .gapp-payment-icon {
              display: grid;
              place-items: center;
              width: 42px;
              height: 42px;
              border-radius: 11px;
              background: #f8fafc;
              color: #1e3a8a;
              border: 1px solid #e2e8f0;
            }
            .website-settings-card .gapp-payment-row strong { color: #172554; font-size: 14px; font-weight: 800; }
            .website-settings-card .gapp-payment-toggle-row {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 14px;
              margin-top: 4px;
            }
            .website-settings-card .gapp-payment-toggle-card {
              border: 1px solid #dbe7fb;
              border-radius: 14px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              box-shadow: 0 6px 16px rgba(30, 64, 175, 0.06);
              padding: 12px 14px;
              align-content: start;
            }
            .website-settings-card .gapp-toggle-head {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 12px;
            }
            .website-settings-card .gapp-toggle-head .gapp-label { margin-top: 2px; }
            .website-settings-card .gapp-switch {
              position: relative;
              display: inline-flex;
              align-items: center;
              justify-content: flex-end;
              width: 68px;
              height: 34px;
              border: 1px solid #cbd5e1;
              border-radius: 999px;
              background: #e2e8f0;
              color: #64748b;
              padding: 0 9px 0 34px;
              font-size: 10px;
              font-weight: 900;
              cursor: pointer;
              transition: background .18s ease, border-color .18s ease;
            }
            .website-settings-card .gapp-switch-label { margin-left: 0; z-index: 1; }
            .website-settings-card .gapp-switch.active {
              justify-content: flex-start;
              padding: 0 34px 0 9px;
              background: var(--gapp-blue);
              border-color: var(--gapp-blue);
              color: #fff;
            }
            .website-settings-card .gapp-switch.active .gapp-switch-label { margin-left: 0; margin-right: 0; }
            .website-settings-card .gapp-switch-knob {
              position: absolute;
              left: 4px;
              width: 26px;
              height: 26px;
              border-radius: 999px;
              background: #fff;
              box-shadow: 0 4px 10px rgba(15, 23, 42, .18);
              transition: transform .18s ease;
            }
            .website-settings-card .gapp-switch.active .gapp-switch-knob { transform: translateX(34px); }
            .website-settings-card .gapp-segmented {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              overflow: hidden;
              border: 1px solid var(--gapp-line);
              border-radius: 11px;
              background: #f8fafc;
              min-height: 42px;
            }
            .website-settings-card .gapp-segmented button {
              appearance: none;
              border: 0;
              background: transparent;
              color: #334155;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
              transition: background .18s ease, color .18s ease, box-shadow .18s ease;
            }
            .website-settings-card .gapp-segmented button.active {
              background: var(--gapp-blue);
              color: #fff;
              box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28);
            }
            .website-settings-card .gapp-field.gapp-deposit-field { margin-top: 12px; }
            .website-settings-card .gapp-deposit-input-wrap { position: relative; display: flex; align-items: center; }
            .website-settings-card .gapp-deposit-input {
              width: 100%;
              min-height: 44px;
              border: 1px solid #cddcf5;
              border-radius: 12px;
              background: #f8fbff;
              color: #1e3a8a;
              font-size: 16px;
              font-weight: 800;
              letter-spacing: .02em;
              line-height: 1.2;
              padding: 10px 40px 10px 14px;
              outline: none;
              box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05);
              transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
            }
            .website-settings-card .gapp-deposit-input:focus {
              border-color: rgba(37, 99, 235, 0.65);
              background: #fff;
              box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
            }
            .website-settings-card .gapp-deposit-input-suffix {
              position: absolute;
              right: 10px;
              top: 50%;
              transform: translateY(-50%);
              min-width: 24px;
              height: 24px;
              border-radius: 999px;
              display: grid;
              place-items: center;
              padding: 0 7px;
              background: #e7efff;
              color: #1d4ed8;
              font-size: 12px;
              font-weight: 900;
              pointer-events: none;
            }
            .website-settings-card .gapp-savebar { display: flex; justify-content: flex-end; margin-top: 30px; }
            .website-settings-card .gapp-primary-button {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              min-height: 44px;
              border: 1px solid #2563eb;
              border-radius: 12px;
              padding: 0 22px;
              background: #2563eb;
              color: #fff;
              font-weight: 800;
              font-size: 14px;
              cursor: pointer;
              box-shadow: 0 12px 26px rgba(37, 99, 235, 0.28);
              box-sizing: border-box;
              transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
            }
            .website-settings-card .gapp-primary-button:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
            .website-settings-card .gapp-primary-button:disabled { opacity: .62; cursor: not-allowed; transform: none; }
            @media (max-width: 980px) {
              .website-settings-card { padding: 24px; }
              .website-settings-card .gapp-grid,
              .website-settings-card .gapp-form-grid,
              .website-settings-card .gapp-payment-layout { grid-template-columns: 1fr; }
              .website-settings-card .gapp-payment-toggle-row { grid-template-columns: 1fr; }
              .website-settings-card .gapp-subtabs { gap: 18px; overflow-x: auto; }
              .website-settings-card .gapp-panel { padding: 22px; }
            }
          `}</style>
                  <div
                    className="gapp-subtabs"
                    role="tablist"
                    aria-label={
                      locale === "sl"
                        ? "Website nastavitve"
                        : "Website settings"
                    }
                  >
                    {websiteSubtabs(t).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={websiteSubtab === entry.id}
                        className={
                          websiteSubtab === entry.id
                            ? "gapp-subtab active"
                            : "gapp-subtab"
                        }
                        onClick={() => setWebsiteSubtabAndUrl(entry.id)}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                  <div className="gapp-panel">
                    {websiteSubtab === "general" ? (
                      <>
                        <div className="gapp-section-heading">
                          <h3>Splošno</h3>
                          <p>
                            Nastavite potek javnega booking widgeta na spletni
                            strani.
                          </p>
                        </div>
                        <div className="gapp-payment-toggle-card">
                          <div className="gapp-toggle-head">
                            <div>
                              <span className="gapp-label">
                                Korak izbire zaposlenega
                              </span>
                              <span className="gapp-hint">
                                Ko je izklopljeno, obiskovalec preskoči izbiro
                                zaposlenega in nadaljuje neposredno na izbiro
                                termina.
                              </span>
                            </div>
                            <GuestSegmentedToggle
                              value={websiteSettings.employeeSelectionStep}
                              onChange={(value) =>
                                setWebsiteSettings({
                                  ...websiteSettings,
                                  employeeSelectionStep: value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="gapp-savebar">
                          <button
                            type="button"
                            className="gapp-primary-button"
                            onClick={saveWebsiteConfiguration}
                            disabled={savingSettings}
                          >
                            <GuestSaveIcon />
                            {savingSettings
                              ? t("formSaving")
                              : t("configSaveConfiguration")}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="gapp-grid gapp-payment-layout">
                          <div className="gapp-pane">
                            <div className="gapp-section-heading">
                              <h3>Sprejeti načini plačila</h3>
                              <p>
                                Izberite, katere načine plačila želite omogočiti
                                gostom v booking widgetu na spletni strani.
                              </p>
                            </div>
                            <div className="gapp-payment-list">
                              {visibleGuestPaymentMethodOptions.map(
                                (method) => (
                                  <div
                                    className="gapp-payment-row"
                                    key={method.id}
                                  >
                                    <span className="gapp-payment-icon">
                                      <GuestPaymentMethodIcon
                                        kind={method.id}
                                      />
                                    </span>
                                    <strong>{method.label}</strong>
                                    <GuestSwitch
                                      checked={
                                        !websiteSettings.paymentOnLocation &&
                                        websiteSettings.acceptedPaymentMethodIds.includes(
                                          method.id,
                                        )
                                      }
                                      onChange={() =>
                                        toggleWebsitePaymentMethod(method.id)
                                      }
                                      disabled={
                                        websiteSettings.paymentOnLocation
                                      }
                                    />
                                  </div>
                                ),
                              )}
                            </div>
                            <div className="gapp-payment-toggle-row">
                              <div className="gapp-payment-toggle-card">
                                <div className="gapp-toggle-head">
                                  <span className="gapp-label">
                                    Delno plačilo
                                  </span>
                                  <GuestSwitch
                                    checked={
                                      !websiteSettings.paymentOnLocation &&
                                      websiteBookingRules.paymentRequirement ===
                                        "deposit"
                                    }
                                    onChange={(checked) => {
                                      if (!websiteSettings.paymentOnLocation) {
                                        setWebsiteBookingRules({
                                          ...websiteBookingRules,
                                          paymentRequirement: checked
                                            ? "deposit"
                                            : "full",
                                        });
                                      }
                                    }}
                                    disabled={websiteSettings.paymentOnLocation}
                                  />
                                </div>
                                <span className="gapp-hint">
                                  Ko je izklopljeno, se ob spletnem plačilu
                                  samodejno zaračuna polni znesek.
                                </span>
                                {!websiteSettings.paymentOnLocation &&
                                websiteBookingRules.paymentRequirement ===
                                  "deposit" ? (
                                  <GuestField
                                    className="gapp-deposit-field"
                                    label="Znesek pologa"
                                    hint="Odstotek od skupnega zneska, ki ga gost plača ob rezervaciji."
                                  >
                                    <div className="gapp-deposit-input-wrap">
                                      <input
                                        className="gapp-deposit-input"
                                        value={
                                          websiteBookingRules.depositPercent
                                        }
                                        onChange={(e) =>
                                          setWebsiteBookingRules({
                                            ...websiteBookingRules,
                                            depositPercent:
                                              e.target.value.replace(
                                                /[^0-9]/g,
                                                "",
                                              ),
                                          })
                                        }
                                      />
                                      <span className="gapp-deposit-input-suffix">
                                        %
                                      </span>
                                    </div>
                                  </GuestField>
                                ) : null}
                              </div>
                              <div className="gapp-payment-toggle-card">
                                <div className="gapp-toggle-head">
                                  <span className="gapp-label">
                                    Plačilo na lokaciji
                                  </span>
                                  <GuestSwitch
                                    checked={websiteSettings.paymentOnLocation}
                                    onChange={toggleWebsitePaymentOnLocation}
                                  />
                                </div>
                                <span className="gapp-hint">
                                  Ko je vklopljeno, gost rezervira brez
                                  spletnega plačila in poravna na lokaciji.
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="gapp-savebar">
                          <button
                            type="button"
                            className="gapp-primary-button"
                            onClick={saveWebsiteConfiguration}
                            disabled={savingSettings}
                          >
                            <GuestSaveIcon />
                            {savingSettings
                              ? t("formSaving")
                              : t("configSaveConfiguration")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              ) : tab === "notifications" ? (
                <ConfigurationNotificationsSection
                  settings={settings}
                  setSettings={setSettings}
                  savingSettings={savingSettings}
                  onSave={saveSettings}
                  t={t}
                />
              ) : tab === "deliveryLogs" ? (
                <ConfigurationDeliveryLogsSection settings={settings} />
              ) : tab === "integrations" ? (
                <div className="integrations-modern-shell">
                  <style>{`
            .integrations-modern-shell { --integration-blue:#2563eb; --integration-ink:#0f1b3d; --integration-muted:#64748b; --integration-line:#dbe4f0; --integration-soft:#f8fafc; width:min(100%,1600px); color:var(--integration-ink); }
            .integrations-modern-shell button { font-family:inherit; }
            .integrations-card { border:1px solid rgba(203,213,225,.82); border-radius:24px; background:rgba(255,255,255,.98); box-shadow:0 24px 70px rgba(15,23,42,.08); overflow:hidden; }
            .integrations-main-panel { padding:22px; }
            .integrations-tabs-card { border-bottom:1px solid rgba(226,232,240,.95); padding-bottom:10px; margin-bottom:14px; }
            .integrations-subtabs { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
            .integrations-subtab { appearance:none; border:1px solid transparent; background:transparent; color:#475569; font-weight:800; font-size:15px; padding:10px 14px; border-radius:10px; cursor:pointer; transition:color .18s ease, background .18s ease, box-shadow .18s ease, border-color .18s ease; }
            .integrations-subtab:hover { color:#0f172a; background:#f8fafc; }
            .integrations-subtab.active { color:#2563eb; background:#eaf2ff; border-color:rgba(37,99,235,.16); box-shadow:inset 0 0 0 1px rgba(37,99,235,.1),0 3px 10px rgba(37,99,235,.18); }
            .integrations-page-head { margin:0 0 22px; }
            .integrations-page-head h2 { margin:0 0 8px; font-size:clamp(28px,2.75vw,38px); line-height:1.05; letter-spacing:-.045em; font-weight:900; color:var(--integration-ink); }
            .integrations-page-head p { margin:0; color:var(--integration-muted); font-size:16px; line-height:1.5; max-width:820px; }
            .integrations-row-icon { width:46px; height:46px; border-radius:14px; display:inline-flex; align-items:center; justify-content:center; color:#2563eb; background:#eaf2ff; flex:0 0 auto; }
            .integrations-list-card { padding:0; }
            .integrations-section-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 22px; border-bottom:1px solid #e8eef6; }
            .integrations-section-title { margin:0; font-size:18px; font-weight:900; letter-spacing:-.025em; color:var(--integration-ink); }
            .integrations-section-kicker { display:block; color:var(--integration-muted); font-size:13px; line-height:1.4; margin-top:4px; }
            .integrations-secondary-button { border:1px solid #d7e2f0; background:#fff; color:#1f3f75; border-radius:12px; min-height:38px; padding:0 14px; font-weight:800; cursor:pointer; }
            .integrations-secondary-button:hover { border-color:#b9c9de; box-shadow:0 8px 24px rgba(15,23,42,.08); }
            .integrations-status-row { width:100%; display:grid; grid-template-columns:minmax(260px,1.2fr) minmax(190px,.7fr) minmax(180px,.8fr) auto auto; gap:18px; align-items:center; border:0; border-bottom:1px solid #edf2f7; background:#fff; padding:18px 22px; text-align:left; cursor:pointer; }
            .integrations-status-row:last-child { border-bottom:0; }
            .integrations-status-row:hover { background:linear-gradient(90deg,#f8fbff,#fff); }
            .integrations-row-main { display:flex; align-items:center; gap:14px; min-width:0; }
            .integrations-row-title { display:block; color:var(--integration-ink); font-weight:900; font-size:15px; }
            .integrations-row-subtitle { display:block; color:var(--integration-muted); font-size:13px; line-height:1.35; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .integrations-row-meta-label { display:block; color:#94a3b8; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
            .integrations-row-meta-value { display:block; color:#23345d; font-size:13px; font-weight:800; margin-top:5px; }
            .integrations-status-pill { justify-self:start; display:inline-flex; align-items:center; gap:7px; border-radius:999px; padding:7px 11px; font-size:12px; font-weight:900; white-space:nowrap; }
            .integrations-status-pill::before { content:''; width:7px; height:7px; border-radius:999px; background:currentColor; }
            .integrations-status-pill.success { color:#15803d; background:#dcfce7; }
            .integrations-status-pill.warning { color:#b45309; background:#fef3c7; }
            .integrations-status-pill.danger { color:#b91c1c; background:#fee2e2; }
            .integrations-status-pill.neutral { color:#64748b; background:#f1f5f9; }
            .integrations-row-arrow { color:#64748b; display:inline-flex; align-items:center; justify-content:center; }
            .integrations-google-panel .google-calendar-card { box-shadow:none; border:0; padding:0; }
            .integrations-google-panel .google-calendar-card > .section-title-row { display:none; }
            .integrations-mobile-status-layout { display:none; }
            .integrations-mobile-summary-card,
            .integrations-mobile-connection-card { border:1px solid rgba(213,223,238,.92); border-radius:28px; background:rgba(255,255,255,.98); box-shadow:0 20px 56px rgba(15,23,42,.08); }
            .integrations-mobile-summary-card { display:grid; grid-template-columns:auto 1fr auto; gap:22px; align-items:center; padding:30px 32px; }
            .integrations-mobile-summary-icon { width:76px; height:76px; border-radius:24px; display:inline-flex; align-items:center; justify-content:center; color:#2563eb; background:linear-gradient(180deg,#f7fbff 0%,#ffffff 100%); border:1px solid #dbe7f5; box-shadow:0 14px 34px rgba(15,23,42,.06); }
            .integrations-mobile-summary-icon svg { width:34px; height:34px; display:block; }
            .integrations-mobile-summary-copy { min-width:0; }
            .integrations-mobile-summary-copy h2 { margin:0; color:#0b1745; font-size:26px; line-height:1.08; letter-spacing:-.04em; font-weight:950; }
            .integrations-mobile-summary-copy p { margin:9px 0 0; color:#66758f; font-size:17px; line-height:1.45; font-weight:500; }
            .integrations-mobile-refresh-button { justify-self:end; align-self:end; display:inline-flex; align-items:center; justify-content:center; gap:10px; min-height:46px; padding:0 20px; border-radius:15px; border:1px solid #bdd3ff; background:#fff; color:#1769f7; font-size:16px; font-weight:900; cursor:pointer; box-shadow:0 10px 26px rgba(23,105,247,.08); }
            .integrations-mobile-refresh-button:disabled { opacity:.62; cursor:wait; }
            .integrations-mobile-connection-card { overflow:hidden; }
            .integrations-mobile-card-trigger { width:100%; display:grid; grid-template-columns:auto minmax(0,1fr) auto auto; align-items:center; gap:22px; border:0; background:transparent; padding:28px 32px; cursor:pointer; text-align:left; }
            .integrations-mobile-logo { width:76px; height:76px; border-radius:22px; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 12px 30px rgba(15,23,42,.08); overflow:hidden; }
            .integrations-mobile-logo--stripe { background:linear-gradient(135deg,#723df5 0%,#5b82ff 100%); color:#fff; font-size:50px; line-height:1; font-weight:950; letter-spacing:-.08em; }
            .integrations-mobile-logo--google { position:relative; background:#fff; border:1px solid #e3ebf6; display:inline-flex; align-items:center; justify-content:center; overflow:hidden; }
            .integrations-mobile-logo--google::before { content:none; }
            .integrations-mobile-logo--google::after { content:none; }
            .integrations-mobile-logo--google img { width:46px; height:46px; display:block; object-fit:contain; }
            .integrations-mobile-card-copy { min-width:0; display:block; }
            .integrations-mobile-card-title { display:block; color:#0b1745; font-size:24px; line-height:1.12; letter-spacing:-.035em; font-weight:950; }
            .integrations-mobile-card-subtitle { display:block; margin-top:8px; color:#66758f; font-size:16px; line-height:1.42; font-weight:500; }
            .integrations-mobile-chevron { color:#1769f7; display:inline-flex; align-items:center; justify-content:center; transition:transform .2s ease; }
            .integrations-mobile-connection-card.is-open .integrations-mobile-chevron { transform:rotate(180deg); }
            .integrations-mobile-details { display:grid; grid-template-columns:1fr 1fr; gap:0; margin:0 32px 28px; padding-top:18px; border-top:1px solid #e6eef8; }
            .integrations-mobile-detail-row { min-width:0; padding:4px 14px 14px 0; }
            .integrations-mobile-manage-button { grid-column:1 / -1; display:inline-flex; align-items:center; justify-content:center; margin-top:8px; min-height:46px; border:0; border-radius:15px; background:linear-gradient(180deg,#1c78ff 0%,#0f62fe 100%); color:#fff; font-size:15px; font-weight:900; cursor:pointer; box-shadow:0 14px 30px rgba(37,99,235,.24); }
            @media (max-width:1180px) { .integrations-status-row { grid-template-columns:1fr; } .integrations-status-pill { justify-self:start; } }
            @media (max-width:780px) {
              .integrations-modern-shell { width:100%; }
              .integrations-modern-shell .integrations-card.integrations-main-panel { border:0; border-radius:0; background:transparent; box-shadow:none; overflow:visible; padding:0 14px 30px; }
              .integrations-tabs-card { display:block; padding-bottom:0; margin-bottom:18px; border-bottom:0; }
              .integrations-subtabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
              .integrations-subtab { width:100%; min-height:52px; display:inline-flex; align-items:center; justify-content:center; border-radius:16px; background:#ffffff; border:1px solid #dbe4f0; font-size:16px; box-shadow:0 10px 28px rgba(15,23,42,.06); }
              .integrations-subtab.active { background:#edf4ff; border-color:#bcd2ff; box-shadow:0 12px 26px rgba(37,99,235,.14); }
              .integrations-desktop-status-layout { display:none; }
              .integrations-mobile-status-layout { display:flex; flex-direction:column; gap:22px; }
              .integrations-google-panel .integrations-page-head { display:none; }
              .integrations-mobile-summary-card { grid-template-columns:auto 1fr; gap:16px; padding:24px 20px; border-radius:26px; }
              .integrations-mobile-summary-icon { width:68px; height:68px; border-radius:21px; }
              .integrations-mobile-summary-copy h2 { font-size:25px; }
              .integrations-mobile-summary-copy p { font-size:15px; line-height:1.45; }
              .integrations-mobile-refresh-button { grid-column:2; justify-self:end; margin-top:4px; min-height:44px; padding:0 18px; border-radius:15px; font-size:15px; }
              .integrations-mobile-connection-card { border-radius:26px; }
              .integrations-mobile-card-trigger { grid-template-columns:auto minmax(0,1fr) auto; gap:18px; padding:26px 20px; }
              .integrations-mobile-logo { width:64px; height:64px; border-radius:20px; }
              .integrations-mobile-logo--stripe { font-size:42px; }
              .integrations-mobile-logo--google img { width:42px; height:42px; }
              .integrations-mobile-card-title { font-size:23px; }
              .integrations-mobile-card-subtitle { font-size:15px; }
              .integrations-mobile-card-trigger .integrations-status-pill { grid-column:3; grid-row:1; align-self:start; }
              .integrations-mobile-chevron { grid-column:3; grid-row:1; align-self:end; margin-top:40px; }
              .integrations-mobile-details { grid-template-columns:1fr; margin:0 20px 24px; padding-top:16px; }
              .integrations-mobile-detail-row { padding-right:0; }
            }
            @media (max-width:420px) {
              .integrations-modern-shell .integrations-card.integrations-main-panel { padding-left:12px; padding-right:12px; }
              .integrations-mobile-status-layout { gap:18px; }
              .integrations-subtabs { gap:10px; }
              .integrations-subtab { min-height:48px; font-size:15px; padding:0 12px; }
              .integrations-mobile-summary-card { padding:22px 16px; }
              .integrations-mobile-summary-icon { width:58px; height:58px; }
              .integrations-mobile-summary-icon svg { width:28px; height:28px; }
              .integrations-mobile-summary-copy h2 { font-size:23px; }
              .integrations-mobile-summary-copy p { font-size:14px; }
              .integrations-mobile-refresh-button { font-size:14px; padding:0 14px; }
              .integrations-mobile-card-trigger { gap:14px; padding:24px 16px; }
              .integrations-mobile-logo { width:58px; height:58px; border-radius:18px; }
              .integrations-mobile-logo--stripe { font-size:38px; }
              .integrations-mobile-card-title { font-size:21px; }
              .integrations-mobile-card-subtitle { font-size:14px; line-height:1.45; }
              .integrations-status-pill { padding:6px 10px; font-size:11px; }
              .integrations-mobile-chevron { margin-top:36px; }
              .integrations-mobile-details { margin-left:16px; margin-right:16px; }
            }
          `}</style>
                  <div className="integrations-card integrations-main-panel">
                    <div className="integrations-tabs-card">
                      <div
                        className="integrations-subtabs"
                        role="tablist"
                        aria-label={
                          locale === "sl"
                            ? "Nastavitve integracij"
                            : "Integration settings"
                        }
                      >
                        {integrationSubtabs.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            role="tab"
                            aria-selected={integrationSubtab === entry.id}
                            className={
                              integrationSubtab === entry.id
                                ? "integrations-subtab active"
                                : "integrations-subtab"
                            }
                            onClick={() => setIntegrationSubtabAndUrl(entry.id)}
                          >
                            {entry.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {integrationSubtab === "status" ? (
                      <>
                        <div
                          className="integrations-mobile-status-layout"
                          aria-label={
                            locale === "sl"
                              ? "Status integracij"
                              : "Integration status"
                          }
                        >
                          <section className="integrations-mobile-summary-card">
                            <span
                              className="integrations-mobile-summary-icon"
                              aria-hidden
                            >
                              <IntegrationStatusCardIcon />
                            </span>
                            <span className="integrations-mobile-summary-copy">
                              <h2>
                                {locale === "sl"
                                  ? "Status integracij"
                                  : "Integration status"}
                              </h2>
                              <p>
                                {locale === "sl"
                                  ? "Pregled povezanih storitev in njihov trenutni status."
                                  : "Overview of connected services and their current status."}
                              </p>
                            </span>
                            <button
                              type="button"
                              className="integrations-mobile-refresh-button"
                              onClick={() => void refreshIntegrationStatuses()}
                              disabled={googleCalendarStatusLoading}
                            >
                              <svg
                                width="21"
                                height="21"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <path d="M21 12a9 9 0 0 1-15.42 6.36" />
                                <path d="M3 12A9 9 0 0 1 18.42 5.64" />
                                <path d="M18 2v4h-4" />
                                <path d="M6 22v-4h4" />
                              </svg>
                              {googleCalendarStatusLoading
                                ? locale === "sl"
                                  ? "Osvežujem…"
                                  : "Refreshing…"
                                : locale === "sl"
                                  ? "Osveži status"
                                  : "Refresh status"}
                            </button>
                          </section>

                          {googleCalendarModuleEnabledCommitted ? (
                            <article
                              className={
                                expandedIntegrationCard === "googleCalendar"
                                  ? "integrations-mobile-connection-card is-open"
                                  : "integrations-mobile-connection-card"
                              }
                            >
                              <button
                                type="button"
                                className="integrations-mobile-card-trigger"
                                onClick={() =>
                                  toggleIntegrationDetails("googleCalendar")
                                }
                                aria-expanded={
                                  expandedIntegrationCard === "googleCalendar"
                                }
                              >
                                <span
                                  className="integrations-mobile-logo integrations-mobile-logo--google"
                                  aria-hidden
                                >
                                  <IntegrationGoogleCalendarIcon />
                                </span>
                                <span className="integrations-mobile-card-copy">
                                  <span className="integrations-mobile-card-title">
                                    Google Calendar
                                  </span>
                                  <span className="integrations-mobile-card-subtitle">
                                    {locale === "sl"
                                      ? "Sinhronizirajte dogodke in termine iz Google Calendar za enostavno upravljanje razpoložljivosti."
                                      : "Sync events and appointments from Google Calendar for easier availability management."}
                                  </span>
                                </span>
                                <span
                                  className={`integrations-status-pill ${googleCalendarStatusTone}`}
                                >
                                  {googleCalendarCompactStatusLabel}
                                </span>
                                <span
                                  className="integrations-mobile-chevron"
                                  aria-hidden
                                >
                                  <svg
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="m6 9 6 6 6-6" />
                                  </svg>
                                </span>
                              </button>
                              {expandedIntegrationCard === "googleCalendar" ? (
                                <div className="integrations-mobile-details">
                                  <div className="integrations-mobile-detail-row">
                                    <span className="integrations-row-meta-label">
                                      {locale === "sl" ? "Račun" : "Account"}
                                    </span>
                                    <span className="integrations-row-meta-value">
                                      {activeGoogleCalendarConnection?.googleAccountEmail ||
                                        "—"}
                                    </span>
                                  </div>
                                  <div className="integrations-mobile-detail-row">
                                    <span className="integrations-row-meta-label">
                                      {locale === "sl"
                                        ? "Konflikti"
                                        : "Conflicts"}
                                    </span>
                                    <span className="integrations-row-meta-value">
                                      {googleCalendarConflictCount}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="integrations-mobile-manage-button"
                                    onClick={openGoogleCalendarIntegration}
                                  >
                                    {locale === "sl"
                                      ? "Upravljaj povezavo"
                                      : "Manage connection"}
                                  </button>
                                </div>
                              ) : null}
                            </article>
                          ) : null}

                          {stripePaymentsAvailableCommitted ? (
                            <article
                              className={
                                expandedIntegrationCard === "stripe"
                                  ? "integrations-mobile-connection-card is-open"
                                  : "integrations-mobile-connection-card"
                              }
                            >
                              <button
                                type="button"
                                className="integrations-mobile-card-trigger"
                                onClick={() =>
                                  toggleIntegrationDetails("stripe")
                                }
                                aria-expanded={
                                  expandedIntegrationCard === "stripe"
                                }
                              >
                                <span
                                  className="integrations-mobile-logo integrations-mobile-logo--stripe"
                                  aria-hidden
                                >
                                  S
                                </span>
                                <span className="integrations-mobile-card-copy">
                                  <span className="integrations-mobile-card-title">
                                    Stripe
                                  </span>
                                  <span className="integrations-mobile-card-subtitle">
                                    {locale === "sl"
                                      ? "Povezava za spletna plačila in upravljanje naročnin prek Stripe."
                                      : "Connection for online payments and subscription management through Stripe."}
                                  </span>
                                </span>
                                <span
                                  className={`integrations-status-pill ${stripeStatusTone}`}
                                >
                                  {stripeCompactStatusLabel}
                                </span>
                                <span
                                  className="integrations-mobile-chevron"
                                  aria-hidden
                                >
                                  <svg
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="m6 9 6 6 6-6" />
                                  </svg>
                                </span>
                              </button>
                              {expandedIntegrationCard === "stripe" ? (
                                <div className="integrations-mobile-details">
                                  <div className="integrations-mobile-detail-row">
                                    <span className="integrations-row-meta-label">
                                      {locale === "sl" ? "Račun" : "Account"}
                                    </span>
                                    <span className="integrations-row-meta-value">
                                      {activeStripeAccount?.accountId || "—"}
                                    </span>
                                  </div>
                                  <div className="integrations-mobile-detail-row">
                                    <span className="integrations-row-meta-label">
                                      {locale === "sl" ? "Način" : "Mode"}
                                    </span>
                                    <span className="integrations-row-meta-value">
                                      {stripeConnectStatus?.activeMode ===
                                      "production"
                                        ? "Production"
                                        : "Sandbox"}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="integrations-mobile-manage-button"
                                    onClick={openStripeIntegration}
                                  >
                                    {locale === "sl"
                                      ? "Upravljaj povezavo"
                                      : "Manage connection"}
                                  </button>
                                </div>
                              ) : null}
                            </article>
                          ) : null}
                        </div>
                        <div className="integrations-desktop-status-layout">
                          <div className="integrations-page-head">
                            <h2>
                              {locale === "sl" ? "Integracije" : "Integrations"}
                            </h2>
                            <p>
                              {locale === "sl"
                                ? "Pregled povezav za trenutni tenant. Klik na vrstico odpre stran, kjer nastavite posamezno povezavo."
                                : "Connection overview for the current tenant. Click a row to open the setup page for that integration."}
                            </p>
                          </div>

                          <div className="integrations-card integrations-list-card">
                            <div className="integrations-section-heading">
                              <span>
                                <h3 className="integrations-section-title">
                                  {locale === "sl"
                                    ? "Status integracij"
                                    : "Integration status"}
                                </h3>
                                <span className="integrations-section-kicker">
                                  {googleCalendarModuleEnabledCommitted &&
                                  stripePaymentsAvailableCommitted
                                    ? locale === "sl"
                                      ? "Stripe in Google Calendar za ta tenant."
                                      : "Stripe and Google Calendar for this tenant."
                                    : googleCalendarModuleEnabledCommitted
                                      ? "Google Calendar"
                                      : stripePaymentsAvailableCommitted
                                        ? locale === "sl"
                                          ? "Stripe za ta tenant."
                                          : "Stripe for this tenant."
                                        : locale === "sl"
                                          ? "Ni aktivnih integracij za prikaz."
                                          : "No active integrations to show."}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="integrations-secondary-button"
                                onClick={() =>
                                  void refreshIntegrationStatuses()
                                }
                                disabled={googleCalendarStatusLoading}
                              >
                                {googleCalendarStatusLoading
                                  ? locale === "sl"
                                    ? "Osvežujem…"
                                    : "Refreshing…"
                                  : locale === "sl"
                                    ? "Osveži status"
                                    : "Refresh status"}
                              </button>
                            </div>

                            {googleCalendarModuleEnabledCommitted ? (
                              <button
                                type="button"
                                className="integrations-status-row"
                                onClick={openGoogleCalendarIntegration}
                              >
                                <span className="integrations-row-main">
                                  <span className="integrations-row-icon">
                                    <ConfigTabIcon kind="googleCalendar" />
                                  </span>
                                  <span>
                                    <span className="integrations-row-title">
                                      Google Calendar
                                    </span>
                                    <span className="integrations-row-subtitle">
                                      {locale === "sl"
                                        ? "Dvosmerna sinhronizacija rezervacij, osebnih terminov in ToDo dogodkov."
                                        : "Two-way sync for bookings, personal sessions and ToDo events."}
                                    </span>
                                  </span>
                                </span>
                                <span>
                                  <span className="integrations-row-meta-label">
                                    {locale === "sl" ? "Račun" : "Account"}
                                  </span>
                                  <span className="integrations-row-meta-value">
                                    {activeGoogleCalendarConnection?.googleAccountEmail ||
                                      "—"}
                                  </span>
                                </span>
                                <span>
                                  <span className="integrations-row-meta-label">
                                    {locale === "sl"
                                      ? "Konflikti"
                                      : "Conflicts"}
                                  </span>
                                  <span className="integrations-row-meta-value">
                                    {googleCalendarConflictCount}
                                  </span>
                                </span>
                                <span
                                  className={`integrations-status-pill ${googleCalendarStatusTone}`}
                                >
                                  {googleCalendarStatusLabel}
                                </span>
                                <span
                                  className="integrations-row-arrow"
                                  aria-hidden
                                >
                                  ›
                                </span>
                              </button>
                            ) : null}

                            {stripePaymentsAvailableCommitted ? (
                              <button
                                type="button"
                                className="integrations-status-row"
                                onClick={openStripeIntegration}
                              >
                                <span className="integrations-row-main">
                                  <span className="integrations-row-icon">
                                    <ConfigTabIcon kind="billing" />
                                  </span>
                                  <span>
                                    <span className="integrations-row-title">
                                      Stripe
                                    </span>
                                    <span className="integrations-row-subtitle">
                                      {locale === "sl"
                                        ? "Povezava za spletna plačila in Stripe Connect onboarding."
                                        : "Connection for online payments and Stripe Connect onboarding."}
                                    </span>
                                  </span>
                                </span>
                                <span>
                                  <span className="integrations-row-meta-label">
                                    {locale === "sl" ? "Račun" : "Account"}
                                  </span>
                                  <span className="integrations-row-meta-value">
                                    {activeStripeAccount?.accountId || "—"}
                                  </span>
                                </span>
                                <span>
                                  <span className="integrations-row-meta-label">
                                    {locale === "sl" ? "Način" : "Mode"}
                                  </span>
                                  <span className="integrations-row-meta-value">
                                    {stripeConnectStatus?.activeMode ===
                                    "production"
                                      ? "Production"
                                      : "Sandbox"}
                                  </span>
                                </span>
                                <span
                                  className={`integrations-status-pill ${stripeStatusTone}`}
                                >
                                  {stripeStatusLabel}
                                </span>
                                <span
                                  className="integrations-row-arrow"
                                  aria-hidden
                                >
                                  ›
                                </span>
                              </button>
                            ) : null}
                          </div>
                        </div>{" "}
                      </>
                    ) : googleCalendarModuleEnabledCommitted ? (
                      <div className="integrations-google-panel">
                        <div className="integrations-page-head">
                          <h2>Google Calendar</h2>
                          <p>
                            {locale === "sl"
                              ? "Povežite Google Calendar in upravljajte dvosmerno sinhronizacijo za trenutni tenant."
                              : "Connect Google Calendar and manage two-way sync for the current tenant."}
                          </p>
                        </div>
                        <GoogleCalendarIntegrationSection me={me} />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : tab === "whatsapp" ? (
                <ConfigurationWhatsAppSection
                  settings={settings}
                  setSettings={setSettings}
                  savingSettings={savingSettings}
                  onSave={saveSettings}
                  t={t}
                  globallyEnabled={inboxGlobalCapabilities.whatsappEnabled}
                />
              ) : tab === "viber" ? (
                <ConfigurationViberSection
                  settings={settings}
                  setSettings={setSettings}
                  savingSettings={savingSettings}
                  onSave={saveSettings}
                  t={t}
                  globallyEnabled={inboxGlobalCapabilities.viberEnabled}
                />
              ) : tab === "modules" && modulesDraftDisplay ? (
                <Card className="settings-card modules-design-card">
                  <div className="modules-design-shell">
                    <div className="modules-design-grid">
                      {[
                        ["booking", "services"],
                        ["billing", "communication"],
                        ["guest-app", "integrations"],
                      ].map((columnIds) => (
                        <div
                          key={columnIds.join("-")}
                          className="modules-design-column"
                        >
                          {modulesDesignGroups
                            .filter((group) => columnIds.includes(group.id))
                            .map((group) => (
                              <ModulesDesignGroupCard
                                key={group.id}
                                group={group}
                                expandedRows={expandedModuleRows}
                                onToggleExpanded={toggleExpandedModuleRow}
                              />
                            ))}
                        </div>
                      ))}
                    </div>
                    <div className="gapp-savebar">
                      <button
                        type="button"
                        className="gapp-primary-button"
                        onClick={() =>
                          void saveSettings({ applyModulesDraft: true })
                        }
                        disabled={savingSettings}
                      >
                        <GuestSaveIcon />
                        {savingSettings
                          ? t("formSaving")
                          : t("configSaveConfiguration")}
                      </button>
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
