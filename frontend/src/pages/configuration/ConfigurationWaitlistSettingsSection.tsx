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
  notifyEmail: boolean;
  notifySms: boolean;
  notifyGuestApp: boolean;
};

const defaults: WaitlistSettings = {
  enabled: true,
  widgetEnabled: true,
  guestAppEnabled: true,
  exactTimeEnabled: true,
  flexibleWindowsEnabled: true,
  employeePreferenceEnabled: true,
  autoOfferEnabled: true,
  offerValidityMinutes: 15,
  maxActiveRequestsPerGuest: 5,
  maxRequestedDateRangeDays: 30,
  staffManualEntryEnabled: true,
  closeEquivalentAfterBooking: true,
  notifyEmail: true,
  notifySms: false,
  notifyGuestApp: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function ConfigurationWaitlistSettingsSection() {
  const [value, setValue] = useState<WaitlistSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/waitlists/settings")
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
  }, []);

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
      const { data } = await api.put("/waitlists/settings", {
        value: JSON.stringify(normalized),
      });
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

  const switchRow = (
    key: keyof WaitlistSettings,
    title: string,
    description: string,
    disabled = false,
  ) => (
    <div className={`waitlist-setting-row${disabled ? " is-disabled" : ""}`}>
      <span>
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
        .waitlist-settings-card { border:1px solid #dce4f0; border-radius:18px; background:#fff; overflow:hidden; }
        .waitlist-settings-card h4 { margin:0; padding:18px 20px; border-bottom:1px solid #e9eef6; color:#16264b; font-size:16px; }
        .waitlist-setting-row { min-height:78px; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:15px 20px; border-bottom:1px solid #edf2f7; }
        .waitlist-setting-row:last-child { border-bottom:0; }
        .waitlist-setting-row > span { min-width:0; display:grid; gap:5px; }
        .waitlist-setting-row strong { color:#14254a; font-size:14px; }
        .waitlist-setting-row small { color:#64748b; font-size:13px; line-height:1.42; }
        .waitlist-setting-row.is-disabled { opacity:.52; }
        .waitlist-number-row { display:grid; grid-template-columns:minmax(0,1fr) 118px; align-items:center; gap:20px; padding:15px 20px; border-bottom:1px solid #edf2f7; }
        .waitlist-number-row:last-child { border-bottom:0; }
        .waitlist-number-row span { display:grid; gap:5px; }
        .waitlist-number-row strong { color:#14254a; font-size:14px; }
        .waitlist-number-row small { color:#64748b; font-size:13px; line-height:1.42; }
        .waitlist-number-row input { width:100%; min-height:44px; border:1px solid #d3deed; border-radius:11px; padding:0 12px; color:#102044; font:inherit; font-weight:750; }
        .waitlist-settings-info { padding:20px; display:grid; gap:14px; }
        .waitlist-settings-info strong { color:#14254a; }
        .waitlist-settings-info p { margin:0; color:#64748b; font-size:13px; line-height:1.5; }
        .waitlist-settings-flow { margin:0; padding-left:20px; display:grid; gap:9px; color:#33476f; font-size:13px; line-height:1.4; }
        .waitlist-settings-savebar { display:flex; align-items:center; justify-content:flex-end; gap:14px; }
        .waitlist-settings-savebar button { min-height:46px; border:0; border-radius:12px; padding:0 20px; background:#0f62fe; color:#fff; font:inherit; font-weight:850; cursor:pointer; box-shadow:0 10px 24px rgba(15,98,254,.22); }
        .waitlist-settings-savebar button:disabled { opacity:.58; cursor:not-allowed; }
        .waitlist-settings-message { color:#15803d; font-size:13px; font-weight:750; }
        .waitlist-settings-error { color:#b91c1c; font-size:13px; font-weight:750; }
        .waitlist-settings-loading { padding:34px; color:#64748b; }
        @media(max-width:900px){ .waitlist-settings-grid{grid-template-columns:1fr}.waitlist-settings-intro{flex-direction:column}.waitlist-settings-savebar{align-items:stretch;flex-direction:column}.waitlist-settings-savebar button{width:100%} }
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
          <h4>Dostopnost in način delovanja</h4>
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
            <h4>Omejitve in ponudba</h4>
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

          <div className="waitlist-settings-card">
            <h4>Kanali obvestil</h4>
            {switchRow("notifyEmail", "E-pošta", "Pošlji predloge iz Konfiguracija → Obvestila.", !value.enabled)}
            {switchRow("notifySms", "SMS", "Pošlji SMS, ko je kanal na voljo in aktiven.", !value.enabled)}
            {switchRow("notifyGuestApp", "Aplikacija za goste", "Pošlji potisno obvestilo in zapis v aplikaciji.", !value.enabled)}
          </div>

          <div className="waitlist-settings-card waitlist-settings-info">
            <strong>Kako deluje</strong>
            <ol className="waitlist-settings-flow">
              <li>Odpoved ali premik sprosti termin.</li>
              <li>Preveri se celotna razpoložljivost, vključno s pavzo, prostori in viri.</li>
              <li>Termin se začasno zadrži za prvega ustreznega gosta.</li>
              <li>Po zavrnitvi ali poteku se ponudba pošlje naslednjemu.</li>
            </ol>
            <p>
              Osebje lahko ponudbo vedno pošlje ročno ali rezervira termin za
              drugo stranko z izrecno potrditvijo preglasitve.
            </p>
          </div>
        </div>
      </div>

      <div className="waitlist-settings-savebar">
        {message ? <span className="waitlist-settings-message">{message}</span> : null}
        <button type="button" disabled={saving} onClick={save}>
          {saving ? "Shranjevanje …" : "Shrani nastavitve"}
        </button>
      </div>
    </div>
  );
}
