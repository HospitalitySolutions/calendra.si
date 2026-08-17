import { RefObject, useEffect } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Number of open cp- overlays, so only the last one releases the body scroll lock. */
let openCount = 0

function lockBodyScroll() {
  openCount += 1
  document.body.classList.add('cp-scroll-locked')
}

function releaseBodyScroll() {
  openCount = Math.max(0, openCount - 1)
  if (openCount === 0) document.body.classList.remove('cp-scroll-locked')
}

/** How many cp- overlays are already on screen, used to dim stacked scrims progressively. */
export function currentOverlayDepth(): number {
  if (typeof document === 'undefined') return 0
  return document.querySelectorAll('[data-cp-overlay]').length
}

type PanelChromeOptions = {
  open: boolean
  onClose: () => void
  /** Element that receives focus on open. Falls back to the first focusable child. */
  initialFocusRef?: RefObject<HTMLElement | null>
  closeOnEscape?: boolean
}

/**
 * Shared overlay behaviour: body scroll lock, focus trap, focus restore and Escape to close.
 * Escape is only honoured by the topmost overlay so stacked panels close one at a time.
 */
export function usePanelChrome(
  containerRef: RefObject<HTMLElement | null>,
  { open, onClose, initialFocusRef, closeOnEscape = true }: PanelChromeOptions,
) {
  useEffect(() => {
    if (!open) return
    lockBodyScroll()
    return releaseBodyScroll
  }, [open])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const container = containerRef.current
    const target =
      initialFocusRef?.current ?? container?.querySelector<HTMLElement>(FOCUSABLE) ?? container
    // Wait a frame so the slide-in transform doesn't fight the scroll-into-view focus does.
    const raf = window.requestAnimationFrame(() => target?.focus({ preventScroll: true }))
    return () => {
      window.cancelAnimationFrame(raf)
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open, containerRef, initialFocusRef])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current
      if (!container) return

      if (e.key === 'Escape' && closeOnEscape) {
        const overlays = document.querySelectorAll('[data-cp-overlay]')
        if (overlays[overlays.length - 1] !== container.closest('[data-cp-overlay]')) return
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key !== 'Tab') return
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose, containerRef, closeOnEscape])
}
