import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { Field, PageHeader } from '../components/ui'
import { useLocale, type AppLocale } from '../locale'
import '../styles/folio-layout-editor.css'

/* ── Types mirroring backend FolioLayoutConfig ── */

type LocalizedText = {
  en?: string
  sl?: string
}

type DateFormat = 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'DD.MM.YYYY' | 'YYYY-MM-DD HH:mm' | 'DD-MM-YYYY HH:mm' | 'DD.MM.YYYY HH:mm'

type PageSectionsConfig = {
  headerHeight: number
  footerHeight: number
}

type FieldConfig = {
  key: string
  group: string
  label: string
  labelI18n?: LocalizedText
  /** Optional localized prefix rendered inside a data block, left of the value. */
  prefixI18n?: LocalizedText
  /** Optional display format for data fields that contain dates. */
  dateFormat?: DateFormat
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  bold: boolean
  alignment: 'left' | 'center' | 'right'
  visible: boolean
  type?: 'data' | 'custom'
  text?: string
  textI18n?: LocalizedText
}

type LogoConfig = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

type ColumnConfig = {
  key: string
  label: string
  labelI18n?: LocalizedText
  /** Optional display format for table date column values. */
  dateFormat?: DateFormat
  relX: number
  width: number
  alignment: 'left' | 'right'
}

type TableConfig = {
  startX: number
  startY: number
  width: number
  rowHeight: number
  headerHeight: number
  headerFontSize: number
  bodyFontSize: number
  footerSpacing: number
  columns: ColumnConfig[]
}

type FooterItem = {
  key: string
  label: string
  labelI18n?: LocalizedText
  fontSize: number
  bold: boolean
  alignment: 'left' | 'right'
  x: number
  y: number
  width: number
  height: number
}

type FooterConfig = {
  gapAfterTable: number
  lineSpacing: number
  items: FooterItem[]
}

type SignatureConfig = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

type PaymentQrConfig = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

type VatBreakdownTableConfig = {
  x: number
  y: number
  width: number
  headerHeight: number
  rowHeight: number
  headerFontSize: number
  bodyFontSize: number
  visible: boolean
}

type LayoutConfig = {
  pageWidth: number
  pageHeight: number
  pageSections: PageSectionsConfig
  fields: FieldConfig[]
  table: TableConfig
  footer: FooterConfig
  logo: LogoConfig
  signature: SignatureConfig
  paymentQr: PaymentQrConfig
  fiscalQr: PaymentQrConfig
  vatBreakdownTable: VatBreakdownTableConfig
}

type FolioLayoutStyle = {
  id: string
  name: string
  description?: string | null
  layout: LayoutConfig
  createdAt?: string | null
  updatedAt?: string | null
}

type Selection =
  | { type: 'field'; index: number }
  | { type: 'table' }
  | { type: 'footer'; index: number }
  | { type: 'logo' }
  | { type: 'signature' }
  | { type: 'paymentQr' }
  | { type: 'fiscalQr' }
  | { type: 'vatBreakdownTable' }
  | { type: 'advancePaymentsTable' }
  | { type: 'pageSections' }
  | null

const GROUP_COLORS: Record<string, string> = {
  header: 'var(--fle-group-header)',
  document: 'var(--fle-group-document)',
  recipient: 'var(--fle-group-recipient)',
  custom: 'var(--fle-group-custom)',
}

const DEFAULT_PAGE_SECTIONS: PageSectionsConfig = { headerHeight: 200, footerHeight: 90 }
const DEFAULT_LOGO: LogoConfig = { x: 400, y: 40, width: 120, height: 60, visible: true }
const DEFAULT_SIGNATURE: SignatureConfig = { x: 50, y: 464, width: 120, height: 50, visible: true }
const DEFAULT_PAYMENT_QR: PaymentQrConfig = { x: 395, y: 356, width: 120, height: 120, visible: true }
const DEFAULT_FISCAL_QR: PaymentQrConfig = { x: 395, y: 484, width: 95, height: 95, visible: true }
const PAYMENT_QR_CAPTION: Record<AppLocale, string> = { en: 'Scan and pay.', sl: 'Skeniraj in plačaj.' }
const DEFAULT_VAT_BREAKDOWN_TABLE: VatBreakdownTableConfig = { x: 50, y: 286, width: 300, headerHeight: 14, rowHeight: 14, headerFontSize: 7, bodyFontSize: 7, visible: true }
const SERVICE_TABLE_PREVIEW_ROWS = 1
const LEGACY_SERVICE_TABLE_PREVIEW_ROWS = 3
const VAT_SAMPLE_ROWS = 3
const ADVANCE_PAYMENT_SAMPLE_ROWS = 1
const OTHER_LOCALE: Record<AppLocale, AppLocale> = { en: 'sl', sl: 'en' }
const DATE_FIELD_KEYS = new Set(['folioDate', 'dateOfService', 'dueDate'])
const PREFIX_FIELD_KEYS = new Set(['folioNumber', 'folioDate', 'dateOfService', 'dueDate', 'recipientVatId'])
const DATE_FORMAT_OPTIONS: DateFormat[] = ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD HH:mm', 'DD-MM-YYYY HH:mm', 'DD.MM.YYYY HH:mm']
const DOCUMENT_PREFIX_DEFAULTS: Record<string, LocalizedText> = {
  folioNumber: { en: 'Invoice:', sl: 'Račun:' },
  folioDate: { en: 'Issue date and time:', sl: 'Datum in ura izdaje:' },
  dateOfService: { en: 'Date of Service:', sl: 'Datum storitve:' },
  dueDate: { en: 'Due Date:', sl: 'Rok plačila:' },
  recipientVatId: { en: 'Recipient VAT ID:', sl: 'Davčna številka prejemnika (ID za DDV):' },
}
const FIELD_SAMPLE_VALUES: Record<string, string> = {
  companyPostalCodeCity: '1000 Ljubljana',
  recipientPostalCodeCity: '1000 Ljubljana',
  folioNumber: '0000',
  folioDate: '2026-05-26 14:30',
  dateOfService: '2026-05-26',
  dueDate: '2026-05-26',
  recipientVatId: 'SI12345678',
}

function isDateField(field: FieldConfig) {
  return field.type !== 'custom' && DATE_FIELD_KEYS.has(field.key)
}

function isPrefixField(field: FieldConfig) {
  return field.type !== 'custom' && PREFIX_FIELD_KEYS.has(field.key)
}

function defaultDateFormatForField(key: string): DateFormat {
  return key === 'folioDate' ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'
}

function isLegacyFolioNumberPrefix(value: string | undefined): boolean {
  const normalized = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[:]/g, '')
    .replace(/č/g, 'c')
    .replace(/š/g, 's')
    .trim()
  return normalized === 'folio number' || normalized === 'stevilka racuna' || normalized === 'st racuna'
}

function folioNumberSamplePrefix(locale: AppLocale): string {
  return locale === 'sl' ? 'Račun:' : 'Invoice:'
}

function resolveLocalizedText(i18n: LocalizedText | undefined, legacy: string | undefined, locale: AppLocale): string {
  const primary = (i18n?.[locale] || '').trim()
  if (primary) return primary
  const fallback = (legacy || '').trim()
  if (fallback) return fallback
  return (i18n?.[OTHER_LOCALE[locale]] || '').trim()
}

function ensureLocalizedText(i18n: LocalizedText | undefined, legacy: string | undefined): LocalizedText {
  const fallback = (legacy || '').trim()
  return {
    en: (i18n?.en || '').trim() || fallback,
    sl: (i18n?.sl || '').trim() || fallback,
  }
}


function migratePostalCityFields(layout: LayoutConfig) {
  migratePostalCityField(layout, 'companyPostalCode', 'companyCity', 'companyPostalCodeCity', 'header', 'Postal Code & City')
  migratePostalCityField(layout, 'recipientPostalCode', 'recipientCity', 'recipientPostalCodeCity', 'recipient', 'Recipient Postal Code & City')
}

function servicesTableVisualHeight(table: TableConfig, rows: number) {
  // End the services-table block at the bottom double line instead of keeping
  // the old invisible footer-spacing gap below it.
  return Math.max(0, table.headerHeight + table.rowHeight * Math.max(0, rows) - 7)
}

function servicesTableBottom(layout: LayoutConfig, rows: number) {
  const table = layout.table
  return table.startY + servicesTableVisualHeight(table, rows)
}

function advancePaymentsPreviewTop(layout: LayoutConfig) {
  return servicesTableBottom(layout, SERVICE_TABLE_PREVIEW_ROWS) + 16
}

function advancePaymentsPreviewHeight(table: TableConfig, rows: number) {
  return 18 + table.headerHeight + table.rowHeight * Math.max(1, rows) + 6
}

function normalizePageSections(layout: LayoutConfig) {
  if (!layout.pageSections) layout.pageSections = { ...DEFAULT_PAGE_SECTIONS }
  const maxCombined = Math.max(120, layout.pageHeight - 180)
  layout.pageSections.headerHeight = Math.max(0, Math.min(layout.pageHeight - 80, Number(layout.pageSections.headerHeight ?? DEFAULT_PAGE_SECTIONS.headerHeight)))
  layout.pageSections.footerHeight = Math.max(0, Math.min(layout.pageHeight - 80, Number(layout.pageSections.footerHeight ?? DEFAULT_PAGE_SECTIONS.footerHeight)))
  const combined = layout.pageSections.headerHeight + layout.pageSections.footerHeight
  if (combined > maxCombined) {
    layout.pageSections.footerHeight = Math.max(0, layout.pageSections.footerHeight - (combined - maxCombined))
  }
}

function isFixedPageSectionBlock(layout: LayoutConfig, y: number, height: number) {
  const blockBottom = y + Math.max(0, height || 0)
  const headerBottom = layout.pageSections?.headerHeight ?? 0
  const footerTop = layout.pageHeight - (layout.pageSections?.footerHeight ?? 0)
  return blockBottom <= headerBottom || y >= footerTop
}

function migrateLegacyServicesTableBaseline(layout: LayoutConfig) {
  if (!layout?.table) return
  const oldBottom = servicesTableBottom(layout, LEGACY_SERVICE_TABLE_PREVIEW_ROWS)
  const newBottom = servicesTableBottom(layout, SERVICE_TABLE_PREVIEW_ROWS)
  const delta = oldBottom - newBottom
  if (delta <= 0 || !looksLikeLegacyServicesBaseline(layout, oldBottom)) return

  layout.fields?.forEach((field) => {
    if (field && field.y >= oldBottom && !isFixedPageSectionBlock(layout, field.y, field.height)) field.y -= delta
  })
  layout.footer?.items?.forEach((item) => {
    if (item && item.y >= oldBottom && !isFixedPageSectionBlock(layout, item.y, item.height)) item.y -= delta
  })
  shiftQrIfBelow(layout, layout.paymentQr, oldBottom, delta)
  shiftQrIfBelow(layout, layout.fiscalQr, oldBottom, delta)
  if (layout.signature && layout.signature.y >= oldBottom && !isFixedPageSectionBlock(layout, layout.signature.y, layout.signature.height)) layout.signature.y -= delta
  if (layout.vatBreakdownTable && layout.vatBreakdownTable.y >= oldBottom && !isFixedPageSectionBlock(layout, layout.vatBreakdownTable.y, layout.vatBreakdownTable.headerHeight + layout.vatBreakdownTable.rowHeight * VAT_SAMPLE_ROWS)) layout.vatBreakdownTable.y -= delta
}

function looksLikeLegacyServicesBaseline(layout: LayoutConfig, oldBottom: number) {
  const nearLimit = oldBottom + Math.max(45, layout.table.rowHeight * 2.5)
  const vatY = layout.vatBreakdownTable?.y
  return vatY != null && vatY >= oldBottom && vatY <= nearLimit
}

function shiftQrIfBelow(layout: LayoutConfig, qr: PaymentQrConfig | undefined, oldBottom: number, delta: number) {
  if (qr && qr.y >= oldBottom && !isFixedPageSectionBlock(layout, qr.y, qr.height)) qr.y -= delta
}

function migratePostalCityField(
  layout: LayoutConfig,
  postalKey: string,
  cityKey: string,
  combinedKey: string,
  group: string,
  label: string,
) {
  if (!Array.isArray(layout.fields)) return
  const existingCombined = layout.fields.find((field) => field?.key === combinedKey)
  const postal = layout.fields.find((field) => field?.key === postalKey)
  const city = layout.fields.find((field) => field?.key === cityKey)

  if (existingCombined) {
    existingCombined.label = label
    existingCombined.labelI18n = ensureLocalizedText(existingCombined.labelI18n, label)
    existingCombined.labelI18n.en = existingCombined.labelI18n.en || label
    layout.fields = layout.fields.filter((field) => field?.key !== postalKey && field?.key !== cityKey)
    return
  }

  if (!postal && !city) return

  const anchor = postal || city!
  const other = postal ? city : postal
  const originalIndex = Math.min(
    ...[postalKey, cityKey]
      .map((key) => layout.fields.findIndex((field) => field?.key === key))
      .filter((idx) => idx >= 0),
  )
  let x = anchor.x
  let y = anchor.y
  let width = Math.max(anchor.width || 0, 200)
  let height = anchor.height
  let visible = anchor.visible !== false

  if (other) {
    x = Math.min(anchor.x, other.x)
    y = Math.min(anchor.y, other.y)
    width = Math.max(200, Math.max(anchor.x + anchor.width, other.x + other.width) - x)
    height = Math.max(anchor.height, other.height)
    visible = anchor.visible !== false || other.visible !== false
  }

  const combined: FieldConfig = {
    ...anchor,
    key: combinedKey,
    group,
    label,
    labelI18n: { en: label, sl: label },
    x,
    y,
    width,
    height,
    visible,
  }

  layout.fields = layout.fields.filter((field) => field?.key !== postalKey && field?.key !== cityKey)
  layout.fields.splice(Math.min(originalIndex, layout.fields.length), 0, combined)
}

function migrateLegacyFooterForDiscount(data: LayoutConfig) {
  const items = data.footer?.items
  if (!items) return
  const hasDiscount = items.some((item) => item?.key === 'discount')
  const hasUsedAdvances = items.some((item) => item?.key === 'usedAdvances')
  if (!hasDiscount) {
    items.forEach((item) => {
      if (!item || item.key !== 'toBePaid') return
      if (Math.abs((item.x ?? 0) - 395) <= 2 && Math.abs((item.y ?? 0) - 340) <= 2) {
        item.y = 358
      }
    })
  }
  if (!hasUsedAdvances) {
    items.forEach((item) => {
      if (!item) return
      if (item.key === 'toBePaid' && Math.abs((item.x ?? 0) - 395) <= 2 && Math.abs((item.y ?? 0) - 358) <= 2) {
        item.y = 376
      }
      if (item.key === 'payment' && Math.abs((item.x ?? 0) - 395) <= 2 && Math.abs((item.y ?? 0) - 382) <= 2) {
        item.y = 400
      }
    })
  }
  items.forEach((item) => {
    if (!item || item.key !== 'payment') return
    if (Math.abs((item.x ?? 0) - 395) <= 2 && Math.abs((item.y ?? 0) - 304) <= 2) {
      item.y = 400
    }
  })
}

function addMissingFooterItemFront(data: LayoutConfig, key: string) {
  const items = data.footer?.items
  if (!items) return
  if (items.some((item) => item?.key === key)) return
  const defaults: FooterItem[] = [
    { key: 'totalNett', label: 'Total excl. VAT', labelI18n: { en: 'Total excl. VAT', sl: 'Skupaj brez DDV' }, fontSize: 11, bold: true, alignment: 'right', x: 395, y: 304, width: 150, height: 16 },
    { key: 'discount', label: 'Discount', labelI18n: { en: 'Discount', sl: 'Popust' }, fontSize: 11, bold: true, alignment: 'right', x: 395, y: 322, width: 150, height: 16 },
    { key: 'totalGross', label: 'Total incl. VAT', labelI18n: { en: 'Total incl. VAT', sl: 'Skupaj z DDV' }, fontSize: 11, bold: true, alignment: 'right', x: 395, y: 340, width: 150, height: 16 },
    { key: 'usedAdvances', label: 'Used advances', labelI18n: { en: 'Used advances', sl: 'Uporabljena predplačila' }, fontSize: 10, bold: false, alignment: 'right', x: 395, y: 358, width: 150, height: 16 },
    { key: 'toBePaid', label: 'To be paid', labelI18n: { en: 'To be paid', sl: 'Za plačilo' }, fontSize: 11, bold: true, alignment: 'right', x: 395, y: 376, width: 150, height: 16 },
    { key: 'payment', label: 'Payment', labelI18n: { en: 'Payment', sl: 'Plačilo' }, fontSize: 10, bold: false, alignment: 'right', x: 395, y: 400, width: 150, height: 16 },
    { key: 'notes', label: 'Notes', labelI18n: { en: 'Notes', sl: 'Opombe' }, fontSize: 9, bold: false, alignment: 'left', x: 50, y: 362, width: 300, height: 16 },
    { key: 'iban', label: 'IBAN', labelI18n: { en: 'IBAN', sl: 'IBAN' }, fontSize: 10, bold: false, alignment: 'left', x: 50, y: 380, width: 300, height: 16 },
    { key: 'issuedBy', label: 'Issued by', labelI18n: { en: 'Issued by', sl: 'Izdal' }, fontSize: 10, bold: false, alignment: 'left', x: 50, y: 398, width: 200, height: 16 },
    { key: 'fiscalZoi', label: 'ZOI', labelI18n: { en: 'ZOI', sl: 'ZOI' }, fontSize: 8, bold: false, alignment: 'left', x: 50, y: 418, width: 300, height: 14 },
    { key: 'fiscalEor', label: 'EOR', labelI18n: { en: 'EOR', sl: 'EOR' }, fontSize: 8, bold: false, alignment: 'left', x: 50, y: 432, width: 300, height: 14 },
  ]
  const templateIndex = defaults.findIndex((item) => item.key === key)
  if (templateIndex < 0) return
  const template = defaults[templateIndex]
  let insertAt = items.length
  for (let i = 0; i < items.length; i += 1) {
    const currentKey = items[i]?.key
    const currentDefaultIndex = defaults.findIndex((item) => item.key === currentKey)
    if (currentDefaultIndex > templateIndex) {
      insertAt = i
      break
    }
  }
  items.splice(insertAt, 0, JSON.parse(JSON.stringify(template)) as FooterItem)
}

function isValidLayout(data: any): data is LayoutConfig {
  if (!data || Array.isArray(data) || !Array.isArray(data.fields) || !data.table || !data.footer) return false
  if (!data.pageSections) data.pageSections = { ...DEFAULT_PAGE_SECTIONS }
  normalizePageSections(data)
  if (!data.logo) data.logo = { ...DEFAULT_LOGO }
  if (!data.signature) data.signature = { ...DEFAULT_SIGNATURE }
  if (!data.paymentQr) data.paymentQr = { ...DEFAULT_PAYMENT_QR }
  if (!data.fiscalQr) data.fiscalQr = { ...DEFAULT_FISCAL_QR }
  if (!data.vatBreakdownTable) data.vatBreakdownTable = { ...DEFAULT_VAT_BREAKDOWN_TABLE }
  migratePostalCityFields(data)
  migrateLegacyServicesTableBaseline(data)
  for (const field of data.fields ?? []) {
    field.labelI18n = ensureLocalizedText(field.labelI18n, field.label)
    field.label = resolveLocalizedText(field.labelI18n, field.label, 'en')
    if (isPrefixField(field)) {
      const defaults = DOCUMENT_PREFIX_DEFAULTS[field.key] || { en: '', sl: '' }
      field.prefixI18n = {
        en: (field.prefixI18n?.en || '').trim() || defaults.en,
        sl: (field.prefixI18n?.sl || '').trim() || defaults.sl,
      }
      if (field.key === 'folioNumber') {
        if (isLegacyFolioNumberPrefix(field.prefixI18n.en)) field.prefixI18n.en = defaults.en
        if (isLegacyFolioNumberPrefix(field.prefixI18n.sl)) field.prefixI18n.sl = defaults.sl
      }
      if (field.key === 'folioDate' && (!field.label || field.label === 'Issue Date')) field.label = 'Issue date and time'
      if (field.key === 'folioDate') {
        field.labelI18n = ensureLocalizedText(field.labelI18n, field.label)
        if (!field.labelI18n.en || field.labelI18n.en === 'Issue Date') field.labelI18n.en = 'Issue date and time'
        if (!field.labelI18n.sl || field.labelI18n.sl === 'Datum izdaje') field.labelI18n.sl = 'Datum in ura izdaje'
      }
    }
    if (isDateField(field) && !field.dateFormat) field.dateFormat = defaultDateFormatForField(field.key)
    if (field.key === 'folioDate' && field.dateFormat === 'YYYY-MM-DD') field.dateFormat = 'YYYY-MM-DD HH:mm'
    if (field.type === 'custom') {
      field.textI18n = ensureLocalizedText(field.textI18n, field.text || field.label)
      field.text = resolveLocalizedText(field.textI18n, field.text || field.label, 'en')
    }
  }
  for (const col of data.table?.columns ?? []) {
    col.labelI18n = ensureLocalizedText(col.labelI18n, col.label)
    col.label = resolveLocalizedText(col.labelI18n, col.label, 'en')
    if (col.key === 'date' && !col.dateFormat) col.dateFormat = 'YYYY-MM-DD'
  }
  // Migrate legacy footer totals block and ensure newly supported footer items exist.
  migrateLegacyFooterForDiscount(data)
  addMissingFooterItemFront(data, 'totalNett')
  addMissingFooterItemFront(data, 'discount')
  addMissingFooterItemFront(data, 'usedAdvances')
  addMissingFooterItemFront(data, 'toBePaid')
  addMissingFooterItemFront(data, 'fiscalZoi')
  addMissingFooterItemFront(data, 'fiscalEor')
  // Migrate footer items without x/y to have default positions
  for (const item of data.footer?.items ?? []) {
    item.labelI18n = ensureLocalizedText(item.labelI18n, item.label)
    item.label = resolveLocalizedText(item.labelI18n, item.label, 'en')
    if (item.x == null || item.x < 0) item.x = -1
    if (item.y == null || item.y < 0) item.y = -1
    if (item.width == null || item.width < 0) item.width = -1
    if (item.height == null || item.height < 0) item.height = -1
  }
  return true
}

const SNAP = 5

function snapVal(v: number, enabled: boolean) {
  return enabled ? Math.round(v / SNAP) * SNAP : Math.round(v * 10) / 10
}

export function FolioLayoutEditor() {
  const { locale } = useLocale()
  const [layout, setLayout] = useState<LayoutConfig | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [zoom, setZoom] = useState(1)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [folioStyles, setFolioStyles] = useState<FolioLayoutStyle[]>([])
  const [selectedStyleId, setSelectedStyleId] = useState('')
  const [styleName, setStyleName] = useState('')
  const [styleDescription, setStyleDescription] = useState('')
  const [styleSaving, setStyleSaving] = useState(false)
  const [styleNotice, setStyleNotice] = useState<string | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(() => getStoredUser()?.role === 'SUPER_ADMIN')
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    kind: 'move' | 'resize'
    sel: NonNullable<Selection>
    startMx: number
    startMy: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)

  const [loadError, setLoadError] = useState<string | null>(null)

  const loadFolioStyles = useCallback(async () => {
    try {
      const r = await api.get('/billing/folio-layout-styles')
      const list = Array.isArray(r.data) ? r.data : []
      const valid = list.filter((style: any): style is FolioLayoutStyle => Boolean(style?.id && style?.name && style?.layout && isValidLayout(style.layout)))
      setFolioStyles(valid)
      setSelectedStyleId((current) => current && valid.some((style) => style.id === current) ? current : '')
    } catch (err) {
      console.error('Failed to load folio layout styles', err)
      setFolioStyles([])
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get('/billing/folio-layout')
        let data = r.data
        if (typeof data === 'string') {
          try { data = JSON.parse(data) } catch { data = null }
        }
        if (isValidLayout(data)) {
          setLayout(data)
          return
        }
        // Old/invalid format stored in DB -- reset to default
        console.warn('[FolioLayoutEditor] Stored layout has wrong shape, resetting to default')
        const del = await api.delete('/billing/folio-layout')
        let fresh = del.data
        if (typeof fresh === 'string') {
          try { fresh = JSON.parse(fresh) } catch { fresh = null }
        }
        if (isValidLayout(fresh)) {
          setLayout(fresh)
        } else {
          setLoadError('Could not load a valid layout from the server.')
        }
      } catch (err: any) {
        console.error('Failed to load folio layout', err)
        setLoadError(`Failed to load layout: ${err?.response?.status === 404 ? 'endpoint not found — is the backend updated?' : (err?.message || 'unknown error')}`)
      }
    }
    void load()
    void loadFolioStyles()
    api.get('/auth/me').then((r) => {
      const role = r.data?.user?.role
      setIsPlatformAdmin(role === 'SUPER_ADMIN')
    }).catch(() => { /* keep stored role fallback */ })
    api.get('/billing/folio-logo').then((r) => {
      if (r.status === 200 && r.data) setLogoDataUrl(r.data as string)
    }).catch(() => { /* no logo */ })
    api.get('/billing/folio-signature').then((r) => {
      if (r.status === 200 && r.data) setSignatureDataUrl(r.data as string)
    }).catch(() => { /* no signature */ })
  }, [loadFolioStyles])

  const save = async () => {
    if (!layout) return
    setSaving(true)
    try {
      await api.put('/billing/folio-layout', layout)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    try {
      const { data } = await api.delete('/billing/folio-layout')
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      if (isValidLayout(parsed)) {
        setLayout(parsed)
        setSelection(null)
        setDirty(false)
      }
    } catch (err) {
      console.error('Failed to reset folio layout', err)
    }
  }

  const exportJson = () => {
    if (!layout) return
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'folio-layout.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const parsed = JSON.parse(text) as LayoutConfig
        if (isValidLayout(parsed)) {
          setLayout(parsed)
          setDirty(true)
          setSelection(null)
        }
      } catch { /* ignore bad files */ }
    }
    input.click()
  }

  const selectFolioStyle = (id: string) => {
    setSelectedStyleId(id)
    const style = folioStyles.find((item) => item.id === id)
    if (style) {
      setStyleName(style.name || '')
      setStyleDescription(style.description || '')
    } else if (!id) {
      setStyleName('')
      setStyleDescription('')
    }
  }

  const loadSelectedFolioStyle = () => {
    const style = folioStyles.find((item) => item.id === selectedStyleId)
    if (!style?.layout) return
    const next = JSON.parse(JSON.stringify(style.layout)) as LayoutConfig
    if (!isValidLayout(next)) return
    setLayout(next)
    setSelection(null)
    setDirty(true)
    setStyleNotice(`Loaded “${style.name}”. Click Save to apply it to this tenant.`)
  }

  const savePlatformFolioStyle = async (mode: 'create' | 'update') => {
    if (!layout || !isPlatformAdmin) return
    const name = styleName.trim()
    if (!name) {
      setStyleNotice('Enter a style name first.')
      return
    }
    const id = mode === 'update' ? selectedStyleId : undefined
    if (mode === 'update' && !id) {
      setStyleNotice('Select a style to update first.')
      return
    }
    setStyleSaving(true)
    try {
      const { data } = await api.post('/billing/folio-layout-styles', {
        id,
        name,
        description: styleDescription.trim(),
        layout,
      })
      const list = Array.isArray(data) ? data : []
      const valid = list.filter((style: any): style is FolioLayoutStyle => Boolean(style?.id && style?.name && style?.layout && isValidLayout(style.layout)))
      setFolioStyles(valid)
      const saved = (id ? valid.find((style) => style.id === id) : null)
        || [...valid].reverse().find((style) => style.name === name)
      if (saved) {
        setSelectedStyleId(saved.id)
        setStyleName(saved.name)
        setStyleDescription(saved.description || '')
        setStyleNotice(mode === 'update' ? `Updated platform style “${saved.name}”.` : `Saved platform style “${saved.name}”.`)
      }
    } catch (err) {
      console.error('Failed to save platform folio style', err)
      setStyleNotice('Could not save the platform folio style.')
    } finally {
      setStyleSaving(false)
    }
  }

  const deleteSelectedPlatformFolioStyle = async () => {
    if (!selectedStyleId || !isPlatformAdmin) return
    const style = folioStyles.find((item) => item.id === selectedStyleId)
    setStyleSaving(true)
    try {
      const { data } = await api.delete(`/billing/folio-layout-styles/${encodeURIComponent(selectedStyleId)}`)
      const list = Array.isArray(data) ? data : []
      const valid = list.filter((item: any): item is FolioLayoutStyle => Boolean(item?.id && item?.name && item?.layout && isValidLayout(item.layout)))
      setFolioStyles(valid)
      setSelectedStyleId('')
      setStyleName('')
      setStyleDescription('')
      setStyleNotice(style ? `Deleted platform style “${style.name}”.` : 'Deleted platform style.')
    } catch (err) {
      console.error('Failed to delete platform folio style', err)
      setStyleNotice('Could not delete the platform folio style.')
    } finally {
      setStyleSaving(false)
    }
  }

  const mutateLayout = useCallback((fn: (l: LayoutConfig) => void) => {
    setLayout((prev) => {
      if (!prev) return prev
      const next = JSON.parse(JSON.stringify(prev)) as LayoutConfig
      fn(next)
      return next
    })
    setDirty(true)
  }, [])

  const uploadLogo = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await api.post('/billing/folio-logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        setLogoDataUrl(r.data as string)
      } catch (err: any) {
        console.error('Logo upload failed', err)
      }
    }
    input.click()
  }

  const removeLogo = async () => {
    try {
      await api.delete('/billing/folio-logo')
      setLogoDataUrl(null)
    } catch (err) {
      console.error('Logo delete failed', err)
    }
  }

  const uploadSignature = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await api.post('/billing/folio-signature', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        setSignatureDataUrl(r.data as string)
        setLayout((prev) => {
          if (!prev) return prev
          const next = { ...prev, signature: { ...prev.signature, visible: true } }
          void api.put('/billing/folio-layout', next).catch((err) => {
            console.error('Failed to persist signature visibility', err)
          })
          return next
        })
        setDirty(false)
      } catch (err: any) {
        console.error('Signature upload failed', err)
      }
    }
    input.click()
  }

  const removeSignature = async () => {
    try {
      await api.delete('/billing/folio-signature')
      setSignatureDataUrl(null)
    } catch (err) {
      console.error('Signature delete failed', err)
    }
  }

  const addCustomField = () => {
    if (!layout) return
    const existingCustom = layout.fields.filter((f) => f.type === 'custom')
    const idx = existingCustom.length + 1
    mutateLayout((l) => {
      l.fields.push({
        key: `custom_${Date.now()}`,
        group: 'custom',
        label: `Text ${idx}`,
        labelI18n: { en: `Text ${idx}`, sl: `Besedilo ${idx}` },
        x: 200,
        y: 200,
        width: 150,
        height: 16,
        fontSize: 10,
        bold: false,
        alignment: 'left',
        visible: true,
        type: 'custom',
        text: `Text ${idx}`,
        textI18n: { en: `Text ${idx}`, sl: `Besedilo ${idx}` },
      })
    })
    setSelection({ type: 'field', index: layout.fields.length })
  }

  const deleteField = (index: number) => {
    mutateLayout((l) => { l.fields.splice(index, 1) })
    setSelection(null)
  }

  /* ── Pointer drag handling ── */

  const onPointerDown = useCallback(
    (e: React.PointerEvent, sel: NonNullable<Selection>, kind: 'move' | 'resize') => {
      if (!layout) return
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      let origX = 0, origY = 0, origW = 0, origH = 0
      if (sel.type === 'field') {
        const f = layout.fields[sel.index]
        origX = f.x; origY = f.y; origW = f.width; origH = f.height
      } else if (sel.type === 'table') {
        origX = layout.table.startX; origY = layout.table.startY
        origW = layout.table.width; origH = 100
      } else if (sel.type === 'logo') {
        const lg = layout.logo
        origX = lg.x; origY = lg.y; origW = lg.width; origH = lg.height
      } else if (sel.type === 'footer') {
        const fi = layout.footer.items[sel.index]
        origX = fi.x; origY = fi.y; origW = fi.width; origH = fi.height
      } else if (sel.type === 'signature') {
        const sg = layout.signature
        origX = sg.x; origY = sg.y; origW = sg.width; origH = sg.height
      } else if (sel.type === 'paymentQr') {
        const qr = layout.paymentQr
        origX = qr.x; origY = qr.y; origW = qr.width; origH = qr.height
      } else if (sel.type === 'fiscalQr') {
        const qr = layout.fiscalQr
        origX = qr.x; origY = qr.y; origW = qr.width; origH = qr.height
      } else if (sel.type === 'vatBreakdownTable') {
        const vt = layout.vatBreakdownTable
        origX = vt.x; origY = vt.y; origW = vt.width; origH = vt.headerHeight + vt.rowHeight * VAT_SAMPLE_ROWS
      }
      dragRef.current = { kind, sel, startMx: e.clientX, startMy: e.clientY, origX, origY, origW, origH }
      setSelection(sel)
    },
    [layout],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (!d || !layout) return
      const scale = zoom
      const dx = (e.clientX - d.startMx) / scale
      const dy = (e.clientY - d.startMy) / scale
      mutateLayout((l) => {
        if (d.sel.type === 'field') {
          const f = l.fields[d.sel.index]
          if (d.kind === 'move') {
            f.x = snapVal(d.origX + dx, snapEnabled)
            f.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            f.width = Math.max(20, snapVal(d.origW + dx, snapEnabled))
            f.height = Math.max(10, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'table') {
          if (d.kind === 'move') {
            l.table.startX = snapVal(d.origX + dx, snapEnabled)
            l.table.startY = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.table.width = Math.max(100, snapVal(d.origW + dx, snapEnabled))
          }
        } else if (d.sel.type === 'logo') {
          if (d.kind === 'move') {
            l.logo.x = snapVal(d.origX + dx, snapEnabled)
            l.logo.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.logo.width = Math.max(20, snapVal(d.origW + dx, snapEnabled))
            l.logo.height = Math.max(20, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'footer') {
          const fi = l.footer.items[d.sel.index]
          if (d.kind === 'move') {
            fi.x = snapVal(d.origX + dx, snapEnabled)
            fi.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            fi.width = Math.max(40, snapVal(d.origW + dx, snapEnabled))
            fi.height = Math.max(10, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'signature') {
          if (d.kind === 'move') {
            l.signature.x = snapVal(d.origX + dx, snapEnabled)
            l.signature.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.signature.width = Math.max(20, snapVal(d.origW + dx, snapEnabled))
            l.signature.height = Math.max(20, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'paymentQr') {
          if (d.kind === 'move') {
            l.paymentQr.x = snapVal(d.origX + dx, snapEnabled)
            l.paymentQr.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.paymentQr.width = Math.max(40, snapVal(d.origW + dx, snapEnabled))
            l.paymentQr.height = Math.max(40, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'fiscalQr') {
          if (d.kind === 'move') {
            l.fiscalQr.x = snapVal(d.origX + dx, snapEnabled)
            l.fiscalQr.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.fiscalQr.width = Math.max(40, snapVal(d.origW + dx, snapEnabled))
            l.fiscalQr.height = Math.max(40, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'vatBreakdownTable') {
          const vt = l.vatBreakdownTable
          if (d.kind === 'move') {
            vt.x = snapVal(d.origX + dx, snapEnabled)
            vt.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            vt.width = Math.max(160, snapVal(d.origW + dx, snapEnabled))
            const nextH = Math.max(vt.headerHeight + VAT_SAMPLE_ROWS * 8, snapVal(d.origH + dy, snapEnabled))
            vt.rowHeight = Math.max(8, Math.round(((nextH - vt.headerHeight) / VAT_SAMPLE_ROWS) * 10) / 10)
          }
        }
      })
    },
    [layout, zoom, snapEnabled, mutateLayout],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  if (loadError) return <div className="fle-loading" style={{ color: '#f87171' }}>{loadError}</div>
  if (!layout) return <div className="fle-loading">Loading layout...</div>

  const scale = zoom
  const pw = layout.pageWidth * scale
  const ph = layout.pageHeight * scale

  const selectedField = selection?.type === 'field' ? layout.fields[selection.index] : null
  const selectedFooterItem = selection?.type === 'footer' ? layout.footer.items[selection.index] : null

  /* ── Render ── */

  return (
    <div className="fle-root">
      {/* Toolbar */}
      <div className="fle-toolbar">
        <label className="fle-toolbar-item fle-style-picker">
          Folio style
          <select className="fle-style-select" value={selectedStyleId} onChange={(e) => selectFolioStyle(e.target.value)}>
            <option value="">Select style...</option>
            {folioStyles.map((style) => (
              <option key={style.id} value={style.id}>{style.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="fle-btn" onClick={loadSelectedFolioStyle} disabled={!selectedStyleId}>Load style</button>
        {isPlatformAdmin && (
          <div className="fle-platform-style-tools">
            <input
              className="fle-style-input"
              type="text"
              value={styleName}
              onChange={(e) => setStyleName(e.target.value)}
              placeholder="Style name"
            />
            <input
              className="fle-style-input fle-style-input--wide"
              type="text"
              value={styleDescription}
              onChange={(e) => setStyleDescription(e.target.value)}
              placeholder="Description"
            />
            <button type="button" className="fle-btn fle-btn-add" onClick={() => savePlatformFolioStyle('create')} disabled={styleSaving || !layout}>Save as style</button>
            <button type="button" className="fle-btn" onClick={() => savePlatformFolioStyle('update')} disabled={styleSaving || !selectedStyleId || !layout}>Update style</button>
            <button type="button" className="fle-btn fle-btn-secondary" onClick={deleteSelectedPlatformFolioStyle} disabled={styleSaving || !selectedStyleId}>Delete style</button>
          </div>
        )}
        <label className="fle-toolbar-item">
          Zoom
          <input type="range" min={0.4} max={1.5} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          <span>{Math.round(zoom * 100)}%</span>
        </label>
        <label className="fle-toolbar-item fle-snap-toggle">
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
          Snap
        </label>
        <label className="fle-toolbar-item">
          Header
          <input
            className="fle-toolbar-number"
            type="number"
            min={0}
            max={Math.max(0, layout.pageHeight - layout.pageSections.footerHeight - 180)}
            value={Math.round(layout.pageSections.headerHeight)}
            onChange={(e) => mutateLayout((l) => { l.pageSections.headerHeight = Number(e.target.value); normalizePageSections(l) })}
          />
          pt
        </label>
        <label className="fle-toolbar-item">
          Footer
          <input
            className="fle-toolbar-number"
            type="number"
            min={0}
            max={Math.max(0, layout.pageHeight - layout.pageSections.headerHeight - 180)}
            value={Math.round(layout.pageSections.footerHeight)}
            onChange={(e) => mutateLayout((l) => { l.pageSections.footerHeight = Number(e.target.value); normalizePageSections(l) })}
          />
          pt
        </label>
        <div className="fle-toolbar-spacer" />
        <button type="button" className="fle-btn fle-btn-add" onClick={addCustomField}>+ Text field</button>
        <button type="button" className="fle-btn" onClick={importJson}>Import</button>
        <button type="button" className="fle-btn" onClick={exportJson}>Export</button>
        <button type="button" className="fle-btn fle-btn-secondary" onClick={reset}>Reset</button>
        <button type="button" className="fle-btn fle-btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {styleNotice && (
        <div className="fle-style-notice">
          <span>{styleNotice}</span>
          <button type="button" onClick={() => setStyleNotice(null)} aria-label="Dismiss style message">×</button>
        </div>
      )}

      <div className="fle-body">
        {/* A4 preview */}
        <div className="fle-canvas-wrap" ref={containerRef}>
          <div
            className="fle-canvas"
            style={{ width: pw, height: ph }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => setSelection(null)}
          >
            {/* Grid dots */}
            {snapEnabled && (
              <svg className="fle-grid" width={pw} height={ph}>
                {Array.from({ length: Math.floor(layout.pageWidth / 25) + 1 }, (_, i) =>
                  Array.from({ length: Math.floor(layout.pageHeight / 25) + 1 }, (_, j) => (
                    <circle key={`${i}-${j}`} cx={i * 25 * scale} cy={j * 25 * scale} r={0.5} fill="var(--fle-grid-dot)" />
                  )),
                )}
              </svg>
            )}

            {/* Ruler marks */}
            <div className="fle-ruler-top">
              {Array.from({ length: Math.floor(layout.pageWidth / 50) + 1 }, (_, i) => (
                <span key={i} className="fle-ruler-mark" style={{ left: i * 50 * scale }}>{i * 50}</span>
              ))}
            </div>
            <div className="fle-ruler-left">
              {Array.from({ length: Math.floor(layout.pageHeight / 50) + 1 }, (_, i) => (
                <span key={i} className="fle-ruler-mark" style={{ top: i * 50 * scale }}>{i * 50}</span>
              ))}
            </div>

            {/* Header / main / footer page spaces */}
            {(() => {
              const headerH = layout.pageSections.headerHeight
              const footerH = layout.pageSections.footerHeight
              const footerTop = layout.pageHeight - footerH
              const mainH = Math.max(0, footerTop - headerH)
              return (
                <>
                  <div className="fle-page-space fle-page-space--header" style={{ top: 0, height: headerH * scale }} onClick={(e) => { e.stopPropagation(); setSelection({ type: 'pageSections' }) }}>
                    <span>Header space</span>
                  </div>
                  <div className="fle-page-space fle-page-space--main" style={{ top: headerH * scale, height: mainH * scale }} onClick={(e) => { e.stopPropagation(); setSelection({ type: 'pageSections' }) }}>
                    <span>Main space</span>
                  </div>
                  <div className="fle-page-space fle-page-space--footer" style={{ top: footerTop * scale, height: footerH * scale }} onClick={(e) => { e.stopPropagation(); setSelection({ type: 'pageSections' }) }}>
                    <span>Footer space</span>
                  </div>
                </>
              )
            })()}

            {/* Logo overlay */}
            {layout.logo && (() => {
              const lg = layout.logo
              const isSel = selection?.type === 'logo'
              return (
                <div
                  className={`fle-logo ${isSel ? 'fle-logo--selected' : ''} ${!lg.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: lg.x * scale,
                    top: lg.y * scale,
                    width: lg.width * scale,
                    height: lg.height * scale,
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'logo' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'logo' }) }}
                >
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="Logo" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  ) : (
                    <span className="fle-logo-placeholder">Logo</span>
                  )}
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'logo' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}

            {/* Header / document / recipient / custom fields */}
            {layout.fields.map((f, idx) => {
              const isSel = selection?.type === 'field' && selection.index === idx
              const groupColor = GROUP_COLORS[f.group] || 'var(--fle-group-default)'
              const displayLabel = f.type === 'custom'
                ? resolveLocalizedText(f.textI18n, f.text || f.label, locale)
                : (FIELD_SAMPLE_VALUES[f.key] || resolveLocalizedText(f.labelI18n, f.label, locale))
              const prefixText = f.key === 'folioNumber'
                ? folioNumberSamplePrefix(locale)
                : (isPrefixField(f) ? resolveLocalizedText(f.prefixI18n, DOCUMENT_PREFIX_DEFAULTS[f.key]?.en || '', locale) : '') 
              return (
                <div
                  key={f.key}
                  className={`fle-field ${isSel ? 'fle-field--selected' : ''} ${!f.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: f.x * scale,
                    top: f.y * scale,
                    width: f.width * scale,
                    height: f.height * scale,
                    borderColor: groupColor,
                    fontSize: Math.max(8, f.fontSize * scale * 0.7),
                    fontWeight: f.bold ? 700 : 400,
                    textAlign: f.alignment,
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'field', index: idx }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'field', index: idx }) }}
                >
                  {prefixText ? (
                    <span className="fle-field-prefixed">
                      <span className="fle-field-prefix">{prefixText}</span>
                      <span className="fle-field-value">{displayLabel}</span>
                    </span>
                  ) : (
                    <span className="fle-field-label">{displayLabel}</span>
                  )}
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'field', index: idx }, 'resize') }}
                    />
                  )}
                </div>
              )
            })}

            {/* Table region */}
            {(() => {
              const t = layout.table
              const isSel = selection?.type === 'table'
              const sampleRows = SERVICE_TABLE_PREVIEW_ROWS
              const tableH = servicesTableVisualHeight(t, sampleRows)
              return (
                <div
                  className={`fle-table-region ${isSel ? 'fle-table-region--selected' : ''}`}
                  style={{
                    left: t.startX * scale,
                    top: t.startY * scale,
                    width: t.width * scale,
                    height: tableH * scale,
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'table' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'table' }) }}
                >
                  <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3 * scale, pointerEvents: 'none' }}>
                    <span style={{ position: 'absolute', left: 0, right: 0, top: 0, borderTop: '1px solid rgba(16, 185, 129, 0.65)' }} />
                    <span style={{ position: 'absolute', left: 0, right: 0, top: 2 * scale, borderTop: '1px solid rgba(16, 185, 129, 0.65)' }} />
                  </div>
                  <div className="fle-table-header" style={{ height: t.headerHeight * scale, paddingTop: 7 * scale, boxSizing: 'border-box' }}>
                    {t.columns.map((col) => (
                      <span key={col.key} className="fle-table-col-label" style={{
                        left: col.relX * scale,
                        width: col.width * scale,
                        textAlign: col.alignment,
                        fontSize: Math.max(7, t.headerFontSize * scale * 0.7),
                      }}>
                        {resolveLocalizedText(col.labelI18n, col.label, locale)}
                      </span>
                    ))}
                  </div>
                  {Array.from({ length: sampleRows }, (_, r) => (
                    <div key={r} className="fle-table-row" style={{ height: t.rowHeight * scale, top: (t.headerHeight + t.rowHeight * r) * scale }}>
                      {t.columns.map((col) => (
                        <span key={col.key} className="fle-table-col-cell" style={{
                          left: col.relX * scale,
                          width: col.width * scale,
                          textAlign: col.alignment,
                          fontSize: Math.max(7, t.bodyFontSize * scale * 0.7),
                        }}>
                          ---
                        </span>
                      ))}
                    </div>
                  ))}
                  <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: Math.max(0, (t.headerHeight + t.rowHeight * sampleRows - 10) * scale), height: 3 * scale, pointerEvents: 'none' }}>
                    <span style={{ position: 'absolute', left: 0, right: 0, top: 0, borderTop: '1px solid rgba(16, 185, 129, 0.65)' }} />
                    <span style={{ position: 'absolute', left: 0, right: 0, top: 2 * scale, borderTop: '1px solid rgba(16, 185, 129, 0.65)' }} />
                  </div>
                  <span className="fle-table-label">Services Table</span>
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'table' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}

            {/* Advance payments table preview */}
            {(() => {
              const t = layout.table
              const isSel = selection?.type === 'advancePaymentsTable'
              const x = t.startX
              const y = advancePaymentsPreviewTop(layout)
              const w = t.width
              const titleH = 18
              const headerH = Math.max(14, t.headerHeight)
              const rowH = Math.max(14, t.rowHeight)
              const h = advancePaymentsPreviewHeight(t, ADVANCE_PAYMENT_SAMPLE_ROWS)
              const headers = locale === 'sl'
                ? ['Predplačilo št.', 'Datum', 'Stopnja DDV', 'Osnova', 'DDV', 'Skupaj', 'Porabljeno']
                : ['Advance no.', 'Date', 'Tax rate', 'Basis', 'VAT', 'Total', 'Used']
              const colRatios = [0, 0.19, 0.34, 0.50, 0.64, 0.72, 0.90]
              const colWidths = [0.18, 0.14, 0.15, 0.13, 0.12, 0.11, 0.10]
              return (
                <div
                  className={`fle-vat-table ${isSel ? 'fle-vat-table--selected' : ''}`}
                  style={{
                    left: x * scale,
                    top: y * scale,
                    width: w * scale,
                    height: h * scale,
                    borderColor: 'rgba(249, 115, 22, 0.75)',
                  }}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'advancePaymentsTable' }) }}
                >
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: titleH * scale, display: 'flex', alignItems: 'center', paddingLeft: 4 * scale, fontWeight: 700, fontSize: Math.max(7, (t.headerFontSize + 1) * scale * 0.7), pointerEvents: 'none' }}>
                    {locale === 'sl' ? 'Predplačila' : 'Advance payments'}
                  </div>
                  <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: titleH * scale, borderTop: '1px solid rgba(249, 115, 22, 0.7)' }} />
                  <div className="fle-vat-table-header" style={{ height: headerH * scale, top: titleH * scale }}>
                    {headers.map((label, idx) => (
                      <span key={label} className="fle-vat-table-cell fle-vat-table-cell--header" style={{
                        left: (w * colRatios[idx]) * scale,
                        width: (w * colWidths[idx]) * scale,
                        textAlign: idx <= 2 ? 'left' : 'right',
                        fontSize: Math.max(6, t.headerFontSize * scale * 0.62),
                      }}>
                        {label}
                      </span>
                    ))}
                  </div>
                  {Array.from({ length: ADVANCE_PAYMENT_SAMPLE_ROWS }, (_, r) => (
                    <div key={r} className="fle-vat-table-row fle-vat-table-row--last" style={{ height: rowH * scale, top: (titleH + headerH + rowH * r) * scale }}>
                      {(locale === 'sl'
                        ? ['AV-2026-0007', '2026-05-20', '22%', '24.59', '5.41', '30.00', '30.00']
                        : ['AV-2026-0007', '2026-05-20', '22%', '24.59', '5.41', '30.00', '30.00']
                      ).map((value, idx) => (
                        <span key={idx} className="fle-vat-table-cell" style={{
                          left: (w * colRatios[idx]) * scale,
                          width: (w * colWidths[idx]) * scale,
                          textAlign: idx <= 2 ? 'left' : 'right',
                          fontSize: Math.max(6, t.bodyFontSize * scale * 0.62),
                        }}>
                          {value}
                        </span>
                      ))}
                    </div>
                  ))}
                  <span className="fle-vat-table-label">{locale === 'sl' ? 'Predplačila' : 'Advance payments'}</span>
                </div>
              )
            })()}

            {/* VAT breakdown table preview */}
            {layout.vatBreakdownTable && (() => {
              const vt = layout.vatBreakdownTable
              const isSel = selection?.type === 'vatBreakdownTable'
              const h = vt.headerHeight + vt.rowHeight * VAT_SAMPLE_ROWS
              const descW = vt.width * 0.34
              const rateW = vt.width * 0.18
              const basisW = vt.width * 0.24
              const amountW = vt.width - descW - rateW - basisW
              const headers = locale === 'sl'
                ? ['Opis DDV', 'Stopnja DDV', 'Osnova DDV', 'Vrednost DDV']
                : ['VAT description', 'VAT rate', 'VAT basis', 'VAT amount']
              const rows = locale === 'sl'
                ? [['DDV 22%', '22%', 'EUR 0.00', 'EUR 0.00'], ['DDV 9,5%', '9,5%', 'EUR 0.00', 'EUR 0.00'], ['DDV 0%', '0%', 'EUR 0.00', 'EUR 0.00']]
                : [['VAT 22%', '22%', 'EUR 0.00', 'EUR 0.00'], ['VAT 9.5%', '9.5%', 'EUR 0.00', 'EUR 0.00'], ['VAT 0%', '0%', 'EUR 0.00', 'EUR 0.00']]
              const colStyles = [
                { left: 0, width: descW, textAlign: 'left' as const },
                { left: descW, width: rateW, textAlign: 'left' as const },
                { left: descW + rateW, width: basisW, textAlign: 'right' as const },
                { left: descW + rateW + basisW, width: amountW, textAlign: 'right' as const },
              ]
              return (
                <div
                  className={`fle-vat-table ${isSel ? 'fle-vat-table--selected' : ''} ${!vt.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: vt.x * scale,
                    top: vt.y * scale,
                    width: vt.width * scale,
                    height: h * scale,
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'vatBreakdownTable' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'vatBreakdownTable' }) }}
                >
                  <div className="fle-vat-table-header" style={{ height: vt.headerHeight * scale }}>
                    {headers.map((label, idx) => (
                      <span key={label} className="fle-vat-table-cell fle-vat-table-cell--header" style={{
                        left: colStyles[idx].left * scale,
                        width: colStyles[idx].width * scale,
                        textAlign: colStyles[idx].textAlign,
                        fontSize: Math.max(6, vt.headerFontSize * scale * 0.75),
                      }}>
                        {label}
                      </span>
                    ))}
                  </div>
                  {rows.map((row, r) => (
                    <div key={r} className={`fle-vat-table-row ${r === rows.length - 1 ? 'fle-vat-table-row--last' : ''}`} style={{ height: vt.rowHeight * scale, top: (vt.headerHeight + vt.rowHeight * r) * scale }}>
                      {row.map((value, idx) => (
                        <span key={idx} className="fle-vat-table-cell" style={{
                          left: colStyles[idx].left * scale,
                          width: colStyles[idx].width * scale,
                          textAlign: colStyles[idx].textAlign,
                          fontSize: Math.max(6, vt.bodyFontSize * scale * 0.75),
                        }}>
                          {value}
                        </span>
                      ))}
                    </div>
                  ))}
                  <span className="fle-vat-table-label">VAT breakdown</span>
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'vatBreakdownTable' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}

            {/* Footer items preview — positioned absolutely when x/y are set */}
            {layout.footer.items.map((item, idx) => {
              const t = layout.table
              const sampleRows = SERVICE_TABLE_PREVIEW_ROWS
              const tableBottom = t.startY + t.headerHeight + t.rowHeight * sampleRows + t.footerSpacing
              const hasPos = item.x >= 0 && item.y >= 0
              const posX = hasPos ? item.x : (item.alignment === 'right' ? t.startX + t.width - 150 : t.startX)
              const posY = hasPos ? item.y : tableBottom + layout.footer.gapAfterTable + 18 + idx * layout.footer.lineSpacing
              const posW = hasPos && item.width > 0 ? item.width : (item.alignment === 'right' ? 150 : t.width)
              const posH = hasPos && item.height > 0 ? item.height : layout.footer.lineSpacing
              const isSel = selection?.type === 'footer' && selection.index === idx
              return (
                <div
                  key={item.key}
                  className={`fle-footer-item ${isSel ? 'fle-footer-item--selected' : ''}`}
                  style={{
                    left: posX * scale,
                    top: posY * scale,
                    width: posW * scale,
                    height: posH * scale,
                    textAlign: item.alignment,
                    fontWeight: item.bold ? 700 : 400,
                    fontSize: Math.max(7, item.fontSize * scale * 0.7),
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'footer', index: idx }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'footer', index: idx }) }}
                >
                  {resolveLocalizedText(item.labelI18n, item.label, locale)}
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'footer', index: idx }, 'resize') }}
                    />
                  )}
                </div>
              )
            })}

            {/* Payment QR overlay */}
            {layout.paymentQr && (() => {
              const qr = layout.paymentQr
              const isSel = selection?.type === 'paymentQr'
              return (
                <div
                  className={`fle-logo ${isSel ? 'fle-logo--selected' : ''} ${!qr.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: qr.x * scale,
                    top: qr.y * scale,
                    width: qr.width * scale,
                    height: qr.height * scale,
                    borderColor: 'var(--fle-group-document)',
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'paymentQr' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'paymentQr' }) }}
                >
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', pointerEvents: 'none', background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 6px, transparent 6px, transparent 12px)' }}>
                    <div style={{ flex: '1 1 auto', minHeight: 0, width: '100%', display: 'grid', placeItems: 'center' }}>
                      <span className="fle-logo-placeholder">Payment QR</span>
                    </div>
                    <div style={{ flex: '0 0 auto', width: '100%', textAlign: 'center', fontSize: Math.max(6, 7 * scale), lineHeight: 1.05, paddingTop: 0, paddingBottom: 0, color: 'rgba(236, 72, 153, 0.65)', fontWeight: 600 }}>
                      {PAYMENT_QR_CAPTION[locale]}
                    </div>
                  </div>
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'paymentQr' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}

            {/* Fiscal QR overlay */}
            {layout.fiscalQr && (() => {
              const qr = layout.fiscalQr
              const isSel = selection?.type === 'fiscalQr'
              return (
                <div
                  className={`fle-logo ${isSel ? 'fle-logo--selected' : ''} ${!qr.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: qr.x * scale,
                    top: qr.y * scale,
                    width: qr.width * scale,
                    height: qr.height * scale,
                    borderColor: 'var(--fle-group-recipient)',
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'fiscalQr' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'fiscalQr' }) }}
                >
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', pointerEvents: 'none', background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 6px, transparent 6px, transparent 12px)' }}>
                    <span className="fle-logo-placeholder">Fiscal QR</span>
                  </div>
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'fiscalQr' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}

            {/* Signature overlay */}
            {layout.signature && (() => {
              const sg = layout.signature
              const isSel = selection?.type === 'signature'
              return (
                <div
                  className={`fle-logo ${isSel ? 'fle-logo--selected' : ''} ${!sg.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: sg.x * scale,
                    top: sg.y * scale,
                    width: sg.width * scale,
                    height: sg.height * scale,
                    borderColor: 'var(--fle-group-custom)',
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'signature' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'signature' }) }}
                >
                  {signatureDataUrl ? (
                    <img src={signatureDataUrl} alt="Signature" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  ) : (
                    <span className="fle-logo-placeholder">Signature</span>
                  )}
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'signature' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Property panel */}
        <div className="fle-panel">
          {selection === null && (
            <div className="fle-panel-empty">
              <p className="muted">Click a field, page space, services table, advance payments table, VAT breakdown table, logo, payment QR, fiscal QR, signature, or a footer item to edit its properties.</p>
              <button type="button" className="fle-btn" onClick={() => setSelection({ type: 'pageSections' })}>Edit page spaces</button>
            </div>
          )}

          {selection?.type === 'pageSections' && (
            <div className="fle-panel-content">
              <PageHeader title="Page spaces" subtitle="Header, main, and footer fixed areas" />
              <div className="fle-panel-grid">
                <Field label="Header height">
                  <input type="number" step={1} min={0} value={Math.round(layout.pageSections.headerHeight)} onChange={(e) => mutateLayout((l) => { l.pageSections.headerHeight = Number(e.target.value); normalizePageSections(l) })} />
                </Field>
                <Field label="Footer height">
                  <input type="number" step={1} min={0} value={Math.round(layout.pageSections.footerHeight)} onChange={(e) => mutateLayout((l) => { l.pageSections.footerHeight = Number(e.target.value); normalizePageSections(l) })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Main space: {Math.round(layout.pageSections.headerHeight)} pt – {Math.round(layout.pageHeight - layout.pageSections.footerHeight)} pt
              </div>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                Blocks fully inside the header or footer space are repeated on every generated PDF page and do not move when service rows are added. Blocks in the main space still flow down below the services table.
              </p>
            </div>
          )}

          {selection?.type === 'logo' && (
            <div className="fle-panel-content">
              <PageHeader title="Company Logo" subtitle="Logo image placement" />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(layout.logo.x)} onChange={(e) => mutateLayout((l) => { l.logo.x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(layout.logo.y)} onChange={(e) => mutateLayout((l) => { l.logo.y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.logo.width)} onChange={(e) => mutateLayout((l) => { l.logo.width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(layout.logo.height)} onChange={(e) => mutateLayout((l) => { l.logo.height = Number(e.target.value) })} />
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={layout.logo.visible} onChange={(e) => mutateLayout((l) => { l.logo.visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.logo.x)}, {Math.round(layout.logo.y)} pt
              </div>
              <h4 className="fle-panel-section-title">Image</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="fle-btn fle-btn-primary" onClick={uploadLogo}>
                  {logoDataUrl ? 'Replace' : 'Upload'}
                </button>
                {logoDataUrl && (
                  <button type="button" className="fle-btn fle-btn-secondary" onClick={removeLogo}>Remove</button>
                )}
              </div>
              {logoDataUrl && (
                <div style={{ marginTop: 12, border: '1px solid var(--fle-panel-border)', borderRadius: 6, padding: 8, background: '#fff' }}>
                  <img src={logoDataUrl} alt="Current logo" style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                </div>
              )}
            </div>
          )}

          {selection?.type === 'paymentQr' && (
            <div className="fle-panel-content">
              <PageHeader title="Payment QR" subtitle="Auto-generated bank-app payment QR placement with localized scan-and-pay caption" />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(layout.paymentQr.x)} onChange={(e) => mutateLayout((l) => { l.paymentQr.x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(layout.paymentQr.y)} onChange={(e) => mutateLayout((l) => { l.paymentQr.y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.paymentQr.width)} onChange={(e) => mutateLayout((l) => { l.paymentQr.width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(layout.paymentQr.height)} onChange={(e) => mutateLayout((l) => { l.paymentQr.height = Number(e.target.value) })} />
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={layout.paymentQr.visible} onChange={(e) => mutateLayout((l) => { l.paymentQr.visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.paymentQr.x)}, {Math.round(layout.paymentQr.y)} pt
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                This QR is generated automatically as a bank-app payment QR for Stripe-enabled bank transfer / TRR bills.
              </p>
            </div>
          )}

          {selection?.type === 'fiscalQr' && (
            <div className="fle-panel-content">
              <PageHeader title="Fiscal QR" subtitle="QR code returned from fiscalization placement" />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(layout.fiscalQr.x)} onChange={(e) => mutateLayout((l) => { l.fiscalQr.x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(layout.fiscalQr.y)} onChange={(e) => mutateLayout((l) => { l.fiscalQr.y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.fiscalQr.width)} onChange={(e) => mutateLayout((l) => { l.fiscalQr.width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(layout.fiscalQr.height)} onChange={(e) => mutateLayout((l) => { l.fiscalQr.height = Number(e.target.value) })} />
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={layout.fiscalQr.visible} onChange={(e) => mutateLayout((l) => { l.fiscalQr.visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.fiscalQr.x)}, {Math.round(layout.fiscalQr.y)} pt
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                This QR is generated from the QR payload returned by fiscalization and is shown only after a bill has fiscalization data.
              </p>
            </div>
          )}

          {selectedField && selection?.type === 'field' && (
            <div className="fle-panel-content">
              <PageHeader title={resolveLocalizedText(selectedField.labelI18n, selectedField.label, locale)} subtitle={`${selectedField.group} / ${selectedField.key}`} />
              <div className="fle-panel-grid" style={{ marginBottom: 8 }}>
                <Field label="Label (EN)">
                  <input
                    type="text"
                    value={resolveLocalizedText(selectedField.labelI18n, selectedField.label, 'en')}
                    onChange={(e) => mutateLayout((l) => {
                      const field = l.fields[selection.index]
                      field.labelI18n = ensureLocalizedText(field.labelI18n, field.label)
                      field.labelI18n.en = e.target.value
                      field.label = resolveLocalizedText(field.labelI18n, field.label, 'en')
                    })}
                  />
                </Field>
                <Field label="Label (SL)">
                  <input
                    type="text"
                    value={resolveLocalizedText(selectedField.labelI18n, selectedField.label, 'sl')}
                    onChange={(e) => mutateLayout((l) => {
                      const field = l.fields[selection.index]
                      field.labelI18n = ensureLocalizedText(field.labelI18n, field.label)
                      field.labelI18n.sl = e.target.value
                      field.label = resolveLocalizedText(field.labelI18n, field.label, 'en')
                    })}
                  />
                </Field>
              </div>
              {isPrefixField(selectedField) && (
                <div className="fle-panel-grid" style={{ marginBottom: 8 }}>
                  <Field label="Prefix text (EN)">
                    <input
                      type="text"
                      value={resolveLocalizedText(selectedField.prefixI18n, DOCUMENT_PREFIX_DEFAULTS[selectedField.key]?.en || '', 'en')}
                      onChange={(e) => mutateLayout((l) => {
                        const field = l.fields[selection.index]
                        const defaults = DOCUMENT_PREFIX_DEFAULTS[field.key] || { en: '', sl: '' }
                        field.prefixI18n = {
                          en: field.prefixI18n?.en || defaults.en,
                          sl: field.prefixI18n?.sl || defaults.sl,
                        }
                        field.prefixI18n.en = e.target.value
                      })}
                    />
                  </Field>
                  <Field label="Prefix text (SL)">
                    <input
                      type="text"
                      value={resolveLocalizedText(selectedField.prefixI18n, DOCUMENT_PREFIX_DEFAULTS[selectedField.key]?.sl || '', 'sl')}
                      onChange={(e) => mutateLayout((l) => {
                        const field = l.fields[selection.index]
                        const defaults = DOCUMENT_PREFIX_DEFAULTS[field.key] || { en: '', sl: '' }
                        field.prefixI18n = {
                          en: field.prefixI18n?.en || defaults.en,
                          sl: field.prefixI18n?.sl || defaults.sl,
                        }
                        field.prefixI18n.sl = e.target.value
                      })}
                    />
                  </Field>
                </div>
              )}
              {isDateField(selectedField) && (
                <div className="fle-panel-grid" style={{ marginBottom: 8 }}>
                  <Field label="Date format">
                    <select
                      value={selectedField.dateFormat || 'YYYY-MM-DD'}
                      onChange={(e) => mutateLayout((l) => {
                        l.fields[selection.index].dateFormat = e.target.value as FieldConfig['dateFormat']
                      })}
                    >
                      {DATE_FORMAT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt.replace('HH:mm', 'HH:MM')}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              {selectedField.type === 'custom' && (
                <div className="fle-panel-grid" style={{ marginBottom: 8 }}>
                  <Field label="Text (EN)">
                    <input
                      type="text"
                      value={resolveLocalizedText(selectedField.textI18n, selectedField.text || selectedField.label, 'en')}
                      onChange={(e) => mutateLayout((l) => {
                        const field = l.fields[selection.index]
                        field.textI18n = ensureLocalizedText(field.textI18n, field.text || field.label)
                        field.textI18n.en = e.target.value
                        field.text = resolveLocalizedText(field.textI18n, field.text || field.label, 'en')
                      })}
                    />
                  </Field>
                  <Field label="Text (SL)">
                    <input
                      type="text"
                      value={resolveLocalizedText(selectedField.textI18n, selectedField.text || selectedField.label, 'sl')}
                      onChange={(e) => mutateLayout((l) => {
                        const field = l.fields[selection.index]
                        field.textI18n = ensureLocalizedText(field.textI18n, field.text || field.label)
                        field.textI18n.sl = e.target.value
                        field.text = resolveLocalizedText(field.textI18n, field.text || field.label, 'en')
                      })}
                    />
                  </Field>
                </div>
              )}
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(selectedField.x)} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(selectedField.y)} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(selectedField.width)} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(selectedField.height)} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].height = Number(e.target.value) })} />
                </Field>
                <Field label="Font size">
                  <input type="number" min={6} max={36} value={selectedField.fontSize} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].fontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Bold">
                  <input type="checkbox" checked={selectedField.bold} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].bold = e.target.checked })} />
                </Field>
                <Field label="Alignment">
                  <select value={selectedField.alignment} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].alignment = e.target.value as FieldConfig['alignment'] })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={selectedField.visible} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(selectedField.x)}, {Math.round(selectedField.y)} pt
              </div>
              {selectedField.type === 'custom' && (
                <button type="button" className="fle-btn fle-btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => deleteField(selection.index)}>
                  Delete field
                </button>
              )}
            </div>
          )}

          {selection?.type === 'table' && (
            <div className="fle-panel-content">
              <PageHeader title="Services Table" subtitle="Table region and columns" />
              <div className="fle-panel-grid">
                <Field label="Start X">
                  <input type="number" step={1} value={Math.round(layout.table.startX)} onChange={(e) => mutateLayout((l) => { l.table.startX = Number(e.target.value) })} />
                </Field>
                <Field label="Start Y">
                  <input type="number" step={1} value={Math.round(layout.table.startY)} onChange={(e) => mutateLayout((l) => { l.table.startY = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.table.width)} onChange={(e) => mutateLayout((l) => { l.table.width = Number(e.target.value) })} />
                </Field>
                <Field label="Row height">
                  <input type="number" step={1} value={layout.table.rowHeight} onChange={(e) => mutateLayout((l) => { l.table.rowHeight = Number(e.target.value) })} />
                </Field>
                <Field label="Header height">
                  <input type="number" step={1} value={layout.table.headerHeight} onChange={(e) => mutateLayout((l) => { l.table.headerHeight = Number(e.target.value) })} />
                </Field>
                <Field label="Header font">
                  <input type="number" min={6} max={24} value={layout.table.headerFontSize} onChange={(e) => mutateLayout((l) => { l.table.headerFontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Body font">
                  <input type="number" min={6} max={24} value={layout.table.bodyFontSize} onChange={(e) => mutateLayout((l) => { l.table.bodyFontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Footer spacing">
                  <input type="number" step={1} value={layout.table.footerSpacing} onChange={(e) => mutateLayout((l) => { l.table.footerSpacing = Number(e.target.value) })} />
                </Field>
              </div>
              <h4 className="fle-panel-section-title">Columns</h4>
              {layout.table.columns.map((col, ci) => (
                <div key={col.key} className="fle-column-row">
                  <strong>{resolveLocalizedText(col.labelI18n, col.label, locale)}</strong>
                  <div className="fle-panel-grid fle-panel-grid--compact">
                    <Field label="Label (EN)">
                      <input
                        type="text"
                        value={resolveLocalizedText(col.labelI18n, col.label, 'en')}
                        onChange={(e) => mutateLayout((l) => {
                          const target = l.table.columns[ci]
                          target.labelI18n = ensureLocalizedText(target.labelI18n, target.label)
                          target.labelI18n.en = e.target.value
                          target.label = resolveLocalizedText(target.labelI18n, target.label, 'en')
                        })}
                      />
                    </Field>
                    <Field label="Label (SL)">
                      <input
                        type="text"
                        value={resolveLocalizedText(col.labelI18n, col.label, 'sl')}
                        onChange={(e) => mutateLayout((l) => {
                          const target = l.table.columns[ci]
                          target.labelI18n = ensureLocalizedText(target.labelI18n, target.label)
                          target.labelI18n.sl = e.target.value
                          target.label = resolveLocalizedText(target.labelI18n, target.label, 'en')
                        })}
                      />
                    </Field>
                  </div>
                  <div className="fle-panel-grid fle-panel-grid--compact">
                    <Field label="Offset X">
                      <input type="number" step={1} value={Math.round(col.relX)} onChange={(e) => mutateLayout((l) => { l.table.columns[ci].relX = Number(e.target.value) })} />
                    </Field>
                    <Field label="Width">
                      <input type="number" step={1} value={Math.round(col.width)} onChange={(e) => mutateLayout((l) => { l.table.columns[ci].width = Number(e.target.value) })} />
                    </Field>
                    <Field label="Align">
                      <select value={col.alignment} onChange={(e) => mutateLayout((l) => { l.table.columns[ci].alignment = e.target.value as 'left' | 'right' })}>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </Field>
                    {col.key === 'date' ? (
                      <Field label="Date format">
                        <select
                          value={col.dateFormat || 'YYYY-MM-DD'}
                          onChange={(e) => mutateLayout((l) => {
                            l.table.columns[ci].dateFormat = e.target.value as ColumnConfig['dateFormat']
                          })}
                        >
                          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                          <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                          <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                        </select>
                      </Field>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selection?.type === 'advancePaymentsTable' && (
            <div className="fle-panel-content">
              <PageHeader title="Predplačila" subtitle="Advance payments table preview" />
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                This table is shown on generated invoices only when one or more predplačilo payment methods are used. It follows the Services table width and font sizes, and each used predplačilo is rendered as a separate row.
              </p>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.table.startX)}, {Math.round(advancePaymentsPreviewTop(layout))} pt · Width: {Math.round(layout.table.width)} pt
              </div>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 12 }}>
                To change its width or text size, adjust the Services table. The columns match the generated PDF: Predplačilo št., Datum, Stopnja DDV, Osnova, DDV, Skupaj, Porabljeno.
              </p>
            </div>
          )}

          {selection?.type === 'vatBreakdownTable' && layout.vatBreakdownTable && (
            <div className="fle-panel-content">
              <PageHeader title="VAT breakdown table" subtitle="DDV summary placement" />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(layout.vatBreakdownTable.x)} onChange={(e) => mutateLayout((l) => { l.vatBreakdownTable.x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(layout.vatBreakdownTable.y)} onChange={(e) => mutateLayout((l) => { l.vatBreakdownTable.y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.vatBreakdownTable.width)} onChange={(e) => mutateLayout((l) => { l.vatBreakdownTable.width = Number(e.target.value) })} />
                </Field>
                <Field label="Header height">
                  <input type="number" step={1} value={layout.vatBreakdownTable.headerHeight} onChange={(e) => mutateLayout((l) => { l.vatBreakdownTable.headerHeight = Number(e.target.value) })} />
                </Field>
                <Field label="Row height">
                  <input type="number" step={1} value={layout.vatBreakdownTable.rowHeight} onChange={(e) => mutateLayout((l) => { l.vatBreakdownTable.rowHeight = Number(e.target.value) })} />
                </Field>
                <Field label="Header font">
                  <input type="number" min={6} max={16} value={layout.vatBreakdownTable.headerFontSize} onChange={(e) => mutateLayout((l) => { l.vatBreakdownTable.headerFontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Body font">
                  <input type="number" min={6} max={16} value={layout.vatBreakdownTable.bodyFontSize} onChange={(e) => mutateLayout((l) => { l.vatBreakdownTable.bodyFontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={layout.vatBreakdownTable.visible} onChange={(e) => mutateLayout((l) => { l.vatBreakdownTable.visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.vatBreakdownTable.x)}, {Math.round(layout.vatBreakdownTable.y)} pt
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                The generated PDF renders only VAT rows that contain invoice values. Items below the services table move down automatically when invoice rows are added.
              </p>
            </div>
          )}

          {selectedFooterItem && selection?.type === 'footer' && (
            <div className="fle-panel-content">
              <PageHeader title={resolveLocalizedText(selectedFooterItem.labelI18n, selectedFooterItem.label, locale)} subtitle={`Footer / ${selectedFooterItem.key}`} />
              <div className="fle-panel-grid" style={{ marginBottom: 8 }}>
                <Field label="Label (EN)">
                  <input
                    type="text"
                    value={resolveLocalizedText(selectedFooterItem.labelI18n, selectedFooterItem.label, 'en')}
                    onChange={(e) => mutateLayout((l) => {
                      const item = l.footer.items[selection.index]
                      item.labelI18n = ensureLocalizedText(item.labelI18n, item.label)
                      item.labelI18n.en = e.target.value
                      item.label = resolveLocalizedText(item.labelI18n, item.label, 'en')
                    })}
                  />
                </Field>
                <Field label="Label (SL)">
                  <input
                    type="text"
                    value={resolveLocalizedText(selectedFooterItem.labelI18n, selectedFooterItem.label, 'sl')}
                    onChange={(e) => mutateLayout((l) => {
                      const item = l.footer.items[selection.index]
                      item.labelI18n = ensureLocalizedText(item.labelI18n, item.label)
                      item.labelI18n.sl = e.target.value
                      item.label = resolveLocalizedText(item.labelI18n, item.label, 'en')
                    })}
                  />
                </Field>
              </div>
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(selectedFooterItem.x)} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(selectedFooterItem.y)} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(selectedFooterItem.width)} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(selectedFooterItem.height)} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].height = Number(e.target.value) })} />
                </Field>
                <Field label="Font size">
                  <input type="number" min={6} max={24} value={selectedFooterItem.fontSize} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].fontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Bold">
                  <input type="checkbox" checked={selectedFooterItem.bold} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].bold = e.target.checked })} />
                </Field>
                <Field label="Alignment">
                  <select value={selectedFooterItem.alignment} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].alignment = e.target.value as 'left' | 'right' })}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(selectedFooterItem.x)}, {Math.round(selectedFooterItem.y)} pt
              </div>
              <h4 className="fle-panel-section-title">Footer spacing</h4>
              <div className="fle-panel-grid">
                <Field label="Gap after table">
                  <input type="number" step={1} value={layout.footer.gapAfterTable} onChange={(e) => mutateLayout((l) => { l.footer.gapAfterTable = Number(e.target.value) })} />
                </Field>
                <Field label="Line spacing">
                  <input type="number" step={1} value={layout.footer.lineSpacing} onChange={(e) => mutateLayout((l) => { l.footer.lineSpacing = Number(e.target.value) })} />
                </Field>
              </div>
            </div>
          )}

          {selection?.type === 'signature' && (
            <div className="fle-panel-content">
              <PageHeader title="Signature" subtitle="Signature image placement" />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(layout.signature.x)} onChange={(e) => mutateLayout((l) => { l.signature.x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(layout.signature.y)} onChange={(e) => mutateLayout((l) => { l.signature.y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.signature.width)} onChange={(e) => mutateLayout((l) => { l.signature.width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(layout.signature.height)} onChange={(e) => mutateLayout((l) => { l.signature.height = Number(e.target.value) })} />
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={layout.signature.visible} onChange={(e) => mutateLayout((l) => { l.signature.visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.signature.x)}, {Math.round(layout.signature.y)} pt
              </div>
              <h4 className="fle-panel-section-title">Image</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="fle-btn fle-btn-primary" onClick={uploadSignature}>
                  {signatureDataUrl ? 'Replace' : 'Upload'}
                </button>
                {signatureDataUrl && (
                  <button type="button" className="fle-btn fle-btn-secondary" onClick={removeSignature}>Remove</button>
                )}
              </div>
              {signatureDataUrl && (
                <div style={{ marginTop: 12, border: '1px solid var(--fle-panel-border)', borderRadius: 6, padding: 8, background: '#fff' }}>
                  <img src={signatureDataUrl} alt="Current signature" style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
