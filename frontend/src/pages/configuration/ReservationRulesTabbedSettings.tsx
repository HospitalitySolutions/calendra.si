import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Card } from "../../components/ui";
import { useLocale } from "../../locale";
import { ConfigurationWaitlistSettingsSection } from "./ConfigurationWaitlistSettingsSection";
import { ReservationRulesSettingsSection } from "./ReservationRulesSettingsSection";

type ReservationRulesTabbedSettingsProps = {
  settings: Record<string, string>;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => void | Promise<void>;
  waitlistEnabled: boolean;
};

type ReservationRulesSubtab = "reservations" | "waitlist";

export function ReservationRulesTabbedSettings({
  settings,
  setSettings,
  saving,
  onSave,
  waitlistEnabled,
}: ReservationRulesTabbedSettingsProps) {
  const { locale } = useLocale();
  const [activeSubtab, setActiveSubtab] =
    useState<ReservationRulesSubtab>("reservations");

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
        <Card className="settings-card modules-design-card reservation-rules-page-card">
          <ReservationRulesSettingsSection
            settings={settings}
            setSettings={setSettings}
            saving={saving}
            onSave={onSave}
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
            <ConfigurationWaitlistSettingsSection />
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
