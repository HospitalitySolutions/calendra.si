import { useEffect } from 'react'

const PANEL_SELECTOR = [
  '.modal-backdrop > .modal',
  '[class*="-backdrop"] > [role="dialog"]',
  '[class*="-backdrop"] > [class*="-modal"]:not([class*="backdrop"])',
  '[class*="-backdrop"] > [class*="-dialog"]:not([class*="backdrop"])',
  '[class*="-backdrop"] > [class*="-drawer"]:not([class*="backdrop"])',
  '[class*="-backdrop"] > [class*="-card"]:not([class*="backdrop"])',
  '[class*="-popup-backdrop"] > [class*="-popup"]:not([class*="backdrop"])',
  '[class*="-popup-layer"] > [class*="-popup"]:not([class*="layer"])',
  '[class*="-overlay"] > [class*="-modal"]:not([class*="overlay"])',
  '[class*="-overlay"] > [class*="-dialog"]:not([class*="overlay"])',
  '[class*="-overlay"] > [class*="-drawer"]:not([class*="overlay"])',
  '[class*="-overlay"] > [class*="-card"]:not([class*="overlay"])',
  '[class*="-layer"] > [class*="-modal"]:not([class*="layer"])',
  '[class*="-layer"] > [class*="-drawer"]:not([class*="layer"])',
  '[class*="-layer"] > [role="dialog"]',
  '[class*="-submodal"] > [class*="-card"]',
  '.consumables-modal-backdrop > .consumables-modal',
  '.delivery-logs-modal-backdrop > .delivery-logs-modal',
  '.billing-payee-modal-backdrop > .billing-workspace-history-modal',
  '[role="dialog"][aria-modal="true"]',
].join(',')

const CLOSE_RE = /^(×|✕|x|zapri|close|zatvori)$/i
const CANCEL_RE = /^(prekliči|cancel|odustani)(?:\b.*)?$/i
const SAVE_TEXT_RE = /^(shrani|save|sačuvaj|update)(?:\b.*)?$/i
const CREATE_TEXT_RE = /^(dodaj|add|ustvari|create)(?:\b.*)?$/i

const normalizedPanelUi = new WeakMap<HTMLElement, {
  sourceSave: HTMLButtonElement | null
  save: HTMLButtonElement | null
  heading: HTMLElement
}>()

function visible(el: HTMLElement) {
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  if (el.closest('[aria-hidden="true"]')) return false
  return el.getClientRects().length > 0
}

function buttonText(button: HTMLButtonElement) {
  return (button.textContent || button.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')
}

function closeButtonFor(panel: HTMLElement): HTMLButtonElement | null {
  const candidates = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).filter(visible)
  const explicitClose = candidates.find((button) => {
    const aria = (button.getAttribute('aria-label') || '').trim()
    const text = buttonText(button)
    const className = typeof button.className === 'string' ? button.className : ''
    return /close/i.test(className) || /zapri|close|zatvori/i.test(aria) || CLOSE_RE.test(text)
  })
  if (explicitClose) return explicitClose

  // Some older popups only expose a footer Cancel action. The standardized X
  // proxies that action so every drawer can still be dismissed consistently.
  return candidates.find((button) => {
    if (!CANCEL_RE.test(buttonText(button))) return false
    return button.closest('footer, [class*="footer"], [class*="actions"], .form-actions, .modal-actions') != null
  }) ?? null
}

function saveButtonFor(panel: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).filter(visible)

  // A literal Save action is always the strongest signal.
  const explicitSave = buttons.filter((button) => SAVE_TEXT_RE.test(buttonText(button)))
  if (explicitSave.length) return explicitSave[explicitSave.length - 1]

  // Real form submits are safe to proxy. Use the explicit HTML attribute so a
  // plain <button> in a confirmation dialog is not mistaken for a Save action.
  const formSubmits = buttons.filter((button) =>
    button.getAttribute('type') === 'submit'
      && button.closest('form') != null
      && !CANCEL_RE.test(buttonText(button)),
  )
  if (formSubmits.length) return formSubmits[formSubmits.length - 1]

  // Create/Add actions only become header Save when they are clearly the
  // modal's primary/footer action, never an inline "Add row/item" control.
  const createActions = buttons.filter((button) => {
    if (!CREATE_TEXT_RE.test(buttonText(button))) return false
    const className = typeof button.className === 'string' ? button.className : ''
    return /(?:primary|save|submit)/i.test(className)
      || button.closest('footer, [class*="footer"], [class*="actions"], .form-actions, .modal-actions') != null
  })
  return createActions.length ? createActions[createActions.length - 1] : null
}


function standardizedSaveLabel(sourceSave: HTMLButtonElement) {
  const lang = (document.documentElement.lang || '').toLowerCase()
  if (lang.startsWith('sl')) return 'Shrani'
  if (lang.startsWith('sr')) return 'Sačuvaj'
  const sourceText = buttonText(sourceSave).toLowerCase()
  if (/shrani|ustvari|dodaj/.test(sourceText)) return 'Shrani'
  if (/sačuvaj/.test(sourceText)) return 'Sačuvaj'
  return 'Save'
}

function titleFor(panel: HTMLElement) {
  const titleEl = panel.querySelector<HTMLElement>('h1, h2, [class*="modal-title"], [class*="panel-title"], h3')
  const title = titleEl?.textContent?.trim().replace(/\s+/g, ' ')
  return { title: title || panel.getAttribute('aria-label') || 'Panel', titleEl }
}

function slugify(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'panel'
}

function routeSlugFor(panel: HTMLElement, title: string) {
  const explicit = panel.getAttribute('data-panel-route')
  if (explicit) return slugify(explicit)

  // Prefer stable component class names so URLs never accidentally expose a
  // client/person name from a dynamic title. Modifier classes distinguish
  // create/edit variants that share the same base modal component.
  const className = typeof panel.className === 'string' ? panel.className : ''
  const classParts = className
    .split(/\s+/)
    .filter(Boolean)
    .filter((name) => /(?:modal|panel|drawer)/i.test(name))
    .filter((name) => !/(?:backdrop|overlay|layer)/i.test(name))
    .filter((name) => !['modal', 'large-modal', 'booking-side-panel', 'app-side-panel'].includes(name))
  if (classParts.length) {
    // BEM modifiers usually encode a meaningful create/edit variant.
    const modifier = [...classParts].reverse().find((name) => name.includes('--'))
    if (modifier) return slugify(modifier.replace('--', '-'))

    // Component class lists tend to go from shared -> specific, e.g.
    // clients-action-workspace-modal -> clients-client-detail-modal.
    // The most specific class gives different popup types different URLs.
    return slugify(classParts[classParts.length - 1])
  }

  return slugify(title || 'panel')
}

function fireBackdropClose(panel: HTMLElement) {
  const backdrop = panel.parentElement
  if (!backdrop) return
  backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function normalizePanel(panel: HTMLElement) {
  panel.classList.add('app-side-panel')
  panel.parentElement?.classList.add('app-side-panel-backdrop')
  if (panel.dataset.sidePanelNormalized === '1') {
    const ui = normalizedPanelUi.get(panel)
    if (ui) {
      const currentTitle = titleFor(panel).title
      if (currentTitle && currentTitle !== 'Panel') ui.heading.textContent = currentTitle
      if (ui.save && ui.sourceSave) ui.save.disabled = ui.sourceSave.disabled
    }
    return
  }
  panel.dataset.sidePanelNormalized = '1'

  const { title, titleEl } = titleFor(panel)
  const originalClose = closeButtonFor(panel)
  const originalSave = saveButtonFor(panel)

  const header = document.createElement('div')
  header.className = 'app-side-panel-system-header'

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'app-side-panel-system-close'
  close.setAttribute('aria-label', 'Close')
  close.textContent = '×'
  close.addEventListener('click', () => {
    if (originalClose?.isConnected) originalClose.click()
    else fireBackdropClose(panel)
  })

  const heading = document.createElement('div')
  heading.className = 'app-side-panel-system-title'
  heading.textContent = title

  const actionSlot = document.createElement('div')
  actionSlot.className = 'app-side-panel-system-action'
  let syntheticSave: HTMLButtonElement | null = null
  if (originalSave && originalSave !== originalClose) {
    const save = document.createElement('button')
    syntheticSave = save
    save.type = 'button'
    save.className = 'app-side-panel-system-save'
    save.textContent = standardizedSaveLabel(originalSave)
    save.disabled = originalSave.disabled
    save.addEventListener('click', () => {
      if (!originalSave.disabled && originalSave.isConnected) originalSave.click()
    })
    actionSlot.appendChild(save)
    originalSave.classList.add('app-side-panel-system-source-save')
  }

  header.append(close, heading, actionSlot)
  panel.insertBefore(header, panel.firstChild)

  if (originalClose) originalClose.classList.add('app-side-panel-system-source-close')
  if (titleEl && !titleEl.closest('.app-side-panel-system-header')) titleEl.classList.add('app-side-panel-system-source-title')

  const sourceHeader = titleEl?.closest<HTMLElement>('header, [class*="header"], [class*="-head"]') ?? null
  if (sourceHeader && sourceHeader !== panel && originalClose && sourceHeader.contains(originalClose)) {
    const extraHeaderButtons = Array.from(sourceHeader.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button !== originalClose && button !== originalSave && visible(button),
    )
    const hasHeaderField = sourceHeader.querySelector('input, select, textarea') != null
    const hasHeaderMedia = sourceHeader.querySelector('img, video, canvas, [class*="avatar"], [class*="status"], [role="tablist"]') != null

    // Only remove a source header when it is genuinely just the old title/X row.
    // Many detail popups keep useful identity/status/subtitle content in the same
    // header as the title, which must stay visible below the standardized row.
    let remainingText = (sourceHeader.textContent || '').replace(/\s+/g, ' ').trim()
    const ignoredText = [
      titleEl?.textContent || '',
      ...Array.from(sourceHeader.querySelectorAll<HTMLButtonElement>('button')).map(buttonText),
    ]
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
    ignoredText.forEach((value) => {
      remainingText = remainingText.replace(value, '').replace(/\s+/g, ' ').trim()
    })

    if (extraHeaderButtons.length === 0 && !hasHeaderField && !hasHeaderMedia && !remainingText) {
      sourceHeader.classList.add('app-side-panel-system-source-header')
    } else {
      sourceHeader.classList.add('app-side-panel-system-content-header')
    }
  }

  if (originalSave) {
    const sourceFooter = originalSave.closest<HTMLElement>('footer, [class*="footer"], [class*="actions"], .form-actions, .modal-actions')
    if (sourceFooter && sourceFooter !== panel) {
      const otherMeaningfulButtons = Array.from(sourceFooter.querySelectorAll<HTMLButtonElement>('button')).filter((button) => {
        if (button === originalSave || button === originalClose) return false
        const text = buttonText(button)
        return visible(button) && !CANCEL_RE.test(text) && !CLOSE_RE.test(text)
      })
      if (otherMeaningfulButtons.length === 0) sourceFooter.classList.add('app-side-panel-system-source-footer')
    }
  }

  panel.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    if (button.closest('.app-side-panel-system-header')) return
    if (!CANCEL_RE.test(buttonText(button))) return
    const actionArea = button.closest('footer, [class*="footer"], [class*="actions"], .form-actions, .modal-actions')
    if (actionArea) button.classList.add('app-side-panel-system-cancel')
  })

  normalizedPanelUi.set(panel, { sourceSave: originalSave, save: syntheticSave, heading })
  panel.dataset.panelRoute = routeSlugFor(panel, title)
}

function desktopPanelCandidates() {
  if (!window.matchMedia('(min-width: 1025px)').matches) return [] as HTMLElement[]
  return Array.from(document.querySelectorAll<HTMLElement>(PANEL_SELECTOR))
    .filter((panel) => panel.isConnected && visible(panel))
    // Some screens put role=dialog on the dimmed layer itself. Normalize the content, never the layer.
    .filter((panel) => !/(?:backdrop|overlay|layer)/i.test(typeof panel.className === 'string' ? panel.className : ''))
    // Pickers/dropdowns are transient controls rather than application forms.
    .filter((panel) => !panel.matches('.modern-time-picker-dialog, .mobile-nav-overlay, .onboarding-tour, .clients-card-menu-popover'))
    // Calendar appointment/task/personal/availability editors have native routed drawers below.
    .filter((panel) => !panel.classList.contains('calendar-edit-session-panel'))
    // Keep tiny controls embedded in a calendar drawer as controls, while still
    // allowing a true nested modal with its own backdrop/layer to become a drawer.
    .filter((panel) => {
      if (!panel.closest('.calendar-edit-session-panel')) return true
      const parentClass = typeof panel.parentElement?.className === 'string' ? panel.parentElement.className : ''
      return /backdrop|overlay|layer/i.test(parentClass)
    })
}

function currentBrowserUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function rememberedDrawerBaseUrl() {
  const state = window.history.state as { calendraDrawer?: boolean; calendraDrawerBase?: string } | null
  return state?.calendraDrawer && typeof state.calendraDrawerBase === 'string'
    ? state.calendraDrawerBase
    : currentBrowserUrl()
}

/**
 * App-wide desktop popup rule:
 * - every modal becomes the same right drawer,
 * - X/title/save are normalized,
 * - the address bar receives /drawer/<panel> while the drawer is open.
 * Calendar editors have dedicated React routes and are intentionally excluded from the DOM URL synchronizer.
 */
export function AppSidePanelSystem() {
  useEffect(() => {
    let scheduled = 0
    let lastActive: HTMLElement | null = null
    let baseUrl = rememberedDrawerBaseUrl()

    const sync = () => {
      scheduled = 0
      const panels = desktopPanelCandidates()
      panels.forEach(normalizePanel)
      const active = panels[panels.length - 1] ?? null

      if (active) {
        if (!lastActive) {
          baseUrl = rememberedDrawerBaseUrl()
        }
        const slug = active.dataset.panelRoute || 'panel'
        const basePath = baseUrl.split('?')[0].split('#')[0].replace(/\/$/, '') || ''
        const search = window.location.search
        const hash = window.location.hash
        const target = `${basePath}/drawer/${slug}/${search}${hash}`
        if (currentBrowserUrl() !== target) {
          const nextState = { ...(window.history.state || {}), calendraDrawer: true, calendraDrawerBase: baseUrl }
          // One history entry represents the whole popup stack: Back closes the
          // stack, while opening/closing a nested popup only replaces its slug.
          if (!lastActive || !window.history.state?.calendraDrawer) window.history.pushState(nextState, '', target)
          else window.history.replaceState(nextState, '', target)
        }
      } else if (lastActive && window.history.state?.calendraDrawer) {
        // Return to the exact URL that was visible before the first popup opened.
        // Using Back instead of Replace also gives the browser back button native semantics.
        window.history.back()
      }
      lastActive = active
    }

    const schedule = () => {
      if (scheduled) return
      scheduled = window.requestAnimationFrame(sync)
    }

    const observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === 'childList') {
          return Array.from(record.addedNodes).some((node) => {
            if (!(node instanceof HTMLElement)) return false
            return node.matches(PANEL_SELECTOR) || node.querySelector(PANEL_SELECTOR) != null || /modal|dialog|backdrop|overlay|drawer|panel/i.test(node.className || '')
          }) || Array.from(record.removedNodes).some((node) => node instanceof HTMLElement && (node.classList.contains('app-side-panel') || node.querySelector?.('.app-side-panel') != null))
        }
        const target = record.target
        if (!(target instanceof HTMLElement)) return false
        return target.classList.contains('app-side-panel')
          || target.closest('.app-side-panel') != null
          || target.matches(PANEL_SELECTOR)
          || /modal|dialog|backdrop|overlay|drawer|panel/i.test(target.className || '')
      })
      if (relevant) schedule()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'open', 'disabled', 'aria-hidden'],
    })

    const onResize = () => schedule()
    const onPopState = () => {
      const panels = desktopPanelCandidates()
      const state = window.history.state as { calendraDrawer?: boolean } | null
      if (panels.length && !state?.calendraDrawer) {
        const active = panels[panels.length - 1]
        const originalClose = closeButtonFor(active)
        if (originalClose) originalClose.click()
        else fireBackdropClose(active)
      }
      schedule()
    }

    window.addEventListener('resize', onResize)
    window.addEventListener('popstate', onPopState)
    schedule()
    return () => {
      observer.disconnect()
      if (scheduled) window.cancelAnimationFrame(scheduled)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  return null
}
