import '../styles/features/booking-side-panel.css'
import '../styles/features/modern-clients.css'
import { DesktopSelect } from "../components/DesktopSelect";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import "./SessionTypesPage.mobile.css";
import { api } from "../api";
import { useAuthenticatedUser } from "../authUserContext";
import type {
  BillingService,
  Client,
  Location as LocationT,
  ServiceGroup,
  SessionType as SessionTypeT,
  TaxRate,
} from "../lib/types";
import { taxLabels } from "../lib/types";
import {
  Card,
  EmptyState,
  Field,
} from "../components/ui";
import { currency } from "../lib/format";
import { useLocale, type AppLocale } from "../locale";
import {
  GUEST_APP_SETTINGS_KEY,
  parseGuestAppSettings,
} from "./configuration/guestWebsiteSettings";
import { getDefaultAllowedRoute } from "../lib/packageAccess";
import { hasEmployeePermission } from "../lib/employeePermissions";
import { isWorkspaceRolloutEnabled } from "../lib/workspaceRollout";
import { GuestConfigSaveIcon } from "../components/GuestConfigSaveIcon";
import {
  ServiceConfigDeleteButton,
  ServiceConfigEditButton,
  ServiceConfigSortableTableHeader,
  ServiceConfigTableFooter,
  nextServiceConfigSortState,
  sortServiceConfigRows,
  type ServiceConfigSortState,
} from "../components/ServiceConfigTableUi";
import {
  CardsMembershipsSection,
  type CardsMembershipsSectionHandle,
  type GuestAdminProductType,
  type GuestAdminProductServiceFilter,
} from "./CardsMembershipsSection";
import { CoursesSection, type CoursesSectionHandle } from "./CoursesSection";
import { WorkspaceServiceManager } from "../components/WorkspaceServiceManager";
import { useMobileKeyboardOpen } from "../hooks/useMobileKeyboardOpen";
import { useSelectedLocationId } from "../lib/locationContext";
import { useMediaMaxWidth } from "../hooks/useCalendarResponsiveLayout";
import {
  billingServicesQueryOptions,
  clientOptionsQueryOptions,
  locationsQueryOptions,
  moduleCapabilitiesQueryOptions,
  settingsQueryOptions,
} from "../queries/sharedQueryOptions";
import {
  calendarTypesQueryOptions,
  serviceGroupsQueryOptions,
} from "../queries/calendarQueryOptions";
import { queryKeys } from "../queries/queryKeys";

const SESSION_TYPES_SUBTAB_GROUPS = "service-groups";
const SESSION_TYPES_SUBTAB_TRANSACTION = "transaction-services";
const SESSION_TYPES_SUBTAB_CARDS = "cards-memberships";
const SESSION_TYPES_SUBTAB_COURSES = "courses";

type SessionTypeSortKey = "name" | "category" | "duration" | "price" | "status";
type BillingServiceSortKey = "name" | "category" | "price" | "tax" | "status";

const SERVICE_TYPE_DEFAULT_COLOR = "#D7DFF0";
const SERVICE_TYPE_COLOR_PALETTE = [
  "#E8A4B8",
  "#F2E9C9",
  "#7ED39A",
  "#D7DFF0",
  "#FFD35C",
  "#B6E3EC",
  "#D9F24D",
  "#C7D2FE",
  "#DDD6FE",
  "#FBCFE8",
  "#FED7AA",
  "#A7F3D0",
  "#BAE6FD",
  "#FDE68A",
  "#CBD5E1",
] as const;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SERVICE_BREAK_MINUTE_OPTIONS = Array.from({ length: 37 }, (_, index) => index * 5);

function normalizeServiceTypeColorForUi(raw?: string | null): string {
  const value = String(raw || "").trim();
  return HEX_COLOR_PATTERN.test(value)
    ? value.toUpperCase()
    : SERVICE_TYPE_DEFAULT_COLOR;
}

type TypeServiceLine = { transactionServiceId: number; price: string; locationPrice?: string };

type ConsumableCatalogItem = {
  id: number;
  name: string;
  unit?: string | null;
  billable?: boolean;
  active?: boolean;
};

type TypeConsumableLine = {
  consumableId: number;
  defaultQuantity: string;
  quantityMode: "PER_SESSION" | "PER_PARTICIPANT";
  billableOverride: boolean | null;
  notes?: string;
};

type ServiceTypeModalTab = "basic" | "services" | "booking" | "group";
type LinkedEntityModalTab = "existing" | "create";
type LinkedEntityModalAction = "link" | "edit" | "linked-price";

type PriceCalculationMode = "PER_CLIENT" | "TOTAL";

/** Maps to widget + guest-app booleans on the API (see flagsFromGuestBookingMode). */
type GuestBookingMode = "ALL" | "WEBSITE" | "GUEST" | "DISABLED";

function guestBookingModeFromFlags(
  widget: boolean,
  guest: boolean,
): GuestBookingMode {
  if (widget && guest) return "ALL";
  if (widget && !guest) return "WEBSITE";
  if (!widget && guest) return "GUEST";
  return "DISABLED";
}

function flagsFromGuestBookingMode(mode: GuestBookingMode): {
  widgetGroupBookingEnabled: boolean;
  guestBookingEnabled: boolean;
} {
  switch (mode) {
    case "ALL":
      return { widgetGroupBookingEnabled: true, guestBookingEnabled: true };
    case "WEBSITE":
      return { widgetGroupBookingEnabled: true, guestBookingEnabled: false };
    case "GUEST":
      return { widgetGroupBookingEnabled: false, guestBookingEnabled: true };
    case "DISABLED":
      return { widgetGroupBookingEnabled: false, guestBookingEnabled: false };
  }
}

const GUEST_BOOKING_OPTIONS_EN: {
  value: GuestBookingMode;
  label: string;
  line: string;
}[] = [
  { value: "ALL", label: "ALL", line: "Website and guest mobile app" },
  { value: "WEBSITE", label: "WEBSITE", line: "Website only" },
  { value: "GUEST", label: "GUEST", line: "Guest mobile app only" },
  { value: "DISABLED", label: "DISABLED", line: "Not bookable by guests" },
];

const GUEST_BOOKING_OPTIONS_SL: {
  value: GuestBookingMode;
  label: string;
  line: string;
}[] = [
  { value: "ALL", label: "VSE", line: "Spletna stran in mobilna guest aplikacija" },
  { value: "WEBSITE", label: "SPLET", line: "Samo spletna stran" },
  { value: "GUEST", label: "GUEST", line: "Samo mobilna guest aplikacija" },
  { value: "DISABLED", label: "IZKLOPLJENO", line: "Rezervacija gostov ni omogočena" },
];

function guestBookingOptionMeta(mode: GuestBookingMode, locale: AppLocale) {
  const options =
    locale === "sl" ? GUEST_BOOKING_OPTIONS_SL : GUEST_BOOKING_OPTIONS_EN;
  return (
    options.find((o) => o.value === mode) ?? options[0]
  );
}

function isGuestBookingModeAvailable(
  mode: GuestBookingMode,
  websiteWidgetEnabled: boolean,
  guestAppEnabled: boolean,
): boolean {
  switch (mode) {
    case "ALL":
      return websiteWidgetEnabled && guestAppEnabled;
    case "WEBSITE":
      return websiteWidgetEnabled;
    case "GUEST":
      return guestAppEnabled;
    case "DISABLED":
      return true;
  }
}

function normalizeGuestBookingModeForModules(
  mode: GuestBookingMode,
  websiteWidgetEnabled: boolean,
  guestAppEnabled: boolean,
): GuestBookingMode {
  if (isGuestBookingModeAvailable(mode, websiteWidgetEnabled, guestAppEnabled)) {
    return mode;
  }
  if (mode === "ALL") {
    if (websiteWidgetEnabled) return "WEBSITE";
    if (guestAppEnabled) return "GUEST";
  }
  return "DISABLED";
}

function guestBookingOptionsForModules(
  locale: AppLocale,
  websiteWidgetEnabled: boolean,
  guestAppEnabled: boolean,
): { value: GuestBookingMode; label: string; line: string }[] {
  const options =
    locale === "sl" ? GUEST_BOOKING_OPTIONS_SL : GUEST_BOOKING_OPTIONS_EN;
  return options.filter((option) =>
    isGuestBookingModeAvailable(
      option.value,
      websiteWidgetEnabled,
      guestAppEnabled,
    ),
  );
}

const PRICE_CALCULATION_OPTIONS_EN: {
  value: PriceCalculationMode;
  label: string;
  line: string;
}[] = [
  {
    value: "PER_CLIENT",
    label: "PER CLIENT",
    line: "Price is charged for each added client.",
  },
  {
    value: "TOTAL",
    label: "TOTAL",
    line: "Price is charged once for the whole session.",
  },
];

const PRICE_CALCULATION_OPTIONS_SL: {
  value: PriceCalculationMode;
  label: string;
  line: string;
}[] = [
  {
    value: "PER_CLIENT",
    label: "NA STRANKO",
    line: "Cena se obračuna za vsako dodano stranko.",
  },
  {
    value: "TOTAL",
    label: "SKUPAJ",
    line: "Cena se obračuna enkrat za celoten termin.",
  },
];

function priceCalculationOptionMeta(
  mode: PriceCalculationMode,
  locale: AppLocale,
) {
  const options =
    locale === "sl" ? PRICE_CALCULATION_OPTIONS_SL : PRICE_CALCULATION_OPTIONS_EN;
  return (
    options.find((o) => o.value === mode) ?? options[0]
  );
}

/** Same order as the former native `<select>` (see `taxLabels`). */
const TAX_RATE_ORDER: TaxRate[] = ["VAT_0", "VAT_9_5", "VAT_22", "NO_VAT"];

const TAX_RATE_LINE_I18N_KEY: Record<Exclude<TaxRate, "NO_VAT">, string> = {
  VAT_0: "sessionTypesTxTaxLineVat0",
  VAT_9_5: "sessionTypesTxTaxLineVat95",
  VAT_22: "sessionTypesTxTaxLineVat22",
};

/** Session type timing fields: integers 0–999 (max three digits). */
function clampSessionTypeInt0to999(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

function normalizeOptionalParticipantsField(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const n = Number(t);
  if (!Number.isFinite(n)) return "";
  const x = Math.floor(n);
  if (x < 1) return "";
  return String(Math.min(999, x));
}

type TypeFormState = {
  name: string;
  description: string;
  internalDescription: string;
  color: string;
  durationMinutes: number;
  breakMinutes: number;
  breakMinutesOverridden: boolean;
  maxParticipantsPerSession: string;
  groupBookingEnabled: boolean;
  guestBookingMode: GuestBookingMode;
  priceCalculationMode: PriceCalculationMode;
  guestLimitUserEmailsText: string;
  serviceGroupId: string;
  availableAllLocations: boolean;
  locationIds: number[];
  serviceLines: TypeServiceLine[];
  consumableLines: TypeConsumableLine[];
};

function typeFormsEqual(a: TypeFormState, b: TypeFormState): boolean {
  if (a.name !== b.name) return false;
  if (a.description !== b.description) return false;
  if (a.internalDescription !== b.internalDescription) return false;
  if (
    normalizeServiceTypeColorForUi(a.color) !==
    normalizeServiceTypeColorForUi(b.color)
  )
    return false;
  if (a.durationMinutes !== b.durationMinutes) return false;
  if (a.breakMinutes !== b.breakMinutes) return false;
  if (a.breakMinutesOverridden !== b.breakMinutesOverridden) return false;
  if (a.groupBookingEnabled !== b.groupBookingEnabled) return false;
  if (a.groupBookingEnabled || b.groupBookingEnabled) {
    if (
      a.maxParticipantsPerSession.trim() !== b.maxParticipantsPerSession.trim()
    )
      return false;
    if (
      normalizeGuestLimitUserEmailsText(a.guestLimitUserEmailsText) !==
      normalizeGuestLimitUserEmailsText(b.guestLimitUserEmailsText)
    )
      return false;
  }
  if (a.guestBookingMode !== b.guestBookingMode) return false;
  if (a.priceCalculationMode !== b.priceCalculationMode) return false;
  if (a.serviceGroupId !== b.serviceGroupId) return false;
  if (a.availableAllLocations !== b.availableAllLocations) return false;
  if (a.locationIds.length !== b.locationIds.length) return false;
  const aLocationIds = [...a.locationIds].sort((left, right) => left - right);
  const bLocationIds = [...b.locationIds].sort((left, right) => left - right);
  if (aLocationIds.some((id, index) => id !== bLocationIds[index])) return false;
  if (a.serviceLines.length !== b.serviceLines.length) return false;
  for (let i = 0; i < a.serviceLines.length; i++) {
    if (
      a.serviceLines[i].transactionServiceId !==
      b.serviceLines[i].transactionServiceId
    )
      return false;
    if (a.serviceLines[i].price.trim() !== b.serviceLines[i].price.trim())
      return false;
    if ((a.serviceLines[i].locationPrice || "").trim() !== (b.serviceLines[i].locationPrice || "").trim())
      return false;
  }
  if (a.consumableLines.length !== b.consumableLines.length) return false;
  for (let i = 0; i < a.consumableLines.length; i++) {
    const left = a.consumableLines[i];
    const right = b.consumableLines[i];
    if (left.consumableId !== right.consumableId) return false;
    if (left.defaultQuantity.trim() !== right.defaultQuantity.trim()) return false;
    if (left.quantityMode !== right.quantityMode) return false;
    if (left.billableOverride !== right.billableOverride) return false;
    if ((left.notes || "").trim() !== (right.notes || "").trim()) return false;
  }
  return true;
}

type ServiceFormState = {
  description: string;
  taxRate: TaxRate;
  /** Editable gross price; API still stores net. */
  grossPrice: string;
  /** Company-wide: one or more services may be advance deduction lines (CSV in ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID). */
  advanceDeduction: boolean;
  /** Company-wide: exactly one service can be used as the NO SHOW charge. */
  noShow: boolean;
};

const SERVICE_TYPE_CODE_MAX_LENGTH = 12;

function taxRateMultiplier(taxRate: TaxRate): number {
  if (taxRate === "VAT_22") return 0.22;
  if (taxRate === "VAT_9_5") return 0.095;
  return 0;
}

function netFromGross(gross: number, taxRate: TaxRate): number {
  if (Number.isNaN(gross)) return 0;
  const mult = taxRateMultiplier(taxRate);
  const net = gross / (1 + mult);
  // Keep extra precision so gross stays stable after save/reload.
  return Math.round(net * 10000) / 10000;
}

function grossPriceStringFromNet(net: number, taxRate: TaxRate): string {
  const g = net * (1 + taxRateMultiplier(taxRate));
  return (Math.round(g * 100) / 100).toFixed(2);
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseDecimalInput(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function normalizeServiceTypeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, SERVICE_TYPE_CODE_MAX_LENGTH);
}


function normalizeGuestLimitUserEmailsText(raw: string): string {
  return raw
    .split(/[\n,;]/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .filter((email, index, all) => all.indexOf(email) === index)
    .join("\n");
}

function parseGuestLimitUserEmails(raw: string): string[] {
  const normalized = normalizeGuestLimitUserEmailsText(raw);
  return normalized ? normalized.split("\n") : [];
}

function guestLimitUserEmailsTextFromApi(emails?: string[] | null): string {
  return Array.isArray(emails)
    ? normalizeGuestLimitUserEmailsText(emails.join("\n"))
    : "";
}

function normalizeGuestLimitEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidGuestLimitEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeGuestLimitEmail(raw));
}


function clientFullName(
  client: Pick<Client, "firstName" | "lastName" | "email">,
): string {
  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim();
  return name || client.email || "Client";
}

function clientInitials(
  client: Pick<Client, "firstName" | "lastName" | "email">,
): string {
  const first = (client.firstName || "").trim().charAt(0);
  const last = (client.lastName || "").trim().charAt(0);
  const fromName = `${first}${last}`.trim();
  if (fromName) return fromName.toUpperCase();
  return (client.email || "?").trim().charAt(0).toUpperCase() || "?";
}

function serviceFormsEqual(a: ServiceFormState, b: ServiceFormState): boolean {
  if (a.description !== b.description) return false;
  if (a.taxRate !== b.taxRate) return false;
  if (a.advanceDeduction !== b.advanceDeduction) return false;
  if (a.noShow !== b.noShow) return false;
  return a.grossPrice.trim() === b.grossPrice.trim();
}

function readApiMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function parseAdvanceDeductionServiceIds(
  raw: string | null | undefined,
): Set<number> {
  if (!raw) return new Set();
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return out;
}

function serializeAdvanceDeductionServiceIds(ids: Set<number>): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

function parseSingleTransactionServiceId(
  raw: string | null | undefined,
): number | null {
  if (!raw) return null;
  const n = Number(String(raw).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serializeSingleTransactionServiceId(id: number | null): string {
  return Number.isInteger(id) && Number(id) > 0 ? String(id) : "";
}





type ServiceConfigTabIconName =
  | "types"
  | "services"
  | "cards"
  | "group"
  | "search"
  | "filter"
  | "plus";

function ServiceConfigTabIcon({ name }: { name: ServiceConfigTabIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "types") {
    return (
      <svg {...common}>
        <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
        <path d="m4 12 8 4.5 8-4.5" />
        <path d="m4 16.5 8 4.5 8-4.5" />
      </svg>
    );
  }
  if (name === "services") {
    return (
      <svg {...common}>
        <path d="M8 6h12" />
        <path d="M8 12h12" />
        <path d="M8 18h12" />
        <path d="M4 6h.01" />
        <path d="M4 12h.01" />
        <path d="M4 18h.01" />
      </svg>
    );
  }
  if (name === "cards") {
    return (
      <svg {...common}>
        <rect x="4" y="3" width="14" height="18" rx="2.5" />
        <path d="M8 8h6" />
        <path d="M8 12h6" />
        <path d="M8 16h4" />
      </svg>
    );
  }
  if (name === "group") {
    return (
      <svg {...common}>
        <path d="M16 11a3 3 0 1 0-2.9-3.7" />
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M2.8 19c.6-3.1 2.4-4.7 5.2-4.7s4.6 1.6 5.2 4.7" />
        <path d="M13.5 15c2.1.3 3.4 1.6 3.9 4" />
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="10.8" cy="10.8" r="6" />
        <path d="m16 16 4 4" />
      </svg>
    );
  }
  if (name === "filter") {
    return (
      <svg {...common}>
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

type ServiceConfigVisual = {
  icon:
    | "calendar"
    | "activity"
    | "leaf"
    | "users"
    | "star"
    | "heart"
    | "card"
    | "list";
  tone: "blue" | "green" | "orange" | "purple" | "yellow" | "pink";
};

const SERVICE_CONFIG_VISUALS: ServiceConfigVisual[] = [
  { icon: "calendar", tone: "blue" },
  { icon: "activity", tone: "green" },
  { icon: "leaf", tone: "orange" },
  { icon: "users", tone: "purple" },
  { icon: "star", tone: "yellow" },
  { icon: "heart", tone: "pink" },
];

function serviceConfigVisual(
  index: number,
  fallbackIcon: ServiceConfigVisual["icon"] = "calendar",
): ServiceConfigVisual {
  return (
    SERVICE_CONFIG_VISUALS[index % SERVICE_CONFIG_VISUALS.length] ?? {
      icon: fallbackIcon,
      tone: "blue",
    }
  );
}

function ServiceConfigIcon({ visual }: { visual: ServiceConfigVisual }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  return (
    <span className={`service-config-icon service-config-icon--${visual.tone}`}>
      {visual.icon === "calendar" ? (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </svg>
      ) : visual.icon === "activity" ? (
        <svg {...common}>
          <path d="M12 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
          <path d="M6 11.5h12M12 9v4.5M9 21l3-7.5 3 7.5M8 15l4-1.5 4 1.5" />
        </svg>
      ) : visual.icon === "leaf" ? (
        <svg {...common}>
          <path d="M12 21s-6-3.6-6-9.2C6 7.2 9.5 4 12 3c2.5 1 6 4.2 6 8.8C18 17.4 12 21 12 21Z" />
          <path d="M12 21V9M8.5 12.5 12 16l3.5-3.5" />
        </svg>
      ) : visual.icon === "users" ? (
        <svg {...common}>
          <path d="M16 11a3 3 0 1 0-2.9-3.7" />
          <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M2.8 19c.6-3.1 2.4-4.7 5.2-4.7s4.6 1.6 5.2 4.7" />
          <path d="M13.5 15c2.1.3 3.4 1.6 3.9 4" />
        </svg>
      ) : visual.icon === "star" ? (
        <svg {...common}>
          <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
        </svg>
      ) : visual.icon === "heart" ? (
        <svg {...common}>
          <path d="M20.8 8.8c0 5-8.8 10-8.8 10s-8.8-5-8.8-10A4.7 4.7 0 0 1 12 5.7a4.7 4.7 0 0 1 8.8 3.1Z" />
        </svg>
      ) : visual.icon === "card" ? (
        <svg {...common}>
          <rect x="4" y="3" width="14" height="18" rx="2.5" />
          <path d="M8 8h6M8 12h6M8 16h4" />
        </svg>
      ) : (
        <svg {...common}>
          <path d="M8 6h12M8 12h12M8 18h12" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      )}
    </span>
  );
}

function ServiceConfigNameCell({
  title,
  subtitle,
  visual,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  visual: ServiceConfigVisual;
}) {
  return (
    <div className="service-config-name-cell">
      <ServiceConfigIcon visual={visual} />
      <div className="service-config-name-stack">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </div>
  );
}

function typeLinkedCategory(type: SessionTypeT): string {
  const first = type.linkedServices?.[0];
  if (first) return first.description?.trim() || first.code?.trim() || "—";
  return type.groupBookingEnabled === true ? "Skupinske vadbe" : "—";
}

function typeGrossPrice(type: SessionTypeT): number | null {
  const links = type.linkedServices ?? [];
  if (links.length === 0) return null;
  let sum = 0;
  for (const link of links) {
    const raw = link.unitGross ?? link.price;
    if (raw == null || !Number.isFinite(Number(raw))) return null;
    sum += Number(raw);
  }
  return Math.round(sum * 100) / 100;
}

function sessionTypeVisibilityMode(type: SessionTypeT): GuestBookingMode {
  return guestBookingModeFromFlags(
    type.widgetGroupBookingEnabled === true,
    type.guestBookingEnabled !== false,
  );
}

function transactionServiceGross(service: BillingService): number {
  return service.netPrice * (1 + taxRateMultiplier(service.taxRate));
}

export function SessionTypesPage() {
  const me = useAuthenticatedUser();
  const canViewConsumables = hasEmployeePermission(me, "CONSUMABLES_VIEW");
  const canEditConsumables = hasEmployeePermission(me, "CONSUMABLES_EDIT");
  const activeUnitId = me.activeUnitId ?? me.companyId;
  const queryClient = useQueryClient();
  const [selectedLocationId] = useSelectedLocationId(activeUnitId);
  const isAdmin = me.role === "ADMIN" || me.role === "SUPER_ADMIN";
  const { t, locale } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const showServiceGroupsParam =
    searchParams.get("subtab") === SESSION_TYPES_SUBTAB_GROUPS;
  const showCardsMembershipsParam =
    searchParams.get("subtab") === SESSION_TYPES_SUBTAB_CARDS;
  const showCoursesParam =
    searchParams.get("subtab") === SESSION_TYPES_SUBTAB_COURSES;
  const showTransactionServicesParam =
    searchParams.get("subtab") === SESSION_TYPES_SUBTAB_TRANSACTION;

  const setSessionTypesSubtab = useCallback(
    (next: "types" | "groups" | "transactionServices" | "cardsMemberships" | "courses") => {
      if (next === "groups") {
        setSearchParams({ subtab: SESSION_TYPES_SUBTAB_GROUPS }, { replace: true });
      } else if (next === "transactionServices") {
        setSearchParams(
          { subtab: SESSION_TYPES_SUBTAB_TRANSACTION },
          { replace: true },
        );
      } else if (next === "cardsMemberships") {
        setSearchParams(
          { subtab: SESSION_TYPES_SUBTAB_CARDS },
          { replace: true },
        );
      } else if (next === "courses") {
        setSearchParams(
          { subtab: SESSION_TYPES_SUBTAB_COURSES },
          { replace: true },
        );
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams],
  );

  const [boot, setBoot] = useState(true);
  const [showWorkspaceServiceManager, setShowWorkspaceServiceManager] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const defaultServiceBreakMinutes = Math.max(
    0,
    Math.min(
      180,
      Math.round((Number(settings.DEFAULT_SERVICE_BREAK_MINUTES || 0) || 0) / 5) * 5,
    ),
  );
  const typesModuleEnabled = settings.TYPES_ENABLED !== "false";
  const serviceGroupsModuleEnabled =
    settings.SERVICE_GROUPS_ENABLED !== "false";
  const entitlementsModuleEnabled = settings.ENTITLEMENTS_ENABLED !== "false";
  const coursesModuleEnabled =
    entitlementsModuleEnabled && settings.COURSES_ENABLED !== "false";
  const giftCardsModuleEnabled =
    entitlementsModuleEnabled && settings.BILLING_GIFT_CARDS_ENABLED === "true";
  const showCardsMemberships =
    entitlementsModuleEnabled && showCardsMembershipsParam;
  const websiteWidgetModuleEnabled = settings.WEBSITE_WIDGET_ENABLED !== "false";
  const guestAppModuleEnabled = parseGuestAppSettings(
    settings[GUEST_APP_SETTINGS_KEY],
  ).guestAppEnabled;
  const guestBookingDisabledByModules =
    !websiteWidgetModuleEnabled && !guestAppModuleEnabled;
  // Course management now lives inside Ugodnosti create/edit modals.
  const showCourses = false;
  const showServiceGroups = false;
  // Billing services are managed inside Storitve whenever the Storitve module is enabled.
  // Keep the former standalone view only as a fallback for tenants where Storitve itself is disabled.
  const showTransactionServices =
    !typesModuleEnabled && showTransactionServicesParam;
  const [types, setTypes] = useState<SessionTypeT[]>([]);
  const [locations, setLocations] = useState<LocationT[]>([]);
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  const [services, setServices] = useState<BillingService[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [guestAppClientsLoading, setGuestAppClientsLoading] = useState(false);
  const guestAppClientsLoadedRef = useRef(false);
  const guestAppClientsLoadPromiseRef = useRef<Promise<void> | null>(null);
  const [editingType, setEditingType] = useState<SessionTypeT | null>(null);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ServiceGroup | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", description: "", active: true });
  const [groupModalTab, setGroupModalTab] =
    useState<LinkedEntityModalTab>("existing");
  const [groupModalAction, setGroupModalAction] =
    useState<LinkedEntityModalAction>("link");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupPickerQuery, setGroupPickerQuery] = useState("");
  const [typeModalActiveTab, setTypeModalActiveTab] =
    useState<ServiceTypeModalTab>("basic");
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceModalTab, setServiceModalTab] =
    useState<LinkedEntityModalTab>("existing");
  const [serviceModalAction, setServiceModalAction] =
    useState<LinkedEntityModalAction>("link");
  const [selectedBillingServiceId, setSelectedBillingServiceId] =
    useState<number | null>(null);
  const [editingLinkedServiceIndex, setEditingLinkedServiceIndex] =
    useState<number | null>(null);
  const [servicePickerQuery, setServicePickerQuery] = useState("");
  const [consumablesCapabilityEnabled, setConsumablesCapabilityEnabled] = useState(false);
  const [consumableItems, setConsumableItems] = useState<ConsumableCatalogItem[]>([]);
  const [consumableEditorMode, setConsumableEditorMode] = useState<"existing" | "create" | null>(null);
  const [selectedConsumableId, setSelectedConsumableId] = useState<string>("");
  const [newConsumableName, setNewConsumableName] = useState("");
  const [newConsumableUnit, setNewConsumableUnit] = useState("kos");
  const [serviceForm, setServiceForm] = useState<ServiceFormState>({
    description: "",
    taxRate: "VAT_22",
    grossPrice: "0.00",
    advanceDeduction: false,
    noShow: false,
  });
  /** Snapshot when the transaction service modal opens; footer only when dirty. */
  const [serviceFormSnapshot, setServiceFormSnapshot] =
    useState<ServiceFormState | null>(null);
  const [typeForm, setTypeForm] = useState<TypeFormState>({
    name: "",
    description: "",
    internalDescription: "",
    color: SERVICE_TYPE_DEFAULT_COLOR,
    durationMinutes: 60,
    breakMinutes: 0,
    breakMinutesOverridden: false,
    maxParticipantsPerSession: "",
    groupBookingEnabled: false,
    guestBookingMode: normalizeGuestBookingModeForModules(
      "ALL",
      websiteWidgetModuleEnabled,
      guestAppModuleEnabled,
    ),
    priceCalculationMode: "PER_CLIENT",
    guestLimitUserEmailsText: "",
    serviceGroupId: "",
    availableAllLocations: true,
    locationIds: [],
    serviceLines: [],
    consumableLines: [],
  });
  /** Snapshot when the type modal opens; used to detect edits (footer only when dirty). */
  const [typeFormSnapshot, setTypeFormSnapshot] =
    useState<TypeFormState | null>(null);
  const isTypeEditorMobileTablet = useMediaMaxWidth(939);
  const typeEditorKeyboardOpen = useMobileKeyboardOpen(939);
  const [guestBookingPickerOpen, setGuestBookingPickerOpen] = useState(false);
  const guestBookingSelectRef = useRef<HTMLDivElement>(null);
  const [priceCalculationPickerOpen, setPriceCalculationPickerOpen] = useState(false);
  const priceCalculationSelectRef = useRef<HTMLDivElement>(null);
  const [guestLimitPickerOpen, setGuestLimitPickerOpen] = useState(false);
  const [guestLimitClientQuery, setGuestLimitClientQuery] = useState("");
  const guestLimitClientPickerRef = useRef<HTMLDivElement>(null);
  const [taxRatePickerOpen, setTaxRatePickerOpen] = useState(false);
  const taxRateSelectRef = useRef<HTMLDivElement>(null);
  const sessionTypeDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const guestBookingOptions = useMemo(
    () =>
      guestBookingOptionsForModules(
        locale,
        websiteWidgetModuleEnabled,
        guestAppModuleEnabled,
      ),
    [locale, websiteWidgetModuleEnabled, guestAppModuleEnabled],
  );

  const [isSessionTypesNarrow, setIsSessionTypesNarrow] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 1024px)").matches
      : false,
  );
  const [openTypeMenuId, setOpenTypeMenuId] = useState<number | null>(null);
  const [openServiceMenuId, setOpenServiceMenuId] = useState<number | null>(
    null,
  );
  const [activatingSessionTypeId, setActivatingSessionTypeId] = useState<
    number | null
  >(null);
  const [activatingServiceId, setActivatingServiceId] = useState<number | null>(
    null,
  );
  const [typeActiveFilter, setTypeActiveFilter] = useState<
    "active" | "inactive"
  >("active");
  const [groupActiveFilter, setGroupActiveFilter] = useState<"active" | "inactive">("active");
  const [typeGroupFilter, setTypeGroupFilter] = useState<string>("all");
  const [serviceActiveFilter, setServiceActiveFilter] = useState<
    "active" | "inactive"
  >("active");
  const [cardsActiveFilter, setCardsActiveFilter] = useState<
    "active" | "inactive"
  >("active");
  const [cardTypeFilter, setCardTypeFilter] = useState<"all" | GuestAdminProductType>("all");
  const [cardTypeFilterOpen, setCardTypeFilterOpen] = useState(false);
  const cardTypeFilterRef = useRef<HTMLDivElement | null>(null);
  const [cardServiceFilter, setCardServiceFilter] = useState<GuestAdminProductServiceFilter>("all");
  const [cardServiceFilterOpen, setCardServiceFilterOpen] = useState(false);
  const cardServiceFilterRef = useRef<HTMLDivElement | null>(null);
  const [typeSort, setTypeSort] = useState<ServiceConfigSortState<SessionTypeSortKey>>({
    key: null,
    direction: "asc",
  });
  const [serviceSort, setServiceSort] = useState<ServiceConfigSortState<BillingServiceSortKey>>({
    key: null,
    direction: "asc",
  });
  const [coursesActiveFilter, setCoursesActiveFilter] = useState<
    "active" | "inactive"
  >("active");
  const [typeCategoryFilter, setTypeCategoryFilter] = useState<string>("all");
  const [typeCategoryFilterOpen, setTypeCategoryFilterOpen] = useState(false);
  const typeCategoryFilterRef = useRef<HTMLDivElement | null>(null);
  const [typeDurationFilter, setTypeDurationFilter] = useState<string>("all");
  const [typeVisibilityFilter, setTypeVisibilityFilter] = useState<"all" | GuestBookingMode>("all");
  const [showServiceConfigFilters, setShowServiceConfigFilters] = useState(false);
  const [serviceConfigFilterDraft, setServiceConfigFilterDraft] = useState({
    typeStatus: "active" as "active" | "inactive",
    groupStatus: "active" as "active" | "inactive",
    typeGroup: "all",
    serviceStatus: "active" as "active" | "inactive",
    cardsStatus: "active" as "active" | "inactive",
    coursesStatus: "active" as "active" | "inactive",
    typeCategory: "all",
    typeDuration: "all",
    typeVisibility: "all" as "all" | GuestBookingMode,
  });
  const [typeSearch, setTypeSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [cardSearch, setCardSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [guestCardsFilteredCount, setGuestCardsFilteredCount] = useState(0);
  const [coursesFilteredCount, setCoursesFilteredCount] = useState(0);
  const cardsMembershipsRef = useRef<CardsMembershipsSectionHandle>(null);
  const coursesRef = useRef<CoursesSectionHandle>(null);

  const onGuestCardsFilteredCount = useCallback((n: number) => {
    setGuestCardsFilteredCount(n);
  }, []);
  const onCoursesFilteredCount = useCallback((n: number) => {
    setCoursesFilteredCount(n);
  }, []);

  useEffect(() => {
    if (boot || entitlementsModuleEnabled || !showCardsMembershipsParam) return;
    setSessionTypesSubtab(typesModuleEnabled ? "types" : "transactionServices");
  }, [
    boot,
    entitlementsModuleEnabled,
    showCardsMembershipsParam,
    typesModuleEnabled,
    setSessionTypesSubtab,
  ]);

  useEffect(() => {
    if (!showCardsMemberships) {
      setCardSearch("");
      setCardTypeFilter("all");
      setCardTypeFilterOpen(false);
      setGuestCardsFilteredCount(0);
    }
    if (!showCourses) {
      setCourseSearch("");
      setCoursesFilteredCount(0);
    }
  }, [showCardsMemberships, showCourses]);

  useEffect(() => {
    if (!typeCategoryFilterOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!typeCategoryFilterRef.current?.contains(event.target as Node)) {
        setTypeCategoryFilterOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTypeCategoryFilterOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [typeCategoryFilterOpen]);

  useEffect(() => {
    if (!cardTypeFilterOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!cardTypeFilterRef.current?.contains(event.target as Node)) {
        setCardTypeFilterOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCardTypeFilterOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cardTypeFilterOpen]);

  useEffect(() => {
    if (!cardServiceFilterOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!cardServiceFilterRef.current?.contains(event.target as Node)) {
        setCardServiceFilterOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCardServiceFilterOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cardServiceFilterOpen]);

  useEffect(() => {
    if (
      isSessionTypesNarrow ||
      showCourses ||
      showServiceGroups ||
      showCardsMemberships ||
      showTransactionServices
    ) {
      setTypeCategoryFilterOpen(false);
    }
    if (isSessionTypesNarrow || !showCardsMemberships) {
      setCardTypeFilterOpen(false);
      setCardServiceFilterOpen(false);
    }
  }, [
    isSessionTypesNarrow,
    showCourses,
    showServiceGroups,
    showCardsMemberships,
    showTransactionServices,
  ]);

  const taxRateSelectOptions = useMemo(
    () =>
      TAX_RATE_ORDER.map((value) =>
        value === "NO_VAT"
          ? {
              value,
              label: t("sessionTypesTxTaxOptionNoVat"),
              line: "" as const,
            }
          : {
              value,
              label: taxLabels[value],
              line: t(TAX_RATE_LINE_I18N_KEY[value]),
            },
      ),
    [t],
  );

  const taxRateOptionSelected = useMemo(
    () =>
      taxRateSelectOptions.find((o) => o.value === serviceForm.taxRate) ??
      taxRateSelectOptions[2],
    [taxRateSelectOptions, serviceForm.taxRate],
  );

  const transactionServiceTaxDisplay = useCallback(
    (rate: TaxRate) =>
      rate === "NO_VAT" ? t("sessionTypesTxTaxOptionNoVat") : taxLabels[rate],
    [t],
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => setIsSessionTypesNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!showTypeModal) {
      setGuestBookingPickerOpen(false);
      setPriceCalculationPickerOpen(false);
    }
  }, [showTypeModal]);

  useEffect(() => {
    if (!showServiceModal) setTaxRatePickerOpen(false);
  }, [showServiceModal]);

  const syncSessionTypeDescriptionHeight = useCallback(() => {
    const el = sessionTypeDescriptionRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    if (!showTypeModal || typeModalActiveTab !== "basic") return;
    syncSessionTypeDescriptionHeight();
  }, [showTypeModal, typeModalActiveTab, typeForm.description, syncSessionTypeDescriptionHeight]);

  useEffect(() => {
    if (!guestBookingPickerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const root = guestBookingSelectRef.current;
      if (root && !root.contains(e.target as Node))
        setGuestBookingPickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGuestBookingPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [guestBookingPickerOpen]);

  useEffect(() => {
    if (!priceCalculationPickerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const root = priceCalculationSelectRef.current;
      if (root && !root.contains(e.target as Node))
        setPriceCalculationPickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPriceCalculationPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [priceCalculationPickerOpen]);

  useEffect(() => {
    if (!guestLimitPickerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const root = guestLimitClientPickerRef.current;
      if (root && !root.contains(e.target as Node))
        setGuestLimitPickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGuestLimitPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [guestLimitPickerOpen]);

  useEffect(() => {
    if (!taxRatePickerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const root = taxRateSelectRef.current;
      if (root && !root.contains(e.target as Node)) setTaxRatePickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTaxRatePickerOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [taxRatePickerOpen]);

  useEffect(() => {
    if (openTypeMenuId == null) return;
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(".clients-card-menu-wrap") ||
        el?.closest(".clients-card-menu-popover")
      )
        return;
      setOpenTypeMenuId(null);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [openTypeMenuId]);

  useEffect(() => {
    if (openServiceMenuId == null) return;
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(".clients-card-menu-wrap") ||
        el?.closest(".clients-card-menu-popover")
      )
        return;
      setOpenServiceMenuId(null);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [openServiceMenuId]);

  const load = async (force = true) => {
    // Shared service metadata is cached across Calendar, Analytics, Billing and Storitve.
    // Mutation paths keep the old behaviour by forcing these keys stale before reloading.
    if (force) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.typesAll, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.serviceGroupsAll, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.billing.all, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.locations.all, refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all, refetchType: "none" }),
      ]);
    }
    const [nextSettings, nextTypes, nextGroups, nextServices, nextLocations, nextCapabilities] = await Promise.all([
      queryClient.fetchQuery(settingsQueryOptions(activeUnitId)).catch(() => ({} as Record<string, string>)),
      queryClient.fetchQuery(calendarTypesQueryOptions<SessionTypeT>(activeUnitId)).catch(() => [] as SessionTypeT[]),
      queryClient.fetchQuery(serviceGroupsQueryOptions<ServiceGroup>(activeUnitId)).catch(() => [] as ServiceGroup[]),
      queryClient.fetchQuery(billingServicesQueryOptions<BillingService>(activeUnitId)).catch(() => [] as BillingService[]),
      queryClient.fetchQuery(locationsQueryOptions(activeUnitId)).catch(() => [] as LocationT[]),
      queryClient.fetchQuery(moduleCapabilitiesQueryOptions(activeUnitId)).catch(() => ({ consumablesEnabled: false })),
    ]);
    const groupsEnabled = nextSettings.SERVICE_GROUPS_ENABLED !== "false";
    setSettings(nextSettings);
    setTypes(nextTypes);
    setGroups(groupsEnabled ? nextGroups : []);
    setServices(nextServices);
    const activeLocations = nextLocations.filter((location) => location.active !== false);
    setLocations(activeLocations);
    const consumablesEnabled = nextCapabilities.consumablesEnabled === true && nextSettings.CONSUMABLES_ENABLED === "true" && canViewConsumables;
    setConsumablesCapabilityEnabled(consumablesEnabled);
    if (consumablesEnabled) {
      try {
        const inventoryLocationId = selectedLocationId ?? activeLocations[0]?.id;
        const response = await api.get("/consumables/items", {
          params: inventoryLocationId != null ? { locationId: inventoryLocationId } : undefined,
        });
        const unique = new Map<number, ConsumableCatalogItem>();
        (Array.isArray(response.data) ? response.data : []).forEach((item: ConsumableCatalogItem) => {
          if (item?.id != null && item.active !== false) unique.set(Number(item.id), item);
        });
        setConsumableItems(Array.from(unique.values()).sort((a, b) => String(a.name).localeCompare(String(b.name))));
      } catch {
        setConsumableItems([]);
      }
    } else {
      setConsumableItems([]);
    }
  };

  const loadGuestAppClients = useCallback(async () => {
    if (guestAppClientsLoadedRef.current) return;
    if (guestAppClientsLoadPromiseRef.current) {
      await guestAppClientsLoadPromiseRef.current;
      return;
    }

    setGuestAppClientsLoading(true);
    const request = queryClient
      .fetchQuery(clientOptionsQueryOptions<Client>(activeUnitId, null, 500))
      .then((clientOptions) => {
        setClients((clientOptions || []).filter((client) => client.active !== false));
        guestAppClientsLoadedRef.current = true;
      })
      .catch(() => {
        setClients([]);
      })
      .finally(() => {
        setGuestAppClientsLoading(false);
        guestAppClientsLoadPromiseRef.current = null;
      });
    guestAppClientsLoadPromiseRef.current = request;
    await request;
  }, [activeUnitId, queryClient]);

  useEffect(() => {
    guestAppClientsLoadedRef.current = false;
    guestAppClientsLoadPromiseRef.current = null;
    setClients([]);
  }, [activeUnitId]);

  useEffect(() => {
    if (!isAdmin) return;
    setBoot(true);
    setTypes([]);
    setGroups([]);
    setServices([]);
    setLocations([]);
    void load(false).finally(() => setBoot(false));
  }, [activeUnitId, isAdmin]);

  useEffect(() => {
    if (!boot && showServiceGroupsParam && !serviceGroupsModuleEnabled) {
      setSessionTypesSubtab("types");
    }
  }, [boot, serviceGroupsModuleEnabled, setSessionTypesSubtab, showServiceGroupsParam]);

  useEffect(() => {
    if (
      showTypeModal &&
      typeModalActiveTab === "group" &&
      typeForm.groupBookingEnabled &&
      guestAppModuleEnabled
    ) {
      void loadGuestAppClients();
    }
  }, [
    guestAppModuleEnabled,
    loadGuestAppClients,
    showTypeModal,
    typeForm.groupBookingEnabled,
    typeModalActiveTab,
  ]);

  useEffect(() => {
    if (
      !boot &&
      (showServiceGroupsParam ||
        (typesModuleEnabled && showTransactionServicesParam))
    ) {
      setSessionTypesSubtab("types");
    }
  }, [
    boot,
    setSessionTypesSubtab,
    showServiceGroupsParam,
    showTransactionServicesParam,
    typesModuleEnabled,
  ]);

  const filteredTypes = useMemo(() => {
    const byStatus = types.filter((type) =>
      typeActiveFilter === "inactive"
        ? type.active === false
        : type.active !== false,
    );
    const byGroup = byStatus.filter((type) => {
      if (!serviceGroupsModuleEnabled) return true;
      if (typeGroupFilter === "all") return true;
      if (typeGroupFilter === "ungrouped") return type.serviceGroupId == null;
      return String(type.serviceGroupId ?? "") === typeGroupFilter;
    });
    const byCategory = byGroup.filter((type) =>
      typeCategoryFilter === "all" ? true : typeLinkedCategory(type) === typeCategoryFilter,
    );
    const byDuration = byCategory.filter((type) =>
      typeDurationFilter === "all"
        ? true
        : String(type.durationMinutes ?? "") === typeDurationFilter,
    );
    const byVisibility = byDuration.filter((type) =>
      typeVisibilityFilter === "all"
        ? true
        : sessionTypeVisibilityMode(type) === typeVisibilityFilter,
    );
    const q = typeSearch.trim().toLowerCase();
    const matched = !q ? byVisibility : byVisibility.filter((type) => {
      const linked = (type.linkedServices || [])
        .map((ls) => `${ls.code} ${ls.price != null ? String(ls.price) : ""}`)
        .join(" ");
      const hay = [type.name, type.description ?? "", type.internalDescription ?? "", type.serviceGroupName ?? "", String(type.id), linked]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    const ordered = [...matched].sort((a, b) => {
      const ga = a.serviceGroupSortOrder ?? Number.MAX_SAFE_INTEGER;
      const gb = b.serviceGroupSortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ga !== gb) return ga - gb;
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      return so || a.name.localeCompare(b.name);
    });
    return sortServiceConfigRows(
      ordered,
      typeSort,
      (type, key) => {
        if (key === "name") return type.description?.trim() || type.name;
        if (key === "category") return typeLinkedCategory(type);
        if (key === "duration") return type.durationMinutes;
        if (key === "price") return typeGrossPrice(type);
        return type.active === false ? 0 : 1;
      },
      locale,
    );
  }, [
    types,
    typeSearch,
    typeActiveFilter,
    typeGroupFilter,
    typeCategoryFilter,
    typeDurationFilter,
    typeVisibilityFilter,
    typeSort,
    locale,
  ]);

  const activeTypes = useMemo(
    () => types.filter((type) => type.active !== false),
    [types],
  );

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return groups
      .filter((group) => groupActiveFilter === "inactive" ? group.active === false : group.active !== false)
      .filter((group) => !q || `${group.name} ${group.description ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [groups, groupSearch, groupActiveFilter]);

  const filteredServices = useMemo(() => {
    const byStatus = services.filter((service) =>
      serviceActiveFilter === "inactive"
        ? service.active === false
        : service.active !== false,
    );
    const q = serviceSearch.trim().toLowerCase();
    const matched = !q ? byStatus : byStatus.filter((s) => {
      const taxHay =
        s.taxRate === "NO_VAT"
          ? `${taxLabels[s.taxRate]} ${t("sessionTypesTxTaxOptionNoVat")}`
          : taxLabels[s.taxRate];
      const hay = [
        s.code,
        s.description,
        String(s.id),
        taxHay,
        String(s.netPrice),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return sortServiceConfigRows(
      matched,
      serviceSort,
      (service, key) => {
        if (key === "name") return service.code;
        if (key === "category") return service.description;
        if (key === "price") return transactionServiceGross(service);
        if (key === "tax") return taxLabels[service.taxRate];
        return service.active === false ? 0 : 1;
      },
      locale,
    );
  }, [services, serviceSearch, t, serviceActiveFilter, serviceSort, locale]);

  const groupPickerOptions = useMemo(() => {
    const q = groupPickerQuery.trim().toLowerCase();
    return groups
      .filter(
        (group) =>
          group.active !== false || String(group.id) === typeForm.serviceGroupId,
      )
      .filter(
        (group) =>
          !q ||
          `${group.name} ${group.description ?? ""}`.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
  }, [groupPickerQuery, groups, typeForm.serviceGroupId]);

  const billingServicePickerOptions = useMemo(() => {
    const q = servicePickerQuery.trim().toLowerCase();
    const linkedIds = new Set(
      typeForm.serviceLines.map((line) => line.transactionServiceId),
    );
    return services
      .filter(
        (service) => service.active !== false || linkedIds.has(service.id),
      )
      .filter((service) => {
        if (!q) return true;
        return `${service.code} ${service.description} ${taxLabels[service.taxRate]}`
          .toLowerCase()
          .includes(q);
      });
  }, [servicePickerQuery, services, typeForm.serviceLines]);

  const selectedTypeServiceGroup = useMemo(
    () =>
      groups.find((group) => String(group.id) === typeForm.serviceGroupId) ??
      null,
    [groups, typeForm.serviceGroupId],
  );

  const guestLimitSelectedEmails = useMemo(
    () => parseGuestLimitUserEmails(typeForm.guestLimitUserEmailsText),
    [typeForm.guestLimitUserEmailsText],
  );

  const guestLimitClientsByEmail = useMemo(() => {
    const map = new Map<string, Client>();
    for (const client of clients) {
      const email = (client.email || "").trim().toLowerCase();
      if (email) map.set(email, client);
    }
    return map;
  }, [clients]);

  const guestLimitSelectedEntries = useMemo(
    () =>
      guestLimitSelectedEmails.map((email) => {
        const client = guestLimitClientsByEmail.get(email);
        return {
          email,
          name: client ? clientFullName(client) : email,
          initials: client
            ? clientInitials(client)
            : email.charAt(0).toUpperCase(),
        };
      }),
    [guestLimitClientsByEmail, guestLimitSelectedEmails],
  );

  const guestAppClients = useMemo(
    () =>
      clients
        .filter(
          (client) =>
            client.active !== false &&
            client.guestAppLinked === true &&
            Boolean((client.email || "").trim()),
        )
        .sort((a, b) =>
          clientFullName(a).localeCompare(clientFullName(b), locale),
        ),
    [clients, locale],
  );

  const guestLimitManualEmail = useMemo(() => {
    const email = normalizeGuestLimitEmail(guestLimitClientQuery);
    return isValidGuestLimitEmail(email) && !guestLimitSelectedEmails.includes(email)
      ? email
      : "";
  }, [guestLimitClientQuery, guestLimitSelectedEmails]);

  const filteredGuestLimitClients = useMemo(() => {
    const q = guestLimitClientQuery.trim().toLowerCase();
    if (!q) return guestAppClients;
    return guestAppClients.filter((client) => {
      const hay = [
        clientFullName(client),
        client.email || "",
        client.phone || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [guestAppClients, guestLimitClientQuery]);

  const setGuestLimitEmails = useCallback((nextEmails: string[]) => {
    setTypeForm((prev) => ({
      ...prev,
      guestLimitUserEmailsText: normalizeGuestLimitUserEmailsText(
        nextEmails.join("\n"),
      ),
    }));
  }, []);

  const addGuestLimitEmail = useCallback((email: string) => {
    const normalized = normalizeGuestLimitEmail(email);
    if (!isValidGuestLimitEmail(normalized)) return;
    setTypeForm((prev) => ({
      ...prev,
      guestLimitUserEmailsText: normalizeGuestLimitUserEmailsText(
        [...parseGuestLimitUserEmails(prev.guestLimitUserEmailsText), normalized].join("\n"),
      ),
    }));
    setGuestLimitClientQuery("");
    setGuestLimitPickerOpen(true);
  }, []);

  const toggleGuestLimitClientEmail = useCallback((email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setTypeForm((prev) => {
      const current = parseGuestLimitUserEmails(prev.guestLimitUserEmailsText);
      const next = current.includes(normalized)
        ? current.filter((entry) => entry !== normalized)
        : [...current, normalized];
      return {
        ...prev,
        guestLimitUserEmailsText: normalizeGuestLimitUserEmailsText(
          next.join("\n"),
        ),
      };
    });
  }, []);

  const multipleClientsPerSessionEnabled =
    settings.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === "true";
  const groupBookingModuleEnabled = settings.GROUP_BOOKING_ENABLED === "true";
  const noShowModuleEnabled = settings.NO_SHOW_ENABLED !== "false";
  const advanceModuleEnabled = settings.BILLING_ADVANCE_ENABLED !== "false";
  const advanceDeductionIds = useMemo(
    () =>
      advanceModuleEnabled
        ? parseAdvanceDeductionServiceIds(
            settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID,
          )
        : new Set<number>(),
    [advanceModuleEnabled, settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID],
  );
  const configuredNoShowServiceId = useMemo(
    () => parseSingleTransactionServiceId(settings.NO_SHOW_TRANSACTION_SERVICE_ID),
    [settings.NO_SHOW_TRANSACTION_SERVICE_ID],
  );

  const transactionServiceCategoryLabel = useCallback(
    (service: BillingService) => {
      const labels: string[] = [];
      if (advanceModuleEnabled && advanceDeductionIds.has(service.id)) labels.push(t("sessionTypesTxAdvanceBadge"));
      if (noShowModuleEnabled && configuredNoShowServiceId === service.id) labels.push(t("sessionTypesTxNoShowBadge"));
      return labels.length
        ? labels.join(" · ")
        : locale === "sl"
          ? "Transakcijska storitev"
          : "Transaction service";
    },
    [advanceDeductionIds, advanceModuleEnabled, configuredNoShowServiceId, noShowModuleEnabled, t, locale],
  );

  const isTypeFormDirty = useMemo(() => {
    if (!typeFormSnapshot) return false;
    return !typeFormsEqual(typeForm, typeFormSnapshot);
  }, [typeForm, typeFormSnapshot]);

  const isServiceFormDirty = useMemo(() => {
    if (!serviceFormSnapshot) return false;
    return !serviceFormsEqual(serviceForm, serviceFormSnapshot);
  }, [serviceForm, serviceFormSnapshot]);

  const transactionServiceNetComputed = useMemo(
    () =>
      netFromGross(
        parseDecimalInput(serviceForm.grossPrice),
        serviceForm.taxRate,
      ),
    [serviceForm.grossPrice, serviceForm.taxRate],
  );

  useEffect(() => {
    if (groupBookingModuleEnabled) return;
    setTypeModalActiveTab((prev) => (prev === "group" ? "basic" : prev));
    setTypeForm((prev) => {
      if (
        prev.groupBookingEnabled !== true &&
        !prev.maxParticipantsPerSession.trim() &&
        !prev.guestLimitUserEmailsText.trim()
      ) {
        return prev;
      }
      return {
        ...prev,
        groupBookingEnabled: false,
        maxParticipantsPerSession: "",
        guestLimitUserEmailsText: "",
      };
    });
  }, [groupBookingModuleEnabled]);

  useEffect(() => {
    setGuestBookingPickerOpen(false);
    setTypeForm((prev) => {
      const nextMode = normalizeGuestBookingModeForModules(
        prev.guestBookingMode,
        websiteWidgetModuleEnabled,
        guestAppModuleEnabled,
      );
      return nextMode === prev.guestBookingMode
        ? prev
        : { ...prev, guestBookingMode: nextMode };
    });
  }, [websiteWidgetModuleEnabled, guestAppModuleEnabled]);

  const submitType = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!isTypeFormDirty) return;
    const normalizedDescription = typeForm.description.trim();
    if (!normalizedDescription) {
      window.alert(
        locale === "sl"
          ? "Opis storitve je obvezen."
          : "Service description is required.",
      );
      return;
    }
    if (!typeForm.availableAllLocations && typeForm.locationIds.length === 0) {
      window.alert(
        locale === "sl"
          ? "Izberite vsaj eno lokacijo ali omogočite vse lokacije."
          : locale === "sr"
            ? "Izaberite najmanje jednu lokaciju ili omogućite sve lokacije."
            : "Select at least one location or enable all locations.",
      );
      return;
    }
    const effectiveGuestBookingMode = normalizeGuestBookingModeForModules(
      typeForm.guestBookingMode,
      websiteWidgetModuleEnabled,
      guestAppModuleEnabled,
    );
    const { widgetGroupBookingEnabled, guestBookingEnabled } =
      flagsFromGuestBookingMode(effectiveGuestBookingMode);
    const maxParticipantsTrimmed = typeForm.maxParticipantsPerSession.trim();
    const effectiveGroupBookingEnabled =
      groupBookingModuleEnabled && typeForm.groupBookingEnabled;
    const maxParticipantsParsed =
      maxParticipantsTrimmed === ""
        ? null
        : (() => {
            const n = Number(maxParticipantsTrimmed);
            if (!Number.isFinite(n)) return null;
            return Math.min(999, Math.max(1, Math.floor(n)));
          })();
    const reservedGuestEmails = effectiveGroupBookingEnabled
      ? parseGuestLimitUserEmails(typeForm.guestLimitUserEmailsText)
      : [];
    if (
      maxParticipantsParsed != null &&
      reservedGuestEmails.length > maxParticipantsParsed
    ) {
      window.alert(
        locale === "sl"
          ? `Število rezerviranih uporabnikov (${reservedGuestEmails.length}) ne sme presegati največjega števila udeležencev (${maxParticipantsParsed}).`
          : `The number of reserved users (${reservedGuestEmails.length}) cannot exceed the maximum participants (${maxParticipantsParsed}).`,
      );
      return;
    }

    const payload = {
      // The backend creates the immutable internal service code on create and
      // preserves it on edit. Users only maintain the visible description.
      description: normalizedDescription,
      internalDescription: typeForm.internalDescription.trim() || null,
      color: normalizeServiceTypeColorForUi(typeForm.color),
      durationMinutes: clampSessionTypeInt0to999(typeForm.durationMinutes),
      breakMinutes: typeForm.breakMinutesOverridden
        ? clampSessionTypeInt0to999(typeForm.breakMinutes)
        : null,
      breakMinutesOverridden: typeForm.breakMinutesOverridden,
      maxParticipantsPerSession: effectiveGroupBookingEnabled
        ? maxParticipantsParsed
        : null,
      groupBookingEnabled: effectiveGroupBookingEnabled,
      widgetGroupBookingEnabled,
      guestBookingEnabled,
      priceCalculationMode: typeForm.priceCalculationMode,
      guestLimitUserEmails: reservedGuestEmails,
      serviceGroupId: serviceGroupsModuleEnabled
        ? typeForm.serviceGroupId
          ? Number(typeForm.serviceGroupId)
          : null
        : undefined,
      sortOrder:
        editingType &&
        (!serviceGroupsModuleEnabled ||
          String(editingType.serviceGroupId ?? "") === typeForm.serviceGroupId)
          ? editingType.sortOrder ?? 0
          : undefined,
      availableAllLocations: typeForm.availableAllLocations,
      locationIds: typeForm.availableAllLocations ? [] : typeForm.locationIds,
      services: typeForm.serviceLines.map((l) => ({
        // UI edits gross per line; API keeps the type-link price in net.
        // Convert using the selected transaction service tax rate.
        // If the field is blank, keep null (fallback to transaction service default).
        price: (() => {
          const gross = parseOptionalNumber(l.price);
          if (gross == null) return null;
          const selectedService = services.find(
            (s) => s.id === l.transactionServiceId,
          );
          return selectedService
            ? netFromGross(gross, selectedService.taxRate)
            : gross;
        })(),
        transactionServiceId: l.transactionServiceId,
      })),
    };
    try {
      const savedResponse = editingType
        ? await api.put(`/types/${editingType.id}`, payload)
        : await api.post("/types", payload);
      const savedTypeId = Number(savedResponse.data?.id ?? editingType?.id);
      if (selectedLocationId != null && Number.isFinite(savedTypeId)) {
        await api.put(
          `/types/${savedTypeId}/location-prices`,
          {
            items: typeForm.serviceLines.map((line) => {
              const gross = parseOptionalNumber(line.locationPrice || "");
              const selectedService = services.find(
                (service) => service.id === line.transactionServiceId,
              );
              return {
                transactionServiceId: line.transactionServiceId,
                price:
                  gross == null
                    ? null
                    : selectedService
                      ? netFromGross(gross, selectedService.taxRate)
                      : gross,
              };
            }),
          },
          { params: { locationId: selectedLocationId } },
        );
      }
      if (consumablesCapabilityEnabled && canEditConsumables && Number.isFinite(savedTypeId)) {
        await api.put(`/consumables/service-types/${savedTypeId}/defaults`,
          typeForm.consumableLines.map((line) => ({
            consumableId: line.consumableId,
            defaultQuantity: Number(line.defaultQuantity || 0),
            quantityMode: line.quantityMode,
            billableOverride: line.billableOverride,
            notes: line.notes?.trim() || null,
          })),
        );
      }
      setEditingType(null);
      setTypeForm({
        name: "",
        description: "",
        internalDescription: "",
        color: SERVICE_TYPE_DEFAULT_COLOR,
        durationMinutes: 60,
        breakMinutes: defaultServiceBreakMinutes,
        breakMinutesOverridden: false,
        maxParticipantsPerSession: "",
        groupBookingEnabled: false,
        guestBookingMode: normalizeGuestBookingModeForModules(
          "ALL",
          websiteWidgetModuleEnabled,
          guestAppModuleEnabled,
        ),
        priceCalculationMode: "PER_CLIENT",
        guestLimitUserEmailsText: "",
        serviceGroupId: "",
        availableAllLocations: true,
        locationIds: [],
        serviceLines: [],
        consumableLines: [],
      });
      setTypeFormSnapshot(null);
      setGuestLimitPickerOpen(false);
      setGuestLimitClientQuery("");
      setShowTypeModal(false);
      void load();
    } catch (err) {
      window.alert(readApiMessage(err, "Failed to save service type."));
    }
  };

  const removeType = async (id: number) => {
    if (!isAdmin) return;
    if (!window.confirm("Delete this type?")) return;
    try {
      await api.delete(`/types/${id}`);
      void load();
    } catch (err) {
      window.alert(readApiMessage(err, "Failed to delete service type."));
    }
  };

  const submitGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !groupForm.name.trim()) return;
    const payload = {
      name: groupForm.name.trim(),
      description: groupForm.description.trim(),
      active: groupForm.active,
      sortOrder: editingGroup?.sortOrder,
    };
    try {
      const response = editingGroup
        ? await api.put<ServiceGroup>(
            `/service-groups/${editingGroup.id}`,
            payload,
          )
        : await api.post<ServiceGroup>("/service-groups", payload);
      const savedGroup = response.data;
      if (groupModalAction === "link" && savedGroup?.id != null) {
        setTypeForm((current) => ({
          ...current,
          serviceGroupId: String(savedGroup.id),
        }));
      }
      setShowGroupModal(false);
      setEditingGroup(null);
      setGroupForm({ name: "", description: "", active: true });
      setGroupPickerQuery("");
      setSelectedGroupId("");
      await load();
    } catch (err) {
      window.alert(readApiMessage(err, locale === "sl" ? "Skupine storitev ni bilo mogoče shraniti." : "Failed to save service group."));
    }
  };

  const openNewGroupModal = () => {
    setEditingGroup(null);
    setGroupForm({ name: "", description: "", active: true });
    setGroupModalAction("link");
    setGroupModalTab("create");
    setSelectedGroupId("");
    setGroupPickerQuery("");
    setShowGroupModal(true);
  };

  const openGroupEdit = (group: ServiceGroup) => {
    setEditingGroup(group);
    setGroupForm({ name: group.name, description: group.description || "", active: group.active !== false });
    setGroupModalAction("edit");
    setGroupModalTab("create");
    setSelectedGroupId(String(group.id));
    setGroupPickerQuery("");
    setShowGroupModal(true);
  };

  const openGroupLinkModal = () => {
    setEditingGroup(null);
    setGroupForm({ name: "", description: "", active: true });
    setGroupModalAction("link");
    setGroupModalTab("existing");
    setSelectedGroupId(typeForm.serviceGroupId);
    setGroupPickerQuery("");
    setShowGroupModal(true);
  };

  const linkSelectedGroup = () => {
    setTypeForm((current) => ({
      ...current,
      serviceGroupId: selectedGroupId,
    }));
    setShowGroupModal(false);
    setSelectedGroupId("");
    setGroupPickerQuery("");
  };

  const toggleGroupActive = async (group: ServiceGroup, nextActive: boolean) => {
    try {
      await api.put(`/service-groups/${group.id}`, {
        name: group.name,
        description: group.description || "",
        active: nextActive,
        sortOrder: group.sortOrder,
      });
      await load();
    } catch (err) {
      window.alert(readApiMessage(err, locale === "sl" ? "Statusa skupine ni bilo mogoče spremeniti." : "Failed to update service group status."));
    }
  };

  const removeGroup = async (group: ServiceGroup) => {
    const message = locale === "sl"
      ? `Izbrišem skupino »${group.name}«? Dodeljene storitve bodo ostale in bodo premaknjene med storitve brez skupine.`
      : `Delete “${group.name}”? Assigned services will remain and become ungrouped.`;
    if (!window.confirm(message)) return;
    try {
      await api.delete(`/service-groups/${group.id}`);
      if (typeGroupFilter === String(group.id)) setTypeGroupFilter("all");
      await load();
    } catch (err) {
      window.alert(readApiMessage(err, locale === "sl" ? "Skupine ni bilo mogoče izbrisati." : "Failed to delete service group."));
    }
  };

  const moveGroup = async (group: ServiceGroup, delta: -1 | 1) => {
    const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const index = ordered.findIndex((item) => item.id === group.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      const response = await api.put<ServiceGroup[]>("/service-groups/reorder", { ids: ordered.map((item) => item.id) });
      setGroups(response.data || []);
      await load();
    } catch (err) {
      window.alert(readApiMessage(err, locale === "sl" ? "Vrstnega reda ni bilo mogoče shraniti." : "Failed to save group order."));
    }
  };

  const moveTypeWithinGroup = async (type: SessionTypeT, delta: -1 | 1) => {
    const groupId = type.serviceGroupId ?? null;
    const ordered = types
      .filter((item) => (item.serviceGroupId ?? null) === groupId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    const index = ordered.findIndex((item) => item.id === type.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await api.put("/types/reorder", {
        items: ordered.map((item, sortOrder) => ({ id: item.id, serviceGroupId: groupId, sortOrder })),
      });
      await load();
    } catch (err) {
      window.alert(readApiMessage(err, locale === "sl" ? "Vrstnega reda storitev ni bilo mogoče shraniti." : "Failed to save service order."));
    }
  };

  const toggleTypeActive = async (type: SessionTypeT, nextActive: boolean) => {
    if (!isAdmin) return;
    const effectiveGuestBookingMode = normalizeGuestBookingModeForModules(
      guestBookingModeFromFlags(
        type.widgetGroupBookingEnabled === true,
        type.guestBookingEnabled !== false,
      ),
      websiteWidgetModuleEnabled,
      guestAppModuleEnabled,
    );
    const { widgetGroupBookingEnabled, guestBookingEnabled } =
      flagsFromGuestBookingMode(effectiveGuestBookingMode);
    setActivatingSessionTypeId(type.id);
    try {
      await api.put(`/types/${type.id}`, {
        name: normalizeServiceTypeCode(type.name),
        description: type.description || "",
        internalDescription: type.internalDescription || null,
        color: normalizeServiceTypeColorForUi(type.color),
        active: nextActive,
        durationMinutes: clampSessionTypeInt0to999(type.durationMinutes ?? 60),
        breakMinutes: type.breakMinutesOverridden === true
          ? clampSessionTypeInt0to999(type.breakMinutes ?? 0)
          : null,
        breakMinutesOverridden: type.breakMinutesOverridden === true,
        maxParticipantsPerSession:
          groupBookingModuleEnabled && type.groupBookingEnabled === true
            ? type.maxParticipantsPerSession ?? null
            : null,
        groupBookingEnabled:
          groupBookingModuleEnabled && type.groupBookingEnabled === true,
        widgetGroupBookingEnabled,
        guestBookingEnabled,
        priceCalculationMode: type.priceCalculationMode ?? "PER_CLIENT",
        guestLimitUserEmails:
          groupBookingModuleEnabled && type.groupBookingEnabled === true
            ? type.guestLimitUserEmails ?? []
            : [],
        serviceGroupId: type.serviceGroupId ?? null,
        sortOrder: type.sortOrder ?? 0,
        services: (type.linkedServices || []).map((ls) => ({
          transactionServiceId: ls.transactionServiceId,
          price: ls.price ?? null,
        })),
      });
      setOpenTypeMenuId(null);
      void load();
    } catch (err) {
      window.alert(
        readApiMessage(err, "Failed to update service type status."),
      );
    } finally {
      setActivatingSessionTypeId(null);
    }
  };

  const serviceSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (serviceModalAction === "linked-price") {
      if (selectedBillingServiceId == null) return;
      // When editing a price from the existing-service picker, allow the default
      // price to be accepted unchanged so the service can still be linked.
      if (editingLinkedServiceIndex != null && !isServiceFormDirty) return;
      const localGrossPrice = serviceForm.grossPrice.trim();
      setTypeForm((current) => {
        if (editingLinkedServiceIndex != null) {
          if (!current.serviceLines[editingLinkedServiceIndex]) return current;
          return {
            ...current,
            serviceLines: current.serviceLines.map((line, index) =>
              index === editingLinkedServiceIndex
                ? { ...line, price: localGrossPrice }
                : line,
            ),
          };
        }
        if (
          current.serviceLines.some(
            (line) => line.transactionServiceId === selectedBillingServiceId,
          )
        ) {
          return current;
        }
        return {
          ...current,
          serviceLines: [
            ...current.serviceLines,
            {
              transactionServiceId: selectedBillingServiceId,
              price: localGrossPrice,
            },
          ],
        };
      });
      setShowServiceModal(false);
      setEditingLinkedServiceIndex(null);
      setSelectedBillingServiceId(null);
      setServicePickerQuery("");
      setServiceFormSnapshot(null);
      return;
    }

    if (!isServiceFormDirty) return;
    const netPrice = netFromGross(
      parseDecimalInput(serviceForm.grossPrice),
      serviceForm.taxRate,
    );
    const payload = {
      description: serviceForm.description.trim(),
      taxRate: serviceForm.taxRate,
      netPrice,
    };
    const wantAdvance = advanceModuleEnabled && serviceForm.advanceDeduction === true;
    const wantNoShow = noShowModuleEnabled && serviceForm.noShow === true;

    let savedId: number;
    try {
      if (editingServiceId) {
        await api.put<BillingService>(
          `/billing/services/${editingServiceId}`,
          payload,
        );
        savedId = editingServiceId;
      } else {
        const { data } = await api.post<BillingService>(
          "/billing/services",
          payload,
        );
        savedId = data.id;
      }

      const nextAdvanceIds = new Set(advanceDeductionIds);
      if (wantAdvance) {
        nextAdvanceIds.add(savedId);
      } else {
        nextAdvanceIds.delete(savedId);
      }
      if (
        serializeAdvanceDeductionServiceIds(nextAdvanceIds) !==
        serializeAdvanceDeductionServiceIds(advanceDeductionIds)
      ) {
        const { data: nextSettings } = await api.put<Record<string, string>>(
          "/settings",
          {
            ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID:
              serializeAdvanceDeductionServiceIds(nextAdvanceIds),
          },
        );
        setSettings(nextSettings);
      }

      if (noShowModuleEnabled) {
        const nextNoShowId = wantNoShow
          ? savedId
          : configuredNoShowServiceId === savedId
            ? null
            : configuredNoShowServiceId;
        if (
          serializeSingleTransactionServiceId(nextNoShowId) !==
          serializeSingleTransactionServiceId(configuredNoShowServiceId)
        ) {
          const { data: nextSettings } = await api.put<Record<string, string>>(
            "/settings",
            {
              NO_SHOW_TRANSACTION_SERVICE_ID:
                serializeSingleTransactionServiceId(nextNoShowId),
            },
          );
          setSettings(nextSettings);
        }
      }

      if (serviceModalAction === "link") {
        setTypeForm((current) => {
          if (
            current.serviceLines.some(
              (line) => line.transactionServiceId === savedId,
            )
          ) {
            return current;
          }
          return {
            ...current,
            serviceLines: [
              ...current.serviceLines,
              {
                transactionServiceId: savedId,
                price: serviceForm.grossPrice,
              },
            ],
          };
        });
      }

      setEditingServiceId(null);
      setServiceForm({
        description: "",
        taxRate: "VAT_22",
        grossPrice: "0.00",
        advanceDeduction: false,
        noShow: false,
      });
      setServiceFormSnapshot(null);
      setShowServiceModal(false);
      setSelectedBillingServiceId(null);
      setServicePickerQuery("");
      void load();
    } catch (err) {
      window.alert(readApiMessage(err, "Failed to save transaction service."));
    }
  };

  const deleteService = async (id: number) => {
    if (!isAdmin) return;
    if (!window.confirm("Delete this transaction service?")) return;
    try {
      await api.delete(`/billing/services/${id}`);
      const nextAdvanceIds = new Set(advanceDeductionIds);
      nextAdvanceIds.delete(id);
      if (
        serializeAdvanceDeductionServiceIds(nextAdvanceIds) !==
        serializeAdvanceDeductionServiceIds(advanceDeductionIds)
      ) {
        const { data: nextSettings } = await api.put<Record<string, string>>(
          "/settings",
          {
            ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID:
              serializeAdvanceDeductionServiceIds(nextAdvanceIds),
          },
        );
        setSettings(nextSettings);
      }
      const nextNoShowId = configuredNoShowServiceId === id ? null : configuredNoShowServiceId;
      if (
        serializeSingleTransactionServiceId(nextNoShowId) !==
        serializeSingleTransactionServiceId(configuredNoShowServiceId)
      ) {
        const { data: nextSettings } = await api.put<Record<string, string>>(
          "/settings",
          {
            NO_SHOW_TRANSACTION_SERVICE_ID:
              serializeSingleTransactionServiceId(nextNoShowId),
          },
        );
        setSettings(nextSettings);
      }
      void load();
    } catch (err) {
      window.alert(
        readApiMessage(err, "Failed to delete transaction service."),
      );
    }
  };

  const toggleServiceActive = async (
    service: BillingService,
    nextActive: boolean,
  ) => {
    if (!isAdmin) return;
    setActivatingServiceId(service.id);
    try {
      await api.put(`/billing/services/${service.id}`, {
        code: service.code,
        description: service.description,
        taxRate: service.taxRate,
        netPrice: service.netPrice,
        active: nextActive,
      });
      setOpenServiceMenuId(null);
      void load();
    } catch (err) {
      window.alert(
        readApiMessage(err, "Failed to update transaction service status."),
      );
    } finally {
      setActivatingServiceId(null);
    }
  };

  const typeCategoryOptions = useMemo(
    () => Array.from(new Set(types.map((type) => typeLinkedCategory(type)).filter((value) => value && value !== "—"))).sort((a, b) => a.localeCompare(b)),
    [types],
  );
  const typeDurationOptions = useMemo(
    () => Array.from(new Set(types.map((type) => String(type.durationMinutes ?? "")).filter(Boolean))).sort((a, b) => Number(a) - Number(b)),
    [types],
  );

  if (!isAdmin) {
    return <Navigate to={getDefaultAllowedRoute(me.packageType)} replace />;
  }

  if (boot) {
    return <div className="stack gap-lg" aria-busy="true" />;
  }

  const openTypeEdit = async (type: SessionTypeT) => {
    setEditingType(type);
    const next: TypeFormState = {
      name: type.name,
      description: type.description || "",
      internalDescription: type.internalDescription || "",
      color: normalizeServiceTypeColorForUi(type.color),
      durationMinutes: clampSessionTypeInt0to999(type.durationMinutes ?? 60),
      breakMinutes: clampSessionTypeInt0to999(type.breakMinutes ?? 0),
      breakMinutesOverridden: type.breakMinutesOverridden === true,
      maxParticipantsPerSession:
        groupBookingModuleEnabled &&
        type.maxParticipantsPerSession != null &&
        Number(type.maxParticipantsPerSession) >= 1
          ? normalizeOptionalParticipantsField(
              String(type.maxParticipantsPerSession),
            )
          : "",
      groupBookingEnabled:
        groupBookingModuleEnabled && type.groupBookingEnabled === true,
      guestBookingMode: normalizeGuestBookingModeForModules(
        guestBookingModeFromFlags(
          type.widgetGroupBookingEnabled === true,
          type.guestBookingEnabled !== false,
        ),
        websiteWidgetModuleEnabled,
        guestAppModuleEnabled,
      ),
      priceCalculationMode: type.priceCalculationMode ?? "PER_CLIENT",
      guestLimitUserEmailsText: guestLimitUserEmailsTextFromApi(
        groupBookingModuleEnabled ? type.guestLimitUserEmails : [],
      ),
      serviceGroupId: type.serviceGroupId == null ? "" : String(type.serviceGroupId),
      availableAllLocations: type.availableAllLocations !== false,
      locationIds: type.locationIds || [],
      serviceLines: (type.linkedServices || []).map((ls) => ({
        transactionServiceId: ls.transactionServiceId,
        price:
          ls.unitGross != null
            ? String(ls.unitGross)
            : ls.price != null
              ? (() => {
                  const selectedService = services.find(
                    (s) => s.id === ls.transactionServiceId,
                  );
                  if (!selectedService) return String(ls.price);
                  return grossPriceStringFromNet(
                    ls.price,
                    selectedService.taxRate,
                  );
                })()
              : "",
      })),
      consumableLines: [],
    };
    if (selectedLocationId != null) {
      try {
        const response = await api.get(`/types/${type.id}/location-prices`, {
          params: { locationId: selectedLocationId },
        });
        const byService = new Map<number, string>(
          (Array.isArray(response.data) ? response.data : []).map((row: any) => [
            Number(row.transactionServiceId),
            row.overrideGrossPrice == null ? "" : String(row.overrideGrossPrice),
          ]),
        );
        next.serviceLines = next.serviceLines.map((line) => ({
          ...line,
          locationPrice: byService.get(line.transactionServiceId) || "",
        }));
      } catch {
        next.serviceLines = next.serviceLines.map((line) => ({ ...line, locationPrice: "" }));
      }
    }
    if (consumablesCapabilityEnabled) {
      try {
        const response = await api.get(`/consumables/service-types/${type.id}/defaults`);
        next.consumableLines = (Array.isArray(response.data) ? response.data : []).map((row: any) => ({
          consumableId: Number(row.consumableId),
          defaultQuantity: String(row.defaultQuantity ?? 1),
          quantityMode: row.quantityMode === "PER_PARTICIPANT" ? "PER_PARTICIPANT" : "PER_SESSION",
          billableOverride: row.billableOverride == null ? null : Boolean(row.billableOverride),
          notes: row.notes || "",
        }));
      } catch {
        next.consumableLines = [];
      }
    }
    setTypeForm(next);
    setTypeFormSnapshot({
      ...next,
      serviceLines: next.serviceLines.map((l) => ({ ...l })),
      consumableLines: next.consumableLines.map((l) => ({ ...l })),
    });
    setTypeModalActiveTab("basic");
    setGuestLimitPickerOpen(false);
    setGuestLimitClientQuery("");
    setShowTypeModal(true);
    setOpenTypeMenuId(null);
  };

  const openServiceEdit = (s: BillingService) => {
    setEditingLinkedServiceIndex(null);
    setEditingServiceId(s.id);
    const next: ServiceFormState = {
      description: s.description,
      taxRate: s.taxRate,
      grossPrice: grossPriceStringFromNet(Number(s.netPrice), s.taxRate),
      advanceDeduction: advanceDeductionIds.has(s.id),
      noShow: noShowModuleEnabled && configuredNoShowServiceId === s.id,
    };
    setServiceForm(next);
    setServiceFormSnapshot({ ...next });
    setServiceModalAction("edit");
    setServiceModalTab("create");
    setSelectedBillingServiceId(s.id);
    setServicePickerQuery("");
    setShowServiceModal(true);
    setOpenServiceMenuId(null);
  };

  if (
    !typesModuleEnabled &&
    !showTransactionServices &&
    !showCardsMemberships
  ) {
    return <Navigate to="/configuration" replace />;
  }

  const activeStatusLabel = locale === "sl" ? "Aktivna" : "Active";
  const inactiveStatusLabel = locale === "sl" ? "Neaktivna" : "Inactive";
  const activeFilterLabel = locale === "sl" ? "Aktivno" : "Active";
  const inactiveFilterLabel = locale === "sl" ? "Neaktivno" : "Inactive";
  const typeCategoryFilterLabel = locale === "sl" ? "Kategorija" : "Category";
  const allTypeCategoriesLabel = locale === "sl" ? "Vse kategorije" : "All categories";
  const selectedTypeCategoryLabel = typeCategoryFilter === "all" ? allTypeCategoriesLabel : typeCategoryFilter;
  const cardTypeFilterLabel = locale === "sl" ? "Tip" : "Type";
  const allCardTypesLabel = locale === "sl" ? "Vsi tipi" : "All types";
  const cardTypeFilterOptions: Array<{ value: GuestAdminProductType; label: string }> = [
    { value: "PACK", label: locale === "sl" ? "Paket obiskov" : "Visit package" },
    { value: "MEMBERSHIP", label: locale === "sl" ? "Članarina" : "Membership" },
    ...(giftCardsModuleEnabled
      ? [{ value: "GIFT_CARD" as const, label: locale === "sl" ? "Bon" : "Voucher" }]
      : []),
    ...(coursesModuleEnabled
      ? [{ value: "COURSE" as const, label: locale === "sl" ? "Dostop do tečaja" : "Course access" }]
      : []),
  ];
  const selectedCardTypeLabel =
    cardTypeFilter === "all"
      ? allCardTypesLabel
      : cardTypeFilterOptions.find((option) => option.value === cardTypeFilter)?.label ?? cardTypeFilter;
  const cardServiceFilterLabel = locale === "sl" ? "Storitev" : "Service";
  const cardServiceFilterOptions: Array<{ value: GuestAdminProductServiceFilter; label: string }> = [
    { value: "all", label: locale === "sl" ? "Vse storitve" : "All services" },
    { value: "all-services", label: locale === "sl" ? "Velja za vse" : "Valid for all" },
    { value: "selected-services", label: locale === "sl" ? "Izbrane storitve" : "Selected services" },
    { value: "service-groups", label: locale === "sl" ? "Skupine storitev" : "Service groups" },
  ];
  const selectedCardServiceFilterLabel =
    cardServiceFilterOptions.find((option) => option.value === cardServiceFilter)?.label
    ?? cardServiceFilterOptions[0].label;
  const serviceConfigActiveFilter = showCourses
    ? coursesActiveFilter
    : showCardsMemberships
      ? cardsActiveFilter
      : showServiceGroups
        ? groupActiveFilter
        : showTransactionServices
          ? serviceActiveFilter
          : typeActiveFilter;

  const toggleServiceConfigActiveFilter = () => {
    if (showCourses) {
      setCoursesActiveFilter((previous) =>
        previous === "active" ? "inactive" : "active",
      );
      return;
    }
    if (showCardsMemberships) {
      setCardsActiveFilter((previous) =>
        previous === "active" ? "inactive" : "active",
      );
      return;
    }
    if (showServiceGroups) {
      setGroupActiveFilter((previous) =>
        previous === "active" ? "inactive" : "active",
      );
      return;
    }
    if (showTransactionServices) {
      setServiceActiveFilter((previous) =>
        previous === "active" ? "inactive" : "active",
      );
      return;
    }
    setTypeActiveFilter((previous) =>
      previous === "active" ? "inactive" : "active",
    );
  };

  const cardServiceFilterControl = showCardsMemberships && !isSessionTypesNarrow ? (
    <div className="clients-owner-filter service-config-category-filter" ref={cardServiceFilterRef}>
      <button
        type="button"
        className={`clients-owner-filter__button${cardServiceFilter !== "all" ? " clients-owner-filter__button--active" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={cardServiceFilterOpen}
        onClick={() => setCardServiceFilterOpen((open) => !open)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5h16l-6.3 7.2V18l-3.4 1.8v-7.6L4 5Z" />
        </svg>
        <span className="clients-owner-filter__label">{cardServiceFilterLabel}:</span>
        <strong>{selectedCardServiceFilterLabel}</strong>
        <svg className={`clients-owner-filter__chevron${cardServiceFilterOpen ? " clients-owner-filter__chevron--open" : ""}`} width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {cardServiceFilterOpen && (
        <div className="clients-owner-filter__menu" role="listbox" aria-label={cardServiceFilterLabel}>
          {cardServiceFilterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={cardServiceFilter === option.value}
              className={cardServiceFilter === option.value ? "clients-owner-filter__option active" : "clients-owner-filter__option"}
              onClick={() => {
                setCardServiceFilter(option.value);
                setCardServiceFilterOpen(false);
              }}
            >
              <span>{option.label}</span>
              {cardServiceFilter === option.value && <span className="clients-owner-filter__check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const groupsPanelBody =
    groups.length === 0 ? (
      <EmptyState
        title={locale === "sl" ? "Še ni skupin storitev" : "No service groups yet"}
        text={locale === "sl" ? "Ustvarite skupino in vanjo povežite različna trajanja ali različice iste storitve." : "Create a group and assign related service variants or durations to it."}
      />
    ) : filteredGroups.length === 0 ? (
      <EmptyState
        title={t("calendarFilterSearchNoResults")}
        text={locale === "sl" ? "Nobena skupina ne ustreza izbranim filtrom." : "No service groups match the selected filters."}
      />
    ) : (
      <div className="clients-list-shell service-config-list-shell service-groups-list-shell">
        <div className="clients-mobile-list service-config-mobile-list">
          {filteredGroups.map((group, index) => (
            <article
              key={group.id}
              className="clients-mobile-card service-config-mobile-card"
              role="button"
              tabIndex={0}
              onClick={() => openGroupEdit(group)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGroupEdit(group); } }}
            >
              <div className="clients-mobile-card-head">
                <ServiceConfigNameCell
                  title={group.name}
                  subtitle={`${group.serviceCount ?? 0} ${locale === "sl" ? ((group.serviceCount ?? 0) === 1 ? "storitev" : "storitvi") : ((group.serviceCount ?? 0) === 1 ? "service" : "services")}`}
                  visual={serviceConfigVisual(index)}
                />
                <button
                  type="button"
                  className="secondary clients-card-menu-trigger service-config-menu-trigger"
                  onClick={(e) => { e.stopPropagation(); openGroupEdit(group); }}
                  aria-label={locale === "sl" ? "Dejanja skupine" : "Group actions"}
                >
                  ⋮
                </button>
              </div>
              <div className="clients-mobile-meta">
                <div><span>{locale === "sl" ? "Storitve" : "Services"}</span><strong>{group.serviceCount ?? 0}</strong></div>
                <div><span>{locale === "sl" ? "Vrstni red" : "Order"}</span><strong className="service-order-controls"><button type="button" onClick={(e) => { e.stopPropagation(); void moveGroup(group, -1); }} aria-label="Move up">↑</button><button type="button" onClick={(e) => { e.stopPropagation(); void moveGroup(group, 1); }} aria-label="Move down">↓</button></strong></div>
                <div><span>Status</span><strong><button type="button" className={`clients-status-pill clients-status-pill-btn${group.active === false ? " clients-status-pill--inactive" : ""}`} onClick={(e) => { e.stopPropagation(); void toggleGroupActive(group, group.active === false); }}><span />{group.active === false ? inactiveStatusLabel : activeStatusLabel}</button></strong></div>
                <div><span>{locale === "sl" ? "Dejanja" : "Actions"}</span><strong><button type="button" className="account-table-action-danger" onClick={(e) => { e.stopPropagation(); void removeGroup(group); }}>{t("formDelete")}</button></strong></div>
              </div>
            </article>
          ))}
        </div>
        <div className="simple-table-wrap clients-table-wrap clients-table-desktop service-config-table-wrap">
          <table className="clients-table service-config-table service-groups-table">
            <thead><tr>
              <th>{locale === "sl" ? "Naziv" : "Name"}</th>
              <th>{locale === "sl" ? "Opis" : "Description"}</th>
              <th>{locale === "sl" ? "Storitve" : "Services"}</th>
              <th>{locale === "sl" ? "Vrstni red" : "Order"}</th>
              <th>Status</th>
              <th>{locale === "sl" ? "Dejanja" : "Actions"}</th>
            </tr></thead>
            <tbody>
              {filteredGroups.map((group, index) => (
                <tr key={group.id} className="clients-row clients-row--clickable" onClick={() => openGroupEdit(group)}>
                  <td><ServiceConfigNameCell title={group.name} subtitle={`ID #${group.id}`} visual={serviceConfigVisual(index)} /></td>
                  <td className="clients-muted">{group.description?.trim() || "—"}</td>
                  <td className="clients-muted">{group.serviceCount ?? 0}</td>
                  <td onClick={(e) => e.stopPropagation()}><span className="service-order-controls"><button type="button" onClick={() => void moveGroup(group, -1)} aria-label="Move up">↑</button><button type="button" onClick={() => void moveGroup(group, 1)} aria-label="Move down">↓</button></span></td>
                  <td><button type="button" className={`clients-status-pill clients-status-pill-btn${group.active === false ? " clients-status-pill--inactive" : ""}`} onClick={(e) => { e.stopPropagation(); void toggleGroupActive(group, group.active === false); }}><span />{group.active === false ? inactiveStatusLabel : activeStatusLabel}</button></td>
                  <td className="clients-actions service-config-actions account-table-actions" onClick={(e) => e.stopPropagation()}>
                    <ServiceConfigEditButton
                      label={locale === "sl" ? "Uredi" : "Edit"}
                      onClick={(e) => {
                        e.stopPropagation();
                        openGroupEdit(group);
                      }}
                    />
                    <ServiceConfigDeleteButton
                      label={t("formDelete")}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeGroup(group);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ServiceConfigTableFooter
          summary={locale === "sl"
            ? `Prikazano ${filteredGroups.length} od ${groups.length} skupin storitev`
            : `Showing ${filteredGroups.length} of ${groups.length} service groups`}
        />
      </div>
    );

  const typesPanelBody =
    types.length === 0 ? (
      <EmptyState
        title={t("sessionTypesEmptyTypesTitle")}
        text={t("sessionTypesEmptyTypesText")}
      />
    ) : filteredTypes.length === 0 ? (
      <EmptyState
        title={t("calendarFilterSearchNoResults")}
        text={t("sessionTypesSearchNoMatchesText")}
      />
    ) : (
      <div className="clients-list-shell service-config-list-shell">
        <div className="clients-mobile-list service-config-mobile-list">
          {filteredTypes.map((type, index) => {
            const price = typeGrossPrice(type);
            return (
              <article
                key={type.id}
                className="clients-mobile-card service-config-mobile-card"
                role="button"
                tabIndex={0}
                onClick={() => openTypeEdit(type)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openTypeEdit(type);
                  }
                }}
              >
                <div className="clients-mobile-card-head">
                  <ServiceConfigNameCell
                    title={
                      [
                        type.description?.trim() ||
                          (locale === "sl" ? "Storitev" : locale === "sr" ? "Usluga" : "Service"),
                        type.internalDescription?.trim(),
                      ].filter(Boolean).join(" — ")
                    }
                    visual={serviceConfigVisual(index)}
                  />
                  <div className="clients-card-menu-wrap">
                    <button
                      type="button"
                      className="secondary clients-card-menu-trigger service-config-menu-trigger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenTypeMenuId((prev) =>
                          prev === type.id ? null : type.id,
                        );
                      }}
                      aria-label="Session type actions"
                      aria-expanded={openTypeMenuId === type.id}
                    >
                      ⋮
                    </button>
                    {openTypeMenuId === type.id && (
                      <div
                        className="clients-card-menu-popover"
                        role="dialog"
                        aria-label="Session type actions"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenTypeMenuId(null);
                            void toggleTypeActive(type, type.active === false);
                          }}
                          disabled={activatingSessionTypeId === type.id}
                        >
                          {activatingSessionTypeId === type.id
                            ? locale === "sl"
                              ? "Shranjujem..."
                              : "Saving..."
                            : type.active === false
                              ? locale === "sl"
                                ? "Aktiviraj"
                                : "Activate"
                              : locale === "sl"
                                ? "Deaktiviraj"
                                : "Deactivate"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenTypeMenuId(null);
                            void removeType(type.id);
                          }}
                          disabled={activatingSessionTypeId === type.id}
                        >
                          {t("formDelete")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="clients-mobile-meta">
                  {serviceGroupsModuleEnabled ? (
                    <div>
                      <span>{locale === "sl" ? "Skupina" : "Group"}</span>
                      <strong>{type.serviceGroupName || (locale === "sl" ? "Brez skupine" : "Ungrouped")}</strong>
                    </div>
                  ) : null}
                  <div>
                    <span>{locale === "sl" ? "Vrstni red" : "Order"}</span>
                    <strong className="service-order-controls">
                      <button type="button" onClick={(e) => { e.stopPropagation(); void moveTypeWithinGroup(type, -1); }} aria-label="Move up">↑</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); void moveTypeWithinGroup(type, 1); }} aria-label="Move down">↓</button>
                    </strong>
                  </div>
                  <div>
                    <span>{locale === "sl" ? "Trajanje" : "Duration"}</span>
                    <strong>
                      {type.durationMinutes != null
                        ? `${type.durationMinutes} min`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>{locale === "sl" ? "Cena" : "Price"}</span>
                    <strong>{price != null ? currency(price) : "—"}</strong>
                  </div>
                  <div>
                    <span>{locale === "sl" ? "Status" : "Status"}</span>
                    <strong>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${type.active === false ? " clients-status-pill--inactive" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleTypeActive(type, type.active === false);
                        }}
                        disabled={activatingSessionTypeId === type.id}
                      >
                        <span />
                        {type.active === false
                          ? inactiveStatusLabel
                          : activeStatusLabel}
                      </button>
                    </strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="simple-table-wrap clients-table-wrap clients-table-desktop session-types-table-wrap service-config-table-wrap">
          <table className="clients-table session-types-table service-config-table">
            <thead>
              <tr>
                <ServiceConfigSortableTableHeader label={locale === "sl" ? "Naziv" : "Name"} sortKey="name" sortState={typeSort} onSort={(key) => setTypeSort((current) => nextServiceConfigSortState(current, key))} />
                <ServiceConfigSortableTableHeader label={locale === "sl" ? "Kategorija" : "Category"} sortKey="category" sortState={typeSort} onSort={(key) => setTypeSort((current) => nextServiceConfigSortState(current, key))} />
                <ServiceConfigSortableTableHeader label={locale === "sl" ? "Trajanje" : "Duration"} sortKey="duration" sortState={typeSort} onSort={(key) => setTypeSort((current) => nextServiceConfigSortState(current, key))} />
                <ServiceConfigSortableTableHeader label={locale === "sl" ? "Cena" : "Price"} sortKey="price" sortState={typeSort} onSort={(key) => setTypeSort((current) => nextServiceConfigSortState(current, key))} />
                <ServiceConfigSortableTableHeader label={locale === "sl" ? "Status" : "Status"} sortKey="status" sortState={typeSort} onSort={(key) => setTypeSort((current) => nextServiceConfigSortState(current, key))} />
                <th>{locale === "sl" ? "Dejanja" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTypes.map((type, index) => {
                const price = typeGrossPrice(type);
                return (
                  <tr
                    key={type.id}
                    className="clients-row clients-row--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openTypeEdit(type)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openTypeEdit(type);
                      }
                    }}
                  >
                    <td>
                      <div className="service-config-name-with-group">
                        <ServiceConfigNameCell
                          title={
                            [
                              type.description?.trim() ||
                                (locale === "sl" ? "Storitev" : locale === "sr" ? "Usluga" : "Service"),
                              type.internalDescription?.trim(),
                            ].filter(Boolean).join(" — ")
                          }
                          visual={serviceConfigVisual(index)}
                        />
                        {serviceGroupsModuleEnabled ? (
                          <span className={`service-group-indicator${type.serviceGroupId == null ? " is-ungrouped" : ""}`}>
                            {type.serviceGroupName || (locale === "sl" ? "Brez skupine" : "Ungrouped")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="clients-muted service-config-category-cell">
                      {typeLinkedCategory(type)}
                    </td>
                    <td className="clients-muted">
                      {type.durationMinutes != null
                        ? `${type.durationMinutes} min`
                        : "—"}
                    </td>
                    <td className="clients-muted service-config-price-cell">
                      {price != null ? currency(price) : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${type.active === false ? " clients-status-pill--inactive" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleTypeActive(type, type.active === false);
                        }}
                        disabled={activatingSessionTypeId === type.id}
                      >
                        <span />
                        {type.active === false
                          ? inactiveStatusLabel
                          : activeStatusLabel}
                      </button>
                    </td>
                    <td className="clients-actions service-config-actions account-table-actions" onClick={(e) => e.stopPropagation()}>
                      <ServiceConfigEditButton
                        label={locale === "sl" ? "Uredi" : "Edit"}
                        onClick={(e) => {
                          e.stopPropagation();
                          openTypeEdit(type);
                        }}
                      />
                      <ServiceConfigDeleteButton
                        label={t("formDelete")}
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeType(type.id);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ServiceConfigTableFooter
          summary={locale === "sl"
            ? `Prikazano ${filteredTypes.length} od ${types.length} storitev`
            : `Showing ${filteredTypes.length} of ${types.length} services`}
        />
      </div>
    );

  const transactionServicesPanelBody =
    services.length === 0 ? (
      <EmptyState
        title={t("sessionTypesEmptyServicesTitle")}
        text={t("sessionTypesEmptyServicesText")}
      />
    ) : filteredServices.length === 0 ? (
      <EmptyState
        title={t("calendarFilterSearchNoResults")}
        text={t("sessionTypesSearchNoMatchesText")}
      />
    ) : (
      <div className="clients-list-shell service-config-list-shell">
        <div className="clients-mobile-list service-config-mobile-list">
          {filteredServices.map((s, index) => {
            const gross = transactionServiceGross(s);
            const serviceCategory = transactionServiceCategoryLabel(s);
            return (
              <article
                key={s.id}
                className="clients-mobile-card service-config-mobile-card"
                role="button"
                tabIndex={0}
                onClick={() => openServiceEdit(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openServiceEdit(s);
                  }
                }}
              >
                <div className="clients-mobile-card-head">
                  <ServiceConfigNameCell
                    title={s.code}
                    subtitle={
                      s.description?.trim() ? s.description : `ID #${s.id}`
                    }
                    visual={serviceConfigVisual(index, "list")}
                  />
                  <div className="clients-card-menu-wrap">
                    <button
                      type="button"
                      className="secondary clients-card-menu-trigger service-config-menu-trigger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenServiceMenuId((prev) =>
                          prev === s.id ? null : s.id,
                        );
                      }}
                      aria-label="Transaction service actions"
                      aria-expanded={openServiceMenuId === s.id}
                    >
                      ⋮
                    </button>
                    {openServiceMenuId === s.id && (
                      <div
                        className="clients-card-menu-popover"
                        role="dialog"
                        aria-label="Transaction service actions"
                      >
                        <button
                          type="button"
                          className="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenServiceMenuId(null);
                            void deleteService(s.id);
                          }}
                        >
                          {t("formDelete")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="clients-mobile-meta">
                  <div>
                    <span>{locale === "sl" ? "Kategorija" : "Category"}</span>
                    <strong>
                      {serviceCategory}
                    </strong>
                  </div>
                  <div>
                    <span>{t("sessionTypesTxLabelGross")}</span>
                    <strong>{currency(gross)}</strong>
                  </div>
                  <div>
                    <span>{t("sessionTypesTxLabelTax")}</span>
                    <strong>{transactionServiceTaxDisplay(s.taxRate)}</strong>
                  </div>
                  <div>
                    <span>{locale === "sl" ? "Status" : "Status"}</span>
                    <strong>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${s.active === false ? " clients-status-pill--inactive" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleServiceActive(s, s.active === false);
                        }}
                        disabled={activatingServiceId === s.id}
                      >
                        <span />
                        {s.active === false
                          ? inactiveStatusLabel
                          : activeStatusLabel}
                      </button>
                    </strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="simple-table-wrap clients-table-wrap clients-table-desktop session-types-table-wrap service-config-table-wrap">
          <table className="clients-table session-types-table service-config-table">
            <thead>
              <tr>
                <ServiceConfigSortableTableHeader label={locale === "sl" ? "Naziv" : "Name"} sortKey="name" sortState={serviceSort} onSort={(key) => setServiceSort((current) => nextServiceConfigSortState(current, key))} />
                <ServiceConfigSortableTableHeader label={locale === "sl" ? "Kategorija" : "Category"} sortKey="category" sortState={serviceSort} onSort={(key) => setServiceSort((current) => nextServiceConfigSortState(current, key))} />
                <ServiceConfigSortableTableHeader label={t("sessionTypesTxLabelGross")} sortKey="price" sortState={serviceSort} onSort={(key) => setServiceSort((current) => nextServiceConfigSortState(current, key))} />
                <ServiceConfigSortableTableHeader label={t("sessionTypesTxLabelTax")} sortKey="tax" sortState={serviceSort} onSort={(key) => setServiceSort((current) => nextServiceConfigSortState(current, key))} />
                <ServiceConfigSortableTableHeader label={locale === "sl" ? "Status" : "Status"} sortKey="status" sortState={serviceSort} onSort={(key) => setServiceSort((current) => nextServiceConfigSortState(current, key))} />
                <th>{locale === "sl" ? "Dejanja" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((s, index) => {
                const gross = transactionServiceGross(s);
                const serviceCategory = transactionServiceCategoryLabel(s);
                return (
                  <tr
                    key={s.id}
                    className="clients-row clients-row--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openServiceEdit(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openServiceEdit(s);
                      }
                    }}
                  >
                    <td>
                      <ServiceConfigNameCell
                        title={s.code}
                        subtitle={
                          s.description?.trim() ? s.description : `ID #${s.id}`
                        }
                        visual={serviceConfigVisual(index, "list")}
                      />
                    </td>
                    <td className="clients-muted service-config-category-cell">
                      {serviceCategory}
                    </td>
                    <td className="clients-muted service-config-price-cell">
                      {currency(gross)}
                    </td>
                    <td className="clients-muted">
                      {transactionServiceTaxDisplay(s.taxRate)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${s.active === false ? " clients-status-pill--inactive" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleServiceActive(s, s.active === false);
                        }}
                        disabled={activatingServiceId === s.id}
                      >
                        <span />
                        {s.active === false
                          ? inactiveStatusLabel
                          : activeStatusLabel}
                      </button>
                    </td>
                    <td className="clients-actions service-config-actions account-table-actions" onClick={(e) => e.stopPropagation()}>
                      <ServiceConfigEditButton
                        label={locale === "sl" ? "Uredi" : "Edit"}
                        onClick={(e) => {
                          e.stopPropagation();
                          openServiceEdit(s);
                        }}
                      />
                      <ServiceConfigDeleteButton
                        label={t("formDelete")}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteService(s.id);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ServiceConfigTableFooter
          summary={locale === "sl"
            ? `Prikazano ${filteredServices.length} od ${services.length} obračunskih storitev`
            : `Showing ${filteredServices.length} of ${services.length} billing services`}
        />
      </div>
    );

  const addConsumableToType = (item: ConsumableCatalogItem) => {
    if (typeForm.consumableLines.some((line) => line.consumableId === item.id)) {
      setConsumableEditorMode(null);
      setSelectedConsumableId("");
      return;
    }
    setTypeForm((current) => ({
      ...current,
      consumableLines: [
        ...current.consumableLines,
        {
          consumableId: item.id,
          defaultQuantity: "1",
          quantityMode: "PER_SESSION",
          billableOverride: item.billable === true,
          notes: "",
        },
      ],
    }));
    setConsumableEditorMode(null);
    setSelectedConsumableId("");
  };

  const addSelectedConsumableToType = () => {
    const item = consumableItems.find((candidate) => String(candidate.id) === selectedConsumableId);
    if (item) addConsumableToType(item);
  };

  const createConsumableForType = async () => {
    const name = newConsumableName.trim();
    if (!name) return;
    const locationId = selectedLocationId ?? locations[0]?.id;
    if (locationId == null) {
      window.alert(locale === "sl" ? "Najprej ustvarite poslovalnico." : "Create a location first.");
      return;
    }
    try {
      const response = await api.post("/consumables/items", {
        name,
        unit: newConsumableUnit.trim() || "kos",
        locationId,
        currentStock: 0,
        minimumStock: 0,
        costPrice: 0,
        trackStock: true,
        billable: false,
        active: true,
      });
      const item = response.data as ConsumableCatalogItem;
      setConsumableItems((current) =>
        [...current.filter((row) => row.id !== item.id), item].sort((a, b) => String(a.name).localeCompare(String(b.name))),
      );
      addConsumableToType(item);
      setNewConsumableName("");
      setNewConsumableUnit("kos");
    } catch (err: any) {
      window.alert(err?.response?.data?.message || (locale === "sl" ? "Artikla ni bilo mogoče ustvariti." : "Could not create the consumable."));
    }
  };

  const openNewTypeModal = () => {
    setEditingType(null);
    const empty: TypeFormState = {
      name: "",
      description: "",
      internalDescription: "",
      color: SERVICE_TYPE_DEFAULT_COLOR,
      durationMinutes: 60,
      breakMinutes: defaultServiceBreakMinutes,
      breakMinutesOverridden: false,
      maxParticipantsPerSession: "",
      groupBookingEnabled: false,
      guestBookingMode: normalizeGuestBookingModeForModules(
        "ALL",
        websiteWidgetModuleEnabled,
        guestAppModuleEnabled,
      ),
      priceCalculationMode: "PER_CLIENT",
      guestLimitUserEmailsText: "",
      serviceGroupId: "",
      availableAllLocations: true,
      locationIds: [],
      serviceLines: [],
      consumableLines: [],
    };
    setTypeForm(empty);
    setTypeFormSnapshot({ ...empty, serviceLines: [], consumableLines: [] });
    setTypeModalActiveTab("basic");
    setGuestLimitPickerOpen(false);
    setGuestLimitClientQuery("");
    setShowTypeModal(true);
  };

  const prepareNewServiceModal = (action: LinkedEntityModalAction) => {
    setEditingLinkedServiceIndex(null);
    setEditingServiceId(null);
    const empty: ServiceFormState = {
      description: "",
      taxRate: "VAT_22",
      grossPrice: "0.00",
      advanceDeduction: false,
      noShow: false,
    };
    setServiceForm(empty);
    setServiceFormSnapshot({ ...empty });
    setServiceModalAction(action);
    setServiceModalTab("create");
    setSelectedBillingServiceId(null);
    setServicePickerQuery("");
    setShowServiceModal(true);
  };

  // Used by the legacy standalone billing-services fallback when Storitve is disabled.
  const openNewServiceModal = () => prepareNewServiceModal("edit");

  // Used inside the unified Storitve editor and links the new billing service immediately.
  const openNewLinkedServiceModal = () => prepareNewServiceModal("link");

  const openServiceLinkModal = () => {
    setEditingLinkedServiceIndex(null);
    setEditingServiceId(null);
    const empty: ServiceFormState = {
      description: "",
      taxRate: "VAT_22",
      grossPrice: "0.00",
      advanceDeduction: false,
      noShow: false,
    };
    setServiceForm(empty);
    setServiceFormSnapshot({ ...empty });
    setServiceModalAction("link");
    setServiceModalTab("existing");
    setSelectedBillingServiceId(null);
    setServicePickerQuery("");
    setShowServiceModal(true);
  };

  const openLinkedServicePriceEdit = (
    service: BillingService,
    lineIndex: number | null,
    currentGrossPrice?: string,
  ) => {
    const grossPrice =
      currentGrossPrice?.trim() ||
      grossPriceStringFromNet(Number(service.netPrice), service.taxRate);
    const next: ServiceFormState = {
      description: service.description,
      taxRate: service.taxRate,
      grossPrice,
      advanceDeduction: advanceDeductionIds.has(service.id),
      noShow: noShowModuleEnabled && configuredNoShowServiceId === service.id,
    };
    setEditingLinkedServiceIndex(lineIndex);
    setEditingServiceId(null);
    setSelectedBillingServiceId(service.id);
    setServiceForm(next);
    setServiceFormSnapshot({ ...next });
    setServiceModalAction("linked-price");
    setServiceModalTab("create");
    setShowServiceModal(true);
  };

  const linkSelectedBillingService = () => {
    if (selectedBillingServiceId == null) return;
    const selected = services.find(
      (service) => service.id === selectedBillingServiceId,
    );
    if (!selected) return;
    setTypeForm((current) => {
      if (
        current.serviceLines.some(
          (line) => line.transactionServiceId === selected.id,
        )
      ) {
        return current;
      }
      return {
        ...current,
        serviceLines: [
          ...current.serviceLines,
          {
            transactionServiceId: selected.id,
            price: grossPriceStringFromNet(
              Number(selected.netPrice),
              selected.taxRate,
            ),
          },
        ],
      };
    });
    setShowServiceModal(false);
    setSelectedBillingServiceId(null);
    setServicePickerQuery("");
    setServiceFormSnapshot(null);
  };

  const dismissTypeModal = () => {
    setShowTypeModal(false);
    setEditingType(null);
    setTypeFormSnapshot(null);
    setTypeModalActiveTab("basic");
    setGuestLimitPickerOpen(false);
    setGuestLimitClientQuery("");
  };

  const dismissGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
    setSelectedGroupId("");
    setGroupPickerQuery("");
    setGroupForm({ name: "", description: "", active: true });
  };

  const dismissServiceModal = () => {
    setShowServiceModal(false);
    setEditingServiceId(null);
    setEditingLinkedServiceIndex(null);
    setServiceFormSnapshot(null);
    setSelectedBillingServiceId(null);
    setServicePickerQuery("");
  };

  /** Close only when the press starts on the dimmed overlay, not when a click is synthesized
   *  after text selection (mousedown in the form, mouseup on the backdrop — common on wide screens). */
  const onTypeModalBackdropMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) dismissTypeModal();
  };

  const onServiceModalBackdropMouseDown = (
    e: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (e.target === e.currentTarget) dismissServiceModal();
  };


  const resetServiceConfigFilterDraft = () => {
    setServiceConfigFilterDraft({
      typeStatus: "active",
      groupStatus: "active",
      typeGroup: "all",
      serviceStatus: "active",
      cardsStatus: "active",
      coursesStatus: "active",
      typeCategory: "all",
      typeDuration: "all",
      typeVisibility: "all",
    });
  };

  const applyServiceConfigFilters = () => {
    setTypeActiveFilter(serviceConfigFilterDraft.typeStatus);
    setGroupActiveFilter(serviceConfigFilterDraft.groupStatus);
    setTypeGroupFilter(serviceConfigFilterDraft.typeGroup);
    setServiceActiveFilter(serviceConfigFilterDraft.serviceStatus);
    setCardsActiveFilter(serviceConfigFilterDraft.cardsStatus);
    setCoursesActiveFilter(serviceConfigFilterDraft.coursesStatus);
    setTypeCategoryFilter(serviceConfigFilterDraft.typeCategory);
    setTypeDurationFilter(serviceConfigFilterDraft.typeDuration);
    setTypeVisibilityFilter(serviceConfigFilterDraft.typeVisibility);
    setShowServiceConfigFilters(false);
  };

  const sessionTypesPageClass = `stack gap-lg${isSessionTypesNarrow ? " clients-modern-page--mobile" : ""}`;
  const sessionTypesCardClass = `service-config-card clients-modern-card${isSessionTypesNarrow ? " clients-mobile-shell" : ""}`;
  const sessionTypesHeaderClass = `clients-page-header${isSessionTypesNarrow ? " clients-page-header--sticky-mobile" : ""}`;

  return (
    <div className={sessionTypesPageClass}>
      {typesModuleEnabled ? (
        <Card data-onboarding-panel="services" className={sessionTypesCardClass}>
          <div className={sessionTypesHeaderClass}>
            <div className="clients-page-header__entity clients-entity-tabs-shell">
              <div
                className="clients-session-tabs clients-entity-tabs"
                role="tablist"
                aria-label={t("sessionTypesSubtabsAria")}
              >
              <button
                type="button"
                role="tab"
                aria-selected={
                  !showServiceGroups && !showTransactionServices && !showCardsMemberships && !showCourses
                }
                className={
                  !showServiceGroups && !showTransactionServices && !showCardsMemberships && !showCourses
                    ? "clients-session-tab active"
                    : "clients-session-tab"
                }
                onClick={() => setSessionTypesSubtab("types")}
              >
                <ServiceConfigTabIcon name="types" />
                <span>{t("sessionTypesSubtabTypes")}</span>
                <span className="service-config-tab-count">{filteredTypes.length}</span>
              </button>
              {entitlementsModuleEnabled ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={showCardsMemberships}
                  className={
                    showCardsMemberships
                      ? "clients-session-tab active"
                      : "clients-session-tab"
                  }
                  onClick={() => setSessionTypesSubtab("cardsMemberships")}
                >
                  <ServiceConfigTabIcon name="cards" />
                  <span>{t("sessionTypesSubtabCards")}</span>
                  <span className="service-config-tab-count">{guestCardsFilteredCount}</span>
                </button>
              ) : null}
            </div>
          </div>
          <div className="clients-toolbar clients-modern-toolbar service-config-toolbar">
            <div className="clients-toolbar-primary service-config-toolbar-primary">
              <div className="clients-search-wrap service-config-search-wrap">
                <input
                  className="clients-search-input"
                  placeholder={
                    showCourses
                      ? (locale === "sl" ? "Išči tečaje..." : "Search courses...")
                      : showServiceGroups
                        ? (locale === "sl" ? "Išči skupine storitev..." : "Search service groups...")
                      : showCardsMemberships
                        ? t("sessionTypesSearchCardsPlaceholder")
                        : showTransactionServices
                          ? t("sessionTypesSearchServicesPlaceholder")
                          : t("sessionTypesSearchTypesPlaceholder")
                  }
                  value={
                    showCourses
                      ? courseSearch
                      : showServiceGroups
                        ? groupSearch
                      : showCardsMemberships
                        ? cardSearch
                        : showTransactionServices
                          ? serviceSearch
                          : typeSearch
                  }
                  onChange={(e) =>
                    showCourses
                      ? setCourseSearch(e.target.value)
                      : showServiceGroups
                        ? setGroupSearch(e.target.value)
                      : showCardsMemberships
                        ? setCardSearch(e.target.value)
                        : showTransactionServices
                          ? setServiceSearch(e.target.value)
                          : setTypeSearch(e.target.value)
                  }
                />
                <span className="clients-search-icon" aria-hidden>
                  <ServiceConfigTabIcon name="search" />
                </span>
              </div>
              {!showCourses && !showServiceGroups && !showCardsMemberships && !showTransactionServices && !isSessionTypesNarrow && (
                <div className="clients-owner-filter service-config-category-filter" ref={typeCategoryFilterRef}>
                  <button
                    type="button"
                    className={`clients-owner-filter__button${typeCategoryFilter !== "all" ? " clients-owner-filter__button--active" : ""}`}
                    aria-haspopup="listbox"
                    aria-expanded={typeCategoryFilterOpen}
                    onClick={() => setTypeCategoryFilterOpen((open) => !open)}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 5h16l-6.3 7.2V18l-3.4 1.8v-7.6L4 5Z" />
                    </svg>
                    <span className="clients-owner-filter__label">{typeCategoryFilterLabel}:</span>
                    <strong>{selectedTypeCategoryLabel}</strong>
                    <svg className={`clients-owner-filter__chevron${typeCategoryFilterOpen ? " clients-owner-filter__chevron--open" : ""}`} width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 7.5 5 5 5-5" />
                    </svg>
                  </button>
                  {typeCategoryFilterOpen && (
                    <div className="clients-owner-filter__menu" role="listbox" aria-label={typeCategoryFilterLabel}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={typeCategoryFilter === "all"}
                        className={typeCategoryFilter === "all" ? "clients-owner-filter__option active" : "clients-owner-filter__option"}
                        onClick={() => {
                          setTypeCategoryFilter("all");
                          setServiceConfigFilterDraft((value) => ({ ...value, typeCategory: "all" }));
                          setTypeCategoryFilterOpen(false);
                        }}
                      >
                        <span>{allTypeCategoriesLabel}</span>
                        {typeCategoryFilter === "all" && <span className="clients-owner-filter__check">✓</span>}
                      </button>
                      {typeCategoryOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="option"
                          aria-selected={typeCategoryFilter === option}
                          className={typeCategoryFilter === option ? "clients-owner-filter__option active" : "clients-owner-filter__option"}
                          onClick={() => {
                            setTypeCategoryFilter(option);
                            setServiceConfigFilterDraft((value) => ({ ...value, typeCategory: option }));
                            setTypeCategoryFilterOpen(false);
                          }}
                        >
                          <span>{option}</span>
                          {typeCategoryFilter === option && <span className="clients-owner-filter__check">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {showCardsMemberships && !isSessionTypesNarrow && (
                <div className="clients-owner-filter service-config-category-filter" ref={cardTypeFilterRef}>
                  <button
                    type="button"
                    className={`clients-owner-filter__button${cardTypeFilter !== "all" ? " clients-owner-filter__button--active" : ""}`}
                    aria-haspopup="listbox"
                    aria-expanded={cardTypeFilterOpen}
                    onClick={() => setCardTypeFilterOpen((open) => !open)}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 5h16l-6.3 7.2V18l-3.4 1.8v-7.6L4 5Z" />
                    </svg>
                    <span className="clients-owner-filter__label">{cardTypeFilterLabel}:</span>
                    <strong>{selectedCardTypeLabel}</strong>
                    <svg className={`clients-owner-filter__chevron${cardTypeFilterOpen ? " clients-owner-filter__chevron--open" : ""}`} width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 7.5 5 5 5-5" />
                    </svg>
                  </button>
                  {cardTypeFilterOpen && (
                    <div className="clients-owner-filter__menu" role="listbox" aria-label={cardTypeFilterLabel}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={cardTypeFilter === "all"}
                        className={cardTypeFilter === "all" ? "clients-owner-filter__option active" : "clients-owner-filter__option"}
                        onClick={() => {
                          setCardTypeFilter("all");
                          setCardTypeFilterOpen(false);
                        }}
                      >
                        <span>{allCardTypesLabel}</span>
                        {cardTypeFilter === "all" && <span className="clients-owner-filter__check">✓</span>}
                      </button>
                      {cardTypeFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={cardTypeFilter === option.value}
                          className={cardTypeFilter === option.value ? "clients-owner-filter__option active" : "clients-owner-filter__option"}
                          onClick={() => {
                            setCardTypeFilter(option.value);
                            setCardTypeFilterOpen(false);
                          }}
                        >
                          <span>{option.label}</span>
                          {cardTypeFilter === option.value && <span className="clients-owner-filter__check">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {cardServiceFilterControl}
            </div>
            <div className="clients-toolbar-actions service-config-toolbar-trailing">
              <div
                className="clients-session-tabs clients-filter-tabs"
                style={{ marginBottom: 0 }}
              >
                <button
                  type="button"
                  className="clients-session-tab active"
                  onClick={toggleServiceConfigActiveFilter}
                  aria-label={
                    serviceConfigActiveFilter === "active"
                      ? (locale === "sl"
                          ? "Prikaži neaktivne storitve"
                          : "Show inactive services")
                      : (locale === "sl"
                          ? "Prikaži aktivne storitve"
                          : "Show active services")
                  }
                >
                  <span
                    className={
                      serviceConfigActiveFilter === "active"
                        ? "clients-filter-dot clients-filter-dot--active"
                        : "clients-filter-dot clients-filter-dot--inactive"
                    }
                  />
                  {serviceConfigActiveFilter === "active"
                    ? activeFilterLabel
                    : inactiveFilterLabel}
                </button>
              </div>
              {(me.units?.length ?? 0) > 1 && (me.workspaceFeatures == null || me.workspaceFeatures.includes('CONFIGURATION_COPY')) && isWorkspaceRolloutEnabled(me, 'SHARED_SERVICES') && (
                <button
                  type="button"
                  className="clients-modern-new-btn service-config-new-btn"
                  onClick={() => setShowWorkspaceServiceManager(true)}
                  title={locale === "sl" ? "Skupne storitve in kopiranje nastavitev" : "Workspace services and configuration copy"}
                >
                  <ServiceConfigTabIcon name="services" />
                  <span>{isSessionTypesNarrow ? (locale === "sl" ? "Enote" : "Units") : (locale === "sl" ? "Skupne storitve" : "Workspace services")}</span>
                </button>
              )}
              <button
                type="button"
                className="clients-modern-new-btn service-config-new-btn"
                onClick={
                  showCourses
                    ? () => coursesRef.current?.openNew()
                    : showServiceGroups
                      ? openNewGroupModal
                    : showCardsMemberships
                      ? () => cardsMembershipsRef.current?.openNew()
                      : showTransactionServices
                        ? openNewServiceModal
                        : openNewTypeModal
                }
              >
                <ServiceConfigTabIcon name="plus" />
                <span>
                  {isSessionTypesNarrow
                    ? t("billingNewMobile")
                    : t("billingNew")}
                </span>
              </button>
            </div>
          </div>
          </div>
          {showCourses ? (
            <CoursesSection
              ref={coursesRef}
              searchQuery={courseSearch}
              activeFilter={coursesActiveFilter}
              onFilteredCountChange={onCoursesFilteredCount}
            />
          ) : showServiceGroups ? (
            groupsPanelBody
          ) : showCardsMemberships ? (
            <CardsMembershipsSection
              ref={cardsMembershipsRef}
              sessionTypes={activeTypes}
              coursesEnabled={coursesModuleEnabled}
              giftCardsEnabled={giftCardsModuleEnabled}
              searchQuery={cardSearch}
              activeFilter={cardsActiveFilter}
              typeFilter={cardTypeFilter}
              serviceFilter={cardServiceFilter}
              onFilteredCountChange={onGuestCardsFilteredCount}
            />
          ) : showTransactionServices ? (
            transactionServicesPanelBody
          ) : (
            typesPanelBody
          )}
        </Card>
      ) : (
        <Card data-onboarding-panel="services" className={sessionTypesCardClass}>
          <div className={sessionTypesHeaderClass}>
            <div className="clients-page-header__entity clients-entity-tabs-shell">
              <div
                className="clients-session-tabs clients-entity-tabs"
                role="tablist"
                aria-label={t("sessionTypesSubtabsAria")}
              >
              <button
                type="button"
                role="tab"
                aria-selected={showTransactionServices && !showCardsMemberships && !showCourses}
                className={
                  showTransactionServices && !showCardsMemberships && !showCourses
                    ? "clients-session-tab active"
                    : "clients-session-tab"
                }
                onClick={() => setSessionTypesSubtab("transactionServices")}
              >
                <ServiceConfigTabIcon name="services" />
                <span className="service-config-tab-label service-config-tab-label--desktop">{t("configBillingServicesTab")}</span><span className="service-config-tab-label service-config-tab-label--mobile">{locale === "sl" ? "Obračunske" : "Billing"}</span>
                <span className="service-config-tab-count">{filteredServices.length}</span>
              </button>
              {entitlementsModuleEnabled ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={showCardsMemberships}
                  className={
                    showCardsMemberships
                      ? "clients-session-tab active"
                      : "clients-session-tab"
                  }
                  onClick={() => setSessionTypesSubtab("cardsMemberships")}
                >
                  <ServiceConfigTabIcon name="cards" />
                  <span>{t("sessionTypesSubtabCards")}</span>
                  <span className="service-config-tab-count">{guestCardsFilteredCount}</span>
                </button>
              ) : null}
            </div>
          </div>
          <div className="clients-toolbar clients-modern-toolbar service-config-toolbar">
            <div className="clients-toolbar-primary service-config-toolbar-primary">
              <div className="clients-search-wrap service-config-search-wrap">
                <input
                  className="clients-search-input"
                  placeholder={
                    showCourses
                      ? (locale === "sl" ? "Išči tečaje..." : "Search courses...")
                      : showCardsMemberships
                        ? t("sessionTypesSearchCardsPlaceholder")
                        : t("sessionTypesSearchServicesPlaceholder")
                  }
                  value={showCourses ? courseSearch : showCardsMemberships ? cardSearch : serviceSearch}
                  onChange={(e) =>
                    showCourses
                      ? setCourseSearch(e.target.value)
                      : showCardsMemberships
                        ? setCardSearch(e.target.value)
                        : setServiceSearch(e.target.value)
                  }
                />
                <span className="clients-search-icon" aria-hidden>
                  <ServiceConfigTabIcon name="search" />
                </span>
              </div>
              {showCardsMemberships && !isSessionTypesNarrow && (
                <div className="clients-owner-filter service-config-category-filter" ref={cardTypeFilterRef}>
                  <button
                    type="button"
                    className={`clients-owner-filter__button${cardTypeFilter !== "all" ? " clients-owner-filter__button--active" : ""}`}
                    aria-haspopup="listbox"
                    aria-expanded={cardTypeFilterOpen}
                    onClick={() => setCardTypeFilterOpen((open) => !open)}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 5h16l-6.3 7.2V18l-3.4 1.8v-7.6L4 5Z" />
                    </svg>
                    <span className="clients-owner-filter__label">{cardTypeFilterLabel}:</span>
                    <strong>{selectedCardTypeLabel}</strong>
                    <svg className={`clients-owner-filter__chevron${cardTypeFilterOpen ? " clients-owner-filter__chevron--open" : ""}`} width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 7.5 5 5 5-5" />
                    </svg>
                  </button>
                  {cardTypeFilterOpen && (
                    <div className="clients-owner-filter__menu" role="listbox" aria-label={cardTypeFilterLabel}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={cardTypeFilter === "all"}
                        className={cardTypeFilter === "all" ? "clients-owner-filter__option active" : "clients-owner-filter__option"}
                        onClick={() => {
                          setCardTypeFilter("all");
                          setCardTypeFilterOpen(false);
                        }}
                      >
                        <span>{allCardTypesLabel}</span>
                        {cardTypeFilter === "all" && <span className="clients-owner-filter__check">✓</span>}
                      </button>
                      {cardTypeFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={cardTypeFilter === option.value}
                          className={cardTypeFilter === option.value ? "clients-owner-filter__option active" : "clients-owner-filter__option"}
                          onClick={() => {
                            setCardTypeFilter(option.value);
                            setCardTypeFilterOpen(false);
                          }}
                        >
                          <span>{option.label}</span>
                          {cardTypeFilter === option.value && <span className="clients-owner-filter__check">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {cardServiceFilterControl}
            </div>
            <div className="clients-toolbar-actions service-config-toolbar-trailing">
              <div
                className="clients-session-tabs clients-filter-tabs"
                style={{ marginBottom: 0 }}
              >
                <button
                  type="button"
                  className="clients-session-tab active"
                  onClick={toggleServiceConfigActiveFilter}
                  aria-label={
                    serviceConfigActiveFilter === "active"
                      ? (locale === "sl"
                          ? "Prikaži neaktivne storitve"
                          : "Show inactive services")
                      : (locale === "sl"
                          ? "Prikaži aktivne storitve"
                          : "Show active services")
                  }
                >
                  <span
                    className={
                      serviceConfigActiveFilter === "active"
                        ? "clients-filter-dot clients-filter-dot--active"
                        : "clients-filter-dot clients-filter-dot--inactive"
                    }
                  />
                  {serviceConfigActiveFilter === "active"
                    ? activeFilterLabel
                    : inactiveFilterLabel}
                </button>
              </div>
              {(me.units?.length ?? 0) > 1 && (me.workspaceFeatures == null || me.workspaceFeatures.includes('CONFIGURATION_COPY')) && isWorkspaceRolloutEnabled(me, 'SHARED_SERVICES') && (
                <button
                  type="button"
                  className="clients-modern-new-btn service-config-new-btn"
                  onClick={() => setShowWorkspaceServiceManager(true)}
                  title={locale === "sl" ? "Skupne storitve in kopiranje nastavitev" : "Workspace services and configuration copy"}
                >
                  <ServiceConfigTabIcon name="services" />
                  <span>{isSessionTypesNarrow ? (locale === "sl" ? "Enote" : "Units") : (locale === "sl" ? "Skupne storitve" : "Workspace services")}</span>
                </button>
              )}
              <button
                type="button"
                className="clients-modern-new-btn service-config-new-btn"
                onClick={
                  showCourses
                    ? () => coursesRef.current?.openNew()
                    : showCardsMemberships
                      ? () => cardsMembershipsRef.current?.openNew()
                      : openNewServiceModal
                }
              >
                <ServiceConfigTabIcon name="plus" />
                <span>
                  {isSessionTypesNarrow
                    ? t("billingNewMobile")
                    : t("billingNew")}
                </span>
              </button>
            </div>
          </div>
          </div>
          {showCourses ? (
            <CoursesSection
              ref={coursesRef}
              searchQuery={courseSearch}
              activeFilter={coursesActiveFilter}
              onFilteredCountChange={onCoursesFilteredCount}
            />
          ) : showCardsMemberships ? (
            <CardsMembershipsSection
              ref={cardsMembershipsRef}
              sessionTypes={activeTypes}
              coursesEnabled={coursesModuleEnabled}
              giftCardsEnabled={giftCardsModuleEnabled}
              searchQuery={cardSearch}
              activeFilter={cardsActiveFilter}
              typeFilter={cardTypeFilter}
              serviceFilter={cardServiceFilter}
              onFilteredCountChange={onGuestCardsFilteredCount}
            />
          ) : (
            transactionServicesPanelBody
          )}
        </Card>
      )}

      {showServiceConfigFilters && (
        <div
          className="service-config-filter-modal-backdrop"
          onMouseDown={() => setShowServiceConfigFilters(false)}
          role="presentation"
        >
          <div
            className="service-config-filter-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="service-config-filter-modal__header">
              <h3>{locale === "sl" ? "Filtri" : "Filters"}</h3>
              <button
                type="button"
                className="service-config-filter-modal__close"
                onClick={() => setShowServiceConfigFilters(false)}
                aria-label={locale === "sl" ? "Zapri" : "Close"}
              >
                ×
              </button>
            </div>
            <div className="service-config-filter-modal__body">
              {showCourses ? (
                <label>
                  <span>{locale === "sl" ? "Status" : "Status"}</span>
                  <DesktopSelect value={serviceConfigFilterDraft.coursesStatus} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, coursesStatus: e.target.value as "active" | "inactive" }))}>
                    <option value="active">{locale === "sl" ? "Aktivna" : "Active"}</option>
                    <option value="inactive">{locale === "sl" ? "Neaktivna" : "Inactive"}</option>
                  </DesktopSelect>
                </label>
              ) : showCardsMemberships ? (
                <label>
                  <span>{locale === "sl" ? "Status" : "Status"}</span>
                  <DesktopSelect value={serviceConfigFilterDraft.cardsStatus} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, cardsStatus: e.target.value as "active" | "inactive" }))}>
                    <option value="active">{locale === "sl" ? "Aktivna" : "Active"}</option>
                    <option value="inactive">{locale === "sl" ? "Neaktivna" : "Inactive"}</option>
                  </DesktopSelect>
                </label>
              ) : showServiceGroups ? (
                <label>
                  <span>{locale === "sl" ? "Status" : "Status"}</span>
                  <DesktopSelect value={serviceConfigFilterDraft.groupStatus} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, groupStatus: e.target.value as "active" | "inactive" }))}>
                    <option value="active">{locale === "sl" ? "Aktivna" : "Active"}</option>
                    <option value="inactive">{locale === "sl" ? "Neaktivna" : "Inactive"}</option>
                  </DesktopSelect>
                </label>
              ) : showTransactionServices ? (
                <label>
                  <span>{locale === "sl" ? "Status" : "Status"}</span>
                  <DesktopSelect value={serviceConfigFilterDraft.serviceStatus} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, serviceStatus: e.target.value as "active" | "inactive" }))}>
                    <option value="active">{locale === "sl" ? "Aktivna" : "Active"}</option>
                    <option value="inactive">{locale === "sl" ? "Neaktivna" : "Inactive"}</option>
                  </DesktopSelect>
                </label>
              ) : (
                <>
                  <label>
                    <span>{locale === "sl" ? "Status" : "Status"}</span>
                    <DesktopSelect value={serviceConfigFilterDraft.typeStatus} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, typeStatus: e.target.value as "active" | "inactive" }))}>
                      <option value="active">{locale === "sl" ? "Aktivna" : "Active"}</option>
                      <option value="inactive">{locale === "sl" ? "Neaktivna" : "Inactive"}</option>
                    </DesktopSelect>
                  </label>
                  {serviceGroupsModuleEnabled ? (
                    <label>
                      <span>{locale === "sl" ? "Skupina" : "Group"}</span>
                      <DesktopSelect value={serviceConfigFilterDraft.typeGroup} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, typeGroup: e.target.value }))}>
                        <option value="all">{locale === "sl" ? "Vse skupine" : "All groups"}</option>
                        <option value="ungrouped">{locale === "sl" ? "Brez skupine" : "Ungrouped"}</option>
                        {groups.map((group) => <option key={group.id} value={String(group.id)}>{group.name}</option>)}
                      </DesktopSelect>
                    </label>
                  ) : null}
                  <label>
                    <span>{locale === "sl" ? "Kategorija" : "Category"}</span>
                    <DesktopSelect value={serviceConfigFilterDraft.typeCategory} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, typeCategory: e.target.value }))}>
                      <option value="all">{locale === "sl" ? "Vse kategorije" : "All categories"}</option>
                      {typeCategoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </DesktopSelect>
                  </label>
                  <label>
                    <span>{locale === "sl" ? "Trajanje" : "Duration"}</span>
                    <DesktopSelect value={serviceConfigFilterDraft.typeDuration} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, typeDuration: e.target.value }))}>
                      <option value="all">{locale === "sl" ? "Vse" : "All"}</option>
                      {typeDurationOptions.map((option) => <option key={option} value={option}>{option} min</option>)}
                    </DesktopSelect>
                  </label>
                  <label className="service-config-filter-modal__field--wide">
                    <span>{locale === "sl" ? "Vidnost" : "Visibility"}</span>
                    <DesktopSelect value={serviceConfigFilterDraft.typeVisibility} onChange={(e) => setServiceConfigFilterDraft((value) => ({ ...value, typeVisibility: e.target.value as "all" | GuestBookingMode }))}>
                      <option value="all">{locale === "sl" ? "Vse" : "All"}</option>
                      {guestBookingOptions.map((option) => <option key={option.value} value={option.value}>{option.line}</option>)}
                    </DesktopSelect>
                  </label>
                </>
              )}
            </div>
            <div className="service-config-filter-modal__footer">
              <button type="button" className="secondary" onClick={resetServiceConfigFilterDraft}>{locale === "sl" ? "Ponastavi" : "Reset"}</button>
              <button type="button" className="primary" onClick={applyServiceConfigFilters}>{locale === "sl" ? "Uporabi filtre" : "Apply filters"}</button>
            </div>
          </div>
        </div>
      )}

      {showGroupModal ? (
        <div
          className="modal-backdrop booking-side-panel-backdrop session-type-config-modal-backdrop linked-entity-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) dismissGroupModal();
          }}
          role="presentation"
        >
          <div
            className="modal booking-side-panel service-group-config-modal linked-entity-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="session-type-config-modal-header">
              <div className="session-type-config-modal-heading">
                <span className="session-type-config-modal-icon linked-entity-modal-icon--group" aria-hidden>
                  <ServiceConfigTabIcon name="group" />
                </span>
                <div>
                  <h2>
                    {groupModalAction === "edit"
                      ? locale === "sl"
                        ? "Uredi skupino storitev"
                        : "Edit service group"
                      : locale === "sl"
                        ? "Skupina storitve"
                        : "Service group"}
                  </h2>
                  <p>
                    {groupModalAction === "edit"
                      ? locale === "sl"
                        ? "Posodobite obstoječe podatke skupine."
                        : "Update the existing group details."
                      : locale === "sl"
                        ? "Dodajte obstoječo skupino ali ustvarite novo."
                        : "Add an existing group or create a new one."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="secondary session-type-config-modal-close"
                onClick={dismissGroupModal}
                aria-label={locale === "sl" ? "Zapri" : "Close"}
              >
                ×
              </button>
            </div>

            {groupModalAction === "link" ? (
              <div className="linked-entity-modal-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupModalTab === "existing"}
                  className={groupModalTab === "existing" ? "is-active" : ""}
                  onClick={() => {
                    setGroupModalTab("existing");
                    setEditingGroup(null);
                    setGroupForm({ name: "", description: "", active: true });
                  }}
                >
                  {locale === "sl" ? "Dodaj obstoječo" : "Add existing"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupModalTab === "create"}
                  className={groupModalTab === "create" ? "is-active" : ""}
                  onClick={() => {
                    setGroupModalTab("create");
                    setEditingGroup(null);
                    setGroupForm({ name: "", description: "", active: true });
                  }}
                >
                  {locale === "sl" ? "Ustvari novo" : "Create new"}
                </button>
              </div>
            ) : null}

            {groupModalTab === "existing" && groupModalAction === "link" ? (
              <div className="booking-side-panel-body linked-entity-picker-body">
                <div className="linked-entity-search">
                  <ServiceConfigTabIcon name="search" />
                  <input
                    type="search"
                    value={groupPickerQuery}
                    onChange={(event) => setGroupPickerQuery(event.target.value)}
                    placeholder={
                      locale === "sl"
                        ? "Išči skupino storitve ..."
                        : "Search service groups ..."
                    }
                  />
                </div>
                <div className="linked-entity-option-list" role="radiogroup">
                  {groupPickerOptions.length === 0 ? (
                    <EmptyState
                      title={locale === "sl" ? "Ni skupin" : "No groups"}
                      text={
                        locale === "sl"
                          ? "Ustvarite novo skupino storitev."
                          : "Create a new service group."
                      }
                    />
                  ) : (
                    groupPickerOptions.map((group) => {
                      const selected = selectedGroupId === String(group.id);
                      return (
                        <button
                          key={group.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={`linked-entity-option${selected ? " is-selected" : ""}`}
                          onClick={() => setSelectedGroupId(String(group.id))}
                        >
                          <span className="linked-entity-radio" aria-hidden>
                            {selected ? <span /> : null}
                          </span>
                          <span className="linked-entity-option-icon linked-entity-option-icon--group" aria-hidden>
                            <ServiceConfigTabIcon name="group" />
                          </span>
                          <span className="linked-entity-option-copy">
                            <strong>{group.name}</strong>
                            <span>
                              {group.description?.trim() ||
                                (locale === "sl"
                                  ? `${group.serviceCount ?? 0} storitev`
                                  : `${group.serviceCount ?? 0} services`)}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <form
                id="service-group-edit-form"
                className="booking-side-panel-body service-group-config-form"
                onSubmit={submitGroup}
              >
                <Field label={locale === "sl" ? "Naziv skupine" : "Group name"}>
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    value={groupForm.name}
                    onChange={(e) =>
                      setGroupForm({ ...groupForm, name: e.target.value })
                    }
                    placeholder={locale === "sl" ? "npr. Masaža" : "e.g. Massage"}
                  />
                </Field>
                <Field label={locale === "sl" ? "Opis" : "Description"}>
                  <textarea
                    rows={4}
                    value={groupForm.description}
                    onChange={(e) =>
                      setGroupForm({ ...groupForm, description: e.target.value })
                    }
                  />
                </Field>
                <label className="transaction-service-switch-row service-group-active-switch">
                  <span className="transaction-service-switch-copy">
                    <strong>
                      {locale === "sl" ? "Aktivna skupina" : "Active group"}
                    </strong>
                    <span>
                      {locale === "sl"
                        ? "Neaktivna skupina se v widgetu in aplikaciji za goste ne prikazuje kot skupina; njene storitve ostanejo aktivne."
                        : "Inactive groups are not shown as group headings in guest booking; their services remain available."}
                    </span>
                  </span>
                  <span className="session-type-config-switch transaction-service-option-switch">
                    <input
                      type="checkbox"
                      checked={groupForm.active}
                      onChange={(e) =>
                        setGroupForm({ ...groupForm, active: e.target.checked })
                      }
                    />
                    <span className="session-type-config-switch-track" aria-hidden>
                      <span className="session-type-config-switch-thumb">
                        {groupForm.active ? "✓" : ""}
                      </span>
                    </span>
                  </span>
                </label>
              </form>
            )}

            <div className="form-actions booking-side-panel-footer session-type-config-modal-footer linked-entity-modal-footer">
              {groupModalAction !== "edit" ? (
                <button type="button" className="secondary" onClick={dismissGroupModal}>
                  {locale === "sl" ? "Nazaj" : "Back"}
                </button>
              ) : null}
              {groupModalTab === "existing" && groupModalAction === "link" ? (
                <button
                  type="button"
                  className="gapp-primary-button"
                  disabled={!selectedGroupId}
                  onClick={linkSelectedGroup}
                >
                  <ServiceConfigTabIcon name="plus" />
                  {locale === "sl" ? "Dodaj skupino" : "Add group"}
                </button>
              ) : (
                <button
                  form="service-group-edit-form"
                  type="submit"
                  className="gapp-primary-button"
                  disabled={!groupForm.name.trim()}
                >
                  <GuestConfigSaveIcon />
                  {editingGroup
                    ? locale === "sl"
                      ? "Shrani spremembe"
                      : "Save changes"
                    : locale === "sl"
                      ? "Ustvari in dodaj"
                      : "Create and add"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showTypeModal ? (
        <div
          className="modal-backdrop booking-side-panel-backdrop session-type-config-modal-backdrop"
          onMouseDown={onTypeModalBackdropMouseDown}
          role="presentation"
        >
          <div
            className="modal large-modal booking-side-panel session-type-config-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="session-type-config-modal-header">
              {isTypeEditorMobileTablet ? (
                <>
                  <button
                    type="button"
                    className="session-type-config-modal-mobile-close"
                    onClick={dismissTypeModal}
                    aria-label={locale === "sl" ? "Zapri" : "Close"}
                  >
                    ×
                  </button>
                  <h2 className="session-type-config-modal-mobile-title">
                    {editingType ? t("Edit type") : t("New type")}
                  </h2>
                  <span
                    className="session-type-config-modal-mobile-more"
                    aria-hidden="true"
                  >
                    ⋮
                  </span>
                </>
              ) : (
                <>
                  <div className="session-type-config-modal-heading">
                    <span className="session-type-config-modal-icon" aria-hidden>
                      <ServiceConfigTabIcon name="types" />
                    </span>
                    <div>
                      <h2>{editingType ? t("Edit type") : t("New type")}</h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary session-type-config-modal-close"
                    onClick={dismissTypeModal}
                    aria-label={locale === "sl" ? "Zapri" : "Close"}
                  >
                    ×
                  </button>
                </>
              )}
            </div>

            <form
              id="session-type-edit-form"
              className="booking-side-panel-body config-type-panel-form session-type-config-modal-body"
              onSubmit={submitType}
            >
              <section className="session-type-config-section session-type-config-section--tab-panel session-type-config-unified">
                <div className="session-type-config-unified-card session-type-config-unified-card--basic">
                  <div className="session-type-config-section-title">
                    <span className="session-type-config-section-icon" aria-hidden>
                      <ServiceConfigTabIcon name="types" />
                    </span>
                    <div>
                      <h3>
                        {locale === "sl" ? "Osnovni podatki" : "Basic information"}
                      </h3>
                      <p>
                        {locale === "sl"
                          ? "Uredite osnovne informacije o storitvi."
                          : "Edit the basic service information."}
                      </p>
                    </div>
                  </div>

                  <div className="session-type-config-grid session-type-config-grid--two session-type-config-description-grid">
                    <Field
                      label={
                        locale === "sl"
                          ? "Opis *"
                          : locale === "sr"
                            ? "Opis *"
                            : "Description *"
                      }
                    >
                      <textarea
                        ref={sessionTypeDescriptionRef}
                        className="session-type-description-autogrow"
                        rows={1}
                        required
                        placeholder={
                          locale === "sl"
                            ? "Npr. Masaža"
                            : locale === "sr"
                              ? "Npr. Masaža"
                              : "For example, Massage"
                        }
                        value={typeForm.description}
                        onChange={(e) => {
                          const el = e.target;
                          setTypeForm({ ...typeForm, description: el.value });
                          el.style.height = "0px";
                          el.style.height = `${el.scrollHeight}px`;
                        }}
                      />
                    </Field>
                    <Field label={t("sessionTypesInternalDescriptionLabel")}>
                      <textarea
                        rows={1}
                        placeholder={t("sessionTypesInternalDescriptionPlaceholder")}
                        value={typeForm.internalDescription}
                        onChange={(e) =>
                          setTypeForm({
                            ...typeForm,
                            internalDescription: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>

                  <div className="session-type-config-grid session-type-config-grid--two session-type-config-duration-grid">
                    <Field
                      label={
                        locale === "sl"
                          ? "Trajanje (minute)"
                          : "Duration (minutes)"
                      }
                    >
                      <input
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        inputMode="numeric"
                        value={typeForm.durationMinutes}
                        onChange={(e) =>
                          setTypeForm({
                            ...typeForm,
                            durationMinutes: clampSessionTypeInt0to999(
                              Number(e.target.value),
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label={locale === "sl" ? "Pavza" : "Break"}>
                      <div className="session-type-break-control">
                        <label className="session-type-break-override">
                          <input
                            type="checkbox"
                            checked={typeForm.breakMinutesOverridden}
                            onChange={(event) =>
                              setTypeForm({
                                ...typeForm,
                                breakMinutesOverridden: event.target.checked,
                              })
                            }
                          />
                          <span
                            className="session-type-break-toggle"
                            aria-hidden="true"
                          >
                            <span />
                          </span>
                          <span>
                            {locale === "sl"
                              ? "Določi posebno pavzo"
                              : "Set a specific break"}
                          </span>
                        </label>
                        {typeForm.breakMinutesOverridden ? (
                          <DesktopSelect
                            value={typeForm.breakMinutes}
                            onChange={(event) =>
                              setTypeForm({
                                ...typeForm,
                                breakMinutes: clampSessionTypeInt0to999(
                                  Number(event.target.value),
                                ),
                              })
                            }
                          >
                            {!SERVICE_BREAK_MINUTE_OPTIONS.includes(
                              typeForm.breakMinutes,
                            ) ? (
                              <option value={typeForm.breakMinutes}>
                                {typeForm.breakMinutes} min
                              </option>
                            ) : null}
                            {SERVICE_BREAK_MINUTE_OPTIONS.map((minutes) => (
                              <option key={minutes} value={minutes}>
                                {minutes} min
                              </option>
                            ))}
                          </DesktopSelect>
                        ) : null}
                        {!typeForm.breakMinutesOverridden ? (
                          <small>
                            {locale === "sl"
                              ? `Uporabljena bo privzeta pavza: ${settings.DEFAULT_SERVICE_BREAK_MINUTES || "0"} min.`
                              : `The default break will be used: ${settings.DEFAULT_SERVICE_BREAK_MINUTES || "0"} min.`}
                          </small>
                        ) : null}
                      </div>
                    </Field>
                  </div>

                  <div className="session-type-color-picker">
                    <div className="session-type-color-picker__label">
                      {locale === "sl" ? "Barva storitve" : "Service color"}
                    </div>
                    <div
                      className="session-type-color-picker__swatches"
                      role="radiogroup"
                      aria-label={
                        locale === "sl" ? "Barva storitve" : "Service color"
                      }
                    >
                      {SERVICE_TYPE_COLOR_PALETTE.map((color) => {
                        const selected =
                          normalizeServiceTypeColorForUi(typeForm.color) === color;
                        return (
                          <button
                            key={color}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={color}
                            className={`session-type-color-swatch${selected ? " is-selected" : ""}`}
                            style={
                              {
                                "--session-type-color": color,
                                background: color,
                              } as CSSProperties
                            }
                            onClick={() => setTypeForm({ ...typeForm, color })}
                          >
                            {selected ? <span aria-hidden>✓</span> : null}
                          </button>
                        );
                      })}
                    </div>
                    <p className="session-type-color-picker__hint">
                      <span aria-hidden>ⓘ</span>
                      {locale === "sl"
                        ? "Izbrana barva bo uporabljena za prikaz termina v koledarju."
                        : "The selected color will be used for this service on the calendar."}
                    </p>
                  </div>
                </div>

                {serviceGroupsModuleEnabled ? (
                  <div className="session-type-config-unified-card session-type-config-unified-card--group">
                    <div className="session-type-config-unified-card-header">
                      <div className="session-type-config-section-title">
                        <span className="session-type-config-section-icon session-type-config-section-icon--group" aria-hidden>
                          <ServiceConfigTabIcon name="group" />
                        </span>
                        <div>
                          <h3>
                            {locale === "sl" ? "Skupina storitve" : "Service group"}
                          </h3>
                          <p>
                            {locale === "sl"
                              ? "Povežite različna trajanja ali različice iste storitve."
                              : "Group related durations or variants of the same service."}
                          </p>
                        </div>
                      </div>
                      <div className="session-type-config-unified-actions">
                        <button
                          type="button"
                          className="secondary small-btn"
                          onClick={openGroupLinkModal}
                        >
                          <ServiceConfigTabIcon name="plus" />
                          {locale === "sl" ? "Dodaj obstoječo" : "Add existing"}
                        </button>
                        <button
                          type="button"
                          className="secondary small-btn"
                          onClick={openNewGroupModal}
                        >
                          <ServiceConfigTabIcon name="plus" />
                          {locale === "sl" ? "Ustvari novo" : "Create new"}
                        </button>
                      </div>
                    </div>

                    {selectedTypeServiceGroup ? (
                      <div className="session-type-linked-card">
                        <span className="session-type-linked-card-icon session-type-linked-card-icon--group" aria-hidden>
                          <ServiceConfigTabIcon name="group" />
                        </span>
                        <span className="session-type-linked-card-copy">
                          <strong>{selectedTypeServiceGroup.name}</strong>
                          <span>{selectedTypeServiceGroup.description || "—"}</span>
                        </span>
                        <div className="session-type-linked-card-actions">
                          <button
                            type="button"
                            className="secondary slim-btn"
                            onClick={() => openGroupEdit(selectedTypeServiceGroup)}
                          >
                            {locale === "sl" ? "Uredi" : "Edit"}
                          </button>
                          <button
                            type="button"
                            className="danger secondary slim-btn"
                            onClick={() =>
                              setTypeForm({ ...typeForm, serviceGroupId: "" })
                            }
                          >
                            {locale === "sl" ? "Odstrani" : "Remove"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="session-type-linked-empty">
                        {locale === "sl"
                          ? "Storitev ni povezana s skupino."
                          : "This service is not linked to a group."}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="session-type-config-unified-card session-type-config-unified-card--services">
                  <div className="session-type-config-unified-card-header">
                    <div className="session-type-config-section-title">
                      <span className="session-type-config-section-icon session-type-config-section-icon--services" aria-hidden>
                        <ServiceConfigTabIcon name="services" />
                      </span>
                      <div>
                        <h3>
                          {locale === "sl"
                            ? "Obračunske storitve"
                            : "Billing services"}
                        </h3>
                        <p>
                          {locale === "sl"
                            ? "Povežite obračunske storitve, ki se uporabljajo za zaračunavanje te storitve."
                            : "Link the billing services used to charge for this service."}
                        </p>
                      </div>
                    </div>
                    <div className="session-type-config-unified-actions">
                      <button
                        type="button"
                        className="secondary small-btn"
                        onClick={openServiceLinkModal}
                      >
                        <ServiceConfigTabIcon name="plus" />
                        {locale === "sl" ? "Dodaj obstoječo" : "Add existing"}
                      </button>
                      <button
                        type="button"
                        className="secondary small-btn"
                        onClick={openNewLinkedServiceModal}
                      >
                        <ServiceConfigTabIcon name="plus" />
                        {locale === "sl" ? "Ustvari novo" : "Create new"}
                      </button>
                    </div>
                  </div>

                  {typeForm.serviceLines.length === 0 ? (
                    <div className="session-type-linked-empty">
                      {locale === "sl"
                        ? "Ni povezanih obračunskih storitev."
                        : "No billing services are linked."}
                    </div>
                  ) : (
                    <div className="session-type-linked-services-list">
                      <div className="session-type-linked-services-head" aria-hidden>
                        <span>{locale === "sl" ? "Storitev" : "Service"}</span>
                        <span>{locale === "sl" ? "Bruto cena" : "Gross price"}</span>
                        <span>{locale === "sl" ? "Dejanja" : "Actions"}</span>
                      </div>
                      {typeForm.serviceLines.map((line, idx) => {
                        const linkedService = services.find(
                          (service) => service.id === line.transactionServiceId,
                        );
                        if (!linkedService) return null;
                        return (
                          <div
                            key={`${line.transactionServiceId}-${idx}`}
                            className="session-type-linked-service-row"
                          >
                            <span className="session-type-linked-card-icon session-type-linked-card-icon--service" aria-hidden>
                              <ServiceConfigTabIcon name="services" />
                            </span>
                            <span className="session-type-linked-card-copy">
                              <strong>{linkedService.code}</strong>
                              <span>{linkedService.description}</span>
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder={
                                locale === "sl"
                                  ? "Bruto cena (neobvezno)"
                                  : "Gross price (optional)"
                              }
                              value={line.price}
                              onChange={(e) => {
                                const next = typeForm.serviceLines.map(
                                  (item, lineIndex) =>
                                    lineIndex === idx
                                      ? { ...item, price: e.target.value }
                                      : item,
                                );
                                setTypeForm({ ...typeForm, serviceLines: next });
                              }}
                            />
                            {selectedLocationId != null ? (
                              <div className="session-type-location-price-field">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder={
                                    locale === "sl"
                                      ? "Cena poslovalnice (prazno = privzeto)"
                                      : "Location price (blank = default)"
                                  }
                                  value={line.locationPrice || ""}
                                  onChange={(e) => {
                                    const next = typeForm.serviceLines.map(
                                      (item, lineIndex) =>
                                        lineIndex === idx
                                          ? { ...item, locationPrice: e.target.value }
                                          : item,
                                    );
                                    setTypeForm({ ...typeForm, serviceLines: next });
                                  }}
                                  aria-label={
                                    locale === "sl"
                                      ? "Bruto cena za izbrano poslovalnico"
                                      : "Gross price for selected location"
                                  }
                                />
                                <small>
                                  {locale === "sl"
                                    ? `Poslovalnica: ${locations.find((item) => item.id === selectedLocationId)?.name || selectedLocationId}`
                                    : `Location: ${locations.find((item) => item.id === selectedLocationId)?.name || selectedLocationId}`}
                                </small>
                              </div>
                            ) : null}
                            <div className="session-type-linked-card-actions">
                              <button
                                type="button"
                                className="secondary slim-btn"
                                onClick={() =>
                                  openLinkedServicePriceEdit(
                                    linkedService,
                                    idx,
                                    line.price,
                                  )
                                }
                              >
                                {locale === "sl" ? "Uredi" : "Edit"}
                              </button>
                              <button
                                type="button"
                                className="danger secondary slim-btn"
                                onClick={() =>
                                  setTypeForm({
                                    ...typeForm,
                                    serviceLines: typeForm.serviceLines.filter(
                                      (_, lineIndex) => lineIndex !== idx,
                                    ),
                                  })
                                }
                              >
                                {locale === "sl" ? "Odstrani" : "Remove"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {consumablesCapabilityEnabled ? (
                  <div className="session-type-config-unified-card session-type-config-unified-card--consumables">
                    <div className="session-type-config-unified-card-header">
                      <div className="session-type-config-section-title">
                        <span className="session-type-config-section-icon session-type-config-section-icon--consumables" aria-hidden>
                          <ServiceConfigTabIcon name="services" />
                        </span>
                        <div>
                          <h3>{locale === "sl" ? "Porabni materiali" : "Consumables"}</h3>
                          <p>
                            {locale === "sl"
                              ? "Povežite porabni material, ki se privzeto uporabi pri izvedbi te storitve."
                              : "Link the consumables used by default when this service is delivered."}
                          </p>
                        </div>
                      </div>
                      {canEditConsumables && <div className="session-type-config-unified-actions">
                        <button type="button" className="secondary small-btn" onClick={() => setConsumableEditorMode("existing")}>
                          <ServiceConfigTabIcon name="plus" />
                          {locale === "sl" ? "Dodaj obstoječe" : "Add existing"}
                        </button>
                        <button type="button" className="secondary small-btn" onClick={() => setConsumableEditorMode("create")}>
                          <ServiceConfigTabIcon name="plus" />
                          {locale === "sl" ? "Ustvari novo" : "Create new"}
                        </button>
                      </div>}
                    </div>

                    {canEditConsumables && consumableEditorMode ? (
                      <div className="session-type-consumable-add-panel">
                        {consumableEditorMode === "existing" ? (
                          <>
                            <DesktopSelect value={selectedConsumableId} onChange={(event) => setSelectedConsumableId(event.target.value)}>
                              <option value="">{locale === "sl" ? "Izberite artikel …" : "Select an item…"}</option>
                              {consumableItems
                                .filter((item) => !typeForm.consumableLines.some((line) => line.consumableId === item.id))
                                .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </DesktopSelect>
                            <button type="button" className="primary small-btn" disabled={!selectedConsumableId} onClick={addSelectedConsumableToType}>
                              {locale === "sl" ? "Dodaj artikel" : "Add item"}
                            </button>
                          </>
                        ) : (
                          <>
                            <input value={newConsumableName} onChange={(event) => setNewConsumableName(event.target.value)} placeholder={locale === "sl" ? "Ime artikla" : "Item name"} />
                            <input value={newConsumableUnit} onChange={(event) => setNewConsumableUnit(event.target.value)} placeholder={locale === "sl" ? "Enota (npr. kos, ml)" : "Unit (e.g. pcs, ml)"} />
                            <button type="button" className="primary small-btn" disabled={!newConsumableName.trim()} onClick={createConsumableForType}>
                              {locale === "sl" ? "Ustvari in dodaj" : "Create and add"}
                            </button>
                          </>
                        )}
                        <button type="button" className="secondary small-btn" onClick={() => setConsumableEditorMode(null)}>
                          {locale === "sl" ? "Prekliči" : "Cancel"}
                        </button>
                      </div>
                    ) : null}

                    {typeForm.consumableLines.length === 0 ? (
                      <div className="session-type-linked-empty">
                        {locale === "sl" ? "Ni povezanih porabnih materialov." : "No consumables are linked."}
                      </div>
                    ) : (
                      <div className="session-type-consumables-list">
                        <div className="session-type-consumables-head" aria-hidden>
                          <span>{locale === "sl" ? "Artikel" : "Item"}</span>
                          <span>{locale === "sl" ? "Količina" : "Quantity"}</span>
                          <span>{locale === "sl" ? "Obračun" : "Calculation"}</span>
                          <span>{locale === "sl" ? "Zaračunaj" : "Bill"}</span>
                          <span>{locale === "sl" ? "Dejanja" : "Actions"}</span>
                        </div>
                        {typeForm.consumableLines.map((line, idx) => {
                          const item = consumableItems.find((candidate) => candidate.id === line.consumableId);
                          return (
                            <div key={`${line.consumableId}-${idx}`} className="session-type-consumable-row">
                              <span className="session-type-linked-card-copy">
                                <strong>{item?.name || `#${line.consumableId}`}</strong>
                                <span>{item?.unit || "kos"}</span>
                              </span>
                              <div className="session-type-consumable-quantity">
                                <input type="number" min="0" step="0.01" value={line.defaultQuantity} disabled={!canEditConsumables} onChange={(event) => setTypeForm((current) => ({ ...current, consumableLines: current.consumableLines.map((row, rowIndex) => rowIndex === idx ? { ...row, defaultQuantity: event.target.value } : row) }))} />
                                <span>{item?.unit || "kos"}</span>
                              </div>
                              <DesktopSelect value={line.quantityMode} disabled={!canEditConsumables} onChange={(event) => setTypeForm((current) => ({ ...current, consumableLines: current.consumableLines.map((row, rowIndex) => rowIndex === idx ? { ...row, quantityMode: event.target.value as TypeConsumableLine["quantityMode"] } : row) }))}>
                                <option value="PER_SESSION">{locale === "sl" ? "Na termin" : "Per appointment"}</option>
                                <option value="PER_PARTICIPANT">{locale === "sl" ? "Na udeleženca" : "Per participant"}</option>
                              </DesktopSelect>
                              <label className="switch session-type-consumable-switch">
                                <input type="checkbox" checked={line.billableOverride === true} disabled={!canEditConsumables} onChange={(event) => setTypeForm((current) => ({ ...current, consumableLines: current.consumableLines.map((row, rowIndex) => rowIndex === idx ? { ...row, billableOverride: event.target.checked } : row) }))} />
                                <span className="slider" />
                              </label>
                              <div className="session-type-linked-card-actions">
                                {canEditConsumables && <button type="button" className="danger secondary slim-btn" onClick={() => setTypeForm((current) => ({ ...current, consumableLines: current.consumableLines.filter((_, rowIndex) => rowIndex !== idx) }))}>
                                  {locale === "sl" ? "Odstrani" : "Remove"}
                                </button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {locations.length > 1 ? (
                  <div className="session-type-config-unified-card session-type-config-location-section">
                    <div className="session-type-config-section-title">
                      <span className="session-type-config-section-icon" aria-hidden>
                        <ServiceConfigTabIcon name="types" />
                      </span>
                      <div>
                        <h3>{locale === "sl" ? "Razpoložljivost po lokacijah" : locale === "sr" ? "Dostupnost po lokacijama" : "Location availability"}</h3>
                        <p>{locale === "sl" ? "Določite, v katerih fizičnih lokacijah je storitev na voljo." : locale === "sr" ? "Odredite na kojim fizičkim lokacijama je usluga dostupna." : "Choose the physical locations where this service is available."}</p>
                      </div>
                    </div>
                    <label className="session-type-break-override">
                      <input
                        type="checkbox"
                        checked={typeForm.availableAllLocations}
                        onChange={(event) => setTypeForm({
                          ...typeForm,
                          availableAllLocations: event.target.checked,
                          locationIds: event.target.checked ? [] : typeForm.locationIds,
                        })}
                      />
                      <span>{locale === "sl" ? "Na voljo na vseh lokacijah" : locale === "sr" ? "Dostupno na svim lokacijama" : "Available at all locations"}</span>
                    </label>
                    {!typeForm.availableAllLocations ? (
                      <div className="workspace-copy-categories">
                        {locations.map((location) => {
                          const checked = typeForm.locationIds.includes(location.id);
                          return (
                            <label key={location.id}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => setTypeForm({
                                  ...typeForm,
                                  locationIds: event.target.checked
                                    ? Array.from(new Set([...typeForm.locationIds, location.id]))
                                    : typeForm.locationIds.filter((id) => id !== location.id),
                                })}
                              />
                              <span>{location.name}{location.city ? ` · ${location.city}` : ""}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="session-type-config-unified-card session-type-config-booking-section">
                <div className="session-type-config-section-title">
                  <span
                    className="session-type-config-section-icon"
                    aria-hidden
                  >
                    <ServiceConfigTabIcon name="cards" />
                  </span>
                  <h3>{locale === "sl" ? "Pravila rezervacij" : "Booking rules"}</h3>
                </div>
                {multipleClientsPerSessionEnabled ? (
                  <Field label={locale === "sl" ? "Cena na terminu" : "Session price"}>
                    <div
                      className={`guest-booking-select session-price-mode-select${priceCalculationPickerOpen ? " is-open" : ""}`}
                      ref={priceCalculationSelectRef}
                    >
                      <button
                        type="button"
                        className="guest-booking-select-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={priceCalculationPickerOpen}
                        onClick={() => setPriceCalculationPickerOpen((o) => !o)}
                      >
                        <span className="guest-booking-select-trigger-main">
                          <span className="guest-booking-select-value">
                            {
                              priceCalculationOptionMeta(
                                typeForm.priceCalculationMode,
                                locale,
                              ).label
                            }
                          </span>
                          <span className="guest-booking-select-line">
                            {
                              priceCalculationOptionMeta(
                                typeForm.priceCalculationMode,
                                locale,
                              ).line
                            }
                          </span>
                        </span>
                        <span
                          className="guest-booking-select-chevron"
                          aria-hidden
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 20 20"
                            fill="none"
                          >
                            <path
                              d="M5.5 8.25 10 12.75 14.5 8.25"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </button>
                      {priceCalculationPickerOpen ? (
                        <ul className="guest-booking-select-menu" role="listbox">
                          {(locale === "sl"
                            ? PRICE_CALCULATION_OPTIONS_SL
                            : PRICE_CALCULATION_OPTIONS_EN
                          ).map((opt) => {
                            const selected =
                              typeForm.priceCalculationMode === opt.value;
                            return (
                              <li key={opt.value} role="presentation">
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  className={`guest-booking-select-option${selected ? " is-selected" : ""}`}
                                  onClick={() => {
                                    setTypeForm({
                                      ...typeForm,
                                      priceCalculationMode: opt.value,
                                    });
                                    setPriceCalculationPickerOpen(false);
                                  }}
                                >
                                  <span className="guest-booking-select-option-label">
                                    {opt.label}
                                  </span>
                                  <span className="guest-booking-select-option-line">
                                    {opt.line}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </Field>
                ) : null}
                {!guestBookingDisabledByModules ? (
                  <Field label={locale === "sl" ? "Rezervacija gostov" : "Guest booking"}>
                    <div
                      className={`guest-booking-select${guestBookingPickerOpen ? " is-open" : ""}`}
                      ref={guestBookingSelectRef}
                    >
                      <button
                        type="button"
                        className="guest-booking-select-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={guestBookingPickerOpen}
                        onClick={() => setGuestBookingPickerOpen((o) => !o)}
                      >
                        <span className="guest-booking-select-trigger-main">
                          <span className="guest-booking-select-value">
                            {
                              guestBookingOptionMeta(
                                typeForm.guestBookingMode,
                                locale,
                              )
                                .label
                            }
                          </span>
                          <span className="guest-booking-select-line">
                            {
                              guestBookingOptionMeta(
                                typeForm.guestBookingMode,
                                locale,
                              )
                                .line
                            }
                          </span>
                        </span>
                        <span
                          className="guest-booking-select-chevron"
                          aria-hidden
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 20 20"
                            fill="none"
                          >
                            <path
                              d="M5.5 8.25 10 12.75 14.5 8.25"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </button>
                      {guestBookingPickerOpen ? (
                        <ul className="guest-booking-select-menu" role="listbox">
                          {guestBookingOptions.map((opt) => {
                            const selected =
                              typeForm.guestBookingMode === opt.value;
                            return (
                              <li key={opt.value} role="presentation">
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  className={`guest-booking-select-option${selected ? " is-selected" : ""}`}
                                  onClick={() => {
                                    setTypeForm({
                                      ...typeForm,
                                      guestBookingMode: opt.value,
                                    });
                                    setGuestBookingPickerOpen(false);
                                  }}
                                >
                                  <span className="guest-booking-select-option-label">
                                    {opt.label}
                                  </span>
                                  <span className="guest-booking-select-option-line">
                                    {opt.line}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </Field>
                ) : null}
                </div>

                {groupBookingModuleEnabled ? (
                <div
                  className={`session-type-config-unified-card session-type-config-group-card${typeForm.groupBookingEnabled ? " is-on" : ""}`}
                >
                  <label className="session-type-config-group-toggle">
                    <span
                      className="session-type-config-group-icon"
                      aria-hidden
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M16 11a3 3 0 1 0-2.9-3.7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M2.8 19c.6-3.1 2.4-4.7 5.2-4.7s4.6 1.6 5.2 4.7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M13.5 15c2.1.3 3.4 1.6 3.9 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="session-type-config-group-copy">
                      <strong>
                        {locale === "sl" ? "Skupina VKLOP/IZKLOP" : "Group ON/OFF"}
                      </strong>
                      <span>
                        {locale === "sl"
                          ? "Ko je vklopljeno, je to storitev mogoče izbrati za skupinske termine, ki jih ustvarja osebje."
                          : "When on, this type can be selected for staff-created group booked sessions."}
                      </span>
                    </span>
                    <span className="session-type-config-switch">
                      <input
                        type="checkbox"
                        checked={typeForm.groupBookingEnabled}
                        onChange={(e) =>
                          setTypeForm({
                            ...typeForm,
                            groupBookingEnabled: e.target.checked,
                          })
                        }
                      />
                      <span className="session-type-config-switch-track">
                        <span className="session-type-config-switch-thumb">
                          {typeForm.groupBookingEnabled ? "✓" : ""}
                        </span>
                      </span>
                    </span>
                  </label>

                  {typeForm.groupBookingEnabled ? (
                    <div className="session-type-config-conditional-grid">
                      <div className="session-type-config-conditional-single">
                        <Field
                          label={
                            locale === "sl"
                              ? "Največ udeležencev v skupini"
                              : "Group max participants"
                          }
                        >
                          <input
                            type="number"
                            min={1}
                            max={999}
                            step={1}
                            inputMode="numeric"
                            value={typeForm.maxParticipantsPerSession}
                            onChange={(e) =>
                              setTypeForm({
                                ...typeForm,
                                maxParticipantsPerSession:
                                  normalizeOptionalParticipantsField(
                                    e.target.value,
                                  ),
                              })
                            }
                            placeholder={locale === "sl" ? "Brez omejitve" : "No limit"}
                          />
                        </Field>
                      </div>
                      <div className="session-type-config-conditional-full">
                        <Field
                          label={locale === "sl" ? "Omeji na uporabnike" : "Limit to users"}
                        >
                          <div
                            className={`guest-limit-client-picker${guestLimitPickerOpen ? " is-open" : ""}`}
                            ref={guestLimitClientPickerRef}
                          >
                            <div
                              className="guest-limit-client-trigger"
                              onClick={() => setGuestLimitPickerOpen(true)}
                            >
                              <div className="guest-limit-client-chip-list">
                                {guestLimitSelectedEntries.map((entry) => (
                                  <span
                                    key={entry.email}
                                    className="guest-limit-client-chip"
                                  >
                                    <span
                                      className="guest-limit-client-chip-avatar"
                                      aria-hidden
                                    >
                                      {entry.initials}
                                    </span>
                                    <span className="guest-limit-client-chip-name">
                                      {entry.name}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label={
                                        locale === "sl"
                                          ? `Odstrani ${entry.name}`
                                          : `Remove ${entry.name}`
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setGuestLimitEmails(
                                          guestLimitSelectedEmails.filter(
                                            (email) => email !== entry.email,
                                          ),
                                        );
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                <span className="guest-limit-client-search-wrap">
                                  <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    aria-hidden
                                  >
                                    <path
                                      d="m14.2 14.2 3.1 3.1M8.8 15.1a6.3 6.3 0 1 1 0-12.6 6.3 6.3 0 0 1 0 12.6Z"
                                      stroke="currentColor"
                                      strokeWidth="1.7"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  <input
                                    type="search"
                                    value={guestLimitClientQuery}
                                    onChange={(e) => {
                                      setGuestLimitClientQuery(e.target.value);
                                      setGuestLimitPickerOpen(true);
                                    }}
                                    onFocus={() =>
                                      setGuestLimitPickerOpen(true)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter" || !guestLimitManualEmail) return;
                                      e.preventDefault();
                                      addGuestLimitEmail(guestLimitManualEmail);
                                    }}
                                    placeholder={
                                      locale === "sl"
                                        ? "Poišči stranko ali vnesi e-pošto…"
                                        : "Search a client or enter an email…"
                                    }
                                  />
                                </span>
                              </div>
                              <span
                                className="guest-limit-client-chevron"
                                aria-hidden
                              >
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 20 20"
                                  fill="none"
                                >
                                  <path
                                    d="M5.5 8.25 10 12.75 14.5 8.25"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                            </div>
                            {guestLimitPickerOpen ? (
                              <div
                                className="guest-limit-client-menu"
                                role="listbox"
                                aria-label={
                                  locale === "sl"
                                    ? "Rezervirana mesta po e-pošti"
                                    : "Reserved spots by email"
                                }
                              >
                                {guestLimitManualEmail ? (
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                    className="guest-limit-client-option guest-limit-client-option--email"
                                    onClick={() => addGuestLimitEmail(guestLimitManualEmail)}
                                  >
                                    <span className="guest-limit-client-check" aria-hidden>+</span>
                                    <span className="guest-limit-client-avatar" aria-hidden>@</span>
                                    <span className="guest-limit-client-copy">
                                      <strong>{locale === "sl" ? "Dodaj e-poštni naslov" : "Add email address"}</strong>
                                      <span>{guestLimitManualEmail}</span>
                                    </span>
                                  </button>
                                ) : null}
                                {guestAppClientsLoading ? (
                                  <div className="guest-limit-client-empty">
                                    {locale === "sl" ? "Nalaganje strank…" : "Loading clients…"}
                                  </div>
                                ) : filteredGuestLimitClients.length === 0 && !guestLimitManualEmail ? (
                                  <div className="guest-limit-client-empty">
                                    {locale === "sl"
                                      ? "Vnesite veljaven e-poštni naslov ali poiščite stranko."
                                      : "Enter a valid email address or search for a client."}
                                  </div>
                                ) : (
                                  filteredGuestLimitClients.map((client) => {
                                    const email = (client.email || "")
                                      .trim()
                                      .toLowerCase();
                                    const selected =
                                      guestLimitSelectedEmails.includes(email);
                                    const name = clientFullName(client);
                                    return (
                                      <button
                                        key={client.id}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        className={`guest-limit-client-option${selected ? " is-selected" : ""}`}
                                        onClick={() =>
                                          toggleGuestLimitClientEmail(email)
                                        }
                                      >
                                        <span
                                          className="guest-limit-client-check"
                                          aria-hidden
                                        >
                                          {selected ? "✓" : ""}
                                        </span>
                                        <span
                                          className="guest-limit-client-avatar"
                                          aria-hidden
                                        >
                                          {clientInitials(client)}
                                        </span>
                                        <span className="guest-limit-client-copy">
                                          <strong>{name}</strong>
                                          <span>
                                            {client.email ||
                                              (locale === "sl"
                                                ? "Guest app uporabnik"
                                                : "Guest app user")}
                                          </span>
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                                <div className="guest-limit-client-helper">
                                  {locale === "sl"
                                    ? "Za vsak izbrani e-poštni naslov se rezervira eno mesto. Preostala mesta lahko rezervirajo drugi uporabniki."
                                    : "One spot is reserved for each selected email address. All remaining spots stay available to other users."}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </div>
                ) : null}
              </section>


            </form>

            {(!isTypeEditorMobileTablet || !typeEditorKeyboardOpen) ? (
              <div className="form-actions booking-side-panel-footer session-type-config-modal-footer">
                <button
                  form="session-type-edit-form"
                  type="submit"
                  className="gapp-primary-button"
                  disabled={!isTypeFormDirty}
                >
                  <GuestConfigSaveIcon />
                  {editingType ? t("formSaveChanges") : t("Create type")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showServiceModal ? (
        <div
          className="modal-backdrop booking-side-panel-backdrop transaction-service-modal-backdrop linked-entity-modal-backdrop"
          onMouseDown={onServiceModalBackdropMouseDown}
          role="presentation"
        >
          <div
            className="modal large-modal booking-side-panel transaction-service-modal linked-entity-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="transaction-service-modal-header">
              <div className="transaction-service-modal-heading">
                <span className="transaction-service-modal-icon" aria-hidden>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6.75 3.75h10.5A1.75 1.75 0 0 1 19 5.5v13a1.75 1.75 0 0 1-1.75 1.75H6.75A1.75 1.75 0 0 1 5 18.5v-13a1.75 1.75 0 0 1 1.75-1.75Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8.5 8.25h7M8.5 12h7M8.5 15.75h4.25"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <div>
                  <h2>
                    {serviceModalAction === "linked-price"
                      ? locale === "sl"
                        ? "Cena obračunske storitve"
                        : "Billing service price"
                      : editingServiceId
                        ? t("sessionTypesTxModalEditTitle")
                        : serviceModalAction === "link"
                          ? locale === "sl"
                            ? "Obračunska storitev"
                            : "Billing service"
                          : t("sessionTypesTxModalNewTitle")}
                  </h2>
                  <p>
                    {serviceModalAction === "linked-price"
                      ? locale === "sl"
                        ? "Ta cena velja samo za izbrano storitev. Osnovna obračunska storitev se ne spremeni."
                        : "This price applies only to the selected service. The base billing service is not changed."
                      : editingServiceId
                        ? locale === "sl"
                          ? "Posodobite podatke obračunske storitve."
                          : "Update the billing service details."
                        : serviceModalAction === "link"
                          ? locale === "sl"
                            ? "Dodajte obstoječo obračunsko storitev ali ustvarite novo."
                            : "Add an existing billing service or create a new one."
                          : locale === "sl"
                            ? "Ustvarite novo obračunsko storitev."
                            : "Create a new billing service."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="secondary transaction-service-modal-close"
                onClick={dismissServiceModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {serviceModalAction === "link" ? (
              <div className="linked-entity-modal-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={serviceModalTab === "existing"}
                  className={serviceModalTab === "existing" ? "is-active" : ""}
                  onClick={() => {
                    setServiceModalTab("existing");
                    setEditingServiceId(null);
                    setSelectedBillingServiceId(null);
                  }}
                >
                  {locale === "sl" ? "Dodaj obstoječo" : "Add existing"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={serviceModalTab === "create"}
                  className={serviceModalTab === "create" ? "is-active" : ""}
                  onClick={() => {
                    const empty: ServiceFormState = {
                      description: "",
                      taxRate: "VAT_22",
                      grossPrice: "0.00",
                      advanceDeduction: false,
                      noShow: false,
                    };
                    setServiceModalTab("create");
                    setEditingServiceId(null);
                    setServiceForm(empty);
                    setServiceFormSnapshot({ ...empty });
                  }}
                >
                  {locale === "sl" ? "Ustvari novo" : "Create new"}
                </button>
              </div>
            ) : null}

            {serviceModalAction === "linked-price" ? (
              <form
                id="transaction-service-edit-form"
                className="transaction-service-modal-body"
                onSubmit={serviceSubmit}
              >
                <div className="transaction-service-modal-grid transaction-service-modal-grid--two">
                  <Field label={locale === "sl" ? "Obračunska storitev" : "Billing service"}>
                    <input
                      readOnly
                      value={
                        services.find((service) => service.id === selectedBillingServiceId)?.description ||
                        serviceForm.description
                      }
                    />
                  </Field>
                  <Field
                    label={locale === "sl" ? "Bruto cena za to storitev" : "Gross price for this service"}
                    hint={
                      locale === "sl"
                        ? "Sprememba se shrani samo na povezavi s trenutno storitvijo."
                        : "The change is saved only on the link to the current service."
                    }
                  >
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      value={serviceForm.grossPrice}
                      onChange={(event) =>
                        setServiceForm({ ...serviceForm, grossPrice: event.target.value })
                      }
                    />
                  </Field>
                </div>
              </form>
            ) : serviceModalTab === "existing" &&
            serviceModalAction === "link" ? (
              <div className="transaction-service-modal-body linked-entity-picker-body">
                <div className="linked-entity-search">
                  <ServiceConfigTabIcon name="search" />
                  <input
                    type="search"
                    value={servicePickerQuery}
                    onChange={(event) => setServicePickerQuery(event.target.value)}
                    placeholder={
                      locale === "sl"
                        ? "Išči obračunsko storitev ..."
                        : "Search billing services ..."
                    }
                  />
                </div>
                <div className="linked-entity-option-list" role="radiogroup">
                  {billingServicePickerOptions.length === 0 ? (
                    <EmptyState
                      title={
                        locale === "sl"
                          ? "Ni obračunskih storitev"
                          : "No billing services"
                      }
                      text={
                        locale === "sl"
                          ? "Ustvarite novo obračunsko storitev."
                          : "Create a new billing service."
                      }
                    />
                  ) : (
                    billingServicePickerOptions.map((service) => {
                      const selected = selectedBillingServiceId === service.id;
                      const linkedIndex = typeForm.serviceLines.findIndex(
                        (line) => line.transactionServiceId === service.id,
                      );
                      const linkedLine =
                        linkedIndex >= 0 ? typeForm.serviceLines[linkedIndex] : null;
                      const alreadyLinked = linkedIndex >= 0;
                      const displayedGross =
                        linkedLine?.price?.trim() && Number.isFinite(Number(linkedLine.price))
                          ? Number(linkedLine.price)
                          : transactionServiceGross(service);
                      return (
                        <div
                          key={service.id}
                          role="radio"
                          aria-checked={selected}
                          aria-disabled={alreadyLinked}
                          tabIndex={alreadyLinked ? -1 : 0}
                          className={`linked-entity-option linked-entity-option--service-picker${selected ? " is-selected" : ""}${alreadyLinked ? " is-disabled" : ""}`}
                          onClick={() => {
                            if (!alreadyLinked) setSelectedBillingServiceId(service.id);
                          }}
                          onKeyDown={(event) => {
                            if (alreadyLinked) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedBillingServiceId(service.id);
                            }
                          }}
                        >
                          <span className="linked-entity-radio" aria-hidden>
                            {selected ? <span /> : null}
                          </span>
                          <span className="linked-entity-option-icon linked-entity-option-icon--service" aria-hidden>
                            <ServiceConfigTabIcon name="services" />
                          </span>
                          <span className="linked-entity-option-copy">
                            <strong>{service.code}</strong>
                            <span>{service.description}</span>
                          </span>
                          <span className="linked-entity-option-meta">
                            <strong>
                              {currency(displayedGross)}
                            </strong>
                            <span>{taxLabels[service.taxRate]}</span>
                          </span>
                          {alreadyLinked ? (
                            <span className="linked-entity-option-badge">
                              {locale === "sl" ? "Že dodana" : "Already added"}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="secondary slim-btn linked-entity-option-edit"
                            onClick={(event) => {
                              event.stopPropagation();
                              openLinkedServicePriceEdit(
                                service,
                                linkedIndex >= 0 ? linkedIndex : null,
                                linkedLine?.price,
                              );
                            }}
                          >
                            {locale === "sl" ? "Uredi" : "Edit"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
            <form
              id="transaction-service-edit-form"
              className="transaction-service-modal-body"
              onSubmit={serviceSubmit}
            >
              <div className="transaction-service-modal-grid transaction-service-modal-grid--two">
                <Field label={t("sessionTypesTxLabelDescription")}>
                  <input
                    required
                    value={serviceForm.description}
                    onChange={(e) =>
                      setServiceForm({
                        ...serviceForm,
                        description: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label={t("sessionTypesTxFieldTax")}>
                  <div
                    className={`guest-booking-select transaction-service-tax-select${taxRatePickerOpen ? " is-open" : ""}`}
                    ref={taxRateSelectRef}
                  >
                    <button
                      type="button"
                      className="guest-booking-select-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={taxRatePickerOpen}
                      onClick={() => setTaxRatePickerOpen((o) => !o)}
                    >
                      <span className="guest-booking-select-trigger-main">
                        <span className="guest-booking-select-value">
                          {taxRateOptionSelected.label}
                        </span>
                        {taxRateOptionSelected.line ? (
                          <span className="guest-booking-select-line">
                            {taxRateOptionSelected.line}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="guest-booking-select-chevron"
                        aria-hidden
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                        >
                          <path
                            d="M5.5 8.25 10 12.75 14.5 8.25"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                    {taxRatePickerOpen ? (
                      <ul className="guest-booking-select-menu" role="listbox">
                        {taxRateSelectOptions.map((opt) => {
                          const selected = serviceForm.taxRate === opt.value;
                          return (
                            <li key={opt.value} role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`guest-booking-select-option${selected ? " is-selected" : ""}`}
                                onClick={() => {
                                  setServiceForm({
                                    ...serviceForm,
                                    taxRate: opt.value,
                                  });
                                  setTaxRatePickerOpen(false);
                                }}
                              >
                                <span className="guest-booking-select-option-label">
                                  {opt.label}
                                </span>
                                {opt.line ? (
                                  <span className="guest-booking-select-option-line">
                                    {opt.line}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </Field>
                <Field label={t("sessionTypesTxFieldGross")}>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min={0}
                    value={serviceForm.grossPrice}
                    onChange={(e) =>
                      setServiceForm({
                        ...serviceForm,
                        grossPrice: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              {(advanceModuleEnabled || noShowModuleEnabled) && (
                <div className="transaction-service-switch-list">
                  {advanceModuleEnabled && (
                    <label className="transaction-service-switch-row">
                      <span className="transaction-service-switch-icon" aria-hidden>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M4.75 11.4 11.4 4.75h5.2a2.65 2.65 0 0 1 2.65 2.65v5.2l-6.65 6.65a2.2 2.2 0 0 1-3.1 0L4.75 14.5a2.2 2.2 0 0 1 0-3.1Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15.8 8.2h.01"
                            stroke="currentColor"
                            strokeWidth="3.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span className="transaction-service-switch-copy">
                        <strong>{t("sessionTypesTxAdvanceSwitch")}</strong>
                        <span>{t("sessionTypesTxAdvanceHint")}</span>
                      </span>
                      <span className="session-type-config-switch transaction-service-option-switch">
                        <input
                          type="checkbox"
                          checked={serviceForm.advanceDeduction}
                          onChange={(e) =>
                            setServiceForm({
                              ...serviceForm,
                              advanceDeduction: e.target.checked,
                            })
                          }
                          aria-label={t("sessionTypesTxAdvanceSwitch")}
                        />
                        <span className="session-type-config-switch-track" aria-hidden>
                          <span className="session-type-config-switch-thumb">
                            {serviceForm.advanceDeduction ? "✓" : ""}
                          </span>
                        </span>
                      </span>
                    </label>
                  )}

                  {noShowModuleEnabled && (
                    <label className="transaction-service-switch-row transaction-service-switch-row--no-show">
                      <span className="transaction-service-switch-icon" aria-hidden>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <circle
                            cx="12"
                            cy="12"
                            r="8.2"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          <path
                            d="M12 7.8v5.3M12 16.4h.01"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="transaction-service-switch-copy">
                        <strong>{t("sessionTypesTxNoShowSwitch")}</strong>
                        <span>{t("sessionTypesTxNoShowHint")}</span>
                      </span>
                      <span className="session-type-config-switch transaction-service-option-switch">
                        <input
                          type="checkbox"
                          checked={serviceForm.noShow}
                          onChange={(e) =>
                            setServiceForm({
                              ...serviceForm,
                              noShow: e.target.checked,
                            })
                          }
                          aria-label={t("sessionTypesTxNoShowSwitch")}
                        />
                        <span className="session-type-config-switch-track" aria-hidden>
                          <span className="session-type-config-switch-thumb">
                            {serviceForm.noShow ? "✓" : ""}
                          </span>
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="transaction-service-net-field">
                <Field label={t("sessionTypesTxLabelNet")}>
                  <input
                    readOnly
                    tabIndex={-1}
                    value={currency(transactionServiceNetComputed)}
                  />
                </Field>
              </div>
            </form>
            )}

            <div className="form-actions booking-side-panel-footer transaction-service-modal-footer linked-entity-modal-footer">
              {serviceModalAction === "linked-price" ? (
                <button
                  form="transaction-service-edit-form"
                  type="submit"
                  className="gapp-primary-button"
                  disabled={
                    selectedBillingServiceId == null ||
                    (editingLinkedServiceIndex != null && !isServiceFormDirty)
                  }
                >
                  <GuestConfigSaveIcon />
                  {editingLinkedServiceIndex != null
                    ? locale === "sl" ? "Shrani ceno" : "Save price"
                    : locale === "sl" ? "Dodaj storitev" : "Add service"}
                </button>
              ) : serviceModalTab === "existing" &&
              serviceModalAction === "link" ? (
                <button
                  type="button"
                  className="gapp-primary-button"
                  disabled={selectedBillingServiceId == null}
                  onClick={linkSelectedBillingService}
                >
                  <ServiceConfigTabIcon name="plus" />
                  {locale === "sl" ? "Dodaj storitev" : "Add service"}
                </button>
              ) : (
                <button
                  form="transaction-service-edit-form"
                  type="submit"
                  className="gapp-primary-button"
                  disabled={!isServiceFormDirty}
                >
                  <GuestConfigSaveIcon />
                  {editingServiceId
                    ? t("sessionTypesTxModalSaveService")
                    : serviceModalAction === "link"
                      ? locale === "sl"
                        ? "Ustvari in dodaj"
                        : "Create and add"
                      : t("sessionTypesTxModalCreateService")}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {isWorkspaceRolloutEnabled(me, 'SHARED_SERVICES') && <WorkspaceServiceManager
        open={showWorkspaceServiceManager}
        onClose={() => setShowWorkspaceServiceManager(false)}
        sessionTypes={types}
        currentUnitId={me.activeUnitId ?? me.companyId}
        locale={locale}
        onChanged={load}
      />}
    </div>
  );
}
