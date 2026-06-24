import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  BillingSaveIcon,
  BillingUploadIcon,
} from "./configuration/ConfigurationVisualComponents";

const GIFT_CARD_SETTINGS_KEY = "BILLING_GIFT_CARD_SETTINGS_JSON";
const MAX_BACKGROUND_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type GiftCardSettings = {
  from: string;
  to: string;
  value: string;
  expires: string;
  text: string;
  backgroundImageDataUrl: string;
  backgroundImageName: string;
};

const DEFAULT_GIFT_CARD_SETTINGS: GiftCardSettings = {
  from: "Ana",
  to: "Marko",
  value: "€50",
  expires: "31. 12. 2026",
  text: "Vse najboljše! Uživaj v darilu.",
  backgroundImageDataUrl: "",
  backgroundImageName: "",
};

function parseGiftCardSettings(raw: string | undefined): GiftCardSettings {
  if (!raw) return DEFAULT_GIFT_CARD_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<GiftCardSettings>;
    return {
      from: cleanText(parsed.from, DEFAULT_GIFT_CARD_SETTINGS.from),
      to: cleanText(parsed.to, DEFAULT_GIFT_CARD_SETTINGS.to),
      value: cleanText(parsed.value, DEFAULT_GIFT_CARD_SETTINGS.value),
      expires: cleanText(parsed.expires, DEFAULT_GIFT_CARD_SETTINGS.expires),
      text: cleanText(parsed.text, DEFAULT_GIFT_CARD_SETTINGS.text),
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
        .billing-gift-card-row {
          display: grid;
          grid-template-columns: 105px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }
        .billing-gift-card-row .billing-label {
          padding-top: 14px;
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
          .billing-gift-card-row { grid-template-columns: 1fr; gap: 8px; }
          .billing-gift-card-row .billing-label { padding-top: 0; }
          .billing-gift-card-upload-grid { grid-template-columns: 1fr; }
          .billing-gift-card-actions { flex-direction: column; align-items: stretch; }
          .billing-gift-card-preview-shell { padding: 14px; }
          .billing-gift-card-preview { min-height: 420px; }
          .billing-gift-card-preview-content { width: 100%; padding: 28px; }
          .billing-gift-card-ribbon { right: 18px; top: auto; bottom: 18px; width: 148px; height: 148px; opacity: .20; }
        }
      `}</style>

      <div className="billing-card billing-gift-card-form-card">
        <div className="billing-section-heading-row">
          <span className="billing-section-icon" aria-hidden="true">
            <GiftCardIcon />
          </span>
          <span>
            <h3 className="billing-section-title">
              {isSl ? "Nastavitve darilnega bona" : "Gift card settings"}
            </h3>
            <span className="billing-section-kicker">
              {isSl
                ? "Določite besedila, prikaz vrednosti in ozadje darilnega bona."
                : "Define the displayed text, value and background image for gift cards."}
            </span>
          </span>
        </div>

        <div className="billing-gift-card-form">
          <GiftCardInputRow label={isSl ? "Od" : "From"}>
            <input
              className="billing-input"
              value={giftCard.from}
              onChange={(event) => updateGiftCard({ from: event.target.value })}
              placeholder={isSl ? "Npr. Ana" : "e.g. Ana"}
            />
          </GiftCardInputRow>
          <GiftCardInputRow label={isSl ? "Za" : "To"}>
            <input
              className="billing-input"
              value={giftCard.to}
              onChange={(event) => updateGiftCard({ to: event.target.value })}
              placeholder={isSl ? "Npr. Marko" : "e.g. Marko"}
            />
          </GiftCardInputRow>
          <GiftCardInputRow label={isSl ? "Vrednost" : "Value"}>
            <input
              className="billing-input"
              value={giftCard.value}
              onChange={(event) => updateGiftCard({ value: event.target.value })}
              placeholder="€50"
            />
          </GiftCardInputRow>
          <GiftCardInputRow label={isSl ? "Poteče" : "Expires"}>
            <input
              className="billing-input"
              value={giftCard.expires}
              onChange={(event) => updateGiftCard({ expires: event.target.value })}
              placeholder="31. 12. 2026"
            />
          </GiftCardInputRow>
          <GiftCardInputRow label={isSl ? "Besedilo" : "Text"}>
            <div className="billing-gift-card-textarea-wrap">
              <textarea
                className="billing-textarea"
                value={giftCard.text}
                onChange={(event) => updateGiftCard({ text: event.target.value.slice(0, 200) })}
                placeholder={isSl ? "Kratko osebno sporočilo ..." : "Short personal message ..."}
                maxLength={200}
              />
              <span className="billing-gift-card-counter">{textLength} / 200</span>
            </div>
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
                ? "Predogled se sproti posodablja glede na vnesena polja."
                : "The preview updates immediately as you edit the fields."}
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
            <div className="billing-gift-card-ribbon" aria-hidden="true">
              <GiftRibbonIllustration />
            </div>
            <div className="billing-gift-card-preview-content">
              <GiftCardPreviewLine label={isSl ? "Od" : "From"} value={giftCard.from} />
              <GiftCardPreviewLine label={isSl ? "Za" : "To"} value={giftCard.to} />
              <span className="billing-gift-card-preview-label">
                {isSl ? "Vrednost" : "Value"}
              </span>
              <p className="billing-gift-card-preview-value">{giftCard.value || "€0"}</p>
              <div className="billing-gift-card-preview-line" style={{ marginTop: 18 }}>
                <span className="billing-gift-card-preview-label">
                  {isSl ? "Poteče" : "Expires"}
                </span>
                <span className="billing-gift-card-preview-date">
                  {giftCard.expires || "—"}
                </span>
              </div>
              <div>
                <span className="billing-gift-card-preview-label">
                  {isSl ? "Besedilo" : "Text"}
                </span>
                <span className="billing-gift-card-preview-text">
                  {giftCard.text || "—"}
                </span>
              </div>
            </div>
          </div>
          <p className="billing-gift-card-note">
            {isSl
              ? "Shranjena nastavitev bo uporabljena kot osnova za prikaz darilnega bona. Dinamične podatke naročila lahko kasneje povežemo z dejanskim kupcem, prejemnikom, vrednostjo in rokom veljavnosti."
              : "The saved settings are used as the base gift card layout. Dynamic order data can later be connected to the actual buyer, recipient, value and expiry date."}
          </p>
        </div>
      </div>
    </div>
  );
}

function GiftCardInputRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="billing-gift-card-row">
      <span className="billing-label">{label}</span>
      {children}
    </label>
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
