import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import { useLocale, type AppLocale } from "../../locale";
import { GuestSegmentedToggle } from "./ConfigurationVisualComponents";

export const TENANT_RESERVATION_RULES_KEY = "TENANT_RESERVATION_RULES_JSON";

type ReservationRulesSettingsSectionProps = {
  settings: Record<string, string>;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => void | Promise<void>;
};

type ReservationRules = {
  minBookingNoticeMinutes: number;
  maxAdvanceBookingDays: number;
  rescheduleUntilHours: number;
  cancelUntilHours: number;
  employeeSelectionAllowed: boolean;
  noShowMode: "MANUAL" | "AUTOMATIC";
  noShowAfterMinutes: number;
};

type Copy = {
  title: string;
  subtitle: string;
  bookingWindowTitle: string;
  bookingWindowSubtitle: string;
  changesTitle: string;
  changesSubtitle: string;
  employeeTitle: string;
  employeeSubtitle: string;
  noShowTitle: string;
  noShowSubtitle: string;
  minNotice: string;
  minNoticeHint: string;
  maxAdvance: string;
  maxAdvanceHint: string;
  reschedule: string;
  rescheduleHint: string;
  cancel: string;
  cancelHint: string;
  allowEmployeeChoice: string;
  allowEmployeeChoiceHint: string;
  noShowMode: string;
  manualNoShow: string;
  automaticNoShow: string;
  noShowAfter: string;
  noShowAfterHint: string;
  minutes: string;
  hours: string;
  days: string;
  save: string;
  saving: string;
};

const TEXT: Record<AppLocale, Copy> = {
  en: {
    title: "Reservation rules",
    subtitle: "Shared rules for guest bookings in the mobile app and website widget.",
    bookingWindowTitle: "Booking window",
    bookingWindowSubtitle: "Control how soon and how far in advance guests can book.",
    changesTitle: "Guest changes",
    changesSubtitle: "Set how close to the appointment guests can reschedule or cancel.",
    employeeTitle: "Employee choice",
    employeeSubtitle: "Decide whether guests can explicitly choose an employee.",
    noShowTitle: "No-show rule",
    noShowSubtitle: "Keep no-show handling manual or let Calendra mark missed appointments automatically.",
    minNotice: "Minimum time before appointment",
    minNoticeHint: "Example: 120 minutes means guests can only book at least 2 hours in advance.",
    maxAdvance: "Maximum days in advance",
    maxAdvanceHint: "Example: 60 means guests can book up to 60 days ahead.",
    reschedule: "Reschedule allowed until",
    rescheduleHint: "Guest rescheduling is blocked closer than this many hours before the appointment.",
    cancel: "Cancellation allowed until",
    cancelHint: "Guest cancellation is blocked closer than this many hours before the appointment.",
    allowEmployeeChoice: "Allow employee selection",
    allowEmployeeChoiceHint: "When off, guests choose service and time; Calendra assigns the available employee behind the selected slot.",
    noShowMode: "No-show mode",
    manualNoShow: "Manual only",
    automaticNoShow: "Automatically after start",
    noShowAfter: "Mark no-show after",
    noShowAfterHint: "Used only when automatic no-show is enabled.",
    minutes: "minutes",
    hours: "hours",
    days: "days",
    save: "Save reservation rules",
    saving: "Saving…",
  },
  sl: {
    title: "Rezervacijska pravila",
    subtitle: "Skupna pravila za rezervacije v aplikaciji za stranke in spletnem vtičniku.",
    bookingWindowTitle: "Okno za rezervacije",
    bookingWindowSubtitle: "Določite, kako hitro in kako daleč vnaprej se lahko stranke naročijo.",
    changesTitle: "Spremembe s strani strank",
    changesSubtitle: "Določite, do kdaj lahko stranke prestavijo ali odpovejo termin.",
    employeeTitle: "Izbira zaposlenega",
    employeeSubtitle: "Določite, ali lahko stranka izbere zaposlenega ali ga sistem dodeli samodejno.",
    noShowTitle: "Pravilo za No Show",
    noShowSubtitle: "No-show lahko ostane ročen ali pa ga Calendra samodejno označi po začetku termina.",
    minNotice: "Najmanj časa pred terminom",
    minNoticeHint: "Primer: 120 minut pomeni, da se lahko stranka naroči najmanj 2 uri vnaprej.",
    maxAdvance: "Največ dni vnaprej",
    maxAdvanceHint: "Primer: 60 pomeni, da se lahko stranka naroči največ 60 dni vnaprej.",
    reschedule: "Sprememba termina dovoljena do",
    rescheduleHint: "Bližje kot toliko ur pred terminom stranka termina ne more več prestaviti.",
    cancel: "Odpoved termina dovoljena do",
    cancelHint: "Bližje kot toliko ur pred terminom stranka termina ne more več odpovedati.",
    allowEmployeeChoice: "Dovoli izbiro zaposlenega",
    allowEmployeeChoiceHint: "Ko je izklopljeno, stranka izbere storitev in termin; Calendra v ozadju dodeli razpoložljivega zaposlenega.",
    noShowMode: "Način No Show",
    manualNoShow: "Samo ročno",
    automaticNoShow: "Samodejno po začetku",
    noShowAfter: "Označi No Show po",
    noShowAfterHint: "Uporabi se samo, ko je samodejno označevanje vklopljeno.",
    minutes: "minut",
    hours: "ur",
    days: "dni",
    save: "Shrani rezervacijska pravila",
    saving: "Shranjujem…",
  },
};

const DEFAULT_RULES: ReservationRules = {
  minBookingNoticeMinutes: 120,
  maxAdvanceBookingDays: 60,
  rescheduleUntilHours: 12,
  cancelUntilHours: 24,
  employeeSelectionAllowed: false,
  noShowMode: "MANUAL",
  noShowAfterMinutes: 15,
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

export const parseTenantReservationRules = (raw: string | undefined): ReservationRules => {
  if (!raw) return DEFAULT_RULES;
  try {
    const parsed = JSON.parse(raw);
    return {
      minBookingNoticeMinutes: clampNumber(parsed?.minBookingNoticeMinutes ?? parsed?.minBookingNotice, DEFAULT_RULES.minBookingNoticeMinutes, 0, 60 * 24 * 30),
      maxAdvanceBookingDays: clampNumber(parsed?.maxAdvanceBookingDays ?? parsed?.maxAdvanceDays, DEFAULT_RULES.maxAdvanceBookingDays, 1, 730),
      rescheduleUntilHours: clampNumber(parsed?.rescheduleUntilHours, DEFAULT_RULES.rescheduleUntilHours, 0, 24 * 90),
      cancelUntilHours: clampNumber(parsed?.cancelUntilHours ?? parsed?.freeCancelUntilHours, DEFAULT_RULES.cancelUntilHours, 0, 24 * 90),
      employeeSelectionAllowed: parsed?.employeeSelectionAllowed === true || parsed?.employeeSelectionStep === true,
      noShowMode: parsed?.noShowMode === "AUTOMATIC" || parsed?.noShowMode === "AUTO" ? "AUTOMATIC" : "MANUAL",
      noShowAfterMinutes: clampNumber(parsed?.noShowAfterMinutes, DEFAULT_RULES.noShowAfterMinutes, 0, 24 * 60),
    };
  } catch {
    return DEFAULT_RULES;
  }
};

export const serializeTenantReservationRules = (rules: ReservationRules) =>
  JSON.stringify({
    minBookingNoticeMinutes: clampNumber(rules.minBookingNoticeMinutes, DEFAULT_RULES.minBookingNoticeMinutes, 0, 60 * 24 * 30),
    maxAdvanceBookingDays: clampNumber(rules.maxAdvanceBookingDays, DEFAULT_RULES.maxAdvanceBookingDays, 1, 730),
    rescheduleUntilHours: clampNumber(rules.rescheduleUntilHours, DEFAULT_RULES.rescheduleUntilHours, 0, 24 * 90),
    cancelUntilHours: clampNumber(rules.cancelUntilHours, DEFAULT_RULES.cancelUntilHours, 0, 24 * 90),
    employeeSelectionAllowed: rules.employeeSelectionAllowed,
    noShowMode: rules.noShowMode === "AUTOMATIC" ? "AUTOMATIC" : "MANUAL",
    noShowAfterMinutes: clampNumber(rules.noShowAfterMinutes, DEFAULT_RULES.noShowAfterMinutes, 0, 24 * 60),
  });

export function ReservationRulesSettingsSection({
  settings,
  setSettings,
  saving,
  onSave,
}: ReservationRulesSettingsSectionProps) {
  const { locale } = useLocale();
  const text = TEXT[locale];
  const rules = useMemo(
    () => parseTenantReservationRules(settings[TENANT_RESERVATION_RULES_KEY]),
    [settings],
  );

  const update = (patch: Partial<ReservationRules>) => {
    const next = { ...rules, ...patch };
    setSettings((current) => ({
      ...current,
      [TENANT_RESERVATION_RULES_KEY]: serializeTenantReservationRules(next),
    }));
  };

  return (
    <section className="general-settings-shell reservation-rules-shell">
      <div className="general-settings-header">
        <div>
          <p className="general-settings-eyebrow">Calendra</p>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
        <button
          type="button"
          className="general-settings-save-button"
          onClick={() => void onSave()}
          disabled={saving}
        >
          {saving ? text.saving : text.save}
        </button>
      </div>

      <div className="general-settings-grid reservation-rules-grid">
        <article className="general-settings-card">
          <SectionHeader title={text.bookingWindowTitle} subtitle={text.bookingWindowSubtitle} />
          <div className="general-settings-form-grid">
            <NumericField
              label={text.minNotice}
              hint={text.minNoticeHint}
              value={rules.minBookingNoticeMinutes}
              suffix={text.minutes}
              min={0}
              max={60 * 24 * 30}
              onChange={(value) => update({ minBookingNoticeMinutes: value })}
            />
            <NumericField
              label={text.maxAdvance}
              hint={text.maxAdvanceHint}
              value={rules.maxAdvanceBookingDays}
              suffix={text.days}
              min={1}
              max={730}
              onChange={(value) => update({ maxAdvanceBookingDays: value })}
            />
          </div>
        </article>

        <article className="general-settings-card">
          <SectionHeader title={text.changesTitle} subtitle={text.changesSubtitle} />
          <div className="general-settings-form-grid">
            <NumericField
              label={text.reschedule}
              hint={text.rescheduleHint}
              value={rules.rescheduleUntilHours}
              suffix={text.hours}
              min={0}
              max={24 * 90}
              onChange={(value) => update({ rescheduleUntilHours: value })}
            />
            <NumericField
              label={text.cancel}
              hint={text.cancelHint}
              value={rules.cancelUntilHours}
              suffix={text.hours}
              min={0}
              max={24 * 90}
              onChange={(value) => update({ cancelUntilHours: value })}
            />
          </div>
        </article>

        <article className="general-settings-card reservation-rules-card--wide">
          <SectionHeader title={text.employeeTitle} subtitle={text.employeeSubtitle} />
          <div className="reservation-rules-toggle-row">
            <div>
              <strong>{text.allowEmployeeChoice}</strong>
              <p>{text.allowEmployeeChoiceHint}</p>
            </div>
            <GuestSegmentedToggle
              value={rules.employeeSelectionAllowed}
              onChange={(value) => update({ employeeSelectionAllowed: value })}
            />
          </div>
        </article>

        <article className="general-settings-card reservation-rules-card--wide">
          <SectionHeader title={text.noShowTitle} subtitle={text.noShowSubtitle} />
          <div className="general-settings-form-grid">
            <label className="general-settings-field">
              <span>{text.noShowMode}</span>
              <select
                value={rules.noShowMode}
                onChange={(event) => update({ noShowMode: event.target.value === "AUTOMATIC" ? "AUTOMATIC" : "MANUAL" })}
              >
                <option value="MANUAL">{text.manualNoShow}</option>
                <option value="AUTOMATIC">{text.automaticNoShow}</option>
              </select>
            </label>
            <NumericField
              label={text.noShowAfter}
              hint={text.noShowAfterHint}
              value={rules.noShowAfterMinutes}
              suffix={text.minutes}
              min={0}
              max={24 * 60}
              disabled={rules.noShowMode !== "AUTOMATIC"}
              onChange={(value) => update({ noShowAfterMinutes: value })}
            />
          </div>
        </article>
      </div>
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="general-settings-section-header">
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
}

function NumericField({
  label,
  hint,
  value,
  suffix,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="general-settings-field reservation-rules-number-field">
      <span>{label}</span>
      <div className="reservation-rules-number-input">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(clampNumber(event.target.value, value, min, max))}
        />
        <span>{suffix}</span>
      </div>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
