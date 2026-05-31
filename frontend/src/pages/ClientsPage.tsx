import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { useLocale } from '../locale'
import { useCalendarFiltersBottomBar, useMediaMaxWidth } from '../hooks/useCalendarResponsiveLayout'
import type { Client, ClientGroup, Company, CompanySummary, CompanyBillSummary, Role, StoredFile, User } from '../lib/types'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { currency, formatDate, formatDateTime, fullName } from '../lib/format'

type UserSummary = Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>
type ConsultantSummary = UserSummary & { consultant?: boolean }
type EntityTab = 'clients' | 'companies' | 'groups'

type ClientForm = {
  firstName: string
  lastName: string
  email: string
  phone: string
  whatsappOptIn: boolean
  viberConnected: boolean
  assignedToId?: number | null
  billingCompanyId?: number | null
}

type CompanyForm = {
  name: string
  address: string
  postalCode: string
  city: string
  vatId: string
  iban: string
  email: string
  telephone: string
  /** Detail panel only; create-company form ignores this when posting. */
  batchPaymentEnabled: boolean
}

type ClientSession = {
  id: number
  startTime: string
  endTime: string
  consultantFirstName: string
  consultantLastName: string
  paid: boolean
  bookingStatus?: 'RESERVED' | 'CANCELLED' | 'NO_SHOW' | 'CONFIRMED'
  sessionTypeName?: string | null
  sessionName?: string | null
  title?: string | null
  spaceName?: string | null
  roomName?: string | null
  location?: string | null
}

type ClientWalletEntitlement = {
  id: number
  productName: string
  entitlementType: string | null
  entitlementCode?: string | null
  remainingUses: number | null
  visitCount?: number | null
  validFrom: string | null
  validUntil: string | null
  status: string | null
  sourceOrderId: number | null
  sessionTypeName: string | null
  autoRenews: boolean
  createdAt: string | null
}

type ClientWalletUsage = {
  id: number
  entitlementId: number | null
  productName: string
  usedAt: string
  unitsUsed: number
  reason: string | null
  bookingId: number | null
  source?: string | null
  scannedByName?: string | null
  unitsBefore?: number | null
  unitsAfter?: number | null
}

type ClientWalletResponse = {
  activeEntitlements: ClientWalletEntitlement[]
  inactiveEntitlements: ClientWalletEntitlement[]
  usageHistory: ClientWalletUsage[]
}


type WalletProduct = {
  id: number
  name: string
  productType: string | null
  priceGross: number | string | null
  currency: string | null
  active: boolean
  guestVisible: boolean
  bookable: boolean
  usageLimit?: number | null
  validityDays?: number | null
  autoRenews?: boolean
  sessionTypeId?: number | null
  sessionTypeName?: string | null
  transactionServiceId?: number | null
  transactionServiceCode?: string | null
  transactionServiceDescription?: string | null
}

type WalletPurchaseOpenBillResponse = {
  openBillId: number
  orderId: number
  productId: number
}

/** Human-readable entitlement status (e.g. EXPIRED → Expired). */
function formatWalletEntitlementStatusLabel(status: string | null | undefined): string {
  if (!status?.trim()) return '—'
  return status
    .trim()
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function entitlementKind(entitlement: ClientWalletEntitlement): 'membership' | 'pack' | 'ticket' | 'gift_card' {
  const raw = `${entitlement.entitlementType ?? ''} ${entitlement.productName ?? ''}`.toLowerCase()
  if (raw.includes('gift') || raw.includes('daril')) return 'gift_card'
  if (raw.includes('membership')) return 'membership'
  if (raw.includes('ticket')) return 'ticket'
  return 'pack'
}

function walletProductTypeLabel(productType: string | null | undefined, locale: string): string {
  const type = (productType ?? '').toUpperCase()
  if (locale === 'sl') {
    if (type === 'MEMBERSHIP') return 'Članarina'
    if (type === 'GIFT_CARD') return 'Darilna kartica'
    if (type === 'CLASS_TICKET') return 'Karta'
    if (type === 'PACK') return 'Paket'
    return 'Ugodnost'
  }
  if (type === 'MEMBERSHIP') return 'Membership'
  if (type === 'GIFT_CARD') return 'Gift card'
  if (type === 'CLASS_TICKET') return 'Ticket'
  if (type === 'PACK') return 'Pack'
  return 'Entitlement'
}

function walletProductTypeTone(productType: string | null | undefined): 'pack' | 'membership' | 'gift' | 'ticket' {
  const type = (productType ?? '').toUpperCase()
  if (type === 'MEMBERSHIP') return 'membership'
  if (type === 'GIFT_CARD') return 'gift'
  if (type === 'CLASS_TICKET') return 'ticket'
  return 'pack'
}

function walletProductPrice(product: WalletProduct): number {
  const raw = typeof product.priceGross === 'string' ? Number(product.priceGross) : product.priceGross
  return Number.isFinite(raw ?? NaN) ? Number(raw) : 0
}

function storedFileExtension(fileName: string): string {
  const parts = (fileName || '').split('.')
  return parts.length > 1 ? (parts.pop() || '').toLowerCase() : ''
}

function storedFileKind(fileName: string): 'pdf' | 'doc' | 'sheet' | 'image' | 'zip' | 'file' {
  const ext = storedFileExtension(fileName)
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx'].includes(ext)) return 'doc'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext)) return 'image'
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip'
  return 'file'
}

function formatShortTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function sessionTitle(session: ClientSession): string {
  return session.sessionTypeName || session.sessionName || session.title || `Session #${session.id}`
}

function sessionLocation(session: ClientSession): string {
  return session.spaceName || session.roomName || session.location || '—'
}

/** Portal menus escape overflow:auto/hidden on table wrappers; flip upward when near viewport bottom. */
function clientsOverflowMenuFixedStyle(rect: DOMRect, estimatedMenuHeight: number): CSSProperties {
  const gap = 6
  const spaceBelow = window.innerHeight - rect.bottom - gap
  const flipUp = spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight + gap
  const right = window.innerWidth - rect.right
  const base: CSSProperties = {
    position: 'fixed',
    right,
    minWidth: 148,
    zIndex: 4000,
  }
  if (flipUp) {
    return { ...base, bottom: window.innerHeight - rect.top + gap }
  }
  return { ...base, top: rect.bottom + gap }
}

const emptyClientForm: ClientForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  whatsappOptIn: false,
  viberConnected: false,
  assignedToId: null,
  billingCompanyId: null,
}

const emptyCompanyForm: CompanyForm = {
  name: '',
  address: '',
  postalCode: '',
  city: '',
  vatId: '',
  iban: '',
  email: '',
  telephone: '',
  batchPaymentEnabled: false,
}

const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/** Must match backend TenantFileS3Service and spring.servlet.multipart.max-file-size. */
const MAX_CLIENT_OR_COMPANY_FILE_BYTES = 50 * 1024 * 1024
const CLIENT_FILE_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
const CLIENT_FILE_ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
const CLIENT_FILE_ACCEPT_INPUT = CLIENT_FILE_ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')

function clientFileExtension(name: string) {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

function validateClientStoredFile(file: File, copy: { fileTooLarge: string; fileUnsupported: (name: string) => string }) {
  if (file.size > MAX_CLIENT_OR_COMPANY_FILE_BYTES) return copy.fileTooLarge
  const normalizedType = (file.type || '').toLowerCase()
  const extension = clientFileExtension(file.name)
  const supported = CLIENT_FILE_ALLOWED_CONTENT_TYPES.has(normalizedType) || CLIENT_FILE_ALLOWED_EXTENSIONS.includes(extension)
  return supported ? '' : copy.fileUnsupported(file.name)
}

function contactMailtoHref(email: string) {
  const e = email.trim()
  return e ? `mailto:${encodeURIComponent(e)}` : ''
}

/** Normalize for tel: — drop spaces/parens/dashes; keep + and digits. */
function contactTelHref(phone: string) {
  const raw = phone.trim()
  if (!raw) return ''
  const core = raw.replace(/[\s().-]/g, '')
  return core ? `tel:${encodeURIComponent(core)}` : ''
}

function initials(...parts: Array<string | null | undefined>) {
  const letters = parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
  return letters || 'N'
}

function formatFileSize(bytes?: number | null) {
  const size = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function slovenianStrankaCountForm(count: number): string {
  const n = Math.abs(count) % 100
  if (n >= 11 && n <= 14) return 'strank'
  const last = n % 10
  if (last === 1) return 'stranka'
  if (last === 2) return 'stranki'
  if (last === 3 || last === 4) return 'stranke'
  return 'strank'
}

function slovenianPodjetjeCountForm(count: number): string {
  const n = Math.abs(count) % 100
  if (n >= 11 && n <= 14) return 'podjetij'
  const last = n % 10
  if (last === 1) return 'podjetje'
  if (last === 2) return 'podjetji'
  if (last === 3 || last === 4) return 'podjetja'
  return 'podjetij'
}

function slovenianTerminCountForm(count: number): string {
  const n = Math.abs(count) % 100
  if (n >= 11 && n <= 14) return 'terminov'
  const last = n % 10
  if (last === 1) return 'termin'
  if (last >= 2 && last <= 4) return count >= 3 ? 'termini' : 'termina'
  return 'terminov'
}

function normalizeSessionStatus(status: ClientSession['bookingStatus']): 'RESERVED' | 'CANCELLED' | 'NO_SHOW' {
  const value = String(status ?? '').trim().toUpperCase()
  if (value === 'CANCELLED') return 'CANCELLED'
  if (value === 'NO_SHOW') return 'NO_SHOW'
  return 'RESERVED'
}

function deriveSessionLifecycleStatus(session: ClientSession): 'RESERVED' | 'CANCELLED' | 'NO_SHOW' | 'ONGOING' | 'CHECKED_OUT' {
  const stored = String(session.bookingStatus ?? '').trim().toUpperCase()
  if (stored === 'CHECKED_OUT') return 'CHECKED_OUT'
  const normalized = normalizeSessionStatus(session.bookingStatus)
  if (normalized === 'CANCELLED' || normalized === 'NO_SHOW') return normalized
  const now = Date.now()
  const start = new Date(session.startTime).getTime()
  const end = new Date(session.endTime).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'RESERVED'
  if (now < start) return 'RESERVED'
  if (now < end) return 'ONGOING'
  return 'CHECKED_OUT'
}


type ClientsModernIconName = 'clients' | 'companies' | 'groups' | 'search' | 'plus'

function ClientsModernIcon({ name }: { name: ClientsModernIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'clients') {
    return (
      <svg {...common}>
        <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
        <circle cx="10" cy="7.5" r="3.5" />
        <path d="M20 20v-1.2a3 3 0 0 0-2.3-2.9" />
        <path d="M16.5 4.3a3 3 0 0 1 0 5.4" />
      </svg>
    )
  }
  if (name === 'companies') {
    return (
      <svg {...common}>
        <path d="M4 20h16" />
        <path d="M6 20V6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5V20" />
        <path d="M9 8h1" />
        <path d="M14 8h1" />
        <path d="M9 12h1" />
        <path d="M14 12h1" />
        <path d="M10 20v-4h4v4" />
      </svg>
    )
  }
  if (name === 'groups') {
    return (
      <svg {...common}>
        <path d="M8 19v-1.1A3.9 3.9 0 0 1 11.9 14h.2A3.9 3.9 0 0 1 16 17.9V19" />
        <circle cx="12" cy="8" r="3" />
        <path d="M4.5 18v-.8a3.2 3.2 0 0 1 2.6-3.1" />
        <path d="M6.7 6.1a2.4 2.4 0 0 0 .2 4.7" />
        <path d="M19.5 18v-.8a3.2 3.2 0 0 0-2.6-3.1" />
        <path d="M17.3 6.1a2.4 2.4 0 0 1-.2 4.7" />
      </svg>
    )
  }
  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="10.8" cy="10.8" r="6" />
        <path d="m16 16 4 4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}


function ClientsMobileCardActionIcon({ kind }: { kind: 'client' | 'company' | 'group' }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (kind === 'company') {
    return (
      <span className="clients-mobile-card-action-icon clients-mobile-card-action-icon--company" aria-hidden="true">
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M6 20V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13" />
          <path d="M9 9h1" />
          <path d="M14 9h1" />
          <path d="M9 13h1" />
          <path d="M14 13h1" />
          <path d="M10 20v-4h4v4" />
        </svg>
      </span>
    )
  }
  if (kind === 'group') {
    return (
      <span className="clients-mobile-card-action-icon clients-mobile-card-action-icon--group" aria-hidden="true">
        <svg {...common}>
          <path d="M8 19v-1.2A3.8 3.8 0 0 1 11.8 14h.4a3.8 3.8 0 0 1 3.8 3.8V19" />
          <circle cx="12" cy="8" r="3" />
          <path d="M4.5 18v-.8a3.2 3.2 0 0 1 2.7-3.1" />
          <path d="M6.8 6.2a2.5 2.5 0 0 0 .2 4.8" />
          <path d="M19.5 18v-.8a3.2 3.2 0 0 0-2.7-3.1" />
          <path d="M17.2 6.2a2.5 2.5 0 0 1-.2 4.8" />
        </svg>
      </span>
    )
  }
  return (
    <span className="clients-mobile-card-action-icon clients-mobile-card-action-icon--client" aria-hidden="true">
      <svg {...common}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19.2c0-3.7 3.1-6.7 7-6.7s7 3 7 6.7" />
      </svg>
    </span>
  )
}

type ClientWorkspaceIconName = 'sessions' | 'wallet' | 'files' | 'settings' | 'members' | 'chevronDown'

function ClientWorkspaceIcon({ name }: { name: ClientWorkspaceIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'sessions') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2.5" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M4 10h16" />
      </svg>
    )
  }
  if (name === 'wallet') {
    return (
      <svg {...common}>
        <path d="M4.5 7.5h14A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7a2.5 2.5 0 0 1 2.5-2.5H18" />
        <path d="M16 13h5" />
        <circle cx="17.5" cy="13" r=".75" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (name === 'files') {
    return (
      <svg {...common}>
        <path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10A2.5 2.5 0 0 0 19.5 18V9" />
        <path d="M14 3.5V9h5.5" />
        <path d="M8 13h8" />
        <path d="M8 16h5" />
      </svg>
    )
  }
  if (name === 'settings') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .35 2l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-2-.35 1.8 1.8 0 0 0-1.08 1.65V21a2.1 2.1 0 0 1-4.2 0v-.08a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-2 .35l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05a1.8 1.8 0 0 0 .35-2 1.8 1.8 0 0 0-1.65-1.08H2a2.1 2.1 0 0 1 0-4.2h.08a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.35-2l-.05-.05a2.1 2.1 0 1 1 2.97-2.97l.05.05a1.8 1.8 0 0 0 2 .35h.02A1.8 1.8 0 0 0 9.45 2V2a2.1 2.1 0 0 1 4.2 0v.08a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 2-.35l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05a1.8 1.8 0 0 0-.35 2v.02a1.8 1.8 0 0 0 1.65 1.08H22a2.1 2.1 0 0 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z" />
      </svg>
    )
  }
  if (name === 'members') {
    return (
      <svg {...common}>
        <path d="M8 19v-1.2A3.8 3.8 0 0 1 11.8 14h.4A3.8 3.8 0 0 1 16 17.8V19" />
        <circle cx="12" cy="8" r="3" />
        <path d="M4.5 18v-.7a3.1 3.1 0 0 1 2.5-3" />
        <path d="M6.8 6.2a2.25 2.25 0 0 0 .2 4.5" />
        <path d="M19.5 18v-.7a3.1 3.1 0 0 0-2.5-3" />
        <path d="M17.2 6.2a2.25 2.25 0 0 1-.2 4.5" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="m7 10 5 5 5-5" />
    </svg>
  )
}


type ClientsPageProps = {
  embeddedClientId?: number | null
  embeddedGroupId?: number | null
  onEmbeddedClose?: () => void
  onEmbeddedSaved?: () => void | Promise<void>
}

export function ClientsPage({ embeddedClientId = null, embeddedGroupId = null, onEmbeddedClose, onEmbeddedSaved }: ClientsPageProps = {}) {
  const { t, locale } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const embeddedClientDetailIdRaw = Number(embeddedClientId ?? 0)
  const embeddedClientDetailId = Number.isInteger(embeddedClientDetailIdRaw) && embeddedClientDetailIdRaw > 0 ? embeddedClientDetailIdRaw : null
  const embeddedGroupDetailIdRaw = Number(embeddedGroupId ?? 0)
  const embeddedGroupDetailId = Number.isInteger(embeddedGroupDetailIdRaw) && embeddedGroupDetailIdRaw > 0 ? embeddedGroupDetailIdRaw : null
  const embeddedClientDetailMode = embeddedClientDetailId != null
  const embeddedGroupDetailMode = embeddedGroupDetailId != null
  const embeddedDetailMode = embeddedClientDetailMode || embeddedGroupDetailMode
  const compactCreateModalHeader = useCalendarFiltersBottomBar()
  /** Match `clients-tab-client-detail-modal` header CSS (title hidden, close left). */
  const clientDetailCompactHeader = useMediaMaxWidth(768)
  const clientsCopy = locale === 'sl' ? {
    details: 'Podrobnosti',
    client: 'STRANKA',
    company: 'PODJETJE',
    newButtonMobile: 'Novo',
    newButton: 'Novo',
    manage: 'Upravljaj',
    searchClientsPlaceholder: 'Išči stranke...',
    searchCompaniesPlaceholder: 'Išči podjetja...',
    activeFilter: 'Aktivna',
    inactive: 'Neaktivna',
    listClientsCount: (count: number) => `${count} ${slovenianStrankaCountForm(count)}`,
    listCompaniesCount: (count: number) => `${count} ${slovenianPodjetjeCountForm(count)}`,
    assignedToLine: (name: string) => ` · Dodeljeno: ${name}`,
    tableHeaderName: 'Naziv',
    tableHeaderPhone: 'Telefon',
    tableHeaderAssigned: 'Dodeljeni zaposleni',
    tableHeaderCreated: 'Ustvarjeno',
    emptyClientsTitle: 'Ni strank',
    emptyClientsText: 'Kliknite Novo za ustvarjanje prve stranke.',
    emptyCompaniesTitle: 'Ni podjetij',
    emptyCompaniesText: 'Kliknite Novo za ustvarjanje prvega podjetja kot prejemnika.',
    toggleOn: 'VKLOPLJENO',
    toggleOff: 'IZKLOPLJENO',
    firstName: 'Ime',
    lastName: 'Priimek',
    email: 'E-pošta',
    phone: 'Telefon',
    whatsappOptIn: 'WhatsApp opt-in',
    linkedCompany: 'Povezano podjetje',
    batchPayment: 'Paketno plačilo',
    sessions: 'Termini',
    future: 'Prihodnji',
    past: 'Pretekli',
    cancelled: 'Odpovedani',
    sessionsCount: (count: number) => `${count} ${slovenianTerminCountForm(count)}`,
    loadingSessions: 'Nalagam termine…',
    noUpcomingSessionsTitle: 'Ni prihodnjih terminov',
    noUpcomingSessionsText: 'Tukaj se prikažejo rezervirani termini z začetkom po trenutnem času.',
    noPastSessionsTitle: 'Ni preteklih terminov',
    noPastSessionsText: 'Tukaj se prikažejo termini z začetkom pred ali ob trenutnem času.',
    noCancelledSessionsTitle: 'Ni odpovedanih terminov',
    noCancelledSessionsText: 'Tukaj se prikažejo odpovedani in no-show termini.',
    liveSession: 'Termin v živo',
    start: 'Začetek',
    end: 'Konec',
    saveChanges: 'Shrani spremembe',
    savingChanges: 'Shranjujem spremembe…',
    saving: 'Shranjujem...',
    deactivate: 'Deaktiviraj',
    activate: 'Aktiviraj',
    delete: 'Izbriši',
    deleting: 'Brisanje...',
    anonymize: 'Anonimiziraj',
    anonymizing: 'Anonimiziram...',
    yesAnonymize: 'Da, anonimiziraj',
    confirmAnonymizeClient: 'Ali želite anonimizirati to stranko? Osebni podatki bodo izbrisani.',
    confirmAnonymizeOk: 'V redu',
    anonymizeConfirmDialogAria: 'Potrditev anonimizacije stranke',
    confirmDeleteClient: 'Ali želite izbrisati to stranko?',
    confirmDeleteCompany: 'Ali želite izbrisati to podjetje?',
    confirmDeleteGroup: 'Ali želite izbrisati to skupino?',
    newClientTitle: 'Nova stranka',
    newClientName: 'Nova stranka',
    newClientSubtitle: 'Ustvari profil stranke in po potrebi poveži podatke za obračun.',
    messaging: 'Sporočanje',
    messagingNote: 'WhatsApp uporablja telefonsko številko stranke. Povezava z Viberjem bo na voljo, ko se stranka poveže z vašim Viber botom.',
    noLinkedCompany: 'Brez povezanega podjetja',
    unassignedConsultant: 'Nedodeljen',
    assignedConsultant: 'Dodeljeni zaposleni',
    createClient: 'Ustvari stranko',
    newCompanyTitle: 'Novo podjetje',
    newCompanyName: 'Novo podjetje',
    newCompanySubtitle: 'Obvezno je samo ime podjetja. Ostalo lahko dodaš pozneje.',
    companyName: 'Ime podjetja',
    address: 'Naslov',
    postalCode: 'Poštna številka',
    city: 'Mesto',
    vatId: 'Davčna številka',
    telephone: 'Telefon',
    createCompany: 'Ustvari podjetje',
    files: 'Datoteke',
    uploadFile: 'Naloži datoteko',
    uploadingFile: 'Nalagam datoteko…',
    loadingFiles: 'Nalagam datoteke…',
    noFilesTitle: 'Ni datotek',
    noClientFilesText: 'Datoteke, naložene za to stranko, bodo prikazane tukaj.',
    noCompanyFilesText: 'Datoteke, naložene za to podjetje, bodo prikazane tukaj.',
    uploaded: 'Naloženo',
    openFile: 'Odpri',
    removeFile: 'Odstrani',
    deleteFileConfirm: 'Odstranim to datoteko?',
    fileTooLarge: 'Datoteka ne sme biti večja od 50 MB.',
    fileUnsupported: (name: string) => `${name} ni podprt tip datoteke. Dovoljene so slike, PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, PPT in PPTX.`,
    dragDropFilesHint: 'Povlecite datoteke sem ali uporabite gumb zgoraj.',
    clientDetailMainTabsAria: 'Zavihki podrobnosti stranke',
    clientDetailTabSettings: 'Nastavitve',
    clientDetailTabWallet: 'Denarnica',
    walletActive: 'Aktivno',
    walletInactive: 'Preteklo',
    walletUsageHistory: 'Zgodovina uporabe',
    walletLoading: 'Nalagam kartice in članstva…',
    walletNoneActiveTitle: 'Ni aktivnih kartic ali članstev',
    walletNoneActiveText: 'Kupljene kartice in članstva se bodo prikazala tukaj.',
    walletNoneInactiveTitle: 'Ni preteklih kartic ali članstev',
    walletNoneInactiveText: 'Potekla, porabljena ali preklicana članstva se bodo prikazala tukaj.',
    walletNoUsageTitle: 'Ni uporabe',
    walletNoUsageText: 'Ko bo stranka porabila obisk ali članstvo, se bo zgodovina prikazala tukaj.',
    walletRemainingUses: 'Preostali obiski',
    walletEntitlementCode: 'Koda',
    walletVisitCount: 'Obiski',
    walletScannedBy: 'Skeniral',
    walletUnlimited: 'Neomejeno',
    walletValidFrom: 'Velja od',
    walletValidUntil: 'Velja do',
    walletCreated: 'Kupljeno',
    walletOrder: 'Naročilo',
    walletServiceType: 'Vrsta storitve',
    walletAutoRenew: 'Samodejna obnova',
    walletStatus: 'Status',
    walletBooking: 'Rezervacija',
    walletUsedUnits: 'Porabljene enote',
    walletDeleteEntitlement: 'Izbriši ugodnost',
    walletDeletingEntitlement: 'Brišem...',
    walletDeleteEntitlementConfirm: 'Ali želite izbrisati to ugodnost iz denarnice gosta?',
    walletDeleteEntitlementError: 'Ugodnosti ni bilo mogoče izbrisati.',
    companyDetailMainTabsAria: 'Zavihki podrobnosti podjetja',
    companyDatotekeSubTabsAria: 'Podzavihki datotek in računov',
    companySubTabInvoices: 'Računi',
    companySubTabGeneral: 'Splošno',
    groupsTab: 'Skupine',
    group: 'SKUPINA',
    searchGroupsPlaceholder: 'Išči skupine...',
    listGroupsCount: (count: number) => `${count} ${count === 1 ? 'skupina' : count === 2 ? 'skupini' : count === 3 || count === 4 ? 'skupine' : 'skupin'}`,
    emptyGroupsTitle: 'Ni skupin',
    emptyGroupsText: 'Kliknite Novo za ustvarjanje prve skupine.',
    newGroupTitle: 'Nova skupina',
    newGroupSubtitle: 'Obvezno je samo ime. Člane dodajte pozneje.',
    groupName: 'Ime skupine',
    groupEmail: 'E-pošta skupine',
    groupMembers: 'Člani',
    addMember: 'Dodaj člana',
    removeMember: 'Odstrani',
    searchMembersPlaceholder: 'Išči stranke za dodajanje…',
    groupMemberSearchNoResults: 'Ni strank, ki bi ustrezale iskanju.',
    addSelectedMembers: (n: number) => `Dodaj ${n} označenih`,
    addMembersPickFirst: 'Izberite stranke',
    noMembers: 'Ni članov',
    noMembersText: 'Dodajte stranke v to skupino.',
    createGroup: 'Ustvari skupino',
    individualPayment: 'Individualno plačilo',
    groupDetailMainTabsAria: 'Zavihki podrobnosti skupine',
    noGroupFilesText: 'Datoteke, naložene za to skupino, bodo prikazane tukaj.',
    groupMaxSize: 'Največje število na termin',
    groupMaxSizeHint: 'Največje število strank na skupino',
    clientActionsAria: 'Dejanja za stranko',
    groupActionsAria: 'Dejanja za skupino',
    removalBlockedHint:
      'Ni mogoče: stranka ima prihodnje ali trenutne termine oziroma aktivne kartice, pakete obiskov ali članstva.',
    companyActionsAria: 'Dejanja za podjetje',
    guestAppBadge: 'Aplikacija za goste',
  } : {
    details: 'Details',
    client: 'CLIENT',
    company: 'COMPANY',
    newButtonMobile: 'New',
    newButton: 'New',
    manage: 'Manage',
    searchClientsPlaceholder: 'Search clients...',
    searchCompaniesPlaceholder: 'Search companies...',
    activeFilter: 'Active',
    inactive: 'Inactive',
    listClientsCount: (count: number) => `${count} clients`,
    listCompaniesCount: (count: number) => `${count} companies`,
    assignedToLine: (name: string) => ` · Assigned to ${name}`,
    tableHeaderName: 'Name',
    tableHeaderPhone: 'Phone',
    tableHeaderAssigned: 'Assigned',
    tableHeaderCreated: 'Created',
    emptyClientsTitle: 'No clients',
    emptyClientsText: 'Click New to create your first client.',
    emptyCompaniesTitle: 'No companies',
    emptyCompaniesText: 'Click New to create your first company recipient.',
    toggleOn: 'ON',
    toggleOff: 'OFF',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    whatsappOptIn: 'WhatsApp opt-in',
    linkedCompany: 'Linked company',
    batchPayment: 'Batch payment',
    sessions: 'Sessions',
    future: 'Future',
    past: 'Past',
    cancelled: 'Cancelled',
    sessionsCount: (count: number) => `${count} sessions`,
    loadingSessions: 'Loading sessions…',
    noUpcomingSessionsTitle: 'No upcoming sessions',
    noUpcomingSessionsText: 'Booked sessions with a start time after now appear here.',
    noPastSessionsTitle: 'No past sessions',
    noPastSessionsText: 'Sessions with a start time before or at now appear here.',
    noCancelledSessionsTitle: 'No cancelled sessions',
    noCancelledSessionsText: 'Cancelled and no-show sessions appear here.',
    liveSession: 'Live session',
    start: 'Start',
    end: 'End',
    saveChanges: 'Save changes',
    savingChanges: 'Saving changes…',
    saving: 'Saving...',
    deactivate: 'Deactivate',
    activate: 'Activate',
    delete: 'Delete',
    deleting: 'Deleting...',
    anonymize: 'Anonymize',
    anonymizing: 'Anonymizing...',
    yesAnonymize: 'Yes, anonymize',
    confirmAnonymizeClient: 'Anonymize this client? Personal details will be cleared.',
    confirmAnonymizeOk: 'OK',
    anonymizeConfirmDialogAria: 'Confirm client anonymization',
    confirmDeleteClient: 'Delete this client?',
    confirmDeleteCompany: 'Delete this company?',
    confirmDeleteGroup: 'Delete this group?',
    newClientTitle: 'New client',
    newClientName: 'New client',
    newClientSubtitle: 'Create a client profile and link billing details if needed.',
    messaging: 'Messaging',
    messagingNote: 'WhatsApp uses the client phone number. Viber linking becomes available after the client connects to your Viber bot.',
    noLinkedCompany: 'No linked company',
    unassignedConsultant: 'Unassigned',
    assignedConsultant: 'Assigned consultant',
    createClient: 'Create client',
    newCompanyTitle: 'New company',
    newCompanyName: 'New company',
    newCompanySubtitle: 'Only company name is required. Everything else can be filled in later.',
    companyName: 'Company name',
    address: 'Address',
    postalCode: 'Postal code',
    city: 'City',
    vatId: 'VAT ID',
    telephone: 'Telephone',
    createCompany: 'Create company',
    files: 'Files',
    uploadFile: 'Upload file',
    uploadingFile: 'Uploading file…',
    loadingFiles: 'Loading files…',
    noFilesTitle: 'No files',
    noClientFilesText: 'Files uploaded for this client will appear here.',
    noCompanyFilesText: 'Files uploaded for this company will appear here.',
    uploaded: 'Uploaded',
    openFile: 'Open',
    removeFile: 'Remove',
    deleteFileConfirm: 'Remove this file?',
    fileTooLarge: 'Files must be 50 MB or smaller.',
    fileUnsupported: (name: string) => `${name} is not a supported file type. Allowed: images, PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, PPT, PPTX.`,
    dragDropFilesHint: 'Drag files here or use the button above.',
    clientDetailMainTabsAria: 'Client detail sections',
    clientDetailTabSettings: 'Settings',
    clientDetailTabWallet: 'Wallet',
    walletActive: 'Active',
    walletInactive: 'Past',
    walletUsageHistory: 'Usage history',
    walletLoading: 'Loading cards and memberships…',
    walletNoneActiveTitle: 'No active cards or memberships',
    walletNoneActiveText: 'Purchased cards and memberships will appear here.',
    walletNoneInactiveTitle: 'No past cards or memberships',
    walletNoneInactiveText: 'Expired, used-up, or cancelled memberships will appear here.',
    walletNoUsageTitle: 'No usage yet',
    walletNoUsageText: 'Usage history will appear here after the client spends a visit or membership credit.',
    walletRemainingUses: 'Remaining visits',
    walletEntitlementCode: 'Code',
    walletVisitCount: 'Visits',
    walletScannedBy: 'Scanned by',
    walletUnlimited: 'Unlimited',
    walletValidFrom: 'Valid from',
    walletValidUntil: 'Valid until',
    walletCreated: 'Purchased',
    walletOrder: 'Order',
    walletServiceType: 'Service type',
    walletAutoRenew: 'Auto-renew',
    walletStatus: 'Status',
    walletBooking: 'Booking',
    walletUsedUnits: 'Units used',
    walletDeleteEntitlement: 'Delete entitlement',
    walletDeletingEntitlement: 'Deleting...',
    walletDeleteEntitlementConfirm: 'Delete this entitlement from the guest wallet?',
    walletDeleteEntitlementError: 'Could not delete the entitlement.',
    companyDetailMainTabsAria: 'Company detail tabs',
    companyDatotekeSubTabsAria: 'Files and invoices sections',
    companySubTabInvoices: 'Invoices',
    companySubTabGeneral: 'General',
    groupsTab: 'Groups',
    group: 'GROUP',
    searchGroupsPlaceholder: 'Search groups...',
    listGroupsCount: (count: number) => `${count} groups`,
    emptyGroupsTitle: 'No groups',
    emptyGroupsText: 'Click New to create your first group.',
    newGroupTitle: 'New group',
    newGroupSubtitle: 'Only group name is required. Add members later.',
    groupName: 'Group name',
    groupEmail: 'Group email',
    groupMembers: 'Members',
    addMember: 'Add member',
    removeMember: 'Remove',
    searchMembersPlaceholder: 'Search clients to add…',
    groupMemberSearchNoResults: 'No clients match your search.',
    addSelectedMembers: (n: number) => `Add ${n} selected`,
    addMembersPickFirst: 'Select clients',
    noMembers: 'No members',
    noMembersText: 'Add clients to this group.',
    createGroup: 'Create group',
    individualPayment: 'Individual payment',
    groupDetailMainTabsAria: 'Group detail sections',
    noGroupFilesText: 'Files uploaded for this group will appear here.',
    groupMaxSize: 'Max size',
    groupMaxSizeHint: 'Maximum clients per group',
    clientActionsAria: 'Client actions',
    groupActionsAria: 'Group actions',
    removalBlockedHint:
      'Not available: this client has upcoming or in-progress sessions, or active memberships and visit packs.',
    companyActionsAria: 'Company actions',
    guestAppBadge: 'Guest app',
  }
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN'
  const [entityTab, setEntityTab] = useState<EntityTab>('clients')
  const [clients, setClients] = useState<Client[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyBills, setCompanyBills] = useState<CompanyBillSummary[]>([])
  const [detailClientFiles, setDetailClientFiles] = useState<StoredFile[]>([])
  const [detailCompanyFiles, setDetailCompanyFiles] = useState<StoredFile[]>([])
  const [consultants, setConsultants] = useState<ConsultantSummary[]>([])
  const [showModal, setShowModal] = useState(false)
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [search, setSearch] = useState('')
  const [companySearch, setCompanySearch] = useState('')
  const [form, setForm] = useState<ClientForm>(emptyClientForm)
  const [newClientEditField, setNewClientEditField] = useState<'firstName' | 'lastName' | 'email' | 'phone' | null>('firstName')
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm)
  const [loading, setLoading] = useState(false)
  const [loadingCompanies, setLoadingCompanies] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingCompany, setSavingCompany] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [companyErrorMessage, setCompanyErrorMessage] = useState('')
  const [detailClient, setDetailClient] = useState<Client | null>(null)
  const [detailCompany, setDetailCompany] = useState<Company | null>(null)
  const [detailSessions, setDetailSessions] = useState<ClientSession[]>([])
  const [detailSessionsLoading, setDetailSessionsLoading] = useState(false)
  const [detailCompanyBillsLoading, setDetailCompanyBillsLoading] = useState(false)
  const [detailClientFilesLoading, setDetailClientFilesLoading] = useState(false)
  const [detailCompanyFilesLoading, setDetailCompanyFilesLoading] = useState(false)
  const [detailSessionsError, setDetailSessionsError] = useState('')
  const [detailWallet, setDetailWallet] = useState<ClientWalletResponse | null>(null)
  const [detailWalletLoading, setDetailWalletLoading] = useState(false)
  const [detailWalletError, setDetailWalletError] = useState('')
  const [detailCompanyError, setDetailCompanyError] = useState('')
  const [detailClientFilesError, setDetailClientFilesError] = useState('')
  const [detailCompanyFilesError, setDetailCompanyFilesError] = useState('')
  const [sessionTab, setSessionTab] = useState<'future' | 'past' | 'cancelled'>('future')
  const [clientDetailMainTab, setClientDetailMainTab] = useState<'sessions' | 'wallet' | 'files' | 'settings'>('sessions')
  const [highlightedEntitlementId, setHighlightedEntitlementId] = useState<number | null>(null)
  const [companyDetailMainTab, setCompanyDetailMainTab] = useState<'datoteke' | 'nastavitve'>('datoteke')
  const [companyDetailDatotekeSubTab, setCompanyDetailDatotekeSubTab] = useState<'racuni' | 'splosno'>('splosno')
  const [anonymizingClientId, setAnonymizingClientId] = useState<number | null>(null)
  const [anonymizeConfirmClientId, setAnonymizeConfirmClientId] = useState<number | null>(null)
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null)
  const [deletingCompanyId, setDeletingCompanyId] = useState<number | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null)
  const [activatingClientId, setActivatingClientId] = useState<number | null>(null)
  const [activatingCompanyId, setActivatingCompanyId] = useState<number | null>(null)
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive'>('active')
  const [companyActiveFilter, setCompanyActiveFilter] = useState<'active' | 'inactive'>('active')
  const [detailEditField, setDetailEditField] = useState<'firstName' | 'lastName' | 'email' | 'phone' | 'billingCompanyId' | 'assignedToId' | null>(null)
  const [detailEditDraft, setDetailEditDraft] = useState<{
    firstName: string
    lastName: string
    email: string
    phone: string
    whatsappOptIn: boolean
    batchPaymentEnabled: boolean
    billingCompanyId: number | null
    assignedToId: number | null
  }>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    whatsappOptIn: false,
    batchPaymentEnabled: false,
    billingCompanyId: null,
    assignedToId: null,
  })
  const [savingDetailEdit, setSavingDetailEdit] = useState(false)
  const [companyDetailEditField, setCompanyDetailEditField] = useState<'name' | 'address' | 'postalCode' | 'city' | 'vatId' | 'iban' | 'email' | 'telephone' | null>(null)
  const [companyDetailEditDraft, setCompanyDetailEditDraft] = useState<CompanyForm>(emptyCompanyForm)
  const [savingCompanyDetailEdit, setSavingCompanyDetailEdit] = useState(false)
  const [uploadingClientFile, setUploadingClientFile] = useState(false)
  const [uploadingCompanyFile, setUploadingCompanyFile] = useState(false)
  const [deletingClientFileId, setDeletingClientFileId] = useState<number | null>(null)
  const [deletingCompanyFileId, setDeletingCompanyFileId] = useState<number | null>(null)
  const [clientFilesDropActive, setClientFilesDropActive] = useState(false)
  const [companyFilesDropActive, setCompanyFilesDropActive] = useState(false)
  const [clientFileSearch, setClientFileSearch] = useState('')
  const [companyFileSearch, setCompanyFileSearch] = useState('')
  const [walletFilter, setWalletFilter] = useState<'all' | 'packs' | 'memberships' | 'giftCards'>('all')
  const [walletPurchaseDrawerOpen, setWalletPurchaseDrawerOpen] = useState(false)
  const [walletProducts, setWalletProducts] = useState<WalletProduct[]>([])
  const [walletProductsLoading, setWalletProductsLoading] = useState(false)
  const [walletProductSearch, setWalletProductSearch] = useState('')
  const [selectedWalletProductId, setSelectedWalletProductId] = useState<number | null>(null)
  const [walletPurchaseError, setWalletPurchaseError] = useState('')
  const [creatingWalletOpenBill, setCreatingWalletOpenBill] = useState(false)
  const [deletingWalletEntitlementId, setDeletingWalletEntitlementId] = useState<number | null>(null)
  const clientFilesDropDepth = useRef(0)
  const companyFilesDropDepth = useRef(0)
  const [isClientsMobile, setIsClientsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 720px)').matches : false,
  )
  const [openClientMenuId, setOpenClientMenuId] = useState<number | null>(null)
  const [openCompanyMenuId, setOpenCompanyMenuId] = useState<number | null>(null)
  const [openGroupMenuId, setOpenGroupMenuId] = useState<number | null>(null)
  const clientMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [clientMenuAnchorRect, setClientMenuAnchorRect] = useState<DOMRect | null>(null)
  const companyMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [companyMenuAnchorRect, setCompanyMenuAnchorRect] = useState<DOMRect | null>(null)
  const groupMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [groupMenuAnchorRect, setGroupMenuAnchorRect] = useState<DOMRect | null>(null)

  const refreshClientMenuAnchor = useCallback(() => {
    if (clientMenuTriggerRef.current) {
      setClientMenuAnchorRect(clientMenuTriggerRef.current.getBoundingClientRect())
    }
  }, [])

  const refreshCompanyMenuAnchor = useCallback(() => {
    if (companyMenuTriggerRef.current) {
      setCompanyMenuAnchorRect(companyMenuTriggerRef.current.getBoundingClientRect())
    }
  }, [])

  const refreshGroupMenuAnchor = useCallback(() => {
    if (groupMenuTriggerRef.current) {
      setGroupMenuAnchorRect(groupMenuTriggerRef.current.getBoundingClientRect())
    }
  }, [])

  const [groups, setGroups] = useState<ClientGroup[]>([])
  const [groupSearch, setGroupSearch] = useState('')
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupErrorMessage, setGroupErrorMessage] = useState('')
  const [groupActiveFilter, setGroupActiveFilter] = useState<'active' | 'inactive'>('active')
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [groupForm, setGroupForm] = useState<{ name: string; email: string }>({ name: '', email: '' })
  const [savingGroup, setSavingGroup] = useState(false)
  const [detailGroup, setDetailGroup] = useState<ClientGroup | null>(null)
  const [detailGroupSessions, setDetailGroupSessions] = useState<ClientSession[]>([])
  const [detailGroupSessionsLoading, setDetailGroupSessionsLoading] = useState(false)
  const [groupSessionTab, setGroupSessionTab] = useState<'future' | 'past' | 'cancelled'>('future')
  const [groupDetailMainTab, setGroupDetailMainTab] = useState<'sessions' | 'members' | 'settings'>('sessions')
  const [groupDetailEditField, setGroupDetailEditField] = useState<'name' | 'email' | 'billingCompanyId' | null>(null)
  const [groupDetailEditDraft, setGroupDetailEditDraft] = useState<{
    name: string
    email: string
    batchPaymentEnabled: boolean
    individualPaymentEnabled: boolean
    billingCompanyId: number | null
  }>({
    name: '',
    email: '',
    batchPaymentEnabled: false,
    individualPaymentEnabled: false,
    billingCompanyId: null,
  })
  const [savingGroupDetailEdit, setSavingGroupDetailEdit] = useState(false)
  const [activatingGroupId, setActivatingGroupId] = useState<number | null>(null)
  const [groupMemberSearch, setGroupMemberSearch] = useState('')
  const [groupMemberDropdownOpen, setGroupMemberDropdownOpen] = useState(false)
  const [pendingGroupMemberIds, setPendingGroupMemberIds] = useState<number[]>([])
  const [addingMember, setAddingMember] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const groupBookingEnabled = settings.GROUP_BOOKING_ENABLED === 'true'

  const companyInvoiceStatusPill = (bill: CompanyBillSummary): { label: string; variant: 'paid' | 'payment-pending' | 'fiscal-failed' } | null => {
    if (bill.fiscalStatus === 'FAILED') return { label: 'FAILED', variant: 'fiscal-failed' }
    if (bill.paymentStatus === 'payment_pending') return { label: 'PAYMENT PENDING', variant: 'payment-pending' }
    if (bill.paymentStatus === 'paid') return { label: 'PAID', variant: 'paid' }
    return null
  }

  async function loadClients() {
    setLoading(true)
    setErrorMessage('')
    try {
      const response = await api.get(`/clients`)
      setClients(response.data ?? [])
    } catch (error: any) {
      if (error?.response?.status === 403) setErrorMessage('You are not allowed to view clients. Please log in again.')
      else setErrorMessage('Failed to load clients.')
    } finally {
      setLoading(false)
    }
  }

  async function loadCompanies() {
    setLoadingCompanies(true)
    setCompanyErrorMessage('')
    try {
      const response = await api.get<Company[]>('/companies', { params: { search: companySearch.trim() || undefined } })
      setCompanies(response.data ?? [])
    } catch {
      setCompanyErrorMessage('Failed to load companies.')
    } finally {
      setLoadingCompanies(false)
    }
  }

  async function loadGroups() {
    setLoadingGroups(true)
    setGroupErrorMessage('')
    try {
      const response = await api.get<ClientGroup[]>('/groups', { params: { search: groupSearch.trim() || undefined } })
      setGroups(response.data ?? [])
    } catch {
      setGroupErrorMessage('Failed to load groups.')
    } finally {
      setLoadingGroups(false)
    }
  }

  async function loadSettings() {
    try {
      const response = await api.get<Record<string, string>>('/settings')
      setSettings(response.data ?? {})
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadClients()
    loadSettings()
  }, [])

  useEffect(() => {
    loadCompanies()
  }, [companySearch])

  useEffect(() => {
    if (groupBookingEnabled) loadGroups()
  }, [groupSearch, groupBookingEnabled])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => setIsClientsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (openClientMenuId == null && openCompanyMenuId == null && openGroupMenuId == null) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.clients-card-menu-wrap') || el?.closest('.clients-card-menu-popover')) return
      setOpenClientMenuId(null)
      setOpenCompanyMenuId(null)
      setOpenGroupMenuId(null)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openClientMenuId, openCompanyMenuId, openGroupMenuId])

  useEffect(() => {
    if (openClientMenuId == null) {
      setClientMenuAnchorRect(null)
      clientMenuTriggerRef.current = null
      return
    }
    refreshClientMenuAnchor()
    window.addEventListener('scroll', refreshClientMenuAnchor, true)
    window.addEventListener('resize', refreshClientMenuAnchor)
    return () => {
      window.removeEventListener('scroll', refreshClientMenuAnchor, true)
      window.removeEventListener('resize', refreshClientMenuAnchor)
    }
  }, [openClientMenuId, refreshClientMenuAnchor])

  useEffect(() => {
    if (openCompanyMenuId == null) {
      setCompanyMenuAnchorRect(null)
      companyMenuTriggerRef.current = null
      return
    }
    refreshCompanyMenuAnchor()
    window.addEventListener('scroll', refreshCompanyMenuAnchor, true)
    window.addEventListener('resize', refreshCompanyMenuAnchor)
    return () => {
      window.removeEventListener('scroll', refreshCompanyMenuAnchor, true)
      window.removeEventListener('resize', refreshCompanyMenuAnchor)
    }
  }, [openCompanyMenuId, refreshCompanyMenuAnchor])

  useEffect(() => {
    if (openGroupMenuId == null) {
      setGroupMenuAnchorRect(null)
      groupMenuTriggerRef.current = null
      return
    }
    refreshGroupMenuAnchor()
    window.addEventListener('scroll', refreshGroupMenuAnchor, true)
    window.addEventListener('resize', refreshGroupMenuAnchor)
    return () => {
      window.removeEventListener('scroll', refreshGroupMenuAnchor, true)
      window.removeEventListener('resize', refreshGroupMenuAnchor)
    }
  }, [openGroupMenuId, refreshGroupMenuAnchor])

  const loadDetailWallet = useCallback(async (clientId: number, options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setDetailWalletLoading(true)
    }
    setDetailWalletError('')
    try {
      const res = await api.get<ClientWalletResponse>(`/clients/${clientId}/wallet`)
      setDetailWallet(res.data ?? { activeEntitlements: [], inactiveEntitlements: [], usageHistory: [] })
    } catch {
      setDetailWalletError(locale === 'sl' ? 'Nalaganje denarnice ni uspelo.' : 'Failed to load wallet.')
    } finally {
      if (!options.silent) {
        setDetailWalletLoading(false)
      }
    }
  }, [locale])

  useEffect(() => {
    if (!detailClient) return
    let cancelled = false;
    setDetailSessionsLoading(true)
    setDetailSessionsError('')
    setDetailSessions([])
    api
      .get<ClientSession[]>(`/clients/${detailClient.id}/bookings`)
      .then((res) => {
        if (!cancelled) setDetailSessions(res.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setDetailSessionsError('Failed to load sessions.')
      })
      .finally(() => {
        if (!cancelled) setDetailSessionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailClient])

  useEffect(() => {
    if (!detailClient) return
    setDetailWallet(null)
    void loadDetailWallet(detailClient.id)
  }, [detailClient, loadDetailWallet])

  useEffect(() => {
    if (!detailCompany) return
    let cancelled = false
    setDetailCompanyBillsLoading(true)
    setDetailCompanyError('')
    setCompanyBills([])
    api
      .get<CompanyBillSummary[]>(`/companies/${detailCompany.id}/bills`)
      .then((res) => {
        if (!cancelled) setCompanyBills(res.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setDetailCompanyError('Failed to load issued invoices.')
      })
      .finally(() => {
        if (!cancelled) setDetailCompanyBillsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailCompany])

  useEffect(() => {
    if (!detailClient) return
    let cancelled = false
    setDetailClientFilesLoading(true)
    setDetailClientFilesError('')
    setDetailClientFiles([])
    api
      .get<StoredFile[]>(`/clients/${detailClient.id}/files`)
      .then((res) => {
        if (!cancelled) setDetailClientFiles(res.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setDetailClientFilesError(locale === 'sl' ? 'Nalaganje datotek ni uspelo.' : 'Failed to load files.')
      })
      .finally(() => {
        if (!cancelled) setDetailClientFilesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailClient, locale])

  useEffect(() => {
    if (!detailCompany) return
    let cancelled = false
    setDetailCompanyFilesLoading(true)
    setDetailCompanyFilesError('')
    setDetailCompanyFiles([])
    api
      .get<StoredFile[]>(`/companies/${detailCompany.id}/files`)
      .then((res) => {
        if (!cancelled) setDetailCompanyFiles(res.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setDetailCompanyFilesError(locale === 'sl' ? 'Nalaganje datotek ni uspelo.' : 'Failed to load files.')
      })
      .finally(() => {
        if (!cancelled) setDetailCompanyFilesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailCompany, locale])

  useEffect(() => {
    if (!detailGroup) return
    let cancelled = false
    setDetailGroupSessionsLoading(true)
    setDetailGroupSessions([])
    api
      .get<ClientSession[]>(`/groups/${detailGroup.id}/bookings`)
      .then((res) => { if (!cancelled) setDetailGroupSessions(res.data ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailGroupSessionsLoading(false) })
    return () => { cancelled = true }
  }, [detailGroup])

  useEffect(() => {
    if (!isAdmin) return
    api.get('/users')
      .then((res) => setConsultants((res.data ?? []).filter((u: ConsultantSummary) => u.consultant)))
      .catch(() => setConsultants([]))
  }, [isAdmin])

  const futureGroupSessions = useMemo(() => {
    const now = new Date()
    return detailGroupSessions
      .filter((s) => normalizeSessionStatus(s.bookingStatus) === 'RESERVED')
      .filter((s) => new Date(s.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [detailGroupSessions])

  const pastGroupSessions = useMemo(() => {
    const now = new Date()
    return detailGroupSessions
      .filter((s) => normalizeSessionStatus(s.bookingStatus) === 'RESERVED')
      .filter((s) => new Date(s.startTime) <= now)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }, [detailGroupSessions])

  const cancelledGroupSessions = useMemo(() => {
    return detailGroupSessions
      .filter((s) => {
        const normalized = normalizeSessionStatus(s.bookingStatus)
        return normalized === 'CANCELLED' || normalized === 'NO_SHOW'
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }, [detailGroupSessions])

  const currentGroupSessions = useMemo(() => {
    if (groupSessionTab === 'future') return futureGroupSessions
    if (groupSessionTab === 'past') return pastGroupSessions
    return cancelledGroupSessions
  }, [groupSessionTab, futureGroupSessions, pastGroupSessions, cancelledGroupSessions])

  const futureSessions = useMemo(() => {
    const now = new Date()
    return detailSessions
      .filter((s) => normalizeSessionStatus(s.bookingStatus) === 'RESERVED')
      .filter((s) => new Date(s.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [detailSessions])

  const pastSessions = useMemo(() => {
    const now = new Date()
    return detailSessions
      .filter((s) => normalizeSessionStatus(s.bookingStatus) === 'RESERVED')
      .filter((s) => new Date(s.startTime) <= now)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }, [detailSessions])

  const cancelledSessions = useMemo(() => {
    return detailSessions
      .filter((s) => {
        const normalized = normalizeSessionStatus(s.bookingStatus)
        return normalized === 'CANCELLED' || normalized === 'NO_SHOW'
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }, [detailSessions])

  const currentClientSessions = useMemo(() => {
    if (sessionTab === 'future') return futureSessions
    if (sessionTab === 'past') return pastSessions
    return cancelledSessions
  }, [sessionTab, futureSessions, pastSessions, cancelledSessions])

  const filteredClientFiles = useMemo(() => {
    const q = clientFileSearch.trim().toLowerCase()
    if (!q) return detailClientFiles
    return detailClientFiles.filter((file) => file.fileName.toLowerCase().includes(q))
  }, [detailClientFiles, clientFileSearch])

  const filteredCompanyFiles = useMemo(() => {
    const q = companyFileSearch.trim().toLowerCase()
    if (!q) return detailCompanyFiles
    return detailCompanyFiles.filter((file) => file.fileName.toLowerCase().includes(q))
  }, [detailCompanyFiles, companyFileSearch])

  const visibleWalletEntitlements = useMemo(() => {
    const activeEntitlements = detailWallet?.activeEntitlements ?? []
    if (walletFilter === 'giftCards') return activeEntitlements.filter((entitlement) => entitlementKind(entitlement) === 'gift_card')
    if (walletFilter === 'memberships') return activeEntitlements.filter((entitlement) => entitlementKind(entitlement) === 'membership')
    if (walletFilter === 'packs') return activeEntitlements.filter((entitlement) => {
      const kind = entitlementKind(entitlement)
      return kind === 'pack' || kind === 'ticket'
    })
    return activeEntitlements
  }, [detailWallet, walletFilter])

  const expiringWalletEntitlementsCount = useMemo(() => {
    const now = new Date()
    const soon = new Date(now)
    soon.setDate(soon.getDate() + 30)
    return (detailWallet?.activeEntitlements ?? []).filter((entitlement) => {
      if (!entitlement.validUntil) return false
      const validUntil = new Date(entitlement.validUntil)
      return !Number.isNaN(validUntil.getTime()) && validUntil >= now && validUntil <= soon
    }).length
  }, [detailWallet])

  const filteredWalletProducts = useMemo(() => {
    const q = walletProductSearch.trim().toLowerCase()
    const rows = walletProducts.filter((product) => {
      if (!q) return true
      const haystack = `${product.name ?? ''} ${product.productType ?? ''} ${product.sessionTypeName ?? ''} ${product.transactionServiceDescription ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
    return rows
  }, [walletProducts, walletProductSearch])

  const selectedWalletProduct = useMemo(() => {
    return walletProducts.find((product) => product.id === selectedWalletProductId) ?? filteredWalletProducts[0] ?? null
  }, [walletProducts, selectedWalletProductId, filteredWalletProducts])

  const loadWalletProducts = useCallback(async (clientId: number) => {
    setWalletProductsLoading(true)
    setWalletPurchaseError('')
    try {
      const res = await api.get<WalletProduct[]>(`/clients/${clientId}/wallet/products`)
      const rows = res.data ?? []
      setWalletProducts(rows)
      setSelectedWalletProductId((prev) => rows.some((row) => row.id === prev) ? prev : (rows[0]?.id ?? null))
    } catch {
      setWalletProducts([])
      setSelectedWalletProductId(null)
      setWalletPurchaseError(locale === 'sl' ? 'Nalaganje ugodnosti za nakup ni uspelo.' : 'Failed to load entitlements for purchase.')
    } finally {
      setWalletProductsLoading(false)
    }
  }, [locale])

  const openWalletPurchaseDrawer = useCallback(() => {
    if (!detailClient) return
    setWalletPurchaseDrawerOpen(true)
    setWalletProductSearch('')
    setWalletPurchaseError('')
    void loadWalletProducts(detailClient.id)
  }, [detailClient, loadWalletProducts])

  const closeWalletPurchaseDrawer = useCallback(() => {
    setWalletPurchaseDrawerOpen(false)
    setWalletPurchaseError('')
    setWalletProductSearch('')
  }, [])

  const createWalletPurchaseOpenBill = useCallback(async () => {
    if (!detailClient || !selectedWalletProduct) return
    setCreatingWalletOpenBill(true)
    setWalletPurchaseError('')
    try {
      const res = await api.post<WalletPurchaseOpenBillResponse>(`/clients/${detailClient.id}/wallet/products/${selectedWalletProduct.id}/open-bill`)
      const openBillId = res.data?.openBillId
      setWalletPurchaseDrawerOpen(false)
      setDetailClient(null)
      if (openBillId) {
        navigate(`/billing/open-bills/${openBillId}/edit`)
      } else {
        navigate('/billing')
      }
    } catch (err: any) {
      const message = err?.response?.data?.message
        || (locale === 'sl' ? 'Odprtega računa za ugodnost ni bilo mogoče ustvariti.' : 'Could not create the entitlement open bill.')
      setWalletPurchaseError(message)
    } finally {
      setCreatingWalletOpenBill(false)
    }
  }, [detailClient, selectedWalletProduct, navigate, locale])

  const deleteWalletEntitlement = useCallback(async (entitlement: ClientWalletEntitlement) => {
    if (!detailClient || deletingWalletEntitlementId != null) return
    if (!window.confirm(clientsCopy.walletDeleteEntitlementConfirm)) return
    setDeletingWalletEntitlementId(entitlement.id)
    setDetailWalletError('')
    try {
      await api.delete(`/clients/${detailClient.id}/wallet/entitlements/${entitlement.id}`)
      setDetailWallet((current) => current ? {
        activeEntitlements: current.activeEntitlements.filter((row) => row.id !== entitlement.id),
        inactiveEntitlements: [
          { ...entitlement, status: 'CANCELLED' },
          ...current.inactiveEntitlements.filter((row) => row.id !== entitlement.id),
        ],
        usageHistory: current.usageHistory,
      } : current)
      void loadDetailWallet(detailClient.id, { silent: true })
    } catch (err: any) {
      setDetailWalletError(err?.response?.data?.message || clientsCopy.walletDeleteEntitlementError)
    } finally {
      setDeletingWalletEntitlementId(null)
    }
  }, [clientsCopy.walletDeleteEntitlementConfirm, clientsCopy.walletDeleteEntitlementError, deletingWalletEntitlementId, detailClient, loadDetailWallet])

  const filteredClients = useMemo(() => {
    const byStatus = clients.filter((c) => activeFilter === 'inactive' ? c.active === false : c.active !== false)
    const q = search.trim().toLowerCase()
    if (!q) return byStatus

    return byStatus.filter((client) => {
      const fullName = `${client.firstName} ${client.lastName}`.toLowerCase()
      return (
          fullName.includes(q) ||
          (client.email ?? '').toLowerCase().includes(q) ||
          (client.phone ?? '').toLowerCase().includes(q) ||
          (client.billingCompany?.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [clients, search, activeFilter])

  const filteredCompanies = useMemo(() => {
    const byStatus = companies.filter((c) => companyActiveFilter === 'inactive' ? c.active === false : c.active !== false)
    const q = companySearch.trim().toLowerCase()
    if (!q) return byStatus
    return byStatus.filter((company) => (
      (company.name || '').toLowerCase().includes(q)
      || (company.email || '').toLowerCase().includes(q)
      || (company.telephone || '').toLowerCase().includes(q)
      || (company.city || '').toLowerCase().includes(q)
      || (company.vatId || '').toLowerCase().includes(q)
    ))
  }, [companies, companySearch, companyActiveFilter])

  const filteredGroups = useMemo(() => {
    const byStatus = groups.filter((g) => groupActiveFilter === 'inactive' ? g.active === false : g.active !== false)
    const q = groupSearch.trim().toLowerCase()
    if (!q) return byStatus
    return byStatus.filter((g) => (g.name || '').toLowerCase().includes(q))
  }, [groups, groupSearch, groupActiveFilter])

  const activeCompaniesForNewClient = useMemo(
    () => companies.filter((c) => c.active !== false),
    [companies],
  )

  const companiesForClientBillingSelect = useMemo(() => {
    const sid = detailEditDraft.billingCompanyId
    if (sid == null) return activeCompaniesForNewClient
    const cur = companies.find((c) => c.id === sid)
    if (cur && cur.active === false && !activeCompaniesForNewClient.some((c) => c.id === sid)) {
      return [...activeCompaniesForNewClient, cur].sort((a, b) => a.name.localeCompare(b.name))
    }
    return activeCompaniesForNewClient
  }, [companies, activeCompaniesForNewClient, detailEditDraft.billingCompanyId])

  const companiesForGroupBillingSelect = useMemo(() => {
    const sid = groupDetailEditDraft.billingCompanyId
    if (sid == null) return activeCompaniesForNewClient
    const cur = companies.find((c) => c.id === sid)
    if (cur && cur.active === false && !activeCompaniesForNewClient.some((c) => c.id === sid)) {
      return [...activeCompaniesForNewClient, cur].sort((a, b) => a.name.localeCompare(b.name))
    }
    return activeCompaniesForNewClient
  }, [companies, activeCompaniesForNewClient, groupDetailEditDraft.billingCompanyId])

  const groupDetailHasChanges = useMemo(() => {
    if (!detailGroup) return false
    return (groupDetailEditDraft.name ?? '') !== (detailGroup.name ?? '')
      || (groupDetailEditDraft.email ?? '') !== (detailGroup.email ?? '')
      || (groupDetailEditDraft.batchPaymentEnabled ?? false) !== (detailGroup.batchPaymentEnabled ?? false)
      || (groupDetailEditDraft.individualPaymentEnabled ?? false) !== (detailGroup.individualPaymentEnabled ?? false)
      || (groupDetailEditDraft.billingCompanyId ?? null) !== (detailGroup.billingCompany?.id ?? null)
  }, [detailGroup, groupDetailEditDraft])

  const groupMemberCandidates = useMemo(() => {
    if (!detailGroup) return []
    const memberIds = new Set((detailGroup.members ?? []).map((m) => m.id))
    const q = groupMemberSearch.trim().toLowerCase()
    return clients.filter((c) => c.active !== false && !memberIds.has(c.id) && (!q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)))
  }, [clients, detailGroup, groupMemberSearch])

  const detailGroupMemberIdSet = useMemo(
    () => new Set((detailGroup?.members ?? []).map((m) => m.id)),
    [detailGroup?.members],
  )

  useEffect(() => {
    setPendingGroupMemberIds((prev) => prev.filter((id) => !detailGroupMemberIdSet.has(id)))
  }, [detailGroupMemberIdSet])

  const clientDetailHasChanges = useMemo(() => {
    if (!detailClient) return false
    return (detailEditDraft.firstName ?? '') !== (detailClient.firstName ?? '')
      || (detailEditDraft.lastName ?? '') !== (detailClient.lastName ?? '')
      || (detailEditDraft.email ?? '') !== (detailClient.email ?? '')
      || (detailEditDraft.phone ?? '') !== (detailClient.phone ?? '')
      || (detailEditDraft.whatsappOptIn ?? false) !== (detailClient.whatsappOptIn ?? false)
      || (detailEditDraft.batchPaymentEnabled ?? false) !== (detailClient.batchPaymentEnabled ?? false)
      || (detailEditDraft.billingCompanyId ?? null) !== (detailClient.billingCompany?.id ?? null)
      || (isAdmin && (detailEditDraft.assignedToId ?? null) !== (detailClient.assignedTo?.id ?? null))
  }, [detailClient, detailEditDraft, isAdmin])

  const companyDetailHasChanges = useMemo(() => {
    if (!detailCompany) return false
    return (companyDetailEditDraft.name ?? '') !== (detailCompany.name ?? '')
      || (companyDetailEditDraft.address ?? '') !== (detailCompany.address ?? '')
      || (companyDetailEditDraft.postalCode ?? '') !== (detailCompany.postalCode ?? '')
      || (companyDetailEditDraft.city ?? '') !== (detailCompany.city ?? '')
      || (companyDetailEditDraft.vatId ?? '') !== (detailCompany.vatId ?? '')
      || (companyDetailEditDraft.iban ?? '') !== (detailCompany.iban ?? '')
      || (companyDetailEditDraft.email ?? '') !== (detailCompany.email ?? '')
      || (companyDetailEditDraft.telephone ?? '') !== (detailCompany.telephone ?? '')
      || (companyDetailEditDraft.batchPaymentEnabled ?? false) !== (detailCompany.batchPaymentEnabled ?? false)
  }, [detailCompany, companyDetailEditDraft])

  const openNewModal = () => {
    setForm(emptyClientForm)
    setNewClientEditField('firstName')
    setErrorMessage('')
    setShowModal(true)
  }

  const openDetailModal = (c: Client, initialTab: 'sessions' | 'wallet' | 'files' | 'settings' = 'sessions') => {
    setDetailClient(c);
    setDetailEditField(null)
    setDetailEditDraft({
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      whatsappOptIn: c.whatsappOptIn ?? false,
      batchPaymentEnabled: c.batchPaymentEnabled ?? false,
      billingCompanyId: c.billingCompany?.id ?? null,
      assignedToId: c.assignedTo?.id ?? null,
    })
    setSessionTab('future')
    setClientDetailMainTab(initialTab)
    setWalletFilter('all')
    setClientFileSearch('')
    setWalletPurchaseDrawerOpen(false)
    setWalletProductSearch('')
    setWalletPurchaseError('')
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const clientId = embeddedClientDetailId ?? Number(params.get('clientId'))
    const initialTab = params.get('tab') === 'wallet' ? 'wallet' : 'sessions'
    const entitlementId = Number(params.get('entitlementId'))
    setHighlightedEntitlementId(Number.isFinite(entitlementId) && entitlementId > 0 ? entitlementId : null)
    if (!Number.isFinite(clientId) || clientId <= 0) return
    if (detailClient?.id === clientId) {
      setClientDetailMainTab(initialTab)
      return
    }
    const existing = clients.find((client) => client.id === clientId)
    if (existing) {
      openDetailModal(existing, initialTab)
      return
    }
    let cancelled = false
    api
      .get<Client>(`/clients/${clientId}`)
      .then((res) => {
        if (!cancelled && res.data) openDetailModal(res.data, initialTab)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [location.search, clients, detailClient?.id, embeddedClientDetailId])

  const openCompanyDetailModal = (company: Company) => {
    setDetailCompany(company)
    setCompanyDetailEditField(null)
    setCompanyDetailMainTab('datoteke')
    setCompanyDetailDatotekeSubTab('splosno')
    setCompanyDetailEditDraft({
      name: company.name ?? '',
      address: company.address ?? '',
      postalCode: company.postalCode ?? '',
      city: company.city ?? '',
      vatId: company.vatId ?? '',
      iban: company.iban ?? '',
      email: company.email ?? '',
      telephone: company.telephone ?? '',
      batchPaymentEnabled: company.batchPaymentEnabled ?? false,
    })
    setCompanyFileSearch('')
  }

  const openGroupDetailModal = (group: ClientGroup) => {
    setDetailGroup(group)
    setGroupDetailEditField(null)
    setGroupDetailEditDraft({
      name: group.name ?? '',
      email: group.email ?? '',
      batchPaymentEnabled: group.batchPaymentEnabled ?? false,
      individualPaymentEnabled: group.individualPaymentEnabled ?? false,
      billingCompanyId: group.billingCompany?.id ?? null,
    })
    setGroupSessionTab('future')
    setGroupDetailMainTab('members')
    setGroupMemberSearch('')
    setGroupMemberDropdownOpen(false)
    setPendingGroupMemberIds([])
  }

  const closeGroupDetailModal = () => {
    setDetailGroup(null)
    setDetailGroupSessions([])
    setGroupDetailEditField(null)
    setGroupMemberSearch('')
    setGroupMemberDropdownOpen(false)
    setPendingGroupMemberIds([])
    if (embeddedGroupDetailMode) {
      onEmbeddedClose?.()
    } else if (new URLSearchParams(location.search).has('groupId')) {
      navigate('/clients', { replace: true })
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const groupId = embeddedGroupDetailId ?? Number(params.get('groupId'))
    if (!Number.isFinite(groupId) || groupId <= 0) return
    if (detailGroup?.id === groupId) return
    const existing = groups.find((group) => group.id === groupId)
    if (existing) {
      openGroupDetailModal(existing)
      return
    }
    let cancelled = false
    api
      .get<ClientGroup>(`/groups/${groupId}`)
      .then((res) => {
        if (!cancelled && res.data) openGroupDetailModal(res.data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [location.search, groups, detailGroup?.id, embeddedGroupDetailId])

  const saveDetailGroupInline = async () => {
    if (!detailGroup || savingGroupDetailEdit) return
    setSavingGroupDetailEdit(true)
    setGroupErrorMessage('')
    try {
      const payload = {
        name: groupDetailEditDraft.name.trim(),
        email: groupDetailEditDraft.email.trim() || null,
        billingCompanyId: groupDetailEditDraft.billingCompanyId,
        batchPaymentEnabled: groupDetailEditDraft.batchPaymentEnabled,
        individualPaymentEnabled: groupDetailEditDraft.individualPaymentEnabled,
      }
      const response = await api.put<ClientGroup>(`/groups/${detailGroup.id}`, payload)
      const updated = response.data
      setDetailGroup(updated)
      setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g))
      if (embeddedGroupDetailMode) await onEmbeddedSaved?.()
    } catch {
      setGroupErrorMessage('Failed to save group.')
    } finally {
      setSavingGroupDetailEdit(false)
    }
  }

  const togglePendingGroupMemberId = (clientId: number) => {
    if (addingMember) return
    setPendingGroupMemberIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    )
  }

  const handleAddGroupMembersBulk = async (clientIds: number[]) => {
    if (!detailGroup || addingMember) return
    const ids = Array.from(new Set(clientIds.filter((id) => Number.isFinite(id) && id > 0 && !detailGroupMemberIdSet.has(id))))
    if (ids.length === 0) return
    setAddingMember(true)
    try {
      let updated: ClientGroup | null = null
      for (const clientId of ids) {
        const response = await api.post<ClientGroup>(`/groups/${detailGroup.id}/members/${clientId}`)
        updated = response.data
      }
      if (updated) {
        setDetailGroup(updated)
        setGroups((prev) => prev.map((g) => g.id === updated!.id ? updated! : g))
        if (embeddedGroupDetailMode) await onEmbeddedSaved?.()
      }
      setPendingGroupMemberIds([])
      setGroupMemberSearch('')
      setGroupMemberDropdownOpen(true)
    } catch { /* ignore */ } finally {
      setAddingMember(false)
    }
  }

  const handleRemoveGroupMember = async (clientId: number) => {
    if (!detailGroup || removingMemberId) return
    setRemovingMemberId(clientId)
    try {
      const response = await api.delete<ClientGroup>(`/groups/${detailGroup.id}/members/${clientId}`)
      const updated = response.data
      setDetailGroup(updated)
      setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g))
      if (embeddedGroupDetailMode) await onEmbeddedSaved?.()
    } catch { /* ignore */ } finally {
      setRemovingMemberId(null)
    }
  }

  const handleCreateGroup = async () => {
    if (savingGroup) return
    setSavingGroup(true)
    setGroupErrorMessage('')
    try {
      await api.post('/groups', { name: groupForm.name.trim(), email: groupForm.email.trim() || null })
      setShowGroupModal(false)
      setGroupForm({ name: '', email: '' })
      loadGroups()
    } catch {
      setGroupErrorMessage('Failed to create group.')
    } finally {
      setSavingGroup(false)
    }
  }

  const toggleGroupActiveById = async (groupId: number, currentlyActive: boolean) => {
    setActivatingGroupId(groupId)
    setGroupErrorMessage('')
    try {
      const action = currentlyActive ? 'deactivate' : 'activate'
      const response = await api.patch<ClientGroup>(`/groups/${groupId}/${action}`)
      const updated = response.data
      if (detailGroup?.id === groupId) setDetailGroup(updated)
      setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
      if (embeddedGroupDetailMode) await onEmbeddedSaved?.()
      setOpenGroupMenuId(null)
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setGroupErrorMessage(backendMessage || 'Failed to update group status.')
    } finally {
      setActivatingGroupId(null)
    }
  }

  const deleteGroupById = async (groupId: number) => {
    if (!window.confirm(clientsCopy.confirmDeleteGroup)) return
    setDeletingGroupId(groupId)
    setGroupErrorMessage('')
    try {
      await api.delete(`/groups/${groupId}`)
      if (detailGroup?.id === groupId) closeGroupDetailModal()
      await loadGroups()
      setOpenGroupMenuId(null)
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setGroupErrorMessage(backendMessage || 'Failed to delete group.')
    } finally {
      setDeletingGroupId(null)
    }
  }

  const closeDetailModal = () => {
    setDetailClient(null)
    setDetailSessions([])
    setDetailClientFiles([])
    setDetailSessionsError('')
    setDetailClientFilesError('')
    setDetailEditField(null)
    setHighlightedEntitlementId(null)
    setClientFileSearch('')
    setWalletFilter('all')
    setWalletPurchaseDrawerOpen(false)
    setWalletProductSearch('')
    setWalletPurchaseError('')
    if (embeddedClientDetailMode) {
      onEmbeddedClose?.()
    } else if (new URLSearchParams(location.search).has('clientId')) {
      navigate('/clients', { replace: true })
    }
    clientFilesDropDepth.current = 0
    setClientFilesDropActive(false)
  }

  const saveDetailClientInline = async () => {
    if (!detailClient || savingDetailEdit) return
    setSavingDetailEdit(true)
    setErrorMessage('')
    try {
      const payload = {
        firstName: detailEditDraft.firstName.trim(),
        lastName: detailEditDraft.lastName.trim(),
        email: detailEditDraft.email.trim() || null,
        phone: detailEditDraft.phone.trim() || null,
        whatsappOptIn: detailEditDraft.whatsappOptIn,
        billingCompanyId: detailEditDraft.billingCompanyId,
        batchPaymentEnabled: detailEditDraft.batchPaymentEnabled ?? false,
        ...(isAdmin ? { assignedToId: detailEditDraft.assignedToId ?? null } : {}),
      }
      const response = await api.put<Client>(`/clients/${detailClient.id}`, payload)
      setDetailClient(response.data)
      if (embeddedClientDetailMode) await onEmbeddedSaved?.()
      setDetailEditDraft({
        firstName: response.data.firstName ?? '',
        lastName: response.data.lastName ?? '',
        email: response.data.email ?? '',
        phone: response.data.phone ?? '',
        whatsappOptIn: response.data.whatsappOptIn ?? false,
        batchPaymentEnabled: response.data.batchPaymentEnabled ?? false,
        billingCompanyId: response.data.billingCompany?.id ?? null,
        assignedToId: response.data.assignedTo?.id ?? null,
      })
      setClients((prev) => prev.map((c) => (c.id === response.data.id ? response.data : c)))
      setDetailEditField(null)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to save client.')
    } finally {
      setSavingDetailEdit(false)
    }
  }

  const saveDetailCompanyInline = async () => {
    if (!detailCompany || savingCompanyDetailEdit) return
    setSavingCompanyDetailEdit(true)
    setCompanyErrorMessage('')
    try {
      const payload = {
        name: companyDetailEditDraft.name.trim(),
        address: companyDetailEditDraft.address.trim() || null,
        postalCode: companyDetailEditDraft.postalCode.trim() || null,
        city: companyDetailEditDraft.city.trim() || null,
        vatId: companyDetailEditDraft.vatId.trim() || null,
        iban: companyDetailEditDraft.iban.trim() || null,
        email: companyDetailEditDraft.email.trim() || null,
        telephone: companyDetailEditDraft.telephone.trim() || null,
        batchPaymentEnabled: companyDetailEditDraft.batchPaymentEnabled ?? false,
      }
      const response = await api.put<Company>(`/companies/${detailCompany.id}`, payload)
      setDetailCompany(response.data)
      setCompanyDetailEditDraft({
        name: response.data.name ?? '',
        address: response.data.address ?? '',
        postalCode: response.data.postalCode ?? '',
        city: response.data.city ?? '',
        vatId: response.data.vatId ?? '',
        iban: response.data.iban ?? '',
        email: response.data.email ?? '',
        telephone: response.data.telephone ?? '',
        batchPaymentEnabled: response.data.batchPaymentEnabled ?? false,
      })
      setCompanies((prev) => prev.map((c) => (c.id === response.data.id ? response.data : c)))
      setCompanyDetailEditField(null)
    } catch (error: any) {
      setCompanyErrorMessage(error?.response?.data?.message || 'Failed to save company.')
    } finally {
      setSavingCompanyDetailEdit(false)
    }
  }

  const closeCompanyDetailModal = () => {
    setDetailCompany(null)
    setCompanyBills([])
    setDetailCompanyFiles([])
    setDetailCompanyError('')
    setDetailCompanyFilesError('')
    setCompanyDetailEditField(null)
    setCompanyFileSearch('')
    companyFilesDropDepth.current = 0
    setCompanyFilesDropActive(false)
  }

  const renderClientEditableField = (
    key: 'firstName' | 'lastName' | 'email' | 'phone' | 'billingCompanyId' | 'assignedToId',
    label: string,
    wide = false,
  ) => {
    if (key === 'assignedToId' && !isAdmin) return null
    const isEditing = detailEditField === key
    return (
      <div
        className={`clients-detail-field-card${wide ? ' clients-detail-field-card--wide' : ''}${isEditing ? ' clients-detail-field-card--editing' : ''}`}
        onClick={() => {
          if (detailEditField !== key) setDetailEditField(key)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          // Do not preventDefault while editing — space would be swallowed in the input.
          if (detailEditField === key) return
          e.preventDefault()
          setDetailEditField(key)
        }}
      >
        <span>{label}</span>
        {!isEditing ? (
          <strong>
            {key === 'billingCompanyId'
              ? (detailClient?.billingCompany?.name || '—')
              : key === 'assignedToId'
                ? (detailClient?.assignedTo
                  ? `${fullName(detailClient.assignedTo)} (${detailClient.assignedTo.email})`
                  : clientsCopy.unassignedConsultant)
                : ((detailClient?.[key as 'firstName' | 'lastName' | 'email' | 'phone'] as string | undefined) || '—')}
          </strong>
        ) : (
          <div className="clients-detail-inline-edit" onClick={(e) => e.stopPropagation()}>
            {key === 'billingCompanyId' ? (
              <select
                autoFocus
                value={detailEditDraft.billingCompanyId ?? ''}
                onChange={(e) => setDetailEditDraft({ ...detailEditDraft, billingCompanyId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{clientsCopy.noLinkedCompany}</option>
                {companiesForClientBillingSelect.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            ) : key === 'assignedToId' ? (
              <select
                autoFocus
                value={detailEditDraft.assignedToId ?? ''}
                onChange={(e) =>
                  setDetailEditDraft({
                    ...detailEditDraft,
                    assignedToId: e.target.value ? Number(e.target.value) : null,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void saveDetailClientInline()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setDetailEditField(null)
                  }
                }}
              >
                <option value="">{clientsCopy.unassignedConsultant}</option>
                {consultants.map((u) => (
                  <option key={u.id} value={u.id}>{fullName(u)} ({u.email})</option>
                ))}
              </select>
            ) : (
              <input
                autoFocus
                value={detailEditDraft[key as 'firstName' | 'lastName' | 'email' | 'phone'] ?? ''}
                onChange={(e) => setDetailEditDraft({ ...detailEditDraft, [key]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void saveDetailClientInline()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setDetailEditField(null)
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  const renderCompanyEditableField = (
    key: 'name' | 'address' | 'postalCode' | 'city' | 'vatId' | 'email' | 'telephone',
    label: string,
    wide = false,
  ) => {
    const isEditing = companyDetailEditField === key
    const value = companyDetailEditDraft[key] ?? ''
    return (
      <div
        className={`clients-detail-field-card${wide ? ' clients-detail-field-card--wide' : ''}${isEditing ? ' clients-detail-field-card--editing' : ''}`}
        onClick={() => {
          if (companyDetailEditField !== key) setCompanyDetailEditField(key)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          if (companyDetailEditField === key) return
          e.preventDefault()
          setCompanyDetailEditField(key)
        }}
      >
        <span>{label}</span>
        {!isEditing ? (
          <strong>{(detailCompany?.[key] as string | undefined) || '—'}</strong>
        ) : (
          <div className="clients-detail-inline-edit" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={value}
              onChange={(e) => setCompanyDetailEditDraft({ ...companyDetailEditDraft, [key]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void saveDetailCompanyInline()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setCompanyDetailEditField(null)
                }
              }}
            />
          </div>
        )}
      </div>
    )
  }

  const renderNewClientEditableField = (
    key: 'firstName' | 'lastName' | 'email' | 'phone',
    label: string,
    wide = false,
    inputType: 'text' | 'email' = 'text',
  ) => {
    const isEditing = newClientEditField === key
    return (
      <div
        className={`clients-detail-field-card${wide ? ' clients-detail-field-card--wide' : ''}${isEditing ? ' clients-detail-field-card--editing' : ''}`}
        onClick={() => {
          if (newClientEditField !== key) setNewClientEditField(key)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          if (newClientEditField === key) return
          e.preventDefault()
          setNewClientEditField(key)
        }}
      >
        <span>{label}</span>
        {!isEditing ? (
          <strong>{(form[key] ?? '').trim() || '—'}</strong>
        ) : (
          <div className="clients-detail-inline-edit" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              type={inputType}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (key === 'firstName') setNewClientEditField('lastName')
                  else if (key === 'lastName') setNewClientEditField('email')
                  else if (key === 'email') setNewClientEditField('phone')
                  else setNewClientEditField(null)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setNewClientEditField(null)
                }
              }}
            />
          </div>
        )}
      </div>
    )
  }

  const renderGroupEditableField = (
    key: 'name' | 'email' | 'billingCompanyId',
    label: string,
    wide = false,
  ) => {
    const isEditing = groupDetailEditField === key
    return (
      <div
        className={`clients-detail-field-card${wide ? ' clients-detail-field-card--wide' : ''}${isEditing ? ' clients-detail-field-card--editing' : ''}`}
        onClick={() => { if (groupDetailEditField !== key) setGroupDetailEditField(key) }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          if (groupDetailEditField === key) return
          e.preventDefault()
          setGroupDetailEditField(key)
        }}
      >
        <span>{label}</span>
        {!isEditing ? (
          <strong>
            {key === 'billingCompanyId'
              ? (detailGroup?.billingCompany?.name || '—')
              : ((detailGroup?.[key as 'name' | 'email'] as string | undefined) || '—')}
          </strong>
        ) : (
          <div className="clients-detail-inline-edit" onClick={(e) => e.stopPropagation()}>
            {key === 'billingCompanyId' ? (
              <select
                autoFocus
                value={groupDetailEditDraft.billingCompanyId ?? ''}
                onChange={(e) => setGroupDetailEditDraft({ ...groupDetailEditDraft, billingCompanyId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{clientsCopy.noLinkedCompany}</option>
                {companiesForGroupBillingSelect.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            ) : (
              <input
                autoFocus
                value={(groupDetailEditDraft[key as 'name' | 'email'] as string) ?? ''}
                onChange={(e) => setGroupDetailEditDraft({ ...groupDetailEditDraft, [key]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void saveDetailGroupInline()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setGroupDetailEditField(null)
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  const closeModal = () => {
    setShowModal(false)
    setForm(emptyClientForm)
    setNewClientEditField('firstName')
    setErrorMessage('')
  }

  const anonymizeClientById = async (clientId: number) => {
    const row = clients.find((x) => x.id === clientId)
    if (row?.anonymized) return
    setErrorMessage('')
    setAnonymizingClientId(clientId)
    try {
      const response = await api.post<Client>(`/clients/${clientId}/anonymize`)
      const updated = response.data
      if (detailClient?.id === clientId) {
        setDetailClient(updated)
        setDetailEditDraft({
          firstName: updated.firstName ?? '',
          lastName: updated.lastName ?? '',
          email: updated.email ?? '',
          phone: updated.phone ?? '',
          whatsappOptIn: updated.whatsappOptIn ?? false,
          batchPaymentEnabled: updated.batchPaymentEnabled ?? false,
          billingCompanyId: updated.billingCompany?.id ?? null,
          assignedToId: updated.assignedTo?.id ?? null,
        })
      }
      await loadClients()
      setOpenClientMenuId(null)
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || 'Failed to anonymize client.')
    } finally {
      setAnonymizingClientId(null)
    }
  }

  const deleteClientById = async (clientId: number) => {
    if (!window.confirm(clientsCopy.confirmDeleteClient)) return
    setDeletingClientId(clientId)
    setErrorMessage('')
    try {
      await api.delete(`/clients/${clientId}`)
      if (detailClient?.id === clientId) closeDetailModal()
      await loadClients()
      setOpenClientMenuId(null)
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || 'Failed to delete client.')
    } finally {
      setDeletingClientId(null)
    }
  }

  const toggleClientActiveById = async (clientId: number, currentlyActive: boolean) => {
    setActivatingClientId(clientId)
    setErrorMessage('')
    try {
      const action = currentlyActive ? 'deactivate' : 'activate'
      const response = await api.patch<Client>(`/clients/${clientId}/${action}`)
      const updated = response.data
      if (detailClient?.id === clientId) setDetailClient(updated)
      await loadClients()
      window.dispatchEvent(new CustomEvent('clients-updated'))
      setOpenClientMenuId(null)
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || 'Failed to update client status.')
    } finally {
      setActivatingClientId(null)
    }
  }

  const openNewCompanyModal = () => {
    setCompanyForm(emptyCompanyForm)
    setCompanyErrorMessage('')
    setShowCompanyModal(true)
  }

  const closeCompanyModal = () => {
    setShowCompanyModal(false)
    setCompanyForm(emptyCompanyForm)
    setCompanyErrorMessage('')
  }

  /**
   * Close only when the press starts on the dimmed overlay, not when a click is synthesized after
   * text selection (mousedown in the form, mouseup on the backdrop). Matches SessionTypes transaction services modals.
   */
  const onSidePanelBackdropMouseDown = (close: () => void) => (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setErrorMessage('')
    setSaving(true)

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        preferredSlots: [],
      }
      await api.post('/clients', payload)

      closeModal()
      await loadClients()
    } catch (error: any) {
      const status = error?.response?.status
      const backendMessage = error?.response?.data?.message
      if (status === 400) setErrorMessage(backendMessage || 'Please check the entered fields.');
      else if (status === 403) setErrorMessage('You are not allowed to create clients. Please log in again.');
      else setErrorMessage('Failed to create client.');
    } finally {
      setSaving(false)
    }
  }

  async function submitCompanyForm(event: React.FormEvent) {
    event.preventDefault()
    setSavingCompany(true)
    setCompanyErrorMessage('')
    try {
      const payload = {
        name: companyForm.name.trim(),
        address: companyForm.address.trim() || null,
        postalCode: companyForm.postalCode.trim() || null,
        city: companyForm.city.trim() || null,
        vatId: companyForm.vatId.trim() || null,
        iban: companyForm.iban.trim() || null,
        email: companyForm.email.trim() || null,
        telephone: companyForm.telephone.trim() || null,
      }
      await api.post('/companies', payload)
      closeCompanyModal()
      await loadCompanies()
      await loadClients()
    } catch (error: any) {
      setCompanyErrorMessage(error?.response?.data?.message || 'Failed to save company.')
    } finally {
      setSavingCompany(false)
    }
  }

  const toggleCompanyActiveById = async (companyId: number, currentlyActive: boolean) => {
    setActivatingCompanyId(companyId)
    setCompanyErrorMessage('')
    try {
      const action = currentlyActive ? 'deactivate' : 'activate'
      const response = await api.patch<Company>(`/companies/${companyId}/${action}`)
      const updated = response.data
      if (detailCompany?.id === companyId) setDetailCompany(updated)
      await loadCompanies()
      await loadClients()
      setOpenCompanyMenuId(null)
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setCompanyErrorMessage(backendMessage || 'Failed to update company status.')
    } finally {
      setActivatingCompanyId(null)
    }
  }

  const deleteCompanyById = async (companyId: number) => {
    if (!window.confirm(clientsCopy.confirmDeleteCompany)) return
    setDeletingCompanyId(companyId)
    setCompanyErrorMessage('')
    try {
      await api.delete(`/companies/${companyId}`)
      if (detailCompany?.id === companyId) closeCompanyDetailModal()
      await loadCompanies()
      await loadClients()
      setOpenCompanyMenuId(null)
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setCompanyErrorMessage(backendMessage || 'Failed to delete company.')
    } finally {
      setDeletingCompanyId(null)
    }
  }

  const pickFile = (handler: (file: File) => void, options?: { accept?: string }) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (options?.accept) input.accept = options.accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) handler(file)
    }
    input.click()
  }

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  const uploadClientFile = async (file: File) => {
    if (!detailClient || uploadingClientFile) return
    const validationError = validateClientStoredFile(file, clientsCopy)
    if (validationError) {
      setDetailClientFilesError(validationError)
      return
    }
    setUploadingClientFile(true)
    setDetailClientFilesError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await api.post<StoredFile>(`/clients/${detailClient.id}/files`, body)
      setDetailClientFiles((prev) => [response.data, ...prev])
    } catch (error: any) {
      setDetailClientFilesError(error?.response?.data?.message || (locale === 'sl' ? 'Nalaganje datoteke ni uspelo.' : 'Failed to upload file.'))
    } finally {
      setUploadingClientFile(false)
    }
  }

  const uploadCompanyFile = async (file: File) => {
    if (!detailCompany || uploadingCompanyFile) return
    if (file.size > MAX_CLIENT_OR_COMPANY_FILE_BYTES) {
      setDetailCompanyFilesError(clientsCopy.fileTooLarge)
      return
    }
    setUploadingCompanyFile(true)
    setDetailCompanyFilesError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await api.post<StoredFile>(`/companies/${detailCompany.id}/files`, body)
      setDetailCompanyFiles((prev) => [response.data, ...prev])
    } catch (error: any) {
      setDetailCompanyFilesError(error?.response?.data?.message || (locale === 'sl' ? 'Nalaganje datoteke ni uspelo.' : 'Failed to upload file.'))
    } finally {
      setUploadingCompanyFile(false)
    }
  }

  const hasFilesInDataTransfer = (dt: DataTransfer | null) =>
    !!dt && [...dt.types].includes('Files')

  const handleClientFilesDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFilesInDataTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    clientFilesDropDepth.current += 1
    setClientFilesDropActive(true)
  }

  const handleClientFilesDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    clientFilesDropDepth.current = Math.max(0, clientFilesDropDepth.current - 1)
    if (clientFilesDropDepth.current === 0) setClientFilesDropActive(false)
  }

  const handleClientFilesDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFilesInDataTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleClientFilesDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    clientFilesDropDepth.current = 0
    setClientFilesDropActive(false)
    const { files } = e.dataTransfer
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (!file.size) continue
      await uploadClientFile(file)
    }
  }

  const handleCompanyFilesDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFilesInDataTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    companyFilesDropDepth.current += 1
    setCompanyFilesDropActive(true)
  }

  const handleCompanyFilesDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    companyFilesDropDepth.current = Math.max(0, companyFilesDropDepth.current - 1)
    if (companyFilesDropDepth.current === 0) setCompanyFilesDropActive(false)
  }

  const handleCompanyFilesDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFilesInDataTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleCompanyFilesDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    companyFilesDropDepth.current = 0
    setCompanyFilesDropActive(false)
    const { files } = e.dataTransfer
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (!file.size) continue
      await uploadCompanyFile(file)
    }
  }

  const downloadClientFile = async (file: StoredFile) => {
    if (!detailClient) return
    const response = await api.get(`/clients/${detailClient.id}/files/${file.id}`, { responseType: 'blob' })
    downloadBlob(new Blob([response.data], { type: file.contentType || 'application/octet-stream' }), file.fileName || `client-file-${file.id}`)
  }

  const downloadCompanyFile = async (file: StoredFile) => {
    if (!detailCompany) return
    const response = await api.get(`/companies/${detailCompany.id}/files/${file.id}`, { responseType: 'blob' })
    downloadBlob(new Blob([response.data], { type: file.contentType || 'application/octet-stream' }), file.fileName || `company-file-${file.id}`)
  }

  const removeClientFile = async (file: StoredFile) => {
    if (!detailClient || deletingClientFileId != null) return
    if (!window.confirm(clientsCopy.deleteFileConfirm)) return
    setDeletingClientFileId(file.id)
    setDetailClientFilesError('')
    try {
      await api.delete(`/clients/${detailClient.id}/files/${file.id}`)
      setDetailClientFiles((prev) => prev.filter((row) => row.id !== file.id))
    } catch (error: any) {
      setDetailClientFilesError(error?.response?.data?.message || (locale === 'sl' ? 'Odstranjevanje datoteke ni uspelo.' : 'Failed to remove file.'))
    } finally {
      setDeletingClientFileId(null)
    }
  }

  const removeCompanyFile = async (file: StoredFile) => {
    if (!detailCompany || deletingCompanyFileId != null) return
    if (!window.confirm(clientsCopy.deleteFileConfirm)) return
    setDeletingCompanyFileId(file.id)
    setDetailCompanyFilesError('')
    try {
      await api.delete(`/companies/${detailCompany.id}/files/${file.id}`)
      setDetailCompanyFiles((prev) => prev.filter((row) => row.id !== file.id))
    } catch (error: any) {
      setDetailCompanyFilesError(error?.response?.data?.message || (locale === 'sl' ? 'Odstranjevanje datoteke ni uspelo.' : 'Failed to remove file.'))
    } finally {
      setDeletingCompanyFileId(null)
    }
  }

  const renderClientRowOverflowMenu = (c: Client) => (
    <div className="clients-row-actions-inline" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="secondary clients-row-action-btn clients-row-action-btn--danger"
        onClick={(e) => {
          e.stopPropagation()
          void deleteClientById(c.id)
        }}
        disabled={deletingClientId === c.id || anonymizingClientId === c.id || activatingClientId === c.id || c.removalBlocked}
        title={c.removalBlocked ? clientsCopy.removalBlockedHint : clientsCopy.delete}
        aria-label={clientsCopy.delete}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
        <span className="clients-row-action-btn__label">{clientsCopy.delete}</span>
      </button>
      {!c.anonymized ? (
        <button
          type="button"
          className="secondary clients-row-action-btn clients-row-action-btn--danger"
          onClick={(e) => {
            e.stopPropagation()
            setAnonymizeConfirmClientId(c.id)
          }}
          disabled={anonymizingClientId === c.id || activatingClientId === c.id || deletingClientId === c.id}
          title={clientsCopy.anonymize}
          aria-label={clientsCopy.anonymize}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 19c0-3.2 2.7-5.8 6-5.8s6 2.6 6 5.8" />
            <path d="M17 9.25a2.25 2.25 0 1 1 4.5 0c0 1.28-.9 1.86-1.72 2.36-.64.4-1.03.67-1.03 1.22" />
            <path d="M18.75 17h.01" />
          </svg>
          <span className="clients-row-action-btn__label">{clientsCopy.anonymize}</span>
        </button>
      ) : null}
    </div>
  )

  const renderCompanyRowOverflowMenu = (c: Company) => (
    <div className="clients-row-actions-inline" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="secondary clients-row-action-btn clients-row-action-btn--danger"
        onClick={(e) => {
          e.stopPropagation()
          void deleteCompanyById(c.id)
        }}
        disabled={deletingCompanyId === c.id || activatingCompanyId === c.id}
        title={clientsCopy.delete}
        aria-label={clientsCopy.delete}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
        <span className="clients-row-action-btn__label">{clientsCopy.delete}</span>
      </button>
    </div>
  )

  const renderGroupRowOverflowMenu = (g: ClientGroup) => (
    <div className="clients-row-actions-inline" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="secondary clients-row-action-btn clients-row-action-btn--danger"
        onClick={(e) => {
          e.stopPropagation()
          void deleteGroupById(g.id)
        }}
        disabled={deletingGroupId === g.id || activatingGroupId === g.id}
        title={clientsCopy.delete}
        aria-label={clientsCopy.delete}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
        <span className="clients-row-action-btn__label">{clientsCopy.delete}</span>
      </button>
    </div>
  )

  const downloadBillPdf = async (billId: number, billNumber?: string) => {
    const res = await api.get(`/billing/bills/${billId}/pdf`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${billNumber || `bill-${billId}`}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  const portalClientMenuTarget =
    openClientMenuId != null ? clients.find((r) => r.id === openClientMenuId) ?? null : null
  const portalCompanyMenuTarget =
    openCompanyMenuId != null ? companies.find((r) => r.id === openCompanyMenuId) ?? null : null
  const portalGroupMenuTarget =
    openGroupMenuId != null ? groups.find((r) => r.id === openGroupMenuId) ?? null : null

  useEffect(() => {
    if (anonymizeConfirmClientId == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAnonymizeConfirmClientId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anonymizeConfirmClientId])

  const currentSearchPlaceholder = entityTab === 'clients'
    ? clientsCopy.searchClientsPlaceholder
    : entityTab === 'companies'
      ? clientsCopy.searchCompaniesPlaceholder
      : clientsCopy.searchGroupsPlaceholder
  const currentCountLabel = entityTab === 'clients'
    ? clientsCopy.listClientsCount(filteredClients.length)
    : entityTab === 'companies'
      ? clientsCopy.listCompaniesCount(filteredCompanies.length)
      : clientsCopy.listGroupsCount(filteredGroups.length)
  const currentCreateLabel = locale === 'sl'
    ? entityTab === 'clients'
      ? 'Nova stranka'
      : entityTab === 'companies'
        ? 'Novo podjetje'
        : 'Nova skupina'
    : entityTab === 'clients'
      ? 'New client'
      : entityTab === 'companies'
        ? 'New company'
        : 'New group'
  const statusHeader = locale === 'sl' ? 'Status' : 'Status'
  const actionsHeader = locale === 'sl' ? 'Akcije' : 'Actions'
  const clientNameHeader = locale === 'sl' ? 'Ime stranke' : 'Client name'
  const companyIdHeader = locale === 'sl' ? 'Davčna številka / ID' : 'Tax ID / ID'
  const groupMembersHeader = locale === 'sl' ? 'Št. članov' : 'Members'
  const groupDescriptionHeader = locale === 'sl' ? 'Opis' : 'Description'
  const assignedOwnerHeader = locale === 'sl' ? 'Dodeljen skrbnik' : 'Assigned owner'
  const activeStatusLabel = locale === 'sl' ? 'Aktivna' : 'Active'
  const inactiveStatusLabel = clientsCopy.inactive
  const tableEmptyLoadingText = locale === 'sl' ? 'Nalagam…' : 'Loading…'
  const createCurrentEntity = () => {
    if (entityTab === 'clients') return openNewModal()
    if (entityTab === 'companies') return openNewCompanyModal()
    setGroupForm({ name: '', email: '' })
    setGroupErrorMessage('')
    setShowGroupModal(true)
  }

  return (
    <div className={`stack gap-lg clients-modern-page${isClientsMobile ? ' clients-modern-page--mobile' : ''}${embeddedDetailMode ? ' clients-modern-page--embedded-detail' : ''}`}>
      {!embeddedDetailMode && (
      <Card className={`clients-modern-card${isClientsMobile ? ' clients-mobile-shell' : ''}`}>
        <div className={`clients-page-header${isClientsMobile ? ' clients-page-header--sticky-mobile' : ''}`}>
          <div className="clients-page-header__entity clients-entity-tabs-shell">
            <div className="clients-session-tabs clients-entity-tabs" style={{ marginBottom: 0 }} role="tablist" aria-label={locale === 'sl' ? 'Zavihki upravljanja podatkov' : 'Data management tabs'}>
              <button type="button" role="tab" aria-selected={entityTab === 'clients'} className={entityTab === 'clients' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setEntityTab('clients')}>
                <ClientsModernIcon name="clients" />
                <span>{t('clientsTabClients')}</span>
              </button>
              <button type="button" role="tab" aria-selected={entityTab === 'companies'} className={entityTab === 'companies' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setEntityTab('companies')}>
                <ClientsModernIcon name="companies" />
                <span>{t('clientsTabCompanies')}</span>
              </button>
              {groupBookingEnabled && (
                <button type="button" role="tab" aria-selected={entityTab === 'groups'} className={entityTab === 'groups' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setEntityTab('groups')}>
                  <ClientsModernIcon name="groups" />
                  <span>{clientsCopy.groupsTab}</span>
                </button>
              )}
            </div>
          </div>

          <div className="clients-toolbar clients-modern-toolbar">
            <div className="clients-search-wrap">
              <ClientsModernIcon name="search" />
              {entityTab === 'clients' && (
                <input
                  className="clients-search-input"
                  placeholder={currentSearchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
              {entityTab === 'companies' && (
                <input
                  className="clients-search-input"
                  placeholder={currentSearchPlaceholder}
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                />
              )}
              {entityTab === 'groups' && groupBookingEnabled && (
                <input
                  className="clients-search-input"
                  placeholder={currentSearchPlaceholder}
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                />
              )}
            </div>
            <div className="clients-toolbar-actions">
              <div className="clients-session-tabs clients-filter-tabs" style={{ marginBottom: 0 }}>
                {entityTab === 'clients' && (
                  <button
                    type="button"
                    className="clients-session-tab active"
                    onClick={() => setActiveFilter((prev) => (prev === 'active' ? 'inactive' : 'active'))}
                  >
                    <span className={activeFilter === 'active' ? 'clients-filter-dot clients-filter-dot--active' : 'clients-filter-dot clients-filter-dot--inactive'} />
                    {activeFilter === 'active' ? clientsCopy.activeFilter : clientsCopy.inactive}
                  </button>
                )}
                {entityTab === 'companies' && (
                  <button
                    type="button"
                    className="clients-session-tab active"
                    onClick={() => setCompanyActiveFilter((prev) => (prev === 'active' ? 'inactive' : 'active'))}
                  >
                    <span className={companyActiveFilter === 'active' ? 'clients-filter-dot clients-filter-dot--active' : 'clients-filter-dot clients-filter-dot--inactive'} />
                    {companyActiveFilter === 'active' ? clientsCopy.activeFilter : clientsCopy.inactive}
                  </button>
                )}
                {entityTab === 'groups' && groupBookingEnabled && (
                  <button
                    type="button"
                    className="clients-session-tab active"
                    onClick={() => setGroupActiveFilter((prev) => (prev === 'active' ? 'inactive' : 'active'))}
                  >
                    <span className={groupActiveFilter === 'active' ? 'clients-filter-dot clients-filter-dot--active' : 'clients-filter-dot clients-filter-dot--inactive'} />
                    {groupActiveFilter === 'active' ? clientsCopy.activeFilter : clientsCopy.inactive}
                  </button>
                )}
              </div>
              <div className={`clients-count-chip${isClientsMobile ? ' clients-count-chip--mobile-open' : ''}`}>{currentCountLabel}</div>
              <button type="button" className="clients-modern-new-btn" onClick={createCurrentEntity}>
                <ClientsModernIcon name="plus" />
                <span>{isClientsMobile ? clientsCopy.newButtonMobile : currentCreateLabel}</span>
              </button>
            </div>
          </div>
        </div>

        {entityTab === 'clients' ? (
          <>
            {errorMessage && !showModal && <div className="error">{errorMessage}</div>}
            {loading ? (
              <div className="muted clients-modern-state">{tableEmptyLoadingText}</div>
            ) : filteredClients.length === 0 ? (
              <EmptyState title={clientsCopy.emptyClientsTitle} text={clientsCopy.emptyClientsText} />
            ) : (
              <div className="clients-list-shell">
                <div className="clients-mobile-list">
                  {filteredClients.map((c) => (
                    <article key={c.id} className="clients-mobile-card" onClick={() => openDetailModal(c)}>
                      <div className="clients-mobile-card-head">
                        <div className="clients-name-cell">
                          <span className="clients-name-avatar" aria-hidden>{initials(c.firstName, c.lastName)}</span>
                          <div className="clients-name-stack">
                            <span className="clients-name">
                              {fullName(c)}
                              {c.guestAppLinked ? (
                                <span className="clients-guest-app-badge" aria-label={clientsCopy.guestAppBadge}>
                                  {clientsCopy.guestAppBadge}
                                </span>
                              ) : null}
                              {c.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}
                            </span>
                            <span className="clients-id">ID #{c.id}{isAdmin ? clientsCopy.assignedToLine(c.assignedTo ? fullName(c.assignedTo) : clientsCopy.unassignedConsultant) : ''}</span>
                          </div>
                        </div>
                        <ClientsMobileCardActionIcon kind="client" />
                      </div>
                      <div className="clients-mobile-meta">
                        <div><span>{clientsCopy.email}</span><strong>{c.email?.trim() ? <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.email.trim()}</a> : '—'}</strong></div>
                        <div><span>{clientsCopy.phone}</span><strong>{c.phone?.trim() ? <a href={contactTelHref(c.phone)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.phone.trim()}</a> : '—'}</strong></div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                  <table className="clients-table">
                    <thead>
                      <tr>
                        <th>{clientNameHeader}</th>
                        <th>{clientsCopy.email}</th>
                        <th>{clientsCopy.tableHeaderPhone}</th>
                        {isAdmin && <th>{assignedOwnerHeader}</th>}
                        <th>{statusHeader}</th>
                        <th>{clientsCopy.tableHeaderCreated}</th>
                        <th>{actionsHeader}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.map((c) => (
                        <tr key={c.id} className="clients-row" onClick={() => openDetailModal(c)}>
                          <td>
                            <div className="clients-name-cell">
                              <span className="clients-name-avatar" aria-hidden>{initials(c.firstName, c.lastName)}</span>
                              <div className="clients-name-stack">
                                <span className="clients-name">
                                  {fullName(c)}
                                  {c.guestAppLinked ? (
                                    <span className="clients-guest-app-badge" aria-label={clientsCopy.guestAppBadge}>
                                      {clientsCopy.guestAppBadge}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="clients-id">ID #{c.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="clients-muted">{c.email?.trim() ? <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.email.trim()}</a> : '—'}</td>
                          <td className="clients-muted">{c.phone?.trim() ? <a href={contactTelHref(c.phone)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.phone.trim()}</a> : '—'}</td>
                          {isAdmin && <td className="clients-muted">{c.assignedTo ? <span className="clients-owner-chip"><span className="clients-owner-avatar">{c.assignedTo.avatarPath ? <img className="clients-owner-avatar-image" src={c.assignedTo.avatarPath} alt="" /> : initials(c.assignedTo.firstName, c.assignedTo.lastName)}</span>{fullName(c.assignedTo)}</span> : clientsCopy.unassignedConsultant}</td>}
                          <td>
                            <button
                              type="button"
                              className={`clients-status-pill clients-status-pill-btn${c.active === false ? ' clients-status-pill--inactive' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                void toggleClientActiveById(c.id, c.active !== false)
                              }}
                              disabled={
                                activatingClientId === c.id ||
                                anonymizingClientId === c.id ||
                                (c.active !== false && c.removalBlocked)
                              }
                              title={c.active !== false && c.removalBlocked ? clientsCopy.removalBlockedHint : undefined}
                            >
                              <span />
                              {c.active === false ? inactiveStatusLabel : activeStatusLabel}
                            </button>
                          </td>
                          <td className="clients-muted">{formatDate(c.createdAt)}</td>
                          <td className="clients-actions"><div className="clients-actions-inner">{renderClientRowOverflowMenu(c)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="clients-modern-table-footer">
                  <span>{locale === 'sl' ? `Prikazujem 1–${filteredClients.length} od ${filteredClients.length} ${slovenianStrankaCountForm(filteredClients.length)}` : `Showing 1–${filteredClients.length} of ${filteredClients.length} clients`}</span>
                  <div className="clients-modern-pagination" aria-hidden="true"><button type="button" className="secondary">‹</button><span>1</span><button type="button" className="secondary">›</button></div>
                </div>
              </div>
            )}
          </>
        ) : entityTab === 'companies' ? (
          <>
            {companyErrorMessage && !showCompanyModal && <div className="error">{companyErrorMessage}</div>}
            {loadingCompanies ? (
              <div className="muted clients-modern-state">{tableEmptyLoadingText}</div>
            ) : filteredCompanies.length === 0 ? (
              <EmptyState title={clientsCopy.emptyCompaniesTitle} text={clientsCopy.emptyCompaniesText} />
            ) : (
              <div className="clients-list-shell">
                <div className="clients-mobile-list">
                  {filteredCompanies.map((c) => (
                    <article key={c.id} className="clients-mobile-card" onClick={() => openCompanyDetailModal(c)}>
                      <div className="clients-mobile-card-head">
                        <div className="clients-name-cell">
                          <span className="clients-name-avatar clients-name-avatar--company" aria-hidden>{(c.name?.[0] || 'C').toUpperCase()}</span>
                          <div className="clients-name-stack">
                            <span className="clients-name">{c.name}{c.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                            <span className="clients-id">ID #{c.id} · {clientsCopy.vatId} {c.vatId || '—'}</span>
                          </div>
                        </div>
                        <ClientsMobileCardActionIcon kind="company" />
                      </div>
                      <div className="clients-mobile-meta clients-mobile-meta--three">
                        <div><span>{clientsCopy.email}</span><strong>{c.email?.trim() ? <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.email.trim()}</a> : '—'}</strong></div>
                        <div><span>{clientsCopy.phone}</span><strong>{c.telephone?.trim() ? <a href={contactTelHref(c.telephone)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.telephone.trim()}</a> : '—'}</strong></div>
                        <div><span>{clientsCopy.city}</span><strong>{c.city || '—'}</strong></div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                  <table className="clients-table clients-table--companies">
                    <thead>
                      <tr>
                        <th>{clientsCopy.companyName}</th>
                        <th>{companyIdHeader}</th>
                        <th>{clientsCopy.email}</th>
                        <th>{clientsCopy.telephone}</th>
                        <th>{clientsCopy.city}</th>
                        <th>{statusHeader}</th>
                        <th>{clientsCopy.tableHeaderCreated}</th>
                        <th>{actionsHeader}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map((c) => (
                        <tr key={c.id} className="clients-row" onClick={() => openCompanyDetailModal(c)}>
                          <td>
                            <div className="clients-name-cell">
                              <span className="clients-name-avatar clients-name-avatar--company" aria-hidden>{(c.name?.[0] || 'C').toUpperCase()}</span>
                              <div className="clients-name-stack">
                                <span className="clients-name">{c.name}</span>
                                <span className="clients-id">ID #{c.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="clients-muted">{c.vatId || '—'}</td>
                          <td className="clients-muted">{c.email?.trim() ? <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.email.trim()}</a> : '—'}</td>
                          <td className="clients-muted">{c.telephone?.trim() ? <a href={contactTelHref(c.telephone)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>{c.telephone.trim()}</a> : '—'}</td>
                          <td className="clients-muted">{c.city || '—'}</td>
                          <td>
                            <button
                              type="button"
                              className={`clients-status-pill clients-status-pill-btn${c.active === false ? ' clients-status-pill--inactive' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                void toggleCompanyActiveById(c.id, c.active !== false)
                              }}
                              disabled={activatingCompanyId === c.id}
                            >
                              <span />
                              {c.active === false ? inactiveStatusLabel : (locale === 'sl' ? 'Aktivno' : 'Active')}
                            </button>
                          </td>
                          <td className="clients-muted">{formatDate(c.createdAt)}</td>
                          <td className="clients-actions"><div className="clients-actions-inner">{renderCompanyRowOverflowMenu(c)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="clients-modern-table-footer">
                  <span>{locale === 'sl' ? `Prikazujem 1–${filteredCompanies.length} od ${filteredCompanies.length} ${slovenianPodjetjeCountForm(filteredCompanies.length)}` : `Showing 1–${filteredCompanies.length} of ${filteredCompanies.length} companies`}</span>
                  <div className="clients-modern-pagination" aria-hidden="true"><button type="button" className="secondary">‹</button><span>1</span><button type="button" className="secondary">›</button></div>
                </div>
              </div>
            )}
          </>
        ) : entityTab === 'groups' && groupBookingEnabled ? (
          <>
            {groupErrorMessage && !showGroupModal && <div className="error">{groupErrorMessage}</div>}
            {loadingGroups ? (
              <div className="muted clients-modern-state">{tableEmptyLoadingText}</div>
            ) : filteredGroups.length === 0 ? (
              <EmptyState title={clientsCopy.emptyGroupsTitle} text={clientsCopy.emptyGroupsText} />
            ) : (
              <div className="clients-list-shell">
                <div className="clients-mobile-list">
                  {filteredGroups.map((g) => (
                    <article key={g.id} className="clients-mobile-card" onClick={() => openGroupDetailModal(g)}>
                      <div className="clients-mobile-card-head">
                        <div className="clients-name-cell">
                          <span className="clients-name-avatar clients-name-avatar--group" aria-hidden>{(g.name?.[0] || 'G').toUpperCase()}</span>
                          <div className="clients-name-stack">
                            <span className="clients-name">{g.name}{g.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                            <span className="clients-id">ID #{g.id} · {(g.members ?? []).length} {clientsCopy.groupMembers.toLowerCase()}</span>
                          </div>
                        </div>
                        <ClientsMobileCardActionIcon kind="group" />
                      </div>
                      {(g.members ?? []).length > 0 && (
                        <div className="clients-mobile-member-strip" aria-label={`${(g.members ?? []).length} ${clientsCopy.groupMembers.toLowerCase()}`}>
                          <span className="clients-mobile-member-avatars" aria-hidden="true">
                            {(g.members ?? []).slice(0, 3).map((member) => (
                              <span key={member.id} className="clients-mobile-member-avatar">{initials(member.firstName, member.lastName)}</span>
                            ))}
                            {(g.members ?? []).length > 3 && <span className="clients-mobile-member-more">+{(g.members ?? []).length - 3}</span>}
                          </span>
                          <span>{(g.members ?? []).length} {clientsCopy.groupMembers.toLowerCase()}</span>
                        </div>
                      )}
                      <div className="clients-mobile-meta clients-mobile-meta--group">
                        <div><span>{clientsCopy.groupEmail}</span><strong>{g.email || '—'}</strong></div>
                        <div><span>{statusHeader}</span><strong className={g.active === false ? 'clients-mobile-status-text clients-mobile-status-text--inactive' : 'clients-mobile-status-text'}><span />{g.active === false ? inactiveStatusLabel : activeStatusLabel}</strong></div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                  <table className="clients-table clients-table--groups">
                    <thead>
                      <tr>
                        <th>{clientsCopy.groupName}</th>
                        <th>{groupDescriptionHeader}</th>
                        <th>{groupMembersHeader}</th>
                        <th>{statusHeader}</th>
                        <th>{clientsCopy.tableHeaderCreated}</th>
                        <th>{actionsHeader}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGroups.map((g) => (
                        <tr key={g.id} className="clients-row" onClick={() => openGroupDetailModal(g)}>
                          <td>
                            <div className="clients-name-cell">
                              <span className="clients-name-avatar clients-name-avatar--group" aria-hidden>{(g.name?.[0] || 'G').toUpperCase()}</span>
                              <div className="clients-name-stack">
                                <span className="clients-name">{g.name}</span>
                                <span className="clients-id">ID #{g.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="clients-muted">{g.email || '—'}</td>
                          <td className="clients-muted"><span className="clients-member-count">{(g.members ?? []).length}</span></td>
                          <td>
                            <button
                              type="button"
                              className={`clients-status-pill clients-status-pill-btn${g.active === false ? ' clients-status-pill--inactive' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                void toggleGroupActiveById(g.id, g.active !== false)
                              }}
                              disabled={activatingGroupId === g.id}
                            >
                              <span />
                              {g.active === false ? inactiveStatusLabel : activeStatusLabel}
                            </button>
                          </td>
                          <td className="clients-muted">{formatDate(g.createdAt)}</td>
                          <td className="clients-actions"><div className="clients-actions-inner">{renderGroupRowOverflowMenu(g)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="clients-modern-table-footer">
                  <span>{locale === 'sl' ? `Prikazujem 1–${filteredGroups.length} od ${filteredGroups.length} ${filteredGroups.length === 1 ? 'skupina' : filteredGroups.length === 2 ? 'skupini' : filteredGroups.length === 3 || filteredGroups.length === 4 ? 'skupine' : 'skupin'}` : `Showing 1–${filteredGroups.length} of ${filteredGroups.length} groups`}</span>
                  <div className="clients-modern-pagination" aria-hidden="true"><button type="button" className="secondary">‹</button><span>1</span><button type="button" className="secondary">›</button></div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </Card>
      )}

      {detailClient && (
        <div
          className={`modal-backdrop clients-action-workspace-backdrop${embeddedDetailMode ? ' clients-action-workspace-backdrop--embedded' : ''}${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onMouseDown={(e) => {
            e.stopPropagation()
            if (e.target === e.currentTarget) closeDetailModal()
          }}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          role="presentation"
        >
          <div
            className="modal large-modal clients-tab-client-detail-modal clients-action-workspace-modal clients-client-detail-modal"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="clients-action-workspace-header">
              <div className="clients-action-workspace-client">
                <span className="clients-name-avatar clients-detail-avatar clients-action-workspace-avatar" aria-hidden>
                  {(detailClient.firstName?.[0] || '').toUpperCase()}{(detailClient.lastName?.[0] || '').toUpperCase()}
                </span>
                <div className="clients-name-stack clients-action-workspace-title-stack">
                  <span className="clients-name">
                    {fullName(detailClient)}
                    {detailClient.guestAppLinked ? (
                      <span className="clients-guest-app-badge" aria-label={clientsCopy.guestAppBadge}>
                        {clientsCopy.guestAppBadge}
                      </span>
                    ) : null}
                  </span>
                  <span className="clients-id">ID #{detailClient.id} <span className="clients-action-workspace-status-dot" /> {detailClient.active === false ? inactiveStatusLabel : activeStatusLabel}</span>
                </div>
              </div>
              <button type="button" className="secondary clients-action-workspace-close" onClick={closeDetailModal} aria-label={t('mobileNavClose')}>
                ×
              </button>
            </div>
            <div className="clients-action-workspace-body">
              <div className="clients-detail-shell clients-action-workspace-shell">
                <div className="clients-detail-fields clients-action-workspace-profile-fields" onClick={(e) => e.stopPropagation()}>
                  {renderClientEditableField('firstName', clientsCopy.firstName)}
                  {renderClientEditableField('lastName', clientsCopy.lastName)}
                  {renderClientEditableField('email', clientsCopy.email, true)}
                  {renderClientEditableField('phone', clientsCopy.phone, true)}
                </div>

                <div className="clients-detail-main-tabs clients-action-workspace-tabs" onClick={(e) => e.stopPropagation()}>
                  <div className="clients-session-tabs clients-detail-main-tabs-inner clients-action-workspace-tabs-inner" role="tablist" aria-label={clientsCopy.clientDetailMainTabsAria}>
                    <button
                      type="button"
                      role="tab"
                      className={clientDetailMainTab === 'sessions' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={clientDetailMainTab === 'sessions'}
                      onClick={() => setClientDetailMainTab('sessions')}
                    >
                      <ClientWorkspaceIcon name="sessions" />
                      {clientsCopy.sessions}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={clientDetailMainTab === 'wallet' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={clientDetailMainTab === 'wallet'}
                      onClick={() => setClientDetailMainTab('wallet')}
                    >
                      <ClientWorkspaceIcon name="wallet" />
                      {clientsCopy.clientDetailTabWallet}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={clientDetailMainTab === 'files' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={clientDetailMainTab === 'files'}
                      onClick={() => setClientDetailMainTab('files')}
                    >
                      <ClientWorkspaceIcon name="files" />
                      {clientsCopy.files}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={clientDetailMainTab === 'settings' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={clientDetailMainTab === 'settings'}
                      onClick={() => setClientDetailMainTab('settings')}
                    >
                      <ClientWorkspaceIcon name="settings" />
                      {clientsCopy.clientDetailTabSettings}
                    </button>
                  </div>
                </div>

                {clientDetailMainTab === 'wallet' && (
                  <div className={`clients-detail-sessions-card clients-detail-wallet-card${walletPurchaseDrawerOpen ? ' clients-detail-wallet-card--drawer-open' : ''}`} role="tabpanel">
                    {detailWalletError && <div className="error">{detailWalletError}</div>}
                    {detailWalletLoading ? (
                      <div className="muted">{clientsCopy.walletLoading}</div>
                    ) : (
                      <div className="clients-wallet-purchase-layout">
                        <div className="clients-wallet-main-pane">
                          <div className="clients-wallet-action-bar">
                            <button type="button" className="clients-wallet-buy-button" onClick={openWalletPurchaseDrawer}>
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <circle cx="9" cy="21" r="1" />
                                <circle cx="20" cy="21" r="1" />
                                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.6L23 6H6" />
                              </svg>
                              {locale === 'sl' ? 'Kupi ugodnost' : 'Buy entitlement'}
                            </button>
                          </div>

                          <div className="clients-wallet-toolbar clients-wallet-toolbar--with-actions">
                            <div className="clients-session-tabs clients-wallet-filters" role="tablist" aria-label={clientsCopy.clientDetailTabWallet}>
                              <button type="button" className={walletFilter === 'all' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setWalletFilter('all')}>
                                {locale === 'sl' ? 'Vse' : 'All'}
                              </button>
                              <button type="button" className={walletFilter === 'packs' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setWalletFilter('packs')}>
                                {locale === 'sl' ? 'Paketi' : 'Packs'}
                              </button>
                              <button type="button" className={walletFilter === 'memberships' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setWalletFilter('memberships')}>
                                {locale === 'sl' ? 'Članstva' : 'Memberships'}
                              </button>
                              <button type="button" className={walletFilter === 'giftCards' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setWalletFilter('giftCards')}>
                                {locale === 'sl' ? 'Darilne kartice' : 'Gift cards'}
                              </button>
                            </div>
                            <div className="clients-wallet-summary">
                              <span className="clients-wallet-summary-pill clients-wallet-summary-pill--active">
                                <span /> {(detailWallet?.activeEntitlements?.length ?? 0)} {clientsCopy.walletActive}
                              </span>
                              <span className="clients-wallet-summary-pill clients-wallet-summary-pill--expiring">
                                <span /> {expiringWalletEntitlementsCount} {locale === 'sl' ? 'Kmalu poteče' : 'Expiring soon'}
                              </span>
                            </div>
                          </div>

                          {!detailWallet || visibleWalletEntitlements.length === 0 ? (
                            <div className="clients-detail-empty-card clients-wallet-empty clients-wallet-empty--purchase">
                              <div className="clients-wallet-empty-icon" aria-hidden>
                                <ClientWorkspaceIcon name="wallet" />
                              </div>
                              <EmptyState title={locale === 'sl' ? 'Ni ugodnosti' : clientsCopy.walletNoneActiveTitle} text={clientsCopy.walletNoneActiveText} />
                              <div className="clients-wallet-purchase-note">
                                <span aria-hidden>i</span>
                                {locale === 'sl' ? 'Po plačilu se ustvari ugodnost za to stranko.' : 'After payment, an entitlement is created for this client.'}
                              </div>
                            </div>
                          ) : (
                            <div className="clients-wallet-entitlement-list">
                              {visibleWalletEntitlements.map((entitlement) => {
                                const kind = entitlementKind(entitlement)
                                const status = formatWalletEntitlementStatusLabel(entitlement.status)
                                const isMembership = kind === 'membership'
                                return (
                                  <article
                                    key={entitlement.id}
                                    className={`clients-wallet-entitlement-card clients-wallet-entitlement-card--${kind}${highlightedEntitlementId === entitlement.id ? ' wallet-entitlement-highlight' : ''}`}
                                  >
                                    <div className="clients-wallet-entitlement-main">
                                      <div className="clients-wallet-entitlement-title-row">
                                        <span className="clients-wallet-entitlement-tag">{isMembership ? 'MEMBERSHIP' : kind === 'gift_card' ? 'GIFT CARD' : kind === 'ticket' ? 'TICKET' : 'PACK'}</span>
                                        <strong>{entitlement.productName}</strong>
                                      </div>
                                      <div className="clients-wallet-entitlement-meta">
                                        {entitlement.createdAt ? (
                                          <span>{clientsCopy.walletCreated} {formatDate(entitlement.createdAt)}</span>
                                        ) : null}
                                        {entitlement.validUntil ? (
                                          <span>{isMembership ? (locale === 'sl' ? 'Obnovi se' : 'Renews') : (locale === 'sl' ? 'Poteče' : 'Expires')} {formatDate(entitlement.validUntil)}</span>
                                        ) : null}
                                        {entitlement.sessionTypeName ? <span>{entitlement.sessionTypeName}</span> : null}
                                      </div>
                                    </div>
                                    <div className="clients-wallet-entitlement-side">
                                      <span className="clients-wallet-status-pill"><span /> {status}</span>
                                      <strong>
                                        {isMembership
                                          ? `${clientsCopy.walletVisitCount}: ${entitlement.visitCount ?? 0}`
                                          : `${entitlement.remainingUses == null ? clientsCopy.walletUnlimited : entitlement.remainingUses} ${clientsCopy.walletRemainingUses.toLowerCase()}`}
                                      </strong>
                                      <button
                                        type="button"
                                        className="clients-wallet-entitlement-delete-button"
                                        onClick={() => void deleteWalletEntitlement(entitlement)}
                                        disabled={deletingWalletEntitlementId === entitlement.id}
                                        aria-label={clientsCopy.walletDeleteEntitlement}
                                        title={clientsCopy.walletDeleteEntitlement}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                          <path d="M3 6h18" />
                                          <path d="M8 6V4h8v2" />
                                          <path d="M19 6l-1 14H6L5 6" />
                                          <path d="M10 11v5" />
                                          <path d="M14 11v5" />
                                        </svg>
                                        {deletingWalletEntitlementId === entitlement.id ? clientsCopy.walletDeletingEntitlement : clientsCopy.walletDeleteEntitlement}
                                      </button>
                                    </div>
                                  </article>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {walletPurchaseDrawerOpen && (
                          <aside className="clients-wallet-purchase-drawer" aria-label={locale === 'sl' ? 'Nakup ugodnosti' : 'Entitlement purchase'}>
                            <div className="clients-wallet-purchase-drawer-header">
                              <h3>{locale === 'sl' ? 'Nakup ugodnosti' : 'Entitlement purchase'}</h3>
                              <button type="button" className="clients-wallet-drawer-close" onClick={closeWalletPurchaseDrawer} aria-label={t('mobileNavClose')}>×</button>
                            </div>
                            <div className="clients-wallet-stepper" aria-hidden>
                              <div className="clients-wallet-step clients-wallet-step--active"><span>1</span><strong>{locale === 'sl' ? 'Izbira ugodnosti' : 'Select entitlement'}</strong></div>
                              <div className="clients-wallet-step-line" />
                              <div className="clients-wallet-step"><span>2</span><strong>{locale === 'sl' ? 'Račun' : 'Bill'}</strong></div>
                            </div>
                            <label className="clients-wallet-product-search">
                              <ClientsModernIcon name="search" />
                              <input value={walletProductSearch} onChange={(e) => setWalletProductSearch(e.target.value)} placeholder={locale === 'sl' ? 'Išči ugodnost...' : 'Search entitlement...'} />
                            </label>
                            {walletPurchaseError && <div className="error clients-wallet-purchase-error">{walletPurchaseError}</div>}
                            <div className="clients-wallet-product-list">
                              {walletProductsLoading ? (
                                <div className="muted clients-wallet-product-loading">{locale === 'sl' ? 'Nalaganje ugodnosti…' : 'Loading entitlements…'}</div>
                              ) : filteredWalletProducts.length === 0 ? (
                                <div className="clients-wallet-product-empty">{locale === 'sl' ? 'Ni ustvarjenih aktivnih kart, paketov, članarin ali darilnih kartic.' : 'No active cards, packs, memberships or gift cards are configured.'}</div>
                              ) : (
                                filteredWalletProducts.map((product) => {
                                  const selected = selectedWalletProduct?.id === product.id
                                  const tone = walletProductTypeTone(product.productType)
                                  return (
                                    <button
                                      key={product.id}
                                      type="button"
                                      className={`clients-wallet-product-row${selected ? ' clients-wallet-product-row--selected' : ''}`}
                                      onClick={() => setSelectedWalletProductId(product.id)}
                                    >
                                      <span className="clients-wallet-radio" aria-hidden>{selected ? '●' : ''}</span>
                                      <span className="clients-wallet-product-name">{product.name}</span>
                                      <span className={`clients-wallet-product-badge clients-wallet-product-badge--${tone}`}>{walletProductTypeLabel(product.productType, locale)}</span>
                                      <strong>{currency(walletProductPrice(product))}</strong>
                                    </button>
                                  )
                                })
                              )}
                            </div>
                            <div className="clients-wallet-purchase-summary">
                              <h4>{locale === 'sl' ? 'Povzetek' : 'Summary'}</h4>
                              <div className="clients-wallet-summary-line"><span>{locale === 'sl' ? 'Izbrana ugodnost' : 'Selected entitlement'}</span><strong>{selectedWalletProduct?.name ?? '—'}</strong></div>
                              <div className="clients-wallet-summary-line"><span>{locale === 'sl' ? 'Cena' : 'Price'}</span><strong>{selectedWalletProduct ? currency(walletProductPrice(selectedWalletProduct)) : '—'}</strong></div>
                              <div className="clients-wallet-summary-info"><span aria-hidden>i</span>{locale === 'sl' ? 'Račun se odpre v novem obrazcu odprtega računa z možnostjo Zaključi račun.' : 'The bill opens in the open-bill form with the option to close the bill.'}</div>
                            </div>
                            <div className="clients-wallet-drawer-footer">
                              <button type="button" className="secondary" onClick={closeWalletPurchaseDrawer}>{locale === 'sl' ? 'Nazaj' : 'Back'}</button>
                              <button type="button" className="clients-wallet-open-bill-button" onClick={createWalletPurchaseOpenBill} disabled={!selectedWalletProduct || walletProductsLoading || creatingWalletOpenBill}>
                                {creatingWalletOpenBill ? (locale === 'sl' ? 'Odpiram…' : 'Opening…') : (locale === 'sl' ? 'Odpri nov račun' : 'Open new bill')}
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M7 17 17 7" />
                                  <path d="M8 7h9v9" />
                                </svg>
                              </button>
                            </div>
                          </aside>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {clientDetailMainTab === 'files' && (
                  <div className="clients-detail-sessions-card clients-detail-file-manager-card" role="tabpanel">
                    <div className="clients-file-manager-toolbar">
                      <label className="clients-file-search-field">
                        <ClientsModernIcon name="search" />
                        <input
                          value={clientFileSearch}
                          onChange={(e) => setClientFileSearch(e.target.value)}
                          placeholder={locale === 'sl' ? 'Išči datoteke…' : 'Search files...'}
                        />
                      </label>
                      <button
                        type="button"
                        className="clients-file-upload-button"
                        onClick={() => pickFile((file) => void uploadClientFile(file), { accept: CLIENT_FILE_ACCEPT_INPUT })}
                        disabled={uploadingClientFile}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M12 16V4" />
                          <path d="m7 9 5-5 5 5" />
                          <path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
                        </svg>
                        {uploadingClientFile ? clientsCopy.uploadingFile : clientsCopy.uploadFile}
                      </button>
                    </div>
                    {detailClientFilesError && <div className="error">{detailClientFilesError}</div>}
                    <div
                      className={`clients-file-upload-dropzone${clientFilesDropActive ? ' clients-file-upload-dropzone--active' : ''}`}
                      onDragEnter={handleClientFilesDragEnter}
                      onDragLeave={handleClientFilesDragLeave}
                      onDragOver={handleClientFilesDragOver}
                      onDrop={(e) => void handleClientFilesDrop(e)}
                    >
                      <div className="clients-file-upload-icon" aria-hidden>
                        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 17V9" />
                          <path d="m8 13 4-4 4 4" />
                          <path d="M20 16.5a4.5 4.5 0 0 0-4.3-5.9A6 6 0 0 0 4.2 12.9 3.7 3.7 0 0 0 5.7 20H18a3 3 0 0 0 2-5.5" />
                        </svg>
                      </div>
                      <strong>{locale === 'sl' ? 'Spustite datoteke sem ali kliknite za nalaganje' : 'Drop files here or click to upload'}</strong>
                      <button
                        type="button"
                        className="clients-file-browse-button"
                        onClick={() => pickFile((file) => void uploadClientFile(file), { accept: CLIENT_FILE_ACCEPT_INPUT })}
                        disabled={uploadingClientFile}
                      >
                        {locale === 'sl' ? 'Izberi datoteke' : 'Browse files'}
                      </button>
                    </div>
                    <div className="clients-file-list-header">{locale === 'sl' ? 'Nedavne datoteke' : 'Recent files'}</div>
                    {detailClientFilesLoading ? (
                      <div className="muted">{clientsCopy.loadingFiles}</div>
                    ) : filteredClientFiles.length === 0 ? (
                      <div className="clients-detail-empty-card">
                        <EmptyState title={clientsCopy.noFilesTitle} text={clientsCopy.noClientFilesText} />
                      </div>
                    ) : (
                      <div className="clients-modern-file-list">
                        {filteredClientFiles.map((file) => {
                          const kind = storedFileKind(file.fileName)
                          const ext = storedFileExtension(file.fileName).toUpperCase() || 'FILE'
                          return (
                            <article key={file.id} className="clients-modern-file-row">
                              <span className={`clients-modern-file-icon clients-modern-file-icon--${kind}`} aria-hidden>{ext.slice(0, 4)}</span>
                              <div className="clients-modern-file-main">
                                <strong title={file.fileName}>{file.fileName}</strong>
                                <span>{ext} · {formatFileSize(file.sizeBytes)}</span>
                              </div>
                              <div className="clients-modern-file-date">{file.uploadedAt ? formatDateTime(file.uploadedAt) : '—'}</div>
                              <div className="clients-modern-file-actions">
                                <button type="button" onClick={() => void downloadClientFile(file)}>{clientsCopy.openFile}</button>
                                <button type="button" onClick={() => void removeClientFile(file)} disabled={deletingClientFileId === file.id}>⋯</button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {clientDetailMainTab === 'settings' && (
                  <div className="clients-action-workspace-settings" onClick={(e) => e.stopPropagation()} role="tabpanel">
                    <div className="clients-detail-fields clients-action-workspace-settings-grid">
                      {renderClientEditableField('billingCompanyId', clientsCopy.linkedCompany, true)}
                      {renderClientEditableField('assignedToId', clientsCopy.assignedConsultant, true)}
                    </div>
                    <div className="clients-detail-fields clients-action-workspace-settings-grid clients-action-workspace-settings-switches">
                      <div className="clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide">
                        <span>{clientsCopy.whatsappOptIn}</span>
                        <button
                          type="button"
                          className={`clients-batch-switch${detailEditDraft.whatsappOptIn ? ' clients-batch-switch--on' : ''}`}
                          onClick={() => setDetailEditDraft({ ...detailEditDraft, whatsappOptIn: !detailEditDraft.whatsappOptIn })}
                          aria-pressed={detailEditDraft.whatsappOptIn}
                        >
                          {detailEditDraft.whatsappOptIn ? clientsCopy.toggleOn : clientsCopy.toggleOff}
                        </button>
                      </div>
                      <div className="clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide">
                        <span>{clientsCopy.batchPayment}</span>
                        <button
                          type="button"
                          className={`clients-batch-switch${detailEditDraft.batchPaymentEnabled ? ' clients-batch-switch--on' : ''}`}
                          onClick={() =>
                            setDetailEditDraft({ ...detailEditDraft, batchPaymentEnabled: !detailEditDraft.batchPaymentEnabled })
                          }
                          aria-pressed={detailEditDraft.batchPaymentEnabled}
                        >
                          {detailEditDraft.batchPaymentEnabled ? clientsCopy.toggleOn : clientsCopy.toggleOff}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {clientDetailMainTab === 'sessions' && (
                  <div className="clients-detail-sessions-card clients-detail-sessions-card--modern clients-modern-sessions-panel" role="tabpanel">
                    <div className="clients-detail-session-tabs-row clients-modern-sessions-header">
                      <div className="clients-session-tabs clients-modern-session-subtabs">
                        <button
                          type="button"
                          className={sessionTab === 'future' ? 'clients-session-tab active' : 'clients-session-tab'}
                          onClick={() => setSessionTab('future')}
                          aria-pressed={sessionTab === 'future'}
                        >
                          {clientsCopy.future}
                        </button>
                        <button
                          type="button"
                          className={sessionTab === 'past' ? 'clients-session-tab active' : 'clients-session-tab'}
                          onClick={() => setSessionTab('past')}
                          aria-pressed={sessionTab === 'past'}
                        >
                          {clientsCopy.past}
                        </button>
                        <button
                          type="button"
                          className={sessionTab === 'cancelled' ? 'clients-session-tab active' : 'clients-session-tab'}
                          onClick={() => setSessionTab('cancelled')}
                          aria-pressed={sessionTab === 'cancelled'}
                        >
                          {clientsCopy.cancelled}
                        </button>
                      </div>
                      <span className="clients-modern-sessions-count" aria-live="polite" aria-atomic="true">
                        <ClientWorkspaceIcon name="sessions" />
                        {detailSessionsLoading ? '…' : clientsCopy.sessionsCount(currentClientSessions.length)}
                      </span>
                    </div>
                    {detailSessionsError && <div className="error">{detailSessionsError}</div>}
                    {detailSessionsLoading ? (
                      <div className="muted">{clientsCopy.loadingSessions}</div>
                    ) : currentClientSessions.length === 0 ? (
                      <div className="clients-detail-empty-card">
                        <EmptyState
                          title={sessionTab === 'future' ? clientsCopy.noUpcomingSessionsTitle : sessionTab === 'past' ? clientsCopy.noPastSessionsTitle : clientsCopy.noCancelledSessionsTitle}
                          text={sessionTab === 'future' ? clientsCopy.noUpcomingSessionsText : sessionTab === 'past' ? clientsCopy.noPastSessionsText : clientsCopy.noCancelledSessionsText}
                        />
                      </div>
                    ) : (
                      <div className="clients-modern-session-list">
                        {currentClientSessions.map((s) => {
                          const lifecycleStatus = deriveSessionLifecycleStatus(s)
                          const sessionStatusTone = lifecycleStatus === 'CANCELLED'
                            ? 'cancelled'
                            : lifecycleStatus === 'NO_SHOW'
                              ? 'no-show'
                              : lifecycleStatus === 'ONGOING'
                                ? 'ongoing'
                                : lifecycleStatus === 'CHECKED_OUT'
                                  ? 'checked_out'
                                  : 'reserved'
                          const consultantName = fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })
                          return (
                            <article
                              key={s.id}
                              className="clients-modern-session-row"
                              onClick={() => navigate(`/calendar/booking/${s.id}`)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  navigate(`/calendar/booking/${s.id}`)
                                }
                              }}
                            >
                              <div className="clients-modern-session-icon" aria-hidden>
                                <ClientWorkspaceIcon name="sessions" />
                              </div>
                              <div className="clients-modern-session-title">
                                <strong>{sessionTitle(s)}</strong>
                                <span>{formatDate(s.startTime)}</span>
                              </div>
                              <div className="clients-modern-session-info">
                                <span>{locale === 'sl' ? 'Ura' : 'Time'}</span>
                                <strong>{formatShortTime(s.startTime)} – {formatShortTime(s.endTime)}</strong>
                              </div>
                              <div className="clients-modern-session-info">
                                <span>{locale === 'sl' ? 'Lokacija' : 'Location'}</span>
                                <strong>{sessionLocation(s)}</strong>
                              </div>
                              <div className="clients-modern-session-info">
                                <span>{locale === 'sl' ? 'Izvajalec' : 'Instructor'}</span>
                                <strong>{consultantName || '—'}</strong>
                              </div>
                              <span className={`clients-modern-session-status clients-modern-session-status--${sessionStatusTone}`}>
                                {lifecycleStatus === 'CANCELLED'
                                  ? 'CANCELLED'
                                  : lifecycleStatus === 'NO_SHOW'
                                    ? 'NO SHOW'
                                    : lifecycleStatus === 'ONGOING'
                                      ? 'ONGOING'
                                      : lifecycleStatus === 'CHECKED_OUT'
                                        ? 'CHECKED OUT'
                                        : 'RESERVED'}
                              </span>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {clientDetailHasChanges && (
              <div className="clients-action-workspace-footer">
                <button
                  type="button"
                  className="clients-gapp-save-button"
                  onClick={() => void saveDetailClientInline()}
                  disabled={savingDetailEdit}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M17 21v-8H7v8" />
                    <path d="M7 3v5h8" />
                  </svg>
                  {savingDetailEdit ? clientsCopy.savingChanges : clientsCopy.saveChanges}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!embeddedDetailMode && detailCompany && (
        <div
          className={`modal-backdrop clients-action-workspace-backdrop${embeddedDetailMode ? ' clients-action-workspace-backdrop--embedded' : ''}${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onMouseDown={onSidePanelBackdropMouseDown(closeCompanyDetailModal)}
          role="presentation"
        >
          <div
            className="modal large-modal clients-tab-client-detail-modal clients-action-workspace-modal clients-company-detail-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="clients-action-workspace-header">
              <div className="clients-action-workspace-client">
                <span className="clients-name-avatar clients-detail-avatar clients-action-workspace-avatar" aria-hidden>{(detailCompany.name?.[0] || 'C').toUpperCase()}</span>
                <div className="clients-name-stack clients-action-workspace-title-stack">
                  <span className="clients-name">{detailCompany.name}{detailCompany.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                  <span className="clients-id">ID #{detailCompany.id}</span>
                </div>
              </div>
              <button type="button" className="secondary clients-action-workspace-close" onClick={closeCompanyDetailModal} aria-label={t('mobileNavClose')}>
                ×
              </button>
            </div>
            <div className="clients-action-workspace-body">
              <div className="clients-detail-shell clients-action-workspace-shell">
                <div className="clients-detail-fields clients-action-workspace-profile-fields">
                  {renderCompanyEditableField('name', clientsCopy.companyName, true)}
                  {renderCompanyEditableField('address', clientsCopy.address, true)}
                  {renderCompanyEditableField('postalCode', clientsCopy.postalCode)}
                  {renderCompanyEditableField('city', clientsCopy.city)}
                  {renderCompanyEditableField('vatId', clientsCopy.vatId, true)}
                  {renderCompanyEditableField('email', clientsCopy.email, true)}
                  {renderCompanyEditableField('telephone', clientsCopy.telephone, true)}
                </div>

                <div className="clients-detail-main-tabs clients-action-workspace-tabs" onClick={(e) => e.stopPropagation()}>
                  <div className="clients-session-tabs clients-detail-main-tabs-inner clients-action-workspace-tabs-inner clients-action-workspace-tabs-inner--two" role="tablist" aria-label={clientsCopy.companyDetailMainTabsAria}>
                    <button
                      type="button"
                      role="tab"
                      className={companyDetailMainTab === 'datoteke' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={companyDetailMainTab === 'datoteke'}
                      onClick={() => setCompanyDetailMainTab('datoteke')}
                    >
                      <ClientWorkspaceIcon name="files" />
                      {clientsCopy.files}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={companyDetailMainTab === 'nastavitve' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={companyDetailMainTab === 'nastavitve'}
                      onClick={() => setCompanyDetailMainTab('nastavitve')}
                    >
                      <ClientWorkspaceIcon name="settings" />
                      {clientsCopy.clientDetailTabSettings}
                    </button>
                  </div>
                </div>

                {companyDetailMainTab === 'nastavitve' && (
                  <div className="clients-action-workspace-settings" onClick={(e) => e.stopPropagation()} role="tabpanel">
                    <div className="clients-detail-fields clients-action-workspace-settings-grid clients-action-workspace-settings-switches">
                    <div className="clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.batchPayment}</span>
                      <button
                        type="button"
                        className={`clients-batch-switch${companyDetailEditDraft.batchPaymentEnabled ? ' clients-batch-switch--on' : ''}`}
                        onClick={() =>
                          setCompanyDetailEditDraft({
                            ...companyDetailEditDraft,
                            batchPaymentEnabled: !companyDetailEditDraft.batchPaymentEnabled,
                          })
                        }
                        aria-pressed={companyDetailEditDraft.batchPaymentEnabled}
                      >
                        {companyDetailEditDraft.batchPaymentEnabled ? clientsCopy.toggleOn : clientsCopy.toggleOff}
                      </button>
                    </div>
                  </div>
                  </div>
                )}

                {companyDetailMainTab === 'datoteke' && (
                  <div
                    className="clients-detail-sessions-card clients-detail-invoices-card clients-detail-datoteke-card"
                    role="tabpanel"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="clients-detail-datoteke-sub-tabs">
                      <div className="clients-session-tabs clients-detail-main-tabs-inner" role="tablist" aria-label={clientsCopy.companyDatotekeSubTabsAria}>
                        <button
                          type="button"
                          role="tab"
                          className={companyDetailDatotekeSubTab === 'racuni' ? 'clients-session-tab active' : 'clients-session-tab'}
                          aria-selected={companyDetailDatotekeSubTab === 'racuni'}
                          onClick={() => setCompanyDetailDatotekeSubTab('racuni')}
                        >
                          {clientsCopy.companySubTabInvoices}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          className={companyDetailDatotekeSubTab === 'splosno' ? 'clients-session-tab active' : 'clients-session-tab'}
                          aria-selected={companyDetailDatotekeSubTab === 'splosno'}
                          onClick={() => setCompanyDetailDatotekeSubTab('splosno')}
                        >
                          {clientsCopy.companySubTabGeneral}
                        </button>
                      </div>
                    </div>

                    {companyDetailDatotekeSubTab === 'splosno' && (
                      <>
                        <div className="clients-file-manager-toolbar">
                          <label className="clients-file-search-field">
                            <ClientsModernIcon name="search" />
                            <input
                              value={companyFileSearch}
                              onChange={(e) => setCompanyFileSearch(e.target.value)}
                              placeholder={locale === 'sl' ? 'Išči datoteke…' : 'Search files...'}
                            />
                          </label>
                          <button
                            type="button"
                            className="clients-file-upload-button"
                            onClick={() => pickFile((file) => void uploadCompanyFile(file), { accept: CLIENT_FILE_ACCEPT_INPUT })}
                            disabled={uploadingCompanyFile}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M12 16V4" />
                              <path d="m7 9 5-5 5 5" />
                              <path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
                            </svg>
                            {uploadingCompanyFile ? clientsCopy.uploadingFile : clientsCopy.uploadFile}
                          </button>
                        </div>
                        {detailCompanyFilesError && <div className="error">{detailCompanyFilesError}</div>}
                        <div
                          className={`clients-file-upload-dropzone${companyFilesDropActive ? ' clients-file-upload-dropzone--active' : ''}`}
                          onDragEnter={handleCompanyFilesDragEnter}
                          onDragLeave={handleCompanyFilesDragLeave}
                          onDragOver={handleCompanyFilesDragOver}
                          onDrop={(e) => void handleCompanyFilesDrop(e)}
                        >
                          <div className="clients-file-upload-icon" aria-hidden>
                            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 17V9" />
                              <path d="m8 13 4-4 4 4" />
                              <path d="M20 16.5a4.5 4.5 0 0 0-4.3-5.9A6 6 0 0 0 4.2 12.9 3.7 3.7 0 0 0 5.7 20H18a3 3 0 0 0 2-5.5" />
                            </svg>
                          </div>
                          <strong>{locale === 'sl' ? 'Spustite datoteke sem ali kliknite za nalaganje' : 'Drop files here or click to upload'}</strong>
                          <button
                            type="button"
                            className="clients-file-browse-button"
                            onClick={() => pickFile((file) => void uploadCompanyFile(file), { accept: CLIENT_FILE_ACCEPT_INPUT })}
                            disabled={uploadingCompanyFile}
                          >
                            {locale === 'sl' ? 'Izberi datoteke' : 'Browse files'}
                          </button>
                        </div>
                        <div className="clients-file-list-header">{locale === 'sl' ? 'Nedavne datoteke' : 'Recent files'}</div>
                        {detailCompanyFilesLoading ? (
                          <div className="muted">{clientsCopy.loadingFiles}</div>
                        ) : filteredCompanyFiles.length === 0 ? (
                          <div className="clients-detail-empty-card">
                            <EmptyState title={clientsCopy.noFilesTitle} text={clientsCopy.noCompanyFilesText} />
                          </div>
                        ) : (
                          <div className="clients-modern-file-list">
                            {filteredCompanyFiles.map((file) => {
                              const kind = storedFileKind(file.fileName)
                              const ext = storedFileExtension(file.fileName).toUpperCase() || 'FILE'
                              return (
                                <article key={file.id} className="clients-modern-file-row">
                                  <span className={`clients-modern-file-icon clients-modern-file-icon--${kind}`} aria-hidden>{ext.slice(0, 4)}</span>
                                  <div className="clients-modern-file-main">
                                    <strong title={file.fileName}>{file.fileName}</strong>
                                    <span>{ext} · {formatFileSize(file.sizeBytes)}</span>
                                  </div>
                                  <div className="clients-modern-file-date">{file.uploadedAt ? formatDateTime(file.uploadedAt) : '—'}</div>
                                  <div className="clients-modern-file-actions">
                                    <button type="button" onClick={() => void downloadCompanyFile(file)}>{clientsCopy.openFile}</button>
                                    <button type="button" onClick={() => void removeCompanyFile(file)} disabled={deletingCompanyFileId === file.id}>⋯</button>
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}

                    {companyDetailDatotekeSubTab === 'racuni' && (
                      <>
                        {detailCompanyError && <div className="error">{detailCompanyError}</div>}
                        {detailCompanyBillsLoading ? (
                          <div className="muted">{locale === 'sl' ? 'Nalagam izdane račune...' : 'Loading issued invoices...'}</div>
                        ) : (
                          <div className="clients-company-invoices-panel">
                            <div className="clients-company-invoices-toolbar">
                              <span className="clients-company-invoices-count">
                                <ClientWorkspaceIcon name="files" /> {companyBills.length} {locale === 'sl' ? 'računi' : 'invoices'}
                              </span>
                              <button type="button" className="clients-file-upload-button" onClick={() => navigate('/billing')}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M12 5v14" />
                                  <path d="M5 12h14" />
                                </svg>
                                {locale === 'sl' ? 'Ustvari račun' : 'Create invoice'}
                              </button>
                            </div>
                            {companyBills.length === 0 ? (
                              <div className="clients-detail-empty-card">
                                <EmptyState title={locale === 'sl' ? 'Ni izdanih računov' : 'No issued invoices'} text={locale === 'sl' ? 'Računi, izdani temu podjetju, bodo prikazani tukaj.' : 'Invoices billed to this company will appear here.'} />
                              </div>
                            ) : (
                              <div className="clients-company-invoice-table" role="table" aria-label={clientsCopy.companySubTabInvoices}>
                                <div className="clients-company-invoice-row clients-company-invoice-row--head" role="row">
                                  <span>{locale === 'sl' ? 'Številka računa' : 'Invoice number'}</span>
                                  <span>{locale === 'sl' ? 'Datum izdaje' : 'Issue date'}</span>
                                  <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
                                  <span>{locale === 'sl' ? 'Status' : 'Status'}</span>
                                  <span />
                                </div>
                                {companyBills.map((bill) => {
                                  const statusTone = bill.fiscalStatus === 'FAILED'
                                    ? 'danger'
                                    : bill.paymentStatus === 'paid'
                                      ? 'success'
                                      : bill.paymentStatus === 'payment_pending'
                                        ? 'warning'
                                        : bill.paymentStatus === 'cancelled'
                                          ? 'muted'
                                          : 'info'
                                  const statusLabel = bill.fiscalStatus === 'FAILED'
                                    ? 'FAILED'
                                    : bill.paymentStatus === 'paid'
                                      ? (locale === 'sl' ? 'Plačano' : 'Paid')
                                      : bill.paymentStatus === 'payment_pending'
                                        ? (locale === 'sl' ? 'V teku' : 'Pending')
                                        : bill.paymentStatus === 'cancelled'
                                          ? (locale === 'sl' ? 'Preklicano' : 'Cancelled')
                                          : (locale === 'sl' ? 'Odprto' : 'Open')
                                  return (
                                    <div key={bill.id} className="clients-company-invoice-row" role="row">
                                      <strong>{bill.billNumber}</strong>
                                      <span>{formatDate(bill.issueDate)}</span>
                                      <span>{currency(bill.totalGross)}</span>
                                      <span className={`clients-company-invoice-status clients-company-invoice-status--${statusTone}`}>{statusLabel}</span>
                                      <button type="button" onClick={() => downloadBillPdf(bill.id, bill.billNumber)} aria-label={`${locale === 'sl' ? 'Odpri račun' : 'Open invoice'} ${bill.billNumber}`}>⋯</button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            {companyDetailHasChanges && (
              <div className="clients-action-workspace-footer">
                <button
                  type="button"
                  className="clients-gapp-save-button"
                  onClick={() => void saveDetailCompanyInline()}
                  disabled={savingCompanyDetailEdit}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M17 21v-8H7v8" />
                    <path d="M7 3v5h8" />
                  </svg>
                  {savingCompanyDetailEdit ? clientsCopy.savingChanges : clientsCopy.saveChanges}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!embeddedDetailMode && showModal && (
        <div
          className={`modal-backdrop clients-action-workspace-backdrop${embeddedDetailMode ? ' clients-action-workspace-backdrop--embedded' : ''}${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onMouseDown={onSidePanelBackdropMouseDown(closeModal)}
          role="presentation"
        >
          <div
            className="modal large-modal clients-tab-client-detail-modal clients-action-workspace-modal clients-client-create-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form className="clients-create-modal-form" onSubmit={handleSubmit}>
              <div className="clients-action-workspace-header">
                <div className="clients-action-workspace-client">
                  <span className="clients-name-avatar clients-detail-avatar clients-action-workspace-avatar" aria-hidden>
                    {initials(form.firstName, form.lastName)}
                  </span>
                  <div className="clients-name-stack clients-action-workspace-title-stack">
                    <span className="clients-name">{[form.firstName, form.lastName].filter(Boolean).join(' ').trim() || clientsCopy.newClientName}</span>
                    <span className="clients-id">ID #— <span className="clients-action-workspace-status-dot" /> {activeStatusLabel}</span>
                  </div>
                </div>
                <button type="button" className="secondary clients-action-workspace-close" onClick={closeModal} aria-label={t('mobileNavClose')}>
                  ×
                </button>
              </div>
              <div className="clients-action-workspace-body">
                <div className="clients-detail-shell clients-action-workspace-shell">
                  <div className="clients-detail-fields clients-create-fields clients-action-workspace-settings-grid">
                    {renderNewClientEditableField('firstName', clientsCopy.firstName)}
                    {renderNewClientEditableField('lastName', clientsCopy.lastName)}
                    {renderNewClientEditableField('email', clientsCopy.email, true, 'email')}
                    {renderNewClientEditableField('phone', clientsCopy.phone, true)}
                  </div>
                {errorMessage && <div className="error">{errorMessage}</div>}
                </div>
              </div>
              <div className="form-actions clients-action-workspace-footer clients-create-footer clients-create-footer--single">
                <button type="submit" className="clients-gapp-save-button" disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>{saving ? clientsCopy.saving : clientsCopy.createClient}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!embeddedDetailMode && showCompanyModal && (
        <div
          className={`modal-backdrop clients-action-workspace-backdrop${embeddedDetailMode ? ' clients-action-workspace-backdrop--embedded' : ''}${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onMouseDown={onSidePanelBackdropMouseDown(closeCompanyModal)}
          role="presentation"
        >
          <div
            className="modal large-modal clients-tab-client-detail-modal clients-action-workspace-modal clients-create-modal clients-company-create-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form className="clients-create-modal-form" onSubmit={submitCompanyForm}>
              <div className="clients-action-workspace-header">
                <div className="clients-action-workspace-client">
                  <span className="clients-name-avatar clients-detail-avatar clients-action-workspace-avatar" aria-hidden>{initials(companyForm.name, locale === 'sl' ? 'Podjetje' : 'Company')}</span>
                  <div className="clients-name-stack clients-action-workspace-title-stack">
                    <span className="clients-name">{companyForm.name.trim() || clientsCopy.newCompanyName}</span>
                    <span className="clients-id">ID #— <span className="clients-action-workspace-status-dot" /> {activeStatusLabel}</span>
                  </div>
                </div>
                <button type="button" className="secondary clients-action-workspace-close" onClick={closeCompanyModal} aria-label={t('mobileNavClose')}>
                  ×
                </button>
              </div>
              <div className="clients-action-workspace-body">
                <div className="clients-detail-shell clients-create-shell clients-action-workspace-shell">
                  <div className="clients-detail-fields clients-create-fields clients-action-workspace-profile-fields">
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.companyName}</span>
                      <input required value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.vatId}</span>
                      <input value={companyForm.vatId} onChange={(e) => setCompanyForm({ ...companyForm, vatId: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.email}</span>
                      <input type="email" value={companyForm.email} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.telephone}</span>
                      <input value={companyForm.telephone} onChange={(e) => setCompanyForm({ ...companyForm, telephone: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.address}</span>
                      <input value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card">
                      <span>{clientsCopy.postalCode}</span>
                      <input value={companyForm.postalCode} onChange={(e) => setCompanyForm({ ...companyForm, postalCode: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card">
                      <span>{clientsCopy.city}</span>
                      <input value={companyForm.city} onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })} />
                    </label>
                  </div>

                  {companyErrorMessage && <div className="error">{companyErrorMessage}</div>}
                </div>
              </div>
              <div className="form-actions clients-action-workspace-footer clients-create-footer clients-create-footer--single">
                <button type="submit" className="clients-gapp-save-button" disabled={savingCompany || !companyForm.name.trim()}>
                  {savingCompany ? clientsCopy.saving : clientsCopy.createCompany}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailGroup && (
        <div
          className={`modal-backdrop clients-action-workspace-backdrop${embeddedDetailMode ? ' clients-action-workspace-backdrop--embedded' : ''}${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onMouseDown={onSidePanelBackdropMouseDown(closeGroupDetailModal)}
          role="presentation"
        >
          <div
            className="modal large-modal clients-tab-client-detail-modal clients-action-workspace-modal clients-group-detail-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="clients-action-workspace-header">
              <div className="clients-action-workspace-client">
                <span className="clients-name-avatar clients-detail-avatar clients-action-workspace-avatar" aria-hidden>{(detailGroup.name?.[0] || 'G').toUpperCase()}</span>
                <div className="clients-name-stack clients-action-workspace-title-stack">
                  <span className="clients-name">{detailGroup.name}{detailGroup.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                  <span className="clients-id">ID #{detailGroup.id}</span>
                </div>
              </div>
              <button type="button" className="secondary clients-action-workspace-close" onClick={closeGroupDetailModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="clients-action-workspace-body">
              <div className="clients-detail-shell clients-action-workspace-shell">
                <div className="clients-detail-fields clients-action-workspace-profile-fields">
                  {renderGroupEditableField('name', clientsCopy.groupName, true)}
                  {renderGroupEditableField('email', clientsCopy.groupEmail, true)}
                </div>

                <div className="clients-detail-main-tabs clients-action-workspace-tabs" onClick={(e) => e.stopPropagation()}>
                  <div className="clients-session-tabs clients-detail-main-tabs-inner clients-action-workspace-tabs-inner clients-action-workspace-tabs-inner--three" role="tablist" aria-label={clientsCopy.groupDetailMainTabsAria}>
                    <button
                      type="button"
                      role="tab"
                      className={groupDetailMainTab === 'sessions' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={groupDetailMainTab === 'sessions'}
                      onClick={() => setGroupDetailMainTab('sessions')}
                    >
                      <ClientWorkspaceIcon name="sessions" />
                      {clientsCopy.sessions}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={groupDetailMainTab === 'members' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={groupDetailMainTab === 'members'}
                      onClick={() => setGroupDetailMainTab('members')}
                    >
                      <ClientWorkspaceIcon name="members" />
                      {clientsCopy.groupMembers}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={groupDetailMainTab === 'settings' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={groupDetailMainTab === 'settings'}
                      onClick={() => setGroupDetailMainTab('settings')}
                    >
                      <ClientWorkspaceIcon name="settings" />
                      {clientsCopy.clientDetailTabSettings}
                    </button>
                  </div>
                </div>

                {groupDetailMainTab === 'members' && (
                  <div className="clients-detail-sessions-card group-members-tab-panel" role="tabpanel">
                    <div className="group-members-tab-header">
                      <h3>{clientsCopy.groupMembers} ({(detailGroup.members ?? []).length})</h3>
                      <span>{locale === 'sl' ? `${(detailGroup.members ?? []).length} članov` : `${(detailGroup.members ?? []).length} members`}</span>
                    </div>
                    <div className="group-members-tab-actions">
                      <div
                        className="client-picker calendar-client-picker group-members-client-picker group-members-tab-picker"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="calendar-client-picker__search-row">
                          <div className="client-search-wrap calendar-client-picker__search-wrap">
                            <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.35-4.35" />
                              </svg>
                            </span>
                            <input
                              placeholder={clientsCopy.searchMembersPlaceholder}
                              value={groupMemberSearch}
                              onChange={(e) => {
                                setGroupMemberSearch(e.target.value)
                                setGroupMemberDropdownOpen(true)
                              }}
                              onFocus={() => setGroupMemberDropdownOpen(true)}
                              onBlur={() =>
                                window.setTimeout(() => {
                                  setGroupMemberDropdownOpen(false)
                                  setPendingGroupMemberIds([])
                                }, 180)
                              }
                              aria-autocomplete="list"
                              aria-expanded={groupMemberDropdownOpen}
                            />
                          </div>
                        </div>
                        {groupMemberDropdownOpen &&
                          (groupMemberCandidates.length > 0 || groupMemberSearch.trim() !== '') && (
                            <div
                              className="client-dropdown-panel calendar-client-picker__dropdown group-members-client-dropdown"
                              onMouseDown={(e) => e.preventDefault()}
                              role="listbox"
                              aria-multiselectable="true"
                            >
                              {groupMemberCandidates.slice(0, 10).map((c) => {
                                const selected = pendingGroupMemberIds.includes(c.id)
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    className={`client-list-item group-members-candidate-row${selected ? ' selected' : ''}`}
                                    disabled={addingMember}
                                    onMouseDown={(e) => {
                                      e.preventDefault()
                                      togglePendingGroupMemberId(c.id)
                                    }}
                                  >
                                    <span className="group-members-candidate-check" aria-hidden>
                                      {selected ? '✓' : ''}
                                    </span>
                                    <span className="group-members-candidate-name">{fullName(c)}</span>
                                  </button>
                                )
                              })}
                              {groupMemberCandidates.length === 0 && groupMemberSearch.trim() !== '' && (
                                <span className="muted" style={{ padding: '8px 10px', display: 'block' }}>
                                  {clientsCopy.groupMemberSearchNoResults}
                                </span>
                              )}
                            </div>
                          )}
                      </div>
                      <button
                        type="button"
                        className="clients-file-upload-button group-members-add-button"
                        disabled={pendingGroupMemberIds.length === 0 || addingMember}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void handleAddGroupMembersBulk(pendingGroupMemberIds)}
                      >
                        <span aria-hidden>+</span>
                        {pendingGroupMemberIds.length === 0
                          ? clientsCopy.addMember
                          : clientsCopy.addSelectedMembers(pendingGroupMemberIds.length)}
                      </button>
                    </div>
                    {(detailGroup.members ?? []).length === 0 ? (
                      <div className="group-members-empty-state">
                        <div className="group-members-empty-icon" aria-hidden>
                          <ClientWorkspaceIcon name="members" />
                        </div>
                        <strong>{locale === 'sl' ? 'Ni članov' : 'No members yet'}</strong>
                        <span>{clientsCopy.noMembersText}</span>
                      </div>
                    ) : (
                      <div className="group-members-modern-list" role="list" aria-label={clientsCopy.groupMembers}>
                        {(detailGroup.members ?? []).map((m) => {
                          const label = fullName(m)
                          const initials = `${m.firstName?.[0] ?? ''}${m.lastName?.[0] ?? ''}`.trim() || label.slice(0, 2) || 'C'
                          return (
                            <article key={m.id} className="group-members-modern-row" role="listitem">
                              <div className="group-members-modern-person">
                                <span className="group-members-modern-avatar" aria-hidden>{initials.toUpperCase()}</span>
                                <div className="group-members-modern-meta">
                                  <strong title={label}>{label}</strong>
                                  <span>{m.email || m.phone || `ID #${m.id}`}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="group-members-modern-remove"
                                disabled={removingMemberId === m.id}
                                onClick={() => void handleRemoveGroupMember(m.id)}
                                aria-label={`${clientsCopy.removeMember} ${label}`}
                              >
                                ×
                              </button>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {groupDetailMainTab === 'sessions' && (
                  <div className="clients-detail-sessions-card clients-detail-sessions-card--modern clients-modern-sessions-panel" role="tabpanel">
                    <div className="clients-detail-session-tabs-row clients-modern-sessions-header">
                      <div className="clients-session-tabs clients-modern-session-subtabs">
                          <button
                            type="button"
                            className={groupSessionTab === 'future' ? 'clients-session-tab active' : 'clients-session-tab'}
                            onClick={() => setGroupSessionTab('future')}
                            aria-pressed={groupSessionTab === 'future'}
                          >
                            {clientsCopy.future}
                          </button>
                          <button
                            type="button"
                            className={groupSessionTab === 'past' ? 'clients-session-tab active' : 'clients-session-tab'}
                            onClick={() => setGroupSessionTab('past')}
                            aria-pressed={groupSessionTab === 'past'}
                          >
                            {clientsCopy.past}
                          </button>
                          <button
                            type="button"
                            className={groupSessionTab === 'cancelled' ? 'clients-session-tab active' : 'clients-session-tab'}
                            onClick={() => setGroupSessionTab('cancelled')}
                            aria-pressed={groupSessionTab === 'cancelled'}
                          >
                            {clientsCopy.cancelled}
                          </button>
                      </div>
                      <span className="clients-modern-sessions-count" aria-live="polite" aria-atomic="true">
                        <ClientWorkspaceIcon name="sessions" />
                        {detailGroupSessionsLoading ? '…' : clientsCopy.sessionsCount(currentGroupSessions.length)}
                      </span>
                    </div>
                    {detailGroupSessionsLoading ? (
                      <div className="muted">{clientsCopy.loadingSessions}</div>
                    ) : currentGroupSessions.length === 0 ? (
                        <div className="clients-detail-empty-card">
                          <EmptyState
                            title={groupSessionTab === 'future' ? clientsCopy.noUpcomingSessionsTitle : groupSessionTab === 'past' ? clientsCopy.noPastSessionsTitle : clientsCopy.noCancelledSessionsTitle}
                            text={groupSessionTab === 'future' ? clientsCopy.noUpcomingSessionsText : groupSessionTab === 'past' ? clientsCopy.noPastSessionsText : clientsCopy.noCancelledSessionsText}
                          />
                        </div>
                      ) : (
                        <div className="clients-modern-session-list">
                          {currentGroupSessions.map((s) => {
                            const lifecycleStatus = deriveSessionLifecycleStatus(s)
                            const sessionStatusTone = lifecycleStatus === 'CANCELLED'
                              ? 'cancelled'
                              : lifecycleStatus === 'NO_SHOW'
                                ? 'no-show'
                                : lifecycleStatus === 'ONGOING'
                                  ? 'ongoing'
                                  : lifecycleStatus === 'CHECKED_OUT'
                                    ? 'checked_out'
                                    : 'reserved'
                            const consultantName = fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })
                            return (
                              <article
                                key={s.id}
                                className="clients-modern-session-row"
                                onClick={() => navigate(`/calendar/booking/${s.id}`)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    navigate(`/calendar/booking/${s.id}`)
                                  }
                                }}
                              >
                                <div className="clients-modern-session-icon" aria-hidden>
                                  <ClientWorkspaceIcon name="sessions" />
                                </div>
                                <div className="clients-modern-session-title">
                                  <strong>{sessionTitle(s)}</strong>
                                  <span>{formatDate(s.startTime)}</span>
                                </div>
                                <div className="clients-modern-session-info">
                                  <span>{locale === 'sl' ? 'Ura' : 'Time'}</span>
                                  <strong>{formatShortTime(s.startTime)} – {formatShortTime(s.endTime)}</strong>
                                </div>
                                <div className="clients-modern-session-info">
                                  <span>{locale === 'sl' ? 'Lokacija' : 'Location'}</span>
                                  <strong>{sessionLocation(s)}</strong>
                                </div>
                                <div className="clients-modern-session-info">
                                  <span>{locale === 'sl' ? 'Izvajalec' : 'Instructor'}</span>
                                  <strong>{consultantName || '—'}</strong>
                                </div>
                                <span className={`clients-modern-session-status clients-modern-session-status--${sessionStatusTone}`}>
                                  {lifecycleStatus === 'CANCELLED'
                                    ? 'CANCELLED'
                                    : lifecycleStatus === 'NO_SHOW'
                                      ? 'NO SHOW'
                                      : lifecycleStatus === 'ONGOING'
                                        ? 'ONGOING'
                                        : lifecycleStatus === 'CHECKED_OUT'
                                          ? 'CHECKED OUT'
                                          : 'RESERVED'}
                                </span>
                              </article>
                            )
                          })}
                        </div>
                      )}
                  </div>
                )}

                {groupDetailMainTab === 'settings' && (
                  <div className="clients-action-workspace-settings" onClick={(e) => e.stopPropagation()} role="tabpanel">
                    <div className="clients-detail-fields clients-action-workspace-settings-grid clients-action-workspace-settings-switches">
                    {renderGroupEditableField('billingCompanyId', clientsCopy.linkedCompany, true)}
                    <div className="clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.batchPayment}</span>
                      <button
                        type="button"
                        className={`clients-batch-switch${groupDetailEditDraft.batchPaymentEnabled ? ' clients-batch-switch--on' : ''}`}
                        onClick={() => setGroupDetailEditDraft({ ...groupDetailEditDraft, batchPaymentEnabled: !groupDetailEditDraft.batchPaymentEnabled })}
                        aria-pressed={groupDetailEditDraft.batchPaymentEnabled}
                      >
                        {groupDetailEditDraft.batchPaymentEnabled ? clientsCopy.toggleOn : clientsCopy.toggleOff}
                      </button>
                    </div>
                    <div className="clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.individualPayment}</span>
                      <button
                        type="button"
                        className={`clients-batch-switch${groupDetailEditDraft.individualPaymentEnabled ? ' clients-batch-switch--on' : ''}`}
                        onClick={() => setGroupDetailEditDraft({ ...groupDetailEditDraft, individualPaymentEnabled: !groupDetailEditDraft.individualPaymentEnabled })}
                        aria-pressed={groupDetailEditDraft.individualPaymentEnabled}
                      >
                        {groupDetailEditDraft.individualPaymentEnabled ? clientsCopy.toggleOn : clientsCopy.toggleOff}
                      </button>
                    </div>
                  </div>
                  </div>
                )}
              </div>
            </div>
            {groupDetailHasChanges && (
              <div className="clients-action-workspace-footer">
                <button
                  type="button"
                  className="clients-gapp-save-button"
                  onClick={() => void saveDetailGroupInline()}
                  disabled={savingGroupDetailEdit}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M17 21v-8H7v8" />
                    <path d="M7 3v5h8" />
                  </svg>
                  {savingGroupDetailEdit ? clientsCopy.savingChanges : clientsCopy.saveChanges}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!embeddedDetailMode && showGroupModal && (
        <div
          className={`modal-backdrop clients-action-workspace-backdrop${embeddedDetailMode ? ' clients-action-workspace-backdrop--embedded' : ''}${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onMouseDown={onSidePanelBackdropMouseDown(() => setShowGroupModal(false))}
          role="presentation"
        >
          <div
            className="modal large-modal clients-tab-client-detail-modal clients-action-workspace-modal clients-create-modal clients-group-create-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form className="clients-create-modal-form" onSubmit={(e) => { e.preventDefault(); handleCreateGroup() }}>
              <div className="clients-action-workspace-header">
                <div className="clients-action-workspace-client">
                  <span className="clients-name-avatar clients-detail-avatar clients-action-workspace-avatar" aria-hidden>{(groupForm.name?.[0] || 'G').toUpperCase()}</span>
                  <div className="clients-name-stack clients-action-workspace-title-stack">
                    <span className="clients-name">{groupForm.name.trim() || clientsCopy.newGroupTitle}</span>
                    <span className="clients-id">ID #— <span className="clients-action-workspace-status-dot" /> {activeStatusLabel}</span>
                  </div>
                </div>
                <button type="button" className="secondary clients-action-workspace-close" onClick={() => setShowGroupModal(false)} aria-label={t('mobileNavClose')}>
                  ×
                </button>
              </div>
              <div className="clients-action-workspace-body">
                <div className="clients-detail-shell clients-create-shell clients-action-workspace-shell">
                  <div className="clients-detail-fields clients-create-fields clients-action-workspace-profile-fields">
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.groupName}</span>
                      <input required value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.groupEmail}</span>
                      <input type="email" value={groupForm.email} onChange={(e) => setGroupForm({ ...groupForm, email: e.target.value })} />
                    </label>
                  </div>

                  {groupErrorMessage && <div className="error">{groupErrorMessage}</div>}
                </div>
              </div>
              <div className="form-actions clients-action-workspace-footer clients-create-footer clients-create-footer--single">
                <button type="submit" className="clients-gapp-save-button" disabled={savingGroup || !groupForm.name.trim()}>
                  {savingGroup ? clientsCopy.saving : clientsCopy.createGroup}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {portalClientMenuTarget != null &&
        clientMenuAnchorRect != null &&
        createPortal(
          <div
            className="clients-card-menu-popover"
            role="dialog"
            aria-label={clientsCopy.clientActionsAria}
            style={clientsOverflowMenuFixedStyle(
              clientMenuAnchorRect,
              portalClientMenuTarget.anonymized ? 56 : 112
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void toggleClientActiveById(portalClientMenuTarget.id, portalClientMenuTarget.active !== false)
              }}
              disabled={
                activatingClientId === portalClientMenuTarget.id ||
                anonymizingClientId === portalClientMenuTarget.id ||
                (portalClientMenuTarget.active !== false && portalClientMenuTarget.removalBlocked)
              }
              title={
                portalClientMenuTarget.active !== false && portalClientMenuTarget.removalBlocked
                  ? clientsCopy.removalBlockedHint
                  : undefined
              }
            >
              {activatingClientId === portalClientMenuTarget.id
                ? clientsCopy.saving
                : portalClientMenuTarget.active !== false
                  ? clientsCopy.deactivate
                  : clientsCopy.activate}
            </button>
            {!portalClientMenuTarget.anonymized ? (
              <button
                type="button"
                className="danger"
                disabled={anonymizingClientId === portalClientMenuTarget.id || activatingClientId === portalClientMenuTarget.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setAnonymizeConfirmClientId(portalClientMenuTarget.id)
                  setOpenClientMenuId(null)
                }}
              >
                {anonymizingClientId === portalClientMenuTarget.id ? clientsCopy.anonymizing : clientsCopy.anonymize}
              </button>
            ) : null}
          </div>,
          document.body
        )}

      {portalCompanyMenuTarget != null &&
        companyMenuAnchorRect != null &&
        createPortal(
          <div
            className="clients-card-menu-popover"
            role="dialog"
            aria-label={clientsCopy.companyActionsAria}
            style={clientsOverflowMenuFixedStyle(companyMenuAnchorRect, 88)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void toggleCompanyActiveById(portalCompanyMenuTarget.id, portalCompanyMenuTarget.active !== false)
              }}
              disabled={activatingCompanyId === portalCompanyMenuTarget.id}
            >
              {activatingCompanyId === portalCompanyMenuTarget.id
                ? clientsCopy.saving
                : portalCompanyMenuTarget.active !== false
                  ? clientsCopy.deactivate
                  : clientsCopy.activate}
            </button>
          </div>,
          document.body
        )}

      {portalGroupMenuTarget != null &&
        groupMenuAnchorRect != null &&
        createPortal(
          <div
            className="clients-card-menu-popover"
            role="dialog"
            aria-label={clientsCopy.groupActionsAria}
            style={clientsOverflowMenuFixedStyle(groupMenuAnchorRect, 88)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void toggleGroupActiveById(portalGroupMenuTarget.id, portalGroupMenuTarget.active !== false)
              }}
              disabled={activatingGroupId === portalGroupMenuTarget.id}
            >
              {activatingGroupId === portalGroupMenuTarget.id
                ? clientsCopy.saving
                : portalGroupMenuTarget.active !== false
                  ? clientsCopy.deactivate
                  : clientsCopy.activate}
            </button>
          </div>,
          document.body
        )}

      {anonymizeConfirmClientId != null && (
        <div
          className="modal-backdrop clients-anonymize-confirm-backdrop"
          onClick={() => setAnonymizeConfirmClientId(null)}
          role="presentation"
        >
          <div
            className="clients-anonymize-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={clientsCopy.anonymizeConfirmDialogAria}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="clients-anonymize-confirm-message">{clientsCopy.confirmAnonymizeClient}</p>
            <div className="clients-anonymize-confirm-actions">
              <button
                type="button"
                className="clients-anonymize-confirm-ok"
                onClick={() => {
                  const id = anonymizeConfirmClientId
                  setAnonymizeConfirmClientId(null)
                  void anonymizeClientById(id)
                }}
              >
                {clientsCopy.confirmAnonymizeOk}
              </button>
              <button
                type="button"
                className="clients-anonymize-confirm-cancel"
                onClick={() => setAnonymizeConfirmClientId(null)}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
