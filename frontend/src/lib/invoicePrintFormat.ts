export const DEFAULT_INVOICE_PRINT_FORMAT_KEY = 'DEFAULT_INVOICE_PRINT_FORMAT'

export type InvoicePrintFormat = 'A4' | 'POS_58'
export type InvoicePrintPreference = InvoicePrintFormat | 'ASK'

export function normalizeInvoicePrintPreference(value: unknown): InvoicePrintPreference {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (normalized === 'POS58' || normalized === 'POS_58MM' || normalized === '58MM') return 'POS_58'
  if (normalized === 'POS_58' || normalized === 'ASK') return normalized
  return 'A4'
}