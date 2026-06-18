import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useLocale } from "../locale";

type DeliveryChannel =
  | "EMAIL"
  | "SMS"
  | "GUEST_APP"
  | "PUSH"
  | "WHATSAPP"
  | "VIBER";

type DeliveryStatus =
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "SKIPPED"
  | "RETRYING";

type DeliveryLogItem = {
  id: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  channel?: DeliveryChannel | string | null;
  status?: DeliveryStatus | string | null;
  messageType?: string | null;
  recipient?: string | null;
  subject?: string | null;
  messagePreview?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  providerMessageId?: string | null;
  providerStatusCode?: string | null;
  errorMessage?: string | null;
  retryCount?: number | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
};

type DeliveryLogSummary = {
  totalLast30Days?: number;
  byStatus?: Partial<Record<DeliveryStatus, number>>;
  byChannel?: Partial<Record<DeliveryChannel, number>>;
};

type DeliveryLogResponse = {
  items?: DeliveryLogItem[];
  total?: number;
  page?: number;
  size?: number;
  totalPages?: number;
  summary?: DeliveryLogSummary;
};

const CHANNELS: Array<{ id: "" | DeliveryChannel; labelSl: string; labelEn: string }> = [
  { id: "", labelSl: "Vsi kanali", labelEn: "All channels" },
  { id: "EMAIL", labelSl: "E-pošta", labelEn: "Email" },
  { id: "SMS", labelSl: "SMS", labelEn: "SMS" },
  { id: "GUEST_APP", labelSl: "Sporočila v aplikaciji", labelEn: "Guest app messages" },
  { id: "PUSH", labelSl: "Push obvestila", labelEn: "Push notifications" },
  { id: "WHATSAPP", labelSl: "WhatsApp", labelEn: "WhatsApp" },
  { id: "VIBER", labelSl: "Viber", labelEn: "Viber" },
];

const STATUSES: Array<{ id: "" | DeliveryStatus; labelSl: string; labelEn: string }> = [
  { id: "", labelSl: "Vsi statusi", labelEn: "All statuses" },
  { id: "SENT", labelSl: "Poslano", labelEn: "Sent" },
  { id: "DELIVERED", labelSl: "Dostavljeno", labelEn: "Delivered" },
  { id: "FAILED", labelSl: "Napaka", labelEn: "Failed" },
  { id: "SKIPPED", labelSl: "Preskočeno", labelEn: "Skipped" },
  { id: "QUEUED", labelSl: "V čakalni vrsti", labelEn: "Queued" },
  { id: "RETRYING", labelSl: "Ponovni poskus", labelEn: "Retrying" },
];

const pageSize = 50;

export function ConfigurationDeliveryLogsSection() {
  const { locale } = useLocale();
  const sl = locale === "sl";
  const [items, setItems] = useState<DeliveryLogItem[]>([]);
  const [summary, setSummary] = useState<DeliveryLogSummary>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<"" | DeliveryChannel>("");
  const [status, setStatus] = useState<"" | DeliveryStatus>("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(() => formatDateInput(daysAgo(30)));
  const [toDate, setToDate] = useState(() => formatDateInput(new Date()));
  const [selected, setSelected] = useState<DeliveryLogItem | null>(null);

  const copy = useMemo(
    () => ({
      title: sl ? "Dnevniki pošiljanja" : "Delivery logs",
      subtitle: sl
        ? "Pregled statusa poslanih e-poštnih sporočil, SMS-ov, push obvestil in sporočil v aplikaciji za goste."
        : "Review the delivery status of emails, SMS, push notifications and guest app messages.",
      total30: sl ? "Skupaj zadnjih 30 dni" : "Total last 30 days",
      successful: sl ? "Uspešno" : "Successful",
      failed: sl ? "Napake" : "Failed",
      skipped: sl ? "Preskočeno" : "Skipped",
      filters: sl ? "Filtri" : "Filters",
      search: sl ? "Išči prejemnika, zadevo ali napako" : "Search recipient, subject or error",
      from: sl ? "Od" : "From",
      to: sl ? "Do" : "To",
      refresh: sl ? "Osveži" : "Refresh",
      tableDate: sl ? "Datum in čas" : "Date and time",
      tableChannel: sl ? "Kanal" : "Channel",
      tableType: sl ? "Vrsta" : "Type",
      tableRecipient: sl ? "Prejemnik" : "Recipient",
      tableSubject: sl ? "Zadeva / sporočilo" : "Subject / message",
      tableStatus: sl ? "Status" : "Status",
      tableDetails: sl ? "Podrobnosti" : "Details",
      view: sl ? "Poglej" : "View",
      noItems: sl ? "Za izbrane filtre ni dnevnikov pošiljanja." : "No delivery logs match these filters.",
      loading: sl ? "Nalagam dnevnike …" : "Loading delivery logs…",
      error: sl ? "Dnevnikov ni bilo mogoče naložiti." : "Could not load delivery logs.",
      close: sl ? "Zapri" : "Close",
      messagePreview: sl ? "Vsebina / predogled" : "Message preview",
      technicalDetails: sl ? "Tehnične podrobnosti" : "Technical details",
      reference: sl ? "Referenca" : "Reference",
      provider: sl ? "Ponudnik" : "Provider",
      errorReason: sl ? "Razlog napake / preskoka" : "Failure / skipped reason",
      hint: sl
        ? "To ni tehnični strežniški dnevnik. Prikazuje samo dogodke pošiljanja, ki so uporabni za tenant uporabnike."
        : "This is not a raw server log. It only shows tenant-friendly message delivery events.",
    }),
    [sl],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void load(cancelled);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, status, search, fromDate, toDate, page]);

  const load = async (cancelled = false) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, size: pageSize };
      if (channel) params.channel = channel;
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      if (fromDate) params.from = `${fromDate}T00:00:00Z`;
      if (toDate) params.to = `${formatDateInput(addDays(new Date(`${toDate}T00:00:00`), 1))}T00:00:00Z`;
      const { data } = await api.get<DeliveryLogResponse>("/delivery-logs", { params });
      if (cancelled) return;
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || {});
      setTotal(Number(data.total || 0));
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch {
      if (!cancelled) {
        setError(copy.error);
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  const setFilterPage = (fn: () => void) => {
    setPage(0);
    fn();
  };

  const successCount =
    Number(summary.byStatus?.SENT || 0) + Number(summary.byStatus?.DELIVERED || 0);
  const failedCount = Number(summary.byStatus?.FAILED || 0);
  const skippedCount = Number(summary.byStatus?.SKIPPED || 0);

  return (
    <section className="delivery-logs-shell">
      <style>{deliveryLogsStyles}</style>
      <div className="delivery-logs-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        <button type="button" className="delivery-logs-refresh" onClick={() => void load()} disabled={loading}>
          {copy.refresh}
        </button>
      </div>

      <div className="delivery-logs-summary-grid">
        <MetricCard label={copy.total30} value={summary.totalLast30Days || 0} icon="total" />
        <MetricCard label={copy.successful} value={successCount} icon="success" />
        <MetricCard label={copy.failed} value={failedCount} icon="failed" />
        <MetricCard label={copy.skipped} value={skippedCount} icon="skipped" />
      </div>

      <div className="delivery-logs-channel-strip" aria-label={sl ? "Pregled po kanalih" : "Channel overview"}>
        {CHANNELS.filter((entry) => entry.id).map((entry) => (
          <span key={entry.id} className="delivery-channel-pill">
            <span>{sl ? entry.labelSl : entry.labelEn}</span>
            <strong>{Number(summary.byChannel?.[entry.id as DeliveryChannel] || 0)}</strong>
          </span>
        ))}
      </div>

      <div className="delivery-logs-card">
        <div className="delivery-logs-filter-row">
          <strong>{copy.filters}</strong>
          <select value={channel} onChange={(event) => setFilterPage(() => setChannel(event.target.value as "" | DeliveryChannel))}>
            {CHANNELS.map((entry) => (
              <option key={entry.id || "all"} value={entry.id}>{sl ? entry.labelSl : entry.labelEn}</option>
            ))}
          </select>
          <select value={status} onChange={(event) => setFilterPage(() => setStatus(event.target.value as "" | DeliveryStatus))}>
            {STATUSES.map((entry) => (
              <option key={entry.id || "all"} value={entry.id}>{sl ? entry.labelSl : entry.labelEn}</option>
            ))}
          </select>
          <label>
            <span>{copy.from}</span>
            <input type="date" value={fromDate} onChange={(event) => setFilterPage(() => setFromDate(event.target.value))} />
          </label>
          <label>
            <span>{copy.to}</span>
            <input type="date" value={toDate} onChange={(event) => setFilterPage(() => setToDate(event.target.value))} />
          </label>
          <input
            className="delivery-logs-search"
            value={search}
            onChange={(event) => setFilterPage(() => setSearch(event.target.value))}
            placeholder={copy.search}
          />
        </div>

        <p className="delivery-logs-hint">{copy.hint}</p>

        <div className="delivery-logs-table-wrap">
          <table className="delivery-logs-table">
            <thead>
              <tr>
                <th>{copy.tableDate}</th>
                <th>{copy.tableChannel}</th>
                <th>{copy.tableType}</th>
                <th>{copy.tableRecipient}</th>
                <th>{copy.tableSubject}</th>
                <th>{copy.tableStatus}</th>
                <th>{copy.tableDetails}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="delivery-logs-empty">{copy.loading}</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="delivery-logs-empty is-error">{error}</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="delivery-logs-empty">{copy.noItems}</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt, locale)}</td>
                    <td><ChannelBadge channel={item.channel} sl={sl} /></td>
                    <td>{humanizeType(item.messageType)}</td>
                    <td className="delivery-logs-recipient">{item.recipient || "—"}</td>
                    <td>
                      <span className="delivery-logs-subject">{item.subject || item.messagePreview || "—"}</span>
                    </td>
                    <td><StatusBadge status={item.status} sl={sl} /></td>
                    <td>
                      <button type="button" className="delivery-logs-details-button" onClick={() => setSelected(item)}>
                        {copy.view}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="delivery-logs-pagination">
          <span>{sl ? `${total} zapisov` : `${total} records`}</span>
          <div>
            <button type="button" disabled={page <= 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>‹</button>
            <span>{page + 1} / {totalPages}</span>
            <button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>›</button>
          </div>
        </div>
      </div>

      {selected ? (
        <div className="delivery-logs-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section className="delivery-logs-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="delivery-logs-modal-head">
              <div>
                <span className="delivery-logs-modal-kicker">{humanizeType(selected.messageType)}</span>
                <h3>{selected.subject || selected.messagePreview || copy.tableDetails}</h3>
              </div>
              <button type="button" onClick={() => setSelected(null)}>{copy.close}</button>
            </div>
            <div className="delivery-logs-modal-grid">
              <Detail label={copy.tableDate} value={formatDateTime(selected.createdAt, locale)} />
              <Detail label={copy.tableChannel} value={channelLabel(selected.channel, sl)} />
              <Detail label={copy.tableStatus} value={statusLabel(selected.status, sl)} />
              <Detail label={copy.tableRecipient} value={selected.recipient || "—"} />
              <Detail label={copy.reference} value={[selected.referenceType, selected.referenceId].filter(Boolean).join(" #") || "—"} />
              <Detail label={copy.provider} value={[selected.providerStatusCode, selected.providerMessageId].filter(Boolean).join(" · ") || "—"} />
            </div>
            <div className="delivery-logs-preview-block">
              <strong>{copy.messagePreview}</strong>
              <p>{selected.messagePreview || "—"}</p>
            </div>
            {selected.errorMessage ? (
              <div className="delivery-logs-preview-block is-error">
                <strong>{copy.errorReason}</strong>
                <p>{selected.errorMessage}</p>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: "total" | "success" | "failed" | "skipped" }) {
  return (
    <div className={`delivery-metric-card ${icon}`}>
      <span className="delivery-metric-icon" aria-hidden>{metricIcon(icon)}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChannelBadge({ channel, sl }: { channel?: string | null; sl: boolean }) {
  return <span className="delivery-channel-badge">{channelLabel(channel, sl)}</span>;
}

function StatusBadge({ status, sl }: { status?: string | null; sl: boolean }) {
  const normalized = String(status || "").toLowerCase();
  return <span className={`delivery-status-badge ${normalized || "neutral"}`}>{statusLabel(status, sl)}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="delivery-detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function channelLabel(channel: string | null | undefined, sl: boolean) {
  const found = CHANNELS.find((entry) => entry.id === channel);
  return found ? (sl ? found.labelSl : found.labelEn) : channel || "—";
}

function statusLabel(status: string | null | undefined, sl: boolean) {
  const found = STATUSES.find((entry) => entry.id === status);
  return found ? (sl ? found.labelSl : found.labelEn) : status || "—";
}

function humanizeType(type?: string | null) {
  if (!type) return "—";
  return type
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "sl" ? "sl-SI" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function metricIcon(icon: "total" | "success" | "failed" | "skipped") {
  if (icon === "success") return "✓";
  if (icon === "failed") return "!";
  if (icon === "skipped") return "↷";
  return "✉";
}

const deliveryLogsStyles = `
.delivery-logs-shell { --dl-blue:#2167ff; --dl-ink:#142655; --dl-muted:#66758f; --dl-line:#dbe5f2; --dl-soft:#f7f9fc; width:min(100%,1600px); color:var(--dl-ink); }
.delivery-logs-shell button, .delivery-logs-shell input, .delivery-logs-shell select { font-family:inherit; }
.delivery-logs-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
.delivery-logs-header h2 { margin:0 0 8px; font-size:clamp(28px,2.7vw,38px); line-height:1.05; letter-spacing:-.045em; font-weight:900; }
.delivery-logs-header p { margin:0; color:var(--dl-muted); font-size:16px; line-height:1.5; max-width:860px; }
.delivery-logs-refresh, .delivery-logs-details-button, .delivery-logs-pagination button, .delivery-logs-modal-head button { border:1px solid #d7e2f0; background:#fff; color:#1f3f75; border-radius:12px; min-height:38px; padding:0 14px; font-weight:800; cursor:pointer; }
.delivery-logs-refresh:hover, .delivery-logs-details-button:hover, .delivery-logs-pagination button:hover, .delivery-logs-modal-head button:hover { border-color:#b9c9de; box-shadow:0 8px 24px rgba(15,23,42,.08); }
.delivery-logs-refresh:disabled, .delivery-logs-pagination button:disabled { opacity:.55; cursor:not-allowed; box-shadow:none; }
.delivery-logs-summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-bottom:16px; }
.delivery-metric-card { border:1px solid var(--dl-line); border-radius:22px; background:#fff; padding:18px; box-shadow:0 18px 50px rgba(15,23,42,.06); display:grid; grid-template-columns:auto 1fr; gap:6px 13px; align-items:center; }
.delivery-metric-icon { width:42px; height:42px; border-radius:14px; display:inline-flex; align-items:center; justify-content:center; font-weight:950; background:#eaf2ff; color:#2563eb; grid-row:span 2; }
.delivery-metric-card.success .delivery-metric-icon { background:#dcfce7; color:#15803d; }
.delivery-metric-card.failed .delivery-metric-icon { background:#fee2e2; color:#b91c1c; }
.delivery-metric-card.skipped .delivery-metric-icon { background:#fef3c7; color:#b45309; }
.delivery-metric-card span:not(.delivery-metric-icon) { color:var(--dl-muted); font-size:13px; font-weight:800; }
.delivery-metric-card strong { font-size:30px; line-height:1; letter-spacing:-.04em; }
.delivery-logs-channel-strip { display:flex; flex-wrap:wrap; gap:10px; margin:0 0 18px; }
.delivery-channel-pill { display:inline-flex; align-items:center; gap:10px; border:1px solid #dbe5f2; border-radius:999px; background:#fff; padding:8px 12px; color:#475569; font-size:13px; font-weight:800; }
.delivery-channel-pill strong { color:#0f172a; }
.delivery-logs-card { border:1px solid rgba(203,213,225,.82); border-radius:24px; background:rgba(255,255,255,.98); box-shadow:0 24px 70px rgba(15,23,42,.08); overflow:hidden; }
.delivery-logs-filter-row { display:flex; align-items:center; flex-wrap:wrap; gap:10px; padding:18px; border-bottom:1px solid #e8eef6; }
.delivery-logs-filter-row > strong { margin-right:6px; }
.delivery-logs-filter-row select, .delivery-logs-filter-row input { min-height:40px; border:1px solid #d7e2f0; border-radius:12px; background:#fff; color:#142655; padding:0 12px; font-weight:700; }
.delivery-logs-filter-row label { display:inline-flex; align-items:center; gap:8px; color:#64748b; font-size:13px; font-weight:900; }
.delivery-logs-search { min-width:min(360px,100%); flex:1 1 260px; }
.delivery-logs-hint { margin:0; padding:0 18px 14px; color:#64748b; font-size:13px; line-height:1.45; }
.delivery-logs-table-wrap { overflow-x:auto; border-top:1px solid #edf2f7; }
.delivery-logs-table { width:100%; border-collapse:collapse; min-width:980px; }
.delivery-logs-table th { text-align:left; color:#64748b; font-size:12px; text-transform:uppercase; letter-spacing:.04em; padding:14px 16px; background:#f8fafc; border-bottom:1px solid #e8eef6; }
.delivery-logs-table td { padding:14px 16px; border-bottom:1px solid #edf2f7; color:#23345d; font-size:14px; vertical-align:middle; }
.delivery-logs-table tr:last-child td { border-bottom:0; }
.delivery-logs-recipient { max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.delivery-logs-subject { display:inline-block; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:800; color:#142655; }
.delivery-channel-badge, .delivery-status-badge { display:inline-flex; align-items:center; border-radius:999px; padding:7px 10px; font-size:12px; font-weight:900; white-space:nowrap; }
.delivery-channel-badge { color:#1d4ed8; background:#eaf2ff; }
.delivery-status-badge.sent, .delivery-status-badge.delivered { color:#15803d; background:#dcfce7; }
.delivery-status-badge.failed { color:#b91c1c; background:#fee2e2; }
.delivery-status-badge.skipped, .delivery-status-badge.retrying { color:#b45309; background:#fef3c7; }
.delivery-status-badge.queued, .delivery-status-badge.neutral { color:#64748b; background:#f1f5f9; }
.delivery-logs-empty { text-align:center; padding:34px 16px !important; color:#64748b !important; }
.delivery-logs-empty.is-error { color:#b91c1c !important; }
.delivery-logs-pagination { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:14px 18px; border-top:1px solid #edf2f7; color:#64748b; font-size:13px; font-weight:800; }
.delivery-logs-pagination div { display:flex; align-items:center; gap:10px; }
.delivery-logs-pagination button { min-width:38px; padding:0 10px; }
.delivery-logs-modal-backdrop { position:fixed; inset:0; z-index:80; background:rgba(15,23,42,.38); display:flex; align-items:center; justify-content:center; padding:24px; }
.delivery-logs-modal { width:min(780px,100%); max-height:calc(100vh - 48px); overflow:auto; border:1px solid #d7e2f0; border-radius:26px; background:#fff; box-shadow:0 30px 100px rgba(15,23,42,.28); padding:22px; }
.delivery-logs-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
.delivery-logs-modal-head h3 { margin:4px 0 0; font-size:24px; letter-spacing:-.035em; }
.delivery-logs-modal-kicker { color:#2563eb; font-size:13px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
.delivery-logs-modal-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
.delivery-detail { border:1px solid #e2e8f0; border-radius:16px; padding:12px; background:#f8fafc; }
.delivery-detail span { display:block; color:#64748b; font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; }
.delivery-detail strong { display:block; color:#142655; font-size:14px; line-height:1.35; word-break:break-word; }
.delivery-logs-preview-block { border:1px solid #e2e8f0; border-radius:18px; padding:14px; margin-top:12px; background:#fff; }
.delivery-logs-preview-block strong { display:block; margin-bottom:8px; }
.delivery-logs-preview-block p { margin:0; color:#334155; line-height:1.55; white-space:pre-wrap; word-break:break-word; }
.delivery-logs-preview-block.is-error { border-color:#fecaca; background:#fff7f7; }
.delivery-logs-preview-block.is-error p { color:#991b1b; }
@media (max-width: 980px) { .delivery-logs-summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .delivery-logs-header { flex-direction:column; } }
@media (max-width: 640px) { .delivery-logs-summary-grid { grid-template-columns:1fr; } .delivery-logs-modal-grid { grid-template-columns:1fr; } .delivery-logs-filter-row { align-items:stretch; } .delivery-logs-filter-row select, .delivery-logs-filter-row input, .delivery-logs-filter-row label { width:100%; } }
`;
