import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useAuthenticatedUser } from '../../authUserContext'
import { useToast } from '../../components/Toast'

export type LegalEntityResponse = {
  id: number
  name: string
  address?: string | null
  postalCode?: string | null
  city?: string | null
  country: string
  taxNumber?: string | null
  vatId?: string | null
  iban?: string | null
  bic?: string | null
  email?: string | null
  telephone?: string | null
  currency: string
  fiscalEnvironment: 'TEST' | 'PROD' | string
  softwareSupplierTaxNumber?: string | null
  certificatePasswordConfigured: boolean
  active: boolean
  assignedToCurrentUnit: boolean
  defaultForCurrentUnit: boolean
  defaultInvoiceSeriesId?: number | null
  assignments: Array<{
    companyId: number
    companyName: string
    defaultIssuer: boolean
    active: boolean
    defaultInvoiceSeriesId?: number | null
  }>
}

export type InvoiceSeriesResponse = {
  id: number
  legalEntityId: number
  legalEntityName: string
  companyId?: number | null
  companyName?: string | null
  locationId?: number | null
  locationName?: string | null
  name: string
  nextNumber: string
  initialNumber: string
  resetPolicy: 'NONE' | 'YEARLY' | string
  lastResetYear?: number | null
  businessPremiseCode?: string | null
  electronicDeviceId?: string | null
  active: boolean
  sharedAcrossUnits: boolean
  defaultForCurrentUnit: boolean
}

type LocationOption = {
  id: number
  name: string
  city?: string | null
  active?: boolean
}
type CertificateMeta = {
  uploaded: boolean
  fileName?: string | null
  contentType?: string | null
  uploadedAt?: string | null
  expiresAt?: string | null
}

type IssuerDraft = {
  name: string
  address: string
  postalCode: string
  city: string
  country: string
  taxNumber: string
  vatId: string
  iban: string
  bic: string
  email: string
  telephone: string
  currency: string
  fiscalEnvironment: string
  softwareSupplierTaxNumber: string
  certificatePassword: string
  active: boolean
}

type IssuerTextFieldKey = Exclude<keyof IssuerDraft, 'active'>

type SeriesDraft = {
  legalEntityId: number | null
  companyId: number | null
  locationId: number | null
  name: string
  nextNumber: string
  initialNumber: string
  resetPolicy: string
  businessPremiseCode: string
  electronicDeviceId: string
  active: boolean
  defaultForCurrentUnit: boolean
}

type BillingIssuersSectionProps = {
  locale: 'sl' | 'en' | string
  mode?: 'full' | 'companies'
  allowMultipleCompanies?: boolean
  onIssuersChanged?: () => void | Promise<void>
}

const emptyIssuer = (): IssuerDraft => ({
  name: '',
  address: '',
  postalCode: '',
  city: '',
  country: 'SI',
  taxNumber: '',
  vatId: '',
  iban: '',
  bic: '',
  email: '',
  telephone: '',
  currency: 'EUR',
  fiscalEnvironment: 'TEST',
  softwareSupplierTaxNumber: '',
  certificatePassword: '',
  active: true,
})

const emptySeries = (
  legalEntityId: number | null,
  companyId: number | null,
): SeriesDraft => ({
  legalEntityId,
  companyId,
  locationId: null,
  name: '',
  nextNumber: '1',
  initialNumber: '1',
  resetPolicy: 'NONE',
  businessPremiseCode: '',
  electronicDeviceId: '',
  active: true,
  defaultForCurrentUnit: true,
})

export function BillingIssuersSection({
  locale,
  mode = 'full',
  allowMultipleCompanies = true,
  onIssuersChanged,
}: BillingIssuersSectionProps) {
  const sl = locale === 'sl'
  const companiesOnly = mode === 'companies'
  const me = useAuthenticatedUser()
  const { showToast } = useToast()
  const [issuers, setIssuers] = useState<LegalEntityResponse[]>([])
  const [series, setSeries] = useState<InvoiceSeriesResponse[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedIssuerId, setSelectedIssuerId] = useState<number | null>(null)
  const [editingIssuerId, setEditingIssuerId] = useState<number | null>(null)
  const [editingSeriesId, setEditingSeriesId] = useState<number | null>(null)
  const [issuerDraft, setIssuerDraft] = useState<IssuerDraft>(emptyIssuer())
  const [seriesDraft, setSeriesDraft] = useState<SeriesDraft>(
    emptySeries(null, me.activeUnitId ?? me.companyId ?? null),
  )
  const [busy, setBusy] = useState(false)
  const [certificateMeta, setCertificateMeta] =
    useState<CertificateMeta | null>(null)
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const [certificateBusy, setCertificateBusy] = useState(false)

  const currentUnitId = me.activeUnitId ?? me.companyId ?? null
  const selectedIssuer = useMemo(
    () => issuers.find((x) => x.id === selectedIssuerId) ?? null,
    [issuers, selectedIssuerId],
  )
  const canAddIssuer = allowMultipleCompanies || issuers.length === 0
  const selectedSeries = useMemo(
    () => series.filter((x) => x.legalEntityId === selectedIssuerId),
    [series, selectedIssuerId],
  )

  const load = useCallback(async () => {
    const [issuerRes, seriesRes, locationRes] = await Promise.all([
      api.get('/billing/issuers'),
      companiesOnly
        ? Promise.resolve({ data: [] })
        : api.get('/billing/invoice-series'),
      companiesOnly ? Promise.resolve({ data: [] }) : api.get('/locations'),
    ])
    const nextIssuers = Array.isArray(issuerRes.data) ? issuerRes.data : []
    setIssuers(nextIssuers)
    setSeries(Array.isArray(seriesRes.data) ? seriesRes.data : [])
    setLocations(Array.isArray(locationRes.data) ? locationRes.data : [])
    setSelectedIssuerId((current) =>
      current && nextIssuers.some((x: LegalEntityResponse) => x.id === current)
        ? current
        : (nextIssuers.find(
              (x: LegalEntityResponse) => x.defaultForCurrentUnit,
            )?.id ??
            nextIssuers[0]?.id ??
            null),
    )
  }, [companiesOnly])

  const loadAndNotify = async () => {
    await load()
    await onIssuersChanged?.()
  }

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setCertificateFile(null)
    if (
      companiesOnly ||
      !selectedIssuerId ||
      !selectedIssuer?.assignedToCurrentUnit
    ) {
      setCertificateMeta(null)
      return
    }
    let cancelled = false
    api
      .get('/fiscal/certificate/meta', {
        params: { legalEntityId: selectedIssuerId },
      })
      .then(({ data }) => {
        if (!cancelled) setCertificateMeta(data || { uploaded: false })
      })
      .catch(() => {
        if (!cancelled) setCertificateMeta(null)
      })
    return () => {
      cancelled = true
    }
  }, [companiesOnly, selectedIssuerId, selectedIssuer?.assignedToCurrentUnit])

  const uploadCertificate = async () => {
    if (!selectedIssuerId || !certificateFile || certificateBusy) return
    setCertificateBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', certificateFile)
      const { data } = await api.post('/fiscal/certificate', formData, {
        params: { legalEntityId: selectedIssuerId },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setCertificateMeta(
        data || { uploaded: true, fileName: certificateFile.name },
      )
      setCertificateFile(null)
      showToast(
        'success',
        sl ? 'Fiskalno potrdilo je naloženo.' : 'Fiscal certificate uploaded.',
      )
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message ||
          (sl
            ? 'Potrdila ni bilo mogoče naložiti.'
            : 'Could not upload the certificate.'),
      )
    } finally {
      setCertificateBusy(false)
    }
  }

  const removeCertificate = async () => {
    if (!selectedIssuerId || certificateBusy) return
    setCertificateBusy(true)
    try {
      await api.delete('/fiscal/certificate', {
        params: { legalEntityId: selectedIssuerId },
      })
      setCertificateMeta({ uploaded: false })
      setCertificateFile(null)
      showToast(
        'success',
        sl ? 'Fiskalno potrdilo je odstranjeno.' : 'Fiscal certificate removed.',
      )
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message ||
          (sl
            ? 'Potrdila ni bilo mogoče odstraniti.'
            : 'Could not remove the certificate.'),
      )
    } finally {
      setCertificateBusy(false)
    }
  }

  const beginIssuer = (issuer?: LegalEntityResponse) => {
    setEditingIssuerId(issuer?.id ?? -1)
    setIssuerDraft(
      issuer
        ? {
            name: issuer.name ?? '',
            address: issuer.address ?? '',
            postalCode: issuer.postalCode ?? '',
            city: issuer.city ?? '',
            country: issuer.country ?? 'SI',
            taxNumber: issuer.taxNumber ?? '',
            vatId: issuer.vatId ?? '',
            iban: issuer.iban ?? '',
            bic: issuer.bic ?? '',
            email: issuer.email ?? '',
            telephone: issuer.telephone ?? '',
            currency: issuer.currency ?? 'EUR',
            fiscalEnvironment: issuer.fiscalEnvironment ?? 'TEST',
            softwareSupplierTaxNumber:
              issuer.softwareSupplierTaxNumber ?? '',
            certificatePassword: '',
            active: issuer.active,
          }
        : emptyIssuer(),
    )
  }

  const saveIssuer = async () => {
    if (!issuerDraft.name.trim()) {
      return showToast(
        'error',
        sl
          ? companiesOnly
            ? 'Vnesite naziv podjetja.'
            : 'Vnesite naziv izdajatelja.'
          : companiesOnly
            ? 'Enter the company name.'
            : 'Enter the issuer name.',
      )
    }
    setBusy(true)
    try {
      const payload = {
        ...issuerDraft,
        certificatePassword: issuerDraft.certificatePassword || null,
      }
      const response =
        editingIssuerId === -1
          ? await api.post('/billing/issuers', payload)
          : await api.put(`/billing/issuers/${editingIssuerId}`, payload)
      setEditingIssuerId(null)
      setSelectedIssuerId(response.data?.id ?? selectedIssuerId)
      await loadAndNotify()
      showToast(
        'success',
        sl
          ? companiesOnly
            ? 'Podjetje je shranjeno.'
            : 'Izdajatelj je shranjen.'
          : companiesOnly
            ? 'Company saved.'
            : 'Issuer saved.',
      )
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message ||
          (sl
            ? companiesOnly
              ? 'Podjetja ni bilo mogoče shraniti.'
              : 'Izdajatelja ni bilo mogoče shraniti.'
            : companiesOnly
              ? 'Could not save company.'
              : 'Could not save issuer.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const deleteIssuer = async (issuer: LegalEntityResponse) => {
    const confirmed = window.confirm(
      sl
        ? `Ali želite izbrisati podjetje »${issuer.name}«? Podjetja, ki je povezano z lokacijo, računom ali serijo, ni mogoče izbrisati.`
        : `Delete “${issuer.name}”? A company linked to a location, invoice, or series cannot be deleted.`,
    )
    if (!confirmed) return
    setBusy(true)
    try {
      await api.delete(`/billing/issuers/${issuer.id}`)
      if (selectedIssuerId === issuer.id) setSelectedIssuerId(null)
      await loadAndNotify()
      showToast(
        'success',
        sl ? 'Podjetje je izbrisano.' : 'Company deleted.',
      )
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message ||
          (sl
            ? 'Podjetja ni mogoče izbrisati, ker je že v uporabi.'
            : 'The company cannot be deleted because it is in use.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const setDefaultIssuer = async (issuer: LegalEntityResponse) => {
    if (!currentUnitId) return
    setBusy(true)
    try {
      await api.post(`/billing/issuers/${issuer.id}/assignments`, {
        companyId: currentUnitId,
        defaultIssuer: true,
        active: true,
      })
      await loadAndNotify()
      showToast(
        'success',
        sl
          ? companiesOnly
            ? 'Glavno podjetje je posodobljeno.'
            : 'Privzeti izdajatelj je posodobljen.'
          : companiesOnly
            ? 'Main company updated.'
            : 'Default issuer updated.',
      )
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message ||
          (sl
            ? 'Spremembe ni bilo mogoče shraniti.'
            : 'Could not save the change.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const toggleAssignment = async (
    issuer: LegalEntityResponse,
    unitId: number,
    assigned: boolean,
  ) => {
    setBusy(true)
    try {
      if (assigned) {
        await api.delete(
          `/billing/issuers/${issuer.id}/assignments/${unitId}`,
        )
      } else {
        await api.post(`/billing/issuers/${issuer.id}/assignments`, {
          companyId: unitId,
          defaultIssuer: false,
          active: true,
        })
      }
      await loadAndNotify()
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message ||
          (sl
            ? 'Dodelitve ni bilo mogoče spremeniti.'
            : 'Could not change assignment.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const beginSeries = (value?: InvoiceSeriesResponse) => {
    setEditingSeriesId(value?.id ?? -1)
    setSeriesDraft(
      value
        ? {
            legalEntityId: value.legalEntityId,
            companyId: value.companyId ?? null,
            locationId: value.locationId ?? null,
            name: value.name,
            nextNumber: value.nextNumber,
            initialNumber: value.initialNumber,
            resetPolicy: value.resetPolicy,
            businessPremiseCode: value.businessPremiseCode ?? '',
            electronicDeviceId: value.electronicDeviceId ?? '',
            active: value.active,
            defaultForCurrentUnit: value.defaultForCurrentUnit,
          }
        : emptySeries(selectedIssuerId, currentUnitId),
    )
  }

  const saveSeries = async () => {
    if (
      !seriesDraft.legalEntityId ||
      !seriesDraft.name.trim() ||
      !seriesDraft.nextNumber.trim()
    ) {
      return showToast(
        'error',
        sl
          ? 'Vnesite izdajatelja, naziv in naslednjo številko.'
          : 'Enter issuer, name, and next number.',
      )
    }
    setBusy(true)
    try {
      if (editingSeriesId === -1) {
        await api.post('/billing/invoice-series', seriesDraft)
      } else {
        await api.put(`/billing/invoice-series/${editingSeriesId}`, seriesDraft)
      }
      setEditingSeriesId(null)
      await loadAndNotify()
      showToast(
        'success',
        sl ? 'Serija računov je shranjena.' : 'Invoice series saved.',
      )
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message ||
          (sl
            ? 'Serije ni bilo mogoče shraniti.'
            : 'Could not save invoice series.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const issuerFormFields = (
    companiesOnly
      ? [
          ['name', sl ? 'Naziv podjetja' : 'Company name'],
          ['vatId', sl ? 'ID za DDV' : 'VAT ID'],
          ['taxNumber', sl ? 'Davčna številka' : 'Tax number'],
          ['iban', 'IBAN / TRR'],
          ['bic', 'BIC'],
          ['email', sl ? 'E-pošta' : 'Email'],
          ['telephone', sl ? 'Telefon' : 'Phone'],
          ['address', sl ? 'Naslov' : 'Address'],
          ['postalCode', sl ? 'Poštna številka' : 'Postal code'],
          ['city', sl ? 'Mesto' : 'City'],
          ['country', sl ? 'Država' : 'Country'],
          ['currency', sl ? 'Valuta' : 'Currency'],
        ]
      : [
          ['name', sl ? 'Naziv' : 'Name'],
          ['vatId', sl ? 'ID za DDV' : 'VAT ID'],
          ['taxNumber', sl ? 'Davčna številka' : 'Tax number'],
          ['iban', 'IBAN / TRR'],
          ['bic', 'BIC'],
          ['email', sl ? 'E-pošta' : 'Email'],
          ['telephone', sl ? 'Telefon' : 'Phone'],
          ['address', sl ? 'Naslov' : 'Address'],
          ['postalCode', sl ? 'Poštna številka' : 'Postal code'],
          ['city', sl ? 'Mesto' : 'City'],
          ['country', sl ? 'Država' : 'Country'],
          ['currency', sl ? 'Valuta' : 'Currency'],
          [
            'softwareSupplierTaxNumber',
            sl
              ? 'Davčna št. dobavitelja programske opreme'
              : 'Software supplier tax number',
          ],
          [
            'certificatePassword',
            sl
              ? 'Geslo certifikata (prazno = brez spremembe)'
              : 'Certificate password (blank = unchanged)',
          ],
        ]) as Array<[IssuerTextFieldKey, string]>

  return (
    <div
      className={`billing-issuer-settings${companiesOnly ? ' companies-only' : ''}`}
    >
      <style>{`
        .billing-issuer-settings{display:grid;gap:18px}.billing-issuer-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center}.billing-issuer-toolbar h3,.billing-issuer-toolbar h4{margin:0}.billing-issuer-toolbar .muted{margin:5px 0 0}
        .billing-issuer-grid{display:grid;grid-template-columns:minmax(230px,.72fr) minmax(0,1.6fr);gap:16px}.billing-issuer-list,.billing-issuer-detail{border:1px solid #e1e9f3;border-radius:18px;background:#fff;padding:16px}
        .billing-issuer-item{width:100%;display:flex;justify-content:space-between;gap:10px;text-align:left;border:1px solid transparent;background:#f7f9fc;border-radius:12px;padding:12px;margin-bottom:8px;color:inherit}.billing-issuer-item.active{border-color:#7cbcf0;background:#eef7ff}
        .billing-issuer-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.billing-issuer-badge{font-size:12px;padding:3px 8px;border-radius:999px;background:#eaf1f8}.billing-issuer-badge.primary{background:#dff3e8;color:#14633b}
        .billing-issuer-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.billing-issuer-fields label{display:grid;gap:6px;font-size:13px}.billing-issuer-fields input,.billing-issuer-fields select{min-height:40px;border:1px solid #ccd7e5;border-radius:10px;padding:8px 10px}.billing-issuer-fields .wide{grid-column:1/-1}
        .billing-issuer-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}.billing-series-table{display:grid;gap:8px;margin-top:12px}.billing-series-row{display:grid;grid-template-columns:1.4fr .8fr .8fr auto;gap:10px;align-items:center;padding:11px;border:1px solid #e1e9f3;border-radius:12px}.billing-unit-assignment{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.billing-unit-assignment button{border:1px solid #ccd7e5;border-radius:999px;background:#fff;padding:7px 10px}.billing-unit-assignment button.active{background:#eaf6ff;border-color:#7cbcf0}
        .billing-certificate-box{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:16px 0;padding:13px;border:1px solid #dfe8f2;border-radius:14px;background:#f8fbfe}.billing-certificate-box h4{margin:0 0 4px}.billing-certificate-box p{margin:0}.billing-certificate-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}.billing-certificate-actions input{max-width:250px}.billing-certificate-actions .danger,.billing-issuer-actions .danger{color:#a12b2b;border-color:#fecaca;background:#fff7f7}
        .billing-issuer-settings.companies-only{gap:14px}.billing-issuer-settings.companies-only .billing-issuer-grid{grid-template-columns:minmax(250px,.9fr) minmax(0,1.45fr)}
        @media(max-width:900px){.billing-issuer-grid,.billing-issuer-settings.companies-only .billing-issuer-grid{grid-template-columns:1fr}.billing-issuer-fields{grid-template-columns:1fr}.billing-series-row{grid-template-columns:1fr 1fr}.billing-issuer-fields .wide{grid-column:auto}.billing-certificate-box{align-items:flex-start;flex-direction:column}.billing-certificate-actions{justify-content:flex-start;width:100%}.billing-issuer-toolbar{align-items:flex-start}.billing-issuer-toolbar>button{flex:0 0 auto}}
      `}</style>
      <div className="billing-issuer-toolbar">
        <div>
          <h3>
            {sl
              ? companiesOnly
                ? 'Podjetja za izdajo računov'
                : 'Izdajatelji in številčenje'
              : companiesOnly
                ? 'Companies used for invoicing'
                : 'Issuers and numbering'}
          </h3>
          <p className="muted">
            {sl
              ? companiesOnly
                ? 'Dodajte pravne osebe, ki jih lahko povežete z eno ali več lokacijami.'
                : 'Ločite pravno osebo, poslovno enoto, lokacijo in serijo računov.'
              : companiesOnly
                ? 'Add legal entities that can be connected to one or more locations.'
                : 'Separate the legal issuer, operating unit, location, and invoice series.'}
          </p>
        </div>
        {canAddIssuer && (
          <button
            type="button"
            className="billing-primary-button"
            onClick={() => beginIssuer()}
            disabled={busy}
          >
            {sl
              ? companiesOnly
                ? '+ Novo podjetje'
                : 'Nov izdajatelj'
              : companiesOnly
                ? '+ New company'
                : 'New issuer'}
          </button>
        )}
      </div>

      <div className="billing-issuer-grid">
        <div className="billing-issuer-list">
          {issuers.map((issuer) => (
            <button
              key={issuer.id}
              type="button"
              className={`billing-issuer-item ${issuer.id === selectedIssuerId ? 'active' : ''}`}
              onClick={() => setSelectedIssuerId(issuer.id)}
            >
              <span>
                <strong>{issuer.name}</strong>
                <span className="billing-issuer-badges">
                  {issuer.defaultForCurrentUnit && (
                    <span className="billing-issuer-badge primary">
                      {sl
                        ? companiesOnly
                          ? 'Glavno'
                          : 'Privzeti'
                        : companiesOnly
                          ? 'Main'
                          : 'Default'}
                    </span>
                  )}
                  {!issuer.active && (
                    <span className="billing-issuer-badge">
                      {sl ? 'Neaktivno' : 'Inactive'}
                    </span>
                  )}
                </span>
              </span>
              <span>›</span>
            </button>
          ))}
          {issuers.length === 0 && (
            <p className="muted">
              {sl
                ? companiesOnly
                  ? 'Dodano ni še nobeno podjetje.'
                  : 'Ni izdajateljev.'
                : companiesOnly
                  ? 'No companies have been added yet.'
                  : 'No issuers.'}
            </p>
          )}
        </div>

        <div className="billing-issuer-detail">
          {selectedIssuer ? (
            <>
              <div className="billing-issuer-toolbar">
                <div>
                  <h3>{selectedIssuer.name}</h3>
                  <p className="muted">
                    {[selectedIssuer.address, selectedIssuer.postalCode, selectedIssuer.city]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </p>
                </div>
                <div className="billing-issuer-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => beginIssuer(selectedIssuer)}
                  >
                    {sl ? 'Uredi' : 'Edit'}
                  </button>
                  {companiesOnly && !selectedIssuer.defaultForCurrentUnit && (
                    <button
                      type="button"
                      className="secondary danger"
                      disabled={busy}
                      onClick={() => void deleteIssuer(selectedIssuer)}
                    >
                      {sl ? 'Izbriši' : 'Delete'}
                    </button>
                  )}
                  {!selectedIssuer.defaultForCurrentUnit &&
                    selectedIssuer.active && (
                      <button
                        type="button"
                        className="billing-primary-button"
                        onClick={() => void setDefaultIssuer(selectedIssuer)}
                        disabled={busy}
                      >
                        {sl
                          ? companiesOnly
                            ? 'Nastavi kot glavno'
                            : 'Nastavi kot privzetega'
                          : companiesOnly
                            ? 'Make main'
                            : 'Make default'}
                      </button>
                    )}
                </div>
              </div>
              <div className="billing-issuer-badges">
                <span className="billing-issuer-badge">
                  {selectedIssuer.vatId ||
                    selectedIssuer.taxNumber ||
                    (sl ? 'Brez davčne številke' : 'No tax number')}
                </span>
                <span className="billing-issuer-badge">
                  {selectedIssuer.iban || (sl ? 'Brez TRR' : 'No IBAN')}
                </span>
                {!companiesOnly && (
                  <span className="billing-issuer-badge">
                    {selectedIssuer.fiscalEnvironment}
                  </span>
                )}
              </div>

              {!companiesOnly &&
                selectedIssuer.assignedToCurrentUnit &&
                certificateMeta !== null && (
                  <div className="billing-certificate-box">
                    <div>
                      <h4>
                        {sl
                          ? 'Fiskalno potrdilo izdajatelja'
                          : 'Issuer fiscal certificate'}
                      </h4>
                      <p className="muted">
                        {certificateMeta.uploaded
                          ? `${certificateMeta.fileName || (sl ? 'Potrdilo' : 'Certificate')}${
                              certificateMeta.expiresAt
                                ? ` · ${sl ? 'velja do' : 'expires'} ${certificateMeta.expiresAt}`
                                : ''
                            }`
                          : sl
                            ? 'Za tega izdajatelja potrdilo še ni naloženo.'
                            : 'No certificate is uploaded for this issuer.'}
                      </p>
                    </div>
                    <div className="billing-certificate-actions">
                      <input
                        type="file"
                        accept=".p12,.pfx,application/x-pkcs12"
                        onChange={(event) =>
                          setCertificateFile(event.target.files?.[0] ?? null)
                        }
                      />
                      <button
                        type="button"
                        className="secondary"
                        disabled={!certificateFile || certificateBusy}
                        onClick={() => void uploadCertificate()}
                      >
                        {certificateBusy
                          ? sl
                            ? 'Shranjevanje…'
                            : 'Saving…'
                          : sl
                            ? 'Naloži'
                            : 'Upload'}
                      </button>
                      {certificateMeta.uploaded && (
                        <button
                          type="button"
                          className="secondary danger"
                          disabled={certificateBusy}
                          onClick={() => void removeCertificate()}
                        >
                          {sl ? 'Odstrani' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {!companiesOnly && (me.units?.length ?? 0) > 1 && (
                <>
                  <h4>
                    {sl
                      ? 'Dostopne poslovne enote'
                      : 'Assigned operating units'}
                  </h4>
                  <div className="billing-unit-assignment">
                    {me.units?.map((unit) => {
                      const assignment = selectedIssuer.assignments.find(
                        (a) => a.companyId === unit.id,
                      )
                      const assigned = Boolean(assignment?.active)
                      return (
                        <button
                          type="button"
                          key={unit.id}
                          className={assigned ? 'active' : ''}
                          disabled={
                            busy ||
                            Boolean(assignment?.defaultIssuer) ||
                            (!selectedIssuer.active && !assigned)
                          }
                          title={
                            assignment?.defaultIssuer
                              ? sl
                                ? 'Najprej nastavite drugega privzetega izdajatelja v tej enoti.'
                                : 'Choose another default issuer in this unit first.'
                              : undefined
                          }
                          onClick={() =>
                            void toggleAssignment(
                              selectedIssuer,
                              unit.id,
                              assigned,
                            )
                          }
                        >
                          {assigned ? '✓ ' : '+ '}
                          {unit.name}
                          {assignment?.defaultIssuer ? ' ★' : ''}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {!companiesOnly && (
                <>
                  <div className="billing-issuer-toolbar">
                    <div>
                      <h4>{sl ? 'Serije računov' : 'Invoice series'}</h4>
                      <p className="muted">
                        {sl
                          ? 'Skupna serija deli števec med enotami; serija enote vodi ločen števec.'
                          : 'A shared series shares its counter; a unit series keeps a separate counter.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => beginSeries()}
                    >
                      {sl ? 'Nova serija' : 'New series'}
                    </button>
                  </div>
                  <div className="billing-series-table">
                    {selectedSeries.map((value) => (
                      <button
                        type="button"
                        className="billing-series-row"
                        key={value.id}
                        onClick={() => beginSeries(value)}
                      >
                        <strong>{value.name}</strong>
                        <span>
                          {sl ? 'Naslednja' : 'Next'}: {value.nextNumber}
                        </span>
                        <span>
                          {value.sharedAcrossUnits
                            ? sl
                              ? 'Skupna'
                              : 'Shared'
                            : value.locationName ||
                              value.companyName ||
                              (sl ? 'Enota' : 'Unit')}
                        </span>
                        <span>{value.defaultForCurrentUnit ? '★' : '›'}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="muted">
              {sl
                ? companiesOnly
                  ? 'Izberite podjetje.'
                  : 'Izberite izdajatelja.'
                : companiesOnly
                  ? 'Select a company.'
                  : 'Select an issuer.'}
            </p>
          )}
        </div>
      </div>

      {editingIssuerId !== null && (
        <div className="billing-issuer-detail">
          <h3>
            {editingIssuerId === -1
              ? sl
                ? companiesOnly
                  ? 'Novo podjetje'
                  : 'Nov izdajatelj'
                : companiesOnly
                  ? 'New company'
                  : 'New issuer'
              : sl
                ? companiesOnly
                  ? 'Uredi podjetje'
                  : 'Uredi izdajatelja'
                : companiesOnly
                  ? 'Edit company'
                  : 'Edit issuer'}
          </h3>
          <div className="billing-issuer-fields">
            {issuerFormFields.map(([key, label]) => (
              <label key={key} className={key === 'address' ? 'wide' : ''}>
                <span>{label}</span>
                <input
                  type={key === 'certificatePassword' ? 'password' : 'text'}
                  value={String(issuerDraft[key] ?? '')}
                  onChange={(e) =>
                    setIssuerDraft({
                      ...issuerDraft,
                      [key]: e.target.value,
                    })
                  }
                />
              </label>
            ))}
            {!companiesOnly && (
              <label>
                <span>{sl ? 'Fiskalno okolje' : 'Fiscal environment'}</span>
                <select
                  value={issuerDraft.fiscalEnvironment}
                  onChange={(e) =>
                    setIssuerDraft({
                      ...issuerDraft,
                      fiscalEnvironment: e.target.value,
                    })
                  }
                >
                  <option value="TEST">TEST</option>
                  <option value="PROD">PROD</option>
                </select>
              </label>
            )}
            <label>
              <span>{sl ? 'Aktivno' : 'Active'}</span>
              <input
                type="checkbox"
                checked={issuerDraft.active}
                onChange={(e) =>
                  setIssuerDraft({
                    ...issuerDraft,
                    active: e.target.checked,
                  })
                }
              />
            </label>
          </div>
          <div className="billing-issuer-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingIssuerId(null)}
            >
              {sl ? 'Prekliči' : 'Cancel'}
            </button>
            <button
              type="button"
              className="billing-primary-button"
              disabled={busy}
              onClick={() => void saveIssuer()}
            >
              {sl ? 'Shrani' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {!companiesOnly && editingSeriesId !== null && (
        <div className="billing-issuer-detail">
          <h3>
            {editingSeriesId === -1
              ? sl
                ? 'Nova serija'
                : 'New series'
              : sl
                ? 'Uredi serijo'
                : 'Edit series'}
          </h3>
          <div className="billing-issuer-fields">
            <label>
              <span>{sl ? 'Izdajatelj' : 'Issuer'}</span>
              <select
                value={seriesDraft.legalEntityId ?? ''}
                disabled={editingSeriesId !== -1}
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    legalEntityId: Number(e.target.value) || null,
                  })
                }
              >
                {issuers
                  .filter((x) => x.assignedToCurrentUnit)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>{sl ? 'Obseg števca' : 'Counter scope'}</span>
              <select
                value={seriesDraft.companyId == null ? 'SHARED' : 'UNIT'}
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    companyId:
                      e.target.value === 'SHARED' ? null : currentUnitId,
                    locationId: null,
                  })
                }
              >
                <option value="UNIT">
                  {sl
                    ? 'Ločen za trenutno enoto'
                    : 'Separate for current unit'}
                </option>
                <option value="SHARED">
                  {sl
                    ? 'Skupen med dodeljenimi enotami'
                    : 'Shared across assigned units'}
                </option>
              </select>
            </label>
            <label>
              <span>{sl ? 'Naziv serije' : 'Series name'}</span>
              <input
                value={seriesDraft.name}
                onChange={(e) =>
                  setSeriesDraft({ ...seriesDraft, name: e.target.value })
                }
              />
            </label>
            <label>
              <span>{sl ? 'Naslednja številka' : 'Next number'}</span>
              <input
                value={seriesDraft.nextNumber}
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    nextNumber: e.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>
                {sl
                  ? 'Začetna številka ob ponastavitvi'
                  : 'Initial number on reset'}
              </span>
              <input
                value={seriesDraft.initialNumber}
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    initialNumber: e.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>{sl ? 'Ponastavitev' : 'Reset'}</span>
              <select
                value={seriesDraft.resetPolicy}
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    resetPolicy: e.target.value,
                  })
                }
              >
                <option value="NONE">{sl ? 'Brez' : 'None'}</option>
                <option value="YEARLY">{sl ? 'Letno' : 'Yearly'}</option>
              </select>
            </label>
            {seriesDraft.companyId != null && (
              <label>
                <span>
                  {sl ? 'Lokacija (opcijsko)' : 'Location (optional)'}
                </span>
                <select
                  value={seriesDraft.locationId ?? ''}
                  onChange={(e) => {
                    const locationId = Number(e.target.value) || null
                    setSeriesDraft({
                      ...seriesDraft,
                      locationId,
                      defaultForCurrentUnit: locationId
                        ? false
                        : seriesDraft.defaultForCurrentUnit,
                    })
                  }}
                >
                  <option value="">
                    {sl ? 'Vse lokacije enote' : 'All unit locations'}
                  </option>
                  {locations
                    .filter((x) => x.active !== false)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.city ? ` · ${x.city}` : ''}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              <span>
                {sl ? 'Oznaka poslovnega prostora' : 'Business premise code'}
              </span>
              <input
                value={seriesDraft.businessPremiseCode}
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    businessPremiseCode: e.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>
                {sl
                  ? 'Oznaka elektronske naprave'
                  : 'Electronic device ID'}
              </span>
              <input
                value={seriesDraft.electronicDeviceId}
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    electronicDeviceId: e.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>
                {sl ? 'Privzeta za trenutno enoto' : 'Default for current unit'}
              </span>
              <input
                type="checkbox"
                checked={seriesDraft.defaultForCurrentUnit}
                disabled={
                  seriesDraft.locationId != null || !seriesDraft.active
                }
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    defaultForCurrentUnit: e.target.checked,
                  })
                }
              />
            </label>
            <label>
              <span>{sl ? 'Aktivna' : 'Active'}</span>
              <input
                type="checkbox"
                checked={seriesDraft.active}
                disabled={
                  editingSeriesId !== -1 &&
                  seriesDraft.defaultForCurrentUnit
                }
                title={
                  editingSeriesId !== -1 &&
                  seriesDraft.defaultForCurrentUnit
                    ? sl
                      ? 'Najprej izberite drugo privzeto serijo.'
                      : 'Choose another default series first.'
                    : undefined
                }
                onChange={(e) =>
                  setSeriesDraft({
                    ...seriesDraft,
                    active: e.target.checked,
                    defaultForCurrentUnit: e.target.checked
                      ? seriesDraft.defaultForCurrentUnit
                      : false,
                  })
                }
              />
            </label>
          </div>
          <div className="billing-issuer-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingSeriesId(null)}
            >
              {sl ? 'Prekliči' : 'Cancel'}
            </button>
            <button
              type="button"
              className="billing-primary-button"
              disabled={busy}
              onClick={() => void saveSeries()}
            >
              {sl ? 'Shrani' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
