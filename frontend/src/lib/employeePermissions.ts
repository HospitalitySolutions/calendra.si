import type { User } from './types'

export const EMPLOYEE_PERMISSIONS_MARKER = '__EMPLOYEE_PERMISSIONS_V2'
export const WALLET_SCANNER_PERMISSION = 'WALLET_ENTITLEMENT_SCAN'
export const BILLING_ADVANCE_INVOICE_PERMISSION = 'BILLING_ADVANCE_INVOICE_ISSUE'
export const BILLING_OPEN_INVOICE_PERMISSION = 'BILLING_OPEN_INVOICE_ISSUE'
export const BILLING_REFUND_PERMISSION = 'BILLING_REFUND_ISSUE'

export const EMPLOYEE_PERMISSION_GROUP_KEYS = [
  'CALENDAR_BOOKINGS',
  'CLIENTS',
  'EMPLOYEES',
  'BILLING',
  'WALLET',
  'REPORTS',
  'SETTINGS',
  'INTEGRATIONS',
  'PLATFORM_FEATURES',
] as const

export const EMPLOYEE_PERMISSION_ACTION_KEYS = ['VIEW', 'CREATE', 'EDIT', 'DELETE'] as const

const MATRIX_EMPLOYEE_PERMISSIONS = EMPLOYEE_PERMISSION_GROUP_KEYS.flatMap((group) =>
  EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => `${group}_${action}` as const),
)

export const DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS = [
  BILLING_ADVANCE_INVOICE_PERMISSION,
  BILLING_OPEN_INVOICE_PERMISSION,
  BILLING_REFUND_PERMISSION,
] as const

export const ALL_EMPLOYEE_PERMISSIONS = [
  WALLET_SCANNER_PERMISSION,
  BILLING_ADVANCE_INVOICE_PERMISSION,
  BILLING_OPEN_INVOICE_PERMISSION,
  BILLING_REFUND_PERMISSION,
  ...MATRIX_EMPLOYEE_PERMISSIONS,
] as const

export type EmployeePermission = typeof ALL_EMPLOYEE_PERMISSIONS[number]

const allPermissionSet = new Set<string>(ALL_EMPLOYEE_PERMISSIONS)
const defaultEnabledPermissionSet = new Set<string>(DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS)

export function normalizeEmployeePermissions(permissions?: string[] | null): EmployeePermission[] {
  const raw = Array.isArray(permissions) ? permissions : []
  const hasMarker = raw.includes(EMPLOYEE_PERMISSIONS_MARKER)
  const values = new Set(raw.filter((permission) => allPermissionSet.has(permission)))

  // Existing tenants/users created before invoice permissions did not have these flags saved.
  // Treat those legacy rows as ON by default, while rows saved by the new editor include the marker
  // and can intentionally turn any invoice permission OFF.
  if (!hasMarker) {
    DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS.forEach((permission) => values.add(permission))
  }

  return ALL_EMPLOYEE_PERMISSIONS.filter((permission) => values.has(permission))
}

export function hasEmployeePermission(user: Pick<User, 'role' | 'permissions'> | null | undefined, permission: EmployeePermission): boolean {
  if (!user) return false
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true
  return normalizeEmployeePermissions(user.permissions).includes(permission)
}

export function canIssueAdvanceInvoices(user: Pick<User, 'role' | 'permissions'> | null | undefined): boolean {
  return hasEmployeePermission(user, BILLING_ADVANCE_INVOICE_PERMISSION)
}

export function canIssueOpenInvoices(user: Pick<User, 'role' | 'permissions'> | null | undefined): boolean {
  return hasEmployeePermission(user, BILLING_OPEN_INVOICE_PERMISSION)
}

export function canIssueRefundInvoices(user: Pick<User, 'role' | 'permissions'> | null | undefined): boolean {
  return hasEmployeePermission(user, BILLING_REFUND_PERMISSION)
}
