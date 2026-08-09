import { useEffect, useState } from "react";
import { api } from "../../api";
import { GuestSwitch } from "./ConfigurationVisualComponents";

type WaitlistSettings = {
  enabled: boolean;
  widgetEnabled: boolean;
  guestAppEnabled: boolean;
  exactTimeEnabled: boolean;
  flexibleWindowsEnabled: boolean;
  employeePreferenceEnabled: boolean;
  autoOfferEnabled: boolean;
  offerValidityMinutes: number;
  maxActiveRequestsPerGuest: number;
  maxRequestedDateRangeDays: number;
  staffManualEntryEnabled: boolean;
  closeEquivalentAfterBooking: boolean;
};

const defaults: WaitlistSettings = {
  enabled: true,
  widgetEnabled: true,
  guestAppEnabled: true,
  exactTimeEnabled: true,
  flexibleWindowsEnabled: true,
  employeePreferenceEnabled: true,
  autoOfferEnabled: false,
  offerValidityMinutes: 15,
  maxActiveRequestsPerGuest: 5,
  maxRequestedDateRangeDays: 30,
  staffManualEntryEnabled: true,
  closeEquivalentAfterBooking: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

type WaitlistSettingsIconKind =
  | "availability"
  | "people"
  | "clock"
  | "grid"
  | "calendar"
  | "person"
  | "personAdd"
  | "refresh"
  | "shield"
  | "limits"
  | "info";

function waitlistIconForKey(key: keyof WaitlistSettings): WaitlistSettingsIconKind {
  if (key === "enabled" || key === "widgetEnabled" || key === "guestAppEnabled") return "people";
  if (key === "exactTimeEnabled") return "clock";
  if (key === "flexibleWindowsEnabled") return "calendar";
  if (key === "employeePreferenceEnabled") return "person";
  if (key === "staffManualEntryEnabled") return "personAdd";
  if (key === "autoOfferEnabled") return "refresh";
  if (key === "closeEquivalentAfterBooking") return "shield";
  return "grid";
}

export function ConfigurationWaitlistSettingsSection({ locationId }: { locationId?: number | null }) {
  const [value, setValue] = useState<WaitlistSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/waitlists/settings", { params: locationId != null ? { locationId } : undefined })
      .then(({ data }) => {
        if (!cancelled) setValue({ ...defaults, ...(data || {}) });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              "Nastavitev čakalne vrste ni bilo mogoče naložiti.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const toggle = (key: keyof WaitlistSettings) => (checked: boolean) => {
    setMessage("");
    setValue((current) => ({ ...current, [key]: checked }));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    const normalized: WaitlistSettings = {
      ...value,
      offerValidityMinutes: clamp(value.offerValidityMinutes, 5, 1440),
      maxActiveRequestsPerGuest: clamp(value.maxActiveRequestsPerGuest, 1, 100),
      maxRequestedDateRangeDays: clamp(value.maxRequestedDateRangeDays, 1, 365),
    };
    try {
      const { data } = await api.put(
        "/waitlists/settings",
        { value: JSON.stringify(normalized) },
        { params: locationId != null ? { locationId } : undefined },
      );
      setValue({ ...defaults, ...(data || normalized) });
      setMessage("Nastavitve čakalne vrste so shranjene.");
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "Nastavitev čakalne vrste ni bilo mogoče shraniti.",
      );
    } finally {
      setSaving(false);
    }
  };

  const inheritCompanyDefaults = async () => {
    if (locationId == null) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await api.delete("/waitlists/settings", { params: { locationId } });
      setValue({ ...defaults, ...(data || {}) });
      setMessage("Poslovalnica ponovno uporablja privzete nastavitve podjetja.");
    } catch (err: any) {
      setError(err?.response?.data?.message || "Privzetih nastavitev ni bilo mogoče obnoviti.");
    } finally {
      setSaving(false);
    }
  };

  const switchRow = (
    key: keyof WaitlistSettings,
    title: string,
    description: string,
    disabled = false,
  ) => (
    <div className={`waitlist-setting-row${disabled ? " is-disabled" : ""}`}>
      <span className="waitlist-setting-icon" aria-hidden>
        <WaitlistSettingsIcon kind={waitlistIconForKey(key)} />
      </span>
      <span className="waitlist-setting-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <GuestSwitch
        checked={Boolean(value[key])}
        disabled={disabled}
        onChange={toggle(key)}
      />
    </div>
  );

  if (loading) {
    return <div className="waitlist-settings-loading">Nalaganje nastavitev …</div>;
  }

  return (
    <div className="waitlist-settings-shell">
      <style>{`
        .waitlist-settings-shell { display:grid; gap:20px; }
        .waitlist-settings-intro { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; }
        .waitlist-settings-intro h3 { margin:0 0 7px; font-size:24px; letter-spacing:-.025em; color:#07173b; }
        .waitlist-settings-intro p { margin:0; max-width:760px; color:#64748b; line-height:1.55; }
        .waitlist-settings-badge { flex:0 0 auto; border-radius:999px; padding:7px 12px; background:#eaf2ff; color:#0f62fe; font-size:12px; font-weight:900; }
        .waitlist-settings-grid { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(280px,.7fr); gap:20px; align-items:start; }
        .waitlist-settings-card { border:1px solid #dce4f0; border-radius:18px; background:#fff; overflow:hidden; box-shadow:0 12px 30px rgba(15,23,42,.05); }
        .waitlist-card-heading { display:flex; align-items:center; gap:12px; margin:0; padding:18px 20px; border-bottom:1px solid #e9eef6; color:#16264b; font-size:16px; font-weight:850; }
        .waitlist-card-heading-icon, .waitlist-setting-icon, .waitlist-info-icon { display:grid; place-items:center; flex:0 0 auto; width:40px; height:40px; border-radius:12px; color:#0f62fe; background:#eaf2ff; }
        .waitlist-card-heading-icon svg, .waitlist-setting-icon svg, .waitlist-info-icon svg { width:22px; height:22px; }
        .waitlist-setting-row { min-height:78px; display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:14px; padding:14px 18px; border-bottom:1px solid #edf2f7; }
        .waitlist-setting-row:last-child { border-bottom:0; }
        .waitlist-setting-copy { min-width:0; display:grid; gap:5px; }
        .waitlist-setting-row strong { color:#14254a; font-size:14px; }
        .waitlist-setting-row small { color:#64748b; font-size:13px; line-height:1.42; }
        .waitlist-setting-row.is-disabled { opacity:.52; }
        .waitlist-number-row { display:grid; grid-template-columns:minmax(0,1fr) 118px; align-items:center; gap:20px; padding:15px 20px; border-bottom:1px solid #edf2f7; }
        .waitlist-number-row:last-child { border-bottom:0; }
        .waitlist-number-row span { display:grid; gap:5px; }
        .waitlist-number-row strong { color:#14254a; font-size:14px; }
        .waitlist-number-row small { color:#64748b; font-size:13px; line-height:1.42; }
        .waitlist-number-row input { width:100%; min-height:44px; border:1px solid #d3deed; border-radius:11px; padding:0 12px; color:#102044; background:#f8fbff; font:inherit; font-weight:750; outline:none; }
        .waitlist-number-row input:focus { border-color:#93c5fd; background:#fff; box-shadow:0 0 0 4px rgba(59,130,246,.12); }
        .waitlist-settings-info { padding:20px; display:grid; grid-template-columns:40px minmax(0,1fr); gap:14px; }
        .waitlist-settings-info-copy { display:grid; gap:14px; min-width:0; }
        .waitlist-settings-info strong { color:#14254a; }
        .waitlist-settings-info p { margin:0; color:#64748b; font-size:13px; line-height:1.5; }
        .waitlist-settings-flow { margin:0; padding-left:20px; display:grid; gap:9px; color:#33476f; font-size:13px; line-height:1.4; }
        .waitlist-settings-flow li::marker { color:#0f62fe; font-weight:850; }
        .waitlist-settings-savebar { display:flex; align-items:center; justify-content:flex-end; gap:14px; }
        .waitlist-settings-savebar button { min-height:46px; border:0; border-radius:12px; padding:0 20px; background:linear-gradient(180deg,#1c78ff 0%,#0f62fe 100%); color:#fff; font:inherit; font-weight:850; cursor:pointer; box-shadow:0 10px 24px rgba(15,98,254,.22); }
        .waitlist-settings-savebar button:disabled { opacity:.58; cursor:not-allowed; }
        .waitlist-settings-message { color:#15803d; font-size:13px; font-weight:750; }
        .waitlist-settings-error { color:#b91c1c; font-size:13px; font-weight:750; }
        .waitlist-settings-loading { padding:34px; color:#64748b; }
        @media(max-width:1024px){
          .waitlist-settings-shell{gap:16px}
          .waitlist-settings-intro{display:none}
          .waitlist-settings-card{border-radius:18px;box-shadow:0 10px 24px rgba(15,23,42,.045)}
          .waitlist-settings-savebar{position:fixed;left:0;right:0;bottom:0;z-index:210;display:grid;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.95) 28%,#fff 100%)}
          .waitlist-settings-savebar button{width:100%;min-height:52px;border-radius:14px}
          .waitlist-settings-message{justify-self:center}
        }
        @media(max-width:900px){
          .waitlist-settings-grid{grid-template-columns:1fr}
        }
        @media(max-width:640px){
          .waitlist-settings-card{border-radius:16px}
          .waitlist-card-heading{padding:16px}
          .waitlist-setting-row{grid-template-columns:42px minmax(0,1fr) auto;gap:12px;padding:14px}
          .waitlist-setting-row small{display:none}
          .waitlist-setting-icon{width:42px;height:42px}
          .waitlist-number-row{grid-template-columns:1fr 104px;gap:12px;padding:14px}
          .waitlist-number-row small{display:none}
          .waitlist-settings-info{padding:16px}
        }
      `}</style>

      <div className="waitlist-settings-intro">
        <div>
          <h3>Čakalna vrsta</h3>
          <p>
            Določite, kdo se lahko pridruži čakalni vrsti, kako dolgo velja
            ponudba sproščenega termina in prek katerih kanalov se pošiljajo
            obvestila.
          </p>
        </div>
        <span className="waitlist-settings-badge">Samodejno ponujanje</span>
      </div>

      {error ? <div className="waitlist-settings-error">{error}</div> : null}

      <div className="waitlist-settings-grid">
        <div className="waitlist-settings-card">
          <div className="waitlist-card-heading">
            <span className="waitlist-card-heading-icon" aria-hidden>
              <WaitlistSettingsIcon kind="availability" />
            </span>
            <span>Dostopnost in način delovanja</span>
          </div>
          {switchRow(
            "enabled",
            "Omogoči čakalno vrsto",
            "Vključi upravljanje čakalnih zahtev in ponudb sproščenih terminov.",
          )}
          {switchRow(
            "widgetEnabled",
            "Omogoči v spletnem vtičniku",
            "Pripravljeno za povezavo z javnim rezervacijskim vtičnikom v naslednjem koraku.",
            !value.enabled,
          )}
          {switchRow(
            "guestAppEnabled",
            "Omogoči v aplikaciji za goste",
            "Pripravljeno za povezavo z aplikacijo Calendra Connect v naslednjem koraku.",
            !value.enabled,
          )}
          {switchRow(
            "flexibleWindowsEnabled",
            "Dovoli izbiro obdobja in prilagodljiv termin",
            "Stranka lahko izbere datum in časovno okno ali vključi možnost za katerikoli prost termin.",
            !value.enabled,
          )}
          {switchRow(
            "employeePreferenceEnabled",
            "Dovoli izbiro zaposlenega",
            "Zahteva se lahko omeji na enega ali več zaposlenih.",
            !value.enabled,
          )}
          {switchRow(
            "staffManualEntryEnabled",
            "Dovoli ročni vnos osebju",
            "Osebje lahko doda stranko neposredno v zavihku Termini → Čakalna vrsta.",
            !value.enabled,
          )}
          {switchRow(
            "autoOfferEnabled",
            "Samodejno ponudi sproščeni termin",
            "Po odpovedi ali premiku sistem preveri razpoložljivost in ponudbo pošlje prvemu ustreznemu gostu po FIFO vrstnem redu.",
            !value.enabled,
          )}
          {switchRow(
            "closeEquivalentAfterBooking",
            "Zapri enakovredne zahteve po rezervaciji",
            "Po uspešni rezervaciji zapri druge aktivne zahteve iste stranke, ki pokrivajo isti termin.",
            !value.enabled,
          )}
        </div>

        <div className="waitlist-settings-shell">
          <div className="waitlist-settings-card">
            <div className="waitlist-card-heading">
              <span className="waitlist-card-heading-icon" aria-hidden>
                <WaitlistSettingsIcon kind="limits" />
              </span>
              <span>Omejitve in ponudba</span>
            </div>
            <label className="waitlist-number-row">
              <span>
                <strong>Veljavnost ponudbe</strong>
                <small>Čas v minutah, ko je termin začasno zadržan.</small>
              </span>
              <input
                type="number"
                min="5"
                max="1440"
                value={value.offerValidityMinutes}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    offerValidityMinutes: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="waitlist-number-row">
              <span>
                <strong>Aktivne zahteve na stranko</strong>
                <small>Največje dovoljeno število hkratnih zahtev.</small>
              </span>
              <input
                type="number"
                min="1"
                max="100"
                value={value.maxActiveRequestsPerGuest}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    maxActiveRequestsPerGuest: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="waitlist-number-row">
              <span>
                <strong>Najdaljše obdobje iskanja</strong>
                <small>Največ dni v prihodnost za izbrano obdobje ali katerikoli prost termin.</small>
              </span>
              <input
                type="number"
                min="1"
                max="365"
                value={value.maxRequestedDateRangeDays}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    maxRequestedDateRangeDays: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>

          <div className="waitlist-settings-card waitlist-settings-info">
            <span className="waitlist-info-icon" aria-hidden>
              <WaitlistSettingsIcon kind="info" />
            </span>
            <div className="waitlist-settings-info-copy">
              <strong>Kako deluje</strong>
              <ol className="waitlist-settings-flow">
                <li>Obiskovalci oddajo povpraševanje po terminu.</li>
                <li>Sistem preveri razpoložljivost, velikost in pravila blokov.</li>
                <li>Termin se lahko samodejno ali ročno ponudi stranki.</li>
                <li>Po potrditvi se ponudba odstrani iz čakalne vrste.</li>
              </ol>
              <p>
                Osebje lahko ponudbo vedno pošlje ročno ali rezervira termin za
                drugo stranko z izrecno potrditvijo preglasitve.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="waitlist-settings-savebar">
        {message ? <span className="waitlist-settings-message">{message}</span> : null}
        {locationId != null ? (
          <button type="button" className="secondary" disabled={saving} onClick={inheritCompanyDefaults}>
            Uporabi privzete nastavitve podjetja
          </button>
        ) : null}
        <button type="button" disabled={saving} onClick={save}>
          {saving ? "Shranjevanje …" : "Shrani nastavitve"}
        </button>
      </div>
    </div>
  );
}

function WaitlistSettingsIcon({ kind }: { kind: WaitlistSettingsIconKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === "availability" ? (
        <>
          <rect x="5" y="5" width="14" height="15" rx="3" {...common} />
          <path d="M8 3v4M16 3v4M8.5 12h7M8.5 16h4" {...common} />
        </>
      ) : kind === "people" ? (
        <>
          <circle cx="8" cy="8" r="3" {...common} />
          <circle cx="16.5" cy="8.5" r="2.5" {...common} />
          <path d="M3.5 20a4.5 4.5 0 0 1 9 0M13 19.5a3.8 3.8 0 0 1 7.5.2" {...common} />
        </>
      ) : kind === "clock" ? (
        <>
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M12 7.5V12l3 2" {...common} />
        </>
      ) : kind === "grid" ? (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.2" {...common} />
          <rect x="14" y="4" width="6" height="6" rx="1.2" {...common} />
          <rect x="4" y="14" width="6" height="6" rx="1.2" {...common} />
          <rect x="14" y="14" width="6" height="6" rx="1.2" {...common} />
        </>
      ) : kind === "calendar" ? (
        <>
          <rect x="4" y="5.5" width="16" height="14.5" rx="2.8" {...common} />
          <path d="M8 3.5v4M16 3.5v4M4 10h16M12 12.5v5M9.5 15h5" {...common} />
        </>
      ) : kind === "person" ? (
        <>
          <circle cx="12" cy="8" r="3.2" {...common} />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" {...common} />
        </>
      ) : kind === "personAdd" ? (
        <>
          <circle cx="9" cy="8" r="3" {...common} />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0M18 9v6M15 12h6" {...common} />
        </>
      ) : kind === "refresh" ? (
        <>
          <path d="M7 7.5A7 7 0 0 1 19 12M17 5.5v4h-4M17 16.5A7 7 0 0 1 5 12M7 18.5v-4h4" {...common} />
        </>
      ) : kind === "shield" ? (
        <path d="M12 3 5.5 5.5v5.7c0 4.2 2.7 7.6 6.5 9.1 3.8-1.5 6.5-4.9 6.5-9.1V5.5L12 3Z" {...common} />
      ) : kind === "limits" ? (
        <>
          <path d="M5 7h14M5 17h14M5 12h14" {...common} />
          <circle cx="9" cy="7" r="2" {...common} />
          <circle cx="15" cy="12" r="2" {...common} />
          <circle cx="11" cy="17" r="2" {...common} />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="8.2" {...common} />
          <path d="M12 10.5v5M12 7.5h.01" {...common} />
        </>
      )}
    </svg>
  );
}
