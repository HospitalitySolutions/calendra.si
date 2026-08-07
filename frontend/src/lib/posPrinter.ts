import type { AppLocale } from '../locale'
import type { Bill } from './types'

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

  // On a user's first print, requestPort() must be invoked directly from that user gesture.
  // Avoid an await before requestPort() when we know this browser has never granted access.
  if (!permissionKnown && options?.requestIfNeeded !== false) {
    const port = await serial.requestPort({})
    localStorage.setItem(POS_PRINTER_PERMISSION_STORAGE_KEY, 'true')
    localStorage.setItem(POS_PRINTER_LABEL_STORAGE_KEY, 'POS printer')
    return port
  }

  const ports = await serial.getPorts()
  if (ports.length > 0) return ports[0]

  if (options?.requestIfNeeded === false) return null

  // Permission can be cleared by the browser while our local marker remains. A direct
  // user click normally still has activation here; if not, the caller will surface the
  // browser's permission error and the user can retry from the print action.
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

const cp852Overrides = new Map<number, number>([
  ['č'.codePointAt(0)!, 0x9f],
  ['Č'.codePointAt(0)!, 0xac],
  ['š'.codePointAt(0)!, 0xe7],
  ['Š'.codePointAt(0)!, 0xe6],
  ['ž'.codePointAt(0)!, 0xa7],
  ['Ž'.codePointAt(0)!, 0xa6],
  ['ć'.codePointAt(0)!, 0x86],
  ['Ć'.codePointAt(0)!, 0x8f],
  ['đ'.codePointAt(0)!, 0xd0],
  ['Đ'.codePointAt(0)!, 0xd1],
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
    // CP852 has no euro sign; write EUR in receipt content instead of corrupting it.
    bytes.push(0x3f)
  }
  return Uint8Array.from(bytes)
}

const command = (...values: number[]) => Uint8Array.from(values)
const text = (value: string) => encodeCp852(value)
const lineFeed = () => command(0x0a)
const align = (mode: 0 | 1 | 2) => command(ESC, 0x61, mode)
const bold = (enabled: boolean) => command(ESC, 0x45, enabled ? 1 : 0)
const textSize = (widthMultiplier: 1 | 2, heightMultiplier: 1 | 2) => {
  const width = widthMultiplier === 2 ? 1 : 0
  const height = heightMultiplier === 2 ? 1 : 0
  return command(GS, 0x21, (width << 4) | height)
}

function sanitizeReceiptText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wrapText(value: string, width: number): string[] {
  const clean = sanitizeReceiptText(value)
  if (!clean) return []
  const words = clean.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) {
      if (word.length <= width) {
        current = word
      } else {
        for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width))
      }
      continue
    }
    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      if (word.length <= width) current = word
      else {
        for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width))
        current = ''
      }
    }
  }
  if (current) lines.push(current)
  return lines
}

function padColumns(left: string, right: string, width: number): string {
  const safeRight = sanitizeReceiptText(right).slice(0, width)
  const maxLeft = Math.max(0, width - safeRight.length - 1)
  const safeLeft = sanitizeReceiptText(left).slice(0, maxLeft)
  const spaces = Math.max(1, width - safeLeft.length - safeRight.length)
  return `${safeLeft}${' '.repeat(spaces)}${safeRight}`
}

function money(value: number | string | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

function taxPercent(taxRate: string | null | undefined): number {
  if (taxRate === 'VAT_22') return 22
  if (taxRate === 'VAT_9_5') return 9.5
  return 0
}

function taxRows(bill: Bill): Array<{ rate: number; net: number; tax: number; gross: number }> {
  const rows = new Map<number, { net: number; tax: number; gross: number }>()
  for (const item of bill.items ?? []) {
    const rate = taxPercent(item.transactionService?.taxRate)
    const qty = Math.max(1, Number(item.quantity || 1))
    const gross = Number(item.grossPrice || 0)
    const net = Number(item.netPrice || 0) * qty
    const current = rows.get(rate) ?? { net: 0, tax: 0, gross: 0 }
    current.net += net
    current.tax += Math.max(0, gross - net)
    current.gross += gross
    rows.set(rate, current)
  }
  return Array.from(rows.entries())
    .map(([rate, row]) => ({ rate, ...row }))
    .filter((row) => row.gross > 0.0001)
    .sort((a, b) => b.rate - a.rate)
}

function clientName(bill: Bill): string {
  if (bill.billingTarget === 'COMPANY' && bill.recipientCompany?.name) return bill.recipientCompany.name
  return [bill.client?.firstName, bill.client?.lastName].filter(Boolean).join(' ').trim()
}

function paymentLines(bill: Bill, locale: AppLocale): Array<{ label: string; amount?: number }> {
  const splits = bill.paymentSplits ?? []
  if (splits.length > 0) {
    return splits.map((split) => ({
      label: split.paymentMethod?.name || (locale === 'sl' ? 'Plačilo' : 'Payment'),
      amount: Number(split.amountGross || 0),
    }))
  }
  if (bill.paymentMethod?.name) return [{ label: bill.paymentMethod.name, amount: Number(bill.totalGross || 0) }]
  return []
}

function receiptCompanyName(bill: Bill, settings: Record<string, string>): string {
  return sanitizeReceiptText(bill.issuer?.name || settings.COMPANY_NAME || 'Calendra')
}

function receiptVatId(bill: Bill, settings: Record<string, string>): string {
  return sanitizeReceiptText(bill.issuer?.vatId || bill.issuer?.taxNumber || settings.COMPANY_VAT_ID || '')
}

function formatReceiptDate(value: string | null | undefined, locale: AppLocale): string {
  if (!value) return ''
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return sanitizeReceiptText(value)
  return new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function buildQrCommand(payload: string, moduleSize: number): Uint8Array {
  const data = new TextEncoder().encode(payload)
  if (!data.length) return new Uint8Array()
  const storeLength = data.length + 3
  const pL = storeLength & 0xff
  const pH = (storeLength >> 8) & 0xff
  return concatBytes(
    // QR model 2
    command(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    // Module size
    command(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(2, Math.min(8, moduleSize))),
    // Error correction level M (49)
    command(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31),
    // Store data
    command(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30),
    data,
    // Print QR
    command(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
  )
}

type RasterImageSource = string | Blob

type MonochromeBitmap = {
  width: number
  height: number
  pixels: Uint8Array
}

async function imageToMonochromeBitmap(
  source: RasterImageSource,
  maxWidth: number,
  options?: { threshold?: number },
): Promise<MonochromeBitmap | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  const image = new Image()
  image.decoding = 'async'
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
  const imageSource = typeof source === 'string' ? source : objectUrl
  if (typeof source === 'string' && !source.startsWith('data:')) image.crossOrigin = 'anonymous'
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Could not load receipt image'))
  })
  try {
    image.src = imageSource || ''
    await loaded
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const scale = Math.min(1, maxWidth / Math.max(1, sourceWidth))
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
    const threshold = Math.max(0, Math.min(255, options?.threshold ?? 168))
    const pixels = new Uint8Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4
        const alpha = rgba[idx + 3] / 255
        const r = 255 - (255 - rgba[idx]) * alpha
        const g = 255 - (255 - rgba[idx + 1]) * alpha
        const b = 255 - (255 - rgba[idx + 2]) * alpha
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b
        pixels[y * width + x] = luminance < threshold ? 1 : 0
      }
    }
    return { width, height, pixels }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function monochromeBitmapToEscPosRasterImage(bitmap: MonochromeBitmap): Uint8Array {
  const { width, height, pixels } = bitmap
  const bytesPerRow = Math.ceil(width / 8)

  // GS v 0 is the ESC/POS raster-bit-image command. It is much more consistently
  // implemented by current 58 mm thermal printers than the legacy ESC * 24-dot
  // command. Printers that do not fully support ESC * interpret the following
  // bitmap bytes as ordinary text, which is exactly the long stream of strange
  // characters seen when a dense QR area is present on the receipt.
  //
  // Send the image in modest vertical stripes rather than one very large command.
  // This keeps generic printer input buffers stable on long receipts with one or
  // more QR codes while producing a continuous image (GS v 0 advances by the
  // stripe height itself, so no line feed is inserted between stripes).
  const maxRowsPerStripe = 96
  const parts: Uint8Array[] = [align(0)]

  for (let startY = 0; startY < height; startY += maxRowsPerStripe) {
    const stripeHeight = Math.min(maxRowsPerStripe, height - startY)
    const stripe = new Uint8Array(bytesPerRow * stripeHeight)

    for (let localY = 0; localY < stripeHeight; localY += 1) {
      const sourceY = startY + localY
      const targetRowOffset = localY * bytesPerRow
      const sourceRowOffset = sourceY * width
      for (let x = 0; x < width; x += 1) {
        if (!pixels[sourceRowOffset + x]) continue
        stripe[targetRowOffset + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }

    parts.push(
      command(
        GS, 0x76, 0x30, 0x00,
        bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
        stripeHeight & 0xff, (stripeHeight >> 8) & 0xff,
      ),
      stripe,
    )
  }

  return concatBytes(...parts)
}

async function imageToEscPosRaster(
  source: RasterImageSource,
  maxWidth: number,
  options?: { threshold?: number },
): Promise<Uint8Array | null> {
  const bitmap = await imageToMonochromeBitmap(source, maxWidth, options)
  if (!bitmap) return null
  return monochromeBitmapToEscPosRasterImage(bitmap)
}

/**
 * Convert the server-rendered 58 mm invoice template into ESC/POS raster data.
 * The backend image is already cropped to the physical 48 mm / 384-dot
 * printable area, so no invoice layout is recreated in the browser.
 */
export async function buildReceiptRasterEscPosBytes(
  source: Blob,
  options?: { autoCut?: boolean; maxWidthDots?: number },
): Promise<Uint8Array> {
  const raster = await imageToEscPosRaster(source, options?.maxWidthDots ?? 384, {
    // Slightly higher than the default threshold preserves Noto Sans strokes and
    // QR edges after PDF anti-aliasing while keeping the background white.
    threshold: 190,
  })
  if (!raster) throw new Error('Could not render the 58 mm receipt for POS printing.')
  return concatBytes(
    command(ESC, 0x40),
    align(0),
    raster,
    lineFeed(),
    lineFeed(),
    options?.autoCut ? command(GS, 0x56, 0x00) : command(ESC, 0x64, 0x03),
  )
}

export async function buildInvoiceEscPosBytes(
  bill: Bill,
  settings: Record<string, string>,
  locale: AppLocale,
  options?: { paymentQrPayload?: string | null },
): Promise<Uint8Array> {
  const prefs = readPosPrintingPreferences(settings)
  const width = prefs.paperWidthMm === 80 ? 48 : 32
  const divider = '-'.repeat(width)
  const sections: Uint8Array[] = [
    command(ESC, 0x40),
    // Select PC852 (Latin 2). Most ESC/POS printers expose it as table 18.
    command(ESC, 0x74, 0x12),
    align(1),
  ]

  if (prefs.printLogo) {
    const logoSource = settings.COMPANY_LOGO_BASE64 || settings.COMPANY_LOGO_URL
    if (logoSource) {
      try {
        const raster = await imageToEscPosRaster(logoSource, prefs.paperWidthMm === 80 ? 260 : 190)
        if (raster) sections.push(raster, lineFeed())
      } catch {
        // Logo is optional; text receipt must still print when image loading/CORS fails.
      }
    }
  }

  const company = receiptCompanyName(bill, settings)
  sections.push(bold(true), textSize(1, 1), text(company), lineFeed(), bold(false))

  const issuerAddress = bill.issuer?.address || settings.COMPANY_ADDRESS
  const issuerPostalCity = [bill.issuer?.postalCode || settings.COMPANY_POSTAL_CODE, bill.issuer?.city || settings.COMPANY_CITY]
    .filter(Boolean)
    .join(' ')
  const address = [issuerAddress, issuerPostalCity].filter(Boolean).join(', ')
  for (const row of wrapText(address, width)) sections.push(text(row), lineFeed())
  const vatId = receiptVatId(bill, settings)
  if (vatId) sections.push(text(`${locale === 'sl' ? 'Davcna st.' : 'VAT ID'}: ${vatId}`), lineFeed())
  const issuerTelephone = bill.issuer?.telephone || settings.COMPANY_TELEPHONE
  if (issuerTelephone) sections.push(text(issuerTelephone), lineFeed())

  sections.push(text(divider), lineFeed(), align(0), bold(true))
  const documentLabel = bill.refundOfBillId != null
    ? (locale === 'sl' ? 'DOBROPIS' : 'REFUND')
    : bill.billType === 'ADVANCE'
      ? (locale === 'sl' ? 'PREDPLACILO' : 'ADVANCE')
      : (locale === 'sl' ? 'RACUN' : 'INVOICE')
  sections.push(text(`${documentLabel}: ${sanitizeReceiptText(bill.billNumber || String(bill.id))}`), lineFeed(), bold(false))
  sections.push(text(padColumns(locale === 'sl' ? 'Datum' : 'Date', formatReceiptDate(bill.issueDate, locale), width)), lineFeed())
  if (bill.orderId) sections.push(text(padColumns('Order ID', bill.orderId, width)), lineFeed())
  if (bill.refundReference) {
    for (const row of wrapText(`${locale === 'sl' ? 'Referenca dobropisa' : 'Refund reference'}: ${bill.refundReference}`, width)) sections.push(text(row), lineFeed())
  }
  const buyer = clientName(bill)
  if (buyer) {
    for (const row of wrapText(`${locale === 'sl' ? 'Prejemnik' : 'Customer'}: ${buyer}`, width)) sections.push(text(row), lineFeed())
  }
  if (bill.billingTarget === 'COMPANY' && bill.recipientCompany) {
    const recipientAddress = [
      bill.recipientCompany.address,
      [bill.recipientCompany.postalCode, bill.recipientCompany.city].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ')
    for (const row of wrapText(recipientAddress, width)) sections.push(text(row), lineFeed())
    if (bill.recipientCompany.vatId) {
      for (const row of wrapText(`${locale === 'sl' ? 'Davcna st.' : 'VAT ID'}: ${bill.recipientCompany.vatId}`, width)) sections.push(text(row), lineFeed())
    }
  }
  const paymentDeadlineDays = Math.max(0, Number.parseInt(settings.PAYMENT_DEADLINE_DAYS || '0', 10) || 0)
  if (paymentDeadlineDays > 0 && bill.issueDate) {
    const due = new Date(`${String(bill.issueDate).slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(due.getTime())) {
      due.setDate(due.getDate() + paymentDeadlineDays)
      const dueLabel = new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(due)
      sections.push(text(padColumns(locale === 'sl' ? 'Rok placila' : 'Due date', dueLabel, width)), lineFeed())
    }
  }
  const consultant = [bill.consultant?.firstName, bill.consultant?.lastName].filter(Boolean).join(' ')
  if (consultant && prefs.template === 'DETAILED') {
    for (const row of wrapText(`${locale === 'sl' ? 'Izdal' : 'Issued by'}: ${consultant}`, width)) sections.push(text(row), lineFeed())
  }

  sections.push(text(divider), lineFeed())
  sections.push(bold(true), text(padColumns(locale === 'sl' ? 'Artikel' : 'Item', locale === 'sl' ? 'Znesek' : 'Amount', width)), lineFeed(), bold(false))

  for (const item of bill.items ?? []) {
    const name = sanitizeReceiptText(item.transactionService?.description || item.transactionService?.code || (locale === 'sl' ? 'Storitev' : 'Service'))
    const quantity = Math.max(1, Number(item.quantity || 1))
    const total = Number(item.grossPrice || 0)
    const amount = money(total)
    const itemLines = wrapText(name, Math.max(8, width - amount.length - 2))
    if (itemLines.length === 0) itemLines.push(locale === 'sl' ? 'Storitev' : 'Service')
    sections.push(text(padColumns(itemLines[0], amount, width)), lineFeed())
    for (const continuation of itemLines.slice(1)) sections.push(text(continuation), lineFeed())
    if (prefs.template === 'DETAILED' && quantity !== 1) {
      sections.push(text(`  ${quantity} x ${money(Number(item.grossPrice || 0) / quantity)} EUR`), lineFeed())
    }
  }

  sections.push(text(divider), lineFeed())
  const taxes = taxRows(bill)
  for (const row of taxes) {
    const rateLabel = row.rate === 0 ? (locale === 'sl' ? 'Brez DDV' : 'VAT exempt') : `DDV ${String(row.rate).replace('.', ',')}%`
    sections.push(text(padColumns(`${rateLabel} ${locale === 'sl' ? 'osnova' : 'base'}`, money(row.net), width)), lineFeed())
    if (row.rate !== 0) sections.push(text(padColumns(rateLabel, money(row.tax), width)), lineFeed())
  }

  sections.push(bold(true), textSize(2, 2), align(0))
  const totalLabel = locale === 'sl' ? 'SKUPAJ' : 'TOTAL'
  // Double-width mode halves the character capacity.
  sections.push(text(padColumns(totalLabel, `${money(bill.totalGross)}`, Math.floor(width / 2))), lineFeed())
  sections.push(textSize(1, 1), bold(false))
  sections.push(text(padColumns('', 'EUR', width)), lineFeed())

  for (const payment of paymentLines(bill, locale)) {
    sections.push(text(padColumns(payment.label, payment.amount != null ? money(payment.amount) : '', width)), lineFeed())
  }
  const hasBankTransfer = bill.paymentMethod?.paymentType === 'BANK_TRANSFER'
    || (bill.paymentSplits ?? []).some((split) => split.paymentMethod?.paymentType === 'BANK_TRANSFER')
  if (hasBankTransfer) {
    const iban = bill.issuer?.iban || settings.COMPANY_IBAN
    if (iban) {
      for (const row of wrapText(`IBAN: ${iban}`, width)) sections.push(text(row), lineFeed())
    }
  }
  if (bill.bankTransferReference) {
    for (const row of wrapText(`${locale === 'sl' ? 'Referenca' : 'Reference'}: ${bill.bankTransferReference}`, width)) sections.push(text(row), lineFeed())
  }

  if (bill.fiscalZoi || bill.fiscalEor) {
    sections.push(text(divider), lineFeed())
    if (bill.fiscalZoi) {
      for (const row of wrapText(`ZOI: ${bill.fiscalZoi}`, width)) sections.push(text(row), lineFeed())
    }
    if (bill.fiscalEor) {
      for (const row of wrapText(`EOR: ${bill.fiscalEor}`, width)) sections.push(text(row), lineFeed())
    }
  }

  if (prefs.printQr && options?.paymentQrPayload) {
    sections.push(lineFeed(), align(1), buildQrCommand(options.paymentQrPayload, prefs.paperWidthMm === 80 ? 4 : 3), lineFeed())
    sections.push(text(locale === 'sl' ? 'Skeniraj in placaj' : 'Scan and pay'), lineFeed())
  }

  if (prefs.printQr && bill.fiscalQr) {
    sections.push(lineFeed(), align(1), buildQrCommand(bill.fiscalQr, prefs.paperWidthMm === 80 ? 6 : 5), lineFeed())
  }

  sections.push(align(1), text(locale === 'sl' ? 'Hvala za obisk!' : 'Thank you!'), lineFeed())
  sections.push(text('www.calendra.si'), lineFeed(), lineFeed(), lineFeed())
  if (prefs.autoCut) sections.push(command(GS, 0x56, 0x00))
  else sections.push(command(ESC, 0x64, 0x03))
  return concatBytes(...sections)
}

export async function sendEscPosBytes(
  port: WebSerialPortLike,
  bytes: Uint8Array,
  baudRate = POS_DEFAULT_BAUD_RATE,
): Promise<void> {
  let openedHere = false
  try {
    // Calling open() on an already-open port throws InvalidStateError. We deliberately
    // attempt it and continue when the port already has readable/writable streams.
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
      await writer.write(bytes)
    } finally {
      writer.releaseLock()
    }
  } finally {
    if (openedHere) {
      try { await port.close() } catch { /* Keep print failure handling with the caller. */ }
    }
  }
}
