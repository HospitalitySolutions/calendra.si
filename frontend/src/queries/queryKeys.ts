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
  },
  clients: {
    all: ['shared', 'clients'] as const,
    options: (unitId: ScopeId, locationId: ScopeId, size = 500) => (
      ['shared', 'clients', 'options', scopeId(unitId), scopeId(locationId), size] as const
    ),
  },
}
