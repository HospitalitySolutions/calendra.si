import type { PackageType } from './types'

export function normalizePackageType(raw?: string | null): PackageType {
  const normalized = String(raw || '').trim().toUpperCase().replace(/[- ]/g, '_')
  switch (normalized) {
    case 'TRIAL':
    case 'BASIC':
    case 'PROFESSIONAL':
    case 'PREMIUM':
    case 'CUSTOM':
      return normalized
    case 'PRO':
      return 'PROFESSIONAL'
    default:
      return 'CUSTOM'
  }
}

export function hasBillingAccess(packageType?: string | null) {
  const normalized = normalizePackageType(packageType)
  return normalized === 'PROFESSIONAL' || normalized === 'PREMIUM' || normalized === 'CUSTOM'
}

export function hasInboxAccess(packageType?: string | null) {
  const normalized = normalizePackageType(packageType)
  return normalized === 'PREMIUM' || normalized === 'CUSTOM'
}

export function isRouteAllowed(pathname: string, packageType?: string | null) {
  if (pathname.startsWith('/billing')) return hasBillingAccess(packageType)
  if (pathname.startsWith('/inbox')) return hasInboxAccess(packageType)
  return true
}

export function getDefaultAllowedRoute(packageType?: string | null) {
  const normalized = normalizePackageType(packageType)
  if (normalized === 'CUSTOM') return '/calendar'
  return '/calendar'
}

export function getPackageLabel(packageType: string | null | undefined, locale: 'en' | 'sl') {
  switch (normalizePackageType(packageType)) {
    case 'TRIAL':
      return locale === 'sl' ? 'Preizkus' : 'Trial'
    case 'BASIC':
      return locale === 'sl' ? 'Osnovni' : 'Basic'
    case 'PROFESSIONAL':
      return locale === 'sl' ? 'Profesionalni' : 'Professional'
    case 'PREMIUM':
      return 'Premium'
    default:
      return locale === 'sl' ? 'Po meri' : 'Custom'
  }
}
