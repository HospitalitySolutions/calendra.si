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
    case 'BUSINESS':
      return 'PREMIUM'
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

export function getDefaultAllowedRoute(packageType?: string | null) {
  const normalized = normalizePackageType(packageType)
  if (normalized === 'CUSTOM') return '/calendar'
  return '/calendar'
}