import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import '../styles/main/consumables.css'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useAuthenticatedUser } from '../authUserContext'
import { useToast } from '../components/Toast'
import { BarcodeScannerModal, type BarcodeScanResult } from '../components/BarcodeScannerModal'
import { useSelectedLocationId } from '../lib/locationContext'
import { hasEmployeePermission } from '../lib/employeePermissions'
import type { Location } from '../lib/types'
import { locationsQueryOptions } from '../queries/sharedQueryOptions'
import {
  consumablesCategoriesQueryOptions,
  consumablesItemsQueryOptions,
  consumablesMovementsQueryOptions,
  consumablesOverviewQueryOptions,
  consumablesPurchaseOrdersQueryOptions,
  consumablesSuppliersQueryOptions,
} from '../queries/remainingQueryOptions'
import { queryKeys } from '../queries/queryKeys'

type Category = { id: number; name: string; color?: string | null; active: boolean }
type Item = {
  id: number
  name: string
  description?: string | null
  category?: Category | null
  sku?: string | null
  barcode?: string | null
  unit: string
  locationId: number
  location?: string | null
  currentStock: number
  minimumStock: number
  costPrice: number
  salePrice?: number | null
  vatRate?: 'VAT_22' | 'VAT_9_5' | 'VAT_0' | 'NO_VAT' | null
  trackStock: boolean
  billable: boolean
  active: boolean
  lowStock: boolean
}
type Movement = {
  id: number
  consumableId: number
  itemName: string
  categoryName?: string | null
  locationId?: number | null
  locationName?: string | null
  movementType: string
  sourceType?: string | null
  sourceId?: number | null
  quantityDelta: number
  stockBefore: number
  stockAfter: number
  valueDelta?: number | null
  unit?: string | null
  note?: string | null
  userName?: string | null
  createdAt: string
}
type StockTransfer = {
  id: number
  consumableId: number
  itemName: string
  unit: string
  fromLocationId: number
  fromLocationName: string
  toLocationId: number
  toLocationName: string
  quantity: number
  unitCostSnapshot: number
  valueAmount: number
  note?: string | null
  userName?: string | null
  createdAt: string
}

type Overview = {
  totalItems: number
  lowStockItems: number
  monthlyConsumptionQuantity: number
  stockValue: number
  lowStock: Item[]
  recentMovements: Movement[]
  categoryUsage: { label: string; value: number }[]
  mostUsed: { label: string; value: number }[]
}
type Supplier = {
  id: number
  name: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  categories?: string | null
  paymentTermsDays?: number | null
  reliabilityPercent?: number | null
  outstandingAmount?: number | null
  status: 'ACTIVE' | 'INACTIVE'
}
type PurchaseOrder = {
  id: number
  orderNumber: string
  supplierId?: number | null
  supplierName?: string | null
  locationId?: number | null
  locationName?: string | null
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'COMPLETED' | 'CANCELLED'
  orderDate?: string | null
  expectedDate?: string | null
  totalAmount: number
  receivedAmount: number
  notes?: string | null
}

type PurchaseOrderLine = {
  id: number
  consumableId: number
  itemName: string
  sku?: string | null
  unit: string
  orderedQuantity: number
  receivedQuantity: number
  remainingQuantity: number
  unitPrice: number
  vatRate: 'VAT_22' | 'VAT_9_5' | 'VAT_0' | 'NO_VAT'
  netAmount: number
  vatAmount: number
  grossAmount: number
}
type PurchaseOrderReceipt = {
  id: number
  idempotencyKey: string
  receivedAt: string
  note?: string | null
  userName?: string | null
  lines: { purchaseOrderLineId: number; consumableId: number; itemName: string; unit: string; quantity: number }[]
}
type PurchaseOrderDetail = { order: PurchaseOrder; lines: PurchaseOrderLine[]; receipts: PurchaseOrderReceipt[] }
type InventorySession = {
  id: number
  locationId: number
  locationName: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  startedAt: string
  completedAt?: string | null
  startedBy?: string | null
  completedBy?: string | null
  notes?: string | null
  totalItems: number
  countedItems: number
  discrepancyItems: number
  progressPercent: number
}
type InventoryLine = {
  id: number
  consumableId: number
  itemName: string
  categoryName?: string | null
  unit: string
  systemQuantity: number
  countedQuantity?: number | null
  discrepancyQuantity?: number | null
  costPriceSnapshot: number
  discrepancyValue?: number | null
  notes?: string | null
  countedAt?: string | null
  countedBy?: string | null
}
type InventoryDetail = { session: InventorySession; lines: InventoryLine[]; movements: Movement[] }
type InventoryCountDraft = Record<number, { countedQuantity: string; notes: string }>
type PurchaseOrderLineForm = {
  lineId?: number
  consumableId: string
  orderedQuantity: string
  receivedQuantity: number
  unitPrice: string
  vatRate: 'VAT_22' | 'VAT_9_5' | 'VAT_0' | 'NO_VAT'
}
type PurchaseOrderFormState = {
  id: number | null
  orderNumber: string
  supplierId: string
  locationId: string
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'COMPLETED' | 'CANCELLED'
  orderDate: string
  expectedDate: string
  notes: string
  lines: PurchaseOrderLineForm[]
  receipts: PurchaseOrderReceipt[]
}

type TabKey = 'overview' | 'items' | 'procurement' | 'suppliers' | 'movements' | 'inventory' | 'reports'
type ManualMovementType = 'PURCHASE' | 'MANUAL_ADJUSTMENT' | 'RETURN' | 'WASTE' | 'CORRECTION'
type BarcodeScannerMode = 'FIND_ITEM' | 'ITEM_BARCODE' | 'MOVEMENT_ITEM' | 'TRANSFER_ITEM' | 'PURCHASE_ORDER_ITEM' | 'RECEIVE_ITEM' | 'INVENTORY_ITEM'
type BarcodeScannerState = { mode: BarcodeScannerMode; title: string; subtitle: string; continuous?: boolean }

type ConsumableReportType = 'STOCK_VALUATION' | 'CONSUMPTION' | 'PURCHASES' | 'INVENTORY' | 'TRANSFERS'
type ConsumableReport = {
  type: ConsumableReportType
  columns: { key: string; label: string; type: 'TEXT' | 'NUMBER' | 'CURRENCY' }[]
  rows: Record<string, string | number | null>[]
  totals: Record<string, number>
  serviceOptions: { id: number; label: string }[]
  employeeOptions: { id: number; label: string }[]
}

type ItemFormState = {
  name: string
  description: string
  sku: string
  barcode: string
  categoryId: string
  locationId: string
  unit: string
  currentStock: string
  minimumStock: string
  costPrice: string
  salePrice: string
  vatRate: 'VAT_22' | 'VAT_9_5' | 'VAT_0' | 'NO_VAT'
  billable: boolean
  trackStock: boolean
  active: boolean
}

type StockMovementFormState = {
  movementType: ManualMovementType
  quantity: string
  direction: 'INCREASE' | 'DECREASE'
  note: string
}

type TransferFormState = {
  consumableId: string
  fromLocationId: string
  toLocationId: string
  quantity: string
  note: string
}

type CategoryFormState = {
  id: number | null
  name: string
  color: string
  active: boolean
}

type SupplierFormState = {
  name: string
  contactName: string
  phone: string
  email: string
  categories: string
  paymentTermsDays: string
  reliabilityPercent: string
  outstandingAmount: string
  status: 'ACTIVE' | 'INACTIVE'
}

const emptyOverview: Overview = {
  totalItems: 0,
  lowStockItems: 0,
  monthlyConsumptionQuantity: 0,
  stockValue: 0,
  lowStock: [],
  recentMovements: [],
  categoryUsage: [],
  mostUsed: [],
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Pregled' },
  { key: 'items', label: 'Artikli' },
  { key: 'procurement', label: 'Nabava' },
  { key: 'suppliers', label: 'Dobavitelji' },
  { key: 'movements', label: 'Premiki zaloge' },
  { key: 'inventory', label: 'Inventura' },
  { key: 'reports', label: 'Poročila' },
]

const emptyItemForm = (locationId: number | null): ItemFormState => ({
  name: '',
  description: '',
  sku: '',
  barcode: '',
  categoryId: '',
  locationId: locationId != null ? String(locationId) : '',
  unit: 'kos',
  currentStock: '0',
  minimumStock: '0',
  costPrice: '0',
  salePrice: '0',
  vatRate: 'NO_VAT',
  billable: false,
  trackStock: true,
  active: true,
})

const emptySupplierForm: SupplierFormState = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  categories: '',
  paymentTermsDays: '30',
  reliabilityPercent: '100',
  outstandingAmount: '0',
  status: 'ACTIVE',
}

const emptyPurchaseOrderForm = (locationId: number | null): PurchaseOrderFormState => ({
  id: null,
  orderNumber: '',
  supplierId: '',
  locationId: locationId != null ? String(locationId) : '',
  status: 'DRAFT',
  orderDate: new Date().toISOString().slice(0, 10),
  expectedDate: '',
  notes: '',
  lines: [],
  receipts: [],
})

function eur(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('sl-SI', { style: 'currency', currency: 'EUR' })
}
function n(value: number | null | undefined, digits = 0) {
  return Number(value || 0).toLocaleString('sl-SI', { maximumFractionDigits: digits })
}
function date(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('sl-SI')
}
function dateTime(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('sl-SI', { dateStyle: 'short', timeStyle: 'short' })
}
function statusText(status: string) {
  return ({ DRAFT: 'Osnutek', ORDERED: 'Naročeno', PARTIALLY_RECEIVED: 'Delno prejeto', COMPLETED: 'Zaključeno', CANCELLED: 'Preklicano' } as Record<string, string>)[status] || status
}
function movementText(type: string) {
  return ({ PURCHASE: 'Prejem', SESSION_USAGE: 'Poraba', MANUAL_ADJUSTMENT: 'Ročni popravek', RETURN: 'Vračilo', WASTE: 'Odpis', CORRECTION: 'Korekcija', INVENTORY_COUNT: 'Inventura', TRANSFER_OUT: 'Prenos iz', TRANSFER_IN: 'Prenos v' } as Record<string, string>)[type] || type
}
function vatText(rate?: Item['vatRate']) {
  return ({ VAT_22: '22 %', VAT_9_5: '9,5 %', VAT_0: '0 %', NO_VAT: 'Brez DDV' } as Record<string, string>)[rate || 'NO_VAT'] || 'Brez DDV'
}
function movementSignedQuantity(form: StockMovementFormState) {
  const quantity = Math.abs(Number(String(form.quantity || '').replace(',', '.')))
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  if (form.movementType === 'WASTE') return -quantity
  if (form.movementType === 'PURCHASE' || form.movementType === 'RETURN') return quantity
  return form.direction === 'DECREASE' ? -quantity : quantity
}

export function ConsumablesPage() {
  const me = useAuthenticatedUser()
  const canEditConsumables = hasEmployeePermission(me, 'CONSUMABLES_EDIT')
  const canAdjustStock = hasEmployeePermission(me, 'CONSUMABLES_STOCK_ADJUST')
  const canManageProcurement = hasEmployeePermission(me, 'CONSUMABLES_PROCUREMENT')
  const canManageInventory = hasEmployeePermission(me, 'CONSUMABLES_INVENTORY')
  const canViewConsumableReports = hasEmployeePermission(me, 'CONSUMABLES_REPORTS')
  const visibleTabs = useMemo(() => tabs.filter((tab) => tab.key !== 'reports' || canViewConsumableReports), [canViewConsumableReports])
  const activeUnitId = me.activeUnitId ?? me.companyId
  const [selectedLocationId, setSelectedLocationId] = useSelectedLocationId(activeUnitId)
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'overview'
    const requested = new URLSearchParams(window.location.search).get('tab') as TabKey | null
    return requested && tabs.some((tab) => tab.key === requested) ? requested : 'overview'
  })
  const notificationLocationId = useMemo(() => {
    if (typeof window === 'undefined') return null
    const value = Number(new URLSearchParams(window.location.search).get('locationId'))
    return Number.isInteger(value) && value > 0 ? value : null
  }, [])
  const notificationLowStockItemId = useMemo(() => {
    if (typeof window === 'undefined') return null
    const value = Number(new URLSearchParams(window.location.search).get('lowStockItemId'))
    return Number.isInteger(value) && value > 0 ? value : null
  }, [])
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<Overview>(emptyOverview)
  const [items, setItems] = useState<Item[]>([])
  const [allLocationItems, setAllLocationItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [operationalLocations, setOperationalLocations] = useState<Location[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showOnlyLow, setShowOnlyLow] = useState(false)
  const [reportType, setReportType] = useState<ConsumableReportType>('STOCK_VALUATION')
  const [reportFrom, setReportFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) })
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [reportLocationId, setReportLocationId] = useState('')
  const [reportServiceTypeId, setReportServiceTypeId] = useState('')
  const [reportEmployeeId, setReportEmployeeId] = useState('')
  const [report, setReport] = useState<ConsumableReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    if (activeTab === 'reports' && !canViewConsumableReports) setActiveTab('overview')
  }, [activeTab, canViewConsumableReports])

  useEffect(() => {
    if (notificationLocationId == null || operationalLocations.length === 0) return
    if (!operationalLocations.some((location) => location.id === notificationLocationId)) return
    if (selectedLocationId !== notificationLocationId) setSelectedLocationId(notificationLocationId)
  }, [notificationLocationId, operationalLocations, selectedLocationId, setSelectedLocationId])

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [savingItem, setSavingItem] = useState(false)
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm(null))

  const [stockMovementItem, setStockMovementItem] = useState<Item | null>(null)
  const [savingMovement, setSavingMovement] = useState(false)
  const [stockMovementForm, setStockMovementForm] = useState<StockMovementFormState>({ movementType: 'MANUAL_ADJUSTMENT', quantity: '1', direction: 'INCREASE', note: '' })

  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [transferForm, setTransferForm] = useState<TransferFormState>({ consumableId: '', fromLocationId: '', toLocationId: '', quantity: '1', note: '' })

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({ id: null, name: '', color: '#2563eb', active: true })

  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm)

  const [purchaseOrderModalOpen, setPurchaseOrderModalOpen] = useState(false)
  const [purchaseOrderForm, setPurchaseOrderForm] = useState<PurchaseOrderFormState>(emptyPurchaseOrderForm(null))
  const [loadingPurchaseOrder, setLoadingPurchaseOrder] = useState(false)
  const [savingPurchaseOrder, setSavingPurchaseOrder] = useState(false)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, string>>({})
  const [receiveNote, setReceiveNote] = useState('')
  const [savingReceipt, setSavingReceipt] = useState(false)

  const [inventorySessions, setInventorySessions] = useState<InventorySession[]>([])
  const [inventoryDetail, setInventoryDetail] = useState<InventoryDetail | null>(null)
  const [inventoryCountDraft, setInventoryCountDraft] = useState<InventoryCountDraft>({})
  const [inventoryStartModalOpen, setInventoryStartModalOpen] = useState(false)
  const [inventoryStartLocationId, setInventoryStartLocationId] = useState('')
  const [inventoryStartNotes, setInventoryStartNotes] = useState('')
  const [savingInventory, setSavingInventory] = useState(false)
  const [loadingInventoryDetail, setLoadingInventoryDetail] = useState(false)
  const [inventoryQuery, setInventoryQuery] = useState('')
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('')
  const [inventoryCountStatusFilter, setInventoryCountStatusFilter] = useState('')

  const [barcodeScanner, setBarcodeScanner] = useState<BarcodeScannerState | null>(null)

  const load = useCallback(async (force = true) => {
    setLoading(true)
    try {
      if (force) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.consumables.all, refetchType: 'none' })
      }

      const locationsPromise = queryClient.fetchQuery(locationsQueryOptions(activeUnitId)).catch(() => [] as Location[])
      const tasks: Promise<void>[] = []
      const loadItems = () => queryClient.fetchQuery(consumablesItemsQueryOptions<Item>(activeUnitId, selectedLocationId)).then(setItems).catch(() => setItems([]))
      const loadAllLocationItems = () => api.get<Item[]>('/consumables/items').then(({ data }) => setAllLocationItems(data || [])).catch(() => setAllLocationItems([]))
      const loadCategories = () => queryClient.fetchQuery(consumablesCategoriesQueryOptions<Category>(activeUnitId)).then(setCategories).catch(() => setCategories([]))
      const loadMovements = () => queryClient.fetchQuery(consumablesMovementsQueryOptions<Movement>(activeUnitId, selectedLocationId)).then(setMovements).catch(() => setMovements([]))
      const loadTransfers = () => api.get<StockTransfer[]>('/consumables/transfers', { params: { locationId: selectedLocationId ?? undefined } }).then(({ data }) => setTransfers(data || [])).catch(() => setTransfers([]))

      if (activeTab === 'overview') {
        tasks.push(
          queryClient.fetchQuery(consumablesOverviewQueryOptions<Overview>(activeUnitId, selectedLocationId)).then((data) => setOverview(data || emptyOverview)).catch(() => setOverview(emptyOverview)),
          loadItems(),
          loadCategories(),
          loadMovements(),
        )
      } else if (activeTab === 'items') {
        tasks.push(loadItems(), loadAllLocationItems(), loadCategories())
      } else if (activeTab === 'procurement') {
        tasks.push(
          loadItems(),
          loadAllLocationItems(),
          queryClient.fetchQuery(consumablesPurchaseOrdersQueryOptions<PurchaseOrder>(activeUnitId, selectedLocationId)).then(setPurchaseOrders).catch(() => setPurchaseOrders([])),
          queryClient.fetchQuery(consumablesSuppliersQueryOptions<Supplier>(activeUnitId)).then(setSuppliers).catch(() => setSuppliers([])),
        )
      } else if (activeTab === 'suppliers') {
        tasks.push(queryClient.fetchQuery(consumablesSuppliersQueryOptions<Supplier>(activeUnitId)).then(setSuppliers).catch(() => setSuppliers([])))
      } else if (activeTab === 'movements') {
        tasks.push(loadMovements(), loadAllLocationItems(), loadTransfers())
      } else if (activeTab === 'inventory') {
        tasks.push(loadAllLocationItems(), (async () => {
          try {
            const response = await api.get<InventorySession[]>('/consumables/inventory-sessions', { params: { locationId: selectedLocationId ?? undefined } })
            const rows = response.data || []
            setInventorySessions(rows)
            const preferred = rows.find((row) => row.status === 'IN_PROGRESS') || rows[0] || null
            if (preferred) {
              const detailResponse = await api.get<InventoryDetail>(`/consumables/inventory-sessions/${preferred.id}`)
              const detail = detailResponse.data || null
              setInventoryDetail(detail)
              setInventoryCountDraft(toInventoryDraft(detail))
            } else {
              setInventoryDetail(null)
              setInventoryCountDraft({})
            }
          } catch {
            setInventorySessions([])
            setInventoryDetail(null)
            setInventoryCountDraft({})
          }
        })())
      }

      const [nextLocations] = await Promise.all([locationsPromise, Promise.all(tasks).then(() => undefined)])
      setOperationalLocations(nextLocations)
    } finally {
      setLoading(false)
    }
  }, [activeTab, activeUnitId, queryClient, selectedLocationId])

  useEffect(() => {
    setOverview(emptyOverview)
    setItems([])
    setAllLocationItems([])
    setMovements([])
    setTransfers([])
    setPurchaseOrders([])
    setInventorySessions([])
    setInventoryDetail(null)
    setInventoryCountDraft({})
    setOperationalLocations([])
  }, [activeUnitId, selectedLocationId])
  useEffect(() => { void load(false) }, [load])
  useEffect(() => { setLocationFilter('') }, [selectedLocationId])

  const reportParams = useMemo(() => ({
    type: reportType,
    from: reportType === 'STOCK_VALUATION' ? undefined : reportFrom || undefined,
    to: reportType === 'STOCK_VALUATION' ? undefined : reportTo || undefined,
    locationId: reportLocationId ? Number(reportLocationId) : undefined,
    serviceTypeId: reportType === 'CONSUMPTION' && reportServiceTypeId ? Number(reportServiceTypeId) : undefined,
    employeeId: reportType === 'CONSUMPTION' && reportEmployeeId ? Number(reportEmployeeId) : undefined,
  }), [reportType, reportFrom, reportTo, reportLocationId, reportServiceTypeId, reportEmployeeId])

  const loadReport = useCallback(async () => {
    if (!canViewConsumableReports) return
    setReportLoading(true)
    try {
      const { data } = await api.get<ConsumableReport>('/consumables/reports', { params: reportParams })
      setReport(data || null)
    } catch (error: any) {
      setReport(null)
      showToast('error', error?.response?.data?.message || 'Poročila ni bilo mogoče naložiti.')
    } finally {
      setReportLoading(false)
    }
  }, [canViewConsumableReports, reportParams, showToast])

  useEffect(() => {
    if (activeTab === 'reports' && canViewConsumableReports) void loadReport()
  }, [activeTab, canViewConsumableReports, loadReport])

  async function exportReport(format: 'csv' | 'excel') {
    if (!canViewConsumableReports) return
    try {
      const response = await api.get(`/consumables/reports/${format}`, { params: reportParams, responseType: 'blob' })
      const disposition = String(response.headers?.['content-disposition'] || '')
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i)
      const filename = filenameMatch?.[1] || `porabni-material.${format === 'excel' ? 'xlsx' : 'csv'}`
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || 'Izvoza ni bilo mogoče pripraviti.')
    }
  }

  const activeInventoryLocations = useMemo(() => operationalLocations.filter((location) => location.active), [operationalLocations])
  const writableInventoryLocations = useMemo(() => {
    if (selectedLocationId == null) return activeInventoryLocations
    return activeInventoryLocations.filter((location) => location.id === selectedLocationId)
  }, [activeInventoryLocations, selectedLocationId])
  const stockLocationNames = useMemo(() => Array.from(new Set(items.map((i) => i.location).filter(Boolean) as string[])).sort(), [items])
  const defaultWriteLocationId = useMemo(() => {
    if (selectedLocationId != null && activeInventoryLocations.some((location) => location.id === selectedLocationId)) return selectedLocationId
    return activeInventoryLocations.length === 1 ? activeInventoryLocations[0].id : null
  }, [activeInventoryLocations, selectedLocationId])

  const transferInventoryRows = useMemo(() => allLocationItems.length ? allLocationItems : items, [allLocationItems, items])
  const procurementInventoryRows = useMemo(() => allLocationItems.length ? allLocationItems : items, [allLocationItems, items])
  const transferCatalogItems = useMemo(() => Array.from(new Map(
    transferInventoryRows.filter((item) => item.active && item.trackStock).map((item) => [item.id, item]),
  ).values()).sort((a, b) => a.name.localeCompare(b.name, 'sl')), [transferInventoryRows])

  const closeItemModal = () => {
    setItemModalOpen(false)
    setEditingItem(null)
  }
  const openNewItem = () => {
    setEditingItem(null)
    setItemForm(emptyItemForm(defaultWriteLocationId))
    setItemModalOpen(true)
  }
  const openEditItem = (item: Item) => {
    setEditingItem(item)
    setItemForm({
      name: item.name,
      description: item.description || '',
      sku: item.sku || '',
      barcode: item.barcode || '',
      categoryId: item.category?.id != null ? String(item.category.id) : '',
      locationId: String(item.locationId),
      unit: item.unit || 'kos',
      currentStock: String(item.currentStock ?? 0),
      minimumStock: String(item.minimumStock ?? 0),
      costPrice: String(item.costPrice ?? 0),
      salePrice: String(item.salePrice ?? 0),
      vatRate: item.vatRate || 'NO_VAT',
      billable: item.billable,
      trackStock: item.trackStock,
      active: item.active,
    })
    setItemModalOpen(true)
  }

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (q && ![item.name, item.description, item.sku, item.barcode, item.category?.name, item.location].some((v) => String(v || '').toLowerCase().includes(q))) return false
      if (categoryFilter && item.category?.id !== Number(categoryFilter)) return false
      if (locationFilter && item.location !== locationFilter) return false
      if (statusFilter === 'active' && !item.active) return false
      if (statusFilter === 'inactive' && item.active) return false
      if (statusFilter === 'low' && !item.lowStock) return false
      if (statusFilter === 'out' && (!item.trackStock || Number(item.currentStock) > 0)) return false
      if (statusFilter === 'ok' && (!item.active || item.lowStock || (item.trackStock && Number(item.currentStock) <= 0))) return false
      if (showOnlyLow && !item.lowStock) return false
      return true
    })
  }, [items, query, categoryFilter, locationFilter, statusFilter, showOnlyLow])

  const lowStockItems = useMemo(() => items.filter((i) => i.active && i.lowStock), [items])
  const billableCount = useMemo(() => new Set(items.filter((i) => i.active && i.billable).map((i) => i.id)).size, [items])
  const outOfStockCount = useMemo(() => new Set(items.filter((i) => i.active && i.trackStock && Number(i.currentStock) <= 0).map((i) => `${i.id}:${i.locationId}`)).size, [items])

  const saveItem = (event: FormEvent) => {
    event.preventDefault()
    if (!itemForm.name.trim()) {
      showToast('error', 'Vnesite naziv artikla.')
      return
    }
    if (!itemForm.locationId) {
      showToast('error', 'Izberite poslovalnico za zalogo.')
      return
    }
    const salePrice = Number(String(itemForm.salePrice || '0').replace(',', '.'))
    const minimumStock = Number(String(itemForm.minimumStock || '0').replace(',', '.'))
    const costPrice = Number(String(itemForm.costPrice || '0').replace(',', '.'))
    const currentStock = Number(String(itemForm.currentStock || '0').replace(',', '.'))
    if (![salePrice, minimumStock, costPrice, currentStock].every(Number.isFinite) || [salePrice, minimumStock, costPrice, currentStock].some((v) => v < 0)) {
      showToast('error', 'Količine in cene morajo biti veljavne nenegativne vrednosti.')
      return
    }
    setSavingItem(true)
    const payload = {
      name: itemForm.name.trim(),
      description: itemForm.description.trim() || null,
      sku: itemForm.sku.trim() || null,
      barcode: itemForm.barcode.trim() || null,
      categoryId: itemForm.categoryId ? Number(itemForm.categoryId) : null,
      locationId: Number(itemForm.locationId),
      unit: itemForm.unit.trim() || 'kos',
      currentStock: editingItem ? Number(editingItem.currentStock || 0) : currentStock,
      minimumStock,
      costPrice,
      salePrice,
      vatRate: itemForm.vatRate,
      billable: itemForm.billable,
      trackStock: itemForm.trackStock,
      active: itemForm.active,
    }
    const request = editingItem ? api.put(`/consumables/items/${editingItem.id}`, payload) : api.post('/consumables/items', payload)
    request
      .then(() => {
        showToast('success', editingItem ? 'Artikel je posodobljen.' : 'Artikel je dodan.')
        closeItemModal()
        void load()
      })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Shranjevanje artikla ni uspelo.'))
      .finally(() => setSavingItem(false))
  }

  const openStockMovement = (item: Item) => {
    setStockMovementItem(item)
    setStockMovementForm({ movementType: 'MANUAL_ADJUSTMENT', quantity: '1', direction: 'INCREASE', note: '' })
  }
  const saveStockMovement = (event: FormEvent) => {
    event.preventDefault()
    if (!stockMovementItem) return
    const delta = movementSignedQuantity(stockMovementForm)
    if (!delta) {
      showToast('error', 'Vnesite veljavno količino, večjo od 0.')
      return
    }
    setSavingMovement(true)
    api.post(`/consumables/items/${stockMovementItem.id}/adjust`, {
      locationId: stockMovementItem.locationId,
      quantityDelta: delta,
      movementType: stockMovementForm.movementType,
      note: stockMovementForm.note.trim() || null,
    })
      .then(() => {
        showToast('success', 'Premik zaloge je zabeležen.')
        setStockMovementItem(null)
        void load()
      })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Premika zaloge ni bilo mogoče shraniti.'))
      .finally(() => setSavingMovement(false))
  }


  const openStockTransfer = (item?: Item) => {
    const sourceLocationId = item?.locationId
      ?? (selectedLocationId != null && activeInventoryLocations.some((location) => location.id === selectedLocationId) ? selectedLocationId : null)
      ?? activeInventoryLocations[0]?.id
      ?? null
    if (sourceLocationId == null || activeInventoryLocations.length < 2) {
      showToast('error', 'Za prenos zaloge potrebujete vsaj dve aktivni poslovalnici.')
      return
    }
    const destinationLocationId = activeInventoryLocations.find((location) => location.id !== sourceLocationId)?.id ?? null
    const sourceItem = item
      ?? transferInventoryRows.find((candidate) => candidate.locationId === sourceLocationId && candidate.active && candidate.trackStock && Number(candidate.currentStock || 0) > 0)
      ?? transferInventoryRows.find((candidate) => candidate.locationId === sourceLocationId && candidate.active && candidate.trackStock)
      ?? transferCatalogItems[0]
      ?? null
    setTransferForm({
      consumableId: sourceItem ? String(sourceItem.id) : '',
      fromLocationId: String(sourceLocationId),
      toLocationId: destinationLocationId != null ? String(destinationLocationId) : '',
      quantity: '1',
      note: '',
    })
    setTransferModalOpen(true)
    if (!allLocationItems.length) {
      void api.get<Item[]>('/consumables/items').then(({ data }) => setAllLocationItems(data || [])).catch(() => undefined)
    }
  }

  const saveStockTransfer = (event: FormEvent) => {
    event.preventDefault()
    const quantity = Number(String(transferForm.quantity || '').replace(',', '.'))
    const consumableId = Number(transferForm.consumableId)
    const fromLocationId = Number(transferForm.fromLocationId)
    const toLocationId = Number(transferForm.toLocationId)
    if (!consumableId || !fromLocationId || !toLocationId) {
      showToast('error', 'Izberite artikel, izvorno in ciljno poslovalnico.')
      return
    }
    if (fromLocationId === toLocationId) {
      showToast('error', 'Izvorna in ciljna poslovalnica morata biti različni.')
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToast('error', 'Vnesite veljavno količino, večjo od 0.')
      return
    }
    const sourceRow = transferInventoryRows.find((row) => row.id === consumableId && row.locationId === fromLocationId)
    if (sourceRow?.trackStock && quantity > Number(sourceRow.currentStock || 0)) {
      showToast('error', `Na izvorni poslovalnici je na voljo samo ${n(sourceRow.currentStock, 2)} ${sourceRow.unit}.`)
      return
    }
    setSavingTransfer(true)
    const idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    api.post<StockTransfer>('/consumables/transfers', {
      idempotencyKey,
      consumableId,
      fromLocationId,
      toLocationId,
      quantity,
      note: transferForm.note.trim() || null,
    })
      .then(({ data }) => {
        showToast('success', `${data?.itemName || 'Artikel'} je prenesen med poslovalnicama.`)
        setTransferModalOpen(false)
        void queryClient.invalidateQueries({ queryKey: queryKeys.consumables.all, refetchType: 'none' })
        void load()
      })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Prenosa zaloge ni bilo mogoče izvesti.'))
      .finally(() => setSavingTransfer(false))
  }

  const openCategoryManager = () => {
    setCategoryForm({ id: null, name: '', color: '#2563eb', active: true })
    setCategoryModalOpen(true)
  }
  const editCategory = (category: Category) => {
    setCategoryForm({ id: category.id, name: category.name, color: category.color || '#2563eb', active: category.active })
  }
  const saveCategory = (event: FormEvent) => {
    event.preventDefault()
    const name = categoryForm.name.trim()
    if (!name) {
      showToast('error', 'Vnesite naziv kategorije.')
      return
    }
    setSavingCategory(true)
    const payload = { name, color: categoryForm.color || '#2563eb', active: categoryForm.active }
    const request = categoryForm.id ? api.put(`/consumables/categories/${categoryForm.id}`, payload) : api.post('/consumables/categories', payload)
    request
      .then(() => {
        showToast('success', categoryForm.id ? 'Kategorija je posodobljena.' : 'Kategorija je dodana.')
        setCategoryForm({ id: null, name: '', color: '#2563eb', active: true })
        void load()
      })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Kategorije ni bilo mogoče shraniti.'))
      .finally(() => setSavingCategory(false))
  }
  const toggleCategory = (category: Category) => {
    api.put(`/consumables/categories/${category.id}`, { name: category.name, color: category.color || '#2563eb', active: !category.active })
      .then(() => { showToast('success', category.active ? 'Kategorija je deaktivirana.' : 'Kategorija je aktivirana.'); void load() })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Statusa kategorije ni bilo mogoče spremeniti.'))
  }

  const openNewSupplier = () => {
    setEditingSupplier(null)
    setSupplierForm({ ...emptySupplierForm })
    setSupplierModalOpen(true)
  }
  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setSupplierForm({
      name: supplier.name,
      contactName: supplier.contactName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      categories: supplier.categories || '',
      paymentTermsDays: String(supplier.paymentTermsDays ?? 30),
      reliabilityPercent: String(supplier.reliabilityPercent ?? 100),
      outstandingAmount: String(supplier.outstandingAmount ?? 0),
      status: supplier.status || 'ACTIVE',
    })
    setSupplierModalOpen(true)
  }
  const saveSupplier = (event: FormEvent) => {
    event.preventDefault()
    if (!supplierForm.name.trim()) {
      showToast('error', 'Vnesite naziv dobavitelja.')
      return
    }
    const paymentTermsDays = Number(supplierForm.paymentTermsDays || 0)
    const reliabilityPercent = Number(supplierForm.reliabilityPercent || 0)
    const outstandingAmount = Number(String(supplierForm.outstandingAmount || '0').replace(',', '.'))
    if (![paymentTermsDays, reliabilityPercent, outstandingAmount].every(Number.isFinite) || paymentTermsDays < 0 || reliabilityPercent < 0 || reliabilityPercent > 100 || outstandingAmount < 0) {
      showToast('error', 'Preverite plačilni rok, zanesljivost in neplačane obveznosti.')
      return
    }
    setSavingSupplier(true)
    const payload = {
      name: supplierForm.name.trim(),
      contactName: supplierForm.contactName.trim() || null,
      phone: supplierForm.phone.trim() || null,
      email: supplierForm.email.trim() || null,
      categories: supplierForm.categories.trim() || null,
      paymentTermsDays,
      reliabilityPercent,
      outstandingAmount,
      status: supplierForm.status,
    }
    const request = editingSupplier ? api.put(`/consumables/suppliers/${editingSupplier.id}`, payload) : api.post('/consumables/suppliers', payload)
    request
      .then(() => {
        showToast('success', editingSupplier ? 'Dobavitelj je posodobljen.' : 'Dobavitelj je dodan.')
        setSupplierModalOpen(false)
        setEditingSupplier(null)
        void load()
      })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Dobavitelja ni bilo mogoče shraniti.'))
      .finally(() => setSavingSupplier(false))
  }

  const openNewPurchaseOrder = (suggestedItems: Item[] = []) => {
    if (defaultWriteLocationId == null) {
      showToast('error', 'Za naročilnico najprej izberite poslovalnico v zgornjem izbirniku.')
      return
    }
    const byItem = new Map<number, Item>()
    suggestedItems.filter((item) => item.locationId === defaultWriteLocationId).forEach((item) => byItem.set(item.id, item))
    setPurchaseOrderForm({
      ...emptyPurchaseOrderForm(defaultWriteLocationId),
      lines: Array.from(byItem.values()).map((item) => ({
        consumableId: String(item.id),
        orderedQuantity: String(suggestedOrderQuantity(item)),
        receivedQuantity: 0,
        unitPrice: String(Number(item.costPrice || 0)),
        vatRate: item.vatRate || 'NO_VAT',
      })),
    })
    setPurchaseOrderModalOpen(true)
  }

  const openExistingPurchaseOrder = (order: PurchaseOrder) => {
    setLoadingPurchaseOrder(true)
    setPurchaseOrderModalOpen(true)
    api.get<PurchaseOrderDetail>(`/consumables/purchase-orders/${order.id}`)
      .then(({ data }) => {
        const detail = data
        setPurchaseOrderForm({
          id: detail.order.id,
          orderNumber: detail.order.orderNumber || '',
          supplierId: detail.order.supplierId != null ? String(detail.order.supplierId) : '',
          locationId: detail.order.locationId != null ? String(detail.order.locationId) : '',
          status: detail.order.status,
          orderDate: detail.order.orderDate || new Date().toISOString().slice(0, 10),
          expectedDate: detail.order.expectedDate || '',
          notes: detail.order.notes || '',
          lines: (detail.lines || []).map((line) => ({
            lineId: line.id,
            consumableId: String(line.consumableId),
            orderedQuantity: String(line.orderedQuantity),
            receivedQuantity: Number(line.receivedQuantity || 0),
            unitPrice: String(line.unitPrice || 0),
            vatRate: line.vatRate || 'NO_VAT',
          })),
          receipts: detail.receipts || [],
        })
      })
      .catch((e) => { showToast('error', e?.response?.data?.message || 'Naročilnice ni bilo mogoče odpreti.'); setPurchaseOrderModalOpen(false) })
      .finally(() => setLoadingPurchaseOrder(false))
  }

  const closePurchaseOrderModal = () => {
    setPurchaseOrderModalOpen(false)
    setReceiveModalOpen(false)
    setPurchaseOrderForm(emptyPurchaseOrderForm(defaultWriteLocationId))
  }

  const addPurchaseOrderLine = (item?: Item, initialQuantity?: number) => {
    const firstAvailable = item || procurementInventoryRows.find((candidate) => candidate.locationId === Number(purchaseOrderForm.locationId) && !purchaseOrderForm.lines.some((line) => Number(line.consumableId) === candidate.id))
    setPurchaseOrderForm((form) => ({
      ...form,
      lines: [...form.lines, {
        consumableId: firstAvailable ? String(firstAvailable.id) : '',
        orderedQuantity: firstAvailable ? String(initialQuantity ?? Math.max(1, suggestedOrderQuantity(firstAvailable))) : '1',
        receivedQuantity: 0,
        unitPrice: firstAvailable ? String(Number(firstAvailable.costPrice || 0)) : '0',
        vatRate: firstAvailable?.vatRate || 'NO_VAT',
      }],
    }))
  }

  const updatePurchaseOrderLine = (index: number, patch: Partial<PurchaseOrderLineForm>) => {
    setPurchaseOrderForm((form) => ({ ...form, lines: form.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }))
  }

  const selectPurchaseOrderItem = (index: number, consumableId: string) => {
    const item = procurementInventoryRows.find((candidate) => candidate.id === Number(consumableId) && candidate.locationId === Number(purchaseOrderForm.locationId))
    updatePurchaseOrderLine(index, {
      consumableId,
      unitPrice: item ? String(Number(item.costPrice || 0)) : '0',
      vatRate: item?.vatRate || 'NO_VAT',
    })
  }

  const removePurchaseOrderLine = (index: number) => {
    setPurchaseOrderForm((form) => ({ ...form, lines: form.lines.filter((_, i) => i !== index) }))
  }

  const savePurchaseOrder = (event: FormEvent) => {
    event.preventDefault()
    if (!purchaseOrderForm.locationId) { showToast('error', 'Izberite poslovalnico prejema.'); return }
    const hasReceipts = purchaseOrderForm.lines.some((line) => Number(line.receivedQuantity || 0) > 0)
    const cleanLines = purchaseOrderForm.lines.map((line) => ({
      consumableId: Number(line.consumableId),
      orderedQuantity: Number(String(line.orderedQuantity).replace(',', '.')),
      unitPrice: Number(String(line.unitPrice).replace(',', '.')),
      vatRate: line.vatRate,
    }))
    if (!hasReceipts && cleanLines.some((line) => !line.consumableId || !Number.isFinite(line.orderedQuantity) || line.orderedQuantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
      showToast('error', 'Preverite artikle, količine in nabavne cene na naročilnici.')
      return
    }
    if (!hasReceipts && new Set(cleanLines.map((line) => line.consumableId)).size !== cleanLines.length) {
      showToast('error', 'Artikel je lahko na naročilnici samo enkrat.')
      return
    }
    if (purchaseOrderForm.status === 'ORDERED' && (!purchaseOrderForm.supplierId || cleanLines.length === 0)) {
      showToast('error', 'Preden naročilnico označite kot naročeno, izberite dobavitelja in dodajte vsaj en artikel.')
      return
    }
    setSavingPurchaseOrder(true)
    const payload = {
      orderNumber: purchaseOrderForm.orderNumber.trim() || null,
      supplierId: purchaseOrderForm.supplierId ? Number(purchaseOrderForm.supplierId) : null,
      locationId: Number(purchaseOrderForm.locationId),
      status: ['PARTIALLY_RECEIVED', 'COMPLETED'].includes(purchaseOrderForm.status) ? null : purchaseOrderForm.status,
      orderDate: purchaseOrderForm.orderDate || null,
      expectedDate: purchaseOrderForm.expectedDate || null,
      notes: purchaseOrderForm.notes.trim() || null,
      lines: hasReceipts ? null : cleanLines,
    }
    const request = purchaseOrderForm.id ? api.put(`/consumables/purchase-orders/${purchaseOrderForm.id}`, payload) : api.post('/consumables/purchase-orders', payload)
    request.then((response) => {
      showToast('success', purchaseOrderForm.id ? 'Naročilnica je posodobljena.' : 'Naročilnica je ustvarjena.')
      const id = purchaseOrderForm.id || response.data?.id
      void load()
      if (id) openExistingPurchaseOrder({ ...(response.data || {}), id } as PurchaseOrder)
      else closePurchaseOrderModal()
    }).catch((e) => showToast('error', e?.response?.data?.message || 'Naročilnice ni bilo mogoče shraniti.'))
      .finally(() => setSavingPurchaseOrder(false))
  }

  const openReceivePurchaseOrder = () => {
    const quantities: Record<number, string> = {}
    purchaseOrderForm.lines.forEach((line) => { if (line.lineId) quantities[line.lineId] = '0' })
    setReceiveQuantities(quantities)
    setReceiveNote('')
    setReceiveModalOpen(true)
  }

  const fillAllRemainingReceiveQuantities = () => {
    const quantities: Record<number, string> = {}
    purchaseOrderForm.lines.forEach((line) => {
      if (line.lineId) quantities[line.lineId] = String(Math.max(0, Number(line.orderedQuantity || 0) - Number(line.receivedQuantity || 0)))
    })
    setReceiveQuantities(quantities)
  }

  const saveReceipt = (event: FormEvent) => {
    event.preventDefault()
    if (!purchaseOrderForm.id) return
    const lines = purchaseOrderForm.lines.filter((line) => line.lineId).map((line) => ({
      lineId: line.lineId as number,
      quantity: Number(String(receiveQuantities[line.lineId as number] || '0').replace(',', '.')),
    })).filter((line) => Number.isFinite(line.quantity) && line.quantity > 0)
    if (!lines.length) { showToast('error', 'Vnesite vsaj eno prejeto količino.'); return }
    const invalid = lines.some((request) => {
      const line = purchaseOrderForm.lines.find((candidate) => candidate.lineId === request.lineId)
      return !line || request.quantity > Number(line.orderedQuantity || 0) - Number(line.receivedQuantity || 0)
    })
    if (invalid) { showToast('error', 'Prejeta količina ne sme presegati preostale naročene količine.'); return }
    setSavingReceipt(true)
    const key = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    api.post(`/consumables/purchase-orders/${purchaseOrderForm.id}/receive`, { idempotencyKey: key, note: receiveNote.trim() || null, lines })
      .then(({ data }) => {
        showToast('success', 'Prejem je zabeležen in zaloga je posodobljena.')
        setReceiveModalOpen(false)
        void load()
        const detail = data as PurchaseOrderDetail
        setPurchaseOrderForm({
          id: detail.order.id,
          orderNumber: detail.order.orderNumber || '',
          supplierId: detail.order.supplierId != null ? String(detail.order.supplierId) : '',
          locationId: detail.order.locationId != null ? String(detail.order.locationId) : '',
          status: detail.order.status,
          orderDate: detail.order.orderDate || '',
          expectedDate: detail.order.expectedDate || '',
          notes: detail.order.notes || '',
          lines: detail.lines.map((line) => ({ lineId: line.id, consumableId: String(line.consumableId), orderedQuantity: String(line.orderedQuantity), receivedQuantity: Number(line.receivedQuantity || 0), unitPrice: String(line.unitPrice || 0), vatRate: line.vatRate })),
          receipts: detail.receipts || [],
        })
      })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Prejema ni bilo mogoče shraniti.'))
      .finally(() => setSavingReceipt(false))
  }

  const hydrateInventory = (detail: InventoryDetail | null) => {
    setInventoryDetail(detail)
    setInventoryCountDraft(toInventoryDraft(detail))
  }

  const refreshInventorySessions = async (preferredId?: number | null) => {
    const response = await api.get<InventorySession[]>('/consumables/inventory-sessions', { params: { locationId: selectedLocationId ?? undefined } })
    const rows = response.data || []
    setInventorySessions(rows)
    const preferred = rows.find((row) => row.id === preferredId) || rows.find((row) => row.status === 'IN_PROGRESS') || rows[0] || null
    if (!preferred) { hydrateInventory(null); return }
    const detailResponse = await api.get<InventoryDetail>(`/consumables/inventory-sessions/${preferred.id}`)
    hydrateInventory(detailResponse.data || null)
  }

  const openInventorySession = async (sessionId: number) => {
    setLoadingInventoryDetail(true)
    try {
      const response = await api.get<InventoryDetail>(`/consumables/inventory-sessions/${sessionId}`)
      hydrateInventory(response.data || null)
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || 'Inventure ni bilo mogoče odpreti.')
    } finally {
      setLoadingInventoryDetail(false)
    }
  }

  const openStartInventory = () => {
    const locationId = defaultWriteLocationId ?? writableInventoryLocations.find((location) => !inventorySessions.some((session) => session.locationId === location.id && session.status === 'IN_PROGRESS'))?.id ?? writableInventoryLocations[0]?.id ?? null
    if (locationId == null) {
      showToast('error', 'Izberite poslovalnico za inventuro.')
      return
    }
    setInventoryStartLocationId(String(locationId))
    setInventoryStartNotes('')
    setInventoryStartModalOpen(true)
  }

  const startInventory = (event: FormEvent) => {
    event.preventDefault()
    if (!inventoryStartLocationId) { showToast('error', 'Izberite poslovalnico.'); return }
    setSavingInventory(true)
    api.post<InventoryDetail>('/consumables/inventory-sessions', { locationId: Number(inventoryStartLocationId), notes: inventoryStartNotes.trim() || null })
      .then(({ data }) => {
        showToast('success', 'Inventura je začeta. Sistemske količine so shranjene kot začetni posnetek.')
        setInventoryStartModalOpen(false)
        hydrateInventory(data || null)
        void refreshInventorySessions(data?.session?.id).catch(() => undefined)
      })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Inventure ni bilo mogoče začeti.'))
      .finally(() => setSavingInventory(false))
  }

  const saveInventoryCounts = async (showSuccess = true) => {
    if (!inventoryDetail || inventoryDetail.session.status !== 'IN_PROGRESS') return inventoryDetail
    setSavingInventory(true)
    try {
      const payload = {
        lines: inventoryDetail.lines.map((line) => {
          const draft = inventoryCountDraft[line.id] || { countedQuantity: '', notes: '' }
          const raw = draft.countedQuantity.trim().replace(',', '.')
          const countedQuantity = raw === '' ? null : Number(raw)
          if (countedQuantity != null && (!Number.isFinite(countedQuantity) || countedQuantity < 0)) {
            throw new Error(`Neveljavna količina pri artiklu ${line.itemName}.`)
          }
          return { lineId: line.id, countedQuantity, notes: draft.notes.trim() || null }
        }),
      }
      const response = await api.put<InventoryDetail>(`/consumables/inventory-sessions/${inventoryDetail.session.id}/counts`, payload)
      hydrateInventory(response.data || null)
      await refreshInventorySessions(response.data?.session?.id).catch(() => undefined)
      if (showSuccess) showToast('success', 'Štetje inventure je shranjeno.')
      return response.data || null
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || e?.message || 'Štetja ni bilo mogoče shraniti.')
      throw e
    } finally {
      setSavingInventory(false)
    }
  }

  const finalizeInventory = async () => {
    if (!inventoryDetail || inventoryDetail.session.status !== 'IN_PROGRESS') return
    const uncounted = inventoryDetail.lines.filter((line) => (inventoryCountDraft[line.id]?.countedQuantity ?? '').trim() === '').length
    if (uncounted > 0) { showToast('error', `Pred zaključkom preštejte vse artikle. Manjka še ${uncounted}.`); return }
    if (!window.confirm('Zaključim inventuro? Razlike bodo zapisane kot premiki zaloge in inventure po tem ne bo več mogoče urejati.')) return
    try {
      await saveInventoryCounts(false)
      setSavingInventory(true)
      const response = await api.post<InventoryDetail>(`/consumables/inventory-sessions/${inventoryDetail.session.id}/finalize`)
      hydrateInventory(response.data || null)
      await refreshInventorySessions(response.data?.session?.id).catch(() => undefined)
      await queryClient.invalidateQueries({ queryKey: queryKeys.consumables.all, refetchType: 'none' })
      showToast('success', 'Inventura je zaključena. Odstopanja so zabeležena v premikih zaloge.')
    } catch (e: any) {
      if (e?.message && !e?.response) return
      showToast('error', e?.response?.data?.message || 'Inventure ni bilo mogoče zaključiti.')
    } finally {
      setSavingInventory(false)
    }
  }

  const normalizeBarcode = (value: string | null | undefined) => String(value || '').trim().toLowerCase()
  const barcodeCatalog = useMemo(() => {
    const source = allLocationItems.length ? allLocationItems : items
    const byId = new Map<number, Item>()
    source.forEach((item) => { if (item.barcode && !byId.has(item.id)) byId.set(item.id, item) })
    return Array.from(byId.values())
  }, [allLocationItems, items])

  const resolveBarcodeItem = (code: string): { item?: Item; error?: string } => {
    const normalized = normalizeBarcode(code)
    const matches = barcodeCatalog.filter((item) => normalizeBarcode(item.barcode) === normalized)
    if (matches.length === 0) return { error: `Črtna koda ${code} ni povezana z nobenim artiklom.` }
    const uniqueIds = new Set(matches.map((item) => item.id))
    if (uniqueIds.size > 1) return { error: `Črtna koda ${code} je povezana z več artikli. Uredite podvojene kode.` }
    return { item: matches[0] }
  }

  const rowForLocation = (consumableId: number, locationId?: number | null) => {
    const source = allLocationItems.length ? allLocationItems : items
    return source.find((item) => item.id === consumableId && (locationId == null || item.locationId === locationId))
      || source.find((item) => item.id === consumableId)
      || null
  }

  const openBarcodeScanner = (mode: BarcodeScannerMode) => {
    const config: Record<BarcodeScannerMode, Omit<BarcodeScannerState, 'mode'>> = {
      FIND_ITEM: { title: 'Skeniraj artikel', subtitle: 'Skenirajte črtno kodo za hitro iskanje artikla.' },
      ITEM_BARCODE: { title: 'Nastavi črtno kodo', subtitle: 'Skenirana koda se bo zapisala v artikel.' },
      MOVEMENT_ITEM: { title: 'Skeniraj artikel za premik', subtitle: 'Po skenu se odpre ročni premik zaloge za izbrano poslovalnico.' },
      TRANSFER_ITEM: { title: 'Skeniraj artikel za prenos', subtitle: 'Po skenu bo artikel izbran v prenosu med poslovalnicama.' },
      PURCHASE_ORDER_ITEM: { title: 'Dodaj artikel s skenom', subtitle: 'Skenirajte artikel, ki ga želite dodati na naročilnico.' },
      RECEIVE_ITEM: { title: 'Skeniraj prejem blaga', subtitle: 'Vsak uspešen sken poveča količino »Prejmi zdaj« za 1 enoto.', continuous: true },
      INVENTORY_ITEM: { title: 'Skeniraj inventuro', subtitle: 'Vsak uspešen sken poveča prešteto količino artikla za 1 enoto.', continuous: true },
    }
    if ((mode === 'FIND_ITEM' || mode === 'MOVEMENT_ITEM' || mode === 'TRANSFER_ITEM' || mode === 'INVENTORY_ITEM') && !allLocationItems.length) {
      void api.get<Item[]>('/consumables/items').then(({ data }) => setAllLocationItems(data || [])).catch(() => undefined)
    }
    setBarcodeScanner({ mode, ...config[mode] })
  }

  const handleBarcodeScan = (code: string): BarcodeScanResult => {
    if (!barcodeScanner) return { accepted: false, message: 'Skener ni več aktiven.' }
    if (barcodeScanner.mode === 'ITEM_BARCODE') {
      setItemForm((form) => ({ ...form, barcode: code }))
      return { accepted: true, message: `Koda ${code} je vpisana v artikel.`, close: true }
    }

    const resolved = resolveBarcodeItem(code)
    if (!resolved.item) return { accepted: false, message: resolved.error || 'Artikla ni bilo mogoče najti.' }
    const catalogItem = resolved.item

    if (barcodeScanner.mode === 'FIND_ITEM') {
      setActiveTab('items')
      setQuery(code)
      setCategoryFilter('')
      setLocationFilter('')
      setStatusFilter('')
      return { accepted: true, message: `Najden artikel: ${catalogItem.name}.`, close: true }
    }

    if (barcodeScanner.mode === 'MOVEMENT_ITEM') {
      const preferredLocationId = selectedLocationId ?? defaultWriteLocationId
      const row = rowForLocation(catalogItem.id, preferredLocationId)
      if (!row) return { accepted: false, message: 'Artikel nima zalogovne vrstice v izbrani poslovalnici.' }
      openStockMovement(row)
      return { accepted: true, message: `Odpiram premik za ${catalogItem.name}.`, close: true }
    }

    if (barcodeScanner.mode === 'TRANSFER_ITEM') {
      if (!catalogItem.trackStock) return { accepted: false, message: `${catalogItem.name} nima vklopljenega spremljanja zaloge.` }
      setTransferForm((form) => ({ ...form, consumableId: String(catalogItem.id) }))
      return { accepted: true, message: `Izbran artikel: ${catalogItem.name}.`, close: true }
    }

    if (barcodeScanner.mode === 'PURCHASE_ORDER_ITEM') {
      if (purchaseOrderHasReceipts || purchaseOrderTerminal) return { accepted: false, message: 'Artiklov na tej naročilnici ni več mogoče spreminjati.' }
      const locationId = Number(purchaseOrderForm.locationId)
      if (!locationId) return { accepted: false, message: 'Najprej izberite poslovalnico prejema.' }
      const item = procurementInventoryRows.find((candidate) => candidate.id === catalogItem.id && candidate.locationId === locationId)
      if (!item) return { accepted: false, message: `${catalogItem.name} ni na voljo v izbrani poslovalnici.` }
      if (purchaseOrderForm.lines.some((line) => Number(line.consumableId) === item.id)) return { accepted: false, message: `${item.name} je že na naročilnici.` }
      addPurchaseOrderLine(item, 1)
      return { accepted: true, message: `${item.name} je dodan na naročilnico.`, close: true }
    }

    if (barcodeScanner.mode === 'RECEIVE_ITEM') {
      const line = purchaseOrderForm.lines.find((candidate) => candidate.lineId && Number(candidate.consumableId) === catalogItem.id)
      if (!line?.lineId) return { accepted: false, message: `${catalogItem.name} ni na tej naročilnici.` }
      const remaining = Math.max(0, Number(line.orderedQuantity || 0) - Number(line.receivedQuantity || 0))
      const current = Math.max(0, Number(String(receiveQuantities[line.lineId] || '0').replace(',', '.')) || 0)
      if (remaining <= 0 || current >= remaining) return { accepted: false, message: `${catalogItem.name}: vsa naročena količina je že zajeta v prejemu.` }
      const next = Math.min(remaining, current + 1)
      setReceiveQuantities((values) => ({ ...values, [line.lineId as number]: String(next) }))
      const row = procurementInventoryRows.find((candidate) => candidate.id === catalogItem.id && candidate.locationId === Number(purchaseOrderForm.locationId))
      return { accepted: true, message: `${catalogItem.name}: ${n(next, 2)} ${row?.unit || catalogItem.unit} za prejem.`, close: false }
    }

    if (barcodeScanner.mode === 'INVENTORY_ITEM') {
      if (!inventoryDetail || inventoryDetail.session.status !== 'IN_PROGRESS') return { accepted: false, message: 'Odprite inventuro, ki je še v teku.' }
      const line = inventoryDetail.lines.find((candidate) => candidate.consumableId === catalogItem.id)
      if (!line) return { accepted: false, message: `${catalogItem.name} ni del te inventure.` }
      const raw = inventoryCountDraft[line.id]?.countedQuantity ?? (line.countedQuantity == null ? '' : String(line.countedQuantity))
      const current = Math.max(0, Number(String(raw || '0').replace(',', '.')) || 0)
      const next = current + 1
      setInventoryCountDraft((draft) => ({ ...draft, [line.id]: { countedQuantity: String(next), notes: draft[line.id]?.notes || line.notes || '' } }))
      setInventoryQuery(catalogItem.name)
      return { accepted: true, message: `${catalogItem.name}: prešteto ${n(next, 2)} ${line.unit}.`, close: false }
    }

    return { accepted: false, message: 'Ta način skeniranja ni podprt.' }
  }

  const createPurchaseOrder = (suggestedItems: Item[] = []) => openNewPurchaseOrder(suggestedItems)


  const stockPreviewDelta = movementSignedQuantity(stockMovementForm)
  const stockPreviewAfter = stockMovementItem ? Number(stockMovementItem.currentStock || 0) + stockPreviewDelta : 0
  const manualDirectionVisible = ['MANUAL_ADJUSTMENT', 'CORRECTION'].includes(stockMovementForm.movementType)
  const transferSelectedItem = transferCatalogItems.find((item) => item.id === Number(transferForm.consumableId)) || null
  const transferSourceRow = transferInventoryRows.find((item) => item.id === Number(transferForm.consumableId) && item.locationId === Number(transferForm.fromLocationId)) || null
  const transferDestinationRow = transferInventoryRows.find((item) => item.id === Number(transferForm.consumableId) && item.locationId === Number(transferForm.toLocationId)) || null
  const transferQuantity = Math.max(0, Number(String(transferForm.quantity || '0').replace(',', '.')) || 0)
  const transferSourceAfter = Number(transferSourceRow?.currentStock || 0) - transferQuantity
  const transferDestinationAfter = Number(transferDestinationRow?.currentStock || 0) + transferQuantity

  const purchaseOrderHasReceipts = purchaseOrderForm.lines.some((line) => Number(line.receivedQuantity || 0) > 0)
  const purchaseOrderTerminal = ['COMPLETED', 'CANCELLED'].includes(purchaseOrderForm.status)
  const purchaseOrderTotals = purchaseOrderForm.lines.reduce((totals, line) => {
    const quantity = Number(String(line.orderedQuantity || '0').replace(',', '.')) || 0
    const unitPrice = Number(String(line.unitPrice || '0').replace(',', '.')) || 0
    const net = quantity * unitPrice
    const vat = net * vatMultiplier(line.vatRate)
    totals.net += net; totals.vat += vat; totals.gross += net + vat
    return totals
  }, { net: 0, vat: 0, gross: 0 })

  return (
    <div className="consumables-page">
      <section className="consumables-panel">
        <div className="consumables-header-row">
          <div><h1>Porabni material</h1></div>
          <div className="consumables-header-actions">
            {canViewConsumableReports && activeTab !== 'reports' && <button type="button" className="btn secondary" onClick={() => setActiveTab('reports')}>Poročila / izvoz</button>}
            {activeTab === 'reports' && <><button type="button" className="btn secondary" onClick={() => void exportReport('csv')}>CSV</button><button type="button" className="btn primary" onClick={() => void exportReport('excel')}>Excel</button></>}
            {activeTab === 'items' && <>{canAdjustStock && <button type="button" className="btn secondary barcode-action" onClick={() => openBarcodeScanner('FIND_ITEM')}>▦ Skeniraj</button>}{canEditConsumables && <button type="button" className="btn primary" onClick={openNewItem}>+ Nov artikel</button>}</>}
            {activeTab === 'procurement' && canManageProcurement && <button type="button" className="btn primary" onClick={() => createPurchaseOrder()}>+ Nova naročilnica</button>}
            {activeTab === 'suppliers' && canManageProcurement && <button type="button" className="btn primary" onClick={openNewSupplier}>+ Nov dobavitelj</button>}
            {activeTab === 'movements' && canAdjustStock && <><button type="button" className="btn secondary barcode-action" onClick={() => openBarcodeScanner('MOVEMENT_ITEM')}>▦ Skeniraj za premik</button><button type="button" className="btn secondary" onClick={() => setActiveTab('items')}>Nov premik</button><button type="button" className="btn primary" onClick={() => openStockTransfer()}>⇄ Prenos zaloge</button></>}
            {activeTab === 'inventory' && canManageInventory && <><button type="button" className="btn secondary barcode-action" disabled={inventoryDetail?.session.status !== 'IN_PROGRESS'} onClick={() => openBarcodeScanner('INVENTORY_ITEM')}>▦ Skeniraj štetje</button><button type="button" className="btn primary" onClick={openStartInventory}>+ Začni inventuro</button></>}
          </div>
        </div>

        <div className="consumables-tabs" role="tablist" aria-label="Porabni material">
          {visibleTabs.map((tab) => <button key={tab.key} type="button" className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
        </div>

        {activeTab === 'overview' && <OverviewTab overview={overview} items={items} lowStockItems={lowStockItems} movements={movements} query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} showOnlyLow={showOnlyLow} setShowOnlyLow={setShowOnlyLow} categories={categories} locations={stockLocationNames} createPurchaseOrder={createPurchaseOrder} canManageProcurement={canManageProcurement} loading={loading} />}
        {activeTab === 'items' && <ItemsTab items={filteredItems} categories={categories} locations={stockLocationNames} query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} lowStockItems={lowStockItems} billableCount={billableCount} outOfStockCount={outOfStockCount} openCategoryManager={canEditConsumables ? openCategoryManager : undefined} onEditItem={canEditConsumables ? openEditItem : undefined} onAdjustStock={canAdjustStock ? openStockMovement : undefined} onTransferStock={canAdjustStock ? openStockTransfer : undefined} />}
        {activeTab === 'procurement' && <ProcurementTab orders={purchaseOrders} items={items} suppliers={suppliers} createPurchaseOrder={createPurchaseOrder} openPurchaseOrder={openExistingPurchaseOrder} createSuggestedOrder={openNewPurchaseOrder} highlightItemId={notificationLowStockItemId} canManage={canManageProcurement} />}
        {activeTab === 'suppliers' && <SuppliersTab suppliers={suppliers} openSupplier={openEditSupplier} createSupplier={openNewSupplier} canManage={canManageProcurement} />}
        {activeTab === 'movements' && <MovementsTab movements={movements} transfers={transfers} onCreateTransfer={() => openStockTransfer()} canManage={canAdjustStock} />}
        {activeTab === 'inventory' && <InventoryTab sessions={inventorySessions} detail={inventoryDetail} draft={inventoryCountDraft} setDraft={setInventoryCountDraft} query={inventoryQuery} setQuery={setInventoryQuery} categoryFilter={inventoryCategoryFilter} setCategoryFilter={setInventoryCategoryFilter} countStatusFilter={inventoryCountStatusFilter} setCountStatusFilter={setInventoryCountStatusFilter} loading={loading || loadingInventoryDetail} saving={savingInventory} onOpenSession={openInventorySession} onSave={() => { void saveInventoryCounts().catch(() => undefined) }} onFinalize={() => { void finalizeInventory() }} onScan={() => openBarcodeScanner('INVENTORY_ITEM')} canManage={canManageInventory} />}
        {activeTab === 'reports' && canViewConsumableReports && <ReportsTab report={report} loading={reportLoading} reportType={reportType} setReportType={setReportType} from={reportFrom} setFrom={setReportFrom} to={reportTo} setTo={setReportTo} locationId={reportLocationId} setLocationId={setReportLocationId} serviceTypeId={reportServiceTypeId} setServiceTypeId={setReportServiceTypeId} employeeId={reportEmployeeId} setEmployeeId={setReportEmployeeId} locations={activeInventoryLocations} onRefresh={() => void loadReport()} onExportCsv={() => void exportReport('csv')} onExportExcel={() => void exportReport('excel')} />}
      </section>

      {inventoryStartModalOpen && (
        <div className="consumables-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setInventoryStartModalOpen(false) }}>
          <form className="consumables-modal" onSubmit={startInventory}>
            <header><div><h2>Začni inventuro</h2><p>Sistemska zaloga se ob začetku shrani kot nespremenljiv posnetek za izbrano poslovalnico.</p></div><button type="button" onClick={() => setInventoryStartModalOpen(false)} aria-label="Zapri">×</button></header>
            <div className="consumables-modal-grid">
              <label>Poslovalnica<select autoFocus value={inventoryStartLocationId} onChange={(e) => setInventoryStartLocationId(e.target.value)}><option value="">Izberite poslovalnico</option>{writableInventoryLocations.map((location) => { const active = inventorySessions.some((session) => session.locationId === location.id && session.status === 'IN_PROGRESS'); return <option key={location.id} value={location.id} disabled={active}>{location.name}{active ? ' · inventura že poteka' : ''}</option> })}</select></label>
              <label className="full">Opomba<textarea value={inventoryStartNotes} onChange={(e) => setInventoryStartNotes(e.target.value)} placeholder="Npr. mesečna inventura, zaključek izmene ..." /></label>
            </div>
            <div className="procurement-info-note inventory-start-note">Med inventuro lahko normalno nastajajo drugi premiki zaloge. Zaključna korekcija uporablja razliko med prešteto količino in posnetkom ob začetku, zato kasnejši premiki ne prepišejo začetnega stanja.</div>
            <footer><button type="button" className="btn secondary" onClick={() => setInventoryStartModalOpen(false)}>Prekliči</button><button type="submit" className="btn primary" disabled={savingInventory}>{savingInventory ? 'Začenjam…' : 'Začni inventuro'}</button></footer>
          </form>
        </div>
      )}

      {itemModalOpen && (
        <div className="consumables-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeItemModal() }}>
          <form className="consumables-modal consumables-modal-wide" onSubmit={saveItem}>
            <header>
              <div><h2>{editingItem ? 'Uredi artikel' : 'Nov artikel'}</h2><p>{editingItem ? `Urejate zalogo za poslovalnico ${editingItem.location || ''}. Katalogski podatki veljajo za artikel v vseh poslovalnicah.` : 'Dodajte artikel in začetno zalogo za izbrano poslovalnico.'}</p></div>
              <button type="button" onClick={closeItemModal} aria-label="Zapri">×</button>
            </header>
            <div className="consumables-modal-grid">
              <label>Naziv *<input autoFocus value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} /></label>
              <label>SKU<input value={itemForm.sku} onChange={(e) => setItemForm((f) => ({ ...f, sku: e.target.value }))} placeholder="npr. OLJE-500" /></label>
              <label className="full">Opis<textarea value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} placeholder="Interni opis artikla" /></label>
              <label>Črtna koda<div className="barcode-field-row"><input value={itemForm.barcode} onChange={(e) => setItemForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="EAN / UPC / Code 128 / druga koda" /><button type="button" className="btn secondary barcode-field-button" onClick={() => openBarcodeScanner('ITEM_BARCODE')}>▦ Skeniraj</button></div><small>Koda mora biti unikatna znotraj podjetja.</small></label>
              <label>Kategorija<select value={itemForm.categoryId} onChange={(e) => setItemForm((f) => ({ ...f, categoryId: e.target.value }))}><option value="">Brez kategorije</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (neaktivna)'}</option>)}</select></label>
              <label>Poslovalnica<select disabled={Boolean(editingItem)} value={itemForm.locationId} onChange={(e) => setItemForm((f) => ({ ...f, locationId: e.target.value }))}><option value="">Izberite poslovalnico</option>{writableInventoryLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}{editingItem && !writableInventoryLocations.some((location) => location.id === editingItem.locationId) && <option value={editingItem.locationId}>{editingItem.location || `#${editingItem.locationId}`}</option>}</select></label>
              <label>Enota *<input value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))} placeholder="kos, ml, g ..." /></label>
              <label>Trenutna zaloga<input type="number" step="0.01" min="0" disabled={Boolean(editingItem)} value={itemForm.currentStock} onChange={(e) => setItemForm((f) => ({ ...f, currentStock: e.target.value }))} />{editingItem && <small>Za spremembo zaloge uporabite »Premik zaloge«.</small>}</label>
              <label>Min. zaloga<input type="number" step="0.01" min="0" value={itemForm.minimumStock} onChange={(e) => setItemForm((f) => ({ ...f, minimumStock: e.target.value }))} /></label>
              <label>Nabavna cena<input type="number" step="0.01" min="0" value={itemForm.costPrice} onChange={(e) => setItemForm((f) => ({ ...f, costPrice: e.target.value }))} /></label>
              <label>Prodajna cena<input type="number" step="0.01" min="0" value={itemForm.salePrice} onChange={(e) => setItemForm((f) => ({ ...f, salePrice: e.target.value }))} /></label>
              <label>DDV<select value={itemForm.vatRate} onChange={(e) => setItemForm((f) => ({ ...f, vatRate: e.target.value as ItemFormState['vatRate'] }))}><option value="VAT_22">22 %</option><option value="VAT_9_5">9,5 %</option><option value="VAT_0">0 %</option><option value="NO_VAT">Brez DDV</option></select></label>
            </div>
            <div className="consumables-modal-switches three">
              <label><input type="checkbox" checked={itemForm.trackStock} onChange={(e) => setItemForm((f) => ({ ...f, trackStock: e.target.checked }))} /> Spremljaj zalogo</label>
              <label><input type="checkbox" checked={itemForm.billable} onChange={(e) => setItemForm((f) => ({ ...f, billable: e.target.checked }))} /> Zaračunljivo</label>
              <label><input type="checkbox" checked={itemForm.active} onChange={(e) => setItemForm((f) => ({ ...f, active: e.target.checked }))} /> Aktivno</label>
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={closeItemModal}>Prekliči</button>
              <button type="submit" className="btn primary" disabled={savingItem}>{savingItem ? 'Shranjujem…' : editingItem ? 'Shrani spremembe' : 'Shrani artikel'}</button>
            </footer>
          </form>
        </div>
      )}

      {stockMovementItem && (
        <div className="consumables-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setStockMovementItem(null) }}>
          <form className="consumables-modal" onSubmit={saveStockMovement}>
            <header>
              <div><h2>Premik zaloge</h2><p>{stockMovementItem.name} · {stockMovementItem.location || 'Poslovalnica'}</p></div>
              <button type="button" onClick={() => setStockMovementItem(null)} aria-label="Zapri">×</button>
            </header>
            <div className="consumables-modal-grid">
              <label>Vrsta premika<select value={stockMovementForm.movementType} onChange={(e) => setStockMovementForm((f) => ({ ...f, movementType: e.target.value as ManualMovementType }))}><option value="PURCHASE">Prejem</option><option value="MANUAL_ADJUSTMENT">Ročni popravek</option><option value="WASTE">Odpis</option><option value="RETURN">Vračilo</option><option value="CORRECTION">Korekcija</option></select></label>
              {manualDirectionVisible && <label>Smer<select value={stockMovementForm.direction} onChange={(e) => setStockMovementForm((f) => ({ ...f, direction: e.target.value as StockMovementFormState['direction'] }))}><option value="INCREASE">Povečaj zalogo</option><option value="DECREASE">Zmanjšaj zalogo</option></select></label>}
              <label>Količina ({stockMovementItem.unit})<input type="number" step="0.01" min="0.01" value={stockMovementForm.quantity} onChange={(e) => setStockMovementForm((f) => ({ ...f, quantity: e.target.value }))} /></label>
              <label className="full">Opomba<textarea value={stockMovementForm.note} onChange={(e) => setStockMovementForm((f) => ({ ...f, note: e.target.value }))} placeholder="Npr. poškodovana embalaža, prejem dobave ..." /></label>
            </div>
            <div className="consumables-stock-preview">
              <span>Trenutno<strong>{n(stockMovementItem.currentStock, 2)} {stockMovementItem.unit}</strong></span>
              <span>Sprememba<strong className={stockPreviewDelta < 0 ? 'danger' : 'success'}>{stockPreviewDelta > 0 ? '+' : ''}{n(stockPreviewDelta, 2)} {stockMovementItem.unit}</strong></span>
              <span>Po premiku<strong className={stockPreviewAfter < 0 ? 'danger' : ''}>{n(stockPreviewAfter, 2)} {stockMovementItem.unit}</strong></span>
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={() => setStockMovementItem(null)}>Prekliči</button>
              <button type="submit" className="btn primary" disabled={savingMovement || stockPreviewAfter < 0}>{savingMovement ? 'Shranjujem…' : 'Shrani premik'}</button>
            </footer>
          </form>
        </div>
      )}

      {transferModalOpen && (
        <div className="consumables-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setTransferModalOpen(false) }}>
          <form className="consumables-modal consumables-modal-wide stock-transfer-modal" onSubmit={saveStockTransfer}>
            <header>
              <div><h2>Prenos zaloge</h2><p>Prenesite artikel med poslovalnicama z enim atomarnim premikom. Oba premika ostaneta povezana v zgodovini.</p></div>
              <button type="button" onClick={() => setTransferModalOpen(false)} aria-label="Zapri">×</button>
            </header>
            <div className="consumables-modal-grid">
              <label className="full">Artikel<div className="barcode-field-row"><select autoFocus value={transferForm.consumableId} onChange={(e) => setTransferForm((form) => ({ ...form, consumableId: e.target.value }))}><option value="">Izberite artikel</option>{transferCatalogItems.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ''}</option>)}</select><button type="button" className="btn secondary barcode-field-button" onClick={() => openBarcodeScanner('TRANSFER_ITEM')}>▦ Skeniraj</button></div></label>
              <label>Iz poslovalnice<select value={transferForm.fromLocationId} onChange={(e) => { const fromLocationId = e.target.value; const nextDestination = transferForm.toLocationId === fromLocationId ? String(activeInventoryLocations.find((location) => String(location.id) !== fromLocationId)?.id || '') : transferForm.toLocationId; setTransferForm((form) => ({ ...form, fromLocationId, toLocationId: nextDestination })) }}><option value="">Izberite</option>{activeInventoryLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
              <label>V poslovalnico<select value={transferForm.toLocationId} onChange={(e) => setTransferForm((form) => ({ ...form, toLocationId: e.target.value }))}><option value="">Izberite</option>{activeInventoryLocations.filter((location) => String(location.id) !== transferForm.fromLocationId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
              <label>Količina ({transferSelectedItem?.unit || 'enota'})<input type="number" min="0.0001" step="0.0001" max={transferSourceRow?.trackStock ? Math.max(0, Number(transferSourceRow.currentStock || 0)) : undefined} value={transferForm.quantity} onChange={(e) => setTransferForm((form) => ({ ...form, quantity: e.target.value }))} /></label>
              <label className="full">Opomba<textarea value={transferForm.note} onChange={(e) => setTransferForm((form) => ({ ...form, note: e.target.value }))} placeholder="Npr. dopolnitev zaloge druge poslovalnice ..." /></label>
            </div>
            <div className="stock-transfer-preview">
              <div><small>Izvorna zaloga</small><strong>{n(transferSourceRow?.currentStock, 2)} {transferSelectedItem?.unit || ''}</strong><span className={transferSourceAfter < 0 ? 'danger' : ''}>Po prenosu: {n(transferSourceAfter, 2)}</span></div>
              <div className="stock-transfer-arrow">→<small>{transferQuantity > 0 ? `${n(transferQuantity, 2)} ${transferSelectedItem?.unit || ''}` : 'količina'}</small></div>
              <div><small>Ciljna zaloga</small><strong>{n(transferDestinationRow?.currentStock, 2)} {transferSelectedItem?.unit || ''}</strong><span>Po prenosu: {n(transferDestinationAfter, 2)}</span></div>
            </div>
            <div className="procurement-info-note">Prenos zmanjša zalogo na izvorni poslovalnici in jo v isti transakciji poveča na ciljni. Ciljna nabavna cena se preračuna uteženo z nabavno ceno prenesene zaloge. Če katerikoli del ne uspe, se ne zapiše noben premik.</div>
            <footer><button type="button" className="btn secondary" onClick={() => setTransferModalOpen(false)}>Prekliči</button><button type="submit" className="btn primary" disabled={savingTransfer || !transferSelectedItem || transferQuantity <= 0 || transferSourceAfter < 0}>{savingTransfer ? 'Prenašam…' : 'Potrdi prenos'}</button></footer>
          </form>
        </div>
      )}

      {categoryModalOpen && (
        <div className="consumables-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCategoryModalOpen(false) }}>
          <div className="consumables-modal consumables-modal-wide">
            <header>
              <div><h2>Kategorije artiklov</h2><p>Ustvarite, uredite ali deaktivirajte kategorije porabnega materiala.</p></div>
              <button type="button" onClick={() => setCategoryModalOpen(false)} aria-label="Zapri">×</button>
            </header>
            <form onSubmit={saveCategory} className="consumables-inline-form">
              <label>Naziv *<input value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} placeholder="Naziv kategorije" /></label>
              <label>Barva<input type="color" value={categoryForm.color} onChange={(e) => setCategoryForm((f) => ({ ...f, color: e.target.value }))} /></label>
              <label className="check"><input type="checkbox" checked={categoryForm.active} onChange={(e) => setCategoryForm((f) => ({ ...f, active: e.target.checked }))} /> Aktivna</label>
              <button type="submit" className="btn primary" disabled={savingCategory}>{savingCategory ? 'Shranjujem…' : categoryForm.id ? 'Shrani kategorijo' : '+ Dodaj kategorijo'}</button>
              {categoryForm.id && <button type="button" className="btn secondary" onClick={() => setCategoryForm({ id: null, name: '', color: '#2563eb', active: true })}>Prekliči urejanje</button>}
            </form>
            <div className="consumables-manager-list">
              <table><thead><tr><th>Kategorija</th><th>Barva</th><th>Status</th><th>Dejanja</th></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td><strong>{category.name}</strong></td><td><span className="category-color-dot" style={{ background: category.color || '#2563eb' }} /> {category.color || '#2563eb'}</td><td><Badge tone={category.active ? 'success' : 'muted'}>{category.active ? 'Aktivna' : 'Neaktivna'}</Badge></td><td><div className="consumables-row-actions"><button type="button" className="btn tiny secondary" onClick={() => editCategory(category)}>Uredi</button><button type="button" className="btn tiny secondary" onClick={() => toggleCategory(category)}>{category.active ? 'Deaktiviraj' : 'Aktiviraj'}</button></div></td></tr>)}</tbody></table>
              <Empty visible={categories.length === 0} text="Kategorij še ni." />
            </div>
            <footer><button type="button" className="btn secondary" onClick={() => setCategoryModalOpen(false)}>Zapri</button></footer>
          </div>
        </div>
      )}

      {supplierModalOpen && (
        <div className="consumables-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSupplierModalOpen(false) }}>
          <form className="consumables-modal consumables-modal-wide" onSubmit={saveSupplier}>
            <header>
              <div><h2>{editingSupplier ? 'Uredi dobavitelja' : 'Nov dobavitelj'}</h2><p>Kontaktni in operativni podatki dobavitelja.</p></div>
              <button type="button" onClick={() => setSupplierModalOpen(false)} aria-label="Zapri">×</button>
            </header>
            <div className="consumables-modal-grid">
              <label>Naziv *<input autoFocus value={supplierForm.name} onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))} /></label>
              <label>Kontaktna oseba<input value={supplierForm.contactName} onChange={(e) => setSupplierForm((f) => ({ ...f, contactName: e.target.value }))} /></label>
              <label>Telefon<input value={supplierForm.phone} onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))} /></label>
              <label>E-mail<input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))} /></label>
              <label className="full">Kategorije<input value={supplierForm.categories} onChange={(e) => setSupplierForm((f) => ({ ...f, categories: e.target.value }))} placeholder="Npr. Higiena, Masaža, Pijača (ločite z vejico)" /></label>
              <label>Plačilni rok (dni)<input type="number" min="0" step="1" value={supplierForm.paymentTermsDays} onChange={(e) => setSupplierForm((f) => ({ ...f, paymentTermsDays: e.target.value }))} /></label>
              <label>Zanesljivost (%)<input type="number" min="0" max="100" step="1" value={supplierForm.reliabilityPercent} onChange={(e) => setSupplierForm((f) => ({ ...f, reliabilityPercent: e.target.value }))} /></label>
              <label>Neplačane obveznosti (€)<input type="number" min="0" step="0.01" value={supplierForm.outstandingAmount} onChange={(e) => setSupplierForm((f) => ({ ...f, outstandingAmount: e.target.value }))} /></label>
              <label>Status<select value={supplierForm.status} onChange={(e) => setSupplierForm((f) => ({ ...f, status: e.target.value as SupplierFormState['status'] }))}><option value="ACTIVE">Aktiven</option><option value="INACTIVE">Neaktiven</option></select></label>
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={() => setSupplierModalOpen(false)}>Prekliči</button>
              <button type="submit" className="btn primary" disabled={savingSupplier}>{savingSupplier ? 'Shranjujem…' : 'Shrani dobavitelja'}</button>
            </footer>
          </form>
        </div>
      )}

      {purchaseOrderModalOpen && (
        <div className="consumables-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !receiveModalOpen) closePurchaseOrderModal() }}>
          <form className="consumables-modal consumables-modal-xl" onSubmit={canManageProcurement ? savePurchaseOrder : (event) => event.preventDefault()}>
            <header>
              <div><h2>{purchaseOrderForm.id ? `Naročilnica ${purchaseOrderForm.orderNumber}` : 'Nova naročilnica'}</h2><p>Dodajte artikle, določite količine in nabavne cene ter nato spremljajte delne prejeme.</p></div>
              <button type="button" onClick={closePurchaseOrderModal} aria-label="Zapri">×</button>
            </header>
            {loadingPurchaseOrder ? <div className="consumables-empty">Nalagam naročilnico…</div> : <>
              <div className="consumables-modal-grid procurement-header-grid">
                <label>Št. naročilnice<input value={purchaseOrderForm.orderNumber} disabled={!canManageProcurement || purchaseOrderTerminal} onChange={(e) => setPurchaseOrderForm((f) => ({ ...f, orderNumber: e.target.value }))} placeholder="Samodejno, če pustite prazno" /></label>
                <label>Dobavitelj<select value={purchaseOrderForm.supplierId} disabled={!canManageProcurement || purchaseOrderTerminal || purchaseOrderHasReceipts} onChange={(e) => setPurchaseOrderForm((f) => ({ ...f, supplierId: e.target.value }))}><option value="">Brez dobavitelja</option>{suppliers.filter((supplier) => supplier.status === 'ACTIVE' || String(supplier.id) === purchaseOrderForm.supplierId).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                <label>Poslovalnica<select value={purchaseOrderForm.locationId} disabled={!canManageProcurement || purchaseOrderTerminal || purchaseOrderHasReceipts} onChange={(e) => setPurchaseOrderForm((f) => ({ ...f, locationId: e.target.value, lines: [] }))}><option value="">Izberite</option>{writableInventoryLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
                <label>Status<select value={purchaseOrderForm.status} disabled={!canManageProcurement || purchaseOrderTerminal || purchaseOrderHasReceipts} onChange={(e) => setPurchaseOrderForm((f) => ({ ...f, status: e.target.value as PurchaseOrderFormState['status'] }))}><option value="DRAFT">Osnutek</option><option value="ORDERED">Naročeno</option>{!purchaseOrderHasReceipts && <option value="CANCELLED">Preklicano</option>}{purchaseOrderForm.status === 'PARTIALLY_RECEIVED' && <option value="PARTIALLY_RECEIVED">Delno prejeto</option>}{purchaseOrderForm.status === 'COMPLETED' && <option value="COMPLETED">Zaključeno</option>}</select></label>
                <label>Datum naročila<input type="date" value={purchaseOrderForm.orderDate} disabled={!canManageProcurement || purchaseOrderTerminal} onChange={(e) => setPurchaseOrderForm((f) => ({ ...f, orderDate: e.target.value }))} /></label>
                <label>Pričakovana dobava<input type="date" value={purchaseOrderForm.expectedDate} disabled={!canManageProcurement || purchaseOrderTerminal} onChange={(e) => setPurchaseOrderForm((f) => ({ ...f, expectedDate: e.target.value }))} /></label>
                <label className="full">Opombe<textarea value={purchaseOrderForm.notes} disabled={!canManageProcurement || purchaseOrderTerminal} onChange={(e) => setPurchaseOrderForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Interna opomba naročilnice" /></label>
              </div>

              <section className="procurement-lines-section">
                <div className="procurement-section-header"><div><h3>Artikli</h3><p>Nabavna cena je neto cena na enoto. DDV in bruto vrednost se izračunata samodejno.</p></div>{canManageProcurement && !purchaseOrderTerminal && !purchaseOrderHasReceipts && <div className="procurement-section-actions"><button type="button" className="btn secondary barcode-action" onClick={() => openBarcodeScanner('PURCHASE_ORDER_ITEM')}>▦ Skeniraj artikel</button><button type="button" className="btn secondary" onClick={() => addPurchaseOrderLine()}>+ Dodaj artikel</button></div>}</div>
                <div className="procurement-lines-table-wrap"><table className="procurement-lines-table"><thead><tr><th>Artikel</th><th>Naročeno</th><th>Prejeto</th><th>Nabavna cena</th><th>DDV</th><th>Neto</th><th>Bruto</th>{canManageProcurement && !purchaseOrderTerminal && !purchaseOrderHasReceipts && <th />}</tr></thead><tbody>{purchaseOrderForm.lines.map((line, index) => {
                  const item = procurementInventoryRows.find((candidate) => candidate.id === Number(line.consumableId) && candidate.locationId === Number(purchaseOrderForm.locationId))
                  const qty = Number(String(line.orderedQuantity || '0').replace(',', '.')) || 0
                  const unitPrice = Number(String(line.unitPrice || '0').replace(',', '.')) || 0
                  const net = qty * unitPrice
                  const gross = net * (1 + vatMultiplier(line.vatRate))
                  return <tr key={line.lineId || `new-${index}`}><td><select value={line.consumableId} disabled={!canManageProcurement || purchaseOrderHasReceipts || purchaseOrderTerminal} onChange={(e) => selectPurchaseOrderItem(index, e.target.value)}><option value="">Izberite artikel</option>{procurementInventoryRows.filter((candidate) => candidate.locationId === Number(purchaseOrderForm.locationId) && (candidate.id === Number(line.consumableId) || !purchaseOrderForm.lines.some((other, otherIndex) => otherIndex !== index && Number(other.consumableId) === candidate.id))).map((candidate) => <option key={`${candidate.id}:${candidate.locationId}`} value={candidate.id}>{candidate.name}{candidate.sku ? ` · ${candidate.sku}` : ''}</option>)}</select><small>{item ? `${item.location || ''} · ${item.unit}` : ''}</small></td><td><div className="quantity-with-unit"><input type="number" min="0.0001" step="0.0001" value={line.orderedQuantity} disabled={!canManageProcurement || purchaseOrderHasReceipts || purchaseOrderTerminal} onChange={(e) => updatePurchaseOrderLine(index, { orderedQuantity: e.target.value })} /><span>{item?.unit || 'enota'}</span></div></td><td><strong>{n(line.receivedQuantity, 2)}</strong><br /><small>{n(Math.max(0, qty - Number(line.receivedQuantity || 0)), 2)} preostalo</small></td><td><div className="money-input"><span>€</span><input type="number" min="0" step="0.0001" value={line.unitPrice} disabled={!canManageProcurement || purchaseOrderHasReceipts || purchaseOrderTerminal} onChange={(e) => updatePurchaseOrderLine(index, { unitPrice: e.target.value })} /></div></td><td><select value={line.vatRate} disabled={!canManageProcurement || purchaseOrderHasReceipts || purchaseOrderTerminal} onChange={(e) => updatePurchaseOrderLine(index, { vatRate: e.target.value as PurchaseOrderLineForm['vatRate'] })}><option value="VAT_22">22 %</option><option value="VAT_9_5">9,5 %</option><option value="VAT_0">0 %</option><option value="NO_VAT">Brez DDV</option></select></td><td>{eur(net)}</td><td><strong>{eur(gross)}</strong></td>{canManageProcurement && !purchaseOrderTerminal && !purchaseOrderHasReceipts && <td><button type="button" className="icon-btn danger" onClick={() => removePurchaseOrderLine(index)} title="Odstrani">×</button></td>}</tr>
                })}</tbody></table></div>
                <Empty visible={purchaseOrderForm.lines.length === 0} text="Dodajte vsaj en artikel ali ustvarite naročilnico iz predlogov za naročilo." />
                <div className="procurement-totals"><span>Neto<strong>{eur(purchaseOrderTotals.net)}</strong></span><span>DDV<strong>{eur(purchaseOrderTotals.vat)}</strong></span><span>Skupaj<strong>{eur(purchaseOrderTotals.gross)}</strong></span></div>
              </section>

              {purchaseOrderForm.receipts.length > 0 && <section className="procurement-receipts-section"><div className="procurement-section-header"><div><h3>Zgodovina prejemov</h3><p>Vsak prejem je zabeležen ločeno in povezan s premiki zaloge.</p></div></div><div className="procurement-receipt-list">{purchaseOrderForm.receipts.map((receipt) => <div key={receipt.id} className="procurement-receipt-card"><div><strong>{dateTime(receipt.receivedAt)}</strong><small>{receipt.userName || 'Sistem'}{receipt.note ? ` · ${receipt.note}` : ''}</small></div><div>{receipt.lines.map((line) => <span key={`${receipt.id}:${line.purchaseOrderLineId}`}>{line.itemName}: <strong>+{n(line.quantity, 2)} {line.unit}</strong></span>)}</div></div>)}</div></section>}
            </>}
            <footer>
              <button type="button" className="btn secondary" onClick={closePurchaseOrderModal}>Zapri</button>
              {canManageProcurement && purchaseOrderForm.id && ['ORDERED', 'PARTIALLY_RECEIVED'].includes(purchaseOrderForm.status) && !purchaseOrderTerminal && <button type="button" className="btn secondary" onClick={openReceivePurchaseOrder}>Prejmi blago</button>}
              {canManageProcurement && !purchaseOrderTerminal && <button type="submit" className="btn primary" disabled={savingPurchaseOrder || loadingPurchaseOrder}>{savingPurchaseOrder ? 'Shranjujem…' : purchaseOrderForm.id ? 'Shrani spremembe' : 'Ustvari naročilnico'}</button>}
            </footer>
          </form>
        </div>
      )}

      {receiveModalOpen && purchaseOrderForm.id && (
        <div className="consumables-modal-backdrop procurement-receive-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setReceiveModalOpen(false) }}>
          <form className="consumables-modal consumables-modal-wide" onSubmit={saveReceipt}>
            <header><div><h2>Prejmi blago</h2><p>{purchaseOrderForm.orderNumber} · količine povečajo zalogo v izbrani poslovalnici.</p></div><button type="button" onClick={() => setReceiveModalOpen(false)} aria-label="Zapri">×</button></header>
            <div className="barcode-workflow-banner"><div><strong>Skeniranje prejema</strong><span>Sken artikla doda 1 enoto v stolpec »Prejmi zdaj«. Količine lahko nato ročno popravite.</span></div><div className="procurement-section-actions"><button type="button" className="btn secondary" onClick={fillAllRemainingReceiveQuantities}>Prejmi vse preostalo</button><button type="button" className="btn secondary barcode-action" onClick={() => openBarcodeScanner('RECEIVE_ITEM')}>▦ Skeniraj prejem</button></div></div>
            <div className="procurement-receive-list"><table><thead><tr><th>Artikel</th><th>Naročeno</th><th>Že prejeto</th><th>Preostalo</th><th>Prejmi zdaj</th></tr></thead><tbody>{purchaseOrderForm.lines.filter((line) => line.lineId).map((line) => { const remaining = Math.max(0, Number(line.orderedQuantity || 0) - Number(line.receivedQuantity || 0)); const item = procurementInventoryRows.find((candidate) => candidate.id === Number(line.consumableId) && candidate.locationId === Number(purchaseOrderForm.locationId)); return <tr key={line.lineId}><td><strong>{item?.name || 'Artikel'}</strong></td><td>{n(Number(line.orderedQuantity || 0), 2)} {item?.unit || ''}</td><td>{n(line.receivedQuantity, 2)} {item?.unit || ''}</td><td>{n(remaining, 2)} {item?.unit || ''}</td><td><input type="number" min="0" max={remaining} step="0.0001" value={receiveQuantities[line.lineId as number] || '0'} onChange={(e) => setReceiveQuantities((values) => ({ ...values, [line.lineId as number]: e.target.value }))} disabled={remaining <= 0} /></td></tr> })}</tbody></table><label className="procurement-receive-note">Opomba<textarea value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} placeholder="Npr. delna dobava, dobavnica št. ..." /></label><div className="procurement-info-note">Prejem je idempotenten: ponovljen isti zahtevek ne more dvakrat povečati zaloge. Nabavna cena se shrani na premik, lokacijska povprečna nabavna cena pa se preračuna uteženo.</div></div>
            <footer><button type="button" className="btn secondary" onClick={() => setReceiveModalOpen(false)}>Prekliči</button><button type="submit" className="btn primary" disabled={savingReceipt}>{savingReceipt ? 'Shranjujem…' : 'Potrdi prejem'}</button></footer>
          </form>
        </div>
      )}

      <BarcodeScannerModal
        open={Boolean(barcodeScanner)}
        title={barcodeScanner?.title || 'Skeniraj črtno kodo'}
        subtitle={barcodeScanner?.subtitle}
        continuous={Boolean(barcodeScanner?.continuous)}
        onClose={() => setBarcodeScanner(null)}
        onScan={handleBarcodeScan}
      />
    </div>
  )
}

function Filters({ query, setQuery, categoryFilter, setCategoryFilter, locationFilter, setLocationFilter, categories, locations, extra }: {
  query: string; setQuery: (v: string) => void; categoryFilter: string; setCategoryFilter: (v: string) => void; locationFilter: string; setLocationFilter: (v: string) => void; categories: Category[]; locations: string[]; extra?: ReactNode
}) {
  return (
    <div className="consumables-filter-row">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Išči po artiklu, SKU, črtni kodi, kategoriji, lokaciji…" />
      <label>Kategorija<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Vse kategorije</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (neaktivna)'}</option>)}</select></label>
      <label>Lokacija<select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}><option value="">Vse lokacije</option>{locations.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
      {extra}
    </div>
  )
}

function KpiCard({ tone, title, value, note }: { tone: string; title: string; value: string | number; note?: string }) {
  return <div className="consumables-kpi"><span className={`consumables-kpi-icon ${tone}`} /> <div><small>{title}</small><strong>{value}</strong>{note && <em>{note}</em>}</div></div>
}

function OverviewTab(props: { overview: Overview; items: Item[]; lowStockItems: Item[]; movements: Movement[]; query: string; setQuery: (v: string) => void; categoryFilter: string; setCategoryFilter: (v: string) => void; locationFilter: string; setLocationFilter: (v: string) => void; showOnlyLow: boolean; setShowOnlyLow: (v: boolean) => void; categories: Category[]; locations: string[]; createPurchaseOrder: (items?: Item[]) => void; canManageProcurement: boolean; loading: boolean }) {
  const { overview, lowStockItems, movements } = props
  return <>
    <Filters {...props} extra={<label className="consumables-switch"><input type="checkbox" checked={props.showOnlyLow} onChange={(e) => props.setShowOnlyLow(e.target.checked)} /> Prikaži samo nizko zalogo</label>} />
    <div className="consumables-kpi-grid">
      <KpiCard tone="blue" title="Skupno artiklov" value={n(overview.totalItems)} note="Vsi aktivni artikli" />
      <KpiCard tone="red" title="Nizka zaloga" value={n(overview.lowStockItems)} note="Pod definiranimi minimumi" />
      <KpiCard tone="green" title="Poraba zadnjih 30 dni" value={n(overview.monthlyConsumptionQuantity, 2)} note="Enot porabljenih" />
      <KpiCard tone="purple" title="Vrednost zaloge" value={eur(overview.stockValue)} note="Po nabavni vrednosti" />
    </div>
    <div className="consumables-two-col">
      <TableCard title="Nizka zaloga" action="Prikaži vse">
        <table><thead><tr><th>Artikel</th><th>Kategorija</th><th>Lokacija</th><th>Na zalogi</th><th>Min.</th><th>Status</th></tr></thead><tbody>{(overview.lowStock.length ? overview.lowStock : lowStockItems).slice(0, 5).map((item) => <tr key={`${item.id}:${item.locationId}`}><td>{item.name}</td><td>{item.category?.name || '—'}</td><td>{item.location || '—'}</td><td className="danger">{n(item.currentStock, 2)} {item.unit}</td><td>{n(item.minimumStock, 2)} {item.unit}</td><td><Badge tone={item.currentStock <= 0 ? 'danger' : 'warning'}>{item.currentStock <= 0 ? 'Kritično' : 'Nizko'}</Badge></td></tr>)}</tbody></table>
      </TableCard>
      <TableCard title="Zadnji premiki zaloge" action="Prikaži vse">
        <table><thead><tr><th>Datum</th><th>Artikel</th><th>Poslovalnica</th><th>Vrsta</th><th>Količina</th><th>Uporabnik</th></tr></thead><tbody>{(overview.recentMovements.length ? overview.recentMovements : movements).slice(0, 5).map((m) => <tr key={m.id}><td>{dateTime(m.createdAt)}</td><td>{m.itemName}</td><td>{m.locationName || '—'}</td><td><Badge tone={m.quantityDelta < 0 ? 'danger' : 'success'}>{movementText(m.movementType)}</Badge></td><td className={m.quantityDelta < 0 ? 'danger' : 'success'}>{m.quantityDelta > 0 ? '+' : ''}{n(m.quantityDelta, 2)} {m.unit}</td><td>{m.userName || '—'}</td></tr>)}</tbody></table>
      </TableCard>
    </div>
    <div className="consumables-three-col">
      <ChartCard title="Poraba po kategorijah (30 dni)" data={overview.categoryUsage} />
      <BarsCard title="Najbolj porabljeni artikli (30 dni)" data={overview.mostUsed} />
      <ReorderCard items={lowStockItems.slice(0, 5)} createPurchaseOrder={props.createPurchaseOrder} canManage={props.canManageProcurement} />
    </div>
    <TableCard title="Zaloga – vsi artikli" action="Prikaži vse"><ItemRows items={props.items.slice(0, 4)} compact /></TableCard>
  </>
}

function ItemsTab(props: { items: Item[]; categories: Category[]; locations: string[]; query: string; setQuery: (v: string) => void; categoryFilter: string; setCategoryFilter: (v: string) => void; locationFilter: string; setLocationFilter: (v: string) => void; statusFilter: string; setStatusFilter: (v: string) => void; lowStockItems: Item[]; billableCount: number; outOfStockCount: number; openCategoryManager?: () => void; onEditItem?: (item: Item) => void; onAdjustStock?: (item: Item) => void; onTransferStock?: (item: Item) => void }) {
  const catalogCount = distinctItemCount(props.items)
  const tableTitle = catalogCount === props.items.length ? `Prikazujem ${catalogCount} artiklov` : `Prikazujem ${catalogCount} artiklov · ${props.items.length} lokacijskih zalog`
  return <div className="consumables-main-with-side">
    <div>
      <Filters {...props} extra={<label>Status<select value={props.statusFilter} onChange={(e) => props.setStatusFilter(e.target.value)}><option value="">Vsi statusi</option><option value="active">Aktivni</option><option value="inactive">Neaktivni</option><option value="ok">Zaloga OK</option><option value="low">Nizka zaloga</option><option value="out">Brez zaloge</option></select></label>} />
      <div className="consumables-chip-row"><button type="button" className={!props.categoryFilter ? 'active' : ''} onClick={() => props.setCategoryFilter('')}>Vse kategorije <span>{catalogCount}</span></button>{props.categories.filter((c) => c.active).map((c) => <button type="button" className={props.categoryFilter === String(c.id) ? 'active' : ''} key={c.id} onClick={() => props.setCategoryFilter(String(c.id))}>{c.name}</button>)}{props.openCategoryManager && <button type="button" className="manage" onClick={props.openCategoryManager}>Uredi kategorije</button>}</div>
      <TableCard title={tableTitle}><ItemRows items={props.items} onEditItem={props.onEditItem} onAdjustStock={props.onAdjustStock} onTransferStock={props.onTransferStock} /></TableCard>
    </div>
    <aside className="consumables-side-stack"><SideLowStock items={props.lowStockItems} /><CategoryDistribution items={props.items} /><QuickStats total={catalogCount} value={props.items.reduce((s, i) => s + Number(i.currentStock || 0) * Number(i.costPrice || 0), 0)} low={props.lowStockItems.length} out={props.outOfStockCount} billable={props.billableCount} /></aside>
  </div>
}

function ProcurementTab({ orders, items, suppliers, createPurchaseOrder, openPurchaseOrder, createSuggestedOrder, highlightItemId, canManage }: {
  orders: PurchaseOrder[]
  items: Item[]
  suppliers: Supplier[]
  createPurchaseOrder: (items?: Item[]) => void
  openPurchaseOrder: (order: PurchaseOrder) => void
  createSuggestedOrder: (items?: Item[]) => void
  highlightItemId?: number | null
  canManage: boolean
}) {
  const [supplierFilter, setSupplierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const open = orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status))
  const low = items.filter((i) => i.active && i.trackStock && i.lowStock)
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (supplierFilter && String(order.supplierId || '') !== supplierFilter) return false
      if (statusFilter && order.status !== statusFilter) return false
      if (q && ![order.orderNumber, order.supplierName, order.locationName, order.notes].some((value) => String(value || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [orders, supplierFilter, statusFilter, search])
  const reset = () => { setSupplierFilter(''); setStatusFilter(''); setSearch('') }
  const highlightedLowStockItem = highlightItemId == null ? null : low.find((item) => item.id === highlightItemId) || null
  return <div className="consumables-main-with-side">
    <div>
      {highlightedLowStockItem && <div className="low-stock-alert-banner"><div><strong>Nizka zaloga · {highlightedLowStockItem.name}</strong><span>{highlightedLowStockItem.location || 'Poslovalnica'} · trenutno {n(highlightedLowStockItem.currentStock, 2)} {highlightedLowStockItem.unit}, minimum {n(highlightedLowStockItem.minimumStock, 2)} {highlightedLowStockItem.unit}</span></div>{canManage && <button type="button" className="btn primary" onClick={() => createSuggestedOrder([highlightedLowStockItem])}>Ustvari naročilnico</button>}</div>}
      <div className="consumables-kpi-grid compact"><KpiCard tone="blue" title="Odprte naročilnice" value={open.length} note="V pripravi ali naročene" /><KpiCard tone="green" title="Pričakovane dobave" value={open.filter((o) => o.expectedDate).length} note="Odprte z datumom dobave" /><KpiCard tone="orange" title="Izdelki za naročilo" value={low.length} note="Pod minimalno zalogo" /><KpiCard tone="purple" title="Vrednost nabave" value={eur(orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0))} note="Vse naročilnice" /></div>
      <div className="consumables-filter-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Išči po naročilnici, dobavitelju ali poslovalnici…" /><label>Dobavitelj<select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}><option value="">Vsi dobavitelji</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Vsi statusi</option><option value="DRAFT">Osnutek</option><option value="ORDERED">Naročeno</option><option value="PARTIALLY_RECEIVED">Delno prejeto</option><option value="COMPLETED">Zaključeno</option><option value="CANCELLED">Preklicano</option></select></label><button type="button" className="btn secondary" onClick={reset}>Ponastavi filtre</button></div>
      <TableCard title={`Naročilnice · ${filteredOrders.length}`}><table><thead><tr><th>Št. naročilnice</th><th>Datum</th><th>Dobavitelj</th><th>Poslovalnica</th><th>Status</th><th>Prič. dobava</th><th>Vrednost</th><th>Prejeto</th><th>Napredek</th><th>Akcije</th></tr></thead><tbody>{filteredOrders.map((o) => { const progress = Number(o.totalAmount || 0) > 0 ? Math.min(100, Math.round((Number(o.receivedAmount || 0) / Number(o.totalAmount || 0)) * 100)) : 0; return <tr key={o.id}><td><button type="button" className="link-button" onClick={() => openPurchaseOrder(o)}>{o.orderNumber}</button></td><td>{date(o.orderDate)}</td><td>{o.supplierName || '—'}</td><td>{o.locationName || '—'}</td><td><Badge tone={o.status === 'COMPLETED' ? 'success' : o.status === 'PARTIALLY_RECEIVED' ? 'warning' : o.status === 'CANCELLED' ? 'muted' : 'info'}>{statusText(o.status)}</Badge></td><td>{date(o.expectedDate)}</td><td>{eur(o.totalAmount)}</td><td>{eur(o.receivedAmount)}</td><td><span className="mini-progress"><i style={{ width: `${progress}%` }} /></span> {progress}%</td><td>{canManage ? <button type="button" className="icon-btn edit" onClick={() => openPurchaseOrder(o)} title="Odpri naročilnico">✎</button> : <button type="button" className="link-button" onClick={() => openPurchaseOrder(o)} title="Preglej naročilnico">Pregled</button>}</td></tr> })}</tbody></table><Empty visible={filteredOrders.length === 0} text="Naročilnic še ni oziroma ne ustrezajo izbranim filtrom." /></TableCard>
    </div>
    <aside className="consumables-side-stack"><ReorderCard items={low.slice(0, 8)} createPurchaseOrder={createSuggestedOrder} highlightItemId={highlightItemId} canManage={canManage} /><TableCard title="Pričakovane dobave" action="Prikaži vse"><table><tbody>{open.filter((o) => o.expectedDate).slice(0, 5).map((o) => <tr key={o.id}><td>{o.supplierName || o.orderNumber}</td><td>{date(o.expectedDate)}</td><td><Badge tone="info">{statusText(o.status)}</Badge></td></tr>)}</tbody></table><Empty visible={open.filter((o) => o.expectedDate).length === 0} text="Ni načrtovanih dobav." /></TableCard>{canManage && <button type="button" className="btn primary wide" onClick={() => createPurchaseOrder()}>+ Nova naročilnica</button>}</aside>
  </div>
}


function SuppliersTab({ suppliers, createSupplier, openSupplier, canManage }: { suppliers: Supplier[]; createSupplier: () => void; openSupplier: (supplier: Supplier) => void; canManage: boolean }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const categoryOptions = useMemo(() => Array.from(new Set(suppliers.flatMap((s) => String(s.categories || '').split(',').map((v) => v.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b, 'sl')), [suppliers])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return suppliers.filter((supplier) => {
      if (q && ![supplier.name, supplier.contactName, supplier.phone, supplier.email, supplier.categories].some((value) => String(value || '').toLowerCase().includes(q))) return false
      if (status && supplier.status !== status) return false
      if (category && !String(supplier.categories || '').split(',').map((v) => v.trim()).includes(category)) return false
      const days = Number(supplier.paymentTermsDays || 0)
      if (paymentTerms === 'short' && days > 14) return false
      if (paymentTerms === 'standard' && (days < 15 || days > 30)) return false
      if (paymentTerms === 'long' && days <= 30) return false
      return true
    })
  }, [suppliers, search, status, category, paymentTerms])
  const reset = () => { setSearch(''); setStatus(''); setCategory(''); setPaymentTerms('') }
  return <>
    <div className="consumables-filter-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Išči dobavitelje, kontaktne osebe, e-mail, kategorije…" /><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Vsi statusi</option><option value="ACTIVE">Aktivni</option><option value="INACTIVE">Neaktivni</option></select></label><label>Kategorija<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Vse kategorije</option>{categoryOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Pogoji plačila<select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}><option value="">Vsi pogoji</option><option value="short">Do 14 dni</option><option value="standard">15–30 dni</option><option value="long">Nad 30 dni</option></select></label><button type="button" className="btn secondary" onClick={reset}>Ponastavi filtre</button></div>
    <div className="consumables-main-with-side">
      <div>
        <div className="consumables-kpi-grid compact"><KpiCard tone="blue" title="Skupaj dobaviteljev" value={suppliers.length} note="Vsi registrirani dobavitelji" /><KpiCard tone="green" title="Aktivni dobavitelji" value={suppliers.filter((s) => s.status === 'ACTIVE').length} note="Na voljo za nabavo" /><KpiCard tone="red" title="Neplačane obveznosti" value={eur(suppliers.reduce((s, x) => s + Number(x.outstandingAmount || 0), 0))} note="Skupaj zapadlo" /></div>
        <TableCard title={`Seznam dobaviteljev · ${filtered.length}`}><table><thead><tr><th>Dobavitelj</th><th>Kontaktna oseba</th><th>Telefon / E-mail</th><th>Kategorije</th><th>Pogoji plačila</th><th>Zanesljivost</th><th>Status</th><th>Akcije</th></tr></thead><tbody>{filtered.map((s) => <tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.contactName || '—'}</td><td>{s.phone || '—'}<br /><small>{s.email || ''}</small></td><td>{s.categories || '—'}</td><td>{s.paymentTermsDays || 0} dni</td><td><span className="mini-progress"><i style={{ width: `${s.reliabilityPercent || 0}%` }} /></span> {s.reliabilityPercent || 0}%</td><td><Badge tone={s.status === 'ACTIVE' ? 'success' : 'muted'}>{s.status === 'ACTIVE' ? 'Aktiven' : 'Neaktiven'}</Badge></td><td>{canManage ? <button type="button" className="icon-btn edit" onClick={() => openSupplier(s)} title="Uredi dobavitelja" aria-label={`Uredi ${s.name}`}>✎</button> : <span className="muted">—</span>}</td></tr>)}</tbody></table><Empty visible={filtered.length === 0} text="Ni dobaviteljev, ki ustrezajo izbranim filtrom." /></TableCard>
      </div>
      <aside className="consumables-side-stack"><TableCard title="Top dobavitelji (zanesljivost)" action="Prikaži vse"><table><tbody>{suppliers.slice().sort((a, b) => Number(b.reliabilityPercent || 0) - Number(a.reliabilityPercent || 0)).slice(0, 5).map((s) => <tr key={s.id}><td>{s.name}</td><td><span className="mini-progress"><i style={{ width: `${s.reliabilityPercent || 0}%` }} /></span></td><td>{s.reliabilityPercent || 0}%</td></tr>)}</tbody></table></TableCard>{canManage && <button type="button" className="btn primary" onClick={createSupplier}>+ Nov dobavitelj</button>}</aside>
    </div>
  </>
}

function MovementsTab({ movements, transfers, onCreateTransfer, canManage }: { movements: Movement[]; transfers: StockTransfer[]; onCreateTransfer: () => void; canManage: boolean }) {
  const [movementTypeFilter, setMovementTypeFilter] = useState('')
  const [movementLocationFilter, setMovementLocationFilter] = useState('')
  const [movementSearch, setMovementSearch] = useState('')
  const locationOptions = useMemo(() => Array.from(new Map([
    ...movements.filter((movement) => movement.locationId != null).map((movement) => [String(movement.locationId), movement.locationName || `#${movement.locationId}`] as const),
    ...transfers.flatMap((transfer) => [
      [String(transfer.fromLocationId), transfer.fromLocationName] as const,
      [String(transfer.toLocationId), transfer.toLocationName] as const,
    ]),
  ])).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'sl')), [movements, transfers])
  const filteredMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase()
    return movements.filter((movement) => {
      if (movementTypeFilter && movement.movementType !== movementTypeFilter) return false
      if (movementLocationFilter && String(movement.locationId || '') !== movementLocationFilter) return false
      if (q && ![movement.itemName, movement.categoryName, movement.locationName, movement.note, movement.userName, movementText(movement.movementType)].some((value) => String(value || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [movements, movementTypeFilter, movementLocationFilter, movementSearch])
  const filteredTransfers = useMemo(() => {
    const q = movementSearch.trim().toLowerCase()
    return transfers.filter((transfer) => {
      if (movementLocationFilter && String(transfer.fromLocationId) !== movementLocationFilter && String(transfer.toLocationId) !== movementLocationFilter) return false
      if (movementTypeFilter && !['TRANSFER_OUT', 'TRANSFER_IN'].includes(movementTypeFilter)) return false
      if (q && ![transfer.itemName, transfer.fromLocationName, transfer.toLocationName, transfer.note, transfer.userName].some((value) => String(value || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [transfers, movementTypeFilter, movementLocationFilter, movementSearch])
  const now = new Date()
  const today = movements.filter((movement) => {
    const value = new Date(movement.createdAt)
    return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth() && value.getDate() === now.getDate()
  })
  const totalDelta = today.reduce((sum, movement) => sum + Number(movement.quantityDelta || 0), 0)
  const value = today.reduce((sum, movement) => sum + Math.abs(Number(movement.valueDelta || 0)), 0)
  const reset = () => { setMovementTypeFilter(''); setMovementLocationFilter(''); setMovementSearch('') }
  return <div className="consumables-main-with-side">
    <div>
      <div className="consumables-kpi-grid compact"><KpiCard tone="blue" title="Današnji premiki" value={today.length} note="vseh premikov" /><KpiCard tone="green" title="Sprememba količine" value={`${totalDelta > 0 ? '+' : ''}${n(totalDelta, 2)}`} note="neto sprememba" /><KpiCard tone="purple" title="Vrednost premikov" value={eur(value)} note="skupna vrednost" /><KpiCard tone="orange" title="Prenosi" value={transfers.length} note="med poslovalnicami" /></div>
      <div className="consumables-filter-row"><label>Vrsta premika<select value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)}><option value="">Vse vrste</option><option value="PURCHASE">Prejem</option><option value="SESSION_USAGE">Poraba</option><option value="MANUAL_ADJUSTMENT">Ročni popravek</option><option value="RETURN">Vračilo</option><option value="WASTE">Odpis</option><option value="CORRECTION">Korekcija</option><option value="INVENTORY_COUNT">Inventura</option><option value="TRANSFER_OUT">Prenos iz</option><option value="TRANSFER_IN">Prenos v</option></select></label><label>Poslovalnica<select value={movementLocationFilter} onChange={(e) => setMovementLocationFilter(e.target.value)}><option value="">Vse poslovalnice</option>{locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><input value={movementSearch} onChange={(e) => setMovementSearch(e.target.value)} placeholder="Išči po artiklu, lokaciji, opombi ali uporabniku…" /><button type="button" className="btn secondary" onClick={reset}>Ponastavi filtre</button></div>
      <TableCard title={`Zgodovina premikov zaloge · ${filteredMovements.length}`}><table><thead><tr><th>Datum in čas</th><th>Vrsta premika</th><th>Artikel</th><th>Kategorija</th><th>Poslovalnica</th><th>Količina</th><th>Enota</th><th>Vrednost</th><th>Opomba</th><th>Uporabnik</th></tr></thead><tbody>{filteredMovements.map((movement) => <tr key={movement.id}><td>{dateTime(movement.createdAt)}</td><td><Badge tone={movement.movementType.startsWith('TRANSFER_') ? 'info' : movement.quantityDelta < 0 ? 'danger' : movement.movementType.includes('CORRECTION') ? 'warning' : 'success'}>{movementText(movement.movementType)}</Badge></td><td>{movement.itemName}</td><td>{movement.categoryName || '—'}</td><td>{movement.locationName || '—'}</td><td className={movement.quantityDelta < 0 ? 'danger' : 'success'}>{movement.quantityDelta > 0 ? '+' : ''}{n(movement.quantityDelta, 2)}</td><td>{movement.unit || 'kos'}</td><td>{eur(Math.abs(Number(movement.valueDelta || 0)))}</td><td>{movement.note || '—'}</td><td>{movement.userName || '—'}</td></tr>)}</tbody></table><Empty visible={filteredMovements.length === 0} text="Ni premikov, ki ustrezajo izbranim filtrom." /></TableCard>
      <TableCard title={`Prenosi med poslovalnicami · ${filteredTransfers.length}`}><table className="stock-transfer-history-table"><thead><tr><th>Datum</th><th>Prenos</th><th>Artikel</th><th>Iz</th><th>V</th><th>Količina</th><th>Nabavna cena</th><th>Vrednost</th><th>Opomba</th><th>Uporabnik</th></tr></thead><tbody>{filteredTransfers.map((transfer) => <tr key={transfer.id}><td>{dateTime(transfer.createdAt)}</td><td><strong>#{transfer.id}</strong></td><td>{transfer.itemName}</td><td>{transfer.fromLocationName}</td><td>{transfer.toLocationName}</td><td><strong>{n(transfer.quantity, 2)} {transfer.unit}</strong></td><td>{eur(transfer.unitCostSnapshot)}</td><td>{eur(transfer.valueAmount)}</td><td>{transfer.note || '—'}</td><td>{transfer.userName || '—'}</td></tr>)}</tbody></table><Empty visible={filteredTransfers.length === 0} text="Prenosov med poslovalnicami še ni oziroma ne ustrezajo filtrom." />{canManage && <div className="stock-transfer-history-action"><button type="button" className="btn secondary" onClick={onCreateTransfer}>⇄ Nov prenos zaloge</button></div>}</TableCard>
    </div>
    <aside className="consumables-side-stack"><BarsCard title="Najpogosteje uporabljeni artikli" data={groupMovements(movements)} /><FakeLineChart /></aside>
  </div>
}

function InventoryTab({ sessions, detail, draft, setDraft, query, setQuery, categoryFilter, setCategoryFilter, countStatusFilter, setCountStatusFilter, loading, saving, onOpenSession, onSave, onFinalize, onScan, canManage }: {
  sessions: InventorySession[]
  detail: InventoryDetail | null
  draft: InventoryCountDraft
  setDraft: Dispatch<SetStateAction<InventoryCountDraft>>
  query: string
  setQuery: (value: string) => void
  categoryFilter: string
  setCategoryFilter: (value: string) => void
  countStatusFilter: string
  setCountStatusFilter: (value: string) => void
  loading: boolean
  saving: boolean
  onOpenSession: (id: number) => void
  onSave: () => void
  onFinalize: () => void
  onScan: () => void
  canManage: boolean
}) {
  const session = detail?.session || null
  const editable = canManage && session?.status === 'IN_PROGRESS'
  const lines = detail?.lines || []
  const categories = Array.from(new Set(lines.map((line) => line.categoryName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'sl'))
  const lineState = (line: InventoryLine) => {
    const draftValue = draft[line.id]?.countedQuantity ?? (line.countedQuantity == null ? '' : String(line.countedQuantity))
    const raw = draftValue.trim().replace(',', '.')
    const counted = raw === '' ? null : Number(raw)
    const validCounted = counted != null && Number.isFinite(counted) && counted >= 0 ? counted : null
    const discrepancy = validCounted == null ? null : validCounted - Number(line.systemQuantity || 0)
    return { draftValue, counted: validCounted, discrepancy }
  }
  const counted = lines.filter((line) => lineState(line).counted != null).length
  const discrepancyLines = lines.map((line) => ({ line, ...lineState(line) })).filter((row) => row.discrepancy != null && Math.abs(row.discrepancy) > 0.00005)
  const progress = lines.length ? Math.round((counted / lines.length) * 100) : 0
  const filtered = lines.filter((line) => {
    const state = lineState(line)
    const haystack = `${line.itemName} ${line.categoryName || ''}`.toLowerCase()
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase())
    const matchesCategory = !categoryFilter || line.categoryName === categoryFilter
    const matchesStatus = !countStatusFilter
      || (countStatusFilter === 'UNCOUNTED' && state.counted == null)
      || (countStatusFilter === 'COUNTED' && state.counted != null)
      || (countStatusFilter === 'DISCREPANCY' && state.discrepancy != null && Math.abs(state.discrepancy) > 0.00005)
      || (countStatusFilter === 'MATCH' && state.discrepancy != null && Math.abs(state.discrepancy) <= 0.00005)
    return matchesQuery && matchesCategory && matchesStatus
  })
  const largest = discrepancyLines.slice().sort((a, b) => Math.abs(Number(b.discrepancy || 0)) - Math.abs(Number(a.discrepancy || 0))).slice(0, 5)

  if (!session) {
    return <div className="consumables-main-with-side">
      <div>
        <div className="consumables-kpi-grid compact"><KpiCard tone="blue" title="Aktivne inventure" value={sessions.filter((row) => row.status === 'IN_PROGRESS').length} note="Trenutno v teku" /><KpiCard tone="green" title="Zaključene inventure" value={sessions.filter((row) => row.status === 'COMPLETED').length} note="V zgodovini" /><KpiCard tone="red" title="Odstopanja" value="—" note="Za izbrano inventuro" /><KpiCard tone="purple" title="Napredek" value="—" note="Za izbrano inventuro" /></div>
        <TableCard title="Inventura"><div className="inventory-empty-state"><strong>{loading ? 'Nalagam inventure…' : 'Ni inventure za prikaz.'}</strong><p>Začnite inventuro z gumbom zgoraj. Zaloga se spremeni šele ob zaključku inventure.</p></div></TableCard>
      </div>
      <aside className="consumables-side-stack"><InventoryHistory sessions={sessions} selectedId={null} onOpen={onOpenSession} /></aside>
    </div>
  }

  return <div className="consumables-main-with-side">
    <div>
      <div className="consumables-kpi-grid compact">
        <KpiCard tone="blue" title="Aktivne inventure" value={sessions.filter((row) => row.status === 'IN_PROGRESS').length} note="Trenutno v teku" />
        <KpiCard tone="green" title="Prešteti artikli" value={counted} note={`Od ${lines.length}`} />
        <KpiCard tone="red" title="Odstopanja" value={discrepancyLines.length} note="Prešteti artikli z razliko" />
        <KpiCard tone="purple" title="Napredek inventure" value={`${progress}%`} note={session.status === 'COMPLETED' ? 'Zaključena' : 'Shranjeno lokalno / v osnutku'} />
      </div>

      <div className="inventory-session-banner">
        <div><Badge tone={session.status === 'COMPLETED' ? 'success' : 'info'}>{session.status === 'COMPLETED' ? 'Zaključena' : 'V teku'}</Badge><strong>{session.locationName}</strong><span>Začeta {dateTime(session.startedAt)}{session.startedBy ? ` · ${session.startedBy}` : ''}</span>{session.completedAt && <span>Zaključena {dateTime(session.completedAt)}{session.completedBy ? ` · ${session.completedBy}` : ''}</span>}</div>
        {session.notes && <p>{session.notes}</p>}
      </div>

      <div className="consumables-filter-row inventory-filters">
        <label>Inventura<select value={session.id} onChange={(e) => onOpenSession(Number(e.target.value))}>{sessions.map((row) => <option key={row.id} value={row.id}>{row.locationName} · {date(row.startedAt)} · {row.status === 'IN_PROGRESS' ? 'V teku' : 'Zaključena'}</option>)}</select></label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Išči po artiklu ali kategoriji…" />
        <label>Kategorija<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Vse kategorije</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label>Status štetja<select value={countStatusFilter} onChange={(e) => setCountStatusFilter(e.target.value)}><option value="">Vsi statusi</option><option value="UNCOUNTED">Ni prešteto</option><option value="COUNTED">Prešteto</option><option value="DISCREPANCY">Odstopanje</option><option value="MATCH">Ujema se</option></select></label>
        {editable && <button type="button" className="btn secondary barcode-action" onClick={onScan}>▦ Skeniraj štetje</button>}
        <button type="button" className="btn secondary" onClick={() => { setQuery(''); setCategoryFilter(''); setCountStatusFilter('') }}>Ponastavi filtre</button>
      </div>

      <div className="inventory-progress"><span>Skupni napredek inventure</span><strong>{progress}%</strong><i><b style={{ width: `${progress}%` }} /></i><small>{counted} od {lines.length} artiklov{editable ? ' · zaloga se še ne spreminja' : ' · inventura zaključena'}</small></div>

      <TableCard title={`Inventura – štetje artiklov · ${session.locationName}`}>
        <div className="inventory-table-wrap"><table className="inventory-count-table"><thead><tr><th>Artikel</th><th>Kategorija</th><th>Sistemska zaloga</th><th>Prešteta zaloga</th><th>Razlika</th><th>Vrednost razlike</th><th>Status</th><th>Opomba</th></tr></thead><tbody>{filtered.map((line) => {
          const state = lineState(line)
          const difference = state.discrepancy
          const discrepancyValue = difference == null ? null : difference * Number(line.costPriceSnapshot || 0)
          const tone = difference == null ? 'muted' : Math.abs(difference) <= 0.00005 ? 'success' : 'danger'
          const status = difference == null ? 'Ni prešteto' : Math.abs(difference) <= 0.00005 ? 'Ujema se' : difference > 0 ? 'Višek' : 'Manjko'
          return <tr key={line.id} className={difference != null && Math.abs(difference) > 0.00005 ? 'inventory-row-discrepancy' : ''}>
            <td><strong>{line.itemName}</strong><br /><small>{line.unit}</small></td>
            <td>{line.categoryName || '—'}</td>
            <td>{n(line.systemQuantity, 2)} {line.unit}</td>
            <td>{editable ? <div className="quantity-with-unit inventory-count-input"><input type="number" min="0" step="0.0001" value={state.draftValue} onChange={(e) => setDraft((current) => ({ ...current, [line.id]: { countedQuantity: e.target.value, notes: current[line.id]?.notes || '' } }))} placeholder="Vnesi" /><span>{line.unit}</span></div> : <strong>{n(line.countedQuantity, 2)} {line.unit}</strong>}</td>
            <td>{difference == null ? '—' : <span className={Math.abs(difference) <= 0.00005 ? 'success' : 'danger'}>{difference > 0 ? '+' : ''}{n(difference, 2)} {line.unit}</span>}</td>
            <td>{difference == null ? '—' : eur(discrepancyValue == null ? line.discrepancyValue : discrepancyValue)}</td>
            <td><Badge tone={tone}>{status}</Badge></td>
            <td>{editable ? <input className="inventory-note-input" value={draft[line.id]?.notes || ''} onChange={(e) => setDraft((current) => ({ ...current, [line.id]: { countedQuantity: current[line.id]?.countedQuantity ?? '', notes: e.target.value } }))} placeholder="Opomba…" /> : <>{line.notes || '—'}{line.countedBy && <><br /><small>{line.countedBy}</small></>}</>}</td>
          </tr>
        })}</tbody></table></div>
        <Empty visible={!loading && filtered.length === 0} text="Ni artiklov, ki ustrezajo filtrom." />
        {editable && <div className="inventory-actions"><div><strong>Štetje je osnutek, dokler inventure ne zaključite.</strong><small>Ob zaključku se za vsako razliko ustvari nespremenljiv premik tipa INVENTORY_COUNT.</small></div><button type="button" className="btn secondary" disabled={saving} onClick={onSave}>{saving ? 'Shranjujem…' : 'Shrani štetje'}</button><button type="button" className="btn primary" disabled={saving || counted !== lines.length} onClick={onFinalize}>Zaključi inventuro</button></div>}
      </TableCard>
      {session.status === 'COMPLETED' && detail && <TableCard title="Premiki ob zaključku inventure"><table><thead><tr><th>Artikel</th><th>Količina</th><th>Zaloga pred</th><th>Zaloga po</th><th>Vrednost</th><th>Uporabnik</th></tr></thead><tbody>{(detail.movements || []).map((movement) => <tr key={movement.id}><td>{movement.itemName}</td><td className={movement.quantityDelta < 0 ? 'danger' : 'success'}>{movement.quantityDelta > 0 ? '+' : ''}{n(movement.quantityDelta, 2)} {movement.unit || ''}</td><td>{n(movement.stockBefore, 2)}</td><td>{n(movement.stockAfter, 2)}</td><td>{eur(Math.abs(Number(movement.valueDelta || 0)))}</td><td>{movement.userName || '—'}</td></tr>)}</tbody></table><Empty visible={(detail.movements || []).length === 0} text="Inventura ni zahtevala korekcij zaloge." /></TableCard>}
    </div>
    <aside className="consumables-side-stack">
      <InventoryHistory sessions={sessions} selectedId={session.id} onOpen={onOpenSession} />
      <TableCard title="Največja odstopanja"><table><tbody>{largest.map(({ line, discrepancy }) => <tr key={line.id}><td>{line.itemName}<br /><small>{session.locationName}</small></td><td className="danger">{Number(discrepancy) > 0 ? '+' : ''}{n(Number(discrepancy), 2)} {line.unit}</td></tr>)}</tbody></table><Empty visible={largest.length === 0} text="Ni zabeleženih odstopanj." /></TableCard>
    </aside>
  </div>
}

function InventoryHistory({ sessions, selectedId, onOpen }: { sessions: InventorySession[]; selectedId: number | null; onOpen: (id: number) => void }) {
  return <TableCard title="Zgodovina inventur"><div className="inventory-history-list">{sessions.slice(0, 12).map((session) => <button key={session.id} type="button" className={session.id === selectedId ? 'active' : ''} onClick={() => onOpen(session.id)}><span><strong>{session.locationName}</strong><small>{dateTime(session.startedAt)}</small></span><span><Badge tone={session.status === 'COMPLETED' ? 'success' : 'info'}>{session.status === 'COMPLETED' ? 'Zaključena' : 'V teku'}</Badge><small>{session.countedItems}/{session.totalItems}</small></span></button>)}</div><Empty visible={sessions.length === 0} text="Inventur še ni." /></TableCard>
}

function TableCard({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return <section className="consumables-card"><header><h2>{title}</h2>{action && <button type="button">{action}</button>}</header>{children}</section>
}
function Empty({ visible, text }: { visible: boolean; text: string }) { return visible ? <div className="consumables-empty">{text}</div> : null }
function Badge({ tone, children }: { tone: string; children: ReactNode }) { return <span className={`consumables-badge ${tone}`}>{children}</span> }

function ReportsTab({ report, loading, reportType, setReportType, from, setFrom, to, setTo, locationId, setLocationId, serviceTypeId, setServiceTypeId, employeeId, setEmployeeId, locations, onRefresh, onExportCsv, onExportExcel }: {
  report: ConsumableReport | null
  loading: boolean
  reportType: ConsumableReportType
  setReportType: (value: ConsumableReportType) => void
  from: string
  setFrom: (value: string) => void
  to: string
  setTo: (value: string) => void
  locationId: string
  setLocationId: (value: string) => void
  serviceTypeId: string
  setServiceTypeId: (value: string) => void
  employeeId: string
  setEmployeeId: (value: string) => void
  locations: Location[]
  onRefresh: () => void
  onExportCsv: () => void
  onExportExcel: () => void
}) {
  const reportLabels: Record<ConsumableReportType, string> = {
    STOCK_VALUATION: 'Vrednost zaloge',
    CONSUMPTION: 'Poraba',
    PURCHASES: 'Nabava',
    INVENTORY: 'Inventurne razlike',
    TRANSFERS: 'Prenosi zaloge',
  }
  const totalLabels: Record<string, string> = { value: 'Vrednost', quantity: 'Količina', net: 'Neto', vat: 'DDV', gross: 'Bruto', difference: 'Razlika' }
  const formatValue = (value: string | number | null | undefined, type: string) => {
    if (value == null || value === '') return '—'
    if (type === 'CURRENCY') return eur(Number(value))
    if (type === 'NUMBER') return n(Number(value), 2)
    return String(value)
  }
  return <div className="consumables-reports">
    <div className="consumables-report-toolbar">
      <label>Vrsta poročila<select value={reportType} onChange={(e) => { setReportType(e.target.value as ConsumableReportType); setServiceTypeId(''); setEmployeeId('') }}><option value="STOCK_VALUATION">Vrednost zaloge</option><option value="CONSUMPTION">Poraba</option><option value="PURCHASES">Nabava</option><option value="INVENTORY">Inventurne razlike</option><option value="TRANSFERS">Prenosi zaloge</option></select></label>
      {reportType !== 'STOCK_VALUATION' && <><label>Od<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Do<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></>}
      <label>Poslovalnica<select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Vse poslovalnice</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      {reportType === 'CONSUMPTION' && <><label>Storitev<select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}><option value="">Vse storitve</option>{(report?.serviceOptions || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Izvajalec<select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Vsi izvajalci</option>{(report?.employeeOptions || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></>}
      <button type="button" className="btn secondary" onClick={onRefresh} disabled={loading}>{loading ? 'Nalagam…' : 'Osveži'}</button>
    </div>
    <div className="consumables-report-kpis">
      <KpiCard tone="blue" title="Poročilo" value={reportLabels[reportType]} note="Izbrani pogled" />
      <KpiCard tone="green" title="Vrstice" value={report?.rows?.length || 0} note="Po uporabljenih filtrih" />
      {Object.entries(report?.totals || {}).slice(0, 2).map(([key, value], index) => <KpiCard key={key} tone={index === 0 ? 'purple' : 'orange'} title={totalLabels[key] || key} value={['value', 'net', 'vat', 'gross'].includes(key) ? eur(Number(value)) : n(Number(value), 2)} note="Skupaj" />)}
    </div>
    <TableCard title={`${reportLabels[reportType]} · ${report?.rows?.length || 0}`}>
      <div className="consumables-report-table-wrap">
        <table><thead><tr>{(report?.columns || []).map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{(report?.rows || []).map((row, rowIndex) => <tr key={rowIndex}>{report!.columns.map((column) => <td key={column.key} className={column.type === 'CURRENCY' || column.type === 'NUMBER' ? 'numeric' : ''}>{formatValue(row[column.key], column.type)}</td>)}</tr>)}</tbody></table>
        <Empty visible={!loading && (!report || report.rows.length === 0)} text="Za izbrane filtre ni podatkov." />
        {loading && <div className="consumables-report-loading">Nalaganje poročila…</div>}
      </div>
      <div className="consumables-report-footer"><span>Izvoz vključuje trenutno izbrano vrsto poročila in filtre.</span><div><button type="button" className="btn secondary" onClick={onExportCsv}>CSV</button><button type="button" className="btn primary" onClick={onExportExcel}>Excel</button></div></div>
    </TableCard>
  </div>
}

function ItemRows({ items, compact, onEditItem, onAdjustStock, onTransferStock }: { items: Item[]; compact?: boolean; onEditItem?: (item: Item) => void; onAdjustStock?: (item: Item) => void; onTransferStock?: (item: Item) => void }) {
  return <><table><thead><tr><th>Artikel</th>{!compact && <th>SKU / črtna koda</th>}<th>Kategorija</th><th>Lokacija</th><th>Na zalogi</th><th>Min. zaloga</th><th>Enota</th><th>Vrednost</th>{!compact && <th>Prodajna cena / DDV</th>}{!compact && <th>Zaračunljivo</th>}<th>Aktivnost</th><th>Zaloga</th>{!compact && <th>Akcije</th>}</tr></thead><tbody>{items.map((item) => <tr key={`${item.id}:${item.locationId}`}><td><strong>{item.name}</strong>{item.description && <><br /><small>{item.description}</small></>}</td>{!compact && <td>{item.sku || '—'}{item.barcode && <><br /><small>{item.barcode}</small></>}</td>}<td>{item.category?.name || '—'}</td><td>{item.location || '—'}</td><td className={item.lowStock ? 'danger' : ''}>{n(item.currentStock, 2)}</td><td>{n(item.minimumStock, 2)}</td><td>{item.unit}</td><td>{eur(Number(item.currentStock || 0) * Number(item.costPrice || 0))}</td>{!compact && <td>{eur(item.salePrice)}<br /><small>{vatText(item.vatRate)}</small></td>}{!compact && <td><span className={`toggle-dot ${item.billable ? 'on' : ''}`} /></td>}<td><Badge tone={item.active ? 'success' : 'muted'}>{item.active ? 'Aktiven' : 'Neaktiven'}</Badge></td><td><Badge tone={!item.trackStock ? 'muted' : item.currentStock <= 0 ? 'danger' : item.lowStock ? 'warning' : 'success'}>{!item.trackStock ? 'Brez sledenja' : item.currentStock <= 0 ? 'Brez zaloge' : item.lowStock ? 'Nizko' : 'OK'}</Badge></td>{!compact && <td><div className="consumables-row-actions"><button type="button" className="icon-btn edit" onClick={() => onEditItem?.(item)} title="Uredi artikel" aria-label={`Uredi ${item.name}`}>✎</button><button type="button" className="icon-btn movement" onClick={() => onAdjustStock?.(item)} title="Premik zaloge" aria-label={`Premik zaloge ${item.name}`}>±</button>{item.trackStock && <button type="button" className="icon-btn transfer" onClick={() => onTransferStock?.(item)} title="Prenos med poslovalnicami" aria-label={`Prenos zaloge ${item.name}`}>⇄</button>}</div></td>}</tr>)}</tbody></table><Empty visible={items.length === 0} text="Ni artiklov za prikaz." /></>
}
function SideLowStock({ items, title = 'Nizka zaloga' }: { items: Item[]; title?: string }) { return <TableCard title={title} action="Prikaži vse"><table><tbody>{items.slice(0, 5).map((item) => <tr key={`${item.id}:${item.locationId}`}><td>{item.name}<br /><small>{item.location || '—'}</small></td><td className="danger">{n(item.currentStock, 2)} {item.unit}</td></tr>)}</tbody></table><Empty visible={items.length === 0} text="Ni artiklov z nizko zalogo." /></TableCard> }
function CategoryDistribution({ items }: { items: Item[] }) {
  const uniqueItems = Array.from(new Map(items.map((item) => [item.id, item])).values())
  const groups = groupBy(uniqueItems, (i) => i.category?.name || 'Brez kategorije')
  return <ChartCard title="Porazdelitev po kategorijah" data={Object.entries(groups).map(([label, value]) => ({ label, value: value.length }))} />
}
function QuickStats({ total, value, low, out, billable }: { total: number; value: number; low: number; out: number; billable: number }) { return <TableCard title="Hitra statistika"><div className="quick-stat-grid"><span>Skupaj artiklov<strong>{total}</strong></span><span>Vrednost zaloge<strong>{eur(value)}</strong></span><span>Nizka zaloga<strong>{low}</strong></span><span>Zunaj zaloge<strong>{out}</strong></span><span>Zaračunljivih<strong>{billable}</strong></span></div></TableCard> }
function ChartCard({ title, data }: { title: string; data: { label: string; value: number }[] }) { const total = data.reduce((s, d) => s + Number(d.value || 0), 0); return <TableCard title={title}><div className="consumables-donut-row"><div className="consumables-donut" /><ul>{data.slice(0, 6).map((d) => <li key={d.label}><span>{d.label}</span><strong>{total ? Math.round((d.value / total) * 100) : 0}% ({n(d.value, 0)})</strong></li>)}</ul></div></TableCard> }
function BarsCard({ title, data }: { title: string; data: { label: string; value: number }[] }) { const max = Math.max(1, ...data.map((d) => Number(d.value || 0))); return <TableCard title={title} action="Prikaži vse"><div className="consumables-bars">{data.slice(0, 6).map((d) => <div key={d.label}><span>{d.label}</span><i><b style={{ width: `${Math.max(6, (Number(d.value || 0) / max) * 100)}%` }} /></i><strong>{n(d.value, 2)}</strong></div>)}</div></TableCard> }
function ReorderCard({ items, createPurchaseOrder, highlightItemId, canManage }: { items: Item[]; createPurchaseOrder: (items?: Item[]) => void; highlightItemId?: number | null; canManage: boolean }) { return <TableCard title="Predlogi za naročilo" action="Prikaži vse"><table><tbody>{items.slice(0, 8).map((item) => <tr key={`${item.id}:${item.locationId}`} className={item.id === highlightItemId ? 'highlighted-low-stock' : ''}><td>{item.name}<br /><small>{item.location || '—'} · Trenutno: {n(item.currentStock, 2)} {item.unit} · Min: {n(item.minimumStock, 2)} {item.unit}</small></td><td>Predlagano: {n(suggestedOrderQuantity(item), 0)} {item.unit}</td><td>{canManage ? <button type="button" className="btn tiny" onClick={() => createPurchaseOrder([item])}>Dodaj</button> : <span className="muted">—</span>}</td></tr>)}</tbody></table><Empty visible={items.length === 0} text="Ni artiklov pod minimalno zalogo." />{canManage && <button type="button" className="btn secondary wide" disabled={items.length === 0} onClick={() => createPurchaseOrder(items)}>Ustvari predloge naročil</button>}</TableCard> }

function FakeLineChart() { return <TableCard title="Poraba v zadnjih 7 dneh"><div className="fake-line-chart"><svg viewBox="0 0 300 140" role="img" aria-label="Poraba"><polyline points="0,100 50,72 100,35 150,108 200,76 250,58 300,58" fill="none" stroke="currentColor" strokeWidth="4" /><path d="M0 100L50 72L100 35L150 108L200 76L250 58L300 58L300 140L0 140Z" fill="currentColor" opacity="0.08" /></svg></div><div className="quick-stat-grid two"><span>Skupna poraba<strong>1.842 kos</strong></span><span>Povprečno na dan<strong>263 kos</strong></span></div></TableCard> }
function toInventoryDraft(detail: InventoryDetail | null | undefined): InventoryCountDraft {
  const result: InventoryCountDraft = {}
  ;(detail?.lines || []).forEach((line) => { result[line.id] = { countedQuantity: line.countedQuantity == null ? '' : String(line.countedQuantity), notes: line.notes || '' } })
  return result
}
function suggestedOrderQuantity(item: Item) { return Math.max(Number(item.minimumStock || 0) * 2 - Number(item.currentStock || 0), Number(item.minimumStock || 0), 0) }
function vatMultiplier(rate?: PurchaseOrderLineForm['vatRate'] | Item['vatRate'] | null) { return rate === 'VAT_22' ? 0.22 : rate === 'VAT_9_5' ? 0.095 : 0 }
function groupMovements(movements: Movement[]) { const m: Record<string, number> = {}; movements.forEach((x) => { if (x.quantityDelta < 0 && x.movementType !== 'TRANSFER_OUT') m[x.itemName] = (m[x.itemName] || 0) + Math.abs(x.quantityDelta) }); return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }
function distinctItemCount(items: Item[]) { return new Set(items.map((item) => item.id)).size }
function groupByLocation(items: Item[]) { const result: Record<string, number> = {}; items.forEach((i) => { const k = i.location || 'Brez lokacije'; result[k] = (result[k] || 0) + 1 }); return result }
function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> { return items.reduce((acc, item) => { const k = key(item); (acc[k] ||= []).push(item); return acc }, {} as Record<string, T[]>) }
