import { MouseEvent, ReactNode, RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { currentOverlayDepth, usePanelChrome } from './usePanelChrome'

export type PanelSize = 'sm' | 'md' | 'lg' | 'xl'

export type SidePanelProps = {
  open: boolean
  onClose: () => void
  /** Accessible name. Pass the same text you render in `PanelHeader`. */
  ariaLabel: string
  size?: PanelSize
  /**
   * `side` (default) is the right-anchored full-height drawer used by forms and detail views.
   * `center` is a centered content modal, for short self-contained dialogs that are not
   * confirmations — a language picker, a chooser, a scanner (use `ConfirmDialog` for confirms).
   */
  placement?: 'side' | 'center'
  children: ReactNode
  /** Clicking the scrim closes by default; disable for forms with unsaved work. */
  closeOnScrimClick?: boolean
  closeOnEscape?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  className?: string
}

/**
 * Panel rendered in a portal, right-anchored and full-height by default.
 *
 * Panels are the standard container for every form and detail view. Open state is
 * normally derived from the URL (see `lib/drawerRoutes`), so `onClose` should navigate
 * back rather than flip a local boolean.
 */
export function SidePanel({
  open,
  onClose,
  ariaLabel,
  size = 'md',
  placement = 'side',
  children,
  closeOnScrimClick = true,
  closeOnEscape = true,
  initialFocusRef,
  className = '',
}: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [depth] = useState(() => (open ? currentOverlayDepth() : 0))

  usePanelChrome(panelRef, { open, onClose, initialFocusRef, closeOnEscape })

  const onScrimMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!closeOnScrimClick) return
      if (e.target !== e.currentTarget) return
      onClose()
    },
    [closeOnScrimClick, onClose],
  )

  if (!open) return null

  return createPortal(
    <div
      data-cp-overlay="panel"
      data-depth={depth}
      className={`cp-scrim${placement === 'center' ? ' cp-scrim--center' : ''}`}
      onMouseDown={onScrimMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`cp-panel cp-panel--${size}${placement === 'center' ? ' cp-panel--center' : ''} ${className}`.trim()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

function DialogCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  /** Supporting copy, or richer content via `children`. */
  text?: string
  children?: ReactNode
  tone?: 'default' | 'danger' | 'warning'
  icon?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Optional top-right X using the same icon-button treatment as side-panel headers. */
  showCloseButton?: boolean
  closeLabel?: string
  onConfirm: () => void
  busy?: boolean
  /** Blocks confirm without the busy spinner, for dialogs whose `children` hold a required field. */
  confirmDisabled?: boolean
  /** Stack actions vertically when the labels are long (e.g. recurring-delete choices). */
  stackedActions?: boolean
  wide?: boolean
  /** Extra actions rendered before the cancel button. */
  extraActions?: ReactNode
}

/**
 * Small centered dialog for confirmations. Confirmations deliberately have no URL —
 * only forms and detail views are routed.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  text,
  children,
  tone = 'default',
  icon,
  confirmLabel,
  cancelLabel,
  showCloseButton = false,
  closeLabel = 'Close',
  onConfirm,
  busy = false,
  confirmDisabled = false,
  stackedActions = false,
  wide = false,
  extraActions,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [depth] = useState(() => (open ? currentOverlayDepth() : 0))

  usePanelChrome(dialogRef, { open, onClose })

  if (!open) return null

  const confirmTone = tone === 'danger' ? 'cp-btn--danger' : 'cp-btn--primary'

  return createPortal(
    <div
      data-cp-overlay="dialog"
      data-depth={depth}
      className="cp-scrim cp-scrim--dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`cp-dialog${wide ? ' cp-dialog--wide' : ''}`}
      >
        {showCloseButton ? (
          <button type="button" className="cp-icon-btn cp-dialog__close" onClick={onClose} aria-label={closeLabel} title={closeLabel} disabled={busy}>
            <DialogCloseIcon />
          </button>
        ) : null}
        <div className="cp-dialog__head">
          {icon && (
            <div
              className={`cp-dialog__icon${tone === 'danger' ? ' cp-dialog__icon--danger' : tone === 'warning' ? ' cp-dialog__icon--warning' : ''}`}
              aria-hidden
            >
              {icon}
            </div>
          )}
          <div>
            <h3 className="cp-dialog__title">{title}</h3>
            {text && <p className="cp-dialog__text">{text}</p>}
          </div>
        </div>

        {children && <div className="cp-dialog__body">{children}</div>}

        <div className={`cp-dialog__actions${stackedActions ? ' cp-dialog__actions--stacked' : ''}`}>
          {/* Stacked dialogs read top-down (choices first, cancel last); inline ones read
              left-to-right with the primary action anchored on the right. */}
          {stackedActions ? (
            <>
              <button type="button" className={`cp-btn ${confirmTone}`} onClick={onConfirm} disabled={busy || confirmDisabled}>
                {busy && <span className="cp-btn__spinner" aria-hidden />}
                {confirmLabel}
              </button>
              {extraActions}
              {cancelLabel && (
                <button type="button" className="cp-btn cp-btn--ghost" onClick={onClose} disabled={busy}>
                  {cancelLabel}
                </button>
              )}
            </>
          ) : (
            <>
              {extraActions}
              {cancelLabel && (
                <button type="button" className="cp-btn cp-btn--ghost" onClick={onClose} disabled={busy}>
                  {cancelLabel}
                </button>
              )}
              <button type="button" className={`cp-btn ${confirmTone}`} onClick={onConfirm} disabled={busy || confirmDisabled}>
                {busy && <span className="cp-btn__spinner" aria-hidden />}
                {confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Closes a popover-style element when clicking outside it or pressing Escape.
 * Used by `PanelOverflowMenu` and available for unrouted row menus.
 */
export function useDismissable(ref: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: globalThis.MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      onDismiss()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDismiss()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [ref, open, onDismiss])
}
