import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { api } from '../api'
import { Card, EmptyState } from '../components/ui'
import { EMPLOYEE_PERMISSION_ACTION_KEYS, type EmployeePermission } from '../lib/employeePermissions'

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
  { key: 'CALENDAR_BOOKINGS', label: 'Calendar & Bookings', description: 'Manage appointments, availability and resources' },
  { key: 'CLIENTS', label: 'Clients', description: 'View and manage client profiles and data' },
  { key: 'EMPLOYEES', label: 'Employees', description: 'Manage team members and their access' },
  { key: 'BILLING', label: 'Billing', description: 'Invoices, payments, subscriptions and refunds' },
  { key: 'WALLET', label: 'Wallet', description: 'Manage wallet transactions and balances' },
  { key: 'REPORTS', label: 'Reports', description: 'View reports and analytics' },
  { key: 'SETTINGS', label: 'Settings', description: 'Configure system, business and preferences' },
  { key: 'INTEGRATIONS', label: 'Integrations', description: 'Manage third-party integrations and APIs' },
  { key: 'PLATFORM_FEATURES', label: 'Platform features', description: 'Access platform tools and advanced features' },
]

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
  if (key === 'BILLING') return 'billing'
  if (key === 'WALLET') return 'wallet'
  if (key === 'REPORTS') return 'reports'
  if (key === 'SETTINGS') return 'settings'
  if (key === 'INTEGRATIONS') return 'integrations'
  if (key === 'PLATFORM_FEATURES') return 'platform'
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

function memberLabel(count: number) {
  return `${count} ${count === 1 ? 'member' : 'members'}`
}

function memberName(member: RoleMember) {
  const name = `${member.firstName || ''} ${member.lastName || ''}`.trim()
  return name || member.email || `User #${member.id}`
}

function memberInitials(member: RoleMember) {
  const first = (member.firstName || member.email || '?').trim()[0] || '?'
  const last = (member.lastName || '').trim()[0] || ''
  return `${first}${last}`.toUpperCase()
}

function memberRoleLabel(member: RoleMember) {
  if (member.accessRoleName) return member.accessRoleName
  return member.role === 'ADMIN' ? 'Administrator' : 'Consultant'
}

export function EmployeeRolesPermissionsTab() {
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
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const roles = useMemo(() => sortRoles(overview?.roles ?? []), [overview])
  const permissionGroups = overview?.permissionGroups?.length ? overview.permissionGroups : fallbackPermissionGroups
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
      setErrorMessage(error?.response?.data?.message || 'Failed to load roles and permissions.')
    } finally {
      setLoading(false)
    }
  }

  function syncDraft(role: EmployeeRole) {
    setDraftName(role.name)
    setDraftDescription(role.description ?? '')
    setDraftPermissions(matrixPermissionsOnly(role.permissions))
  }

  useEffect(() => {
    void loadRoles()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial role load only
  }, [])

  useEffect(() => {
    if (selectedRole) syncDraft(selectedRole)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected role switches should reset the editor draft
  }, [selectedRoleId])

  function matrixPermissionsOnly(permissions: string[]) {
    const matrixKeys = new Set(permissionGroups.flatMap((group) => EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => permissionKey(group.key, action))))
    return permissions.filter((permission) => matrixKeys.has(permission as EmployeePermission))
  }

  function togglePermission(groupKey: string, action: PermissionAction) {
    if (!selectedRole || selectedRole.system) return
    const key = permissionKey(groupKey, action)
    setDraftPermissions((current) => current.includes(key)
      ? current.filter((permission) => permission !== key)
      : [...current, key])
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
        error: error?.response?.data?.message || 'Failed to load role members.',
      })
    }
  }

  async function createNewRole() {
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { data } = await api.post<EmployeeRole>('/employee-roles', {
        name: 'New custom role',
        description: 'Custom permissions for a specific team role.',
        permissions: ['CALENDAR_BOOKINGS_VIEW', 'CLIENTS_VIEW'],
      })
      setSuccessMessage('Custom role created.')
      await loadRoles(data.id)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to create role.')
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
        name: `Copy of ${selectedRole.name}`,
      })
      setSuccessMessage('Role duplicated as a custom role.')
      await loadRoles(data.id)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to duplicate role.')
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
        permissions: draftPermissions,
      })
      setSuccessMessage('Role saved.')
      await loadRoles(data.id)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to save role.')
    } finally {
      setSaving(false)
    }
  }

  async function archiveSelectedRole() {
    if (!selectedRole || selectedRole.system || !selectedRole.customRoleId) return
    const confirmed = window.confirm(`Archive role "${selectedRole.name}"?`)
    if (!confirmed) return
    setArchiving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await api.delete(`/employee-roles/custom/${selectedRole.customRoleId}`)
      setSuccessMessage('Role archived.')
      await loadRoles()
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to archive role.')
    } finally {
      setArchiving(false)
    }
  }

  if (loading && !overview) {
    return <Card className="employee-roles-card"><div className="muted">Loading roles and permissions…</div></Card>
  }

  if (!loading && roles.length === 0) {
    return (
      <Card className="employee-roles-card">
        <EmptyState title="No roles yet" text="Create a role to start configuring permissions." />
      </Card>
    )
  }

  return (
    <div className="employee-roles-page">
      <div className="employee-roles-stats" aria-label="Roles summary">
        <div className="employee-roles-stat-card">
          <span className="employee-roles-stat-icon employee-roles-stat-icon--blue"><RolePermissionIcon name="group" /></span>
          <div><strong>{roleCount}</strong><span>Roles</span></div>
        </div>
        <div className="employee-roles-stat-card">
          <span className="employee-roles-stat-icon employee-roles-stat-icon--green"><RolePermissionIcon name="group" /></span>
          <div><strong>{assignedUsers}</strong><span>Users assigned</span></div>
        </div>
        <div className="employee-roles-stat-card">
          <span className="employee-roles-stat-icon employee-roles-stat-icon--purple"><RolePermissionIcon name="settings" /></span>
          <div><strong>{customRoleCount}</strong><span>Custom roles</span></div>
        </div>
      </div>

      {(errorMessage || successMessage) && (
        <div className={`employee-roles-alert ${errorMessage ? 'employee-roles-alert--error' : 'employee-roles-alert--success'}`}>
          {errorMessage || successMessage}
        </div>
      )}

      <div className="employee-roles-layout">
        <section className="employee-roles-list-card" aria-label="Roles">
          <div className="employee-roles-list-head">
            <h2>Roles</h2>
            <button type="button" className="employee-roles-primary-mini" onClick={() => void createNewRole()} disabled={saving}>
              <RolePermissionIcon name="plus" />
              New role
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
                  <strong>{role.name}</strong>
                  <button
                    type="button"
                    className="employee-roles-member-link"
                    onClick={(event) => {
                      event.stopPropagation()
                      void openMembersDialog(role)
                    }}
                  >
                    {memberLabel(role.memberCount)}
                  </button>
                </span>
                <span className={`employee-roles-role-type ${role.system ? 'employee-roles-role-type--system' : 'employee-roles-role-type--custom'}`}>
                  {role.system ? 'System' : 'Custom'}
                </span>
              </div>
            ))}
          </div>
          <p className="employee-roles-list-foot">Showing {roles.length} of {roles.length} roles</p>
        </section>

        {selectedRole && (
          <section className="employee-roles-detail-card" aria-label="Selected role permissions">
            <div className="employee-roles-detail-head">
              <div className="employee-roles-title-block">
                <span className="employee-roles-title-icon"><RolePermissionIcon name={selectedRole.systemKey === 'ADMINISTRATOR' ? 'shield' : 'group'} /></span>
                <div className="employee-roles-title-copy">
                  {selectedRole.system ? (
                    <>
                      <div className="employee-roles-title-row"><h2>{selectedRole.name}</h2><span className="employee-roles-badge employee-roles-badge--system">System role</span></div>
                      <p>{selectedRole.description}</p>
                    </>
                  ) : (
                    <div className="employee-roles-custom-fields">
                      <div className="employee-roles-title-row"><h2>Edit custom role</h2><span className="employee-roles-badge employee-roles-badge--custom">Custom role</span></div>
                      <label>
                        <span>Role name</span>
                        <input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={120} />
                      </label>
                      <label>
                        <span>Description</span>
                        <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={500} />
                      </label>
                    </div>
                  )}
                  <button type="button" className="employee-roles-member-line employee-roles-member-line--button" onClick={() => void openMembersDialog(selectedRole)}>
                    <RolePermissionIcon name="group" /> {memberLabel(selectedRole.memberCount)}
                  </button>
                </div>
              </div>
              <div className="employee-roles-actions">
                <button type="button" className="employee-roles-secondary-btn" onClick={() => void duplicateSelectedRole()} disabled={duplicating}>
                  <RolePermissionIcon name="copy" />
                  Duplicate role
                </button>
                <button type="button" className="employee-roles-danger-btn" onClick={() => void archiveSelectedRole()} disabled={selectedRole.system || archiving} title={selectedRole.system ? 'System roles cannot be archived.' : undefined}>
                  <RolePermissionIcon name="archive" />
                  Archive role
                </button>
                <button type="button" className="employee-roles-primary-btn" onClick={() => void saveSelectedRole()} disabled={selectedRole.system || saving || !customRoleDirty} title={selectedRole.system ? 'Duplicate a system role to customize it.' : undefined}>
                  <RolePermissionIcon name="save" />
                  Save changes
                </button>
              </div>
            </div>

            <div className="employee-roles-matrix-wrap">
              <table className="employee-roles-matrix">
                <thead>
                  <tr>
                    <th>Permission group</th>
                    {EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => <th key={action}>{toTitleCase(action)}</th>)}
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
                      {EMPLOYEE_PERMISSION_ACTION_KEYS.map((action) => {
                        const key = permissionKey(group.key, action)
                        const checked = permissionSet.has(key)
                        return (
                          <td key={key}>
                            <label className={`employee-roles-check${checked ? ' employee-roles-check--checked' : ''}${selectedRole.system ? ' employee-roles-check--disabled' : ''}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={selectedRole.system}
                                onChange={() => togglePermission(group.key, action)}
                                aria-label={`${group.label} ${toTitleCase(action)}`}
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
            <div className="employee-roles-detail-foot"><RolePermissionIcon name="info" /> Changes to permissions will be applied to all users assigned to this custom role.</div>
          </section>
        )}
      </div>

      {membersDialog && (
        <div className="modal-backdrop employee-roles-members-backdrop" onClick={() => setMembersDialog(null)}>
          <div className="employee-roles-members-modal" role="dialog" aria-modal="true" aria-labelledby="employee-role-members-title" onClick={(event) => event.stopPropagation()}>
            <div className="employee-roles-members-head">
              <div>
                <span className="employee-roles-members-eyebrow">Assigned users</span>
                <h2 id="employee-role-members-title">{membersDialog.role.name}</h2>
                <p>{memberLabel(membersDialog.members.length || membersDialog.role.memberCount)}</p>
              </div>
              <button type="button" className="employee-roles-members-close" onClick={() => setMembersDialog(null)} aria-label="Close members list">×</button>
            </div>

            {membersDialog.loading ? (
              <div className="employee-roles-members-state">Loading members…</div>
            ) : membersDialog.error ? (
              <div className="employee-roles-alert employee-roles-alert--error">{membersDialog.error}</div>
            ) : membersDialog.members.length === 0 ? (
              <div className="employee-roles-members-state">No users are attached to this role.</div>
            ) : (
              <div className="employee-roles-members-list">
                {membersDialog.members.map((member) => (
                  <article key={member.id} className="employee-roles-member-card">
                    <span className="employee-roles-member-avatar" aria-hidden>{memberInitials(member)}</span>
                    <div className="employee-roles-member-copy">
                      <strong>{memberName(member)}</strong>
                      <span>{member.email}</span>
                    </div>
                    <div className="employee-roles-member-badges">
                      {member.tenantOwner && <span className="employee-roles-member-badge employee-roles-member-badge--owner">Owner</span>}
                      <span className="employee-roles-member-badge">{memberRoleLabel(member)}</span>
                      <span className={`employee-roles-member-badge ${member.active ? 'employee-roles-member-badge--active' : 'employee-roles-member-badge--inactive'}`}>
                        {member.active ? 'Active' : 'Inactive'}
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

function toTitleCase(value: string) {
  return value.toLowerCase().replace(/^./, (char) => char.toUpperCase())
}
