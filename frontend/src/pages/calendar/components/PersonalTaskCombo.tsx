import { useMemo } from 'react'

/** Personal block task: type freely or open client-style dropdown for predefined tasks. */
export function PersonalTaskCombo({
  value,
  onChange,
  placeholder,
  presets,
  dropdownOpen,
  onDropdownOpenChange,
  selectPredefinedLabel,
  noMatchLabel,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  presets: string[]
  dropdownOpen: boolean
  onDropdownOpenChange: (open: boolean) => void
  selectPredefinedLabel: string
  noMatchLabel: string
}) {
  const visiblePresets = useMemo(() => {
    const q = value.trim().toLowerCase()
    return presets.filter((p) => !q || p.toLowerCase().includes(q)).slice(0, 20)
  }, [presets, value])

  if (presets.length === 0) {
    return <input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  }

  return (
    <div className="client-picker personal-task-combo" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0, flex: 1 }}>
      <div className="client-search-wrap client-search-wrap--task-combo">
        <input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onDropdownOpenChange(true)}
        />
        <button
          type="button"
          className="client-task-preset-chevron"
          aria-label={selectPredefinedLabel}
          aria-expanded={dropdownOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDropdownOpenChange(!dropdownOpen)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {dropdownOpen && (
        <div className="client-dropdown-panel">
          {visiblePresets.map((task) => (
            <button
              key={task}
              type="button"
              className={`client-list-item ${value.trim() === task ? 'selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(task)
                onDropdownOpenChange(false)
              }}
            >
              {task}
            </button>
          ))}
          {visiblePresets.length === 0 && <span className="muted" style={{ padding: '8px 12px', display: 'block' }}>{noMatchLabel}</span>}
        </div>
      )}
    </div>
  )
}
