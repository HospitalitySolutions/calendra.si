export function formatDateTime(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('sl-SI', options || {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDate(value?: string | null) {
  return formatDateTime(value, { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatTime(value?: string | null) {
  return formatDateTime(value, { hour: '2-digit', minute: '2-digit' })
}

export function formatMoney(value?: number | null, currency = 'EUR') {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: currency || 'EUR' }).format(value)
}

export function initials(first?: string | null, last?: string | null) {
  return `${first?.trim()?.[0] || ''}${last?.trim()?.[0] || ''}`.toUpperCase() || 'C'
}

export function providerInitial(name?: string | null) {
  return name?.trim()?.[0]?.toUpperCase() || 'C'
}

export function humanizeStatus(status?: string | null) {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE': return 'Aktivno'
    case 'PAID': return 'Plačano'
    case 'PENDING': return 'V obdelavi'
    case 'CANCELLED': return 'Odpovedano'
    case 'CONFIRMED': return 'Potrjeno'
    case 'COMPLETED': return 'Zaključeno'
    case 'CHECKED_OUT': return 'Zaključeno'
    case 'EXPIRED': return 'Poteklo'
    case 'REFUNDED': return 'Povrnjeno'
    default: return status ? status.replace(/_/g, ' ') : '—'
  }
}

export function entitlementLabel(type?: string | null) {
  const value = (type || '').toUpperCase()
  if (value.includes('MEMBERSHIP')) return 'Članstvo'
  if (value.includes('GIFT') || value.includes('VOUCHER')) return 'Bon'
  if (value.includes('PACK') || value.includes('TICKET') || value.includes('VISIT')) return 'Paket'
  return 'Ugodnost'
}
