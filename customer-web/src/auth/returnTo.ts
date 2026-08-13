export const DEFAULT_CUSTOMER_RETURN_PATH = '/za-stranke'

export function safeCustomerReturnPath(value: string | null | undefined) {
  if (!value) return DEFAULT_CUSTOMER_RETURN_PATH
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return DEFAULT_CUSTOMER_RETURN_PATH
  if (trimmed.startsWith('/racun/prijava') || trimmed.startsWith('/racun/login')) return DEFAULT_CUSTOMER_RETURN_PATH
  return trimmed
}

export function returnToCustomerPage(value?: string | null, replace = true) {
  const target = safeCustomerReturnPath(value)
  if (replace) window.location.replace(target)
  else window.location.assign(target)
}
