import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

type ActivityModule =
  | "CALENDAR" | "CLIENTS" | "BILLING" | "INBOX" | "WAITLIST" | "SERVICES"
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

const PHASE_TWO_ACTIONS = [
  "SESSION_CREATED", "SESSION_UPDATED", "SESSION_RESCHEDULED", "SESSION_CANCELLED", "SESSION_DELETED",
  "SESSION_PARTICIPANT_ADDED", "SESSION_PARTICIPANT_REMOVED",
  "CLIENT_CREATED", "CLIENT_UPDATED", "CLIENT_DELETED", "CLIENT_ANONYMIZED", "CLIENT_DEACTIVATED", "CLIENT_ACTIVATED",
  "INVOICE_CREATED", "INVOICE_PAID", "INVOICE_REFUNDED", "INVOICE_SENT", "ENTITLEMENT_USED",
  "MESSAGE_SENT", "MESSAGE_SCHEDULED", "MESSAGE_SCHEDULE_CANCELLED", "INTERNAL_NOTE_ADDED",
] as const;

const MODULES: ActivityModule[] = ["CALENDAR", "CLIENTS", "BILLING", "INBOX", "WAITLIST", "SERVICES", "EMPLOYEES", "CONFIGURATION", "GUEST_APP", "WEBSITE", "INTEGRATIONS", "SYSTEM"];

const moduleLabel = (module: ActivityModule, sl: boolean) => ({
  CALENDAR: sl ? "Koledar" : "Calendar",
  CLIENTS: sl ? "Stranke" : "Clients",
  BILLING: sl ? "Zaračunavanje" : "Billing",
  INBOX: sl ? "Prejeto" : "Inbox",
  WAITLIST: sl ? "Čakalna vrsta" : "Waitlist",
  SERVICES: sl ? "Storitve" : "Services",
  EMPLOYEES: sl ? "Zaposleni" : "Employees",
  CONFIGURATION: sl ? "Konfiguracija" : "Configuration",
  GUEST_APP: "Guest app",
  WEBSITE: sl ? "Spletna stran" : "Website",
  INTEGRATIONS: sl ? "Integracije" : "Integrations",
  SYSTEM: sl ? "Sistem" : "System",
}[module]);

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
    MESSAGE_SENT: ["Poslal sporočilo", "Sent message"],
    MESSAGE_SCHEDULED: ["Načrtoval sporočilo", "Scheduled message"],
    MESSAGE_SCHEDULE_CANCELLED: ["Preklical načrtovano sporočilo", "Cancelled scheduled message"],
    INTERNAL_NOTE_ADDED: ["Dodal interno opombo", "Added internal note"],
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

export function ActivityLogSection({ locale }: { locale: string }) {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<UserOption[]>("/users").catch(() => ({ data: [] as UserOption[] })),
      api.get<LocationOption[]>("/locations").catch(() => ({ data: [] as LocationOption[] })),
    ]).then(([userRes, locationRes]) => {
      setUsers(userRes.data || []);
      setLocations(locationRes.data || []);
    });
  }, []);

  useEffect(() => setPage(0), [search, module, action, actorType, actorUserId, locationId, from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const params: Record<string, string | number> = { page, size: 50 };
      if (search.trim()) params.search = search.trim();
      if (module) params.module = module;
      if (action) params.action = action;
      if (actorType) params.actorType = actorType;
      if (actorUserId) params.actorUserId = actorUserId;
      if (locationId) params.locationId = locationId;
      if (from) params.from = new Date(`${from}T00:00:00`).toISOString();
      if (to) params.to = new Date(`${to}T23:59:59.999`).toISOString();
      void api.get<ActivityLogPage>("/activity-logs", { params })
        .then(({ data }) => {
          setItems(data.content || []);
          setTotalElements(data.totalElements || 0);
          setTotalPages(data.totalPages || 0);
        })
        .catch(() => setError(sl ? "Dnevnika aktivnosti ni bilo mogoče naložiti." : "Could not load the activity log."))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search, module, action, actorType, actorUserId, locationId, from, to, page, sl]);

  const locationNames = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations]);
  const dtf = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);

  return (
    <section className="activity-log-shell">
      <div className="activity-log-heading">
        <div>
          <h2>{sl ? "Dnevnik aktivnosti" : "Activity log"}</h2>
          <p>{sl ? "Pregled pomembnih dejanj uporabnikov v vseh delih aplikacije." : "Review important user actions across the application."}</p>
        </div>
        <span className="activity-log-count">{totalElements.toLocaleString(locale)}</span>
      </div>

      <div className="activity-log-filters">
        <label className="activity-log-search">
          <span aria-hidden>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={sl ? "Išči po stranki, računu, uporabniku ..." : "Search client, invoice, user ..."} />
        </label>
        <select value={module} onChange={e => setModule(e.target.value)} aria-label={sl ? "Področje" : "Area"}>
          <option value="">{sl ? "Vsa področja" : "All areas"}</option>
          {MODULES.map(m => <option key={m} value={m}>{moduleLabel(m, sl)}</option>)}
        </select>
        <select value={action} onChange={e => setAction(e.target.value)} aria-label={sl ? "Dejanje" : "Action"}>
          <option value="">{sl ? "Vsa dejanja" : "All actions"}</option>
          {PHASE_TWO_ACTIONS.map(a => <option key={a} value={a}>{actionLabel(a, sl)}</option>)}
        </select>
        <select value={actorType} onChange={e => { setActorType(e.target.value); if (e.target.value !== "USER") setActorUserId(""); }} aria-label={sl ? "Vrsta izvajalca" : "Actor type"}>
          <option value="">{sl ? "Vsi izvajalci" : "All actors"}</option>
          <option value="USER">{sl ? "Uporabniki" : "Users"}</option>
          <option value="SYSTEM">{sl ? "Sistem" : "System"}</option>
          <option value="WEBSITE_WIDGET">Website widget</option>
          <option value="GUEST_APP">Guest app</option>
          <option value="GUEST">{sl ? "Gost" : "Guest"}</option>
          <option value="INTEGRATION">{sl ? "Integracija" : "Integration"}</option>
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
      </div>

      <div className="activity-log-list">
        {loading ? <div className="activity-log-state">{sl ? "Nalaganje ..." : "Loading ..."}</div> : null}
        {!loading && error ? <div className="activity-log-state is-error">{error}</div> : null}
        {!loading && !error && items.length === 0 ? <div className="activity-log-state">{sl ? "Za izbrane filtre ni aktivnosti." : "No activity matches these filters."}</div> : null}
        {!loading && !error && items.map(item => {
          const expanded = expandedId === item.id;
          const before = item.details?.before && typeof item.details.before === "object" && !Array.isArray(item.details.before)
            ? item.details.before as Record<string, unknown> : null;
          const after = item.details?.after && typeof item.details.after === "object" && !Array.isArray(item.details.after)
            ? item.details.after as Record<string, unknown> : null;
          const changeKeys = before && after
            ? Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
            : [];
          const detailEntries = Object.entries(item.details || {}).filter(([key, v]) => key !== "before" && key !== "after" && v != null && v !== "");
          return (
            <article key={item.id} className={`activity-log-row${expanded ? " is-expanded" : ""}`}>
              <button type="button" className="activity-log-row-main" onClick={() => setExpandedId(expanded ? null : item.id)}>
                <span className={`activity-log-module-dot module-${item.module.toLowerCase()}`} aria-hidden />
                <span className="activity-log-time">{dtf.format(new Date(item.occurredAt))}</span>
                <span className="activity-log-copy">
                  <strong>{item.actorName || item.actorType}</strong>
                  <span className="activity-log-action">{actionLabel(item.action, sl)}</span>
                  <span className="activity-log-context">
                    {moduleLabel(item.module, sl)}
                    {item.entityLabel ? ` · ${item.entityLabel}` : ""}
                    {item.secondaryEntityLabel ? ` · ${item.secondaryEntityLabel}` : ""}
                    {item.locationId && locationNames.get(item.locationId) ? ` · ${locationNames.get(item.locationId)}` : ""}
                  </span>
                </span>
                <span className="activity-log-chevron" aria-hidden>{expanded ? "⌃" : "›"}</span>
              </button>
              {expanded ? (
                <div className="activity-log-details">
                  <div className="activity-log-summary">{item.summary}</div>
                  <dl>
                    <div><dt>{sl ? "Področje" : "Area"}</dt><dd>{moduleLabel(item.module, sl)}</dd></div>
                    <div><dt>{sl ? "Dejanje" : "Action"}</dt><dd>{actionLabel(item.action, sl)}</dd></div>
                    <div><dt>{sl ? "Vir" : "Source"}</dt><dd>{item.source}</dd></div>
                    {item.entityId != null ? <div><dt>{sl ? "Zapis" : "Record"}</dt><dd>{item.entityType} #{item.entityId}</dd></div> : null}
                    {changeKeys.map(key => (
                      <div key={`change-${key}`}>
                        <dt>{key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())}</dt>
                        <dd className="activity-log-change"><span>{formatValue(before?.[key], locale)}</span><b aria-hidden>→</b><span>{formatValue(after?.[key], locale)}</span></dd>
                      </div>
                    ))}
                    {detailEntries.map(([key, value]) => (
                      <div key={key}><dt>{key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())}</dt><dd>{formatValue(value, locale)}</dd></div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {totalPages > 1 ? (
        <div className="activity-log-pagination">
          <button type="button" disabled={page <= 0} onClick={() => setPage(p => Math.max(0, p - 1))}>{sl ? "Prejšnja" : "Previous"}</button>
          <span>{sl ? "Stran" : "Page"} {page + 1} / {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>{sl ? "Naslednja" : "Next"}</button>
        </div>
      ) : null}
    </section>
  );
}
