const THEME_KEY = 'therapy-theme'

export type ThemeMode = 'light' | 'dark'

export function getStoredTheme(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY)
  return v === 'dark' ? 'dark' : 'light'
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', mode)
  localStorage.setItem(THEME_KEY, mode)
}

/** Call once on app load before paint (e.g. from main.tsx). */
export function initTheme() {
  applyTheme(getStoredTheme())
}

/** Preserve theme when clearing storage (e.g. logout). */
export function clearAuthStoragePreservingTheme() {
  const theme = localStorage.getItem(THEME_KEY)
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('user')
  sessionStorage.removeItem('securityReauthToken')
  if (theme) localStorage.setItem(THEME_KEY, theme)
}
