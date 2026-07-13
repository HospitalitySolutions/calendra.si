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
  .refer-card {
    display: grid;
    gap: 18px;
  }
  .refer-card-header { display: grid; gap: 6px; }
  .refer-card-title { margin: 0; font-size: 1.12rem; font-weight: 800; color: #17253d; }
  .refer-card-subtitle { margin: 0; color: #70809b; font-size: 0.92rem; line-height: 1.5; }
  .refer-link-row {
    display: flex;
    gap: 10px;
    align-items: stretch;
    flex-wrap: wrap;
  }
  .refer-link-input {
    flex: 1 1 240px;
    min-width: 0;
    height: 46px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid #dfe7f5;
    background: #f8fbff;
    color: #17253d;
    font-size: 0.95rem;
  }
  .refer-copy-button {
    flex: 0 0 auto;
    height: 46px;
    padding: 0 18px;
    border-radius: 12px;
    border: 0;
    background: linear-gradient(90deg, #2f6df6, #1f56d7);
    color: #fff;
    font-weight: 800;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .refer-copy-button:hover { filter: brightness(1.03); }
  .refer-share-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .refer-share-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid #dfe7f5;
    background: #fff;
    color: #17253d;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
  }
  .refer-share-button:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(47,109,246,0.12); border-color: #cfe0ff; }
  .refer-share-button .refer-share-dot { width: 10px; height: 10px; border-radius: 50%; }
  .refer-share-whatsapp .refer-share-dot { background: #25d366; }
  .refer-share-viber .refer-share-dot { background: #7360f2; }
  .refer-share-facebook .refer-share-dot { background: #1877f2; }
  .refer-share-instagram .refer-share-dot { background: linear-gradient(45deg,#f09433,#dc2743,#bc1888); }
  .refer-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .refer-stat {
    padding: 14px;
    border-radius: 14px;
    border: 1px solid #e7edf6;
    background: linear-gradient(180deg,#ffffff,#f8fbff);
    text-align: center;
  }
  .refer-stat strong { display: block; font-size: 1.5rem; color: #2054d4; font-weight: 900; }
  .refer-stat span { display: block; margin-top: 4px; color: #70809b; font-size: 0.76rem; line-height: 1.3; }
  .refer-how { margin: 0; color: #70809b; font-size: 0.85rem; line-height: 1.5; }
  .refer-error { color: #b42318; font-size: 0.9rem; }
  @media (max-width: 560px) {
    .refer-stats { grid-template-columns: 1fr; }
  }
`;

function ShareDot({ kind }: { kind: string }) {
  return <span className={`refer-share-dot`} aria-hidden data-kind={kind} />;
}

/**
 * Tenant-facing "Refer a friend" card. Fetches the current user's personal referral link and offers copy +
 * WhatsApp/Viber/Facebook/Instagram sharing plus reward stats.
 */
export function ReferAFriendCard({ className }: { className?: string }) {
  const { t } = useLocale();
  const { showToast } = useToast();
  const [data, setData] = useState<MyReferralLink | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

  // Prefer the current origin so the link works across environments; fall back to the server-provided URL.
  const shareUrl = useMemo(() => {
    if (!data) return "";
    if (typeof window !== "undefined" && data.code) {
      return `${window.location.origin}/register?ref=${encodeURIComponent(data.code)}`;
    }
    return data.url;
  }, [data]);

  const shareText = t("referShareMessage");

  const copyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("success", t("referCopied"));
    } catch {
      window.prompt(t("referYourLink"), shareUrl);
    }
  }, [shareUrl, showToast, t]);

  const openShare = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const shareWhatsApp = useCallback(() => {
    openShare(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`);
  }, [openShare, shareText, shareUrl]);

  const shareViber = useCallback(() => {
    openShare(`viber://forward?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`);
  }, [openShare, shareText, shareUrl]);

  const shareFacebook = useCallback(() => {
    openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`);
  }, [openShare, shareUrl]);

  const shareInstagram = useCallback(async () => {
    // Instagram has no web link-share intent. Use the Web Share API when available (mobile), else copy + hint.
    const shareData = { title: "Calendra", text: shareText, url: shareUrl };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User dismissed the sheet, or share failed; fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("info", t("referInstagramHint"));
    } catch {
      window.prompt(t("referYourLink"), shareUrl);
    }
  }, [shareText, shareUrl, showToast, t]);

  return (
    <section className={`account-card refer-card ${className ?? ""}`.trim()}>
      <style>{referCardStyles}</style>
      <div className="refer-card-header">
        <h3 className="refer-card-title">{t("referTitle")}</h3>
        <p className="refer-card-subtitle">{t("referSubtitle")}</p>
      </div>

      {error ? <div className="refer-error">{error}</div> : null}

      {loading ? (
        <p className="refer-how">…</p>
      ) : data ? (
        <>
          <div className="refer-link-row">
            <input
              className="refer-link-input"
              type="text"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t("referYourLink")}
            />
            <button type="button" className="refer-copy-button" onClick={() => void copyLink()}>
              {t("referCopyLink")}
            </button>
          </div>

          <div className="refer-share-row">
            <button type="button" className="refer-share-button refer-share-whatsapp" onClick={shareWhatsApp}>
              <ShareDot kind="whatsapp" />
              {t("referShareWhatsApp")}
            </button>
            <button type="button" className="refer-share-button refer-share-viber" onClick={shareViber}>
              <ShareDot kind="viber" />
              {t("referShareViber")}
            </button>
            <button type="button" className="refer-share-button refer-share-facebook" onClick={shareFacebook}>
              <ShareDot kind="facebook" />
              {t("referShareFacebook")}
            </button>
            <button type="button" className="refer-share-button refer-share-instagram" onClick={() => void shareInstagram()}>
              <ShareDot kind="instagram" />
              {t("referShareInstagram")}
            </button>
          </div>

          <div className="refer-stats">
            <div className="refer-stat">
              <strong>{data.referralsQualified}</strong>
              <span>{t("referStatsQualified")}</span>
            </div>
            <div className="refer-stat">
              <strong>{data.freeMonthsEarned}</strong>
              <span>{t("referStatsFreeMonths")}</span>
            </div>
            <div className="refer-stat">
              <strong>{data.capRemaining}</strong>
              <span>{t("referStatsCapRemaining")}</span>
            </div>
          </div>

          <p className="refer-how">{t("referHowItWorks")}</p>
        </>
      ) : null}
    </section>
  );
}
