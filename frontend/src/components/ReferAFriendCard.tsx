import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "../api";
import { useToast } from "./Toast";
import { useLocale } from "../locale";

type MyReferralLink = {
  code: string;
  url: string;
  referralsQualified: number;
  freeMonthsEarned: number;
  monthlyCap: number;
  capRemaining: number;
};

const referCardStyles = `
  .refer-page {
    display: grid;
    gap: 22px;
    padding: 28px;
    border-radius: 28px;
    background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.06);
  }
  .refer-page-header {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 18px;
    align-items: center;
  }
  .refer-page-icon {
    width: 64px;
    height: 64px;
    border-radius: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #eff6ff, #dbeafe);
    color: #2563eb;
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
  }
  .refer-page-header h3 {
    margin: 0;
    font-size: 2rem;
    line-height: 1.05;
    letter-spacing: -0.04em;
    color: #16325c;
  }
  .refer-page-header p {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 1rem;
    line-height: 1.55;
    max-width: 740px;
  }
  .refer-card-loading,
  .refer-card-error {
    padding: 16px 18px;
    border-radius: 18px;
    background: #f8fbff;
    border: 1px solid #dbe7f7;
    color: #516278;
    font-size: 0.95rem;
  }
  .refer-card-error {
    color: #b42318;
    background: #fff7f7;
    border-color: #f3c7c7;
  }
  .refer-main-card {
    display: grid;
    gap: 24px;
    padding: 28px;
    border-radius: 24px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    box-shadow: 0 18px 35px rgba(15, 23, 42, 0.04);
  }
  .refer-panel {
    display: grid;
    gap: 14px;
  }
  .refer-panel-label {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: #16325c;
  }
  .refer-link-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: stretch;
  }
  .refer-link-field {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    height: 56px;
    padding: 0 16px;
    border-radius: 16px;
    border: 1px solid #dbe7f7;
    background: #f8fbff;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
    color: #2563eb;
  }
  .refer-link-field input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #335074;
    font-size: 0.98rem;
    font-weight: 600;
  }
  .refer-copy-button {
    min-width: 196px;
    height: 56px;
    padding: 0 22px;
    border-radius: 16px;
    border: 0;
    background: linear-gradient(90deg, #2f6df6, #1f56d7);
    color: #fff;
    font-weight: 800;
    font-size: 0.98rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 14px 28px rgba(31, 86, 215, 0.24);
    transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease;
  }
  .refer-copy-button:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.02);
    box-shadow: 0 16px 32px rgba(31, 86, 215, 0.28);
  }
  .refer-copy-button:disabled,
  .refer-share-card:disabled {
    opacity: 0.66;
    cursor: default;
    box-shadow: none;
  }
  .refer-share-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .refer-share-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: center;
    width: 100%;
    min-height: 84px;
    padding: 16px 18px;
    border-radius: 18px;
    border: 1px solid #dbe7f7;
    background: #fff;
    color: #16325c;
    text-align: left;
    cursor: pointer;
    transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
  }
  .refer-share-card:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: #bfd4fb;
    box-shadow: 0 12px 24px rgba(37, 99, 235, 0.1);
  }
  .refer-share-card strong {
    display: block;
    font-size: 1rem;
    color: #16325c;
  }
  .refer-share-card span {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 0.88rem;
    font-weight: 600;
  }
  .refer-share-arrow {
    font-size: 1.4rem;
    line-height: 1;
    color: #16325c;
  }
  .refer-share-card--whatsapp { color: #25d366; }
  .refer-share-card--viber { color: #7360f2; }
  .refer-share-card--facebook { color: #1877f2; }
  .refer-share-card--instagram { color: #e1306c; }
  .refer-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }
  .refer-stat-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;
    align-items: center;
    padding: 22px;
    border-radius: 22px;
    border: 1px solid #e2e8f0;
    background: linear-gradient(180deg, #ffffff, #f8fbff);
  }
  .refer-stat-icon {
    width: 54px;
    height: 54px;
    flex: 0 0 54px;
    margin: 0;
    border-radius: 18px;
    display: inline-grid;
    place-items: center;
    line-height: 0;
  }
  .refer-stat-icon svg {
    display: block;
    width: 25px;
    height: 25px;
  }
  .refer-stat-icon--blue {
    background: #eaf1ff;
    color: #2563eb;
  }
  .refer-stat-icon--green {
    background: #eaf8ef;
    color: #16a34a;
  }
  .refer-stat-icon--amber {
    background: #fff4df;
    color: #d97706;
  }
  .refer-stat-card strong {
    display: block;
    color: #16325c;
    font-size: 1.9rem;
    line-height: 1;
    letter-spacing: -0.04em;
  }
  .refer-stat-card > div > span {
    display: block;
    margin-top: 8px;
    color: #64748b;
    font-size: 0.95rem;
    line-height: 1.45;
  }
  .refer-info {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 16px;
    align-items: start;
    padding: 18px 20px;
    border-radius: 20px;
    border: 1px solid #cfe0ff;
    background: linear-gradient(180deg, #f7fbff, #eef5ff);
    color: #16325c;
  }
  .refer-info-icon {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    color: #2563eb;
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
  }
  .refer-info p {
    margin: 0;
    font-size: 0.97rem;
    line-height: 1.6;
    color: #31537f;
  }
  @media (max-width: 1180px) {
    .refer-share-grid,
    .refer-stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 820px) {
    .refer-page,
    .refer-main-card,
    .refer-stat-card,
    .refer-info {
      padding: 22px;
      border-radius: 22px;
    }
    .refer-page-header {
      grid-template-columns: 1fr;
    }
    .refer-link-row {
      grid-template-columns: 1fr;
    }
    .refer-copy-button {
      width: 100%;
      min-width: 0;
    }
    .refer-share-grid,
    .refer-stats-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 560px) {
    .refer-page {
      width: 100%;
      min-height: 100dvh;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
      gap: 18px;
      align-content: start;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .refer-main-card,
    .refer-stat-card,
    .refer-info {
      padding: 18px;
      border-radius: 18px;
    }
    .refer-page-icon {
      width: 56px;
      height: 56px;
      border-radius: 18px;
    }
    .refer-page-header h3 {
      font-size: 1.65rem;
    }
    .refer-link-field {
      height: 52px;
      padding: 0 14px;
    }
    .refer-copy-button {
      height: 52px;
    }
    .refer-share-card {
      min-height: 78px;
      padding: 14px 16px;
    }
    .refer-stat-card {
      grid-template-columns: 1fr;
      justify-items: start;
    }
    .refer-info {
      grid-template-columns: 1fr;
    }
  }
`;

function ReferralHeaderIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <path fill="#fff" d="M23.5 8.45A10.45 10.45 0 0 0 7.06 21.04L5.58 26.5l5.58-1.46A10.46 10.46 0 0 0 26.5 15.8c0-2.79-1.08-5.4-3-7.35Zm-7.43 15.94c-1.54 0-3.04-.41-4.35-1.19l-.31-.18-3.31.87.88-3.23-.2-.33a8.5 8.5 0 1 1 7.29 4.06Zm4.67-6.36c-.26-.13-1.52-.75-1.76-.84-.24-.09-.42-.13-.59.13-.17.26-.68.84-.83 1.01-.15.17-.31.2-.57.07-.26-.13-1.1-.41-2.1-1.29a7.84 7.84 0 0 1-1.45-1.8c-.15-.26-.02-.4.11-.53.12-.12.26-.31.39-.46.13-.15.17-.26.26-.44.09-.17.04-.33-.02-.46-.07-.13-.59-1.42-.81-1.94-.21-.51-.43-.44-.59-.45h-.5c-.17 0-.46.07-.7.33-.24.26-.92.9-.92 2.2s.94 2.55 1.07 2.73c.13.17 1.85 2.83 4.49 3.97.63.27 1.12.43 1.5.55.63.2 1.2.17 1.65.1.5-.08 1.52-.62 1.74-1.22.22-.59.22-1.1.15-1.21-.06-.11-.24-.17-.5-.3Z" />
    </svg>
  );
}

function ViberIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <path fill="#fff" d="M22.8 8.8c-3.74-3.08-10.56-2.92-13.99.14-2.85 2.55-2.28 8.2-1.75 10.31.32 1.28 1.35 2.7 3.04 3.33l-.38 3.49a.74.74 0 0 0 1.15.7l3.83-2.65c2.48.16 5.63-.11 7.62-1.76 3.2-2.66 3.28-10.47.48-13.56Zm1.03 9.69c-.3 1.27-.93 2.31-1.87 3.09-1.63 1.35-4.48 1.65-7.49 1.36l-3.34 2.31.35-3.1-.58-.18c-1.46-.45-2.35-1.6-2.62-2.68-.58-2.31-.74-7.26 1.38-9.16 2.87-2.57 8.89-2.73 12.38.14 1.85 1.52 2.4 5.7 1.79 8.22Zm-4.75-6.58c-.6-.55-1.45-.84-2.53-.87a.65.65 0 0 0-.04 1.3c.76.02 1.32.2 1.69.54.38.35.59.87.63 1.56a.65.65 0 0 0 1.3-.08c-.07-1.03-.42-1.86-1.05-2.45Zm-2.58 1.35a.65.65 0 0 0-.03 1.3c.64.02.96.34.99 1a.65.65 0 1 0 1.3-.06c-.07-1.36-.89-2.2-2.26-2.24Zm4.69-2.86c-1.09-1-2.59-1.52-4.48-1.57a.65.65 0 1 0-.03 1.3c1.56.04 2.77.44 3.63 1.23.86.79 1.34 1.94 1.43 3.43a.65.65 0 0 0 1.3-.08c-.12-1.83-.74-3.28-1.85-4.31Zm-.78 7.93c-.36-.21-.73-.41-1.1-.61-.52-.28-.91-.11-1.16.23l-.51.67c-.25.33-.55.27-.55.27-2.25-.58-3.48-2.86-3.48-2.86s-.05-.31.29-.54l.7-.47c.36-.24.54-.61.29-1.15-.18-.38-.36-.76-.55-1.13-.25-.48-.71-.62-1.18-.4-.72.34-1.45 1.09-1.33 2.1.21 1.75 1.13 3.62 2.72 5.16 1.59 1.54 3.49 2.4 5.25 2.55 1.01.09 1.73-.67 2.05-1.4.2-.48.05-.93-.44-1.16Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <path fill="#fff" d="M18.16 26V16.88h3.06l.46-3.55h-3.52v-2.27c0-1.03.29-1.73 1.76-1.73h1.88V6.15A25.3 25.3 0 0 0 19.06 6c-2.71 0-4.57 1.65-4.57 4.68v2.61h-3.07v3.55h3.07V26h3.67Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="refer-card-instagram-gradient" x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB000" />
          <stop offset="0.48" stopColor="#F50057" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#refer-card-instagram-gradient)" />
      <rect x="8.1" y="8.1" width="15.8" height="15.8" rx="5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="16" cy="16" r="3.8" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="21.4" cy="10.7" r="1.15" fill="#fff" />
    </svg>
  );
}

export function ReferAFriendCard({ className }: { className?: string }) {
  const { t } = useLocale();
  const { showToast } = useToast();
  const [data, setData] = useState<MyReferralLink | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get<MyReferralLink>("/referrals/my-link")
      .then((res) => {
        if (alive) {
          setData(res.data);
          setError("");
        }
      })
      .catch((err) => {
        if (alive) setError(getApiErrorMessage(err, t("referLoadError")));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [t]);

  const shareUrl = useMemo(() => {
    if (!data) return "";
    if (typeof window !== "undefined" && data.code) {
      return `${window.location.origin}/register?ref=${encodeURIComponent(data.code)}`;
    }
    return data.url;
  }, [data]);

  const shareText = t("referShareMessage");

  const copyLink = useCallback(async (showSuccessToast = true) => {
    if (!shareUrl) return false;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const input = document.createElement("textarea");
      input.value = shareUrl;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copiedWithFallback = document.execCommand("copy");
      document.body.removeChild(input);
      if (!copiedWithFallback) {
        window.prompt(t("referYourLink"), shareUrl);
        return false;
      }
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    if (showSuccessToast) showToast("success", t("referCopied"));
    return true;
  }, [shareUrl, showToast, t]);

  const openShare = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const shareWhatsApp = useCallback(() => {
    if (!shareUrl) return;
    openShare(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`);
  }, [openShare, shareText, shareUrl]);

  const shareViber = useCallback(() => {
    if (!shareUrl) return;
    openShare(`viber://forward?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`);
  }, [openShare, shareText, shareUrl]);

  const shareFacebook = useCallback(() => {
    if (!shareUrl) return;
    openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`);
  }, [openShare, shareUrl]);

  const shareInstagram = useCallback(async () => {
    if (!shareUrl) return;
    const shareData = { title: "Calendra", text: shareText, url: shareUrl };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Continue to clipboard fallback.
      }
    }
    const copiedSuccessfully = await copyLink(false);
    if (copiedSuccessfully) {
      showToast("info", t("referInstagramHint"));
    }
  }, [copyLink, shareText, shareUrl, showToast, t]);

  const shareDisabled = loading || !shareUrl;

  return (
    <section className={`account-card refer-page ${className ?? ""}`.trim()}>
      <style>{referCardStyles}</style>

      <div className="refer-page-header">
        <span className="refer-page-icon" aria-hidden>
          <ReferralHeaderIcon />
        </span>
        <div>
          <h3>{t("referTitle")}</h3>
          <p>{t("referSubtitle")}</p>
        </div>
      </div>

      {error ? <div className="refer-card-error">{error}</div> : null}

      {loading ? (
        <div className="refer-card-loading">…</div>
      ) : data ? (
        <>
          <div className="refer-main-card">
            <div className="refer-panel">
              <p className="refer-panel-label">{t("referYourLink")}</p>
              <div className="refer-link-row">
                <div className="refer-link-field">
                  <LinkIcon />
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={t("referYourLink")}
                  />
                </div>
                <button
                  type="button"
                  className="refer-copy-button"
                  onClick={() => void copyLink()}
                  disabled={shareDisabled}
                >
                  <CopyIcon />
                  {copied ? t("referCopiedShort") : t("referCopyLink")}
                </button>
              </div>
            </div>

            <div className="refer-panel">
              <p className="refer-panel-label">{t("referShareVia")}</p>
              <div className="refer-share-grid">
                <button
                  type="button"
                  className="refer-share-card refer-share-card--whatsapp"
                  onClick={shareWhatsApp}
                  disabled={shareDisabled}
                >
                  <WhatsAppIcon />
                  <div>
                    <strong>{t("referShareWhatsApp")}</strong>
                    <span>{t("referShare")}</span>
                  </div>
                  <span className="refer-share-arrow" aria-hidden>
                    →
                  </span>
                </button>
                <button
                  type="button"
                  className="refer-share-card refer-share-card--viber"
                  onClick={shareViber}
                  disabled={shareDisabled}
                >
                  <ViberIcon />
                  <div>
                    <strong>{t("referShareViber")}</strong>
                    <span>{t("referShare")}</span>
                  </div>
                  <span className="refer-share-arrow" aria-hidden>
                    →
                  </span>
                </button>
                <button
                  type="button"
                  className="refer-share-card refer-share-card--facebook"
                  onClick={shareFacebook}
                  disabled={shareDisabled}
                >
                  <FacebookIcon />
                  <div>
                    <strong>{t("referShareFacebook")}</strong>
                    <span>{t("referShare")}</span>
                  </div>
                  <span className="refer-share-arrow" aria-hidden>
                    →
                  </span>
                </button>
                <button
                  type="button"
                  className="refer-share-card refer-share-card--instagram"
                  onClick={() => void shareInstagram()}
                  disabled={shareDisabled}
                >
                  <InstagramIcon />
                  <div>
                    <strong>{t("referShareInstagram")}</strong>
                    <span>{t("referShare")}</span>
                  </div>
                  <span className="refer-share-arrow" aria-hidden>
                    →
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="refer-stats-grid">
            <div className="refer-stat-card">
              <span className="refer-stat-icon refer-stat-icon--blue" aria-hidden>
                <PeopleIcon />
              </span>
              <div>
                <strong>{data.referralsQualified}</strong>
                <span>{t("referStatsQualified")}</span>
              </div>
            </div>
            <div className="refer-stat-card">
              <span className="refer-stat-icon refer-stat-icon--green" aria-hidden>
                <GiftIcon />
              </span>
              <div>
                <strong>{data.freeMonthsEarned}</strong>
                <span>{t("referStatsFreeMonths")}</span>
              </div>
            </div>
            <div className="refer-stat-card">
              <span className="refer-stat-icon refer-stat-icon--amber" aria-hidden>
                <CalendarIcon />
              </span>
              <div>
                <strong>{data.capRemaining} / {data.monthlyCap}</strong>
                <span>{t("referStatsCapRemaining")}</span>
              </div>
            </div>
          </div>

          <div className="refer-info">
            <span className="refer-info-icon" aria-hidden>
              <InfoIcon />
            </span>
            <p>{t("referHowItWorks")}</p>
          </div>
        </>
      ) : null}
    </section>
  );
}
