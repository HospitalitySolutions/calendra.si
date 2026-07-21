export type BookingPayeeType = 'PERSON' | 'COMPANY'

export type BookingPayeeDraft = {
  clientId: number
  payeeType: BookingPayeeType
  companyId: number | null
  customData?: boolean
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  companyName?: string | null
  address?: string | null
  city?: string | null
  postalCode?: string | null
  vatId?: string | null
  companyEmail?: string | null
}
