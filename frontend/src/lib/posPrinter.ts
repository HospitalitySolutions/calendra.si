import type { AppLocale } from '../locale'

export const POS_PRINTING_MODE_KEY = 'POS_PRINTING_MODE'
export const POS_PRINTER_PAPER_WIDTH_KEY = 'POS_PRINTER_PAPER_WIDTH_MM'
export const POS_PRINTER_TEMPLATE_KEY = 'POS_PRINTER_TEMPLATE'
export const POS_PRINTER_PRINT_LOGO_KEY = 'POS_PRINTER_PRINT_LOGO'
export const POS_PRINTER_PRINT_QR_KEY = 'POS_PRINTER_PRINT_QR'
export const POS_PRINTER_AUTO_CUT_KEY = 'POS_PRINTER_AUTO_CUT'

export const POS_PRINTER_LABEL_STORAGE_KEY = 'calendra.posPrinter.browserLabel'
export const POS_PRINTER_PERMISSION_STORAGE_KEY = 'calendra.posPrinter.permissionGranted'
export const POS_DEFAULT_BAUD_RATE = 19200

export type PosPrintingPreferences = {
  mode: 'STANDARD' | 'POS'
  paperWidthMm: 58 | 80
  template: 'COMPACT' | 'DETAILED'
  printLogo: boolean
  printQr: boolean
  autoCut: boolean
}

export type PosReceiptFontSize = 'COMPACT' | 'STANDARD' | 'LARGE'
export type PosReceiptLocale = 'sl' | 'en' | 'sr'

export type PosReceiptLayout = {
  showLogo: boolean
  showRecipient: boolean
  showUnitPriceAndQuantity: boolean
  showVatBreakdown: boolean
  showPaymentDetails: boolean
  showPaymentQr: boolean
  showFiscalQr: boolean
  showNotes: boolean
  showIssuedBy: boolean
  showSignature: boolean
  fontSize: PosReceiptFontSize
  footerText: string
  taxClauses: string[]
  referenceTexts: Record<PosReceiptLocale, string>
  sectionOrder: string[]
}

export type PosReceiptPaymentLine = {
  name?: string | null
  amountGross?: number | string | null
}

export type PosReceiptAdvancePaymentLine = {
  advanceNumber?: string | null
  date?: string | null
  taxPercent?: string | null
  netBasis?: number | string | null
  taxAmount?: number | string | null
  totalGross?: number | string | null
  usedGross?: number | string | null
}

export type PosReceiptServiceLine = {
  date?: string | null
  description?: string | null
  qty?: number | null
  nettPrice?: number | string | null
  grossPrice?: number | string | null
  totalNettPrice?: number | string | null
  taxPercent?: string | null
  taxAmount?: number | string | null
  totalPrice?: number | string | null
}

/**
 * Printer-ready receipt payload assembled by the backend from the exact same bill
 * snapshots and calculations used by the 58 mm PDF renderer.
 */
export type PosReceiptPrintRequest = {
  companyName?: string | null
  companyAddress?: string | null
  companyPostalCode?: string | null
  companyCity?: string | null
  companyTaxId?: string | null
  folioNumber?: string | null
  folioNumberLabel?: string | null
  folioDate?: string | null
  issueCity?: string | null
  dateOfService?: string | null
  dueDate?: string | null
  fiscalZoi?: string | null
  fiscalEor?: string | null
  fiscalQr?: string | null
  recipientName?: string | null
  recipientAddress?: string | null
  recipientPostalCode?: string | null
  recipientCity?: string | null
  recipientVatId?: string | null
  services?: PosReceiptServiceLine[] | null
  notes?: string | null
  paymentMethod?: string | null
  paymentMethods?: PosReceiptPaymentLine[] | null
  issuedBy?: string | null
  iban?: string | null
  paymentQrPayload?: string | null
  toBePaidGross?: number | string | null
  discountAmountGross?: number | string | null
  subtotalBeforeDiscountGross?: number | string | null
  usedAdvancePaymentsGross?: number | string | null
  advancePayments?: PosReceiptAdvancePaymentLine[] | null
  locale?: string | null
}

export type WebSerialPortLike = {
  open: (options: {
    baudRate: number
    dataBits?: number
    stopBits?: number
    parity?: 'none' | 'even' | 'odd'
    flowControl?: 'none' | 'hardware'
  }) => Promise<void>
  close: () => Promise<void>
  readable?: unknown
  writable?: {
    getWriter: () => {
      write: (data: Uint8Array) => Promise<void>
      releaseLock: () => void
    }
  }
  getInfo?: () => { usbVendorId?: number; usbProductId?: number; bluetoothServiceClassId?: string }
}

type WebSerialApiLike = {
  getPorts: () => Promise<WebSerialPortLike[]>
  requestPort: (options?: unknown) => Promise<WebSerialPortLike>
}

const DEFAULT_SECTION_ORDER = [
  'company',
  'document',
  'recipient',
  'items',
  'advancePayments',
  'vat',
  'totals',
  'taxClauses',
  'paymentQr',
  'fiscal',
  'issuedBy',
  'notes',
  'signature',
  'footer',
] as const

const DEFAULT_REFERENCE_TEXTS: Record<PosReceiptLocale, string> = {
  sl: 'Prosimo, da se pri plačilu sklicujete na št.: {reference-number}',
  en: 'Please use the following reference when making the payment: {reference-number}',
  sr: 'Molimo vas da se prilikom plaćanja pozovete na broj: {reference-number}',
}

const DEFAULT_LAYOUT: PosReceiptLayout = {
  showLogo: true,
  showRecipient: true,
  showUnitPriceAndQuantity: true,
  showVatBreakdown: true,
  showPaymentDetails: false,
  showPaymentQr: true,
  showFiscalQr: true,
  showNotes: true,
  showIssuedBy: true,
  showSignature: true,
  fontSize: 'STANDARD',
  footerText: '',
  taxClauses: [],
  referenceTexts: DEFAULT_REFERENCE_TEXTS,
  sectionOrder: [...DEFAULT_SECTION_ORDER],
}

const AUTO_NO_VAT_CLAUSE = 'DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.'

const boolSetting = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}

export function readPosPrintingPreferences(settings: Record<string, string>): PosPrintingPreferences {
  return {
    mode: settings[POS_PRINTING_MODE_KEY] === 'POS' ? 'POS' : 'STANDARD',
    paperWidthMm: settings[POS_PRINTER_PAPER_WIDTH_KEY] === '80' ? 80 : 58,
    template: settings[POS_PRINTER_TEMPLATE_KEY] === 'DETAILED' ? 'DETAILED' : 'COMPACT',
    printLogo: boolSetting(settings[POS_PRINTER_PRINT_LOGO_KEY], true),
    printQr: boolSetting(settings[POS_PRINTER_PRINT_QR_KEY], true),
    autoCut: boolSetting(settings[POS_PRINTER_AUTO_CUT_KEY], false),
  }
}

export function directPosPrintingEnabled(settings: Record<string, string>): boolean {
  return readPosPrintingPreferences(settings).mode === 'POS'
}

export function getWebSerialApi(): WebSerialApiLike | null {
  if (typeof navigator === 'undefined') return null
  const serial = (navigator as Navigator & { serial?: WebSerialApiLike }).serial
  if (!serial?.getPorts || !serial?.requestPort) return null
  return serial
}

export async function acquirePosPrinterPort(options?: {
  requestIfNeeded?: boolean
  preferredPort?: WebSerialPortLike | null
}): Promise<WebSerialPortLike | null> {
  if (options?.preferredPort) return options.preferredPort
  const serial = getWebSerialApi()
  if (!serial) return null

  const permissionKnown = typeof localStorage !== 'undefined'
    && localStorage.getItem(POS_PRINTER_PERMISSION_STORAGE_KEY) === 'true'

  if (!permissionKnown && options?.requestIfNeeded !== false) {
    const port = await serial.requestPort({})
    localStorage.setItem(POS_PRINTER_PERMISSION_STORAGE_KEY, 'true')
    localStorage.setItem(POS_PRINTER_LABEL_STORAGE_KEY, 'POS printer')
    return port
  }

  const ports = await serial.getPorts()
  if (ports.length > 0) return ports[0]
  if (options?.requestIfNeeded === false) return null

  const port = await serial.requestPort({})
  localStorage.setItem(POS_PRINTER_PERMISSION_STORAGE_KEY, 'true')
  localStorage.setItem(POS_PRINTER_LABEL_STORAGE_KEY, 'POS printer')
  return port
}

export function forgetPosPrinterPermissionMarker(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(POS_PRINTER_PERMISSION_STORAGE_KEY)
  localStorage.removeItem(POS_PRINTER_LABEL_STORAGE_KEY)
}

const ESC = 0x1b
const GS = 0x1d

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

const command = (...values: number[]) => Uint8Array.from(values)

/** Slovenian/Croatian/Serbian Latin characters in IBM PC code page 852. */
const cp852Overrides = new Map<number, number>([
  ['č'.codePointAt(0)!, 0x9f], ['Č'.codePointAt(0)!, 0xac],
  ['š'.codePointAt(0)!, 0xe7], ['Š'.codePointAt(0)!, 0xe6],
  ['ž'.codePointAt(0)!, 0xa7], ['Ž'.codePointAt(0)!, 0xa6],
  ['ć'.codePointAt(0)!, 0x86], ['Ć'.codePointAt(0)!, 0x8f],
  ['đ'.codePointAt(0)!, 0xd0], ['Đ'.codePointAt(0)!, 0xd1],
])

function encodeCp852(value: string): Uint8Array {
  const bytes: number[] = []
  for (const char of value) {
    const cp = char.codePointAt(0) ?? 0x3f
    const mapped = cp852Overrides.get(cp)
    if (mapped != null) {
      bytes.push(mapped)
      continue
    }
    if (cp >= 0x20 && cp <= 0x7e) {
      bytes.push(cp)
      continue
    }
    if (cp === 0x0a || cp === 0x0d || cp === 0x09) {
      bytes.push(cp)
      continue
    }
    // CP852 has no euro sign; receipt amounts use EUR as text.
    bytes.push(0x3f)
  }
  return Uint8Array.from(bytes)
}

function sanitizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/€/g, 'EUR')
    .replace(/[–—−]/g, '-')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numberValue(value: unknown): number {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? result : 0
}

function positive(value: unknown): number {
  return Math.max(0, numberValue(value))
}

function money(value: unknown): string {
  const result = numberValue(value)
  return result.toFixed(2).replace('.', ',')
}

function nonBlank(...values: unknown[]): string {
  for (const value of values) {
    const normalized = sanitizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function normalizeLocale(locale: AppLocale | string | null | undefined): PosReceiptLocale {
  const value = String(locale ?? '').trim().toLowerCase()
  if (value.startsWith('sl')) return 'sl'
  if (value.startsWith('sr')) return 'sr'
  return 'en'
}

function word(locale: PosReceiptLocale, sl: string, sr: string, en: string): string {
  if (locale === 'sl') return sl
  if (locale === 'sr') return sr
  return en
}

function normalizeLayout(raw: PosReceiptLayout | null | undefined): PosReceiptLayout {
  const source = raw && typeof raw === 'object' ? raw : DEFAULT_LAYOUT
  const order = Array.isArray(source.sectionOrder)
    ? [...new Set([
        ...source.sectionOrder.filter((entry) => DEFAULT_SECTION_ORDER.includes(entry as (typeof DEFAULT_SECTION_ORDER)[number])),
        ...DEFAULT_SECTION_ORDER,
      ])]
    : [...DEFAULT_SECTION_ORDER]
  const refs = source.referenceTexts && typeof source.referenceTexts === 'object' ? source.referenceTexts : DEFAULT_REFERENCE_TEXTS
  return {
    ...DEFAULT_LAYOUT,
    ...source,
    fontSize: source.fontSize === 'COMPACT' || source.fontSize === 'LARGE' ? source.fontSize : 'STANDARD',
    footerText: sanitizeText(source.footerText),
    taxClauses: Array.isArray(source.taxClauses)
      ? [...new Set(source.taxClauses.map(sanitizeText).filter(Boolean).filter((clause) => clause !== AUTO_NO_VAT_CLAUSE))]
      : [],
    referenceTexts: {
      sl: typeof refs.sl === 'string' ? refs.sl : DEFAULT_REFERENCE_TEXTS.sl,
      en: typeof refs.en === 'string' ? refs.en : DEFAULT_REFERENCE_TEXTS.en,
      sr: typeof refs.sr === 'string' ? refs.sr : DEFAULT_REFERENCE_TEXTS.sr,
    },
    sectionOrder: order,
  }
}

function wrapText(value: unknown, width: number): string[] {
  const clean = sanitizeText(value)
  if (!clean || width <= 0) return []
  const words = clean.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current)
        current = ''
      }
      for (let index = 0; index < word.length; index += width) {
        const part = word.slice(index, index + width)
        if (part.length === width) lines.push(part)
        else current = part
      }
      continue
    }
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= width) current = candidate
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function centerText(value: string, width: number): string {
  const clean = value.slice(0, width)
  const left = Math.max(0, Math.floor((width - clean.length) / 2))
  return `${' '.repeat(left)}${clean}`
}

function rightText(value: string, width: number): string {
  const clean = value.slice(-width)
  return `${' '.repeat(Math.max(0, width - clean.length))}${clean}`
}

function columnText(value: unknown, width: number, alignment: 'left' | 'right' | 'center'): string {
  const clean = sanitizeText(value).slice(0, width)
  if (alignment === 'right') return rightText(clean, width)
  if (alignment === 'center') {
    const left = Math.floor(Math.max(0, width - clean.length) / 2)
    const right = Math.max(0, width - clean.length - left)
    return `${' '.repeat(left)}${clean}${' '.repeat(right)}`
  }
  return `${clean}${' '.repeat(Math.max(0, width - clean.length))}`
}

function wrapPrefixed(prefix: string, value: unknown, width: number): string[] {
  const cleanPrefix = sanitizeText(prefix)
  const cleanValue = sanitizeText(value)
  if (!cleanValue) return cleanPrefix ? wrapText(cleanPrefix, width) : []
  if (!cleanPrefix) return wrapText(cleanValue, width)

  const firstCapacity = Math.max(1, width - cleanPrefix.length - 1)
  const lines: string[] = [`${cleanPrefix} ${cleanValue.slice(0, firstCapacity)}`]
  for (let offset = firstCapacity; offset < cleanValue.length; offset += width) {
    lines.push(cleanValue.slice(offset, offset + width))
  }
  return lines
}

function fitPair(label: unknown, value: unknown, width: number): string[] {
  const right = sanitizeText(value)
  if (!right) return wrapText(label, width)
  const maxRight = Math.min(width - 2, right.length)
  const renderedRight = right.slice(-maxRight)
  const leftWidth = Math.max(1, width - renderedRight.length - 1)
  const leftLines = wrapText(label, leftWidth)
  if (leftLines.length === 0) return [rightText(renderedRight, width)]
  return leftLines.map((line, index) => index === leftLines.length - 1
    ? `${line}${' '.repeat(Math.max(1, width - line.length - renderedRight.length))}${renderedRight}`
    : line)
}

function lineGross(line: PosReceiptServiceLine | null | undefined): number {
  if (!line) return 0
  if (line.totalPrice != null) return numberValue(line.totalPrice)
  return numberValue(line.grossPrice) * Math.max(1, Number(line.qty || 1))
}

function lineNet(line: PosReceiptServiceLine | null | undefined): number {
  if (!line) return 0
  if (line.totalNettPrice != null) return numberValue(line.totalNettPrice)
  return numberValue(line.nettPrice) * Math.max(1, Number(line.qty || 1))
}

function lineUnitGross(line: PosReceiptServiceLine | null | undefined): number {
  return line ? numberValue(line.grossPrice) : 0
}

function lineDiscountGross(line: PosReceiptServiceLine | null | undefined): number {
  if (!line) return 0
  const qty = Math.max(1, Number(line.qty || 1))
  return Math.max(0, lineUnitGross(line) * qty - lineGross(line))
}

type VatBucket = 'VAT_22' | 'VAT_9_5' | 'VAT_0' | 'NO_VAT'

function vatBucket(value: unknown): VatBucket {
  const normalized = sanitizeText(value).toUpperCase()
  if (normalized.includes('22')) return 'VAT_22'
  if (normalized.includes('9.5') || normalized.includes('9,5')) return 'VAT_9_5'
  if (!normalized || normalized.includes('NO VAT') || normalized.includes('BREZ DDV') || normalized.includes('NEOBDAV')) return 'NO_VAT'
  return 'VAT_0'
}

function explicitNoVat(value: unknown): boolean {
  const normalized = sanitizeText(value).toUpperCase()
  return Boolean(normalized) && (normalized.includes('NO VAT') || normalized.includes('BREZ DDV') || normalized.includes('NEOBDAV'))
}

function buildVatRows(services: PosReceiptServiceLine[]): Array<{ bucket: VatBucket; net: number; vat: number }> {
  const map = new Map<VatBucket, { net: number; vat: number }>()
  for (const service of services) {
    const bucket = vatBucket(service.taxPercent)
    const net = lineNet(service)
    const vat = service.taxAmount != null ? numberValue(service.taxAmount) : lineGross(service) - net
    const row = map.get(bucket) ?? { net: 0, vat: 0 }
    row.net += net
    row.vat += vat
    map.set(bucket, row)
  }
  return (['VAT_22', 'VAT_9_5', 'VAT_0', 'NO_VAT'] as VatBucket[])
    .map((bucket) => ({ bucket, ...(map.get(bucket) ?? { net: 0, vat: 0 }) }))
    .filter((row) => Math.abs(row.net) > 0.0001 || Math.abs(row.vat) > 0.0001)
}

function vatLabel(bucket: VatBucket, locale: PosReceiptLocale): string {
  if (bucket === 'VAT_22') return word(locale, 'DDV 22%', 'PDV 22%', 'VAT 22%')
  if (bucket === 'VAT_9_5') return word(locale, 'DDV 9,5%', 'PDV 9,5%', 'VAT 9.5%')
  if (bucket === 'VAT_0') return word(locale, 'DDV 0%', 'PDV 0%', 'VAT 0%')
  return word(locale, 'Brez DDV', 'Bez PDV-a', 'No VAT')
}

function formatIban(value: unknown): string {
  const compact = sanitizeText(value).replace(/\s+/g, '')
  return compact.replace(/(.{4})/g, '$1 ').trim()
}

function buildQrCommand(payload: string, moduleSize: number): Uint8Array {
  const data = new TextEncoder().encode(payload)
  if (!data.length) return new Uint8Array()
  const storeLength = data.length + 3
  const pL = storeLength & 0xff
  const pH = (storeLength >> 8) & 0xff
  return concatBytes(
    command(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    command(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(2, Math.min(8, moduleSize))),
    command(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31),
    command(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30),
    data,
    command(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
  )
}

type RasterImageSource = string | Blob

type MonochromeBitmap = {
  width: number
  height: number
  pixels: Uint8Array
}

/**
 * Logo rendering is deliberately the only bitmap path in direct POS printing.
 * The receipt body and both QR codes use native ESC/POS commands so dense QR/PDF
 * raster data can never be interpreted as garbage text by the printer.
 */
async function imageToMonochromeBitmap(source: RasterImageSource, maxWidth: number, maxHeight: number): Promise<MonochromeBitmap | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  const image = new Image()
  image.decoding = 'async'
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
  const imageSource = typeof source === 'string' ? source : objectUrl
  if (typeof source === 'string' && !source.startsWith('data:')) image.crossOrigin = 'anonymous'
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Could not load POS logo'))
  })
  try {
    image.src = imageSource || ''
    await loaded
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const scale = Math.min(1, maxWidth / Math.max(1, sourceWidth), maxHeight / Math.max(1, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    const rgba = ctx.getImageData(0, 0, width, height).data
    const pixels = new Uint8Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4
        const alpha = rgba[index + 3] / 255
        const r = 255 - (255 - rgba[index]) * alpha
        const g = 255 - (255 - rgba[index + 1]) * alpha
        const b = 255 - (255 - rgba[index + 2]) * alpha
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b
        pixels[y * width + x] = luminance < 176 ? 1 : 0
      }
    }
    return { width, height, pixels }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function bitmapToRaster(bitmap: MonochromeBitmap): Uint8Array {
  const bytesPerRow = Math.ceil(bitmap.width / 8)
  const data = new Uint8Array(bytesPerRow * bitmap.height)
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (!bitmap.pixels[y * bitmap.width + x]) continue
      data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return concatBytes(
    command(
      GS, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
      bitmap.height & 0xff, (bitmap.height >> 8) & 0xff,
    ),
    data,
  )
}

class ReceiptWriter {
  private readonly parts: Uint8Array[] = []
  readonly width: number
  readonly separator: string

  constructor(width: number) {
    this.width = width
    this.separator = '-'.repeat(width)
  }

  bytes(): Uint8Array {
    return concatBytes(...this.parts)
  }

  raw(...bytes: Uint8Array[]): void {
    this.parts.push(...bytes)
  }

  text(value: string): void {
    this.parts.push(encodeCp852(value))
  }

  line(value = ''): void {
    if (value) this.text(value.slice(0, this.width))
    this.parts.push(command(0x0a))
  }

  lines(values: string[]): void {
    for (const value of values) this.line(value)
  }

  wrapped(value: unknown): void {
    this.lines(wrapText(value, this.width))
  }

  centered(value: unknown): void {
    for (const line of wrapText(value, this.width)) this.line(centerText(line, this.width))
  }

  pair(label: unknown, value: unknown): void {
    this.lines(fitPair(label, value, this.width))
  }

  columns(values: unknown[], widths: number[], alignments: Array<'left' | 'right' | 'center'>): void {
    this.line(values.map((value, index) => columnText(value, widths[index], alignments[index])).join(''))
  }

  rule(): void {
    this.line(this.separator)
  }

  gap(lines = 1): void {
    for (let index = 0; index < lines; index += 1) this.line()
  }

  bold(enabled: boolean): void {
    this.raw(command(ESC, 0x45, enabled ? 1 : 0))
  }

  align(mode: 0 | 1 | 2): void {
    this.raw(command(ESC, 0x61, mode))
  }
}

function receiptWidth(paperWidthMm: 58 | 80, fontSize: PosReceiptFontSize): number {
  if (paperWidthMm === 80) return fontSize === 'COMPACT' ? 64 : 48
  return fontSize === 'COMPACT' ? 42 : 32
}

function setReceiptFont(writer: ReceiptWriter, fontSize: PosReceiptFontSize): void {
  if (fontSize === 'COMPACT') {
    writer.raw(command(ESC, 0x4d, 0x01), command(GS, 0x21, 0x00), command(ESC, 0x33, 0x16)) // Font B, tight leading
    return
  }
  // Native thermal printers normally expose only Font A/B and integer scaling.
  // Using 2x scaling for the complete receipt makes a 58 mm layout unusably wide/tall,
  // so LARGE keeps Font A and increases line spacing instead.
  writer.raw(command(ESC, 0x4d, 0x00), command(GS, 0x21, 0x00), command(ESC, 0x33, fontSize === 'LARGE' ? 0x24 : 0x1e))
}

function itemColumnWidths(width: number): [number, number, number, number] {
  if (width >= 60) return [27, 6, 12, width - 45]
  if (width >= 46) return [20, 5, 10, width - 35]
  if (width >= 40) return [18, 5, 8, width - 31]
  return [12, 4, 7, width - 23]
}

function qrModuleSize(payload: string, paperWidthMm: 58 | 80): number {
  const length = new TextEncoder().encode(payload).length
  const base = length > 320 ? 3 : length > 160 ? 4 : 5
  return paperWidthMm === 80 ? Math.min(6, base + 1) : base
}

function hasVisibleReceiptContent(request: PosReceiptPrintRequest): boolean {
  return Boolean(
    sanitizeText(request.companyName)
    || sanitizeText(request.folioNumber)
    || (request.services?.length ?? 0) > 0,
  )
}

export async function buildPosReceiptEscPosBytes(
  request: PosReceiptPrintRequest,
  rawLayout: PosReceiptLayout | null | undefined,
  localeInput: AppLocale | string,
  options?: {
    paperWidthMm?: 58 | 80
    printLogo?: boolean
    printQr?: boolean
    autoCut?: boolean
    logoSource?: string | Blob | null
  },
): Promise<Uint8Array> {
  if (!request || !hasVisibleReceiptContent(request)) throw new Error('POS receipt data is empty.')

  const locale = normalizeLocale(request.locale || localeInput)
  const layout = normalizeLayout(rawLayout)
  const paperWidthMm = options?.paperWidthMm === 80 ? 80 : 58
  const width = receiptWidth(paperWidthMm, layout.fontSize)
  const writer = new ReceiptWriter(width)
  const services = Array.isArray(request.services) ? request.services : []
  const vatRows = buildVatRows(services)

  // Initialize printer, force PC852, standard line spacing and left alignment.
  writer.raw(
    command(ESC, 0x40),
    command(ESC, 0x74, 0x12),
    command(ESC, 0x32),
    command(ESC, 0x61, 0x00),
  )
  setReceiptFont(writer, layout.fontSize)

  const sectionRenderers: Record<string, () => Promise<void> | void> = {
    company: async () => {
      writer.align(1)
      if (layout.showLogo && options?.printLogo !== false && options?.logoSource) {
        try {
          // Keep the logo intentionally small. Everything else remains native text/QR.
          const bitmap = await imageToMonochromeBitmap(
            options.logoSource,
            paperWidthMm === 80 ? 220 : 150,
            paperWidthMm === 80 ? 96 : 72,
          )
          if (bitmap) {
            writer.raw(bitmapToRaster(bitmap))
            writer.gap()
          }
        } catch {
          // Logo is decorative; never fail a fiscal receipt because it cannot be rasterized.
        }
      }
      writer.bold(true)
      writer.centered(request.companyName)
      writer.bold(false)
      writer.centered(request.companyAddress)
      writer.centered([sanitizeText(request.companyPostalCode), sanitizeText(request.companyCity)].filter(Boolean).join(' '))
      if (sanitizeText(request.companyTaxId)) {
        writer.centered(`${word(locale, 'ID št. za DDV', 'PIB', 'VAT ID')}: ${sanitizeText(request.companyTaxId)}`)
      }
      if (sanitizeText(request.iban)) writer.centered(`${locale === 'sl' ? 'TRR' : 'IBAN'}: ${formatIban(request.iban)}`)
      writer.align(0)
    },

    document: () => {
      writer.rule()
      writer.align(1)
      writer.bold(true)
      writer.centered(`${nonBlank(request.folioNumberLabel, word(locale, 'Račun:', 'Račun:', 'Invoice:'))} ${sanitizeText(request.folioNumber)}`)
      writer.bold(false)
      writer.align(0)
      writer.gap()
      const issued = [sanitizeText(request.issueCity), sanitizeText(request.folioDate)].filter(Boolean).join(', ')
      if (issued) writer.pair(word(locale, 'Izdano', 'Izdato', 'Issued'), issued)
      if (sanitizeText(request.dateOfService)) writer.pair(word(locale, 'Datum opravljene storitve', 'Datum izvršene usluge', 'Service date'), request.dateOfService)
      if (sanitizeText(request.dueDate)) writer.pair(word(locale, 'Rok plačila', 'Rok plaćanja', 'Due date'), request.dueDate)
      writer.rule()
    },

    recipient: () => {
      if (!layout.showRecipient) return
      const recipientLines = [
        request.recipientName,
        request.recipientAddress,
        [sanitizeText(request.recipientPostalCode), sanitizeText(request.recipientCity)].filter(Boolean).join(' '),
        request.recipientVatId,
      ].map(sanitizeText).filter(Boolean)
      if (!recipientLines.length) return
      writer.bold(true)
      writer.line(word(locale, 'Prejemnik', 'Primalac', 'Recipient'))
      writer.bold(false)
      for (const line of recipientLines) writer.wrapped(line)
    },

    items: () => {
      if (!services.length) return
      writer.bold(true)
      writer.line(word(locale, 'Postavke', 'Stavke', 'Items'))
      writer.bold(false)
      if (layout.showUnitPriceAndQuantity) {
        const widths = itemColumnWidths(writer.width)
        writer.columns(
          [word(locale, 'Artikel/Cena', 'Artikal/Cena', 'Item/Price'), word(locale, 'Kol', 'Kol', 'Qty'), word(locale, 'Popust', 'Popust', 'Discount'), word(locale, 'Vrednost', 'Vrednost', 'Value')],
          widths,
          ['left', 'right', 'right', 'right'],
        )
      }
      writer.rule()
      const widths = itemColumnWidths(writer.width)
      services.forEach((service, index) => {
        writer.bold(true)
        writer.wrapped(nonBlank(service.description, '-'))
        writer.bold(false)
        if (layout.showUnitPriceAndQuantity) {
          const discount = lineDiscountGross(service)
          writer.columns(
            [money(lineUnitGross(service)), `${Math.max(1, Number(service.qty || 1))}x`, discount > 0.004 ? money(discount) : '-', money(lineGross(service))],
            widths,
            ['right', 'center', 'right', 'right'],
          )
        } else {
          if (sanitizeText(service.date)) writer.wrapped(service.date)
          writer.pair('', money(lineGross(service)))
        }
        if (index < services.length - 1) writer.gap()
      })
      writer.rule()
    },

    advancePayments: () => {
      const advances = Array.isArray(request.advancePayments) ? request.advancePayments : []
      if (!advances.length) return
      writer.bold(true)
      writer.line(word(locale, 'Porabljena predplačila', 'Iskorišćene avansne uplate', 'Used advances'))
      writer.bold(false)
      for (const advance of advances) {
        const left = [sanitizeText(advance.advanceNumber), sanitizeText(advance.date)].filter(Boolean).join(' - ')
        writer.pair(left, `- ${money(Math.abs(numberValue(advance.usedGross)))}`)
      }
    },

    vat: () => {
      if (!layout.showVatBreakdown) return
      for (const row of vatRows.filter((entry) => entry.bucket !== 'NO_VAT')) {
        writer.pair(`${vatLabel(row.bucket, locale)} - ${word(locale, 'osnova', 'osnovica', 'basis')} ${money(row.net)}`, money(row.vat))
      }
    },

    totals: () => {
      const totalNet = services.reduce((sum, service) => sum + lineNet(service), 0)
      const totalGross = services.reduce((sum, service) => sum + lineGross(service), 0)
      const discount = positive(request.discountAmountGross)
      const configuredSubtotalGross = positive(request.subtotalBeforeDiscountGross)
      const subtotalGross = configuredSubtotalGross > 0 ? configuredSubtotalGross : totalGross + discount
      const onlyZeroVat = vatRows.length > 0 && vatRows.every((row) => row.bucket === 'NO_VAT' || row.bucket === 'VAT_0' || Math.abs(row.vat) < 0.0001)
      const subtotalNet = configuredSubtotalGross > 0 && onlyZeroVat ? configuredSubtotalGross : totalNet
      const usedAdvance = positive(request.usedAdvancePaymentsGross)
      const invoiceTotalGross = Math.max(0, subtotalGross - discount)

      writer.pair(word(locale, 'Skupaj brez DDV', 'Ukupno bez PDV-a', 'Total excl. VAT'), money(subtotalNet))
      if (discount > 0.004) writer.pair(word(locale, 'Popust', 'Popust', 'Discount'), `- ${money(discount)}`)
      if (usedAdvance > 0.004) writer.pair(word(locale, 'Porabljeno predplačilo', 'Iskorišćen avans', 'Advance used'), `- ${money(usedAdvance)}`)
      writer.bold(true)
      writer.pair(word(locale, 'Skupaj EUR', 'Ukupno EUR', 'Total EUR'), money(invoiceTotalGross))
      writer.bold(false)

      const explicitToBePaid = positive(request.toBePaidGross)
      const amountDueDisplay = explicitToBePaid > 0.004
        ? explicitToBePaid
        : Math.max(0, invoiceTotalGross - usedAdvance)
      writer.rule()
      writer.bold(true)
      writer.pair(word(locale, 'Za plačilo EUR', 'Za plaćanje EUR', 'Amount due EUR'), money(amountDueDisplay))
      writer.bold(false)

      if (layout.showPaymentDetails) {
        const paymentLines = Array.isArray(request.paymentMethods) && request.paymentMethods.length
          ? request.paymentMethods
          : sanitizeText(request.paymentMethod)
            ? [{ name: request.paymentMethod, amountGross: amountDueDisplay }]
            : []
        if (paymentLines.length) writer.gap()
        for (const payment of paymentLines) writer.pair(nonBlank(payment.name, word(locale, 'Plačilo', 'Plaćanje', 'Payment')), money(payment.amountGross))
      }
      writer.rule()
    },

    taxClauses: () => {
      const clauses = [...layout.taxClauses]
      if (services.length > 0 && services.every((service) => explicitNoVat(service.taxPercent))) clauses.unshift(AUTO_NO_VAT_CLAUSE)
      for (const clause of [...new Set(clauses)]) writer.wrapped(`- ${clause}`)
    },

    paymentQr: () => {
      const payload = String(request.paymentQrPayload ?? '')
      if (!layout.showPaymentQr || options?.printQr === false || !payload.trim()) return
      writer.gap()
      writer.align(1)
      writer.raw(buildQrCommand(payload, qrModuleSize(payload, paperWidthMm)))
      writer.gap()
      writer.centered(word(locale, 'Skeniraj in plačaj', 'Skeniraj i plati', 'Scan and pay'))
      writer.align(0)
    },

    fiscal: () => {
      if (!layout.showFiscalQr || options?.printQr === false) return
      const qr = String(request.fiscalQr ?? '')
      const zoi = sanitizeText(request.fiscalZoi)
      const eor = sanitizeText(request.fiscalEor)
      if (!qr.trim() && !zoi && !eor) return
      if (qr.trim()) {
        writer.gap()
        writer.align(1)
        writer.raw(buildQrCommand(qr, qrModuleSize(qr, paperWidthMm)))
        writer.gap()
        writer.align(0)
      }
      if (zoi) writer.lines(wrapPrefixed('ZOI:', zoi, writer.width))
      if (eor) writer.lines(wrapPrefixed('EOR:', eor, writer.width))
    },

    issuedBy: () => {
      if (layout.showIssuedBy && sanitizeText(request.issuedBy)) writer.pair(word(locale, 'Izdal', 'Izdao', 'Issued by'), request.issuedBy)
    },

    notes: () => {
      const reference = sanitizeText(request.notes)
      if (!layout.showNotes || !reference) return
      writer.bold(true)
      writer.line(word(locale, 'Referenca', 'Referenca', 'Reference'))
      writer.bold(false)
      const template = String(layout.referenceTexts[locale] ?? '')
      const rendered = template.includes('{reference-number}')
        ? template.split('{reference-number}').join(reference)
        : [template, reference].map(sanitizeText).filter(Boolean).join(' ')
      writer.wrapped(rendered || reference)
    },

    signature: () => {
      if (!layout.showSignature) return
      writer.line(word(locale, 'Podpis', 'Potpis', 'Signature'))
      writer.line('_'.repeat(Math.min(writer.width, 24)))
    },

    footer: () => {
      if (!layout.footerText) return
      writer.rule()
      writer.align(1)
      writer.centered(layout.footerText)
      writer.align(0)
    },
  }

  let printedSection = false
  for (const section of layout.sectionOrder) {
    const render = sectionRenderers[section]
    if (!render) continue
    const before = writer.bytes().length
    await render()
    const after = writer.bytes().length
    if (after > before) {
      printedSection = true
      writer.gap()
    }
  }

  if (!printedSection) throw new Error('POS receipt has no printable sections.')

  // Reset presentation state before paper feed/cut so the next job starts cleanly.
  writer.raw(command(ESC, 0x45, 0x00), command(GS, 0x21, 0x00), command(ESC, 0x4d, 0x00), command(ESC, 0x61, 0x00))
  writer.gap(2)
  if (options?.autoCut) writer.raw(command(GS, 0x56, 0x00))
  else writer.raw(command(ESC, 0x64, 0x03))
  return writer.bytes()
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

/**
 * Write conservatively sized chunks. Cheap 58 mm controllers often expose a tiny
 * serial receive buffer; throttling prevents QR payloads and long receipts from
 * overrunning it while preserving ESC/POS byte order exactly.
 */
export async function sendEscPosBytes(
  port: WebSerialPortLike,
  bytes: Uint8Array,
  baudRate = POS_DEFAULT_BAUD_RATE,
): Promise<void> {
  let openedHere = false
  try {
    if (!port.writable) {
      await port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      })
      openedHere = true
    }
    const writer = port.writable?.getWriter()
    if (!writer) throw new Error('Printer port is not writable.')
    try {
      const chunkSize = 384
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        await writer.write(bytes.slice(offset, Math.min(bytes.length, offset + chunkSize)))
        if (offset + chunkSize < bytes.length) await sleep(8)
      }
    } finally {
      writer.releaseLock()
    }
  } finally {
    if (openedHere) {
      try { await port.close() } catch { /* caller reports the primary print failure */ }
    }
  }
}
