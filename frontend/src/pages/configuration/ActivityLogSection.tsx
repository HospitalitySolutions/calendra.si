import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthenticatedUser } from "../../authUserContext";
import { locationsQueryOptions, usersQueryOptions } from "../../queries/sharedQueryOptions";
import { activityLogPageQueryOptions, type ActivityLogPageParams } from "../../queries/remainingQueryOptions";

type ActivityModule =
  | "CALENDAR" | "CLIENTS" | "BILLING" | "INBOX" | "WAITLIST" | "SERVICES" | "CONSUMABLES"
  | "EMPLOYEES" | "CONFIGURATION" | "GUEST_APP" | "WEBSITE" | "INTEGRATIONS" | "SYSTEM";

type ActivityActorType = "USER" | "SYSTEM" | "WEBSITE_WIDGET" | "GUEST_APP" | "GUEST" | "INTEGRATION" | "PLATFORM_ADMIN";

type ActivityLogItem = {
  id: number;
  occurredAt: string;
  actorType: ActivityActorType;
  actorUserId?: number | null;
  actorName: string;
  module: ActivityModule;
  action: string;
  entityType: string;
  entityId?: number | null;
  entityLabel?: string | null;
  secondaryEntityType?: string | null;
  secondaryEntityId?: number | null;
  secondaryEntityLabel?: string | null;
  summary: string;
  locationId?: number | null;
  spaceId?: number | null;
  source: string;
  details: Record<string, unknown>;
};

type ActivityLogPage = {
  content: ActivityLogItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

type UserOption = { id: number; firstName?: string; lastName?: string; email?: string };
type LocationOption = { id: number; name: string };

const ACTIVITY_ACTIONS = [
  "SESSION_CREATED", "SESSION_UPDATED", "SESSION_RESCHEDULED", "SESSION_CANCELLED", "SESSION_DELETED",
  "SESSION_PARTICIPANT_ADDED", "SESSION_PARTICIPANT_REMOVED",
  "CLIENT_CREATED", "CLIENT_UPDATED", "CLIENT_DELETED", "CLIENT_ANONYMIZED", "CLIENT_DEACTIVATED", "CLIENT_ACTIVATED",
  "INVOICE_CREATED", "INVOICE_PAID", "INVOICE_REFUNDED", "INVOICE_SENT", "ENTITLEMENT_USED",
  "VOUCHER_ISSUED", "VOUCHER_REDEEMED", "VOUCHER_RESTORED", "VOUCHER_DEACTIVATED", "GIFT_CARD_SENT",
  "MESSAGE_SENT", "MESSAGE_SCHEDULED", "MESSAGE_SCHEDULE_CANCELLED", "INTERNAL_NOTE_ADDED",
  "WAITLIST_CREATED", "WAITLIST_UPDATED", "WAITLIST_REMOVED", "WAITLIST_OFFERED", "WAITLIST_SKIPPED",
  "WAITLIST_CONVERTED_TO_BOOKING", "WAITLIST_OFFER_ACCEPTED", "WAITLIST_OFFER_DECLINED", "WAITLIST_OFFER_REVOKED",
  "SERVICE_CREATED", "SERVICE_UPDATED", "SERVICE_DELETED", "SERVICES_REORDERED",
  "TRANSACTION_SERVICE_CREATED", "TRANSACTION_SERVICE_UPDATED", "TRANSACTION_SERVICE_DELETED",
  "SERVICE_GROUP_CREATED", "SERVICE_GROUP_UPDATED", "SERVICE_GROUP_DELETED", "SERVICE_GROUPS_REORDERED",
  "COURSE_CREATED", "COURSE_UPDATED", "COURSE_DELETED", "PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_DELETED",
  "WORKSPACE_SERVICE_TEMPLATE_CREATED", "WORKSPACE_SERVICE_TEMPLATE_UPDATED", "WORKSPACE_SERVICE_TEMPLATE_LINKED",
  "WORKSPACE_SERVICE_TEMPLATE_UNLINKED", "WORKSPACE_SERVICE_TEMPLATE_SYNCED",
  "EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "EMPLOYEE_DELETED", "EMPLOYEE_DEACTIVATED", "EMPLOYEE_ACTIVATED",
  "ROLE_CREATED", "ROLE_UPDATED", "ROLE_DUPLICATED", "ROLE_ARCHIVED",
  "WORKSPACE_UNIT_CREATED", "LOCATION_CREATED", "LOCATION_UPDATED", "LOCATION_DELETED", "SPACE_CREATED", "SPACE_UPDATED", "SPACE_DELETED",
  "RESERVATION_RULES_UPDATED", "WAITLIST_SETTINGS_UPDATED", "SETTINGS_UPDATED", "NOTIFICATION_TEMPLATE_UPDATED",
  "PAYMENT_METHOD_CREATED", "PAYMENT_METHOD_UPDATED", "PAYMENT_METHOD_DELETED", "PUBLIC_BOOKING_SETTINGS_UPDATED",
  "CUSTOM_FIELD_CREATED", "CUSTOM_FIELD_UPDATED", "CUSTOM_FIELD_DELETED",
  "FISCAL_PREMISE_REGISTERED", "FISCAL_CERTIFICATE_UPDATED", "FISCAL_CERTIFICATE_DELETED",
  "INTEGRATION_CONNECTED", "INTEGRATION_UPDATED", "INTEGRATION_DISCONNECTED", "INTEGRATION_SYNC_REQUESTED",
  "CONSUMABLE_CREATED", "CONSUMABLE_UPDATED", "CONSUMABLE_STOCK_ADJUSTED", "CONSUMABLE_STOCK_TRANSFERRED",
  "CONSUMABLE_CATEGORY_CREATED", "CONSUMABLE_CATEGORY_UPDATED", "CONSUMABLE_SUPPLIER_CREATED", "CONSUMABLE_SUPPLIER_UPDATED",
  "PURCHASE_ORDER_CREATED", "PURCHASE_ORDER_UPDATED", "SERVICE_CONSUMABLE_DEFAULTS_UPDATED", "SESSION_CONSUMABLES_UPDATED",
  "INVENTORY_SESSION_CREATED", "INVENTORY_SESSION_UPDATED", "INVENTORY_SESSION_COMPLETED",
] as const;

const MODULES: ActivityModule[] = ["CALENDAR", "CLIENTS", "BILLING", "INBOX", "WAITLIST", "SERVICES", "CONSUMABLES", "EMPLOYEES", "CONFIGURATION", "GUEST_APP", "WEBSITE", "INTEGRATIONS", "SYSTEM"];

const moduleLabel = (module: ActivityModule, sl: boolean) => ({
  CALENDAR: sl ? "Koledar" : "Calendar",
  CLIENTS: sl ? "Stranke" : "Clients",
  BILLING: sl ? "Zaračunavanje" : "Billing",
  INBOX: sl ? "Prejeto" : "Inbox",
  WAITLIST: sl ? "Čakalna vrsta" : "Waitlist",
  SERVICES: sl ? "Storitve" : "Services",
  CONSUMABLES: sl ? "Potrošni material" : "Consumables",
  EMPLOYEES: sl ? "Zaposleni" : "Employees",
  CONFIGURATION: sl ? "Konfiguracija" : "Configuration",
  GUEST_APP: "Guest app",
  WEBSITE: sl ? "Spletna stran" : "Website",
  INTEGRATIONS: sl ? "Integracije" : "Integrations",
  SYSTEM: sl ? "Sistem" : "System",
}[module]);

const actorTypeLabel = (actorType: ActivityActorType, sl: boolean) => ({
  USER: sl ? "Konto" : "Account",
  SYSTEM: sl ? "Sistem" : "System",
  WEBSITE_WIDGET: "Website widget",
  GUEST_APP: "Guest app",
  GUEST: sl ? "Gost" : "Guest",
  INTEGRATION: sl ? "Integracija" : "Integration",
  PLATFORM_ADMIN: "Platform admin",
}[actorType]);

const actionLabel = (action: string, sl: boolean) => {
  const labels: Record<string, [string, string]> = {
    SESSION_CREATED: ["Ustvaril termin", "Created session"],
    SESSION_UPDATED: ["Posodobil termin", "Updated session"],
    SESSION_RESCHEDULED: ["Prestavil termin", "Rescheduled session"],
    SESSION_CANCELLED: ["Odpovedal termin", "Cancelled session"],
    SESSION_DELETED: ["Izbrisal termin", "Deleted session"],
    SESSION_PARTICIPANT_ADDED: ["Dodal stranko v termin", "Added client to session"],
    SESSION_PARTICIPANT_REMOVED: ["Odstranil stranko iz termina", "Removed client from session"],
    CLIENT_CREATED: ["Ustvaril stranko", "Created client"],
    CLIENT_UPDATED: ["Posodobil stranko", "Updated client"],
    CLIENT_DELETED: ["Izbrisal stranko", "Deleted client"],
    CLIENT_ANONYMIZED: ["Anonimiziral stranko", "Anonymized client"],
    CLIENT_DEACTIVATED: ["Deaktiviral stranko", "Deactivated client"],
    CLIENT_ACTIVATED: ["Aktiviral stranko", "Activated client"],
    INVOICE_CREATED: ["Izdal račun", "Issued invoice"],
    INVOICE_PAID: ["Označil račun kot plačan", "Marked invoice paid"],
    INVOICE_REFUNDED: ["Izdal dobropis", "Issued refund"],
    INVOICE_SENT: ["Poslal račun", "Sent invoice"],
    ENTITLEMENT_USED: ["Uporabil ugodnost", "Used entitlement"],
    VOUCHER_ISSUED: ["Izdal bon", "Issued voucher"],
    VOUCHER_REDEEMED: ["Unovčil bon", "Redeemed voucher"],
    VOUCHER_RESTORED: ["Obnovil bon", "Restored voucher"],
    VOUCHER_DEACTIVATED: ["Deaktiviral bon", "Deactivated voucher"],
    MESSAGE_SENT: ["Poslal sporočilo", "Sent message"],
    MESSAGE_SCHEDULED: ["Načrtoval sporočilo", "Scheduled message"],
    MESSAGE_SCHEDULE_CANCELLED: ["Preklical načrtovano sporočilo", "Cancelled scheduled message"],
    INTERNAL_NOTE_ADDED: ["Dodal interno opombo", "Added internal note"],
    GIFT_CARD_SENT: ["Poslal bon", "Sent voucher"],
    WAITLIST_CREATED: ["Dodal na čakalno vrsto", "Created waitlist request"],
    WAITLIST_UPDATED: ["Posodobil čakalno vrsto", "Updated waitlist request"],
    WAITLIST_REMOVED: ["Odstranil s čakalne vrste", "Removed waitlist request"],
    WAITLIST_OFFERED: ["Poslal ponudbo termina", "Sent waitlist offer"],
    WAITLIST_SKIPPED: ["Preskočil zahtevo", "Skipped waitlist request"],
    WAITLIST_CONVERTED_TO_BOOKING: ["Pretvoril v rezervacijo", "Converted waitlist to booking"],
    WAITLIST_OFFER_ACCEPTED: ["Sprejel ponudbo termina", "Accepted waitlist offer"],
    WAITLIST_OFFER_DECLINED: ["Zavrnil ponudbo termina", "Declined waitlist offer"],
    WAITLIST_OFFER_REVOKED: ["Preklical ponudbo termina", "Revoked waitlist offer"],
    SERVICE_CREATED: ["Ustvaril storitev", "Created service"],
    SERVICE_UPDATED: ["Posodobil storitev", "Updated service"],
    SERVICE_DELETED: ["Izbrisal storitev", "Deleted service"],
    SERVICES_REORDERED: ["Spremenil vrstni red storitev", "Reordered services"],
    TRANSACTION_SERVICE_CREATED: ["Ustvaril obračunsko storitev", "Created transaction service"],
    TRANSACTION_SERVICE_UPDATED: ["Posodobil obračunsko storitev", "Updated transaction service"],
    TRANSACTION_SERVICE_DELETED: ["Izbrisal obračunsko storitev", "Deleted transaction service"],
    SERVICE_GROUP_CREATED: ["Ustvaril skupino storitev", "Created service group"],
    SERVICE_GROUP_UPDATED: ["Posodobil skupino storitev", "Updated service group"],
    SERVICE_GROUP_DELETED: ["Izbrisal skupino storitev", "Deleted service group"],
    SERVICE_GROUPS_REORDERED: ["Spremenil vrstni red skupin", "Reordered service groups"],
    COURSE_CREATED: ["Ustvaril tečaj", "Created course"],
    COURSE_UPDATED: ["Posodobil tečaj", "Updated course"],
    COURSE_DELETED: ["Izbrisal tečaj", "Deleted course"],
    PRODUCT_CREATED: ["Ustvaril ugodnost/kartico", "Created card/membership"],
    PRODUCT_UPDATED: ["Posodobil ugodnost/kartico", "Updated card/membership"],
    PRODUCT_DELETED: ["Izbrisal ugodnost/kartico", "Deleted card/membership"],
    WORKSPACE_SERVICE_TEMPLATE_CREATED: ["Ustvaril skupno storitev", "Created workspace service template"],
    WORKSPACE_SERVICE_TEMPLATE_UPDATED: ["Posodobil skupno storitev", "Updated workspace service template"],
    WORKSPACE_SERVICE_TEMPLATE_LINKED: ["Povezal storitev", "Linked workspace service"],
    WORKSPACE_SERVICE_TEMPLATE_UNLINKED: ["Odvezal storitev", "Unlinked workspace service"],
    WORKSPACE_SERVICE_TEMPLATE_SYNCED: ["Sinhroniziral storitev", "Synced workspace service"],
    EMPLOYEE_CREATED: ["Dodal zaposlenega", "Created employee"],
    EMPLOYEE_UPDATED: ["Posodobil zaposlenega", "Updated employee"],
    EMPLOYEE_DELETED: ["Izbrisal zaposlenega", "Deleted employee"],
    EMPLOYEE_DEACTIVATED: ["Deaktiviral zaposlenega", "Deactivated employee"],
    EMPLOYEE_ACTIVATED: ["Aktiviral zaposlenega", "Activated employee"],
    ROLE_CREATED: ["Ustvaril vlogo", "Created role"],
    ROLE_UPDATED: ["Posodobil vlogo", "Updated role"],
    ROLE_DUPLICATED: ["Podvojil vlogo", "Duplicated role"],
    ROLE_ARCHIVED: ["Arhiviral vlogo", "Archived role"],
    WORKSPACE_UNIT_CREATED: ["Ustvaril poslovno enoto", "Created operating unit"],
    LOCATION_CREATED: ["Ustvaril lokacijo", "Created location"],
    LOCATION_UPDATED: ["Posodobil lokacijo", "Updated location"],
    LOCATION_DELETED: ["Izbrisal lokacijo", "Deleted location"],
    SPACE_CREATED: ["Ustvaril prostor", "Created space"],
    SPACE_UPDATED: ["Posodobil prostor", "Updated space"],
    SPACE_DELETED: ["Izbrisal prostor", "Deleted space"],
    RESERVATION_RULES_UPDATED: ["Posodobil rezervacijska pravila", "Updated reservation rules"],
    WAITLIST_SETTINGS_UPDATED: ["Posodobil pravila čakalne vrste", "Updated waitlist settings"],
    SETTINGS_UPDATED: ["Posodobil nastavitve", "Updated settings"],
    NOTIFICATION_TEMPLATE_UPDATED: ["Posodobil predlogo obvestila", "Updated notification template"],
    PAYMENT_METHOD_CREATED: ["Dodal način plačila", "Created payment method"],
    PAYMENT_METHOD_UPDATED: ["Posodobil način plačila", "Updated payment method"],
    PAYMENT_METHOD_DELETED: ["Izbrisal način plačila", "Deleted payment method"],
    PUBLIC_BOOKING_SETTINGS_UPDATED: ["Posodobil javno naročanje", "Updated public booking settings"],
    CUSTOM_FIELD_CREATED: ["Ustvaril polje po meri", "Created custom field"],
    CUSTOM_FIELD_UPDATED: ["Posodobil polje po meri", "Updated custom field"],
    CUSTOM_FIELD_DELETED: ["Izbrisal polje po meri", "Deleted custom field"],
    FISCAL_PREMISE_REGISTERED: ["Registriral poslovni prostor", "Registered fiscal premise"],
    FISCAL_CERTIFICATE_UPDATED: ["Posodobil davčno potrdilo", "Updated fiscal certificate"],
    FISCAL_CERTIFICATE_DELETED: ["Izbrisal davčno potrdilo", "Deleted fiscal certificate"],
    INTEGRATION_CONNECTED: ["Povezal integracijo", "Connected integration"],
    INTEGRATION_UPDATED: ["Posodobil integracijo", "Updated integration"],
    INTEGRATION_DISCONNECTED: ["Odklopil integracijo", "Disconnected integration"],
    INTEGRATION_SYNC_REQUESTED: ["Zahteval sinhronizacijo", "Requested integration sync"],
    CONSUMABLE_CREATED: ["Ustvaril potrošni material", "Created consumable"],
    CONSUMABLE_UPDATED: ["Posodobil potrošni material", "Updated consumable"],
    CONSUMABLE_STOCK_ADJUSTED: ["Prilagodil zalogo", "Adjusted stock"],
    CONSUMABLE_STOCK_TRANSFERRED: ["Prenesel zalogo", "Transferred stock"],
    CONSUMABLE_CATEGORY_CREATED: ["Ustvaril kategorijo materiala", "Created consumable category"],
    CONSUMABLE_CATEGORY_UPDATED: ["Posodobil kategorijo materiala", "Updated consumable category"],
    CONSUMABLE_SUPPLIER_CREATED: ["Ustvaril dobavitelja", "Created supplier"],
    CONSUMABLE_SUPPLIER_UPDATED: ["Posodobil dobavitelja", "Updated supplier"],
    PURCHASE_ORDER_CREATED: ["Ustvaril naročilo dobavitelju", "Created purchase order"],
    PURCHASE_ORDER_UPDATED: ["Posodobil naročilo dobavitelju", "Updated purchase order"],
    SERVICE_CONSUMABLE_DEFAULTS_UPDATED: ["Posodobil privzeti material storitve", "Updated service consumable defaults"],
    SESSION_CONSUMABLES_UPDATED: ["Posodobil material termina", "Updated session consumables"],
    INVENTORY_SESSION_CREATED: ["Začel inventuro", "Started inventory session"],
    INVENTORY_SESSION_UPDATED: ["Posodobil štetje inventure", "Updated inventory counts"],
    INVENTORY_SESSION_COMPLETED: ["Zaključil inventuro", "Completed inventory session"],
  };
  const pair = labels[action];
  if (pair) return sl ? pair[0] : pair[1];
  return action.toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
};

const formatValue = (value: unknown, locale: string): string => {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map(v => formatValue(v, locale)).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
  }
  return String(value);
};

const humanizeFieldLabel = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, c => c.toUpperCase())
    .trim();

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

function buildAreaEntity(item: ActivityLogItem, sl: boolean): string {
  const parts = [moduleLabel(item.module, sl)];
  if (item.entityLabel) parts.push(item.entityLabel);
  else if (item.entityType) parts.push(item.entityType);
  if (item.secondaryEntityLabel) parts.push(item.secondaryEntityLabel);
  return parts.filter(Boolean).join(" – ");
}

function buildDetailsLocation(item: ActivityLogItem, locationNames: Map<number, string>, locale: string, sl: boolean): string {
  const details = item.details || {};
  const locationName = item.locationId != null ? locationNames.get(item.locationId) : undefined;

  const startTime = typeof details.startTime === "string" ? details.startTime : "";
  if (startTime) {
    const parsed = new Date(startTime);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
    }
  }

  if (typeof details.email === "string" && details.email.trim()) {
    return `${sl ? "E-pošta" : "Email"}: ${details.email}`;
  }
  if (typeof details.amount === "number") {
    return `${sl ? "Znesek" : "Amount"}: ${formatValue(details.amount, locale)}`;
  }

  const directCandidates = [
    typeof details.locationName === "string" ? details.locationName : "",
    typeof details.location === "string" ? details.location : "",
    typeof details.serviceName === "string" ? details.serviceName : "",
    typeof details.type === "string" ? details.type : "",
    typeof details.clientName === "string" ? details.clientName : "",
    typeof details.invoiceNumber === "string" ? details.invoiceNumber : "",
    typeof details.targetLabel === "string" ? details.targetLabel : "",
    item.secondaryEntityLabel || "",
    locationName || "",
    item.entityLabel || "",
  ].filter(value => typeof value === "string" && value.trim() !== "") as string[];

  if (directCandidates.length > 0) return directCandidates[0];
  if (!sl && item.summary) return item.summary;
  return actionLabel(item.action, sl);
}

export function ActivityLogSection({ locale }: { locale: string }) {
  const navigate = useNavigate();
  const me = useAuthenticatedUser();
  const activeUnitId = me.activeUnitId ?? me.companyId;
  const queryClient = useQueryClient();
  const sl = locale === "sl";
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [actorType, setActorType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setItems([]);
    setUsers([]);
    setLocations([]);
    setPage(0);
    void Promise.all([
      queryClient.fetchQuery(usersQueryOptions<UserOption>(activeUnitId)).catch(() => [] as UserOption[]),
      queryClient.fetchQuery(locationsQueryOptions(activeUnitId)).catch(() => [] as LocationOption[]),
    ]).then(([nextUsers, nextLocations]) => {
      setUsers(nextUsers || []);
      setLocations(nextLocations || []);
    });
  }, [activeUnitId, queryClient]);

  useEffect(() => {
    setPage(0);
    setExpandedId(null);
  }, [search, module, action, actorType, actorUserId, locationId, from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const params: ActivityLogPageParams = { page, size: 50 };
      if (search.trim()) params.search = search.trim();
      if (module) params.module = module;
      if (action) params.action = action;
      if (actorType) params.actorType = actorType;
      if (actorUserId) params.actorUserId = actorUserId;
      if (locationId) params.locationId = locationId;
      if (from) params.from = new Date(`${from}T00:00:00`).toISOString();
      if (to) params.to = new Date(`${to}T23:59:59.999`).toISOString();
      void queryClient.fetchQuery(activityLogPageQueryOptions<ActivityLogPage>(activeUnitId, params))
        .then((data) => {
          setItems(data.content || []);
          setTotalElements(data.totalElements || 0);
          setTotalPages(data.totalPages || 0);
          setPageSize(data.size || 50);
        })
        .catch(() => setError(sl ? "Dnevnika aktivnosti ni bilo mogoče naložiti." : "Could not load the activity log."))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activeUnitId, queryClient, search, module, action, actorType, actorUserId, locationId, from, to, page, sl]);

  const locationNames = useMemo(() => new Map(locations.map(l => [l.id, l.name] as const)), [locations]);
  const dtf = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const rangeStart = totalElements === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = totalElements === 0 ? 0 : Math.min(totalElements, page * pageSize + items.length);

  const resetFilters = () => {
    setSearch("");
    setModule("");
    setAction("");
    setActorType("");
    setActorUserId("");
    setLocationId("");
    setFrom("");
    setTo("");
    setPage(0);
    setExpandedId(null);
  };

  const renderEmptyState = () => {
    if (loading) return <div className="activity-log-state">{sl ? "Nalaganje ..." : "Loading ..."}</div>;
    if (error) return <div className="activity-log-state is-error">{error}</div>;
    if (items.length === 0) return <div className="activity-log-state">{sl ? "Za izbrane filtre ni aktivnosti." : "No activity matches these filters."}</div>;
    return null;
  };

  return (
    <section className="activity-log-shell activity-log-shell--table">
      <div className="activity-log-heading">
        <h2>{sl ? "Dnevnik aktivnosti" : "Activity log"}</h2>
      </div>

      <div className="activity-log-filters-card">
        <div className="activity-log-filter-bar">
          <label className="activity-log-search">
            <span className="activity-log-search-icon" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={sl ? "Išči po stranki, računu, uporabniku ..." : "Search client, invoice, user ..."}
            />
          </label>

          <button
            type="button"
            className={`activity-log-filter-toggle${filtersOpen ? " is-open" : ""}`}
            onClick={() => setFiltersOpen(open => !open)}
            aria-expanded={filtersOpen}
            aria-controls="activity-log-filter-fields"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 5h16" />
              <path d="M7 12h10" />
              <path d="M10 19h4" />
            </svg>
            <span>{sl ? "Filtri" : "Filters"}</span>
          </button>
        </div>

        <div id="activity-log-filter-fields" className={`activity-log-filter-fields${filtersOpen ? " is-open" : ""}`}>
          <select value={module} onChange={e => setModule(e.target.value)} aria-label={sl ? "Področje" : "Area"}>
            <option value="">{sl ? "Vsa področja" : "All areas"}</option>
            {MODULES.map(m => <option key={m} value={m}>{moduleLabel(m, sl)}</option>)}
          </select>
          <select value={action} onChange={e => setAction(e.target.value)} aria-label={sl ? "Dejanje" : "Action"}>
            <option value="">{sl ? "Vsa dejanja" : "All actions"}</option>
            {ACTIVITY_ACTIONS.map(a => <option key={a} value={a}>{actionLabel(a, sl)}</option>)}
          </select>
          <select value={actorUserId} onChange={e => { setActorUserId(e.target.value); if (e.target.value) setActorType("USER"); }} aria-label={sl ? "Uporabnik" : "User"}>
            <option value="">{sl ? "Vsi uporabniki" : "All users"}</option>
            {users.map(u => <option key={u.id} value={u.id}>{`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || `#${u.id}`}</option>)}
          </select>
          <select value={locationId} onChange={e => setLocationId(e.target.value)} aria-label={sl ? "Lokacija" : "Location"}>
            <option value="">{sl ? "Vse lokacije" : "All locations"}</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label={sl ? "Od" : "From"} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label={sl ? "Do" : "To"} />
          <button type="button" className="activity-log-reset" onClick={resetFilters}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
            <span>{sl ? "Ponastavi" : "Reset"}</span>
          </button>
        </div>
      </div>

      <div className="activity-log-table-card">
        {renderEmptyState()}

        {!loading && !error && items.length > 0 ? (
          <>
            <div className="activity-log-table-head" role="row">
              <div className="activity-log-table-head-cell activity-log-table-head-cell--datetime">{sl ? "DATUM / ČAS" : "DATE / TIME"}</div>
              <div className="activity-log-table-head-cell">{sl ? "UPORABNIK" : "USER"}</div>
              <div className="activity-log-table-head-cell">{sl ? "DEJANJE" : "ACTION"}</div>
              <div className="activity-log-table-head-cell">{sl ? "PODROČJE / ENTITETA" : "AREA / ENTITY"}</div>
              <div className="activity-log-table-head-cell">{sl ? "PODROBNOSTI / LOKACIJA" : "DETAILS / LOCATION"}</div>
              <div className="activity-log-table-head-cell activity-log-table-head-cell--arrow" aria-hidden />
            </div>

            <div className="activity-log-table-body">
              {items.map(item => {
                const expanded = expandedId === item.id;
                const before = item.details?.before && typeof item.details.before === "object" && !Array.isArray(item.details.before)
                  ? item.details.before as Record<string, unknown>
                  : null;
                const after = item.details?.after && typeof item.details.after === "object" && !Array.isArray(item.details.after)
                  ? item.details.after as Record<string, unknown>
                  : null;
                const changeKeys = before && after
                  ? Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
                  : [];
                const targetPath = typeof item.details?.targetPath === "string" ? item.details.targetPath : "";
                const detailEntries = Object.entries(item.details || {}).filter(([key, value]) => key !== "before" && key !== "after" && key !== "targetPath" && value != null && value !== "");

                return (
                  <article key={item.id} className={`activity-log-table-row${expanded ? " is-expanded" : ""}`}>
                    <button type="button" className="activity-log-table-row-main" onClick={() => setExpandedId(expanded ? null : item.id)}>
                      <span className="activity-log-table-col activity-log-table-col--datetime" data-label={sl ? "Datum / čas" : "Date / time"}>
                        <span className={`activity-log-module-dot module-${item.module.toLowerCase()}`} aria-hidden />
                        <span>{dtf.format(new Date(item.occurredAt))}</span>
                      </span>

                      <span className="activity-log-table-col" data-label={sl ? "Uporabnik" : "User"}>
                        <span className="activity-log-user-cell">
                          <span className="activity-log-avatar">{getInitials(item.actorName || item.actorType)}</span>
                          <span className="activity-log-user-copy">
                            <strong>{item.actorName || actorTypeLabel(item.actorType, sl)}</strong>
                            <small>{actorTypeLabel(item.actorType, sl)}</small>
                          </span>
                        </span>
                      </span>

                      <span className="activity-log-table-col activity-log-table-col--action" data-label={sl ? "Dejanje" : "Action"}>
                        {actionLabel(item.action, sl)}
                      </span>

                      <span className="activity-log-table-col" data-label={sl ? "Področje / entiteta" : "Area / entity"}>
                        {buildAreaEntity(item, sl)}
                      </span>

                      <span className="activity-log-table-col" data-label={sl ? "Podrobnosti / lokacija" : "Details / location"}>
                        {buildDetailsLocation(item, locationNames, locale, sl)}
                      </span>

                      <span className="activity-log-table-col activity-log-table-col--arrow" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={expanded ? "m18 15-6-6-6 6" : "m9 18 6-6-6-6"} />
                        </svg>
                      </span>
                    </button>

                    {expanded ? (
                      <div className="activity-log-table-row-details">
                        <div className="activity-log-details-head">
                          <div className="activity-log-summary">{item.summary || buildDetailsLocation(item, locationNames, locale, sl)}</div>
                          {targetPath ? (
                            <button type="button" className="activity-log-open-target" onClick={() => navigate(targetPath)}>
                              {sl ? "Odpri zapis" : "Open record"}
                            </button>
                          ) : null}
                        </div>

                        <dl className="activity-log-details-grid">
                          <div><dt>{sl ? "Področje" : "Area"}</dt><dd>{moduleLabel(item.module, sl)}</dd></div>
                          <div><dt>{sl ? "Dejanje" : "Action"}</dt><dd>{actionLabel(item.action, sl)}</dd></div>
                          <div><dt>{sl ? "Vir" : "Source"}</dt><dd>{item.source || "—"}</dd></div>
                          <div><dt>{sl ? "Lokacija" : "Location"}</dt><dd>{item.locationId != null ? locationNames.get(item.locationId) || "—" : "—"}</dd></div>
                          {item.entityId != null ? <div><dt>{sl ? "Zapis" : "Record"}</dt><dd>{`${item.entityType} #${item.entityId}`}</dd></div> : null}
                          {item.secondaryEntityLabel ? <div><dt>{sl ? "Povezano" : "Related"}</dt><dd>{item.secondaryEntityLabel}</dd></div> : null}
                          {changeKeys.map(key => (
                            <div key={`change-${key}`}>
                              <dt>{humanizeFieldLabel(key)}</dt>
                              <dd className="activity-log-change"><span>{formatValue(before?.[key], locale)}</span><b aria-hidden>→</b><span>{formatValue(after?.[key], locale)}</span></dd>
                            </div>
                          ))}
                          {detailEntries.map(([key, value]) => (
                            <div key={key}><dt>{humanizeFieldLabel(key)}</dt><dd>{formatValue(value, locale)}</dd></div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <div className="activity-log-table-footer">
              <div className="activity-log-table-results">
                {sl ? `Prikazujem ${rangeStart}–${rangeEnd} od ${totalElements} zapisov` : `Showing ${rangeStart}–${rangeEnd} of ${totalElements} entries`}
              </div>

              <div className="activity-log-pagination activity-log-pagination--compact">
                <button type="button" aria-label={sl ? "Prejšnja stran" : "Previous page"} disabled={page <= 0} onClick={() => setPage(current => Math.max(0, current - 1))}>‹</button>
                <span className="activity-log-pagination-current">{page + 1}</span>
                <button type="button" aria-label={sl ? "Naslednja stran" : "Next page"} disabled={page + 1 >= Math.max(totalPages, 1)} onClick={() => setPage(current => current + 1)}>›</button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
