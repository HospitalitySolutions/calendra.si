import { useCallback, useMemo } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'

/**
 * URL-addressable side panels ("drawers").
 *
 * Every form and detail view lives at `<page>/drawer/<name>`, so it can be linked,
 * bookmarked, reloaded and closed with the browser back button. Confirmations and
 * row menus are deliberately not routed.
 */

export const DRAWER_SEGMENT = 'drawer'

export type DrawerDescriptor = {
  /** Stable id used in code and as the URL segment. */
  name: string
  /** Route of the page the drawer opens on top of; also where closing returns to. */
  page: string
  /** Full React Router pattern, including any params. */
  pattern: string
}

function drawer(page: string, name: string, params = ''): DrawerDescriptor {
  return { name, page, pattern: `${page}/${DRAWER_SEGMENT}/${name}${params}` }
}

/** Calendar drawers. Each "dodaj termin" tab is its own URL. */
export const CALENDAR_DRAWERS = {
  newAppointment: drawer('/calendar', 'new-appointment'),
  newPersonal: drawer('/calendar', 'new-personal'),
  newTodo: drawer('/calendar', 'new-todo'),
  newAvailability: drawer('/calendar', 'new-availability'),
  appointment: drawer('/calendar', 'appointment', '/:id'),
  personal: drawer('/calendar', 'personal', '/:id'),
  todo: drawer('/calendar', 'todo', '/:id'),
} as const

/** Consumables drawers. Receiving goods is a picker on top of a purchase order, so it stays unrouted. */
export const CONSUMABLES_DRAWERS = {
  newItem: drawer('/consumables', 'new-item'),
  item: drawer('/consumables', 'item', '/:id'),
  newSupplier: drawer('/consumables', 'new-supplier'),
  supplier: drawer('/consumables', 'supplier', '/:id'),
  newPurchaseOrder: drawer('/consumables', 'new-purchase-order'),
  purchaseOrder: drawer('/consumables', 'purchase-order', '/:id'),
  stockMovement: drawer('/consumables', 'stock-movement', '/:id'),
  stockTransfer: drawer('/consumables', 'stock-transfer'),
  categories: drawer('/consumables', 'categories'),
  startInventory: drawer('/consumables', 'start-inventory'),
} as const

/** Waitlist drawers. The slot offer is stacked on a request, and filters are transient. */
export const WAITLIST_DRAWERS = {
  request: drawer('/appointments', 'request', '/:id'),
  newRequest: drawer('/appointments', 'new-request'),
} as const

/**
 * Session types, cards and courses all live on `/session-types`. Group and
 * billing-service pickers opened from the type editor stay unrouted, as do the
 * course picker stacked on a card.
 */
export const SESSION_TYPES_DRAWERS = {
  newType: drawer('/session-types', 'new-type'),
  type: drawer('/session-types', 'type', '/:id'),
  newGroup: drawer('/session-types', 'new-group'),
  group: drawer('/session-types', 'group', '/:id'),
  newService: drawer('/session-types', 'new-service'),
  service: drawer('/session-types', 'service', '/:id'),
  newCard: drawer('/session-types', 'new-card'),
  card: drawer('/session-types', 'card', '/:id'),
  newCourse: drawer('/session-types', 'new-course'),
  course: drawer('/session-types', 'course', '/:id'),
  workspaceServices: drawer('/session-types', 'workspace-services'),
} as const

/**
 * Clients, companies and groups live on `/clients`. Wallet purchase and gift-card
 * personalization stay stacked on a client; calendar/inbox embeds stay unrouted.
 */
export const CLIENTS_DRAWERS = {
  newClient: drawer('/clients', 'new-client'),
  client: drawer('/clients', 'client', '/:id'),
  newCompany: drawer('/clients', 'new-company'),
  company: drawer('/clients', 'company', '/:id'),
  newGroup: drawer('/clients', 'new-group'),
  group: drawer('/clients', 'group', '/:id'),
  workspaceClients: drawer('/clients', 'workspace-clients'),
} as const

/**
 * Billing lives on `/billing`. Payee editors, add-client/company, advance and
 * entitlement pickers stay stacked; calendar embeds stay unrouted. Pre-drawer
 * links used `/billing/open-bills/:id/edit` and `/open-bills/:id/edit`.
 */
export const BILLING_DRAWERS = {
  newBill: drawer('/billing', 'new-bill'),
  openBill: drawer('/billing', 'open-bill', '/:id'),
  bill: drawer('/billing', 'bill', '/:id'),
  giftCard: drawer('/billing', 'gift-card', '/:id'),
  workspaceBills: drawer('/billing', 'workspace-bills'),
} as const

/**
 * Configuration lives on `/configuration`. Closing always passes `tab` / `subtab`
 * so the page section survives. The notification template is the routed form;
 * subscription plan-details stays an unrouted centered panel. Location, custom-field
 * and payment-method editors stay page-embedded (they are not overlays).
 */
export const CONFIGURATION_DRAWERS = {
  notificationTemplate: drawer('/configuration', 'notification-template', '/:eventId'),
} as const

/**
 * Employees and roles live on `/consultants`. `/my-profile` reuses the employee
 * form as an unrouted embed and must not navigate onto `/consultants/drawer/...`.
 * Closing always passes `tab` so the employees/roles section survives (omit when
 * `employees`). Role members is a routed detail opened from the roles tab.
 */
export const CONSULTANTS_DRAWERS = {
  newEmployee: drawer('/consultants', 'new-employee'),
  employee: drawer('/consultants', 'employee', '/:id'),
  roleMembers: drawer('/consultants', 'role-members', '/:id'),
} as const

/**
 * Inbox lives on `/inbox`. Closing a delivery-log detail passes `tab=deliveryLogs`;
 * scheduled messages close to the messages tab (no search). Client detail opened
 * from a thread stays an unrouted embed and must not navigate onto `/clients/drawer/...`.
 * The mobile new-message channel sheet is an unrouted picker.
 */
export const INBOX_DRAWERS = {
  deliveryLog: drawer('/inbox', 'delivery-log', '/:id'),
  scheduled: drawer('/inbox', 'scheduled'),
} as const

/**
 * Platform Admin lives on `/platform-admin`. Tenant create/edit, trial follow-up,
 * change-plan, price-override and suspend are routed forms. Delete tenant is a
 * ConfirmDialog with a reason field. Tenant workspace settings stay page-embedded.
 */
export const PLATFORM_ADMIN_DRAWERS = {
  newTenant: drawer('/platform-admin', 'new-tenant'),
  tenantSubscription: drawer('/platform-admin', 'tenant-subscription', '/:id'),
  trialFollowUp: drawer('/platform-admin', 'trial-follow-up', '/:id'),
  changePlan: drawer('/platform-admin', 'change-plan', '/:id'),
  priceOverride: drawer('/platform-admin', 'price-override', '/:id'),
  suspend: drawer('/platform-admin', 'suspend', '/:id'),
} as const

/**
 * Every drawer in the app. Register new drawers here so the URL convention
 * stays in one place.
 */
export const DRAWERS: DrawerDescriptor[] = [
  ...Object.values(CALENDAR_DRAWERS),
  ...Object.values(CONSUMABLES_DRAWERS),
  ...Object.values(WAITLIST_DRAWERS),
  ...Object.values(SESSION_TYPES_DRAWERS),
  ...Object.values(CLIENTS_DRAWERS),
  ...Object.values(BILLING_DRAWERS),
  ...Object.values(CONFIGURATION_DRAWERS),
  ...Object.values(CONSULTANTS_DRAWERS),
  ...Object.values(INBOX_DRAWERS),
  ...Object.values(PLATFORM_ADMIN_DRAWERS),
]

export type DrawerMatch = {
  descriptor: DrawerDescriptor
  params: Record<string, string | undefined>
}

/** Fills `:id`-style params in a drawer pattern. */
export function drawerPath(
  descriptor: DrawerDescriptor,
  params?: Record<string, string | number | null | undefined>,
): string {
  if (!params) return descriptor.pattern
  return descriptor.pattern.replace(/:([A-Za-z0-9_]+)/g, (whole, key: string) => {
    const value = params[key]
    return value == null ? whole : encodeURIComponent(String(value))
  })
}

/** Builds a complete drawer URL, including the query string. */
export function buildDrawerUrl(
  descriptor: DrawerDescriptor,
  options?: {
    params?: Record<string, string | number | null | undefined>
    search?: string | URLSearchParams
  },
): string {
  const path = drawerPath(descriptor, options?.params)
  const raw = options?.search
  if (!raw) return path
  const search = typeof raw === 'string' ? raw.replace(/^\?/, '') : raw.toString()
  return search ? `${path}?${search}` : path
}

export function matchDrawer(pathname: string): DrawerMatch | null {
  for (const descriptor of DRAWERS) {
    const match = matchPath({ path: descriptor.pattern, end: true }, pathname)
    if (match) return { descriptor, params: match.params }
  }
  return null
}

export function isDrawerPath(pathname: string): boolean {
  return matchDrawer(pathname) != null
}

export type UseDrawerRoute = {
  /** The drawer currently addressed by the URL, if any. */
  match: DrawerMatch | null
  /** True when this specific drawer is open. */
  isOpen: (descriptor: DrawerDescriptor) => boolean
  /** Navigates to a drawer, preserving nothing unless `search` is given. */
  open: (
    descriptor: DrawerDescriptor,
    options?: {
      params?: Record<string, string | number | null | undefined>
      search?: string | URLSearchParams
      replace?: boolean
    },
  ) => void
  /**
   * Returns to the owning page. The query string is dropped by default, because a
   * drawer's seed params must not leak back onto the page. Pass `search` when the
   * page keeps state there — a selected tab, say — and should get it back.
   */
  close: (options?: { replace?: boolean; search?: string | URLSearchParams }) => void
  /** Switches drawer while keeping the current query string, used by routed tabs. */
  switchTo: (descriptor: DrawerDescriptor, options?: { replace?: boolean }) => void
  /** URL for a sibling drawer with the current query string, for `<Link to=...>`. */
  siblingUrl: (
    descriptor: DrawerDescriptor,
    params?: Record<string, string | number | null | undefined>,
  ) => string
}

export function useDrawerRoute(): UseDrawerRoute {
  const location = useLocation()
  const navigate = useNavigate()

  const match = useMemo(() => matchDrawer(location.pathname), [location.pathname])

  const isOpen = useCallback(
    (descriptor: DrawerDescriptor) => match?.descriptor.name === descriptor.name,
    [match],
  )

  const open = useCallback<UseDrawerRoute['open']>(
    (descriptor, options) => {
      navigate(buildDrawerUrl(descriptor, options), { replace: options?.replace ?? false })
    },
    [navigate],
  )

  const close = useCallback<UseDrawerRoute['close']>(
    (options) => {
      const page = match?.descriptor.page ?? location.pathname
      const raw = options?.search
      const search = raw == null ? '' : typeof raw === 'string' ? raw.replace(/^\?/, '') : raw.toString()
      navigate(search ? `${page}?${search}` : page, { replace: options?.replace ?? true })
    },
    [match, location.pathname, navigate],
  )

  const siblingUrl = useCallback<UseDrawerRoute['siblingUrl']>(
    (descriptor, params) => buildDrawerUrl(descriptor, { params, search: location.search }),
    [location.search],
  )

  const switchTo = useCallback<UseDrawerRoute['switchTo']>(
    (descriptor, options) => {
      navigate(buildDrawerUrl(descriptor, { search: location.search }), {
        replace: options?.replace ?? true,
      })
    },
    [navigate, location.search],
  )

  return { match, isOpen, open, close, switchTo, siblingUrl }
}
