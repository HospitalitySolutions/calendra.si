import { useState } from "react";
import type { DragEvent, ReactNode } from "react";
import type { PaymentType } from "../../lib/types";

export type GuestFieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
};

export function GuestField({ label, hint, children, className }: GuestFieldProps) {
  return (
    <label className={className ? `gapp-field ${className}` : "gapp-field"}>
      <span className="gapp-label">{label}</span>
      {children}
      {hint ? <span className="gapp-hint">{hint}</span> : null}
    </label>
  );
}

export function GuestSegmentedToggle({
  value,
  onChange,
  className,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={className ? `gapp-segmented ${className}` : "gapp-segmented"}
    >
      <button
        type="button"
        className={!value ? "active" : ""}
        onClick={() => onChange(false)}
      >
        OFF
      </button>
      <button
        type="button"
        className={value ? "active" : ""}
        onClick={() => onChange(true)}
      >
        ON
      </button>
    </div>
  );
}

export function GuestSwitch({
  checked,
  onChange,
  label = "ON",
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  const className = `gapp-switch${checked ? " active" : ""}${disabled ? " is-disabled" : ""}`;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      aria-pressed={checked}
      disabled={disabled}
    >
      <span className="gapp-switch-knob" />
      <span className="gapp-switch-label">{checked ? label : "OFF"}</span>
    </button>
  );
}

export type ModulesDesignTone =
  | "blue"
  | "green"
  | "purple"
  | "amber"
  | "rose"
  | "cyan";
export type ModulesDesignIconKind =
  | "booking"
  | "billing"
  | "services"
  | "guestApp"
  | "communication"
  | "security"
  | "spaces"
  | "availability"
  | "noShow"
  | "spark"
  | "personal"
  | "todo"
  | "group"
  | "invoice"
  | "wallet"
  | "calendar"
  | "website"
  | "message"
  | "shield"
  | "key"
  | "link"
  | "sliders"
  | "scanner";

export type ModulesDesignLine = {
  id: string;
  icon: ModulesDesignIconKind;
  title: string;
  subtitle?: string;
  checked?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onChange?: (checked: boolean) => void;
  valueControl?: ReactNode;
  visibilityControl?: ReactNode;
  children?: ModulesDesignLine[];
};

export type ModulesDesignGroup = {
  id: string;
  title: string;
  subtitle: string;
  icon: ModulesDesignIconKind;
  tone: ModulesDesignTone;
  checked: boolean;
  hideSwitch?: boolean;
  onChange: (checked: boolean) => void;
  rows: ModulesDesignLine[];
};

export const DEFAULT_EXPANDED_MODULE_ROWS = [
  "booking-spaces",
  "booking-availability",
  "booking-group-booking",
  "billing-billing",
  "guest-app-main",
  "communication-notifications",
  "guest-app-wallet",
];

export function ModulesDesignIcon({ kind }: { kind: ModulesDesignIconKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === "booking" ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="3" {...common} />
          <path d="M8 3v4M16 3v4M4 10h16" {...common} />
        </>
      ) : kind === "billing" ? (
        <>
          <rect x="4" y="6" width="16" height="12" rx="3" {...common} />
          <path d="M7 10h10M8 14h4M16 14h1" {...common} />
        </>
      ) : kind === "services" ? (
        <>
          <path
            d="M20 13.2 13.2 20a2.4 2.4 0 0 1-3.4 0L4 14.2V4h10.2L20 9.8a2.4 2.4 0 0 1 0 3.4Z"
            {...common}
          />
          <path d="M8.2 8.2h.01" {...common} />
          <path d="M10.5 13.5 14 10" {...common} />
        </>
      ) : kind === "guestApp" ? (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2.5" {...common} />
          <path d="M11 18h2M10 6h4" {...common} />
        </>
      ) : kind === "communication" ? (
        <>
          <path
            d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"
            {...common}
          />
          <path d="M9.5 20a3 3 0 0 0 5 0" {...common} />
        </>
      ) : kind === "security" ? (
        <>
          <path
            d="M12 3 5.5 5.5v5.7c0 4.2 2.7 7.6 6.5 9.1 3.8-1.5 6.5-4.9 6.5-9.1V5.5L12 3Z"
            {...common}
          />
          <path d="m9.5 12 1.8 1.8 3.6-4" {...common} />
        </>
      ) : kind === "spaces" ? (
        <>
          <path d="M5 10.5 12 5l7 5.5" {...common} />
          <path d="M7 10v9h10v-9" {...common} />
          <path d="M10 19v-5h4v5" {...common} />
        </>
      ) : kind === "availability" || kind === "calendar" ? (
        <>
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M12 8v4l3 2" {...common} />
        </>
      ) : kind === "noShow" ? (
        <>
          <circle cx="12" cy="12" r="8.2" {...common} />
          <path d="M12 7.8v5.2M12 16.4h.01" {...common} />
        </>
      ) : kind === "spark" ? (
        <>
          <path
            d="M12 3.5 13.8 9l5.2 1.8-5.2 1.8L12 18l-1.8-5.4L5 10.8 10.2 9 12 3.5Z"
            {...common}
          />
        </>
      ) : kind === "personal" ? (
        <>
          <path
            d="M8.5 10.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0Z"
            {...common}
          />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" {...common} />
        </>
      ) : kind === "todo" || kind === "invoice" ? (
        <>
          <rect x="6" y="4" width="12" height="16" rx="2" {...common} />
          <path d="M9 9h6M9 13h6M9 17h3" {...common} />
        </>
      ) : kind === "group" ? (
        <>
          <path
            d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            {...common}
          />
          <path d="M3.5 20a5 5 0 0 1 9 0M11.5 20a5 5 0 0 1 9 0" {...common} />
        </>
      ) : kind === "wallet" ? (
        <>
          <rect x="4" y="7" width="16" height="11" rx="3" {...common} />
          <path d="M17 11.5h3v3h-3a1.5 1.5 0 0 1 0-3ZM7 7V5.5h9" {...common} />
        </>
      ) : kind === "website" ? (
        <>
          <rect x="4" y="5" width="16" height="12" rx="2.5" {...common} />
          <path d="M8 21h8M12 17v4M4 9h16M8 13h2M12 13h4" {...common} />
        </>
      ) : kind === "message" ? (
        <>
          <path d="M5 6h14v10H9l-4 4V6Z" {...common} />
          <path d="M8 10h8M8 13h5" {...common} />
        </>
      ) : kind === "shield" ? (
        <>
          <path
            d="M12 3 5.5 5.5v5.7c0 4.2 2.7 7.6 6.5 9.1 3.8-1.5 6.5-4.9 6.5-9.1V5.5L12 3Z"
            {...common}
          />
        </>
      ) : kind === "key" ? (
        <>
          <circle cx="8" cy="13" r="3" {...common} />
          <path d="m11 13 8-8M16 8l2 2M14 10l2 2" {...common} />
        </>
      ) : kind === "sliders" ? (
        <>
          <path
            d="M5 7h14M5 17h14M9 7a2 2 0 1 0 0 .01M15 17a2 2 0 1 0 0 .01M14 12H5M19 12h-4M15 12a2 2 0 1 0 0 .01"
            {...common}
          />
        </>
      ) : kind === "scanner" ? (
        <>
          <path d="M4 7V5a1 1 0 0 1 1-1h2" {...common} />
          <path d="M17 4h2a1 1 0 0 1 1 1v2" {...common} />
          <path d="M20 17v2a1 1 0 0 1-1 1h-2" {...common} />
          <path d="M7 20H5a1 1 0 0 1-1-1v-2" {...common} />
          <path d="M7 8h10M7 12h10M7 16h6" {...common} />
        </>
      ) : (
        <>
          <path d="M9.5 14.5 14.5 9.5" {...common} />
          <path d="M8 9.5 6.8 10.7a4 4 0 0 0 5.7 5.7L14 15" {...common} />
          <path d="m10 9 1.5-1.5a4 4 0 0 1 5.7 5.7L16 14.5" {...common} />
        </>
      )}
    </svg>
  );
}

export function ModulesDesignSettingLine({
  line,
  expandedRows,
  onToggleExpanded,
  nested = false,
}: {
  line: ModulesDesignLine;
  expandedRows: string[];
  onToggleExpanded: (id: string) => void;
  nested?: boolean;
}) {
  if (line.hidden) return null;
  const visibleChildren = (line.children || []).filter((child) => !child.hidden);
  const hasChildren = visibleChildren.length > 0;
  const expanded = hasChildren && expandedRows.includes(line.id);
  const disabled = Boolean(line.disabled);
  const hasValueControl = Boolean(line.valueControl);
  const checked = Boolean(line.checked);
  const lineClassName = [
    "modules-design-setting-line",
    nested ? "is-subparameter" : "",
    hasChildren ? "has-children" : "",
    hasValueControl ? "is-value-row" : "",
    disabled ? "is-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const copy = (
    <>
      <strong>{line.title}</strong>
      {line.subtitle ? <span>{line.subtitle}</span> : null}
    </>
  );
  return (
    <div className={nested ? "modules-design-subtree" : "modules-design-tree"}>
      <div className={lineClassName}>
        <span className="modules-design-setting-icon">
          <ModulesDesignIcon kind={line.icon} />
        </span>
        {hasValueControl ? (
          <span className="modules-design-setting-copy modules-design-setting-copy--static">
            {copy}
          </span>
        ) : (
          <button
            type="button"
            className="modules-design-setting-copy"
            onClick={() => {
              if (!disabled)
                hasChildren
                  ? onToggleExpanded(line.id)
                  : line.onChange?.(!checked);
            }}
            disabled={disabled}
          >
            {copy}
          </button>
        )}
        {hasValueControl ? (
          <span className="modules-design-row-control">
            {line.valueControl}
          </span>
        ) : (
          <GuestSwitch
            checked={checked}
            onChange={(nextChecked) => line.onChange?.(nextChecked)}
            disabled={disabled}
          />
        )}
        {hasChildren ? (
          <button
            type="button"
            className={
              expanded
                ? "modules-design-row-chevron is-open"
                : "modules-design-row-chevron"
            }
            onClick={() => onToggleExpanded(line.id)}
            aria-label={
              expanded ? "Collapse sub settings" : "Expand sub settings"
            }
            aria-expanded={expanded}
          >
            <span>⌄</span>
          </button>
        ) : null}
      </div>
      {line.visibilityControl ? (
        <div
          className={
            nested
              ? "modules-design-visibility-row is-subparameter"
              : "modules-design-visibility-row"
          }
        >
          {line.visibilityControl}
        </div>
      ) : null}
      {expanded ? (
        <div className="modules-design-sub-list">
          {visibleChildren.map((child) => (
            <ModulesDesignSettingLine
              key={child.id}
              line={child}
              expandedRows={expandedRows}
              onToggleExpanded={onToggleExpanded}
              nested
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ModulesDesignGroupCard({
  group,
  expandedRows,
  onToggleExpanded,
}: {
  group: ModulesDesignGroup;
  expandedRows: string[];
  onToggleExpanded: (id: string) => void;
}) {
  const visibleRows = group.rows.filter((line) => !line.hidden);
  if (visibleRows.length === 0) return null;
  return (
    <section
      className={`modules-design-group-card modules-design-group-card--${group.tone} modules-design-group-card--id-${group.id}`}
    >
      <div
        className={
          group.hideSwitch
            ? "modules-design-group-header no-group-switch"
            : "modules-design-group-header"
        }
      >
        <span className="modules-design-group-icon">
          <ModulesDesignIcon kind={group.icon} />
        </span>
        <span className="modules-design-group-title">
          <strong>{group.title}</strong>
          <span>{group.subtitle}</span>
        </span>
        {group.hideSwitch ? null : (
          <GuestSwitch checked={group.checked} onChange={group.onChange} />
        )}
      </div>
      <div className="modules-design-settings-panel">
        {visibleRows.map((line) => (
          <ModulesDesignSettingLine
            key={line.id}
            line={line}
            expandedRows={expandedRows}
            onToggleExpanded={onToggleExpanded}
          />
        ))}
      </div>
    </section>
  );
}

export function GuestDownloadIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function GuestCopyIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function GuestLinkIcon() {
  return (
    <svg
      width="17"
      height="17"
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

export function GuestEyeIcon() {
  return (
    <svg
      width="18"
      height="18"
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

export function GuestInfoIcon() {
  return (
    <svg
      width="18"
      height="18"
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

export function GuestShieldIcon() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function GuestPaymentMethodIcon({ kind }: { kind: string }) {
  if (kind === "online_card") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
      </svg>
    );
  }
  if (kind === "paypal") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M7 21l1.5-9h4a4 4 0 0 0 0-8H8L5 21" />
        <path d="M9.5 17h3.2a4 4 0 0 0 4-3.4l.1-.6a3 3 0 0 0-3-3.5H10" />
      </svg>
    );
  }
  if (kind === "bank_transfer") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 10h18" />
        <path d="M5 10V8l7-4 7 4v2" />
        <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
        <path d="M4 21h16M3 17h18" />
      </svg>
    );
  }
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" />
    </svg>
  );
}

export function BillingPlusIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function BillingEditIcon() {
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
      <path d="m15 5 4 4" />
      <path d="M3 21l3.9-.9L19 8 16 5 3.9 17.1 3 21z" />
    </svg>
  );
}

export function BillingTrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function BillingPaypalIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 21l1.5-9h4a4 4 0 0 0 0-8H8L5 21" />
      <path d="M9.5 17h3.2a4 4 0 0 0 4-3.4l.1-.6a3 3 0 0 0-3-3.5H10" />
    </svg>
  );
}

export function BillingUploadIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function BillingCertificateIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 15h8M8 18h5" />
      <path d="M9 11l2 2 4-4" />
    </svg>
  );
}

export function BillingLockIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function BillingSaveIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

export function BillingInfoIcon() {
  return (
    <svg
      width="18"
      height="18"
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

export function BillingReceiptIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 2h12a1 1 0 0 1 1 1v19l-3-2-3 2-3-2-3 2-2-1.5V3a1 1 0 0 1 1-1Z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h3" />
    </svg>
  );
}

export function BillingLinkIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.08-7.08l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.08 7.08l1.71-1.71" />
    </svg>
  );
}

export function BillingUserBadgeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function BillingTagIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.59 13.41 12 22l-9-9V4h9l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

export function BillingPaymentTypeIcon({ type }: { type: PaymentType }) {
  if (type === "CASH") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 9h.01M18 15h.01" />
      </svg>
    );
  }
  if (type === "CARD") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3M14 15h3" />
      </svg>
    );
  }
  if (type === "ADVANCE") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (type === "BANK_TRANSFER") {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 10h18" />
        <path d="M5 10V8l7-4 7 4v2" />
        <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
        <path d="M4 21h16M3 17h18" />
      </svg>
    );
  }
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export function GuestUploadGlyph({ kind }: { kind: "image" | "logo" | "icon" }) {
  if (kind === "icon") {
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
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M4.93 4.93l2.83 2.83" />
        <path d="M16.24 16.24l2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
        <path d="M4.93 19.07l2.83-2.83" />
        <path d="M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="3" />
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function GuestUploadDropzone({
  title,
  subtitle,
  hint,
  accept,
  uploading,
  currentUrl,
  previewAlt,
  previewShape = "wide",
  iconKind = "image",
  onFile,
}: {
  title: string;
  subtitle: string;
  hint: string;
  accept?: string;
  uploading?: boolean;
  currentUrl?: string;
  previewAlt: string;
  previewShape?: "wide" | "round" | "square";
  iconKind?: "image" | "logo" | "icon";
  onFile: (file: File | null) => void;
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const acceptPattern = accept || "image/*";
  const onDropFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const selected = event.dataTransfer?.files?.[0] || null;
    if (!selected) return;
    onFile(selected);
  };

  return (
    <div className="gapp-upload-wrap">
      <label
        className={`gapp-upload-zone${isDragActive ? " drag-active" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isDragActive) setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          const related = event.relatedTarget as Node | null;
          if (related && event.currentTarget.contains(related)) return;
          setIsDragActive(false);
        }}
        onDrop={onDropFile}
      >
        <span className="gapp-upload-icon">
          <GuestUploadGlyph kind={iconKind} />
        </span>
        <span className="gapp-upload-copy">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <input
          className="gapp-file-input"
          type="file"
          accept={acceptPattern}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0] || null;
            onFile(selected);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <span className="gapp-hint">{uploading ? "Uploading..." : hint}</span>
      {currentUrl ? (
        <div className="gapp-upload-preview-row">
          <img
            className={`gapp-upload-preview ${previewShape}`}
            src={currentUrl}
            alt={previewAlt}
          />
          <a href={currentUrl} target="_blank" rel="noreferrer">
            Open uploaded image
          </a>
        </div>
      ) : null}
    </div>
  );
}
