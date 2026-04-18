import { Field, PageHeader } from '../../components/ui'
import type { BillingPageCopy } from './billingSupport'

type Props = {
  open: boolean
  copy: BillingPageCopy
  companyName: string
  companyEmail: string
  companyTelephone: string
  creating: boolean
  onCompanyNameChange: (value: string) => void
  onCompanyEmailChange: (value: string) => void
  onCompanyTelephoneChange: (value: string) => void
  onCreate: () => void
  onClose: () => void
}

export function BillingAddCompanyModal({
  open,
  copy,
  companyName,
  companyEmail,
  companyTelephone,
  creating,
  onCompanyNameChange,
  onCompanyEmailChange,
  onCompanyTelephoneChange,
  onCreate,
  onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <PageHeader title={copy.newCompanyTitle} subtitle={copy.newCompanySubtitle} />
        <div className="form-grid">
          <Field label={copy.companyName}>
            <input value={companyName} onChange={(e) => onCompanyNameChange(e.target.value)} placeholder={copy.companyName} />
          </Field>
          <Field label={copy.email}>
            <input type="email" value={companyEmail} onChange={(e) => onCompanyEmailChange(e.target.value)} placeholder={copy.emailOptional} />
          </Field>
          <Field label={copy.telephone}>
            <input value={companyTelephone} onChange={(e) => onCompanyTelephoneChange(e.target.value)} placeholder={copy.telephoneOptional} />
          </Field>
          <div className="form-actions full-span">
            <button type="button" onClick={onCreate} disabled={creating || !companyName.trim()}>
              {creating ? copy.creating : copy.create}
            </button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
