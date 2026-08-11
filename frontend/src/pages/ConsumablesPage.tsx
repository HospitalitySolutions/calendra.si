import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useAuthenticatedUser } from '../authUserContext'
import { useToast } from '../components/Toast'
import { useSelectedLocationId } from '../lib/locationContext'
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
  quantityDelta: number
  stockBefore: number
  stockAfter: number
  valueDelta?: number | null
  unit?: string | null
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

type TabKey = 'overview' | 'items' | 'procurement' | 'suppliers' | 'movements' | 'inventory'
type ManualMovementType = 'PURCHASE' | 'MANUAL_ADJUSTMENT' | 'RETURN' | 'WASTE' | 'CORRECTION'

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
  return ({ PURCHASE: 'Prejem', SESSION_USAGE: 'Poraba', MANUAL_ADJUSTMENT: 'Ročni popravek', RETURN: 'Vračilo', WASTE: 'Odpis', CORRECTION: 'Korekcija', INVENTORY_COUNT: 'Inventura' } as Record<string, string>)[type] || type
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
  const activeUnitId = me.activeUnitId ?? me.companyId
  const [selectedLocationId] = useSelectedLocationId(activeUnitId)
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<Overview>(emptyOverview)
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [operationalLocations, setOperationalLocations] = useState<Location[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showOnlyLow, setShowOnlyLow] = useState(false)

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [savingItem, setSavingItem] = useState(false)
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm(null))

  const [stockMovementItem, setStockMovementItem] = useState<Item | null>(null)
  const [savingMovement, setSavingMovement] = useState(false)
  const [stockMovementForm, setStockMovementForm] = useState<StockMovementFormState>({ movementType: 'MANUAL_ADJUSTMENT', quantity: '1', direction: 'INCREASE', note: '' })

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({ id: null, name: '', color: '#2563eb', active: true })

  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm)

  const load = useCallback(async (force = true) => {
    setLoading(true)
    try {
      if (force) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.consumables.all, refetchType: 'none' })
      }

      const locationsPromise = queryClient.fetchQuery(locationsQueryOptions(activeUnitId)).catch(() => [] as Location[])
      const tasks: Promise<void>[] = []
      const loadItems = () => queryClient.fetchQuery(consumablesItemsQueryOptions<Item>(activeUnitId, selectedLocationId)).then(setItems).catch(() => setItems([]))
      const loadCategories = () => queryClient.fetchQuery(consumablesCategoriesQueryOptions<Category>(activeUnitId)).then(setCategories).catch(() => setCategories([]))
      const loadMovements = () => queryClient.fetchQuery(consumablesMovementsQueryOptions<Movement>(activeUnitId, selectedLocationId)).then(setMovements).catch(() => setMovements([]))

      if (activeTab === 'overview') {
        tasks.push(
          queryClient.fetchQuery(consumablesOverviewQueryOptions<Overview>(activeUnitId, selectedLocationId)).then((data) => setOverview(data || emptyOverview)).catch(() => setOverview(emptyOverview)),
          loadItems(),
          loadCategories(),
          loadMovements(),
        )
      } else if (activeTab === 'items') {
        tasks.push(loadItems(), loadCategories())
      } else if (activeTab === 'procurement') {
        tasks.push(
          loadItems(),
          queryClient.fetchQuery(consumablesPurchaseOrdersQueryOptions<PurchaseOrder>(activeUnitId, selectedLocationId)).then(setPurchaseOrders).catch(() => setPurchaseOrders([])),
        )
      } else if (activeTab === 'suppliers') {
        tasks.push(queryClient.fetchQuery(consumablesSuppliersQueryOptions<Supplier>(activeUnitId)).then(setSuppliers).catch(() => setSuppliers([])))
      } else if (activeTab === 'movements') {
        tasks.push(loadMovements())
      } else if (activeTab === 'inventory') {
        tasks.push(loadItems())
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
    setMovements([])
    setPurchaseOrders([])
    setOperationalLocations([])
  }, [activeUnitId, selectedLocationId])
  useEffect(() => { void load(false) }, [load])
  useEffect(() => { setLocationFilter('') }, [selectedLocationId])

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

  const createPurchaseOrder = () => {
    if (defaultWriteLocationId == null) {
      showToast('error', 'Za naročilnico najprej izberite poslovalnico v zgornjem izbirniku.')
      return
    }
    api.post('/consumables/purchase-orders', { locationId: defaultWriteLocationId, status: 'DRAFT', orderDate: new Date().toISOString().slice(0, 10), totalAmount: 0, receivedAmount: 0 })
      .then(() => { showToast('success', 'Naročilnica je ustvarjena.'); void load(); setActiveTab('procurement') })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Naročilnice ni bilo mogoče ustvariti.'))
  }

  const stockPreviewDelta = movementSignedQuantity(stockMovementForm)
  const stockPreviewAfter = stockMovementItem ? Number(stockMovementItem.currentStock || 0) + stockPreviewDelta : 0
  const manualDirectionVisible = ['MANUAL_ADJUSTMENT', 'CORRECTION'].includes(stockMovementForm.movementType)

  return (
    <div className="consumables-page">
      <section className="consumables-panel">
        <div className="consumables-header-row">
          <div><h1>Porabni material</h1></div>
          <div className="consumables-header-actions">
            <button type="button" className="btn secondary" onClick={() => window.print()}>Izvozi</button>
            {activeTab === 'items' && <button type="button" className="btn primary" onClick={openNewItem}>+ Nov artikel</button>}
            {activeTab === 'procurement' && <button type="button" className="btn primary" onClick={createPurchaseOrder}>+ Nova naročilnica</button>}
            {activeTab === 'suppliers' && <button type="button" className="btn primary" onClick={openNewSupplier}>+ Nov dobavitelj</button>}
            {activeTab === 'movements' && <button type="button" className="btn primary" onClick={() => setActiveTab('items')}>Nov premik</button>}
            {activeTab === 'inventory' && <button type="button" className="btn primary" onClick={() => showToast('info', 'Inventura uporablja iste podatke zaloge in odstopanja. Podrobna inventurna seja je pripravljena za naslednjo fazo.')}>Začni inventuro</button>}
          </div>
        </div>

        <div className="consumables-tabs" role="tablist" aria-label="Porabni material">
          {tabs.map((tab) => <button key={tab.key} type="button" className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
        </div>

        {activeTab === 'overview' && <OverviewTab overview={overview} items={items} lowStockItems={lowStockItems} movements={movements} query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} showOnlyLow={showOnlyLow} setShowOnlyLow={setShowOnlyLow} categories={categories} locations={stockLocationNames} createPurchaseOrder={createPurchaseOrder} loading={loading} />}
        {activeTab === 'items' && <ItemsTab items={filteredItems} categories={categories} locations={stockLocationNames} query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} lowStockItems={lowStockItems} billableCount={billableCount} outOfStockCount={outOfStockCount} openCategoryManager={openCategoryManager} onEditItem={openEditItem} onAdjustStock={openStockMovement} />}
        {activeTab === 'procurement' && <ProcurementTab orders={purchaseOrders} items={items} createPurchaseOrder={createPurchaseOrder} />}
        {activeTab === 'suppliers' && <SuppliersTab suppliers={suppliers} openSupplier={openEditSupplier} createSupplier={openNewSupplier} />}
        {activeTab === 'movements' && <MovementsTab movements={movements} />}
        {activeTab === 'inventory' && <InventoryTab items={items} />}
      </section>

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
              <label>Črtna koda<input value={itemForm.barcode} onChange={(e) => setItemForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="EAN / druga koda" /></label>
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

function OverviewTab(props: { overview: Overview; items: Item[]; lowStockItems: Item[]; movements: Movement[]; query: string; setQuery: (v: string) => void; categoryFilter: string; setCategoryFilter: (v: string) => void; locationFilter: string; setLocationFilter: (v: string) => void; showOnlyLow: boolean; setShowOnlyLow: (v: boolean) => void; categories: Category[]; locations: string[]; createPurchaseOrder: () => void; loading: boolean }) {
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
      <ReorderCard items={lowStockItems.slice(0, 5)} createPurchaseOrder={props.createPurchaseOrder} />
    </div>
    <TableCard title="Zaloga – vsi artikli" action="Prikaži vse"><ItemRows items={props.items.slice(0, 4)} compact /></TableCard>
  </>
}

function ItemsTab(props: { items: Item[]; categories: Category[]; locations: string[]; query: string; setQuery: (v: string) => void; categoryFilter: string; setCategoryFilter: (v: string) => void; locationFilter: string; setLocationFilter: (v: string) => void; statusFilter: string; setStatusFilter: (v: string) => void; lowStockItems: Item[]; billableCount: number; outOfStockCount: number; openCategoryManager: () => void; onEditItem: (item: Item) => void; onAdjustStock: (item: Item) => void }) {
  const catalogCount = distinctItemCount(props.items)
  const tableTitle = catalogCount === props.items.length ? `Prikazujem ${catalogCount} artiklov` : `Prikazujem ${catalogCount} artiklov · ${props.items.length} lokacijskih zalog`
  return <div className="consumables-main-with-side">
    <div>
      <Filters {...props} extra={<label>Status<select value={props.statusFilter} onChange={(e) => props.setStatusFilter(e.target.value)}><option value="">Vsi statusi</option><option value="active">Aktivni</option><option value="inactive">Neaktivni</option><option value="ok">Zaloga OK</option><option value="low">Nizka zaloga</option><option value="out">Brez zaloge</option></select></label>} />
      <div className="consumables-chip-row"><button type="button" className={!props.categoryFilter ? 'active' : ''} onClick={() => props.setCategoryFilter('')}>Vse kategorije <span>{catalogCount}</span></button>{props.categories.filter((c) => c.active).map((c) => <button type="button" className={props.categoryFilter === String(c.id) ? 'active' : ''} key={c.id} onClick={() => props.setCategoryFilter(String(c.id))}>{c.name}</button>)}<button type="button" className="manage" onClick={props.openCategoryManager}>Uredi kategorije</button></div>
      <TableCard title={tableTitle}><ItemRows items={props.items} onEditItem={props.onEditItem} onAdjustStock={props.onAdjustStock} /></TableCard>
    </div>
    <aside className="consumables-side-stack"><SideLowStock items={props.lowStockItems} /><CategoryDistribution items={props.items} /><QuickStats total={catalogCount} value={props.items.reduce((s, i) => s + Number(i.currentStock || 0) * Number(i.costPrice || 0), 0)} low={props.lowStockItems.length} out={props.outOfStockCount} billable={props.billableCount} /></aside>
  </div>
}

function ProcurementTab({ orders, items, createPurchaseOrder }: { orders: PurchaseOrder[]; items: Item[]; createPurchaseOrder: () => void }) {
  const open = orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status))
  const low = items.filter((i) => i.lowStock)
  return <div className="consumables-main-with-side">
    <div>
      <div className="consumables-kpi-grid compact"><KpiCard tone="blue" title="Odprte naročilnice" value={open.length} note="V pripravi ali naročene" /><KpiCard tone="green" title="Pričakovane dobave" value={orders.filter((o) => o.expectedDate).length} note="Z vpisanim datumom" /><KpiCard tone="orange" title="Izdelki za naročilo" value={low.length} note="Pod minimalno zalogo" /><KpiCard tone="purple" title="Mesečni strošek nabave" value={eur(orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0))} note="Skupaj" /></div>
      <div className="consumables-filter-row"><label>Dobavitelj<select><option>Vsi dobavitelji</option></select></label><label>Status<select><option>Vsi statusi</option></select></label><label>Obdobje<input value="01/05/2026 – 31/05/2026" readOnly /></label><button className="btn secondary">Ponastavi filtre</button></div>
      <TableCard title="Naročilnice"><table><thead><tr><th>Št. naročilnice</th><th>Datum</th><th>Dobavitelj</th><th>Poslovalnica</th><th>Status</th><th>Prič. dobava</th><th>Vrednost</th><th>Prejeto</th><th>Akcije</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td className="linkish">{o.orderNumber}</td><td>{date(o.orderDate)}</td><td>{o.supplierName || '—'}</td><td>{o.locationName || '—'}</td><td><Badge tone={o.status === 'COMPLETED' ? 'success' : o.status === 'PARTIALLY_RECEIVED' ? 'warning' : 'info'}>{statusText(o.status)}</Badge></td><td>{date(o.expectedDate)}</td><td>{eur(o.totalAmount)}</td><td>{eur(o.receivedAmount)}</td><td><button className="icon-btn">…</button></td></tr>)}</tbody></table><Empty visible={orders.length === 0} text="Naročilnic še ni. Ustvarite prvo naročilnico iz predlogov za naročilo." /></TableCard>
    </div>
    <aside className="consumables-side-stack"><ReorderCard items={low.slice(0, 5)} createPurchaseOrder={createPurchaseOrder} /><TableCard title="Pričakovane dobave" action="Prikaži vse"><table><tbody>{orders.filter((o) => o.expectedDate).slice(0, 5).map((o) => <tr key={o.id}><td>{o.supplierName || o.orderNumber}</td><td>{date(o.expectedDate)}</td><td><Badge tone="info">{statusText(o.status)}</Badge></td></tr>)}</tbody></table></TableCard></aside>
  </div>
}

function SuppliersTab({ suppliers, createSupplier, openSupplier }: { suppliers: Supplier[]; createSupplier: () => void; openSupplier: (supplier: Supplier) => void }) {
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
        <TableCard title={`Seznam dobaviteljev · ${filtered.length}`}><table><thead><tr><th>Dobavitelj</th><th>Kontaktna oseba</th><th>Telefon / E-mail</th><th>Kategorije</th><th>Pogoji plačila</th><th>Zanesljivost</th><th>Status</th><th>Akcije</th></tr></thead><tbody>{filtered.map((s) => <tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.contactName || '—'}</td><td>{s.phone || '—'}<br /><small>{s.email || ''}</small></td><td>{s.categories || '—'}</td><td>{s.paymentTermsDays || 0} dni</td><td><span className="mini-progress"><i style={{ width: `${s.reliabilityPercent || 0}%` }} /></span> {s.reliabilityPercent || 0}%</td><td><Badge tone={s.status === 'ACTIVE' ? 'success' : 'muted'}>{s.status === 'ACTIVE' ? 'Aktiven' : 'Neaktiven'}</Badge></td><td><button type="button" className="icon-btn edit" onClick={() => openSupplier(s)} title="Uredi dobavitelja" aria-label={`Uredi ${s.name}`}>✎</button></td></tr>)}</tbody></table><Empty visible={filtered.length === 0} text="Ni dobaviteljev, ki ustrezajo izbranim filtrom." /></TableCard>
      </div>
      <aside className="consumables-side-stack"><TableCard title="Top dobavitelji (zanesljivost)" action="Prikaži vse"><table><tbody>{suppliers.slice().sort((a, b) => Number(b.reliabilityPercent || 0) - Number(a.reliabilityPercent || 0)).slice(0, 5).map((s) => <tr key={s.id}><td>{s.name}</td><td><span className="mini-progress"><i style={{ width: `${s.reliabilityPercent || 0}%` }} /></span></td><td>{s.reliabilityPercent || 0}%</td></tr>)}</tbody></table></TableCard><button className="btn primary" onClick={createSupplier}>+ Nov dobavitelj</button></aside>
    </div>
  </>
}

function MovementsTab({ movements }: { movements: Movement[] }) {
  const today = movements.slice(0, 20)
  const totalDelta = today.reduce((s, m) => s + Number(m.quantityDelta || 0), 0)
  const value = today.reduce((s, m) => s + Math.abs(Number(m.valueDelta || 0)), 0)
  return <div className="consumables-main-with-side">
    <div>
      <div className="consumables-kpi-grid compact"><KpiCard tone="blue" title="Današnji premiki" value={today.length} note="vseh premikov" /><KpiCard tone="green" title="Sprememba količine" value={`${totalDelta > 0 ? '+' : ''}${n(totalDelta, 2)}`} note="neto sprememba" /><KpiCard tone="purple" title="Vrednost premikov" value={eur(value)} note="skupna vrednost" /><KpiCard tone="orange" title="Ročne korekcije" value={movements.filter((m) => ['CORRECTION', 'MANUAL_ADJUSTMENT'].includes(m.movementType)).length} note="premikov" /></div>
      <div className="consumables-filter-row"><label>Datum<input value="28.05.2026 – 28.05.2026" readOnly /></label><label>Vrsta premika<select><option>Vse</option></select></label><label>Kategorija<select><option>Vse kategorije</option></select></label><input placeholder="Išči po artiklu, kodi, seriji, lokaciji…" /><button className="btn secondary">Ponastavi filtre</button></div>
      <TableCard title="Zgodovina premikov zaloge"><table><thead><tr><th>Datum in čas</th><th>Vrsta premika</th><th>Artikel</th><th>Kategorija</th><th>Poslovalnica</th><th>Količina</th><th>Enota</th><th>Vrednost</th><th>Status</th><th>Uporabnik</th></tr></thead><tbody>{movements.map((m) => <tr key={m.id}><td>{dateTime(m.createdAt)}</td><td><Badge tone={m.quantityDelta < 0 ? 'danger' : m.movementType.includes('CORRECTION') ? 'warning' : 'success'}>{movementText(m.movementType)}</Badge></td><td>{m.itemName}</td><td>{m.categoryName || '—'}</td><td>{m.locationName || '—'}</td><td className={m.quantityDelta < 0 ? 'danger' : 'success'}>{m.quantityDelta > 0 ? '+' : ''}{n(m.quantityDelta, 2)}</td><td>{m.unit || 'kos'}</td><td>{eur(Math.abs(Number(m.valueDelta || 0)))}</td><td><Badge tone="success">Zaključeno</Badge></td><td>{m.userName || '—'}</td></tr>)}</tbody></table><Empty visible={movements.length === 0} text="Premikov zaloge še ni. Prvi premiki nastanejo ob prilagoditvi zaloge ali zaključku termina." /></TableCard>
    </div>
    <aside className="consumables-side-stack"><BarsCard title="Najpogosteje uporabljeni artikli" data={groupMovements(movements)} /><FakeLineChart /></aside>
  </div>
}

function InventoryTab({ items }: { items: Item[] }) {
  const counted = items.filter((i) => i.currentStock >= 0).length
  const discrepancies = items.filter((i) => i.lowStock).length
  return <div className="consumables-main-with-side">
    <div>
      <div className="consumables-kpi-grid"><KpiCard tone="blue" title="Aktivne inventure" value="1" note="V teku" /><KpiCard tone="green" title="Prešteti artikli" value={counted} note={`Od ${items.length}`} /><KpiCard tone="red" title="Odstopanja" value={discrepancies} note="Artikli z odstopanjem" /><KpiCard tone="purple" title="Napredek inventure" value={items.length ? `${Math.round((counted / items.length) * 100)}%` : '0%'} note="Skupni napredek" /></div>
      <div className="consumables-filter-row"><label>Lokacija<select><option>Vse lokacije</option></select></label><label>Kategorija<select><option>Vse kategorije</option></select></label><label>Status štetja<select><option>Vsi statusi</option></select></label><button className="btn secondary">Ponastavi filtre</button></div>
      <div className="inventory-progress"><span>Skupni napredek inventure</span><strong>{items.length ? Math.round((counted / items.length) * 100) : 0}%</strong><i><b style={{ width: `${items.length ? Math.round((counted / items.length) * 100) : 0}%` }} /></i><small>{counted} od {items.length} artiklov</small></div>
      <TableCard title="Inventura – štetje artiklov"><table><thead><tr><th>Artikel</th><th>Kategorija</th><th>Lokacija</th><th>Sistemska zaloga</th><th>Prešteta zaloga</th><th>Razlika</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.id}:${item.locationId}`}><td>{item.name}</td><td>{item.category?.name || '—'}</td><td>{item.location || '—'}</td><td>{n(item.currentStock, 2)} {item.unit}</td><td>{n(item.currentStock, 2)} {item.unit}</td><td>{item.lowStock ? <span className="danger">-{n(item.minimumStock - item.currentStock, 2)} {item.unit}</span> : '0'}</td><td><Badge tone={item.lowStock ? 'danger' : 'success'}>{item.lowStock ? 'Odstopanje' : 'Ujema se'}</Badge></td></tr>)}</tbody></table></TableCard>
    </div>
    <aside className="consumables-side-stack"><TableCard title="Napredek po lokacijah" action="Prikaži vse"><table><tbody>{Object.entries(groupByLocation(items)).map(([location, count]) => <tr key={location}><td>{location}</td><td>{count} / {count}</td><td><span className="mini-progress"><i style={{ width: '100%' }} /></span></td></tr>)}</tbody></table></TableCard><SideLowStock items={items.filter((i) => i.lowStock)} title="Največja odstopanja" /></aside>
  </div>
}

function TableCard({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return <section className="consumables-card"><header><h2>{title}</h2>{action && <button type="button">{action}</button>}</header>{children}</section>
}
function Empty({ visible, text }: { visible: boolean; text: string }) { return visible ? <div className="consumables-empty">{text}</div> : null }
function Badge({ tone, children }: { tone: string; children: ReactNode }) { return <span className={`consumables-badge ${tone}`}>{children}</span> }
function ItemRows({ items, compact, onEditItem, onAdjustStock }: { items: Item[]; compact?: boolean; onEditItem?: (item: Item) => void; onAdjustStock?: (item: Item) => void }) {
  return <><table><thead><tr><th>Artikel</th>{!compact && <th>SKU / črtna koda</th>}<th>Kategorija</th><th>Lokacija</th><th>Na zalogi</th><th>Min. zaloga</th><th>Enota</th><th>Vrednost</th>{!compact && <th>Prodajna cena / DDV</th>}{!compact && <th>Zaračunljivo</th>}<th>Aktivnost</th><th>Zaloga</th>{!compact && <th>Akcije</th>}</tr></thead><tbody>{items.map((item) => <tr key={`${item.id}:${item.locationId}`}><td><strong>{item.name}</strong>{item.description && <><br /><small>{item.description}</small></>}</td>{!compact && <td>{item.sku || '—'}{item.barcode && <><br /><small>{item.barcode}</small></>}</td>}<td>{item.category?.name || '—'}</td><td>{item.location || '—'}</td><td className={item.lowStock ? 'danger' : ''}>{n(item.currentStock, 2)}</td><td>{n(item.minimumStock, 2)}</td><td>{item.unit}</td><td>{eur(Number(item.currentStock || 0) * Number(item.costPrice || 0))}</td>{!compact && <td>{eur(item.salePrice)}<br /><small>{vatText(item.vatRate)}</small></td>}{!compact && <td><span className={`toggle-dot ${item.billable ? 'on' : ''}`} /></td>}<td><Badge tone={item.active ? 'success' : 'muted'}>{item.active ? 'Aktiven' : 'Neaktiven'}</Badge></td><td><Badge tone={!item.trackStock ? 'muted' : item.currentStock <= 0 ? 'danger' : item.lowStock ? 'warning' : 'success'}>{!item.trackStock ? 'Brez sledenja' : item.currentStock <= 0 ? 'Brez zaloge' : item.lowStock ? 'Nizko' : 'OK'}</Badge></td>{!compact && <td><div className="consumables-row-actions"><button type="button" className="icon-btn edit" onClick={() => onEditItem?.(item)} title="Uredi artikel" aria-label={`Uredi ${item.name}`}>✎</button><button type="button" className="icon-btn movement" onClick={() => onAdjustStock?.(item)} title="Premik zaloge" aria-label={`Premik zaloge ${item.name}`}>±</button></div></td>}</tr>)}</tbody></table><Empty visible={items.length === 0} text="Ni artiklov za prikaz." /></>
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
function ReorderCard({ items, createPurchaseOrder }: { items: Item[]; createPurchaseOrder: () => void }) { return <TableCard title="Predlogi za naročilo" action="Prikaži vse"><table><tbody>{items.slice(0, 5).map((item) => <tr key={`${item.id}:${item.locationId}`}><td>{item.name}<br /><small>Trenutno: {n(item.currentStock, 2)} {item.unit} · Min: {n(item.minimumStock, 2)} {item.unit}</small></td><td>Predlagano: {n(Math.max(item.minimumStock * 2 - item.currentStock, item.minimumStock), 0)} {item.unit}</td><td><button className="btn tiny">Dodaj</button></td></tr>)}</tbody></table><button type="button" className="btn secondary wide" onClick={createPurchaseOrder}>Ustvari predloge naročil</button></TableCard> }
function FakeLineChart() { return <TableCard title="Poraba v zadnjih 7 dneh"><div className="fake-line-chart"><svg viewBox="0 0 300 140" role="img" aria-label="Poraba"><polyline points="0,100 50,72 100,35 150,108 200,76 250,58 300,58" fill="none" stroke="currentColor" strokeWidth="4" /><path d="M0 100L50 72L100 35L150 108L200 76L250 58L300 58L300 140L0 140Z" fill="currentColor" opacity="0.08" /></svg></div><div className="quick-stat-grid two"><span>Skupna poraba<strong>1.842 kos</strong></span><span>Povprečno na dan<strong>263 kos</strong></span></div></TableCard> }
function groupMovements(movements: Movement[]) { const m: Record<string, number> = {}; movements.forEach((x) => { if (x.quantityDelta < 0) m[x.itemName] = (m[x.itemName] || 0) + Math.abs(x.quantityDelta) }); return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }
function distinctItemCount(items: Item[]) { return new Set(items.map((item) => item.id)).size }
function groupByLocation(items: Item[]) { const result: Record<string, number> = {}; items.forEach((i) => { const k = i.location || 'Brez lokacije'; result[k] = (result[k] || 0) + 1 }); return result }
function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> { return items.reduce((acc, item) => { const k = key(item); (acc[k] ||= []).push(item); return acc }, {} as Record<string, T[]>) }
