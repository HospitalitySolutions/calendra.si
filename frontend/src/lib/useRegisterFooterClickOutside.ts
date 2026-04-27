import { type RefObject, useEffect } from 'react'

/**
 * When the register estimate footer is expanded, collapse it on pointer down outside the footer
 * (capture phase so it runs before other handlers).
 */
export function useRegisterFooterClickOutside(
  footerRef: RefObject<HTMLElement | null>,
  expanded: boolean,
  setExpanded: (value: boolean) => void,
): void {
  useEffect(() => {
    if (!expanded) return
    const onPointerDown = (event: PointerEvent) => {
      const root = footerRef.current
      if (!root) return
      const target = event.target
      if (!target || !(target instanceof Node)) return
      if (root.contains(target)) return
      setExpanded(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [expanded, footerRef, setExpanded])
}
