import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
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
  assignedToId?: number
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
}

type ClientWalletEntitlement = {
  id: number
  productName: string
  entitlementType: string | null
  remainingUses: number | null
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
}

type ClientWalletResponse = {
  activeEntitlements: ClientWalletEntitlement[]
  inactiveEntitlements: ClientWalletEntitlement[]
  usageHistory: ClientWalletUsage[]
}

const emptyClientForm: ClientForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  whatsappOptIn: false,
  viberConnected: false,
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
  if (last >= 2 && last <= 4) return 'termina'
  return 'terminov'
}

export function ClientsPage() {
  const { t, locale } = useLocale()
  const compactCreateModalHeader = useCalendarFiltersBottomBar()
  /** Match `clients-tab-client-detail-modal` header CSS (title hidden, close left). */
  const clientDetailCompactHeader = useMediaMaxWidth(768)
  const clientsCopy = locale === 'sl' ? {
    details: 'Podrobnosti',
    client: 'STRANKA',
    company: 'PODJETJE',
    newButtonMobile: '+ Novo',
    newButton: 'Novo',
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
    sessionsCount: (count: number) => `${count} ${slovenianTerminCountForm(count)}`,
    loadingSessions: 'Nalagam termine…',
    noUpcomingSessionsTitle: 'Ni prihodnjih terminov',
    noUpcomingSessionsText: 'Tukaj se prikažejo rezervirani termini z začetkom po trenutnem času.',
    noPastSessionsTitle: 'Ni preteklih terminov',
    noPastSessionsText: 'Tukaj se prikažejo termini z začetkom pred ali ob trenutnem času.',
    liveSession: 'Termin v živo',
    start: 'Začetek',
    end: 'Konec',
    saveChanges: 'Shrani spremembe',
    savingChanges: 'Shranjujem spremembe…',
    saving: 'Shranjujem...',
    deactivate: 'Deaktiviraj',
    activate: 'Aktiviraj',
    anonymize: 'Anonimiziraj',
    anonymizing: 'Anonimiziram...',
    yesAnonymize: 'Da, anonimiziraj',
    confirmAnonymizeClient: 'Ali želite anonimizirati to stranko? Osebni podatki bodo izbrisani.',
    newClientTitle: 'Nova stranka',
    newClientName: 'Nova stranka',
    newClientSubtitle: 'Ustvari profil stranke in po potrebi poveži podatke za obračun.',
    messaging: 'Sporočanje',
    messagingNote: 'WhatsApp uporablja telefonsko številko stranke. Povezava z Viberjem bo na voljo, ko se stranka poveže z vašim Viber botom.',
    noLinkedCompany: 'Brez povezanega podjetja',
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
    companyActionsAria: 'Dejanja za podjetje',
  } : {
    details: 'Details',
    client: 'CLIENT',
    company: 'COMPANY',
    newButtonMobile: '+ New',
    newButton: 'New',
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
    sessionsCount: (count: number) => `${count} sessions`,
    loadingSessions: 'Loading sessions…',
    noUpcomingSessionsTitle: 'No upcoming sessions',
    noUpcomingSessionsText: 'Booked sessions with a start time after now appear here.',
    noPastSessionsTitle: 'No past sessions',
    noPastSessionsText: 'Sessions with a start time before or at now appear here.',
    liveSession: 'Live session',
    start: 'Start',
    end: 'End',
    saveChanges: 'Save changes',
    savingChanges: 'Saving changes…',
    saving: 'Saving...',
    deactivate: 'Deactivate',
    activate: 'Activate',
    anonymize: 'Anonymize',
    anonymizing: 'Anonymizing...',
    yesAnonymize: 'Yes, anonymize',
    confirmAnonymizeClient: 'Anonymize this client? Personal details will be cleared.',
    newClientTitle: 'New client',
    newClientName: 'New client',
    newClientSubtitle: 'Create a client profile and link billing details if needed.',
    messaging: 'Messaging',
    messagingNote: 'WhatsApp uses the client phone number. Viber linking becomes available after the client connects to your Viber bot.',
    noLinkedCompany: 'No linked company',
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
    companyActionsAria: 'Company actions',
  }
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN'
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
  const [sessionTab, setSessionTab] = useState<'future' | 'past'>('future')
  const [clientDetailMainTab, setClientDetailMainTab] = useState<'sessions' | 'wallet' | 'files' | 'settings'>('sessions')
  const [companyDetailMainTab, setCompanyDetailMainTab] = useState<'datoteke' | 'nastavitve'>('datoteke')
  const [companyDetailDatotekeSubTab, setCompanyDetailDatotekeSubTab] = useState<'racuni' | 'splosno'>('splosno')
  const [anonymizingClientId, setAnonymizingClientId] = useState<number | null>(null)
  const [activatingClientId, setActivatingClientId] = useState<number | null>(null)
  const [activatingCompanyId, setActivatingCompanyId] = useState<number | null>(null)
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive'>('active')
  const [companyActiveFilter, setCompanyActiveFilter] = useState<'active' | 'inactive'>('active')
  const [detailEditField, setDetailEditField] = useState<'firstName' | 'lastName' | 'email' | 'phone' | 'billingCompanyId' | null>(null)
  const [detailEditDraft, setDetailEditDraft] = useState<{
    firstName: string
    lastName: string
    email: string
    phone: string
    whatsappOptIn: boolean
    batchPaymentEnabled: boolean
    billingCompanyId: number | null
  }>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    whatsappOptIn: false,
    batchPaymentEnabled: false,
    billingCompanyId: null,
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
  const clientFilesDropDepth = useRef(0)
  const companyFilesDropDepth = useRef(0)
  const [isClientsMobile, setIsClientsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false,
  )
  const [openClientMenuId, setOpenClientMenuId] = useState<number | null>(null)
  const [openCompanyMenuId, setOpenCompanyMenuId] = useState<number | null>(null)

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
  const [groupSessionTab, setGroupSessionTab] = useState<'future' | 'past'>('future')
  const [groupDetailMainTab, setGroupDetailMainTab] = useState<'sessions' | 'settings'>('sessions')
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
  const [activatingGroup, setActivatingGroup] = useState(false)
  const [groupMemberSearch, setGroupMemberSearch] = useState('')
  const [groupMemberDropdownOpen, setGroupMemberDropdownOpen] = useState(false)
  const [pendingGroupMemberIds, setPendingGroupMemberIds] = useState<number[]>([])
  const [addingMember, setAddingMember] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const groupBookingEnabled = settings.GROUP_BOOKING_ENABLED === 'true'

  const companyInvoiceStatusPill = (bill: CompanyBillSummary): { label: string; variant: 'paid' | 'payment-pending' | 'fiscal-failed' } | null => {
    if (bill.fiscalStatus === 'FAILED') return { label: 'FISCAL FAILED', variant: 'fiscal-failed' }
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
    const mq = window.matchMedia('(max-width: 450px)')
    const apply = () => setIsClientsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (openClientMenuId == null && openCompanyMenuId == null) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.clients-card-menu-wrap')) return
      setOpenClientMenuId(null)
      setOpenCompanyMenuId(null)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openClientMenuId, openCompanyMenuId])

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
    let cancelled = false
    setDetailWalletLoading(true)
    setDetailWalletError('')
    setDetailWallet(null)
    api
      .get<ClientWalletResponse>(`/clients/${detailClient.id}/wallet`)
      .then((res) => {
        if (!cancelled) setDetailWallet(res.data ?? { activeEntitlements: [], inactiveEntitlements: [], usageHistory: [] })
      })
      .catch(() => {
        if (!cancelled) setDetailWalletError('Failed to load wallet.')
      })
      .finally(() => {
        if (!cancelled) setDetailWalletLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailClient])

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
    if (!detailClient) return
    let cancelled = false
    setDetailWalletLoading(true)
    setDetailWalletError('')
    setDetailWallet(null)
    api
      .get<ClientWalletResponse>(`/clients/${detailClient.id}/wallet`)
      .then((res) => {
        if (!cancelled) setDetailWallet(res.data ?? { activeEntitlements: [], inactiveEntitlements: [], usageHistory: [] })
      })
      .catch(() => {
        if (!cancelled) setDetailWalletError('Failed to load wallet.')
      })
      .finally(() => {
        if (!cancelled) setDetailWalletLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailClient])

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
    return detailGroupSessions.filter((s) => new Date(s.startTime) > now).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [detailGroupSessions])

  const pastGroupSessions = useMemo(() => {
    const now = new Date()
    return detailGroupSessions.filter((s) => new Date(s.startTime) <= now).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }, [detailGroupSessions])

  const futureSessions = useMemo(() => {
    const now = new Date();
    return detailSessions
      .filter((s) => new Date(s.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [detailSessions]);

  const pastSessions = useMemo(() => {
    const now = new Date();
    return detailSessions
      .filter((s) => new Date(s.startTime) <= now)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [detailSessions]);

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
  }, [detailClient, detailEditDraft])

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
    setErrorMessage('')
    setShowModal(true)
  }

  const openDetailModal = (c: Client) => {
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
    })
    setSessionTab('future')
    setClientDetailMainTab('sessions')
  }

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
    setGroupDetailMainTab('sessions')
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
  }

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
      }
      setPendingGroupMemberIds([])
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

  const handleActivateGroup = async (activate: boolean) => {
    if (!detailGroup || activatingGroup) return
    setActivatingGroup(true)
    try {
      const response = await api.patch<ClientGroup>(`/groups/${detailGroup.id}/${activate ? 'activate' : 'deactivate'}`)
      const updated = response.data
      setDetailGroup(updated)
      setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g))
    } catch { /* ignore */ } finally {
      setActivatingGroup(false)
    }
  }

  const closeDetailModal = () => {
    setDetailClient(null)
    setDetailSessions([])
    setDetailClientFiles([])
    setDetailSessionsError('')
    setDetailClientFilesError('')
    setDetailEditField(null)
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
        assignedToId: detailClient.assignedTo?.id ?? consultants[0]?.id,
      }
      const response = await api.put<Client>(`/clients/${detailClient.id}`, payload)
      setDetailClient(response.data)
      setDetailEditDraft({
        firstName: response.data.firstName ?? '',
        lastName: response.data.lastName ?? '',
        email: response.data.email ?? '',
        phone: response.data.phone ?? '',
        whatsappOptIn: response.data.whatsappOptIn ?? false,
        batchPaymentEnabled: response.data.batchPaymentEnabled ?? false,
        billingCompanyId: response.data.billingCompany?.id ?? null,
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
    companyFilesDropDepth.current = 0
    setCompanyFilesDropActive(false)
  }

  const renderClientEditableField = (
    key: 'firstName' | 'lastName' | 'email' | 'phone' | 'billingCompanyId',
    label: string,
    wide = false,
  ) => {
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
                <option value="">No linked company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            ) : (
              <input
                autoFocus
                value={detailEditDraft[key] ?? ''}
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
                {companies.map((company) => (
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
    setErrorMessage('')
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this client?')) return
    setErrorMessage('')
    try {
      await api.delete(`/clients/${id}`)
      await loadClients()
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || 'Failed to delete client.')
    }
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
        whatsappOptIn: form.whatsappOptIn,
        assignedToId: isAdmin ? (form.assignedToId ?? consultants[0]?.id) : undefined,
        preferredSlots: [],
      }

      const body = { ...payload, billingCompanyId: form.billingCompanyId ?? null }
      await api.post('/clients', body)

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

  const toggleCompanyActive = () => {
    if (!detailCompany) return
    void toggleCompanyActiveById(detailCompany.id, detailCompany.active !== false)
  }

  const pickFile = (handler: (file: File) => void) => {
    const input = document.createElement('input')
    input.type = 'file'
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
    if (file.size > MAX_CLIENT_OR_COMPANY_FILE_BYTES) {
      setDetailClientFilesError(clientsCopy.fileTooLarge)
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

  const renderClientRowOverflowMenu = (c: Client) => {
    const isAnonymizing = anonymizingClientId === c.id
    const isActivating = activatingClientId === c.id
    return (
      <div className="clients-card-menu-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="secondary clients-card-menu-trigger"
          onClick={(e) => {
            e.stopPropagation()
            setOpenCompanyMenuId(null)
            setOpenClientMenuId((prev) => (prev === c.id ? null : c.id))
          }}
          aria-label={clientsCopy.clientActionsAria}
          aria-expanded={openClientMenuId === c.id}
        >
          ⋯
        </button>
        {openClientMenuId === c.id && (
          <div className="clients-card-menu-popover" role="dialog" aria-label={clientsCopy.clientActionsAria}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void toggleClientActiveById(c.id, c.active !== false)
              }}
              disabled={isActivating || isAnonymizing}
            >
              {isActivating ? clientsCopy.saving : (c.active !== false ? clientsCopy.deactivate : clientsCopy.activate)}
            </button>
            {!c.anonymized ? (
              <button
                type="button"
                className="danger"
                disabled={isAnonymizing || isActivating}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!window.confirm(clientsCopy.confirmAnonymizeClient)) return
                  void anonymizeClientById(c.id)
                }}
              >
                {isAnonymizing ? clientsCopy.anonymizing : clientsCopy.anonymize}
              </button>
            ) : null}
            <button
              type="button"
              className="danger"
              disabled={isAnonymizing || isActivating}
              onClick={(e) => {
                e.stopPropagation()
                setOpenClientMenuId(null)
                void remove(c.id)
              }}
            >
              {t('formDelete')}
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderCompanyRowOverflowMenu = (c: Company) => {
    const isActivating = activatingCompanyId === c.id
    return (
      <div className="clients-card-menu-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="secondary clients-card-menu-trigger"
          onClick={(e) => {
            e.stopPropagation()
            setOpenClientMenuId(null)
            setOpenCompanyMenuId((prev) => (prev === c.id ? null : c.id))
          }}
          aria-label={clientsCopy.companyActionsAria}
          aria-expanded={openCompanyMenuId === c.id}
        >
          ⋯
        </button>
        {openCompanyMenuId === c.id && (
          <div className="clients-card-menu-popover" role="dialog" aria-label={clientsCopy.companyActionsAria}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void toggleCompanyActiveById(c.id, c.active !== false)
              }}
              disabled={isActivating}
            >
              {isActivating ? clientsCopy.saving : (c.active !== false ? clientsCopy.deactivate : clientsCopy.activate)}
            </button>
          </div>
        )}
      </div>
    )
  }

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

  return (
    <div className="stack gap-lg">
      <Card className={isClientsMobile ? 'clients-mobile-shell' : ''}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
            <button type="button" className={entityTab === 'clients' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setEntityTab('clients')}>{t('clientsTabClients')}</button>
            <button type="button" className={entityTab === 'companies' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setEntityTab('companies')}>{t('clientsTabCompanies')}</button>
            {groupBookingEnabled && <button type="button" className={entityTab === 'groups' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setEntityTab('groups')}>{clientsCopy.groupsTab}</button>}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={entityTab === 'clients' ? openNewModal : entityTab === 'companies' ? openNewCompanyModal : () => { setGroupForm({ name: '', email: '' }); setGroupErrorMessage(''); setShowGroupModal(true) }}
          >
            {isClientsMobile ? clientsCopy.newButtonMobile : clientsCopy.newButton}
          </button>
        </div>
        {entityTab === 'clients' ? (
          <>
        <div className="clients-toolbar">
          <div className="clients-search-wrap">
            <input
              className="clients-search-input"
              placeholder={clientsCopy.searchClientsPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="clients-search-icon" aria-hidden>⌕</span>
          </div>
          <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
            <button type="button" className={activeFilter === 'active' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setActiveFilter('active')}>{clientsCopy.activeFilter}</button>
            <button type="button" className={activeFilter === 'inactive' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setActiveFilter('inactive')}>{clientsCopy.inactive}</button>
          </div>
          <div className={`clients-count-chip${isClientsMobile ? ' clients-count-chip--mobile-open' : ''}`}>{clientsCopy.listClientsCount(filteredClients.length)}</div>
        </div>
        {errorMessage && !showModal && <div className="error">{errorMessage}</div>}
        {loading ? (
          <div className="muted">Loading clients...</div>
        ) : filteredClients.length === 0 ? (
          <EmptyState title={clientsCopy.emptyClientsTitle} text={clientsCopy.emptyClientsText} />
        ) : (
          <div className="clients-list-shell">
            <div className="clients-mobile-list">
              {filteredClients.map((c) => (
                <article key={c.id} className="clients-mobile-card" onClick={() => openDetailModal(c)}>
                  <div className="clients-mobile-card-head">
                    <div className="clients-name-cell">
                      <span className="clients-name-avatar" aria-hidden>
                        {(c.firstName?.[0] || '').toUpperCase()}{(c.lastName?.[0] || '').toUpperCase()}
                      </span>
                      <div className="clients-name-stack">
                        <span className="clients-name">{fullName(c)}{c.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                        <span className="clients-id">ID #{c.id}{isAdmin ? clientsCopy.assignedToLine(c.assignedTo ? fullName(c.assignedTo) : '—') : ''}</span>
                      </div>
                    </div>
                    {renderClientRowOverflowMenu(c)}
                  </div>
                  <div className="clients-mobile-meta">
                    <div>
                      <span>{clientsCopy.email}</span>
                      {c.email?.trim() ? (
                        <strong>
                          <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>
                            {c.email.trim()}
                          </a>
                        </strong>
                      ) : (
                        <strong>—</strong>
                      )}
                    </div>
                    <div>
                      <span>{clientsCopy.phone}</span>
                      {c.phone?.trim() ? (
                        <strong>
                          <a href={contactTelHref(c.phone)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>
                            {c.phone.trim()}
                          </a>
                        </strong>
                      ) : (
                        <strong>—</strong>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>{clientsCopy.tableHeaderName}</th>
                    <th>{clientsCopy.email}</th>
                    <th>{clientsCopy.tableHeaderPhone}</th>
                    {isAdmin && <th>{clientsCopy.tableHeaderAssigned}</th>}
                    <th>{clientsCopy.tableHeaderCreated}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((c) => (
                    <tr key={c.id} className="clients-row" onClick={() => openDetailModal(c)}>
                      <td>
                        <div className="clients-name-cell">
                          <span className="clients-name-avatar" aria-hidden>
                            {(c.firstName?.[0] || '').toUpperCase()}{(c.lastName?.[0] || '').toUpperCase()}
                          </span>
                          <div className="clients-name-stack">
                            <span className="clients-name">{fullName(c)}{c.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                            <span className="clients-id">ID #{c.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="clients-muted">
                        {c.email?.trim() ? (
                          <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>
                            {c.email.trim()}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="clients-muted">
                        {c.phone?.trim() ? (
                          <a href={contactTelHref(c.phone)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>
                            {c.phone.trim()}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      {isAdmin && <td className="clients-muted">{c.assignedTo ? fullName(c.assignedTo) : '—'}</td>}
                      <td className="clients-muted">{formatDate(c.createdAt)}</td>
                      <td className="clients-actions">
                        <div className="clients-actions-inner">{renderClientRowOverflowMenu(c)}</div>
                      </td>
                    </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </>
        ) : entityTab === 'companies' ? (
          <>
            <div className="clients-toolbar">
              <div className="clients-search-wrap">
                <input
                  className="clients-search-input"
                  placeholder={clientsCopy.searchCompaniesPlaceholder}
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                />
                <span className="clients-search-icon" aria-hidden>⌕</span>
              </div>
              <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
                <button type="button" className={companyActiveFilter === 'active' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setCompanyActiveFilter('active')}>{clientsCopy.activeFilter}</button>
                <button type="button" className={companyActiveFilter === 'inactive' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setCompanyActiveFilter('inactive')}>{clientsCopy.inactive}</button>
              </div>
              <div className={`clients-count-chip${isClientsMobile ? ' clients-count-chip--mobile-open' : ''}`}>{clientsCopy.listCompaniesCount(filteredCompanies.length)}</div>
            </div>
            {companyErrorMessage && !showCompanyModal && <div className="error">{companyErrorMessage}</div>}
            {loadingCompanies ? (
              <div className="muted">Loading companies...</div>
            ) : filteredCompanies.length === 0 ? (
              <EmptyState title={clientsCopy.emptyCompaniesTitle} text={clientsCopy.emptyCompaniesText} />
            ) : (
              <div className="clients-list-shell">
                <div className="clients-mobile-list">
                  {filteredCompanies.map((c) => (
                    <article key={c.id} className="clients-mobile-card" onClick={() => openCompanyDetailModal(c)}>
                      <div className="clients-mobile-card-head">
                        <div className="clients-name-cell">
                          <span className="clients-name-avatar" aria-hidden>{(c.name?.[0] || 'C').toUpperCase()}</span>
                          <div className="clients-name-stack">
                            <span className="clients-name">{c.name}{c.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                            <span className="clients-id">ID #{c.id}</span>
                          </div>
                        </div>
                        {renderCompanyRowOverflowMenu(c)}
                      </div>
                      <div className="clients-mobile-meta">
                        <div>
                          <span>{clientsCopy.email}</span>
                          {c.email?.trim() ? (
                            <strong>
                              <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>
                                {c.email.trim()}
                              </a>
                            </strong>
                          ) : (
                            <strong>—</strong>
                          )}
                        </div>
                        <div>
                          <span>{clientsCopy.phone}</span>
                          {c.telephone?.trim() ? (
                            <strong>
                              <a href={contactTelHref(c.telephone)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>
                                {c.telephone.trim()}
                              </a>
                            </strong>
                          ) : (
                            <strong>—</strong>
                          )}
                        </div>
                        <div><span>{clientsCopy.city}</span><strong>{c.city || '—'}</strong></div>
                        <div><span>{clientsCopy.vatId}</span><strong>{c.vatId || '—'}</strong></div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                  <table className="clients-table">
                    <thead>
                    <tr>
                      <th>{clientsCopy.companyName}</th>
                      <th>{clientsCopy.email}</th>
                      <th>{clientsCopy.telephone}</th>
                      <th>{clientsCopy.city}</th>
                      <th>{clientsCopy.vatId}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredCompanies.map((c) => (
                      <tr key={c.id} className="clients-row" onClick={() => openCompanyDetailModal(c)}>
                        <td>
                          <div className="clients-name-cell">
                            <span className="clients-name-avatar" aria-hidden>{(c.name?.[0] || 'C').toUpperCase()}</span>
                            <div className="clients-name-stack">
                              <span className="clients-name">{c.name}{c.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                              <span className="clients-id">ID #{c.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="clients-muted">
                          {c.email?.trim() ? (
                            <a href={contactMailtoHref(c.email)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>
                              {c.email.trim()}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="clients-muted">
                          {c.telephone?.trim() ? (
                            <a href={contactTelHref(c.telephone)} className="clients-contact-link" onClick={(e) => e.stopPropagation()}>
                              {c.telephone.trim()}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="clients-muted">{c.city || '—'}</td>
                        <td className="clients-muted">{c.vatId || '—'}</td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : entityTab === 'groups' && groupBookingEnabled ? (
          <>
            <div className="clients-toolbar">
              <div className="clients-search-wrap">
                <input
                  className="clients-search-input"
                  placeholder={clientsCopy.searchGroupsPlaceholder}
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                />
                <span className="clients-search-icon" aria-hidden>⌕</span>
              </div>
              <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
                <button type="button" className={groupActiveFilter === 'active' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setGroupActiveFilter('active')}>{clientsCopy.activeFilter}</button>
                <button type="button" className={groupActiveFilter === 'inactive' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setGroupActiveFilter('inactive')}>{clientsCopy.inactive}</button>
              </div>
              <div className={`clients-count-chip${isClientsMobile ? ' clients-count-chip--mobile-open' : ''}`}>{clientsCopy.listGroupsCount(filteredGroups.length)}</div>
            </div>
            {groupErrorMessage && !showGroupModal && <div className="error">{groupErrorMessage}</div>}
            {loadingGroups ? (
              <div className="muted">Loading groups...</div>
            ) : filteredGroups.length === 0 ? (
              <EmptyState title={clientsCopy.emptyGroupsTitle} text={clientsCopy.emptyGroupsText} />
            ) : (
              <div className="clients-list-shell">
                <div className="clients-mobile-list">
                  {filteredGroups.map((g) => (
                    <article key={g.id} className="clients-mobile-card" onClick={() => openGroupDetailModal(g)}>
                      <div className="clients-mobile-card-head">
                        <div className="clients-name-cell">
                          <span className="clients-name-avatar" aria-hidden>{(g.name?.[0] || 'G').toUpperCase()}</span>
                          <div className="clients-name-stack">
                            <span className="clients-name">{g.name}{g.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                            <span className="clients-id">ID #{g.id} · {(g.members ?? []).length} {clientsCopy.groupMembers.toLowerCase()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="clients-mobile-meta">
                        <div><span>{clientsCopy.email}</span><strong>{g.email || '—'}</strong></div>
                        <div><span>{clientsCopy.groupMembers}</span><strong>{(g.members ?? []).length}</strong></div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                  <table className="clients-table">
                    <thead>
                    <tr>
                      <th>{clientsCopy.groupName}</th>
                      <th>{clientsCopy.email}</th>
                      <th>{clientsCopy.groupMembers}</th>
                      <th>{clientsCopy.tableHeaderCreated}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredGroups.map((g) => (
                      <tr key={g.id} className="clients-row" onClick={() => openGroupDetailModal(g)}>
                        <td>
                          <div className="clients-name-cell">
                            <span className="clients-name-avatar" aria-hidden>{(g.name?.[0] || 'G').toUpperCase()}</span>
                            <div className="clients-name-stack">
                              <span className="clients-name">{g.name}{g.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                              <span className="clients-id">ID #{g.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="clients-muted">{g.email || '—'}</td>
                        <td className="clients-muted">{(g.members ?? []).length}</td>
                        <td className="clients-muted">{formatDate(g.createdAt)}</td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </Card>

      {detailClient && (
        <div
          className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop'}`}
          onClick={closeDetailModal}
        >
          <div
            className={`modal large-modal clients-tab-client-detail-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${clientDetailCompactHeader ? ' booking-side-panel-header--compact-booking' : ''}`}>
              {clientDetailCompactHeader ? (
                <div className="booking-side-panel-header-toolbar">
                  <button type="button" className="secondary booking-side-panel-close" onClick={closeDetailModal} aria-label={t('mobileNavClose')}>
                    ×
                  </button>
                  {clientDetailHasChanges ? (
                    <button
                      type="button"
                      className="booking-side-panel-submit-check"
                      onClick={() => void saveDetailClientInline()}
                      disabled={savingDetailEdit}
                      aria-label={clientsCopy.saveChanges}
                      title={clientsCopy.saveChanges}
                    >
                      {savingDetailEdit ? (
                        <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  ) : null}
                </div>
              ) : (
                <PageHeader
                  title={clientsCopy.details}
                  subtitle={clientsCopy.client}
                  actions={
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeDetailModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                  }
                />
              )}
            </div>
            <div className={isNativeAndroid ? undefined : 'booking-side-panel-body'}>
              <div className="clients-detail-shell">
                <div className="clients-detail-hero clients-detail-head-card">
                  <span className="clients-name-avatar clients-detail-avatar" aria-hidden>
                    {(detailClient.firstName?.[0] || '').toUpperCase()}{(detailClient.lastName?.[0] || '').toUpperCase()}
                  </span>
                  <div className="clients-name-stack">
                    <span className="clients-name">{fullName(detailClient)}{detailClient.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                    <span className="clients-id">ID #{detailClient.id}</span>
                  </div>
                </div>

                <div className="clients-detail-fields">
                  {renderClientEditableField('firstName', clientsCopy.firstName)}
                  {renderClientEditableField('lastName', clientsCopy.lastName)}
                  {renderClientEditableField('email', clientsCopy.email, true)}
                  {renderClientEditableField('phone', clientsCopy.phone, true)}
                  {renderClientEditableField('billingCompanyId', clientsCopy.linkedCompany, true)}
                </div>

                <div className="clients-detail-main-tabs" onClick={(e) => e.stopPropagation()}>
                  <div className="clients-session-tabs clients-detail-main-tabs-inner" role="tablist" aria-label={clientsCopy.clientDetailMainTabsAria}>
                    <button
                      type="button"
                      role="tab"
                      className={clientDetailMainTab === 'sessions' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={clientDetailMainTab === 'sessions'}
                      onClick={() => setClientDetailMainTab('sessions')}
                    >
                      {clientsCopy.sessions}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={clientDetailMainTab === 'wallet' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={clientDetailMainTab === 'wallet'}
                      onClick={() => setClientDetailMainTab('wallet')}
                    >
                      {clientsCopy.clientDetailTabWallet}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={clientDetailMainTab === 'files' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={clientDetailMainTab === 'files'}
                      onClick={() => setClientDetailMainTab('files')}
                    >
                      {clientsCopy.files}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={clientDetailMainTab === 'settings' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={clientDetailMainTab === 'settings'}
                      onClick={() => setClientDetailMainTab('settings')}
                    >
                      {clientsCopy.clientDetailTabSettings}
                    </button>
                  </div>
                </div>

                {clientDetailMainTab === 'wallet' && (
                  <div className="clients-detail-sessions-card clients-detail-invoices-card" role="tabpanel">
                    {detailWalletError && <div className="error">{detailWalletError}</div>}
                    {detailWalletLoading ? (
                      <div className="muted">{clientsCopy.walletLoading}</div>
                    ) : (
                      <div className="clients-detail-wallet-stack">
                        <section className="clients-detail-wallet-section">
                          <div className="clients-detail-session-tabs-row">
                            <strong>{clientsCopy.walletActive}</strong>
                            <span className="clients-detail-sessions-tab-count">{detailWallet?.activeEntitlements?.length ?? 0}</span>
                          </div>
                          {!detailWallet || detailWallet.activeEntitlements.length === 0 ? (
                            <div className="clients-detail-empty-card">
                              <EmptyState title={clientsCopy.walletNoneActiveTitle} text={clientsCopy.walletNoneActiveText} />
                            </div>
                          ) : (
                            <div className="clients-detail-files-list">
                              {detailWallet.activeEntitlements.map((entitlement) => (
                                <article key={entitlement.id} className="clients-detail-file-item">
                                  <div className="clients-detail-file-main">
                                    <div className="clients-detail-file-name">{entitlement.productName}</div>
                                    <div className="clients-detail-file-meta">
                                      <span>{entitlement.entitlementType ?? 'ENTITLEMENT'}</span>
                                      <span>•</span>
                                      <span>{clientsCopy.walletRemainingUses}: {entitlement.remainingUses == null ? clientsCopy.walletUnlimited : entitlement.remainingUses}</span>
                                      {entitlement.validUntil ? <><span>•</span><span>{clientsCopy.walletValidUntil} {formatDate(entitlement.validUntil)}</span></> : null}
                                    </div>
                                    <div className="clients-detail-file-meta">
                                      {entitlement.validFrom ? <span>{clientsCopy.walletValidFrom} {formatDate(entitlement.validFrom)}</span> : null}
                                      {entitlement.createdAt ? <><span>•</span><span>{clientsCopy.walletCreated} {formatDate(entitlement.createdAt)}</span></> : null}
                                      {entitlement.sessionTypeName ? <><span>•</span><span>{clientsCopy.walletServiceType}: {entitlement.sessionTypeName}</span></> : null}
                                      {entitlement.sourceOrderId ? <><span>•</span><span>{clientsCopy.walletOrder} #{entitlement.sourceOrderId}</span></> : null}
                                      <><span>•</span><span>{clientsCopy.walletAutoRenew}: {entitlement.autoRenews ? clientsCopy.toggleOn : clientsCopy.toggleOff}</span></>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="clients-detail-wallet-section">
                          <div className="clients-detail-session-tabs-row">
                            <strong>{clientsCopy.walletInactive}</strong>
                            <span className="clients-detail-sessions-tab-count">{detailWallet?.inactiveEntitlements?.length ?? 0}</span>
                          </div>
                          {!detailWallet || detailWallet.inactiveEntitlements.length === 0 ? (
                            <div className="clients-detail-empty-card">
                              <EmptyState title={clientsCopy.walletNoneInactiveTitle} text={clientsCopy.walletNoneInactiveText} />
                            </div>
                          ) : (
                            <div className="clients-detail-files-list">
                              {detailWallet.inactiveEntitlements.map((entitlement) => (
                                <article key={entitlement.id} className="clients-detail-file-item">
                                  <div className="clients-detail-file-main">
                                    <div className="clients-detail-file-name">{entitlement.productName}</div>
                                    <div className="clients-detail-file-meta">
                                      <span>{clientsCopy.walletStatus}: {entitlement.status ?? '—'}</span>
                                      <span>•</span>
                                      <span>{clientsCopy.walletRemainingUses}: {entitlement.remainingUses == null ? clientsCopy.walletUnlimited : entitlement.remainingUses}</span>
                                      {entitlement.validUntil ? <><span>•</span><span>{clientsCopy.walletValidUntil} {formatDate(entitlement.validUntil)}</span></> : null}
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="clients-detail-wallet-section">
                          <div className="clients-detail-session-tabs-row">
                            <strong>{clientsCopy.walletUsageHistory}</strong>
                            <span className="clients-detail-sessions-tab-count">{detailWallet?.usageHistory?.length ?? 0}</span>
                          </div>
                          {!detailWallet || detailWallet.usageHistory.length === 0 ? (
                            <div className="clients-detail-empty-card">
                              <EmptyState title={clientsCopy.walletNoUsageTitle} text={clientsCopy.walletNoUsageText} />
                            </div>
                          ) : (
                            <div className="clients-detail-files-list">
                              {detailWallet.usageHistory.map((usage) => (
                                <article key={usage.id} className="clients-detail-file-item">
                                  <div className="clients-detail-file-main">
                                    <div className="clients-detail-file-name">{usage.productName}</div>
                                    <div className="clients-detail-file-meta">
                                      <span>{formatDateTime(usage.usedAt)}</span>
                                      <span>•</span>
                                      <span>{clientsCopy.walletUsedUnits}: {usage.unitsUsed}</span>
                                      {usage.bookingId ? <><span>•</span><span>{clientsCopy.walletBooking} #{usage.bookingId}</span></> : null}
                                      {usage.reason ? <><span>•</span><span>{usage.reason}</span></> : null}
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    )}
                  </div>
                )}

                {clientDetailMainTab === 'files' && (
                  <div className="clients-detail-sessions-card clients-detail-invoices-card" role="tabpanel">
                    <div className="clients-detail-files-toolbar">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => pickFile((file) => void uploadClientFile(file))}
                        disabled={uploadingClientFile}
                      >
                        {uploadingClientFile ? clientsCopy.uploadingFile : clientsCopy.uploadFile}
                      </button>
                    </div>
                    {detailClientFilesError && <div className="error">{detailClientFilesError}</div>}
                    <div
                      className={`clients-detail-file-drop-zone${clientFilesDropActive ? ' clients-detail-file-drop-zone--active' : ''}`}
                      onDragEnter={handleClientFilesDragEnter}
                      onDragLeave={handleClientFilesDragLeave}
                      onDragOver={handleClientFilesDragOver}
                      onDrop={(e) => void handleClientFilesDrop(e)}
                    >
                      <p className="muted clients-detail-file-drop-hint">{clientsCopy.dragDropFilesHint}</p>
                      {detailClientFilesLoading ? (
                        <div className="muted">{clientsCopy.loadingFiles}</div>
                      ) : detailClientFiles.length === 0 ? (
                        <div className="clients-detail-empty-card">
                          <EmptyState title={clientsCopy.noFilesTitle} text={clientsCopy.noClientFilesText} />
                        </div>
                      ) : (
                        <div className="clients-detail-files-list">
                          {detailClientFiles.map((file) => (
                            <article key={file.id} className="clients-detail-file-item">
                              <div className="clients-detail-file-main">
                                <div className="clients-detail-file-name" title={file.fileName}>{file.fileName}</div>
                                <div className="clients-detail-file-meta">
                                  <span>{formatFileSize(file.sizeBytes)}</span>
                                  <span>•</span>
                                  <span>{clientsCopy.uploaded} {file.uploadedAt ? formatDateTime(file.uploadedAt) : '—'}</span>
                                </div>
                              </div>
                              <div className="clients-detail-file-actions">
                                <button type="button" className="clients-detail-invoice-open" onClick={() => void downloadClientFile(file)}>
                                  {clientsCopy.openFile}
                                </button>
                                <button
                                  type="button"
                                  className="clients-detail-invoice-open clients-detail-file-remove"
                                  onClick={() => void removeClientFile(file)}
                                  disabled={deletingClientFileId === file.id}
                                >
                                  {deletingClientFileId === file.id ? clientsCopy.saving : clientsCopy.removeFile}
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {clientDetailMainTab === 'settings' && (
                  <div className="clients-detail-fields" onClick={(e) => e.stopPropagation()} role="tabpanel">
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
                )}

                {clientDetailMainTab === 'sessions' && (
                  <div className="clients-detail-sessions-card clients-detail-sessions-card--modern" role="tabpanel">
                    <div className="clients-detail-session-tabs-row">
                      <div className="clients-session-tabs">
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
                      </div>
                      <span
                        className="clients-detail-sessions-tab-count"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {detailSessionsLoading
                          ? '…'
                          : clientsCopy.sessionsCount(sessionTab === 'future' ? futureSessions.length : pastSessions.length)}
                      </span>
                    </div>
                    {detailSessionsError && <div className="error">{detailSessionsError}</div>}
                    {detailSessionsLoading ? (
                      <div className="muted">{clientsCopy.loadingSessions}</div>
                    ) : sessionTab === 'future' ? (
                      futureSessions.length === 0 ? (
                        <div className="clients-detail-empty-card">
                          <EmptyState title={clientsCopy.noUpcomingSessionsTitle} text={clientsCopy.noUpcomingSessionsText} />
                        </div>
                      ) : (
                        <div className="clients-detail-session-list">
                          {futureSessions.map((s) => (
                            <article key={s.id} className="clients-detail-session-card">
                              <div className="clients-detail-session-top clients-detail-session-top--modern">
                                <span className="clients-detail-session-no">#{s.id}</span>
                                <div className="clients-detail-session-heading">
                                  <strong>{fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })}</strong>
                                  <span>{clientsCopy.liveSession}</span>
                                </div>
                              </div>
                              <div className="clients-detail-session-times">
                                <div><span>{clientsCopy.start}</span><strong>{formatDateTime(s.startTime)}</strong></div>
                                <div><span>{clientsCopy.end}</span><strong>{formatDateTime(s.endTime)}</strong></div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )
                    ) : pastSessions.length === 0 ? (
                      <div className="clients-detail-empty-card">
                        <EmptyState title={clientsCopy.noPastSessionsTitle} text={clientsCopy.noPastSessionsText} />
                      </div>
                    ) : (
                      <div className="clients-detail-session-list">
                        {pastSessions.map((s) => (
                          <article key={s.id} className="clients-detail-session-card">
                            <div className="clients-detail-session-top clients-detail-session-top--modern">
                              <span className="clients-detail-session-no">#{s.id}</span>
                              <div className="clients-detail-session-heading">
                                <strong>{fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })}</strong>
                                <span>{clientsCopy.liveSession}</span>
                              </div>
                            </div>
                            <div className="clients-detail-session-times">
                              <div><span>{clientsCopy.start}</span><strong>{formatDateTime(s.startTime)}</strong></div>
                              <div><span>{clientsCopy.end}</span><strong>{formatDateTime(s.endTime)}</strong></div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!clientDetailCompactHeader && (
              <div
                className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-detail-footer clients-detail-footer--client-save-only`}
                style={{ marginTop: isNativeAndroid ? 16 : 0 }}
              >
                <div className="clients-detail-footer-center">
                  {clientDetailHasChanges && (
                    <button type="button" onClick={() => void saveDetailClientInline()} disabled={savingDetailEdit}>
                      {savingDetailEdit ? clientsCopy.savingChanges : clientsCopy.saveChanges}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {detailCompany && (
        <div
          className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop'}`}
          onClick={closeCompanyDetailModal}
        >
          <div
            className={`modal large-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${clientDetailCompactHeader ? ' booking-side-panel-header--compact-booking' : ''}`}>
              {clientDetailCompactHeader ? (
                <div className="booking-side-panel-header-toolbar">
                  <button type="button" className="secondary booking-side-panel-close" onClick={closeCompanyDetailModal} aria-label={t('mobileNavClose')}>
                    ×
                  </button>
                  {companyDetailHasChanges ? (
                    <button
                      type="button"
                      className="booking-side-panel-submit-check"
                      onClick={() => void saveDetailCompanyInline()}
                      disabled={savingCompanyDetailEdit}
                      aria-label={clientsCopy.saveChanges}
                      title={clientsCopy.saveChanges}
                    >
                      {savingCompanyDetailEdit ? (
                        <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  ) : null}
                </div>
              ) : (
                <PageHeader
                  title={clientsCopy.details}
                  subtitle={clientsCopy.company}
                  actions={
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeCompanyDetailModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                  }
                />
              )}
            </div>
            <div className={isNativeAndroid ? undefined : 'booking-side-panel-body'}>
              <div className="clients-detail-shell">
                <div className="clients-detail-hero clients-detail-head-card">
                  <span className="clients-name-avatar clients-detail-avatar" aria-hidden>{(detailCompany.name?.[0] || 'C').toUpperCase()}</span>
                  <div className="clients-name-stack">
                    <span className="clients-name">{detailCompany.name}{detailCompany.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                    <span className="clients-id">ID #{detailCompany.id}</span>
                  </div>
                </div>

                <div className="clients-detail-fields">
                  {renderCompanyEditableField('name', clientsCopy.companyName, true)}
                  {renderCompanyEditableField('address', clientsCopy.address, true)}
                  {renderCompanyEditableField('postalCode', clientsCopy.postalCode)}
                  {renderCompanyEditableField('city', clientsCopy.city)}
                  {renderCompanyEditableField('vatId', clientsCopy.vatId, true)}
                  {renderCompanyEditableField('email', clientsCopy.email, true)}
                  {renderCompanyEditableField('telephone', clientsCopy.telephone, true)}
                </div>

                <div className="clients-detail-main-tabs" onClick={(e) => e.stopPropagation()}>
                  <div className="clients-session-tabs clients-detail-main-tabs-inner" role="tablist" aria-label={clientsCopy.companyDetailMainTabsAria}>
                    <button
                      type="button"
                      role="tab"
                      className={companyDetailMainTab === 'datoteke' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={companyDetailMainTab === 'datoteke'}
                      onClick={() => setCompanyDetailMainTab('datoteke')}
                    >
                      {clientsCopy.files}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={companyDetailMainTab === 'nastavitve' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={companyDetailMainTab === 'nastavitve'}
                      onClick={() => setCompanyDetailMainTab('nastavitve')}
                    >
                      {clientsCopy.clientDetailTabSettings}
                    </button>
                  </div>
                </div>

                {companyDetailMainTab === 'nastavitve' && (
                  <div className="clients-detail-fields" onClick={(e) => e.stopPropagation()} role="tabpanel">
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
                        <div className="clients-detail-files-toolbar">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => pickFile((file) => void uploadCompanyFile(file))}
                            disabled={uploadingCompanyFile}
                          >
                            {uploadingCompanyFile ? clientsCopy.uploadingFile : clientsCopy.uploadFile}
                          </button>
                        </div>
                        {detailCompanyFilesError && <div className="error">{detailCompanyFilesError}</div>}
                        <div
                          className={`clients-detail-file-drop-zone${companyFilesDropActive ? ' clients-detail-file-drop-zone--active' : ''}`}
                          onDragEnter={handleCompanyFilesDragEnter}
                          onDragLeave={handleCompanyFilesDragLeave}
                          onDragOver={handleCompanyFilesDragOver}
                          onDrop={(e) => void handleCompanyFilesDrop(e)}
                        >
                          <p className="muted clients-detail-file-drop-hint">{clientsCopy.dragDropFilesHint}</p>
                          {detailCompanyFilesLoading ? (
                            <div className="muted">{clientsCopy.loadingFiles}</div>
                          ) : detailCompanyFiles.length === 0 ? (
                            <div className="clients-detail-empty-card">
                              <EmptyState title={clientsCopy.noFilesTitle} text={clientsCopy.noCompanyFilesText} />
                            </div>
                          ) : (
                            <div className="clients-detail-files-list">
                              {detailCompanyFiles.map((file) => (
                                <article key={file.id} className="clients-detail-file-item">
                                  <div className="clients-detail-file-main">
                                    <div className="clients-detail-file-name" title={file.fileName}>{file.fileName}</div>
                                    <div className="clients-detail-file-meta">
                                      <span>{formatFileSize(file.sizeBytes)}</span>
                                      <span>•</span>
                                      <span>{clientsCopy.uploaded} {file.uploadedAt ? formatDateTime(file.uploadedAt) : '—'}</span>
                                    </div>
                                  </div>
                                  <div className="clients-detail-file-actions">
                                    <button type="button" className="clients-detail-invoice-open" onClick={() => void downloadCompanyFile(file)}>
                                      {clientsCopy.openFile}
                                    </button>
                                    <button
                                      type="button"
                                      className="clients-detail-invoice-open clients-detail-file-remove"
                                      onClick={() => void removeCompanyFile(file)}
                                      disabled={deletingCompanyFileId === file.id}
                                    >
                                      {deletingCompanyFileId === file.id ? clientsCopy.saving : clientsCopy.removeFile}
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {companyDetailDatotekeSubTab === 'racuni' && (
                      <>
                        {detailCompanyError && <div className="error">{detailCompanyError}</div>}
                        {detailCompanyBillsLoading ? (
                          <div className="muted">{locale === 'sl' ? 'Nalagam izdane račune...' : 'Loading issued invoices...'}</div>
                        ) : companyBills.length === 0 ? (
                          <div className="clients-detail-empty-card">
                            <EmptyState title={locale === 'sl' ? 'Ni izdanih računov' : 'No issued invoices'} text={locale === 'sl' ? 'Računi, izdani temu podjetju, bodo prikazani tukaj.' : 'Invoices billed to this company will appear here.'} />
                          </div>
                        ) : (
                          <div className="clients-detail-invoices-list">
                            {companyBills.map((bill) => {
                              const statusPill = companyInvoiceStatusPill(bill)
                              return (
                              <article key={bill.id} className="clients-detail-invoice-item">
                                <div className="clients-detail-invoice-item-top">
                                  <span className="clients-detail-invoice-no">#{bill.billNumber}</span>
                                  {statusPill ? (
                                    <span className={`clients-detail-invoice-status billing-folio-status-pill billing-folio-status-pill--${statusPill.variant}`}>
                                      {statusPill.label}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="clients-detail-invoice-title">{bill.clientName || (locale === 'sl' ? 'Neznana stranka' : 'Unknown client')}</div>
                                <div className="clients-detail-invoice-issued">{locale === 'sl' ? 'Izdano' : 'Issued'} {formatDate(bill.issueDate)}</div>
                                <div className="clients-detail-invoice-bottom">
                                  <div className="clients-detail-invoice-total-wrap">
                                    <span className="clients-detail-invoice-total-label">{locale === 'sl' ? 'Skupaj' : 'Total'}</span>
                                    <strong className="clients-detail-invoice-total">{currency(bill.totalGross)}</strong>
                                  </div>
                                  <button
                                    type="button"
                                    className="clients-detail-invoice-open"
                                    onClick={() => downloadBillPdf(bill.id, bill.billNumber)}
                                    aria-label={`${locale === 'sl' ? 'Odpri račun' : 'Open invoice'} ${bill.billNumber}`}
                                  >
                                    {locale === 'sl' ? 'Odpri račun →' : 'Open invoice →'}
                                  </button>
                                </div>
                              </article>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!clientDetailCompactHeader && (
              <div className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-detail-footer`} style={{ marginTop: isNativeAndroid ? 16 : 0 }}>
                <div className="clients-detail-footer-left" />
                <div className="clients-detail-footer-center">
                  {companyDetailHasChanges && (
                    <button type="button" onClick={() => void saveDetailCompanyInline()} disabled={savingCompanyDetailEdit}>
                      {savingCompanyDetailEdit ? clientsCopy.savingChanges : clientsCopy.saveChanges}
                    </button>
                  )}
                </div>
                <div className="clients-detail-footer-right">
                  <button
                    type="button"
                    className="secondary"
                    onClick={toggleCompanyActive}
                    disabled={detailCompany != null && activatingCompanyId === detailCompany.id}
                  >
                    {detailCompany != null && activatingCompanyId === detailCompany.id
                      ? clientsCopy.saving
                      : (detailCompany.active !== false ? clientsCopy.deactivate : clientsCopy.activate)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div
          className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop'}`}
          onClick={closeModal}
        >
          <div
            className={`modal large-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern clients-create-modal'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <form className="clients-create-modal-form" onSubmit={handleSubmit}>
              <div className={`booking-side-panel-header${compactCreateModalHeader ? ' booking-side-panel-header--compact-booking' : ''}`}>
                {compactCreateModalHeader ? (
                  <div className="booking-side-panel-header-toolbar">
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                    <button
                      type="submit"
                      className="booking-side-panel-submit-check"
                      disabled={saving || (isAdmin && consultants.length === 0)}
                      aria-label={clientsCopy.createClient}
                      title={clientsCopy.createClient}
                    >
                      {saving ? (
                        <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <PageHeader
                    title={clientsCopy.newClientTitle}
                    subtitle={clientsCopy.client}
                    actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeModal} aria-label={t('mobileNavClose')}>×</button>}
                  />
                )}
              </div>
              <div className={isNativeAndroid ? undefined : 'booking-side-panel-body'}>
                <div className="clients-detail-shell clients-create-shell">
                  <div className="clients-detail-hero clients-detail-head-card clients-create-head-card">
                    <span className="clients-name-avatar clients-detail-avatar" aria-hidden>{initials(form.firstName, form.lastName)}</span>
                    <div className="clients-name-stack">
                      <span className="clients-name">{[form.firstName, form.lastName].filter(Boolean).join(' ').trim() || clientsCopy.newClientName}</span>
                      <span className="clients-id">{clientsCopy.newClientSubtitle}</span>
                    </div>
                  </div>

                  <div className="clients-detail-fields clients-create-fields">
                    <label className="clients-detail-field-card">
                      <span>{clientsCopy.firstName}</span>
                      <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card">
                      <span>{clientsCopy.lastName}</span>
                      <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.email}</span>
                      <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </label>
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.phone}</span>
                      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </label>
                    <div className="clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.whatsappOptIn}</span>
                      <button
                        type="button"
                        className={`clients-batch-switch${form.whatsappOptIn ? ' clients-batch-switch--on' : ''}`}
                        onClick={() => setForm({ ...form, whatsappOptIn: !form.whatsappOptIn })}
                        aria-pressed={form.whatsappOptIn}
                      >
                        {form.whatsappOptIn ? clientsCopy.toggleOn : clientsCopy.toggleOff}
                      </button>
                    </div>
                    <div className="clients-detail-field-card clients-detail-field-card--wide clients-create-note-card">
                      <span>{clientsCopy.messaging}</span>
                      <p>{clientsCopy.messagingNote}</p>
                    </div>
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.linkedCompany}</span>
                      <select
                        value={form.billingCompanyId ?? ''}
                        onChange={(e) => setForm({ ...form, billingCompanyId: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">{clientsCopy.noLinkedCompany}</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>{company.name}</option>
                        ))}
                      </select>
                    </label>
                    {isAdmin && (
                      <label className="clients-detail-field-card clients-detail-field-card--wide">
                        <span>{clientsCopy.assignedConsultant}</span>
                        <select
                          value={form.assignedToId ?? consultants[0]?.id ?? ''}
                          onChange={(e) => setForm({ ...form, assignedToId: Number(e.target.value) })}
                          required
                        >
                          {consultants.map((u) => (
                            <option key={u.id} value={u.id}>{fullName(u)} ({u.email})</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>

                  {errorMessage && <div className="error">{errorMessage}</div>}
                </div>
              </div>
              {!compactCreateModalHeader && (
                <div
                  className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-create-footer`}
                  style={{ marginTop: isNativeAndroid ? 16 : 0 }}
                >
                  <button type="submit" disabled={saving || (isAdmin && consultants.length === 0)}>{saving ? clientsCopy.saving : clientsCopy.createClient}</button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {showCompanyModal && (
        <div
          className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop'}`}
          onClick={closeCompanyModal}
        >
          <div
            className={`modal large-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern clients-create-modal'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <form className="clients-create-modal-form" onSubmit={submitCompanyForm}>
              <div className={`booking-side-panel-header${compactCreateModalHeader ? ' booking-side-panel-header--compact-booking' : ''}`}>
                {compactCreateModalHeader ? (
                  <div className="booking-side-panel-header-toolbar">
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeCompanyModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                    <button
                      type="submit"
                      className="booking-side-panel-submit-check"
                      disabled={savingCompany}
                      aria-label={clientsCopy.createCompany}
                      title={clientsCopy.createCompany}
                    >
                      {savingCompany ? (
                        <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <PageHeader
                    title={clientsCopy.newCompanyTitle}
                    subtitle={clientsCopy.company}
                    actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeCompanyModal} aria-label={t('mobileNavClose')}>×</button>}
                  />
                )}
              </div>
              <div className={isNativeAndroid ? undefined : 'booking-side-panel-body'}>
                <div className="clients-detail-shell clients-create-shell">
                  <div className="clients-detail-hero clients-detail-head-card clients-create-head-card">
                    <span className="clients-name-avatar clients-detail-avatar" aria-hidden>{initials(companyForm.name, locale === 'sl' ? 'Podjetje' : 'Company')}</span>
                    <div className="clients-name-stack">
                      <span className="clients-name">{companyForm.name.trim() || clientsCopy.newCompanyName}</span>
                      <span className="clients-id">{clientsCopy.newCompanySubtitle}</span>
                    </div>
                  </div>

                  <div className="clients-detail-fields clients-create-fields">
                    <label className="clients-detail-field-card clients-detail-field-card--wide">
                      <span>{clientsCopy.companyName}</span>
                      <input required value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
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
                  </div>

                  {companyErrorMessage && <div className="error">{companyErrorMessage}</div>}
                </div>
              </div>
              {!compactCreateModalHeader && (
                <div
                  className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-create-footer`}
                  style={{ marginTop: isNativeAndroid ? 16 : 0 }}
                >
                  <button type="submit" disabled={savingCompany}>{savingCompany ? clientsCopy.saving : clientsCopy.createCompany}</button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {detailGroup && (
        <div
          className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop'}`}
          onClick={closeGroupDetailModal}
        >
          <div
            className={`modal large-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="booking-side-panel-header">
              <PageHeader
                title={clientsCopy.details}
                subtitle={clientsCopy.group}
                actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeGroupDetailModal} aria-label="Close">×</button>}
              />
            </div>
            <div className={isNativeAndroid ? undefined : 'booking-side-panel-body'}>
              <div className="clients-detail-shell">
                <div className="clients-detail-hero clients-detail-head-card">
                  <span className="clients-name-avatar clients-detail-avatar" aria-hidden>{(detailGroup.name?.[0] || 'G').toUpperCase()}</span>
                  <div className="clients-name-stack">
                    <span className="clients-name">{detailGroup.name}{detailGroup.active === false && <span className="clients-inactive-badge">{clientsCopy.inactive}</span>}</span>
                    <span className="clients-id">ID #{detailGroup.id}</span>
                  </div>
                </div>

                <div className="clients-detail-fields">
                  {renderGroupEditableField('name', clientsCopy.groupName, true)}
                  {renderGroupEditableField('email', clientsCopy.groupEmail, true)}
                  {renderGroupEditableField('billingCompanyId', clientsCopy.linkedCompany, true)}
                </div>

                {/* Members: same client search UI as Dodaj termin (calendar-client-picker) + booking-style chips */}
                <div className="clients-detail-field-card clients-detail-field-card--wide group-members-section">
                  <div className="group-members-header">
                    <span>{clientsCopy.groupMembers} ({(detailGroup.members ?? []).length})</span>
                  </div>
                  <div
                    className="client-picker calendar-client-picker group-members-client-picker"
                    onClick={(e) => e.stopPropagation()}
                    style={{ minWidth: 0 }}
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
                          {groupMemberCandidates.length > 0 && (
                            <div className="group-members-dropdown-footer">
                              <button
                                type="button"
                                className="primary"
                                disabled={pendingGroupMemberIds.length === 0 || addingMember}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void handleAddGroupMembersBulk(pendingGroupMemberIds)}
                              >
                                {pendingGroupMemberIds.length === 0
                                  ? clientsCopy.addMembersPickFirst
                                  : clientsCopy.addSelectedMembers(pendingGroupMemberIds.length)}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                  <div className="group-members-chip-box" role="list" aria-label={clientsCopy.groupMembers}>
                    {(detailGroup.members ?? []).length === 0 ? (
                      <div className="group-members-chip-box-empty muted">{clientsCopy.noMembersText}</div>
                    ) : (
                      (detailGroup.members ?? []).map((m) => {
                        const label = fullName(m)
                        return (
                          <div key={m.id} className="calendar-multi-client-chip" role="listitem">
                            <span className="calendar-multi-client-chip__label group-members-chip-name" title={label}>
                              {label}
                            </span>
                            <button
                              type="button"
                              className="calendar-multi-client-chip__remove"
                              disabled={removingMemberId === m.id}
                              onClick={() => handleRemoveGroupMember(m.id)}
                              aria-label={`${clientsCopy.removeMember} ${label}`}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="clients-detail-main-tabs" onClick={(e) => e.stopPropagation()}>
                  <div className="clients-session-tabs clients-detail-main-tabs-inner" role="tablist" aria-label={clientsCopy.groupDetailMainTabsAria}>
                    <button
                      type="button"
                      role="tab"
                      className={groupDetailMainTab === 'sessions' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={groupDetailMainTab === 'sessions'}
                      onClick={() => setGroupDetailMainTab('sessions')}
                    >
                      {clientsCopy.sessions}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={groupDetailMainTab === 'settings' ? 'clients-session-tab active' : 'clients-session-tab'}
                      aria-selected={groupDetailMainTab === 'settings'}
                      onClick={() => setGroupDetailMainTab('settings')}
                    >
                      {clientsCopy.clientDetailTabSettings}
                    </button>
                  </div>
                </div>

                {groupDetailMainTab === 'sessions' && (
                  <div role="tabpanel">
                    <div className="clients-detail-sessions-card clients-detail-sessions-card--modern">
                      <div className="clients-detail-session-tabs-row">
                        <div className="clients-session-tabs">
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
                        </div>
                        <span
                          className="clients-detail-sessions-tab-count"
                          aria-live="polite"
                          aria-atomic="true"
                        >
                          {detailGroupSessionsLoading
                            ? '…'
                            : clientsCopy.sessionsCount(
                                (groupSessionTab === 'future' ? futureGroupSessions : pastGroupSessions).length,
                              )}
                        </span>
                      </div>
                      {detailGroupSessionsLoading ? (
                        <div className="muted">{clientsCopy.loadingSessions}</div>
                      ) : groupSessionTab === 'future' ? (
                        futureGroupSessions.length === 0 ? (
                          <div className="clients-detail-empty-card">
                            <EmptyState title={clientsCopy.noUpcomingSessionsTitle} text={clientsCopy.noUpcomingSessionsText} />
                          </div>
                        ) : (
                          <div className="clients-detail-session-list">
                            {futureGroupSessions.map((s) => (
                              <article key={s.id} className="clients-detail-session-card">
                                <div className="clients-detail-session-top clients-detail-session-top--modern">
                                  <span className="clients-detail-session-no">#{s.id}</span>
                                  <div className="clients-detail-session-heading">
                                    <strong>{fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })}</strong>
                                    <span>{clientsCopy.liveSession}</span>
                                  </div>
                                </div>
                                <div className="clients-detail-session-times">
                                  <div>
                                    <span>{clientsCopy.start}</span>
                                    <strong>{formatDateTime(s.startTime)}</strong>
                                  </div>
                                  <div>
                                    <span>{clientsCopy.end}</span>
                                    <strong>{formatDateTime(s.endTime)}</strong>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        )
                      ) : pastGroupSessions.length === 0 ? (
                        <div className="clients-detail-empty-card">
                          <EmptyState title={clientsCopy.noPastSessionsTitle} text={clientsCopy.noPastSessionsText} />
                        </div>
                      ) : (
                        <div className="clients-detail-session-list">
                          {pastGroupSessions.map((s) => (
                            <article key={s.id} className="clients-detail-session-card">
                              <div className="clients-detail-session-top clients-detail-session-top--modern">
                                <span className="clients-detail-session-no">#{s.id}</span>
                                <div className="clients-detail-session-heading">
                                  <strong>{fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })}</strong>
                                  <span>{clientsCopy.liveSession}</span>
                                </div>
                              </div>
                              <div className="clients-detail-session-times">
                                <div>
                                  <span>{clientsCopy.start}</span>
                                  <strong>{formatDateTime(s.startTime)}</strong>
                                </div>
                                <div>
                                  <span>{clientsCopy.end}</span>
                                  <strong>{formatDateTime(s.endTime)}</strong>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {groupDetailMainTab === 'settings' && (
                  <div className="clients-detail-fields" onClick={(e) => e.stopPropagation()} role="tabpanel">
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
                )}
              </div>
            </div>
            <div className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-detail-footer`} style={{ marginTop: isNativeAndroid ? 16 : 0 }}>
              <div className="clients-detail-footer-left" />
              <div className="clients-detail-footer-center">
                {groupDetailHasChanges && (
                  <button type="button" onClick={() => void saveDetailGroupInline()} disabled={savingGroupDetailEdit}>
                    {savingGroupDetailEdit ? clientsCopy.savingChanges : clientsCopy.saveChanges}
                  </button>
                )}
              </div>
              <div className="clients-detail-footer-right">
                {detailGroup.active !== false ? (
                  <button type="button" className="secondary" onClick={() => handleActivateGroup(false)} disabled={activatingGroup}>
                    {clientsCopy.deactivate}
                  </button>
                ) : (
                  <button type="button" className="secondary" onClick={() => handleActivateGroup(true)} disabled={activatingGroup}>
                    {clientsCopy.activate}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showGroupModal && (
        <div
          className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop'}`}
          onClick={() => setShowGroupModal(false)}
        >
          <div
            className={`modal large-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern clients-create-modal'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <form className="clients-create-modal-form" onSubmit={(e) => { e.preventDefault(); handleCreateGroup() }}>
              <div className={`booking-side-panel-header${compactCreateModalHeader ? ' booking-side-panel-header--compact-booking' : ''}`}>
                {compactCreateModalHeader ? (
                  <div className="booking-side-panel-header-toolbar">
                    <button type="button" className="secondary booking-side-panel-close" onClick={() => setShowGroupModal(false)} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                    <button
                      type="submit"
                      className="booking-side-panel-submit-check"
                      disabled={savingGroup}
                      aria-label={clientsCopy.createGroup}
                      title={clientsCopy.createGroup}
                    >
                      {savingGroup ? (
                        <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <PageHeader
                    title={clientsCopy.newGroupTitle}
                    subtitle={clientsCopy.group}
                    actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => setShowGroupModal(false)} aria-label={t('mobileNavClose')}>×</button>}
                  />
                )}
              </div>
              <div className={isNativeAndroid ? undefined : 'booking-side-panel-body'}>
                <div className="clients-detail-shell clients-create-shell">
                  <div className="clients-detail-hero clients-detail-head-card clients-create-head-card">
                    <span className="clients-name-avatar clients-detail-avatar" aria-hidden>{(groupForm.name?.[0] || 'G').toUpperCase()}</span>
                    <div className="clients-name-stack">
                      <span className="clients-name">{groupForm.name.trim() || clientsCopy.newGroupTitle}</span>
                      <span className="clients-id">{clientsCopy.newGroupSubtitle}</span>
                    </div>
                  </div>

                  <div className="clients-detail-fields clients-create-fields">
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
              {!compactCreateModalHeader && (
                <div
                  className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-create-footer`}
                  style={{ marginTop: isNativeAndroid ? 16 : 0 }}
                >
                  <button type="submit" disabled={savingGroup}>{savingGroup ? clientsCopy.saving : clientsCopy.createGroup}</button>
                  <button type="button" className="secondary" onClick={() => setShowGroupModal(false)}>{t('cancel')}</button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}