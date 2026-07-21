import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import type { AppLocale } from "../../locale";
import { GuestConfigSaveIcon as GuestSaveIcon } from "../../components/GuestConfigSaveIcon";
import { GuestSwitch } from "./ConfigurationVisualComponents";

type NotificationChannel = "email" | "sms" | "guestApp";
type NotificationTemplateVariant = "regular" | "online";
type NotificationEventKind =
  | "newSession"
  | "sessionChanged"
  | "sessionCancelled"
  | "beforeSession"
  | "afterSession"
  | "waitlistJoined"
  | "waitlistUpdated"
  | "waitlistSlotAvailable"
  | "waitlistOfferExpiring"
  | "waitlistOfferExpired"
  | "waitlistBooked"
  | "waitlistCancelled"
  | "invoiceDelivery";

type NotificationEventDefinition = {
  id: NotificationEventKind;
  title: string;
  description: string;
  icon: "calendar" | "edit" | "x" | "bell" | "check" | "message" | "mail";
  category: "bookings" | "waitlist" | "billing";
  reminder?: "before" | "after";
  supportsOnline?: boolean;
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
  locale: AppLocale;
  waitlistEnabled: boolean;
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
    category: "bookings",
    title: "Nova seja",
    description: "Pošlje se, ko je seja uspešno ustvarjena.",
    icon: "calendar",
  },
  {
    id: "sessionChanged",
    category: "bookings",
    title: "Sprememba seje",
    description: "Pošlje se, ko so podrobnosti seje spremenjene.",
    icon: "edit",
  },
  {
    id: "sessionCancelled",
    category: "bookings",
    title: "Preklic seje",
    description: "Pošlje se, ko je seja preklicana.",
    icon: "x",
  },
  {
    id: "beforeSession",
    category: "bookings",
    title: "Pred sejo",
    description: "Opomnik pošlje pred začetkom seje.",
    icon: "bell",
    reminder: "before",
  },
  {
    id: "afterSession",
    category: "bookings",
    title: "Po seji",
    description: "Povzetek pošlje po koncu seje.",
    icon: "check",
    reminder: "after",
  },
  {
    id: "waitlistJoined",
    category: "waitlist",
    title: "Pridružitev na čakalno vrsto",
    description: "Pošlje se, ko je stranka dodana na čakalno vrsto.",
    icon: "message",
    supportsOnline: false,
  },
  {
    id: "waitlistUpdated",
    category: "waitlist",
    title: "Sprememba zahteve",
    description: "Pošlje se, ko so želje stranke na čakalni vrsti spremenjene.",
    icon: "edit",
    supportsOnline: false,
  },
  {
    id: "waitlistSlotAvailable",
    category: "waitlist",
    title: "Ponudba prostega termina",
    description: "Pošlje se, ko je stranki ponujen sproščeni termin.",
    icon: "calendar",
    supportsOnline: false,
  },
  {
    id: "waitlistOfferExpiring",
    category: "waitlist",
    title: "Ponudba poteče kmalu",
    description: "Opozori stranko tik pred potekom ponudbe.",
    icon: "bell",
    supportsOnline: false,
  },
  {
    id: "waitlistOfferExpired",
    category: "waitlist",
    title: "Ponudba je potekla",
    description: "Pošlje se, ko stranka ponudbe ni sprejela pravočasno.",
    icon: "x",
    supportsOnline: false,
  },
  {
    id: "waitlistBooked",
    category: "waitlist",
    title: "Termin rezerviran",
    description: "Pošlje se, ko je čakalna zahteva pretvorjena v rezervacijo.",
    icon: "check",
    supportsOnline: false,
  },
  {
    id: "waitlistCancelled",
    category: "waitlist",
    title: "Čakalna vrsta preklicana",
    description: "Pošlje se, ko je zahteva preklicana ali odstranjena.",
    icon: "x",
    supportsOnline: false,
  },
];

const invoiceDeliveryEvent: NotificationEventDefinition = {
  id: "invoiceDelivery",
  category: "billing",
  title: "Dostava računa",
  description: "Pošlje se, ko je račun pripravljen za dostavo.",
  icon: "mail",
};

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

const INVOICE_DELIVERY_EMAIL_ENABLED_KEY = "INVOICE_DELIVERY_EMAIL_ENABLED";
const INVOICE_DELIVERY_EMAIL_SUBJECT_KEY = "INVOICE_DELIVERY_EMAIL_SUBJECT";
const INVOICE_DELIVERY_EMAIL_BODY_KEY = "INVOICE_DELIVERY_EMAIL_BODY";

const DEFAULT_INVOICE_DELIVERY_SUBJECT =
  "Invoice {{invoiceNumber}} from {{companyName}}";
const DEFAULT_INVOICE_DELIVERY_BODY = `Hello {{guestName}},

Your invoice {{invoiceNumber}} dated {{invoiceDate}} is attached.
Amount due: {{amount}}
Due date: {{dueDate}}

Thank you,
{{companyName}}`;


function notificationEnabledKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  if (channel === "email" && id === "invoiceDelivery") {
    return INVOICE_DELIVERY_EMAIL_ENABLED_KEY;
  }
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${id.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}_ENABLED`;
}

function notificationReminderKey(
  channel: NotificationChannel,
  reminder: "before" | "after",
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${reminder.toUpperCase()}_REMINDER_TIME`;
}

const NOTIFICATION_EVENT_DEFAULT_ENABLED = false;

function getNotificationEnabled(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  const value = settings[notificationEnabledKey(channel, id)];
  if (value === "true") return true;
  if (value === "false") return false;
  if (channel === "email" && id === "invoiceDelivery") return true;
  return NOTIFICATION_EVENT_DEFAULT_ENABLED;
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
  if (channel === "email" && id === "invoiceDelivery") {
    return INVOICE_DELIVERY_EMAIL_SUBJECT_KEY;
  }
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_TEMPLATE_TITLE`;
}

function notificationTemplateBodyKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  if (channel === "email" && id === "invoiceDelivery") {
    return INVOICE_DELIVERY_EMAIL_BODY_KEY;
  }
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_TEMPLATE_BODY`;
}

function notificationOnlineEnabledKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_ONLINE_ENABLED`;
}

function notificationOnlineTemplateTitleKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_ONLINE_TEMPLATE_TITLE`;
}

function notificationOnlineTemplateBodyKey(
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  return `NOTIFICATIONS_${notificationChannelSettingName(channel)}_${notificationEventSettingName(id)}_ONLINE_TEMPLATE_BODY`;
}

type NotificationTemplateDefaults = Record<
  NotificationEventKind,
  { title: string; body: string }
>;

const waitlistEmailTemplateDefaults = {
  waitlistJoined: {
    title: "Uspešno ste se pridružili čakalni vrsti",
    body: "Pozdravljeni {{clientFirstName}},\n\nvaša zahteva za {{serviceName}} je dodana na čakalno vrsto.\nŽeleni termin: {{date}} med {{startTime}} in {{endTime}}.\n\nSvojo zahtevo lahko uredite ali prekličete tukaj: {{manageWaitlistUrl}}\n\n{{companyName}}",
  },
  waitlistUpdated: {
    title: "Vaša zahteva na čakalni vrsti je posodobljena",
    body: "Pozdravljeni {{clientFirstName}},\n\nvaše želje za {{serviceName}} so bile posodobljene.\nNovi želeni termin: {{date}} med {{startTime}} in {{endTime}}.\n\nUpravljanje zahteve: {{manageWaitlistUrl}}\n\n{{companyName}}",
  },
  waitlistSlotAvailable: {
    title: "Za vas se je sprostil termin",
    body: "Pozdravljeni {{clientFirstName}},\n\nza {{serviceName}} se je sprostil termin {{date}} od {{startTime}} do {{endTime}} pri {{employeeName}}.\nTermin je začasno rezerviran za vas do {{offerExpiresAt}}.\n\nSprejmi ponudbo: {{acceptUrl}}\nZavrni ponudbo: {{declineUrl}}\n\n{{companyName}}",
  },
  waitlistOfferExpiring: {
    title: "Ponudba termina poteče kmalu",
    body: "Pozdravljeni {{clientFirstName}},\n\nponudba termina za {{serviceName}} poteče ob {{offerExpiresAt}}.\nSprejmi ponudbo: {{acceptUrl}}\nZavrni ponudbo: {{declineUrl}}\n\n{{companyName}}",
  },
  waitlistOfferExpired: {
    title: "Ponudba termina je potekla",
    body: "Pozdravljeni {{clientFirstName}},\n\nponudba termina za {{serviceName}} je potekla. Vaša zahteva ostaja na čakalni vrsti, razen če ste jo preklicali.\n\nUpravljanje zahteve: {{manageWaitlistUrl}}\n\n{{companyName}}",
  },
  waitlistBooked: {
    title: "Termin je rezerviran",
    body: "Pozdravljeni {{clientFirstName}},\n\ntermin za {{serviceName}} je uspešno rezerviran za {{date}} od {{startTime}} do {{endTime}}.\n\n{{companyName}}",
  },
  waitlistCancelled: {
    title: "Zahteva na čakalni vrsti je preklicana",
    body: "Pozdravljeni {{clientFirstName}},\n\nvaša zahteva za {{serviceName}} je bila preklicana oziroma odstranjena s čakalne vrste.\n\n{{companyName}}",
  },
};

const waitlistSmsTemplateDefaults = {
  waitlistJoined: { title: "Čakalna vrsta", body: "{{clientFirstName}}, dodani ste na čakalno vrsto za {{serviceName}}. Upravljanje: {{manageWaitlistUrl}}" },
  waitlistUpdated: { title: "Sprememba čakalne vrste", body: "{{clientFirstName}}, vaša zahteva za {{serviceName}} je posodobljena. {{manageWaitlistUrl}}" },
  waitlistSlotAvailable: { title: "Prost termin", body: "Za {{serviceName}} je prost termin {{date}} ob {{startTime}}. Rezerviran je do {{offerExpiresAt}}. Sprejmi: {{acceptUrl}} Zavrni: {{declineUrl}}" },
  waitlistOfferExpiring: { title: "Ponudba poteče", body: "Ponudba za {{serviceName}} poteče ob {{offerExpiresAt}}. Sprejmi: {{acceptUrl}}" },
  waitlistOfferExpired: { title: "Ponudba je potekla", body: "Ponudba termina za {{serviceName}} je potekla. Vaša zahteva ostaja aktivna." },
  waitlistBooked: { title: "Termin rezerviran", body: "Termin za {{serviceName}} je rezerviran: {{date}} ob {{startTime}}." },
  waitlistCancelled: { title: "Čakalna vrsta preklicana", body: "Vaša zahteva za {{serviceName}} je bila preklicana." },
};

const waitlistGuestAppTemplateDefaults = {
  waitlistJoined: { title: "Dodani na čakalno vrsto", body: "Vaša zahteva za {{serviceName}} je aktivna." },
  waitlistUpdated: { title: "Zahteva posodobljena", body: "Vaše želje za {{serviceName}} so posodobljene." },
  waitlistSlotAvailable: { title: "Sprostil se je termin", body: "{{date}} ob {{startTime}}. Ponudba velja do {{offerExpiresAt}}." },
  waitlistOfferExpiring: { title: "Ponudba poteče kmalu", body: "Potrdite termin za {{serviceName}} do {{offerExpiresAt}}." },
  waitlistOfferExpired: { title: "Ponudba je potekla", body: "Ponudba za {{serviceName}} ni več veljavna." },
  waitlistBooked: { title: "Termin rezerviran", body: "Vaš termin za {{serviceName}} je potrjen za {{date}} ob {{startTime}}." },
  waitlistCancelled: { title: "Zahteva preklicana", body: "Zahteva za {{serviceName}} je odstranjena s čakalne vrste." },
};

const emailTemplateDefaults: NotificationTemplateDefaults = {
  newSession: {
    title: "Potrditev rezervacije",
    body: "Pozdravljeni {{ime_stranke}},\n\nvaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.\n\nVeselimo se srečanja z vami.\n{{ime_podjetja}}\n\n{{gumb_za_prenarocanje}}\n{{gumb_za_odpoved}}",
  },
  sessionChanged: {
    title: "Sprememba rezervacije",
    body: "Pozdravljeni {{ime_stranke}},\n\npodrobnosti vaše rezervacije so bile spremenjene. Nov termin je {{datum}} ob {{cas}}.\n\n{{ime_podjetja}}\n\n{{gumb_za_prenarocanje}}\n{{gumb_za_odpoved}}",
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
  ...waitlistEmailTemplateDefaults,
  invoiceDelivery: {
    title: DEFAULT_INVOICE_DELIVERY_SUBJECT,
    body: DEFAULT_INVOICE_DELIVERY_BODY,
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
  ...waitlistSmsTemplateDefaults,
  invoiceDelivery: {
    title: DEFAULT_INVOICE_DELIVERY_SUBJECT,
    body: DEFAULT_INVOICE_DELIVERY_BODY,
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
  ...waitlistGuestAppTemplateDefaults,
  invoiceDelivery: {
    title: DEFAULT_INVOICE_DELIVERY_SUBJECT,
    body: DEFAULT_INVOICE_DELIVERY_BODY,
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

const onlineTemplateDefaults: Record<
  NotificationChannel,
  NotificationTemplateDefaults
> = {
  email: {
    newSession: {
      title: "Potrditev online rezervacije",
      body: "Pozdravljeni {{ime_stranke}},\n\nvaša online rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.\n\nPovezava do srečanja: {{online_povezava}}\n\nVeselimo se srečanja z vami.\n{{ime_podjetja}}\n\n{{gumb_za_prenarocanje}}\n{{gumb_za_odpoved}}",
    },
    sessionChanged: {
      title: "Sprememba online rezervacije",
      body: "Pozdravljeni {{ime_stranke}},\n\npodrobnosti vaše online rezervacije so bile spremenjene. Nov termin je {{datum}} ob {{cas}}.\n\nPovezava do srečanja: {{online_povezava}}\n\n{{ime_podjetja}}\n\n{{gumb_za_prenarocanje}}\n{{gumb_za_odpoved}}",
    },
    sessionCancelled: {
      title: "Preklic online rezervacije",
      body: "Pozdravljeni {{ime_stranke}},\n\nvaša online rezervacija za {{ime_storitve}} je bila preklicana.\n\n{{ime_podjetja}}",
    },
    beforeSession: {
      title: "Opomnik pred online terminom",
      body: "Pozdravljeni {{ime_stranke}},\n\nspomnimo vas na online termin {{ime_storitve}} dne {{datum}} ob {{cas}}.\n\nPovezava do srečanja: {{online_povezava}}\n\n{{ime_podjetja}}",
    },
    afterSession: {
      title: "Hvala za online srečanje",
      body: "Pozdravljeni {{ime_stranke}},\n\nhvala za udeležbo na online srečanju. Veseli bomo vaših povratnih informacij.\n\n{{ime_podjetja}}",
    },
    ...waitlistEmailTemplateDefaults,
    invoiceDelivery: {
      title: DEFAULT_INVOICE_DELIVERY_SUBJECT,
      body: DEFAULT_INVOICE_DELIVERY_BODY,
    },
  },
  sms: {
    newSession: {
      title: "Nova online seja",
      body: "Pozdravljeni {{ime_stranke}}, vaša online rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena. Povezava: {{online_povezava}}",
    },
    sessionChanged: {
      title: "Sprememba online seje",
      body: "Pozdravljeni {{ime_stranke}}, vaš online termin je bil spremenjen na {{datum}} ob {{cas}}. Povezava: {{online_povezava}}",
    },
    sessionCancelled: {
      title: "Preklic online seje",
      body: "Pozdravljeni {{ime_stranke}}, vaša online rezervacija za {{ime_storitve}} je bila preklicana.",
    },
    beforeSession: {
      title: "Opomnik pred online sejo",
      body: "Pozdravljeni {{ime_stranke}}, opomnik na online termin {{ime_storitve}} dne {{datum}} ob {{cas}}. Povezava: {{online_povezava}}",
    },
    afterSession: {
      title: "Po online seji",
      body: "Hvala za online srečanje, {{ime_stranke}}. Veselimo se vaših povratnih informacij.",
    },
    ...waitlistSmsTemplateDefaults,
    invoiceDelivery: {
      title: DEFAULT_INVOICE_DELIVERY_SUBJECT,
      body: DEFAULT_INVOICE_DELIVERY_BODY,
    },
  },
  guestApp: {
    newSession: {
      title: "Nova online seja",
      body: "Vaša online rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena. Povezava: {{online_povezava}}",
    },
    sessionChanged: {
      title: "Sprememba online seje",
      body: "Podrobnosti vaše online seje so bile spremenjene. Nov termin je {{datum}} ob {{cas}}. Povezava: {{online_povezava}}",
    },
    sessionCancelled: {
      title: "Preklic online seje",
      body: "Vaša online rezervacija za {{ime_storitve}} je bila preklicana.",
    },
    beforeSession: {
      title: "Opomnik pred online sejo",
      body: "Opomnik: vaš online termin {{ime_storitve}} je dne {{datum}} ob {{cas}}. Povezava: {{online_povezava}}",
    },
    afterSession: {
      title: "Po online seji",
      body: "Hvala za online srečanje. Veseli bomo vaših povratnih informacij.",
    },
    ...waitlistGuestAppTemplateDefaults,
    invoiceDelivery: {
      title: DEFAULT_INVOICE_DELIVERY_SUBJECT,
      body: DEFAULT_INVOICE_DELIVERY_BODY,
    },
  },
};

export const NOTIFICATION_SETTINGS_KEY = "NOTIFICATION_SETTINGS_JSON";

const EMAIL_SENDER_MODE_KEY = "EMAIL_SENDER_MODE";
const EMAIL_CUSTOM_FROM_NAME_KEY = "EMAIL_CUSTOM_FROM_NAME";
const EMAIL_CUSTOM_FROM_EMAIL_KEY = "EMAIL_CUSTOM_FROM_EMAIL";
const EMAIL_CUSTOM_REPLY_TO_EMAIL_KEY = "EMAIL_CUSTOM_REPLY_TO_EMAIL";
const EMAIL_CUSTOM_DOMAIN_KEY = "EMAIL_CUSTOM_DOMAIN";
const EMAIL_CUSTOM_DOMAIN_VERIFICATION_STATUS_KEY =
  "EMAIL_CUSTOM_DOMAIN_VERIFICATION_STATUS";

type EmailSenderMode = "DEFAULT_CALENDRA" | "CUSTOM_DOMAIN";

const notificationChannels = ["email", "sms", "guestApp"] as const;

function notificationChannelSettingName(channel: NotificationChannel) {
  return channel === "guestApp" ? "GUEST_APP" : channel.toUpperCase();
}

function normalizeEmailSenderMode(value: string | undefined): EmailSenderMode {
  return value === "CUSTOM_DOMAIN" ? "CUSTOM_DOMAIN" : "DEFAULT_CALENDRA";
}

function normalizeEmailDomain(value: string | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function emailDomainFromAddress(value: string | undefined) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  return at >= 0 ? normalizeEmailDomain(email.slice(at + 1)) : "";
}

function emailSenderDomainMatches(email: string, domain: string) {
  const emailDomain = emailDomainFromAddress(email);
  const verifiedDomain = normalizeEmailDomain(domain);
  return (
    !!emailDomain &&
    !!verifiedDomain &&
    (emailDomain === verifiedDomain || emailDomain.endsWith(`.${verifiedDomain}`))
  );
}

function isEmailSenderVerified(status: string | undefined) {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized === "VERIFIED" || normalized === "SUCCESS";
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
    const channelAvailable = isNotificationChannelAvailable(next, channel);
    notificationEvents.forEach((event) => {
      if (!channelAvailable) {
        next[notificationEnabledKey(channel, event.id)] = "false";
      }
      if (
        next.ONLINE_SESSION_BOOKING_ENABLED === "false" ||
        event.supportsOnline === false
      ) {
        next[notificationOnlineEnabledKey(channel, event.id)] = "false";
      }
    });
  });

  if (!isNotificationChannelAvailable(next, "email")) {
    next[INVOICE_DELIVERY_EMAIL_ENABLED_KEY] = "false";
  }

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
  if (
    reminder === "after" &&
    (normalized.includes("takoj") || normalized.includes("immediate"))
  ) {
    return { offsetValue: 1, offsetUnit: "minutes" };
  }
  if (normalized.includes("15"))
    return { offsetValue: 15, offsetUnit: "minutes" };
  if (normalized.includes("30"))
    return { offsetValue: 30, offsetUnit: "minutes" };
  if (
    normalized.includes("24") ||
    normalized.includes("day") ||
    normalized.includes("dan")
  ) {
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
  const minutes = unit.startsWith("day")
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

export function buildNotificationSettingsJson(
  settings: Record<string, string>,
) {
  const normalizedSettings = applyNotificationModuleAvailability(settings);
  const root: Record<string, Record<string, Record<string, unknown>>> = {};

  notificationChannels.forEach((channel) => {
    root[channel] = {};
    notificationEvents.forEach((event) => {
      const title = getNotificationTemplateTitle(
        normalizedSettings,
        channel,
        event.id,
      );
      const body = getNotificationTemplateBody(
        normalizedSettings,
        channel,
        event.id,
      );
      const channelEnabled = isNotificationChannelAvailable(
        normalizedSettings,
        channel,
      );
      const node: Record<string, unknown> = {
        enabled:
          channelEnabled &&
          getNotificationEnabled(normalizedSettings, channel, event.id),
      };

      const onlineEnabled =
        event.supportsOnline !== false &&
        normalizedSettings.ONLINE_SESSION_BOOKING_ENABLED !== "false" &&
        channelEnabled &&
        getNotificationEnabled(normalizedSettings, channel, event.id) &&
        getNotificationOnlineEnabled(normalizedSettings, channel, event.id);
      const onlineTitle = getNotificationTemplateTitle(
        normalizedSettings,
        channel,
        event.id,
        "online",
      );
      const onlineBody = getNotificationTemplateBody(
        normalizedSettings,
        channel,
        event.id,
        "online",
      );

      node.onlineEnabled = onlineEnabled;

      if (channel === "email") {
        node.subject = title;
        node.bodyHtml = body;
        node.onlineSubject = onlineTitle;
        node.onlineBodyHtml = onlineBody;
      } else if (channel === "sms") {
        node.title = title;
        node.body = body;
        node.onlineTitle = onlineTitle;
        node.onlineBody = onlineBody;
      } else {
        node.title = title;
        node.body = body;
        node.onlineTitle = onlineTitle;
        node.onlineBody = onlineBody;
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

export function mergeNotificationSettingsJsonIntoFlat(
  settings: Record<string, string>,
): Record<string, string> {
  const raw = settings[NOTIFICATION_SETTINGS_KEY];
  if (!raw) return settings;

  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
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
          channel === "email"
            ? node.subject || node.title || ""
            : node.title || "",
        );
        const body = String(
          channel === "email"
            ? node.bodyHtml || node.body || ""
            : node.body || "",
        );
        if (title)
          next[notificationTemplateTitleKey(channel, event.id)] = title;
        if (body) next[notificationTemplateBodyKey(channel, event.id)] = body;

        if (typeof node.onlineEnabled === "boolean") {
          next[notificationOnlineEnabledKey(channel, event.id)] =
            node.onlineEnabled ? "true" : "false";
        }

        const onlineTitle = String(
          channel === "email"
            ? node.onlineSubject || node.onlineTitle || ""
            : node.onlineTitle || "",
        );
        const onlineBody = String(
          channel === "email"
            ? node.onlineBodyHtml || node.onlineBody || ""
            : node.onlineBody || "",
        );
        if (onlineTitle) {
          next[notificationOnlineTemplateTitleKey(channel, event.id)] =
            onlineTitle;
        }
        if (onlineBody) {
          next[notificationOnlineTemplateBodyKey(channel, event.id)] =
            onlineBody;
        }

        if (event.reminder) {
          next[notificationReminderKey(channel, event.reminder)] =
            offsetToReminderValue(
              node.offsetValue,
              node.offsetUnit,
              event.reminder,
            );
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
  { label: "Ime stranke (čakalna vrsta)", token: "{{clientFirstName}}" },
  { label: "Storitev (čakalna vrsta)", token: "{{serviceName}}" },
  { label: "Zaposleni (čakalna vrsta)", token: "{{employeeName}}" },
  { label: "Datum ponudbe", token: "{{date}}" },
  { label: "Začetek termina", token: "{{startTime}}" },
  { label: "Konec termina", token: "{{endTime}}" },
  { label: "Potek ponudbe", token: "{{offerExpiresAt}}" },
  { label: "Sprejmi ponudbo", token: "{{acceptUrl}}" },
  { label: "Zavrni ponudbo", token: "{{declineUrl}}" },
  { label: "Upravljanje čakalne vrste", token: "{{manageWaitlistUrl}}" },
  { label: "Podjetje (čakalna vrsta)", token: "{{companyName}}" },
  { label: "Ime stranke", token: "{{ime_stranke}}" },
  { label: "Priimek stranke", token: "{{priimek_stranke}}" },
  { label: "Ime storitve", token: "{{ime_storitve}}" },
  { label: "Datum", token: "{{datum}}" },
  { label: "Čas", token: "{{cas}}" },
  { label: "Naslov lokacije", token: "{{naslov_lokacije}}" },
  { label: "Fizični naslov", token: "{{fizicni_naslov}}" },
  { label: "Fizični naslov – ulica", token: "{{fizicni_naslov_ulica}}" },
  { label: "Fizično mesto", token: "{{fizicno_mesto}}" },
  { label: "Fizična poštna številka", token: "{{fizicna_postna_stevilka}}" },
  { label: "Fizična država", token: "{{fizicna_drzava}}" },
  { label: "Ime lokacije", token: "{{ime_lokacije}}" },
  { label: "Telefonska številka lokacije", token: "{{telefon_lokacije}}" },
  { label: "Povezava za prenaročanje", token: "{{povezava_za_prenarocanje}}" },
  { label: "Kategorija storitve", token: "{{kategorija_storitve}}" },
  { label: "Ime izvajalca", token: "{{ime_izvajalca}}" },
  { label: "Telefonska številka izvajalca", token: "{{telefon_izvajalca}}" },
  { label: "Datum in čas prvotnega termina", token: "{{prvotni_termin}}" },
];

const emailNotificationActionTags = [
  { label: "Povezava za odpoved", token: "{{povezava_za_odpoved}}" },
  { label: "Sprememba seje (gumb)", token: "{{gumb_za_prenarocanje}}" },
  { label: "Odpoved seje (gumb)", token: "{{gumb_za_odpoved}}" },
];

const emailNotificationTemplateTags = [
  ...notificationTemplateTags,
  ...emailNotificationActionTags,
];

const onlineNotificationTemplateTags = [
  ...notificationTemplateTags,
  { label: "Povezava do online srečanja", token: "{{online_povezava}}" },
  { label: "Tip izvedbe", token: "{{tip_izvedbe}}" },
];

const onlineEmailNotificationTemplateTags = [
  ...onlineNotificationTemplateTags,
  ...emailNotificationActionTags,
];

const invoiceDeliveryTemplateTags: Array<{
  token: string;
  label: string;
  localizedLabel: Record<AppLocale, string>;
}> = [
  { token: "{{guestName}}", label: "Ime gosta", localizedLabel: { en: "Guest name", sl: "Ime gosta", sr: "Ime gosta" } },
  { token: "{{invoiceNumber}}", label: "Številka računa", localizedLabel: { en: "Invoice number", sl: "Številka računa", sr: "Broj računa" } },
  { token: "{{invoiceDate}}", label: "Datum računa", localizedLabel: { en: "Invoice date", sl: "Datum računa", sr: "Datum računa" } },
  { token: "{{dueDate}}", label: "Datum zapadlosti", localizedLabel: { en: "Due date", sl: "Datum zapadlosti", sr: "Datum dospeća" } },
  { token: "{{amount}}", label: "Znesek", localizedLabel: { en: "Amount", sl: "Znesek", sr: "Iznos" } },
  { token: "{{companyName}}", label: "Ime podjetja", localizedLabel: { en: "Company name", sl: "Ime podjetja", sr: "Naziv kompanije" } },
  { token: "{{guestEmail}}", label: "E-pošta gosta", localizedLabel: { en: "Guest email", sl: "E-pošta gosta", sr: "E-pošta gosta" } },
  { token: "{{reservationNumber}}", label: "Številka rezervacije", localizedLabel: { en: "Reservation number", sl: "Številka rezervacije", sr: "Broj rezervacije" } },
  { token: "{{propertyName}}", label: "Ime lokacije", localizedLabel: { en: "Property name", sl: "Ime lokacije", sr: "Naziv lokacije" } },
  { token: "{{propertyAddress}}", label: "Naslov lokacije", localizedLabel: { en: "Property address", sl: "Naslov lokacije", sr: "Adresa lokacije" } },
  { token: "{{paymentLink}}", label: "Povezava za plačilo", localizedLabel: { en: "Payment link", sl: "Povezava za plačilo", sr: "Link za plaćanje" } },
  { token: "{{companyEmail}}", label: "E-pošta podjetja", localizedLabel: { en: "Company email", sl: "E-pošta podjetja", sr: "E-pošta kompanije" } },
  { token: "{{companyPhone}}", label: "Telefon podjetja", localizedLabel: { en: "Company phone", sl: "Telefon podjetja", sr: "Telefon kompanije" } },
  { token: "{{physicalFullAddress}}", label: "Fizični naslov", localizedLabel: { en: "Physical address", sl: "Fizični naslov", sr: "Fizička adresa" } },
  { token: "{{physicalAddress}}", label: "Fizični naslov – ulica", localizedLabel: { en: "Physical street address", sl: "Fizični naslov – ulica", sr: "Fizička adresa – ulica" } },
  { token: "{{physicalPostalCode}}", label: "Fizična poštna številka", localizedLabel: { en: "Physical postal code", sl: "Fizična poštna številka", sr: "Fizički poštanski broj" } },
  { token: "{{physicalCity}}", label: "Fizično mesto", localizedLabel: { en: "Physical city", sl: "Fizično mesto", sr: "Fizički grad" } },
  { token: "{{physicalCountry}}", label: "Fizična država", localizedLabel: { en: "Physical country", sl: "Fizična država", sr: "Fizička država" } },
  { token: "{{companyWebsite}}", label: "Spletna stran podjetja", localizedLabel: { en: "Company website", sl: "Spletna stran podjetja", sr: "Veb-sajt kompanije" } },
];

function availableTagsLabel(locale: AppLocale) {
  if (locale === "sl") return "Razpoložljive oznake";
  if (locale === "sr") return "Dostupne oznake";
  return "Available tags";
}

function templateTagButtonText(
  tag: { token: string; localizedLabel?: Record<AppLocale, string> },
  locale: AppLocale,
) {
  return tag.localizedLabel?.[locale] || tag.token;
}


function getNotificationOnlineEnabled(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
) {
  const value = settings[notificationOnlineEnabledKey(channel, id)];
  if (value === "true") return true;
  if (value === "false") return false;
  return false;
}

function getNotificationTemplateTitle(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
  variant: NotificationTemplateVariant = "regular",
) {
  if (variant === "online") {
    return (
      settings[notificationOnlineTemplateTitleKey(channel, id)] ||
      onlineTemplateDefaults[channel][id].title
    );
  }
  return (
    settings[notificationTemplateTitleKey(channel, id)] ||
    notificationTemplateDefaults[channel][id].title
  );
}

function getNotificationTemplateBody(
  settings: Record<string, string>,
  channel: NotificationChannel,
  id: NotificationEventKind,
  variant: NotificationTemplateVariant = "regular",
) {
  if (variant === "online") {
    return (
      settings[notificationOnlineTemplateBodyKey(channel, id)] ||
      onlineTemplateDefaults[channel][id].body
    );
  }
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
  if (icon === "mail") {
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
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
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
  return <GuestSwitch checked={checked} onChange={onChange} />;
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
  locale,
  waitlistEnabled,
}: ConfigurationNotificationsSectionProps) {
  const [channel, setChannel] = useState<NotificationChannel>("email");
  const [editingEvent, setEditingEvent] =
    useState<NotificationEventKind | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState(false);
  const [templateVariant, setTemplateVariant] =
    useState<NotificationTemplateVariant>("regular");
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
  const baseVisibleNotificationEvents =
    channel === "email"
      ? [...notificationEvents, invoiceDeliveryEvent]
      : notificationEvents;
  const visibleNotificationEvents = baseVisibleNotificationEvents.filter(
    (event) => waitlistEnabled || event.category !== "waitlist",
  );

  useEffect(() => {
    if (!waitlistEnabled && editingEvent?.startsWith("waitlist")) {
      setEditingEvent(null);
    }
  }, [editingEvent, waitlistEnabled]);

  useEffect(() => {
    if (availableChannels.length === 0) return;
    if (!channelAvailability[channel]) {
      setChannel(availableChannels[0]);
    }
  }, [channelAvailability, availableChannels, channel]);

  useEffect(() => {
    setEditingEvent(null);
    setPreviewTemplate(false);
    setTemplateVariant("regular");
  }, [channel]);

  useEffect(() => {
    setPreviewTemplate(false);
    setTemplateVariant("regular");
  }, [editingEvent]);

  const selectedEvent = editingEvent
    ? visibleNotificationEvents.find((event) => event.id === editingEvent) || null
    : null;
  const selectedEventSupportsBookingManageTags =
    selectedEvent?.id === "newSession" || selectedEvent?.id === "sessionChanged";
  const onlineSessionBookingEnabled =
    settings.ONLINE_SESSION_BOOKING_ENABLED !== "false";
  const selectedOnlineTemplateEnabled =
    selectedEvent &&
    selectedEvent.id !== "invoiceDelivery" &&
    selectedEvent.supportsOnline !== false
      ? getNotificationOnlineEnabled(settings, channel, selectedEvent.id)
      : false;
  const selectedTemplateVariant: NotificationTemplateVariant =
    onlineSessionBookingEnabled && selectedOnlineTemplateEnabled
      ? templateVariant
      : "regular";
  const selectedTemplateBody = selectedEvent
    ? getNotificationTemplateBody(
        settings,
        channel,
        selectedEvent.id,
        selectedTemplateVariant,
      )
    : "";

  const emailSenderMode = normalizeEmailSenderMode(
    settings[EMAIL_SENDER_MODE_KEY],
  );
  const customFromName =
    settings[EMAIL_CUSTOM_FROM_NAME_KEY] || settings.COMPANY_NAME || "";
  const customFromEmail = settings[EMAIL_CUSTOM_FROM_EMAIL_KEY] || "";
  const customReplyToEmail =
    settings[EMAIL_CUSTOM_REPLY_TO_EMAIL_KEY] || customFromEmail;
  const customDomain = settings[EMAIL_CUSTOM_DOMAIN_KEY] || "";
  const customDomainStatus =
    settings[EMAIL_CUSTOM_DOMAIN_VERIFICATION_STATUS_KEY] || "NOT_VERIFIED";
  const customDomainVerified = isEmailSenderVerified(customDomainStatus);
  const customSenderDomainMatches = emailSenderDomainMatches(
    customFromEmail,
    customDomain,
  );
  const effectiveEmailSenderMode =
    emailSenderMode === "CUSTOM_DOMAIN" && customDomainVerified
      ? "CUSTOM_DOMAIN"
      : "DEFAULT_CALENDRA";

  const setEmailSenderSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const selectEmailSenderMode = (mode: EmailSenderMode) => {
    if (mode === "CUSTOM_DOMAIN" && !customDomainVerified) return;
    setEmailSenderSetting(EMAIL_SENDER_MODE_KEY, mode);
  };

  useEffect(() => {
    if (emailSenderMode !== "CUSTOM_DOMAIN" || customDomainVerified) return;
    setSettings((prev) =>
      prev[EMAIL_SENDER_MODE_KEY] === "CUSTOM_DOMAIN"
        ? { ...prev, [EMAIL_SENDER_MODE_KEY]: "DEFAULT_CALENDRA" }
        : prev,
    );
  }, [customDomainVerified, emailSenderMode, setSettings]);

  useEffect(() => {
    if (!onlineSessionBookingEnabled || !selectedOnlineTemplateEnabled) {
      setTemplateVariant("regular");
    }
  }, [onlineSessionBookingEnabled, selectedOnlineTemplateEnabled]);

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

  const setOnlineTemplateEnabled = (
    id: NotificationEventKind,
    checked: boolean,
  ) => {
    const key = notificationOnlineEnabledKey(channel, id);
    setSettings((prev) => ({ ...prev, [key]: checked ? "true" : "false" }));
    if (!checked) {
      setTemplateVariant("regular");
    }
  };

  const setTemplateTitle = (
    id: NotificationEventKind,
    value: string,
    variant: NotificationTemplateVariant = selectedTemplateVariant,
  ) => {
    setSettings((prev) => ({
      ...prev,
      [variant === "online"
        ? notificationOnlineTemplateTitleKey(channel, id)
        : notificationTemplateTitleKey(channel, id)]: value,
    }));
  };

  const setTemplateBody = (
    id: NotificationEventKind,
    value: string,
    variant: NotificationTemplateVariant = selectedTemplateVariant,
  ) => {
    setSettings((prev) => ({
      ...prev,
      [variant === "online"
        ? notificationOnlineTemplateBodyKey(channel, id)
        : notificationTemplateBodyKey(channel, id)]: value,
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
      "{{naslov_lokacije}}": "Cesta v Mestni log 55, 1000 Ljubljana",
      "{{fizicni_naslov}}": "Cesta v Mestni log 55, 1000 Ljubljana, Slovenija",
      "{{fizicni_naslov_ulica}}": "Cesta v Mestni log 55",
      "{{fizicna_postna_stevilka}}": "1000",
      "{{fizicno_mesto}}": "Ljubljana",
      "{{fizicna_drzava}}": "Slovenija",
      "{{ime_lokacije}}": "Studio Center",
      "{{telefon_lokacije}}": "+386 40 123 456",
      "{{povezava_za_prenarocanje}}": "https://app.calendra.si/public-booking/manage/demo?action=modify",
      "{{povezava_za_odpoved}}": "https://app.calendra.si/public-booking/manage/demo?action=cancel",
      "{{gumb_za_prenarocanje}}": "Spremeni termin",
      "{{gumb_za_odpoved}}": "Odpovej termin",
      "{{kategorija_storitve}}": "Fitnes",
      "{{ime_izvajalca}}": "Ana",
      "{{telefon_izvajalca}}": "+386 41 555 111",
      "{{prvotni_termin}}": "10. junij 2026 ob 10:00",
      "{{online_povezava}}": "https://meet.google.com/abc-defg-hij",
      "{{online_link}}": "https://meet.google.com/abc-defg-hij",
      "{{tip_izvedbe}}": "Online",
      "{{guestName}}": "Maja Novak",
      "{{invoiceNumber}}": "INV-2026-0012",
      "{{invoiceDate}}": "12. junij 2026",
      "{{dueDate}}": "27. junij 2026",
      "{{amount}}": "61,00 €",
      "{{guestEmail}}": "maja.novak@example.com",
      "{{companyName}}": "2TEN",
      "{{companyEmail}}": "info@2ten.si",
      "{{companyPhone}}": "+386 40 000 000",
      "{{physicalFullAddress}}": "Cesta v Mestni log 55, 1000 Ljubljana, Slovenija",
      "{{physicalAddress}}": "Cesta v Mestni log 55",
      "{{physicalPostalCode}}": "1000",
      "{{physicalCity}}": "Ljubljana",
      "{{physicalCountry}}": "Slovenija",
      "{{companyWebsite}}": "2ten.si",
      "{{paymentLink}}": "https://2ten.si/placilo/inv-2026-0012",
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
  }, [
    selectedEvent,
    previewTemplate,
    selectedTemplateBody,
    selectedTemplateVariant,
  ]);

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
        .notif-sender-card {
          display: grid;
          gap: 18px;
          margin: 0 0 22px;
          padding: 22px;
          border: 1px solid #dce3ef;
          border-radius: 20px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          box-shadow: 0 16px 34px rgba(8, 23, 58, 0.055);
        }
        .notif-sender-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }
        .notif-sender-head h3 {
          margin: 0 0 5px;
          color: var(--notif-ink);
          font-size: 18px;
          line-height: 1.2;
          font-weight: 850;
          letter-spacing: -0.02em;
        }
        .notif-sender-head p {
          margin: 0;
          color: var(--notif-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        .notif-sender-status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          background: #eef4ff;
          color: var(--notif-blue);
          font-size: 12px;
          font-weight: 850;
          white-space: nowrap;
        }
        .notif-sender-status.is-ready {
          background: #e8f8ef;
          color: #087443;
        }
        .notif-sender-options {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .notif-sender-option {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 12px;
          align-items: flex-start;
          min-height: 86px;
          padding: 15px;
          border: 1px solid #dce3ef;
          border-radius: 15px;
          background: #fff;
          color: var(--notif-ink);
          text-align: left;
          cursor: pointer;
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }
        .notif-sender-option:hover {
          border-color: rgba(15, 98, 254, 0.34);
          box-shadow: 0 10px 24px rgba(15, 98, 254, 0.08);
        }
        .notif-sender-option.is-active {
          border-color: rgba(15, 98, 254, 0.48);
          background: #f3f7ff;
          box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.12);
        }
        .notif-sender-option.is-disabled {
          opacity: 0.58;
          cursor: not-allowed;
          box-shadow: none;
        }
        .notif-sender-radio {
          display: grid;
          place-items: center;
          width: 22px;
          height: 22px;
          margin-top: 1px;
          border: 2px solid #b8c4d7;
          border-radius: 999px;
          background: #fff;
        }
        .notif-sender-option.is-active .notif-sender-radio {
          border-color: var(--notif-blue);
        }
        .notif-sender-option.is-active .notif-sender-radio::after {
          content: '';
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--notif-blue);
        }
        .notif-sender-option strong {
          display: block;
          margin-bottom: 4px;
          font-size: 14px;
          font-weight: 850;
        }
        .notif-sender-option span:last-child {
          display: block;
          color: var(--notif-muted);
          font-size: 12px;
          line-height: 1.35;
          word-break: break-word;
        }
        .notif-sender-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .notif-sender-field {
          display: grid;
          gap: 7px;
        }
        .notif-sender-field label {
          color: var(--notif-ink);
          font-size: 12px;
          font-weight: 850;
        }
        .notif-sender-field input {
          width: 100%;
          min-height: 42px;
          border: 1px solid #cfd8e7;
          border-radius: 11px;
          background: #fff;
          color: var(--notif-ink);
          padding: 0 12px;
          font-size: 14px;
          font-weight: 650;
          outline: none;
        }
        .notif-sender-field input:focus {
          border-color: rgba(15, 98, 254, 0.62);
          box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
        }
        .notif-sender-field input[readonly] {
          background: #f6f9ff;
          color: #4b5875;
          cursor: default;
        }
        .notif-sender-note {
          margin: -4px 0 0;
          color: var(--notif-muted);
          font-size: 12px;
          line-height: 1.45;
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
        .notif-event-group-title {
          margin: 16px 2px 2px;
          color: #31466f;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .notif-event-group-title:first-child { margin-top: 0; }
        .notif-event-row {
          display: grid;
          grid-template-columns: 52px minmax(220px, 1fr) minmax(218px, 0.34fr) 68px auto;
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
          grid-template-columns: 52px minmax(170px, 1fr) minmax(190px, 0.34fr) 68px auto;
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
        .notif-event-row .gapp-switch {
          justify-self: start;
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
        .notif-online-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin: 0 0 18px;
          padding: 14px 16px;
          border: 1px solid #e1e8f3;
          border-radius: 14px;
          background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
        }
        .notif-online-toggle-copy {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .notif-online-toggle-copy strong {
          color: var(--notif-ink);
          font-size: 14px;
          font-weight: 850;
        }
        .notif-online-toggle-copy span {
          color: var(--notif-muted);
          font-size: 13px;
          line-height: 1.35;
        }
        .notif-template-variant-tabs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin: 0 0 18px;
          padding: 4px;
          border: 1px solid #dce3ef;
          border-radius: 14px;
          background: #f6f9ff;
        }
        .notif-template-variant-tab {
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #46566f;
          min-height: 38px;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 850;
          cursor: pointer;
        }
        .notif-template-variant-tab.is-active {
          background: #ffffff;
          color: var(--notif-blue);
          box-shadow: 0 5px 14px rgba(15, 98, 254, 0.13), inset 0 0 0 1px rgba(15, 98, 254, 0.14);
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
          .notif-sender-card {
            margin: 0 0 16px;
            padding: 16px;
            border-radius: 14px;
          }
          .notif-sender-head {
            display: grid;
            gap: 10px;
          }
          .notif-sender-options,
          .notif-sender-fields {
            grid-template-columns: 1fr;
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
          .notif-event-row .gapp-switch {
            grid-area: switch;
            align-self: center;
            justify-self: end;
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
          .notif-online-toggle-row {
            margin-bottom: 12px;
            padding: 12px 13px;
          }
          .notif-template-variant-tabs {
            margin-bottom: 12px;
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
          {channelAvailability.email ? (
            <section className="notif-sender-card" aria-label="Pošiljatelj e-pošte">
              <div className="notif-sender-head">
                <span>
                  <h3>Pošiljatelj e-pošte</h3>
                  <p>
                    Izberite, ali se e-poštna obvestila strankam pošiljajo iz
                    Calendra domene ali iz preverjene domene najemnika.
                  </p>
                </span>
                <span
                  className={
                    customDomainVerified
                      ? "notif-sender-status is-ready"
                      : "notif-sender-status"
                  }
                >
                  {customDomainVerified ? "Domena preverjena" : "Domena ni preverjena"}
                </span>
              </div>
              <div className="notif-sender-options">
                <button
                  type="button"
                  className={
                    effectiveEmailSenderMode === "DEFAULT_CALENDRA"
                      ? "notif-sender-option is-active"
                      : "notif-sender-option"
                  }
                  onClick={() => selectEmailSenderMode("DEFAULT_CALENDRA")}
                >
                  <span className="notif-sender-radio" aria-hidden />
                  <span>
                    <strong>Calendra domena</strong>
                    <span>Calendra &lt;no-reply@calendra.si&gt;</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={[
                    effectiveEmailSenderMode === "CUSTOM_DOMAIN"
                      ? "notif-sender-option is-active"
                      : "notif-sender-option",
                    customDomainVerified ? "" : "is-disabled",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!customDomainVerified}
                  onClick={() => selectEmailSenderMode("CUSTOM_DOMAIN")}
                >
                  <span className="notif-sender-radio" aria-hidden />
                  <span>
                    <strong>Lastna domena</strong>
                    <span>
                      {customFromName || "Naziv pošiljatelja"} &lt;
                      {customFromEmail || "info@domena.si"}&gt;
                    </span>
                  </span>
                </button>
              </div>
              {effectiveEmailSenderMode === "CUSTOM_DOMAIN" ? (
                <>
                  <div className="notif-sender-fields">
                    <span className="notif-sender-field">
                      <label htmlFor="notif-custom-from-name">Naziv pošiljatelja</label>
                      <input
                        id="notif-custom-from-name"
                        value={customFromName}
                        onChange={(event) =>
                          setEmailSenderSetting(
                            EMAIL_CUSTOM_FROM_NAME_KEY,
                            event.target.value,
                          )
                        }
                        placeholder="Inštitut Avisensa"
                      />
                    </span>
                    <span className="notif-sender-field">
                      <label htmlFor="notif-custom-from-email">E-poštni naslov</label>
                      <input
                        id="notif-custom-from-email"
                        value={customFromEmail}
                        onChange={(event) =>
                          setEmailSenderSetting(
                            EMAIL_CUSTOM_FROM_EMAIL_KEY,
                            event.target.value,
                          )
                        }
                        placeholder="info@avisensa.com"
                      />
                    </span>
                    <span className="notif-sender-field">
                      <label htmlFor="notif-custom-reply-to">Odgovori na</label>
                      <input
                        id="notif-custom-reply-to"
                        value={customReplyToEmail}
                        onChange={(event) =>
                          setEmailSenderSetting(
                            EMAIL_CUSTOM_REPLY_TO_EMAIL_KEY,
                            event.target.value,
                          )
                        }
                        placeholder="info@avisensa.com"
                      />
                    </span>
                    <span className="notif-sender-field">
                      <label htmlFor="notif-custom-domain">Preverjena domena</label>
                      <input
                        id="notif-custom-domain"
                        value={customDomain}
                        readOnly
                        aria-readonly="true"
                        placeholder="Domena ni nastavljena"
                      />
                    </span>
                  </div>
                  <p className="notif-sender-note">
                    Preverjena domena je nastavljena v Platform Adminu in je v
                    nastavitvah najemnika ni mogoče urejati. Varnostna in
                    platformna sporočila ostanejo poslana iz Calendra domene.
                    {!customSenderDomainMatches && customFromEmail ? (
                      <>
                        {" "}
                        E-poštni naslov se mora ujemati s preverjeno domeno, da
                        bo pošiljanje prek lastne domene uspešno.
                      </>
                    ) : null}
                  </p>
                </>
              ) : null}
            </section>
          ) : null}
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
                  {visibleNotificationEvents.map((event, index) => {
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
                    const previousCategory =
                      index > 0 ? visibleNotificationEvents[index - 1].category : null;
                    const groupLabel =
                      event.category === "bookings"
                        ? "Rezervacije"
                        : event.category === "waitlist"
                          ? "Čakalna vrsta"
                          : "Računi";
                    return (
                      <div key={`${channel}-${event.id}-group`} style={{ display: "contents" }}>
                        {previousCategory !== event.category ? (
                          <div className="notif-event-group-title">{groupLabel}</div>
                        ) : null}
                      <div
                        className={
                          isEditing
                            ? "notif-event-row is-editing"
                            : "notif-event-row"
                        }
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
                      {selectedEvent.id === "invoiceDelivery"
                        ? "Uredite vsebino e-pošte, ki bo poslana gostu ob dostavi računa."
                        : channel === "email"
                          ? "Uredite vsebino e-pošte, ki bo poslana gostu ob izbranem dogodku."
                          : channel === "sms"
                          ? "Uredite kratko SMS sporočilo, ki bo poslano gostu ob izbranem dogodku."
                          : "Uredite obvestilo, ki se prikaže gostu v aplikaciji."}
                    </p>
                    {onlineSessionBookingEnabled &&
                    selectedEvent.id !== "invoiceDelivery" &&
                    selectedEvent.supportsOnline !== false ? (
                      <div className="notif-online-toggle-row">
                        <span className="notif-online-toggle-copy">
                          <strong>Online</strong>
                          <span>
                            Uporabi posebno predlogo za online termine.
                          </span>
                        </span>
                        <NotificationSwitch
                          checked={selectedOnlineTemplateEnabled}
                          onChange={(checked) =>
                            setOnlineTemplateEnabled(selectedEvent.id, checked)
                          }
                        />
                      </div>
                    ) : null}
                    {onlineSessionBookingEnabled &&
                    selectedEvent.id !== "invoiceDelivery" &&
                    selectedEvent.supportsOnline !== false &&
                    selectedOnlineTemplateEnabled ? (
                      <div
                        className="notif-template-variant-tabs"
                        role="tablist"
                        aria-label="Vrsta predloge"
                      >
                        <button
                          type="button"
                          className={
                            selectedTemplateVariant === "regular"
                              ? "notif-template-variant-tab is-active"
                              : "notif-template-variant-tab"
                          }
                          onClick={() => {
                            setPreviewTemplate(false);
                            setTemplateVariant("regular");
                          }}
                          role="tab"
                          aria-selected={selectedTemplateVariant === "regular"}
                        >
                          Običajna seja
                        </button>
                        <button
                          type="button"
                          className={
                            selectedTemplateVariant === "online"
                              ? "notif-template-variant-tab is-active"
                              : "notif-template-variant-tab"
                          }
                          onClick={() => {
                            setPreviewTemplate(false);
                            setTemplateVariant("online");
                          }}
                          role="tab"
                          aria-selected={selectedTemplateVariant === "online"}
                        >
                          Online seja
                        </button>
                      </div>
                    ) : null}
                    <div className="notif-template-field">
                      <label
                        htmlFor={`notif-template-title-${channel}-${selectedEvent.id}-${selectedTemplateVariant}`}
                      >
                        {channel === "email" ? "Zadeva e-pošte" : "Naslov"}
                      </label>
                      <input
                        id={`notif-template-title-${channel}-${selectedEvent.id}-${selectedTemplateVariant}`}
                        className="notif-template-input"
                        value={getNotificationTemplateTitle(
                          settings,
                          channel,
                          selectedEvent.id,
                          selectedTemplateVariant,
                        )}
                        onChange={(event) =>
                          setTemplateTitle(selectedEvent.id, event.target.value)
                        }
                      />
                    </div>
                    <div className="notif-template-field">
                      <label
                        htmlFor={`notif-template-body-${channel}-${selectedEvent.id}-${selectedTemplateVariant}`}
                      >
                        {channel === "email" ? "Vsebina e-pošte" : "Vsebina"}
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
                                selectedTemplateVariant,
                              ).trim()
                                ? "notif-template-preview-pane"
                                : "notif-template-preview-pane notif-template-preview-empty"
                            }
                          >
                            {getNotificationTemplateBody(
                              settings,
                              channel,
                              selectedEvent.id,
                              selectedTemplateVariant,
                            ).trim()
                              ? getTemplatePreviewText(
                                  getNotificationTemplateBody(
                                    settings,
                                    channel,
                                    selectedEvent.id,
                                    selectedTemplateVariant,
                                  ),
                                )
                              : "Predloga je prazna."}
                          </div>
                        ) : (
                          <div
                            ref={templateBodyRef}
                            id={`notif-template-body-${channel}-${selectedEvent.id}-${selectedTemplateVariant}`}
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
                      {availableTagsLabel(locale)}
                      <div className="notif-template-tag-list">
                        {(selectedEvent.id === "invoiceDelivery"
                          ? invoiceDeliveryTemplateTags
                          : selectedTemplateVariant === "online"
                            ? channel === "email" && selectedEventSupportsBookingManageTags
                              ? onlineEmailNotificationTemplateTags
                              : onlineNotificationTemplateTags
                            : channel === "email" && selectedEventSupportsBookingManageTags
                              ? emailNotificationTemplateTags
                              : notificationTemplateTags
                        ).map((tag) => (
                          <button
                            key={tag.token}
                            type="button"
                            className="notif-template-tag"
                            onClick={() =>
                              appendTemplateToken(selectedEvent.id, tag.token)
                            }
                            title={tag.token}
                          >
                            {templateTagButtonText(tag, locale)}
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
