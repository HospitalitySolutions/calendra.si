import { createPortal } from 'react-dom'
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SelectHTMLAttributes,
} from 'react'

const DESKTOP_MEDIA_QUERY = '(min-width: 1025px)'
const DEFAULT_SEARCH_THRESHOLD = 6
const VIEWPORT_GUTTER = 8
const PANEL_GAP = 7

type DesktopSelectOption = {
  index: number
  value: string
  label: string
  disabled: boolean
  hidden: boolean
  groupLabel: string | null
}

export type DesktopSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Show the desktop search field when at least this many visible options exist. */
  desktopSearchThreshold?: number
}

function isDesktopViewport() {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') return window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  return window.innerWidth >= 1025
}

function readOptions(select: HTMLSelectElement): DesktopSelectOption[] {
  return Array.from(select.options).map((option, index) => {
    const parent = option.parentElement
    const optgroup = parent instanceof HTMLOptGroupElement ? parent : null
    return {
      index,
      value: option.value,
      label: option.label || option.textContent?.trim() || option.value,
      disabled: option.disabled || Boolean(optgroup?.disabled),
      hidden: option.hidden,
      groupLabel: optgroup?.label || null,
    }
  })
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

function SelectChevron() {
  return (
    <svg
      className="app-desktop-select-panel__check"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export const DesktopSelect = forwardRef<HTMLSelectElement, DesktopSelectProps>(function DesktopSelect(
  {
    children,
    className,
    desktopSearchThreshold = DEFAULT_SEARCH_THRESHOLD,
    disabled,
    onChange,
    onClick,
    onKeyDown,
    onMouseDown,
    value,
    defaultValue,
    ...rest
  },
  forwardedRef,
) {
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<DesktopSelectOption[]>([])
  const [selectedValue, setSelectedValue] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  const setSelectRef = useCallback(
    (node: HTMLSelectElement | null) => {
      selectRef.current = node
      if (typeof forwardedRef === 'function') {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    },
    [forwardedRef],
  )

  const refreshSnapshot = useCallback(() => {
    const select = selectRef.current
    if (!select) return []
    const nextOptions = readOptions(select)
    setOptions(nextOptions)
    setSelectedValue(select.value)
    return nextOptions
  }, [])

  const positionPanel = useCallback(() => {
    const select = selectRef.current
    if (!select || typeof window === 'undefined') return
    const rect = select.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const width = Math.min(420, Math.max(rect.width, 280))
    const measuredHeight = panelRef.current?.offsetHeight
    const estimatedHeight = Math.min(360, Math.max(180, viewportHeight * 0.48))
    const panelHeight = measuredHeight || estimatedHeight

    let left = rect.left
    if (left + width > viewportWidth - VIEWPORT_GUTTER) {
      left = viewportWidth - width - VIEWPORT_GUTTER
    }
    left = Math.max(VIEWPORT_GUTTER, left)

    const belowTop = rect.bottom + PANEL_GAP
    const aboveTop = rect.top - panelHeight - PANEL_GAP
    const hasRoomBelow = belowTop + panelHeight <= viewportHeight - VIEWPORT_GUTTER
    const hasMoreRoomAbove = rect.top > viewportHeight - rect.bottom
    let top = hasRoomBelow || !hasMoreRoomAbove ? belowTop : aboveTop
    top = Math.max(VIEWPORT_GUTTER, Math.min(top, viewportHeight - panelHeight - VIEWPORT_GUTTER))

    setPanelStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      zIndex: 16000,
    })
  }, [])

  const visibleOptions = options.filter((option) => !option.hidden)
  const normalizedQuery = normalizeSearch(query)
  const filteredOptions = normalizedQuery
    ? visibleOptions.filter((option) => normalizeSearch(option.label).includes(normalizedQuery))
    : visibleOptions
  const showSearch = visibleOptions.length >= desktopSearchThreshold

  const findFirstEnabledIndex = useCallback((items: DesktopSelectOption[]) => {
    const selectedIndex = items.findIndex((option) => option.value === selectRef.current?.value && !option.disabled)
    if (selectedIndex >= 0) return selectedIndex
    return items.findIndex((option) => !option.disabled)
  }, [])

  const openPanel = useCallback(() => {
    if (disabled || !isDesktopViewport()) return
    const nextOptions = refreshSnapshot().filter((option) => !option.hidden)
    setQuery('')
    setActiveIndex(findFirstEnabledIndex(nextOptions))
    positionPanel()
    setOpen(true)
  }, [disabled, findFirstEnabledIndex, positionPanel, refreshSnapshot])

  const closePanel = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }, [])

  const selectOption = useCallback(
    (option: DesktopSelectOption) => {
      const select = selectRef.current
      if (!select || option.disabled) return

      if (select.value !== option.value) {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        if (valueSetter) valueSetter.call(select, option.value)
        else select.value = option.value
        setSelectedValue(option.value)
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }

      closePanel()
      requestAnimationFrame(() => select.focus({ preventScroll: true }))
    },
    [closePanel],
  )

  const moveActive = useCallback(
    (direction: 1 | -1) => {
      if (filteredOptions.length === 0) return
      let index = activeIndex
      for (let attempts = 0; attempts < filteredOptions.length; attempts += 1) {
        index = (index + direction + filteredOptions.length) % filteredOptions.length
        if (!filteredOptions[index]?.disabled) {
          setActiveIndex(index)
          return
        }
      }
    },
    [activeIndex, filteredOptions],
  )

  const handleMouseDown = (event: MouseEvent<HTMLSelectElement>) => {
    onMouseDown?.(event)
    if (event.defaultPrevented || event.button !== 0 || disabled || !isDesktopViewport()) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    if (open) closePanel()
    else openPanel()
  }

  const handleClick = (event: MouseEvent<HTMLSelectElement>) => {
    onClick?.(event)
    if (disabled || !isDesktopViewport()) return
    event.preventDefault()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLSelectElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled || !isDesktopViewport()) return

    if (!open) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        openPanel()
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      closePanel()
      return
    }
    if (event.key === 'Tab') {
      closePanel()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      const first = filteredOptions.findIndex((option) => !option.disabled)
      if (first >= 0) setActiveIndex(first)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      for (let i = filteredOptions.length - 1; i >= 0; i -= 1) {
        if (!filteredOptions[i]?.disabled) {
          setActiveIndex(i)
          break
        }
      }
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const active = filteredOptions[activeIndex]
      if (active) selectOption(active)
    }
  }

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedValue(event.currentTarget.value)
    onChange?.(event)
  }

  useLayoutEffect(() => {
    refreshSnapshot()
    if (open) requestAnimationFrame(positionPanel)
  }, [children, value, defaultValue, open, positionPanel, refreshSnapshot])

  useLayoutEffect(() => {
    if (!open) return
    positionPanel()
    const panel = panelRef.current
    if (!panel || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => positionPanel())
    observer.observe(panel)
    return () => observer.disconnect()
  }, [open, filteredOptions.length, positionPanel, showSearch])

  useEffect(() => {
    if (!open) return

    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (selectRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      closePanel()
    }
    const onWindowChange = () => {
      if (!isDesktopViewport()) closePanel()
      else positionPanel()
    }

    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', positionPanel, true)
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      window.removeEventListener('resize', onWindowChange)
      window.removeEventListener('scroll', positionPanel, true)
    }
  }, [closePanel, open, positionPanel])

  useEffect(() => {
    if (!open) return
    const selectedIndex = filteredOptions.findIndex((option) => option.value === selectedValue && !option.disabled)
    if (selectedIndex >= 0) setActiveIndex(selectedIndex)
    else setActiveIndex(filteredOptions.findIndex((option) => !option.disabled))
  }, [options, normalizedQuery, open, selectedValue])

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={panelRef}
          id={panelId}
          className="app-desktop-select-panel"
          role="listbox"
          aria-label={rest['aria-label'] || rest.name || 'Select options'}
          style={panelStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {showSearch && (
            <div className="app-desktop-select-panel__search-wrap">
              <SearchIcon />
              <input
                ref={searchRef}
                className="app-desktop-select-panel__search"
                type="search"
                value={query}
                placeholder={selectRef.current?.selectedOptions?.[0]?.label || ''}
                aria-label="Search options"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    closePanel()
                    selectRef.current?.focus({ preventScroll: true })
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    moveActive(1)
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    moveActive(-1)
                  } else if (event.key === 'Enter') {
                    const active = filteredOptions[activeIndex] || filteredOptions.find((option) => !option.disabled)
                    if (active) {
                      event.preventDefault()
                      selectOption(active)
                    }
                  }
                }}
              />
            </div>
          )}
          <div className="app-desktop-select-panel__scroll">
            {filteredOptions.length === 0 ? (
              <div className="app-desktop-select-panel__empty">—</div>
            ) : (
              filteredOptions.map((option, index) => {
                const previous = filteredOptions[index - 1]
                const showGroup = Boolean(option.groupLabel && option.groupLabel !== previous?.groupLabel)
                const selected = option.value === selectedValue
                const active = index === activeIndex
                return (
                  <div key={`${option.index}-${option.value}`} className="app-desktop-select-panel__option-block">
                    {showGroup && <div className="app-desktop-select-panel__group">{option.groupLabel}</div>}
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      className={`app-desktop-select-panel__option${selected ? ' app-desktop-select-panel__option--selected' : ''}${active ? ' app-desktop-select-panel__option--active' : ''}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                      onClick={() => selectOption(option)}
                    >
                      <span className="app-desktop-select-panel__label">{option.label}</span>
                      {selected ? <SelectChevron /> : <span className="app-desktop-select-panel__check-spacer" aria-hidden="true" />}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <select
        {...rest}
        ref={setSelectRef}
        className={`${className ? `${className} ` : ''}app-desktop-select`}
        disabled={disabled}
        value={value}
        defaultValue={defaultValue}
        aria-controls={open ? panelId : rest['aria-controls']}
        aria-expanded={open ? true : undefined}
        onChange={handleChange}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
      >
        {children}
      </select>
      {panel}
    </>
  )
})
