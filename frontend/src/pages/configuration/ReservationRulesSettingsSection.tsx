import { DesktopSelect } from "../../components/DesktopSelect";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../locale";
import { GuestSwitch } from "./ConfigurationVisualComponents";
import { useMobileKeyboardOpen } from "../../hooks/useMobileKeyboardOpen";

export const TENANT_RESERVATION_RULES_KEY = "TENANT_RESERVATION_RULES_JSON";

type ReservationRulesSettingsSectionProps = {
  settings: Record<string, string>;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => void | Promise<void>;
  hasChanges: boolean;
};

type ReservationRules = {
  minBookingNoticeMinutes: number;
  maxAdvanceBookingDays: number;
  rescheduleUntilHours: number;
  cancelUntilHours: number;
  employeeSelectionAllowed: boolean;
  cancellationAllowed: boolean;
  modificationAllowed: boolean;
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
  allowCancellation: string;
  allowCancellationHint: string;
  allowModification: string;
  allowModificationHint: string;
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

const TEXT: Record<'en' | 'sl', Copy> = {
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
    allowCancellation: "Booking cancellation",
    allowCancellationHint: "When off, guests can never cancel a booking (website link and guest app). When on, the cancellation deadline above applies.",
    allowModification: "Booking modification",
    allowModificationHint: "When off, guests can never reschedule a booking (website link and guest app). When on, the reschedule deadline above applies.",
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
    save: "Save configuration",
    saving: "Saving…",
  },
  sl: {
    title: "Rezervacijska pravila",
    subtitle: "Skupna pravila za rezervacije v aplikaciji za stranke in spletnem vtičniku.",
    bookingWindowTitle: "Okno za rezervacijo",
    bookingWindowSubtitle: "Določite, kako hitro in kako daleč vnaprej se lahko stranke naročijo.",
    changesTitle: "Spremembe s strani strank",
    changesSubtitle: "Določite, do kdaj lahko stranke prestavijo ali odpovejo termin.",
    employeeTitle: "Izbira zaposlenega",
    employeeSubtitle: "Določite, ali lahko stranka izbere zaposlenega ali ga sistem dodeli samodejno.",
    noShowTitle: "Pravila za No Show",
    noShowSubtitle: "No-show lahko ostane ročen ali pa ga Calendra samodejno označi po začetku termina.",
    minNotice: "Najmanj časa pred terminom",
    minNoticeHint: "Primer: 120 minut pomeni, da se lahko stranka naroči najmanj 2 uri vnaprej.",
    maxAdvance: "Največ dni vnaprej",
    maxAdvanceHint: "Primer: 60 pomeni, da se lahko stranka naroči največ 60 dni vnaprej.",
    reschedule: "Sprememba termina dovoljena do",
    rescheduleHint: "Bližje kot toliko ur pred terminom stranka termina ne more več prestaviti.",
    cancel: "Odpoved termina dovoljena do",
    cancelHint: "Bližje kot toliko ur pred terminom stranka termina ne more več odpovedati.",
    allowCancellation: "Odpoved rezervacije",
    allowCancellationHint: "Kupci lahko odpovejo svojo rezervacijo.",
    allowModification: "Sprememba rezervacije",
    allowModificationHint: "Kupci lahko spremenijo svojo rezervacijo.",
    allowEmployeeChoice: "Dovoli izbiro zaposlenega",
    allowEmployeeChoiceHint: "Kupci lahko izberejo želenega zaposlenega.",
    noShowMode: "Način No Show",
    manualNoShow: "Samo ročno",
    automaticNoShow: "Samodejno po začetku",
    noShowAfter: "Označi No Show po",
    noShowAfterHint: "Uporabi se samo, ko je samodejno označevanje vklopljeno.",
    minutes: "minut",
    hours: "ur",
    days: "dni",
    save: "Shrani konfiguracijo",
    saving: "Shranjujem…",
  },
};

const DEFAULT_RULES: ReservationRules = {
  minBookingNoticeMinutes: 120,
  maxAdvanceBookingDays: 60,
  rescheduleUntilHours: 12,
  cancelUntilHours: 24,
  employeeSelectionAllowed: false,
  cancellationAllowed: true,
  modificationAllowed: true,
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
      cancellationAllowed:
        parsed?.cancellationAllowed === false || parsed?.cancellationEnabled === false ? false : true,
      modificationAllowed:
        parsed?.modificationAllowed === false || parsed?.modificationEnabled === false ? false : true,
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
    cancellationAllowed: rules.cancellationAllowed,
    cancellationEnabled: rules.cancellationAllowed,
    modificationAllowed: rules.modificationAllowed,
    noShowMode: rules.noShowMode === "AUTOMATIC" ? "AUTOMATIC" : "MANUAL",
    noShowAfterMinutes: clampNumber(rules.noShowAfterMinutes, DEFAULT_RULES.noShowAfterMinutes, 0, 24 * 60),
  });

export function ReservationRulesSettingsSection({
  settings,
  setSettings,
  saving,
  onSave,
  hasChanges,
}: ReservationRulesSettingsSectionProps) {
  const { locale } = useLocale();
  const text = TEXT[locale === 'sr' ? 'sl' : locale];
  const keyboardOpen = useMobileKeyboardOpen(1024);
  const [isMobileTablet, setIsMobileTablet] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 1024px)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 1024px)');
    const sync = () => setIsMobileTablet(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const showSavebar = !isMobileTablet || (hasChanges && !keyboardOpen);
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
      <div className="general-settings-grid reservation-rules-grid">
        <article className="general-settings-card reservation-rules-card reservation-rules-card--booking">
          <SectionHeader icon="calendar" title={text.bookingWindowTitle} subtitle={text.bookingWindowSubtitle} />
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

        <article className="general-settings-card reservation-rules-card reservation-rules-card--changes">
          <SectionHeader icon="changes" title={text.changesTitle} subtitle={text.changesSubtitle} />
          <div className="reservation-rules-toggle-row">
            <span className="reservation-rules-row-icon" aria-hidden>
              <ReservationRuleIcon kind="cancel" />
            </span>
            <div>
              <strong>{text.allowCancellation}</strong>
              <p>{text.allowCancellationHint}</p>
            </div>
            <GuestSwitch
              checked={rules.cancellationAllowed}
              onChange={(value) => update({ cancellationAllowed: value })}
            />
          </div>
          <div className="reservation-rules-toggle-row">
            <span className="reservation-rules-row-icon" aria-hidden>
              <ReservationRuleIcon kind="modify" />
            </span>
            <div>
              <strong>{text.allowModification}</strong>
              <p>{text.allowModificationHint}</p>
            </div>
            <GuestSwitch
              checked={rules.modificationAllowed}
              onChange={(value) => update({ modificationAllowed: value })}
            />
          </div>
          {rules.modificationAllowed || rules.cancellationAllowed ? (
            <div className="general-settings-form-grid reservation-rules-deadline-grid">
              {rules.modificationAllowed ? (
                <NumericField
                  label={text.reschedule}
                  hint={text.rescheduleHint}
                  value={rules.rescheduleUntilHours}
                  suffix={text.hours}
                  min={0}
                  max={24 * 90}
                  onChange={(value) => update({ rescheduleUntilHours: value })}
                />
              ) : null}
              {rules.cancellationAllowed ? (
                <NumericField
                  label={text.cancel}
                  hint={text.cancelHint}
                  value={rules.cancelUntilHours}
                  suffix={text.hours}
                  min={0}
                  max={24 * 90}
                  onChange={(value) => update({ cancelUntilHours: value })}
                />
              ) : null}
            </div>
          ) : null}
        </article>


        <article className="general-settings-card reservation-rules-card reservation-rules-card--wide reservation-rules-card--employee">
          <SectionHeader icon="employee" title={text.employeeTitle} subtitle={text.employeeSubtitle} />
          <div className="reservation-rules-toggle-row">
            <span className="reservation-rules-row-icon" aria-hidden>
              <ReservationRuleIcon kind="employee" />
            </span>
            <div>
              <strong>{text.allowEmployeeChoice}</strong>
              <p>{text.allowEmployeeChoiceHint}</p>
            </div>
            <GuestSwitch
              checked={rules.employeeSelectionAllowed}
              onChange={(value) => update({ employeeSelectionAllowed: value })}
            />
          </div>
        </article>

        <article className="general-settings-card reservation-rules-card reservation-rules-card--wide reservation-rules-card--no-show">
          <SectionHeader icon="noShow" title={text.noShowTitle} subtitle={text.noShowSubtitle} />
          <div className="general-settings-form-grid">
            <label className="general-settings-field">
              <span>{text.noShowMode}</span>
              <DesktopSelect
                value={rules.noShowMode}
                onChange={(event) => update({ noShowMode: event.target.value === "AUTOMATIC" ? "AUTOMATIC" : "MANUAL" })}
              >
                <option value="MANUAL">{text.manualNoShow}</option>
                <option value="AUTOMATIC">{text.automaticNoShow}</option>
              </DesktopSelect>
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

      {showSavebar ? (
        <div className="general-settings-savebar reservation-rules-savebar">
          <button
            type="button"
            className="general-settings-save-button"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? text.saving : text.save}
          </button>
        </div>
      ) : null}
    </section>
  );
}

type ReservationRuleIconKind =
  | "calendar"
  | "changes"
  | "cancel"
  | "modify"
  | "employee"
  | "noShow";

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReservationRuleIconKind;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="general-settings-section-header reservation-rules-section-header">
      <span className="reservation-rules-section-icon" aria-hidden>
        <ReservationRuleIcon kind={icon} />
      </span>
      <span className="reservation-rules-section-copy">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </span>
    </div>
  );
}

function ReservationRuleIcon({ kind }: { kind: ReservationRuleIconKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === "calendar" ? (
        <>
          <rect x="4" y="5.5" width="16" height="14.5" rx="2.8" {...common} />
          <path d="M8 3.5v4M16 3.5v4M4 10h16M9 14h6M12 11v6" {...common} />
        </>
      ) : kind === "changes" ? (
        <>
          <path d="M12 3 5.5 5.5v5.7c0 4.2 2.7 7.6 6.5 9.1 3.8-1.5 6.5-4.9 6.5-9.1V5.5L12 3Z" {...common} />
          <circle cx="12" cy="9" r="2.2" {...common} />
          <path d="M8.8 15.2a3.6 3.6 0 0 1 6.4 0" {...common} />
        </>
      ) : kind === "cancel" ? (
        <>
          <path d="m5 18 3.5-.8L18 7.7 15.3 5 5.8 14.5 5 18Z" {...common} />
          <path d="m13.8 6.5 2.7 2.7" {...common} />
        </>
      ) : kind === "modify" ? (
        <>
          <path d="M7 7.5A7 7 0 0 1 19 12M17 5.5v4h-4M17 16.5A7 7 0 0 1 5 12M7 18.5v-4h4" {...common} />
        </>
      ) : kind === "employee" ? (
        <>
          <circle cx="12" cy="8" r="3.2" {...common} />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" {...common} />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="8.2" {...common} />
          <path d="m9 9 6 6M15 9l-6 6" {...common} />
        </>
      )}
    </svg>
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
