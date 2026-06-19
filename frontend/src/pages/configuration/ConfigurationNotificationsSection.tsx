import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { GuestConfigSaveIcon as GuestSaveIcon } from "../../components/GuestConfigSaveIcon";

type NotificationChannel = "email" | "sms" | "guestApp";
type NotificationEventKind =
  | "newSession"
  | "sessionChanged"
  | "sessionCancelled"
  | "beforeSession"
  | "afterSession";

type NotificationEventDefinition = {
  id: NotificationEventKind;
  title: string;
  description: string;
  icon: "calendar" | "edit" | "x" | "bell" | "check" | "message";
  reminder?: "before" | "after";
};

type ConfigurationNotificationsSectionProps = {
  settings: Record<string, string>;
  setSettings: (
    value:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  savingSettings: boolean;
  onSave: () => void | Promise<void>;
  t: (key: string) => string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const notificationEvents: NotificationEventDefinition[] = [
  {
    id: "newSession",
    title: "Nova seja",
    description: "Pošlje se, ko je seja uspešno ustvarjena.",
    icon: "calendar",
  },
  {
    id: "sessionChanged",
    title: "Sprememba seje",
    description: "Pošlje se, ko so podrobnosti seje spremenjene.",
    icon: "edit",
  },
  {
    id: "sessionCancelled",
    title: "Preklic seje",
    description: "Pošlje se, ko je seja preklicana.",
    icon: "x",
  },
  {
    id: "beforeSession",
    title: "Pred sejo",
    description: "Opomnik pošlje pred začetkom seje.",
    icon: "bell",
    reminder: "before",
  },
  {
    id: "afterSession",
    title: "Po seji",
    description: "Povzetek pošlje po koncu seje.",
    icon: "check",
    reminder: "after",
  },
];

const reminderBeforeOptions = [
  "15 min pred terminom",
  "30 min pred terminom",
  "1 ura pred terminom",
  "2 uri pred terminom",
  "24 ur pred terminom",
];
const reminderAfterOptions = [
  "Takoj po seji",
  "30 min po seji",
  "1 ura po seji",
  "2 uri po seji",
  "24 ur po seji",
];

function notificationEnabledKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${id.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}_ENABLED`;
}

function notificationReminderKey(
  channel: NotificationChannel,
  reminder: "before" | "after",
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${reminder.toUpperCase()}_REMINDER_TIME`;
}

function getNotificationEnabled(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return settings[notificationEnabledKey(channel, id)] !== "false";
}

function getReminderValue(
  settings: Record<string, string>,
  channel: NotificationChannel,
  reminder: "before" | "after",
) {
  const fallback =
    reminder === "before" ? "24 ur pred terminom" : "2 uri po seji";
  return settings[notificationReminderKey(channel, reminder)] || fallback;
}

function notificationEventSettingName(id: NotificationEventKind) {
  return id.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase();
}

function notificationTemplateTitleKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_TEMPLATE_TITLE`;
}

function notificationTemplateBodyKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_TEMPLATE_BODY`;
}

type NotificationTemplateDefaults = Record<
  NotificationEventKind,
  { title: string; body: string }
>;

const emailTemplateDefaults: NotificationTemplateDefaults = {
  newSession: {
    title: "Potrditev rezervacije",
    body: "Pozdravljeni {{ime_stranke}},\n\nvaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.\n\nVeselimo se srečanja z vami.\n{{ime_podjetja}}",
  },
  sessionChanged: {
    title: "Sprememba rezervacije",
    body: "Pozdravljeni {{ime_stranke}},\n\npodrobnosti vaše rezervacije so bile spremenjene. Nov termin je {{datum}} ob {{cas}}.\n\n{{ime_podjetja}}",
  },
  sessionCancelled: {
    title: "Preklic rezervacije",
    body: "Pozdravljeni {{ime_stranke}},\n\nvaša rezervacija za {{ime_storitve}} je bila preklicana.\n\n{{ime_podjetja}}",
  },
  beforeSession: {
    title: "Opomnik pred terminom",
    body: "Pozdravljeni {{ime_stranke}},\n\nspomnimo vas na termin {{ime_storitve}} dne {{datum}} ob {{cas}}.\n\nSe vidimo kmalu.\n{{ime_podjetja}}",
  },
  afterSession: {
    title: "Hvala za obisk",
    body: "Pozdravljeni {{ime_stranke}},\n\nhvala za obisk. Veseli bomo vaših povratnih informacij.\n\n{{ime_podjetja}}",
  },
};

const smsTemplateDefaults: NotificationTemplateDefaults = {
  newSession: {
    title: "Nova seja",
    body: "Pozdravljeni {{ime_stranke}}, vaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.",
  },
  sessionChanged: {
    title: "Sprememba seje",
    body: "Pozdravljeni {{ime_stranke}}, vaš termin je bil spremenjen na {{datum}} ob {{cas}}.",
  },
  sessionCancelled: {
    title: "Preklic seje",
    body: "Pozdravljeni {{ime_stranke}}, vaša rezervacija za {{ime_storitve}} je bila preklicana.",
  },
  beforeSession: {
    title: "Opomnik pred sejo",
    body: "Pozdravljeni {{ime_stranke}}, opomnik na termin {{ime_storitve}} dne {{datum}} ob {{cas}}.",
  },
  afterSession: {
    title: "Po seji",
    body: "Hvala za obisk, {{ime_stranke}}. Veselimo se vaših povratnih informacij.",
  },
};

const guestAppTemplateDefaults: NotificationTemplateDefaults = {
  newSession: {
    title: "Nova seja",
    body: "Vaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.",
  },
  sessionChanged: {
    title: "Sprememba seje",
    body: "Podrobnosti vaše seje so bile spremenjene. Nov termin je {{datum}} ob {{cas}}.",
  },
  sessionCancelled: {
    title: "Preklic seje",
    body: "Vaša rezervacija za {{ime_storitve}} je bila preklicana.",
  },
  beforeSession: {
    title: "Opomnik pred sejo",
    body: "Opomnik: vaš termin {{ime_storitve}} je dne {{datum}} ob {{cas}}.",
  },
  afterSession: {
    title: "Po seji",
    body: "Hvala za obisk. Veseli bomo vaših povratnih informacij.",
  },
};

const notificationTemplateDefaults: Record<
  NotificationChannel,
  NotificationTemplateDefaults
> = {
  email: emailTemplateDefaults,
  sms: smsTemplateDefaults,
  guestApp: guestAppTemplateDefaults,
};

export const NOTIFICATION_SETTINGS_KEY = "NOTIFICATION_SETTINGS_JSON";

const notificationChannels = ["email", "sms", "guestApp"] as const;

function notificationChannelSettingName(channel: NotificationChannel) {
  return channel === "guestApp" ? "GUEST_APP" : channel.toUpperCase();
}

function isNotificationChannelAvailable(
  settings: Record<string, string>,
  channel: NotificationChannel,
) {
  if (settings.NOTIFICATIONS_ENABLED === "false") return false;
  if (channel === "email") {
    return settings.NOTIFICATIONS_EMAIL_ALERTS_ENABLED !== "false";
  }
  if (channel === "sms") {
    return settings.NOTIFICATIONS_SMS_ALERTS_ENABLED === "true";
  }
  return settings.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED !== "false";
}

export function applyNotificationModuleAvailability(
  settings: Record<string, string>,
): Record<string, string> {
  const next = { ...settings };
  if (next.NOTIFICATIONS_ENABLED === "false") {
    next.NOTIFICATIONS_EMAIL_ALERTS_ENABLED = "false";
    next.NOTIFICATIONS_SMS_ALERTS_ENABLED = "false";
    next.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED = "false";
  }

  notificationChannels.forEach((channel) => {
    if (!isNotificationChannelAvailable(next, channel)) {
      notificationEvents.forEach((event) => {
        next[notificationEnabledKey(channel, event.id)] = "false";
      });
    }
  });

  return next;
}

function notificationJsonEventKey(id: NotificationEventKind) {
  switch (id) {
    case "sessionChanged":
      return "changeSession";
    case "sessionCancelled":
      return "cancelSession";
    default:
      return id;
  }
}

function parseNotificationOffset(value: string, reminder: "before" | "after") {
  const normalized = String(value || "").toLowerCase();
  if (reminder === "after" && (normalized.includes("takoj") || normalized.includes("immediate"))) {
    return { offsetValue: 1, offsetUnit: "minutes" };
  }
  if (normalized.includes("15")) return { offsetValue: 15, offsetUnit: "minutes" };
  if (normalized.includes("30")) return { offsetValue: 30, offsetUnit: "minutes" };
  if (normalized.includes("24") || normalized.includes("day") || normalized.includes("dan")) {
    return { offsetValue: 24, offsetUnit: "hours" };
  }
  if (normalized.includes("2")) return { offsetValue: 2, offsetUnit: "hours" };
  return { offsetValue: 1, offsetUnit: "hours" };
}

function offsetToReminderValue(
  offsetValue: unknown,
  offsetUnit: unknown,
  reminder: "before" | "after",
) {
  const value = Number(offsetValue);
  const unit = String(offsetUnit || "hours").toLowerCase();
  const minutes =
    unit.startsWith("day")
      ? value * 24 * 60
      : unit.startsWith("minute")
        ? value
        : value * 60;

  if (reminder === "after") {
    if (!Number.isFinite(minutes) || minutes <= 1) return "Takoj po seji";
    if (minutes <= 30) return "30 min po seji";
    if (minutes <= 60) return "1 ura po seji";
    if (minutes <= 120) return "2 uri po seji";
    return "24 ur po seji";
  }

  if (!Number.isFinite(minutes) || minutes <= 15) return "15 min pred terminom";
  if (minutes <= 30) return "30 min pred terminom";
  if (minutes <= 60) return "1 ura pred terminom";
  if (minutes <= 120) return "2 uri pred terminom";
  return "24 ur pred terminom";
}

export function buildNotificationSettingsJson(settings: Record<string, string>) {
  const normalizedSettings = applyNotificationModuleAvailability(settings);
  const root: Record<string, Record<string, Record<string, unknown>>> = {};

  notificationChannels.forEach((channel) => {
    root[channel] = {};
    notificationEvents.forEach((event) => {
      const title = getNotificationTemplateTitle(normalizedSettings, channel, event.id);
      const body = getNotificationTemplateBody(normalizedSettings, channel, event.id);
      const channelEnabled = isNotificationChannelAvailable(
        normalizedSettings,
        channel,
      );
      const node: Record<string, unknown> = {
        enabled:
          channelEnabled &&
          getNotificationEnabled(normalizedSettings, channel, event.id),
      };

      if (channel === "email") {
        node.subject = title;
        node.bodyHtml = body;
      } else if (channel === "sms") {
        node.title = title;
        node.body = body;
      } else {
        node.title = title;
        node.body = body;
      }

      if (event.reminder) {
        Object.assign(
          node,
          parseNotificationOffset(
            getReminderValue(normalizedSettings, channel, event.reminder),
            event.reminder,
          ),
        );
      }

      root[channel][notificationJsonEventKey(event.id)] = node;
    });
  });

  return JSON.stringify(root);
}

export function mergeNotificationSettingsJsonIntoFlat(settings: Record<string, string>): Record<string, string> {
  const raw = settings[NOTIFICATION_SETTINGS_KEY];
  if (!raw) return settings;

  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, Record<string, unknown>>>;
    const next = { ...settings };

    notificationChannels.forEach((channel) => {
      notificationEvents.forEach((event) => {
        const node = parsed?.[channel]?.[notificationJsonEventKey(event.id)];
        if (!node || typeof node !== "object") return;

        if (typeof node.enabled === "boolean") {
          next[notificationEnabledKey(channel, event.id)] = node.enabled
            ? "true"
            : "false";
        }

        const title = String(
          channel === "email" ? node.subject || node.title || "" : node.title || "",
        );
        const body = String(
          channel === "email" ? node.bodyHtml || node.body || "" : node.body || "",
        );
        if (title) next[notificationTemplateTitleKey(channel, event.id)] = title;
        if (body) next[notificationTemplateBodyKey(channel, event.id)] = body;

        if (event.reminder) {
          next[notificationReminderKey(channel, event.reminder)] =
            offsetToReminderValue(node.offsetValue, node.offsetUnit, event.reminder);
        }
      });
    });

    return next;
  } catch {
    return settings;
  }
}

const notificationTemplateTags = [
  { label: "Ime podjetja", token: "{{ime_podjetja}}" },
  { label: "Ime stranke", token: "{{ime_stranke}}" },
  { label: "Priimek stranke", token: "{{priimek_stranke}}" },
  { label: "Ime storitve", token: "{{ime_storitve}}" },
  { label: "Datum", token: "{{datum}}" },
  { label: "Čas", token: "{{cas}}" },
  { label: "Naslov lokacije", token: "{{naslov_lokacije}}" },
  { label: "Ime lokacije", token: "{{ime_lokacije}}" },
  { label: "Telefonska številka lokacije", token: "{{telefon_lokacije}}" },
  { label: "Povezava za prenaročanje", token: "{{povezava_za_prenarocanje}}" },
  { label: "Kategorija storitve", token: "{{kategorija_storitve}}" },
  { label: "Ime izvajalca", token: "{{ime_izvajalca}}" },
  { label: "Telefonska številka izvajalca", token: "{{telefon_izvajalca}}" },
  { label: "Datum in čas prvotnega termina", token: "{{prvotni_termin}}" },
];

function getNotificationTemplateTitle(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return (
    settings[notificationTemplateTitleKey(channel, id)] ||
    notificationTemplateDefaults[channel][id].title
  );
}

function getNotificationTemplateBody(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return (
    settings[notificationTemplateBodyKey(channel, id)] ||
    notificationTemplateDefaults[channel][id].body
  );
}

function NotificationInfoIcon({
  kind,
}: {
  kind: Exclude<NotificationChannel, "email">;
}) {
  if (kind === "guestApp") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
        <path d="M10 6h4" />
      </svg>
    );
  }

  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function NotificationEventIcon({
  icon,
}: {
  icon: NotificationEventDefinition["icon"];
}) {
  if (icon === "calendar") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M12 14v5M9.5 16.5h5" />
      </svg>
    );
  }
  if (icon === "edit") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }
  if (icon === "x") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m15 9-6 6M9 9l6 6" />
      </svg>
    );
  }
  if (icon === "bell") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    );
  }
  if (icon === "message") {
    return (
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
    );
  }
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

function NotificationChevronIcon({ expanded = false }: { expanded?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={expanded ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function NotificationSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={checked ? "notif-switch is-on" : "notif-switch"}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function NotificationToolbarIcon({
  kind,
}: {
  kind:
    | "bold"
    | "italic"
    | "underline"
    | "link"
    | "bullets"
    | "numbers"
    | "quote"
    | "preview";
}) {
  if (kind === "bold") return <span aria-hidden>B</span>;
  if (kind === "italic") return <em aria-hidden>I</em>;
  if (kind === "underline")
    return (
      <span style={{ textDecoration: "underline" }} aria-hidden>
        U
      </span>
    );
  if (kind === "link") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
      </svg>
    );
  }
  if (kind === "bullets") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    );
  }
  if (kind === "numbers") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10 6h11M10 12h11M10 18h11" />
        <path d="M4 6h1v4M4 10h2M4 14h2l-2 4h2" />
      </svg>
    );
  }
  if (kind === "quote") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 21c3 0 7-1 7-8V5H3v8h4c0 4-2 6-4 8Z" />
        <path d="M14 21c3 0 7-1 7-8V5h-7v8h4c0 4-2 6-4 8Z" />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const keepTemplateSelectionOnToolbarMouseDown = (
  event: React.MouseEvent<HTMLButtonElement | HTMLSelectElement>,
) => {
  event.preventDefault();
};

export function ConfigurationNotificationsSection({
  settings,
  setSettings,
  savingSettings,
  onSave,
  t,
}: ConfigurationNotificationsSectionProps) {
  const [channel, setChannel] = useState<NotificationChannel>("email");
  const [editingEvent, setEditingEvent] =
    useState<NotificationEventKind | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState(false);
  const templateBodyRef = useRef<HTMLDivElement | null>(null);

  const channelCopy: Record<
    NotificationChannel,
    { title: string; subtitle: string; editLabel: string }
  > = {
    email: {
      title: "Sprožilci e-pošte",
      subtitle:
        "E-poštna sporočila se pošiljajo samodejno na podlagi dogodkov.",
      editLabel: "Uredi predlogo",
    },
    sms: {
      title: "Sprožilci SMS",
      subtitle:
        "Besedilna sporočila se samodejno pošiljajo za ključne dogodke.",
      editLabel: "Uredi besedilo",
    },
    guestApp: {
      title: "Sporočilni dogodki",
      subtitle: "Izberite, kdaj naj bo obvestilo poslano v Guest aplikaciji.",
      editLabel: "Uredi vsebino",
    },
  };

  const channelAvailability: Record<NotificationChannel, boolean> = {
    email: isNotificationChannelAvailable(settings, "email"),
    sms: isNotificationChannelAvailable(settings, "sms"),
    guestApp: isNotificationChannelAvailable(settings, "guestApp"),
  };
  const availableChannels = (["email", "sms", "guestApp"] as const).filter(
    (id) => channelAvailability[id],
  );

  useEffect(() => {
    if (availableChannels.length === 0) return;
    if (!channelAvailability[channel]) {
      setChannel(availableChannels[0]);
    }
  }, [channelAvailability, availableChannels, channel]);

  useEffect(() => {
    setEditingEvent(null);
    setPreviewTemplate(false);
  }, [channel]);

  useEffect(() => {
    setPreviewTemplate(false);
  }, [editingEvent]);

  const selectedEvent = editingEvent
    ? notificationEvents.find((event) => event.id === editingEvent) || null
    : null;
  const selectedTemplateBody = selectedEvent
    ? getNotificationTemplateBody(settings, channel, selectedEvent.id)
    : "";

  useEffect(() => {
    if (!selectedEvent) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditingEvent(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) return;
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 640px)").matches
    )
      return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedEvent]);

  const setNotificationEnabled = (
    id: NotificationEventKind,
    checked: boolean,
  ) => {
    const key = notificationEnabledKey(channel, id);
    setSettings((prev) => ({ ...prev, [key]: checked ? "true" : "false" }));
  };

  const setReminderValue = (reminder: "before" | "after", value: string) => {
    const key = notificationReminderKey(channel, reminder);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const setTemplateTitle = (id: NotificationEventKind, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [notificationTemplateTitleKey(channel, id)]: value,
    }));
  };

  const setTemplateBody = (id: NotificationEventKind, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [notificationTemplateBodyKey(channel, id)]: value,
    }));
  };

  const templateBodyToEditorHtml = (raw: string) => {
    const value = String(raw || "");
    if (/<[a-z][\s\S]*>/i.test(value)) return value;
    return escapeHtml(value).replace(/\n/g, "<br>");
  };

  const syncTemplateBodyFromEditor = (id: NotificationEventKind) => {
    const element = templateBodyRef.current;
    if (!element) return;
    setTemplateBody(id, element.innerHTML);
  };

  const execTemplateCommand = (
    id: NotificationEventKind,
    command: string,
    value?: string,
  ) => {
    const element = templateBodyRef.current;
    if (!element) return;
    element.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // ignore browser execCommand failures
    }
    syncTemplateBodyFromEditor(id);
  };

  const applyTemplateBlockStyle = (
    id: NotificationEventKind,
    style: string,
  ) => {
    if (style === "normal") execTemplateCommand(id, "formatBlock", "p");
    else if (style === "heading") execTemplateCommand(id, "formatBlock", "h2");
    else if (style === "subheading")
      execTemplateCommand(id, "formatBlock", "h3");
    else if (style === "small") execTemplateCommand(id, "formatBlock", "small");
  };

  const insertTemplateLink = (id: NotificationEventKind) => {
    const url = window.prompt("URL", "https://");
    if (!url) return;
    execTemplateCommand(id, "createLink", url);
  };

  const appendTemplateToken = (id: NotificationEventKind, token: string) => {
    execTemplateCommand(id, "insertText", token);
  };

  const getTemplatePreviewText = (body: string) => {
    const replacements: Record<string, string> = {
      "{{ime_podjetja}}": "2TEN",
      "{{ime_stranke}}": "Maja",
      "{{priimek_stranke}}": "Novak",
      "{{ime_storitve}}": "Individualni trening",
      "{{datum}}": "12. junij 2026",
      "{{cas}}": "09:30",
      "{{naslov_lokacije}}": "Dunajska cesta 10",
      "{{ime_lokacije}}": "Studio Center",
      "{{telefon_lokacije}}": "+386 40 123 456",
      "{{povezava_za_prenarocanje}}": "https://2ten.si/book/2TEN",
      "{{kategorija_storitve}}": "Fitnes",
      "{{ime_izvajalca}}": "Ana",
      "{{telefon_izvajalca}}": "+386 41 555 111",
      "{{prvotni_termin}}": "10. junij 2026 ob 10:00",
    };
    const plain = body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|blockquote|li)>/gi, "\n")
      .replace(/<li>/gi, "• ")
      .replace(/<[^>]+>/g, "");
    return Object.entries(replacements).reduce(
      (text, [token, value]) => text.split(token).join(value),
      plain,
    );
  };

  useEffect(() => {
    if (!selectedEvent || previewTemplate) return;
    const element = templateBodyRef.current;
    if (!element) return;
    if (document.activeElement === element) return;
    const nextHtml = templateBodyToEditorHtml(selectedTemplateBody);
    if (element.innerHTML !== nextHtml) {
      element.innerHTML = nextHtml;
    }
  }, [selectedEvent, previewTemplate, selectedTemplateBody]);

  return (
    <section className="notif-page-shell">
      <style>{`
        .notif-page-shell {
          --notif-blue: #0f62fe;
          --notif-blue-dark: #0b4bd3;
          --notif-ink: #07173b;
          --notif-muted: #64708b;
          --notif-line: #dce3ef;
          --notif-soft: #f5f8ff;
          width: min(100%, 1540px);
        }
        .notif-page-title {
          margin: 0 0 22px;
          font-size: clamp(30px, 3vw, 38px);
          line-height: 1.1;
          color: var(--notif-ink);
          letter-spacing: -0.04em;
          font-weight: 800;
        }
        .notif-tabs {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 20px 0 10px;
          border-bottom: 1px solid #edf2f7;
        }
        .notif-tab {
          position: relative;
          appearance: none;
          border: 0;
          background: transparent;
          color: #334155;
          font-weight: 700;
          font-size: 15px;
          padding: 10px 14px;
          cursor: pointer;
          border-radius: 10px;
          box-shadow: none;
          outline: none;
          transition: color .18s ease, background .18s ease, box-shadow .18s ease;
        }
        .notif-tab:hover {
          color: #0f172a;
          background: #f8fafc;
        }
        .notif-tab.is-active {
          color: var(--notif-blue);
          background: #eaf2ff;
          box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16), 0 3px 10px rgba(37, 99, 235, 0.18);
        }
        .notif-card {
          position: relative;
          padding: clamp(24px, 3vw, 38px);
          border: 1px solid var(--notif-line);
          border-radius: 24px;
          background: rgba(255,255,255,0.96);
          box-shadow: 0 22px 50px rgba(13, 32, 67, 0.10);
          overflow: hidden;
        }
        .notif-card::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 14% 0%, rgba(34, 112, 255, 0.06), transparent 30%),
            radial-gradient(circle at 84% 100%, rgba(34, 112, 255, 0.05), transparent 28%);
        }
        .notif-card-content {
          position: relative;
        }
        .notif-mobile-channel-note {
          display: none;
        }
        .notif-layout {
          display: grid;
          gap: 28px;
        }
        .notif-layout.has-editor {
          grid-template-columns: minmax(0, 0.96fr) minmax(390px, 0.82fr);
          align-items: start;
        }
        .notif-section-heading {
          margin-bottom: 24px;
        }
        .notif-section-heading h3 {
          margin: 0 0 8px;
          color: var(--notif-ink);
          font-size: 22px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .notif-section-heading p {
          margin: 0;
          color: var(--notif-muted);
          font-size: 15px;
        }
        .notif-event-list {
          display: grid;
          gap: 13px;
        }
        .notif-event-row {
          display: grid;
          grid-template-columns: 52px minmax(220px, 1fr) minmax(218px, 0.34fr) 52px auto;
          align-items: center;
          gap: 18px;
          min-height: 88px;
          padding: 16px 22px 16px 16px;
          border: 1px solid var(--notif-line);
          border-radius: 16px;
          background: rgba(255,255,255,0.92);
          box-shadow: 0 8px 20px rgba(8, 23, 58, 0.035);
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .notif-layout.has-editor .notif-event-row {
          grid-template-columns: 52px minmax(170px, 1fr) minmax(190px, 0.34fr) 52px auto;
          gap: 14px;
        }
        .notif-event-row.is-editing {
          border-color: rgba(15, 98, 254, 0.46);
          box-shadow: 0 10px 24px rgba(15, 98, 254, 0.10);
        }
        .notif-event-icon {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          border-radius: 13px;
          color: var(--notif-blue);
          background: linear-gradient(180deg, #eef4ff 0%, #e7efff 100%);
        }
        .notif-event-copy strong {
          display: block;
          margin-bottom: 5px;
          color: var(--notif-ink);
          font-size: 16px;
          font-weight: 800;
        }
        .notif-event-copy span {
          display: block;
          color: var(--notif-muted);
          font-size: 14px;
          line-height: 1.35;
        }
        .notif-switch {
          position: relative;
          width: 52px;
          height: 30px;
          padding: 0;
          border: 1px solid #cfd8e7;
          border-radius: 999px;
          background: #e8edf6;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-switch span {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 2px 7px rgba(3, 17, 44, 0.24);
          transition: transform 160ms ease;
        }
        .notif-switch.is-on {
          border-color: var(--notif-blue);
          background: linear-gradient(180deg, #1b73ff 0%, #0f62fe 100%);
          box-shadow: 0 6px 14px rgba(15, 98, 254, 0.18);
        }
        .notif-switch.is-on span {
          transform: translateX(22px);
        }
        .notif-row-action {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 0;
          background: transparent;
          color: var(--notif-ink);
          font-size: 14px;
          font-weight: 800;
          white-space: nowrap;
          cursor: pointer;
        }
        .notif-row-action-icon {
          display: inline-grid;
          place-items: center;
          width: 19px;
          height: 19px;
          flex: 0 0 auto;
          transition: transform 160ms ease;
        }
        .notif-row-action:hover,
        .notif-row-action.is-active {
          color: var(--notif-blue);
        }
        .notif-row-action.is-active .notif-row-action-icon {
          transform: rotate(180deg);
        }
        .notif-row-chevron {
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          color: #0b1c45;
          cursor: pointer;
          padding: 4px;
        }
        .notif-row-chevron.is-active {
          color: var(--notif-blue);
        }
        .notif-reminder-select-wrap,
        .notif-reminder-placeholder {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .notif-reminder-select-wrap label {
          color: var(--notif-muted);
          font-size: 12px;
          font-weight: 800;
        }
        .notif-reminder-placeholder {
          min-height: 44px;
          visibility: hidden;
        }
        .notif-reminder-select {
          min-height: 44px;
          width: 100%;
          border: 1px solid #cfd8e7;
          border-radius: 11px;
          background: #fff;
          color: var(--notif-ink);
          padding: 0 40px 0 14px;
          font-size: 14px;
          font-weight: 700;
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #0b1c45 50%), linear-gradient(135deg, #0b1c45 50%, transparent 50%);
          background-position: calc(100% - 18px) 19px, calc(100% - 12px) 19px;
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
        }
        .notif-template-panel {
          min-height: 100%;
          padding-left: 30px;
          border-left: 1px solid var(--notif-line);
        }
        .notif-template-card {
          padding: 28px;
          border: 1px solid rgba(220, 227, 239, 0.96);
          border-radius: 20px;
          background: rgba(255,255,255,0.94);
          box-shadow: 0 18px 38px rgba(8, 23, 58, 0.06);
        }
        .notif-template-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 6px;
        }
        .notif-template-header h4 {
          margin: 0;
          color: var(--notif-ink);
          font-size: 22px;
          line-height: 1.18;
          font-weight: 850;
          letter-spacing: -0.035em;
        }
        .notif-template-subtitle {
          margin: 0 0 24px;
          color: var(--notif-muted);
          font-size: 14px;
          line-height: 1.45;
        }
        .notif-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 30px;
          padding: 0 14px;
          border-radius: 999px;
          background: #e8f8ef;
          color: #087443;
          font-size: 12px;
          font-weight: 850;
          white-space: nowrap;
        }
        .notif-status-pill::before {
          content: '';
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: currentColor;
          box-shadow: 0 0 0 3px rgba(8, 116, 67, 0.10);
        }
        .notif-status-pill.is-off {
          background: #f3f4f6;
          color: #5b6475;
        }
        .notif-template-tags {
          margin: 0 0 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e6edf6;
          color: var(--notif-ink);
          font-size: 13px;
          font-weight: 850;
          line-height: 1.4;
        }
        .notif-template-tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .notif-template-tag {
          border: 1px solid rgba(18, 148, 74, 0.18);
          border-radius: 999px;
          background: #eaf8f0;
          color: #098342;
          padding: 6px 11px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 5px 12px rgba(21, 148, 71, 0.06);
          transition: transform 150ms ease, background 150ms ease, border-color 150ms ease;
        }
        .notif-template-tag:hover {
          background: #ddf3e7;
          border-color: rgba(18, 148, 74, 0.32);
          transform: translateY(-1px);
        }
        .notif-template-field {
          display: grid;
          gap: 9px;
          margin-top: 16px;
        }
        .notif-template-field label {
          color: var(--notif-ink);
          font-size: 13px;
          font-weight: 850;
        }
        .notif-template-input,
        .notif-template-textarea {
          width: 100%;
          border: 1px solid #cfd8e7;
          border-radius: 12px;
          background: #fff;
          color: var(--notif-ink);
          font-size: 14px;
          line-height: 1.5;
          padding: 12px 14px;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-template-input:focus,
        .notif-template-textarea:focus,
        .notif-reminder-select:focus {
          border-color: rgba(15, 98, 254, 0.62);
          box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
        }
        .notif-template-editor {
          overflow: hidden;
          border: 1px solid #cfd8e7;
          border-radius: 13px;
          background: #fff;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-template-editor:focus-within {
          border-color: rgba(15, 98, 254, 0.62);
          box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
        }
        .notif-template-toolbar {
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 46px;
          padding: 7px 9px;
          border-bottom: 1px solid #e6edf6;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }
        .notif-template-format,
        .notif-template-toolbar-button,
        .notif-template-preview-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #23345d;
          font-size: 13px;
          font-weight: 800;
          height: 32px;
          padding: 0 10px;
          cursor: pointer;
          transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
        }
        .notif-template-format {
          min-width: 126px;
          justify-content: space-between;
          border: 1px solid #e1e8f3;
          background: #f4f7fb;
          color: #243655;
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #475569 50%), linear-gradient(135deg, #475569 50%, transparent 50%);
          background-position: calc(100% - 16px) 14px, calc(100% - 11px) 14px;
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
          padding-right: 28px;
        }
        .notif-template-toolbar-button {
          min-width: 32px;
          padding: 0 8px;
        }
        .notif-template-toolbar-button:hover,
        .notif-template-toolbar-button.is-active,
        .notif-template-preview-button:hover,
        .notif-template-preview-button.is-active {
          background: #eef4ff;
          color: var(--notif-blue);
          box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.10);
        }
        .notif-template-toolbar-divider {
          width: 1px;
          align-self: stretch;
          margin: 4px 3px;
          background: #e6edf6;
        }
        .notif-template-toolbar-spacer {
          flex: 1 1 auto;
        }
        .notif-template-preview-button {
          gap: 7px;
          background: #eef4ff;
          color: var(--notif-blue);
          padding: 0 10px;
        }
        .notif-template-textarea {
          min-height: 220px;
          resize: vertical;
          border: 0;
          border-radius: 0;
          box-shadow: none !important;
        }
        .notif-template-preview-pane {
          min-height: 220px;
          padding: 16px 16px 18px;
          color: var(--notif-ink);
          font-size: 14px;
          line-height: 1.62;
          white-space: pre-wrap;
          background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
        }
        .notif-template-preview-empty {
          color: var(--notif-muted);
          font-style: italic;
        }
        .notif-template-close {
          display: none;
          border: 0;
          background: transparent;
          color: #07173b;
          cursor: pointer;
        }
        .notif-savebar {
          display: flex;
          justify-content: flex-end;
          margin-top: 28px;
        }
        .notif-save-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-width: 220px;
          min-height: 48px;
          border: 0;
          border-radius: 12px;
          background: linear-gradient(180deg, #1c78ff 0%, #0f62fe 100%);
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 12px 22px rgba(15, 98, 254, 0.25);
        }
        .notif-save-button:disabled {
          opacity: 0.72;
          cursor: progress;
        }
        @media (max-width: 1180px) {
          .notif-layout.has-editor {
            grid-template-columns: 1fr;
          }
          .notif-template-panel {
            padding-left: 0;
            padding-top: 24px;
            border-left: 0;
            border-top: 1px solid var(--notif-line);
          }
        }
        @media (max-width: 980px) {
          .notif-page-shell { width: 100%; }
          .notif-tabs { display: flex; width: 100%; overflow-x: auto; }
          .notif-tab { flex: 0 0 auto; }
          .notif-event-row,
          .notif-layout.has-editor .notif-event-row {
            grid-template-columns: 48px minmax(0, 1fr) auto;
            gap: 14px;
          }
          .notif-row-action {
            display: inline-flex;
          }
          .notif-reminder-select-wrap,
          .notif-reminder-placeholder {
            grid-column: 2 / -1;
            grid-row: auto;
          }
        }
        @media (max-width: 640px) {
          .notif-page-shell {
            width: 100%;
          }
          .notif-card {
            padding: 0 12px 18px;
            border: 0;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
            overflow: visible;
          }
          .notif-card::before {
            display: none;
          }
          .notif-card-content {
            display: grid;
            gap: 14px;
          }
          .notif-tabs {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0;
            width: 100%;
            margin: 0;
            overflow: visible;
            border-bottom: 1px solid #dbe5f3;
          }
          .notif-tab {
            min-width: 0;
            padding: 13px 4px 14px;
            border-radius: 0;
            color: #07173b;
            font-size: 13px;
            line-height: 1.15;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            background: transparent;
          }
          .notif-tab:hover {
            background: transparent;
          }
          .notif-tab::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            bottom: -1px;
            height: 2px;
            border-radius: 999px 999px 0 0;
            background: transparent;
            transform: scaleX(0.3);
            opacity: 0;
            transition: transform 160ms ease, opacity 160ms ease, background 160ms ease;
          }
          .notif-tab.is-active {
            color: var(--notif-blue);
            background: transparent;
            box-shadow: none;
          }
          .notif-tab.is-active::after {
            background: var(--notif-blue);
            transform: scaleX(1);
            opacity: 1;
          }
          .notif-mobile-channel-note {
            display: flex;
            align-items: center;
            gap: 14px;
            margin: 10px 0 2px;
            padding: 16px 14px;
            border: 1px solid rgba(226, 234, 246, 0.95);
            border-radius: 13px;
            background: linear-gradient(135deg, #f6f9ff 0%, #eef4ff 100%);
            color: #596886;
            font-size: 13px;
            line-height: 1.35;
            font-weight: 600;
            box-shadow: 0 8px 18px rgba(8, 23, 58, 0.04);
          }
          .notif-mobile-channel-note-icon {
            display: grid;
            place-items: center;
            flex: 0 0 auto;
            width: 38px;
            height: 38px;
            border-radius: 12px;
            color: var(--notif-blue);
            background: rgba(255, 255, 255, 0.78);
          }
          .notif-layout,
          .notif-layout.has-editor {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .notif-event-list {
            gap: 14px;
          }
          .notif-event-row,
          .notif-layout.has-editor .notif-event-row {
            display: grid;
            grid-template-columns: 48px minmax(0, 1fr) auto;
            grid-template-areas:
              'icon copy switch'
              'reminder reminder reminder'
              'action action action';
            align-items: center;
            gap: 0 14px;
            min-height: 0;
            padding: 14px 14px 0;
            border: 1px solid #dfe7f3;
            border-radius: 13px;
            background: rgba(255, 255, 255, 0.98);
            box-shadow: 0 8px 20px rgba(8, 23, 58, 0.045);
            overflow: hidden;
          }
          .notif-event-row.is-editing {
            border-color: rgba(15, 98, 254, 0.42);
            box-shadow: 0 10px 24px rgba(15, 98, 254, 0.10);
          }
          .notif-event-icon {
            grid-area: icon;
            align-self: start;
            width: 44px;
            height: 44px;
            border-radius: 12px;
          }
          .notif-event-icon svg {
            width: 22px;
            height: 22px;
          }
          .notif-event-copy {
            grid-area: copy;
            min-width: 0;
            padding: 2px 0 14px;
          }
          .notif-event-copy strong {
            margin-bottom: 4px;
            font-size: 15px;
            line-height: 1.22;
            letter-spacing: -0.01em;
          }
          .notif-event-copy span {
            font-size: 13px;
            line-height: 1.28;
          }
          .notif-switch {
            grid-area: switch;
            align-self: center;
            width: 48px;
            height: 28px;
          }
          .notif-switch span {
            top: 3px;
            left: 3px;
            width: 20px;
            height: 20px;
          }
          .notif-switch.is-on span {
            transform: translateX(20px);
          }
          .notif-reminder-placeholder {
            display: none;
          }
          .notif-reminder-select-wrap {
            grid-area: reminder;
            display: block;
            margin: 0 -14px;
            padding: 0 14px;
            border-top: 1px solid #e8eef7;
          }
          .notif-reminder-select-wrap label {
            display: none;
          }
          .notif-reminder-select {
            min-height: 42px;
            border: 0;
            border-radius: 0;
            background-color: transparent;
            padding: 0 34px 0 0;
            color: #07173b;
            font-size: 13px;
            font-weight: 800;
            box-shadow: none !important;
            background-position: calc(100% - 14px) 18px, calc(100% - 9px) 18px;
            background-size: 5px 5px, 5px 5px;
          }
          .notif-row-action {
            grid-area: action;
            display: flex !important;
            align-items: center;
            min-height: 42px;
            margin: 0 -14px;
            padding: 0 14px;
            border-top: 1px solid #e8eef7;
            color: var(--notif-blue);
            font-size: 13px;
            font-weight: 850;
            text-align: left;
          }
          .notif-row-action-icon svg {
            width: 19px;
            height: 19px;
          }
          .notif-row-chevron {
            grid-area: chevron;
            align-self: stretch;
            display: grid;
            place-items: center;
            min-height: 42px;
            margin: 0 -14px 0 0;
            padding: 0 14px 0 6px;
            border-top: 1px solid #e8eef7;
            color: #07173b;
          }
          .notif-row-chevron svg {
            width: 19px;
            height: 19px;
          }
          .notif-template-panel {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: block;
            width: 100vw;
            height: 100vh;
            height: 100dvh;
            padding: 0;
            border: 0;
            background: #fff;
            overflow: hidden;
            overscroll-behavior: contain;
          }
          .notif-template-card {
            width: 100vw;
            max-width: 100vw;
            min-height: 100vh;
            min-height: 100dvh;
            max-height: none;
            overflow-y: auto;
            overflow-x: hidden;
            padding: max(18px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
            border: 0;
            border-radius: 0;
            background: #fff;
            box-shadow: none;
            animation: notif-template-fullscreen-in 160ms ease-out;
          }
          @keyframes notif-template-fullscreen-in {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .notif-template-header {
            position: sticky;
            top: 0;
            z-index: 2;
            align-items: flex-start;
            gap: 10px;
            margin: calc(-1 * max(18px, env(safe-area-inset-top))) -16px 12px;
            padding: max(18px, env(safe-area-inset-top)) 70px 14px 16px;
            border-bottom: 1px solid #edf2f8;
            background: rgba(255, 255, 255, 0.97);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }
          .notif-template-header h4 {
            font-size: 18px;
          }
          .notif-template-close {
            position: absolute;
            top: max(10px, env(safe-area-inset-top));
            right: 16px;
            display: grid;
            place-items: center;
            flex: 0 0 auto;
            width: 44px;
            height: 44px;
            margin: 0;
            border-radius: 999px;
            color: #07173b;
            background: #f2f6ff;
            box-shadow: 0 8px 18px rgba(8, 23, 58, 0.08);
          }
          .notif-template-close:active {
            transform: scale(0.98);
          }
          .notif-status-pill {
            display: none;
          }
          .notif-template-subtitle {
            display: none;
          }
          .notif-template-toolbar {
            gap: 3px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .notif-template-format {
            min-width: 116px;
          }
          .notif-template-preview-button {
            flex: 0 0 auto;
          }
          .notif-template-textarea,
          .notif-template-preview-pane {
            min-height: 190px;
          }
          .notif-template-tags {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: 0;
          }
          .notif-template-tag-list {
            flex-wrap: wrap;
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
            overflow-y: visible;
            padding-bottom: 0;
          }
          .notif-template-tag {
            flex: 0 1 auto;
            min-width: 0;
            max-width: 100%;
            white-space: normal;
            word-break: break-word;
            overflow-wrap: anywhere;
            font-size: 11px;
          }
          .notif-savebar {
            position: sticky;
            bottom: 0;
            z-index: 3;
            justify-content: stretch;
            margin: 10px -16px 0;
            padding: 12px 16px max(2px, env(safe-area-inset-bottom));
            background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.94) 28%, #fff 100%);
          }
          .notif-save-button {
            width: 100%;
            min-width: 0;
            min-height: 50px;
            border: 1px solid rgba(15, 98, 254, 0.12);
            border-radius: 11px;
            background: linear-gradient(180deg, #f7fbff 0%, #eef5ff 100%);
            color: var(--notif-blue);
            font-size: 14px;
            box-shadow: 0 6px 16px rgba(15, 98, 254, 0.08);
          }
        }
      `}</style>
      <div className="notif-card">
        <div className="notif-card-content">
          <div className="notif-tabs" role="tablist" aria-label="Obvestila">
            {(
              [
                ["email", "E-pošta"],
                ["sms", "SMS"],
                ["guestApp", "Aplikacija za goste"],
              ] as const
            )
              .filter(([id]) => channelAvailability[id])
              .map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={
                    channel === id ? "notif-tab is-active" : "notif-tab"
                  }
                  onClick={() => setChannel(id)}
                  role="tab"
                  aria-selected={channel === id}
                >
                  {label}
                </button>
              ))}
          </div>
          {availableChannels.length === 0 ? (
            <div className="notif-mobile-channel-note" role="note">
              <span>
                Vsi kanali obvestil so izklopljeni. Vklopite jih v Nastavitve →
                App nastavitve → Komunikacija.
              </span>
            </div>
          ) : channel !== "email" && channelAvailability[channel] ? (
            <div className="notif-mobile-channel-note" role="note">
              <span className="notif-mobile-channel-note-icon">
                <NotificationInfoIcon kind={channel} />
              </span>
              <span>
                {channel === "sms"
                  ? "SMS obvestila se pošiljajo na telefonsko številko gosta, ki jo imate shranjeno v rezervaciji."
                  : "Push obvestila bodo prikazana v aplikaciji za vaše goste."}
              </span>
            </div>
          ) : null}
          {availableChannels.length > 0 ? (
            <div
              className={
                selectedEvent ? "notif-layout has-editor" : "notif-layout"
              }
            >
              <div>
                <div className="notif-event-list">
                  {notificationEvents.map((event) => {
                    const checked = getNotificationEnabled(
                      settings,
                      channel,
                      event.id,
                    );
                    const reminderValue = event.reminder
                      ? getReminderValue(settings, channel, event.reminder)
                      : "";
                    const reminderOptions =
                      event.reminder === "after"
                        ? reminderAfterOptions
                        : reminderBeforeOptions;
                    const isEditing = selectedEvent?.id === event.id;
                    const openEditor = () =>
                      setEditingEvent((prev) =>
                        prev === event.id ? null : event.id,
                      );
                    return (
                      <div
                        className={
                          isEditing
                            ? "notif-event-row is-editing"
                            : "notif-event-row"
                        }
                        key={`${channel}-${event.id}`}
                      >
                        <span className="notif-event-icon">
                          <NotificationEventIcon icon={event.icon} />
                        </span>
                        <span className="notif-event-copy">
                          <strong>{event.title}</strong>
                          <span>{event.description}</span>
                        </span>
                        {event.reminder && checked ? (
                          <span className="notif-reminder-select-wrap">
                            <label>Privzeti čas opomnika</label>
                            <select
                              className="notif-reminder-select"
                              value={reminderValue}
                              onChange={(e) =>
                                setReminderValue(
                                  event.reminder!,
                                  e.target.value,
                                )
                              }
                            >
                              {reminderOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </span>
                        ) : (
                          <span
                            className="notif-reminder-placeholder"
                            aria-hidden
                          />
                        )}
                        <NotificationSwitch
                          checked={checked}
                          onChange={(next) =>
                            setNotificationEnabled(event.id, next)
                          }
                        />
                        <button
                          type="button"
                          className={
                            isEditing
                              ? "notif-row-action is-active"
                              : "notif-row-action"
                          }
                          aria-label={`${channelCopy[channel].editLabel}: ${event.title}`}
                          onClick={openEditor}
                        >
                          <span>{channelCopy[channel].editLabel}</span>
                          <span className="notif-row-action-icon" aria-hidden>
                            <NotificationChevronIcon expanded={isEditing} />
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedEvent ? (
                <aside
                  className="notif-template-panel"
                  aria-label={`${channelCopy[channel].editLabel}: ${selectedEvent.title}`}
                  onClick={(event) => {
                    if (event.currentTarget === event.target)
                      setEditingEvent(null);
                  }}
                >
                  <div
                    className="notif-template-card"
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="notif-template-header">
                      <h4>
                        {channelCopy[channel].editLabel}: {selectedEvent.title}
                      </h4>
                      <button
                        type="button"
                        className="notif-template-close"
                        aria-label="Zapri predlogo"
                        onClick={() => setEditingEvent(null)}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                      <span
                        className={
                          getNotificationEnabled(
                            settings,
                            channel,
                            selectedEvent.id,
                          )
                            ? "notif-status-pill"
                            : "notif-status-pill is-off"
                        }
                      >
                        {getNotificationEnabled(
                          settings,
                          channel,
                          selectedEvent.id,
                        )
                          ? "VKLOPLJENO"
                          : "IZKLOPLJENO"}
                      </span>
                    </div>
                    <p className="notif-template-subtitle">
                      {channel === "email"
                        ? "Uredite vsebino e-pošte, ki bo poslana gostu ob izbranem dogodku."
                        : channel === "sms"
                          ? "Uredite kratko SMS sporočilo, ki bo poslano gostu ob izbranem dogodku."
                          : "Uredite obvestilo, ki se prikaže gostu v aplikaciji."}
                    </p>
                    <div className="notif-template-field">
                      <label
                        htmlFor={`notif-template-title-${channel}-${selectedEvent.id}`}
                      >
                        Naslov
                      </label>
                      <input
                        id={`notif-template-title-${channel}-${selectedEvent.id}`}
                        className="notif-template-input"
                        value={getNotificationTemplateTitle(
                          settings,
                          channel,
                          selectedEvent.id,
                        )}
                        onChange={(event) =>
                          setTemplateTitle(selectedEvent.id, event.target.value)
                        }
                      />
                    </div>
                    <div className="notif-template-field">
                      <label
                        htmlFor={`notif-template-body-${channel}-${selectedEvent.id}`}
                      >
                        Vsebina
                      </label>
                      <div className="notif-template-editor">
                        <div
                          className="notif-template-toolbar"
                          aria-label="Orodna vrstica predloge"
                        >
                          <select
                            className="notif-template-format"
                            aria-label="Slog besedila"
                            value="normal"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onChange={(event) =>
                              applyTemplateBlockStyle(
                                selectedEvent.id,
                                event.target.value,
                              )
                            }
                          >
                            <option value="normal">Normalno</option>
                            <option value="heading">Naslov</option>
                            <option value="subheading">Podnaslov</option>
                            <option value="small">Drobno</option>
                          </select>
                          <span
                            className="notif-template-toolbar-divider"
                            aria-hidden
                          />
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Krepko"
                            title="Krepko"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(selectedEvent.id, "bold")
                            }
                          >
                            <NotificationToolbarIcon kind="bold" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Ležeče"
                            title="Ležeče"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(selectedEvent.id, "italic")
                            }
                          >
                            <NotificationToolbarIcon kind="italic" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Podčrtano"
                            title="Podčrtano"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(selectedEvent.id, "underline")
                            }
                          >
                            <NotificationToolbarIcon kind="underline" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Vstavi povezavo"
                            title="Vstavi povezavo"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() => insertTemplateLink(selectedEvent.id)}
                          >
                            <NotificationToolbarIcon kind="link" />
                          </button>
                          <span
                            className="notif-template-toolbar-divider"
                            aria-hidden
                          />
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Označen seznam"
                            title="Označen seznam"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(
                                selectedEvent.id,
                                "insertUnorderedList",
                              )
                            }
                          >
                            <NotificationToolbarIcon kind="bullets" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Oštevilčen seznam"
                            title="Oštevilčen seznam"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(
                                selectedEvent.id,
                                "insertOrderedList",
                              )
                            }
                          >
                            <NotificationToolbarIcon kind="numbers" />
                          </button>
                          <button
                            type="button"
                            className="notif-template-toolbar-button"
                            aria-label="Citat"
                            title="Citat"
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              execTemplateCommand(
                                selectedEvent.id,
                                "formatBlock",
                                "blockquote",
                              )
                            }
                          >
                            <NotificationToolbarIcon kind="quote" />
                          </button>
                          <span className="notif-template-toolbar-spacer" />
                          <button
                            type="button"
                            className={
                              previewTemplate
                                ? "notif-template-preview-button is-active"
                                : "notif-template-preview-button"
                            }
                            aria-label="Predogled"
                            aria-pressed={previewTemplate}
                            onMouseDown={
                              keepTemplateSelectionOnToolbarMouseDown
                            }
                            onClick={() =>
                              setPreviewTemplate((value) => !value)
                            }
                          >
                            <NotificationToolbarIcon kind="preview" />
                            Predogled
                          </button>
                        </div>
                        {previewTemplate ? (
                          <div
                            className={
                              getNotificationTemplateBody(
                                settings,
                                channel,
                                selectedEvent.id,
                              ).trim()
                                ? "notif-template-preview-pane"
                                : "notif-template-preview-pane notif-template-preview-empty"
                            }
                          >
                            {getNotificationTemplateBody(
                              settings,
                              channel,
                              selectedEvent.id,
                            ).trim()
                              ? getTemplatePreviewText(
                                  getNotificationTemplateBody(
                                    settings,
                                    channel,
                                    selectedEvent.id,
                                  ),
                                )
                              : "Predloga je prazna."}
                          </div>
                        ) : (
                          <div
                            ref={templateBodyRef}
                            id={`notif-template-body-${channel}-${selectedEvent.id}`}
                            className="notif-template-textarea"
                            contentEditable
                            suppressContentEditableWarning
                            onInput={() =>
                              syncTemplateBodyFromEditor(selectedEvent.id)
                            }
                            onBlur={() =>
                              syncTemplateBodyFromEditor(selectedEvent.id)
                            }
                          />
                        )}
                      </div>
                    </div>
                    <div className="notif-template-tags">
                      Razpoložljive oznake
                      <div className="notif-template-tag-list">
                        {notificationTemplateTags.map((tag) => (
                          <button
                            key={tag.token}
                            type="button"
                            className="notif-template-tag"
                            onClick={() =>
                              appendTemplateToken(selectedEvent.id, tag.token)
                            }
                            title={tag.label}
                          >
                            {tag.token}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </aside>
              ) : null}
            </div>
          ) : null}
          <div className="notif-savebar">
            <button
              type="button"
              className="notif-save-button"
              onClick={() => void onSave()}
              disabled={savingSettings}
            >
              <GuestSaveIcon />
              {savingSettings ? t("formSaving") : t("configSaveConfiguration")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

