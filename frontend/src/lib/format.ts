export const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString() : '—'
export const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString() : '—'
export const formatTime = (value?: string) => {
  if (!value) return '—'
  const t = value.includes('T') ? value.split('T')[1] : value
  return t ? t.slice(0, 5) : '—'
}
export const fullName = (person?: { firstName?: string; lastName?: string }) => person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() : '—'

/** "Last, first" when both are present; otherwise the single available part (for calendar labels on wide screens). */
export const nameLastFirst = (person?: { firstName?: string; lastName?: string }) => {
  if (!person) return '—'
  const fn = (person.firstName ?? '').trim()
  const ln = (person.lastName ?? '').trim()
  if (ln && fn) return `${ln}, ${fn}`
  return ln || fn || '—'
}

/**
 * Split a single display string into stored first/last name: first word → firstName, remainder → lastName;
 * no space → lastName only (firstName empty).
 */
export const parseClientNameInput = (raw: string): { firstName: string; lastName: string } => {
  const t = raw.trim()
  if (!t) return { firstName: '', lastName: '' }
  const i = t.indexOf(' ')
  if (i === -1) return { firstName: '', lastName: t }
  const firstName = t.slice(0, i).trim()
  const lastName = t.slice(i + 1).trim()
  if (!lastName) return { firstName: '', lastName: firstName || t }
  return { firstName, lastName }
}

/** Two-letter initials for compact avatars (e.g. calendar resource columns). */
export const personInitials = (person?: { firstName?: string; lastName?: string }) => {
  if (!person) return '?'
  const f = (person.firstName ?? '').trim()
  const l = (person.lastName ?? '').trim()
  const a = (f.charAt(0) || l.charAt(0) || '').toUpperCase()
  const b = (l.charAt(0) || f.charAt(1) || '').toUpperCase()
  const pair = (a + b).trim()
  return pair || '?'
}
export const currency = (value?: number | string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
