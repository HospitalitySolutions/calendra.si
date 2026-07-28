import { useEffect, useState } from 'react'

function isTextEntryElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly
  if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) return false

  const nonTextInputTypes = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ])
  return !nonTextInputTypes.has((element.type || 'text').toLowerCase())
}

/** Detects the on-screen keyboard from visualViewport shrinkage rather than focus alone. */
export function useMobileKeyboardOpen(maxWidth = 1024): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const visualViewport = window.visualViewport
    if (!visualViewport) {
      setKeyboardOpen(false)
      return
    }

    let baselineHeight = visualViewport.height
    let baselineWidth = visualViewport.width
    let frameId = 0
    let orientationTimer: number | undefined

    const updateKeyboardState = () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        const viewport = window.visualViewport
        if (!viewport) {
          setKeyboardOpen(false)
          return
        }

        const currentHeight = viewport.height
        const currentWidth = viewport.width
        const textEntryFocused = isTextEntryElement(document.activeElement)
        const mobileViewport = window.matchMedia(`(max-width: ${maxWidth}px)`).matches

        if (Math.abs(currentWidth - baselineWidth) > 80) {
          baselineWidth = currentWidth
          baselineHeight = currentHeight
        }

        if (!textEntryFocused || currentHeight > baselineHeight) {
          baselineHeight = Math.max(baselineHeight, currentHeight)
        }

        const coveredHeight = baselineHeight - currentHeight
        const keyboardThreshold = Math.max(120, baselineHeight * 0.16)
        setKeyboardOpen(
          mobileViewport
          && textEntryFocused
          && viewport.scale <= 1.05
          && coveredHeight > keyboardThreshold,
        )
      })
    }

    const resetAfterOrientationChange = () => {
      setKeyboardOpen(false)
      if (orientationTimer) window.clearTimeout(orientationTimer)
      orientationTimer = window.setTimeout(() => {
        const viewport = window.visualViewport
        if (viewport) {
          baselineHeight = viewport.height
          baselineWidth = viewport.width
        }
        updateKeyboardState()
      }, 300)
    }

    document.addEventListener('focusin', updateKeyboardState)
    document.addEventListener('focusout', updateKeyboardState)
    visualViewport.addEventListener('resize', updateKeyboardState)
    visualViewport.addEventListener('scroll', updateKeyboardState)
    window.addEventListener('resize', updateKeyboardState)
    window.addEventListener('orientationchange', resetAfterOrientationChange)
    updateKeyboardState()

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      if (orientationTimer) window.clearTimeout(orientationTimer)
      document.removeEventListener('focusin', updateKeyboardState)
      document.removeEventListener('focusout', updateKeyboardState)
      visualViewport.removeEventListener('resize', updateKeyboardState)
      visualViewport.removeEventListener('scroll', updateKeyboardState)
      window.removeEventListener('resize', updateKeyboardState)
      window.removeEventListener('orientationchange', resetAfterOrientationChange)
    }
  }, [maxWidth])

  return keyboardOpen
}
