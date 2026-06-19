export type CalendraPlatform = 'web' | 'android' | 'ios'

function readPlatformOverride(): CalendraPlatform | null {
  const raw = String(
    (import.meta.env.VITE_APP_PLATFORM as string | undefined)
      || (import.meta.env.VITE_PLATFORM as string | undefined)
      || '',
  ).trim().toLowerCase()
  const mode = String(import.meta.env.MODE || '').trim().toLowerCase()

  if (raw === 'android' || mode === 'android' || mode === 'androidemu') return 'android'
  if (raw === 'ios' || mode === 'ios') return 'ios'
  return null
}

export const appPlatform: CalendraPlatform = readPlatformOverride() ?? 'web'
export const isNativePlatform = appPlatform === 'android' || appPlatform === 'ios'
export const isNativeAndroid = appPlatform === 'android'
