import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { useLocale } from '../locale'
import type { Client, Company, CompanyBillSummary, Role, StoredFile, User } from '../lib/types'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { currency, formatDate, formatDateTime, fullName } from '../lib/format'

type UserSummary = Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>
type ConsultantSummary = UserSummary & { consultant?: boolean }
type EntityTab = 'clients' | 'companies'

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
}

type ClientSession = {
  id: number
  startTime: string
  endTime: string
  consultantFirstName: string
  consultantLastName: string
  paid: boolean
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
    batchPaymentSaving: 'Shranjujem…',
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
    companyDetailMainTabsAria: 'Zavihki podrobnosti podjetja',
    companyDatotekeSubTabsAria: 'Podzavihki datotek in računov',
    companySubTabInvoices: 'Računi',
    companySubTabGeneral: 'Splošno',
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
    batchPaymentSaving: 'Saving…',
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
    companyDetailMainTabsAria: 'Company detail tabs',
    companyDatotekeSubTabsAria: 'Files and invoices sections',
    companySubTabInvoices: 'Invoices',
    companySubTabGeneral: 'General',
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
  const [detailCompanyError, setDetailCompanyError] = useState('')
  const [detailClientFilesError, setDetailClientFilesError] = useState('')
  const [detailCompanyFilesError, setDetailCompanyFilesError] = useState('')
  const [sessionTab, setSessionTab] = useState<'future' | 'past'>('future')
  const [clientDetailMainTab, setClientDetailMainTab] = useState<'sessions' | 'files' | 'settings'>('sessions')
  const [companyDetailMainTab, setCompanyDetailMainTab] = useState<'datoteke' | 'nastavitve'>('datoteke')
  const [companyDetailDatotekeSubTab, setCompanyDetailDatotekeSubTab] = useState<'racuni' | 'splosno'>('splosno')
  const [confirmAnonymize, setConfirmAnonymize] = useState(false)
  const [anonymizing, setAnonymizing] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activatingCompany, setActivatingCompany] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive'>('active')
  const [companyActiveFilter, setCompanyActiveFilter] = useState<'active' | 'inactive'>('active')
  const [detailEditField, setDetailEditField] = useState<'firstName' | 'lastName' | 'email' | 'phone' | 'billingCompanyId' | null>(null)
  const [detailEditDraft, setDetailEditDraft] = useState<{ firstName: string; lastName: string; email: string; phone: string; whatsappOptIn: boolean; billingCompanyId: number | null }>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    whatsappOptIn: false,
    billingCompanyId: null,
  })
  const [savingDetailEdit, setSavingDetailEdit] = useState(false)
  const [companyDetailEditField, setCompanyDetailEditField] = useState<'name' | 'address' | 'postalCode' | 'city' | 'vatId' | 'iban' | 'email' | 'telephone' | null>(null)
  const [companyDetailEditDraft, setCompanyDetailEditDraft] = useState<CompanyForm>(emptyCompanyForm)
  const [savingCompanyDetailEdit, setSavingCompanyDetailEdit] = useState(false)
  const [savingBatchPaymentClient, setSavingBatchPaymentClient] = useState(false)
  const [savingBatchPaymentCompany, setSavingBatchPaymentCompany] = useState(false)
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

  useEffect(() => {
    loadClients()
  }, [])

  useEffect(() => {
    loadCompanies()
  }, [companySearch])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 450px)')
    const apply = () => setIsClientsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (openClientMenuId == null) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.clients-card-menu-wrap')) return
      setOpenClientMenuId(null)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openClientMenuId])

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
    if (!isAdmin) return
    api.get('/users')
      .then((res) => setConsultants((res.data ?? []).filter((u: ConsultantSummary) => u.consultant)))
      .catch(() => setConsultants([]))
  }, [isAdmin])

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

  const clientDetailHasChanges = useMemo(() => {
    if (!detailClient) return false
    return (detailEditDraft.firstName ?? '') !== (detailClient.firstName ?? '')
      || (detailEditDraft.lastName ?? '') !== (detailClient.lastName ?? '')
      || (detailEditDraft.email ?? '') !== (detailClient.email ?? '')
      || (detailEditDraft.phone ?? '') !== (detailClient.phone ?? '')
      || (detailEditDraft.whatsappOptIn ?? false) !== (detailClient.whatsappOptIn ?? false)
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
      billingCompanyId: c.billingCompany?.id ?? null,
    })
    setSessionTab('future')
    setClientDetailMainTab('sessions')
    setConfirmAnonymize(false)
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
    })
  }

  const closeDetailModal = () => {
    setDetailClient(null)
    setDetailSessions([])
    setDetailClientFiles([])
    setDetailSessionsError('')
    setDetailClientFilesError('')
    setConfirmAnonymize(false)
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
        batchPaymentEnabled: detailClient.batchPaymentEnabled ?? false,
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
        batchPaymentEnabled: detailCompany.batchPaymentEnabled ?? false,
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
      })
      setCompanies((prev) => prev.map((c) => (c.id === response.data.id ? response.data : c)))
      setCompanyDetailEditField(null)
    } catch (error: any) {
      setCompanyErrorMessage(error?.response?.data?.message || 'Failed to save company.')
    } finally {
      setSavingCompanyDetailEdit(false)
    }
  }

  const toggleClientBatchPayment = async () => {
    if (!detailClient || savingBatchPaymentClient) return
    setSavingBatchPaymentClient(true)
    setErrorMessage('')
    try {
      const response = await api.put<Client>(`/clients/${detailClient.id}`, {
        firstName: detailClient.firstName?.trim() ?? '',
        lastName: detailClient.lastName?.trim() ?? '',
        email: detailClient.email?.trim() || null,
        phone: detailClient.phone?.trim() || null,
        billingCompanyId: detailClient.billingCompany?.id ?? null,
        batchPaymentEnabled: !(detailClient.batchPaymentEnabled ?? false),
        assignedToId: detailClient.assignedTo?.id ?? consultants[0]?.id,
      })
      setDetailClient(response.data)
      setClients((prev) => prev.map((c) => (c.id === response.data.id ? response.data : c)))
      setDetailEditDraft((prev) => ({ ...prev }))
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to update batch payment setting.')
    } finally {
      setSavingBatchPaymentClient(false)
    }
  }

  const toggleCompanyBatchPayment = async () => {
    if (!detailCompany || savingBatchPaymentCompany) return
    setSavingBatchPaymentCompany(true)
    setCompanyErrorMessage('')
    try {
      const response = await api.put<Company>(`/companies/${detailCompany.id}`, {
        name: detailCompany.name?.trim() ?? '',
        address: detailCompany.address?.trim() || null,
        postalCode: detailCompany.postalCode?.trim() || null,
        city: detailCompany.city?.trim() || null,
        vatId: detailCompany.vatId?.trim() || null,
        iban: detailCompany.iban?.trim() || null,
        email: detailCompany.email?.trim() || null,
        telephone: detailCompany.telephone?.trim() || null,
        batchPaymentEnabled: !(detailCompany.batchPaymentEnabled ?? false),
      })
      setDetailCompany(response.data)
      setCompanies((prev) => prev.map((c) => (c.id === response.data.id ? response.data : c)))
      setCompanyDetailEditDraft((prev) => ({ ...prev }))
    } catch (error: any) {
      setCompanyErrorMessage(error?.response?.data?.message || 'Failed to update batch payment setting.')
    } finally {
      setSavingBatchPaymentCompany(false)
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

  const anonymizeClient = async () => {
    if (!detailClient || detailClient.anonymized) return;
    setErrorMessage('');
    setAnonymizing(true);
    try {
      const response = await api.post<Client>(`/clients/${detailClient.id}/anonymize`)
      setDetailClient(response.data)
      setConfirmAnonymize(false)
      await loadClients()
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || 'Failed to anonymize client.')
    } finally {
      setAnonymizing(false)
    }
  };

  const toggleActive = async () => {
    if (!detailClient) return;
    setActivating(true);
    setErrorMessage('');
    try {
      const action = detailClient.active !== false ? 'deactivate' : 'activate'
      const response = await api.patch<Client>(`/clients/${detailClient.id}/${action}`)
      setDetailClient(response.data)
      await loadClients()
      window.dispatchEvent(new CustomEvent('clients-updated'))
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || 'Failed to update client status.')
    } finally {
      setActivating(false)
    }
  };

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

  const toggleCompanyActive = async () => {
    if (!detailCompany) return
    setActivatingCompany(true)
    setCompanyErrorMessage('')
    try {
      const action = detailCompany.active !== false ? 'deactivate' : 'activate'
      const response = await api.patch<Company>(`/companies/${detailCompany.id}/${action}`)
      setDetailCompany(response.data)
      await loadCompanies()
      await loadClients()
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setCompanyErrorMessage(backendMessage || 'Failed to update company status.')
    } finally {
      setActivatingCompany(false)
    }
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
          </div>
          <button
            type="button"
            className="secondary"
            onClick={entityTab === 'clients' ? openNewModal : openNewCompanyModal}
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
                    <div className="clients-card-menu-wrap">
                      <button
                        type="button"
                        className="secondary clients-card-menu-trigger"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenClientMenuId((prev) => prev === c.id ? null : c.id)
                        }}
                        aria-label="Client actions"
                        aria-expanded={openClientMenuId === c.id}
                      >
                        ...
                      </button>
                      {openClientMenuId === c.id && (
                        <div className="clients-card-menu-popover" role="dialog" aria-label="Client actions">
                          <button type="button" className="danger" onClick={(e) => { e.stopPropagation(); setOpenClientMenuId(null); void remove(c.id) }}>Delete</button>
                        </div>
                      )}
                    </div>
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
                        <div className="clients-actions-inner">
                          <button type="button" className="secondary clients-action-btn clients-action-btn-danger" onClick={(e) => { e.stopPropagation(); remove(c.id); }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </>
        ) : (
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
        )}
      </Card>

      {detailClient && (
        <div
          className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop'}`}
          onClick={closeDetailModal}
        >
          <div
            className={`modal large-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="booking-side-panel-header">
              <PageHeader
                title={clientsCopy.details}
                subtitle={clientsCopy.client}
                actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeDetailModal} aria-label="Close">×</button>}
              />
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
                        className={`clients-batch-switch${detailClient.batchPaymentEnabled ? ' clients-batch-switch--on' : ''}`}
                        onClick={() => void toggleClientBatchPayment()}
                        disabled={savingBatchPaymentClient}
                        aria-pressed={detailClient.batchPaymentEnabled ?? false}
                      >
                        {savingBatchPaymentClient ? clientsCopy.batchPaymentSaving : detailClient.batchPaymentEnabled ? clientsCopy.toggleOn : clientsCopy.toggleOff}
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
            <div className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-detail-footer`} style={{ marginTop: isNativeAndroid ? 16 : 0 }}>
              <div className="clients-detail-footer-left">
                {!detailClient.anonymized && (
                  confirmAnonymize ? (
                    <>
                      <button type="button" className="danger secondary" onClick={() => setConfirmAnonymize(false)} disabled={anonymizing}>{t('cancel')}</button>
                      <button type="button" className="danger" onClick={anonymizeClient} disabled={anonymizing}>{anonymizing ? clientsCopy.anonymizing : clientsCopy.yesAnonymize}</button>
                    </>
                  ) : (
                    <button type="button" className="danger secondary" onClick={() => setConfirmAnonymize(true)}>{clientsCopy.anonymize}</button>
                  )
                )}
              </div>
              <div className="clients-detail-footer-center">
                {clientDetailHasChanges && (
                  <button type="button" onClick={() => void saveDetailClientInline()} disabled={savingDetailEdit}>
                    {savingDetailEdit ? clientsCopy.savingChanges : clientsCopy.saveChanges}
                  </button>
                )}
              </div>
              <div className="clients-detail-footer-right">
                <button type="button" className="secondary" onClick={toggleActive} disabled={activating}>
                  {activating ? clientsCopy.saving : (detailClient.active !== false ? clientsCopy.deactivate : clientsCopy.activate)}
                </button>
              </div>
            </div>
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
            <div className="booking-side-panel-header">
              <PageHeader
                title={clientsCopy.details}
                subtitle={clientsCopy.company}
                actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeCompanyDetailModal} aria-label="Close">×</button>}
              />
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
                        className={`clients-batch-switch${detailCompany.batchPaymentEnabled ? ' clients-batch-switch--on' : ''}`}
                        onClick={() => void toggleCompanyBatchPayment()}
                        disabled={savingBatchPaymentCompany}
                        aria-pressed={detailCompany.batchPaymentEnabled ?? false}
                      >
                        {savingBatchPaymentCompany ? clientsCopy.batchPaymentSaving : detailCompany.batchPaymentEnabled ? clientsCopy.toggleOn : clientsCopy.toggleOff}
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
                <button type="button" className="secondary" onClick={toggleCompanyActive} disabled={activatingCompany}>
                  {activatingCompany ? clientsCopy.saving : (detailCompany.active !== false ? clientsCopy.deactivate : clientsCopy.activate)}
                </button>
              </div>
            </div>
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
              <div className="booking-side-panel-header">
                <PageHeader
                  title={clientsCopy.newClientTitle}
                  subtitle={clientsCopy.client}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeModal} aria-label="Close">×</button>}
                />
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
              <div className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-create-footer`} style={{ marginTop: isNativeAndroid ? 16 : 0 }}>
                <button type="submit" disabled={saving || (isAdmin && consultants.length === 0)}>{saving ? clientsCopy.saving : clientsCopy.createClient}</button>
                <button type="button" className="secondary" onClick={closeModal}>{t('cancel')}</button>
              </div>
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
              <div className="booking-side-panel-header">
                <PageHeader
                  title={clientsCopy.newCompanyTitle}
                  subtitle={clientsCopy.company}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeCompanyModal} aria-label="Close">×</button>}
                />
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
              <div className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-create-footer`} style={{ marginTop: isNativeAndroid ? 16 : 0 }}>
                <button type="submit" disabled={savingCompany}>{savingCompany ? clientsCopy.saving : clientsCopy.createCompany}</button>
                <button type="button" className="secondary" onClick={closeCompanyModal}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}