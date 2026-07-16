import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useNavigate } from "react-router-dom";
import { api, getApiErrorMessage } from "../api";
import loginLogo from "../assets/login-logo.png";
import { useToast } from "../components/Toast";
import { AuthLanguageDropdown } from "../components/AuthLanguageDropdown";
import { Field } from "../components/ui";
import { useLocale } from "../locale";
import { ensureRegisterCatalogLoaded } from "../lib/registerCatalogBootstrap";
import { captureReferralCode } from "../lib/referralRef";
import { useRegisterFooterClickOutside } from "../lib/useRegisterFooterClickOutside";
import { registerPageStyles } from "./registerPageStyles";
import {
  getBillableAdditionalUserSlots,
  isBasicMonthlyTrial,
  normalizeRegisterSelection,
  parseRegisterSelection,
  selectionToSearch,
  type RegisterPlanKey,
  type RegisterSelection,
} from "./registerFlow";
import {
  annualSaveBadgeText,
  annualSaveBannerText,
  buildRegisterFooterPill,
  buildSummary,
  formatEuro,
  getAddonCatalog,
  getActiveAddonKeys,
  getAdditionalUserMonthlyPrice,
  getAnnualDiscountFactor,
  getSmsPerMessagePrice,
  getFeatureItems,
  getPlanCardPriceNote,
  getPlanDisplay,
  getRegisterPlanPageCopy,
  getSelectionMonthlyAmounts,
  plansForLocale,
  type RegisterLocale,
  type RegisterPlanPageCopy,
  type RegisterSummary,
} from "./registerPlanCopy";

export type { RegisterSummary } from "./registerPlanCopy";
export {
  buildSummary,
  formatEuro,
  getSelectionMonthlyAmounts,
  plans,
} from "./registerPlanCopy";

type RegisterPlanAddonSectionsProps = {
  selection: RegisterSelection;
  setSelection: Dispatch<SetStateAction<RegisterSelection>>;
  pageCopy: RegisterPlanPageCopy;
  locale: RegisterLocale;
  featureAddonsSectionRef?: RefObject<HTMLElement | null> | null;
  /** Bottom sentinel for scroll / “fully viewed” detection (e.g. add-ons page footer CTA). */
  featureAddonsEndRef?: RefObject<HTMLDivElement | null> | null;
  /** Compact add-ons dialog: flatter layout and shorter user-tier copy. */
  addonsModalPresentation?: boolean;
};

function RegisterUsageIcon({ kind }: { kind: "users" | "sms" }) {
  return (
    <span className="register-usage-icon" aria-hidden>
      {kind === "users" ? (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M16 20v-1.8a4.2 4.2 0 0 0-4.2-4.2H7.2A4.2 4.2 0 0 0 3 18.2V20" />
          <circle cx="9.5" cy="7" r="3.5" />
          <path d="M17 4.4a3.5 3.5 0 0 1 0 6.8M21 20v-1.8a4.2 4.2 0 0 0-3.2-4.1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M21 14a4 4 0 0 1-4 4H8l-5 3v-14a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      )}
    </span>
  );
}

function RegisterAddonIcon({ addonKey }: { addonKey: string }) {
  const icon = (() => {
    switch (addonKey) {
      case "voice":
        return (
          <>
            <path d="M6 10v4M18 10v4" />
            <path d="M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-7h4M4 11h4v7H6a2 2 0 0 1-2-2v-4Z" />
          </>
        );
      case "billing":
        return (
          <>
            <path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
            <path d="M15 3v5h5M9 13h6M9 17h6" />
          </>
        );
      case "whitelabel":
        return (
          <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3Z" />
        );
      default:
        return <path d="M12 3v18M3 12h18" />;
    }
  })();

  return (
    <span className="register-addon-icon" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        {icon}
      </svg>
    </span>
  );
}

export function RegisterFeatureIcon({ featureKey }: { featureKey: string }) {
  const icon = (() => {
    switch (featureKey) {
      case "calendar":
      case "appointments":
        return <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>;
      case "clients":
      case "staff":
        return <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V20" /></>;
      case "group":
        return <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="8" r="3" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20M13 15a4.5 4.5 0 0 1 3-1h1a4.5 4.5 0 0 1 4.5 4.5V20" /></>;
      case "spaces":
      case "resources":
        return <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v18M14.5 12h.01" /></>;
      case "billing":
      case "payments":
        return <><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M15 3v5h5M9 13h6M9 17h4" /></>;
      case "reminders":
        return <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>;
      case "rezerviranje":
      case "booking":
      case "online-booking":
      case "online_booking":
        return <><rect x="3" y="5" width="15" height="16" rx="2" /><path d="M14 3v4M7 3v4M3 10h15M18 14v7M14.5 17.5h7" /></>;
      case "fiscal":
        return <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>;
      case "branded":
        return <><rect x="3" y="6" width="16" height="12" rx="2" /><path d="m4 8 7 5 7-5M19 3v4M17 5h4" /></>;
      case "courses":
        return <><path d="m3 10 9-5 9 5-9 5-9-5Z" /><path d="M7 12.8V17c2.7 2 7.3 2 10 0v-4.2M21 10v6" /></>;
      case "custom":
      case "custom-fields":
      case "custom_fields":
        return <><path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3" /><circle cx="13" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></>;
      case "ai":
        return <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" /><path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /><path d="M5 14v7M2 17.5h6" /></>;
      case "integrations":
        return <><path d="M8 3v4a2 2 0 0 1-2 2H3M16 3v4a2 2 0 0 0 2 2h3M8 21v-4a2 2 0 0 0-2-2H3M16 21v-4a2 2 0 0 1 2-2h3" /><rect x="8" y="8" width="8" height="8" rx="2" /></>;
      case "reporting":
        return <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>;
      case "multilocation":
        return <><path d="M14.5 8.5c0 3.6-5.5 7.8-5.5 7.8S3.5 12.1 3.5 8.5a5.5 5.5 0 1 1 11 0Z" /><circle cx="9" cy="8.5" r="1.6" /><path d="M14.7 13.2a5 5 0 0 1 5.8 4.9c0 2.1-2.2 4.1-3.6 5.2-.7-.6-1.8-1.5-2.6-2.6" /><circle cx="17" cy="18.1" r="1.3" /></>;
      default:
        return <path d="m5 12 4 4L19 6" />;
    }
  })();

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      {icon}
    </svg>
  );
}

function linearRangePercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function sliderThumbLabelStyle(percent: number): {
  left: string;
  transform: string;
} {
  return {
    left: `clamp(14px, ${percent}%, calc(100% - 14px))`,
    transform: "translateX(-50%)",
  };
}

export function RegisterPlanAddonSections({
  selection,
  setSelection,
  pageCopy,
  locale,
  featureAddonsSectionRef,
  featureAddonsEndRef,
  addonsModalPresentation = false,
}: RegisterPlanAddonSectionsProps) {
  const addonCatalog = getAddonCatalog(locale);
  const activeAddonKeys = getActiveAddonKeys();
  const additionalUserMonthly = getAdditionalUserMonthlyPrice();
  const smsPerMessage = getSmsPerMessagePrice();
  const pm = locale === "sl" ? "/mes." : "/mo";
  const firstUserFreeNote =
    locale === "sl"
      ? `Prvi dodatni uporabnik brezplačno; nato ${formatEuro(additionalUserMonthly)} / uporabnik / mesec`
      : `First additional user free; then ${formatEuro(additionalUserMonthly)} / user / month`;
  const smsPriceNote =
    locale === "sl"
      ? `${formatEuro(smsPerMessage)} na SMS (${formatEuro(smsPerMessage * 50)} na 50)`
      : `${formatEuro(smsPerMessage)} per SMS (${formatEuro(smsPerMessage * 50)} per 50)`;
  const trialLocked = isBasicMonthlyTrial(selection);
  const trialLockedNote =
    locale === "sl"
      ? "Med 14-dnevnim preizkusom so vključeni 1 uporabnik, 0 SMS sporočil in brez dodatkov. Dodatke lahko nastavite za naslednje obračunsko obdobje v Upravljanje računa → Naročnina."
      : "The 14-day trial includes 1 user, 0 SMS messages, and no add-ons. You can schedule add-ons for the next billing period under Account management → Subscription.";

  return (
    <>
      <section
        className={`slider-section${trialLocked ? " is-trial-locked" : ""}`}
        aria-label={pageCopy.usageAddonsSectionAria}
      >
        <div className="section-divider">
          <span>{pageCopy.usageAddonsDivider}</span>
        </div>

        {trialLocked ? (
          <div className="register-trial-addons-note" role="note">
            <span aria-hidden>ⓘ</span>
            <span>{trialLockedNote}</span>
          </div>
        ) : null}

        <div className="slider-stack">
          <div className={`slider-card${trialLocked ? " is-trial-locked" : ""}`}>
            <div className="slider-head">
              <div className="slider-heading-group">
                <RegisterUsageIcon kind="users" />
                <div className="slider-meta">
                  <strong>{pageCopy.usersStrong}</strong>
                  <span>{pageCopy.usersHint}</span>
                </div>
              </div>
              <div
                className="register-quantity-control"
                aria-label={pageCopy.usersStrong}
              >
                <button
                  type="button"
                  onClick={() =>
                    setSelection((current) => ({
                      ...current,
                      additionalUsers: Math.max(
                        1,
                        current.additionalUsers - 1,
                      ),
                    }))
                  }
                  disabled={trialLocked || selection.additionalUsers <= 1}
                  aria-label={
                    locale === "sl"
                      ? "Zmanjšaj število uporabnikov"
                      : "Decrease users"
                  }
                >
                  −
                </button>
                <strong>{selection.additionalUsers}</strong>
                <button
                  type="button"
                  onClick={() =>
                    setSelection((current) => ({
                      ...current,
                      additionalUsers: Math.min(
                        10,
                        current.additionalUsers + 1,
                      ),
                    }))
                  }
                  disabled={trialLocked || selection.additionalUsers >= 10}
                  aria-label={
                    locale === "sl"
                      ? "Povečaj število uporabnikov"
                      : "Increase users"
                  }
                >
                  +
                </button>
              </div>
            </div>

            <div className="slider-input-wrap">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={selection.additionalUsers}
                disabled={trialLocked}
                onChange={(event) =>
                  setSelection((current) => ({
                    ...current,
                    additionalUsers: Number(event.target.value),
                  }))
                }
                style={
                  {
                    "--fill-pct": linearRangePercent(
                      selection.additionalUsers,
                      1,
                      10,
                    ),
                  } as CSSProperties
                }
              />
              <div className="slider-scale">
                <span
                  className="slider-scale-thumb"
                  style={sliderThumbLabelStyle(
                    linearRangePercent(selection.additionalUsers, 1, 10),
                  )}
                >
                  {selection.additionalUsers}{" "}
                  {selection.additionalUsers === 1
                    ? pageCopy.userSingular
                    : pageCopy.userPlural}
                </span>
              </div>
            </div>

            <div className="slider-price-note">
              {!addonsModalPresentation ? (
                <span>{firstUserFreeNote}</span>
              ) : null}
              <strong>{`${formatEuro(getBillableAdditionalUserSlots(selection) * additionalUserMonthly)}${pm}`}</strong>
            </div>
          </div>

          <div className={`slider-card${trialLocked ? " is-trial-locked" : ""}`}>
            <div className="slider-head">
              <div className="slider-heading-group">
                <RegisterUsageIcon kind="sms" />
                <div className="slider-meta">
                  <strong>{pageCopy.smsStrong}</strong>
                  <span>{pageCopy.smsHint}</span>
                </div>
              </div>
              <div
                className="register-quantity-control"
                aria-label={pageCopy.smsStrong}
              >
                <button
                  type="button"
                  onClick={() =>
                    setSelection((current) => ({
                      ...current,
                      additionalSms: Math.max(0, current.additionalSms - 50),
                    }))
                  }
                  disabled={trialLocked || selection.additionalSms <= 0}
                  aria-label={
                    locale === "sl"
                      ? "Zmanjšaj število SMS sporočil"
                      : "Decrease SMS messages"
                  }
                >
                  −
                </button>
                <strong>{selection.additionalSms}</strong>
                <button
                  type="button"
                  onClick={() =>
                    setSelection((current) => ({
                      ...current,
                      additionalSms: Math.min(
                        1000,
                        current.additionalSms + 50,
                      ),
                    }))
                  }
                  disabled={trialLocked || selection.additionalSms >= 1000}
                  aria-label={
                    locale === "sl"
                      ? "Povečaj število SMS sporočil"
                      : "Increase SMS messages"
                  }
                >
                  +
                </button>
              </div>
            </div>

            <div className="slider-input-wrap">
              <input
                type="range"
                min="0"
                max="1000"
                step="50"
                value={selection.additionalSms}
                disabled={trialLocked}
                onChange={(event) =>
                  setSelection((current) => ({
                    ...current,
                    additionalSms: Number(event.target.value),
                  }))
                }
                style={
                  {
                    "--fill-pct": linearRangePercent(
                      selection.additionalSms,
                      0,
                      1000,
                    ),
                  } as CSSProperties
                }
              />
              <div className="slider-scale">
                <span
                  className="slider-scale-thumb"
                  style={sliderThumbLabelStyle(
                    linearRangePercent(selection.additionalSms, 0, 1000),
                  )}
                >
                  {pageCopy.smsCount(selection.additionalSms)}
                </span>
              </div>
            </div>

            <div className="slider-price-note">
              <span>{smsPriceNote}</span>
              <strong>
                {selection.additionalSms > 0
                  ? `${formatEuro(selection.additionalSms * smsPerMessage)}${pm}`
                  : pageCopy.smsZeroPerMo}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {activeAddonKeys.length > 0 ? (
        <section
          ref={featureAddonsSectionRef ?? undefined}
          id="register-feature-add-ons"
          className={`feature-addons-section${trialLocked ? " is-trial-locked" : ""}`}
          aria-label={pageCopy.featureAddonsAria}
        >
          <div className="addons-divider">
            <span>{pageCopy.featureAddonsDivider}</span>
          </div>

          <div className="feature-addons-list">
            {activeAddonKeys.map((addonKey) => {
              const addon = addonCatalog[addonKey];
              return (
                <div
                  key={addonKey}
                  className={`feature-addon-card${trialLocked ? " is-trial-locked" : ""}`}
                >
                  <label className="feature-addon-card-label">
                    <input
                      type="checkbox"
                      checked={Boolean(selection.addons[addonKey])}
                      disabled={trialLocked}
                      onChange={(event) =>
                        setSelection((current) => ({
                          ...current,
                          addons: {
                            ...current.addons,
                            [addonKey]: event.target.checked,
                          },
                        }))
                      }
                    />
                    <RegisterAddonIcon addonKey={addonKey} />
                    <span className="addon-meta">
                      <span className="addon-name">{addon.name}</span>
                      <span className="addon-desc">{addon.description}</span>
                    </span>
                    <span className="addon-price">
                      +{formatEuro(addon.monthly)}
                      {pm}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
          <div
            ref={featureAddonsEndRef ?? undefined}
            className="register-feature-addons-end-sentinel"
            aria-hidden
          />
        </section>
      ) : null}
    </>
  );
}

export function RegisterFooterListIcon() {
  return (
    <svg
      className="register-footer-pill-svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function RegisterFooterChevron({
  up,
  className,
  size = 18,
}: {
  up: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      className={["register-footer-chevron-svg", className]
        .filter(Boolean)
        .join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {up ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
    </svg>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { locale, setLocale, t } = useLocale();
  const lang: RegisterLocale = locale === "sl" ? "sl" : "en";
  const [registerCatalogRevision, setRegisterCatalogRevision] = useState(0);
  const pc = useMemo(() => getRegisterPlanPageCopy(lang), [lang]);
  const plansLoc = useMemo(
    () => plansForLocale(lang),
    [lang, registerCatalogRevision],
  );
  const featureItems = useMemo(
    () => getFeatureItems(lang),
    [lang, registerCatalogRevision],
  );
  const hasFeatureAddons = useMemo(
    () => getActiveAddonKeys().length > 0,
    [registerCatalogRevision],
  );
  const pm = lang === "sl" ? "/mes." : "/mo";
  const { showToast } = useToast();
  const [selection, setSelection] = useState<RegisterSelection>(() =>
    parseRegisterSelection(window.location.search),
  );
  const [previewPlan, setPreviewPlan] = useState<RegisterPlanKey>(
    selection.plan,
  );
  const [footerExpanded, setFooterExpanded] = useState(false);
  const registerFooterRef = useRef<HTMLElement | null>(null);
  useRegisterFooterClickOutside(
    registerFooterRef,
    footerExpanded,
    setFooterExpanded,
  );
  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const planPreviewPanelRef = useRef<HTMLElement | null>(null);
  const featureAddonsSectionRef = useRef<HTMLElement | null>(null);
  const continueUnlockTimerRef = useRef(0);
  const [planExtrasInView, setPlanExtrasInView] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1024px)").matches,
  );

  useEffect(() => {
    captureReferralCode(window.location.search);
  }, []);

  useEffect(() => {
    let alive = true;
    void ensureRegisterCatalogLoaded().then((changed) => {
      if (alive && changed) setRegisterCatalogRevision((value) => value + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const sync = () => setIsCompactLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!hasFeatureAddons) {
      setPlanExtrasInView(true);
      return;
    }
    if (isCompactLayout) {
      setPlanExtrasInView(true);
      return;
    }
    setPlanExtrasInView(false);
    const el = featureAddonsSectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPlanExtrasInView(true);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -88px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasFeatureAddons, isCompactLayout]);

  useEffect(
    () => () => {
      window.clearTimeout(continueUnlockTimerRef.current);
    },
    [],
  );

  const continueToAccount = useCallback(() => {
    navigate(`/register/account?${selectionToSearch(selection)}`);
  }, [navigate, selection]);

  const revealPlanExtrasAndAllowContinue = useCallback(() => {
    if (!hasFeatureAddons) {
      continueToAccount();
      return;
    }
    if (isCompactLayout) {
      navigate(`/register/add-ons?${selectionToSearch(selection)}`);
      return;
    }
    featureAddonsSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.clearTimeout(continueUnlockTimerRef.current);
    continueUnlockTimerRef.current = window.setTimeout(() => {
      setPlanExtrasInView(true);
      continueUnlockTimerRef.current = 0;
    }, 1100);
  }, [continueToAccount, hasFeatureAddons, isCompactLayout, navigate, selection]);

  const planDisplay = useMemo(
    () => getPlanDisplay(previewPlan, selection.billing, lang),
    [previewPlan, selection.billing, lang],
  );
  const summary = useMemo(
    () => buildSummary(selection, lang),
    [selection, lang, registerCatalogRevision],
  );
  const monthlyAmounts = useMemo(
    () => getSelectionMonthlyAmounts(selection),
    [selection, registerCatalogRevision],
  );
  const websiteUrl =
    (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.trim() ||
    "https://calendra.si";

  const footerPill = useMemo(
    () => buildRegisterFooterPill(selection, summary, lang),
    [selection, summary, lang],
  );

  const peekAddonMonthly = useMemo(() => {
    const m = monthlyAmounts;
    if (selection.billing === "annual") {
      return (
        (m.usersMonthly + m.addonsMonthly) * getAnnualDiscountFactor() +
        m.smsMonthly
      );
    }
    return m.usersMonthly + m.smsMonthly + m.addonsMonthly;
  }, [monthlyAmounts, selection.billing]);

  const usageAddonLineCount = useMemo(() => {
    let n = 0;
    if (getBillableAdditionalUserSlots(selection) > 0) n++;
    if (selection.additionalSms > 0) n++;
    n += getActiveAddonKeys().reduce(
      (count, key) => count + (selection.addons[key] ? 1 : 0),
      0,
    );
    return n;
  }, [selection]);

  const openContactModal = () => {
    setContactError("");
    setContactOpen(true);
  };

  const closeContactModal = () => {
    setContactOpen(false);
    setContactError("");
  };

  const submitContactModal = async () => {
    const name = contactName.trim();
    const email = contactEmail.trim();
    const phone = contactPhone.trim();
    const message = contactMessage.trim();
    if (!name || !email || !message) {
      setContactError(pc.contactErrRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setContactError(pc.contactErrEmail);
      return;
    }

    setContactSubmitting(true);
    setContactError("");
    try {
      await api.post("/register/contact", {
        name,
        email,
        phone: phone || null,
        message,
        locale: lang,
        plan: selection.plan,
        planName: plansLoc[selection.plan].name,
        billing: selection.billing,
        estimatedMonthlyTotal: Number(
          (selection.billing === "annual"
            ? (monthlyAmounts.planMonthly +
                monthlyAmounts.usersMonthly +
                monthlyAmounts.addonsMonthly) *
                getAnnualDiscountFactor() +
              monthlyAmounts.smsMonthly
            : monthlyAmounts.totalMonthly
          ).toFixed(2),
        ),
      });
      showToast("success", pc.toastContactSent);
      closeContactModal();
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setContactMessage("");
    } catch (error) {
      setContactError(getApiErrorMessage(error, pc.contactSendError));
    } finally {
      setContactSubmitting(false);
    }
  };

  const setPlan = (plan: RegisterPlanKey) => {
    setSelection((current) =>
      normalizeRegisterSelection({ ...current, plan }),
    );
    setPreviewPlan(plan);
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1024px)").matches
    ) {
      window.requestAnimationFrame(() => {
        planPreviewPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };

  const planForPreview = plansLoc[previewPlan];
  const selectPlanCta = (planKey: RegisterPlanKey) => {
    if (planKey === "basic" && selection.billing === "monthly")
      return pc.selectFreeTrial;
    const planName = plansLoc[planKey].name;
    return lang === "sl" ? `Izberi ${planName}` : `Select ${planName}`;
  };

  return (
    <div className="register-flow register-plan-selection-page">
      <style>{registerPageStyles}</style>
      <header className="topbar">
        <button
          type="button"
          className="brand register-brand-link"
          aria-label={pc.brandAlt}
          onClick={() => navigate("/login")}
        >
          <img className="brand-logo" src={loginLogo} alt={pc.brandAlt} />
        </button>

        <div className="top-actions">
          <AuthLanguageDropdown
            locale={locale}
            setLocale={setLocale}
            ariaLabel={t("language")}
          />
        </div>
      </header>

      <div className="app">
        <main className="content">
          <h1 className="register-sr-only">{pc.srOnlyPlanTitle}</h1>
          <div className="register-plan-page-stack">
            <section className="layout">
              <div className="register-stepper-row">
                <div className="stepper" aria-label={pc.stepperAria}>
                  {[pc.step1, pc.step2, pc.step3].map((step, index) => (
                    <div
                      key={step}
                      className={index === 0 ? "step active" : "step"}
                    >
                      <span className="step-number" aria-hidden>
                        {index + 1}
                      </span>
                      <span className="step-label">
                        {step.replace(/^\d+\s*/, "")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <section className="panel right-panel">
                <div className="billing-toggle-wrap">
                  <div>
                    <div
                      className="billing-toggle"
                      aria-label={pc.billingCycleAria}
                    >
                      <button
                        className={
                          selection.billing === "monthly"
                            ? "billing-option active"
                            : "billing-option"
                        }
                        type="button"
                        onClick={() =>
                          setSelection((current) =>
                            normalizeRegisterSelection({
                              ...current,
                              billing: "monthly",
                            }),
                          )
                        }
                      >
                        {pc.monthly}
                      </button>
                      <button
                        className={
                          selection.billing === "annual"
                            ? "billing-option active"
                            : "billing-option"
                        }
                        type="button"
                        onClick={() =>
                          setSelection((current) => ({
                            ...current,
                            billing: "annual",
                          }))
                        }
                      >
                        {pc.annual}
                      </button>
                    </div>
                  </div>
                  <div className="annual-save">
                    {annualSaveBannerText(lang)}
                  </div>
                </div>

                <div className="plans-grid">
                  {(["basic", "pro", "business"] as const).map((planKey) => {
                    const plan = plansLoc[planKey];
                    const priceBlock = getPlanCardPriceNote(
                      planKey,
                      selection.billing,
                      lang,
                    );
                    const isSelected = selection.plan === planKey;
                    return (
                      <article
                        key={planKey}
                        className={[
                          "plan-card",
                          planKey === "pro" ? "recommended" : "",
                          isSelected ? "active" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        tabIndex={0}
                        onMouseEnter={() => setPreviewPlan(planKey)}
                        onFocus={() => setPreviewPlan(planKey)}
                        onMouseLeave={() => setPreviewPlan(selection.plan)}
                        onBlur={() => setPreviewPlan(selection.plan)}
                        onClick={() => setPlan(planKey)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setPlan(planKey);
                          }
                        }}
                      >
                        <div className="badge-row">
                          {planKey === "pro" && (
                            <span className="badge gold">
                              {pc.badgeRecommended}
                            </span>
                          )}
                          {planKey === "business" && (
                            <span className="badge soft">
                              {pc.badgePremium}
                            </span>
                          )}
                          {planKey === "basic" && priceBlock.badgeVisible && (
                            <span className="badge green">
                              {pc.badgeTrial14}
                            </span>
                          )}
                        </div>
                        <h3 className="plan-name">{plan.name}</h3>
                        <div className="price-stack">
                          <div className="price-row">
                            <div className="price">{priceBlock.price}</div>
                            <div className="per">{priceBlock.per}</div>
                          </div>
                          {priceBlock.oldPriceVisible && (
                            <div className="price-row">
                              <div className="old-price">
                                {priceBlock.oldPrice}
                              </div>
                            </div>
                          )}
                          <div className="price-note">
                            {priceBlock.noteIsTrial ? (
                              <span className="trial-note">
                                {priceBlock.trialHighlight}
                              </span>
                            ) : null}
                            {priceBlock.noteIsTrial
                              ? priceBlock.trialUnlessCancelled
                              : priceBlock.note}
                          </div>
                        </div>
                        <div className="mini-points">
                          {planKey === "basic" && (
                            <>
                              {pc.miniBasic.map((line) => (
                                <div key={line}>
                                  <span className="check">✓</span>
                                  <span>{line}</span>
                                </div>
                              ))}
                            </>
                          )}
                          {planKey === "pro" && (
                            <>
                              {pc.miniPro.map((line) => (
                                <div key={line}>
                                  <span className="check">✓</span>
                                  <span>{line}</span>
                                </div>
                              ))}
                            </>
                          )}
                          {planKey === "business" && (
                            <>
                              {pc.miniBusiness.map((line) => (
                                <div key={line}>
                                  <span className="check">✓</span>
                                  <span>{line}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                        <div className="spacer" />
                        <button
                          className={
                            isSelected
                              ? "plan-button selected"
                              : "plan-button unselected"
                          }
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPlan(planKey);
                          }}
                        >
                          {isSelected
                            ? pc.selectedCheck
                            : selectPlanCta(planKey)}
                        </button>
                      </article>
                    );
                  })}
                </div>

                <section className="custom-solution-banner" aria-label={pc.customCta}>
                  <span className="custom-solution-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z" />
                      <path d="M8 9h8M8 13h5" />
                    </svg>
                  </span>
                  <div className="custom-solution-copy">
                    <h3>{pc.customCta}</h3>
                    <p>{pc.customCtaDescription}</p>
                  </div>
                  <button
                    type="button"
                    className="custom-solution-button"
                    onClick={openContactModal}
                  >
                    <span>{pc.customCtaButton}</span>
                    <span aria-hidden>→</span>
                  </button>
                </section>

                {!isCompactLayout ? (
                  <RegisterPlanAddonSections
                    selection={selection}
                    setSelection={setSelection}
                    pageCopy={pc}
                    locale={lang}
                    featureAddonsSectionRef={featureAddonsSectionRef}
                  />
                ) : null}
              </section>

              <aside ref={planPreviewPanelRef} className="panel left-panel">
                <h2 className="plan-preview-heading">
                  {pc.planPreviewHeading}
                </h2>

                <div className="selected-box">
                  <div>
                    <strong>{planForPreview.name}</strong>
                  </div>
                  <div className="selected-price-block">
                    <span className="selected-price">
                      {planDisplay.primary}
                    </span>
                    <span className="selected-subprice">
                      {planDisplay.secondary}
                    </span>
                  </div>
                </div>

                <ul className="feature-list">
                  {featureItems.map((feature) => {
                    const enabled = planForPreview.features.includes(
                      feature.key,
                    );
                    return (
                      <li
                        key={feature.key}
                        className={
                          enabled ? "feature-item enabled" : "feature-item"
                        }
                      >
                        <span className="icon">
                          <RegisterFeatureIcon featureKey={feature.key} />
                        </span>
                        <span className="meta">
                          <span className="name">{feature.name}</span>
                          <span className="desc">{feature.description}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </aside>
            </section>
          </div>
        </main>
      </div>

      <footer
        ref={registerFooterRef}
        className={`register-fixed-footer${footerExpanded ? " is-expanded" : ""}`}
        role="contentinfo"
      >
        <div
          className={`register-fixed-footer-inner register-footer-panel${footerExpanded ? " is-expanded" : ""}`}
        >
          <div className="register-footer-toolbar">
            <div className="register-footer-toolbar-lead">
              <div className="register-footer-back">
                <button
                  className="back-link"
                  type="button"
                  onClick={() => window.location.assign(websiteUrl)}
                >
                  {pc.backWebsite}
                </button>
              </div>

              <button
                type="button"
                className="custom-cta custom-cta--footer-toolbar"
                onClick={openContactModal}
              >
                {pc.customCta}
              </button>
            </div>

            <div className="register-footer-center-cluster">
              <div className="register-footer-toolbar-mid">
                <button
                  type="button"
                  className="register-footer-pill"
                  aria-expanded={footerExpanded}
                  aria-controls="register-footer-details"
                  aria-label={
                    footerExpanded ? pc.footerHideDetails : pc.footerShowDetails
                  }
                  onClick={() => setFooterExpanded((v) => !v)}
                >
                  <span className="register-footer-pill-icon" aria-hidden>
                    <RegisterFooterListIcon />
                  </span>
                  <span className="register-footer-pill-text">
                    <strong className="register-footer-pill-title">
                      {footerPill.title}
                    </strong>
                    <span className="register-footer-pill-sub">
                      {footerPill.sub}
                    </span>
                  </span>
                  <span className="register-footer-pill-total-inline">
                    <span className="register-footer-total-label">
                      {pc.footerEstTotal}
                    </span>
                    <strong className="register-footer-total-value">
                      {summary.totalPrimary}
                    </strong>
                  </span>
                  <span className="register-footer-pill-chevron" aria-hidden>
                    <RegisterFooterChevron up={!footerExpanded} />
                  </span>
                </button>
              </div>
            </div>

            <div className="register-footer-continue">
              {planExtrasInView ? (
                <button
                  className="continue-button"
                  type="button"
                  onClick={() => {
                    if (isCompactLayout && hasFeatureAddons) {
                      navigate(
                        `/register/add-ons?${selectionToSearch(selection)}`,
                      );
                      return;
                    }
                    continueToAccount();
                  }}
                >
                  {!hasFeatureAddons
                    ? pc.continueWithPlan
                    : isCompactLayout
                    ? pc.continueAddons
                    : selection.plan === "basic" &&
                        selection.billing === "monthly"
                      ? pc.continueAccountBasic
                      : pc.continueWithPlan}
                </button>
              ) : (
                <button
                  className="continue-button continue-button-scroll-hint"
                  type="button"
                  onClick={revealPlanExtrasAndAllowContinue}
                  aria-label={pc.footerContinueScrollAria}
                >
                  <RegisterFooterChevron
                    up={false}
                    size={22}
                    className="continue-button-scroll-chevron"
                  />
                  <span className="continue-button-scroll-hint-text">
                    {pc.addonsBelow}
                  </span>
                </button>
              )}
            </div>
          </div>

          {footerExpanded ? (
            <div
              className="register-footer-expanded"
              id="register-footer-details"
            >
              <div className="register-footer-peek">
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">
                    {pc.footerPlanPeek}
                  </span>
                  <strong className="register-footer-peek-name">
                    {plansLoc[selection.plan].name}
                  </strong>
                  <span className="register-footer-peek-value">
                    {summary.rows[0]?.value ?? "—"}
                  </span>
                </div>
                <div className="register-footer-peek-plus" aria-hidden>
                  +
                </div>
                <div className="register-footer-peek-col">
                  <span className="register-footer-peek-label">
                    {pc.footerUsagePeek}
                  </span>
                  <strong className="register-footer-peek-name">
                    {usageAddonLineCount}{" "}
                    {usageAddonLineCount === 1
                      ? pc.footerItemSingular
                      : pc.footerItemPlural}
                  </strong>
                  <span className="register-footer-peek-value">
                    {formatEuro(peekAddonMonthly)}
                    {pm}
                  </span>
                </div>
              </div>

              <div className="register-footer-detail-card">
                <h3 className="register-footer-detail-title">
                  {pc.footerBreakdownTitle}
                </h3>
                <ul className="register-footer-detail-list">
                  {summary.rows.map((row) => (
                    <li
                      key={`${row.label}-${row.value}`}
                      className="register-footer-detail-row"
                    >
                      <span
                        className="register-footer-detail-check"
                        aria-hidden
                      >
                        ✓
                      </span>
                      <span className="register-footer-detail-label">
                        {row.label}
                      </span>
                      <strong className="register-footer-detail-price">
                        {row.value}
                      </strong>
                    </li>
                  ))}
                </ul>
                <div className="register-footer-detail-foot">
                  {summary.annualSavingsYr != null &&
                  summary.annualSavingsYr > 0 ? (
                    <span className="register-footer-save-badge">
                      {annualSaveBadgeText(
                        formatEuro(summary.annualSavingsYr),
                        lang,
                      )}
                    </span>
                  ) : null}
                  <div className="register-footer-detail-total">
                    <span className="register-footer-detail-total-label">
                      {pc.footerEstTotal}
                    </span>
                    <strong className="register-footer-detail-total-value">
                      {summary.totalPrimary}
                    </strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="register-footer-hide-link"
                onClick={() => setFooterExpanded(false)}
              >
                {pc.footerHideDetails}
                <RegisterFooterChevron up />
              </button>
            </div>
          ) : null}
        </div>
      </footer>

      {contactOpen ? (
        <div className="register-contact-modal-root" role="presentation">
          <button
            type="button"
            className="register-contact-modal-backdrop"
            aria-label={pc.contactCloseBackdrop}
            onClick={closeContactModal}
          />
          <div
            className="register-contact-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-contact-title"
          >
            <h2
              id="register-contact-title"
              className="register-contact-modal-title"
            >
              {pc.contactTitle}
            </h2>
            <p className="register-contact-modal-intro">{pc.contactIntro}</p>
            <div className="register-contact-form stack gap-md">
              <Field label={pc.contactName}>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field label={pc.contactEmail}>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  autoComplete="email"
                />
              </Field>
              <Field label={pc.contactPhone} hint={pc.contactPhoneHint}>
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  autoComplete="tel"
                />
              </Field>
              <Field label={pc.contactMessage}>
                <textarea
                  rows={4}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder={pc.contactPlaceholder}
                />
              </Field>
              {contactError ? (
                <p className="register-contact-error" role="alert">
                  {contactError}
                </p>
              ) : null}
            </div>
            <div className="register-contact-modal-actions">
              <button
                type="button"
                className="register-contact-cancel"
                onClick={closeContactModal}
                disabled={contactSubmitting}
              >
                {pc.contactCancel}
              </button>
              <button
                type="button"
                className="register-contact-submit"
                onClick={submitContactModal}
                disabled={contactSubmitting}
              >
                {contactSubmitting ? pc.contactSubmitting : pc.contactSubmit}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
