import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { Field, PageHeader } from '../components/ui'
import { useLocale, type AppLocale } from '../locale'
import { PosReceiptLayoutEditor } from './PosReceiptLayoutEditor'
import '../styles/folio-layout-editor.css'

const FOLIO_IMAGE_MAX_BYTES = 2_000_000
const FOLIO_IMAGE_MAX_MB = 2

/* ── Types mirroring backend FolioLayoutConfig ── */

type LocalizedText = {
  en?: string
  sl?: string
  sr?: string
}

type A4TemplateId = 'COMPACT' | 'CLASSIC' | 'MINIMAL' | 'CUSTOM'
type A4FontSizePreset = 'COMPACT' | 'STANDARD' | 'LARGE'

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
  visible?: boolean
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
  visible?: boolean
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
  templateId?: A4TemplateId
  accentColor?: string
  fontSizePreset?: A4FontSizePreset
  taxClauses?: string[]
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
const PAYMENT_QR_CAPTION: Record<AppLocale, string> = { en: 'Scan and pay', sl: 'Skeniraj in plačaj', sr: 'Skeniraj i plati' }
const DEFAULT_VAT_BREAKDOWN_TABLE: VatBreakdownTableConfig = { x: 50, y: 286, width: 300, headerHeight: 14, rowHeight: 14, headerFontSize: 7, bodyFontSize: 7, visible: true }
const SERVICE_TABLE_PREVIEW_ROWS = 1
const LEGACY_SERVICE_TABLE_PREVIEW_ROWS = 3
const VAT_SAMPLE_ROWS = 3
const ADVANCE_PAYMENT_SAMPLE_ROWS = 1
const OTHER_LOCALE: Record<AppLocale, AppLocale> = { en: 'sl', sl: 'en', sr: 'sl' }
const DATE_FIELD_KEYS = new Set(['folioDate', 'dateOfService', 'dueDate'])
const PREFIX_FIELD_KEYS = new Set(['folioNumber', 'folioDate', 'folioIssueTimePlace', 'dateOfService', 'dueDate'])
const DATE_FORMAT_OPTIONS: DateFormat[] = ['DD.MM.YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY HH:mm', 'DD-MM-YYYY HH:mm', 'YYYY-MM-DD HH:mm']
const DOCUMENT_PREFIX_DEFAULTS: Record<string, LocalizedText> = {
  folioNumber: { en: 'Invoice:', sl: 'Račun:' },
  folioDate: { en: 'Issued on', sl: 'Izdano', sr: 'Izdato' },
  folioIssueTimePlace: { en: 'Time and place of issue', sl: 'Ura in kraj izdaje', sr: 'Vreme i mesto izdavanja' },
  dateOfService: { en: 'Date of service', sl: 'Datum opravljene storitve', sr: 'Datum usluge' },
  dueDate: { en: 'Due date', sl: 'Rok plačila', sr: 'Rok plaćanja' },
}
const FIELD_SAMPLE_VALUES: Record<string, string> = {
  companyName: 'Urška Grmek s.p.',
  companyAddress: 'Jadranska cesta 25',
  companyPostalCodeCity: '2000 Maribor',
  companyTaxId: '10371745',
  folioNumber: '37',
  folioDate: '31.08.2026',
  folioIssueTimePlace: '08:47, Maribor',
  dateOfService: '02.08.2026',
  dueDate: '17.08.2026',
  recipientName: 'Andre',
  recipientAddress: 'Cesta v duplek',
  recipientPostalCodeCity: '2000 Maribor',
  recipientVatId: 'SI10234224',
}

const TAX_CLAUSE_OPTIONS = [
  'DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.',
  'Oprostitev DDV po 42. členu ZDDV-1.',
  'Oprostitev DDV po 44. členu ZDDV-1.',
  'Dobava blaga v drugo državo članico EU je oproščena DDV po 46. členu ZDDV-1.',
  'Izvoz blaga je oproščen DDV po 52. členu ZDDV-1.',
  'Obrnjena davčna obveznost po 76.a členu ZDDV-1.',
  'Posebna ureditev za potovalne agencije po 97. členu ZDDV-1.',
  'Posebna ureditev za rabljeno blago, umetniške predmete, zbirke in starine po 102. členu ZDDV-1.',
] as const

function normalizeTaxClauses(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (trimmed) unique.add(trimmed)
  }
  return Array.from(unique)
}

function taxClausesTitle(locale: AppLocale) {
  return locale === 'sl' ? 'Davčne klavzule' : locale === 'sr' ? 'Poreske klauzule' : 'Tax clauses'
}

function taxClausePreviewPlacement(templateId: A4TemplateId) {
  switch (templateId) {
    case 'COMPACT':
      return { x: 50, y: 555, width: 495, minHeight: 42 }
    case 'MINIMAL':
      return { x: 50, y: 575, width: 495, minHeight: 30 }
    case 'CLASSIC':
    default:
      return { x: 50, y: 620, width: 240, minHeight: 78 }
  }
}


const A4_TEMPLATE_META: Array<{ id: Exclude<A4TemplateId, 'CUSTOM'>; name: Record<AppLocale, string>; description: Record<AppLocale, string> }> = [
  {
    id: 'COMPACT',
    name: { en: 'Compact', sl: 'Kompaktna', sr: 'Kompaktna' },
    description: { en: 'Dense, receipt-inspired layout that keeps all key information together.', sl: 'Zgoščena postavitev po vzoru POS računa z vsemi ključnimi podatki.', sr: 'Sažet raspored po uzoru na POS račun sa svim ključnim podacima.' },
  },
  {
    id: 'CLASSIC',
    name: { en: 'Classic', sl: 'Klasična', sr: 'Klasična' },
    description: { en: 'Balanced business invoice with clearly separated sections.', sl: 'Uravnotežena poslovna postavitev z jasno ločenimi razdelki.', sr: 'Uravnotežen poslovni raspored sa jasno odvojenim odeljcima.' },
  },
  {
    id: 'MINIMAL',
    name: { en: 'Minimal', sl: 'Minimalna', sr: 'Minimalna' },
    description: { en: 'Clean, spacious layout with only the most important elements.', sl: 'Čista in zračna postavitev samo z najpomembnejšimi elementi.', sr: 'Čist i prozračan raspored samo sa najvažnijim elementima.' },
  },
]

const TEMPLATE_FIELD_KEYS = new Set([
  'companyName', 'companyAddress', 'companyPostalCodeCity', 'companyTaxId',
  'folioNumber', 'folioDate', 'folioIssueTimePlace', 'dateOfService', 'dueDate',
  'recipientName', 'recipientAddress', 'recipientPostalCodeCity', 'recipientVatId',
  'templateFooterText',
])

const TEMPLATE_FOOTER_KEYS = new Set([
  'totalNett', 'discount', 'totalGross', 'usedAdvances', 'toBePaid',
  'payment', 'notes', 'iban', 'issuedBy', 'fiscalZoi', 'fiscalEor',
])

const TEMPLATE_COLUMN_KEYS = new Set(['date', 'description', 'qty', 'nett', 'discount', 'gross', 'taxPercent', 'taxAmount', 'total'])

type TemplatePreferences = {
  footerText: string
  footerTextI18n?: LocalizedText
  footerTextVisible: boolean
  taxClauses: string[]
  logoVisible: boolean
  recipientVisible: boolean
  unitColumnsVisible: boolean
  paymentQrVisible: boolean
  fiscalVisible: boolean
  notesVisible: boolean
  issuedByVisible: boolean
  signatureVisible: boolean
}

function extractTemplatePreferences(layout: LayoutConfig): TemplatePreferences {
  const footerTextField = fieldFor(layout, 'templateFooterText')
  return {
    footerText: footerTextField?.text || '',
    footerTextI18n: footerTextField?.textI18n,
    footerTextVisible: footerTextField?.visible !== false && Boolean((footerTextField?.text || '').trim() || resolveLocalizedText(footerTextField?.textI18n, footerTextField?.text || '', 'sl')),
    taxClauses: normalizeTaxClauses(layout.taxClauses),
    logoVisible: layout.logo?.visible !== false,
    recipientVisible: layout.fields.filter((field) => field.group === 'recipient').some((field) => field.visible !== false),
    unitColumnsVisible: columnFor(layout, 'qty')?.visible !== false,
    paymentQrVisible: layout.paymentQr?.visible !== false,
    fiscalVisible: layout.fiscalQr?.visible !== false || ['fiscalZoi', 'fiscalEor'].some((key) => footerFor(layout, key)?.visible !== false),
    notesVisible: footerFor(layout, 'notes')?.visible !== false,
    issuedByVisible: footerFor(layout, 'issuedBy')?.visible !== false,
    signatureVisible: layout.signature?.visible !== false,
  }
}

function rebaseToSelectedTemplate(layout: LayoutConfig): LayoutConfig {
  const templateId = ['COMPACT', 'CLASSIC', 'MINIMAL'].includes(String(layout.templateId || '').toUpperCase())
    ? String(layout.templateId).toUpperCase() as Exclude<A4TemplateId, 'CUSTOM'>
    : 'CLASSIC'
  return applyA4Template(layout, templateId)
}

function cloneLayout(layout: LayoutConfig): LayoutConfig {
  return JSON.parse(JSON.stringify(layout)) as LayoutConfig
}

function fieldFor(layout: LayoutConfig, key: string) {
  return layout.fields.find((field) => field.key === key)
}

function ensureTemplateField(layout: LayoutConfig, key: string, group: string, labelEn: string, labelSl: string, labelSr = labelSl) {
  let field = fieldFor(layout, key)
  if (!field) {
    field = {
      key,
      group,
      label: labelEn,
      labelI18n: { en: labelEn, sl: labelSl, sr: labelSr },
      x: 50,
      y: 50,
      width: 180,
      height: 14,
      fontSize: 10,
      bold: false,
      alignment: 'left',
      visible: true,
      type: 'data',
    }
    layout.fields.push(field)
  }
  return field
}

function footerFor(layout: LayoutConfig, key: string) {
  return layout.footer.items.find((item) => item.key === key)
}

function columnFor(layout: LayoutConfig, key: string) {
  return layout.table.columns.find((column) => column.key === key)
}

function setField(layout: LayoutConfig, key: string, values: Partial<FieldConfig>) {
  const field = fieldFor(layout, key)
  if (field) Object.assign(field, values)
}

function setFooter(layout: LayoutConfig, key: string, values: Partial<FooterItem>) {
  const item = footerFor(layout, key)
  if (item) Object.assign(item, values)
}

function setColumn(layout: LayoutConfig, key: string, values: Partial<ColumnConfig>) {
  const column = columnFor(layout, key)
  if (column) Object.assign(column, values)
}


const TEMPLATE_COLUMN_DEFAULTS: Record<string, ColumnConfig> = {
  date: { key: 'date', label: 'Date', labelI18n: { en: 'Date', sl: 'Datum', sr: 'Datum' }, dateFormat: 'DD.MM.YYYY', relX: 0, width: 0, alignment: 'left', visible: false },
  description: { key: 'description', label: 'Description', labelI18n: { en: 'Description', sl: 'Opis', sr: 'Opis' }, relX: 0, width: 190, alignment: 'left', visible: true },
  qty: { key: 'qty', label: 'Quantity', labelI18n: { en: 'Quantity', sl: 'Količina', sr: 'Količina' }, relX: 190, width: 35, alignment: 'right', visible: true },
  nett: { key: 'nett', label: 'Value excl. VAT', labelI18n: { en: 'Value excl. VAT', sl: 'Vrednost brez DDV', sr: 'Vrednost bez PDV-a' }, relX: 225, width: 80, alignment: 'right', visible: true },
  discount: { key: 'discount', label: 'Discount', labelI18n: { en: 'Discount', sl: 'Popust', sr: 'Popust' }, relX: 305, width: 50, alignment: 'right', visible: true },
  gross: { key: 'gross', label: 'Gross', labelI18n: { en: 'Gross', sl: 'Bruto', sr: 'Bruto' }, relX: 0, width: 0, alignment: 'right', visible: false },
  taxPercent: { key: 'taxPercent', label: 'VAT rate', labelI18n: { en: 'VAT rate', sl: 'DDV stopnja', sr: 'PDV stopa' }, relX: 355, width: 45, alignment: 'right', visible: true },
  taxAmount: { key: 'taxAmount', label: 'VAT amount', labelI18n: { en: 'VAT amount', sl: 'Znesek DDV', sr: 'Iznos PDV-a' }, relX: 0, width: 0, alignment: 'right', visible: false },
  total: { key: 'total', label: 'Value incl. VAT', labelI18n: { en: 'Value incl. VAT', sl: 'Vrednost z DDV', sr: 'Vrednost sa PDV-om' }, relX: 400, width: 95, alignment: 'right', visible: true },
}

function ensureTemplateColumn(layout: LayoutConfig, key: string) {
  if (columnFor(layout, key)) return
  const defaults = TEMPLATE_COLUMN_DEFAULTS[key]
  if (!defaults) return
  layout.table.columns.push(JSON.parse(JSON.stringify(defaults)) as ColumnConfig)
}

function ensureTemplateColumns(layout: LayoutConfig) {
  if (!Array.isArray(layout.table.columns)) layout.table.columns = []
  for (const key of TEMPLATE_COLUMN_KEYS) ensureTemplateColumn(layout, key)
  for (const column of layout.table.columns) {
    const defaults = TEMPLATE_COLUMN_DEFAULTS[column.key]
    if (!defaults) continue
    column.label = defaults.label
    column.labelI18n = { ...defaults.labelI18n }
    if (column.key === 'date' && !column.dateFormat) column.dateFormat = 'DD.MM.YYYY'
  }
}

function sampleTableCell(key: string, locale: AppLocale) {
  switch (key) {
    case 'description': return locale === 'sl' ? 'Avans' : locale === 'sr' ? 'Avans' : 'Advance'
    case 'qty': return '1 × 34.00 EUR'
    case 'nett': return '27,87 EUR'
    case 'discount': return '0,00 EUR'
    case 'taxPercent': return '22 %'
    case 'taxAmount': return '6,13 EUR'
    case 'gross': return '34,00 EUR'
    case 'total': return '34,00 EUR'
    case 'date': return '02.08.2026'
    default: return '—'
  }
}

function sampleFooterItem(item: FooterItem, locale: AppLocale) {
  const label = resolveLocalizedText(item.labelI18n, item.label, locale)
  switch (item.key) {
    case 'totalNett': return `${label}  44,00 EUR`
    case 'discount': return `${label}  - 10,00 EUR`
    case 'totalGross': return `${label}  34,00 EUR`
    case 'usedAdvances': return `${label}  0,00 EUR`
    case 'toBePaid': return `${label}  22,00 EUR`
    case 'notes': return 'Prosimo, da se pri plačilu sklicujete na št.: 3DAV-10-54'
    case 'iban': return `${label}: SI5455465454225424`
    case 'issuedBy': return `${label}: David Mirc`
    case 'fiscalZoi': return 'ZOI: 94eefff7b363a91f6371c1458bbc1f7a'
    case 'fiscalEor': return 'EOR: 99998ced-da42-4a0f-9069-1d727f336f60'
    default: return label
  }
}

function ensureTemplateFooterField(layout: LayoutConfig) {
  let field = fieldFor(layout, 'templateFooterText')
  if (!field) {
    field = {
      key: 'templateFooterText', group: 'custom', label: 'Footer text',
      labelI18n: { en: 'Footer text', sl: 'Besedilo v nogi', sr: 'Tekst u podnožju' },
      x: 50, y: 802, width: 495, height: 16, fontSize: 8, bold: false, alignment: 'center', visible: false,
      type: 'custom', text: '', textI18n: { en: '', sl: '', sr: '' },
    }
    layout.fields.push(field)
  }
  field.type = 'custom'
  field.textI18n = ensureLocalizedText(field.textI18n, field.text || '')
  return field
}

function applyFontPreset(layout: LayoutConfig, preset: A4FontSizePreset) {
  layout.fontSizePreset = preset
  const sizes = preset === 'COMPACT'
    ? { company: 11, title: 13, normal: 8, table: 8, total: 9, footer: 8 }
    : preset === 'LARGE'
      ? { company: 15, title: 19, normal: 11, table: 10, total: 13, footer: 10 }
      : { company: 13, title: 16, normal: 9, table: 9, total: 11, footer: 9 }
  for (const field of layout.fields) {
    if (field.key === 'companyName') field.fontSize = sizes.company
    else if (field.key === 'folioNumber') field.fontSize = sizes.title
    else if (field.key === 'templateFooterText') field.fontSize = sizes.footer
    else field.fontSize = sizes.normal
  }
  layout.table.headerFontSize = sizes.table
  layout.table.bodyFontSize = sizes.table
  for (const item of layout.footer.items) {
    item.fontSize = ['totalNett', 'discount', 'totalGross', 'usedAdvances', 'toBePaid'].includes(item.key) ? sizes.total : sizes.footer
  }
  layout.vatBreakdownTable.headerFontSize = Math.max(7, sizes.table - 1)
  layout.vatBreakdownTable.bodyFontSize = Math.max(7, sizes.table - 1)
}

function applyTemplateColumns(layout: LayoutConfig, compact = false) {
  ensureTemplateColumns(layout)
  ensureTemplateField(layout, 'folioIssueTimePlace', 'document', 'Time and place of issue', 'Ura in kraj izdaje', 'Vreme i mesto izdavanja')
  setColumn(layout, 'date', { visible: false, relX: 0, width: 0 })
  setColumn(layout, 'description', { visible: true, relX: 0, width: compact ? 188 : 195, alignment: 'left' })
  setColumn(layout, 'qty', { visible: true, relX: compact ? 188 : 195, width: 35, alignment: 'right' })
  setColumn(layout, 'nett', { visible: true, relX: compact ? 223 : 230, width: 80, alignment: 'right' })
  setColumn(layout, 'discount', { visible: true, relX: compact ? 303 : 310, width: 52, alignment: 'right' })
  setColumn(layout, 'gross', { visible: false, relX: 0, width: 0 })
  setColumn(layout, 'taxPercent', { visible: true, relX: compact ? 355 : 362, width: 48, alignment: 'right' })
  setColumn(layout, 'taxAmount', { visible: false, relX: 0, width: 0 })
  setColumn(layout, 'total', { visible: true, relX: compact ? 403 : 410, width: compact ? 92 : 85, alignment: 'right' })
}

function applyA4Template(current: LayoutConfig, templateId: Exclude<A4TemplateId, 'CUSTOM'>): LayoutConfig {
  const prefs = extractTemplatePreferences(current)
  const layout = cloneLayout(current)
  layout.templateId = templateId
  layout.accentColor = '#1677FF'
  layout.pageWidth = 595.28
  layout.pageHeight = 841.89
  ensureTemplateColumns(layout)
  ensureTemplateField(layout, 'folioIssueTimePlace', 'document', 'Time and place of issue', 'Ura in kraj izdaje', 'Vreme i mesto izdavanja')
  layout.fields = layout.fields.filter((field) => TEMPLATE_FIELD_KEYS.has(field.key))
  layout.footer.items = layout.footer.items.filter((item) => TEMPLATE_FOOTER_KEYS.has(item.key))
  layout.table.columns = layout.table.columns.filter((column) => TEMPLATE_COLUMN_KEYS.has(column.key))
  const footerText = ensureTemplateFooterField(layout)

  for (const field of layout.fields) field.visible = field.key === 'templateFooterText' ? prefs.footerTextVisible : true
  for (const item of layout.footer.items) item.visible = true
  for (const column of layout.table.columns) column.visible = true
  layout.logo.visible = true
  layout.signature.visible = true
  layout.paymentQr.visible = true
  layout.fiscalQr.visible = true
  layout.vatBreakdownTable.visible = true

  const referenceItem = footerFor(layout, 'notes')
  if (referenceItem) {
    referenceItem.label = 'Reference'
    referenceItem.labelI18n = { en: 'Reference', sl: 'Referenca', sr: 'Referenca' }
  }
  const ibanItem = footerFor(layout, 'iban')
  if (ibanItem) {
    ibanItem.label = 'IBAN'
    ibanItem.labelI18n = { en: 'IBAN', sl: 'TRR', sr: 'TRR' }
  }

  if (templateId === 'COMPACT') {
    layout.pageSections = { headerHeight: 250, footerHeight: 58 }
    Object.assign(layout.logo, { x: 248, y: 34, width: 96, height: 64 })
    setField(layout, 'companyName', { x: 50, y: 48, width: 185, height: 18, alignment: 'left', bold: true })
    setField(layout, 'companyAddress', { x: 50, y: 72, width: 185, height: 14, alignment: 'left' })
    setField(layout, 'companyPostalCodeCity', { x: 50, y: 90, width: 185, height: 14, alignment: 'left' })
    setField(layout, 'companyTaxId', { x: 50, y: 110, width: 185, height: 14, alignment: 'left' })
    setField(layout, 'folioNumber', { x: 360, y: 146, width: 185, height: 24, alignment: 'right', bold: true })
    setField(layout, 'recipientName', { x: 50, y: 214, width: 220, height: 16, alignment: 'left', bold: true })
    setField(layout, 'recipientAddress', { x: 50, y: 236, width: 220, height: 14, alignment: 'left' })
    setField(layout, 'recipientPostalCodeCity', { x: 50, y: 254, width: 220, height: 14, alignment: 'left' })
    setField(layout, 'recipientVatId', { x: 50, y: 272, width: 220, height: 14, alignment: 'left' })
    setField(layout, 'folioDate', { x: 318, y: 214, width: 227, height: 14, alignment: 'right' })
    setField(layout, 'folioIssueTimePlace', { x: 318, y: 240, width: 227, height: 14, alignment: 'right' })
    setField(layout, 'dateOfService', { x: 318, y: 266, width: 227, height: 14, alignment: 'right' })
    setField(layout, 'dueDate', { x: 318, y: 292, width: 227, height: 14, alignment: 'right' })
    Object.assign(layout.table, { startX: 50, startY: 338, width: 495, rowHeight: 23, headerHeight: 24, footerSpacing: 4 })
    applyTemplateColumns(layout, true)
    setColumn(layout, 'date', { visible: true, relX: 105, width: 70, alignment: 'left' })
    setColumn(layout, 'description', { relX: 0, width: 105, alignment: 'left', visible: true })
    setColumn(layout, 'qty', { relX: 175, width: 74, alignment: 'right', visible: true, label: 'Quantity × Price', labelI18n: { en: 'Quantity × Price', sl: 'Količina × Cena', sr: 'Količina × Cena' } })
    setColumn(layout, 'nett', { relX: 249, width: 89, alignment: 'right', visible: true })
    setColumn(layout, 'discount', { relX: 338, width: 56, alignment: 'right', visible: true })
    setColumn(layout, 'taxPercent', { relX: 394, width: 44, alignment: 'right', visible: true })
    setColumn(layout, 'total', { relX: 438, width: 57, alignment: 'right', visible: true })
    Object.assign(layout.vatBreakdownTable, { x: 50, y: 420, width: 235, headerHeight: 15, rowHeight: 15, visible: false })
    setFooter(layout, 'totalNett', { x: 300, y: 466, width: 245, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'discount', { x: 300, y: 488, width: 245, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'totalGross', { x: 300, y: 510, width: 245, height: 16, alignment: 'right', bold: true })
    setFooter(layout, 'usedAdvances', { x: 300, y: 532, width: 245, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'toBePaid', { x: 300, y: 556, width: 245, height: 20, alignment: 'right', bold: true })
    setFooter(layout, 'payment', { x: 50, y: 535, width: 220, height: 16, alignment: 'left', visible: false })
    setFooter(layout, 'iban', { x: 50, y: 132, width: 220, height: 16, alignment: 'left', visible: true })
    setFooter(layout, 'notes', { x: 180, y: 648, width: 110, height: 62, alignment: 'left' })
    setFooter(layout, 'fiscalZoi', { x: 325, y: 648, width: 118, height: 14, alignment: 'left' })
    setFooter(layout, 'fiscalEor', { x: 325, y: 678, width: 118, height: 14, alignment: 'left' })
    setFooter(layout, 'issuedBy', { x: 72, y: 752, width: 140, height: 18, alignment: 'left' })
    Object.assign(layout.paymentQr, { x: 63, y: 632, width: 88, height: 108 })
    Object.assign(layout.fiscalQr, { x: 456, y: 642, width: 72, height: 72, visible: true })
    Object.assign(layout.signature, { x: 286, y: 744, width: 210, height: 40 })
    Object.assign(footerText, { x: 50, y: 810, width: 495, height: 16, alignment: 'center' })
    applyFontPreset(layout, 'COMPACT')
  } else if (templateId === 'CLASSIC') {
    layout.pageSections = { headerHeight: 230, footerHeight: 58 }
    Object.assign(layout.logo, { x: 252, y: 34, width: 90, height: 66 })
    setField(layout, 'companyName', { x: 50, y: 120, width: 240, height: 18, alignment: 'left', bold: true })
    setField(layout, 'companyAddress', { x: 50, y: 140, width: 240, height: 14, alignment: 'left' })
    setField(layout, 'companyPostalCodeCity', { x: 50, y: 155, width: 240, height: 14, alignment: 'left' })
    setField(layout, 'companyTaxId', { x: 50, y: 170, width: 240, height: 14, alignment: 'left' })
    setField(layout, 'folioNumber', { x: 390, y: 120, width: 155, height: 22, alignment: 'right', bold: true })
    setField(layout, 'folioDate', { x: 365, y: 146, width: 180, height: 14, alignment: 'right' })
    setField(layout, 'dateOfService', { x: 365, y: 162, width: 180, height: 14, alignment: 'right' })
    setField(layout, 'dueDate', { x: 365, y: 178, width: 180, height: 14, alignment: 'right' })
    setField(layout, 'recipientName', { x: 50, y: 212, width: 250, height: 16, alignment: 'left', bold: true })
    setField(layout, 'recipientAddress', { x: 50, y: 230, width: 250, height: 14, alignment: 'left' })
    setField(layout, 'recipientPostalCodeCity', { x: 50, y: 245, width: 250, height: 14, alignment: 'left' })
    setField(layout, 'recipientVatId', { x: 315, y: 230, width: 230, height: 14, alignment: 'right' })
    Object.assign(layout.table, { startX: 50, startY: 290, width: 495, rowHeight: 24, headerHeight: 22, footerSpacing: 4 })
    applyTemplateColumns(layout)
    Object.assign(layout.vatBreakdownTable, { x: 50, y: 398, width: 290, headerHeight: 16, rowHeight: 16 })
    setFooter(layout, 'totalNett', { x: 380, y: 396, width: 165, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'discount', { x: 380, y: 414, width: 165, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'totalGross', { x: 380, y: 432, width: 165, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'usedAdvances', { x: 380, y: 450, width: 165, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'toBePaid', { x: 380, y: 472, width: 165, height: 18, alignment: 'right', bold: true })
    setFooter(layout, 'payment', { x: 405, y: 710, width: 140, height: 16, alignment: 'left' })
    setFooter(layout, 'iban', { x: 405, y: 728, width: 140, height: 16, alignment: 'left' })
    setFooter(layout, 'issuedBy', { x: 405, y: 782, width: 140, height: 16, alignment: 'right' })
    setFooter(layout, 'notes', { x: 50, y: 540, width: 495, height: 44, alignment: 'left' })
    setFooter(layout, 'fiscalZoi', { x: 165, y: 710, width: 215, height: 14, alignment: 'left' })
    setFooter(layout, 'fiscalEor', { x: 165, y: 728, width: 215, height: 14, alignment: 'left' })
    Object.assign(layout.paymentQr, { x: 405, y: 610, width: 96, height: 108 })
    Object.assign(layout.fiscalQr, { x: 50, y: 610, width: 96, height: 96, visible: true })
    Object.assign(layout.signature, { x: 405, y: 748, width: 118, height: 40 })
    Object.assign(footerText, { x: 50, y: 802, width: 495, height: 16, alignment: 'center' })
    applyFontPreset(layout, 'STANDARD')
  } else {
    layout.pageSections = { headerHeight: 190, footerHeight: 58 }
    Object.assign(layout.logo, { x: 430, y: 52, width: 84, height: 84 })
    setField(layout, 'companyName', { x: 50, y: 58, width: 250, height: 18, alignment: 'left', bold: true })
    setField(layout, 'companyAddress', { x: 50, y: 82, width: 250, height: 14, alignment: 'left' })
    setField(layout, 'companyPostalCodeCity', { x: 50, y: 100, width: 250, height: 14, alignment: 'left' })
    setField(layout, 'companyTaxId', { x: 50, y: 130, width: 250, height: 14, alignment: 'left' })
    setField(layout, 'folioNumber', { x: 360, y: 184, width: 185, height: 24, alignment: 'right', bold: true })
    setField(layout, 'recipientName', { x: 50, y: 236, width: 220, height: 16, alignment: 'left', bold: true })
    setField(layout, 'recipientAddress', { x: 50, y: 262, width: 220, height: 14, alignment: 'left' })
    setField(layout, 'recipientPostalCodeCity', { x: 50, y: 288, width: 220, height: 14, alignment: 'left' })
    setField(layout, 'recipientVatId', { x: 50, y: 314, width: 220, height: 14, alignment: 'left' })
    setField(layout, 'folioDate', { x: 318, y: 236, width: 227, height: 14, alignment: 'right' })
    setField(layout, 'folioIssueTimePlace', { x: 318, y: 262, width: 227, height: 14, alignment: 'right' })
    setField(layout, 'dateOfService', { x: 318, y: 288, width: 227, height: 14, alignment: 'right' })
    setField(layout, 'dueDate', { x: 318, y: 314, width: 227, height: 14, alignment: 'right' })
    Object.assign(layout.table, { startX: 50, startY: 372, width: 495, rowHeight: 25, headerHeight: 23, footerSpacing: 5 })
    applyTemplateColumns(layout)
    setColumn(layout, 'date', { visible: true, relX: 96, width: 70, alignment: 'left' })
    setColumn(layout, 'description', { relX: 0, width: 96, alignment: 'left', visible: true })
    setColumn(layout, 'qty', { relX: 166, width: 84, alignment: 'right', visible: true, label: 'Quantity × Price', labelI18n: { en: 'Quantity × Price', sl: 'Količina × Cena', sr: 'Količina × Cena' } })
    setColumn(layout, 'nett', { relX: 250, width: 86, alignment: 'right', visible: true })
    setColumn(layout, 'discount', { relX: 336, width: 56, alignment: 'right', visible: true })
    setColumn(layout, 'taxPercent', { relX: 392, width: 46, alignment: 'right', visible: true })
    setColumn(layout, 'total', { relX: 438, width: 57, alignment: 'right', visible: true })
    Object.assign(layout.vatBreakdownTable, { x: 50, y: 442, width: 210, headerHeight: 16, rowHeight: 16, visible: false })
    setFooter(layout, 'totalNett', { x: 330, y: 474, width: 215, height: 18, alignment: 'right', bold: false })
    setFooter(layout, 'discount', { x: 330, y: 500, width: 215, height: 18, alignment: 'right', bold: false })
    setFooter(layout, 'totalGross', { x: 330, y: 526, width: 215, height: 18, alignment: 'right', bold: true })
    setFooter(layout, 'usedAdvances', { x: 330, y: 552, width: 215, height: 18, alignment: 'right', bold: false })
    setFooter(layout, 'toBePaid', { x: 330, y: 580, width: 215, height: 22, alignment: 'right', bold: true })
    setFooter(layout, 'payment', { x: 50, y: 550, width: 220, height: 16, alignment: 'left', visible: false })
    setFooter(layout, 'iban', { x: 50, y: 148, width: 250, height: 16, alignment: 'left', visible: true })
    setFooter(layout, 'fiscalZoi', { x: 150, y: 496, width: 150, height: 14, alignment: 'left', visible: true })
    setFooter(layout, 'fiscalEor', { x: 150, y: 522, width: 150, height: 14, alignment: 'left', visible: true })
    setFooter(layout, 'notes', { x: 50, y: 628, width: 205, height: 60, alignment: 'left' })
    setFooter(layout, 'issuedBy', { x: 50, y: 748, width: 180, height: 18, alignment: 'left' })
    Object.assign(layout.paymentQr, { x: 330, y: 624, width: 98, height: 122 })
    Object.assign(layout.fiscalQr, { x: 50, y: 490, width: 92, height: 92, visible: true })
    Object.assign(layout.signature, { x: 330, y: 744, width: 190, height: 44 })
    Object.assign(footerText, { x: 50, y: 810, width: 495, height: 16, alignment: 'left' })
    applyFontPreset(layout, 'LARGE')
  }

  ;['recipientVatId'].forEach((key) => { const field = fieldFor(layout, key); if (field) field.prefixI18n = { en: '', sl: '', sr: '' } })
  ;([['folioDate', DOCUMENT_PREFIX_DEFAULTS.folioDate], ['folioIssueTimePlace', DOCUMENT_PREFIX_DEFAULTS.folioIssueTimePlace], ['dateOfService', DOCUMENT_PREFIX_DEFAULTS.dateOfService], ['dueDate', DOCUMENT_PREFIX_DEFAULTS.dueDate]] as [string, LocalizedText][]).forEach(([key, prefix]) => {
    const field = fieldFor(layout, key)
    if (field) field.prefixI18n = { ...prefix }
  })
  layout.taxClauses = prefs.taxClauses
  footerText.text = prefs.footerText
  footerText.textI18n = prefs.footerTextI18n || ensureLocalizedText(footerText.textI18n, prefs.footerText)
  footerText.visible = prefs.footerTextVisible
  layout.logo.visible = prefs.logoVisible
  layout.signature.visible = prefs.signatureVisible
  layout.paymentQr.visible = prefs.paymentQrVisible
  layout.fiscalQr.visible = prefs.fiscalVisible
  layout.fields.filter((field) => field.group === 'recipient').forEach((field) => { field.visible = prefs.recipientVisible })
  const quantityColumn = columnFor(layout, 'qty')
  if (quantityColumn) quantityColumn.visible = prefs.unitColumnsVisible
  ;['fiscalZoi', 'fiscalEor'].forEach((key) => { const item = footerFor(layout, key); if (item) item.visible = prefs.fiscalVisible })
  const notesItem = footerFor(layout, 'notes')
  if (notesItem) notesItem.visible = prefs.notesVisible
  const issuedByItem = footerFor(layout, 'issuedBy')
  if (issuedByItem) issuedByItem.visible = prefs.issuedByVisible

  return layout
}

function QuickSwitch({ checked, onChange, label, hint }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="fle-quick-option">
      <span><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
      <button type="button" className={`fle-quick-switch${checked ? ' is-on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
    </label>
  )
}

function isDateField(field: FieldConfig) {
  return field.type !== 'custom' && DATE_FIELD_KEYS.has(field.key)
}

function isPrefixField(field: FieldConfig) {
  return field.type !== 'custom' && PREFIX_FIELD_KEYS.has(field.key)
}

function defaultDateFormatForField(key: string): DateFormat {
  return key === 'folioDate' ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY'
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
  return locale === 'sl' ? 'Račun:' : locale === 'sr' ? 'Račun:' : 'Invoice:'
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
    { key: 'notes', label: 'Reference', labelI18n: { en: 'Reference', sl: 'Referenca', sr: 'Referenca' }, fontSize: 9, bold: false, alignment: 'left', x: 50, y: 362, width: 300, height: 16 },
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
  data.templateId = ['COMPACT', 'CLASSIC', 'MINIMAL'].includes(String(data.templateId || '').toUpperCase())
    ? String(data.templateId).toUpperCase()
    : 'CLASSIC'
  data.accentColor = /^#[0-9A-Fa-f]{6}$/.test(String(data.accentColor || '')) ? data.accentColor : '#1677FF'
  data.fontSizePreset = ['COMPACT', 'STANDARD', 'LARGE'].includes(String(data.fontSizePreset || '').toUpperCase())
    ? String(data.fontSizePreset).toUpperCase()
    : 'STANDARD'
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
  ensureTemplateColumns(data)
  for (const col of data.table?.columns ?? []) {
    if (col.visible == null) col.visible = true
    const defaults = TEMPLATE_COLUMN_DEFAULTS[col.key]
    if (defaults) {
      col.label = defaults.label
      col.labelI18n = { ...defaults.labelI18n }
    } else {
      col.labelI18n = ensureLocalizedText(col.labelI18n, col.label)
      col.label = resolveLocalizedText(col.labelI18n, col.label, 'en')
    }
    if (col.key === 'date' && !col.dateFormat) col.dateFormat = 'DD.MM.YYYY'
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
    if (item.visible == null) item.visible = true
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

function A4FolioLayoutEditor() {
  const { locale } = useLocale()
  const [layout, setLayout] = useState<LayoutConfig | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [zoom, setZoom] = useState(0.78)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [testing, setTesting] = useState(false)
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
          setLayout(rebaseToSelectedTemplate(data))
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
          setLayout(rebaseToSelectedTemplate(fresh))
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
        setLayout(rebaseToSelectedTemplate(parsed))
        setSelection(null)
        setDirty(false)
      }
    } catch (err) {
      console.error('Failed to reset folio layout', err)
    }
  }

  const selectBuiltInTemplate = (templateId: Exclude<A4TemplateId, 'CUSTOM'>) => {
    if (!layout) return
    setLayout(applyA4Template(layout, templateId))
    setSelection(null)
    setAdvancedMode(false)
    setDirty(true)
    setStyleNotice(locale === 'sl'
      ? `Predloga »${A4_TEMPLATE_META.find((template) => template.id === templateId)?.name.sl || templateId}« je izbrana. Kliknite Shrani, da jo uporabite.`
      : `Template “${A4_TEMPLATE_META.find((template) => template.id === templateId)?.name[locale] || templateId}” selected. Click Save to apply it.`)
  }

  const setRecipientVisible = (visible: boolean) => mutateLayout((next) => {
    next.fields.filter((field) => field.group === 'recipient').forEach((field) => { field.visible = visible })
  })

  const setColumnsVisible = (visible: boolean) => mutateLayout((next) => {
    for (const key of ['qty']) {
      const column = columnFor(next, key)
      if (column) column.visible = visible
    }
  })

  const setFooterItemVisible = (keys: string[], visible: boolean) => mutateLayout((next) => {
    for (const key of keys) {
      const item = footerFor(next, key)
      if (item) item.visible = visible
    }
  })

  const setFooterText = (value: string) => mutateLayout((next) => {
    const field = ensureTemplateFooterField(next)
    field.textI18n = ensureLocalizedText(field.textI18n, field.text || '')
    field.textI18n[locale] = value
    field.text = resolveLocalizedText(field.textI18n, value, 'en')
    field.visible = value.trim().length > 0
  })

  const testPrint = async () => {
    setTesting(true)
    const prepared = window.open('', '_blank')
    try {
      if (layout && dirty) await api.put('/billing/folio-layout', layout)
      const sample = {
        companyName: 'Calendra Studio d.o.o.', companyAddress: 'Glavna ulica 12', companyPostalCode: '2000', companyCity: 'Maribor', companyTaxId: 'SI12345678',
        folioNumber: '2026-00042', folioNumberLabel: locale === 'sl' || locale === 'sr' ? 'Račun:' : 'Invoice:', folioDate: '31.07.2026 12:45', dateOfService: '31.07.2026', dueDate: '14.08.2026',
        recipientName: 'Ana Novak', recipientAddress: 'Cesta 5', recipientPostalCode: '1000', recipientCity: 'Ljubljana', recipientVatId: 'SI98765432',
        services: [
          { date: '31.07.2026', description: locale === 'sl' ? 'Masaža hrbta in vratu' : 'Back and neck massage', qty: 1, nettPrice: 40.98, grossPrice: 50, taxPercent: '22%', taxAmount: 9.02, totalPrice: 50 },
          { date: '31.07.2026', description: locale === 'sl' ? 'Individualno svetovanje' : 'Individual counselling', qty: 2, nettPrice: 20.49, grossPrice: 25, taxPercent: '22%', taxAmount: 9.02, totalPrice: 50 },
        ],
        paymentMethods: [{ name: locale === 'sl' ? 'Bančno nakazilo' : 'Bank transfer', amountGross: 100 }],
        paymentMethod: locale === 'sl' ? 'Bančno nakazilo' : 'Bank transfer', issuedBy: 'David Mirc', iban: 'SI56 5678 1234 5678 901', toBePaidGross: 100,
        paymentQrPayload: 'https://calendra.si/placilo/test', fiscalQr: 'https://calendra.si/fiscal/test', fiscalZoi: '1234567890', fiscalEor: 'EOR-2026-42',
        notes: locale === 'sl' ? 'Hvala za vaš obisk. V primeru vprašanj smo vam na voljo.' : 'Thank you for your visit. Please contact us if you have any questions.', locale,
      }
      const response = await api.post(`/billing/folio/pdf?format=A4&locale=${locale}`, sample, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      if (prepared) prepared.location.href = url
      else window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
      if (layout && dirty) setDirty(false)
    } catch (err) {
      prepared?.close()
      console.error('A4 test print failed', err)
      setStyleNotice(locale === 'sl' ? 'Testnega A4 računa ni bilo mogoče pripraviti.' : 'Unable to prepare the A4 test invoice.')
    } finally {
      setTesting(false)
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
      if (file.size > FOLIO_IMAGE_MAX_BYTES) {
        window.alert(locale === 'sl'
          ? `Logotip mora biti manjši od ${FOLIO_IMAGE_MAX_MB} MB.`
          : `Logo must be smaller than ${FOLIO_IMAGE_MAX_MB} MB.`)
        return
      }
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await api.post('/billing/folio-logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        setLogoDataUrl(r.data as string)
      } catch (err: any) {
        console.error('Logo upload failed', err)
        window.alert(locale === 'sl'
          ? 'Nalaganje logotipa ni uspelo. Preverite, ali je datoteka PNG/JPEG in manjša od 2 MB.'
          : 'Logo upload failed. Please check that the file is PNG/JPEG and smaller than 2 MB.')
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
      if (file.size > FOLIO_IMAGE_MAX_BYTES) {
        window.alert(locale === 'sl'
          ? `Podpis mora biti manjši od ${FOLIO_IMAGE_MAX_MB} MB.`
          : `Signature must be smaller than ${FOLIO_IMAGE_MAX_MB} MB.`)
        return
      }
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
        window.alert(locale === 'sl'
          ? 'Nalaganje podpisa ni uspelo. Preverite, ali je datoteka PNG/JPEG in manjša od 2 MB.'
          : 'Signature upload failed. Please check that the file is PNG/JPEG and smaller than 2 MB.')
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
      if (!layout || !advancedMode) return
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
    [layout, advancedMode],
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
  const copy = {
    styleLabel: locale === 'sl' ? 'Slog računa' : 'Invoice style',
    selectStyle: locale === 'sl' ? 'Izberite slog...' : 'Select style...',
    loadStyle: locale === 'sl' ? 'Naloži slog' : 'Load style',
    zoom: locale === 'sl' ? 'Povečava' : 'Zoom',
    snap: locale === 'sl' ? 'Pripni na mrežo' : 'Snap',
    header: locale === 'sl' ? 'Glava' : 'Header',
    footer: locale === 'sl' ? 'Noga' : 'Footer',
    textField: locale === 'sl' ? 'Besedilno polje' : 'Text field',
    import: locale === 'sl' ? 'Uvozi' : 'Import',
    export: locale === 'sl' ? 'Izvozi' : 'Export',
    reset: locale === 'sl' ? 'Ponastavi' : 'Reset',
    save: locale === 'sl' ? 'Shrani' : 'Save',
    saving: locale === 'sl' ? 'Shranjujem...' : 'Saving...',
    emptyText: locale === 'sl'
      ? 'Kliknite polje, prostor strani, tabelo storitev, tabelo predplačil, tabelo razčlenitve DDV, logotip, plačilni QR, davčni QR, podpis ali element noge, da uredite njegove lastnosti.'
      : 'Click a field, page space, services table, advance payments table, VAT breakdown table, logo, payment QR, fiscal QR, signature, or a footer item to edit its properties.',
    editPageSpaces: locale === 'sl' ? 'Uredi razmike strani' : 'Edit page spaces',
    templatesTitle: locale === 'sl' ? 'Izberite predlogo' : locale === 'sr' ? 'Izaberite predložak' : 'Choose a template',
    templatesSubtitle: locale === 'sl' ? 'Predloge so optimizirane za tisk na A4 in jih lahko kadar koli zamenjate.' : locale === 'sr' ? 'Predlošci su optimizovani za A4 štampu i možete ih promeniti u bilo kom trenutku.' : 'Templates are optimized for A4 printing and can be changed at any time.',
    content: locale === 'sl' ? 'Vsebina računa' : locale === 'sr' ? 'Sadržaj računa' : 'Invoice content',
    textSize: locale === 'sl' ? 'Velikost besedila' : locale === 'sr' ? 'Veličina teksta' : 'Text size',
    footerText: locale === 'sl' ? 'Besedilo v nogi' : locale === 'sr' ? 'Tekst u podnožju' : 'Footer text',
    footerHint: locale === 'sl' ? 'Neobvezno sporočilo, na primer zahvala ali povezava do spletne strani.' : locale === 'sr' ? 'Opciono, na primer zahvalnica ili adresa sajta.' : 'Optional message such as a thank-you note or website address.',
    test: locale === 'sl' ? 'Testno tiskanje' : locale === 'sr' ? 'Probna štampa' : 'Test print',
    advanced: locale === 'sl' ? 'Napredno urejanje' : locale === 'sr' ? 'Napredno uređivanje' : 'Advanced editing',
    closeAdvanced: locale === 'sl' ? 'Zapri napredno urejanje' : locale === 'sr' ? 'Zatvori napredno uređivanje' : 'Close advanced editing',
  }

  const activeTemplate = (layout.templateId || 'CLASSIC') as A4TemplateId
  const footerTextField = fieldFor(layout, 'templateFooterText')
  const currentFooterText = footerTextField ? resolveLocalizedText(footerTextField.textI18n, footerTextField.text || '', locale) : ''
  const recipientVisible = layout.fields.filter((field) => field.group === 'recipient').some((field) => field.visible)
  const unitColumnsVisible = columnFor(layout, 'qty')?.visible !== false
  const fiscalVisible = layout.fiscalQr.visible || ['fiscalZoi', 'fiscalEor'].some((key) => footerFor(layout, key)?.visible !== false)
  const notesVisible = footerFor(layout, 'notes')?.visible !== false
  const issuedByVisible = footerFor(layout, 'issuedBy')?.visible !== false

  /* ── Render ── */

  return (
    <div className={`fle-root${advancedMode ? ' fle-root--advanced' : ' fle-root--preview'}`}>
      <section className="fle-template-selector">
        <div className="fle-template-selector-heading">
          <div>
            <h3>{copy.templatesTitle}</h3>
            <p>{copy.templatesSubtitle}</p>
          </div>
        </div>
        <div className="fle-template-grid">
          {A4_TEMPLATE_META.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`fle-template-card${activeTemplate === template.id ? ' is-selected' : ''}`}
              onClick={() => selectBuiltInTemplate(template.id)}
              aria-pressed={activeTemplate === template.id}
            >
              <span className={`fle-template-thumb fle-template-thumb--${template.id.toLowerCase()}`} aria-hidden="true">
                <span className="fle-template-thumb-logo" />
                <span className="fle-template-thumb-title" />
                <span className="fle-template-thumb-meta" />
                <span className="fle-template-thumb-recipient" />
                <span className="fle-template-thumb-table" />
                <span className="fle-template-thumb-total" />
                <span className="fle-template-thumb-qr" />
              </span>
              <span className="fle-template-card-copy">
                <strong>{template.name[locale]}</strong>
                <small>{template.description[locale]}</small>
              </span>
              <span className="fle-template-radio"><span /></span>
            </button>
          ))}
        </div>
        <div className="fle-template-info">
          <span>i</span>
          <p>{locale === 'sl' ? 'Predloge so prednastavljene in optimizirane za izpis na A4.' : locale === 'sr' ? 'Predlošci su unapred podešeni i optimizovani za A4 štampu.' : 'Templates are preconfigured and optimized for A4 printing.'}</p>
        </div>
      </section>

      <div className="fle-toolbar">
        {advancedMode && (
          <>
            <label className="fle-toolbar-item fle-style-picker">
              {copy.styleLabel}
              <select className="fle-style-select" value={selectedStyleId} onChange={(e) => selectFolioStyle(e.target.value)}>
                <option value="">{copy.selectStyle}</option>
                {folioStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
              </select>
            </label>
            <button type="button" className="fle-btn" onClick={loadSelectedFolioStyle} disabled={!selectedStyleId}>{copy.loadStyle}</button>
            {isPlatformAdmin && (
              <div className="fle-platform-style-tools">
                <input className="fle-style-input" type="text" value={styleName} onChange={(e) => setStyleName(e.target.value)} placeholder="Style name" />
                <input className="fle-style-input fle-style-input--wide" type="text" value={styleDescription} onChange={(e) => setStyleDescription(e.target.value)} placeholder="Description" />
                <button type="button" className="fle-btn fle-btn-add" onClick={() => savePlatformFolioStyle('create')} disabled={styleSaving || !layout}>Save as style</button>
                <button type="button" className="fle-btn" onClick={() => savePlatformFolioStyle('update')} disabled={styleSaving || !selectedStyleId || !layout}>Update style</button>
                <button type="button" className="fle-btn fle-btn-secondary" onClick={deleteSelectedPlatformFolioStyle} disabled={styleSaving || !selectedStyleId}>Delete style</button>
              </div>
            )}
            <label className="fle-toolbar-item">
              {copy.zoom}
              <input type="range" min={0.4} max={1.5} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              <span>{Math.round(zoom * 100)}%</span>
            </label>
            <label className="fle-toolbar-item fle-snap-toggle">
              <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
              {copy.snap}
            </label>
            <label className="fle-toolbar-item">
              {copy.header}
              <input className="fle-toolbar-number" type="number" min={0} max={Math.max(0, layout.pageHeight - layout.pageSections.footerHeight - 180)} value={Math.round(layout.pageSections.headerHeight)} onChange={(e) => mutateLayout((next) => { next.pageSections.headerHeight = Number(e.target.value); normalizePageSections(next) })} /> pt
            </label>
            <label className="fle-toolbar-item">
              {copy.footer}
              <input className="fle-toolbar-number" type="number" min={0} max={Math.max(0, layout.pageHeight - layout.pageSections.headerHeight - 180)} value={Math.round(layout.pageSections.footerHeight)} onChange={(e) => mutateLayout((next) => { next.pageSections.footerHeight = Number(e.target.value); normalizePageSections(next) })} /> pt
            </label>
            <button type="button" className="fle-btn fle-btn-add" onClick={addCustomField}>+ {copy.textField}</button>
            <button type="button" className="fle-btn" onClick={importJson}>{copy.import}</button>
            <button type="button" className="fle-btn" onClick={exportJson}>{copy.export}</button>
          </>
        )}
        <div className="fle-toolbar-spacer" />
        <button type="button" className="fle-btn" onClick={() => void testPrint()} disabled={testing}>{testing ? '…' : copy.test}</button>
        <button type="button" className="fle-btn fle-btn-secondary" onClick={reset}>{copy.reset}</button>
        <button type="button" className="fle-btn fle-btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? copy.saving : copy.save}</button>
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
            className={`fle-canvas${advancedMode ? '' : ' fle-canvas--preview'}`}
            data-template={activeTemplate}
            style={{ width: pw, height: ph, '--fle-accent': layout.accentColor || '#1677FF' } as React.CSSProperties}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => setSelection(null)}
          >
            {/* Grid dots */}
            {advancedMode && snapEnabled && (
              <svg className="fle-grid" width={pw} height={ph}>
                {Array.from({ length: Math.floor(layout.pageWidth / 25) + 1 }, (_, i) =>
                  Array.from({ length: Math.floor(layout.pageHeight / 25) + 1 }, (_, j) => (
                    <circle key={`${i}-${j}`} cx={i * 25 * scale} cy={j * 25 * scale} r={0.5} fill="var(--fle-grid-dot)" />
                  )),
                )}
              </svg>
            )}

            {/* Ruler marks */}
            {advancedMode && (<>
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
            </>)}

            {/* Header / main / footer page spaces */}
            {advancedMode && (() => {
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

            {!advancedMode && activeTemplate !== 'CLASSIC' && (
              <div className={`fle-template-design fle-template-design--${activeTemplate.toLowerCase()}`} aria-hidden="true">
                <span className="fle-template-design-header-line" />
                <span className="fle-template-design-recipient-label">{locale === 'sl' ? 'Prejemnik' : locale === 'sr' ? 'Primalac' : 'Recipient'}</span>
                {activeTemplate === 'MINIMAL' ? <span className="fle-template-design-items-label">{locale === 'sl' ? 'Postavke' : locale === 'sr' ? 'Stavke' : 'Items'}</span> : null}
                {activeTemplate === 'COMPACT' ? <><span className="fle-template-design-card fle-template-design-card--payment" /><span className="fle-template-design-card fle-template-design-card--fiscal" /></> : null}
                <span className="fle-template-design-reference-label">{locale === 'sl' || locale === 'sr' ? 'Referenca' : 'Reference'}</span>
                <span className="fle-template-design-issued-label">{locale === 'sl' ? 'Izdal' : locale === 'sr' ? 'Izdao' : 'Issued by'}</span>
                <span className="fle-template-design-signature-label">{locale === 'sl' ? 'Podpis' : locale === 'sr' ? 'Potpis' : 'Signature'}</span>
              </div>
            )}

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
                    {t.columns.filter((col) => advancedMode || col.visible !== false).map((col) => (
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
                      {t.columns.filter((col) => advancedMode || col.visible !== false).map((col) => (
                        <span key={col.key} className="fle-table-col-cell" style={{
                          left: col.relX * scale,
                          width: col.width * scale,
                          textAlign: col.alignment,
                          fontSize: Math.max(7, t.bodyFontSize * scale * 0.7),
                        }}>
                          {sampleTableCell(col.key, locale)}
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

            {/* Tax clauses preview */}
            {!advancedMode && (layout.taxClauses || []).length > 0 && (() => {
              const placement = taxClausePreviewPlacement(activeTemplate)
              const lineHeight = 12 * scale
              const bodyHeight = Math.max(placement.minHeight * scale, (layout.taxClauses || []).length * lineHeight + 12 * scale)
              return (
                <div
                  className={`fle-tax-clauses-preview fle-tax-clauses-preview--${activeTemplate.toLowerCase()}`}
                  style={{
                    left: placement.x * scale,
                    top: placement.y * scale,
                    width: placement.width * scale,
                    minHeight: bodyHeight,
                  }}
                >
                  <div className="fle-tax-clauses-preview-lines" style={{ gap: 3 * scale, fontSize: Math.max(6, 8 * scale * 0.72), lineHeight: 1.35 }}>
                    {(layout.taxClauses || []).map((clause) => (
                      <div key={clause} className="fle-tax-clauses-preview-line">{clause}</div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Footer items preview — positioned absolutely when x/y are set */}
            {layout.footer.items.map((item, idx) => {
              if (!advancedMode && item.visible === false) return null
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
                  className={`fle-footer-item ${isSel ? 'fle-footer-item--selected' : ''} ${item.visible === false ? 'fle-field--hidden' : ''}`}
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
                  {advancedMode ? resolveLocalizedText(item.labelI18n, item.label, locale) : sampleFooterItem(item, locale)}
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
          <div className="fle-quick-settings">
            <section className="fle-quick-card">
              <h4>{copy.content}</h4>
              <QuickSwitch checked={layout.logo.visible} onChange={(visible) => mutateLayout((next) => { next.logo.visible = visible })} label={locale === 'sl' ? 'Prikaži logotip' : locale === 'sr' ? 'Prikaži logo' : 'Show logo'} />
              <QuickSwitch checked={recipientVisible} onChange={setRecipientVisible} label={locale === 'sl' ? 'Prejemnik' : locale === 'sr' ? 'Primalac' : 'Recipient'} />
              <QuickSwitch checked={unitColumnsVisible} onChange={setColumnsVisible} label={locale === 'sl' ? 'Količina' : locale === 'sr' ? 'Količina' : 'Quantity'} />
              <div className="fle-quick-form">
                <label>
                  <span>{taxClausesTitle(locale)}</span>
                  <select
                    value=""
                    onChange={(e) => {
                      const clause = e.target.value
                      if (!clause) return
                      mutateLayout((next) => {
                        const current = new Set(normalizeTaxClauses(next.taxClauses))
                        current.add(clause)
                        next.taxClauses = Array.from(current)
                      })
                      e.currentTarget.value = ''
                    }}
                  >
                    <option value="">{locale === 'sl' ? 'Dodaj davčno klavzulo…' : locale === 'sr' ? 'Dodaj poresku klauzulu…' : 'Add tax clause…'}</option>
                    {TAX_CLAUSE_OPTIONS.filter((clause) => !(layout.taxClauses || []).includes(clause)).map((clause) => (
                      <option key={clause} value={clause}>{clause}</option>
                    ))}
                  </select>
                </label>
                <small>{locale === 'sl' ? 'Izberete lahko eno ali več klavzul, ki bodo prikazane na računu.' : locale === 'sr' ? 'Možete izabrati jednu ili više klauzula koje će biti prikazane na računu.' : 'You can select one or multiple clauses that will be shown on the invoice.'}</small>
                <div className="fle-tax-clause-list">
                  {(layout.taxClauses || []).length === 0 ? (
                    <div className="fle-tax-clause-empty">{locale === 'sl' ? 'Ni izbranih davčnih klavzul.' : locale === 'sr' ? 'Nema izabranih poreskih klauzula.' : 'No tax clauses selected.'}</div>
                  ) : (layout.taxClauses || []).map((clause) => (
                    <div key={clause} className="fle-tax-clause-chip">
                      <span>{clause}</span>
                      <button type="button" onClick={() => mutateLayout((next) => { next.taxClauses = normalizeTaxClauses(next.taxClauses).filter((item) => item !== clause) })} aria-label="Remove tax clause">×</button>
                    </div>
                  ))}
                </div>
              </div>
              <QuickSwitch checked={layout.paymentQr.visible} onChange={(visible) => mutateLayout((next) => { next.paymentQr.visible = visible })} label="UPN QR" hint={locale === 'sl' ? 'Prikaže se samo, ko so podatki za QR popolni.' : 'Shown only when QR details are complete.'} />
              <QuickSwitch checked={fiscalVisible} onChange={(visible) => mutateLayout((next) => { next.fiscalQr.visible = visible; for (const key of ['fiscalZoi', 'fiscalEor']) { const item = footerFor(next, key); if (item) item.visible = visible } })} label={locale === 'sl' ? 'Fiskalni podatki' : locale === 'sr' ? 'Fiskalni podaci' : 'Fiscal details'} />
              <QuickSwitch checked={notesVisible} onChange={(visible) => setFooterItemVisible(['notes'], visible)} label={locale === 'sl' ? 'Referenca' : locale === 'sr' ? 'Referenca' : 'Reference'} />
              <QuickSwitch checked={issuedByVisible} onChange={(visible) => setFooterItemVisible(['issuedBy'], visible)} label={locale === 'sl' ? 'Prikaži zaposlenega, ki je izdal račun' : locale === 'sr' ? 'Prikaži zaposlenog koji je izdao račun' : 'Show employee who issued the invoice'} />
              <QuickSwitch checked={layout.signature.visible} onChange={(visible) => mutateLayout((next) => { next.signature.visible = visible })} label={locale === 'sl' ? 'Podpis' : locale === 'sr' ? 'Potpis' : 'Signature'} />
            </section>

            <section className="fle-quick-card fle-quick-form">
              <label>
                <span>{copy.textSize}</span>
                <select value={layout.fontSizePreset || 'STANDARD'} onChange={(e) => mutateLayout((next) => { applyFontPreset(next, e.target.value as A4FontSizePreset) })}>
                  <option value="COMPACT">{locale === 'sl' ? 'Kompaktno' : locale === 'sr' ? 'Kompaktno' : 'Compact'}</option>
                  <option value="STANDARD">{locale === 'sl' ? 'Standardno' : locale === 'sr' ? 'Standardno' : 'Standard'}</option>
                  <option value="LARGE">{locale === 'sl' ? 'Večje' : locale === 'sr' ? 'Veće' : 'Larger'}</option>
                </select>
              </label>
              <label>
                <span>{locale === 'sl' ? 'Poudarjena barva' : locale === 'sr' ? 'Akcentna boja' : 'Accent color'}</span>
                <div className="fle-accent-control">
                  <input type="color" value={layout.accentColor || '#1677FF'} onChange={(e) => mutateLayout((next) => { next.accentColor = e.target.value })} />
                  <input type="text" value={layout.accentColor || '#1677FF'} onChange={(e) => { const value = e.target.value; if (/^#[0-9A-Fa-f]{6}$/.test(value)) mutateLayout((next) => { next.accentColor = value }) }} />
                </div>
              </label>
              <label>
                <span>{copy.footerText}</span>
                <textarea rows={3} value={currentFooterText} onChange={(e) => setFooterText(e.target.value)} placeholder={locale === 'sl' ? 'Hvala za vaše zaupanje.' : 'Thank you for your trust.'} />
                <small>{copy.footerHint}</small>
              </label>
            </section>
          </div>
          {selection === null && (
            <div className="fle-panel-empty">
              <p className="muted">{copy.emptyText}</p>
              <button type="button" className="fle-btn" onClick={() => setSelection({ type: 'pageSections' })}>{copy.editPageSpaces}</button>
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
                      value={selectedField.dateFormat || defaultDateFormatForField(selectedField.key)}
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
                    <Field label="Visible">
                      <input type="checkbox" checked={col.visible !== false} onChange={(e) => mutateLayout((l) => { l.table.columns[ci].visible = e.target.checked })} />
                    </Field>
                    {col.key === 'date' ? (
                      <Field label="Date format">
                        <select
                          value={col.dateFormat || 'DD.MM.YYYY'}
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
                <Field label="Visible">
                  <input type="checkbox" checked={selectedFooterItem.visible !== false} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].visible = e.target.checked })} />
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


export function FolioLayoutEditor() {
  const { locale } = useLocale()
  const [format, setFormat] = useState<'A4' | 'POS_58'>('A4')
  return (
    <div className="fle-format-shell">
      <div className="fle-format-header">
        <div>
          <strong>{locale === 'sl' ? 'Predloge računov' : locale === 'sr' ? 'Predlošci računa' : 'Invoice templates'}</strong>
          <span>{locale === 'sl' ? 'Izberite obliko računa in prilagodite postavitev za A4 ali termični tisk 58 mm.' : locale === 'sr' ? 'Izaberite format računa i prilagodite raspored za A4 ili termalnu štampu od 58 mm.' : 'Choose an invoice format and customize the layout for A4 or 58 mm thermal printing.'}</span>
        </div>
        <div className="fle-format-toggle" role="tablist">
          <button type="button" className={format === 'POS_58' ? 'active' : ''} onClick={() => setFormat('POS_58')} role="tab" aria-selected={format === 'POS_58'}>58 mm</button>
          <button type="button" className={format === 'A4' ? 'active' : ''} onClick={() => setFormat('A4')} role="tab" aria-selected={format === 'A4'}>A4</button>
        </div>
      </div>
      {format === 'A4' ? <A4FolioLayoutEditor /> : <PosReceiptLayoutEditor />}
    </div>
  )
}
