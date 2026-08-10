type ScopeId = number | null | undefined

function scopeId(value: ScopeId) {
  return value ?? 'none'
}

export const queryKeys = {
  shared: ['shared'] as const,
  settings: {
    all: ['shared', 'settings'] as const,
    byUnit: (unitId: ScopeId) => ['shared', 'settings', scopeId(unitId)] as const,
    moduleCapabilities: (unitId: ScopeId) => ['shared', 'settings', 'module-capabilities', scopeId(unitId)] as const,
  },
  locations: {
    all: ['shared', 'locations'] as const,
    byUnit: (unitId: ScopeId) => ['shared', 'locations', scopeId(unitId)] as const,
  },
  users: {
    all: ['shared', 'users'] as const,
    byUnit: (unitId: ScopeId) => ['shared', 'users', scopeId(unitId)] as const,
  },
  customFields: {
    all: ['shared', 'custom-fields'] as const,
    byUnit: (unitId: ScopeId) => ['shared', 'custom-fields', scopeId(unitId)] as const,
  },
  billing: {
    all: ['shared', 'billing'] as const,
    services: (unitId: ScopeId) => ['shared', 'billing', 'services', scopeId(unitId)] as const,
    paymentMethods: (unitId: ScopeId) => ['shared', 'billing', 'payment-methods', scopeId(unitId)] as const,
    issuers: (unitId: ScopeId) => ['shared', 'billing', 'issuers', scopeId(unitId)] as const,
    invoiceSeries: (unitId: ScopeId) => ['shared', 'billing', 'invoice-series', scopeId(unitId)] as const,
    summaryByUnit: (unitId: ScopeId) => ['shared', 'billing', 'summary', scopeId(unitId)] as const,
    summary: (unitId: ScopeId, locationId: ScopeId) => ['shared', 'billing', 'summary', scopeId(unitId), scopeId(locationId)] as const,
    openBills: (unitId: ScopeId) => ['shared', 'billing', 'open-bills', scopeId(unitId)] as const,
    openBill: (unitId: ScopeId, openBillId: number) => ['shared', 'billing', 'open-bill', scopeId(unitId), openBillId] as const,
    bills: (unitId: ScopeId) => ['shared', 'billing', 'bills', scopeId(unitId)] as const,
    billsPage: (unitId: ScopeId, view: string, locationId: ScopeId, signature: string) =>
      ['shared', 'billing', 'bills', scopeId(unitId), 'page', view, scopeId(locationId), signature] as const,
    unusedAdvancesByUnit: (unitId: ScopeId) => ['shared', 'billing', 'unused-advances', scopeId(unitId)] as const,
    unusedAdvances: (unitId: ScopeId, locationId: ScopeId) => ['shared', 'billing', 'unused-advances', scopeId(unitId), scopeId(locationId)] as const,
    unusedAdvancesPage: (unitId: ScopeId, locationId: ScopeId, signature: string) =>
      ['shared', 'billing', 'unused-advances', scopeId(unitId), 'page', scopeId(locationId), signature] as const,
    giftCards: (unitId: ScopeId) => ['shared', 'billing', 'gift-cards', scopeId(unitId)] as const,
    giftCardsPage: (unitId: ScopeId, locationId: ScopeId, signature: string) =>
      ['shared', 'billing', 'gift-cards', scopeId(unitId), 'page', scopeId(locationId), signature] as const,
    editorCompanies: (unitId: ScopeId, locationId: ScopeId) => ['shared', 'billing', 'editor-companies', scopeId(unitId), scopeId(locationId)] as const,
    editorBookings: (unitId: ScopeId) => ['shared', 'billing', 'editor-bookings', scopeId(unitId)] as const,
  },
  clients: {
    all: ['shared', 'clients'] as const,
    list: (unitId: ScopeId, locationId: ScopeId) =>
      ['shared', 'clients', 'list', scopeId(unitId), scopeId(locationId)] as const,
    page: (unitId: ScopeId, locationId: ScopeId, signature: string) =>
      ['shared', 'clients', 'page', scopeId(unitId), scopeId(locationId), signature] as const,
    options: (unitId: ScopeId, locationId: ScopeId, size = 500) => (
      ['shared', 'clients', 'options', scopeId(unitId), scopeId(locationId), size] as const
    ),
    optionSearch: (unitId: ScopeId, locationId: ScopeId, signature: string) =>
      ['shared', 'clients', 'options', 'search', scopeId(unitId), scopeId(locationId), signature] as const,
  },
  companies: {
    all: ['shared', 'companies'] as const,
    page: (unitId: ScopeId, locationId: ScopeId, signature: string) =>
      ['shared', 'companies', 'page', scopeId(unitId), scopeId(locationId), signature] as const,
    options: (unitId: ScopeId, locationId: ScopeId) =>
      ['shared', 'companies', 'options', scopeId(unitId), scopeId(locationId)] as const,
  },
  groups: {
    all: ['shared', 'groups'] as const,
    page: (unitId: ScopeId, locationId: ScopeId, signature: string) =>
      ['shared', 'groups', 'page', scopeId(unitId), scopeId(locationId), signature] as const,
    calendar: (unitId: ScopeId, locationId: ScopeId) =>
      ['shared', 'groups', 'calendar', scopeId(unitId), scopeId(locationId)] as const,
  },
  scheduling: {
    all: ['shared', 'scheduling'] as const,
    spacesAll: ['shared', 'scheduling', 'spaces'] as const,
    spaces: (unitId: ScopeId) => ['shared', 'scheduling', 'spaces', scopeId(unitId)] as const,
    typesAll: ['shared', 'scheduling', 'types'] as const,
    types: (unitId: ScopeId) => ['shared', 'scheduling', 'types', scopeId(unitId)] as const,
    consultantsAll: ['shared', 'scheduling', 'consultants'] as const,
    consultants: (unitId: ScopeId) => ['shared', 'scheduling', 'consultants', scopeId(unitId)] as const,
    serviceGroupsAll: ['shared', 'scheduling', 'service-groups'] as const,
    serviceGroups: (unitId: ScopeId) => ['shared', 'scheduling', 'service-groups', scopeId(unitId)] as const,
  },
  calendar: {
    all: ['calendar'] as const,
    ranges: ['calendar', 'range'] as const,
    range: (unitId: ScopeId, scope: 'unit' | 'workspace', from: string, to: string) =>
      ['calendar', 'range', scopeId(unitId), scope, from, to] as const,
    holidays: (from: string, to: string) => ['calendar', 'holidays', from, to] as const,
    integrationStatus: (unitId: ScopeId, provider: string) =>
      ['calendar', 'integration-status', scopeId(unitId), provider] as const,
  },
  waitlist: {
    all: ['waitlist'] as const,
    overviews: ['waitlist', 'overview'] as const,
    overview: (unitId: ScopeId, signature: string) => ['waitlist', 'overview', scopeId(unitId), signature] as const,
    details: ['waitlist', 'detail'] as const,
    detail: (unitId: ScopeId, requestId: number) => ['waitlist', 'detail', scopeId(unitId), requestId] as const,
  },
  staff: {
    all: ['staff'] as const,
    quota: (unitId: ScopeId) => ['staff', 'quota', scopeId(unitId)] as const,
    roles: (unitId: ScopeId) => ['staff', 'roles', scopeId(unitId)] as const,
  },
  configuration: {
    all: ['configuration'] as const,
    inboxCapabilities: ['configuration', 'inbox-capabilities'] as const,
    paymentCapabilities: ['configuration', 'payment-capabilities'] as const,
    fiscalCertificate: (unitId: ScopeId) => ['configuration', 'fiscal-certificate', scopeId(unitId)] as const,
    paypalConfig: (unitId: ScopeId) => ['configuration', 'paypal-config', scopeId(unitId)] as const,
    stripeConnectConfig: (unitId: ScopeId) => ['configuration', 'stripe-connect-config', scopeId(unitId)] as const,
    receivedInvoices: (unitId: ScopeId) => ['configuration', 'received-invoices', scopeId(unitId)] as const,
    registerCatalog: ['configuration', 'register-catalog'] as const,
  },
  consumables: {
    all: ['consumables'] as const,
    overview: (unitId: ScopeId, locationId: ScopeId) => ['consumables', 'overview', scopeId(unitId), scopeId(locationId)] as const,
    items: (unitId: ScopeId, locationId: ScopeId) => ['consumables', 'items', scopeId(unitId), scopeId(locationId)] as const,
    categories: (unitId: ScopeId) => ['consumables', 'categories', scopeId(unitId)] as const,
    movements: (unitId: ScopeId, locationId: ScopeId) => ['consumables', 'movements', scopeId(unitId), scopeId(locationId)] as const,
    suppliers: (unitId: ScopeId) => ['consumables', 'suppliers', scopeId(unitId)] as const,
    purchaseOrders: (unitId: ScopeId, locationId: ScopeId) => ['consumables', 'purchase-orders', scopeId(unitId), scopeId(locationId)] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    filters: (unitId: ScopeId, signature: string) => ['analytics', 'filters', scopeId(unitId), signature] as const,
    overview: (unitId: ScopeId, signature: string) => ['analytics', 'overview', scopeId(unitId), signature] as const,
  },
  activityLog: {
    all: ['activity-log'] as const,
    page: (unitId: ScopeId, signature: string) => ['activity-log', 'page', scopeId(unitId), signature] as const,
  },
}
