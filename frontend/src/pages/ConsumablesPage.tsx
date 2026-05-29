import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../api'
import { useToast } from '../components/Toast'

type Category = { id: number; name: string; color?: string | null; active: boolean }
type Item = {
  id: number
  name: string
  description?: string | null
  category?: Category | null
  sku?: string | null
  barcode?: string | null
  unit: string
  location?: string | null
  currentStock: number
  minimumStock: number
  costPrice: number
  salePrice?: number | null
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
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'COMPLETED' | 'CANCELLED'
  orderDate?: string | null
  expectedDate?: string | null
  totalAmount: number
  receivedAmount: number
  notes?: string | null
}

type TabKey = 'overview' | 'items' | 'procurement' | 'suppliers' | 'movements' | 'inventory'

type ItemFormState = {
  name: string
  sku: string
  categoryId: string
  location: string
  unit: string
  currentStock: string
  minimumStock: string
  costPrice: string
  billable: boolean
  trackStock: boolean
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

export function ConsumablesPage() {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<Overview>(emptyOverview)
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showOnlyLow, setShowOnlyLow] = useState(false)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  const [itemForm, setItemForm] = useState<ItemFormState>({
    name: '', sku: '', categoryId: '', location: '', unit: 'kos', currentStock: '0', minimumStock: '0', costPrice: '0', billable: false, trackStock: true,
  })

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/consumables/overview').catch(() => ({ data: emptyOverview })),
      api.get('/consumables/items').catch(() => ({ data: [] })),
      api.get('/consumables/categories').catch(() => ({ data: [] })),
      api.get('/consumables/movements').catch(() => ({ data: [] })),
      api.get('/consumables/suppliers').catch(() => ({ data: [] })),
      api.get('/consumables/purchase-orders').catch(() => ({ data: [] })),
    ])
      .then(([overviewRes, itemRes, catRes, movRes, supplierRes, poRes]) => {
        setOverview(overviewRes.data || emptyOverview)
        setItems(Array.isArray(itemRes.data) ? itemRes.data : [])
        setCategories(Array.isArray(catRes.data) ? catRes.data : [])
        setMovements(Array.isArray(movRes.data) ? movRes.data : [])
        setSuppliers(Array.isArray(supplierRes.data) ? supplierRes.data : [])
        setPurchaseOrders(Array.isArray(poRes.data) ? poRes.data : [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const locations = useMemo(() => Array.from(new Set(items.map((i) => i.location).filter(Boolean) as string[])).sort(), [items])
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (q && ![item.name, item.sku, item.category?.name, item.location].some((v) => String(v || '').toLowerCase().includes(q))) return false
      if (categoryFilter && item.category?.id !== Number(categoryFilter)) return false
      if (locationFilter && item.location !== locationFilter) return false
      if (statusFilter === 'low' && !item.lowStock) return false
      if (statusFilter === 'ok' && item.lowStock) return false
      if (showOnlyLow && !item.lowStock) return false
      return true
    })
  }, [items, query, categoryFilter, locationFilter, statusFilter, showOnlyLow])

  const lowStockItems = useMemo(() => items.filter((i) => i.lowStock), [items])
  const billableCount = useMemo(() => items.filter((i) => i.billable).length, [items])
  const outOfStockCount = useMemo(() => items.filter((i) => i.trackStock && Number(i.currentStock) <= 0).length, [items])

  const saveItem = (event: FormEvent) => {
    event.preventDefault()
    if (!itemForm.name.trim()) {
      showToast('error', 'Vnesite naziv artikla.')
      return
    }
    setSavingItem(true)
    api.post('/consumables/items', {
      name: itemForm.name.trim(),
      sku: itemForm.sku.trim() || null,
      categoryId: itemForm.categoryId ? Number(itemForm.categoryId) : null,
      location: itemForm.location.trim() || null,
      unit: itemForm.unit.trim() || 'kos',
      currentStock: Number(itemForm.currentStock || 0),
      minimumStock: Number(itemForm.minimumStock || 0),
      costPrice: Number(itemForm.costPrice || 0),
      billable: itemForm.billable,
      trackStock: itemForm.trackStock,
      active: true,
    })
      .then(() => {
        showToast('success', 'Artikel je dodan.')
        setItemModalOpen(false)
        setItemForm({ name: '', sku: '', categoryId: '', location: '', unit: 'kos', currentStock: '0', minimumStock: '0', costPrice: '0', billable: false, trackStock: true })
        load()
      })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Shranjevanje artikla ni uspelo.'))
      .finally(() => setSavingItem(false))
  }

  const createCategory = () => {
    const name = window.prompt('Naziv kategorije')?.trim()
    if (!name) return
    api.post('/consumables/categories', { name, color: '#2563eb', active: true })
      .then(() => { showToast('success', 'Kategorija je dodana.'); load() })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Kategorije ni bilo mogoče dodati.'))
  }

  const createSupplier = () => {
    const name = window.prompt('Naziv dobavitelja')?.trim()
    if (!name) return
    api.post('/consumables/suppliers', { name, status: 'ACTIVE', reliabilityPercent: 100, paymentTermsDays: 30 })
      .then(() => { showToast('success', 'Dobavitelj je dodan.'); load() })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Dobavitelja ni bilo mogoče dodati.'))
  }

  const createPurchaseOrder = () => {
    api.post('/consumables/purchase-orders', { status: 'DRAFT', orderDate: new Date().toISOString().slice(0, 10), totalAmount: 0, receivedAmount: 0 })
      .then(() => { showToast('success', 'Naročilnica je ustvarjena.'); load(); setActiveTab('procurement') })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Naročilnice ni bilo mogoče ustvariti.'))
  }

  const adjustStock = (item: Item) => {
    const raw = window.prompt(`Sprememba zaloge za ${item.name} (${item.unit}). Uporabite + ali -, npr. 10 ali -2.`)
    if (!raw) return
    const delta = Number(raw.replace(',', '.'))
    if (!Number.isFinite(delta) || delta === 0) {
      showToast('error', 'Vnesite veljavno spremembo količine.')
      return
    }
    api.post(`/consumables/items/${item.id}/adjust`, {
      quantityDelta: delta,
      movementType: delta > 0 ? 'PURCHASE' : 'MANUAL_ADJUSTMENT',
      note: 'Ročni vnos iz seznama artiklov',
    })
      .then(() => { showToast('success', 'Zaloga je posodobljena.'); load() })
      .catch((e) => showToast('error', e?.response?.data?.message || 'Zaloge ni bilo mogoče posodobiti.'))
  }

  return (
    <div className="consumables-page">
      <section className="consumables-panel">
        <div className="consumables-header-row">
          <div>
            <h1>Porabni material</h1>
          </div>
          <div className="consumables-header-actions">
            <button type="button" className="btn secondary" onClick={() => window.print()}>Izvozi</button>
            {activeTab === 'items' && <button type="button" className="btn primary" onClick={() => setItemModalOpen(true)}>+ Nov artikel</button>}
            {activeTab === 'procurement' && <button type="button" className="btn primary" onClick={createPurchaseOrder}>+ Nova naročilnica</button>}
            {activeTab === 'suppliers' && <button type="button" className="btn primary" onClick={createSupplier}>+ Nov dobavitelj</button>}
            {activeTab === 'movements' && <button type="button" className="btn primary" onClick={() => setActiveTab('items')}>Nov premik</button>}
            {activeTab === 'inventory' && <button type="button" className="btn primary" onClick={() => showToast('info', 'Inventura uporablja iste podatke zaloge in odstopanja. Podrobna inventurna seja je pripravljena za naslednjo fazo.')}>Začni inventuro</button>}
          </div>
        </div>

        <div className="consumables-tabs" role="tablist" aria-label="Porabni material">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab overview={overview} items={items} lowStockItems={lowStockItems} movements={movements} query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} showOnlyLow={showOnlyLow} setShowOnlyLow={setShowOnlyLow} categories={categories} locations={locations} createPurchaseOrder={createPurchaseOrder} loading={loading} />}
        {activeTab === 'items' && <ItemsTab items={filteredItems} categories={categories} locations={locations} query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} lowStockItems={lowStockItems} billableCount={billableCount} outOfStockCount={outOfStockCount} setItemModalOpen={setItemModalOpen} createCategory={createCategory} adjustStock={adjustStock} />}
        {activeTab === 'procurement' && <ProcurementTab orders={purchaseOrders} items={items} createPurchaseOrder={createPurchaseOrder} />}
        {activeTab === 'suppliers' && <SuppliersTab suppliers={suppliers} createSupplier={createSupplier} />}
        {activeTab === 'movements' && <MovementsTab movements={movements} />}
        {activeTab === 'inventory' && <InventoryTab items={items} />}
      </section>

      {itemModalOpen && (
        <div className="consumables-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setItemModalOpen(false) }}>
          <form className="consumables-modal" onSubmit={saveItem}>
            <header>
              <h2>Nov artikel</h2>
              <button type="button" onClick={() => setItemModalOpen(false)} aria-label="Zapri">×</button>
            </header>
            <div className="consumables-modal-grid">
              <label>Naziv<input value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} /></label>
              <label>SKU<input value={itemForm.sku} onChange={(e) => setItemForm((f) => ({ ...f, sku: e.target.value }))} /></label>
              <label>Kategorija<select value={itemForm.categoryId} onChange={(e) => setItemForm((f) => ({ ...f, categoryId: e.target.value }))}><option value="">Brez kategorije</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Lokacija<input value={itemForm.location} onChange={(e) => setItemForm((f) => ({ ...f, location: e.target.value }))} /></label>
              <label>Enota<input value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))} /></label>
              <label>Trenutna zaloga<input type="number" step="0.01" value={itemForm.currentStock} onChange={(e) => setItemForm((f) => ({ ...f, currentStock: e.target.value }))} /></label>
              <label>Min. zaloga<input type="number" step="0.01" value={itemForm.minimumStock} onChange={(e) => setItemForm((f) => ({ ...f, minimumStock: e.target.value }))} /></label>
              <label>Nabavna cena<input type="number" step="0.01" value={itemForm.costPrice} onChange={(e) => setItemForm((f) => ({ ...f, costPrice: e.target.value }))} /></label>
            </div>
            <div className="consumables-modal-switches">
              <label><input type="checkbox" checked={itemForm.trackStock} onChange={(e) => setItemForm((f) => ({ ...f, trackStock: e.target.checked }))} /> Spremljaj zalogo</label>
              <label><input type="checkbox" checked={itemForm.billable} onChange={(e) => setItemForm((f) => ({ ...f, billable: e.target.checked }))} /> Zaračunljivo</label>
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={() => setItemModalOpen(false)}>Prekliči</button>
              <button type="submit" className="btn primary" disabled={savingItem}>{savingItem ? 'Shranjujem…' : 'Shrani artikel'}</button>
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
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Išči po artiklu, SKU, kategoriji, lokaciji…" />
      <label>Kategorija<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Vse kategorije</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
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
      <KpiCard tone="green" title="Poraba ta mesec" value={n(overview.monthlyConsumptionQuantity, 2)} note="Enot porabljenih" />
      <KpiCard tone="purple" title="Vrednost zaloge" value={eur(overview.stockValue)} note="Po nabavni vrednosti" />
    </div>
    <div className="consumables-two-col">
      <TableCard title="Nizka zaloga" action="Prikaži vse">
        <table><thead><tr><th>Artikel</th><th>Kategorija</th><th>Lokacija</th><th>Na zalogi</th><th>Min.</th><th>Status</th></tr></thead><tbody>{(overview.lowStock.length ? overview.lowStock : lowStockItems).slice(0, 5).map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.category?.name || '—'}</td><td>{item.location || '—'}</td><td className="danger">{n(item.currentStock, 2)} {item.unit}</td><td>{n(item.minimumStock, 2)} {item.unit}</td><td><Badge tone={item.currentStock <= 0 ? 'danger' : 'warning'}>{item.currentStock <= 0 ? 'Kritično' : 'Nizko'}</Badge></td></tr>)}</tbody></table>
      </TableCard>
      <TableCard title="Zadnji premiki zaloge" action="Prikaži vse">
        <table><thead><tr><th>Datum</th><th>Artikel</th><th>Vrsta</th><th>Količina</th><th>Uporabnik</th></tr></thead><tbody>{(overview.recentMovements.length ? overview.recentMovements : movements).slice(0, 5).map((m) => <tr key={m.id}><td>{dateTime(m.createdAt)}</td><td>{m.itemName}</td><td><Badge tone={m.quantityDelta < 0 ? 'danger' : 'success'}>{movementText(m.movementType)}</Badge></td><td className={m.quantityDelta < 0 ? 'danger' : 'success'}>{m.quantityDelta > 0 ? '+' : ''}{n(m.quantityDelta, 2)} {m.unit}</td><td>{m.userName || '—'}</td></tr>)}</tbody></table>
      </TableCard>
    </div>
    <div className="consumables-three-col">
      <ChartCard title="Poraba po kategorijah (ta mesec)" data={overview.categoryUsage} />
      <BarsCard title="Najbolj porabljeni artikli (ta mesec)" data={overview.mostUsed} />
      <ReorderCard items={lowStockItems.slice(0, 5)} createPurchaseOrder={props.createPurchaseOrder} />
    </div>
    <TableCard title="Zaloga – vsi artikli" action="Prikaži vse"><ItemRows items={props.items.slice(0, 4)} compact /></TableCard>
  </>
}

function ItemsTab(props: { items: Item[]; categories: Category[]; locations: string[]; query: string; setQuery: (v: string) => void; categoryFilter: string; setCategoryFilter: (v: string) => void; locationFilter: string; setLocationFilter: (v: string) => void; statusFilter: string; setStatusFilter: (v: string) => void; lowStockItems: Item[]; billableCount: number; outOfStockCount: number; setItemModalOpen: (v: boolean) => void; createCategory: () => void; adjustStock: (item: Item) => void }) {
  return <div className="consumables-main-with-side">
    <div>
      <Filters {...props} extra={<label>Status<select value={props.statusFilter} onChange={(e) => props.setStatusFilter(e.target.value)}><option value="">Vsi statusi</option><option value="ok">OK</option><option value="low">Nizka zaloga</option></select></label>} />
      <div className="consumables-chip-row"><button className="active">Vse kategorije <span>{props.items.length}</span></button>{props.categories.map((c) => <button key={c.id}>{c.name}</button>)}<button onClick={props.createCategory}>+</button></div>
      <TableCard title={`Prikazujem ${props.items.length} artiklov`}><ItemRows items={props.items} onAdjustStock={props.adjustStock} /></TableCard>
    </div>
    <aside className="consumables-side-stack"><SideLowStock items={props.lowStockItems} /><CategoryDistribution items={props.items} /><QuickStats total={props.items.length} value={props.items.reduce((s, i) => s + Number(i.currentStock || 0) * Number(i.costPrice || 0), 0)} low={props.lowStockItems.length} out={props.outOfStockCount} billable={props.billableCount} /></aside>
  </div>
}

function ProcurementTab({ orders, items, createPurchaseOrder }: { orders: PurchaseOrder[]; items: Item[]; createPurchaseOrder: () => void }) {
  const open = orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status))
  const low = items.filter((i) => i.lowStock)
  return <div className="consumables-main-with-side">
    <div>
      <div className="consumables-kpi-grid compact"><KpiCard tone="blue" title="Odprte naročilnice" value={open.length} note="V pripravi ali naročene" /><KpiCard tone="green" title="Pričakovane dobave" value={orders.filter((o) => o.expectedDate).length} note="Z vpisanim datumom" /><KpiCard tone="orange" title="Izdelki za naročilo" value={low.length} note="Pod minimalno zalogo" /><KpiCard tone="purple" title="Mesečni strošek nabave" value={eur(orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0))} note="Skupaj" /></div>
      <div className="consumables-filter-row"><label>Dobavitelj<select><option>Vsi dobavitelji</option></select></label><label>Status<select><option>Vsi statusi</option></select></label><label>Obdobje<input value="01/05/2026 – 31/05/2026" readOnly /></label><button className="btn secondary">Ponastavi filtre</button></div>
      <TableCard title="Naročilnice"><table><thead><tr><th>Št. naročilnice</th><th>Datum</th><th>Dobavitelj</th><th>Status</th><th>Prič. dobava</th><th>Vrednost</th><th>Prejeto</th><th>Akcije</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td className="linkish">{o.orderNumber}</td><td>{date(o.orderDate)}</td><td>{o.supplierName || '—'}</td><td><Badge tone={o.status === 'COMPLETED' ? 'success' : o.status === 'PARTIALLY_RECEIVED' ? 'warning' : 'info'}>{statusText(o.status)}</Badge></td><td>{date(o.expectedDate)}</td><td>{eur(o.totalAmount)}</td><td>{eur(o.receivedAmount)}</td><td><button className="icon-btn">…</button></td></tr>)}</tbody></table><Empty visible={orders.length === 0} text="Naročilnic še ni. Ustvarite prvo naročilnico iz predlogov za naročilo." /></TableCard>
    </div>
    <aside className="consumables-side-stack"><ReorderCard items={low.slice(0, 5)} createPurchaseOrder={createPurchaseOrder} /><TableCard title="Pričakovane dobave" action="Prikaži vse"><table><tbody>{orders.filter((o) => o.expectedDate).slice(0, 5).map((o) => <tr key={o.id}><td>{o.supplierName || o.orderNumber}</td><td>{date(o.expectedDate)}</td><td><Badge tone="info">{statusText(o.status)}</Badge></td></tr>)}</tbody></table></TableCard></aside>
  </div>
}

function SuppliersTab({ suppliers, createSupplier }: { suppliers: Supplier[]; createSupplier: () => void }) {
  return <>
    <div className="consumables-filter-row"><input placeholder="Išči dobavitelje, kontaktne osebe, e-mail, kategorije…" /><label>Status<select><option>Vsi statusi</option></select></label><label>Kategorija<select><option>Vse kategorije</option></select></label><label>Pogoji plačila<select><option>Vsi pogoji</option></select></label></div>
    <div className="consumables-main-with-side">
      <div>
        <div className="consumables-kpi-grid compact"><KpiCard tone="blue" title="Skupaj dobaviteljev" value={suppliers.length} note="Vsi registrirani dobavitelji" /><KpiCard tone="green" title="Aktivna naročila" value="—" note="Iz naročilnic" /><KpiCard tone="red" title="Neplačane obveznosti" value={eur(suppliers.reduce((s, x) => s + Number(x.outstandingAmount || 0), 0))} note="Skupaj zapadlo" /></div>
        <TableCard title="Seznam dobaviteljev"><table><thead><tr><th>Dobavitelj</th><th>Kontaktna oseba</th><th>Telefon / E-mail</th><th>Kategorije</th><th>Pogoji plačila</th><th>Zanesljivost</th><th>Status</th><th>Akcije</th></tr></thead><tbody>{suppliers.map((s) => <tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.contactName || '—'}</td><td>{s.phone || '—'}<br /><small>{s.email || ''}</small></td><td>{s.categories || '—'}</td><td>{s.paymentTermsDays || 0} dni</td><td><span className="mini-progress"><i style={{ width: `${s.reliabilityPercent || 0}%` }} /></span> {s.reliabilityPercent || 0}%</td><td><Badge tone={s.status === 'ACTIVE' ? 'success' : 'muted'}>{s.status === 'ACTIVE' ? 'Aktiven' : 'Neaktiven'}</Badge></td><td><button className="icon-btn">…</button></td></tr>)}</tbody></table><Empty visible={suppliers.length === 0} text="Dodajte dobavitelje za hitrejše naročanje porabnega materiala." /></TableCard>
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
      <TableCard title="Zgodovina premikov zaloge"><table><thead><tr><th>Datum in čas</th><th>Vrsta premika</th><th>Artikel</th><th>Kategorija</th><th>Količina</th><th>Enota</th><th>Vrednost</th><th>Status</th><th>Uporabnik</th></tr></thead><tbody>{movements.map((m) => <tr key={m.id}><td>{dateTime(m.createdAt)}</td><td><Badge tone={m.quantityDelta < 0 ? 'danger' : m.movementType.includes('CORRECTION') ? 'warning' : 'success'}>{movementText(m.movementType)}</Badge></td><td>{m.itemName}</td><td>{m.categoryName || '—'}</td><td className={m.quantityDelta < 0 ? 'danger' : 'success'}>{m.quantityDelta > 0 ? '+' : ''}{n(m.quantityDelta, 2)}</td><td>{m.unit || 'kos'}</td><td>{eur(Math.abs(Number(m.valueDelta || 0)))}</td><td><Badge tone="success">Zaključeno</Badge></td><td>{m.userName || '—'}</td></tr>)}</tbody></table><Empty visible={movements.length === 0} text="Premikov zaloge še ni. Prvi premiki nastanejo ob prilagoditvi zaloge ali zaključku termina." /></TableCard>
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
      <TableCard title="Inventura – štetje artiklov"><table><thead><tr><th>Artikel</th><th>Kategorija</th><th>Lokacija</th><th>Sistemska zaloga</th><th>Prešteta zaloga</th><th>Razlika</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.category?.name || '—'}</td><td>{item.location || '—'}</td><td>{n(item.currentStock, 2)} {item.unit}</td><td>{n(item.currentStock, 2)} {item.unit}</td><td>{item.lowStock ? <span className="danger">-{n(item.minimumStock - item.currentStock, 2)} {item.unit}</span> : '0'}</td><td><Badge tone={item.lowStock ? 'danger' : 'success'}>{item.lowStock ? 'Odstopanje' : 'Ujema se'}</Badge></td></tr>)}</tbody></table></TableCard>
    </div>
    <aside className="consumables-side-stack"><TableCard title="Napredek po lokacijah" action="Prikaži vse"><table><tbody>{Object.entries(groupByLocation(items)).map(([location, count]) => <tr key={location}><td>{location}</td><td>{count} / {count}</td><td><span className="mini-progress"><i style={{ width: '100%' }} /></span></td></tr>)}</tbody></table></TableCard><SideLowStock items={items.filter((i) => i.lowStock)} title="Največja odstopanja" /></aside>
  </div>
}

function TableCard({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return <section className="consumables-card"><header><h2>{title}</h2>{action && <button type="button">{action}</button>}</header>{children}</section>
}
function Empty({ visible, text }: { visible: boolean; text: string }) { return visible ? <div className="consumables-empty">{text}</div> : null }
function Badge({ tone, children }: { tone: string; children: ReactNode }) { return <span className={`consumables-badge ${tone}`}>{children}</span> }
function ItemRows({ items, compact, onAdjustStock }: { items: Item[]; compact?: boolean; onAdjustStock?: (item: Item) => void }) {
  return <><table><thead><tr><th>Artikel</th>{!compact && <th>SKU</th>}<th>Kategorija</th><th>Lokacija</th><th>Na zalogi</th><th>Min. zaloga</th><th>Enota</th><th>Vrednost</th>{!compact && <th>Zaračunljivo</th>}<th>Status</th><th>Akcije</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td>{!compact && <td>{item.sku || '—'}</td>}<td>{item.category?.name || '—'}</td><td>{item.location || '—'}</td><td className={item.lowStock ? 'danger' : ''}>{n(item.currentStock, 2)}</td><td>{n(item.minimumStock, 2)}</td><td>{item.unit}</td><td>{eur(Number(item.currentStock || 0) * Number(item.costPrice || 0))}</td>{!compact && <td><span className={`toggle-dot ${item.billable ? 'on' : ''}`} /></td>}<td><Badge tone={item.lowStock ? 'warning' : 'success'}>{item.lowStock ? 'Nizko' : 'OK'}</Badge></td><td><button className="icon-btn" onClick={() => onAdjustStock?.(item)}>…</button></td></tr>)}</tbody></table><Empty visible={items.length === 0} text="Ni artiklov za prikaz." /></>
}
function SideLowStock({ items, title = 'Nizka zaloga' }: { items: Item[]; title?: string }) { return <TableCard title={title} action="Prikaži vse"><table><tbody>{items.slice(0, 5).map((item) => <tr key={item.id}><td>{item.name}<br /><small>{item.location || '—'}</small></td><td className="danger">{n(item.currentStock, 2)} {item.unit}</td></tr>)}</tbody></table><Empty visible={items.length === 0} text="Ni artiklov z nizko zalogo." /></TableCard> }
function CategoryDistribution({ items }: { items: Item[] }) {
  const groups = groupBy(items, (i) => i.category?.name || 'Brez kategorije')
  return <ChartCard title="Porazdelitev po kategorijah" data={Object.entries(groups).map(([label, value]) => ({ label, value: value.length }))} />
}
function QuickStats({ total, value, low, out, billable }: { total: number; value: number; low: number; out: number; billable: number }) { return <TableCard title="Hitra statistika"><div className="quick-stat-grid"><span>Skupaj artiklov<strong>{total}</strong></span><span>Vrednost zaloge<strong>{eur(value)}</strong></span><span>Nizka zaloga<strong>{low}</strong></span><span>Zunaj zaloge<strong>{out}</strong></span><span>Zaračunljivih<strong>{billable}</strong></span></div></TableCard> }
function ChartCard({ title, data }: { title: string; data: { label: string; value: number }[] }) { const total = data.reduce((s, d) => s + Number(d.value || 0), 0); return <TableCard title={title}><div className="consumables-donut-row"><div className="consumables-donut" /><ul>{data.slice(0, 6).map((d) => <li key={d.label}><span>{d.label}</span><strong>{total ? Math.round((d.value / total) * 100) : 0}% ({n(d.value, 0)})</strong></li>)}</ul></div></TableCard> }
function BarsCard({ title, data }: { title: string; data: { label: string; value: number }[] }) { const max = Math.max(1, ...data.map((d) => Number(d.value || 0))); return <TableCard title={title} action="Prikaži vse"><div className="consumables-bars">{data.slice(0, 6).map((d) => <div key={d.label}><span>{d.label}</span><i><b style={{ width: `${Math.max(6, (Number(d.value || 0) / max) * 100)}%` }} /></i><strong>{n(d.value, 2)}</strong></div>)}</div></TableCard> }
function ReorderCard({ items, createPurchaseOrder }: { items: Item[]; createPurchaseOrder: () => void }) { return <TableCard title="Predlogi za naročilo" action="Prikaži vse"><table><tbody>{items.slice(0, 5).map((item) => <tr key={item.id}><td>{item.name}<br /><small>Trenutno: {n(item.currentStock, 2)} {item.unit} · Min: {n(item.minimumStock, 2)} {item.unit}</small></td><td>Predlagano: {n(Math.max(item.minimumStock * 2 - item.currentStock, item.minimumStock), 0)} {item.unit}</td><td><button className="btn tiny">Dodaj</button></td></tr>)}</tbody></table><button type="button" className="btn secondary wide" onClick={createPurchaseOrder}>Ustvari predloge naročil</button></TableCard> }
function FakeLineChart() { return <TableCard title="Poraba v zadnjih 7 dneh"><div className="fake-line-chart"><svg viewBox="0 0 300 140" role="img" aria-label="Poraba"><polyline points="0,100 50,72 100,35 150,108 200,76 250,58 300,58" fill="none" stroke="currentColor" strokeWidth="4" /><path d="M0 100L50 72L100 35L150 108L200 76L250 58L300 58L300 140L0 140Z" fill="currentColor" opacity="0.08" /></svg></div><div className="quick-stat-grid two"><span>Skupna poraba<strong>1.842 kos</strong></span><span>Povprečno na dan<strong>263 kos</strong></span></div></TableCard> }
function groupMovements(movements: Movement[]) { const m: Record<string, number> = {}; movements.forEach((x) => { if (x.quantityDelta < 0) m[x.itemName] = (m[x.itemName] || 0) + Math.abs(x.quantityDelta) }); return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }
function groupByLocation(items: Item[]) { const result: Record<string, number> = {}; items.forEach((i) => { const k = i.location || 'Brez lokacije'; result[k] = (result[k] || 0) + 1 }); return result }
function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> { return items.reduce((acc, item) => { const k = key(item); (acc[k] ||= []).push(item); return acc }, {} as Record<string, T[]>) }

export default ConsumablesPage
