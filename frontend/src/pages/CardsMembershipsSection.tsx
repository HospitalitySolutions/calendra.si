import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { BillingService, SessionType as SessionTypeT } from '../lib/types'
import { GuestConfigSaveIcon } from '../components/GuestConfigSaveIcon'
import { EmptyState, Field } from '../components/ui'
import { useToast } from '../components/Toast'
import { currency } from '../lib/format'
import { useLocale } from '../locale'

const SESSION_TYPES_SUBTAB_TRANSACTION = 'transaction-services'

type GuestAdminProductType = 'CLASS_TICKET' | 'PACK' | 'MEMBERSHIP' | 'GIFT_CARD'

type GuestAdminProduct = {
  id: number
  name: string
  description?: string | null
  promoText?: string | null
  productType: GuestAdminProductType
  priceGross: number
  currency: string
  active: boolean
  guestVisible: boolean
  bookable: boolean
  usageLimit?: number | null
  validityDays?: number | null
  autoRenews: boolean
  sortOrder: number
  sessionTypeId?: number | null
  sessionTypeName?: string | null
  transactionServiceId?: number | null
  transactionServiceCode?: string | null
  transactionServiceDescription?: string | null
  createdAt?: string
  updatedAt?: string
}

type GuestProductFormState = {
  name: string
  description: string
  promoText: string
  productType: GuestAdminProductType
  priceGross: string
  currency: string
  active: boolean
  guestVisible: boolean
  bookable: boolean
  usageLimit: string
  validityDays: string
  autoRenews: boolean
  sortOrder: string
  sessionTypeId: string
  transactionServiceId: string
}

const ADMIN_GUEST_PRODUCT_TYPES: GuestAdminProductType[] = ['PACK', 'MEMBERSHIP', 'CLASS_TICKET', 'GIFT_CARD']

const CARD_PRODUCT_TYPE_LABELS: Record<GuestAdminProductType, string> = {
  CLASS_TICKET: 'Class ticket',
  PACK: 'Pack',
  MEMBERSHIP: 'Membership',
  GIFT_CARD: 'Gift card',
}

const defaultGuestProductForm = (): GuestProductFormState => ({
  name: '',
  description: '',
  promoText: '',
  productType: 'PACK',
  priceGross: '0.00',
  currency: 'EUR',
  active: true,
  guestVisible: true,
  bookable: false,
  usageLimit: '',
  validityDays: '',
  autoRenews: false,
  sortOrder: '0',
  sessionTypeId: '',
  transactionServiceId: '',
})

const normalizeGuestProductFormForType = (
  current: GuestProductFormState,
  nextProductType: GuestAdminProductType,
  defaultSessionTypeId?: string,
): GuestProductFormState => {
  const currentUsage = parsePositiveIntegerInput(current.usageLimit)
  return {
    ...current,
    productType: nextProductType,
    usageLimit: (nextProductType === 'CLASS_TICKET' || nextProductType === 'MEMBERSHIP' || nextProductType === 'GIFT_CARD')
      ? '1'
      : nextProductType === 'PACK' && (currentUsage == null || currentUsage <= 1)
        ? '2'
        : current.usageLimit,
    sessionTypeId:
      (nextProductType === 'CLASS_TICKET' || nextProductType === 'PACK')
        ? (current.sessionTypeId.trim() || defaultSessionTypeId || '')
        : nextProductType === 'GIFT_CARD'
          ? ''
          : current.sessionTypeId,
    autoRenews: nextProductType === 'MEMBERSHIP' ? current.autoRenews : false,
    bookable: nextProductType === 'GIFT_CARD' ? false : current.bookable,
  }
}

const parsePositiveIntegerInput = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function sessionUnitGrossSum(sessionType: SessionTypeT | undefined): number | null {
  const links = sessionType?.linkedServices
  if (!links?.length) return null
  let sum = 0
  for (const ls of links) {
    const g = ls.unitGross
    if (g == null || !Number.isFinite(Number(g))) return null
    sum += Number(g)
  }
  return Math.round(sum * 100) / 100
}

function suggestedGuestCardGross(
  productType: GuestAdminProductType,
  sessionTypeId: string,
  usageLimitStr: string,
  guestSessionTypes: SessionTypeT[],
): number | null {
  if (productType !== 'PACK' && productType !== 'CLASS_TICKET') return null
  const trimmedId = sessionTypeId.trim()
  if (!trimmedId) return null
  const st = guestSessionTypes.find((t) => String(t.id) === trimmedId)
  const unit = sessionUnitGrossSum(st)
  if (unit == null) return null
  if (productType === 'CLASS_TICKET') return Math.round(unit * 100) / 100
  const usage = parsePositiveIntegerInput(usageLimitStr)
  if (usage == null) return null
  return Math.round(unit * usage * 100) / 100
}

function guestProductTypeUsesAutoPrice(productType: GuestAdminProductType): boolean {
  return productType === 'PACK' || productType === 'CLASS_TICKET'
}

function transactionServiceLabel(service: BillingService): string {
  const code = service.code?.trim()
  const description = service.description?.trim()
  if (code && description) return `${code} — ${description}`
  return code || description || `#${service.id}`
}

function guestProductTransactionServiceLabel(product: GuestAdminProduct): string {
  const code = product.transactionServiceCode?.trim()
  const description = product.transactionServiceDescription?.trim()
  if (code && description) return `${code} — ${description}`
  return code || description || '—'
}

function syncGuestProductPriceFromSessionTypes(form: GuestProductFormState, sessionTypes: SessionTypeT[]): GuestProductFormState {
  if (!guestProductTypeUsesAutoPrice(form.productType)) return form
  const suggested = suggestedGuestCardGross(form.productType, form.sessionTypeId, form.usageLimit, sessionTypes)
  return {
    ...form,
    priceGross: suggested != null ? suggested.toFixed(2) : '0.00',
  }
}

const productTypeLabel = (productType: GuestAdminProductType) => CARD_PRODUCT_TYPE_LABELS[productType] || productType


const CARD_MEMBERSHIP_ICON_TONES = ['blue', 'green', 'orange', 'purple', 'yellow', 'pink'] as const

function CardsMembershipIcon({ index }: { index: number }) {
  const tone = CARD_MEMBERSHIP_ICON_TONES[index % CARD_MEMBERSHIP_ICON_TONES.length]
  return (
    <span className={`service-config-icon service-config-icon--${tone}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="3" width="14" height="18" rx="2.5" />
        <path d="M8 8h6M8 12h6M8 16h4" />
      </svg>
    </span>
  )
}

function CardsMembershipNameCell({ product, index }: { product: GuestAdminProduct; index: number }) {
  return (
    <div className="service-config-name-cell">
      <CardsMembershipIcon index={index} />
      <div className="service-config-name-stack">
        <strong>{product.name}</strong>
        <span>{product.description?.trim() ? product.description : guestProductWalletSubtitle(product)}</span>
      </div>
    </div>
  )
}

function CardsMembershipSortableHeader({ children }: { children: ReactNode }) {
  return (
    <span className="service-config-sortable-header">
      {children}
      <span className="service-config-sort-icon" aria-hidden>↕</span>
    </span>
  )
}

function guestProductWalletSubtitle(product: GuestAdminProduct): string {
  const bits: string[] = []
  if (product.autoRenews) bits.push('Auto-renew enabled')
  bits.push(product.bookable ? 'Requires slot in checkout' : 'Wallet product')
  return bits.join(' · ')
}

export type CardsMembershipsSectionHandle = {
  openNew: () => void
}

export type CardsMembershipsSectionProps = {
  sessionTypes: SessionTypeT[]
  searchQuery: string
  activeFilter: 'active' | 'inactive'
  onFilteredCountChange?: (filteredCount: number) => void
}

export const CardsMembershipsSection = forwardRef<CardsMembershipsSectionHandle, CardsMembershipsSectionProps>(
  function CardsMembershipsSection({ sessionTypes, searchQuery, activeFilter, onFilteredCountChange }, ref) {
  const me = getStoredUser()
  const isAdmin = me?.role === 'ADMIN'
  const { t, locale } = useLocale()
  const { showToast } = useToast()
  const [guestProducts, setGuestProducts] = useState<GuestAdminProduct[]>([])
  const [transactionServices, setTransactionServices] = useState<BillingService[]>([])
  const [openProductMenuId, setOpenProductMenuId] = useState<number | null>(null)
  const [activatingGuestProductId, setActivatingGuestProductId] = useState<number | null>(null)
  const [showGuestProductModal, setShowGuestProductModal] = useState(false)
  const [editingGuestProductId, setEditingGuestProductId] = useState<number | null>(null)
  const [savingGuestProduct, setSavingGuestProduct] = useState(false)
  const [guestProductForm, setGuestProductForm] = useState<GuestProductFormState>(defaultGuestProductForm)

  const loadGuestProducts = useCallback(async () => {
    if (!isAdmin) return
    try {
      const [productsRes, servicesRes] = await Promise.all([
        api.get('/guest/admin/products').catch(() => ({ data: [] })),
        api.get<BillingService[]>('/billing/services').catch(() => ({ data: [] as BillingService[] })),
      ])
      setGuestProducts(productsRes.data || [])
      setTransactionServices(Array.isArray(servicesRes.data) ? servicesRes.data : [])
    } catch {
      setGuestProducts([])
      setTransactionServices([])
    }
  }, [isAdmin])

  useEffect(() => {
    void loadGuestProducts()
  }, [loadGuestProducts])

  useEffect(() => {
    if (openProductMenuId == null) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.clients-card-menu-wrap') || el?.closest('.clients-card-menu-popover')) return
      setOpenProductMenuId(null)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openProductMenuId])

  useEffect(() => {
    if (!showGuestProductModal) return
    if (!guestProductTypeUsesAutoPrice(guestProductForm.productType)) return
    setGuestProductForm((f) => syncGuestProductPriceFromSessionTypes(f, sessionTypes))
  }, [showGuestProductModal, guestProductForm.productType, guestProductForm.sessionTypeId, guestProductForm.usageLimit, sessionTypes])

  const activeTransactionServices = useMemo(
    () => transactionServices
      .filter((service) => service.active !== false)
      .sort((a, b) => transactionServiceLabel(a).localeCompare(transactionServiceLabel(b))),
    [transactionServices],
  )

  const openNewGuestProductModal = useCallback(() => {
    setOpenProductMenuId(null)
    setEditingGuestProductId(null)
    const base = defaultGuestProductForm()
    const firstSessionTypeId = sessionTypes[0] ? String(sessionTypes[0].id) : ''
    setGuestProductForm({
      ...base,
      sessionTypeId: firstSessionTypeId,
      transactionServiceId: activeTransactionServices[0] ? String(activeTransactionServices[0].id) : '',
    })
    setShowGuestProductModal(true)
  }, [sessionTypes, activeTransactionServices])

  useImperativeHandle(ref, () => ({ openNew: openNewGuestProductModal }), [openNewGuestProductModal])

  const openEditGuestProductModal = (product: GuestAdminProduct) => {
    setOpenProductMenuId(null)
    setEditingGuestProductId(product.id)
    setGuestProductForm(
      normalizeGuestProductFormForType(
        {
          name: product.name,
          description: product.description || '',
          promoText: product.promoText || '',
          productType: product.productType,
          priceGross: Number(product.priceGross ?? 0).toFixed(2),
          currency: product.currency || 'EUR',
          active: product.active,
          guestVisible: product.guestVisible,
          bookable: product.bookable,
          usageLimit: product.usageLimit == null ? '' : String(product.usageLimit),
          validityDays: product.validityDays == null ? '' : String(product.validityDays),
          autoRenews: product.autoRenews,
          sortOrder: String(product.sortOrder ?? 0),
          sessionTypeId: product.sessionTypeId == null ? '' : String(product.sessionTypeId),
          transactionServiceId: product.transactionServiceId == null
            ? (activeTransactionServices[0] ? String(activeTransactionServices[0].id) : '')
            : String(product.transactionServiceId),
        },
        product.productType,
      ),
    )
    setShowGuestProductModal(true)
  }

  const submitGuestProduct = async (e: FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    const isGiftCard = guestProductForm.productType === 'GIFT_CARD'
    if (guestProductForm.productType === 'PACK') {
      if (!guestProductForm.sessionTypeId.trim()) {
        window.alert('Pack cards must be linked to a service type.')
        return
      }
      const packUsageLimit = parsePositiveIntegerInput(guestProductForm.usageLimit)
      if (packUsageLimit == null || packUsageLimit <= 1) {
        window.alert('Pack cards must have a quantity greater than 1.')
        return
      }
    }
    const isClassTicket = guestProductForm.productType === 'CLASS_TICKET'
    const isMembership = guestProductForm.productType === 'MEMBERSHIP'
    const validityDays = parsePositiveIntegerInput(guestProductForm.validityDays)
    const transactionServiceId = guestProductForm.transactionServiceId.trim()
      ? Number.parseInt(guestProductForm.transactionServiceId, 10)
      : null
    if (isGiftCard && !validityDays) {
      window.alert('Gift cards must have an expiry date.')
      return
    }
    if (isGiftCard && (!transactionServiceId || transactionServiceId <= 0)) {
      window.alert('Gift cards must be linked to a transaction service.')
      return
    }
    const payload = {
      name: guestProductForm.name.trim(),
      description: guestProductForm.description.trim(),
      promoText: guestProductForm.promoText.trim() || null,
      productType: guestProductForm.productType,
      priceGross: Number.parseFloat(guestProductForm.priceGross || '0') || 0,
      currency: guestProductForm.currency.trim().toUpperCase() || 'EUR',
      active: guestProductForm.active,
      guestVisible: guestProductForm.guestVisible,
      bookable: isGiftCard ? false : guestProductForm.bookable,
      usageLimit: (isClassTicket || isMembership || isGiftCard) ? 1 : parsePositiveIntegerInput(guestProductForm.usageLimit),
      validityDays,
      autoRenews: guestProductForm.productType === 'MEMBERSHIP' ? guestProductForm.autoRenews : false,
      sortOrder: Number.parseInt(guestProductForm.sortOrder || '0', 10) || 0,
      sessionTypeId: isGiftCard ? null : (guestProductForm.sessionTypeId ? Number.parseInt(guestProductForm.sessionTypeId, 10) : null),
      transactionServiceId: isGiftCard ? transactionServiceId : null,
    }
    const wasEditing = editingGuestProductId != null
    setSavingGuestProduct(true)
    try {
      if (editingGuestProductId) await api.put(`/guest/admin/products/${editingGuestProductId}`, payload)
      else await api.post('/guest/admin/products', payload)
      setShowGuestProductModal(false)
      setEditingGuestProductId(null)
      setGuestProductForm(defaultGuestProductForm())
      await loadGuestProducts()
      showToast('success', wasEditing ? 'Card updated.' : 'Card created.')
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Failed to save card.')
    } finally {
      setSavingGuestProduct(false)
    }
  }

  const deleteGuestProduct = async (product: GuestAdminProduct) => {
    if (!isAdmin) return
    if (!window.confirm(`Delete ${product.name}? This only works if it has never been sold.`)) return
    try {
      await api.delete(`/guest/admin/products/${product.id}`)
      if (editingGuestProductId === product.id) {
        setShowGuestProductModal(false)
        setEditingGuestProductId(null)
        setGuestProductForm(defaultGuestProductForm())
      }
      await loadGuestProducts()
      showToast('success', 'Card deleted.')
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Failed to delete card.')
    }
  }

  const toggleGuestProductActive = async (product: GuestAdminProduct, nextActive: boolean) => {
    if (!isAdmin) return
    setActivatingGuestProductId(product.id)
    try {
      await api.put(`/guest/admin/products/${product.id}`, {
        name: product.name,
        description: product.description || '',
        promoText: product.promoText || null,
        productType: product.productType,
        priceGross: product.priceGross,
        currency: product.currency,
        active: nextActive,
        guestVisible: product.guestVisible,
        bookable: product.bookable,
        usageLimit: product.usageLimit ?? null,
        validityDays: product.productType === 'GIFT_CARD' ? (product.validityDays ?? 1) : (product.validityDays ?? null),
        autoRenews: product.productType === 'MEMBERSHIP' ? product.autoRenews : false,
        sortOrder: product.sortOrder ?? 0,
        sessionTypeId: product.productType === 'GIFT_CARD' ? null : (product.sessionTypeId ?? null),
        transactionServiceId: product.productType === 'GIFT_CARD' ? (product.transactionServiceId ?? null) : null,
      })
      setOpenProductMenuId(null)
      await loadGuestProducts()
      showToast('success', `Card ${nextActive ? 'activated' : 'archived'}.`)
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Failed to update card status.')
    } finally {
      setActivatingGuestProductId(null)
    }
  }

  const filteredGuestProducts = useMemo(() => {
    const byStatus = guestProducts.filter((product) => (activeFilter === 'inactive' ? product.active === false : product.active !== false))
    const q = searchQuery.trim().toLowerCase()
    if (!q) return byStatus
    return byStatus.filter((p) => {
      const vis = p.guestVisible ? 'visible' : 'hidden'
      const st = p.active ? 'active' : 'archived'
      const validityLabel = p.validityDays != null ? `${p.validityDays} days` : 'no expiry'
      const hay = [
        p.name,
        productTypeLabel(p.productType),
        p.sessionTypeName || '',
        guestProductTransactionServiceLabel(p),
        String(p.priceGross),
        currency(p.priceGross),
        vis,
        st,
        p.usageLimit != null ? String(p.usageLimit) : 'unlimited',
        validityLabel,
        guestProductWalletSubtitle(p),
        String(p.id),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [guestProducts, searchQuery, activeFilter])

  useEffect(() => {
    onFilteredCountChange?.(filteredGuestProducts.length)
  }, [filteredGuestProducts.length, onFilteredCountChange])

  if (!isAdmin) return null

  const activeStatusLabel = locale === 'sl' ? 'Aktivna' : 'Active'
  const inactiveStatusLabel = locale === 'sl' ? 'Neaktivna' : 'Inactive'

  return (
    <>
      {guestProducts.length === 0 ? (
        <EmptyState title="No cards yet" text="Create your first membership or visit pack to start selling it in the guest app wallet." />
      ) : filteredGuestProducts.length === 0 ? (
        <EmptyState title={t('calendarFilterSearchNoResults')} text={t('sessionTypesSearchNoMatchesText')} />
      ) : (
        <div className="clients-list-shell service-config-list-shell">
          <div className="clients-mobile-list service-config-mobile-list">
            {filteredGuestProducts.map((product, index) => (
              <article
                key={product.id}
                className="clients-mobile-card service-config-mobile-card"
                role="button"
                tabIndex={0}
                onClick={() => openEditGuestProductModal(product)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openEditGuestProductModal(product)
                  }
                }}
              >
                <div className="clients-mobile-card-head">
                  <CardsMembershipNameCell product={product} index={index} />
                  <div
                    className="clients-mobile-card-head-tools"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <button
                      type="button"
                      className="secondary slim-btn cards-product-delete-btn cards-product-row-delete"
                      onClick={() => void deleteGuestProduct(product)}
                    >
                      {locale === 'sl' ? 'Izbriši kartico' : 'Delete card'}
                    </button>
                    <div className="clients-card-menu-wrap">
                    <button
                      type="button"
                      className="secondary clients-card-menu-trigger service-config-menu-trigger"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenProductMenuId((prev) => (prev === product.id ? null : product.id))
                      }}
                      aria-label="Card actions"
                      aria-expanded={openProductMenuId === product.id}
                    >
                      ⋮
                    </button>
                    {openProductMenuId === product.id && (
                      <div className="clients-card-menu-popover" role="dialog" aria-label="Card actions">
                        <button
                          type="button"
                          disabled={activatingGuestProductId === product.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleGuestProductActive(product, !product.active)
                          }}
                        >
                          {product.active ? (locale === 'sl' ? 'Deaktiviraj' : 'Deactivate') : 'Activate'}
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                </div>
                <div className="clients-mobile-meta">
                  <div>
                    <span>{t('sessionTypesCardsColType')}</span>
                    <strong>{productTypeLabel(product.productType)}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardsColServiceType')}</span>
                    <strong>{product.productType === 'GIFT_CARD' ? guestProductTransactionServiceLabel(product) : (product.sessionTypeName || 'Any service type')}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardsColPrice')}</span>
                    <strong>{currency(product.priceGross)}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardsColStatus')}</span>
                    <strong>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${product.active === false ? ' clients-status-pill--inactive' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void toggleGuestProductActive(product, !product.active)
                        }}
                        disabled={activatingGuestProductId === product.id}
                      >
                        <span />
                        {product.active === false ? inactiveStatusLabel : activeStatusLabel}
                      </button>
                    </strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="simple-table-wrap clients-table-wrap clients-table-desktop session-types-table-wrap service-config-table-wrap">
            <table className="clients-table session-types-table service-config-table">
              <thead>
                <tr>
                  <th><CardsMembershipSortableHeader>{locale === 'sl' ? 'Naziv' : 'Name'}</CardsMembershipSortableHeader></th>
                  <th><CardsMembershipSortableHeader>{t('sessionTypesCardsColType')}</CardsMembershipSortableHeader></th>
                  <th><CardsMembershipSortableHeader>{t('sessionTypesCardsColServiceType')}</CardsMembershipSortableHeader></th>
                  <th><CardsMembershipSortableHeader>{t('sessionTypesCardsColPrice')}</CardsMembershipSortableHeader></th>
                  <th><CardsMembershipSortableHeader>{t('sessionTypesCardsColValidity')}</CardsMembershipSortableHeader></th>
                  <th><CardsMembershipSortableHeader>{t('sessionTypesCardsColStatus')}</CardsMembershipSortableHeader></th>
                  <th>{locale === 'sl' ? 'Dejanje' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredGuestProducts.map((product, index) => (
                  <tr
                    key={product.id}
                    className="clients-row clients-row--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openEditGuestProductModal(product)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openEditGuestProductModal(product)
                      }
                    }}
                  >
                    <td><CardsMembershipNameCell product={product} index={index} /></td>
                    <td className="clients-muted service-config-category-cell">{productTypeLabel(product.productType)}</td>
                    <td className="clients-muted service-config-category-cell">
                      {product.productType === 'GIFT_CARD' ? guestProductTransactionServiceLabel(product) : (product.sessionTypeName || 'Any service type')}
                    </td>
                    <td className="clients-muted service-config-price-cell">{currency(product.priceGross)}</td>
                    <td className="clients-muted">{product.validityDays ? `${product.validityDays} days` : 'No expiry'}</td>
                    <td>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${product.active === false ? ' clients-status-pill--inactive' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void toggleGuestProductActive(product, !product.active)
                        }}
                        disabled={activatingGuestProductId === product.id}
                      >
                        <span />
                        {product.active === false ? inactiveStatusLabel : activeStatusLabel}
                      </button>
                    </td>
                    <td className="clients-actions service-config-actions">
                      <div className="clients-actions-inner">
                        <button
                          type="button"
                          className="secondary slim-btn cards-product-delete-btn cards-product-row-delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteGuestProduct(product)
                          }}
                        >
                          {locale === 'sl' ? 'Izbriši kartico' : 'Delete card'}
                        </button>
                        <div className="clients-card-menu-wrap">
                          <button
                            type="button"
                            className="secondary clients-card-menu-trigger service-config-menu-trigger"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenProductMenuId((prev) => (prev === product.id ? null : product.id))
                            }}
                            aria-label="Card actions"
                            aria-expanded={openProductMenuId === product.id}
                          >
                            ⋮
                          </button>
                          {openProductMenuId === product.id && (
                            <div className="clients-card-menu-popover" role="dialog" aria-label="Card actions">
                              <button
                                type="button"
                                disabled={activatingGuestProductId === product.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void toggleGuestProductActive(product, !product.active)
                                }}
                              >
                                {product.active ? (locale === 'sl' ? 'Deaktiviraj' : 'Deactivate') : 'Activate'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showGuestProductModal && (
        <div
          className="modal-backdrop booking-side-panel-backdrop cards-product-modal-backdrop"
          onClick={() => {
            if (!savingGuestProduct) {
              setShowGuestProductModal(false)
              setEditingGuestProductId(null)
            }
          }}
          role="presentation"
        >
          <div className="modal large-modal booking-side-panel cards-product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cards-product-modal-header">
              <div className="cards-product-modal-heading">
                <h2>{editingGuestProductId ? 'Edit card' : 'New card'}</h2>
                {editingGuestProductId && <p>Update the details of this card.</p>}
              </div>
              <button
                type="button"
                className="secondary booking-side-panel-close cards-product-modal-close"
                onClick={() => {
                  if (!savingGuestProduct) {
                    setShowGuestProductModal(false)
                    setEditingGuestProductId(null)
                  }
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form className="form-grid booking-side-panel-body cards-product-modal-body" onSubmit={submitGuestProduct}>
              <Field label="Name *">
                <input
                  required
                  placeholder="Enter card name"
                  value={guestProductForm.name}
                  onChange={(e) => setGuestProductForm({ ...guestProductForm, name: e.target.value })}
                />
              </Field>
              <Field label="Card type *">
                <select
                  value={guestProductForm.productType}
                  onChange={(e) => {
                    const pt = e.target.value as GuestAdminProductType
                    const firstSessionTypeId = sessionTypes[0] ? String(sessionTypes[0].id) : ''
                    const firstTransactionServiceId = activeTransactionServices[0] ? String(activeTransactionServices[0].id) : ''
                    setGuestProductForm((current) =>
                      {
                        const normalized = normalizeGuestProductFormForType(current, pt, firstSessionTypeId)
                        const withGiftDefaults = pt === 'GIFT_CARD'
                          ? {
                              ...normalized,
                              transactionServiceId: normalized.transactionServiceId.trim() || firstTransactionServiceId,
                            }
                          : normalized
                        return syncGuestProductPriceFromSessionTypes(withGiftDefaults, sessionTypes)
                      },
                    )
                  }}
                >
                  {ADMIN_GUEST_PRODUCT_TYPES.map((productType) => (
                    <option key={productType} value={productType}>{productTypeLabel(productType)}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Price (gross) *"
                hint={
                  guestProductTypeUsesAutoPrice(guestProductForm.productType)
                    ? guestProductForm.productType === 'PACK'
                      ? 'Calculated from the service type (sum of transaction line grosses) × quantity.'
                      : 'Calculated from the service type (sum of transaction line grosses) for one entry.'
                    : undefined
                }
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly={guestProductTypeUsesAutoPrice(guestProductForm.productType)}
                  aria-readonly={guestProductTypeUsesAutoPrice(guestProductForm.productType)}
                  value={guestProductForm.priceGross}
                  onChange={(e) => {
                    if (guestProductTypeUsesAutoPrice(guestProductForm.productType)) return
                    setGuestProductForm({ ...guestProductForm, priceGross: e.target.value })
                  }}
                />
              </Field>
              <Field label="Currency *">
                <input
                  maxLength={3}
                  value={guestProductForm.currency}
                  onChange={(e) => setGuestProductForm({ ...guestProductForm, currency: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field
                label={guestProductForm.productType === 'PACK' || guestProductForm.productType === 'CLASS_TICKET' ? 'Service type *' : 'Service type'}
                hint={
                  guestProductForm.productType === 'GIFT_CARD'
                    ? 'Gift cards are linked to a transaction service instead.'
                    : guestProductForm.productType === 'CLASS_TICKET'
                    ? 'Required. Price is derived from linked transaction services on this type.'
                    : guestProductForm.productType === 'PACK'
                      ? 'Required. Price is derived from linked transaction services × quantity.'
                      : 'Optional. When selected, this card can only be used for that service type.'
                }
              >
                <select
                  disabled={guestProductForm.productType === 'GIFT_CARD'}
                  required={guestProductForm.productType === 'CLASS_TICKET' || guestProductForm.productType === 'PACK'}
                  value={guestProductForm.sessionTypeId}
                  onChange={(e) => setGuestProductForm({ ...guestProductForm, sessionTypeId: e.target.value })}
                >
                  {guestProductForm.productType === 'MEMBERSHIP' && <option value="">Any service type</option>}
                  {sessionTypes.map((sessionType) => (
                    <option key={sessionType.id} value={sessionType.id}>{sessionType.name}</option>
                  ))}
                </select>
              </Field>
              {guestProductForm.productType === 'GIFT_CARD' && (
                <Field
                  label="Transaction service *"
                  hint="Used as the invoice line when a guest buys this gift card."
                >
                  <select
                    required
                    value={guestProductForm.transactionServiceId}
                    onChange={(e) => setGuestProductForm({ ...guestProductForm, transactionServiceId: e.target.value })}
                  >
                    <option value="">Select transaction service</option>
                    {activeTransactionServices.map((service) => (
                      <option key={service.id} value={service.id}>{transactionServiceLabel(service)}</option>
                    ))}
                  </select>
                </Field>
              )}
              {guestProductForm.productType === 'GIFT_CARD' && activeTransactionServices.length === 0 && (
                <p className="muted cards-product-modal-note">
                  Create an active transaction service in{' '}
                  <Link to={`/session-types?subtab=${SESSION_TYPES_SUBTAB_TRANSACTION}`} className="linkish-btn" style={{ display: 'inline' }}>
                    Transaction services
                  </Link>
                  {' '}before creating gift cards.
                </p>
              )}
              {guestProductTypeUsesAutoPrice(guestProductForm.productType) &&
                guestProductForm.sessionTypeId.trim() !== '' &&
                sessionUnitGrossSum(sessionTypes.find((t) => String(t.id) === guestProductForm.sessionTypeId.trim())) == null && (
                <p className="muted cards-product-modal-note">
                  This service type has no linked transaction services (or prices are missing). Configure them under{' '}
                  <Link to={`/session-types?subtab=${SESSION_TYPES_SUBTAB_TRANSACTION}`} className="linkish-btn" style={{ display: 'inline' }}>
                    Transaction services
                  </Link>
                  .
                </p>
              )}
              <Field label="Sort order">
                <input
                  type="number"
                  step="1"
                  value={guestProductForm.sortOrder}
                  onChange={(e) => setGuestProductForm({ ...guestProductForm, sortOrder: e.target.value })}
                />
              </Field>
              <Field label={guestProductForm.productType === 'GIFT_CARD' ? 'Validity (days) *' : 'Validity (days)'} hint={guestProductForm.productType === 'GIFT_CARD' ? 'Required for gift cards.' : 'Leave empty for no expiry.'}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="E.g. 30"
                  required={guestProductForm.productType === 'GIFT_CARD'}
                  value={guestProductForm.validityDays}
                  onChange={(e) => setGuestProductForm({ ...guestProductForm, validityDays: e.target.value })}
                />
              </Field>
              {guestProductForm.productType === 'PACK' && (
                <Field
                  label="Quantity *"
                  hint="Required for packs. Price = (service type gross sum) × this number."
                >
                  <input
                    type="number"
                    min="2"
                    step="1"
                    placeholder="E.g. 10"
                    required={guestProductForm.productType === 'PACK'}
                    value={guestProductForm.usageLimit}
                    onChange={(e) => setGuestProductForm({ ...guestProductForm, usageLimit: e.target.value })}
                  />
                </Field>
              )}
              <Field label="Description" hint="Shown in the guest mobile wallet buy screen.">
                <textarea
                  rows={3}
                  placeholder="Add a description (optional)"
                  value={guestProductForm.description}
                  onChange={(e) => setGuestProductForm({ ...guestProductForm, description: e.target.value })}
                />
              </Field>
              <Field label="Promo text" hint="Shown as a badge above the Buy button (e.g. 'Best value', 'Available now'). Leave empty to hide.">
                <textarea
                  rows={3}
                  maxLength={120}
                  placeholder="Add promo text (optional)"
                  value={guestProductForm.promoText}
                  onChange={(e) => setGuestProductForm({ ...guestProductForm, promoText: e.target.value })}
                />
              </Field>
              <Field label="Visible in guest app" hint="Show this card in the guest app.">
                <div className="cards-product-toggle" role="group" aria-label="Visible in guest app">
                  <button type="button" className={!guestProductForm.guestVisible ? 'cards-product-toggle-btn active' : 'cards-product-toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, guestVisible: false })}>OFF</button>
                  <button type="button" className={guestProductForm.guestVisible ? 'cards-product-toggle-btn active' : 'cards-product-toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, guestVisible: true })}>ON</button>
                </div>
              </Field>
              <Field label="Requires booking slot" hint="Only turn this on if the guest should choose a slot during checkout. Most memberships and packs should keep this OFF.">
                <div className="cards-product-toggle" role="group" aria-label="Requires booking slot">
                  <button
                    type="button"
                    className={!guestProductForm.bookable ? 'cards-product-toggle-btn active' : 'cards-product-toggle-btn'}
                    onClick={() => setGuestProductForm({ ...guestProductForm, bookable: false })}
                    disabled={guestProductForm.productType === 'GIFT_CARD'}
                  >
                    OFF
                  </button>
                  <button
                    type="button"
                    className={guestProductForm.bookable ? 'cards-product-toggle-btn active' : 'cards-product-toggle-btn'}
                    onClick={() => setGuestProductForm({ ...guestProductForm, bookable: true })}
                    disabled={guestProductForm.productType === 'GIFT_CARD'}
                  >
                    ON
                  </button>
                </div>
              </Field>
              {guestProductForm.productType === 'MEMBERSHIP' && (
                <Field label="Auto-renew" hint="Available for memberships. Guests can later change this in their wallet.">
                  <div className="cards-product-toggle" role="group" aria-label="Auto-renew">
                    <button type="button" className={!guestProductForm.autoRenews ? 'cards-product-toggle-btn active' : 'cards-product-toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, autoRenews: false })}>OFF</button>
                    <button type="button" className={guestProductForm.autoRenews ? 'cards-product-toggle-btn active' : 'cards-product-toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, autoRenews: true })}>ON</button>
                  </div>
                </Field>
              )}
              <div className="form-actions full-span booking-side-panel-footer cards-product-modal-footer">
                <div className="cards-product-modal-footer-actions">
                  <button type="submit" className="gapp-primary-button" disabled={savingGuestProduct}>
                    <GuestConfigSaveIcon />
                    {savingGuestProduct ? t('formSaving') : editingGuestProductId ? t('formSaveChanges') : locale === 'sl' ? 'Ustvari kartico' : 'Create card'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
})
