import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { api } from '../api'
import { Card, EmptyState } from '../components/ui'
import { EMPLOYEE_PERMISSION_ACTION_KEYS, type EmployeePermission } from '../lib/employeePermissions'
import { useLocale, type AppLocale } from '../locale'

type PermissionAction = typeof EMPLOYEE_PERMISSION_ACTION_KEYS[number]

type PermissionGroup = {
  key: string
  label: string
  description: string
}

type EmployeeRole = {
  id: string
  customRoleId?: number | null
  systemKey?: string | null
  system: boolean
  name: string
  description?: string | null
  permissions: string[]
  memberCount: number
}

type RoleMember = {
  id: number
  firstName: string
  lastName: string
  email: string
  role: 'ADMIN' | 'CONSULTANT' | string
  active: boolean
  accessRoleId?: number | null
  accessRoleName?: string | null
  tenantOwner?: boolean
}

type RoleMembersResponse = {
  roleId: string
  roleName: string
  members: RoleMember[]
}

type RoleMembersDialog = {
  role: EmployeeRole
  members: RoleMember[]
  loading: boolean
  error: string
}

type RolesOverview = {
  roles: EmployeeRole[]
  assignedUsers: number
  customRoles: number
  permissionGroups: PermissionGroup[]
}

const fallbackPermissionGroups: PermissionGroup[] = [
  { key: 'CALENDAR_BOOKINGS', label: 'Calendar & Bookings', description: 'View and manage calendar bookings, appointments and booking details' },
  { key: 'CLIENTS', label: 'Clients', description: 'View and manage client profiles, contact details and client history' },
  { key: 'EMPLOYEES', label: 'Employees', description: 'View and manage team members, employee profiles and assigned roles' },
  { key: 'ROLES_PERMISSIONS', label: 'Roles & Permissions', description: 'Create and manage custom roles and permission access' },
  { key: 'SERVICES', label: 'Services', description: 'View and manage services, durations, prices and public visibility' },
  { key: 'SPACES', label: 'Spaces', description: 'View and manage spaces, rooms, resources and their availability' },
  { key: 'COURSES', label: 'Courses', description: 'View and manage courses, participants, schedules and capacity' },
  { key: 'BILLING_INVOICES', label: 'Billing & Invoices', description: 'View and manage bills, invoices, advances and invoice statuses' },
  { key: 'ORDERS', label: 'Orders', description: 'View and manage guest app, widget and wallet product orders' },
  { key: 'WALLET_BENEFITS', label: 'Wallet / Benefits', description: 'View and manage benefits, entitlements, validity and QR access' },
  { key: 'INBOX_MESSAGES', label: 'Inbox / Messages', description: 'Read and manage guest and client message conversations' },
  { key: 'NOTIFICATIONS', label: 'Notifications', description: 'View and manage notification templates, rules and reminders' },
  { key: 'DELIVERY_LOGS', label: 'Delivery Logs', description: 'View and manage email, SMS and app message delivery logs' },
  { key: 'REPORTS_ANALYTICS', label: 'Reports & Analytics', description: 'View and manage reports, statistics and saved analytics views' },
  { key: 'SETTINGS', label: 'Settings', description: 'View and manage business, system and application settings' },
  { key: 'INTEGRATIONS', label: 'Integrations', description: 'View and manage third-party integrations and provider connections' },
  { key: 'WEBSITE_WIDGET', label: 'Website Widget', description: 'View and manage public booking widget settings and visibility' },
  { key: 'GUEST_MOBILE_APP', label: 'Guest Mobile App', description: 'View and manage guest mobile app settings, modules and content' },
  { key: 'PAYMENTS', label: 'Payments', description: 'View and manage payment records, payment status and refunds' },
  { key: 'SCANNER', label: 'Scanner', description: 'View and use QR scanning and guest check-in validation' },
]

const slPermissionGroups: Record<string, PermissionGroup> = {
  CALENDAR_BOOKINGS: { key: 'CALENDAR_BOOKINGS', label: 'Koledar in rezervacije', description: 'Pregled in upravljanje koledarskih rezervacij, terminov in podrobnosti rezervacij' },
  CLIENTS: { key: 'CLIENTS', label: 'Stranke', description: 'Pregled in upravljanje profilov strank, kontaktov in zgodovine strank' },
  EMPLOYEES: { key: 'EMPLOYEES', label: 'Zaposleni', description: 'Pregled in upravljanje zaposlenih, profilov zaposlenih in dodeljenih vlog' },
  ROLES_PERMISSIONS: { key: 'ROLES_PERMISSIONS', label: 'Vloge in dovoljenja', description: 'Ustvarjanje in upravljanje prilagojenih vlog ter dostopov' },
  SERVICES: { key: 'SERVICES', label: 'Storitve', description: 'Pregled in upravljanje storitev, trajanja, cen in javne vidnosti' },
  SPACES: { key: 'SPACES', label: 'Prostori', description: 'Pregled in upravljanje prostorov, sob, virov in njihove razpoložljivosti' },
  COURSES: { key: 'COURSES', label: 'Tečaji', description: 'Pregled in upravljanje tečajev, udeležencev, urnikov in kapacitet' },
  BILLING_INVOICES: { key: 'BILLING_INVOICES', label: 'Obračun in računi', description: 'Pregled in upravljanje računov, predplačil in statusov računov' },
  ORDERS: { key: 'ORDERS', label: 'Naročila', description: 'Pregled in upravljanje naročil iz aplikacije, vtičnika in denarnice' },
  WALLET_BENEFITS: { key: 'WALLET_BENEFITS', label: 'Denarnica / ugodnosti', description: 'Pregled in upravljanje ugodnosti, pravic, veljavnosti in QR dostopa' },
  INBOX_MESSAGES: { key: 'INBOX_MESSAGES', label: 'Prejeto / sporočila', description: 'Branje in upravljanje pogovorov s strankami in uporabniki' },
  NOTIFICATIONS: { key: 'NOTIFICATIONS', label: 'Obvestila', description: 'Pregled in upravljanje predlog, pravil in opomnikov za obvestila' },
  DELIVERY_LOGS: { key: 'DELIVERY_LOGS', label: 'Dnevniki pošiljanja', description: 'Pregled in upravljanje dnevnikov e-pošte, SMS in sporočil v aplikaciji' },
  REPORTS_ANALYTICS: { key: 'REPORTS_ANALYTICS', label: 'Poročila in analitika', description: 'Pregled in upravljanje poročil, statistik in shranjenih analitičnih pogledov' },
  SETTINGS: { key: 'SETTINGS', label: 'Nastavitve', description: 'Pregled in upravljanje poslovnih, sistemskih in aplikacijskih nastavitev' },
  INTEGRATIONS: { key: 'INTEGRATIONS', label: 'Integracije', description: 'Pregled in upravljanje zunanjih integracij in povezav s ponudniki' },
  WEBSITE_WIDGET: { key: 'WEBSITE_WIDGET', label: 'Spletni vtičnik', description: 'Pregled in upravljanje nastavitev ter vidnosti javnega naročanja' },
  GUEST_MOBILE_APP: { key: 'GUEST_MOBILE_APP', label: 'Mobilna aplikacija za stranke', description: 'Pregled in upravljanje nastavitev, modulov in vsebin mobilne aplikacije za stranke' },
  PAYMENTS: { key: 'PAYMENTS', label: 'Plačila', description: 'Pregled in upravljanje plačil, statusov plačil in vračil' },
  SCANNER: { key: 'SCANNER', label: 'Skener', description: 'Pregled in uporaba QR skeniranja ter potrjevanja prihodov' },
}

const roleCopy = {
  en: {
    loadError: 'Failed to load roles and permissions.',
    membersLoadError: 'Failed to load role members.',
    newRoleName: 'New custom role',
    newRoleDescription: 'Custom permissions for a specific team role.',
    createSuccess: 'Custom role created.',
    createError: 'Failed to create role.',
    duplicatePrefix: 'Copy of',
    duplicateSuccess: 'Role duplicated as a custom role.',
    duplicateError: 'Failed to duplicate role.',
    saveSuccess: 'Role saved.',
    saveError: 'Failed to save role.',
    archiveConfirm: (name: string) => `Archive role "${name}"?`,
    archiveSuccess: 'Role archived.',
    archiveError: 'Failed to archive role.',
    loading: 'Loading roles and permissions…',
    emptyTitle: 'No roles yet',
    emptyText: 'Create a role to start configuring permissions.',
    statsAria: 'Roles summary',
    roles: 'Roles',
    usersAssigned: 'Users assigned',
    customRoles: 'Custom roles',
    rolesSectionAria: 'Roles',
    newRole: 'New role',
    showingRoles: (count: number) => `Showing ${count} of ${count} roles`,
    selectedRoleAria: 'Selected role permissions',
    systemRole: 'System role',
    customRole: 'Custom role',
    editCustomRole: 'Edit custom role',
    roleName: 'Role name',
    description: 'Description',
    duplicateRole: 'Duplicate role',
    archiveRole: 'Archive role',
    saveChanges: 'Save changes',
    systemArchiveTitle: 'System roles cannot be archived.',
    systemSaveTitle: 'Duplicate a system role to customize it.',
    viewRequiredTitle: 'View permission must be enabled before this action can be selected.',
    permissionGroup: 'Permission group',
    all: 'All',
    detailFoot: 'Changes to permissions will be applied to all users assigned to this custom role.',
    assignedUsersEyebrow: 'Assigned users',
    closeMembers: 'Close members list',
    loadingMembers: 'Loading members…',
    noMembers: 'No users are attached to this role.',
    owner: 'Owner',
    active: 'Active',
    inactive: 'Inactive',
    administrator: 'Administrator',
    consultant: 'Consultant',
    system: 'System',
    custom: 'Custom',
    member: (count: number) => `${count} ${count === 1 ? 'member' : 'members'}`,
    userFallback: (id: number) => `User #${id}`,
    systemAdministratorDescription: 'Full system access with all permissions across the platform.',
    actionLabel: (action: PermissionAction) => action.toLowerCase().replace(/^./, (char) => char.toUpperCase()),
  },
  sl: {
    loadError: 'Vlog in dovoljenj ni bilo mogoče naložiti.',
    membersLoadError: 'Uporabnikov za to vlogo ni bilo mogoče naložiti.',
    newRoleName: 'Nova prilagojena vloga',
    newRoleDescription: 'Prilagojena dovoljenja za izbrano vlogo v ekipi.',
    createSuccess: 'Prilagojena vloga je ustvarjena.',
    createError: 'Vloge ni bilo mogoče ustvariti.',
    duplicatePrefix: 'Kopija vloge',
    duplicateSuccess: 'Vloga je podvojena kot prilagojena vloga.',
    duplicateError: 'Vloge ni bilo mogoče podvojiti.',
    saveSuccess: 'Vloga je shranjena.',
    saveError: 'Vloge ni bilo mogoče shraniti.',
    archiveConfirm: (name: string) => `Arhiviram vlogo »${name}«?`,
    archiveSuccess: 'Vloga je arhivirana.',
    archiveError: 'Vloge ni bilo mogoče arhivirati.',
    loading: 'Nalaganje vlog in dovoljenj …',
    emptyTitle: 'Ni še vlog',
    emptyText: 'Ustvarite vlogo in začnite nastavljati dovoljenja.',
    statsAria: 'Povzetek vlog',
    roles: 'Vloge',
    usersAssigned: 'Dodeljeni uporabniki',
    customRoles: 'Prilagojene vloge',
    rolesSectionAria: 'Vloge',
    newRole: 'Nova vloga',
    showingRoles: (count: number) => `Prikazano ${count} od ${count} vlog`,
    selectedRoleAria: 'Dovoljenja izbrane vloge',
    systemRole: 'Sistemska vloga',
    customRole: 'Prilagojena vloga',
    editCustomRole: 'Uredi prilagojeno vlogo',
    roleName: 'Ime vloge',
    description: 'Opis',
    duplicateRole: 'Podvoji vlogo',
    archiveRole: 'Arhiviraj vlogo',
    saveChanges: 'Shrani spremembe',
    systemArchiveTitle: 'Sistemskih vlog ni mogoče arhivirati.',
    systemSaveTitle: 'Za prilagoditev sistemsko vlogo najprej podvojite.',
    viewRequiredTitle: 'Najprej mora biti omogočen ogled, šele nato lahko izberete to dovoljenje.',
    permissionGroup: 'Skupina dovoljenj',
    all: 'Vse',
    detailFoot: 'Spremembe dovoljenj bodo uporabljene za vse uporabnike, ki so dodeljeni tej prilagojeni vlogi.',
    assignedUsersEyebrow: 'Dodeljeni uporabniki',
    closeMembers: 'Zapri seznam uporabnikov',
    loadingMembers: 'Nalaganje uporabnikov …',
    noMembers: 'Na to vlogo ni vezanih uporabnikov.',
    owner: 'Lastnik',
    active: 'Aktiven',
    inactive: 'Neaktiven',
    administrator: 'Administrator',
    consultant: 'Zaposleni',
    system: 'Sistemska',
    custom: 'Prilagojena',
    member: (count: number) => {
      const n = Math.abs(count) % 100
      const last = n % 10
      if (n >= 11 && n <= 14) return `${count} uporabnikov`
      if (last === 1) return `${count} uporabnik`
      if (last === 2) return `${count} uporabnika`
      if (last === 3 || last === 4) return `${count} uporabniki`
      return `${count} uporabnikov`
    },
    userFallback: (id: number) => `Uporabnik #${id}`,
    systemAdministratorDescription: 'Poln sistemski dostop z vsemi dovoljenji v platformi.',
    actionLabel: (action: PermissionAction) => {
      if (action === 'VIEW') return 'Ogled'
      if (action === 'CREATE') return 'Ustvari'
      if (action === 'EDIT') return 'Uredi'
      if (action === 'DELETE') return 'Izbriši'
      return action
    },
  },
}


function roleCopyForLocale(locale: AppLocale) {
  return roleCopy[locale === 'sr' ? 'sl' : locale]
}

function RolePermissionIcon({ name }: { name: 'shield' | 'group' | 'calendar' | 'client' | 'employee' | 'billing' | 'wallet' | 'reports' | 'settings' | 'integrations' | 'platform' | 'copy' | 'archive' | 'save' | 'plus' | 'info' }) {
  if (name === 'shield') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5 19 6v5.3c0 4.4-2.8 7.9-7 9.2-4.2-1.3-7-4.8-7-9.2V6l7-2.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'copy') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 8.5h9.5V18H8V8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M6 15.5H4.5A1.5 1.5 0 0 1 3 14V5.5A1.5 1.5 0 0 1 4.5 4H13a1.5 1.5 0 0 1 1.5 1.5V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'archive') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m2.5 0-.7 11A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-2L6.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'save') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 4h11l3 3v13H5V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 4v6h7V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'plus') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'info') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 11.5V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 8h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function groupIconName(key: string): Parameters<typeof RolePermissionIcon>[0]['name'] {
  if (key === 'CALENDAR_BOOKINGS') return 'calendar'
  if (key === 'CLIENTS') return 'client'
  if (key === 'EMPLOYEES') return 'employee'
  if (key === 'ROLES_PERMISSIONS') return 'shield'
  if (key === 'SERVICES') return 'platform'
  if (key === 'SPACES') return 'platform'
  if (key === 'COURSES') return 'platform'
  if (key === 'BILLING_INVOICES') return 'billing'
  if (key === 'ORDERS') return 'billing'
  if (key === 'WALLET_BENEFITS') return 'wallet'
  if (key === 'INBOX_MESSAGES') return 'group'
  if (key === 'NOTIFICATIONS') return 'info'
  if (key === 'DELIVERY_LOGS') return 'reports'
  if (key === 'REPORTS_ANALYTICS') return 'reports'
  if (key === 'SETTINGS') return 'settings'
  if (key === 'INTEGRATIONS') return 'integrations'
  if (key === 'WEBSITE_WIDGET') return 'platform'
  if (key === 'GUEST_MOBILE_APP') return 'platform'
  if (key === 'PAYMENTS') return 'billing'
  if (key === 'SCANNER') return 'wallet'
  return 'group'
}

function permissionKey(groupKey: string, action: PermissionAction): EmployeePermission {
  return `${groupKey}_${action}` as EmployeePermission
}

function sortRoles(roles: EmployeeRole[]): EmployeeRole[] {
  const systemOrder = ['ADMINISTRATOR']
  return [...roles].sort((a, b) => {
    if (a.system && b.system) return systemOrder.indexOf(a.systemKey || '') - systemOrder.indexOf(b.systemKey || '')
    if (a.system !== b.system) return a.system ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function localizePermissionGroup(group: PermissionGroup, locale: AppLocale): PermissionGroup {
  if (locale !== 'sl') return group
  return slPermissionGroups[group.key] ?? group
}

function memberLabel(count: number, locale: AppLocale) {
  return roleCopyForLocale(locale).member(count)
}

function memberName(member: RoleMember, locale: AppLocale) {
  const name = `${member.firstName || ''} ${member.lastName || ''}`.trim()
  return name || member.email || roleCopyForLocale(locale).userFallback(member.id)
}

function memberInitials(member: RoleMember) {
  const first = (member.firstName || member.email || '?').trim()[0] || '?'
  const last = (member.lastName || '').trim()[0] || ''
  return `${first}${last}`.toUpperCase()
}

function memberRoleLabel(member: RoleMember, locale: AppLocale) {
  if (member.accessRoleName) return member.accessRoleName
  return member.role === 'ADMIN' ? roleCopyForLocale(locale).administrator : roleCopyForLocale(locale).consultant
}

function roleDisplayName(role: EmployeeRole, locale: AppLocale) {
  if (role.systemKey === 'ADMINISTRATOR') return roleCopyForLocale(locale).administrator
  return role.name
}

function roleDisplayDescription(role: EmployeeRole, locale: AppLocale) {
  if (role.systemKey === 'ADMINISTRATOR') return roleCopyForLocale(locale).systemAdministratorDescription
  return role.description
}

export function EmployeeRolesPermissionsTab() {
  const { locale } = useLocale()
  const copy = roleCopyForLocale(locale)
  const [overview, setOverview] = useState<RolesOverview | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftPermissions, setDraftPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [membersDialog, setMembersDialog] = useState<RoleMembersDialog | null>(null)
  const [expandedPermissionGroup, setExpandedPermissionGroup] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const roles = useMemo(() => sortRoles(overview?.roles ?? []), [overview])
  const permissionGroups = useMemo(
    () => (overview?.permissionGroups?.length ? overview.permissionGroups : fallbackPermissionGroups).map((group) => localizePermissionGroup(group, locale)),
    [locale, overview?.permissionGroups],
  )
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null
  const permissionSet = useMemo(() => new Set(draftPermissions), [draftPermissions])

  const roleCount = roles.length
  const assignedUsers = overview?.assignedUsers ?? roles.reduce((sum, role) => sum + Number(role.memberCount || 0), 0)
  const customRoleCount = overview?.customRoles ?? roles.filter((role) => !role.system).length
  const customRoleDirty = !!selectedRole && !selectedRole.system && (
    draftName.trim() !== selectedRole.name ||
    draftDescription.trim() !== (selectedRole.description ?? '') ||
    matrixPermissionsOnly(draftPermissions).sort().join('|') !== matrixPermissionsOnly(selectedRole.permissions).sort().join('|')
  )

  async function loadRoles(preferredRoleId?: string) {
    setLoading(true)
    setErrorMessage('')
    try {
      const { data } = await api.get<RolesOverview>('/employee-roles')
      const nextRoles = sortRoles(data.roles ?? [])
      setOverview({ ...data, roles: nextRoles })
      const nextSelected = preferredRoleId && nextRoles.some((role) => role.id === preferredRoleId)
        ? preferredRoleId
        : selectedRoleId && nextRoles.some((role) => role.id === selectedRoleId)
          ? selectedRoleId
          : nextRoles[0]?.id ?? ''
      setSelectedRoleId(nextSelected)
      const role = nextRoles.find((item) => item.id === nextSelected) ?? nextRoles[0]
      if (role) syncDraft(role)
    } catch (error: any) {
      console.error('Failed to load employee roles', error)
      setErrorMessage(error?.response?.data?.message || copy.loadError)
    } finally {
      setLoading(false)
    }
  }

  function syncDraft(role: EmployeeRole) {
    setDraftName(role.name)
    setDraftDescription(role.description ?? '')
    setDraftPermissions(enforceViewDependenciesForDraft(role.permissions))
  }

  useEffect(() => {
    void loadRoles()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial role load only
  }, [])

  useEffect(() => {
    if (selectedRole) syncDraft(selectedRole)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected role switches should reset the editor draft
  }, [selectedRoleId])

  function visibleMatrixPermissionKeys() {
    return new Set(
      permissionGroups.flatMap((group) =>
        EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => permissionKey(group.key, action)),
      ),
    )
  }

  function matrixPermissionsOnly(permissions: string[]) {
    const matrixKeys = visibleMatrixPermissionKeys()
    return permissions.filter((permission) => matrixKeys.has(permission as EmployeePermission))
  }

  function enforceViewDependenciesForDraft(permissions: string[]) {
    // Preserve permissions for currently hidden module groups. The matrix only edits
    // visible groups, so disabling a module in App settings hides it here without
    // silently deleting saved role permissions that may be needed again if the module is re-enabled.
    const values = new Set(permissions)
    permissionGroups.forEach((group) => {
      const viewKey = permissionKey(group.key, 'VIEW')
      if (values.has(viewKey)) return
      values.delete(permissionKey(group.key, 'CREATE'))
      values.delete(permissionKey(group.key, 'EDIT'))
      values.delete(permissionKey(group.key, 'DELETE'))
    })
    return Array.from(values)
  }

  function togglePermission(groupKey: string, action: PermissionAction) {
    if (!selectedRole || selectedRole.system) return
    const key = permissionKey(groupKey, action)
    const viewKey = permissionKey(groupKey, 'VIEW')
    setDraftPermissions((current) => {
      const next = new Set(enforceViewDependenciesForDraft(current))
      const checked = next.has(key)

      if (action === 'VIEW') {
        if (checked) {
          next.delete(viewKey)
          next.delete(permissionKey(groupKey, 'CREATE'))
          next.delete(permissionKey(groupKey, 'EDIT'))
          next.delete(permissionKey(groupKey, 'DELETE'))
        } else {
          next.add(viewKey)
        }
        return enforceViewDependenciesForDraft(Array.from(next))
      }

      if (!next.has(viewKey)) return current
      if (checked) next.delete(key)
      else next.add(key)
      return enforceViewDependenciesForDraft(Array.from(next))
    })
  }


  function togglePermissionGroup(groupKey: string) {
    if (!selectedRole || selectedRole.system) return
    const groupPermissionKeys = EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => permissionKey(groupKey, action))
    setDraftPermissions((current) => {
      const next = new Set(enforceViewDependenciesForDraft(current))
      const allSelected = groupPermissionKeys.every((key) => next.has(key))

      groupPermissionKeys.forEach((key) => {
        if (allSelected) next.delete(key)
        else next.add(key)
      })

      return enforceViewDependenciesForDraft(Array.from(next))
    })
  }

  function toggleExpandedPermissionGroup(groupKey: string) {
    setExpandedPermissionGroup((current) => current === groupKey ? null : groupKey)
  }

  function selectRoleByKeyboard(event: KeyboardEvent<HTMLDivElement>, roleId: string) {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setSelectedRoleId(roleId)
  }

  async function openMembersDialog(role: EmployeeRole) {
    setMembersDialog({ role, members: [], loading: true, error: '' })
    try {
      const { data } = await api.get<RoleMembersResponse>(`/employee-roles/${encodeURIComponent(role.id)}/members`)
      setMembersDialog({ role, members: data.members ?? [], loading: false, error: '' })
    } catch (error: any) {
      setMembersDialog({
        role,
        members: [],
        loading: false,
        error: error?.response?.data?.message || copy.membersLoadError,
      })
    }
  }

  async function createNewRole() {
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { data } = await api.post<EmployeeRole>('/employee-roles', {
        name: copy.newRoleName,
        description: copy.newRoleDescription,
        permissions: ['CALENDAR_BOOKINGS_VIEW', 'CLIENTS_VIEW'],
      })
      setSuccessMessage(copy.createSuccess)
      await loadRoles(data.id)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || copy.createError)
    } finally {
      setSaving(false)
    }
  }

  async function duplicateSelectedRole() {
    if (!selectedRole) return
    setDuplicating(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { data } = await api.post<EmployeeRole>('/employee-roles/duplicate', {
        sourceRoleId: selectedRole.id,
        name: `${copy.duplicatePrefix} ${roleDisplayName(selectedRole, locale)}`,
      })
      setSuccessMessage(copy.duplicateSuccess)
      await loadRoles(data.id)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || copy.duplicateError)
    } finally {
      setDuplicating(false)
    }
  }

  async function saveSelectedRole() {
    if (!selectedRole || selectedRole.system || !selectedRole.customRoleId) return
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { data } = await api.put<EmployeeRole>(`/employee-roles/custom/${selectedRole.customRoleId}`, {
        name: draftName,
        description: draftDescription,
        permissions: enforceViewDependenciesForDraft(draftPermissions),
      })
      setSuccessMessage(copy.saveSuccess)
      await loadRoles(data.id)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  async function archiveSelectedRole() {
    if (!selectedRole || selectedRole.system || !selectedRole.customRoleId) return
    const confirmed = window.confirm(copy.archiveConfirm(roleDisplayName(selectedRole, locale)))
    if (!confirmed) return
    setArchiving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await api.delete(`/employee-roles/custom/${selectedRole.customRoleId}`)
      setSuccessMessage(copy.archiveSuccess)
      await loadRoles()
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || copy.archiveError)
    } finally {
      setArchiving(false)
    }
  }

  if (loading && !overview) {
    return <Card className="employee-roles-card"><div className="muted">{copy.loading}</div></Card>
  }

  if (!loading && roles.length === 0) {
    return (
      <Card className="employee-roles-card">
        <EmptyState title={copy.emptyTitle} text={copy.emptyText} />
      </Card>
    )
  }

  return (
    <div className="employee-roles-page">
      <div className="employee-roles-stats" aria-label={copy.statsAria}>
        <div className="employee-roles-stat-card">
          <span className="employee-roles-stat-icon employee-roles-stat-icon--blue"><RolePermissionIcon name="group" /></span>
          <div><strong>{roleCount}</strong><span>{copy.roles}</span></div>
        </div>
        <div className="employee-roles-stat-card">
          <span className="employee-roles-stat-icon employee-roles-stat-icon--green"><RolePermissionIcon name="group" /></span>
          <div><strong>{assignedUsers}</strong><span>{copy.usersAssigned}</span></div>
        </div>
        <div className="employee-roles-stat-card">
          <span className="employee-roles-stat-icon employee-roles-stat-icon--purple"><RolePermissionIcon name="settings" /></span>
          <div><strong>{customRoleCount}</strong><span>{copy.customRoles}</span></div>
        </div>
      </div>

      {(errorMessage || successMessage) && (
        <div className={`employee-roles-alert ${errorMessage ? 'employee-roles-alert--error' : 'employee-roles-alert--success'}`}>
          {errorMessage || successMessage}
        </div>
      )}

      <div className="employee-roles-layout">
        <section className="employee-roles-list-card" aria-label={copy.rolesSectionAria}>
          <div className="employee-roles-list-head">
            <h2>{copy.roles}</h2>
            <button type="button" className="employee-roles-primary-mini" onClick={() => void createNewRole()} disabled={saving}>
              <RolePermissionIcon name="plus" />
              {copy.newRole}
            </button>
          </div>
          <div className="employee-roles-list">
            {roles.map((role) => (
              <div
                key={role.id}
                className={`employee-roles-list-item${role.id === selectedRole?.id ? ' employee-roles-list-item--active' : ''}`}
                onClick={() => setSelectedRoleId(role.id)}
                onKeyDown={(event) => selectRoleByKeyboard(event, role.id)}
                role="button"
                tabIndex={0}
              >
                <span className={`employee-roles-list-icon employee-roles-list-icon--${role.system ? role.systemKey?.toLowerCase() || 'system' : 'custom'}`}>
                  <RolePermissionIcon name={role.systemKey === 'ADMINISTRATOR' ? 'shield' : 'group'} />
                </span>
                <span className="employee-roles-list-copy">
                  <strong>{roleDisplayName(role, locale)}</strong>
                  <button
                    type="button"
                    className="employee-roles-member-link"
                    onClick={(event) => {
                      event.stopPropagation()
                      void openMembersDialog(role)
                    }}
                  >
                    {memberLabel(role.memberCount, locale)}
                  </button>
                </span>
                <span className={`employee-roles-role-type ${role.system ? 'employee-roles-role-type--system' : 'employee-roles-role-type--custom'}`}>
                  {role.system ? copy.system : copy.custom}
                </span>
              </div>
            ))}
          </div>
          <p className="employee-roles-list-foot">{copy.showingRoles(roles.length)}</p>
        </section>

        {selectedRole && (
          <section className="employee-roles-detail-card" aria-label={copy.selectedRoleAria}>
            <div className="employee-roles-detail-head">
              <div className="employee-roles-title-block">
                <span className="employee-roles-title-icon"><RolePermissionIcon name={selectedRole.systemKey === 'ADMINISTRATOR' ? 'shield' : 'group'} /></span>
                <div className="employee-roles-title-copy">
                  {selectedRole.system ? (
                    <>
                      <div className="employee-roles-title-row"><h2>{roleDisplayName(selectedRole, locale)}</h2><span className="employee-roles-badge employee-roles-badge--system">{copy.systemRole}</span></div>
                      <p>{roleDisplayDescription(selectedRole, locale)}</p>
                    </>
                  ) : (
                    <div className="employee-roles-custom-fields">
                      <div className="employee-roles-title-row"><h2>{copy.editCustomRole}</h2><span className="employee-roles-badge employee-roles-badge--custom">{copy.customRole}</span></div>
                      <label>
                        <span>{copy.roleName}</span>
                        <input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={120} />
                      </label>
                      <label>
                        <span>{copy.description}</span>
                        <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={500} />
                      </label>
                    </div>
                  )}
                  <button type="button" className="employee-roles-member-line employee-roles-member-line--button" onClick={() => void openMembersDialog(selectedRole)}>
                    <RolePermissionIcon name="group" /> {memberLabel(selectedRole.memberCount, locale)}
                  </button>
                </div>
              </div>
              <div className="employee-roles-actions">
                <button type="button" className="employee-roles-secondary-btn" onClick={() => void duplicateSelectedRole()} disabled={duplicating}>
                  <RolePermissionIcon name="copy" />
                  {copy.duplicateRole}
                </button>
                <button type="button" className="employee-roles-danger-btn" onClick={() => void archiveSelectedRole()} disabled={selectedRole.system || archiving} title={selectedRole.system ? copy.systemArchiveTitle : undefined}>
                  <RolePermissionIcon name="archive" />
                  {copy.archiveRole}
                </button>
                <button type="button" className="employee-roles-primary-btn" onClick={() => void saveSelectedRole()} disabled={selectedRole.system || saving || !customRoleDirty} title={selectedRole.system ? copy.systemSaveTitle : undefined}>
                  <RolePermissionIcon name="save" />
                  {copy.saveChanges}
                </button>
              </div>
            </div>

            <div className="employee-roles-matrix-wrap">
              <table className="employee-roles-matrix">
                <thead>
                  <tr>
                    <th>{copy.permissionGroup}</th>
                    <th className="employee-roles-all-column">{copy.all}</th>
                    {EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => <th key={action}>{copy.actionLabel(action)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {permissionGroups.map((group) => (
                    <tr key={group.key}>
                      <td>
                        <div className="employee-roles-group-cell">
                          <span className={`employee-roles-group-icon employee-roles-group-icon--${group.key.toLowerCase().replace(/_/g, '-')}`}><RolePermissionIcon name={groupIconName(group.key)} /></span>
                          <div><strong>{group.label}</strong><span>{group.description}</span></div>
                        </div>
                      </td>
                      <td className="employee-roles-all-column">
                        {(() => {
                          const groupPermissionKeys = EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => permissionKey(group.key, action))
                          const allChecked = groupPermissionKeys.every((key) => permissionSet.has(key))
                          const someChecked = groupPermissionKeys.some((key) => permissionSet.has(key))
                          return (
                            <label className={`employee-roles-check employee-roles-check--all${allChecked ? ' employee-roles-check--checked' : ''}${someChecked && !allChecked ? ' employee-roles-check--partial' : ''}${selectedRole.system ? ' employee-roles-check--disabled' : ''}`}>
                              <input
                                type="checkbox"
                                checked={allChecked}
                                disabled={selectedRole.system}
                                onChange={() => togglePermissionGroup(group.key)}
                                aria-label={`${group.label} ${copy.all}`}
                              />
                              <span aria-hidden>{allChecked ? '✓' : someChecked ? '•' : '—'}</span>
                            </label>
                          )
                        })()}
                      </td>
                      {EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => {
                        const key = permissionKey(group.key, action)
                        const checked = permissionSet.has(key)
                        const viewChecked = permissionSet.has(permissionKey(group.key, 'VIEW'))
                        const disabled = !!selectedRole.system || (action !== 'VIEW' && !viewChecked)
                        return (
                          <td key={key}>
                            <label
                              className={`employee-roles-check${checked ? ' employee-roles-check--checked' : ''}${disabled ? ' employee-roles-check--disabled' : ''}`}
                              title={action !== 'VIEW' && !viewChecked ? copy.viewRequiredTitle : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => togglePermission(group.key, action)}
                                aria-label={`${group.label} ${copy.actionLabel(action)}`}
                              />
                              <span aria-hidden>{checked ? '✓' : '—'}</span>
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="employee-roles-mobile-permissions" aria-label={copy.permissionGroup}>
              {permissionGroups.map((group) => {
                const groupPermissionKeys = EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => permissionKey(group.key, action))
                const allChecked = groupPermissionKeys.every((key) => permissionSet.has(key))
                const someChecked = groupPermissionKeys.some((key) => permissionSet.has(key))
                const isExpanded = expandedPermissionGroup === group.key

                return (
                  <article key={group.key} className={`employee-roles-mobile-group${isExpanded ? ' employee-roles-mobile-group--expanded' : ''}`}>
                    <div className="employee-roles-mobile-group-summary">
                      <div className="employee-roles-group-cell employee-roles-mobile-group-cell">
                        <span className={`employee-roles-group-icon employee-roles-group-icon--${group.key.toLowerCase().replace(/_/g, '-')}`}><RolePermissionIcon name={groupIconName(group.key)} /></span>
                        <div><strong>{group.label}</strong><span>{group.description}</span></div>
                      </div>

                      <div className="employee-roles-mobile-group-actions">
                        <label className={`employee-roles-mobile-all-toggle employee-roles-check employee-roles-check--all${allChecked ? ' employee-roles-check--checked' : ''}${someChecked && !allChecked ? ' employee-roles-check--partial' : ''}${selectedRole.system ? ' employee-roles-check--disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            disabled={selectedRole.system}
                            onChange={() => togglePermissionGroup(group.key)}
                            aria-label={`${group.label} ${copy.all}`}
                          />
                          <span aria-hidden>{allChecked ? '✓' : someChecked ? '•' : '—'}</span>
                        </label>
                        <span className="employee-roles-mobile-all-label">{copy.all}</span>
                        <button
                          type="button"
                          className={`employee-roles-mobile-expand-btn${isExpanded ? ' employee-roles-mobile-expand-btn--expanded' : ''}`}
                          onClick={() => toggleExpandedPermissionGroup(group.key)}
                          aria-expanded={isExpanded}
                          aria-controls={`employee-roles-mobile-panel-${group.key}`}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="employee-roles-mobile-group-panel" id={`employee-roles-mobile-panel-${group.key}`}>
                        {EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => {
                          const key = permissionKey(group.key, action)
                          const checked = permissionSet.has(key)
                          const viewChecked = permissionSet.has(permissionKey(group.key, 'VIEW'))
                          const disabled = !!selectedRole.system || (action !== 'VIEW' && !viewChecked)
                          return (
                            <label
                              key={key}
                              className={`employee-roles-mobile-action${disabled ? ' employee-roles-mobile-action--disabled' : ''}`}
                              title={action !== 'VIEW' && !viewChecked ? copy.viewRequiredTitle : undefined}
                            >
                              <span className={`employee-roles-check${checked ? ' employee-roles-check--checked' : ''}${disabled ? ' employee-roles-check--disabled' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => togglePermission(group.key, action)}
                                  aria-label={`${group.label} ${copy.actionLabel(action)}`}
                                />
                                <span aria-hidden>{checked ? '✓' : '—'}</span>
                              </span>
                              <em>{copy.actionLabel(action)}</em>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
            <div className="employee-roles-detail-foot"><RolePermissionIcon name="info" /> {copy.detailFoot}</div>
          </section>
        )}
      </div>

      {membersDialog && (
        <div className="modal-backdrop employee-roles-members-backdrop" onClick={() => setMembersDialog(null)}>
          <div className="employee-roles-members-modal" role="dialog" aria-modal="true" aria-labelledby="employee-role-members-title" onClick={(event) => event.stopPropagation()}>
            <div className="employee-roles-members-head">
              <div>
                <span className="employee-roles-members-eyebrow">{copy.assignedUsersEyebrow}</span>
                <h2 id="employee-role-members-title">{roleDisplayName(membersDialog.role, locale)}</h2>
                <p>{memberLabel(membersDialog.members.length || membersDialog.role.memberCount, locale)}</p>
              </div>
              <button type="button" className="employee-roles-members-close" onClick={() => setMembersDialog(null)} aria-label={copy.closeMembers}>×</button>
            </div>

            {membersDialog.loading ? (
              <div className="employee-roles-members-state">{copy.loadingMembers}</div>
            ) : membersDialog.error ? (
              <div className="employee-roles-alert employee-roles-alert--error">{membersDialog.error}</div>
            ) : membersDialog.members.length === 0 ? (
              <div className="employee-roles-members-state">{copy.noMembers}</div>
            ) : (
              <div className="employee-roles-members-list">
                {membersDialog.members.map((member) => (
                  <article key={member.id} className="employee-roles-member-card">
                    <span className="employee-roles-member-avatar" aria-hidden>{memberInitials(member)}</span>
                    <div className="employee-roles-member-copy">
                      <strong>{memberName(member, locale)}</strong>
                      <span>{member.email}</span>
                    </div>
                    <div className="employee-roles-member-badges">
                      {member.tenantOwner && <span className="employee-roles-member-badge employee-roles-member-badge--owner">{copy.owner}</span>}
                      <span className="employee-roles-member-badge">{memberRoleLabel(member, locale)}</span>
                      <span className={`employee-roles-member-badge ${member.active ? 'employee-roles-member-badge--active' : 'employee-roles-member-badge--inactive'}`}>
                        {member.active ? copy.active : copy.inactive}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

