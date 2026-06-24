import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { useMemo, useRef, useState } from "react";
import { useLocale, type AppLocale } from "../../locale";

type GeneralAppSettingsSectionProps = {
  settings: Record<string, string>;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => void | Promise<void>;
};

type GeneralCopy = {
  title: string;
  subtitle: string;
  localizationTitle: string;
  localizationSubtitle: string;
  contactTitle: string;
  contactSubtitle: string;
  brandingTitle: string;
  brandingSubtitle: string;
  publicName: string;
  publicNameHint: string;
  language: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  timeFormat: string;
  weekStart: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  logo: string;
  logoHint: string;
  uploadLogo: string;
  removeLogo: string;
  primaryColor: string;
  accentColor: string;
  preview: string;
  previewCaption: string;
  save: string;
  saving: string;
  unsupportedFile: string;
  tooLargeFile: string;
};

const TEXT: Record<AppLocale, GeneralCopy> = {
  en: {
    title: "General settings",
    subtitle:
      "Shared tenant defaults used by the admin app, guest app, public booking widget, invoices and notifications.",
    localizationTitle: "Language, time and currency",
    localizationSubtitle:
      "These defaults are used when a more specific module setting is not set.",
    contactTitle: "Public company and contact details",
    contactSubtitle:
      "Shown to guests in the app, website widget, invoices and communication templates.",
    brandingTitle: "Logo and colors",
    brandingSubtitle:
      "Used as the tenant brand fallback for guest-facing surfaces and invoices.",
    publicName: "Public company name",
    publicNameHint: "Name shown to guests. It can be different from the legal company name.",
    language: "Default language",
    timezone: "Time zone",
    currency: "Currency",
    dateFormat: "Date format",
    timeFormat: "Time format",
    weekStart: "Week starts on",
    phone: "Phone",
    email: "Email",
    website: "Website",
    address: "Address",
    logo: "Logo",
    logoHint: "PNG, JPG, WEBP or SVG. Recommended: transparent PNG. Max 1 MB.",
    uploadLogo: "Upload logo",
    removeLogo: "Remove logo",
    primaryColor: "Primary color",
    accentColor: "Accent color",
    preview: "Brand preview",
    previewCaption: "This shows how the public name, logo and colors will appear in guest-facing places.",
    save: "Save general settings",
    saving: "Saving…",
    unsupportedFile: "Please upload an image file.",
    tooLargeFile: "Logo is too large. Please upload an image up to 1 MB.",
  },
  sl: {
    title: "Splošne nastavitve",
    subtitle:
      "Skupne privzete nastavitve za administracijo, aplikacijo za stranke, spletni vtičnik, račune in obvestila.",
    localizationTitle: "Jezik, čas in valuta",
    localizationSubtitle:
      "Te vrednosti se uporabijo, kadar posamezen modul nima bolj specifične nastavitve.",
    contactTitle: "Javni naziv in kontaktni podatki",
    contactSubtitle:
      "Podatki so prikazani strankam v aplikaciji, spletnem vtičniku, računih in komunikacijskih predlogah.",
    brandingTitle: "Logotip in barve",
    brandingSubtitle:
      "Privzeta podoba najemnika za javne prikaze in račune.",
    publicName: "Javni naziv podjetja",
    publicNameHint: "Naziv, ki ga vidijo stranke. Lahko je drugačen od uradnega pravnega naziva.",
    language: "Privzeti jezik",
    timezone: "Časovni pas",
    currency: "Valuta",
    dateFormat: "Oblika datuma",
    timeFormat: "Oblika časa",
    weekStart: "Začetek tedna",
    phone: "Telefon",
    email: "E-pošta",
    website: "Spletna stran",
    address: "Naslov",
    logo: "Logotip",
    logoHint: "PNG, JPG, WEBP ali SVG. Priporočeno: prosojni PNG. Največ 1 MB.",
    uploadLogo: "Naloži logotip",
    removeLogo: "Odstrani logotip",
    primaryColor: "Glavna barva",
    accentColor: "Poudarjena barva",
    preview: "Predogled podobe",
    previewCaption: "Tako se javni naziv, logotip in barve prikažejo na mestih, ki jih vidijo stranke.",
    save: "Shrani splošne nastavitve",
    saving: "Shranjujem…",
    unsupportedFile: "Naložite slikovno datoteko.",
    tooLargeFile: "Logotip je prevelik. Naložite sliko do 1 MB.",
  },
};

const LANGUAGES: { value: AppLocale; en: string; sl: string }[] = [
  { value: "sl", en: "Slovenian", sl: "Slovenščina" },
  { value: "en", en: "English", sl: "Angleščina" },
];

const TIME_ZONES = [
  "Europe/Ljubljana",
  "Europe/Zagreb",
  "Europe/Vienna",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/London",
  "UTC",
];

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "HRK", "RSD", "BAM"];

const DATE_FORMATS = [
  { value: "DD_MM_YYYY", en: "31.12.2026", sl: "31.12.2026" },
  { value: "YYYY_MM_DD", en: "2026-12-31", sl: "2026-12-31" },
  { value: "MM_DD_YYYY", en: "12/31/2026", sl: "12/31/2026" },
];

const TIME_FORMATS = [
  { value: "24H", en: "24-hour time", sl: "24-urna oblika" },
  { value: "12H", en: "12-hour time", sl: "12-urna oblika" },
];

const WEEK_STARTS = [
  { value: "MONDAY", en: "Monday", sl: "Ponedeljek" },
  { value: "SUNDAY", en: "Sunday", sl: "Nedelja" },
  { value: "SATURDAY", en: "Saturday", sl: "Sobota" },
];

const DEFAULTS = {
  TENANT_DEFAULT_LANGUAGE: "sl",
  TENANT_TIME_ZONE: "Europe/Ljubljana",
  TENANT_CURRENCY: "EUR",
  TENANT_DATE_FORMAT: "DD_MM_YYYY",
  TENANT_TIME_FORMAT: "24H",
  TENANT_WEEK_START_DAY: "MONDAY",
  TENANT_PUBLIC_COMPANY_NAME: "",
  TENANT_CONTACT_PHONE: "",
  TENANT_CONTACT_EMAIL: "",
  TENANT_CONTACT_WEBSITE: "",
  TENANT_CONTACT_ADDRESS: "",
  TENANT_BRAND_LOGO_BASE64: "",
  TENANT_BRAND_PRIMARY_COLOR: "#2563EB",
  TENANT_BRAND_ACCENT_COLOR: "#22C55E",
} as const;

type GeneralKey = keyof typeof DEFAULTS;

const settingValue = (settings: Record<string, string>, key: GeneralKey) =>
  settings[key] || DEFAULTS[key];

const asColor = (value: string, fallback: string) =>
  /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : fallback;

export function GeneralAppSettingsSection({
  settings,
  setSettings,
  saving,
  onSave,
}: GeneralAppSettingsSectionProps) {
  const { locale, setLocale } = useLocale();
  const text = TEXT[locale];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileError, setFileError] = useState<string>("");

  const values = useMemo(
    () => ({
      language: settingValue(settings, "TENANT_DEFAULT_LANGUAGE") as AppLocale,
      timeZone: settingValue(settings, "TENANT_TIME_ZONE"),
      currency: settingValue(settings, "TENANT_CURRENCY"),
      dateFormat: settingValue(settings, "TENANT_DATE_FORMAT"),
      timeFormat: settingValue(settings, "TENANT_TIME_FORMAT"),
      weekStart: settingValue(settings, "TENANT_WEEK_START_DAY"),
      publicName: settingValue(settings, "TENANT_PUBLIC_COMPANY_NAME"),
      contactPhone: settingValue(settings, "TENANT_CONTACT_PHONE"),
      contactEmail: settingValue(settings, "TENANT_CONTACT_EMAIL"),
      contactWebsite: settingValue(settings, "TENANT_CONTACT_WEBSITE"),
      contactAddress: settingValue(settings, "TENANT_CONTACT_ADDRESS"),
      logo: settingValue(settings, "TENANT_BRAND_LOGO_BASE64"),
      primaryColor: asColor(
        settingValue(settings, "TENANT_BRAND_PRIMARY_COLOR"),
        DEFAULTS.TENANT_BRAND_PRIMARY_COLOR,
      ),
      accentColor: asColor(
        settingValue(settings, "TENANT_BRAND_ACCENT_COLOR"),
        DEFAULTS.TENANT_BRAND_ACCENT_COLOR,
      ),
    }),
    [settings],
  );

  const update = (key: GeneralKey, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateLanguage = (value: AppLocale) => {
    update("TENANT_DEFAULT_LANGUAGE", value);
    setLocale(value);
  };

  const onLogoSelected = (file: File | undefined) => {
    setFileError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError(text.unsupportedFile);
      return;
    }
    if (file.size > 1_000_000) {
      setFileError(text.tooLargeFile);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      update("TENANT_BRAND_LOGO_BASE64", result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="general-settings-shell">
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

      <div className="general-settings-grid">
        <article className="general-settings-card">
          <SectionHeader title={text.localizationTitle} subtitle={text.localizationSubtitle} />
          <div className="general-settings-form-grid">
            <Field label={text.language}>
              <select
                value={values.language}
                onChange={(event) => updateLanguage(event.target.value as AppLocale)}
              >
                {LANGUAGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {locale === "sl" ? option.sl : option.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={text.timezone}>
              <select
                value={values.timeZone}
                onChange={(event) => update("TENANT_TIME_ZONE", event.target.value)}
              >
                {TIME_ZONES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={text.currency}>
              <select
                value={values.currency}
                onChange={(event) => update("TENANT_CURRENCY", event.target.value)}
              >
                {CURRENCIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={text.dateFormat}>
              <select
                value={values.dateFormat}
                onChange={(event) => update("TENANT_DATE_FORMAT", event.target.value)}
              >
                {DATE_FORMATS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {locale === "sl" ? option.sl : option.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={text.timeFormat}>
              <select
                value={values.timeFormat}
                onChange={(event) => update("TENANT_TIME_FORMAT", event.target.value)}
              >
                {TIME_FORMATS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {locale === "sl" ? option.sl : option.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={text.weekStart}>
              <select
                value={values.weekStart}
                onChange={(event) => update("TENANT_WEEK_START_DAY", event.target.value)}
              >
                {WEEK_STARTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {locale === "sl" ? option.sl : option.en}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </article>

        <article className="general-settings-card general-settings-card--wide">
          <SectionHeader title={text.contactTitle} subtitle={text.contactSubtitle} />
          <div className="general-settings-form-grid">
            <Field label={text.publicName} hint={text.publicNameHint} className="general-settings-span-2">
              <input
                value={values.publicName}
                onChange={(event) => update("TENANT_PUBLIC_COMPANY_NAME", event.target.value)}
                placeholder="Calendra"
              />
            </Field>
            <Field label={text.phone}>
              <input
                value={values.contactPhone}
                onChange={(event) => update("TENANT_CONTACT_PHONE", event.target.value)}
                placeholder="+386 ..."
              />
            </Field>
            <Field label={text.email}>
              <input
                value={values.contactEmail}
                onChange={(event) => update("TENANT_CONTACT_EMAIL", event.target.value)}
                placeholder="info@example.com"
              />
            </Field>
            <Field label={text.website}>
              <input
                value={values.contactWebsite}
                onChange={(event) => update("TENANT_CONTACT_WEBSITE", event.target.value)}
                placeholder="https://example.com"
              />
            </Field>
            <Field label={text.address}>
              <input
                value={values.contactAddress}
                onChange={(event) => update("TENANT_CONTACT_ADDRESS", event.target.value)}
                placeholder={locale === "sl" ? "Ulica 1, 2000 Maribor" : "Street 1, City"}
              />
            </Field>
          </div>
        </article>

        <article className="general-settings-card general-settings-brand-card">
          <SectionHeader title={text.brandingTitle} subtitle={text.brandingSubtitle} />
          <div className="general-settings-brand-layout">
            <div className="general-settings-logo-box">
              {values.logo ? (
                <img src={values.logo} alt="" />
              ) : (
                <span>{values.publicName?.slice(0, 2).toUpperCase() || "CA"}</span>
              )}
            </div>
            <div className="general-settings-logo-actions">
              <strong>{text.logo}</strong>
              <p>{text.logoHint}</p>
              <div className="general-settings-button-row">
                <button
                  type="button"
                  className="general-settings-secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {text.uploadLogo}
                </button>
                {values.logo ? (
                  <button
                    type="button"
                    className="general-settings-ghost-button"
                    onClick={() => update("TENANT_BRAND_LOGO_BASE64", "")}
                  >
                    {text.removeLogo}
                  </button>
                ) : null}
              </div>
              {fileError ? <p className="general-settings-error">{fileError}</p> : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => onLogoSelected(event.target.files?.[0])}
              />
            </div>
          </div>
          <div className="general-settings-color-grid">
            <ColorField
              label={text.primaryColor}
              value={values.primaryColor}
              onChange={(value) => update("TENANT_BRAND_PRIMARY_COLOR", value)}
            />
            <ColorField
              label={text.accentColor}
              value={values.accentColor}
              onChange={(value) => update("TENANT_BRAND_ACCENT_COLOR", value)}
            />
          </div>
        </article>

        <aside
          className="general-settings-preview"
          style={{
            "--tenant-primary": values.primaryColor,
            "--tenant-accent": values.accentColor,
          } as CSSProperties}
        >
          <div className="general-settings-preview-topline" />
          <div className="general-settings-preview-logo">
            {values.logo ? <img src={values.logo} alt="" /> : <span>{values.publicName?.slice(0, 2).toUpperCase() || "CA"}</span>}
          </div>
          <h3>{values.publicName || "Calendra"}</h3>
          <p>{text.previewCaption}</p>
          <div className="general-settings-preview-pill">
            <span />
            {values.currency} · {values.timeZone}
          </div>
          <div className="general-settings-preview-contact">
            {values.contactPhone ? <span>{values.contactPhone}</span> : null}
            {values.contactEmail ? <span>{values.contactEmail}</span> : null}
            {values.contactWebsite ? <span>{values.contactWebsite}</span> : null}
          </div>
        </aside>
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

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className ? `general-settings-field ${className}` : "general-settings-field"}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="general-settings-color-field">
      <span>{label}</span>
      <div>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
        <input value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
      </div>
    </label>
  );
}
