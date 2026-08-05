import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useLocale, type AppLocale } from '../locale'
import { PosReceiptLayoutEditor } from './PosReceiptLayoutEditor'
import { GuestSwitch } from './configuration/ConfigurationVisualComponents'
import '../styles/folio-layout-editor.css'


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
  sectionOrder?: string[]
  hiddenSections?: string[]
  referenceText?: string
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




const DEFAULT_PAGE_SECTIONS: PageSectionsConfig = { headerHeight: 200, footerHeight: 90 }
const DEFAULT_LOGO: LogoConfig = { x: 400, y: 40, width: 120, height: 60, visible: true }
const DEFAULT_SIGNATURE: SignatureConfig = { x: 50, y: 464, width: 120, height: 50, visible: true }
const DEFAULT_PAYMENT_QR: PaymentQrConfig = { x: 395, y: 356, width: 120, height: 120, visible: true }
const DEFAULT_FISCAL_QR: PaymentQrConfig = { x: 395, y: 484, width: 95, height: 95, visible: true }
const DEFAULT_VAT_BREAKDOWN_TABLE: VatBreakdownTableConfig = { x: 50, y: 286, width: 300, headerHeight: 14, rowHeight: 14, headerFontSize: 7, bodyFontSize: 7, visible: true }
const SERVICE_TABLE_PREVIEW_ROWS = 1
const LEGACY_SERVICE_TABLE_PREVIEW_ROWS = 3
const VAT_SAMPLE_ROWS = 3
const OTHER_LOCALE: Record<AppLocale, AppLocale> = { en: 'sl', sl: 'en', sr: 'sl' }
const DATE_FIELD_KEYS = new Set(['folioDate', 'dateOfService', 'dueDate'])
const PREFIX_FIELD_KEYS = new Set(['folioNumber', 'folioDate', 'folioIssueTimePlace', 'dateOfService', 'dueDate'])
const DOCUMENT_PREFIX_DEFAULTS: Record<string, LocalizedText> = {
  folioNumber: { en: 'Invoice:', sl: 'Račun:' },
  folioDate: { en: 'Issued on', sl: 'Izdano', sr: 'Izdato' },
  folioIssueTimePlace: { en: 'Time and place of issue', sl: 'Ura in kraj izdaje', sr: 'Vreme i mesto izdavanja' },
  dateOfService: { en: 'Date of service', sl: 'Datum opravljene storitve', sr: 'Datum usluge' },
  dueDate: { en: 'Due date', sl: 'Rok plačila', sr: 'Rok plaćanja' },
}

const AUTO_NO_VAT_CLAUSE = 'DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.'
const LEGACY_AUTO_NO_VAT_CLAUSES = [
  'DDV ni obračunan na podlagi točke prvega odstavka 94. člena ZDDV-1.',
  'DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.',
] as const

const TAX_CLAUSE_OPTIONS = [
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
    let trimmed = item.trim()
    for (const legacyClause of LEGACY_AUTO_NO_VAT_CLAUSES) trimmed = trimmed.replace(legacyClause, AUTO_NO_VAT_CLAUSE)
    // The Article 94 BREZ DDV clause is automatic and must not be persisted as a
    // user-selectable additional clause.
    if (trimmed && trimmed !== AUTO_NO_VAT_CLAUSE) unique.add(trimmed)
  }
  return Array.from(unique)
}





const DEFAULT_A4_SECTION_ORDER = [
  'company',
  'document',
  'recipient',
  'items',
  'advancePayments',
  'vat',
  'totals',
  'taxClauses',
  'reference',
  'paymentQr',
  'fiscal',
  'issuedBy',
  'signature',
  'footer',
] as const

function normalizeA4SectionOrder(value: unknown): string[] {
  const ordered = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && DEFAULT_A4_SECTION_ORDER.includes(entry as any)) : []
  const unique = Array.from(new Set([...ordered, ...DEFAULT_A4_SECTION_ORDER]))
  return unique
}

function normalizeHiddenSections(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    if (DEFAULT_A4_SECTION_ORDER.includes(entry as any)) unique.add(entry)
  }
  return Array.from(unique)
}

const DEFAULT_A4_REFERENCE_TEXT: Record<AppLocale, string> = {
  sl: 'Prosimo, da se pri plačilu sklicujete na št.: {reference-number}',
  en: 'Please use the following reference when making the payment: {reference-number}',
  sr: 'Molimo vas da se prilikom plaćanja pozovete na broj: {reference-number}',
}

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
  vatBreakdownVisible: boolean
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
    vatBreakdownVisible: layout.vatBreakdownTable?.visible !== false,
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
    layout.pageSections = { headerHeight: 260, footerHeight: 58 }
    Object.assign(layout.logo, { x: 50, y: 46, width: 70, height: 54 })
    setField(layout, 'companyName', { x: 132, y: 52, width: 150, height: 18, alignment: 'left', bold: true })
    setField(layout, 'companyAddress', { x: 132, y: 74, width: 150, height: 14, alignment: 'left' })
    setField(layout, 'companyPostalCodeCity', { x: 132, y: 92, width: 150, height: 14, alignment: 'left' })
    setField(layout, 'companyTaxId', { x: 132, y: 112, width: 150, height: 14, alignment: 'left' })
    setField(layout, 'folioNumber', { x: 445, y: 52, width: 100, height: 18, alignment: 'right', bold: true })
    setField(layout, 'folioDate', { x: 286, y: 110, width: 140, height: 14, alignment: 'left' })
    setField(layout, 'folioIssueTimePlace', { x: 286, y: 134, width: 140, height: 14, alignment: 'left' })
    setField(layout, 'dateOfService', { x: 286, y: 158, width: 140, height: 14, alignment: 'left' })
    setField(layout, 'dueDate', { x: 286, y: 182, width: 160, height: 14, alignment: 'left' })
    setField(layout, 'recipientName', { x: 406, y: 112, width: 118, height: 16, alignment: 'left', bold: true })
    setField(layout, 'recipientAddress', { x: 406, y: 136, width: 118, height: 14, alignment: 'left' })
    setField(layout, 'recipientPostalCodeCity', { x: 406, y: 156, width: 118, height: 14, alignment: 'left' })
    setField(layout, 'recipientVatId', { x: 406, y: 196, width: 118, height: 14, alignment: 'left' })
    Object.assign(layout.table, { startX: 50, startY: 308, width: 495, rowHeight: 22, headerHeight: 24, footerSpacing: 4 })
    applyTemplateColumns(layout, true)
    setColumn(layout, 'date', { visible: false, relX: 0, width: 0, alignment: 'left' })
    setColumn(layout, 'description', { relX: 0, width: 205, alignment: 'left', visible: true })
    setColumn(layout, 'qty', { relX: 205, width: 55, alignment: 'right', visible: true, label: 'Quantity', labelI18n: { en: 'Quantity', sl: 'Količina', sr: 'Količina' } })
    setColumn(layout, 'nett', { relX: 260, width: 80, alignment: 'right', visible: true })
    setColumn(layout, 'discount', { relX: 340, width: 52, alignment: 'right', visible: true })
    setColumn(layout, 'taxPercent', { relX: 392, width: 43, alignment: 'right', visible: true })
    setColumn(layout, 'total', { relX: 435, width: 60, alignment: 'right', visible: true })
    Object.assign(layout.vatBreakdownTable, { x: 50, y: 432, width: 220, headerHeight: 15, rowHeight: 15, visible: false })
    setFooter(layout, 'totalNett', { x: 285, y: 500, width: 260, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'discount', { x: 285, y: 522, width: 260, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'totalGross', { x: 285, y: 544, width: 260, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'usedAdvances', { x: 285, y: 566, width: 260, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'toBePaid', { x: 285, y: 590, width: 260, height: 20, alignment: 'right', bold: true })
    setFooter(layout, 'payment', { x: 50, y: 0, width: 0, height: 0, alignment: 'left', visible: false })
    setFooter(layout, 'iban', { x: 132, y: 132, width: 170, height: 16, alignment: 'left', visible: true })
    setFooter(layout, 'notes', { x: 50, y: 620, width: 160, height: 56, alignment: 'left' })
    setFooter(layout, 'fiscalZoi', { x: 282, y: 650, width: 205, height: 14, alignment: 'left' })
    setFooter(layout, 'fiscalEor', { x: 282, y: 674, width: 205, height: 14, alignment: 'left' })
    setFooter(layout, 'issuedBy', { x: 390, y: 748, width: 130, height: 16, alignment: 'left' })
    Object.assign(layout.paymentQr, { x: 56, y: 682, width: 92, height: 108 })
    Object.assign(layout.fiscalQr, { x: 282, y: 614, width: 72, height: 72, visible: true })
    Object.assign(layout.signature, { x: 390, y: 730, width: 125, height: 38 })
    Object.assign(footerText, { x: 50, y: 810, width: 495, height: 16, alignment: 'center' })
    applyFontPreset(layout, 'COMPACT')
  } else if (templateId === 'CLASSIC') {
    layout.pageSections = { headerHeight: 220, footerHeight: 58 }
    Object.assign(layout.logo, { x: 50, y: 50, width: 46, height: 46 })
    setField(layout, 'companyName', { x: 112, y: 52, width: 170, height: 18, alignment: 'left', bold: true })
    setField(layout, 'companyAddress', { x: 112, y: 76, width: 170, height: 14, alignment: 'left' })
    setField(layout, 'companyPostalCodeCity', { x: 112, y: 94, width: 170, height: 14, alignment: 'left' })
    setField(layout, 'companyTaxId', { x: 112, y: 120, width: 170, height: 14, alignment: 'left' })
    setField(layout, 'folioNumber', { x: 258, y: 106, width: 120, height: 18, alignment: 'left', bold: true })
    setField(layout, 'folioDate', { x: 414, y: 52, width: 130, height: 14, alignment: 'left' })
    setField(layout, 'folioIssueTimePlace', { x: 414, y: 132, width: 130, height: 14, alignment: 'left' })
    setField(layout, 'dateOfService', { x: 414, y: 78, width: 130, height: 14, alignment: 'left' })
    setField(layout, 'dueDate', { x: 414, y: 104, width: 130, height: 14, alignment: 'left' })
    setField(layout, 'recipientName', { x: 50, y: 190, width: 250, height: 16, alignment: 'left', bold: true })
    setField(layout, 'recipientAddress', { x: 50, y: 214, width: 250, height: 14, alignment: 'left' })
    setField(layout, 'recipientPostalCodeCity', { x: 50, y: 232, width: 250, height: 14, alignment: 'left' })
    setField(layout, 'recipientVatId', { x: 50, y: 256, width: 250, height: 14, alignment: 'left' })
    Object.assign(layout.table, { startX: 50, startY: 294, width: 495, rowHeight: 23, headerHeight: 22, footerSpacing: 4 })
    applyTemplateColumns(layout)
    setColumn(layout, 'date', { visible: false, relX: 0, width: 0, alignment: 'left' })
    setColumn(layout, 'description', { relX: 0, width: 215, alignment: 'left', visible: true })
    setColumn(layout, 'qty', { relX: 215, width: 50, alignment: 'right', visible: true, label: 'Quantity', labelI18n: { en: 'Quantity', sl: 'Količina', sr: 'Količina' } })
    setColumn(layout, 'nett', { relX: 265, width: 85, alignment: 'right', visible: true })
    setColumn(layout, 'discount', { relX: 350, width: 50, alignment: 'right', visible: true })
    setColumn(layout, 'taxPercent', { relX: 400, width: 40, alignment: 'right', visible: true })
    setColumn(layout, 'total', { relX: 440, width: 55, alignment: 'right', visible: true })
    Object.assign(layout.vatBreakdownTable, { x: 50, y: 398, width: 290, headerHeight: 16, rowHeight: 16, visible: false })
    setFooter(layout, 'totalNett', { x: 365, y: 428, width: 180, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'discount', { x: 365, y: 448, width: 180, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'totalGross', { x: 365, y: 468, width: 180, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'usedAdvances', { x: 365, y: 488, width: 180, height: 16, alignment: 'right', bold: false })
    setFooter(layout, 'toBePaid', { x: 365, y: 512, width: 180, height: 18, alignment: 'right', bold: true })
    setFooter(layout, 'payment', { x: 405, y: 0, width: 0, height: 0, alignment: 'left', visible: false })
    setFooter(layout, 'iban', { x: 405, y: 0, width: 0, height: 0, alignment: 'left', visible: false })
    setFooter(layout, 'issuedBy', { x: 370, y: 742, width: 150, height: 16, alignment: 'left' })
    setFooter(layout, 'notes', { x: 300, y: 626, width: 140, height: 38, alignment: 'left' })
    setFooter(layout, 'fiscalZoi', { x: 370, y: 640, width: 155, height: 14, alignment: 'left' })
    setFooter(layout, 'fiscalEor', { x: 370, y: 664, width: 155, height: 14, alignment: 'left' })
    Object.assign(layout.paymentQr, { x: 50, y: 620, width: 96, height: 108 })
    Object.assign(layout.fiscalQr, { x: 370, y: 586, width: 72, height: 72, visible: true })
    Object.assign(layout.signature, { x: 370, y: 710, width: 125, height: 38 })
    Object.assign(footerText, { x: 50, y: 806, width: 495, height: 16, alignment: 'center' })
    applyFontPreset(layout, 'STANDARD')
  } else {
    layout.pageSections = { headerHeight: 178, footerHeight: 58 }
    Object.assign(layout.logo, { x: 248, y: 48, width: 86, height: 74 })
    setField(layout, 'companyName', { x: 50, y: 58, width: 190, height: 18, alignment: 'left', bold: true })
    setField(layout, 'companyAddress', { x: 50, y: 84, width: 190, height: 14, alignment: 'left' })
    setField(layout, 'companyPostalCodeCity', { x: 50, y: 102, width: 190, height: 14, alignment: 'left' })
    setField(layout, 'companyTaxId', { x: 50, y: 128, width: 190, height: 14, alignment: 'left' })
    setField(layout, 'folioNumber', { x: 426, y: 96, width: 118, height: 18, alignment: 'left', bold: true })
    setField(layout, 'folioDate', { x: 390, y: 126, width: 155, height: 14, alignment: 'left' })
    setField(layout, 'folioIssueTimePlace', { x: 390, y: 150, width: 155, height: 14, alignment: 'left' })
    setField(layout, 'dateOfService', { x: 390, y: 174, width: 155, height: 14, alignment: 'left' })
    setField(layout, 'dueDate', { x: 390, y: 198, width: 155, height: 14, alignment: 'left' })
    setField(layout, 'recipientName', { x: 50, y: 248, width: 220, height: 16, alignment: 'left', bold: true })
    setField(layout, 'recipientAddress', { x: 50, y: 272, width: 220, height: 14, alignment: 'left' })
    setField(layout, 'recipientPostalCodeCity', { x: 50, y: 292, width: 220, height: 14, alignment: 'left' })
    setField(layout, 'recipientVatId', { x: 50, y: 316, width: 220, height: 14, alignment: 'left' })
    Object.assign(layout.table, { startX: 50, startY: 362, width: 495, rowHeight: 24, headerHeight: 23, footerSpacing: 5 })
    applyTemplateColumns(layout)
    setColumn(layout, 'date', { visible: false, relX: 0, width: 0, alignment: 'left' })
    setColumn(layout, 'description', { relX: 0, width: 235, alignment: 'left', visible: true })
    setColumn(layout, 'qty', { relX: 235, width: 44, alignment: 'right', visible: true, label: 'Quantity', labelI18n: { en: 'Quantity', sl: 'Količina', sr: 'Količina' } })
    setColumn(layout, 'nett', { relX: 279, width: 72, alignment: 'right', visible: true })
    setColumn(layout, 'discount', { relX: 351, width: 46, alignment: 'right', visible: true })
    setColumn(layout, 'taxPercent', { relX: 397, width: 41, alignment: 'right', visible: true })
    setColumn(layout, 'total', { relX: 438, width: 57, alignment: 'right', visible: true })
    Object.assign(layout.vatBreakdownTable, { x: 50, y: 442, width: 210, headerHeight: 16, rowHeight: 16, visible: false })
    setFooter(layout, 'totalNett', { x: 325, y: 474, width: 220, height: 18, alignment: 'right', bold: false })
    setFooter(layout, 'discount', { x: 325, y: 500, width: 220, height: 18, alignment: 'right', bold: false })
    setFooter(layout, 'totalGross', { x: 325, y: 526, width: 220, height: 18, alignment: 'right', bold: false })
    setFooter(layout, 'usedAdvances', { x: 325, y: 552, width: 220, height: 18, alignment: 'right', bold: false })
    setFooter(layout, 'toBePaid', { x: 325, y: 580, width: 220, height: 22, alignment: 'right', bold: true })
    setFooter(layout, 'payment', { x: 50, y: 0, width: 0, height: 0, alignment: 'left', visible: false })
    setFooter(layout, 'iban', { x: 50, y: 148, width: 220, height: 16, alignment: 'left', visible: true })
    setFooter(layout, 'fiscalZoi', { x: 390, y: 690, width: 145, height: 14, alignment: 'left', visible: true })
    setFooter(layout, 'fiscalEor', { x: 390, y: 714, width: 145, height: 14, alignment: 'left', visible: true })
    setFooter(layout, 'notes', { x: 50, y: 632, width: 120, height: 56, alignment: 'left' })
    setFooter(layout, 'issuedBy', { x: 50, y: 748, width: 180, height: 18, alignment: 'left' })
    Object.assign(layout.paymentQr, { x: 210, y: 628, width: 96, height: 112 })
    Object.assign(layout.fiscalQr, { x: 390, y: 612, width: 72, height: 72, visible: true })
    Object.assign(layout.signature, { x: 348, y: 742, width: 160, height: 40 })
    Object.assign(footerText, { x: 50, y: 810, width: 495, height: 16, alignment: 'center' })
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
  layout.vatBreakdownTable.visible = prefs.vatBreakdownVisible
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
      <GuestSwitch checked={checked} onChange={onChange} />
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





function A4PresetLayoutEditor() {
  const { locale } = useLocale()
  const [layout, setLayout] = useState<LayoutConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewRequestId = useRef(0)
  const previewUrlRef = useRef<string | null>(null)

  const copy = locale === 'sl'
    ? {
        title: 'Nastavitve računa',
        subtitle: 'A4 predloge uporabljajo enako logiko nastavitev kot 58 mm. Ročno pozicioniranje elementov ni več na voljo.',
        chooseTemplate: 'Izbira predloge',
        invoiceContent: 'Vsebina računa',
        textSize: 'Velikost besedila',
        taxClauses: 'Davčne klavzule',
        taxClausesHint: 'Klavzula po 94. členu se doda samodejno, ko imajo vse postavke davčno stopnjo Brez DDV. Tukaj lahko izberete dodatne klavzule.',
        addTaxClause: 'Dodaj davčno klavzulo…',
        noTaxClauses: 'Ni izbranih dodatnih davčnih klavzul.',
        referenceText: 'Besedilo reference',
        referenceHint: 'Uporabite oznako {reference-number}, kjer naj se izpiše številka reference.',
        footerText: 'Besedilo v nogi',
        footerHint: 'Neobvezno sporočilo, na primer zahvala ali povezava do spletne strani.',
        order: 'Vrstni red razdelkov',
        preview: 'Predogled računa (A4)',
        save: 'Shrani nastavitve',
        saving: 'Shranjujem…',
        reset: 'Ponastavi',
        test: 'Testno tiskanje',
        saved: 'A4 postavitev je shranjena.',
        resetDone: 'A4 postavitev je ponastavljena.',
        failed: 'A4 postavitve ni bilo mogoče shraniti.',
        loadFailed: 'A4 postavitve ni bilo mogoče naložiti.',
        showLogo: 'Prikaži logotip',
        recipient: 'Prejemnik',
        quantity: 'Količina',
        vatBreakdown: 'Znesek DDV',
        paymentQr: 'UPN QR',
        paymentQrHint: 'Prikaže se samo, ko so podatki za QR popolni.',
        fiscal: 'Fiskalni podatki',
        reference: 'Referenca',
        issuedBy: 'Izdal',
        signature: 'Odgovorna oseba',
        compact: 'Kompaktna',
        classic: 'Klasična',
        minimal: 'Minimalna',
        compactDesc: 'Vsebuje ključne informacije v kompaktni postavitvi.',
        classicDesc: 'Pregledna in uravnotežena postavitev za vsakodnevno rabo.',
        minimalDesc: 'Čista in preprosta postavitev brez odvečnih elementov.',
        compactSize: 'Kompaktno',
        standardSize: 'Standardno',
        largeSize: 'Večje',
      }
    : locale === 'sr'
      ? {
          title: 'Podešavanja računa',
          subtitle: 'A4 predlošci sada koriste istu logiku podešavanja kao 58 mm. Ručno pozicioniranje elemenata više nije dostupno.',
          chooseTemplate: 'Izbor predloška',
          invoiceContent: 'Sadržaj računa',
          textSize: 'Veličina teksta',
          taxClauses: 'Poreske klauzule',
          taxClausesHint: 'Klauzula po članu 94 automatski se dodaje kada sve stavke koriste poreski nivo Bez PDV-a. Ovde možete izabrati dodatne klauzule.',
          addTaxClause: 'Dodaj poresku klauzulu…',
          noTaxClauses: 'Nema izabranih dodatnih poreskih klauzula.',
          referenceText: 'Tekst reference',
          referenceHint: 'Koristite oznaku {reference-number} na mestu gde treba prikazati broj reference.',
          footerText: 'Tekst u podnožju',
          footerHint: 'Opciona poruka, na primer zahvalnica ili veza ka sajtu.',
          order: 'Redosled odeljaka',
          preview: 'Pregled računa (A4)',
          save: 'Sačuvaj podešavanja',
          saving: 'Čuvam…',
          reset: 'Vrati podrazumevano',
          test: 'Probna štampa',
          saved: 'A4 izgled je sačuvan.',
          resetDone: 'A4 izgled je vraćen na podrazumevano.',
          failed: 'A4 izgled nije moguće sačuvati.',
          loadFailed: 'A4 izgled nije moguće učitati.',
          showLogo: 'Prikaži logo',
          recipient: 'Primalac',
          quantity: 'Količina',
          vatBreakdown: 'Pregled PDV-a',
          paymentQr: 'UPN QR',
          paymentQrHint: 'Prikazuje se samo kada su QR podaci potpuni.',
          fiscal: 'Fiskalni podaci',
          reference: 'Referenca',
          issuedBy: 'Izdao',
          signature: 'Potpis',
          compact: 'Kompaktna',
          classic: 'Klasična',
          minimal: 'Minimalna',
          compactDesc: 'Ključne informacije u kompaktnoj postavci.',
          classicDesc: 'Pregledna i uravnotežena postavka za svakodnevni rad.',
          minimalDesc: 'Čista i jednostavna postavka bez suvišnih elemenata.',
          compactSize: 'Kompaktno',
          standardSize: 'Standardno',
          largeSize: 'Veće',
        }
      : {
          title: 'Invoice settings',
          subtitle: 'A4 templates now use the same settings logic as 58 mm. Manual element positioning is no longer available.',
          chooseTemplate: 'Template selection',
          invoiceContent: 'Invoice content',
          textSize: 'Text size',
          taxClauses: 'Tax clauses',
          taxClausesHint: 'The Article 94 clause is added automatically when all items use the No VAT tax level. Additional clauses can be selected here.',
          addTaxClause: 'Add tax clause…',
          noTaxClauses: 'No additional tax clauses selected.',
          referenceText: 'Reference text',
          referenceHint: 'Use {reference-number} where the invoice reference number should appear.',
          footerText: 'Footer text',
          footerHint: 'Optional message such as a thank-you note or website link.',
          order: 'Section order',
          preview: 'Invoice preview (A4)',
          save: 'Save settings',
          saving: 'Saving…',
          reset: 'Reset',
          test: 'Test print',
          saved: 'A4 layout saved.',
          resetDone: 'A4 layout reset.',
          failed: 'Unable to save the A4 layout.',
          loadFailed: 'Unable to load the A4 layout.',
          showLogo: 'Show logo',
          recipient: 'Recipient',
          quantity: 'Quantity',
          vatBreakdown: 'VAT breakdown',
          paymentQr: 'Payment QR',
          paymentQrHint: 'Shown only when QR details are complete.',
          fiscal: 'Fiscal details',
          reference: 'Reference',
          issuedBy: 'Issued by',
          signature: 'Signature',
          compact: 'Compact',
          classic: 'Classic',
          minimal: 'Minimal',
          compactDesc: 'Keeps key information in a compact layout.',
          classicDesc: 'Balanced and easy-to-scan layout for day-to-day use.',
          minimalDesc: 'Clean layout without unnecessary elements.',
          compactSize: 'Compact',
          standardSize: 'Standard',
          largeSize: 'Larger',
        }

  const sectionLabels: Record<string, string> = locale === 'sl'
    ? { company: 'Podjetje in logotip', document: 'Podatki računa', recipient: 'Prejemnik', items: 'Postavke', advancePayments: 'Predplačila', vat: 'Znesek DDV', totals: 'Seštevki', taxClauses: 'Davčne klavzule', reference: 'Referenca', paymentQr: 'UPN QR', fiscal: 'Fiskalni podatki', issuedBy: 'Izdal', signature: 'Odgovorna oseba', footer: 'Noga' }
    : locale === 'sr'
      ? { company: 'Kompanija i logo', document: 'Podaci računa', recipient: 'Primalac', items: 'Stavke', advancePayments: 'Avansi', vat: 'Pregled PDV-a', totals: 'Ukupni iznosi', taxClauses: 'Poreske klauzule', reference: 'Referenca', paymentQr: 'UPN QR', fiscal: 'Fiskalni podaci', issuedBy: 'Izdao', signature: 'Potpis', footer: 'Podnožje' }
      : { company: 'Company and logo', document: 'Invoice details', recipient: 'Recipient', items: 'Items', advancePayments: 'Advance payments', vat: 'VAT breakdown', totals: 'Totals', taxClauses: 'Tax clauses', reference: 'Reference', paymentQr: 'Payment QR', fiscal: 'Fiscal details', issuedBy: 'Issued by', signature: 'Signature', footer: 'Footer' }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await api.get('/billing/folio-layout')
        let data = response.data
        if (typeof data === 'string') {
          try { data = JSON.parse(data) } catch { data = null }
        }
        if (!isValidLayout(data)) {
          const resetResponse = await api.delete('/billing/folio-layout')
          data = typeof resetResponse.data === 'string' ? JSON.parse(resetResponse.data) : resetResponse.data
        }
        if (!cancelled && isValidLayout(data)) {
          const next = rebaseToSelectedTemplate(data)
          next.sectionOrder = normalizeA4SectionOrder(next.sectionOrder)
          next.hiddenSections = normalizeHiddenSections(next.hiddenSections)
          next.referenceText = typeof next.referenceText === 'string' ? next.referenceText : DEFAULT_A4_REFERENCE_TEXT[locale]
          setLayout(next)
        } else if (!cancelled) {
          setNotice(copy.loadFailed)
        }
      } catch {
        if (!cancelled) setNotice(copy.loadFailed)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [copy.loadFailed, locale])

  useEffect(() => {
    if (!layout) return
    const requestId = ++previewRequestId.current
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true)
      setPreviewError(null)
      const sample = {
        companyName: 'Calendra Studio', companyAddress: 'Glavna ulica 12', companyPostalCode: '2000', companyCity: 'Maribor', issueCity: 'Maribor', companyTaxId: 'SI12345678',
        folioNumber: 'MB-1-2026-00042', folioNumberLabel: locale === 'en' ? 'Invoice:' : 'Račun:', folioDate: '2026-07-31T12:45:00+02:00', dateOfService: '2026-07-31', dueDate: '2026-08-07',
        recipientName: 'Ana Novak', recipientAddress: 'Cesta 5', recipientPostalCode: '1000', recipientCity: 'Ljubljana', recipientVatId: '',
        services: [
          { date: '2026-07-31', description: locale === 'sl' ? 'Masaža hrbta in vratu' : locale === 'sr' ? 'Masaža leđa i vrata' : 'Back and neck massage', qty: 1, nettPrice: 50, grossPrice: 61, taxPercent: '22%', taxAmount: 11, totalPrice: 61 },
          { date: '2026-07-31', description: locale === 'sl' ? 'Individualno svetovanje z daljšim opisom' : locale === 'sr' ? 'Individualno savetovanje sa dužim opisom' : 'Individual counselling with a longer description', qty: 1, nettPrice: 50, grossPrice: 61, taxPercent: '22%', taxAmount: 11, totalPrice: 61 },
        ],
        advancePayments: [{ advanceNumber: locale === 'en' ? 'Advance payment' : locale === 'sr' ? 'Avans' : 'Predplačilo', date: '2026-07-20', taxPercent: '22%', netBasis: 8.2, taxAmount: 1.8, totalGross: 10, usedGross: 10 }],
        usedAdvancePaymentsGross: 10, subtotalBeforeDiscountGross: 100, discountAmountGross: 10, toBePaidGross: 90,
        paymentMethod: locale === 'en' ? 'Bank transfer' : locale === 'sr' ? 'Bankovni prenos' : 'Bančno nakazilo',
        issuedBy: 'David Mirc', iban: 'SI56 1234 5678 9012 3456', paymentQrPayload: 'https://calendra.si/placilo/REF-2026-001',
        fiscalQr: 'https://calendra.si/fiscal/MB-1-2026-00042', fiscalZoi: '1234567890', fiscalEor: '9999e010-089a-46e6-a3d8-bc0bd0a779c7',
        notes: 'REF-2026-001', locale,
      }
      try {
        const response = await api.post(`/billing/folio-layout/preview?locale=${locale}`, { layout, invoice: sample }, { responseType: 'blob' })
        if (requestId !== previewRequestId.current) return

        const imageBlob = response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: 'image/png' })
        if (imageBlob.size === 0) throw new Error('The preview response was empty.')

        // Production CSP previously blocked blob: image URLs. A data URL works
        // with the existing img-src data: policy and also lets us detect an
        // invalid/non-image response before replacing the current preview.
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Unable to read the preview image.'))
          reader.onerror = () => reject(reader.error || new Error('Unable to read the preview image.'))
          reader.readAsDataURL(imageBlob)
        })
        if (requestId !== previewRequestId.current) return

        if (previewUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = dataUrl
        setPreviewUrl(dataUrl)
      } catch {
        if (requestId === previewRequestId.current) {
          setPreviewError(locale === 'sl' ? 'Predogleda ni bilo mogoče pripraviti.' : locale === 'sr' ? 'Pregled nije moguće pripremiti.' : 'Unable to prepare the preview.')
        }
      } finally {
        if (requestId === previewRequestId.current) setPreviewLoading(false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [layout, locale])

  useEffect(() => () => {
    if (previewUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const mutateLayout = useCallback((fn: (next: LayoutConfig) => void) => {
    setLayout((previous) => {
      if (!previous) return previous
      const next = cloneLayout(previous)
      fn(next)
      next.sectionOrder = normalizeA4SectionOrder(next.sectionOrder)
      next.hiddenSections = normalizeHiddenSections(next.hiddenSections)
      next.taxClauses = normalizeTaxClauses(next.taxClauses)
      if (!next.referenceText) next.referenceText = DEFAULT_A4_REFERENCE_TEXT[locale]
      return next
    })
    setDirty(true)
    setNotice(null)
  }, [locale])

  const setRecipientVisible = (visible: boolean) => mutateLayout((next) => {
    next.fields.filter((field) => field.group === 'recipient').forEach((field) => { field.visible = visible })
  })

  const setQuantityVisible = (visible: boolean) => mutateLayout((next) => {
    const qty = columnFor(next, 'qty')
    if (qty) qty.visible = visible
  })

  const setFooterText = (value: string) => mutateLayout((next) => {
    const field = ensureTemplateFooterField(next)
    field.textI18n = ensureLocalizedText(field.textI18n, field.text || '')
    field.textI18n[locale] = value
    field.text = resolveLocalizedText(field.textI18n, value, 'en')
    field.visible = value.trim().length > 0
  })

  const save = async () => {
    if (!layout) return
    setSaving(true)
    setNotice(null)
    try {
      await api.put('/billing/folio-layout', layout)
      setDirty(false)
      setNotice(copy.saved)
    } catch {
      setNotice(copy.failed)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    try {
      const { data } = await api.delete('/billing/folio-layout')
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      if (isValidLayout(parsed)) {
        const next = rebaseToSelectedTemplate(parsed)
        next.sectionOrder = normalizeA4SectionOrder(next.sectionOrder)
        next.hiddenSections = normalizeHiddenSections(next.hiddenSections)
        next.referenceText = typeof next.referenceText === 'string' ? next.referenceText : DEFAULT_A4_REFERENCE_TEXT[locale]
        setLayout(next)
        setDirty(false)
        setNotice(copy.resetDone)
      }
    } catch {
      setNotice(copy.failed)
    }
  }

  const testPrint = async () => {
    if (!layout) return
    setTesting(true)
    setNotice(null)
    const prepared = window.open('', '_blank')
    try {
      if (dirty) await api.put('/billing/folio-layout', layout)
      const sample = {
        companyName: 'Calendra Studio d.o.o.', companyAddress: 'Glavna ulica 12', companyPostalCode: '2000', companyCity: 'Maribor', companyTaxId: 'SI12345678',
        folioNumber: 'MB-1-2026-00042', folioNumberLabel: locale === 'sl' || locale === 'sr' ? 'Račun:' : 'Invoice:', folioDate: '31.07.2026 12:45', dateOfService: '31.07.2026', dueDate: '07.08.2026',
        recipientName: 'Ana Novak', recipientAddress: 'Cesta 5', recipientPostalCode: '1000', recipientCity: 'Ljubljana', recipientVatId: 'SI98765432',
        services: [
          { date: '31.07.2026', description: locale === 'sl' ? 'Masaža hrbta in vratu' : locale === 'sr' ? 'Masaža leđa i vrata' : 'Back and neck massage', qty: 1, nettPrice: 40.98, grossPrice: 50, taxPercent: '22%', taxAmount: 9.02, totalPrice: 50 },
          { date: '31.07.2026', description: locale === 'sl' ? 'Individualno svetovanje' : locale === 'sr' ? 'Individualno savetovanje' : 'Individual counselling', qty: 1, nettPrice: 40.98, grossPrice: 50, taxPercent: '22%', taxAmount: 9.02, totalPrice: 50 },
        ],
        paymentMethods: [{ name: locale === 'sl' ? 'Bančno nakazilo' : locale === 'sr' ? 'Bankovni prenos' : 'Bank transfer', amountGross: 90 }],
        paymentMethod: locale === 'sl' ? 'Bančno nakazilo' : locale === 'sr' ? 'Bankovni prenos' : 'Bank transfer', issuedBy: 'David Mirc', iban: 'SI56 1234 5678 9012 3456', toBePaidGross: 90,
        paymentQrPayload: 'https://calendra.si/placilo/test', fiscalQr: 'https://calendra.si/fiscal/test', fiscalZoi: '1234567890', fiscalEor: 'EOR-2026-42',
        notes: 'REF-2026-001', locale,
      }
      const response = await api.post(`/billing/folio/pdf?format=A4&locale=${locale}`, sample, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      if (prepared) prepared.location.href = url
      else window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
      if (dirty) setDirty(false)
    } catch {
      prepared?.close()
      setNotice(locale === 'sl' ? 'Testnega A4 računa ni bilo mogoče pripraviti.' : locale === 'sr' ? 'Probni A4 račun nije moguće pripremiti.' : 'Unable to prepare the A4 test invoice.')
    } finally {
      setTesting(false)
    }
  }

  if (loading || !layout) return <div className="fle-loading">…</div>

  const activeTemplate = ((layout.templateId || 'CLASSIC') as A4TemplateId)
  const footerTextField = fieldFor(layout, 'templateFooterText')
  const currentFooterText = footerTextField ? resolveLocalizedText(footerTextField.textI18n, footerTextField.text || '', locale) : ''
  const recipientVisible = layout.fields.filter((field) => field.group === 'recipient').some((field) => field.visible !== false)
  const quantityVisible = columnFor(layout, 'qty')?.visible !== false
  const fiscalVisible = layout.fiscalQr.visible || ['fiscalZoi', 'fiscalEor'].some((key) => footerFor(layout, key)?.visible !== false)
  const referenceVisible = footerFor(layout, 'notes')?.visible !== false
  const issuedByVisible = footerFor(layout, 'issuedBy')?.visible !== false
  const hiddenSections = normalizeHiddenSections(layout.hiddenSections)
  const sectionOrder = normalizeA4SectionOrder(layout.sectionOrder)
  const referenceText = layout.referenceText || DEFAULT_A4_REFERENCE_TEXT[locale]

  const templateDescriptions: Record<Exclude<A4TemplateId, 'CUSTOM'>, { title: string; description: string }> = {
    COMPACT: { title: copy.compact, description: copy.compactDesc },
    CLASSIC: { title: copy.classic, description: copy.classicDesc },
    MINIMAL: { title: copy.minimal, description: copy.minimalDesc },
  }

  const moveSection = (section: string, direction: -1 | 1) => {
    mutateLayout((next) => {
      const order = normalizeA4SectionOrder(next.sectionOrder)
      const index = order.indexOf(section)
      const target = index + direction
      if (index < 0 || target < 0 || target >= order.length) return
      ;[order[index], order[target]] = [order[target], order[index]]
      next.sectionOrder = order
    })
  }

  const toggleSection = (section: string, visible: boolean) => {
    mutateLayout((next) => {
      const hidden = new Set(normalizeHiddenSections(next.hiddenSections))
      if (visible) hidden.delete(section)
      else hidden.add(section)
      next.hiddenSections = Array.from(hidden)
    })
  }


  return (
    <div className="fle-a4-settings-page">
      <div className="fle-a4-settings-head">
        <div>
          <h3>{copy.title}</h3>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      <div className="fle-a4-info-banner">
        <span>i</span>
        <div>{copy.subtitle}</div>
      </div>

      <div className="fle-a4-settings-grid">
        <div className="fle-a4-settings-column">
          <section className="fle-a4-card">
            <h4>{copy.chooseTemplate}</h4>
            <div className="fle-a4-template-list">
              {(['COMPACT', 'CLASSIC', 'MINIMAL'] as const).map((templateId) => (
                <button
                  key={templateId}
                  type="button"
                  className={`fle-a4-template-card${activeTemplate === templateId ? ' is-selected' : ''}`}
                  onClick={() => mutateLayout((next) => {
                    const applied = applyA4Template(next, templateId)
                    applied.sectionOrder = normalizeA4SectionOrder(applied.sectionOrder)
                    applied.hiddenSections = normalizeHiddenSections(applied.hiddenSections)
                    Object.assign(next, applied)
                  })}
                >
                  <span className={`fle-a4-template-thumb fle-a4-template-thumb--${templateId.toLowerCase()}`} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="fle-a4-template-copy">
                    <strong>{templateDescriptions[templateId].title}</strong>
                    <small>{templateDescriptions[templateId].description}</small>
                  </span>
                  <span className="fle-a4-template-check" />
                </button>
              ))}
            </div>
          </section>

          <section className="fle-a4-card">
            <h4>{copy.invoiceContent}</h4>
            <QuickSwitch checked={layout.logo.visible} onChange={(visible) => mutateLayout((next) => { next.logo.visible = visible })} label={copy.showLogo} />
            <QuickSwitch checked={recipientVisible} onChange={setRecipientVisible} label={copy.recipient} />
            <QuickSwitch checked={quantityVisible} onChange={setQuantityVisible} label={copy.quantity} />
            <QuickSwitch checked={layout.vatBreakdownTable.visible} onChange={(visible) => mutateLayout((next) => { next.vatBreakdownTable.visible = visible })} label={copy.vatBreakdown} />
            <QuickSwitch checked={layout.paymentQr.visible} onChange={(visible) => mutateLayout((next) => { next.paymentQr.visible = visible })} label={copy.paymentQr} hint={copy.paymentQrHint} />
            <QuickSwitch checked={fiscalVisible} onChange={(visible) => mutateLayout((next) => { next.fiscalQr.visible = visible; for (const key of ['fiscalZoi', 'fiscalEor']) { const item = footerFor(next, key); if (item) item.visible = visible } })} label={copy.fiscal} />
            <QuickSwitch checked={referenceVisible} onChange={(visible) => mutateLayout((next) => { const item = footerFor(next, 'notes'); if (item) item.visible = visible })} label={copy.reference} />
            <QuickSwitch checked={issuedByVisible} onChange={(visible) => mutateLayout((next) => { const item = footerFor(next, 'issuedBy'); if (item) item.visible = visible })} label={copy.issuedBy} />
            <QuickSwitch checked={layout.signature.visible} onChange={(visible) => mutateLayout((next) => { next.signature.visible = visible })} label={copy.signature} />
          </section>

          <section className="fle-a4-card fle-a4-form-card">
            <label>
              <span>{copy.textSize}</span>
              <select value={layout.fontSizePreset || 'STANDARD'} onChange={(e) => mutateLayout((next) => { applyFontPreset(next, e.target.value as A4FontSizePreset) })}>
                <option value="COMPACT">{copy.compactSize}</option>
                <option value="STANDARD">{copy.standardSize}</option>
                <option value="LARGE">{copy.largeSize}</option>
              </select>
            </label>

            <label>
              <span>{copy.taxClauses}</span>
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
                <option value="">{copy.addTaxClause}</option>
                {TAX_CLAUSE_OPTIONS.filter((clause) => !(layout.taxClauses || []).includes(clause)).map((clause) => <option key={clause} value={clause}>{clause}</option>)}
              </select>
              <small>{copy.taxClausesHint}</small>
            </label>
            <div className="fle-tax-clause-list">
              {(layout.taxClauses || []).length === 0 ? (
                <div className="fle-tax-clause-empty">{copy.noTaxClauses}</div>
              ) : (layout.taxClauses || []).map((clause) => (
                <div key={clause} className="fle-tax-clause-chip">
                  <span>{clause}</span>
                  <button type="button" onClick={() => mutateLayout((next) => { next.taxClauses = normalizeTaxClauses(next.taxClauses).filter((item) => item !== clause) })}>×</button>
                </div>
              ))}
            </div>

            <label>
              <span>{copy.referenceText}</span>
              <textarea rows={3} value={referenceText} onChange={(e) => mutateLayout((next) => { next.referenceText = e.target.value })} />
              <small>{copy.referenceHint}</small>
            </label>

            <label>
              <span>{copy.footerText}</span>
              <textarea rows={3} value={currentFooterText} onChange={(e) => setFooterText(e.target.value)} />
              <small>{copy.footerHint}</small>
            </label>
          </section>

          <section className="fle-a4-card">
            <h4>{copy.order}</h4>
            <div className="fle-a4-order-list">
              {sectionOrder.map((section, index) => {
                const visible = !hiddenSections.includes(section)
                return (
                  <div key={section} className={`fle-a4-order-item${visible ? '' : ' is-hidden'}`}>
                    <span className="fle-a4-order-handle">⋮⋮</span>
                    <span>{sectionLabels[section] || section}</span>
                    <div className="fle-a4-order-actions">
                      <button type="button" onClick={() => moveSection(section, -1)} disabled={index === 0}>↑</button>
                      <button type="button" onClick={() => moveSection(section, 1)} disabled={index === sectionOrder.length - 1}>↓</button>
                    </div>
                    <GuestSwitch checked={visible} onChange={(nextVisible) => toggleSection(section, nextVisible)} />
                  </div>
                )
              })}
            </div>
          </section>

          <div className="fle-a4-actions">
            <span className="fle-a4-notice">{notice || ''}</span>
            <button type="button" className="fle-btn" onClick={() => void testPrint()} disabled={testing}>{testing ? '…' : copy.test}</button>
            <button type="button" className="fle-btn fle-btn-secondary" onClick={reset}>{copy.reset}</button>
            <button type="button" className="fle-btn fle-btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? copy.saving : copy.save}</button>
          </div>
        </div>

        <aside className="fle-a4-preview-column">
          <div className="fle-a4-preview-panel">
            <h4>{copy.preview}</h4>
            <div className="fle-a4-preview-shell fle-a4-preview-shell--rendered">
              {previewUrl ? (
                <img
                  className="fle-a4-rendered-preview"
                  src={previewUrl}
                  alt={copy.preview}
                  onLoad={() => setPreviewError(null)}
                  onError={() => {
                    setPreviewUrl(null)
                    setPreviewError(locale === 'sl' ? 'Predogled je bil prejet, vendar ga brskalnik ni mogel prikazati.' : locale === 'sr' ? 'Pregled je primljen, ali ga pregledač nije mogao prikazati.' : 'The preview was received, but the browser could not display it.')
                  }}
                />
              ) : null}
              {previewLoading ? <div className="fle-a4-preview-status">{locale === 'sl' ? 'Pripravljam predogled…' : locale === 'sr' ? 'Pripremam pregled…' : 'Preparing preview…'}</div> : null}
              {!previewLoading && previewError ? <div className="fle-a4-preview-status fle-a4-preview-status--error">{previewError}</div> : null}
            </div>
          </div>
        </aside>
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
      {format === 'A4' ? <A4PresetLayoutEditor /> : <PosReceiptLayoutEditor />}
    </div>
  )
}
