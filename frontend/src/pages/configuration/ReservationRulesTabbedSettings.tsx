import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type { Dispatch, SetStateAction } from "react";
import { Card } from "../../components/ui";
import { useLocale } from "../../locale";
import { ConfigurationWaitlistSettingsSection } from "./ConfigurationWaitlistSettingsSection";
import { ReservationRulesSettingsSection, TENANT_RESERVATION_RULES_KEY } from "./ReservationRulesSettingsSection";

type ReservationRulesTabbedSettingsProps = {
  settings: Record<string, string>;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => void | Promise<void>;
  waitlistEnabled: boolean;
  hasChanges: boolean;
  locationId?: number | null;
  locationName?: string | null;
};

type ReservationRulesSubtab = "reservations" | "waitlist";

export function ReservationRulesTabbedSettings({
  settings,
  setSettings,
  saving,
  onSave,
  waitlistEnabled,
  hasChanges,
  locationId = null,
  locationName = null,
}: ReservationRulesTabbedSettingsProps) {
  const { locale } = useLocale();
  const [activeSubtab, setActiveSubtab] =
    useState<ReservationRulesSubtab>("reservations");
  const [locationReservationBase, setLocationReservationBase] = useState<string | null>(null);
  const [locationReservationDraft, setLocationReservationDraft] = useState<string | null>(null);
  const [locationBreakBase, setLocationBreakBase] = useState<string | null>(null);
  const [locationBreakDraft, setLocationBreakDraft] = useState<string | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);

  useEffect(() => {
    if (locationId == null) {
      setLocationReservationBase(null);
      setLocationReservationDraft(null);
      setLocationBreakBase(null);
      setLocationBreakDraft(null);
      return;
    }
    let cancelled = false;
    api.get("/settings/location-overrides", { params: { locationId } })
      .then(({ data }) => {
        if (cancelled) return;
        const raw = data?.values?.[TENANT_RESERVATION_RULES_KEY];
        const effective = typeof raw === "string" ? raw : (settings[TENANT_RESERVATION_RULES_KEY] || "");
        const breakRaw = data?.values?.DEFAULT_SERVICE_BREAK_MINUTES;
        const effectiveBreak = typeof breakRaw === "string" ? breakRaw : (settings.DEFAULT_SERVICE_BREAK_MINUTES || "0");
        setLocationReservationBase(effective);
        setLocationReservationDraft(effective);
        setLocationBreakBase(effectiveBreak);
        setLocationBreakDraft(effectiveBreak);
      })
      .catch(() => {
        if (!cancelled) {
          const effective = settings[TENANT_RESERVATION_RULES_KEY] || "";
          const effectiveBreak = settings.DEFAULT_SERVICE_BREAK_MINUTES || "0";
          setLocationReservationBase(effective);
          setLocationReservationDraft(effective);
          setLocationBreakBase(effectiveBreak);
          setLocationBreakDraft(effectiveBreak);
        }
      });
    return () => { cancelled = true; };
  }, [locationId, settings[TENANT_RESERVATION_RULES_KEY], settings.DEFAULT_SERVICE_BREAK_MINUTES]);

  const scopedSettings = useMemo(() => {
    if (locationId == null || locationReservationDraft == null) return settings;
    return { ...settings, [TENANT_RESERVATION_RULES_KEY]: locationReservationDraft };
  }, [settings, locationId, locationReservationDraft]);

  const scopedSetSettings: Dispatch<SetStateAction<Record<string, string>>> = (action) => {
    if (locationId == null) {
      setSettings(action);
      return;
    }
    const current = scopedSettings;
    const next = typeof action === "function" ? action(current) : action;
    setLocationReservationDraft(next[TENANT_RESERVATION_RULES_KEY] || "");
  };

  const scopedHasChanges = locationId == null
    ? hasChanges
    : (locationReservationDraft != null && locationReservationDraft !== locationReservationBase)
      || (locationBreakDraft != null && locationBreakDraft !== locationBreakBase);

  const saveReservationRules = async () => {
    if (locationId == null) {
      await onSave();
      return;
    }
    if (locationReservationDraft == null) return;
    setLocationSaving(true);
    try {
      if (locationReservationDraft !== locationReservationBase) {
        await api.put(
          `/settings/location-overrides/${TENANT_RESERVATION_RULES_KEY}`,
          { value: locationReservationDraft },
          { params: { locationId } },
        );
        setLocationReservationBase(locationReservationDraft);
      }
      if (locationBreakDraft != null && locationBreakDraft !== locationBreakBase) {
        const normalizedBreak = String(Math.max(0, Math.min(180, Math.round(Number(locationBreakDraft) || 0))));
        await api.put(
          "/settings/location-overrides/DEFAULT_SERVICE_BREAK_MINUTES",
          { value: normalizedBreak },
          { params: { locationId } },
        );
        setLocationBreakBase(normalizedBreak);
        setLocationBreakDraft(normalizedBreak);
      }
    } finally {
      setLocationSaving(false);
    }
  };

  const inheritReservationRules = async () => {
    if (locationId == null) return;
    setLocationSaving(true);
    try {
      await Promise.all([
        api.delete(`/settings/location-overrides/${TENANT_RESERVATION_RULES_KEY}`, { params: { locationId } }),
        api.delete("/settings/location-overrides/DEFAULT_SERVICE_BREAK_MINUTES", { params: { locationId } }),
      ]);
      const effective = settings[TENANT_RESERVATION_RULES_KEY] || "";
      const effectiveBreak = settings.DEFAULT_SERVICE_BREAK_MINUTES || "0";
      setLocationReservationBase(effective);
      setLocationReservationDraft(effective);
      setLocationBreakBase(effectiveBreak);
      setLocationBreakDraft(effectiveBreak);
    } finally {
      setLocationSaving(false);
    }
  };

  useEffect(() => {
    if (!waitlistEnabled && activeSubtab === "waitlist") {
      setActiveSubtab("reservations");
    }
  }, [activeSubtab, waitlistEnabled]);

  const reservationLabel =
    locale === "sl" ? "Rezervacije" : locale === "sr" ? "Rezervacije" : "Reservations";
  const waitlistLabel =
    locale === "sl" ? "Čakalne vrste" : locale === "sr" ? "Liste čekanja" : "Waitlists";

  return (
    <div className="reservation-rules-page-stack reservation-rules-tabbed-page">
      <div
        className="reservation-rules-compact-tabs"
        role="tablist"
        aria-label={
          locale === "sl"
            ? "Področja rezervacijskih pravil"
            : locale === "sr"
              ? "Oblasti pravila rezervacije"
              : "Reservation rule areas"
        }
        style={{
          gridTemplateColumns: waitlistEnabled
            ? "repeat(2, minmax(0, 1fr))"
            : "minmax(0, 1fr)",
        }}
      >
        <button
          type="button"
          className={
            activeSubtab === "reservations"
              ? "reservation-rules-compact-tab is-active"
              : "reservation-rules-compact-tab"
          }
          onClick={() => setActiveSubtab("reservations")}
          role="tab"
          aria-selected={activeSubtab === "reservations"}
          aria-controls="reservation-rules-reservations-panel"
        >
          <span className="reservation-rules-compact-tab-icon" aria-hidden>
            <ReservationCalendarIcon />
          </span>
          <span>{reservationLabel}</span>
        </button>

        {waitlistEnabled ? (
          <button
            type="button"
            className={
              activeSubtab === "waitlist"
                ? "reservation-rules-compact-tab is-active"
                : "reservation-rules-compact-tab"
            }
            onClick={() => setActiveSubtab("waitlist")}
            role="tab"
            aria-selected={activeSubtab === "waitlist"}
            aria-controls="reservation-rules-waitlist-panel"
          >
            <span className="reservation-rules-compact-tab-icon" aria-hidden>
              <WaitlistQueueIcon />
            </span>
            <span>{waitlistLabel}</span>
          </button>
        ) : null}
      </div>

      <div
        id="reservation-rules-reservations-panel"
        className={
          activeSubtab === "reservations"
            ? "reservation-rules-tab-panel is-active"
            : "reservation-rules-tab-panel"
        }
        role="tabpanel"
      >
        {locationId != null ? (
          <div className="location-override-banner">
            <span>
              {locale === "sl"
                ? `Pravila za poslovalnico ${locationName || locationId}. Spremembe veljajo samo tukaj.`
                : `Rules for ${locationName || locationId}. Changes apply only to this location.`}
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{locale === "sl" ? "Privzeta pavza (min)" : "Default break (min)"}</span>
              <input
                type="number"
                min={0}
                max={180}
                step={5}
                value={locationBreakDraft ?? settings.DEFAULT_SERVICE_BREAK_MINUTES ?? "0"}
                onChange={(event) => setLocationBreakDraft(event.target.value)}
                style={{ width: 86 }}
              />
            </label>
            <button type="button" className="secondary slim-btn" disabled={locationSaving} onClick={inheritReservationRules}>
              {locale === "sl" ? "Uporabi privzeto podjetja" : "Use company default"}
            </button>
          </div>
        ) : null}
        <Card className="settings-card modules-design-card reservation-rules-page-card">
          <ReservationRulesSettingsSection
            settings={scopedSettings}
            setSettings={scopedSetSettings}
            saving={saving || locationSaving}
            onSave={saveReservationRules}
            hasChanges={scopedHasChanges}
          />
        </Card>
      </div>

      {waitlistEnabled ? (
        <div
          id="reservation-rules-waitlist-panel"
          className={
            activeSubtab === "waitlist"
              ? "reservation-rules-tab-panel reservation-rules-tab-panel--waitlist is-active"
              : "reservation-rules-tab-panel reservation-rules-tab-panel--waitlist"
          }
          role="tabpanel"
        >
          <Card className="settings-card modules-design-card reservation-rules-page-card reservation-rules-waitlist-card">
            <ConfigurationWaitlistSettingsSection locationId={locationId} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function ReservationCalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function WaitlistQueueIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 20a4.5 4.5 0 0 1 9 0M13 19.5a3.8 3.8 0 0 1 7.5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19.5 4.5h2M19.5 7h2M19.5 9.5h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
