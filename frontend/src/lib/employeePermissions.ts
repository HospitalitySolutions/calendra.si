import type { User } from './types'

export const EMPLOYEE_PERMISSIONS_MARKER = '__EMPLOYEE_PERMISSIONS_V2'
export const WALLET_SCANNER_PERMISSION = 'WALLET_ENTITLEMENT_SCAN'
export const CALENDAR_BOOKINGS_VIEW_PERMISSION = 'CALENDAR_BOOKINGS_VIEW'
export const BILLING_ADVANCE_INVOICE_PERMISSION = 'BILLING_ADVANCE_INVOICE_ISSUE'
export const BILLING_OPEN_INVOICE_PERMISSION = 'BILLING_OPEN_INVOICE_ISSUE'
export const BILLING_REFUND_PERMISSION = 'BILLING_REFUND_ISSUE'

export const EMPLOYEE_PERMISSION_GROUP_KEYS = [
  'CALENDAR_BOOKINGS',
  'CLIENTS',
  'EMPLOYEES',
  'ROLES_PERMISSIONS',
  'SERVICES',
  'SPACES',
  'COURSES',
  'BILLING_INVOICES',
  'ORDERS',
  'WALLET_BENEFITS',
  'INBOX_MESSAGES',
  'NOTIFICATIONS',
  'DELIVERY_LOGS',
  'REPORTS_ANALYTICS',
  'SETTINGS',
  'INTEGRATIONS',
  'WEBSITE_WIDGET',
  'GUEST_MOBILE_APP',
  'PAYMENTS',
  'SCANNER',
] as const

export const EMPLOYEE_PERMISSION_ACTION_KEYS = ['VIEW', 'CREATE', 'EDIT', 'DELETE'] as const

const LEGACY_EMPLOYEE_PERMISSION_GROUP_KEYS = [
  'BILLING',
  'WALLET',
  'REPORTS',
  'PLATFORM_FEATURES',
] as const

const MATRIX_EMPLOYEE_PERMISSIONS = EMPLOYEE_PERMISSION_GROUP_KEYS.flatMap((group) =>
  EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => `${group}_${action}` as const),
)

const LEGACY_MATRIX_EMPLOYEE_PERMISSIONS = LEGACY_EMPLOYEE_PERMISSION_GROUP_KEYS.flatMap((group) =>
  EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => `${group}_${action}` as const),
)

export const DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS = [
  CALENDAR_BOOKINGS_VIEW_PERMISSION,
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
  ...LEGACY_MATRIX_EMPLOYEE_PERMISSIONS,
] as const

export type EmployeePermission = typeof ALL_EMPLOYEE_PERMISSIONS[number]
export type EmployeePermissionGroup = typeof EMPLOYEE_PERMISSION_GROUP_KEYS[number]
export type EmployeePermissionAction = typeof EMPLOYEE_PERMISSION_ACTION_KEYS[number]

const allPermissionSet = new Set<string>(ALL_EMPLOYEE_PERMISSIONS)
function enforceViewDependencies(values: Set<string>) {
  for (const group of [...EMPLOYEE_PERMISSION_GROUP_KEYS, ...LEGACY_EMPLOYEE_PERMISSION_GROUP_KEYS]) {
    const viewPermission = `${group}_VIEW`
    if (values.has(viewPermission)) continue
    values.delete(`${group}_CREATE`)
    values.delete(`${group}_EDIT`)
    values.delete(`${group}_DELETE`)
  }
}

function addCompatibilityPermissions(values: Set<string>) {
  if (
    values.has('BILLING_INVOICES_CREATE') ||
    values.has('BILLING_INVOICES_EDIT') ||
    values.has('BILLING_CREATE') ||
    values.has('BILLING_EDIT')
  ) {
    values.add(BILLING_ADVANCE_INVOICE_PERMISSION)
    values.add(BILLING_OPEN_INVOICE_PERMISSION)
  }

  if (
    values.has('BILLING_INVOICES_DELETE') ||
    values.has('PAYMENTS_EDIT') ||
    values.has('PAYMENTS_DELETE') ||
    values.has('BILLING_DELETE') ||
    values.has('BILLING_EDIT')
  ) {
    values.add(BILLING_REFUND_PERMISSION)
  }

  if (
    values.has('SCANNER_VIEW') ||
    values.has('SCANNER_CREATE') ||
    values.has('SCANNER_EDIT') ||
    values.has('WALLET_VIEW') ||
    values.has('WALLET_CREATE') ||
    values.has('WALLET_EDIT')
  ) {
    values.add(WALLET_SCANNER_PERMISSION)
  }
}

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

  enforceViewDependencies(values)
  addCompatibilityPermissions(values)

  return ALL_EMPLOYEE_PERMISSIONS.filter((permission) => values.has(permission))
}

export function hasEmployeePermission(user: Pick<User, 'role' | 'permissions'> | null | undefined, permission: EmployeePermission): boolean {
  if (!user) return false
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true
  return normalizeEmployeePermissions(user.permissions).includes(permission)
}

export function hasAnyEmployeePermission(
  user: Pick<User, 'role' | 'permissions'> | null | undefined,
  permissions: readonly EmployeePermission[],
): boolean {
  return permissions.some((permission) => hasEmployeePermission(user, permission))
}

export function employeePermissionKey(group: EmployeePermissionGroup, action: EmployeePermissionAction): EmployeePermission {
  return `${group}_${action}` as EmployeePermission
}

export function hasEmployeePermissionAction(
  user: Pick<User, 'role' | 'permissions'> | null | undefined,
  group: EmployeePermissionGroup,
  action: EmployeePermissionAction,
): boolean {
  return hasEmployeePermission(user, employeePermissionKey(group, action))
}

export function hasEmployeeViewPermission(
  user: Pick<User, 'role' | 'permissions'> | null | undefined,
  group: EmployeePermissionGroup,
): boolean {
  return hasEmployeePermissionAction(user, group, 'VIEW')
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

export function canScanWalletEntitlements(user: Pick<User, 'role' | 'permissions'> | null | undefined): boolean {
  return hasEmployeePermission(user, WALLET_SCANNER_PERMISSION)
}
