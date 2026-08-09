export type NavigationRouteFamily =
  | 'calendar'
  | 'clients'
  | 'appointments'
  | 'billing'
  | 'analytics'
  | 'inbox'
  | 'configuration'
  | 'session-types'
  | 'consultants'
  | 'consumables'

export function navigationRouteFamily(pathname: string): NavigationRouteFamily | null {
  if (pathname === '/calendar' || pathname.startsWith('/calendar/')) return 'calendar'
  if (pathname === '/clients' || pathname.startsWith('/clients/')) return 'clients'
  if (pathname === '/appointments' || pathname.startsWith('/appointments/')) return 'appointments'
  if (pathname === '/billing' || pathname.startsWith('/billing/') || pathname.startsWith('/open-bills/')) return 'billing'
  if (pathname === '/analytics' || pathname.startsWith('/analytics/')) return 'analytics'
  if (pathname === '/inbox' || pathname.startsWith('/inbox/')) return 'inbox'
  if (pathname === '/configuration' || pathname.startsWith('/configuration/')) return 'configuration'
  if (pathname === '/session-types' || pathname.startsWith('/session-types/')) return 'session-types'
  if (pathname === '/consultants' || pathname.startsWith('/consultants/')) return 'consultants'
  if (pathname === '/consumables' || pathname.startsWith('/consumables/')) return 'consumables'
  return null
}

export function sameNavigationFamily(leftPathname: string, rightPathname: string): boolean {
  const left = navigationRouteFamily(leftPathname)
  return left != null && left === navigationRouteFamily(rightPathname)
}
