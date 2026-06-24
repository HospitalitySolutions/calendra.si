import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  BillingSaveIcon,
  BillingUploadIcon,
} from "./configuration/ConfigurationVisualComponents";

const GIFT_CARD_SETTINGS_KEY = "BILLING_GIFT_CARD_SETTINGS_JSON";
const MAX_BACKGROUND_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type GiftCardSettings = {
  active: boolean;
  showFrom: boolean;
  showTo: boolean;
  showValue: boolean;
  showExpires: boolean;
  showText: boolean;
  showCode: boolean;
  from: string;
  to: string;
  value: string;
  expires: string;
  text: string;
  code: string;
  backgroundImageDataUrl: string;
  backgroundImageName: string;
};

const DEFAULT_GIFT_CARD_SETTINGS: GiftCardSettings = {
  active: true,
  showFrom: true,
  showTo: true,
  showValue: true,
  showExpires: true,
  showText: true,
  showCode: true,
  from: "Ana Novak",
  to: "Marko",
  value: "€50",
  expires: "31. 12. 2026",
  text: "Vse najboljše! Uživaj v darilu.",
  code: "GC-425-001",
  backgroundImageDataUrl: "",
  backgroundImageName: "",
};

function parseGiftCardSettings(raw: string | undefined): GiftCardSettings {
  if (!raw) return DEFAULT_GIFT_CARD_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<GiftCardSettings>;
    return {
      active: cleanBool(parsed.active, DEFAULT_GIFT_CARD_SETTINGS.active),
      showFrom: cleanBool(parsed.showFrom, DEFAULT_GIFT_CARD_SETTINGS.showFrom),
      showTo: cleanBool(parsed.showTo, DEFAULT_GIFT_CARD_SETTINGS.showTo),
      showValue: cleanBool(parsed.showValue, DEFAULT_GIFT_CARD_SETTINGS.showValue),
      showExpires: cleanBool(parsed.showExpires, DEFAULT_GIFT_CARD_SETTINGS.showExpires),
      showText: cleanBool(parsed.showText, DEFAULT_GIFT_CARD_SETTINGS.showText),
      showCode: cleanBool(parsed.showCode, DEFAULT_GIFT_CARD_SETTINGS.showCode),
      from: cleanText(parsed.from, DEFAULT_GIFT_CARD_SETTINGS.from),
      to: cleanText(parsed.to, DEFAULT_GIFT_CARD_SETTINGS.to),
      value: cleanText(parsed.value, DEFAULT_GIFT_CARD_SETTINGS.value),
      expires: cleanText(parsed.expires, DEFAULT_GIFT_CARD_SETTINGS.expires),
      text: cleanText(parsed.text, DEFAULT_GIFT_CARD_SETTINGS.text),
      code: cleanText(parsed.code, DEFAULT_GIFT_CARD_SETTINGS.code),
      backgroundImageDataUrl: cleanText(parsed.backgroundImageDataUrl, ""),
      backgroundImageName: cleanText(parsed.backgroundImageName, ""),
    };
  } catch {
    return DEFAULT_GIFT_CARD_SETTINGS;
  }
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function cleanBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.trim().toLowerCase() === "true") return true;
    if (value.trim().toLowerCase() === "false") return false;
  }
  return fallback;
}

function serializeGiftCardSettings(settings: GiftCardSettings): string {
  return JSON.stringify(settings);
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

export function ConfigurationGiftCardSection({
  settings,
  setSettings,
  savingSettings,
  onSave,
  locale,
}: {
  settings: Record<string, string>;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  savingSettings: boolean;
  onSave: () => void | Promise<void>;
  locale: string;
}) {
  const isSl = locale === "sl";
  const giftCard = parseGiftCardSettings(settings[GIFT_CARD_SETTINGS_KEY]);
  const textLength = giftCard.text.length;

  const updateGiftCard = (patch: Partial<GiftCardSettings>) => {
    setSettings((prev) => {
      const current = parseGiftCardSettings(prev[GIFT_CARD_SETTINGS_KEY]);
      return {
        ...prev,
        [GIFT_CARD_SETTINGS_KEY]: serializeGiftCardSettings({
          ...current,
          ...patch,
        }),
      };
    });
  };

  const handleBackgroundUpload = async (file: File | null) => {
    if (!file) return;
    const acceptedTypes = new Set(["image/jpeg", "image/jpg", "image/png"]);
    if (!acceptedTypes.has(file.type.toLowerCase())) {
      window.alert(isSl ? "Naložite sliko v formatu JPG ali PNG." : "Upload a JPG or PNG image.");
      return;
    }
    if (file.size > MAX_BACKGROUND_IMAGE_SIZE_BYTES) {
      window.alert(
        isSl
          ? "Slika je prevelika. Največja dovoljena velikost je 5 MB."
          : "The image is too large. Maximum allowed size is 5 MB.",
      );
      return;
    }
    try {
      const backgroundImageDataUrl = await readFileAsDataUrl(file);
      updateGiftCard({
        backgroundImageDataUrl,
        backgroundImageName: `${file.name} · ${formatFileSize(file.size)}`,
      });
    } catch {
      window.alert(
        isSl
          ? "Slike ni bilo mogoče prebrati. Poskusite z drugo sliko."
          : "The image could not be read. Try another image.",
      );
    }
  };

  return (
    <div className="billing-gift-card-section">
      <style>{`
        .billing-gift-card-section {
          display: grid;
          grid-template-columns: minmax(420px, 0.85fr) minmax(520px, 1.15fr);
          gap: 22px;
          align-items: start;
        }
        .billing-gift-card-form-card,
        .billing-gift-card-preview-card {
          padding: 26px;
        }
        .billing-gift-card-form {
          display: grid;
          gap: 16px;
        }
        .billing-gift-card-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 22px;
        }
        .billing-gift-card-active-toggle {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 9px 12px;
          border: 1px solid #dbe4f0;
          border-radius: 999px;
          background: #fff;
          color: #0f172a;
          font-size: 13px;
          font-weight: 900;
          white-space: nowrap;
        }
        .billing-gift-card-active-toggle input,
        .billing-gift-card-field-check input {
          width: 17px;
          height: 17px;
          accent-color: var(--billing-blue);
          cursor: pointer;
        }
        .billing-gift-card-row {
          display: grid;
          grid-template-columns: 132px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }
        .billing-gift-card-field-check {
          display: flex;
          align-items: center;
          gap: 9px;
          padding-top: 13px;
          color: #0f172a;
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
        }
        .billing-gift-card-dynamic-help {
          margin: 7px 0 0;
          color: var(--billing-muted);
          font-size: 12px;
          line-height: 1.35;
          font-weight: 700;
        }
        .billing-gift-card-textarea-wrap {
          position: relative;
        }
        .billing-gift-card-textarea-wrap .billing-textarea {
          min-height: 116px;
          padding-bottom: 34px;
        }
        .billing-gift-card-counter {
          position: absolute;
          right: 12px;
          bottom: 10px;
          color: var(--billing-muted);
          font-size: 12px;
          font-weight: 750;
        }
        .billing-gift-card-divider {
          height: 1px;
          background: #e8eef6;
          margin: 4px 0 2px;
        }
        .billing-gift-card-upload-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 158px;
          gap: 16px;
          align-items: stretch;
        }
        .billing-gift-card-upload {
          position: relative;
          min-height: 88px;
          border: 1.5px dashed rgba(37, 99, 235, 0.55);
          border-radius: 15px;
          background: linear-gradient(180deg, #fff, #f8fbff);
          color: var(--billing-blue);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 16px;
          cursor: pointer;
          text-align: left;
          transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .billing-gift-card-upload:hover {
          border-color: var(--billing-blue);
          background: #eff6ff;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
        }
        .billing-gift-card-upload input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .billing-gift-card-upload strong {
          display: block;
          font-size: 14px;
          color: var(--billing-blue);
          font-weight: 900;
        }
        .billing-gift-card-upload span span {
          display: block;
          margin-top: 4px;
          color: var(--billing-muted);
          font-size: 12px;
          font-weight: 700;
        }
        .billing-gift-card-thumb {
          position: relative;
          min-height: 88px;
          border: 1px solid #e2e8f0;
          border-radius: 15px;
          background: linear-gradient(135deg, #f8fafc 0%, #eef2f7 48%, #f8fbff 100%);
          overflow: hidden;
        }
        .billing-gift-card-thumb.has-image {
          background-size: cover;
          background-position: center;
        }
        .billing-gift-card-thumb-remove {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 26px;
          height: 26px;
          border: 0;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          color: #64748b;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
          cursor: pointer;
          font-weight: 900;
        }
        .billing-gift-card-thumb-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 800;
          padding: 14px;
          text-align: center;
        }
        .billing-gift-card-file-name {
          margin: 10px 0 0;
          color: var(--billing-muted);
          font-size: 12.5px;
          line-height: 1.4;
          word-break: break-word;
        }
        .billing-gift-card-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 4px;
        }
        .billing-gift-card-preview-shell {
          margin-top: 22px;
          border-radius: 22px;
          padding: 28px;
          background: #f8fafc;
          border: 1px solid #e8eef6;
        }
        .billing-gift-card-preview {
          position: relative;
          min-height: 360px;
          border-radius: 21px;
          overflow: hidden;
          color: #2c241b;
          background:
            radial-gradient(circle at 82% 20%, rgba(255,255,255,.7), transparent 28%),
            linear-gradient(120deg, rgba(255, 252, 247, .94) 0%, rgba(248, 236, 219, .78) 46%, rgba(221, 199, 168, .72) 100%);
          box-shadow: 0 24px 50px rgba(69, 53, 31, 0.18);
          isolation: isolate;
        }
        .billing-gift-card-preview.has-image {
          background-size: cover;
          background-position: center;
        }
        .billing-gift-card-preview::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(255,255,255,.90) 0%, rgba(255,255,255,.76) 40%, rgba(255,255,255,.18) 74%, rgba(255,255,255,.06) 100%);
          z-index: -1;
        }
        .billing-gift-card-preview::after {
          content: '';
          position: absolute;
          width: 315px;
          height: 315px;
          right: -82px;
          bottom: -110px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(184, 137, 62, .30), rgba(184, 137, 62, 0) 66%);
          z-index: -1;
        }
        .billing-gift-card-code {
          position: absolute;
          top: 28px;
          right: 32px;
          z-index: 2;
          padding: 8px 11px;
          border: 1px solid rgba(184, 137, 62, .38);
          border-radius: 999px;
          background: rgba(255,255,255,.72);
          color: #654a1e;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .billing-gift-card-ribbon {
          position: absolute;
          right: 58px;
          top: 78px;
          width: 210px;
          height: 210px;
          opacity: .45;
          color: #b78a42;
          pointer-events: none;
        }
        .billing-gift-card-ribbon svg {
          width: 100%;
          height: 100%;
        }
        .billing-gift-card-preview-content {
          width: min(430px, 58%);
          padding: 38px 42px;
        }
        .billing-gift-card-preview-label {
          display: block;
          margin-bottom: 7px;
          color: #654a1e;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .billing-gift-card-preview-line {
          padding-bottom: 14px;
          margin-bottom: 17px;
          border-bottom: 1px solid rgba(184, 137, 62, .48);
        }
        .billing-gift-card-preview-name,
        .billing-gift-card-preview-date,
        .billing-gift-card-preview-text {
          color: #30261d;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 28px;
          line-height: 1.08;
          word-break: break-word;
        }
        .billing-gift-card-preview-value {
          margin: 0;
          color: #b78a42;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(54px, 5.2vw, 84px);
          line-height: .96;
          font-weight: 500;
          letter-spacing: -0.06em;
          word-break: break-word;
        }
        .billing-gift-card-preview-date {
          font-size: 25px;
        }
        .billing-gift-card-preview-text {
          font-size: 20px;
          line-height: 1.3;
        }
        .billing-gift-card-note {
          margin: 14px 0 0;
          color: var(--billing-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        @media (max-width: 1180px) {
          .billing-gift-card-section { grid-template-columns: 1fr; }
          .billing-gift-card-preview-content { width: min(500px, 70%); }
        }
        @media (max-width: 780px) {
          .billing-gift-card-form-card,
          .billing-gift-card-preview-card { padding: 22px; }
          .billing-gift-card-heading { align-items: stretch; flex-direction: column; }
          .billing-gift-card-row { grid-template-columns: 1fr; gap: 8px; }
          .billing-gift-card-field-check { padding-top: 0; }
          .billing-gift-card-upload-grid { grid-template-columns: 1fr; }
          .billing-gift-card-actions { flex-direction: column; align-items: stretch; }
          .billing-gift-card-preview-shell { padding: 14px; }
          .billing-gift-card-preview { min-height: 420px; }
          .billing-gift-card-preview-content { width: 100%; padding: 28px; }
          .billing-gift-card-code { top: 18px; right: 18px; }
          .billing-gift-card-ribbon { right: 18px; top: auto; bottom: 18px; width: 148px; height: 148px; opacity: .20; }
        }
      `}</style>

      <div className="billing-card billing-gift-card-form-card">
        <div className="billing-gift-card-heading">
          <div className="billing-section-heading-row" style={{ marginBottom: 0 }}>
            <span className="billing-section-icon" aria-hidden="true">
              <GiftCardIcon />
            </span>
            <span>
              <h3 className="billing-section-title">
                {isSl ? "Nastavitve darilnega bona" : "Gift card settings"}
              </h3>
              <span className="billing-section-kicker">
                {isSl
                  ? "Izberite, katera polja se prikažejo na darilnem bonu. Dinamični podatki pridejo iz dejanske ugodnosti."
                  : "Choose which fields appear on the gift card. Dynamic values come from the actual entitlement."}
              </span>
            </span>
          </div>
          <label className="billing-gift-card-active-toggle">
            <input
              type="checkbox"
              checked={giftCard.active}
              onChange={(event) => updateGiftCard({ active: event.target.checked })}
            />
            {isSl ? "Aktivno" : "Active"}
          </label>
        </div>

        <div className="billing-gift-card-form">
          <GiftCardInputRow
            label={isSl ? "Od" : "From"}
            checked={giftCard.showFrom}
            onCheckedChange={(checked) => updateGiftCard({ showFrom: checked })}
          >
            <input className="billing-input" value={giftCard.from} onChange={(event) => updateGiftCard({ from: event.target.value })} />
            <p className="billing-gift-card-dynamic-help">
              {isSl ? "Na dejanskem bonu se vzame iz imena in priimka stranke, kateri je ugodnost izdana." : "On the real gift card this is taken from the client name the entitlement is issued to."}
            </p>
          </GiftCardInputRow>
          <GiftCardInputRow
            label={isSl ? "Za" : "To"}
            checked={giftCard.showTo}
            onCheckedChange={(checked) => updateGiftCard({ showTo: checked })}
          >
            <input className="billing-input" value={giftCard.to} onChange={(event) => updateGiftCard({ to: event.target.value })} placeholder={isSl ? "Predogled" : "Preview"} />
            <p className="billing-gift-card-dynamic-help">
              {isSl ? "Pri nakupu darilne kartice se po kliku Odpri račun odpre majhen vnos. Če ostane prazno, se polje ne prikaže." : "When buying a gift card, a small input opens after Open bill. If blank, this field is hidden."}
            </p>
          </GiftCardInputRow>
          <GiftCardInputRow
            label={isSl ? "Vrednost" : "Value"}
            checked={giftCard.showValue}
            onCheckedChange={(checked) => updateGiftCard({ showValue: checked })}
          >
            <input className="billing-input" value={giftCard.value} onChange={(event) => updateGiftCard({ value: event.target.value })} />
            <p className="billing-gift-card-dynamic-help">
              {isSl ? "Na dejanskem bonu se vzame iz vrednosti kupljene darilne kartice." : "On the real gift card this is taken from the purchased gift card value."}
            </p>
          </GiftCardInputRow>
          <GiftCardInputRow
            label={isSl ? "Poteče" : "Expires"}
            checked={giftCard.showExpires}
            onCheckedChange={(checked) => updateGiftCard({ showExpires: checked })}
          >
            <input className="billing-input" value={giftCard.expires} onChange={(event) => updateGiftCard({ expires: event.target.value })} />
            <p className="billing-gift-card-dynamic-help">
              {isSl ? "Na dejanskem bonu se vzame iz roka veljavnosti darilne kartice." : "On the real gift card this is taken from the actual gift card expiry date."}
            </p>
          </GiftCardInputRow>
          <GiftCardInputRow
            label={isSl ? "Besedilo" : "Text"}
            checked={giftCard.showText}
            onCheckedChange={(checked) => updateGiftCard({ showText: checked })}
          >
            <div className="billing-gift-card-textarea-wrap">
              <textarea
                className="billing-textarea"
                value={giftCard.text}
                onChange={(event) => updateGiftCard({ text: event.target.value.slice(0, 200) })}
                placeholder={isSl ? "Predogled osebnega sporočila ..." : "Preview personal message ..."}
                maxLength={200}
              />
              <span className="billing-gift-card-counter">{textLength} / 200</span>
            </div>
            <p className="billing-gift-card-dynamic-help">
              {isSl ? "Pri nakupu darilne kartice se lahko vnese osebno sporočilo. Če ostane prazno, se polje ne prikaže." : "When buying a gift card, a personal message can be entered. If blank, this field is hidden."}
            </p>
          </GiftCardInputRow>
          <GiftCardInputRow
            label={isSl ? "Koda" : "Code"}
            checked={giftCard.showCode}
            onCheckedChange={(checked) => updateGiftCard({ showCode: checked })}
          >
            <input className="billing-input" value={giftCard.code} onChange={(event) => updateGiftCard({ code: event.target.value })} />
            <p className="billing-gift-card-dynamic-help">
              {isSl ? "Na dejanskem bonu se zgoraj desno prikaže unikatna koda izdane ugodnosti." : "On the real gift card the unique entitlement code is shown in the upper right."}
            </p>
          </GiftCardInputRow>

          <div className="billing-gift-card-divider" />

          <div>
            <span className="billing-label">
              {isSl ? "Ozadje darilnega bona" : "Gift card background"}
            </span>
            <div className="billing-gift-card-upload-grid" style={{ marginTop: 10 }}>
              <label className="billing-gift-card-upload">
                <BillingUploadIcon />
                <span>
                  <strong>{isSl ? "Naloži ozadje" : "Upload background"}</strong>
                  <span>{isSl ? "JPG ali PNG do 5 MB" : "JPG or PNG up to 5 MB"}</span>
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleBackgroundUpload(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <div
                className={
                  giftCard.backgroundImageDataUrl
                    ? "billing-gift-card-thumb has-image"
                    : "billing-gift-card-thumb"
                }
                style={
                  giftCard.backgroundImageDataUrl
                    ? { backgroundImage: `url(${giftCard.backgroundImageDataUrl})` }
                    : undefined
                }
              >
                {giftCard.backgroundImageDataUrl ? (
                  <button
                    type="button"
                    className="billing-gift-card-thumb-remove"
                    aria-label={isSl ? "Odstrani ozadje" : "Remove background"}
                    onClick={() => updateGiftCard({ backgroundImageDataUrl: "", backgroundImageName: "" })}
                  >
                    ×
                  </button>
                ) : (
                  <span className="billing-gift-card-thumb-placeholder">
                    {isSl ? "Brez slike" : "No image"}
                  </span>
                )}
              </div>
            </div>
            {giftCard.backgroundImageName ? (
              <p className="billing-gift-card-file-name">{giftCard.backgroundImageName}</p>
            ) : null}
          </div>

          <div className="billing-gift-card-actions">
            <button
              type="button"
              className="billing-primary-button"
              onClick={() => void onSave()}
              disabled={savingSettings}
            >
              <BillingSaveIcon />
              {savingSettings ? (isSl ? "Shranjevanje ..." : "Saving ...") : isSl ? "Shrani" : "Save"}
            </button>
            <button
              type="button"
              className="billing-secondary-button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  [GIFT_CARD_SETTINGS_KEY]: serializeGiftCardSettings(DEFAULT_GIFT_CARD_SETTINGS),
                }))
              }
              disabled={savingSettings}
            >
              {isSl ? "Ponastavi" : "Reset"}
            </button>
          </div>
        </div>
      </div>

      <div className="billing-card billing-gift-card-preview-card">
        <div className="billing-section-heading-row" style={{ marginBottom: 0 }}>
          <span className="billing-section-icon" aria-hidden="true">
            <PreviewIcon />
          </span>
          <span>
            <h3 className="billing-section-title">
              {isSl ? "Predogled darilnega bona" : "Gift card preview"}
            </h3>
            <span className="billing-section-kicker">
              {isSl
                ? "Predogled prikazuje izbrana polja. Dejanske vrednosti se izpolnijo ob izdaji ugodnosti."
                : "The preview shows selected fields. Real values are filled when the entitlement is issued."}
            </span>
          </span>
        </div>

        <div className="billing-gift-card-preview-shell">
          <div
            className={
              giftCard.backgroundImageDataUrl
                ? "billing-gift-card-preview has-image"
                : "billing-gift-card-preview"
            }
            style={
              giftCard.backgroundImageDataUrl
                ? { backgroundImage: `url(${giftCard.backgroundImageDataUrl})` }
                : undefined
            }
          >
            {giftCard.showCode ? <span className="billing-gift-card-code">{giftCard.code || "—"}</span> : null}
            <div className="billing-gift-card-ribbon" aria-hidden="true">
              <GiftRibbonIllustration />
            </div>
            <div className="billing-gift-card-preview-content">
              {giftCard.showFrom ? <GiftCardPreviewLine label={isSl ? "Od" : "From"} value={giftCard.from} /> : null}
              {giftCard.showTo ? <GiftCardPreviewLine label={isSl ? "Za" : "To"} value={giftCard.to} /> : null}
              {giftCard.showValue ? (
                <>
                  <span className="billing-gift-card-preview-label">
                    {isSl ? "Vrednost" : "Value"}
                  </span>
                  <p className="billing-gift-card-preview-value">{giftCard.value || "€0"}</p>
                </>
              ) : null}
              {giftCard.showExpires ? (
                <div className="billing-gift-card-preview-line" style={{ marginTop: giftCard.showValue ? 18 : 0 }}>
                  <span className="billing-gift-card-preview-label">
                    {isSl ? "Poteče" : "Expires"}
                  </span>
                  <span className="billing-gift-card-preview-date">
                    {giftCard.expires || "—"}
                  </span>
                </div>
              ) : null}
              {giftCard.showText ? (
                <div>
                  <span className="billing-gift-card-preview-label">
                    {isSl ? "Besedilo" : "Text"}
                  </span>
                  <span className="billing-gift-card-preview-text">
                    {giftCard.text || "—"}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <p className="billing-gift-card-note">
            {isSl
              ? "Ko je nastavitev Aktivno vklopljena, se po plačilu darilne kartice gostu pošlje e-mail z darilnim bonom. Polji Za in Besedilo se prikažeta samo, če sta vključeni in ob nakupu izpolnjeni."
              : "When Active is enabled, the guest receives the gift card by email after payment. To and Text are shown only when enabled and filled during purchase."}
          </p>
        </div>
      </div>
    </div>
  );
}

function GiftCardInputRow({ label, checked, onCheckedChange, children }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <div className="billing-gift-card-row">
      <label className="billing-gift-card-field-check">
        <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
        <span>{label}</span>
      </label>
      <div>{children}</div>
    </div>
  );
}

function GiftCardPreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="billing-gift-card-preview-line">
      <span className="billing-gift-card-preview-label">{label}</span>
      <span className="billing-gift-card-preview-name">{value || "—"}</span>
    </div>
  );
}

function GiftCardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8v13M3 12h18" />
      <path d="M12 8H8.5a2.5 2.5 0 1 1 2.3-3.5L12 8Z" />
      <path d="M12 8h3.5a2.5 2.5 0 1 0-2.3-3.5L12 8Z" />
    </svg>
  );
}

function PreviewIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function GiftRibbonIllustration() {
  return (
    <svg viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <path d="M61 102h118v82a18 18 0 0 1-18 18H79a18 18 0 0 1-18-18v-82Z" fill="currentColor" opacity="0.22" />
      <path d="M48 78h144v33H48z" fill="currentColor" opacity="0.30" />
      <path d="M111 78h18v124h-18z" fill="currentColor" opacity="0.38" />
      <path d="M97 73c-38-41-75 15-30 26 18 4 35-7 44-19" stroke="currentColor" strokeWidth="13" strokeLinecap="round" opacity="0.34" />
      <path d="M143 73c38-41 75 15 30 26-18 4-35-7-44-19" stroke="currentColor" strokeWidth="13" strokeLinecap="round" opacity="0.34" />
      <circle cx="120" cy="83" r="17" fill="currentColor" opacity="0.48" />
    </svg>
  );
}
