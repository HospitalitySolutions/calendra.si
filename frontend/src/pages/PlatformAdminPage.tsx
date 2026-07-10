import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import axios from "axios";
import { api } from "../api";
import { clearAuthStoragePreservingTheme } from "../theme";
import { TENANT_CONFIG_TYPE_OPTIONS } from "./configuration/guestWebsiteSettings";
import "../styles/features/platform-admin.css";

type TenancySearchHit = {
  id: number;
  tenantCode: string;
  companyName: string;
  contactEmail: string;
  packageType: string;
  subscriptionInterval: string;
  signupCompletionSummary: string;
};

/** Matches `PlatformAdminController.TenancyRow` JSON. */
type TenancyRow = {
  id: number;
  tenantCode: string;
  name: string;
};

type AuditLogEntryDto = {
  occurredAt: string;
  category: string;
  summary: string;
  detail: string;
  actorEmail?: string;
};

type PlatformTenancyAuditPayload = {
  actionType: string;
  summary: string;
  detail: string;
  reason: string;
};

function buildPlatformAdminAuditPayload(
  kind: string,
  root: HTMLElement,
): PlatformTenancyAuditPayload | null {
  const reason =
    root.querySelector<HTMLTextAreaElement>("#reasonText")?.value.trim() ?? "";
  const actionSelect = root.querySelector<HTMLSelectElement>("#actionSelect");
  const choice = actionSelect?.selectedOptions[0]?.textContent?.trim() ?? "";
  const idx = actionSelect?.selectedIndex ?? -1;

  if (kind === "plan") {
    const fromPlan =
      root.querySelector<HTMLElement>("#planChangeExtras")?.dataset
        .currentPlan ?? "";
    const targetPlan =
      root
        .querySelector<HTMLSelectElement>("#planTargetSelect")
        ?.value.trim() ?? "";
    const effectiveDate =
      root.querySelector<HTMLElement>("#planChangeExtras")?.dataset
        .effectiveDate ?? "";
    const effectiveKind = choice.toLowerCase().includes("next renewal")
      ? "Next renewal"
      : "Immediately";
    return {
      actionType: "CHANGE_PLAN",
      summary: choice || "Change plan",
      detail: `From plan: ${fromPlan || "—"}\nTarget plan: ${targetPlan || "—"}\nEffective timing: ${effectiveKind}\nEffective date: ${effectiveDate || "—"}`,
      reason,
    };
  }
  if (kind === "price") {
    const custom =
      root.querySelector<HTMLInputElement>("#priceCustomInput")?.value ?? "";
    const pct =
      root.querySelector<HTMLInputElement>("#priceDiscountPercent")?.value ??
      "";
    const includeAddons =
      root.querySelector<HTMLInputElement>("#priceDiscountIncludeAddons")
        ?.checked ?? false;
    let detail = "";
    if (idx === 0) detail = `New plan amount (€): ${custom}`;
    else if (idx === 1)
      detail = `Discount %: ${pct || "0"}; include add-ons in % discount: ${includeAddons ? "yes" : "no"}`;
    else if (idx === 2)
      detail =
        "Remove override — revert to default catalog price for this plan and billing cycle.";
    return {
      actionType: "PRICE_OVERRIDE",
      summary: choice || "Price override",
      detail,
      reason,
    };
  }
  if (kind === "suspend") {
    return {
      actionType: "SUSPEND_TENANT",
      summary: choice || "Suspend tenant",
      detail: "",
      reason,
    };
  }
  if (kind === "addon") {
    return {
      actionType: "MANAGE_ADDONS",
      summary: choice || "Manage add-ons",
      detail: "",
      reason,
    };
  }
  if (kind === "delete") {
    return {
      actionType: "DELETE_TENANT",
      summary: choice || "Delete tenant",
      detail: "",
      reason,
    };
  }
  return null;
}

function auditCategoryPillClass(category: string): string {
  const u = category.toLowerCase();
  if (u.includes("suspend") || u.includes("delete"))
    return "platform-admin-audit-log-cat platform-admin-audit-log-cat--suspend";
  return "platform-admin-audit-log-cat platform-admin-audit-log-cat--setting";
}

type TenancyDetails = TenancySearchHit & {
  contactName: string;
  contactPhone: string;
  companyAddress: string;
  companyPostalCode: string;
  companyCity: string;
  createdAt: string;
  subscriptionStart: string;
  subscriptionEnd: string;
  usersCreated: number;
  usersPaidTotal: number | null;
  spacesCreated: number;
  spacesTotal: number | null;
  smsSent: number;
  smsQuota: number | null;
  dueAmount: string;
  ownerPasswordSetupPending: boolean;
  vatId: string;
  stripeCustomerIdPreview: string;
  accessStatus: string;
  billingStatus: string;
  customPackageName: string;
  customMonthlyPrice: string;
  customYearlyPrice: string;
  customFeatureKeys: string;
  customAddonsJson: string;
  paymentMethod: string;
  companyType: string;
};

type ManualTenantFeatureOption = { key: string; label: string };
type ManualTenantAddOnOption = {
  key: string;
  name?: string;
  nameSl?: string;
  monthlyPrice?: number | string;
};
type ManualTenantOptions = {
  features: ManualTenantFeatureOption[];
  addOns: ManualTenantAddOnOption[];
  companyTypes: string[];
};
type ManualTenantAddOnFormRow = {
  key: string;
  monthlyPrice: string;
  yearlyPrice: string;
  charged: boolean;
};
type ManualTenantFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  companyType: string;
  vatId: string;
  country: string;
  city: string;
  address: string;
  postalCode: string;
  packageName: string;
  customPackageName: string;
  customMonthlyPrice: string;
  customYearlyPrice: string;
  billingInterval: string;
  userCount: string;
  smsCount: string;
  enabledFeatureKeys: string[];
  addOns: ManualTenantAddOnFormRow[];
  paymentMethod: string;
  accessStatus: string;
  billingStatus: string;
  subscriptionStart: string;
  language: string;
};
type ManualTenantResponse = {
  tenantId: number;
  tenantCode: string;
  companyName: string;
  email: string;
  billId?: number | null;
  billNumber?: string | null;
  checkoutUrl?: string | null;
  accessStatus: string;
  billingStatus: string;
};

function defaultManualTenantForm(): ManualTenantFormState {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    companyName: "",
    companyType: "salon",
    vatId: "",
    country: "Slovenija",
    city: "",
    address: "",
    postalCode: "",
    packageName: "PROFESSIONAL",
    customPackageName: "",
    customMonthlyPrice: "0.00",
    customYearlyPrice: "0.00",
    billingInterval: "MONTHLY",
    userCount: "5",
    smsCount: "0",
    enabledFeatureKeys: [],
    addOns: [],
    paymentMethod: "BANK_TRANSFER",
    accessStatus: "ACTIVE",
    billingStatus: "PENDING_PAYMENT",
    subscriptionStart: new Date().toISOString().slice(0, 10),
    language: "sl",
  };
}

function splitContactName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function parseCsv(raw: string): string[] {
  return String(raw || "")
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean);
}

function parseManualAddOns(raw: string): ManualTenantAddOnFormRow[] {
  try {
    const rows = JSON.parse(raw || "[]");
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => ({
        key: String(row?.key || "").trim(),
        monthlyPrice: String(row?.monthlyPrice ?? "0.00"),
        yearlyPrice: String(row?.yearlyPrice ?? "0.00"),
        charged: row?.charged !== false,
      }))
      .filter((row) => row.key);
  } catch {
    return [];
  }
}

function formFromTenancyDetails(selected: TenancyDetails): ManualTenantFormState {
  const names = splitContactName(selected.contactName || "");
  return {
    ...defaultManualTenantForm(),
    firstName: names.firstName,
    lastName: names.lastName,
    email: selected.contactEmail || "",
    phone: selected.contactPhone || "",
    companyName: selected.companyName || "",
    companyType: selected.companyType || "salon",
    vatId: selected.vatId || "",
    city: selected.companyCity || "",
    address: selected.companyAddress || "",
    postalCode: selected.companyPostalCode || "",
    packageName: (selected.packageType || "PROFESSIONAL").toUpperCase(),
    customPackageName: selected.customPackageName || "",
    customMonthlyPrice: selected.customMonthlyPrice || "0.00",
    customYearlyPrice: selected.customYearlyPrice || "0.00",
    billingInterval: selected.subscriptionInterval || "MONTHLY",
    userCount: String(selected.usersPaidTotal ?? 1),
    smsCount: String(selected.smsQuota ?? 0),
    enabledFeatureKeys: parseCsv(selected.customFeatureKeys),
    addOns: parseManualAddOns(selected.customAddonsJson),
    paymentMethod: selected.paymentMethod || "BANK_TRANSFER",
    accessStatus: selected.accessStatus || "ACTIVE",
    billingStatus: selected.billingStatus || "PENDING_PAYMENT",
    subscriptionStart: selected.subscriptionStart || new Date().toISOString().slice(0, 10),
  };
}

function toNumberOrZero(raw: string): number {
  const parsed = Number.parseFloat(String(raw || "0").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toPositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const modalContent: Record<string, [string, string, string[]]> = {
  plan: [
    "Change plan",
    "Choose how the subscription tier should move. Options depend on the tenant’s current plan (Basic → Professional → Premium).",
    [],
  ],
  price: [
    "Price override",
    "Only admin can change price or apply custom discount. Store previous and new value in audit log.",
    ["Apply custom price", "Apply discount", "Remove override"],
  ],
  suspend: [
    "Suspend tenant",
    "Suspension is admin-only. Access is blocked while billing and history remain preserved.",
    ["Suspend immediately", "Schedule suspension", "Cancel suspension"],
  ],
  addon: [
    "Manage add-ons",
    "Annual add-on removals are scheduled for renewal unless admin overrides with reason.",
    [
      "Add immediately",
      "Schedule removal at renewal",
      "Admin override removal now",
    ],
  ],
  delete: [
    "Delete tenant",
    "Permanently removes this tenant, its users, settings, and billing history from the platform. This cannot be undone.",
    ["Delete permanently"],
  ],
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatInterval(raw: string): string {
  const u = raw.trim().toUpperCase();
  if (u === "YEARLY" || u === "ANNUAL") return "Annual";
  if (u === "MONTHLY") return "Monthly";
  return raw || "—";
}

function formatAuditTime(iso: string): string {
  const t = iso.trim();
  if (!t) return "—";
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return t;
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPlan(pkg: string): string {
  const u = pkg.trim().toUpperCase();
  const map: Record<string, string> = {
    TRIAL: "Trial",
    BASIC: "Basic",
    PROFESSIONAL: "Professional",
    PREMIUM: "Premium",
    CUSTOM: "Custom",
  };
  return map[u] ?? pkg;
}

/** 0 = trial (lowest), 1 = Basic, 2 = Pro / Professional, 3 = Premium / Business (highest). */
function planPackageRank(pkg: string | undefined | null): number {
  const u = (pkg ?? "").trim().toUpperCase().replace(/[\s-]/g, "_");
  if (u === "TRIAL") return 0;
  if (u === "BASIC") return 1;
  if (u === "PRO" || u === "PROFESSIONAL") return 2;
  if (u === "PREMIUM" || u === "BUSINESS") return 3;
  if (u === "CUSTOM") return 2;
  return 2;
}

const PLAN_RANK_MIN = 0;
const PLAN_RANK_MAX = 3;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPlanChangeActionOptions(selected: TenancyDetails): string[] {
  const rank = planPackageRank(selected.packageType);
  const out: string[] = [];
  if (rank < PLAN_RANK_MAX) {
    out.push("Upgrade Immediately (Upgrades the tenant plan immediately.)");
    out.push(
      "Upgrade at next renewal (Upgrades the tenant plan at next renewal date.)",
    );
  }
  if (rank > PLAN_RANK_MIN) {
    out.push("Downgrade Immediately (Downgrades the tenant plan immediately.)");
    out.push(
      "Downgrade at next renewal (Downgrades the tenant plan at next renewal date.)",
    );
  }
  if (out.length === 0) {
    out.push("No tier changes are available for this plan state.");
  }
  return out;
}

const PLAN_STAGE_CODES = ["BASIC", "PROFESSIONAL", "PREMIUM"] as const;

function currentPlanStageCode(pkg: string): (typeof PLAN_STAGE_CODES)[number] {
  const u = pkg.trim().toUpperCase();
  if (u === "PREMIUM" || u === "BUSINESS") return "PREMIUM";
  if (u === "PRO" || u === "PROFESSIONAL" || u === "CUSTOM")
    return "PROFESSIONAL";
  return "BASIC";
}

function computePlanEffectiveDate(
  actionLabel: string,
  selected: TenancyDetails,
): string {
  if (actionLabel.toLowerCase().includes("next renewal")) {
    return selected.subscriptionEnd?.trim() || "";
  }
  return new Date().toISOString();
}

function updatePlanChangePanels(root: HTMLElement, selected: TenancyDetails) {
  const backdrop = root.querySelector<HTMLElement>("#modalBackdrop");
  if (!backdrop || backdrop.dataset.modalKind !== "plan") return;
  const extras = root.querySelector<HTMLElement>("#planChangeExtras");
  const actionSelect = root.querySelector<HTMLSelectElement>("#actionSelect");
  const targetSelect =
    root.querySelector<HTMLSelectElement>("#planTargetSelect");
  const hint = root.querySelector<HTMLElement>("#planEffectiveDateHint");
  if (!extras || !actionSelect || !targetSelect || !hint) return;
  extras.dataset.currentPlan = formatPlan(
    currentPlanStageCode(selected.packageType),
  );

  const actionLabel =
    actionSelect.selectedOptions[0]?.textContent?.trim() ?? "";
  const curRank = planPackageRank(selected.packageType);
  let targets: string[] = [];
  if (actionLabel.toLowerCase().startsWith("upgrade")) {
    targets = PLAN_STAGE_CODES.filter(
      (code) => planPackageRank(code) > curRank,
    ).map((code) => formatPlan(code));
  } else if (actionLabel.toLowerCase().startsWith("downgrade")) {
    targets = PLAN_STAGE_CODES.filter(
      (code) => planPackageRank(code) < curRank,
    ).map((code) => formatPlan(code));
  }
  extras.hidden = targets.length === 0;
  if (targets.length === 0) {
    targetSelect.innerHTML = "";
    hint.textContent = "";
    return;
  }
  const selectedValue = targetSelect.value;
  targetSelect.innerHTML = targets
    .map((value) => `<option>${escapeHtml(value)}</option>`)
    .join("");
  if (selectedValue && targets.includes(selectedValue)) {
    targetSelect.value = selectedValue;
  }
  const effectiveIso = computePlanEffectiveDate(actionLabel, selected);
  extras.dataset.effectiveDate = effectiveIso;
  const effectiveText = formatAuditTime(effectiveIso);
  hint.textContent = `Effective date: ${effectiveText || "—"}`;
}

type PlanHistoryRow = {
  recordedAt: string;
  action: string;
  fromPlan: string;
  toPlan: string;
  effectiveDate: string;
  status: "Applied" | "Scheduled";
  actor: string;
};

function parsePlanHistoryRow(row: AuditLogEntryDto): PlanHistoryRow | null {
  if (!row.category.toLowerCase().includes("change plan")) return null;
  const targetMatch = row.detail.match(/Target plan:\s*([^\n]+)/i);
  const effectiveMatch = row.detail.match(/Effective date:\s*([^\n]+)/i);
  const fromMatch = row.detail.match(/From plan:\s*([^\n]+)/i);
  const target = targetMatch?.[1]?.trim() || "—";
  const fromPlan = fromMatch?.[1]?.trim() || "—";
  const effectiveRaw = effectiveMatch?.[1]?.trim() || "";
  const effectiveDate = formatAuditTime(effectiveRaw);
  const ms = Date.parse(effectiveRaw);
  const status: "Applied" | "Scheduled" =
    Number.isFinite(ms) && ms > Date.now() ? "Scheduled" : "Applied";
  return {
    recordedAt: formatAuditTime(row.occurredAt),
    action: row.summary || "Change plan",
    fromPlan,
    toPlan: target,
    effectiveDate: effectiveDate || "—",
    status,
    actor: row.actorEmail?.trim() || "—",
  };
}

function progressWidth(d: TenancyDetails | null): number {
  if (!d) return 0;
  if (d.ownerPasswordSetupPending) return 45;
  if (!d.vatId?.trim()) return 78;
  return 100;
}

function tenancyRowToSearchHit(row: TenancyRow): TenancySearchHit {
  return {
    id: row.id,
    tenantCode: row.tenantCode ?? "",
    companyName: row.name ?? "",
    contactEmail: "",
    packageType: "—",
    subscriptionInterval: "—",
    signupCompletionSummary: "Click to load plan, billing, and signup status",
  };
}

function isPlaceholderHit(h: TenancySearchHit): boolean {
  return (
    h.packageType === "—" &&
    h.subscriptionInterval === "—" &&
    h.contactEmail === ""
  );
}

type RegisterPlanKeyDto = "basic" | "pro" | "business";
type RegisterCatalogPlanNameDto = { name?: string; nameSl?: string };
type PlanTransactionServiceKey =
  | "basicMonthly"
  | "basicAnnual"
  | "proMonthly"
  | "proAnnual"
  | "businessMonthly"
  | "businessAnnual";
type TransactionServiceSummaryDto = {
  id: number;
  code?: string;
  description?: string;
  active?: boolean;
  netPrice?: number;
  taxRate?: string;
};

const PLAN_TRANSACTION_SERVICE_FIELDS: {
  key: PlanTransactionServiceKey;
  label: string;
}[] = [
  { key: "basicMonthly", label: "Basic monthly" },
  { key: "basicAnnual", label: "Basic annual" },
  { key: "proMonthly", label: "Pro monthly" },
  { key: "proAnnual", label: "Pro annual" },
  { key: "businessMonthly", label: "Business monthly" },
  { key: "businessAnnual", label: "Business annual" },
];

type RegisterCatalogAddonItemDto = {
  key: string;
  name: string;
  nameSl?: string;
  description?: string;
  descriptionSl?: string;
  monthly: number;
  active?: boolean;
  transactionServiceId?: number | null;
};

type RegisterCatalogFeatureItemDto = {
  key: string;
  name: string;
  nameSl?: string;
  description?: string;
  descriptionSl?: string;
  minPlan: RegisterPlanKeyDto;
  active?: boolean;
};

type RegisterUsagePriceCatalogDto = {
  additionalUserMonthly: number;
  smsPerMessage: number;
  additionalUserTransactionServiceId?: number | null;
  smsTransactionServiceId?: number | null;
};

type RegisterPriceCatalogDto = {
  plans: Record<string, number>;
  planNames?: Partial<Record<RegisterPlanKeyDto, RegisterCatalogPlanNameDto>>;
  addons: Record<string, number>;
  annualDiscountPercent?: number;
  addonItems?: RegisterCatalogAddonItemDto[];
  featureItems?: RegisterCatalogFeatureItemDto[];
  additionalUserMonthly?: number;
  smsPerMessage?: number;
  usagePrices?: RegisterUsagePriceCatalogDto;
  planTransactionServiceIds?: Partial<
    Record<PlanTransactionServiceKey, number | null>
  >;
  additionalUserTransactionServiceId?: number | null;
  smsTransactionServiceId?: number | null;
};

function coerceMoneyInput(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return fallback;
  return Math.round(n * 100) / 100;
}

function coercePercentInput(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return Math.round(n * 100) / 100;
}

function normalizeAddonKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizeFeatureKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizeCatalogPlanKey(
  raw: string | undefined | null,
  fallback: RegisterPlanKeyDto = "pro",
): RegisterPlanKeyDto {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value === "basic" || value === "pro" || value === "business"
    ? value
    : fallback;
}

function normalizeServiceId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function addonMapFromItems(
  items: RegisterCatalogAddonItemDto[],
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    if (item.active !== false && item.key) acc[item.key] = item.monthly;
    return acc;
  }, {});
}

function normalizeAddonItemsFromCatalog(
  data: RegisterPriceCatalogDto | null | undefined,
): RegisterCatalogAddonItemDto[] {
  if (Array.isArray(data?.addonItems)) {
    const normalized: RegisterCatalogAddonItemDto[] = [];
    data.addonItems.forEach((item) => {
      const key = normalizeAddonKey(item.key || item.name || "");
      if (!key) return;
      const fallback = DEFAULT_ADDON_ITEMS.find(
        (defaultItem) => defaultItem.key === key,
      );
      normalized.push({
        key,
        name: (item.name || fallback?.name || key.replace(/-/g, " ")).trim(),
        nameSl: (
          item.nameSl ||
          fallback?.nameSl ||
          item.name ||
          fallback?.name ||
          key.replace(/-/g, " ")
        ).trim(),
        description: (
          item.description ||
          fallback?.description ||
          "Optional platform add-on."
        ).trim(),
        descriptionSl: (
          item.descriptionSl ||
          fallback?.descriptionSl ||
          item.description ||
          "Dodatek za platformo."
        ).trim(),
        monthly:
          typeof item.monthly === "number" && Number.isFinite(item.monthly)
            ? roundMoney2(item.monthly)
            : (fallback?.monthly ?? 0),
        active: item.active !== false,
        transactionServiceId: normalizeServiceId(item.transactionServiceId),
      });
    });
    return normalized;
  }
  const byKey: RegisterCatalogAddonItemDto[] = DEFAULT_ADDON_ITEMS.map(
    (item) => ({ ...item }),
  );
  if (data?.addons) {
    Object.entries(data.addons).forEach(([rawKey, value]) => {
      const key = normalizeAddonKey(rawKey);
      if (!key || typeof value !== "number" || !Number.isFinite(value)) return;
      const found = byKey.find((item) => item.key === key);
      if (found) found.monthly = roundMoney2(value);
      else
        byKey.push({
          key,
          name: key.replace(/-/g, " "),
          nameSl: key.replace(/-/g, " "),
          description: "Optional platform add-on.",
          descriptionSl: "Dodatek za platformo.",
          monthly: roundMoney2(value),
          active: true,
        });
    });
  }
  return byKey;
}

function normalizeFeatureItemsFromCatalog(
  data: RegisterPriceCatalogDto | null | undefined,
): RegisterCatalogFeatureItemDto[] {
  if (Array.isArray(data?.featureItems)) {
    const normalized: RegisterCatalogFeatureItemDto[] = [];
    data.featureItems.forEach((item) => {
      const key = normalizeFeatureKey(item.key || item.name || "");
      if (!key) return;
      const fallback = DEFAULT_FEATURE_ITEMS.find(
        (defaultItem) => defaultItem.key === key,
      );
      normalized.push({
        key,
        name: (item.name || fallback?.name || key.replace(/-/g, " ")).trim(),
        nameSl: (
          item.nameSl ||
          fallback?.nameSl ||
          item.name ||
          fallback?.name ||
          key.replace(/-/g, " ")
        ).trim(),
        description: (
          item.description ||
          fallback?.description ||
          "Plan feature."
        ).trim(),
        descriptionSl: (
          item.descriptionSl ||
          fallback?.descriptionSl ||
          item.description ||
          "Funkcija paketa."
        ).trim(),
        minPlan: normalizeCatalogPlanKey(
          item.minPlan,
          fallback?.minPlan || "pro",
        ),
        active: item.active !== false,
      });
    });
    return normalized;
  }
  return DEFAULT_FEATURE_ITEMS.map((item) => ({ ...item }));
}

const DEFAULT_ADDON_ITEMS: RegisterCatalogAddonItemDto[] = [
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
];

const DEFAULT_FEATURE_ITEMS: RegisterCatalogFeatureItemDto[] = [
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

const DEFAULT_USAGE_PRICES: RegisterUsagePriceCatalogDto = {
  additionalUserMonthly: 9.9,
  smsPerMessage: 0.05,
};

const DEFAULT_PLAN_NAMES: Record<
  RegisterPlanKeyDto,
  Required<RegisterCatalogPlanNameDto>
> = {
  basic: { name: "Basic", nameSl: "Osnovni" },
  pro: { name: "Pro", nameSl: "Pro" },
  business: { name: "Business", nameSl: "Poslovni" },
};

const DEFAULT_REGISTER_CATALOG: RegisterPriceCatalogDto = {
  plans: { basic: 18.9, pro: 34.9, business: 59.9 },
  planNames: DEFAULT_PLAN_NAMES,
  addons: { voice: 12, billing: 8, whitelabel: 10 },
  annualDiscountPercent: 15,
  addonItems: DEFAULT_ADDON_ITEMS,
  featureItems: DEFAULT_FEATURE_ITEMS,
  additionalUserMonthly: DEFAULT_USAGE_PRICES.additionalUserMonthly,
  smsPerMessage: DEFAULT_USAGE_PRICES.smsPerMessage,
  usagePrices: DEFAULT_USAGE_PRICES,
};

function packageToCatalogPlanKey(pkg: string): "basic" | "pro" | "business" {
  const u = pkg.trim().toUpperCase();
  if (u === "BASIC" || u === "TRIAL") return "basic";
  if (u === "PRO" || u === "PROFESSIONAL") return "pro";
  if (u === "PREMIUM" || u === "BUSINESS") return "business";
  if (u === "CUSTOM") return "pro";
  return "basic";
}

function isYearlyBillingInterval(raw: string): boolean {
  const u = raw.trim().toUpperCase();
  return u === "YEARLY" || u === "ANNUAL";
}

function sumAddonCatalog(addons: Record<string, number> | undefined): number {
  if (!addons) return 0;
  let s = 0;
  for (const v of Object.values(addons)) {
    if (typeof v === "number" && Number.isFinite(v)) s += v;
  }
  return Math.round(s * 100) / 100;
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMoneyEUR(n: number): string {
  return roundMoney2(n).toFixed(2);
}

function cleanCatalogText(raw: unknown, fallback: string): string {
  const value = String(raw ?? "").trim();
  return value || fallback;
}

function normalizePlanNamesFromCatalog(
  data: RegisterPriceCatalogDto | null | undefined,
): Record<RegisterPlanKeyDto, Required<RegisterCatalogPlanNameDto>> {
  const incoming = data?.planNames || {};
  return (["basic", "pro", "business"] as const).reduce<
    Record<RegisterPlanKeyDto, Required<RegisterCatalogPlanNameDto>>
  >(
    (acc, key) => {
      const fallback = DEFAULT_PLAN_NAMES[key];
      const raw = incoming[key];
      const name = cleanCatalogText(raw?.name, fallback.name);
      acc[key] = {
        name,
        nameSl: cleanCatalogText(raw?.nameSl, fallback.nameSl || name),
      };
      return acc;
    },
    { ...DEFAULT_PLAN_NAMES },
  );
}

function mergeRegisterCatalog(
  fetched: RegisterPriceCatalogDto | null | undefined,
): RegisterPriceCatalogDto {
  const plans = { ...DEFAULT_REGISTER_CATALOG.plans };
  if (fetched?.plans) Object.assign(plans, fetched.plans);
  const planNames = normalizePlanNamesFromCatalog(
    fetched || DEFAULT_REGISTER_CATALOG,
  );
  const addonItems = normalizeAddonItemsFromCatalog(
    fetched || DEFAULT_REGISTER_CATALOG,
  );
  const featureItems = normalizeFeatureItemsFromCatalog(
    fetched || DEFAULT_REGISTER_CATALOG,
  );
  const addons = addonMapFromItems(addonItems);
  const annualDiscountPercent =
    typeof fetched?.annualDiscountPercent === "number" &&
    Number.isFinite(fetched.annualDiscountPercent)
      ? Math.max(0, Math.min(100, roundMoney2(fetched.annualDiscountPercent)))
      : DEFAULT_REGISTER_CATALOG.annualDiscountPercent;
  const additionalUserRaw =
    typeof fetched?.additionalUserMonthly === "number"
      ? fetched.additionalUserMonthly
      : fetched?.usagePrices?.additionalUserMonthly;
  const smsRaw =
    typeof fetched?.smsPerMessage === "number"
      ? fetched.smsPerMessage
      : fetched?.usagePrices?.smsPerMessage;
  const additionalUserMonthly =
    typeof additionalUserRaw === "number" && Number.isFinite(additionalUserRaw)
      ? Math.max(0, roundMoney2(additionalUserRaw))
      : DEFAULT_USAGE_PRICES.additionalUserMonthly;
  const smsPerMessage =
    typeof smsRaw === "number" && Number.isFinite(smsRaw)
      ? Math.max(0, Math.round(smsRaw * 10000) / 10000)
      : DEFAULT_USAGE_PRICES.smsPerMessage;
  const additionalUserTransactionServiceId = normalizeServiceId(
    fetched?.additionalUserTransactionServiceId ??
      fetched?.usagePrices?.additionalUserTransactionServiceId,
  );
  const smsTransactionServiceId = normalizeServiceId(
    fetched?.smsTransactionServiceId ??
      fetched?.usagePrices?.smsTransactionServiceId,
  );
  const planTransactionServiceIds = PLAN_TRANSACTION_SERVICE_FIELDS.reduce<
    Partial<Record<PlanTransactionServiceKey, number | null>>
  >((acc, field) => {
    const id = normalizeServiceId(
      fetched?.planTransactionServiceIds?.[field.key],
    );
    if (id) acc[field.key] = id;
    return acc;
  }, {});
  const usagePrices = {
    additionalUserMonthly,
    smsPerMessage,
    additionalUserTransactionServiceId,
    smsTransactionServiceId,
  };
  return {
    plans,
    planNames,
    addons,
    annualDiscountPercent,
    addonItems,
    featureItems,
    additionalUserMonthly,
    smsPerMessage,
    usagePrices,
    planTransactionServiceIds,
    additionalUserTransactionServiceId,
    smsTransactionServiceId,
  };
}

function planAmountsForTenant(
  selected: TenancyDetails,
  catalog: RegisterPriceCatalogDto,
) {
  const planKey = packageToCatalogPlanKey(selected.packageType);
  const monthlyRaw = catalog.plans[planKey];
  const monthly =
    typeof monthlyRaw === "number" && Number.isFinite(monthlyRaw)
      ? monthlyRaw
      : DEFAULT_REGISTER_CATALOG.plans[planKey];
  const annualDiscountPercent =
    catalog.annualDiscountPercent ??
    DEFAULT_REGISTER_CATALOG.annualDiscountPercent ??
    15;
  const yearly = roundMoney2(monthly * 12 * (1 - annualDiscountPercent / 100));
  const billingLabel = isYearlyBillingInterval(selected.subscriptionInterval)
    ? ("Annual" as const)
    : ("Monthly" as const);
  const currentAmount = billingLabel === "Annual" ? yearly : monthly;
  return { planKey, monthly, yearly, billingLabel, currentAmount };
}

type PriceModalCtx = {
  baseAmount: number;
  addonSum: number;
  billingLabel: string;
  planLabel: string;
};

function readPriceModalCtx(root: HTMLElement): PriceModalCtx | null {
  const extras = root.querySelector<HTMLElement>("#priceOverrideExtras");
  if (!extras || extras.hidden) return null;
  const b = Number.parseFloat(extras.dataset.baseAmount ?? "");
  if (!Number.isFinite(b)) return null;
  const addonSum = Number.parseFloat(extras.dataset.addonSum ?? "0");
  return {
    baseAmount: b,
    addonSum: Number.isFinite(addonSum) ? addonSum : 0,
    billingLabel: extras.dataset.billingLabel ?? "Monthly",
    planLabel: extras.dataset.planLabel ?? "",
  };
}

function updatePriceOverridePanels(root: HTMLElement) {
  const backdrop = root.querySelector<HTMLElement>("#modalBackdrop");
  if (!backdrop || backdrop.dataset.modalKind !== "price") return;
  const ctx = readPriceModalCtx(root);
  const select = root.querySelector<HTMLSelectElement>("#actionSelect");
  const customPanel = root.querySelector<HTMLElement>(
    "#priceOverridePanelCustom",
  );
  const discountPanel = root.querySelector<HTMLElement>(
    "#priceOverridePanelDiscount",
  );
  const removePanel = root.querySelector<HTMLElement>(
    "#priceOverridePanelRemove",
  );
  const preview = root.querySelector<HTMLElement>("#priceDiscountPreview");
  if (!select || !customPanel || !discountPanel || !removePanel) return;
  const idx = select.selectedIndex;
  customPanel.hidden = idx !== 0;
  discountPanel.hidden = idx !== 1;
  removePanel.hidden = idx !== 2;
  if (!preview) return;
  if (idx !== 1 || !ctx) {
    preview.textContent = "";
    return;
  }
  const pctInput = root.querySelector<HTMLInputElement>(
    "#priceDiscountPercent",
  );
  const include = root.querySelector<HTMLInputElement>(
    "#priceDiscountIncludeAddons",
  );
  const pct = Number.parseFloat((pctInput?.value ?? "").replace(",", "."));
  const pctClamped = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  const gross = include?.checked
    ? ctx.baseAmount + ctx.addonSum
    : ctx.baseAmount;
  const after = roundMoney2(gross * (1 - pctClamped / 100));
  const scope = include?.checked
    ? "plan + catalog add-ons (reference total)"
    : "plan base only";
  const period = ctx.billingLabel === "Annual" ? "year" : "month";
  preview.textContent = `After ${pctClamped}% off (${scope}): €${formatMoneyEUR(after)} per ${period}.`;
}

function applyPriceModalDOM(
  root: HTMLElement,
  selected: TenancyDetails,
  catalog: RegisterPriceCatalogDto,
) {
  const merged = mergeRegisterCatalog(catalog);
  const amounts = planAmountsForTenant(selected, merged);
  const addonSum = sumAddonCatalog(merged.addons);
  const extras = root.querySelector<HTMLElement>("#priceOverrideExtras");
  if (!extras) return;
  extras.dataset.baseAmount = String(amounts.currentAmount);
  extras.dataset.addonSum = String(addonSum);
  extras.dataset.billingLabel = amounts.billingLabel;
  extras.dataset.planLabel = formatPlan(selected.packageType);

  const baseStr = formatMoneyEUR(amounts.currentAmount);
  const defLine = `Current plan price for ${formatPlan(selected.packageType)} (${amounts.billingLabel} billing): €${baseStr} per ${amounts.billingLabel === "Annual" ? "year" : "month"}.`;
  const elCustom = root.querySelector<HTMLElement>("#priceCurrentLabelCustom");
  if (elCustom) elCustom.textContent = defLine;
  const elDisc = root.querySelector<HTMLElement>("#priceCurrentLabelDiscount");
  if (elDisc) elDisc.textContent = defLine;

  const remove = root.querySelector<HTMLElement>("#priceRemoveCopy");
  if (remove) {
    remove.textContent = `Removing the override resets billing to the default catalog amount for ${formatPlan(selected.packageType)} on ${amounts.billingLabel} billing: €${baseStr} per ${amounts.billingLabel === "Annual" ? "year" : "month"} (same as register "Plan & add-on prices").`;
  }

  const inputCustom = root.querySelector<HTMLInputElement>("#priceCustomInput");
  if (inputCustom) inputCustom.value = String(amounts.currentAmount);

  const pct = root.querySelector<HTMLInputElement>("#priceDiscountPercent");
  if (pct) pct.value = "";
  const inc = root.querySelector<HTMLInputElement>(
    "#priceDiscountIncludeAddons",
  );
  if (inc) inc.checked = false;

  updatePriceOverridePanels(root);
}

function PlanPricesAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [plans, setPlans] = useState({
    basic: 18.9,
    pro: 34.9,
    business: 59.9,
  });
  const [planNames, setPlanNames] = useState<
    Record<RegisterPlanKeyDto, Required<RegisterCatalogPlanNameDto>>
  >(() => ({ ...DEFAULT_PLAN_NAMES }));
  const [annualDiscountPercent, setAnnualDiscountPercent] = useState(15);
  const [additionalUserMonthly, setAdditionalUserMonthly] = useState(
    DEFAULT_USAGE_PRICES.additionalUserMonthly,
  );
  const [smsPerMessage, setSmsPerMessage] = useState(
    DEFAULT_USAGE_PRICES.smsPerMessage,
  );
  const [transactionServices, setTransactionServices] = useState<
    TransactionServiceSummaryDto[]
  >([]);
  const [planTransactionServiceIds, setPlanTransactionServiceIds] = useState<
    Partial<Record<PlanTransactionServiceKey, number | null>>
  >({});
  const [
    additionalUserTransactionServiceId,
    setAdditionalUserTransactionServiceId,
  ] = useState<number | null>(null);
  const [smsTransactionServiceId, setSmsTransactionServiceId] = useState<
    number | null
  >(null);
  const [addonItems, setAddonItems] = useState<RegisterCatalogAddonItemDto[]>(
    () => DEFAULT_ADDON_ITEMS.map((item) => ({ ...item })),
  );
  const [featureItems, setFeatureItems] = useState<
    RegisterCatalogFeatureItemDto[]
  >(() => DEFAULT_FEATURE_ITEMS.map((item) => ({ ...item })));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [catalogResponse, serviceResponse] = await Promise.all([
          api.get<RegisterPriceCatalogDto>("/platform-admin/register-prices"),
          api
            .get<TransactionServiceSummaryDto[]>("/billing/services")
            .catch(() => ({ data: [] as TransactionServiceSummaryDto[] })),
        ]);
        if (cancelled) return;
        const data = catalogResponse.data;
        const catalog = mergeRegisterCatalog(data);
        setTransactionServices(
          (serviceResponse.data || []).filter(
            (service) => service && service.id,
          ),
        );
        setPlans({
          basic:
            typeof catalog.plans.basic === "number"
              ? catalog.plans.basic
              : 18.9,
          pro: typeof catalog.plans.pro === "number" ? catalog.plans.pro : 34.9,
          business:
            typeof catalog.plans.business === "number"
              ? catalog.plans.business
              : 59.9,
        });
        setPlanNames(normalizePlanNamesFromCatalog(catalog));
        setAnnualDiscountPercent(catalog.annualDiscountPercent ?? 15);
        setAdditionalUserMonthly(
          catalog.additionalUserMonthly ??
            DEFAULT_USAGE_PRICES.additionalUserMonthly,
        );
        setSmsPerMessage(
          catalog.smsPerMessage ?? DEFAULT_USAGE_PRICES.smsPerMessage,
        );
        setPlanTransactionServiceIds(catalog.planTransactionServiceIds || {});
        setAdditionalUserTransactionServiceId(
          catalog.additionalUserTransactionServiceId ?? null,
        );
        setSmsTransactionServiceId(catalog.smsTransactionServiceId ?? null);
        setAddonItems(
          (catalog.addonItems || DEFAULT_ADDON_ITEMS).map((item) => ({
            ...item,
          })),
        );
        setFeatureItems(
          (catalog.featureItems || DEFAULT_FEATURE_ITEMS).map((item) => ({
            ...item,
          })),
        );
      } catch {
        setErr("Could not load register catalog.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePlanName = (
    planKey: RegisterPlanKeyDto,
    patch: Partial<Required<RegisterCatalogPlanNameDto>>,
  ) => {
    setPlanNames((current) => ({
      ...current,
      [planKey]: { ...current[planKey], ...patch },
    }));
  };

  const cleanPlanNames = (): Record<
    RegisterPlanKeyDto,
    Required<RegisterCatalogPlanNameDto>
  > => {
    return (["basic", "pro", "business"] as const).reduce<
      Record<RegisterPlanKeyDto, Required<RegisterCatalogPlanNameDto>>
    >(
      (acc, key) => {
        const fallback = DEFAULT_PLAN_NAMES[key];
        const current = planNames[key] || fallback;
        const name = cleanCatalogText(current.name, fallback.name);
        acc[key] = {
          name,
          nameSl: cleanCatalogText(current.nameSl, fallback.nameSl || name),
        };
        return acc;
      },
      { ...DEFAULT_PLAN_NAMES },
    );
  };

  const updateAddon = (
    index: number,
    patch: Partial<RegisterCatalogAddonItemDto>,
  ) => {
    setAddonItems((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const addAddon = () => {
    const stamp = Date.now().toString(36);
    setAddonItems((items) => [
      ...items,
      {
        key: `custom-addon-${stamp}`,
        name: "New add-on",
        nameSl: "Nov dodatek",
        description: "Optional platform add-on.",
        descriptionSl: "Dodatek za platformo.",
        monthly: 0,
        active: true,
      },
    ]);
  };

  const removeAddon = (index: number) => {
    setAddonItems((items) => items.filter((_, i) => i !== index));
  };

  const cleanAddonItems = (): RegisterCatalogAddonItemDto[] => {
    const seen = new Set<string>();
    const cleaned: RegisterCatalogAddonItemDto[] = [];
    addonItems.forEach((item) => {
      const key = normalizeAddonKey(item.key || item.name || "");
      if (!key || seen.has(key)) return;
      seen.add(key);
      cleaned.push({
        key,
        name: (item.name || key.replace(/-/g, " ")).trim(),
        nameSl: (item.nameSl || item.name || key.replace(/-/g, " ")).trim(),
        description: (item.description || "Optional platform add-on.").trim(),
        descriptionSl: (
          item.descriptionSl ||
          item.description ||
          "Dodatek za platformo."
        ).trim(),
        monthly: roundMoney2(item.monthly),
        active: item.active !== false,
        transactionServiceId: normalizeServiceId(item.transactionServiceId),
      });
    });
    return cleaned;
  };

  const updateFeature = (
    index: number,
    patch: Partial<RegisterCatalogFeatureItemDto>,
  ) => {
    setFeatureItems((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const addFeature = () => {
    const stamp = Date.now().toString(36);
    setFeatureItems((items) => [
      ...items,
      {
        key: `custom-feature-${stamp}`,
        name: "New feature",
        nameSl: "Nova funkcija",
        description: "Describe what is included.",
        descriptionSl: "Opišite, kaj je vključeno.",
        minPlan: "pro",
        active: true,
      },
    ]);
  };

  const removeFeature = (index: number) => {
    setFeatureItems((items) => items.filter((_, i) => i !== index));
  };

  const cleanFeatureItems = (): RegisterCatalogFeatureItemDto[] => {
    const seen = new Set<string>();
    const cleaned: RegisterCatalogFeatureItemDto[] = [];
    featureItems.forEach((item) => {
      const key = normalizeFeatureKey(item.key || item.name || "");
      if (!key || seen.has(key)) return;
      seen.add(key);
      cleaned.push({
        key,
        name: (item.name || key.replace(/-/g, " ")).trim(),
        nameSl: (item.nameSl || item.name || key.replace(/-/g, " ")).trim(),
        description: (item.description || "Plan feature.").trim(),
        descriptionSl: (
          item.descriptionSl ||
          item.description ||
          "Funkcija paketa."
        ).trim(),
        minPlan: normalizeCatalogPlanKey(item.minPlan),
        active: item.active !== false,
      });
    });
    return cleaned;
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const cleanedPlanNames = cleanPlanNames();
      const cleanedAddons = cleanAddonItems();
      const cleanedFeatures = cleanFeatureItems();
      const normalizedPlanTransactionServiceIds =
        PLAN_TRANSACTION_SERVICE_FIELDS.reduce<
          Partial<Record<PlanTransactionServiceKey, number | null>>
        >((acc, field) => {
          const id = normalizeServiceId(planTransactionServiceIds[field.key]);
          if (id) acc[field.key] = id;
          return acc;
        }, {});
      const usagePrices = {
        additionalUserMonthly: roundMoney2(additionalUserMonthly),
        smsPerMessage: Math.round(smsPerMessage * 10000) / 10000,
        additionalUserTransactionServiceId: normalizeServiceId(
          additionalUserTransactionServiceId,
        ),
        smsTransactionServiceId: normalizeServiceId(smsTransactionServiceId),
      };
      const payload: RegisterPriceCatalogDto = {
        plans,
        planNames: cleanedPlanNames,
        annualDiscountPercent,
        addonItems: cleanedAddons,
        addons: addonMapFromItems(cleanedAddons),
        featureItems: cleanedFeatures,
        additionalUserMonthly: usagePrices.additionalUserMonthly,
        smsPerMessage: usagePrices.smsPerMessage,
        usagePrices,
        planTransactionServiceIds: normalizedPlanTransactionServiceIds,
        additionalUserTransactionServiceId:
          usagePrices.additionalUserTransactionServiceId,
        smsTransactionServiceId: usagePrices.smsTransactionServiceId,
      };
      const { data } = await api.put<RegisterPriceCatalogDto>(
        "/platform-admin/register-prices",
        payload,
      );
      const catalog = mergeRegisterCatalog(data || payload);
      setPlans({
        basic:
          typeof catalog.plans.basic === "number"
            ? catalog.plans.basic
            : plans.basic,
        pro:
          typeof catalog.plans.pro === "number" ? catalog.plans.pro : plans.pro,
        business:
          typeof catalog.plans.business === "number"
            ? catalog.plans.business
            : plans.business,
      });
      setPlanNames(normalizePlanNamesFromCatalog(catalog));
      setAnnualDiscountPercent(
        catalog.annualDiscountPercent ?? annualDiscountPercent,
      );
      setAdditionalUserMonthly(
        catalog.additionalUserMonthly ?? usagePrices.additionalUserMonthly,
      );
      setSmsPerMessage(catalog.smsPerMessage ?? usagePrices.smsPerMessage);
      setPlanTransactionServiceIds(
        catalog.planTransactionServiceIds ||
          normalizedPlanTransactionServiceIds,
      );
      setAdditionalUserTransactionServiceId(
        catalog.additionalUserTransactionServiceId ??
          usagePrices.additionalUserTransactionServiceId ??
          null,
      );
      setSmsTransactionServiceId(
        catalog.smsTransactionServiceId ??
          usagePrices.smsTransactionServiceId ??
          null,
      );
      setAddonItems(
        (catalog.addonItems || cleanedAddons).map((item) => ({ ...item })),
      );
      setFeatureItems(
        (catalog.featureItems || cleanedFeatures).map((item) => ({ ...item })),
      );
      setOk(
        "Saved. Visitors will see updated prices, package names, transaction-service mappings, usage prices, add-ons, and included feature text after they reload the register pages.",
      );
    } catch {
      setErr("Could not save catalog.");
    } finally {
      setSaving(false);
    }
  };

  const annualFactor = Math.max(
    0,
    Math.min(1, 1 - annualDiscountPercent / 100),
  );
  const planPreviews = [
    {
      key: "basic" as const,
      label: planNames.basic.name,
      nameSl: planNames.basic.nameSl,
      monthly: plans.basic,
    },
    {
      key: "pro" as const,
      label: planNames.pro.name,
      nameSl: planNames.pro.nameSl,
      monthly: plans.pro,
    },
    {
      key: "business" as const,
      label: planNames.business.name,
      nameSl: planNames.business.nameSl,
      monthly: plans.business,
    },
  ];
  const activeAddonCount = addonItems.filter(
    (item) => item.active !== false,
  ).length;
  const serviceOptions = transactionServices.filter(
    (service) => service.active !== false,
  );
  const serviceSelectStyle = {
    height: 44,
    borderRadius: 14,
    border: "1px solid var(--border)",
    padding: "0 12px",
    font: "inherit",
    fontWeight: 800,
    background: "#fff",
    minWidth: 0,
  } as const;
  const renderServiceSelect = (
    id: string,
    value: number | null | undefined,
    onChange: (value: number | null) => void,
  ) => (
    <select
      id={id}
      value={value ? String(value) : ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      style={serviceSelectStyle}
    >
      <option value="">Auto fallback service</option>
      {serviceOptions.map((service) => (
        <option key={service.id} value={service.id}>
          {service.code ? `${service.code} · ` : ""}
          {service.description || `Service ${service.id}`}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="platform-admin-plan-price-head">
        <div className="platform-admin-eyebrow">Signup catalog</div>
        <h2>Plan &amp; add-on prices</h2>
        <p
          className="platform-admin-muted"
          style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}
        >
          Monthly amounts in EUR for the public register flow. Annual discount
          and the active add-on list are read by the register Plan selection
          page.
        </p>
      </div>

      <div
        className="platform-admin-catalog-ladder-wrap platform-admin-panel platform-admin-panel-pad"
        style={{ marginBottom: 22 }}
      >
        <div className="platform-admin-catalog-ladder-head">
          <strong>Plan tiers</strong>
          <span className="platform-admin-muted" style={{ fontWeight: 700 }}>
            Lowest on the left → highest on the right (matches register Basic ·
            Pro · Business).
          </span>
        </div>
        <div
          className="platform-admin-catalog-ladder"
          aria-label="Plan tiers from lowest to highest"
        >
          <div className="platform-admin-catalog-ladder-step platform-admin-catalog-ladder-step--low">
            <span className="platform-admin-catalog-ladder-rung">Lowest</span>
            <span className="platform-admin-catalog-ladder-name">{planNames.basic.name}</span>
            <span
              className="platform-admin-muted"
              style={{ fontSize: "0.82rem", fontWeight: 700 }}
            >
              Entry paid tier
            </span>
          </div>
          <span className="platform-admin-catalog-ladder-arrow" aria-hidden>
            →
          </span>
          <div className="platform-admin-catalog-ladder-step platform-admin-catalog-ladder-step--mid">
            <span className="platform-admin-catalog-ladder-rung">Mid</span>
            <span className="platform-admin-catalog-ladder-name">{planNames.pro.name}</span>
            <span
              className="platform-admin-muted"
              style={{ fontSize: "0.82rem", fontWeight: 700 }}
            >
              Pro feature set
            </span>
          </div>
          <span className="platform-admin-catalog-ladder-arrow" aria-hidden>
            →
          </span>
          <div className="platform-admin-catalog-ladder-step platform-admin-catalog-ladder-step--high">
            <span className="platform-admin-catalog-ladder-rung">Highest</span>
            <span className="platform-admin-catalog-ladder-name">
              {planNames.business.name}
            </span>
            <span
              className="platform-admin-muted"
              style={{ fontSize: "0.82rem", fontWeight: 700 }}
            >
              Business / largest tier
            </span>
          </div>
        </div>
      </div>

      {loading ? <p className="platform-admin-muted">Loading catalog…</p> : null}
      {err ? <p className="platform-admin-search-err">{err}</p> : null}
      {ok ? (
        <p
          style={{
            margin: 0,
            color: "var(--success-text)",
            fontWeight: 800,
            fontSize: "0.92rem",
          }}
        >
          {ok}
        </p>
      ) : null}

      {!loading ? (
        <>
          <h3
            className="platform-admin-muted"
            style={{
              margin: "18px 0 10px",
              fontSize: "0.95rem",
              fontWeight: 950,
            }}
          >
            Plans (€ / month)
          </h3>
          <div className="platform-admin-plan-price-grid">
            <div className="platform-admin-plan-price-field">
              <label htmlFor="pa-plan-basic">{planNames.basic.name}</label>
              <input
                id="pa-plan-basic"
                type="text"
                inputMode="decimal"
                value={String(plans.basic)}
                onChange={(e) =>
                  setPlans((p) => ({
                    ...p,
                    basic: coerceMoneyInput(e.target.value, p.basic),
                  }))
                }
              />
            </div>
            <div className="platform-admin-plan-price-field">
              <label htmlFor="pa-plan-pro">{planNames.pro.name}</label>
              <input
                id="pa-plan-pro"
                type="text"
                inputMode="decimal"
                value={String(plans.pro)}
                onChange={(e) =>
                  setPlans((p) => ({
                    ...p,
                    pro: coerceMoneyInput(e.target.value, p.pro),
                  }))
                }
              />
            </div>
            <div className="platform-admin-plan-price-field">
              <label htmlFor="pa-plan-business">
                {planNames.business.name}
              </label>
              <input
                id="pa-plan-business"
                type="text"
                inputMode="decimal"
                value={String(plans.business)}
                onChange={(e) =>
                  setPlans((p) => ({
                    ...p,
                    business: coerceMoneyInput(e.target.value, p.business),
                  }))
                }
              />
            </div>
          </div>

          <h3
            className="platform-admin-muted"
            style={{
              margin: "22px 0 10px",
              fontSize: "0.95rem",
              fontWeight: 950,
            }}
          >
            Package names
          </h3>
          <div className="platform-admin-plan-price-grid">
            {planPreviews.map((plan) => (
              <div
                key={`names-${plan.key}`}
                className="platform-admin-section-card"
                style={{ padding: 14 }}
              >
                <div className="platform-admin-section-title" style={{ marginBottom: 10 }}>
                  <strong>{plan.label}</strong>
                  <span>
                    Used on the public register package cards and
                    selected-package preview.
                  </span>
                </div>
                <div className="platform-admin-plan-price-grid">
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-plan-name-en-${plan.key}`}>
                      Name EN
                    </label>
                    <input
                      id={`pa-plan-name-en-${plan.key}`}
                      type="text"
                      value={plan.label}
                      onChange={(e) =>
                        updatePlanName(plan.key, { name: e.target.value })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-plan-name-sl-${plan.key}`}>
                      Name SL
                    </label>
                    <input
                      id={`pa-plan-name-sl-${plan.key}`}
                      type="text"
                      value={plan.nameSl}
                      onChange={(e) =>
                        updatePlanName(plan.key, { nameSl: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h3
            className="platform-admin-muted"
            style={{
              margin: "22px 0 10px",
              fontSize: "0.95rem",
              fontWeight: 950,
            }}
          >
            Package transaction service mapping
          </h3>
          <div className="platform-admin-plan-price-grid">
            {PLAN_TRANSACTION_SERVICE_FIELDS.map((field) => (
              <div key={field.key} className="platform-admin-plan-price-field">
                <label htmlFor={`pa-plan-service-${field.key}`}>
                  {field.label}
                </label>
                {renderServiceSelect(
                  `pa-plan-service-${field.key}`,
                  planTransactionServiceIds[field.key] ?? null,
                  (value) =>
                    setPlanTransactionServiceIds((current) => ({
                      ...current,
                      [field.key]: value,
                    })),
                )}
              </div>
            ))}
          </div>

          <h3
            className="platform-admin-muted"
            style={{
              margin: "22px 0 10px",
              fontSize: "0.95rem",
              fontWeight: 950,
            }}
          >
            Annual discount
          </h3>
          <div className="platform-admin-plan-price-grid" style={{ alignItems: "end" }}>
            <div className="platform-admin-plan-price-field">
              <label htmlFor="pa-annual-discount">Annual discount (%)</label>
              <input
                id="pa-annual-discount"
                type="text"
                inputMode="decimal"
                value={String(annualDiscountPercent)}
                onChange={(e) =>
                  setAnnualDiscountPercent((current) =>
                    coercePercentInput(e.target.value, current),
                  )
                }
              />
            </div>
            {planPreviews.map((plan) => {
              const annualTotal = roundMoney2(plan.monthly * 12 * annualFactor);
              return (
                <div
                  key={plan.key}
                  className="platform-admin-field-card"
                  style={{ minHeight: 74, justifyContent: "center" }}
                >
                  <div className="platform-admin-field-label">
                    <strong>{plan.label} annual total</strong>
                    <span>€{formatMoneyEUR(annualTotal)} / year</span>
                  </div>
                </div>
              );
            })}
          </div>

          <h3
            className="platform-admin-muted"
            style={{
              margin: "22px 0 10px",
              fontSize: "0.95rem",
              fontWeight: 950,
            }}
          >
            Usage prices
          </h3>
          <div className="platform-admin-plan-price-grid">
            <div className="platform-admin-plan-price-field">
              <label htmlFor="pa-additional-user-price">
                Additional user (€ / user / month)
              </label>
              <input
                id="pa-additional-user-price"
                type="text"
                inputMode="decimal"
                value={String(additionalUserMonthly)}
                onChange={(e) =>
                  setAdditionalUserMonthly((current) =>
                    coerceMoneyInput(e.target.value, current),
                  )
                }
              />
            </div>
            <div className="platform-admin-plan-price-field">
              <label htmlFor="pa-additional-user-service">
                Additional user transaction service
              </label>
              {renderServiceSelect(
                "pa-additional-user-service",
                additionalUserTransactionServiceId,
                setAdditionalUserTransactionServiceId,
              )}
            </div>
            <div className="platform-admin-plan-price-field">
              <label htmlFor="pa-sms-price">SMS message (€ / SMS)</label>
              <input
                id="pa-sms-price"
                type="text"
                inputMode="decimal"
                value={String(smsPerMessage)}
                onChange={(e) =>
                  setSmsPerMessage((current) =>
                    coerceMoneyInput(e.target.value, current),
                  )
                }
              />
            </div>
            <div className="platform-admin-plan-price-field">
              <label htmlFor="pa-sms-service">SMS transaction service</label>
              {renderServiceSelect(
                "pa-sms-service",
                smsTransactionServiceId,
                setSmsTransactionServiceId,
              )}
            </div>
            <div
              className="platform-admin-field-card"
              style={{ minHeight: 74, justifyContent: "center" }}
            >
              <div className="platform-admin-field-label">
                <strong>50 SMS block preview</strong>
                <span>€{formatMoneyEUR(smsPerMessage * 50)} / 50 SMS</span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginTop: 24,
              flexWrap: "wrap",
            }}
          >
            <h3
              className="platform-admin-muted"
              style={{ margin: 0, fontSize: "0.95rem", fontWeight: 950 }}
            >
              What's included in this plan (
              {featureItems.filter((item) => item.active !== false).length}{" "}
              active)
            </h3>
            <button
              className="platform-admin-button platform-admin-secondary platform-admin-small"
              type="button"
              onClick={addFeature}
            >
              + Add included text
            </button>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {featureItems.length === 0 ? (
              <div className="platform-admin-empty-hint">
                No included text is configured for the register plan preview.
              </div>
            ) : null}
            {featureItems.map((item, index) => (
              <div
                key={`${item.key}-${index}`}
                className="platform-admin-section-card"
                style={{ padding: 14 }}
              >
                <div className="platform-admin-section-head">
                  <div className="platform-admin-section-title">
                    <strong>{item.name || "Included text"}</strong>
                    <span>
                      Shown from{" "}
                      {item.minPlan === "basic"
                        ? "Basic"
                        : item.minPlan === "pro"
                          ? "Pro"
                          : "Business"}{" "}
                      and higher
                    </span>
                  </div>
                  <div className="platform-admin-top-actions">
                    <label className="platform-admin-pill" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={item.active !== false}
                        onChange={(e) =>
                          updateFeature(index, { active: e.target.checked })
                        }
                      />
                      Active
                    </label>
                    <button
                      className="platform-admin-button platform-admin-danger platform-admin-small"
                      type="button"
                      onClick={() => removeFeature(index)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="platform-admin-plan-price-grid">
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-feature-key-${index}`}>Key</label>
                    <input
                      id={`pa-feature-key-${index}`}
                      type="text"
                      value={item.key}
                      onChange={(e) =>
                        updateFeature(index, {
                          key: normalizeFeatureKey(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-feature-min-${index}`}>
                      Minimum plan
                    </label>
                    <select
                      id={`pa-feature-min-${index}`}
                      value={item.minPlan}
                      onChange={(e) =>
                        updateFeature(index, {
                          minPlan: normalizeCatalogPlanKey(e.target.value),
                        })
                      }
                      style={{
                        height: 44,
                        borderRadius: 14,
                        border: "1px solid var(--border)",
                        padding: "0 12px",
                        font: "inherit",
                        fontWeight: 800,
                        background: "#fff",
                      }}
                    >
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="business">Business</option>
                    </select>
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-feature-name-${index}`}>Title EN</label>
                    <input
                      id={`pa-feature-name-${index}`}
                      type="text"
                      value={item.name}
                      onChange={(e) =>
                        updateFeature(index, { name: e.target.value })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-feature-name-sl-${index}`}>
                      Title SL
                    </label>
                    <input
                      id={`pa-feature-name-sl-${index}`}
                      type="text"
                      value={item.nameSl || ""}
                      onChange={(e) =>
                        updateFeature(index, { nameSl: e.target.value })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-feature-desc-${index}`}>
                      Description EN
                    </label>
                    <input
                      id={`pa-feature-desc-${index}`}
                      type="text"
                      value={item.description || ""}
                      onChange={(e) =>
                        updateFeature(index, { description: e.target.value })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-feature-desc-sl-${index}`}>
                      Description SL
                    </label>
                    <input
                      id={`pa-feature-desc-sl-${index}`}
                      type="text"
                      value={item.descriptionSl || ""}
                      onChange={(e) =>
                        updateFeature(index, { descriptionSl: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginTop: 24,
              flexWrap: "wrap",
            }}
          >
            <h3
              className="platform-admin-muted"
              style={{ margin: 0, fontSize: "0.95rem", fontWeight: 950 }}
            >
              Add-ons ({activeAddonCount} active)
            </h3>
            <button
              className="platform-admin-button platform-admin-secondary platform-admin-small"
              type="button"
              onClick={addAddon}
            >
              + Add add-on
            </button>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {addonItems.length === 0 ? (
              <div className="platform-admin-empty-hint">
                No add-ons are active in the register flow. Add a new add-on to
                show it on Plan selection.
              </div>
            ) : null}
            {addonItems.map((item, index) => (
              <div
                key={`${item.key}-${index}`}
                className="platform-admin-section-card"
                style={{ padding: 14 }}
              >
                <div className="platform-admin-section-head">
                  <div className="platform-admin-section-title">
                    <strong>{item.name || "Add-on"}</strong>
                    <span>
                      {item.active !== false
                        ? "Visible on register Plan selection"
                        : "Hidden from register Plan selection"}
                    </span>
                  </div>
                  <div className="platform-admin-top-actions">
                    <label className="platform-admin-pill" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={item.active !== false}
                        onChange={(e) =>
                          updateAddon(index, { active: e.target.checked })
                        }
                      />
                      Active
                    </label>
                    <button
                      className="platform-admin-button platform-admin-danger platform-admin-small"
                      type="button"
                      onClick={() => removeAddon(index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="platform-admin-plan-price-grid">
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-addon-key-${index}`}>Key</label>
                    <input
                      id={`pa-addon-key-${index}`}
                      type="text"
                      value={item.key}
                      onChange={(e) =>
                        updateAddon(index, {
                          key: normalizeAddonKey(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-addon-name-${index}`}>Name EN</label>
                    <input
                      id={`pa-addon-name-${index}`}
                      type="text"
                      value={item.name}
                      onChange={(e) =>
                        updateAddon(index, { name: e.target.value })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-addon-name-sl-${index}`}>Name SL</label>
                    <input
                      id={`pa-addon-name-sl-${index}`}
                      type="text"
                      value={item.nameSl || ""}
                      onChange={(e) =>
                        updateAddon(index, { nameSl: e.target.value })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-addon-monthly-${index}`}>
                      Price (€ / month)
                    </label>
                    <input
                      id={`pa-addon-monthly-${index}`}
                      type="text"
                      inputMode="decimal"
                      value={String(item.monthly)}
                      onChange={(e) =>
                        updateAddon(index, {
                          monthly: coerceMoneyInput(
                            e.target.value,
                            item.monthly,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-addon-service-${index}`}>
                      Transaction service
                    </label>
                    {renderServiceSelect(
                      `pa-addon-service-${index}`,
                      item.transactionServiceId ?? null,
                      (value) =>
                        updateAddon(index, { transactionServiceId: value }),
                    )}
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-addon-desc-${index}`}>
                      Description EN
                    </label>
                    <input
                      id={`pa-addon-desc-${index}`}
                      type="text"
                      value={item.description || ""}
                      onChange={(e) =>
                        updateAddon(index, { description: e.target.value })
                      }
                    />
                  </div>
                  <div className="platform-admin-plan-price-field">
                    <label htmlFor={`pa-addon-desc-sl-${index}`}>
                      Description SL
                    </label>
                    <input
                      id={`pa-addon-desc-sl-${index}`}
                      type="text"
                      value={item.descriptionSl || ""}
                      onChange={(e) =>
                        updateAddon(index, { descriptionSl: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 22 }} className="platform-admin-top-actions">
            <button
              className="platform-admin-button platform-admin-primary"
              type="button"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

type MessagingProviderKey =
  | "GLOBAL_MESSAGING_WHATSAPP_ENABLED"
  | "GLOBAL_MESSAGING_VIBER_ENABLED";
type PaymentProviderKey =
  | "GLOBAL_PAYMENTS_STRIPE_ENABLED"
  | "GLOBAL_PAYMENTS_PAYPAL_ENABLED";
type AjpesProviderKey = "GLOBAL_AJPES_PRS_ENABLED";
type OtherGlobalFeatureKey = "GLOBAL_CONSUMABLES_ENABLED";
type FiscalUrlKey =
  | "GLOBAL_FISCAL_TEST_INVOICE_URL"
  | "GLOBAL_FISCAL_TEST_PREMISE_URL"
  | "GLOBAL_FISCAL_PROD_INVOICE_URL"
  | "GLOBAL_FISCAL_PROD_PREMISE_URL";

type PlatformGlobalSettingsDto = Record<string, string>;

function parseEnabledFlag(raw: string | undefined, fallback = true): boolean {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  return value === "true" || value === "1";
}

function FiscalizationAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [values, setValues] = useState<Record<FiscalUrlKey, string>>({
    GLOBAL_FISCAL_TEST_INVOICE_URL: "",
    GLOBAL_FISCAL_TEST_PREMISE_URL: "",
    GLOBAL_FISCAL_PROD_INVOICE_URL: "",
    GLOBAL_FISCAL_PROD_PREMISE_URL: "",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get<PlatformGlobalSettingsDto>(
          "/platform-admin/settings",
        );
        if (cancelled || !data) return;
        setValues({
          GLOBAL_FISCAL_TEST_INVOICE_URL: String(
            data.GLOBAL_FISCAL_TEST_INVOICE_URL || "",
          ),
          GLOBAL_FISCAL_TEST_PREMISE_URL: String(
            data.GLOBAL_FISCAL_TEST_PREMISE_URL || "",
          ),
          GLOBAL_FISCAL_PROD_INVOICE_URL: String(
            data.GLOBAL_FISCAL_PROD_INVOICE_URL || "",
          ),
          GLOBAL_FISCAL_PROD_PREMISE_URL: String(
            data.GLOBAL_FISCAL_PROD_PREMISE_URL || "",
          ),
        });
      } catch {
        if (!cancelled) setErr("Could not load fiscalization settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      await api.put("/platform-admin/settings", {
        GLOBAL_FISCAL_TEST_INVOICE_URL:
          values.GLOBAL_FISCAL_TEST_INVOICE_URL.trim(),
        GLOBAL_FISCAL_TEST_PREMISE_URL:
          values.GLOBAL_FISCAL_TEST_PREMISE_URL.trim(),
        GLOBAL_FISCAL_PROD_INVOICE_URL:
          values.GLOBAL_FISCAL_PROD_INVOICE_URL.trim(),
        GLOBAL_FISCAL_PROD_PREMISE_URL:
          values.GLOBAL_FISCAL_PROD_PREMISE_URL.trim(),
      });
      setOk("Fiscalization settings saved.");
    } catch {
      setErr("Could not save fiscalization settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="platform-admin-panel platform-admin-panel-pad">
      <div className="platform-admin-plan-price-head">
        <div className="platform-admin-eyebrow">Global controls</div>
        <h2>Fiscalization</h2>
        <p
          className="platform-admin-muted"
          style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}
        >
          TEST and PROD fiscal URLs are global. The same values are used for
          every tenant by selected fiscal environment.
        </p>
      </div>

      {loading ? (
        <p className="platform-admin-muted">Loading fiscalization settings…</p>
      ) : null}
      {err ? <p className="platform-admin-search-err">{err}</p> : null}
      {ok ? (
        <p
          style={{
            margin: 0,
            color: "var(--success-text)",
            fontWeight: 800,
            fontSize: "0.92rem",
          }}
        >
          {ok}
        </p>
      ) : null}

      {!loading ? (
        <div className="platform-admin-plan-price-grid" style={{ marginTop: 12 }}>
          <div className="platform-admin-plan-price-field">
            <label htmlFor="pa-fiscal-test-invoice">TEST URL računov</label>
            <input
              id="pa-fiscal-test-invoice"
              type="text"
              style={{ fontSize: "0.76rem" }}
              value={values.GLOBAL_FISCAL_TEST_INVOICE_URL}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  GLOBAL_FISCAL_TEST_INVOICE_URL: e.target.value,
                }))
              }
            />
          </div>
          <div className="platform-admin-plan-price-field">
            <label htmlFor="pa-fiscal-test-premise">
              TEST URL prijave prostora
            </label>
            <input
              id="pa-fiscal-test-premise"
              type="text"
              style={{ fontSize: "0.76rem" }}
              value={values.GLOBAL_FISCAL_TEST_PREMISE_URL}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  GLOBAL_FISCAL_TEST_PREMISE_URL: e.target.value,
                }))
              }
            />
          </div>
          <div className="platform-admin-plan-price-field">
            <label htmlFor="pa-fiscal-prod-invoice">PROD URL računov</label>
            <input
              id="pa-fiscal-prod-invoice"
              type="text"
              style={{ fontSize: "0.76rem" }}
              value={values.GLOBAL_FISCAL_PROD_INVOICE_URL}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  GLOBAL_FISCAL_PROD_INVOICE_URL: e.target.value,
                }))
              }
            />
          </div>
          <div className="platform-admin-plan-price-field">
            <label htmlFor="pa-fiscal-prod-premise">
              PROD URL prijave prostora
            </label>
            <input
              id="pa-fiscal-prod-premise"
              type="text"
              style={{ fontSize: "0.76rem" }}
              value={values.GLOBAL_FISCAL_PROD_PREMISE_URL}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  GLOBAL_FISCAL_PROD_PREMISE_URL: e.target.value,
                }))
              }
            />
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }} className="platform-admin-top-actions">
        <button
          className="platform-admin-button platform-admin-primary"
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

type StripeAdminModeSettings = {
  enabled: boolean;
  secretKeyMissing: boolean;
  publishableKey: string;
  webhookSecretMissing: boolean;
  successUrl: string;
  cancelUrl: string;
  currency: string;
  applicationFeePercent: string;
  applicationFeeFixedMinor: string;
  secretKey?: string;
  webhookSecret?: string;
};

type StripeAdminSettings = {
  sandbox: StripeAdminModeSettings;
  production: StripeAdminModeSettings;
};

const emptyStripeModeSettings = (): StripeAdminModeSettings => ({
  enabled: true,
  secretKeyMissing: true,
  publishableKey: "",
  webhookSecretMissing: true,
  successUrl: "",
  cancelUrl: "",
  currency: "EUR",
  applicationFeePercent: "0",
  applicationFeeFixedMinor: "0",
  secretKey: "",
  webhookSecret: "",
});

function normalizeStripeModeSettings(
  raw: Partial<StripeAdminModeSettings> | undefined,
  fallbackEnabled: boolean,
): StripeAdminModeSettings {
  const base = emptyStripeModeSettings();
  return {
    ...base,
    enabled: raw?.enabled ?? fallbackEnabled,
    secretKeyMissing: raw?.secretKeyMissing ?? true,
    publishableKey: String(raw?.publishableKey || ""),
    webhookSecretMissing: raw?.webhookSecretMissing ?? true,
    successUrl: String(raw?.successUrl || base.successUrl),
    cancelUrl: String(raw?.cancelUrl || base.cancelUrl),
    currency: String(raw?.currency || "EUR").toUpperCase(),
    applicationFeePercent: String(raw?.applicationFeePercent ?? "0"),
    applicationFeeFixedMinor: String(raw?.applicationFeeFixedMinor ?? "0"),
    secretKey: "",
    webhookSecret: "",
  };
}

function PaymentProvidersAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<"stripe" | "paypal">(
    "stripe",
  );
  const [activeMode, setActiveMode] = useState<"sandbox" | "production">(
    "sandbox",
  );
  const [providerFlags, setProviderFlags] = useState<
    Record<PaymentProviderKey, boolean>
  >({
    GLOBAL_PAYMENTS_STRIPE_ENABLED: true,
    GLOBAL_PAYMENTS_PAYPAL_ENABLED: false,
  });
  const [values, setValues] = useState<StripeAdminSettings>({
    sandbox: emptyStripeModeSettings(),
    production: { ...emptyStripeModeSettings(), enabled: false },
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [stripeRes, settingsRes] = await Promise.all([
          api.get<StripeAdminSettings>(
            "/platform-admin/payment-providers/stripe",
          ),
          api.get<PlatformGlobalSettingsDto>("/platform-admin/settings"),
        ]);
        if (cancelled) return;
        const data = stripeRes.data;
        setValues({
          sandbox: normalizeStripeModeSettings(data?.sandbox, true),
          production: normalizeStripeModeSettings(data?.production, false),
        });
        const globalSettings = settingsRes.data;
        setProviderFlags({
          GLOBAL_PAYMENTS_STRIPE_ENABLED: parseEnabledFlag(
            globalSettings?.GLOBAL_PAYMENTS_STRIPE_ENABLED,
            true,
          ),
          GLOBAL_PAYMENTS_PAYPAL_ENABLED: parseEnabledFlag(
            globalSettings?.GLOBAL_PAYMENTS_PAYPAL_ENABLED,
            false,
          ),
        });
      } catch {
        if (!cancelled) setErr("Could not load payment provider settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateMode = (patch: Partial<StripeAdminModeSettings>) => {
    setValues((prev) => ({
      ...prev,
      [activeMode]: { ...prev[activeMode], ...patch },
    }));
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      await api.put("/platform-admin/settings", {
        GLOBAL_PAYMENTS_STRIPE_ENABLED: String(
          providerFlags.GLOBAL_PAYMENTS_STRIPE_ENABLED,
        ),
        GLOBAL_PAYMENTS_PAYPAL_ENABLED: String(
          providerFlags.GLOBAL_PAYMENTS_PAYPAL_ENABLED,
        ),
      });
      const payload: StripeAdminSettings = {
        sandbox: {
          ...values.sandbox,
          currency: values.sandbox.currency.toUpperCase(),
        },
        production: {
          ...values.production,
          currency: values.production.currency.toUpperCase(),
        },
      };
      const { data } = await api.put<StripeAdminSettings>(
        "/platform-admin/payment-providers/stripe",
        payload,
      );
      setValues({
        sandbox: normalizeStripeModeSettings(data?.sandbox, true),
        production: normalizeStripeModeSettings(data?.production, false),
      });
      setOk("Payment provider settings saved.");
    } catch (e: any) {
      setErr(
        e?.response?.data?.message ||
          "Could not save payment provider settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  const current = values[activeMode];
  const modeLabel = activeMode === "sandbox" ? "Sandbox" : "Production";
  const stripeGloballyEnabled = providerFlags.GLOBAL_PAYMENTS_STRIPE_ENABLED;
  const paypalGloballyEnabled = providerFlags.GLOBAL_PAYMENTS_PAYPAL_ENABLED;

  return (
    <div className="platform-admin-panel platform-admin-panel-pad">
      <div className="platform-admin-plan-price-head">
        <div className="platform-admin-eyebrow">Payment providers</div>
        <h2>{activeProvider === "stripe" ? "Stripe Connect" : "PayPal"}</h2>
        <p
          className="platform-admin-muted"
          style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}
        >
          Configure global provider availability. OFF is enforced as a hard
          platform override across tenant web and guest apps.
        </p>
      </div>

      <div className="platform-admin-top-actions" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={
            activeProvider === "stripe"
              ? "button primary small"
              : "button secondary small"
          }
          onClick={() => setActiveProvider("stripe")}
        >
          Stripe
        </button>
        <button
          type="button"
          className={
            activeProvider === "paypal"
              ? "button primary small"
              : "button secondary small"
          }
          onClick={() => setActiveProvider("paypal")}
        >
          PayPal
        </button>
      </div>

      {loading ? (
        <p className="platform-admin-muted">Loading payment provider settings…</p>
      ) : null}
      {err ? <p className="platform-admin-search-err">{err}</p> : null}
      {ok ? (
        <p
          style={{
            margin: 0,
            color: "var(--success-text)",
            fontWeight: 800,
            fontSize: "0.92rem",
          }}
        >
          {ok}
        </p>
      ) : null}

      {!loading && activeProvider === "stripe" ? (
        <>
          <div
            className="platform-admin-section-card"
            style={{ marginTop: 12, marginBottom: 12 }}
          >
            <div className="platform-admin-section-head">
              <div className="platform-admin-section-title">
                <strong>Stripe global status</strong>
                <span>
                  {stripeGloballyEnabled
                    ? "Stripe is currently enabled for all tenants."
                    : "Stripe is currently disabled for all tenants."}
                </span>
              </div>
            </div>
            <div className="platform-admin-top-actions">
              <button
                type="button"
                className={
                  stripeGloballyEnabled
                    ? "button primary small"
                    : "button secondary small"
                }
                onClick={() =>
                  setProviderFlags((prev) => ({
                    ...prev,
                    GLOBAL_PAYMENTS_STRIPE_ENABLED: true,
                  }))
                }
              >
                ON
              </button>
              <button
                type="button"
                className={
                  !stripeGloballyEnabled
                    ? "button danger small"
                    : "button secondary small"
                }
                onClick={() =>
                  setProviderFlags((prev) => ({
                    ...prev,
                    GLOBAL_PAYMENTS_STRIPE_ENABLED: false,
                  }))
                }
              >
                OFF
              </button>
            </div>
          </div>

          <div className="platform-admin-top-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={
                activeMode === "sandbox"
                  ? "button primary small"
                  : "button secondary small"
              }
              onClick={() => setActiveMode("sandbox")}
            >
              Sandbox
            </button>
            <button
              type="button"
              className={
                activeMode === "production"
                  ? "button primary small"
                  : "button secondary small"
              }
              onClick={() => setActiveMode("production")}
            >
              Production
            </button>
          </div>

          <div className="platform-admin-section-card" style={{ marginTop: 12 }}>
            <div className="platform-admin-section-head">
              <div className="platform-admin-section-title">
                <strong>{modeLabel} configuration</strong>
                <span>
                  {current.enabled
                    ? "Enabled for tenant onboarding and checkout."
                    : "Disabled; tenants cannot use this Stripe mode."}
                </span>
              </div>
            </div>

            <div className="platform-admin-top-actions" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className={
                  current.enabled
                    ? "button primary small"
                    : "button secondary small"
                }
                onClick={() => updateMode({ enabled: !current.enabled })}
              >
                {current.enabled ? "Enabled" : "Disabled"}
              </button>
              <span
                className={
                  current.secretKeyMissing ? "platform-admin-pill platform-admin-warning" : "platform-admin-pill platform-admin-success"
                }
              >
                {current.secretKeyMissing
                  ? "Secret key missing"
                  : "Secret key saved"}
              </span>
              <span
                className={
                  current.webhookSecretMissing ? "platform-admin-pill platform-admin-warning" : "platform-admin-pill platform-admin-success"
                }
              >
                {current.webhookSecretMissing
                  ? "Webhook secret missing"
                  : "Webhook secret saved"}
              </span>
            </div>

            <div className="platform-admin-plan-price-grid">
              <div className="platform-admin-plan-price-field">
                <label htmlFor={`stripe-${activeMode}-secret`}>
                  Secret key
                </label>
                <input
                  id={`stripe-${activeMode}-secret`}
                  type="password"
                  autoComplete="off"
                  placeholder={
                    current.secretKeyMissing
                      ? "sk_test_… / sk_live_…"
                      : "Saved — leave blank to keep"
                  }
                  value={current.secretKey || ""}
                  onChange={(e) => updateMode({ secretKey: e.target.value })}
                />
              </div>
              <div className="platform-admin-plan-price-field">
                <label htmlFor={`stripe-${activeMode}-publishable`}>
                  Publishable key
                </label>
                <input
                  id={`stripe-${activeMode}-publishable`}
                  type="text"
                  placeholder="pk_test_… / pk_live_…"
                  value={current.publishableKey}
                  onChange={(e) =>
                    updateMode({ publishableKey: e.target.value })
                  }
                />
              </div>
              <div className="platform-admin-plan-price-field">
                <label htmlFor={`stripe-${activeMode}-webhook`}>
                  Webhook signing secret
                </label>
                <input
                  id={`stripe-${activeMode}-webhook`}
                  type="password"
                  autoComplete="off"
                  placeholder={
                    current.webhookSecretMissing
                      ? "whsec_…"
                      : "Saved — leave blank to keep"
                  }
                  value={current.webhookSecret || ""}
                  onChange={(e) =>
                    updateMode({ webhookSecret: e.target.value })
                  }
                />
              </div>
              <div className="platform-admin-plan-price-field">
                <label htmlFor={`stripe-${activeMode}-currency`}>
                  Default currency
                </label>
                <input
                  id={`stripe-${activeMode}-currency`}
                  type="text"
                  maxLength={3}
                  value={current.currency}
                  onChange={(e) =>
                    updateMode({ currency: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="platform-admin-plan-price-field">
                <label htmlFor={`stripe-${activeMode}-success`}>
                  Checkout success URL
                </label>
                <input
                  id={`stripe-${activeMode}-success`}
                  type="text"
                  style={{ fontSize: "0.76rem" }}
                  value={current.successUrl}
                  onChange={(e) => updateMode({ successUrl: e.target.value })}
                />
              </div>
              <div className="platform-admin-plan-price-field">
                <label htmlFor={`stripe-${activeMode}-cancel`}>
                  Checkout cancel URL
                </label>
                <input
                  id={`stripe-${activeMode}-cancel`}
                  type="text"
                  style={{ fontSize: "0.76rem" }}
                  value={current.cancelUrl}
                  onChange={(e) => updateMode({ cancelUrl: e.target.value })}
                />
              </div>
              <div className="platform-admin-plan-price-field">
                <label htmlFor={`stripe-${activeMode}-fee-percent`}>
                  Platform fee (%)
                </label>
                <input
                  id={`stripe-${activeMode}-fee-percent`}
                  type="text"
                  inputMode="decimal"
                  value={current.applicationFeePercent}
                  onChange={(e) =>
                    updateMode({
                      applicationFeePercent: e.target.value.replace(",", "."),
                    })
                  }
                />
              </div>
              <div className="platform-admin-plan-price-field">
                <label htmlFor={`stripe-${activeMode}-fee-fixed`}>
                  Fixed fee (minor units)
                </label>
                <input
                  id={`stripe-${activeMode}-fee-fixed`}
                  type="text"
                  inputMode="numeric"
                  value={current.applicationFeeFixedMinor}
                  onChange={(e) =>
                    updateMode({
                      applicationFeeFixedMinor: e.target.value.replace(
                        /[^0-9]/g,
                        "",
                      ),
                    })
                  }
                />
              </div>
            </div>

            <p
              className="platform-admin-muted"
              style={{ margin: "14px 0 0", fontWeight: 700, lineHeight: 1.5 }}
            >
              Manual bill links and guest checkout now generate safe backend
              return URLs automatically. Leave these legacy fallback URLs blank
              unless you intentionally need a custom Stripe return URL. Stripe
              only replaces {"{CHECKOUT_SESSION_ID}"}.
            </p>
          </div>
        </>
      ) : null}

      {!loading && activeProvider === "paypal" ? (
        <div className="platform-admin-section-card" style={{ marginTop: 12 }}>
          <div className="platform-admin-section-head">
            <div className="platform-admin-section-title">
              <strong>PayPal global status</strong>
              <span>
                {paypalGloballyEnabled
                  ? "PayPal is currently enabled for all tenants."
                  : "PayPal is currently disabled for all tenants."}
              </span>
            </div>
          </div>
          <div className="platform-admin-top-actions">
            <button
              type="button"
              className={
                paypalGloballyEnabled
                  ? "button primary small"
                  : "button secondary small"
              }
              onClick={() =>
                setProviderFlags((prev) => ({
                  ...prev,
                  GLOBAL_PAYMENTS_PAYPAL_ENABLED: true,
                }))
              }
            >
              ON
            </button>
            <button
              type="button"
              className={
                !paypalGloballyEnabled
                  ? "button danger small"
                  : "button secondary small"
              }
              onClick={() =>
                setProviderFlags((prev) => ({
                  ...prev,
                  GLOBAL_PAYMENTS_PAYPAL_ENABLED: false,
                }))
              }
            >
              OFF
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }} className="platform-admin-top-actions">
        <button
          className="platform-admin-button platform-admin-primary"
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function MessagingProvidersAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<"whatsapp" | "viber">(
    "whatsapp",
  );
  const [flags, setFlags] = useState<Record<MessagingProviderKey, boolean>>({
    GLOBAL_MESSAGING_WHATSAPP_ENABLED: false,
    GLOBAL_MESSAGING_VIBER_ENABLED: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get<PlatformGlobalSettingsDto>(
          "/platform-admin/settings",
        );
        if (cancelled || !data) return;
        setFlags({
          GLOBAL_MESSAGING_WHATSAPP_ENABLED: parseEnabledFlag(
            data.GLOBAL_MESSAGING_WHATSAPP_ENABLED,
            false,
          ),
          GLOBAL_MESSAGING_VIBER_ENABLED: parseEnabledFlag(
            data.GLOBAL_MESSAGING_VIBER_ENABLED,
            false,
          ),
        });
      } catch {
        if (!cancelled) setErr("Could not load messaging provider settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      await api.put("/platform-admin/settings", {
        GLOBAL_MESSAGING_WHATSAPP_ENABLED: String(
          flags.GLOBAL_MESSAGING_WHATSAPP_ENABLED,
        ),
        GLOBAL_MESSAGING_VIBER_ENABLED: String(
          flags.GLOBAL_MESSAGING_VIBER_ENABLED,
        ),
      });
      setOk("Messaging provider settings saved.");
    } catch {
      setErr("Could not save messaging provider settings.");
    } finally {
      setSaving(false);
    }
  };

  const selectedKey: MessagingProviderKey =
    activeProvider === "whatsapp"
      ? "GLOBAL_MESSAGING_WHATSAPP_ENABLED"
      : "GLOBAL_MESSAGING_VIBER_ENABLED";
  const selectedEnabled = flags[selectedKey];

  return (
    <div className="platform-admin-panel platform-admin-panel-pad">
      <div className="platform-admin-plan-price-head">
        <div className="platform-admin-eyebrow">Global controls</div>
        <h2>Messaging providers</h2>
        <p
          className="platform-admin-muted"
          style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}
        >
          Turn providers ON or OFF globally for all tenants. OFF disables
          related configuration tabs, inbox options, and provider
          delivery/webhook processing.
        </p>
      </div>

      <div className="platform-admin-top-actions" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={
            activeProvider === "whatsapp"
              ? "button primary small"
              : "button secondary small"
          }
          onClick={() => setActiveProvider("whatsapp")}
        >
          WhatsApp
        </button>
        <button
          type="button"
          className={
            activeProvider === "viber"
              ? "button primary small"
              : "button secondary small"
          }
          onClick={() => setActiveProvider("viber")}
        >
          Viber
        </button>
      </div>

      {loading ? <p className="platform-admin-muted">Loading provider flags…</p> : null}
      {err ? <p className="platform-admin-search-err">{err}</p> : null}
      {ok ? (
        <p
          style={{
            margin: 0,
            color: "var(--success-text)",
            fontWeight: 800,
            fontSize: "0.92rem",
          }}
        >
          {ok}
        </p>
      ) : null}

      {!loading ? (
        <div className="platform-admin-section-card" style={{ marginTop: 12 }}>
          <div className="platform-admin-section-head">
            <div className="platform-admin-section-title">
              <strong>
                {activeProvider === "whatsapp" ? "WhatsApp" : "Viber"} global
                status
              </strong>
              <span>
                {selectedEnabled
                  ? "Provider is currently enabled for all tenants."
                  : "Provider is currently disabled for all tenants."}
              </span>
            </div>
          </div>
          <div className="platform-admin-top-actions">
            <button
              type="button"
              className={
                selectedEnabled
                  ? "button primary small"
                  : "button secondary small"
              }
              onClick={() =>
                setFlags((prev) => ({ ...prev, [selectedKey]: true }))
              }
            >
              ON
            </button>
            <button
              type="button"
              className={
                !selectedEnabled
                  ? "button danger small"
                  : "button secondary small"
              }
              onClick={() =>
                setFlags((prev) => ({ ...prev, [selectedKey]: false }))
              }
            >
              OFF
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }} className="platform-admin-top-actions">
        <button
          className="platform-admin-button platform-admin-primary"
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function AjpesAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [flags, setFlags] = useState<Record<AjpesProviderKey, boolean>>({
    GLOBAL_AJPES_PRS_ENABLED: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get<PlatformGlobalSettingsDto>(
          "/platform-admin/settings",
        );
        if (cancelled || !data) return;
        setFlags({
          GLOBAL_AJPES_PRS_ENABLED: parseEnabledFlag(
            data.GLOBAL_AJPES_PRS_ENABLED,
            false,
          ),
        });
      } catch {
        if (!cancelled) setErr("Could not load Ajpes PRS settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      await api.put("/platform-admin/settings", {
        GLOBAL_AJPES_PRS_ENABLED: String(flags.GLOBAL_AJPES_PRS_ENABLED),
      });
      setOk("Ajpes PRS settings saved.");
    } catch {
      setErr("Could not save Ajpes PRS settings.");
    } finally {
      setSaving(false);
    }
  };

  const enabled = flags.GLOBAL_AJPES_PRS_ENABLED;

  return (
    <div className="platform-admin-panel platform-admin-panel-pad">
      <div className="platform-admin-plan-price-head">
        <div className="platform-admin-eyebrow">Global controls</div>
        <h2>Ajpes</h2>
        <p
          className="platform-admin-muted"
          style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}
        >
          Turn Ajpes PRS lookup ON or OFF globally for all tenants. OFF prevents
          any fetch by davcna stevilka from contacting Ajpes PRS API.
        </p>
      </div>

      {loading ? <p className="platform-admin-muted">Loading Ajpes flags…</p> : null}
      {err ? <p className="platform-admin-search-err">{err}</p> : null}
      {ok ? (
        <p
          style={{
            margin: 0,
            color: "var(--success-text)",
            fontWeight: 800,
            fontSize: "0.92rem",
          }}
        >
          {ok}
        </p>
      ) : null}

      {!loading ? (
        <div className="platform-admin-section-card" style={{ marginTop: 12 }}>
          <div className="platform-admin-section-head">
            <div className="platform-admin-section-title">
              <strong>PRS global status</strong>
              <span>
                {enabled
                  ? "Ajpes PRS lookup is currently enabled for all tenants."
                  : "Ajpes PRS lookup is currently disabled for all tenants."}
              </span>
            </div>
          </div>
          <div className="platform-admin-top-actions">
            <button
              type="button"
              className={
                enabled ? "button primary small" : "button secondary small"
              }
              onClick={() => setFlags({ GLOBAL_AJPES_PRS_ENABLED: true })}
            >
              ON
            </button>
            <button
              type="button"
              className={
                !enabled ? "button danger small" : "button secondary small"
              }
              onClick={() => setFlags({ GLOBAL_AJPES_PRS_ENABLED: false })}
            >
              OFF
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }} className="platform-admin-top-actions">
        <button
          className="platform-admin-button platform-admin-primary"
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function OtherAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [flags, setFlags] = useState<Record<OtherGlobalFeatureKey, boolean>>({
    GLOBAL_CONSUMABLES_ENABLED: true,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get<PlatformGlobalSettingsDto>(
          "/platform-admin/settings",
        );
        if (cancelled || !data) return;
        setFlags({
          GLOBAL_CONSUMABLES_ENABLED: parseEnabledFlag(
            data.GLOBAL_CONSUMABLES_ENABLED,
            true,
          ),
        });
      } catch {
        if (!cancelled) setErr("Could not load other global settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      await api.put("/platform-admin/settings", {
        GLOBAL_CONSUMABLES_ENABLED: String(flags.GLOBAL_CONSUMABLES_ENABLED),
      });
      window.dispatchEvent(new Event("settings-updated"));
      setOk("Other settings saved.");
    } catch {
      setErr("Could not save other settings.");
    } finally {
      setSaving(false);
    }
  };

  const enabled = flags.GLOBAL_CONSUMABLES_ENABLED;

  return (
    <div className="platform-admin-panel platform-admin-panel-pad">
      <div className="platform-admin-plan-price-head">
        <div className="platform-admin-eyebrow">Global controls</div>
        <h2>Other</h2>
        <p
          className="platform-admin-muted"
          style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}
        >
          Turn optional platform features ON or OFF globally. Platform Admin
          keeps access, while disabled features are hidden from all
          non-platform-admin tenants and blocked on the backend.
        </p>
      </div>

      {loading ? <p className="platform-admin-muted">Loading other settings…</p> : null}
      {err ? <p className="platform-admin-search-err">{err}</p> : null}
      {ok ? (
        <p
          style={{
            margin: 0,
            color: "var(--success-text)",
            fontWeight: 800,
            fontSize: "0.92rem",
          }}
        >
          {ok}
        </p>
      ) : null}

      {!loading ? (
        <div className="platform-admin-section-card" style={{ marginTop: 12 }}>
          <div className="platform-admin-section-head">
            <div className="platform-admin-section-title">
              <strong>Consumables</strong>
              <span>
                {enabled
                  ? "Consumables are visible and usable for tenant admins."
                  : "Consumables are hidden and blocked for non-platform-admin tenants."}
              </span>
            </div>
          </div>
          <label className="platform-admin-admin-setting-switch">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) =>
                setFlags({ GLOBAL_CONSUMABLES_ENABLED: e.target.checked })
              }
            />
            <span className="platform-admin-admin-setting-switch-slider" aria-hidden />
            <span className="platform-admin-admin-setting-switch-copy">
              <strong>{enabled ? "ON" : "OFF"}</strong>
              <span>
                {enabled
                  ? "Show Porabni material / Consumables."
                  : "Hide Porabni material / Consumables."}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }} className="platform-admin-top-actions">
        <button
          className="platform-admin-button platform-admin-primary"
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

type TimeSimulationView = {
  tenantId: number;
  tenantName: string | null;
  offsetSeconds: number;
  enabled: boolean;
  realNow: string;
  simulatedNow: string;
};

function formatOffsetLabel(seconds: number): string {
  if (!seconds) return "no shift";
  const sign = seconds > 0 ? "+" : "-";
  let s = Math.abs(seconds);
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const mins = Math.floor(s / 60);
  s -= mins * 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (s) parts.push(`${s}s`);
  return `${sign}${parts.join(" ") || "0s"}`;
}

function TimeSimulatorPanel() {
  const [tenants, setTenants] = useState<TenancyRow[]>([]);
  const [sims, setSims] = useState<TimeSimulationView[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<number | "">("");
  const [absoluteDateTime, setAbsoluteDateTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setErr(null);
    try {
      const [tenantsRes, simsRes] = await Promise.all([
        api.get<TenancyRow[]>("/platform-admin/tenancies"),
        api.get<TimeSimulationView[]>("/platform-admin/time-simulator"),
      ]);
      setTenants(Array.isArray(tenantsRes.data) ? tenantsRes.data : []);
      setSims(Array.isArray(simsRes.data) ? simsRes.data : []);
    } catch {
      setErr("Could not load tenants or active simulations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const change = async (body: Record<string, unknown>) => {
    if (selectedTenantId === "") {
      setErr("Select a tenant first.");
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await api.put("/platform-admin/time-simulator", {
        tenantId: selectedTenantId,
        ...body,
      });
      setOk("Time simulation updated.");
      await loadAll();
    } catch {
      setErr("Could not update the time simulation.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async (tenantId: number) => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await api.delete(`/platform-admin/time-simulator/${tenantId}`);
      setOk("Simulation cleared.");
      await loadAll();
    } catch {
      setErr("Could not clear the simulation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="platform-admin-panel platform-admin-panel-pad">
      <div className="platform-admin-plan-price-head">
        <div className="platform-admin-eyebrow">Developer tools</div>
        <h2>Time simulator</h2>
        <p
          className="platform-admin-muted"
          style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}
        >
          Artificially shift "now" for a single tenant to test session status
          changes and billing cycles. Only that tenant's time-based logic is
          affected; security, fiscalization and audit timestamps always use real
          time.
        </p>
      </div>

      {loading ? <p className="platform-admin-muted">Loading…</p> : null}
      {err ? <p className="platform-admin-search-err">{err}</p> : null}
      {ok ? (
        <p
          style={{
            margin: 0,
            color: "var(--success-text)",
            fontWeight: 800,
            fontSize: "0.92rem",
          }}
        >
          {ok}
        </p>
      ) : null}

      {!loading ? (
        <div className="platform-admin-section-card" style={{ marginTop: 12 }}>
          <div className="platform-admin-section-head">
            <div className="platform-admin-section-title">
              <strong>Configure tenant clock</strong>
              <span>
                Pick a tenant, then set an absolute date/time or advance/rewind
                the clock.
              </span>
            </div>
          </div>

          <label style={{ display: "block", marginTop: 10, fontWeight: 700 }}>
            Tenant
            <select
              style={{ display: "block", width: "100%", marginTop: 6 }}
              value={selectedTenantId}
              onChange={(e) =>
                setSelectedTenantId(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            >
              <option value="">Select a tenant…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (#{t.id})
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "flex-end",
              marginTop: 12,
            }}
          >
            <label style={{ fontWeight: 700 }}>
              Set absolute date/time
              <input
                type="datetime-local"
                style={{ display: "block", marginTop: 6 }}
                value={absoluteDateTime}
                onChange={(e) => setAbsoluteDateTime(e.target.value)}
              />
            </label>
            <button
              className="platform-admin-button platform-admin-primary"
              type="button"
              disabled={busy || selectedTenantId === "" || !absoluteDateTime}
              onClick={() =>
                void change({ mode: "ABSOLUTE", absoluteDateTime })
              }
            >
              Apply date
            </button>
          </div>

          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}
          >
            <button
              className="platform-admin-button"
              type="button"
              disabled={busy || selectedTenantId === ""}
              onClick={() =>
                void change({ mode: "ADVANCE", advanceSeconds: 3600 })
              }
            >
              +1 hour
            </button>
            <button
              className="platform-admin-button"
              type="button"
              disabled={busy || selectedTenantId === ""}
              onClick={() =>
                void change({ mode: "ADVANCE", advanceSeconds: 86400 })
              }
            >
              +1 day
            </button>
            <button
              className="platform-admin-button"
              type="button"
              disabled={busy || selectedTenantId === ""}
              onClick={() =>
                void change({ mode: "ADVANCE", advanceSeconds: 604800 })
              }
            >
              +1 week
            </button>
            <button
              className="platform-admin-button"
              type="button"
              disabled={busy || selectedTenantId === ""}
              onClick={() =>
                void change({ mode: "ADVANCE", advanceSeconds: 2592000 })
              }
            >
              +30 days
            </button>
            <button
              className="platform-admin-button"
              type="button"
              disabled={busy || selectedTenantId === ""}
              onClick={() =>
                void change({ mode: "ADVANCE", advanceSeconds: -3600 })
              }
            >
              -1 hour
            </button>
            <button
              className="platform-admin-button"
              type="button"
              disabled={busy || selectedTenantId === ""}
              onClick={() =>
                void change({ mode: "ADVANCE", advanceSeconds: -86400 })
              }
            >
              -1 day
            </button>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="platform-admin-section-card" style={{ marginTop: 12 }}>
          <div className="platform-admin-section-head">
            <div className="platform-admin-section-title">
              <strong>Active simulations</strong>
              <span>
                {sims.length
                  ? `${sims.length} tenant(s) currently shifted.`
                  : "No tenants are currently shifted."}
              </span>
            </div>
          </div>
          {sims.length ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {sims.map((sim) => (
                <div
                  key={sim.tenantId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                    borderTop: "1px solid var(--border, #e5e7eb)",
                    paddingTop: 8,
                  }}
                >
                  <div>
                    <strong>
                      {sim.tenantName || `Tenant #${sim.tenantId}`}
                    </strong>
                    <div className="platform-admin-muted" style={{ fontSize: "0.85rem" }}>
                      Shift {formatOffsetLabel(sim.offsetSeconds)} · simulated
                      now: {sim.simulatedNow}
                    </div>
                    <div className="platform-admin-muted" style={{ fontSize: "0.8rem" }}>
                      real now: {sim.realNow}
                    </div>
                  </div>
                  <button
                    className="platform-admin-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void reset(sim.tenantId)}
                  >
                    Reset
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


type MonitoringCheck = {
  key: string;
  label: string;
  status: string;
  summary: string;
  detail: string;
};

type MonitoringMetric = {
  label: string;
  value: string;
  status: string;
  description: string;
};

type MonitoringStatus = {
  generatedAt: string;
  overallStatus: string;
  uptime: string;
  checks: MonitoringCheck[];
  metrics: MonitoringMetric[];
  note: string;
};
type ScheduledJobRun = {
  id: number;
  jobName: string;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  instanceId?: string | null;
  recordsProcessed?: number | null;
  errorMessage?: string | null;
};

type ScheduledJobStatus = {
  jobName: string;
  label: string;
  description: string;
  health: string;
  summary: string;
  detail: string;
  latestRun?: ScheduledJobRun | null;
  lastSuccess?: ScheduledJobRun | null;
  failuresLast24h: number;
  expectedSuccessWithin: string;
  stuckAfter: string;
  activeAlertType?: string | null;
  activeAlertSeverity?: string | null;
  activeAlertMessage?: string | null;
  activeAlertSince?: string | null;
  activeAlertCount?: number | null;
};

type ScheduledJobAlert = {
  id: number;
  jobName: string;
  label: string;
  alertType?: string | null;
  status?: string | null;
  severity?: string | null;
  firstDetectedAt?: string | null;
  lastDetectedAt?: string | null;
  resolvedAt?: string | null;
  lastEmailSentAt?: string | null;
  lastRunId?: number | null;
  message?: string | null;
};


type PlatformOverview = {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  cancelledTenants: number;
  trialTenants: number;
  paidTenants: number;
  pendingPaymentTenants: number;
  pastDueTenants: number;
  paymentWarnings: number;
  ownerPasswordPending: number;
  customPlanTenants: number;
};

function statusIsProblem(status: string | null | undefined): boolean {
  const normalized = (status || "").toUpperCase();
  return normalized !== "UP" && normalized !== "OK";
}

function metricNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function PlatformOverviewPanel({
  onNavigate,
}: {
  onNavigate: (tab: AdminWorkspaceTab) => void;
}) {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringStatus | null>(null);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJobStatus[]>([]);
  const [scheduledJobAlerts, setScheduledJobAlerts] = useState<ScheduledJobAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResponse, statusResponse, jobsResponse, alertsResponse] =
        await Promise.all([
          api.get<PlatformOverview>("/platform-admin/overview"),
          api.get<MonitoringStatus>("/platform-admin/monitoring/status"),
          api.get<ScheduledJobStatus[]>("/platform-admin/monitoring/scheduled-jobs"),
          api.get<ScheduledJobAlert[]>("/platform-admin/monitoring/scheduled-job-alerts"),
        ]);
      setOverview(overviewResponse.data);
      setMonitoring(statusResponse.data);
      setScheduledJobs(jobsResponse.data || []);
      setScheduledJobAlerts(alertsResponse.data || []);
    } catch {
      setOverview(null);
      setMonitoring(null);
      setScheduledJobs([]);
      setScheduledJobAlerts([]);
      setError("Could not load platform overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const failedJobs = scheduledJobs.filter(
    (job) => statusIsProblem(job.health) || (job.failuresLast24h ?? 0) > 0,
  ).length;
  const webhookMetric = (monitoring?.metrics || []).find((metric) =>
    metric.label.toLowerCase().includes("webhook"),
  );
  const failedWebhooks = metricNumber(webhookMetric?.value);

  return (
    <div className="platform-admin-panel platform-admin-panel-pad platform-admin-overview-grid">
      <div className="platform-admin-section-head">
        <div className="platform-admin-section-title">
          <strong>Platform overview</strong>
          <span>
            First screen for tenant counts, payment warnings, active alerts,
            scheduled-job problems, webhook failures and quick operational links.
          </span>
        </div>
        <button
          className="platform-admin-button platform-admin-secondary platform-admin-small"
          type="button"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="platform-admin-muted">Loading platform overview…</p> : null}
      {error ? <p className="platform-admin-search-err">{error}</p> : null}

      <div className="platform-admin-overview-kpis">
        <div className="platform-admin-overview-card">
          <span>Total tenants</span>
          <strong>{overview?.totalTenants ?? "—"}</strong>
          <small>{overview?.activeTenants ?? 0} active · {overview?.trialTenants ?? 0} trial</small>
        </div>
        <div className="platform-admin-overview-card">
          <span>Payment warnings</span>
          <strong>{overview?.paymentWarnings ?? "—"}</strong>
          <small>{overview?.pendingPaymentTenants ?? 0} pending · {overview?.pastDueTenants ?? 0} past due</small>
        </div>
        <div className="platform-admin-overview-card">
          <span>Active alerts</span>
          <strong>{scheduledJobAlerts.length}</strong>
          <small>{monitoring?.overallStatus || "UNKNOWN"} platform status</small>
        </div>
        <div className="platform-admin-overview-card">
          <span>Failed jobs</span>
          <strong>{failedJobs}</strong>
          <small>{scheduledJobs.length} scheduled jobs tracked</small>
        </div>
        <div className="platform-admin-overview-card">
          <span>Failed webhooks</span>
          <strong>{failedWebhooks}</strong>
          <small>{webhookMetric?.label || "No webhook metric found"}</small>
        </div>
        <div className="platform-admin-overview-card">
          <span>Setup warnings</span>
          <strong>{overview?.ownerPasswordPending ?? "—"}</strong>
          <small>Owner password setup still pending</small>
        </div>
      </div>

      <div className="platform-admin-overview-two-col">
        <div className="platform-admin-section-card">
          <div className="platform-admin-section-title">
            <strong>What needs attention</strong>
            <span>Quick read of the most important platform-admin queues.</span>
          </div>
          <div className="platform-admin-monitoring-grid">
            <div className="platform-admin-monitoring-card">
              <div className="platform-admin-monitoring-card-head">
                <strong>Billing</strong>
                <span className={monitoringPillClass((overview?.paymentWarnings ?? 0) > 0 ? "WARN" : "UP")}>
                  {(overview?.paymentWarnings ?? 0) > 0 ? "WARN" : "UP"}
                </span>
              </div>
              <div className="platform-admin-value">{overview?.paymentWarnings ?? 0}</div>
              <div className="platform-admin-monitoring-detail">
                Tenants with pending/past-due subscription status or non-zero due amount.
              </div>
            </div>
            <div className="platform-admin-monitoring-card">
              <div className="platform-admin-monitoring-card-head">
                <strong>Operations</strong>
                <span className={monitoringPillClass(failedJobs > 0 ? "WARN" : "UP")}>
                  {failedJobs > 0 ? "WARN" : "UP"}
                </span>
              </div>
              <div className="platform-admin-value">{failedJobs}</div>
              <div className="platform-admin-monitoring-detail">
                Scheduled jobs with a warning/critical health state or failures in the last 24h.
              </div>
            </div>
            <div className="platform-admin-monitoring-card">
              <div className="platform-admin-monitoring-card-head">
                <strong>Webhooks</strong>
                <span className={monitoringPillClass(failedWebhooks > 0 ? "WARN" : "UP")}>
                  {failedWebhooks > 0 ? "WARN" : "UP"}
                </span>
              </div>
              <div className="platform-admin-value">{failedWebhooks}</div>
              <div className="platform-admin-monitoring-detail">
                {webhookMetric?.description || "Failed webhook counter from monitoring metrics."}
              </div>
            </div>
          </div>
        </div>

        <div className="platform-admin-section-card">
          <div className="platform-admin-section-title">
            <strong>Quick links</strong>
            <span>Jump to the most common admin actions.</span>
          </div>
          <div className="platform-admin-quick-links">
            <button className="platform-admin-quick-link" type="button" onClick={() => onNavigate("tenants")}>
              Tenant management <span>→</span>
            </button>
            <button className="platform-admin-quick-link" type="button" onClick={() => onNavigate("monitoring")}>
              Monitoring <span>→</span>
            </button>
            <button className="platform-admin-quick-link" type="button" onClick={() => onNavigate("payments")}>
              Payment providers <span>→</span>
            </button>
            <button className="platform-admin-quick-link" type="button" onClick={() => onNavigate("messaging")}>
              Messaging providers <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function monitoringPillClass(status: string): string {
  const normalized = (status || "").toUpperCase();
  if (normalized === "UP" || normalized === "OK") return "platform-admin-pill platform-admin-success";
  if (normalized === "WARN") return "platform-admin-pill platform-admin-warning";
  return "platform-admin-pill platform-admin-danger";
}

function formatDurationMs(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function formatMonitoringTime(iso: string | null | undefined): string {
  return iso ? formatAuditTime(iso) : "—";
}

function MonitoringAdminPanel() {
  const [data, setData] = useState<MonitoringStatus | null>(null);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJobStatus[]>([]);
  const [scheduledJobAlerts, setScheduledJobAlerts] = useState<ScheduledJobAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResponse, jobsResponse, alertsResponse] = await Promise.all([
        api.get<MonitoringStatus>("/platform-admin/monitoring/status"),
        api.get<ScheduledJobStatus[]>("/platform-admin/monitoring/scheduled-jobs"),
        api.get<ScheduledJobAlert[]>("/platform-admin/monitoring/scheduled-job-alerts"),
      ]);
      setData(statusResponse.data);
      setScheduledJobs(jobsResponse.data || []);
      setScheduledJobAlerts(alertsResponse.data || []);
    } catch {
      setData(null);
      setScheduledJobs([]);
      setScheduledJobAlerts([]);
      setError("Could not load monitoring status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="platform-admin-panel platform-admin-panel-pad" style={{ display: "grid", gap: 16 }}>
      <div className="platform-admin-section-head">
        <div className="platform-admin-section-title">
          <strong>Monitoring</strong>
          <span>
            Quick platform health for the API, database, Redis, disk space and
            production-risk counters. This is an admin overview, not a
            replacement for external alerting.
          </span>
        </div>
        <button
          className="platform-admin-button platform-admin-secondary platform-admin-small"
          type="button"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="platform-admin-muted">Loading monitoring status…</p> : null}
      {error ? <p className="platform-admin-search-err">{error}</p> : null}

      {data ? (
        <>
          <div className="platform-admin-section-card">
            <div className="platform-admin-section-head">
              <div className="platform-admin-section-title">
                <strong>Platform status</strong>
                <span>
                  Last checked {data.generatedAt || "—"} · backend uptime {data.uptime || "—"}
                </span>
              </div>
              <span className={monitoringPillClass(data.overallStatus)}>
                {data.overallStatus || "UNKNOWN"}
              </span>
            </div>
            {data.note ? <div className="platform-admin-monitoring-note">{data.note}</div> : null}
          </div>

          <div className="platform-admin-section-card">
            <div className="platform-admin-section-title">
              <strong>Core checks</strong>
              <span>Backend dependencies and host capacity.</span>
            </div>
            <div className="platform-admin-monitoring-grid">
              {(data.checks || []).map((check) => (
                <div className="platform-admin-monitoring-card" key={check.key || check.label}>
                  <div className="platform-admin-monitoring-card-head">
                    <strong>{check.label}</strong>
                    <span className={monitoringPillClass(check.status)}>
                      {check.status || "UNKNOWN"}
                    </span>
                  </div>
                  <div className="platform-admin-value">{check.summary || "—"}</div>
                  <div className="platform-admin-monitoring-detail">{check.detail || "—"}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="platform-admin-section-card">
            <div className="platform-admin-section-title">
              <strong>Risk counters</strong>
              <span>
                Counts from the current backend process or database state,
                depending on the metric.
              </span>
            </div>
            <div className="platform-admin-monitoring-grid">
              {(data.metrics || []).map((metric) => (
                <div className="platform-admin-monitoring-card" key={metric.label}>
                  <div className="platform-admin-monitoring-card-head">
                    <strong>{metric.label}</strong>
                    <span className={monitoringPillClass(metric.status)}>
                      {metric.status || "UNKNOWN"}
                    </span>
                  </div>
                  <div className="platform-admin-value">{metric.value || "0"}</div>
                  <div className="platform-admin-monitoring-detail">
                    {metric.description || "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>


          <div className="platform-admin-section-card">
            <div className="platform-admin-section-title">
              <strong>Active scheduled job alerts</strong>
              <span>
                Email-backed alerts opened by the scheduled job alert scanner.
                Recovery emails are sent when an alert resolves.
              </span>
            </div>
            <div className="platform-admin-monitoring-jobs-wrap">
              <table className="platform-admin-monitoring-jobs-table">
                <thead>
                  <tr>
                    <th scope="col">Alert</th>
                    <th scope="col">Job</th>
                    <th scope="col">Severity</th>
                    <th scope="col">First detected</th>
                    <th scope="col">Last detected</th>
                    <th scope="col">Email sent</th>
                    <th scope="col">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledJobAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="platform-admin-monitoring-job-small">
                        No active scheduled job alerts.
                      </td>
                    </tr>
                  ) : (
                    scheduledJobAlerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>
                          <span className={monitoringPillClass(alert.status || "WARN")}>
                            {alert.alertType || "ALERT"}
                          </span>
                        </td>
                        <td>
                          <div className="platform-admin-monitoring-job-name">
                            <strong>{alert.label || alert.jobName}</strong>
                            <span>{alert.jobName}</span>
                          </div>
                        </td>
                        <td>
                          <span className={monitoringPillClass(alert.severity === "CRITICAL" ? "CRITICAL" : "WARN")}>
                            {alert.severity || "WARNING"}
                          </span>
                        </td>
                        <td>{formatMonitoringTime(alert.firstDetectedAt)}</td>
                        <td>{formatMonitoringTime(alert.lastDetectedAt)}</td>
                        <td>{formatMonitoringTime(alert.lastEmailSentAt)}</td>
                        <td className="platform-admin-monitoring-job-small">{alert.message || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="platform-admin-section-card">
            <div className="platform-admin-section-title">
              <strong>Scheduled jobs</strong>
              <span>
                Confirms important background jobs are running, succeeding and
                not stuck. Missing recent success means the job has not completed
                inside its expected window.
              </span>
            </div>
            <div className="platform-admin-monitoring-jobs-wrap">
              <table className="platform-admin-monitoring-jobs-table">
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">Health</th>
                    <th scope="col">Active alert</th>
                    <th scope="col">Last success</th>
                    <th scope="col">Latest run</th>
                    <th scope="col">Duration</th>
                    <th scope="col">Processed</th>
                    <th scope="col">Failures 24h</th>
                    <th scope="col">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledJobs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="platform-admin-monitoring-job-small">
                        No scheduled job tracking rows are available yet. Wait
                        until the next scheduled executions run.
                      </td>
                    </tr>
                  ) : (
                    scheduledJobs.map((job) => (
                      <tr key={job.jobName}>
                        <td>
                          <div className="platform-admin-monitoring-job-name">
                            <strong>{job.label || job.jobName}</strong>
                            <span>{job.jobName}</span>
                          </div>
                        </td>
                        <td>
                          <div className="platform-admin-monitoring-job-summary">
                            <span className={monitoringPillClass(job.health)}>
                              {job.health || "UNKNOWN"}
                            </span>
                            <span>{job.summary || "—"}</span>
                            {job.detail ? <span>{job.detail}</span> : null}
                          </div>
                        </td>
                        <td>
                          {job.activeAlertType ? (
                            <div className="platform-admin-monitoring-job-summary">
                              <span className={monitoringPillClass(job.activeAlertSeverity === "CRITICAL" ? "CRITICAL" : "WARN")}>
                                {job.activeAlertType}
                              </span>
                              <span>{job.activeAlertSeverity || "WARNING"}</span>
                              <span>{formatMonitoringTime(job.activeAlertSince)}</span>
                              {job.activeAlertCount && job.activeAlertCount > 1 ? (
                                <span>{job.activeAlertCount} active alerts</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="platform-admin-monitoring-job-small">None</span>
                          )}
                        </td>
                        <td>{formatMonitoringTime(job.lastSuccess?.finishedAt)}</td>
                        <td>
                          <div className="platform-admin-monitoring-job-small">
                            {job.latestRun?.status || "—"}
                            <br />
                            {formatMonitoringTime(job.latestRun?.startedAt)}
                          </div>
                        </td>
                        <td>{formatDurationMs(job.latestRun?.durationMs)}</td>
                        <td>{job.latestRun?.recordsProcessed ?? "—"}</td>
                        <td>{job.failuresLast24h ?? 0}</td>
                        <td>
                          <div className="platform-admin-monitoring-job-small">
                            Success within {job.expectedSuccessWithin || "—"}
                            <br />
                            Stuck after {job.stuckAfter || "—"}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

type AdminWorkspaceTab =
  | "overview"
  | "tenants"
  | "monitoring"
  | "plans"
  | "fiscalization"
  | "ajpes"
  | "google"
  | "apple"
  | "zoom"
  | "payments"
  | "messaging"
  | "other"
  | "developer";

const ADMIN_TABS: Array<{ id: AdminWorkspaceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "tenants", label: "Tenants" },
  { id: "monitoring", label: "Monitoring" },
  { id: "plans", label: "Plan & add-ons" },
  { id: "fiscalization", label: "Fiscalization" },
  { id: "ajpes", label: "Ajpes" },
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  { id: "zoom", label: "Zoom" },
  { id: "payments", label: "Payment providers" },
  { id: "messaging", label: "Messaging providers" },
  { id: "other", label: "Other" },
  { id: "developer", label: "Developer tools" },
];


type TenantEmailSenderMode = "DEFAULT_CALENDRA" | "CUSTOM_DOMAIN";
type TenantEmailSenderVerificationStatus =
  | "NOT_VERIFIED"
  | "PENDING"
  | "FAILED"
  | "VERIFIED"
  | "SUCCESS";

type TenantEmailSenderAdminDto = {
  mode: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  domain: string;
  verificationStatus: string;
};

const EMAIL_SENDER_STATUS_OPTIONS: Array<{
  value: TenantEmailSenderVerificationStatus;
  label: string;
}> = [
  { value: "NOT_VERIFIED", label: "Not verified" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
  { value: "VERIFIED", label: "Verified" },
  { value: "SUCCESS", label: "Success / verified" },
];

function normalizePlatformEmailDomain(value: string | undefined | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function emailDomainFromPlatformAddress(value: string | undefined | null): string {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  return at >= 0 ? normalizePlatformEmailDomain(email.slice(at + 1)) : "";
}

function platformEmailBelongsToDomain(email: string, domain: string): boolean {
  const emailDomain = emailDomainFromPlatformAddress(email);
  const normalizedDomain = normalizePlatformEmailDomain(domain);
  return (
    !!emailDomain &&
    !!normalizedDomain &&
    (emailDomain === normalizedDomain || emailDomain.endsWith(`.${normalizedDomain}`))
  );
}

function normalizePlatformEmailSenderDto(
  value: Partial<TenantEmailSenderAdminDto> | null | undefined,
): TenantEmailSenderAdminDto {
  const fromEmail = String(value?.fromEmail || "").trim().toLowerCase();
  const fallbackDomain = emailDomainFromPlatformAddress(fromEmail);
  const domain = normalizePlatformEmailDomain(value?.domain || fallbackDomain);
  const status = String(value?.verificationStatus || "NOT_VERIFIED")
    .trim()
    .toUpperCase();
  return {
    mode: value?.mode === "CUSTOM_DOMAIN" ? "CUSTOM_DOMAIN" : "DEFAULT_CALENDRA",
    fromName: String(value?.fromName || "").replace(/[\r\n]+/g, " ").trim(),
    fromEmail,
    replyToEmail: String(value?.replyToEmail || fromEmail).trim().toLowerCase(),
    domain,
    verificationStatus: EMAIL_SENDER_STATUS_OPTIONS.some(
      (option) => option.value === status,
    )
      ? status
      : "NOT_VERIFIED",
  };
}

function emailSenderStatusPillClass(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === "VERIFIED" || normalized === "SUCCESS") {
    return "platform-admin-pill platform-admin-success";
  }
  if (normalized === "FAILED") return "platform-admin-pill platform-admin-danger";
  if (normalized === "PENDING") return "platform-admin-pill platform-admin-warning";
  return "platform-admin-pill";
}

function emailSenderCustomReady(config: TenantEmailSenderAdminDto | null): boolean {
  if (!config) return false;
  const status = config.verificationStatus.trim().toUpperCase();
  return (
    (status === "VERIFIED" || status === "SUCCESS") &&
    platformEmailBelongsToDomain(config.fromEmail, config.domain)
  );
}

function AdminComingSoon({ title }: { title: string }) {
  return (
    <div className="platform-admin-admin-placeholder platform-admin-panel platform-admin-panel-pad">
      <div className="platform-admin-eyebrow">Coming soon</div>
      <h2 style={{ margin: 0, fontSize: "1.45rem", letterSpacing: "-0.04em" }}>
        {title}
      </h2>
      <p style={{ margin: 0, fontWeight: 700 }}>
        This area is reserved for platform-wide configuration. Use Tenant
        management for live tenancy data today.
      </p>
    </div>
  );
}

export function PlatformAdminPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<TenancyDetails | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [hits, setHits] = useState<TenancySearchHit[]>([]);
  const [selected, setSelected] = useState<TenancyDetails | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("overview");
  const [workspace, setWorkspace] = useState<AdminWorkspaceTab>("overview");
  /** Which admin modal is open; price override UI is only mounted when this is "price". */
  const [activeModalKind, setActiveModalKind] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntryDto[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditErr, setAuditErr] = useState<string | null>(null);
  const [manualTenantOpen, setManualTenantOpen] = useState(false);
  const [manualTenantMode, setManualTenantMode] = useState<"create" | "edit">("create");
  const [manualTenantOptions, setManualTenantOptions] = useState<ManualTenantOptions | null>(null);
  const [manualTenantForm, setManualTenantForm] = useState<ManualTenantFormState>(() =>
    defaultManualTenantForm(),
  );
  const [manualTenantSaving, setManualTenantSaving] = useState(false);
  const [manualTenantErr, setManualTenantErr] = useState<string | null>(null);
  const [manualTenantResult, setManualTenantResult] = useState<string | null>(null);
  const [emailSender, setEmailSender] = useState<TenantEmailSenderAdminDto | null>(null);
  const [emailSenderDraft, setEmailSenderDraft] = useState<TenantEmailSenderAdminDto | null>(null);
  const [emailSenderLoading, setEmailSenderLoading] = useState(false);
  const [emailSenderSaving, setEmailSenderSaving] = useState(false);
  const [emailSenderErr, setEmailSenderErr] = useState<string | null>(null);
  const [emailSenderOk, setEmailSenderOk] = useState<string | null>(null);

  selectedRef.current = selected;

  const reloadAuditForCurrentSelection = useCallback(async () => {
    const id = selectedRef.current?.id;
    if (!id) return;
    try {
      const { data } = await api.get<AuditLogEntryDto[]>(
        `/platform-admin/tenancies/${id}/audit-log`,
      );
      if (selectedRef.current?.id !== id) return;
      setAuditLog(Array.isArray(data) ? data : []);
      setAuditErr(null);
    } catch {
      if (selectedRef.current?.id !== id) return;
      setAuditErr("Could not load audit log.");
      setAuditLog([]);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    clearAuthStoragePreservingTheme();
    window.location.replace("/login");
  }, []);

  const loadTenanciesList = useCallback(async () => {
    setSearchErr(null);
    setListLoading(true);
    setHits([]);
    try {
      const { data } = await api.get<TenancyRow[]>("/platform-admin/tenancies");
      const rows = Array.isArray(data) ? data : [];
      setHits(rows.map(tenancyRowToSearchHit));
      if (!rows.length) {
        setSearchErr("No tenancies found in this environment.");
      }
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        setSearchErr("You need a super-admin session to list tenants.");
      } else {
        setSearchErr("Could not load the tenant list.");
      }
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenanciesList();
  }, [loadTenanciesList]);

  const visibleHits = useMemo(() => {
    const n = searchInput.trim().toLowerCase();
    if (!n) return hits;
    return hits.filter(
      (h) =>
        h.companyName.toLowerCase().includes(n) ||
        h.tenantCode.toLowerCase().includes(n) ||
        (h.contactEmail && h.contactEmail.toLowerCase().includes(n)),
    );
  }, [hits, searchInput]);

  const loadDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setSearchErr(null);
    try {
      const { data } = await api.get<TenancyDetails>(
        `/platform-admin/tenancies/${id}`,
      );
      setSelected(data);
    } catch {
      setSearchErr("Could not load tenant details.");
      setSelected(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!selected?.id) {
      setAuditLog([]);
      setAuditErr(null);
      setAuditLoading(false);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      setAuditLoading(true);
      setAuditErr(null);
      try {
        const { data } = await api.get<AuditLogEntryDto[]>(
          `/platform-admin/tenancies/${selected.id}/audit-log`,
        );
        if (!cancelled) setAuditLog(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) {
          setAuditErr("Could not load audit log.");
          setAuditLog([]);
        }
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.id) {
      setEmailSender(null);
      setEmailSenderDraft(null);
      setEmailSenderLoading(false);
      setEmailSenderSaving(false);
      setEmailSenderErr(null);
      setEmailSenderOk(null);
      return undefined;
    }
    let cancelled = false;
    const tenantId = selected.id;
    setEmailSender(null);
    setEmailSenderDraft(null);
    setEmailSenderErr(null);
    setEmailSenderOk(null);
    void (async () => {
      setEmailSenderLoading(true);
      try {
        const { data } = await api.get<TenantEmailSenderAdminDto>(
          `/platform-admin/tenancies/${tenantId}/email-sender`,
        );
        if (cancelled) return;
        const normalized = normalizePlatformEmailSenderDto(data);
        setEmailSender(normalized);
        setEmailSenderDraft(normalized);
      } catch {
        if (!cancelled) {
          setEmailSenderErr("Could not load tenant email sender settings.");
          setEmailSender(null);
          setEmailSenderDraft(null);
        }
      } finally {
        if (!cancelled) setEmailSenderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const onPickHit = useCallback(
    (h: TenancySearchHit) => {
      void loadDetail(h.id);
    },
    [loadDetail],
  );

  const openModal = useCallback(
    async (kind: string) => {
      const root = rootRef.current;
      const modal = root?.querySelector<HTMLElement>("#modalBackdrop");
      const modalTitle = root?.querySelector<HTMLElement>("#modalTitle");
      const modalCopy = root?.querySelector<HTMLElement>("#modalCopy");
      const actionSelect =
        root?.querySelector<HTMLSelectElement>("#actionSelect");
      const reasonText =
        root?.querySelector<HTMLTextAreaElement>("#reasonText");
      const cfg = modalContent[kind] || modalContent.plan;
      flushSync(() => {
        setActiveModalKind(kind);
      });
      if (modalTitle) modalTitle.textContent = cfg[0];
      if (modalCopy) modalCopy.textContent = cfg[1];
      if (actionSelect) {
        if (kind === "plan" && selected) {
          const opts = buildPlanChangeActionOptions(selected);
          actionSelect.innerHTML = opts
            .map((value) => `<option>${escapeHtml(value)}</option>`)
            .join("");
        } else {
          const list = cfg[2].length ? cfg[2] : ["Confirm"];
          actionSelect.innerHTML = list
            .map((value) => `<option>${escapeHtml(value)}</option>`)
            .join("");
        }
      }
      if (reasonText) reasonText.value = "";
      if (modal) modal.dataset.modalKind = kind;
      if (kind === "price" && selected && root) {
        let catalog = mergeRegisterCatalog(undefined);
        try {
          const { data } = await api.get<RegisterPriceCatalogDto>(
            "/platform-admin/register-prices",
          );
          catalog = mergeRegisterCatalog(data);
        } catch {
          // use merged defaults
        }
        const backdrop = root.querySelector<HTMLElement>("#modalBackdrop");
        if (backdrop?.dataset.modalKind === "price" && selected) {
          applyPriceModalDOM(root, selected, catalog);
        }
      }
      if (kind === "plan" && selected && root) {
        updatePlanChangePanels(root, selected);
      }
      modal?.classList.add("platform-admin-visible");
      modal?.setAttribute("aria-hidden", "false");
    },
    [selected],
  );

  const closeModal = useCallback(() => {
    const root = rootRef.current;
    const modal = root?.querySelector<HTMLElement>("#modalBackdrop");
    modal?.classList.remove("platform-admin-visible");
    modal?.setAttribute("aria-hidden", "true");
    if (modal) modal.dataset.modalKind = "";
    flushSync(() => {
      setActiveModalKind(null);
    });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest("[data-admin-logout]")) {
        void logout();
        return;
      }
      if (target.closest("[data-admin-export]")) {
        window.alert("Export is not wired yet for the live tenant list.");
        return;
      }
      const navButton = target.closest<HTMLElement>(".platform-admin-tenant-card .platform-admin-nav-item");
      if (navButton?.dataset.target) {
        setActiveNav(navButton.dataset.target);
        root
          .querySelectorAll(".platform-admin-tenant-card .platform-admin-nav-item")
          .forEach((item) => item.classList.remove("platform-admin-active"));
        navButton.classList.add("platform-admin-active");
        const section = root.querySelector<HTMLElement>(
          `#${navButton.dataset.target}`,
        );
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const modalButton = target.closest<HTMLElement>("[data-open-modal]");
      if (modalButton?.dataset.openModal) {
        void openModal(modalButton.dataset.openModal);
        return;
      }
      if (target.closest("#closeModal")) {
        closeModal();
        return;
      }
      if (target.closest("#confirmModal")) {
        void (async () => {
          const modalBackdrop =
            root.querySelector<HTMLElement>("#modalBackdrop");
          const kind = modalBackdrop?.dataset.modalKind ?? "";
          const tenantId = selectedRef.current?.id;
          if (!tenantId) {
            closeModal();
            return;
          }
          const reason =
            root
              .querySelector<HTMLTextAreaElement>("#reasonText")
              ?.value.trim() ?? "";
          if (kind === "delete") {
            if (!reason) {
              window.alert("A reason is required before deleting a tenant.");
              return;
            }
            try {
              await api.delete(`/platform-admin/tenancies/${tenantId}`, {
                data: { reason },
              });
              setSelected(null);
              await loadTenanciesList();
              closeModal();
            } catch (e) {
              if (axios.isAxiosError(e) && e.response?.status === 409) {
                const msg =
                  typeof e.response.data === "string"
                    ? e.response.data
                    : (e.response.data as { message?: string })?.message;
                window.alert(msg || "This tenant cannot be deleted.");
              } else {
                window.alert("Could not delete this tenant. Please try again.");
              }
            }
            return;
          }
          const payload = buildPlatformAdminAuditPayload(kind, root);
          if (!payload) {
            window.alert(
              "This action is not recorded in the platform audit log yet.",
            );
            closeModal();
            return;
          }
          try {
            await api.post(
              `/platform-admin/tenancies/${tenantId}/audit-log`,
              payload,
            );
            await reloadAuditForCurrentSelection();
            closeModal();
          } catch {
            window.alert(
              "Could not save this action to the audit log. Please try again.",
            );
          }
        })();
        return;
      }
      const modal = root.querySelector("#modalBackdrop");
      if (modal && event.target === modal) {
        closeModal();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };

    const onModalFieldChange = (event: Event) => {
      const id = (event.target as HTMLElement | null)?.id;
      if (id === "actionSelect" || id === "priceDiscountIncludeAddons") {
        updatePriceOverridePanels(root);
        if (selectedRef.current)
          updatePlanChangePanels(root, selectedRef.current);
      }
    };
    const onModalFieldInput = (event: Event) => {
      const id = (event.target as HTMLElement | null)?.id;
      if (id === "priceDiscountPercent" || id === "priceCustomInput")
        updatePriceOverridePanels(root);
    };

    root.addEventListener("click", handleClick);
    root.addEventListener("change", onModalFieldChange);
    root.addEventListener("input", onModalFieldInput);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      root.removeEventListener("click", handleClick);
      root.removeEventListener("change", onModalFieldChange);
      root.removeEventListener("input", onModalFieldInput);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    logout,
    openModal,
    closeModal,
    reloadAuditForCurrentSelection,
    loadTenanciesList,
  ]);

  const workspaceHint = useMemo(() => {
    if (!selected?.tenantCode) return "—";
    return `${selected.tenantCode}.calendra.si`;
  }, [selected]);

  const kpiUsers = selected
    ? `${selected.usersCreated}${selected.usersPaidTotal != null ? ` / ${selected.usersPaidTotal}` : ""} seats`
    : "—";
  const kpiSms = selected
    ? `${selected.smsSent}${selected.smsQuota != null ? ` / ${selected.smsQuota}` : ""} SMS`
    : "—";
  const planHistory = useMemo(
    () =>
      auditLog
        .map(parsePlanHistoryRow)
        .filter((row): row is PlanHistoryRow => !!row),
    [auditLog],
  );

  const customEmailSenderReady = emailSenderCustomReady(emailSenderDraft);

  const updateEmailSenderDraft = useCallback(
    (patch: Partial<TenantEmailSenderAdminDto>) => {
      setEmailSenderDraft((current) =>
        normalizePlatformEmailSenderDto({ ...(current || {}), ...patch }),
      );
      setEmailSenderErr(null);
      setEmailSenderOk(null);
    },
    [],
  );

  const saveEmailSender = useCallback(async () => {
    if (!selected?.id || !emailSenderDraft) return;
    const normalized = normalizePlatformEmailSenderDto(emailSenderDraft);
    const wantsCustom = normalized.mode === "CUSTOM_DOMAIN";
    if (wantsCustom && !normalized.domain) {
      setEmailSenderErr("Enter the verified custom domain before enabling it.");
      return;
    }
    if (wantsCustom && !platformEmailBelongsToDomain(normalized.fromEmail, normalized.domain)) {
      setEmailSenderErr(
        "Tenant From email must belong to the custom domain before CUSTOM_DOMAIN can be enabled.",
      );
      return;
    }
    const status = normalized.verificationStatus.trim().toUpperCase();
    if (wantsCustom && status !== "VERIFIED" && status !== "SUCCESS") {
      setEmailSenderErr(
        "Set verification status to VERIFIED before enabling custom-domain sending.",
      );
      return;
    }
    setEmailSenderSaving(true);
    setEmailSenderErr(null);
    setEmailSenderOk(null);
    try {
      const { data } = await api.put<TenantEmailSenderAdminDto>(
        `/platform-admin/tenancies/${selected.id}/email-sender`,
        normalized,
      );
      const saved = normalizePlatformEmailSenderDto(data);
      setEmailSender(saved);
      setEmailSenderDraft(saved);
      setEmailSenderOk("Email sender domain settings saved.");
      await reloadAuditForCurrentSelection();
    } catch (e) {
      let message = "Could not save email sender settings.";
      if (axios.isAxiosError(e)) {
        const data = e.response?.data as { message?: string; error?: string } | string | undefined;
        if (typeof data === "string" && data.trim()) message = data;
        else if (data && typeof data !== "string" && data.message) message = data.message;
        else if (data && typeof data !== "string" && data.error) message = data.error;
      }
      setEmailSenderErr(message);
    } finally {
      setEmailSenderSaving(false);
    }
  }, [emailSenderDraft, reloadAuditForCurrentSelection, selected?.id]);

  const loadManualTenantOptions = useCallback(async () => {
    if (manualTenantOptions) return manualTenantOptions;
    const { data } = await api.get<ManualTenantOptions>(
      "/platform-admin/tenancies/manual-options",
    );
    const normalized = {
      features: Array.isArray(data.features) ? data.features : [],
      addOns: Array.isArray(data.addOns) ? data.addOns : [],
      companyTypes: Array.isArray(data.companyTypes) ? data.companyTypes : [],
    };
    setManualTenantOptions(normalized);
    return normalized;
  }, [manualTenantOptions]);

  const openManualTenantCreate = useCallback(() => {
    setManualTenantMode("create");
    setManualTenantForm(defaultManualTenantForm());
    setManualTenantErr(null);
    setManualTenantResult(null);
    setManualTenantOpen(true);
    void loadManualTenantOptions().catch(() => {
      setManualTenantErr("Could not load manual tenant options.");
    });
  }, [loadManualTenantOptions]);

  const openManualTenantEdit = useCallback(() => {
    if (!selected) return;
    setManualTenantMode("edit");
    setManualTenantForm(formFromTenancyDetails(selected));
    setManualTenantErr(null);
    setManualTenantResult(null);
    setManualTenantOpen(true);
    void loadManualTenantOptions().catch(() => {
      setManualTenantErr("Could not load manual tenant options.");
    });
  }, [loadManualTenantOptions, selected]);

  const updateManualTenantField = useCallback(
    (key: keyof ManualTenantFormState, value: string) => {
      setManualTenantForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const toggleManualFeature = useCallback((key: string, checked: boolean) => {
    setManualTenantForm((current) => {
      const existing = new Set(current.enabledFeatureKeys);
      if (checked) existing.add(key);
      else existing.delete(key);
      return { ...current, enabledFeatureKeys: Array.from(existing) };
    });
  }, []);

  const toggleManualAddon = useCallback(
    (option: ManualTenantAddOnOption, checked: boolean) => {
      setManualTenantForm((current) => {
        const existing = current.addOns.filter((row) => row.key !== option.key);
        if (!checked) return { ...current, addOns: existing };
        const monthly = String(option.monthlyPrice ?? "0.00");
        const yearly = String((toNumberOrZero(monthly) * 12).toFixed(2));
        return {
          ...current,
          addOns: [
            ...existing,
            { key: option.key, monthlyPrice: monthly, yearlyPrice: yearly, charged: true },
          ],
        };
      });
    },
    [],
  );

  const updateManualAddonField = useCallback(
    (key: string, field: keyof ManualTenantAddOnFormRow, value: string | boolean) => {
      setManualTenantForm((current) => ({
        ...current,
        addOns: current.addOns.map((row) =>
          row.key === key ? { ...row, [field]: value } : row,
        ),
      }));
    },
    [],
  );

  const manualTenantPayload = useCallback(() => {
    const isCustomPackage = manualTenantForm.packageName === "CUSTOM";
    const customPackageName = manualTenantForm.customPackageName.trim() || "Custom";
    return {
      ...manualTenantForm,
      customPackageName: isCustomPackage ? customPackageName : manualTenantForm.customPackageName,
      userCount: toPositiveInt(manualTenantForm.userCount, 1),
      smsCount: Math.max(0, toPositiveInt(manualTenantForm.smsCount, 0)),
      customMonthlyPrice: toNumberOrZero(manualTenantForm.customMonthlyPrice),
      customYearlyPrice: toNumberOrZero(manualTenantForm.customYearlyPrice),
      addOns: manualTenantForm.addOns.map((row) => ({
        key: row.key,
        monthlyPrice: toNumberOrZero(row.monthlyPrice),
        yearlyPrice: toNumberOrZero(row.yearlyPrice),
        charged: row.charged,
      })),
    };
  }, [manualTenantForm]);

  const submitManualTenant = useCallback(async () => {
    setManualTenantSaving(true);
    setManualTenantErr(null);
    setManualTenantResult(null);
    try {
      const payload = manualTenantPayload();
      if (manualTenantMode === "create") {
        const { data } = await api.post<ManualTenantResponse>(
          "/platform-admin/tenancies/manual",
          payload,
        );
        setManualTenantResult(
          `Tenant ${data.companyName || data.tenantCode} was created. ${data.checkoutUrl ? `Stripe payment link: ${data.checkoutUrl}` : data.billNumber ? `Invoice ${data.billNumber} was emailed.` : "Payment email was sent."}`,
        );
        await loadTenanciesList();
        if (data.tenantId) await loadDetail(data.tenantId);
      } else if (selected) {
        const { data } = await api.put<ManualTenantResponse>(
          `/platform-admin/tenancies/${selected.id}/manual-subscription`,
          payload,
        );
        setManualTenantResult(
          `Tenant ${data.companyName || data.tenantCode} subscription was updated.`,
        );
        await loadTenanciesList();
        await loadDetail(selected.id);
        await reloadAuditForCurrentSelection();
      }
    } catch (e) {
      if (axios.isAxiosError(e)) {
        setManualTenantErr(
          String(e.response?.data?.message || e.response?.data?.error || e.message),
        );
      } else {
        setManualTenantErr("Could not save manual tenant.");
      }
    } finally {
      setManualTenantSaving(false);
    }
  }, [
    loadDetail,
    loadTenanciesList,
    manualTenantMode,
    manualTenantPayload,
    reloadAuditForCurrentSelection,
    selected,
  ]);

  const resendSubscriptionPayment = useCallback(async () => {
    if (!selected) return;
    setManualTenantErr(null);
    setManualTenantResult(null);
    try {
      const { data } = await api.post<ManualTenantResponse>(
        `/platform-admin/tenancies/${selected.id}/resend-subscription-payment`,
      );
      setManualTenantResult(
        data.checkoutUrl
          ? `Payment link resent: ${data.checkoutUrl}`
          : data.billNumber
            ? `Invoice ${data.billNumber} resent.`
            : "Payment email resent.",
      );
      await reloadAuditForCurrentSelection();
    } catch (e) {
      if (axios.isAxiosError(e)) {
        setManualTenantErr(
          String(e.response?.data?.message || e.response?.data?.error || e.message),
        );
      } else {
        setManualTenantErr("Could not resend the subscription payment email.");
      }
    }
  }, [reloadAuditForCurrentSelection, selected]);

  const manualSelectedAddonKeys = useMemo(
    () => new Set(manualTenantForm.addOns.map((row) => row.key)),
    [manualTenantForm.addOns],
  );

  return (
    <>
      <div ref={rootRef} className="platform-admin-page">
        <header className="platform-admin-page-head platform-admin-head">
          <div className="platform-admin-page-title">
            <div className="platform-admin-eyebrow">Platform Admin</div>
            <h1>Calendra Admin</h1>
            <p>
              Manage tenants, billing, integrations, monitoring and production
              operations from the normal Calendra app shell.
            </p>
          </div>
          <div className="platform-admin-top-actions">
            <span className="platform-admin-pill platform-admin-success">Live data</span>
            <span className="platform-admin-pill platform-admin-primary">Admin view</span>
            <button
              className="platform-admin-button platform-admin-secondary platform-admin-small"
              type="button"
              data-admin-export
            >
              Export
            </button>
          </div>
        </header>

        <nav className="platform-admin-tabs" aria-label="Platform admin sections">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`platform-admin-tab${workspace === tab.id ? " platform-admin-active" : ""}`}
              onClick={() => setWorkspace(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="platform-admin-admin-main">
                {workspace === "overview" ? (
                  <PlatformOverviewPanel onNavigate={setWorkspace} />
                ) : workspace === "tenants" ? (
                  <>
                    <div className="platform-admin-page-head platform-admin-head">
                      <div className="platform-admin-page-title">
                        <div className="platform-admin-eyebrow">Management overview</div>
                        <h1>Tenant management</h1>
                        <p>
                          All workspaces load automatically. Use the field below
                          to narrow the list by name or tenant code, then pick a
                          card to load subscription and signup status on the
                          left.
                        </p>
                      </div>
                      <div className="platform-admin-search-wrap platform-admin-tenant-list-wrap">
                        <div className="platform-admin-search-row">
                          <input
                            className="platform-admin-search-input"
                            type="search"
                            placeholder="Filter tenants by name or code…"
                            value={searchInput}
                            disabled={listLoading}
                            onChange={(e) => setSearchInput(e.target.value)}
                            aria-label="Filter tenant list"
                          />
                          <button
                            className="platform-admin-button platform-admin-primary"
                            type="button"
                            onClick={openManualTenantCreate}
                          >
                            + Manual tenant
                          </button>
                        </div>
                        {!listLoading && hits.length > 0 ? (
                          <p
                            className="platform-admin-muted"
                            style={{
                              margin: 0,
                              fontSize: "0.88rem",
                              fontWeight: 700,
                            }}
                          >
                            Showing {visibleHits.length} of {hits.length} tenant
                            {hits.length === 1 ? "" : "s"}.
                          </p>
                        ) : null}
                        {listLoading ? (
                          <p className="platform-admin-muted">Loading tenants…</p>
                        ) : null}
                        {searchErr ? (
                          <p className="platform-admin-search-err">{searchErr}</p>
                        ) : null}
                        {!listLoading &&
                        hits.length > 0 &&
                        visibleHits.length === 0 ? (
                          <p className="platform-admin-muted">No tenants match this filter.</p>
                        ) : null}
                        {!listLoading && visibleHits.length > 0 ? (
                          <ul className="platform-admin-search-hits" aria-label="Tenant list">
                            {visibleHits.map((h) => (
                              <li key={h.id}>
                                <button
                                  type="button"
                                  className="platform-admin-search-hit"
                                  onClick={() => onPickHit(h)}
                                >
                                  <strong>{h.companyName}</strong>
                                  <div className="platform-admin-sub">
                                    {isPlaceholderHit(h)
                                      ? h.tenantCode || "—"
                                      : `${h.tenantCode} · ${h.contactEmail || "—"} · ${formatPlan(h.packageType)} · ${formatInterval(h.subscriptionInterval)}`}
                                  </div>
                                  <div className="platform-admin-sub">
                                    {h.signupCompletionSummary}
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>

                    {manualTenantErr && !manualTenantOpen ? (
                      <div className="platform-admin-manual-error" style={{ marginBottom: 16 }}>
                        {manualTenantErr}
                      </div>
                    ) : null}
                    {manualTenantResult && !manualTenantOpen ? (
                      <div className="platform-admin-manual-result" style={{ marginBottom: 16 }}>
                        {manualTenantResult}
                      </div>
                    ) : null}

                    <section className="platform-admin-hero">
                      <aside className="platform-admin-panel platform-admin-panel-pad platform-admin-tenant-card">
                        {loadingDetail ? (
                          <p className="platform-admin-muted">Loading tenant…</p>
                        ) : null}
                        {!loadingDetail && !selected ? (
                          <p className="platform-admin-muted">
                            Select a tenant from the list to see plan, billing
                            interval, and signup status.
                          </p>
                        ) : null}
                        {!loadingDetail && selected ? (
                          <>
                            <div className="platform-admin-tenant-head">
                              <div className="platform-admin-tenant-avatar">
                                {initials(selected.companyName)}
                              </div>
                              <div className="platform-admin-tenant-title">
                                <h2>{selected.companyName || "—"}</h2>
                                <span>
                                  {selected.tenantCode || "—"} · {workspaceHint}
                                </span>
                              </div>
                              <div className="platform-admin-top-actions">
                                <span className="platform-admin-pill platform-admin-success">Active</span>
                                {selected.packageType?.toUpperCase() ===
                                "TRIAL" ? (
                                  <span className="platform-admin-pill platform-admin-purple">Trialing</span>
                                ) : null}
                                {selected.ownerPasswordSetupPending ? (
                                  <span className="platform-admin-pill platform-admin-warning">
                                    Password pending
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="platform-admin-status-grid">
                              <div className="platform-admin-stat">
                                <strong>Plan</strong>
                                <span>{formatPlan(selected.packageType)}</span>
                              </div>
                              <div className="platform-admin-stat">
                                <strong>Billing</strong>
                                <span>
                                  {formatInterval(
                                    selected.subscriptionInterval,
                                  )}
                                </span>
                              </div>
                              <div className="platform-admin-stat">
                                <strong>Due (sub)</strong>
                                <span>€{selected.dueAmount}</span>
                              </div>
                              <div className="platform-admin-stat">
                                <strong>Renewal</strong>
                                <span>
                                  {selected.subscriptionEnd?.trim() || "—"}
                                </span>
                              </div>
                            </div>

                            <div>
                              <div
                                className="platform-admin-field-top"
                                style={{ marginBottom: 8 }}
                              >
                                <strong>Signup status</strong>
                                <span className="platform-admin-muted">
                                  {selected.signupCompletionSummary}
                                </span>
                              </div>
                              <div className="platform-admin-progress">
                                <div
                                  style={{
                                    width: `${progressWidth(selected)}%`,
                                  }}
                                />
                              </div>
                            </div>

                            <nav
                              className="platform-admin-nav-list"
                              aria-label="Admin sections"
                            >
                              <button
                                type="button"
                                className={`platform-admin-nav-item${activeNav === "overview" ? " platform-admin-active" : ""}`}
                                data-target="overview"
                              >
                                Overview <span>›</span>
                              </button>
                              <button
                                type="button"
                                className={`platform-admin-nav-item${activeNav === "subscription" ? " platform-admin-active" : ""}`}
                                data-target="subscription"
                              >
                                Subscription & add-ons <span>›</span>
                              </button>
                              <button
                                type="button"
                                className={`platform-admin-nav-item${activeNav === "billing" ? " platform-admin-active" : ""}`}
                                data-target="billing"
                              >
                                Billing & payments <span>›</span>
                              </button>
                              <button
                                type="button"
                                className={`platform-admin-nav-item${activeNav === "email-sender" ? " platform-admin-active" : ""}`}
                                data-target="email-sender"
                              >
                                Email sender <span>›</span>
                              </button>
                              <button
                                type="button"
                                className={`platform-admin-nav-item${activeNav === "audit" ? " platform-admin-active" : ""}`}
                                data-target="audit"
                              >
                                Audit log <span>›</span>
                              </button>
                              <button
                                type="button"
                                className={`platform-admin-nav-item${activeNav === "plan-history" ? " platform-admin-active" : ""}`}
                                data-target="plan-history"
                              >
                                Plan history <span>›</span>
                              </button>
                            </nav>

                            <div className="platform-admin-top-actions">
                              <button
                                className="platform-admin-button platform-admin-primary platform-admin-small"
                                type="button"
                                data-open-modal="plan"
                              >
                                Change plan
                              </button>
                              <button
                                className="platform-admin-button platform-admin-secondary platform-admin-small"
                                type="button"
                                data-open-modal="price"
                              >
                                Price override
                              </button>
                              <button
                                className="platform-admin-button platform-admin-danger platform-admin-small"
                                type="button"
                                data-open-modal="suspend"
                              >
                                Suspend
                              </button>
                              <button
                                className="platform-admin-button platform-admin-danger platform-admin-small"
                                type="button"
                                data-open-modal="delete"
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        ) : null}
                      </aside>

                      <section className="platform-admin-main-grid">
                        <div className="platform-admin-kpi-row">
                          <div className="platform-admin-kpi">
                            <span>Subscription end</span>
                            <strong>
                              {selected?.subscriptionEnd?.trim() || "—"}
                            </strong>
                            <small>From billing settings on the tenant.</small>
                          </div>
                          <div className="platform-admin-kpi">
                            <span>Due amount</span>
                            <strong>
                              {selected ? `€${selected.dueAmount}` : "—"}
                            </strong>
                            <small>
                              Outstanding subscription balance string.
                            </small>
                          </div>
                          <div className="platform-admin-kpi">
                            <span>SMS usage</span>
                            <strong>{kpiSms}</strong>
                            <small>Sent vs configured signup SMS quota.</small>
                          </div>
                          <div className="platform-admin-kpi">
                            <span>Users</span>
                            <strong>{kpiUsers}</strong>
                            <small>
                              Existing users vs paid seat count from signup.
                            </small>
                          </div>
                        </div>

                        {!selected ? (
                          <div className="platform-admin-empty-hint">
                            Select a tenant from the search results to populate
                            the overview.
                          </div>
                        ) : (
                          <>
                            <section className="platform-admin-section-card" id="overview">
                              <div className="platform-admin-section-head">
                                <div className="platform-admin-section-title">
                                  <strong>
                                    Tenant basics and owner access
                                  </strong>
                                  <span>
                                    Values loaded from the Calendra database for
                                    this tenancy.
                                  </span>
                                </div>
                              </div>
                              <div className="platform-admin-field-grid">
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Tenant / company name</strong>
                                    <span>{selected.companyName}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Tenant code</strong>
                                    <span>{selected.tenantCode || "—"}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Owner name</strong>
                                    <span>{selected.contactName || "—"}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Owner email</strong>
                                    <span>{selected.contactEmail || "—"}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>VAT ID</strong>
                                    <span>{selected.vatId?.trim() || "—"}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Address</strong>
                                    <span>
                                      {selected.companyAddress?.trim() || "—"}
                                    </span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Postal code</strong>
                                    <span>
                                      {selected.companyPostalCode?.trim() ||
                                        "—"}
                                    </span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>City</strong>
                                    <span>
                                      {selected.companyCity?.trim() || "—"}
                                    </span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>
                                      Stripe customer (recent bill)
                                    </strong>
                                    <span>
                                      {selected.stripeCustomerIdPreview?.trim() ||
                                        "—"}
                                    </span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Signup status</strong>
                                    <span>
                                      {selected.signupCompletionSummary}
                                    </span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Created</strong>
                                    <span>{selected.createdAt || "—"}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Phone</strong>
                                    <span>
                                      {selected.contactPhone?.trim() || "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </section>

                            <section className="platform-admin-section-card" id="subscription">
                              <div className="platform-admin-section-head">
                                <div className="platform-admin-section-title">
                                  <strong>Subscription</strong>
                                  <span>
                                    Plan and billing interval from tenant
                                    settings.
                                  </span>
                                </div>
                                <div className="platform-admin-top-actions">
                                  <button
                                    className="platform-admin-button platform-admin-secondary platform-admin-small"
                                    type="button"
                                    onClick={openManualTenantEdit}
                                  >
                                    Edit subscription
                                  </button>
                                </div>
                              </div>
                              <div className="platform-admin-field-grid">
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Plan</strong>
                                    <span>
                                      {formatPlan(selected.packageType)}
                                    </span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Billing cycle</strong>
                                    <span>
                                      {formatInterval(
                                        selected.subscriptionInterval,
                                      )}
                                    </span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Period</strong>
                                    <span>
                                      {selected.subscriptionStart || "—"} →{" "}
                                      {selected.subscriptionEnd || "—"}
                                    </span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Access status</strong>
                                    <span>{selected.accessStatus || "ACTIVE"}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Billing status</strong>
                                    <span>{selected.billingStatus || "PENDING_PAYMENT"}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Payment method</strong>
                                    <span>{selected.paymentMethod || "—"}</span>
                                  </div>
                                </div>
                                {selected.packageType?.toUpperCase() === "CUSTOM" ? (
                                  <div className="platform-admin-field-card">
                                    <div className="platform-admin-field-label">
                                      <strong>Custom package</strong>
                                      <span>
                                        {selected.customPackageName || "Custom"} · €
                                        {selected.customMonthlyPrice || "0.00"}/mo · €
                                        {selected.customYearlyPrice || "0.00"}/yr
                                      </span>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </section>

                            <section className="platform-admin-section-card" id="billing">
                              <div className="platform-admin-section-head">
                                <div className="platform-admin-section-title">
                                  <strong>Billing snapshot</strong>
                                  <span>
                                    Due balance and renewal from billing
                                    settings.
                                  </span>
                                </div>
                                <div className="platform-admin-top-actions">
                                  <button
                                    className="platform-admin-button platform-admin-secondary platform-admin-small"
                                    type="button"
                                    onClick={resendSubscriptionPayment}
                                  >
                                    Resend invoice/payment link
                                  </button>
                                </div>
                              </div>
                              <div className="platform-admin-field-grid">
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>Due amount</strong>
                                    <span>€{selected.dueAmount}</span>
                                  </div>
                                </div>
                                <div className="platform-admin-field-card">
                                  <div className="platform-admin-field-label">
                                    <strong>VAT on file</strong>
                                    <span>{selected.vatId?.trim() || "—"}</span>
                                  </div>
                                </div>
                              </div>
                            </section>

                            <section className="platform-admin-section-card" id="email-sender">
                              <div className="platform-admin-section-head">
                                <div className="platform-admin-section-title">
                                  <strong>Custom email domain</strong>
                                  <span>
                                    Platform Admin verifies the sending domain.
                                    Sender name, from email and reply-to stay
                                    controlled by the tenant under Notifications.
                                  </span>
                                </div>
                                {emailSenderDraft ? (
                                  <span
                                    className={emailSenderStatusPillClass(
                                      emailSenderDraft.verificationStatus,
                                    )}
                                  >
                                    {emailSenderDraft.verificationStatus || "NOT_VERIFIED"}
                                  </span>
                                ) : null}
                              </div>

                              {emailSenderLoading ? (
                                <p className="platform-admin-muted">Loading email sender settings…</p>
                              ) : null}
                              {emailSenderErr ? (
                                <div className="platform-admin-manual-error">{emailSenderErr}</div>
                              ) : null}
                              {emailSenderOk ? (
                                <div className="platform-admin-manual-result">{emailSenderOk}</div>
                              ) : null}

                              {!emailSenderLoading && emailSenderDraft ? (
                                <>
                                  <div className="platform-admin-email-sender-grid">
                                    <div className="platform-admin-email-sender-editor">
                                      <div className="platform-admin-email-sender-title">
                                        <strong>Platform Admin controls</strong>
                                        <span>
                                          Set the verified domain and status for this tenant.
                                        </span>
                                      </div>
                                      <div className="platform-admin-manual-grid platform-admin-email-sender-form-grid">
                                        <div className="platform-admin-manual-field">
                                          <label>Mode</label>
                                          <select
                                            value={emailSenderDraft.mode === "CUSTOM_DOMAIN" ? "CUSTOM_DOMAIN" : "DEFAULT_CALENDRA"}
                                            onChange={(e) =>
                                              updateEmailSenderDraft({
                                                mode: e.target.value as TenantEmailSenderMode,
                                              })
                                            }
                                          >
                                            <option value="DEFAULT_CALENDRA">Calendra domain</option>
                                            <option value="CUSTOM_DOMAIN">Custom domain</option>
                                          </select>
                                        </div>
                                        <div className="platform-admin-manual-field">
                                          <label>Verified domain</label>
                                          <input
                                            placeholder="avisensa.com"
                                            value={emailSenderDraft.domain}
                                            onChange={(e) =>
                                              updateEmailSenderDraft({ domain: e.target.value })
                                            }
                                          />
                                        </div>
                                        <div className="platform-admin-manual-field">
                                          <label>Verification status</label>
                                          <select
                                            value={emailSenderDraft.verificationStatus as TenantEmailSenderVerificationStatus}
                                            onChange={(e) =>
                                              updateEmailSenderDraft({
                                                verificationStatus:
                                                  e.target.value as TenantEmailSenderVerificationStatus,
                                              })
                                            }
                                          >
                                            {EMAIL_SENDER_STATUS_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                      <div
                                        className={`platform-admin-email-sender-readiness${
                                          customEmailSenderReady
                                            ? " platform-admin-email-sender-readiness--ok"
                                            : " platform-admin-email-sender-readiness--warn"
                                        }`}
                                      >
                                        {customEmailSenderReady
                                          ? "Ready: tenant From email matches the verified custom domain."
                                          : "Not ready: set status to VERIFIED and make sure the tenant From email belongs to this domain."}
                                      </div>
                                      <div className="platform-admin-top-actions">
                                        <button
                                          className="platform-admin-button platform-admin-primary platform-admin-small"
                                          type="button"
                                          disabled={emailSenderSaving}
                                          onClick={saveEmailSender}
                                        >
                                          {emailSenderSaving ? "Saving…" : "Save email sender"}
                                        </button>
                                        <button
                                          className="platform-admin-button platform-admin-secondary platform-admin-small"
                                          type="button"
                                          disabled={emailSenderSaving || !emailSender}
                                          onClick={() => {
                                            setEmailSenderDraft(emailSender);
                                            setEmailSenderErr(null);
                                            setEmailSenderOk(null);
                                          }}
                                        >
                                          Reset changes
                                        </button>
                                      </div>
                                    </div>

                                    <div className="platform-admin-email-sender-editor platform-admin-email-sender-editor--readonly">
                                      <div className="platform-admin-email-sender-title">
                                        <strong>Tenant-controlled sender identity</strong>
                                        <span>
                                          These values are read from the tenant Notifications screen.
                                        </span>
                                      </div>
                                      <div className="platform-admin-field-grid platform-admin-email-sender-preview-grid">
                                        <div className="platform-admin-field-card">
                                          <div className="platform-admin-field-label">
                                            <strong>From name</strong>
                                            <span>{emailSenderDraft.fromName || "—"}</span>
                                          </div>
                                        </div>
                                        <div className="platform-admin-field-card">
                                          <div className="platform-admin-field-label">
                                            <strong>From email</strong>
                                            <span>{emailSenderDraft.fromEmail || "—"}</span>
                                          </div>
                                        </div>
                                        <div className="platform-admin-field-card">
                                          <div className="platform-admin-field-label">
                                            <strong>Reply-to email</strong>
                                            <span>{emailSenderDraft.replyToEmail || "—"}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <p className="platform-admin-muted" style={{ margin: 0, fontWeight: 750 }}>
                                    The save request uses PUT /api/platform-admin/tenancies/
                                    {selected.id}/email-sender and preserves the tenant&apos;s
                                    current sender fields in the request body.
                                  </p>
                                </>
                              ) : null}
                            </section>

                            <section className="platform-admin-section-card" id="audit">
                              <div className="platform-admin-section-head">
                                <div className="platform-admin-section-title">
                                  <strong>Audit log</strong>
                                  <span>
                                    Actions recorded from this platform admin
                                    console for this tenant (change plan, price
                                    override, suspend, add-ons). Confirming a
                                    modal writes an entry here.
                                  </span>
                                </div>
                              </div>
                              {auditLoading ? (
                                <p className="platform-admin-muted">Loading audit log…</p>
                              ) : null}
                              {auditErr ? (
                                <p className="platform-admin-search-err">{auditErr}</p>
                              ) : null}
                              {!auditLoading &&
                              !auditErr &&
                              auditLog.length === 0 ? (
                                <p className="platform-admin-muted" style={{ margin: 0 }}>
                                  No platform admin actions recorded for this
                                  tenant yet.
                                </p>
                              ) : null}
                              {!auditLoading &&
                              !auditErr &&
                              auditLog.length > 0 ? (
                                <div className="platform-admin-audit-log-wrap">
                                  <table className="platform-admin-audit-log-table">
                                    <thead>
                                      <tr>
                                        <th scope="col">When</th>
                                        <th scope="col">Type</th>
                                        <th scope="col">Summary</th>
                                        <th scope="col">Actor</th>
                                        <th scope="col">Detail</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {auditLog.map((row, i) => (
                                        <tr
                                          key={`${row.occurredAt}-${row.category}-${row.summary}-${i}`}
                                        >
                                          <td>
                                            {formatAuditTime(row.occurredAt)}
                                          </td>
                                          <td>
                                            <span
                                              className={auditCategoryPillClass(
                                                row.category,
                                              )}
                                            >
                                              {row.category}
                                            </span>
                                          </td>
                                          <td>
                                            <code
                                              style={{
                                                fontSize: "0.85em",
                                                wordBreak: "break-all",
                                              }}
                                            >
                                              {row.summary}
                                            </code>
                                          </td>
                                          <td className="platform-admin-audit-actor-cell">
                                            {row.actorEmail?.trim() || "—"}
                                          </td>
                                          <td className="platform-admin-audit-detail-cell">
                                            {row.detail}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}
                            </section>

                            <section className="platform-admin-section-card" id="plan-history">
                              <div className="platform-admin-section-head">
                                <div className="platform-admin-section-title">
                                  <strong>Plan history</strong>
                                  <span>
                                    History of tenant plan changes from Platform
                                    Admin with target plan and effective date.
                                  </span>
                                </div>
                              </div>
                              {auditLoading ? (
                                <p className="platform-admin-muted">Loading plan history…</p>
                              ) : null}
                              {!auditLoading &&
                              !auditErr &&
                              planHistory.length === 0 ? (
                                <p className="platform-admin-muted" style={{ margin: 0 }}>
                                  No recorded plan changes for this tenant yet.
                                </p>
                              ) : null}
                              {!auditLoading && planHistory.length > 0 ? (
                                <div className="platform-admin-plan-history-wrap">
                                  <table className="platform-admin-plan-history-table">
                                    <thead>
                                      <tr>
                                        <th scope="col">Recorded</th>
                                        <th scope="col">Action</th>
                                        <th scope="col">From</th>
                                        <th scope="col">To</th>
                                        <th scope="col">Effective date</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Actor</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {planHistory.map((row, idx) => (
                                        <tr
                                          key={`${row.recordedAt}-${row.toPlan}-${idx}`}
                                        >
                                          <td>{row.recordedAt}</td>
                                          <td>{row.action}</td>
                                          <td>{row.fromPlan}</td>
                                          <td>{row.toPlan}</td>
                                          <td>{row.effectiveDate}</td>
                                          <td>
                                            <span
                                              className={
                                                row.status === "Scheduled"
                                                  ? "platform-admin-plan-status-pill platform-admin-plan-status-pill--scheduled"
                                                  : "platform-admin-plan-status-pill platform-admin-plan-status-pill--applied"
                                              }
                                            >
                                              {row.status}
                                            </span>
                                          </td>
                                          <td className="platform-admin-audit-actor-cell">
                                            {row.actor}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}
                            </section>
                          </>
                        )}
                      </section>
                    </section>
                  </>
                ) : workspace === "monitoring" ? (
                  <MonitoringAdminPanel />
                ) : workspace === "plans" ? (
                  <div className="platform-admin-panel platform-admin-panel-pad">
                    <PlanPricesAdminPanel />
                  </div>
                ) : workspace === "fiscalization" ? (
                  <FiscalizationAdminPanel />
                ) : workspace === "messaging" ? (
                  <MessagingProvidersAdminPanel />
                ) : workspace === "payments" ? (
                  <PaymentProvidersAdminPanel />
                ) : workspace === "ajpes" ? (
                  <AjpesAdminPanel />
                ) : workspace === "other" ? (
                  <OtherAdminPanel />
                ) : workspace === "developer" ? (
                  <TimeSimulatorPanel />
                ) : (
                  <AdminComingSoon
                    title={
                      ADMIN_TABS.find((t) => t.id === workspace)?.label ??
                      "Section"
                    }
                  />
                )}
        </main>

        {manualTenantOpen ? (
          <div
            className="platform-admin-manual-tenant-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={manualTenantMode === "create" ? "Create manual tenant" : "Edit manual subscription"}
          >
            <div className="platform-admin-manual-tenant-modal">
              <div className="platform-admin-manual-tenant-header">
                <div className="platform-admin-manual-tenant-title">
                  <div className="platform-admin-eyebrow">Platform Admin</div>
                  <h2>
                    {manualTenantMode === "create"
                      ? "Add tenant manually"
                      : "Edit tenant subscription"}
                  </h2>
                  <p>
                    Creates the tenant, first admin user, package limits,
                    features, invoice/payment link and separate invite email.
                  </p>
                </div>
                <button
                  className="platform-admin-button platform-admin-secondary platform-admin-small"
                  type="button"
                  onClick={() => setManualTenantOpen(false)}
                >
                  Close
                </button>
              </div>

              {manualTenantErr ? (
                <div className="platform-admin-manual-error">{manualTenantErr}</div>
              ) : null}
              {manualTenantResult ? (
                <div className="platform-admin-manual-result">{manualTenantResult}</div>
              ) : null}

              <section className="platform-admin-manual-section">
                <h3>Owner and company details</h3>
                <div className="platform-admin-manual-grid">
                  <div className="platform-admin-manual-field">
                    <label>First name</label>
                    <input
                      value={manualTenantForm.firstName}
                      disabled={manualTenantMode === "edit"}
                      onChange={(e) => updateManualTenantField("firstName", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Last name</label>
                    <input
                      value={manualTenantForm.lastName}
                      disabled={manualTenantMode === "edit"}
                      onChange={(e) => updateManualTenantField("lastName", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>E-mail</label>
                    <input
                      type="email"
                      value={manualTenantForm.email}
                      disabled={manualTenantMode === "edit"}
                      onChange={(e) => updateManualTenantField("email", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Phone</label>
                    <input
                      value={manualTenantForm.phone}
                      onChange={(e) => updateManualTenantField("phone", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Company</label>
                    <input
                      value={manualTenantForm.companyName}
                      onChange={(e) => updateManualTenantField("companyName", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Tip podjetja</label>
                    <select
                      value={manualTenantForm.companyType}
                      onChange={(e) => updateManualTenantField("companyType", e.target.value)}
                    >
                      {TENANT_CONFIG_TYPE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.labelSl}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>VAT ID</label>
                    <input
                      value={manualTenantForm.vatId}
                      onChange={(e) => updateManualTenantField("vatId", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Country</label>
                    <input
                      value={manualTenantForm.country}
                      onChange={(e) => updateManualTenantField("country", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>City</label>
                    <input
                      value={manualTenantForm.city}
                      onChange={(e) => updateManualTenantField("city", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Address</label>
                    <input
                      value={manualTenantForm.address}
                      onChange={(e) => updateManualTenantField("address", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Postal code</label>
                    <input
                      value={manualTenantForm.postalCode}
                      onChange={(e) => updateManualTenantField("postalCode", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Language</label>
                    <select
                      value={manualTenantForm.language}
                      onChange={(e) => updateManualTenantField("language", e.target.value)}
                    >
                      <option value="sl">Slovenian</option>
                      <option value="sr">Serbian</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="platform-admin-manual-section">
                <h3>Package, limits and payment</h3>
                <div className="platform-admin-manual-grid">
                  <div className="platform-admin-manual-field">
                    <label>Package</label>
                    <select
                      value={manualTenantForm.packageName}
                      onChange={(e) => updateManualTenantField("packageName", e.target.value)}
                    >
                      <option value="BASIC">Osnovni</option>
                      <option value="PROFESSIONAL">Pro</option>
                      <option value="PREMIUM">Poslovni</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Billing interval</label>
                    <select
                      value={manualTenantForm.billingInterval}
                      onChange={(e) => updateManualTenantField("billingInterval", e.target.value)}
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="YEARLY">Yearly</option>
                    </select>
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Users</label>
                    <input
                      type="number"
                      min={1}
                      value={manualTenantForm.userCount}
                      onChange={(e) => updateManualTenantField("userCount", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>SMS / month</label>
                    <input
                      type="number"
                      min={0}
                      value={manualTenantForm.smsCount}
                      onChange={(e) => updateManualTenantField("smsCount", e.target.value)}
                    />
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Payment method</label>
                    <select
                      value={manualTenantForm.paymentMethod}
                      onChange={(e) => updateManualTenantField("paymentMethod", e.target.value)}
                    >
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CARD">Stripe / credit card</option>
                    </select>
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Access status</label>
                    <select
                      value={manualTenantForm.accessStatus}
                      onChange={(e) => updateManualTenantField("accessStatus", e.target.value)}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Billing status</label>
                    <select
                      value={manualTenantForm.billingStatus}
                      onChange={(e) => updateManualTenantField("billingStatus", e.target.value)}
                    >
                      <option value="PENDING_PAYMENT">Pending payment</option>
                      <option value="PAID">Paid</option>
                      <option value="PAST_DUE">Past due</option>
                    </select>
                  </div>
                  <div className="platform-admin-manual-field">
                    <label>Subscription start</label>
                    <input
                      type="date"
                      value={manualTenantForm.subscriptionStart}
                      onChange={(e) => updateManualTenantField("subscriptionStart", e.target.value)}
                    />
                  </div>
                </div>

                {manualTenantForm.packageName === "CUSTOM" ? (
                  <div className="platform-admin-manual-grid">
                    <div className="platform-admin-manual-field">
                      <label>Custom package name</label>
                      <input
                        value={manualTenantForm.customPackageName}
                        placeholder="Custom"
                        onChange={(e) =>
                          updateManualTenantField("customPackageName", e.target.value)
                        }
                      />
                    </div>
                    <div className="platform-admin-manual-field">
                      <label>Custom monthly price</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={manualTenantForm.customMonthlyPrice}
                        onChange={(e) =>
                          updateManualTenantField("customMonthlyPrice", e.target.value)
                        }
                      />
                    </div>
                    <div className="platform-admin-manual-field">
                      <label>Custom yearly price</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={manualTenantForm.customYearlyPrice}
                        onChange={(e) =>
                          updateManualTenantField("customYearlyPrice", e.target.value)
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </section>

              {manualTenantForm.packageName === "CUSTOM" ? (
                <section className="platform-admin-manual-section">
                  <h3>Custom features</h3>
                  <div className="platform-admin-manual-check-list">
                    <strong>Enabled App nastavitve / modules</strong>
                    <div className="platform-admin-manual-checkbox-grid">
                      {(manualTenantOptions?.features ?? []).map((feature) => (
                        <label className="platform-admin-manual-checkbox" key={feature.key}>
                          <input
                            type="checkbox"
                            checked={manualTenantForm.enabledFeatureKeys.includes(feature.key)}
                            onChange={(e) =>
                              toggleManualFeature(feature.key, e.target.checked)
                            }
                          />
                          <span>{feature.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="platform-admin-manual-section">
                <h3>Add-ons</h3>
                <div className="platform-admin-manual-checkbox-grid">
                  {(manualTenantOptions?.addOns ?? []).map((addon) => (
                    <label className="platform-admin-manual-checkbox" key={addon.key}>
                      <input
                        type="checkbox"
                        checked={manualSelectedAddonKeys.has(addon.key)}
                        onChange={(e) => toggleManualAddon(addon, e.target.checked)}
                      />
                      <span>
                        {addon.nameSl || addon.name || addon.key} · €
                        {String(addon.monthlyPrice ?? "0.00")}/mo
                      </span>
                    </label>
                  ))}
                </div>
                {manualTenantForm.addOns.length > 0 ? (
                  <div className="platform-admin-manual-check-list">
                    <strong>Selected add-on prices</strong>
                    {manualTenantForm.addOns.map((row) => (
                      <div className="platform-admin-manual-addon-row" key={row.key}>
                        <div className="platform-admin-manual-field">
                          <label>Add-on</label>
                          <input value={row.key} disabled />
                        </div>
                        <div className="platform-admin-manual-field">
                          <label>Monthly</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={row.monthlyPrice}
                            onChange={(e) =>
                              updateManualAddonField(
                                row.key,
                                "monthlyPrice",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div className="platform-admin-manual-field">
                          <label>Yearly</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={row.yearlyPrice}
                            onChange={(e) =>
                              updateManualAddonField(
                                row.key,
                                "yearlyPrice",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <label className="platform-admin-manual-checkbox">
                          <input
                            type="checkbox"
                            checked={row.charged}
                            onChange={(e) =>
                              updateManualAddonField(row.key, "charged", e.target.checked)
                            }
                          />
                          <span>Charged</span>
                        </label>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <div className="platform-admin-manual-actions">
                <button
                  className="platform-admin-button platform-admin-secondary"
                  type="button"
                  onClick={() => setManualTenantOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="platform-admin-button platform-admin-primary"
                  type="button"
                  disabled={manualTenantSaving}
                  onClick={submitManualTenant}
                >
                  {manualTenantSaving
                    ? "Saving…"
                    : manualTenantMode === "create"
                      ? "Create tenant"
                      : "Save subscription"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className="platform-admin-modal-backdrop"
          id="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-hidden="true"
          data-modal-kind=""
        >
          <div className="platform-admin-modal">
            <h3 id="modalTitle">Admin action</h3>
            <p id="modalCopy">
              Admin overrides require a reason and create an immutable audit log
              entry.
            </p>
            <div className="platform-admin-select-row" id="modalPlanRow">
              <label htmlFor="actionSelect">Action</label>
              <select id="actionSelect">
                <option>Upgrade immediately</option>
              </select>
            </div>
            {activeModalKind === "plan" && selected ? (
              <div id="planChangeExtras" className="platform-admin-plan-change-extras" hidden>
                <div className="platform-admin-select-row">
                  <label htmlFor="planTargetSelect">New plan</label>
                  <select id="planTargetSelect" />
                </div>
                <p
                  id="planEffectiveDateHint"
                  className="platform-admin-muted"
                  style={{ margin: 0, fontWeight: 800 }}
                />
              </div>
            ) : null}
            {activeModalKind === "price" && selected ? (
              <div id="priceOverrideExtras" className="platform-admin-price-override-extras">
                <div
                  id="priceOverridePanelCustom"
                  className="platform-admin-price-override-panel"
                  hidden
                >
                  <div
                    className="platform-admin-price-current-pill"
                    id="priceCurrentLabelCustom"
                  />
                  <div className="platform-admin-select-row">
                    <label htmlFor="priceCustomInput">New plan price (€)</label>
                    <input
                      id="priceCustomInput"
                      type="number"
                      min={0}
                      step={0.01}
                      inputMode="decimal"
                    />
                    <p
                      className="platform-admin-muted"
                      style={{
                        margin: 0,
                        fontSize: "0.82rem",
                        fontWeight: 700,
                      }}
                    >
                      Applies to this tenant&apos;s current billing cycle
                      (monthly or annual total shown above).
                    </p>
                  </div>
                </div>
                <div
                  id="priceOverridePanelDiscount"
                  className="platform-admin-price-override-panel"
                  hidden
                >
                  <div
                    className="platform-admin-price-current-pill"
                    id="priceCurrentLabelDiscount"
                  />
                  <div className="platform-admin-select-row">
                    <label htmlFor="priceDiscountPercent">Discount (%)</label>
                    <input
                      id="priceDiscountPercent"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      inputMode="decimal"
                    />
                    <label className="platform-admin-checkbox-row">
                      <input id="priceDiscountIncludeAddons" type="checkbox" />
                      <span>
                        Include add-ons in the % discount (preview uses catalog
                        add-on prices as reference).
                      </span>
                    </label>
                    <p id="priceDiscountPreview" className="platform-admin-price-preview" />
                  </div>
                </div>
                <div
                  id="priceOverridePanelRemove"
                  className="platform-admin-price-override-panel"
                  hidden
                >
                  <p
                    id="priceRemoveCopy"
                    className="platform-admin-muted"
                    style={{ margin: 0, lineHeight: 1.5 }}
                  />
                </div>
              </div>
            ) : null}
            <div className="platform-admin-select-row">
              <label htmlFor="reasonText">Reason / internal note</label>
              <textarea
                id="reasonText"
                placeholder="Required for admin override, price changes, suspension and annual downgrade exceptions."
              />
            </div>
            <div className="platform-admin-modal-actions">
              <button
                className="platform-admin-button platform-admin-secondary"
                type="button"
                id="closeModal"
              >
                Cancel
              </button>
              <button
                className="platform-admin-button platform-admin-primary"
                type="button"
                id="confirmModal"
              >
                Confirm action
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
