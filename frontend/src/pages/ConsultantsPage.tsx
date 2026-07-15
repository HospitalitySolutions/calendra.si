import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { Card, EmptyState, Field, PageHeader } from '../components/ui'
import { GuestConfigSaveIcon } from '../components/GuestConfigSaveIcon'
import { ModernTimePicker } from '../components/ModernTimePicker'
import { GuestSwitch } from './configuration/ConfigurationVisualComponents'
import { EmployeeRolesPermissionsTab } from './EmployeeRolesPermissionsTab'
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


function EmployeeFormIcon({ name }: { name: 'person' | 'clock' | 'calendar' | 'eye' | 'trash' }) {
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
function formatRoleLabel(role: UserRole, t: (key: string) => string) {
  return role === 'ADMIN' ? t('employeesFormRoleOptionAdmin') : t('employeesFormRoleOptionConsultant')
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
  permissions: EmployeePermission[]
  accessRoleId: string
}

type ConsultantFormSectionTab = 'workingHours'

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
    workingHoursEqual(a.workingHours, b.workingHours) &&
    permissionsEqual(a.permissions, b.permissions)
  )
}

export type ConsultantsPageProps = {
  /** Consultant: edit own profile (same form as admin employee editor, limited fields). */
  selfService?: boolean
}

export function ConsultantsPage({ selfService = false }: ConsultantsPageProps) {
  const { t, locale } = useLocale()
  const navigate = useNavigate()
  const user = getStoredUser()
  const canViewEmployeesTab = hasEmployeePermission(user, 'EMPLOYEES_VIEW')
  const canViewRolesTab = hasEmployeePermission(user, 'ROLES_PERMISSIONS_VIEW')
  const canCreateEmployees = hasEmployeePermission(user, 'EMPLOYEES_CREATE')
  const canEditEmployees = hasEmployeePermission(user, 'EMPLOYEES_EDIT')
  const canDeleteEmployees = hasEmployeePermission(user, 'EMPLOYEES_DELETE')
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [accessRoleOptions, setAccessRoleOptions] = useState<AccessRoleOption[]>([])
  const [userQuota, setUserQuota] = useState<UserQuota | null>(null)
  const [employeeLimitDialog, setEmployeeLimitDialog] = useState<UserQuota | null>(null)
  const [editing, setEditing] = useState<Consultant | null>(null)
  const [showFormPanel, setShowFormPanel] = useState(false)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive'>('active')
  const [form, setForm] = useState<ConsultantForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isConsultantsMobile, setIsConsultantsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false,
  )
  const [formSectionTab, setFormSectionTab] = useState<ConsultantFormSectionTab>('workingHours')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const formBaselineRef = useRef<ConsultantForm | null>(null)
  const [loadingSelfProfile, setLoadingSelfProfile] = useState(false)
  const [activatingEmployeeId, setActivatingEmployeeId] = useState<number | null>(null)
  const [employeesTab, setEmployeesTab] = useState<'employees' | 'roles'>(() => canViewEmployeesTab ? 'employees' : 'roles')

  useEffect(() => {
    if (selfService) return
    if (employeesTab === 'employees' && !canViewEmployeesTab && canViewRolesTab) setEmployeesTab('roles')
    if (employeesTab === 'roles' && !canViewRolesTab && canViewEmployeesTab) setEmployeesTab('employees')
  }, [canViewEmployeesTab, canViewRolesTab, employeesTab, selfService])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 450px)')
    const apply = () => setIsConsultantsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  async function loadConsultants() {
    if (!canViewEmployeesTab) {
      setConsultants([])
      if (!canViewRolesTab) setErrorMessage(locale === 'sl' ? 'Nimate dovoljenja za ogled zaposlenih.' : 'You do not have permission to view employees.')
      return
    }

    setErrorMessage('')

    try {
      const [usersResponse, quotaResponse, rolesResponse] = await Promise.all([
        api.get(`/users`),
        api.get<UserQuota>(`/users/quota`).catch(() => ({ data: null as UserQuota | null })),
        api.get<{ roles: AccessRoleOption[] }>(`/employee-roles`).catch(() => ({ data: { roles: [] as AccessRoleOption[] } })),
      ])
      const nextConsultants = usersResponse.data ?? []
      setConsultants(nextConsultants)
      setUserQuota(quotaResponse.data ?? null)
      setAccessRoleOptions((rolesResponse.data?.roles ?? []).filter((role) => !role.system))
    } catch (error: any) {
      console.error('Failed to load consultants', error)

      if (error?.response?.status === 403) {
        setErrorMessage(locale === 'sl' ? 'Nimate dovoljenja za ogled zaposlenih.' : 'You do not have permission to view employees.')
      } else {
        setErrorMessage(locale === 'sl' ? 'Zaposlenih ni bilo mogoče naložiti.' : 'Failed to load employees.')
      }
    }
  }

  const refreshUserQuota = async (): Promise<UserQuota | null> => {
    if (!canCreateEmployees) return null
    try {
      const { data } = await api.get<UserQuota>(`/users/quota`)
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
    void loadConsultants()
  }, [canViewEmployeesTab, selfService])

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

  const filteredConsultants = useMemo(() => {
    const byStatus = consultants.filter((consultant) =>
      activeFilter === 'inactive' ? consultant.active === false : consultant.active !== false,
    )
    const q = search.trim().toLowerCase()
    if (!q) return byStatus

    return byStatus.filter((consultant) => {
      const nm = `${consultant.firstName} ${consultant.lastName}`.toLowerCase()
      const roleLabel = (consultant.accessRoleName || formatRoleLabel(consultant.role, t)).toLowerCase()
      return (
        nm.includes(q) ||
        consultant.email.toLowerCase().includes(q) ||
        consultant.role.toLowerCase().includes(q) ||
        roleLabel.includes(q)
      )
    })
  }, [consultants, search, activeFilter, t])

  const startCreate = () => {
    if (hasReachedUserQuota(userQuota)) {
      void showEmployeeLimitPopup(userQuota)
      return
    }
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
    setFormSectionTab('workingHours')
    setPasswordVisible(false)
    setShowFormPanel(true)
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
      permissions: normalizeEmployeePermissions(c.permissions),
      accessRoleId: c.tenantOwner || c.accessRoleId == null ? '' : String(c.accessRoleId),
    }
    setForm(next)
    formBaselineRef.current = cloneConsultantForm(next)
    setErrorMessage('')
    setSuccessMessage('')
    setFormSectionTab('workingHours')
    setPasswordVisible(false)
  }

  const startEdit = (c: Consultant) => {
    populateFormFromConsultant(c)
    setShowFormPanel(true)
  }

  const isFormDirty = useMemo(() => {
    if (!showFormPanel || !formBaselineRef.current) return false
    return !consultantFormsEqual(form, formBaselineRef.current)
  }, [form, showFormPanel])

  const removeEditing = async () => {
    if (!editing || !canDeleteEmployees) return
    if (!window.confirm(`Delete consultant ${fullName(editing)}? This cannot be undone.`)) return
    setDeleting(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await api.delete(`/users/${editing.id}`)
      setShowFormPanel(false)
      setEditing(null)
      setForm(emptyForm)
      await loadConsultants()
      window.dispatchEvent(new Event('users-updated'))
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || 'Failed to delete consultant.')
    } finally {
      setDeleting(false)
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
      setShowFormPanel(false)
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
    setShowFormPanel(false)
    if (selfService) navigate('/calendar')
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

  const activeStatusLabel = locale === 'sl' ? 'Aktivna' : 'Active'
  const inactiveStatusLabel = locale === 'sl' ? 'Neaktivna' : 'Inactive'
  const formTitle = selfService ? t('myProfileTitle') : editing ? (locale === 'sl' ? 'Uredi zaposlenega' : 'Edit employee') : (locale === 'sl' ? 'Novi zaposleni' : 'New employee')
  const cancelLabel = locale === 'sl' ? 'Prekliči' : 'Cancel'
  const closeLabel = locale === 'sl' ? 'Zapri' : 'Close'
  const formPrimaryLabel = saving ? t('employeesFormSaving') : editing ? t('employeesFormSaveChanges') : (locale === 'sl' ? 'Ustvari' : 'Create')
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
    setShowFormPanel(false)
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

  return (
    <div className="stack gap-lg">
      {selfService && !showFormPanel && <PageHeader title={t('myProfileTitle')} />}
      {selfService && loadingSelfProfile && <div className="muted">{t('employeesSelfProfileLoading')}</div>}
      {selfService && !loadingSelfProfile && !showFormPanel && errorMessage && <div className="error">{errorMessage}</div>}
      {!selfService && (
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
                void loadConsultants()
              }}
            >
              <EmployeePageTabIcon name="employees" />
              <span>{t('employeesSubtabEmployees')}</span>
            </button>
          )}
          {canViewRolesTab && (
            <button
              type="button"
              role="tab"
              aria-selected={employeesTab === 'roles'}
              className={`clients-session-tab employee-page-tab${employeesTab === 'roles' ? ' active employee-page-tab--active' : ''}`}
              onClick={() => setEmployeesTab('roles')}
            >
              <EmployeePageTabIcon name="roles" />
              <span>{t('employeesSubtabRolesPermissions')}</span>
            </button>
          )}
        </div>
        </div>
      )}
      {!selfService && canViewRolesTab && employeesTab === 'roles' && <EmployeeRolesPermissionsTab />}
      {!selfService && canViewEmployeesTab && employeesTab === 'employees' && (
        <div>
          <Card data-onboarding-panel="employees" className={`clients-modern-card employees-modern-card${isConsultantsMobile ? ' clients-mobile-shell' : ''}`}>
            <div className="clients-toolbar clients-modern-toolbar employees-modern-toolbar">
              <div className="clients-search-wrap">
                <EmployeeModernIcon name="search" />
                <input
                  className="clients-search-input"
                  placeholder={t('employeesSearchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
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
                <div className={`clients-count-chip${isConsultantsMobile ? ' clients-count-chip--mobile-open' : ''}`}>
                  {employeeListCountLabel(filteredConsultants.length, locale)}
                </div>
                {canCreateEmployees && <button type="button" className="clients-modern-new-btn employees-modern-new-btn" onClick={startCreate}>
                  <EmployeeModernIcon name="plus" />
                  <span>{isConsultantsMobile ? t('billingNewMobile') : t('billingNew')}</span>
                </button>}
              </div>
            </div>
            {errorMessage && !showFormPanel && <div className="error">{errorMessage}</div>}
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
                      <div className="clients-mobile-card-head">
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
                      </div>
                      <div className="clients-mobile-meta">
                        <div>
                          <span>{t('loginEmailLabel')}</span>
                          {c.email?.trim() ? (
                            <strong>
                              <a
                                href={contactMailtoHref(c.email)}
                                className="clients-contact-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {c.email.trim()}
                              </a>
                            </strong>
                          ) : (
                            <strong>—</strong>
                          )}
                        </div>
                        <div>
                          <span>{t('employeesMetaRole')}</span>
                          <strong>{c.accessRoleName || formatRoleLabel(c.role, t)}</strong>
                        </div>
                        <div>
                          <span>{statusHeader}</span>
                          <strong>
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
                          </strong>
                        </div>
                        <div>
                          <span>{t('employeesMetaCreated')}</span>
                          <strong>{formatDate(c.createdAt)}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                  <table className="clients-table employees-table">
                    <thead>
                      <tr>
                        <th>{t('employeesTableName')}</th>
                        <th>{t('loginEmailLabel')}</th>
                        <th>{t('employeesTableRole')}</th>
                        <th>{statusHeader}</th>
                        <th>{t('employeesTableCreated')}</th>
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
                          <td className="clients-muted">{c.email}</td>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
      {showFormPanel && (
        <div className="modal-backdrop booking-side-panel-backdrop employees-form-popup-backdrop" onClick={dismissFormPanel}>
          <div className="modal large-modal booking-side-panel employees-form-popup" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header employees-form-popup-header">
              <div className="employees-form-title-wrap">
                <span className="employees-form-title-icon" aria-hidden>
                  <EmployeeFormIcon name="person" />
                </span>
                <h2>{formTitle}</h2>
              </div>
              <button type="button" className="secondary booking-side-panel-close employees-form-close" onClick={dismissFormPanel} aria-label={closeLabel}>
                ×
              </button>
            </div>
            <div className="consultant-panel-stack employees-form-popup-stack">
              <form id="consultant-edit-form" className="form-grid booking-side-panel-body employees-form-popup-body" onSubmit={handleSubmit}>
                {errorMessage && <div className="error full-span employees-form-alert">{errorMessage}</div>}
                <Field label={t('signupFirstName')}>
                  <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite ime' : 'Enter first name'} />
                </Field>
                <Field label={t('signupLastName')}>
                  <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite priimek' : 'Enter last name'} />
                </Field>
                <Field label={t('loginEmailLabel')}>
                  <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite e-pošto' : 'Enter email'} />
                </Field>
                {(editing || selfService) && (
                  <Field label={t('employeesFormPassword')} hint={t('employeesFormPasswordHintEdit')}>
                    <div className="employees-password-input-wrap">
                      <input
                        type={passwordVisible ? 'text' : 'password'}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder={locale === 'sl' ? 'Vnesite novo geslo' : 'Enter new password'}
                      />
                      <button
                        type="button"
                        className="employees-password-toggle"
                        aria-label={passwordVisible ? (locale === 'sl' ? 'Skrij geslo' : 'Hide password') : (locale === 'sl' ? 'Prikaži geslo' : 'Show password')}
                        aria-pressed={passwordVisible}
                        onClick={() => setPasswordVisible((visible) => !visible)}
                      >
                        <EmployeeFormIcon name="eye" />
                      </button>
                    </div>
                  </Field>
                )}
                <Field label={t('employeesFormPhone')}>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('employeesFormPhonePlaceholder')} />
                </Field>
                <Field label={t('employeesFormVatId')}>
                  <input value={form.vatId} onChange={(e) => setForm({ ...form, vatId: e.target.value })} placeholder={t('employeesFormVatPlaceholder')} />
                </Field>
                {!selfService && (
                  <>
                    <Field label={t('employeesFormRole')} hint={isEditingTenantOwner ? ownerRoleLockHint : undefined}>
                      <select
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
                      </select>
                    </Field>
                    <div className="employee-form-consultant-row full-span">
                      <span>{t('employeesFormConsultantShort')}</span>
                      <button
                        type="button"
                        className={`employee-form-status-switch${consultantToggleOn ? ' employee-form-status-switch--on' : ''}`}
                        aria-pressed={consultantToggleOn}
                        onClick={() => {
                          setForm({ ...form, consultant: !form.consultant })
                        }}
                      >
                        <span className="employee-form-status-switch-text">
                          {consultantToggleOn ? t('configToggleOn') : t('configToggleOff')}
                        </span>
                        <span className="employee-form-status-switch-track" aria-hidden>
                          <span />
                        </span>
                      </button>
                    </div>
                  </>
                )}

                {!selfService && (
                  <div className="full-span clients-session-tabs consultant-form-tabs employee-form-tabs" aria-label={t('employeesFormTabWorkingHours')}>
                    <button
                      type="button"
                      className="clients-session-tab active"
                      aria-current="true"
                    >
                      <EmployeeFormIcon name="clock" />
                      {t('employeesFormTabWorkingHours')}
                    </button>
                  </div>
                )}

                {(selfService || formSectionTab === 'workingHours') && (
                  <>
                    <div className="full-span consultant-wh-card employee-form-working-card">
                      <div className="consultant-wh-card-header">
                        <span className="consultant-wh-card-header-label" id="consultant-wh-same-hours-label">
                          {t('employeesFormSameHoursEveryDay')}
                        </span>
                        <GuestSwitch
                          checked={form.workingHours.sameForAllDays}
                          onChange={(same) => {
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
                              for (const d of dayOptions) {
                                const existing = currentByDay[d]
                                byDay[d] = existing?.start && existing?.end
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
                          }}
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
                  </>
                )}

                {successMessage && <div className="success full-span employees-form-alert">{successMessage}</div>}
              </form>
              <div className="form-actions booking-side-panel-footer consultant-form-footer employees-form-popup-footer">
                <div className="employees-form-footer-left">
                  {editing && !selfService && !isEditingTenantOwner && canDeleteEmployees ? (
                    <button type="button" className="danger secondary employees-form-delete-btn" disabled={saving || deleting} onClick={() => void removeEditing()}>
                      <EmployeeFormIcon name="trash" />
                      {deleting ? t('employeesFormDeleting') : t('employeesFormDelete')}
                    </button>
                  ) : null}
                </div>
                {(!isConsultantsMobile || !editing || isFormDirty || saving) && (
                  <button form="consultant-edit-form" type="submit" className="gapp-primary-button" disabled={formPrimaryDisabled}>
                    <GuestConfigSaveIcon />
                    {formPrimaryLabel}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {employeeLimitDialog && (
        <div className="modal-backdrop employees-limit-backdrop" onClick={() => setEmployeeLimitDialog(null)}>
          <div className="modal employees-limit-modal" role="dialog" aria-modal="true" aria-labelledby="employees-limit-title" onClick={(e) => e.stopPropagation()}>
            <div className="employees-limit-icon" aria-hidden>
              <EmployeeFormIcon name="person" />
            </div>
            <h2 id="employees-limit-title">{employeeLimitTitle}</h2>
            <p>{employeeLimitText}</p>
            <div className="employees-limit-usage-card">
              <span>{locale === 'sl' ? 'Aktivni uporabniki' : 'Active users'}</span>
              <strong>{employeeLimitDialog.activeUsers} / {employeeLimitDialog.maxUsers ?? '∞'}</strong>
            </div>
            <div className="employees-limit-actions">
              <button type="button" className="secondary" onClick={() => setEmployeeLimitDialog(null)}>{employeeLimitCloseLabel}</button>
              <button type="button" className="gapp-primary-button" onClick={openSubscriptionSettings}>{employeeLimitButtonLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
