import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppLocale } from '../locale'

type AuthLanguageDropdownProps = {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  ariaLabel: string
}

type LanguageOption = {
  code: AppLocale
  label: string
}

const languageOptions: LanguageOption[] = [
  { code: 'sl', label: 'SI' },
  { code: 'sr', label: 'RS' },
  { code: 'en', label: 'EN' },
]

function LanguageFlag({ code }: { code: AppLocale }) {
  if (code === 'sl') {
    return (
      <svg viewBox="0 0 24 18" role="img" aria-label="Slovenian flag" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="6" fill="#ffffff" />
        <rect y="6" width="24" height="6" fill="#0b5ed7" />
        <rect y="12" width="24" height="6" fill="#d83a34" />
        <path d="M5.4 3.1h4.2v4c0 2.1-1.6 3.8-3.3 4.6C4.6 10.9 3 9.2 3 7.1v-4h2.4Z" fill="#1f5fbf" stroke="#ffffff" strokeWidth="0.4" />
        <path d="M4.2 4.2 5.1 5.5l1.2-1.8 1.2 1.8.9-1.3v2.1H4.2Z" fill="#ffffff" />
        <path d="M4.4 8.4c.7.6 1.3.9 1.9 1.1.6-.2 1.2-.5 1.9-1.1" fill="none" stroke="#ffffff" strokeWidth="0.45" strokeLinecap="round" />
      </svg>
    )
  }

  if (code === 'sr') {
    return (
      <svg viewBox="0 0 24 18" role="img" aria-label="Serbian flag" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="6" fill="#c6363c" />
        <rect y="6" width="24" height="6" fill="#234aa5" />
        <rect y="12" width="24" height="6" fill="#ffffff" />
        <path d="M6.2 4.1h2.8v5c0 1.5-1.1 2.6-2.2 3.2-1.1-.6-2.2-1.7-2.2-3.2v-5h1.6Z" fill="#ffffff" stroke="#d4af37" strokeWidth="0.35" />
        <rect x="5.75" y="5.25" width="2.1" height="0.7" fill="#c6363c" />
        <rect x="6.45" y="4.55" width="0.7" height="2.1" fill="#c6363c" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 18" role="img" aria-label="United Kingdom flag" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="18" fill="#1d4aa8" />
      <path d="M0 0 24 18M24 0 0 18" stroke="#ffffff" strokeWidth="4" />
      <path d="M0 0 24 18M24 0 0 18" stroke="#d63131" strokeWidth="2" />
      <path d="M12 0v18M0 9h24" stroke="#ffffff" strokeWidth="6" />
      <path d="M12 0v18M0 9h24" stroke="#d63131" strokeWidth="3" />
    </svg>
  )
}

export function AuthLanguageDropdown({ locale, setLocale, ariaLabel }: AuthLanguageDropdownProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const selectedLanguage = useMemo(
    () => languageOptions.find((option) => option.code === locale) ?? languageOptions[0],
    [locale],
  )

  useEffect(() => {
    if (!open) return

    const closeOnOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideInteraction)
    document.addEventListener('touchstart', closeOnOutsideInteraction)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideInteraction)
      document.removeEventListener('touchstart', closeOnOutsideInteraction)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="login-language-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="login-language-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="login-language-globe" aria-hidden>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
          </svg>
        </span>
        <span className="login-language-current">{selectedLanguage.label}</span>
        <span className="login-language-chevron" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="login-language-menu" role="listbox" aria-label={ariaLabel}>
          {languageOptions.map((option) => (
            <button
              key={option.code}
              type="button"
              className={option.code === locale ? 'login-language-option active' : 'login-language-option'}
              role="option"
              aria-selected={option.code === locale}
              onClick={() => {
                setLocale(option.code)
                setOpen(false)
              }}
            >
              <span className="login-language-flag" aria-hidden>
                <LanguageFlag code={option.code} />
              </span>
              <span className="login-language-option-label">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
