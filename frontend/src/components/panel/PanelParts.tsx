import {
  CSSProperties,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  TouchEvent,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import { useDismissable } from './SidePanel'

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  )
}

export type PanelHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  closeLabel: string
  /** Optional leading control, normally a mobile back button for detail panels. */
  leading?: ReactNode
  /** Rendered left of the overflow menu and close button. */
  actions?: ReactNode
  overflow?: ReactNode
}

/** Standard panel header: title left, secondary actions then close on the right. */
export function PanelHeader({ title, subtitle, onClose, closeLabel, leading, actions, overflow }: PanelHeaderProps) {
  return (
    <div className="cp-panel-header">
      {leading ? <div className="cp-panel-header__leading">{leading}</div> : null}
      <div className="cp-panel-header__text">
        <h2 className="cp-panel-header__title">{title}</h2>
        {subtitle && <p className="cp-panel-header__subtitle">{subtitle}</p>}
      </div>
      <div className="cp-panel-header__actions">
        {actions}
        {overflow}
        <button type="button" className="cp-icon-btn" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}

export type PanelOverflowMenuProps = {
  label: string
  children: (close: () => void) => ReactNode
  disabled?: boolean
}

/** The `...` menu that holds destructive and rarely used actions. */
export function PanelOverflowMenu({ label, children, disabled }: PanelOverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const close = useCallback(() => setOpen(false), [])

  useDismissable(wrapRef, open, close)

  return (
    <div className="cp-menu" ref={wrapRef}>
      <button
        type="button"
        className="cp-icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="cp-menu__list" role="menu">
          {children(close)}
        </div>
      )}
    </div>
  )
}

export type PanelMenuItemProps = {
  onClick: () => void
  children: ReactNode
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
}

export function PanelMenuItem({ onClick, children, icon, danger, disabled }: PanelMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`cp-menu__item${danger ? ' cp-menu__item--danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  )
}

export type PanelTab = {
  id: string
  label: ReactNode
  /** When set the tab is a real URL; otherwise it falls back to `onSelect`. */
  to?: string
  icon?: ReactNode
  hidden?: boolean
}

export type PanelTabsProps = {
  tabs: PanelTab[]
  activeId: string
  label: string
  /** Optional content pinned to the bottom of vertical tab rails. */
  footer?: ReactNode
  /**
   * Called instead of following the link. Use it when switching tabs has to carry
   * unsaved form state across; the handler is responsible for navigating.
   */
  onSelect?: (id: string) => void
  /** Replace history instead of pushing, so tab switching doesn't fill the back stack. */
  replace?: boolean
}

/**
 * Tab bar under the header. Each tab is its own URL, so tabs are deep-linkable
 * and the browser back button steps between them.
 */
export function PanelTabs({ tabs, activeId, label, footer, onSelect, replace = true }: PanelTabsProps) {
  const visible = tabs.filter((tab) => !tab.hidden)
  return (
    <nav className="cp-panel-tabs" aria-label={label}>
      {visible.map((tab) => {
        const active = tab.id === activeId
        const className = `cp-panel-tab${active ? ' is-active' : ''}`
        if (tab.to) {
          return (
            <Link
              key={tab.id}
              to={tab.to}
              replace={replace}
              className={className}
              aria-current={active ? 'page' : undefined}
              onClick={
                onSelect
                  ? (e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                      e.preventDefault()
                      onSelect(tab.id)
                    }
                  : undefined
              }
            >
              {tab.icon}
              {tab.label}
            </Link>
          )
        }
        return (
          <button
            key={tab.id}
            type="button"
            className={className}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect?.(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
      {footer ? <div className="cp-panel-tabs__footer">{footer}</div> : null}
    </nav>
  )
}

export type PanelBodyProps = {
  children: ReactNode
  /** Remove padding for full-bleed content such as lists. */
  flush?: boolean
  /** Muted background so `PanelSection` cards read as cards. */
  sectioned?: boolean
  className?: string
  /** Renders a `<form>` so the panel footer's submit button can live outside it. */
  as?: 'div' | 'form'
  id?: string
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void
  onTouchStart?: (e: TouchEvent<HTMLElement>) => void
  onTouchEnd?: (e: TouchEvent<HTMLElement>) => void
  style?: CSSProperties
}

export function PanelBody({
  children,
  flush,
  sectioned,
  className = '',
  as = 'div',
  id,
  onSubmit,
  onClick,
  onTouchStart,
  onTouchEnd,
  style,
}: PanelBodyProps) {
  const cls = `cp-panel-body${flush ? ' cp-panel-body--flush' : ''}${sectioned ? ' cp-panel-body--sections' : ''} ${className}`.trim()
  const shared = { className: cls, onClick, onTouchStart, onTouchEnd, style }
  if (as === 'form') {
    return (
      <form id={id} onSubmit={onSubmit} {...shared}>
        {children}
      </form>
    )
  }
  return <div {...shared}>{children}</div>
}

export type PanelSectionProps = {
  title?: ReactNode
  /** Optional hook for feature-scoped visual treatment without wrapping the section. */
  className?: string
  icon?: ReactNode
  /** Always-visible chip next to the title, e.g. "0 privzeti artikli". */
  badge?: ReactNode
  /** What the section holds right now. Shown only while collapsed. */
  summary?: ReactNode
  /** Header control that is not the disclosure, e.g. a "group booking" switch. */
  action?: ReactNode
  description?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * A card in the panel body. Collapsible by default: collapsed sections keep only
 * their header, and `summary` tells the user what is inside without expanding.
 *
 * Open state is deliberately not persisted — a panel always reopens in the same
 * shape, so a form never hides a field the user forgot they collapsed.
 */
export function PanelSection({
  title,
  className = '',
  icon,
  badge,
  summary,
  action,
  description,
  collapsible = true,
  defaultOpen = true,
  children,
}: PanelSectionProps) {
  const bodyId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const toggle = useCallback(() => setOpen((value) => !value), [])

  const hasHeader = Boolean(title || action || badge)
  // Without a header there is nothing to click, so collapsing would trap the content.
  const canCollapse = collapsible && hasHeader
  const expanded = canCollapse ? open : true

  const heading = (
    <>
      {icon && (
        <span className="cp-section__icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="cp-section__heading">
        {title && <span className="cp-section__title">{title}</span>}
        {description && <span className="cp-section__desc">{description}</span>}
      </span>
      {badge && <span className="cp-section__badge">{badge}</span>}
      {!expanded && summary && <span className="cp-section__summary">{summary}</span>}
    </>
  )

  return (
    <section className={`cp-section${expanded ? '' : ' is-collapsed'}${className ? ` ${className}` : ''}`}>
      {hasHeader && (
        <div className="cp-section__head">
          {canCollapse ? (
            <button
              type="button"
              className="cp-section__toggle"
              onClick={toggle}
              aria-expanded={expanded}
              aria-controls={expanded ? bodyId : undefined}
            >
              {heading}
            </button>
          ) : (
            <div className="cp-section__toggle cp-section__toggle--static">{heading}</div>
          )}
          {action}
          {canCollapse && (
            // The glyph repeats the title button, so it stays out of the tab order
            // and out of the accessibility tree rather than announcing itself twice.
            <button
              type="button"
              className="cp-section__collapse"
              onClick={toggle}
              tabIndex={-1}
              aria-hidden
            >
              {expanded ? '−' : '+'}
            </button>
          )}
        </div>
      )}
      {expanded && (
        <div className="cp-section__body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  )
}

export type PanelFieldProps = {
  label: ReactNode
  children: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  /** Set when the control is not a single labelable element (e.g. a custom picker). */
  as?: 'label' | 'div'
}

export function PanelField({ label, children, hint, error, required, as = 'label' }: PanelFieldProps) {
  const hintId = useId()
  const Wrapper = as
  return (
    <Wrapper className="cp-field">
      <span className="cp-field__label">
        {label}
        {required && (
          <span className="cp-field__required" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error && (
        <span className="cp-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && <span className="cp-field__error">{error}</span>}
    </Wrapper>
  )
}

/** Puts two or more fields on one line; collapses to a single column on narrow panels. */
export function PanelFieldRow({ children, columns = 2 }: { children: ReactNode; columns?: number }) {
  return (
    <div className="cp-field-row" style={{ '--cp-cols': columns } as CSSProperties}>
      {children}
    </div>
  )
}

/**
 * Row of secondary actions and status, pinned directly above the footer.
 *
 * This is where per-record actions live (status, source, invoicing, scanner) so the
 * footer stays reserved for cancel/save. Prefer icon buttons with `title`; only status
 * carries a visible label because its value has to be readable at a glance.
 */
export function PanelActionBar({ children, info }: { children?: ReactNode; info?: ReactNode }) {
  return (
    <div className="cp-panel-actionbar">
      <div className="cp-panel-actionbar__items">{children}</div>
      {info && <div className="cp-panel-actionbar__info">{info}</div>}
    </div>
  )
}

export type PanelFooterProps = {
  /** Left-aligned summary, typically a total. */
  summaryLabel?: ReactNode
  summaryValue?: ReactNode
  children: ReactNode
}

/** Sticky footer. Actions are always right-aligned: cancel/ghost first, primary last. */
export function PanelFooter({ summaryLabel, summaryValue, children }: PanelFooterProps) {
  return (
    <div className="cp-panel-footer">
      {(summaryLabel || summaryValue) && (
        <div className="cp-panel-footer__summary">
          {summaryLabel && <span className="cp-panel-footer__summary-label">{summaryLabel}</span>}
          {summaryValue && <span className="cp-panel-footer__summary-value">{summaryValue}</span>}
        </div>
      )}
      <div className="cp-panel-footer__actions">{children}</div>
    </div>
  )
}

export type PanelButtonProps = {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger' | 'success'
  disabled?: boolean
  busy?: boolean
  icon?: ReactNode
  block?: boolean
  size?: 'md' | 'sm'
  form?: string
  title?: string
}

export function PanelButton({
  children,
  onClick,
  type = 'button',
  variant = 'ghost',
  disabled,
  busy,
  icon,
  block,
  size = 'md',
  form,
  title,
}: PanelButtonProps) {
  return (
    <button
      type={type}
      form={form}
      title={title}
      className={`cp-btn cp-btn--${variant}${block ? ' cp-btn--block' : ''}${size === 'sm' ? ' cp-btn--sm' : ''}`}
      onClick={onClick}
      disabled={disabled || busy}
    >
      {busy ? <span className="cp-btn__spinner" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export function PanelBanner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success' | 'warning'
  children: ReactNode
}) {
  return (
    <div className={`cp-banner cp-banner--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  )
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return <div className="cp-empty">{children}</div>
}

export type PanelRowProps = {
  title: ReactNode
  meta?: ReactNode
  value?: ReactNode
  onClick?: () => void
  leading?: ReactNode
  trailing?: ReactNode
  accent?: boolean
}

/** A compact list entry, e.g. a selected service or a client in a group. */
export function PanelRow({ title, meta, value, onClick, leading, trailing, accent }: PanelRowProps) {
  const content = (
    <>
      {leading}
      <span className="cp-row__main">
        <span className="cp-row__title">{title}</span>
        {meta && <span className="cp-row__meta">{meta}</span>}
      </span>
      {value && <span className="cp-row__value">{value}</span>}
      {trailing}
    </>
  )
  const className = `cp-row${accent ? ' cp-row--accent' : ''}`
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    )
  }
  return <div className={className}>{content}</div>
}
