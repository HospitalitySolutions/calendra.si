import '../styles/features/service-type-tabs.css'
import '../styles/features/clients-and-detail.css'
import '../styles/features/guest-app.css'
import '../styles/features.booking.css'
import '../styles/features/employee-roles.css'
import '../styles/features/modern-clients.css'
import { DesktopSelect } from '../components/DesktopSelect'
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import '../styles/features/employees-popup.css'
import { api } from '../api'
import { locationsQueryOptions, usersQueryOptions } from '../queries/sharedQueryOptions'
import { employeeRolesQueryOptions, staffQuotaQueryOptions } from '../queries/remainingQueryOptions'
import { queryKeys } from '../queries/queryKeys'
import { getStoredUser } from '../auth'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { GuestConfigSaveIcon } from '../components/GuestConfigSaveIcon'
import { ModernTimePicker } from '../components/ModernTimePicker'
import { GuestSwitch } from './configuration/ConfigurationVisualComponents'
import { EmployeeRolesPermissionsTab } from './EmployeeRolesPermissionsTab'
import {
  ServiceConfigDeleteButton,
  ServiceConfigEditButton,
  ServiceConfigSortableTableHeader,
  ServiceConfigTableFooter,
  nextServiceConfigSortState,
  sortServiceConfigRows,
  type ServiceConfigSortState,
} from '../components/ServiceConfigTableUi'
import { formatDate, fullName } from '../lib/format'
import { dayOptions, type DayOfWeek, type WorkingHoursConfig } from '../lib/types'
import {
  DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS,
  hasEmployeePermission,
  normalizeEmployeePermissions,
  type EmployeePermission,
} from '../lib/employeePermissions'

const EMPLOYEE_DAY_LABEL_KEY: Record<DayOfWeek, string> = {
  MONDAY: 'employeesDayMonday',
  TUESDAY: 'employeesDayTuesday',
  WEDNESDAY: 'employeesDayWednesday',
  THURSDAY: 'employeesDayThursday',
  FRIDAY: 'employeesDayFriday',
  SATURDAY: 'employeesDaySaturday',
  SUNDAY: 'employeesDaySunday',
}
import { useLocale, type AppLocale } from '../locale'
import { ConfirmDialog, PanelBody, PanelButton, PanelFooter, PanelHeader, PanelTabs, SidePanel, useConfirm } from '../components/panel'
import { CONSULTANTS_DRAWERS, useDrawerRoute } from '../lib/drawerRoutes'
import { useMobileKeyboardOpen } from '../hooks/useMobileKeyboardOpen'

function EmployeeModernIcon({ name }: { name: 'search' | 'plus' }) {
  if (name === 'search') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M10.75 18.5a7.75 7.75 0 1 1 0-15.5 7.75 7.75 0 0 1 0 15.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}

function EmployeePageTabIcon({ name }: { name: 'employees' | 'roles' }) {
  if (name === 'roles') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5 19 6v5.3c0 4.4-2.8 7.9-7 9.2-4.2-1.3-7-4.8-7-9.2V6l7-2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.25 12.2 11 13.95l3.9-4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.75 11.25a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3.75 20a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M16.9 11.8a2.8 2.8 0 1 0 0-5.6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M17.8 18.8a4.4 4.4 0 0 0-2.7-3.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}


function EmployeeFormIcon({ name }: { name: 'person' | 'clock' | 'calendar' | 'eye' | 'trash' | 'email' | 'phone' | 'vat' | 'role' | 'password' }) {
  if (name === 'person') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'clock') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'email') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4.5 6.5h15v11h-15v-11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m5.25 7.25 6.75 5.5 6.75-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'phone') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7.2 3.8 4.8 5.1c-.7.4-1 1.2-.8 2 1.7 6.3 6.6 11.2 12.9 12.9.8.2 1.6-.1 2-.8l1.3-2.4-4.6-2.1-1.3 1.8c-2.8-1.1-5.7-4-6.8-6.8l1.8-1.3-2.1-4.6Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'vat') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="4.5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 9h8M8 13h5M8 16.5h3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'role') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.75" />
        <path d="M3.75 19.5a5.75 5.75 0 0 1 11.5 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path d="m16 13.5 1.6 1.6 3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'password') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M12 14v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3v3M17 3v3M4.5 9h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'trash') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m2.5 0-.7 11A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-2L6.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.75 12s3.25-6 9.25-6 9.25 6 9.25 6-3.25 6-9.25 6-9.25-6-9.25-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function EmployeeAvatarActionIcon({ name }: { name: 'upload' | 'replace' }) {
  if (name === 'replace') {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 7v5h-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.4 15.6A7.5 7.5 0 1 1 19.7 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15V4m0 0-4 4m4-4 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function EmployeeMobileBackIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EmployeeMobileSaveIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type EmployeeFieldIconName = 'person' | 'email' | 'phone' | 'vat' | 'role' | 'password'

function EmployeeFormField({
  icon,
  label,
  required,
  hint,
  children,
  className = '',
}: {
  icon: EmployeeFieldIconName
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`field employee-standard-field${className ? ` ${className}` : ''}`}>
      <span className="field-label employee-standard-field-label">
        <EmployeeFormIcon name={icon} />
        <span>{label}{required ? ' *' : ''}</span>
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function contactMailtoHref(email: string) {
  const e = email.trim()
  return e ? `mailto:${encodeURIComponent(e)}` : ''
}

function employeeListCountLabel(count: number, locale: AppLocale): string {
  if (locale !== 'sl') return `${count} ${count === 1 ? 'employee' : 'employees'}`
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n >= 11 && n <= 14) return `${count} zaposlenih`
  if (last === 1) return `${count} zaposlen`
  if (last === 2) return `${count} zaposlena`
  if (last === 3 || last === 4) return `${count} zaposleni`
  return `${count} zaposlenih`
}

function readErrorText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(readErrorText).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(readErrorText).filter(Boolean).join(' ')
  }
  return ''
}

function userQuotaFromError(error: any): Partial<UserQuota> | null {
  const text = readErrorText(error?.response?.data || error?.message)
  const quotaMatch = text.match(/allows\s+(\d+)\s+active\s+users?/i)
    || text.match(/(\d+)\s*\/?\s*\d*\s+active\s+users?/i)
    || text.match(/najve[cč]\s+(?:je\s+)?(?:število\s+)?(?:aktivnih\s+)?uporabnikov\s*(?:je|:)\s*(\d+)/i)
  if (!quotaMatch) return null
  const maxUsers = Number(quotaMatch[1])
  return Number.isFinite(maxUsers) && maxUsers > 0 ? { maxUsers, reached: true } : null
}

function isUserQuotaError(error: any): boolean {
  const status = Number(error?.response?.status)
  if (status === 402) return true
  const message = readErrorText(error?.response?.data || error?.message).toLowerCase()
  return (
    message.includes('active user') ||
    message.includes('user count') ||
    message.includes('package allows') ||
    message.includes('upgrade or increase your user count') ||
    message.includes('user limit') ||
    message.includes('max users') ||
    message.includes('maximum users') ||
    message.includes('uporabnik') ||
    message.includes('uporabnikov')
  )
}

function hasReachedUserQuota(quota: UserQuota | null | undefined): quota is UserQuota {
  return !!quota && quota.maxUsers != null && quota.activeUsers >= quota.maxUsers
}

function fallbackUserQuota(consultants: Consultant[], error?: any): UserQuota {
  const activeUsers = consultants.filter((consultant) => consultant.active !== false).length
  const parsed = userQuotaFromError(error)
  const maxUsers = (parsed?.maxUsers ?? activeUsers) || 1
  return { activeUsers: Math.max(activeUsers, maxUsers), maxUsers, reached: true }
}

type UserRole = 'ADMIN' | 'CONSULTANT'
type EmployeeSortKey = 'name' | 'email' | 'role' | 'status' | 'createdAt'
function formatRoleLabel(role: UserRole, t: (key: string) => string) {
  return role === 'ADMIN' ? t('employeesFormRoleOptionAdmin') : t('employeesFormRoleOptionConsultant')
}

function employeeRoleFilterValue(consultant: Consultant): string {
  return consultant.accessRoleName?.trim()
    ? `custom:${consultant.accessRoleName.trim()}`
    : `system:${consultant.role}`
}

type Consultant = {
  id: number
  firstName: string
  lastName: string
  email: string
  role: UserRole
  consultant?: boolean
  active?: boolean
  avatarPath?: string | null
  createdAt?: string
  vatId?: string | null
  phone?: string | null
  whatsappSenderNumber?: string | null
  whatsappPhoneNumberId?: string | null
  workingHours?: WorkingHoursConfig | null
  availableAllLocations?: boolean
  locationIds?: number[]
  workingHoursByLocation?: Record<string, WorkingHoursConfig>
  permissions?: string[]
  accessRoleId?: number | null
  accessRoleName?: string | null
  tenantOwner?: boolean
}

type AccessRoleOption = {
  id: string
  customRoleId?: number | null
  system?: boolean
  name: string
  description?: string | null
  permissions: string[]
}

const DEFAULT_EMPLOYEE_ACCESS_ROLE_NAME = 'Calendar access'

type UserQuota = {
  activeUsers: number
  maxUsers: number | null
  reached: boolean
}

type LocationOption = {
  id: number
  name: string
  city?: string | null
  active?: boolean
}

type ConsultantForm = {
  firstName: string
  lastName: string
  email: string
  password: string
  role: UserRole
  consultant: boolean
  vatId: string
  phone: string
  workingHours: WorkingHoursConfig
  availableAllLocations: boolean
  locationIds: number[]
  workingHoursByLocation: Record<string, WorkingHoursConfig>
  permissions: EmployeePermission[]
  accessRoleId: string
}

type ConsultantFormSectionTab = 'basic' | 'workingHours'

function defaultByDayWorkingHours(): WorkingHoursConfig {
  const byDay: WorkingHoursConfig['byDay'] = {}
  for (const day of dayOptions) {
    byDay[day] = { start: '09:00', end: '17:00' }
  }
  return { sameForAllDays: false, allDays: null, byDay }
}


const emptyForm: ConsultantForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'CONSULTANT',
  consultant: true,
  vatId: '',
  phone: '',
  workingHours: defaultByDayWorkingHours(),
  availableAllLocations: true,
  locationIds: [],
  workingHoursByLocation: {},
  permissions: [...DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS],
  accessRoleId: '',
}

function normalizeWorkingHoursForApi(cfg: WorkingHoursConfig): WorkingHoursConfig {
  if (cfg.sameForAllDays) {
    return {
      sameForAllDays: true,
      allDays: cfg.allDays ? { start: cfg.allDays.start, end: cfg.allDays.end } : null,
      byDay: {},
    }
  }
  const byDay: WorkingHoursConfig['byDay'] = {}
  for (const day of dayOptions) {
    const v = cfg.byDay?.[day]
    byDay[day] = v && v.start && v.end ? { start: v.start, end: v.end } : null
  }
  return { sameForAllDays: false, allDays: null, byDay }
}

function cloneConsultantForm(f: ConsultantForm): ConsultantForm {
  return JSON.parse(JSON.stringify(f)) as ConsultantForm
}

function permissionsEqual(a: EmployeePermission[], b: EmployeePermission[]): boolean {
  if (a.length !== b.length) return false
  return a.every((permission) => b.includes(permission))
}

function workingHoursEqual(a: WorkingHoursConfig, b: WorkingHoursConfig): boolean {
  if (a.sameForAllDays !== b.sameForAllDays) return false
  if (a.sameForAllDays) {
    const x = a.allDays
    const y = b.allDays
    return (x?.start ?? '') === (y?.start ?? '') && (x?.end ?? '') === (y?.end ?? '')
  }
  for (const d of dayOptions) {
    const x = a.byDay?.[d]
    const y = b.byDay?.[d]
    if (!!x !== !!y) return false
    if (x && y && (x.start !== y.start || x.end !== y.end)) return false
  }
  return true
}

function consultantFormsEqual(a: ConsultantForm, b: ConsultantForm): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.email === b.email &&
    a.password === b.password &&
    a.role === b.role &&
    a.consultant === b.consultant &&
    a.accessRoleId === b.accessRoleId &&
    a.vatId === b.vatId &&
    a.phone === b.phone &&
    a.availableAllLocations === b.availableAllLocations &&
    JSON.stringify([...a.locationIds].sort((x, y) => x - y)) === JSON.stringify([...b.locationIds].sort((x, y) => x - y)) &&
    JSON.stringify(a.workingHoursByLocation) === JSON.stringify(b.workingHoursByLocation) &&
    workingHoursEqual(a.workingHours, b.workingHours) &&
    permissionsEqual(a.permissions, b.permissions)
  )
}

type EmployeesPageTab = 'employees' | 'roles'

function parseEmployeesTab(
  search: string,
  canViewEmployees: boolean,
  canViewRoles: boolean,
): EmployeesPageTab {
  const tab = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab')
  if (tab === 'roles' && canViewRoles) return 'roles'
  if (canViewEmployees) return 'employees'
  return canViewRoles ? 'roles' : 'employees'
}

function employeesTabSearch(tab: EmployeesPageTab): string {
  return tab === 'roles' ? 'tab=roles' : ''
}

export type ConsultantsPageProps = {
  /** Consultant: edit own profile (same form as admin employee editor, limited fields). */
  selfService?: boolean
}

export function ConsultantsPage({ selfService = false }: ConsultantsPageProps) {
  const { t, locale } = useLocale()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const location = useLocation()
  const { match: drawerMatch, isOpen: isDrawerOpen, open: openDrawer, close: closeDrawerRoute } = useDrawerRoute()
  const user = getStoredUser()
  const activeUnitId = user?.activeUnitId ?? user?.companyId
  const queryClient = useQueryClient()
  const canViewEmployeesTab = hasEmployeePermission(user, 'EMPLOYEES_VIEW')
  const canViewRolesTab = hasEmployeePermission(user, 'ROLES_PERMISSIONS_VIEW')
  const canCreateEmployees = hasEmployeePermission(user, 'EMPLOYEES_CREATE')
  const canEditEmployees = hasEmployeePermission(user, 'EMPLOYEES_EDIT')
  const canDeleteEmployees = hasEmployeePermission(user, 'EMPLOYEES_DELETE')
  const consultantsPageDrawers = !selfService && (drawerMatch == null || drawerMatch.descriptor.page === '/consultants')
  const newEmployeeOpen = consultantsPageDrawers && isDrawerOpen(CONSULTANTS_DRAWERS.newEmployee)
  const employeeDrawerOpen = consultantsPageDrawers && isDrawerOpen(CONSULTANTS_DRAWERS.employee)
  const roleMembersOpen = consultantsPageDrawers && isDrawerOpen(CONSULTANTS_DRAWERS.roleMembers)
  const employeeDrawerId = employeeDrawerOpen ? Number(drawerMatch?.params.id) : NaN
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [accessRoleOptions, setAccessRoleOptions] = useState<AccessRoleOption[]>([])
  const [userQuota, setUserQuota] = useState<UserQuota | null>(null)
  const [employeeLimitDialog, setEmployeeLimitDialog] = useState<UserQuota | null>(null)
  const [editing, setEditing] = useState<Consultant | null>(null)
  const [showFormPanel, setShowFormPanel] = useState(false)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive'>('active')
  const [roleFilter, setRoleFilter] = useState('all')
  const [roleFilterOpen, setRoleFilterOpen] = useState(false)
  const roleFilterRef = useRef<HTMLDivElement | null>(null)
  const [employeeSort, setEmployeeSort] = useState<ServiceConfigSortState<EmployeeSortKey>>({
    key: null,
    direction: 'asc',
  })
  const [form, setForm] = useState<ConsultantForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isConsultantsMobile, setIsConsultantsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false,
  )
  const [isEmployeeFormMobileTablet, setIsEmployeeFormMobileTablet] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1024px)').matches : false,
  )
  const mobileKeyboardOpen = useMobileKeyboardOpen(1024)
  const [formSectionTab, setFormSectionTab] = useState<ConsultantFormSectionTab>('basic')
  const [passwordResetSending, setPasswordResetSending] = useState(false)
  const [employeeAvatarBusy, setEmployeeAvatarBusy] = useState(false)
  const employeeAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const formBaselineRef = useRef<ConsultantForm | null>(null)
  const [loadingSelfProfile, setLoadingSelfProfile] = useState(false)
  const [activatingEmployeeId, setActivatingEmployeeId] = useState<number | null>(null)
  const [employeesReady, setEmployeesReady] = useState(false)
  const [employeesTab, setEmployeesTab] = useState<EmployeesPageTab>(() =>
    parseEmployeesTab(
      typeof window !== 'undefined' ? window.location.search : '',
      canViewEmployeesTab,
      canViewRolesTab,
    ),
  )
  const formSeedKeyRef = useRef<string | null>(null)
  const formPanelOpen = selfService ? showFormPanel : newEmployeeOpen || employeeDrawerOpen
  const pageSearch = employeesTabSearch(roleMembersOpen ? 'roles' : 'employees')
  const closeConsultantsDrawer = () => closeDrawerRoute({ search: pageSearch })

  useEffect(() => {
    if (selfService) return
    if (employeesTab === 'employees' && !canViewEmployeesTab && canViewRolesTab) setEmployeesTab('roles')
    if (employeesTab === 'roles' && !canViewRolesTab && canViewEmployeesTab) setEmployeesTab('employees')
  }, [canViewEmployeesTab, canViewRolesTab, employeesTab, selfService])

  useEffect(() => {
    if (selfService) return
    setEmployeesTab(parseEmployeesTab(location.search, canViewEmployeesTab, canViewRolesTab))
  }, [canViewEmployeesTab, canViewRolesTab, location.search, selfService])

  useEffect(() => {
    if (selfService) return
    if (newEmployeeOpen || employeeDrawerOpen) setEmployeesTab('employees')
    if (roleMembersOpen) setEmployeesTab('roles')
  }, [employeeDrawerOpen, newEmployeeOpen, roleMembersOpen, selfService])

  useEffect(() => {
    if (!selfService && !form.consultant && formSectionTab === 'workingHours') {
      setFormSectionTab('basic')
    }
  }, [form.consultant, formSectionTab, selfService])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 450px)')
    const apply = () => setIsConsultantsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const apply = () => setIsEmployeeFormMobileTablet(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!roleFilterOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!roleFilterRef.current?.contains(event.target as Node)) setRoleFilterOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRoleFilterOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [roleFilterOpen])

  async function loadConsultants(force = true) {
    if (!canViewEmployeesTab) {
      setConsultants([])
      setEmployeesReady(true)
      if (!canViewRolesTab) setErrorMessage(locale === 'sl' ? 'Nimate dovoljenja za ogled zaposlenih.' : 'You do not have permission to view employees.')
      return
    }

    setErrorMessage('')

    try {
      if (force) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all, refetchType: 'none' }),
          queryClient.invalidateQueries({ queryKey: queryKeys.locations.all, refetchType: 'none' }),
          queryClient.invalidateQueries({ queryKey: queryKeys.staff.all, refetchType: 'none' }),
        ])
      }
      const [nextConsultants, quota, rolesResponse, nextLocations] = await Promise.all([
        queryClient.fetchQuery(usersQueryOptions<Consultant>(activeUnitId)),
        queryClient.fetchQuery(staffQuotaQueryOptions<UserQuota>(activeUnitId)).catch(() => null),
        queryClient.fetchQuery(employeeRolesQueryOptions<{ roles: AccessRoleOption[] }>(activeUnitId)).catch(() => ({ roles: [] as AccessRoleOption[] })),
        queryClient.fetchQuery(locationsQueryOptions(activeUnitId)).catch(() => [] as LocationOption[]),
      ])
      setConsultants(nextConsultants ?? [])
      setUserQuota(quota ?? null)
      setAccessRoleOptions((rolesResponse?.roles ?? []).filter((role) => !role.system))
      setLocations((nextLocations ?? []).filter((location) => location.active !== false))
    } catch (error: any) {
      console.error('Failed to load consultants', error)

      if (error?.response?.status === 403) {
        setErrorMessage(locale === 'sl' ? 'Nimate dovoljenja za ogled zaposlenih.' : 'You do not have permission to view employees.')
      } else {
        setErrorMessage(locale === 'sl' ? 'Zaposlenih ni bilo mogoče naložiti.' : 'Failed to load employees.')
      }
    } finally {
      setEmployeesReady(true)
    }
  }

  const refreshUserQuota = async (): Promise<UserQuota | null> => {
    if (!canCreateEmployees) return null
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.staff.quota(activeUnitId), refetchType: 'none' })
      const data = await queryClient.fetchQuery(staffQuotaQueryOptions<UserQuota>(activeUnitId))
      setUserQuota(data ?? null)
      return data ?? null
    } catch {
      return null
    }
  }

  const showEmployeeLimitPopup = async (preferredQuota?: UserQuota | null, error?: any) => {
    const freshQuota = await refreshUserQuota()
    const parsedQuota = userQuotaFromError(error)
    const activeUsers = freshQuota?.activeUsers
      ?? preferredQuota?.activeUsers
      ?? consultants.filter((consultant) => consultant.active !== false).length
    const maxUsers = freshQuota?.maxUsers
      ?? preferredQuota?.maxUsers
      ?? parsedQuota?.maxUsers
      ?? (activeUsers || 1)
    setErrorMessage('')
    setEmployeeLimitDialog({
      activeUsers: Math.max(activeUsers, maxUsers),
      maxUsers,
      reached: true,
    })
  }

  const toggleConsultantActiveById = async (consultantId: number, currentlyActive: boolean) => {
    if (!canEditEmployees) return
    if (!currentlyActive && hasReachedUserQuota(userQuota)) {
      void showEmployeeLimitPopup(userQuota)
      return
    }
    setActivatingEmployeeId(consultantId)
    setErrorMessage('')
    try {
      const action = currentlyActive ? 'deactivate' : 'activate'
      await api.patch(`/users/${consultantId}/${action}`)
      await loadConsultants()
      window.dispatchEvent(new Event('users-updated'))
    } catch (error: any) {
      if (isUserQuotaError(error)) {
        await showEmployeeLimitPopup(userQuota ?? fallbackUserQuota(consultants, error), error)
        return
      }
      const backendMessage = error?.response?.data?.message || error?.response?.data?.detail
      setErrorMessage(backendMessage || (locale === 'sl' ? 'Stanja zaposlenega ni bilo mogoče posodobiti.' : 'Failed to update employee status.'))
    } finally {
      setActivatingEmployeeId(null)
    }
  }

  useEffect(() => {
    if (selfService || !canViewEmployeesTab) return
    setConsultants([])
    setLocations([])
    setAccessRoleOptions([])
    setUserQuota(null)
    void loadConsultants(false)
  }, [activeUnitId, canViewEmployeesTab, selfService])

  useEffect(() => {
    if (!selfService) return
    let cancelled = false
    const run = async () => {
      setLoadingSelfProfile(true)
      setErrorMessage('')
      try {
        const { data } = await api.get<Consultant>('/users/profile')
        if (cancelled || !data) return
        populateFormFromConsultant(data)
        setShowFormPanel(true)
      } catch (error: any) {
        if (!cancelled) {
          const backendMessage = error?.response?.data?.message
          setErrorMessage(backendMessage || 'Failed to load your profile.')
        }
      } finally {
        if (!cancelled) setLoadingSelfProfile(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial self profile load only
  }, [selfService])

  const employeeRoleOptions = useMemo(() => {
    const roles = new Map<string, string>()
    consultants.forEach((consultant) => {
      roles.set(
        employeeRoleFilterValue(consultant),
        consultant.accessRoleName || formatRoleLabel(consultant.role, t),
      )
    })
    return Array.from(roles, ([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, locale, { sensitivity: 'base' }))
  }, [consultants, locale, t])

  const filteredConsultants = useMemo(() => {
    const byStatus = consultants.filter((consultant) =>
      activeFilter === 'inactive' ? consultant.active === false : consultant.active !== false,
    )
    const byRole = roleFilter === 'all'
      ? byStatus
      : byStatus.filter((consultant) => employeeRoleFilterValue(consultant) === roleFilter)
    const q = search.trim().toLowerCase()
    const matched = !q ? byRole : byRole.filter((consultant) => {
      const nm = `${consultant.firstName} ${consultant.lastName}`.toLowerCase()
      const roleLabel = (consultant.accessRoleName || formatRoleLabel(consultant.role, t)).toLowerCase()
      return (
        nm.includes(q) ||
        consultant.email.toLowerCase().includes(q) ||
        consultant.role.toLowerCase().includes(q) ||
        roleLabel.includes(q)
      )
    })
    return sortServiceConfigRows(
      matched,
      employeeSort,
      (consultant, key) => {
        if (key === 'name') return fullName(consultant)
        if (key === 'email') return consultant.email
        if (key === 'role') return consultant.accessRoleName || formatRoleLabel(consultant.role, t)
        if (key === 'status') return consultant.active === false ? 0 : 1
        return consultant.createdAt
      },
      locale,
    )
  }, [consultants, search, activeFilter, roleFilter, employeeSort, locale, t])

  const seedNewEmployeeForm = () => {
    setEditing(null)
    const defaultAccessRole = accessRoleOptions.find(
      (role) => role.name.trim().toLowerCase() === DEFAULT_EMPLOYEE_ACCESS_ROLE_NAME.toLowerCase() && role.customRoleId != null,
    )
    const next: ConsultantForm = {
      ...emptyForm,
      permissions: defaultAccessRole ? normalizeEmployeePermissions(defaultAccessRole.permissions) : [...DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS],
      accessRoleId: defaultAccessRole?.customRoleId == null ? '' : String(defaultAccessRole.customRoleId),
      workingHours: defaultByDayWorkingHours(),
    }
    setForm(next)
    formBaselineRef.current = cloneConsultantForm(next)
    setErrorMessage('')
    setSuccessMessage('')
    setFormSectionTab('basic')
    setPasswordResetSending(false)
    setEmployeeAvatarBusy(false)
  }

  const startCreate = () => {
    if (hasReachedUserQuota(userQuota)) {
      void showEmployeeLimitPopup(userQuota)
      return
    }
    if (selfService) {
      seedNewEmployeeForm()
      setShowFormPanel(true)
      return
    }
    openDrawer(CONSULTANTS_DRAWERS.newEmployee, { search: employeesTabSearch('employees') })
  }

  const populateFormFromConsultant = (c: Consultant) => {
    setEditing(c)
    const wh = c.workingHours
    const next: ConsultantForm = {
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      password: '',
      role: c.tenantOwner ? 'ADMIN' : c.role,
      consultant: c.consultant ?? c.role === 'CONSULTANT',
      vatId: c.vatId ?? '',
      phone: c.phone ?? c.whatsappSenderNumber ?? '',
      workingHours: wh
        ? {
            sameForAllDays: wh.sameForAllDays,
            allDays: wh.allDays ? { ...wh.allDays } : { start: '09:00', end: '17:00' },
            byDay: { ...(wh.byDay || {}) },
          }
        : {
            sameForAllDays: true,
            allDays: { start: '09:00', end: '17:00' },
            byDay: {},
          },
      availableAllLocations: c.availableAllLocations !== false,
      locationIds: Array.isArray(c.locationIds) ? c.locationIds.map(Number).filter(Number.isFinite) : [],
      workingHoursByLocation: c.workingHoursByLocation && typeof c.workingHoursByLocation === 'object'
        ? JSON.parse(JSON.stringify(c.workingHoursByLocation))
        : {},
      permissions: normalizeEmployeePermissions(c.permissions),
      accessRoleId: c.tenantOwner || c.accessRoleId == null ? '' : String(c.accessRoleId),
    }
    setForm(next)
    formBaselineRef.current = cloneConsultantForm(next)
    setErrorMessage('')
    setSuccessMessage('')
    setFormSectionTab('basic')
    setPasswordResetSending(false)
    setEmployeeAvatarBusy(false)
  }

  const startEdit = (c: Consultant) => {
    if (selfService) {
      populateFormFromConsultant(c)
      setShowFormPanel(true)
      return
    }
    openDrawer(CONSULTANTS_DRAWERS.employee, {
      params: { id: c.id },
      search: employeesTabSearch('employees'),
    })
  }

  const isFormDirty = useMemo(() => {
    if (!formPanelOpen || !formBaselineRef.current) return false
    return !consultantFormsEqual(form, formBaselineRef.current)
  }, [form, formPanelOpen])

  useEffect(() => {
    if (selfService) return
    if (newEmployeeOpen) {
      const key = 'new'
      if (formSeedKeyRef.current === key) return
      formSeedKeyRef.current = key
      seedNewEmployeeForm()
      return
    }
    if (employeeDrawerOpen && Number.isFinite(employeeDrawerId)) {
      const key = `employee:${employeeDrawerId}`
      if (formSeedKeyRef.current === key) return
      const consultant = consultants.find((item) => item.id === employeeDrawerId)
      if (!consultant) return
      formSeedKeyRef.current = key
      populateFormFromConsultant(consultant)
      return
    }
    formSeedKeyRef.current = null
  }, [consultants, employeeDrawerId, employeeDrawerOpen, newEmployeeOpen, selfService])

  useEffect(() => {
    if (selfService || !employeeDrawerOpen || !employeesReady) return
    if (!Number.isFinite(employeeDrawerId) || !consultants.some((item) => item.id === employeeDrawerId)) {
      closeDrawerRoute({ search: pageSearch })
    }
  }, [closeDrawerRoute, consultants, employeeDrawerId, employeeDrawerOpen, employeesReady, pageSearch, selfService])

  const removeConsultant = async (consultant: Consultant) => {
    if (!canDeleteEmployees || consultant.tenantOwner) return
    const confirmed = await confirm({
      title: locale === 'sl' ? `Izbrišem zaposlenega ${fullName(consultant)}?` : `Delete employee ${fullName(consultant)}?`,
      text: t('confirmCannotBeUndone'),
      tone: 'danger',
    })
    if (!confirmed) return
    setDeleting(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await api.delete(`/users/${consultant.id}`)
      if (editing?.id === consultant.id) {
        if (selfService) {
          setShowFormPanel(false)
          setEditing(null)
          setForm(emptyForm)
        } else {
          closeConsultantsDrawer()
        }
      }
      await loadConsultants()
      window.dispatchEvent(new Event('users-updated'))
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || (locale === 'sl' ? 'Zaposlenega ni bilo mogoče izbrisati.' : 'Failed to delete employee.'))
    } finally {
      setDeleting(false)
    }
  }

  const removeEditing = async () => {
    if (!editing) return
    await removeConsultant(editing)
  }

  const sendPasswordResetEmail = async () => {
    if (!editing || passwordResetSending) return
    setErrorMessage('')
    setSuccessMessage('')
    setPasswordResetSending(true)
    try {
      await api.post(`/users/${editing.id}/password-reset`, { locale })
      setSuccessMessage(
        locale === 'sl'
          ? 'E-pošta za nastavitev novega gesla je bila poslana.'
          : locale === 'sr'
            ? 'E-pošta za podešavanje nove lozinke je poslata.'
            : 'Password setup email was sent.',
      )
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message || error?.response?.data?.detail
      setErrorMessage(
        backendMessage || (
          locale === 'sl'
            ? 'E-pošte za nastavitev gesla ni bilo mogoče poslati.'
            : locale === 'sr'
              ? 'E-poštu za podešavanje lozinke nije bilo moguće poslati.'
              : 'Failed to send the password setup email.'
        ),
      )
    } finally {
      setPasswordResetSending(false)
    }
  }

  const editingAvatarSrc = String(editing?.avatarPath || '').trim()
  const employeeAvatarInitials = `${(form.firstName?.[0] || '').toUpperCase()}${(form.lastName?.[0] || '').toUpperCase()}` || '?'

  const openEmployeeAvatarPicker = () => {
    if (!editing || employeeAvatarBusy) return
    employeeAvatarInputRef.current?.click()
  }

  const syncOwnSessionUser = async (updatedEmployeeId: number) => {
    if (myUserId == null || updatedEmployeeId !== myUserId) return
    try {
      const authRes = await api.get<{ user: unknown }>('/auth/me')
      if (authRes.data?.user) sessionStorage.setItem('user', JSON.stringify(authRes.data.user))
    } catch {
      // The employee/calendar avatar is already updated; the account avatar will refresh on the next auth refresh.
    }
  }

  const applyEmployeeAvatarResponse = async (updated: Consultant, successText: string) => {
    setEditing(updated)
    setConsultants((rows) => rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row))
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all, refetchType: 'none' })
    await syncOwnSessionUser(updated.id)
    setSuccessMessage(successText)
    window.dispatchEvent(new Event('users-updated'))
  }

  const onEmployeeAvatarPicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !editing || employeeAvatarBusy) return

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage(locale === 'sl' ? 'Slika je lahko velika največ 5 MB.' : 'Avatar image must be 5 MB or smaller.')
      return
    }
    if (!(file.type || '').toLowerCase().startsWith('image/')) {
      setErrorMessage(locale === 'sl' ? 'Dovoljene so samo slikovne datoteke.' : 'Only image files are allowed.')
      return
    }

    setEmployeeAvatarBusy(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const payload = new FormData()
      payload.append('file', file)
      const { data } = await api.post<Consultant>(`/users/${editing.id}/avatar`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await applyEmployeeAvatarResponse(
        data,
        locale === 'sl' ? 'Slika zaposlenega je posodobljena.' : 'Employee image updated.',
      )
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message || error?.response?.data?.detail
      setErrorMessage(backendMessage || (locale === 'sl' ? 'Nalaganje slike ni uspelo.' : 'Failed to upload employee image.'))
    } finally {
      setEmployeeAvatarBusy(false)
    }
  }

  const removeEmployeeAvatar = async () => {
    if (!editing || !editingAvatarSrc || employeeAvatarBusy) return
    setEmployeeAvatarBusy(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { data } = await api.delete<Consultant>(`/users/${editing.id}/avatar`)
      await applyEmployeeAvatarResponse(
        data,
        locale === 'sl' ? 'Slika zaposlenega je odstranjena.' : 'Employee image removed.',
      )
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message || error?.response?.data?.detail
      setErrorMessage(backendMessage || (locale === 'sl' ? 'Slike ni bilo mogoče odstraniti.' : 'Failed to remove employee image.'))
    } finally {
      setEmployeeAvatarBusy(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isFormDirty) return
    if (!selfService) {
      const canSubmitEmployee = editing ? canEditEmployees : canCreateEmployees
      if (!canSubmitEmployee) {
        setErrorMessage(locale === 'sl' ? 'Nimate dovoljenja za shranjevanje zaposlenih.' : 'You do not have permission to save employees.')
        return
      }
    }

    setErrorMessage('')
    setSuccessMessage('')
    setSaving(true)

    try {
      if (selfService && editing) {
        const payload = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password || null,
          vatId: form.vatId.trim() || null,
          phone: form.phone.trim() || null,
          workingHours: normalizeWorkingHoursForApi(form.workingHours),
        }
        const { data: updated } = await api.put<Consultant>('/users/profile', payload)
        populateFormFromConsultant(updated)
        try {
          const authRes = await api.get<{ user: unknown }>('/auth/me')
          if (authRes.data?.user) {
            sessionStorage.setItem('user', JSON.stringify(authRes.data.user))
          }
        } catch {
          // Header may show stale name until next full reload; profile form is already saved.
        }
        setSuccessMessage(t('employeesSelfProfileSaved'))
        window.dispatchEvent(new Event('users-updated'))
        return
      }

      const effectiveRole = editing?.tenantOwner ? 'ADMIN' : form.role
      const payload: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password || null,
        role: effectiveRole,
        consultant: form.consultant,
        vatId: form.vatId.trim() || null,
        phone: form.phone.trim() || null,
        workingHours: normalizeWorkingHoursForApi(form.workingHours),
        availableAllLocations: form.availableAllLocations,
        locationIds: form.availableAllLocations ? [] : form.locationIds,
        workingHoursByLocation: Object.fromEntries(
          Object.entries(form.workingHoursByLocation)
            .filter(([locationId]) => {
              const id = Number(locationId)
              return Number.isFinite(id)
                && locations.some((location) => location.id === id)
                && (form.availableAllLocations || form.locationIds.includes(id))
            })
            .map(([locationId, hours]) => [locationId, normalizeWorkingHoursForApi(hours)]),
        ),
        permissions: form.permissions,
        accessRoleId: editing?.tenantOwner ? null : form.accessRoleId ? Number(form.accessRoleId) : null,
      }
      if (!editing) {
        payload.locale = locale
      }

      if (editing) {
        await api.put(`/users/${editing.id}`, payload)
        setSuccessMessage('Consultant updated successfully.')
      } else {
        await api.post(`/users`, payload)
        setSuccessMessage(locale === 'sl' ? 'Zaposleni je ustvarjen. E-pošta za nastavitev gesla je bila poslana.' : locale === 'sr' ? 'Zaposleni je kreiran. E-pošta za podešavanje lozinke je poslata.' : 'Employee created successfully. Password setup email was sent.')
      }

      setEditing(null)
      setForm(emptyForm)
      if (selfService) setShowFormPanel(false)
      else closeConsultantsDrawer()
      await loadConsultants()
      window.dispatchEvent(new Event('users-updated'))
    } catch (error: any) {
      const status = error?.response?.status
      const backendMessage = error?.response?.data?.message || error?.response?.data?.detail

      const freshQuota = !editing ? await refreshUserQuota() : null
      const activeBookingCount = Number(error?.response?.data?.activeBookingCount ?? 0)
      if (isUserQuotaError(error) || (!editing && hasReachedUserQuota(freshQuota))) {
        await showEmployeeLimitPopup(freshQuota ?? userQuota ?? fallbackUserQuota(consultants, error), error)
      } else if (status === 409 && activeBookingCount > 0) {
        setErrorMessage(
          locale === 'sl'
            ? `Zaposlenega ni mogoče izklopiti, ker ima ${activeBookingCount} aktivnih ali prihodnjih terminov. Najprej odstranite ali prerazporedite njegove termine.`
            : locale === 'sr'
              ? `Zaposlenog nije moguće isključiti jer ima ${activeBookingCount} aktivnih ili budućih termina. Najpre uklonite ili preraspodelite njegove termine.`
              : `This employee cannot be switched off because they have ${activeBookingCount} active or upcoming bookings. Remove or reassign those bookings first.`,
        )
      } else if (status === 403) {
        setErrorMessage(
          selfService
            ? backendMessage || 'You are not allowed to update this profile.'
            : 'You are not allowed to create consultants. Please log in again as admin.',
        )
      } else if (status === 400) {
        setErrorMessage(backendMessage || 'Please check the entered fields.')
      } else {
        setErrorMessage(
          selfService
            ? backendMessage || 'Failed to update profile.'
            : editing
              ? 'Failed to update consultant.'
              : 'Failed to create consultant.',
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const dismissFormPanel = () => {
    if (selfService) {
      setShowFormPanel(false)
      navigate('/calendar')
      return
    }
    closeConsultantsDrawer()
  }

  const setDayHours = (day: DayOfWeek, patch: { start?: string; end?: string } | null) => {
    setForm((f) => {
      const next: WorkingHoursConfig = {
        sameForAllDays: false,
        allDays: null,
        byDay: { ...(f.workingHours.byDay || {}) },
      }
      if (patch == null) {
        next.byDay![day] = null
      } else {
        const prev = f.workingHours.byDay?.[day] || { start: '09:00', end: '17:00' }
        next.byDay![day] = { start: patch.start ?? prev.start, end: patch.end ?? prev.end }
      }
      return { ...f, workingHours: next }
    })
  }

  const setWorkingHoursSameForAllDays = (same: boolean) => {
    setForm((f) => {
      const currentByDay = f.workingHours.byDay || {}
      const firstConfiguredDay = dayOptions
        .map((day) => currentByDay[day])
        .find((row) => row?.start && row?.end)
      const base = f.workingHours.allDays || firstConfiguredDay || { start: '09:00', end: '17:00' }
      if (same) {
        return {
          ...f,
          workingHours: {
            sameForAllDays: true,
            allDays: { start: base.start, end: base.end },
            byDay: {},
          },
        }
      }
      const byDay: WorkingHoursConfig['byDay'] = {}
      for (const day of dayOptions) {
        const existing = currentByDay[day]
        byDay[day] = existing?.start && existing?.end
          ? { start: existing.start, end: existing.end }
          : { start: base.start, end: base.end }
      }
      return {
        ...f,
        workingHours: {
          sameForAllDays: false,
          allDays: null,
          byDay,
        },
      }
    })
  }

  const setMobileWorkingDayActive = (day: DayOfWeek, active: boolean) => {
    setForm((f) => {
      if (f.workingHours.sameForAllDays) {
        const base = f.workingHours.allDays || { start: '09:00', end: '17:00' }
        const byDay: WorkingHoursConfig['byDay'] = {}
        for (const optionDay of dayOptions) {
          byDay[optionDay] = optionDay === day && !active ? null : { ...base }
        }
        return {
          ...f,
          workingHours: { sameForAllDays: false, allDays: null, byDay },
        }
      }
      const nextByDay = { ...(f.workingHours.byDay || {}) }
      if (!active) nextByDay[day] = null
      else {
        const previous = nextByDay[day]
        nextByDay[day] = previous?.start && previous?.end ? previous : { start: '09:00', end: '17:00' }
      }
      return { ...f, workingHours: { sameForAllDays: false, allDays: null, byDay: nextByDay } }
    })
  }

  const setMobileWorkingDayTime = (day: DayOfWeek, patch: { start?: string; end?: string }) => {
    setForm((f) => {
      if (f.workingHours.sameForAllDays) {
        const previous = f.workingHours.allDays || { start: '09:00', end: '17:00' }
        return {
          ...f,
          workingHours: {
            ...f.workingHours,
            allDays: { start: patch.start ?? previous.start, end: patch.end ?? previous.end },
          },
        }
      }
      const nextByDay = { ...(f.workingHours.byDay || {}) }
      const previous = nextByDay[day] || { start: '09:00', end: '17:00' }
      nextByDay[day] = { start: patch.start ?? previous.start, end: patch.end ?? previous.end }
      return { ...f, workingHours: { sameForAllDays: false, allDays: null, byDay: nextByDay } }
    })
  }

  const setConsultantAllLocations = (allLocations: boolean) => {
    setForm((f) => ({
      ...f,
      availableAllLocations: allLocations,
      locationIds: allLocations
        ? f.locationIds
        : (f.locationIds.length > 0 ? f.locationIds : locations.map((location) => location.id)),
    }))
  }

  const toggleConsultantLocation = (locationId: number, checked: boolean) => {
    setForm((f) => {
      const nextIds = checked
        ? Array.from(new Set([...f.locationIds, locationId])).sort((a, b) => a - b)
        : f.locationIds.filter((id) => id !== locationId)
      const nextOverrides = { ...f.workingHoursByLocation }
      if (!checked) delete nextOverrides[String(locationId)]
      return { ...f, locationIds: nextIds, workingHoursByLocation: nextOverrides }
    })
  }

  const setLocationWorkingHoursOverride = (locationId: number, enabled: boolean) => {
    setForm((f) => {
      const next = { ...f.workingHoursByLocation }
      if (enabled) {
        next[String(locationId)] = JSON.parse(JSON.stringify(f.workingHours)) as WorkingHoursConfig
      } else {
        delete next[String(locationId)]
      }
      return { ...f, workingHoursByLocation: next }
    })
  }

  const setLocationWorkingHoursSame = (locationId: number, same: boolean) => {
    setForm((f) => {
      const key = String(locationId)
      const current = f.workingHoursByLocation[key] || JSON.parse(JSON.stringify(f.workingHours)) as WorkingHoursConfig
      const currentByDay = current.byDay || {}
      const firstConfiguredDay = dayOptions.map((day) => currentByDay[day]).find((row) => row?.start && row?.end)
      const base = current.allDays || firstConfiguredDay || { start: '09:00', end: '17:00' }
      let nextHours: WorkingHoursConfig
      if (same) {
        nextHours = { sameForAllDays: true, allDays: { start: base.start, end: base.end }, byDay: {} }
      } else {
        const byDay: WorkingHoursConfig['byDay'] = {}
        for (const day of dayOptions) {
          const existing = currentByDay[day]
          byDay[day] = existing?.start && existing?.end
            ? { start: existing.start, end: existing.end }
            : { start: base.start, end: base.end }
        }
        nextHours = { sameForAllDays: false, allDays: null, byDay }
      }
      return { ...f, workingHoursByLocation: { ...f.workingHoursByLocation, [key]: nextHours } }
    })
  }

  const setLocationAllDayHours = (locationId: number, patch: { start?: string; end?: string }) => {
    setForm((f) => {
      const key = String(locationId)
      const current = f.workingHoursByLocation[key] || { sameForAllDays: true, allDays: { start: '09:00', end: '17:00' }, byDay: {} }
      const prev = current.allDays || { start: '09:00', end: '17:00' }
      const nextHours: WorkingHoursConfig = {
        ...current,
        sameForAllDays: true,
        allDays: { start: patch.start ?? prev.start, end: patch.end ?? prev.end },
      }
      return { ...f, workingHoursByLocation: { ...f.workingHoursByLocation, [key]: nextHours } }
    })
  }

  const setLocationDayHours = (locationId: number, day: DayOfWeek, patch: { start?: string; end?: string } | null) => {
    setForm((f) => {
      const key = String(locationId)
      const current = f.workingHoursByLocation[key] || defaultByDayWorkingHours()
      const next: WorkingHoursConfig = {
        sameForAllDays: false,
        allDays: null,
        byDay: { ...(current.byDay || {}) },
      }
      if (patch == null) {
        next.byDay![day] = null
      } else {
        const prev = current.byDay?.[day] || { start: '09:00', end: '17:00' }
        next.byDay![day] = { start: patch.start ?? prev.start, end: patch.end ?? prev.end }
      }
      return { ...f, workingHoursByLocation: { ...f.workingHoursByLocation, [key]: next } }
    })
  }

  const workingHoursOverrideLocations = locations.filter(
    (location) => form.availableAllLocations || form.locationIds.includes(location.id),
  )

  const activeStatusLabel = locale === 'sl' ? 'Aktivna' : 'Active'
  const inactiveStatusLabel = locale === 'sl' ? 'Neaktivna' : 'Inactive'
  const formTitle = selfService ? t('myProfileTitle') : editing ? (locale === 'sl' ? 'Uredi zaposlenega' : 'Edit employee') : (locale === 'sl' ? 'Novi zaposleni' : 'New employee')
  const closeLabel = locale === 'sl' ? 'Zapri' : 'Close'
  const formPrimaryLabel = saving
    ? t('employeesFormSaving')
    : editing
      ? t('employeesFormSaveChanges')
      : (locale === 'sl' ? 'Ustvari zaposlenega' : 'Create employee')
  const formPrimaryDisabled = saving || deleting || (!!editing && !isFormDirty)
  const consultantToggleOn = form.consultant
  const statusHeader = locale === 'sl' ? 'Status' : 'Status'
  const myUserId = user?.id
  const employeeLimitTitle = locale === 'sl' ? 'Dosegli ste največje število uporabnikov' : 'User limit reached'
  const employeeLimitAllowedCount = employeeLimitDialog?.maxUsers ?? userQuota?.maxUsers
  const employeeLimitAllowedLabel = employeeLimitAllowedCount == null ? '∞' : String(employeeLimitAllowedCount)
  const employeeLimitText = locale === 'sl'
    ? `Vaš paket omogoča ${employeeLimitAllowedLabel} aktivnih uporabnikov. Za dodajanje novega zaposlenega nadgradite paket ali povečajte število uporabnikov. To spremenite v Upravljanje računa → Naročnina.`
    : `Your package allows ${employeeLimitAllowedLabel} active users. Upgrade or increase your user count to add more. You can change this in Account management → Subscription.`
  const employeeLimitButtonLabel = locale === 'sl' ? 'Odpri Naročnino' : 'Open Subscription'
  const employeeLimitCloseLabel = locale === 'sl' ? 'Zapri' : 'Close'
  const isEditingTenantOwner = !!editing?.tenantOwner
  const ownerRoleLockHint = locale === 'sl'
    ? 'Glavni uporabnik najemnika mora vedno ostati Administrator.'
    : 'The tenant owner must always keep the Administrator role.'
  const openSubscriptionSettings = () => {
    setEmployeeLimitDialog(null)
    if (selfService) setShowFormPanel(false)
    else if (formPanelOpen) closeConsultantsDrawer()
    navigate('/configuration?tab=company&subtab=subscription')
  }

  const employeeRoleSelectValue = isEditingTenantOwner ? 'ADMIN' : form.accessRoleId ? `CUSTOM:${form.accessRoleId}` : form.role

  const applyEmployeeRoleSelection = (value: string) => {
    if (isEditingTenantOwner) return
    if (value.startsWith('CUSTOM:')) {
      const accessRoleId = value.substring('CUSTOM:'.length)
      const selectedRole = accessRoleOptions.find((role) => String(role.customRoleId) === accessRoleId)
      setForm({
        ...form,
        role: 'CONSULTANT',
        consultant: form.consultant,
        accessRoleId,
        permissions: selectedRole ? normalizeEmployeePermissions(selectedRole.permissions) : form.permissions,
      })
      return
    }

    const nextRole = value as UserRole
    setForm({
      ...form,
      role: nextRole,
      accessRoleId: '',
      consultant: form.consultant,
      permissions: nextRole === 'CONSULTANT' ? [...DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS] : form.permissions,
    })
  }

  const employeeTabs = (
    <div className="employees-page-tabs-shell clients-entity-tabs-shell">
      <div className="employee-page-tabs clients-session-tabs clients-entity-tabs" role="tablist" aria-label={t('employeesSubtabsAria')}>
        {canViewEmployeesTab && (
          <button
            type="button"
            role="tab"
            aria-selected={employeesTab === 'employees'}
            className={`clients-session-tab employee-page-tab${employeesTab === 'employees' ? ' active employee-page-tab--active' : ''}`}
            onClick={() => {
              setEmployeesTab('employees')
              void loadConsultants(false)
              navigate('/consultants')
            }}
          >
            <EmployeePageTabIcon name="employees" />
            <span>{t('employeesSubtabEmployees')}</span>
            <strong className="employees-tab-count">{filteredConsultants.length}</strong>
          </button>
        )}
        {canViewRolesTab && (
          <button
            type="button"
            role="tab"
            aria-selected={employeesTab === 'roles'}
            className={`clients-session-tab employee-page-tab${employeesTab === 'roles' ? ' active employee-page-tab--active' : ''}`}
            onClick={() => {
              setEmployeesTab('roles')
              navigate('/consultants?tab=roles')
            }}
          >
            <EmployeePageTabIcon name="roles" />
            <span>{t('employeesSubtabRolesPermissions')}</span>
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className={`stack gap-lg${!selfService ? ' employees-page-root' : ''}`}>
      {selfService && !showFormPanel && <PageHeader title={t('myProfileTitle')} />}
      {selfService && loadingSelfProfile && <div className="muted">{t('employeesSelfProfileLoading')}</div>}
      {selfService && !loadingSelfProfile && !showFormPanel && errorMessage && <div className="error">{errorMessage}</div>}
      {!selfService && (employeesTab === 'roles' || isConsultantsMobile) && employeeTabs}
      {!selfService && canViewRolesTab && (employeesTab === 'roles' || roleMembersOpen) && (
        <div className="employees-tab-panel employees-roles-tab-panel">
          <EmployeeRolesPermissionsTab />
        </div>
      )}
      {!selfService && canViewEmployeesTab && !roleMembersOpen && (employeesTab === 'employees' || newEmployeeOpen || employeeDrawerOpen) && (
        <div className="employees-tab-panel employees-list-tab-panel">
          <Card data-onboarding-panel="employees" className={`clients-modern-card employees-modern-card${isConsultantsMobile ? ' clients-mobile-shell' : ''}`}>
            {!isConsultantsMobile && employeeTabs}
            <div className="clients-toolbar clients-modern-toolbar employees-modern-toolbar">
              <div className="clients-toolbar-primary employees-toolbar-primary">
                <div className="clients-search-wrap">
                  <EmployeeModernIcon name="search" />
                  <input
                    className="clients-search-input"
                    placeholder={t('employeesSearchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {!isConsultantsMobile && (
                  <div className="clients-owner-filter employees-role-filter" ref={roleFilterRef}>
                    <button
                      type="button"
                      className={`clients-owner-filter__button${roleFilter !== 'all' ? ' clients-owner-filter__button--active' : ''}`}
                      aria-haspopup="listbox"
                      aria-expanded={roleFilterOpen}
                      onClick={() => setRoleFilterOpen((open) => !open)}
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4 5h16l-6.3 7.2V18l-3.4 1.8v-7.6L4 5Z" />
                      </svg>
                      <span className="clients-owner-filter__label">{locale === 'sl' ? 'Vloga' : 'Role'}:</span>
                      <strong>
                        {roleFilter === 'all'
                          ? (locale === 'sl' ? 'Vse vloge' : 'All roles')
                          : employeeRoleOptions.find((option) => option.value === roleFilter)?.label ?? roleFilter}
                      </strong>
                      <svg className={`clients-owner-filter__chevron${roleFilterOpen ? ' clients-owner-filter__chevron--open' : ''}`} width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m5 7.5 5 5 5-5" />
                      </svg>
                    </button>
                    {roleFilterOpen && (
                      <div className="clients-owner-filter__menu" role="listbox" aria-label={locale === 'sl' ? 'Vloga zaposlenega' : 'Employee role'}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={roleFilter === 'all'}
                          className={roleFilter === 'all' ? 'clients-owner-filter__option active' : 'clients-owner-filter__option'}
                          onClick={() => {
                            setRoleFilter('all')
                            setRoleFilterOpen(false)
                          }}
                        >
                          <span>{locale === 'sl' ? 'Vse vloge' : 'All roles'}</span>
                          {roleFilter === 'all' && <span className="clients-owner-filter__check">✓</span>}
                        </button>
                        {employeeRoleOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={roleFilter === option.value}
                            className={roleFilter === option.value ? 'clients-owner-filter__option active' : 'clients-owner-filter__option'}
                            onClick={() => {
                              setRoleFilter(option.value)
                              setRoleFilterOpen(false)
                            }}
                          >
                            <span>{option.label}</span>
                            {roleFilter === option.value && <span className="clients-owner-filter__check">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="clients-toolbar-actions employees-toolbar-actions">
                <div className="clients-session-tabs clients-filter-tabs" style={{ marginBottom: 0 }}>
                  <button
                    type="button"
                    className="clients-session-tab active"
                    onClick={() => setActiveFilter((prev) => (prev === 'active' ? 'inactive' : 'active'))}
                    aria-pressed={activeFilter === 'active'}
                  >
                    <span className={activeFilter === 'active' ? 'clients-filter-dot clients-filter-dot--active' : 'clients-filter-dot clients-filter-dot--inactive'} />
                    {activeFilter === 'active' ? activeStatusLabel : inactiveStatusLabel}
                  </button>
                </div>
                {isConsultantsMobile && (
                  <div className="clients-count-chip clients-count-chip--mobile-open">
                    {employeeListCountLabel(filteredConsultants.length, locale)}
                  </div>
                )}
                {canCreateEmployees && <button type="button" className="clients-modern-new-btn employees-modern-new-btn" onClick={startCreate}>
                  <EmployeeModernIcon name="plus" />
                  <span>{isConsultantsMobile ? t('billingNewMobile') : t('billingNew')}</span>
                </button>}
              </div>
            </div>
            {errorMessage && !formPanelOpen && <div className="error">{errorMessage}</div>}
            {filteredConsultants.length === 0 ? (
              <EmptyState title={t('employeesEmptyTitle')} text={t('employeesEmptyText')} />
            ) : (
              <div className="clients-list-shell employees-list-shell">
                <div className="clients-mobile-list">
                  {filteredConsultants.map((c) => (
                    <article
                      key={c.id}
                      className="clients-mobile-card"
                      onClick={() => startEdit(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          startEdit(c)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="clients-mobile-card-head employees-mobile-card-head">
                        <div className="clients-name-cell">
                          <span className="clients-name-avatar" aria-hidden>
                            {c.avatarPath ? (
                              <img className="clients-name-avatar-image" src={c.avatarPath} alt="" />
                            ) : (
                              <>
                                {(c.firstName?.[0] || '').toUpperCase()}
                                {(c.lastName?.[0] || '').toUpperCase()}
                              </>
                            )}
                          </span>
                          <div className="clients-name-stack employees-mobile-name-stack">
                            <span className="clients-name">{fullName(c)}</span>
                            {c.email?.trim() ? (
                              <a
                                href={contactMailtoHref(c.email)}
                                className="clients-contact-link employees-mobile-email"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M4 6.5h16v11H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                  <path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span>{c.email.trim()}</span>
                              </a>
                            ) : (
                              <span className="employees-mobile-email employees-mobile-email--empty">—</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="employees-mobile-menu-btn"
                          aria-label={t('commonActions') || 'Actions'}
                          onClick={(e) => {
                            e.stopPropagation()
                            startEdit(c)
                          }}
                        >
                          <span />
                          <span />
                          <span />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                  <table className="clients-table employees-table">
                    <thead>
                      <tr>
                        <ServiceConfigSortableTableHeader label={t('employeesTableName')} sortKey="name" sortState={employeeSort} onSort={(key) => setEmployeeSort((current) => nextServiceConfigSortState(current, key))} />
                        <ServiceConfigSortableTableHeader label={t('loginEmailLabel')} sortKey="email" sortState={employeeSort} onSort={(key) => setEmployeeSort((current) => nextServiceConfigSortState(current, key))} />
                        <ServiceConfigSortableTableHeader label={t('employeesTableRole')} sortKey="role" sortState={employeeSort} onSort={(key) => setEmployeeSort((current) => nextServiceConfigSortState(current, key))} />
                        <ServiceConfigSortableTableHeader label={statusHeader} sortKey="status" sortState={employeeSort} onSort={(key) => setEmployeeSort((current) => nextServiceConfigSortState(current, key))} />
                        <ServiceConfigSortableTableHeader label={t('employeesTableCreated')} sortKey="createdAt" sortState={employeeSort} onSort={(key) => setEmployeeSort((current) => nextServiceConfigSortState(current, key))} />
                        <th>{locale === 'sl' ? 'Dejanja' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConsultants.map((c) => (
                        <tr
                          key={c.id}
                          className="clients-row clients-row--clickable"
                          onClick={() => startEdit(c)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              startEdit(c)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <td>
                            <div className="clients-name-cell">
                              <span className="clients-name-avatar" aria-hidden>
                                {c.avatarPath ? (
                                  <img className="clients-name-avatar-image" src={c.avatarPath} alt="" />
                                ) : (
                                  <>
                                    {(c.firstName?.[0] || '').toUpperCase()}
                                    {(c.lastName?.[0] || '').toUpperCase()}
                                  </>
                                )}
                              </span>
                              <div className="clients-name-stack">
                                <span className="clients-name">{fullName(c)}</span>
                                <span className="clients-id">ID #{c.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="clients-muted">
                            {c.email?.trim() ? (
                              <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.email.trim()}</a>
                            ) : '—'}
                          </td>
                          <td className="clients-muted">{c.accessRoleName || formatRoleLabel(c.role, t)}</td>
                          <td>
                            <button
                              type="button"
                              className={`clients-status-pill clients-status-pill-btn${c.active === false ? ' clients-status-pill--inactive' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                void toggleConsultantActiveById(c.id, c.active !== false)
                              }}
                              disabled={
                                activatingEmployeeId === c.id ||
                                !!c.tenantOwner ||
                                (myUserId != null && c.id === myUserId && c.active !== false)
                              }
                              title={c.tenantOwner ? ownerRoleLockHint : undefined}
                            >
                              <span />
                              {c.active === false ? inactiveStatusLabel : activeStatusLabel}
                            </button>
                          </td>
                          <td className="clients-muted">{formatDate(c.createdAt)}</td>
                          <td className="clients-actions service-config-actions account-table-actions" onClick={(e) => e.stopPropagation()}>
                            {canEditEmployees && (
                              <ServiceConfigEditButton
                                label={locale === 'sl' ? 'Uredi' : 'Edit'}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  startEdit(c)
                                }}
                              />
                            )}
                            {canDeleteEmployees && !c.tenantOwner && c.id !== myUserId && (
                              <ServiceConfigDeleteButton
                                label={locale === 'sl' ? 'Izbriši' : 'Delete'}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void removeConsultant(c)
                                }}
                                disabled={deleting}
                              />
                            )}
                            {!canEditEmployees && (!canDeleteEmployees || c.tenantOwner || c.id === myUserId) && <span className="clients-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ServiceConfigTableFooter
                  summary={locale === 'sl'
                    ? `Prikazano ${filteredConsultants.length} od ${consultants.length} zaposlenih`
                    : `Showing ${filteredConsultants.length} of ${consultants.length} employees`}
                />
              </div>
            )}
          </Card>
        </div>
      )}
      {formPanelOpen && (
        <SidePanel
          open
          size="xl"
          onClose={dismissFormPanel}
          ariaLabel={formTitle}
          closeOnScrimClick={false}
          className={`employee-standard-panel${selfService ? ' employee-standard-panel--self-service' : ''}${editing ? ' employee-standard-panel--editing' : ' employee-standard-panel--creating'}${isEmployeeFormMobileTablet ? ' employee-standard-panel--mobile-tablet' : ''}`}
        >
          <PanelHeader
            title={formTitle}
            onClose={dismissFormPanel}
            closeLabel={closeLabel}
            closeVisible={!isEmployeeFormMobileTablet}
            leading={isEmployeeFormMobileTablet ? (
              <button
                type="button"
                className="employee-mobile-header-btn employee-mobile-header-btn--back"
                onClick={dismissFormPanel}
                aria-label={locale === 'sl' ? 'Nazaj' : 'Back'}
              >
                <EmployeeMobileBackIcon />
              </button>
            ) : undefined}
            actions={isEmployeeFormMobileTablet ? (
              <button
                type="submit"
                form="consultant-edit-form"
                className="employee-mobile-header-btn employee-mobile-header-btn--save"
                disabled={formPrimaryDisabled}
                aria-label={formPrimaryLabel}
                title={formPrimaryLabel}
              >
                <EmployeeMobileSaveIcon />
              </button>
            ) : undefined}
          />
          {!selfService && (
            <PanelTabs
              label={locale === 'sl' ? 'Podatki zaposlenega' : 'Employee details'}
              activeId={formSectionTab}
              onSelect={(id) => setFormSectionTab(id as ConsultantFormSectionTab)}
              tabs={[
                {
                  id: 'basic',
                  label: locale === 'sl' ? 'Osnovni podatki' : 'Basic details',
                  icon: <EmployeeFormIcon name="person" />,
                },
                ...(form.consultant ? [{
                  id: 'workingHours',
                  label: t('employeesFormTabWorkingHours'),
                  icon: <EmployeeFormIcon name="clock" />,
                }] : []),
              ]}
            />
          )}
          <PanelBody
            as="form"
            id="consultant-edit-form"
            onSubmit={handleSubmit}
            className="booking-side-panel-body employees-form-popup-body employee-standard-panel-body"
          >
                {errorMessage && <div className="error employees-form-alert">{errorMessage}</div>}
                {(selfService || formSectionTab === 'basic') && (
                  <div className="employee-standard-basic" role="tabpanel">
                    {editing && !selfService && canEditEmployees && (
                      <section className="employee-avatar-section" aria-label={locale === 'sl' ? 'Slika zaposlenega' : 'Employee image'}>
                        <div className="employee-avatar-section-title">
                          <EmployeeFormIcon name="person" />
                          <strong>{locale === 'sl' ? 'Slika zaposlenega' : 'Employee image'}</strong>
                        </div>
                        <div className="employee-avatar-row">
                          <div className={`employee-avatar-preview${editingAvatarSrc ? ' employee-avatar-preview--image' : ''}`}>
                            {editingAvatarSrc ? (
                              <img src={editingAvatarSrc} alt="" />
                            ) : (
                              <span>{employeeAvatarInitials}</span>
                            )}
                          </div>
                          <input
                            ref={employeeAvatarInputRef}
                            className="employee-avatar-file-input"
                            type="file"
                            accept="image/*"
                            onChange={(event) => void onEmployeeAvatarPicked(event)}
                            tabIndex={-1}
                            aria-hidden="true"
                          />
                          {!editingAvatarSrc ? (
                            <button
                              type="button"
                              className="employee-avatar-upload-button"
                              onClick={openEmployeeAvatarPicker}
                              disabled={employeeAvatarBusy}
                            >
                              <EmployeeAvatarActionIcon name="upload" />
                              <span>{locale === 'sl' ? 'Naloži sliko' : 'Upload image'}</span>
                            </button>
                          ) : (
                            <div className="employee-avatar-existing-actions">
                              <button
                                type="button"
                                className="employee-avatar-action employee-avatar-action--replace"
                                onClick={openEmployeeAvatarPicker}
                                disabled={employeeAvatarBusy}
                              >
                                <EmployeeAvatarActionIcon name="replace" />
                                <span>{locale === 'sl' ? 'Zamenjaj' : 'Replace'}</span>
                              </button>
                              <button
                                type="button"
                                className="employee-avatar-action employee-avatar-action--remove"
                                onClick={() => void removeEmployeeAvatar()}
                                disabled={employeeAvatarBusy}
                              >
                                <EmployeeFormIcon name="trash" />
                                <span>{locale === 'sl' ? 'Odstrani' : 'Remove'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                    <div className="employee-standard-fields-grid">
                      <EmployeeFormField icon="person" label={t('signupFirstName')} required className="employee-standard-field--first-name">
                        <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite ime' : 'Enter first name'} />
                      </EmployeeFormField>

                      <EmployeeFormField icon="phone" label={t('employeesFormPhone')} className="employee-standard-field--phone">
                        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('employeesFormPhonePlaceholder')} />
                      </EmployeeFormField>

                      <EmployeeFormField icon="person" label={t('signupLastName')} required className="employee-standard-field--last-name">
                        <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite priimek' : 'Enter last name'} />
                      </EmployeeFormField>

                      <EmployeeFormField icon="vat" label={t('employeesFormVatId')} className="employee-standard-field--vat">
                        <input value={form.vatId} onChange={(e) => setForm({ ...form, vatId: e.target.value })} placeholder={t('employeesFormVatPlaceholder')} />
                      </EmployeeFormField>

                      <EmployeeFormField icon="email" label={t('loginEmailLabel')} required className="employee-standard-field--email">
                        <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite e-pošto' : 'Enter email'} />
                      </EmployeeFormField>

                      {!selfService ? (
                        <EmployeeFormField icon="role" label={t('employeesFormRole')} hint={isEditingTenantOwner ? ownerRoleLockHint : undefined} className="employee-standard-field--role">
                          <DesktopSelect
                            value={employeeRoleSelectValue}
                            onChange={(e) => applyEmployeeRoleSelection(e.target.value)}
                            disabled={isEditingTenantOwner}
                          >
                            <option value="CONSULTANT">{t('employeesFormRoleOptionConsultant')}</option>
                            <option value="ADMIN">{t('employeesFormRoleOptionAdmin')}</option>
                            {accessRoleOptions.length > 0 && (
                              <optgroup label={locale === 'sl' ? 'Vloge po meri' : 'Custom roles'}>
                                {accessRoleOptions.map((role) => (
                                  <option key={role.id} value={`CUSTOM:${role.customRoleId ?? ''}`}>{role.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </DesktopSelect>
                        </EmployeeFormField>
                      ) : <div aria-hidden />}

                      {(editing || selfService) && (
                        <div className="employee-standard-reset-password-action employee-standard-reset-password-action--mobile-ordered">
                          <button
                            type="button"
                            className="employee-standard-reset-password-button"
                            onClick={() => void sendPasswordResetEmail()}
                            disabled={passwordResetSending}
                          >
                            <EmployeeFormIcon name="password" />
                            <span>
                              {passwordResetSending
                                ? (locale === 'sl' ? 'Pošiljam ...' : locale === 'sr' ? 'Šaljem ...' : 'Sending ...')
                                : (locale === 'sl' ? 'Ponastavite geslo' : locale === 'sr' ? 'Podesite lozinku' : 'Reset password')}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>

                    {!selfService && (
                      <div className="employee-form-consultant-row clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide clients-standard-group-setting-toggle">
                        <span>{t('employeesFormConsultantShort')}</span>
                        <button
                          type="button"
                          className={`clients-batch-switch${consultantToggleOn ? ' clients-batch-switch--on' : ''}`}
                          aria-pressed={consultantToggleOn}
                          onClick={() => {
                            const nextConsultant = !form.consultant
                            setForm({ ...form, consultant: nextConsultant })
                            if (!nextConsultant) setFormSectionTab('basic')
                          }}
                        >
                          {consultantToggleOn ? t('configToggleOn') : t('configToggleOff')}
                        </button>
                      </div>
                    )}

                    {!selfService && form.consultant && locations.length > 1 && (
                      <div className="employee-location-scope-card">
                        <div className="employee-location-scope-header">
                          <div>
                            <strong>{locale === 'sl' ? 'Lokacije zaposlenega' : 'Employee locations'}</strong>
                            <span>{locale === 'sl' ? 'Določite, v katerih poslovnih prostorih je zaposleni na voljo za naročanje.' : 'Choose the locations where this employee can be booked.'}</span>
                          </div>
                          <div className="employee-location-scope-switch">
                            <span>{locale === 'sl' ? 'Vse lokacije' : 'All locations'}</span>
                            <GuestSwitch checked={form.availableAllLocations} onChange={setConsultantAllLocations} />
                          </div>
                        </div>
                        {!form.availableAllLocations && (
                          <div className="employee-location-options">
                            {locations.length === 0 ? (
                              <span className="muted">{locale === 'sl' ? 'Ni aktivnih lokacij.' : 'There are no active locations.'}</span>
                            ) : locations.map((location) => (
                              <label key={location.id} className="employee-location-option">
                                <input
                                  type="checkbox"
                                  checked={form.locationIds.includes(location.id)}
                                  onChange={(e) => toggleConsultantLocation(location.id, e.target.checked)}
                                />
                                <span>
                                  <strong>{location.name}</strong>
                                  {location.city ? <small>{location.city}</small> : null}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(selfService || (form.consultant && formSectionTab === 'workingHours')) && (
                  <div className="employee-standard-working-hours" role="tabpanel">
                    {isEmployeeFormMobileTablet ? (
                      <div className="employee-mobile-working-hours">
                        <div className="employee-mobile-working-hours__same-row">
                          <span>{t('employeesFormSameHoursEveryDay')}</span>
                          <button
                            type="button"
                            className={`clients-batch-switch employee-mobile-working-hours__switch${form.workingHours.sameForAllDays ? ' clients-batch-switch--on' : ''}`}
                            aria-pressed={form.workingHours.sameForAllDays}
                            onClick={() => setWorkingHoursSameForAllDays(!form.workingHours.sameForAllDays)}
                          >
                            <span className="sr-only">{t('employeesFormSameHoursEveryDay')}</span>
                          </button>
                        </div>
                        <div className="employee-mobile-working-hours__days">
                          {form.workingHours.sameForAllDays ? (() => {
                            const row = form.workingHours.allDays || { start: '09:00', end: '17:00' }
                            const startValue = (row.start || '09:00').slice(0, 5)
                            const endValue = (row.end || '17:00').slice(0, 5)
                            return (
                              <div className="employee-mobile-working-day">
                                <div className="employee-mobile-working-day__check employee-mobile-working-day__check--all-days">
                                  <span>{t('employeesFormAllDays')}</span>
                                </div>
                                <div className="employee-mobile-working-day__times">
                                  <div className="employee-mobile-working-day__time">
                                    <span>{t('employeesFormStart')}</span>
                                    <ModernTimePicker
                                      className="employee-mobile-working-day__picker"
                                      value={startValue}
                                      ariaLabel={`${t('employeesFormStart')} – ${t('employeesFormAllDays')}`}
                                      onChange={(value) => setForm((f) => ({
                                        ...f,
                                        workingHours: {
                                          ...f.workingHours,
                                          sameForAllDays: true,
                                          allDays: {
                                            start: value,
                                            end: (f.workingHours.allDays?.end || '17:00').slice(0, 5),
                                          },
                                        },
                                      }))}
                                    />
                                  </div>
                                  <div className="employee-mobile-working-day__time">
                                    <span>{t('employeesFormEnd')}</span>
                                    <ModernTimePicker
                                      className="employee-mobile-working-day__picker"
                                      value={endValue}
                                      ariaLabel={`${t('employeesFormEnd')} – ${t('employeesFormAllDays')}`}
                                      onChange={(value) => setForm((f) => ({
                                        ...f,
                                        workingHours: {
                                          ...f.workingHours,
                                          sameForAllDays: true,
                                          allDays: {
                                            start: (f.workingHours.allDays?.start || '09:00').slice(0, 5),
                                            end: value,
                                          },
                                        },
                                      }))}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })() : dayOptions.map((day) => {
                            const row = form.workingHours.byDay?.[day]
                            const active = !!(row?.start && row?.end)
                            const startValue = (row?.start || '09:00').slice(0, 5)
                            const endValue = (row?.end || '17:00').slice(0, 5)
                            return (
                              <div key={day} className={`employee-mobile-working-day${active ? '' : ' is-inactive'}`}>
                                <label className="employee-mobile-working-day__check">
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={(event) => setMobileWorkingDayActive(day, event.target.checked)}
                                  />
                                  <span>{t(EMPLOYEE_DAY_LABEL_KEY[day])}</span>
                                </label>
                                <div className="employee-mobile-working-day__times">
                                  <div className="employee-mobile-working-day__time">
                                    <span>{t('employeesFormStart')}</span>
                                    <ModernTimePicker
                                      className="employee-mobile-working-day__picker"
                                      disabled={!active}
                                      value={startValue}
                                      ariaLabel={`${t('employeesFormStart')} – ${t(EMPLOYEE_DAY_LABEL_KEY[day])}`}
                                      onChange={(value) => setMobileWorkingDayTime(day, { start: value })}
                                    />
                                  </div>
                                  <div className="employee-mobile-working-day__time">
                                    <span>{t('employeesFormEnd')}</span>
                                    <ModernTimePicker
                                      className="employee-mobile-working-day__picker"
                                      disabled={!active}
                                      value={endValue}
                                      ariaLabel={`${t('employeesFormEnd')} – ${t(EMPLOYEE_DAY_LABEL_KEY[day])}`}
                                      onChange={(value) => setMobileWorkingDayTime(day, { end: value })}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                    <div className="full-span consultant-wh-card employee-form-working-card">
                      <div className="consultant-wh-card-header">
                        <span className="consultant-wh-card-header-label" id="consultant-wh-same-hours-label">
                          {t('employeesFormSameHoursEveryDay')}
                        </span>
                        <GuestSwitch
                          checked={form.workingHours.sameForAllDays}
                          onChange={setWorkingHoursSameForAllDays}
                        />
                      </div>
                      <div className="consultant-wh-rows">
                        {form.workingHours.sameForAllDays ? (
                          <div className="consultant-wh-row">
                            <div className="consultant-wh-day-col">
                              <span className="consultant-wh-all-days-label">{t('employeesFormAllDays')}</span>
                            </div>
                            <div className="consultant-wh-time-col">
                              <span className="consultant-wh-time-label">
                                {t('employeesFormStart')}
                              </span>
                              <div className="consultant-wh-time-input-wrap">
                                <ModernTimePicker
                                  className="consultant-wh-time-input"
                                  value={(form.workingHours.allDays?.start ?? '09:00').slice(0, 5)}
                                  ariaLabel={t('employeesFormStart')}
                                  onChange={(v) => {
                                    setForm((f) => ({
                                      ...f,
                                      workingHours: {
                                        ...f.workingHours,
                                        allDays: {
                                          start: v,
                                          end: (f.workingHours.allDays?.end || '17:00').slice(0, 5),
                                        },
                                      },
                                    }))
                                  }}
                                />
                              </div>
                            </div>
                            <div className="consultant-wh-time-col">
                              <span className="consultant-wh-time-label">
                                {t('employeesFormEnd')}
                              </span>
                              <div className="consultant-wh-time-input-wrap">
                                <ModernTimePicker
                                  className="consultant-wh-time-input"
                                  value={(form.workingHours.allDays?.end ?? '17:00').slice(0, 5)}
                                  ariaLabel={t('employeesFormEnd')}
                                  onChange={(v) => {
                                    setForm((f) => ({
                                      ...f,
                                      workingHours: {
                                        ...f.workingHours,
                                        allDays: {
                                          start: (f.workingHours.allDays?.start || '09:00').slice(0, 5),
                                          end: v,
                                        },
                                      },
                                    }))
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          dayOptions.map((day) => {
                            const wh = form.workingHours
                            const row = wh.byDay?.[day]
                            const active = !!(row?.start && row?.end)
                            const startVal = (row?.start ?? '09:00').slice(0, 5)
                            const endVal = (row?.end ?? '17:00').slice(0, 5)
                            return (
                              <div
                                key={day}
                                className={`consultant-wh-row${active ? '' : ' consultant-wh-row--inactive'}`}
                              >
                                <div className="consultant-wh-day-col">
                                  <label className="consultant-wh-day-check">
                                    <input
                                      type="checkbox"
                                      checked={active}
                                      onChange={(e) => {
                                        if (e.target.checked) setDayHours(day, { start: '09:00', end: '17:00' })
                                        else setDayHours(day, null)
                                      }}
                                    />
                                    <span>{t(EMPLOYEE_DAY_LABEL_KEY[day])}</span>
                                  </label>
                                </div>
                                <div className="consultant-wh-time-col">
                                  <span className="consultant-wh-time-label">
                                    {t('employeesFormStart')}
                                  </span>
                                  <div className="consultant-wh-time-input-wrap">
                                    <ModernTimePicker
                                      className="consultant-wh-time-input"
                                      disabled={!active}
                                      value={startVal}
                                      ariaLabel={`${t('employeesFormStart')} – ${t(EMPLOYEE_DAY_LABEL_KEY[day])}`}
                                      onChange={(nextValue) => setDayHours(day, { start: nextValue, end: row?.end || '17:00' })}
                                    />
                                  </div>
                                </div>
                                <div className="consultant-wh-time-col">
                                  <span className="consultant-wh-time-label">
                                    {t('employeesFormEnd')}
                                  </span>
                                  <div className="consultant-wh-time-input-wrap">
                                    <ModernTimePicker
                                      className="consultant-wh-time-input"
                                      disabled={!active}
                                      value={endVal}
                                      ariaLabel={`${t('employeesFormEnd')} – ${t(EMPLOYEE_DAY_LABEL_KEY[day])}`}
                                      onChange={(nextValue) => setDayHours(day, { start: row?.start || '09:00', end: nextValue })}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>

                    )}

                    {!selfService && form.consultant && locations.length > 1 && workingHoursOverrideLocations.length > 0 && (
                      <div className="full-span employee-location-hours-section">
                        <div className="employee-location-hours-heading">
                          <strong>{locale === 'sl' ? 'Delovni čas po lokacijah' : 'Working hours by location'}</strong>
                          <span>{locale === 'sl'
                            ? 'Zgornji delovni čas je privzet. Tukaj nastavite samo lokacije, kjer velja drugačen urnik.'
                            : 'The schedule above is the default. Add an override only where a location uses different hours.'}</span>
                        </div>
                        <div className="employee-location-hours-list">
                          {workingHoursOverrideLocations.map((location) => {
                            const key = String(location.id)
                            const overrideHours = form.workingHoursByLocation[key]
                            const overrideEnabled = !!overrideHours
                            return (
                              <details key={location.id} className={`employee-location-hours-card${overrideEnabled ? ' employee-location-hours-card--enabled' : ''}`} open={overrideEnabled}>
                                <summary>
                                  <span className="employee-location-hours-name">
                                    <strong>{location.name}</strong>
                                    {location.city ? <small>{location.city}</small> : null}
                                  </span>
                                  <span className="employee-location-hours-toggle">
                                    <span>{locale === 'sl' ? 'Drugačen urnik' : 'Different schedule'}</span>
                                    <GuestSwitch
                                      checked={overrideEnabled}
                                      onChange={(enabled) => setLocationWorkingHoursOverride(location.id, enabled)}
                                    />
                                  </span>
                                </summary>
                                {overrideHours && (
                                  <div className="employee-location-hours-body">
                                    <div className="employee-location-hours-same-row">
                                      <span>{t('employeesFormSameHoursEveryDay')}</span>
                                      <GuestSwitch
                                        checked={overrideHours.sameForAllDays}
                                        onChange={(same) => setLocationWorkingHoursSame(location.id, same)}
                                      />
                                    </div>
                                    <div className="consultant-wh-rows">
                                      {overrideHours.sameForAllDays ? (
                                        <div className="consultant-wh-row">
                                          <div className="consultant-wh-day-col">
                                            <span className="consultant-wh-all-days-label">{t('employeesFormAllDays')}</span>
                                          </div>
                                          <div className="consultant-wh-time-col">
                                            <span className="consultant-wh-time-label">{t('employeesFormStart')}</span>
                                            <div className="consultant-wh-time-input-wrap">
                                              <ModernTimePicker
                                                className="consultant-wh-time-input"
                                                value={(overrideHours.allDays?.start ?? '09:00').slice(0, 5)}
                                                ariaLabel={`${t('employeesFormStart')} – ${location.name}`}
                                                onChange={(value) => setLocationAllDayHours(location.id, { start: value })}
                                              />
                                            </div>
                                          </div>
                                          <div className="consultant-wh-time-col">
                                            <span className="consultant-wh-time-label">{t('employeesFormEnd')}</span>
                                            <div className="consultant-wh-time-input-wrap">
                                              <ModernTimePicker
                                                className="consultant-wh-time-input"
                                                value={(overrideHours.allDays?.end ?? '17:00').slice(0, 5)}
                                                ariaLabel={`${t('employeesFormEnd')} – ${location.name}`}
                                                onChange={(value) => setLocationAllDayHours(location.id, { end: value })}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ) : dayOptions.map((day) => {
                                        const row = overrideHours.byDay?.[day]
                                        const active = !!(row?.start && row?.end)
                                        return (
                                          <div key={day} className={`consultant-wh-row${active ? '' : ' consultant-wh-row--inactive'}`}>
                                            <div className="consultant-wh-day-col">
                                              <label className="consultant-wh-day-check">
                                                <input
                                                  type="checkbox"
                                                  checked={active}
                                                  onChange={(e) => e.target.checked
                                                    ? setLocationDayHours(location.id, day, { start: '09:00', end: '17:00' })
                                                    : setLocationDayHours(location.id, day, null)}
                                                />
                                                <span>{t(EMPLOYEE_DAY_LABEL_KEY[day])}</span>
                                              </label>
                                            </div>
                                            <div className="consultant-wh-time-col">
                                              <span className="consultant-wh-time-label">{t('employeesFormStart')}</span>
                                              <div className="consultant-wh-time-input-wrap">
                                                <ModernTimePicker
                                                  className="consultant-wh-time-input"
                                                  disabled={!active}
                                                  value={(row?.start ?? '09:00').slice(0, 5)}
                                                  ariaLabel={`${t('employeesFormStart')} – ${t(EMPLOYEE_DAY_LABEL_KEY[day])} – ${location.name}`}
                                                  onChange={(value) => setLocationDayHours(location.id, day, { start: value, end: row?.end || '17:00' })}
                                                />
                                              </div>
                                            </div>
                                            <div className="consultant-wh-time-col">
                                              <span className="consultant-wh-time-label">{t('employeesFormEnd')}</span>
                                              <div className="consultant-wh-time-input-wrap">
                                                <ModernTimePicker
                                                  className="consultant-wh-time-input"
                                                  disabled={!active}
                                                  value={(row?.end ?? '17:00').slice(0, 5)}
                                                  ariaLabel={`${t('employeesFormEnd')} – ${t(EMPLOYEE_DAY_LABEL_KEY[day])} – ${location.name}`}
                                                  onChange={(value) => setLocationDayHours(location.id, day, { start: row?.start || '09:00', end: value })}
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </details>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {successMessage && <div className="success employees-form-alert">{successMessage}</div>}
          </PanelBody>
          {!isEmployeeFormMobileTablet && !mobileKeyboardOpen && (
            <PanelFooter>
              {editing && !selfService && !isEditingTenantOwner && canDeleteEmployees && (
                <div className="employee-standard-footer-delete">
                  <PanelButton
                    variant="danger"
                    onClick={() => void removeEditing()}
                    disabled={deleting || saving}
                    busy={deleting}
                    icon={<EmployeeFormIcon name="trash" />}
                  >
                    {deleting
                      ? t('employeesFormDeleting')
                      : (locale === 'sl' ? 'Izbriši zaposlenega' : t('employeesFormDelete'))}
                  </PanelButton>
                </div>
              )}
              {(!isConsultantsMobile || !editing || isFormDirty || saving) && (
                <PanelButton
                  variant="primary"
                  type="submit"
                  form="consultant-edit-form"
                  disabled={formPrimaryDisabled}
                  busy={saving}
                  icon={<GuestConfigSaveIcon />}
                >
                  {formPrimaryLabel}
                </PanelButton>
              )}
            </PanelFooter>
          )}
        </SidePanel>
      )}
      <ConfirmDialog
        open={employeeLimitDialog != null}
        onClose={() => setEmployeeLimitDialog(null)}
        title={employeeLimitTitle}
        text={employeeLimitText}
        tone="warning"
        icon={<EmployeeFormIcon name="person" />}
        onConfirm={openSubscriptionSettings}
        confirmLabel={employeeLimitButtonLabel}
        cancelLabel={employeeLimitCloseLabel}
      >
        {employeeLimitDialog && (
          <div className="employees-limit-usage-card">
            <span>{locale === 'sl' ? 'Aktivni uporabniki' : 'Active users'}</span>
            <strong>{employeeLimitDialog.activeUsers} / {employeeLimitDialog.maxUsers ?? '∞'}</strong>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
