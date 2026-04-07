import type { OpenBill, PaymentMethod } from '../../lib/types'
import { getPayTypePopupPlacement, paymentTypeBadgeLabel, paymentTypeIcon } from './billingSupport'

type CommonProps = {
  openBill: OpenBill
  paymentMethods: PaymentMethod[]
  isOpen: boolean
  placement: 'up' | 'down'
  onPlacementChange: (placement: 'up' | 'down') => void
  onOpenChange: (nextOpen: boolean) => void
  onSelect: (methodId: number) => void
}

function togglePicker(
  eventTarget: HTMLElement,
  openBillId: number,
  paymentMethods: PaymentMethod[],
  isOpen: boolean,
  onPlacementChange: (placement: 'up' | 'down') => void,
  onOpenChange: (nextOpen: boolean) => void,
) {
  if (isOpen) {
    onOpenChange(false)
    return
  }
  onPlacementChange(getPayTypePopupPlacement(eventTarget, paymentMethods.length))
  onOpenChange(true)
}

function PaymentMethodPopup({
  openBill,
  paymentMethods,
  isOpen,
  placement,
  onSelect,
  onOpenChange,
}: Pick<CommonProps, 'openBill' | 'paymentMethods' | 'isOpen' | 'placement' | 'onSelect' | 'onOpenChange'>) {
  if (!isOpen) return null
  return (
    <div
      className={`billing-open-paytype-popup ${placement === 'up' ? 'billing-open-paytype-popup--up' : ''}`}
      role="dialog"
      aria-label="Select payment method"
    >
      {paymentMethods.map((method) => (
        <label key={method.id} className="billing-open-paytype-option">
          <input
            type="radio"
            name={`open-bill-paytype-${openBill.id}`}
            checked={openBill.paymentMethod?.id === method.id}
            onChange={() => {
              onSelect(method.id)
              onOpenChange(false)
            }}
          />
          <span>{method.name}</span>
        </label>
      ))}
    </div>
  )
}

export function BillingDesktopPaymentMethodPicker({
  openBill,
  paymentMethods,
  isOpen,
  placement,
  onPlacementChange,
  onOpenChange,
  onSelect,
}: CommonProps) {
  return (
    <>
      <div className="billing-open-paytype-wrap">
        <button
          type="button"
          className="billing-open-paytype-trigger"
          onClick={(e) => togglePicker(e.currentTarget, openBill.id, paymentMethods, isOpen, onPlacementChange, onOpenChange)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label="Select payment method"
          title="Select payment method"
        >
          {paymentTypeIcon(openBill.paymentMethod?.paymentType)}
        </button>
        <PaymentMethodPopup
          openBill={openBill}
          paymentMethods={paymentMethods}
          isOpen={isOpen}
          placement={placement}
          onSelect={onSelect}
          onOpenChange={onOpenChange}
        />
      </div>
      <select
        className="billing-open-payment-select"
        value={openBill.paymentMethod?.id ?? ''}
        onChange={(e) => onSelect(Number(e.target.value))}
      >
        <option value="">Select payment method</option>
        {paymentMethods.map((method) => (
          <option key={method.id} value={method.id}>{method.name}</option>
        ))}
      </select>
    </>
  )
}

export function BillingMobilePaymentMethodPicker({
  openBill,
  paymentMethods,
  isOpen,
  placement,
  onPlacementChange,
  onOpenChange,
  onSelect,
}: CommonProps) {
  return (
    <div className="billing-open-paytype-wrap">
      <button
        type="button"
        className={`billing-open-mobile-paytype-pill billing-open-mobile-paytype-pill--${(openBill.paymentMethod?.paymentType || 'none').toLowerCase()}`}
        onClick={(e) => togglePicker(e.currentTarget, openBill.id, paymentMethods, isOpen, onPlacementChange, onOpenChange)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Select payment method"
        title="Select payment method"
      >
        {paymentTypeBadgeLabel(openBill.paymentMethod?.paymentType)}
      </button>
      <PaymentMethodPopup
        openBill={openBill}
        paymentMethods={paymentMethods}
        isOpen={isOpen}
        placement={placement}
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />
    </div>
  )
}
