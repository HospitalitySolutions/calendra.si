import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { SessionType as SessionTypeT } from '../lib/types'
import { EmptyState, Field, PageHeader } from '../components/ui'
import { useToast } from '../components/Toast'
import { currency } from '../lib/format'
import { useLocale } from '../locale'

const SESSION_TYPES_SUBTAB_TRANSACTION = 'transaction-services'

type GuestAdminProductType = 'CLASS_TICKET' | 'PACK' | 'MEMBERSHIP'

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
}

const ADMIN_GUEST_PRODUCT_TYPES: GuestAdminProductType[] = ['PACK', 'MEMBERSHIP', 'CLASS_TICKET']

const CARD_PRODUCT_TYPE_LABELS: Record<GuestAdminProductType, string> = {
  CLASS_TICKET: 'Class ticket',
  PACK: 'Pack',
  MEMBERSHIP: 'Membership',
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
})

const normalizeGuestProductFormForType = (
  current: GuestProductFormState,
  nextProductType: GuestAdminProductType,
): GuestProductFormState => ({
  ...current,
  productType: nextProductType,
  usageLimit: nextProductType === 'CLASS_TICKET' ? '1' : current.usageLimit,
  sessionTypeId: nextProductType === 'CLASS_TICKET' ? current.sessionTypeId : current.sessionTypeId,
  autoRenews: nextProductType === 'MEMBERSHIP' ? current.autoRenews : false,
})

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

function syncGuestProductPriceFromSessionTypes(form: GuestProductFormState, sessionTypes: SessionTypeT[]): GuestProductFormState {
  if (!guestProductTypeUsesAutoPrice(form.productType)) return form
  const suggested = suggestedGuestCardGross(form.productType, form.sessionTypeId, form.usageLimit, sessionTypes)
  return {
    ...form,
    priceGross: suggested != null ? suggested.toFixed(2) : '0.00',
  }
}

const productTypeLabel = (productType: GuestAdminProductType) => CARD_PRODUCT_TYPE_LABELS[productType] || productType

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
  onFilteredCountChange?: (filteredCount: number) => void
}

export const CardsMembershipsSection = forwardRef<CardsMembershipsSectionHandle, CardsMembershipsSectionProps>(
  function CardsMembershipsSection({ sessionTypes, searchQuery, onFilteredCountChange }, ref) {
  const me = getStoredUser()
  const isAdmin = me?.role === 'ADMIN'
  const { t } = useLocale()
  const { showToast } = useToast()
  const [guestProducts, setGuestProducts] = useState<GuestAdminProduct[]>([])
  const [openProductMenuId, setOpenProductMenuId] = useState<number | null>(null)
  const [showGuestProductModal, setShowGuestProductModal] = useState(false)
  const [editingGuestProductId, setEditingGuestProductId] = useState<number | null>(null)
  const [savingGuestProduct, setSavingGuestProduct] = useState(false)
  const [guestProductForm, setGuestProductForm] = useState<GuestProductFormState>(defaultGuestProductForm)

  const loadGuestProducts = useCallback(async () => {
    if (!isAdmin) return
    try {
      const res = await api.get('/guest/admin/products').catch(() => ({ data: [] }))
      setGuestProducts(res.data || [])
    } catch {
      setGuestProducts([])
    }
  }, [isAdmin])

  useEffect(() => {
    void loadGuestProducts()
  }, [loadGuestProducts])

  useEffect(() => {
    if (openProductMenuId == null) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.clients-card-menu-wrap')) return
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

  const openNewGuestProductModal = useCallback(() => {
    setOpenProductMenuId(null)
    setEditingGuestProductId(null)
    setGuestProductForm(defaultGuestProductForm())
    setShowGuestProductModal(true)
  }, [])

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
        },
        product.productType,
      ),
    )
    setShowGuestProductModal(true)
  }

  const submitGuestProduct = async (e: FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    if (guestProductForm.productType === 'PACK') {
      if (!guestProductForm.sessionTypeId.trim()) {
        window.alert('Pack cards must be linked to a service type.')
        return
      }
      if (parsePositiveIntegerInput(guestProductForm.usageLimit) == null) {
        window.alert('Pack cards must have a quantity.')
        return
      }
    }
    const isClassTicket = guestProductForm.productType === 'CLASS_TICKET'
    const payload = {
      name: guestProductForm.name.trim(),
      description: guestProductForm.description.trim(),
      promoText: guestProductForm.promoText.trim() || null,
      productType: guestProductForm.productType,
      priceGross: Number.parseFloat(guestProductForm.priceGross || '0') || 0,
      currency: guestProductForm.currency.trim().toUpperCase() || 'EUR',
      active: guestProductForm.active,
      guestVisible: guestProductForm.guestVisible,
      bookable: guestProductForm.bookable,
      usageLimit: isClassTicket ? 1 : parsePositiveIntegerInput(guestProductForm.usageLimit),
      validityDays: parsePositiveIntegerInput(guestProductForm.validityDays),
      autoRenews: guestProductForm.productType === 'MEMBERSHIP' ? guestProductForm.autoRenews : false,
      sortOrder: Number.parseInt(guestProductForm.sortOrder || '0', 10) || 0,
      sessionTypeId: guestProductForm.sessionTypeId ? Number.parseInt(guestProductForm.sessionTypeId, 10) : null,
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
      await loadGuestProducts()
      showToast('success', 'Card deleted.')
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Failed to delete card.')
    }
  }

  const filteredGuestProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return guestProducts
    return guestProducts.filter((p) => {
      const vis = p.guestVisible ? 'visible' : 'hidden'
      const st = p.active ? 'active' : 'archived'
      const validityLabel = p.validityDays != null ? `${p.validityDays} days` : 'no expiry'
      const hay = [
        p.name,
        productTypeLabel(p.productType),
        p.sessionTypeName || '',
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
  }, [guestProducts, searchQuery])

  useEffect(() => {
    onFilteredCountChange?.(filteredGuestProducts.length)
  }, [filteredGuestProducts.length, onFilteredCountChange])

  if (!isAdmin) return null

  return (
    <>
      {guestProducts.length === 0 ? (
        <EmptyState title="No cards yet" text="Create your first membership or visit pack to start selling it in the guest app wallet." />
      ) : filteredGuestProducts.length === 0 ? (
        <EmptyState title={t('calendarFilterSearchNoResults')} text={t('sessionTypesSearchNoMatchesText')} />
      ) : (
        <div className="clients-list-shell">
          <div className="clients-mobile-list">
            {filteredGuestProducts.map((product) => (
              <article
                key={product.id}
                className="clients-mobile-card"
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
                  <div className="clients-name-cell">
                    <div className="clients-name-stack">
                      <span className="clients-name">{product.name}</span>
                      <span className="clients-id">{guestProductWalletSubtitle(product)}</span>
                    </div>
                  </div>
                  <div className="clients-card-menu-wrap">
                    <button
                      type="button"
                      className="secondary clients-card-menu-trigger"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenProductMenuId((prev) => (prev === product.id ? null : product.id))
                      }}
                      aria-label="Card actions"
                      aria-expanded={openProductMenuId === product.id}
                    >
                      ...
                    </button>
                    {openProductMenuId === product.id && (
                      <div className="clients-card-menu-popover" role="dialog" aria-label="Card actions">
                        <button
                          type="button"
                          className="danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenProductMenuId(null)
                            void deleteGuestProduct(product)
                          }}
                        >
                          {t('formDelete')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="clients-mobile-meta">
                  <div>
                    <span>{t('sessionTypesCardsColType')}</span>
                    <strong>{productTypeLabel(product.productType)}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardsColServiceType')}</span>
                    <strong>{product.sessionTypeName || 'Any service type'}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardsColPrice')}</span>
                    <strong>{currency(product.priceGross)}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardsColValidity')}</span>
                    <strong>{product.validityDays ? `${product.validityDays} days` : 'No expiry'}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardsColUses')}</span>
                    <strong>{product.usageLimit ?? 'Unlimited'}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardsColGuestApp')}</span>
                    <strong>{product.guestVisible ? 'Visible' : 'Hidden'}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span>{t('sessionTypesCardsColStatus')}</span>
                    <strong>{product.active ? 'Active' : 'Archived'}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="simple-table-wrap clients-table-wrap clients-table-desktop session-types-table-wrap">
            <table className="clients-table session-types-table">
              <thead>
                <tr>
                  <th>{t('employeesTableName')}</th>
                  <th>{t('sessionTypesCardsColType')}</th>
                  <th>{t('sessionTypesCardsColServiceType')}</th>
                  <th>{t('sessionTypesCardsColPrice')}</th>
                  <th>{t('sessionTypesCardsColValidity')}</th>
                  <th>{t('sessionTypesCardsColUses')}</th>
                  <th>{t('sessionTypesCardsColGuestApp')}</th>
                  <th>{t('sessionTypesCardsColStatus')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredGuestProducts.map((product) => (
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
                    <td>
                      <div className="clients-name-cell">
                        <div className="clients-name-stack">
                          <span className="clients-name">{product.name}</span>
                          <span className="clients-id">{guestProductWalletSubtitle(product)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="clients-muted">{productTypeLabel(product.productType)}</td>
                    <td className="clients-muted">{product.sessionTypeName || 'Any service type'}</td>
                    <td className="clients-muted">{currency(product.priceGross)}</td>
                    <td className="clients-muted">{product.validityDays ? `${product.validityDays} days` : 'No expiry'}</td>
                    <td className="clients-muted">{product.usageLimit ?? 'Unlimited'}</td>
                    <td className="clients-muted">{product.guestVisible ? 'Visible' : 'Hidden'}</td>
                    <td className="clients-muted">{product.active ? 'Active' : 'Archived'}</td>
                    <td className="clients-actions">
                      <div className="clients-actions-inner">
                        <button
                          type="button"
                          className="secondary clients-action-btn clients-action-btn-danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteGuestProduct(product)
                          }}
                        >
                          {t('formDelete')}
                        </button>
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
          className="modal-backdrop booking-side-panel-backdrop"
          onClick={() => {
            if (!savingGuestProduct) {
              setShowGuestProductModal(false)
              setEditingGuestProductId(null)
            }
          }}
          role="presentation"
        >
          <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title={editingGuestProductId ? 'Edit card' : 'New card'}
                actions={
                  <button
                    type="button"
                    className="secondary booking-side-panel-close"
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
                }
              />
            </div>
            <form className="form-grid booking-side-panel-body" onSubmit={submitGuestProduct}>
              <Field label="Name">
                <input required value={guestProductForm.name} onChange={(e) => setGuestProductForm({ ...guestProductForm, name: e.target.value })} />
              </Field>
              <Field label="Card type">
                <select
                  value={guestProductForm.productType}
                  onChange={(e) => {
                    const pt = e.target.value as GuestAdminProductType
                    setGuestProductForm((current) =>
                      syncGuestProductPriceFromSessionTypes(normalizeGuestProductFormForType(current, pt), sessionTypes),
                    )
                  }}
                >
                  {ADMIN_GUEST_PRODUCT_TYPES.map((productType) => (
                    <option key={productType} value={productType}>{productTypeLabel(productType)}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Price gross"
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
              <Field label="Currency">
                <input maxLength={3} value={guestProductForm.currency} onChange={(e) => setGuestProductForm({ ...guestProductForm, currency: e.target.value.toUpperCase() })} />
              </Field>
              <Field
                label="Service type"
                hint={
                  guestProductForm.productType === 'CLASS_TICKET'
                    ? 'Required. Price is derived from linked transaction services on this type.'
                    : guestProductForm.productType === 'PACK'
                      ? 'Required. Price is derived from linked transaction services × quantity.'
                      : 'Optional. When selected, this card can only be used for that service type.'
                }
              >
                <select
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
              {guestProductTypeUsesAutoPrice(guestProductForm.productType) &&
                guestProductForm.sessionTypeId.trim() !== '' &&
                sessionUnitGrossSum(sessionTypes.find((t) => String(t.id) === guestProductForm.sessionTypeId.trim())) == null && (
                <p className="muted" style={{ gridColumn: '1 / -1' }}>
                  This service type has no linked transaction services (or prices are missing). Configure them under{' '}
                  <Link to={`/session-types?subtab=${SESSION_TYPES_SUBTAB_TRANSACTION}`} className="linkish-btn" style={{ display: 'inline' }}>
                    Transaction services
                  </Link>
                  .
                </p>
              )}
              <Field label="Sort order">
                <input type="number" step="1" value={guestProductForm.sortOrder} onChange={(e) => setGuestProductForm({ ...guestProductForm, sortOrder: e.target.value })} />
              </Field>
              <Field label="Validity (days)" hint="Leave empty for no expiry.">
                <input type="number" min="1" step="1" value={guestProductForm.validityDays} onChange={(e) => setGuestProductForm({ ...guestProductForm, validityDays: e.target.value })} />
              </Field>
              {guestProductForm.productType !== 'CLASS_TICKET' && (
                <Field
                  label="Quantity"
                  hint={
                    guestProductForm.productType === 'PACK'
                      ? 'Required for packs. Price = (service type gross sum) × this number.'
                      : 'Leave empty for unlimited quantity.'
                  }
                >
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required={guestProductForm.productType === 'PACK'}
                    value={guestProductForm.usageLimit}
                    onChange={(e) => setGuestProductForm({ ...guestProductForm, usageLimit: e.target.value })}
                  />
                </Field>
              )}
              <Field label="Description" hint="Shown in the guest mobile wallet buy screen.">
                <textarea rows={4} value={guestProductForm.description} onChange={(e) => setGuestProductForm({ ...guestProductForm, description: e.target.value })} />
              </Field>
              <Field label="Promo text" hint="Shown as a badge above the Buy button (e.g. 'Best value', 'Available now'). Leave empty to hide.">
                <input
                  type="text"
                  maxLength={120}
                  value={guestProductForm.promoText}
                  onChange={(e) => setGuestProductForm({ ...guestProductForm, promoText: e.target.value })}
                />
              </Field>
              <Field label="Visible in guest app">
                <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                  <button type="button" className={!guestProductForm.guestVisible ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, guestVisible: false })}>OFF</button>
                  <button type="button" className={guestProductForm.guestVisible ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, guestVisible: true })}>ON</button>
                </div>
              </Field>
              <Field label="Active">
                <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                  <button type="button" className={!guestProductForm.active ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, active: false })}>OFF</button>
                  <button type="button" className={guestProductForm.active ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, active: true })}>ON</button>
                </div>
              </Field>
              <Field label="Requires booking slot" hint="Only turn this on if the guest should choose a slot during checkout. Most memberships and packs should keep this OFF.">
                <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                  <button type="button" className={!guestProductForm.bookable ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, bookable: false })}>OFF</button>
                  <button type="button" className={guestProductForm.bookable ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, bookable: true })}>ON</button>
                </div>
              </Field>
              {guestProductForm.productType === 'MEMBERSHIP' && (
                <Field label="Auto-renew" hint="Available for memberships. Guests can later change this in their wallet.">
                  <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                    <button type="button" className={!guestProductForm.autoRenews ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, autoRenews: false })}>OFF</button>
                    <button type="button" className={guestProductForm.autoRenews ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, autoRenews: true })}>ON</button>
                  </div>
                </Field>
              )}
              <div className="form-actions full-span booking-side-panel-footer">
                <button type="submit" disabled={savingGuestProduct}>{savingGuestProduct ? 'Saving…' : (editingGuestProductId ? 'Save changes' : 'Create card')}</button>
                <button type="button" className="secondary" disabled={savingGuestProduct} onClick={() => { setShowGuestProductModal(false); setEditingGuestProductId(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
})
