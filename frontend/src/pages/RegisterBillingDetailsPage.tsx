import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import loginLogo from '../assets/login-logo.png'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { useToast } from '../components/Toast'
import { ensureRegisterCatalogLoaded } from '../lib/registerCatalogBootstrap'
import { useLocale } from '../locale'
import { registerPageStyles } from './registerPageStyles'
import {
  getBillingInterval,
  parseRegisterSelection,
  registerPlanToPackage,
  selectionToSearch,
} from './registerFlow'
import {
  buildSummary,
  getRegisterPlanPageCopy,
  plansForLocale,
  selectionRequiresBillingDetails,
  type RegisterLocale,
} from './registerPlanCopy'

const REGISTER_BILLING_DETAILS_REQUIRED_KEY = 'calendra.register.requiresBillingDetails'
const REGISTER_BILLING_DETAILS_SEARCH_KEY = 'calendra.register.billingDetailsSearch'
type RegisterPaymentMethod = 'BANK_TRANSFER' | 'CARD' | 'PAYPAL'
type RegisterPaymentCapabilities = { stripeEnabled: boolean; paypalEnabled: boolean }

function clearPendingBillingDetailsRedirect() {
  try {
    window.sessionStorage.removeItem(REGISTER_BILLING_DETAILS_REQUIRED_KEY)
    window.sessionStorage.removeItem(REGISTER_BILLING_DETAILS_SEARCH_KEY)
  } catch {
    // Session storage is best-effort only.
  }
}

const registerBillingDetailsStyles = `
  .register-flow.register-billing-details-page {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .register-flow.register-billing-details-page .app {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
  }

  .register-flow.register-billing-details-page .content {
    flex: 1 1 auto;
    min-height: 0;
    padding: 6px 0 48px;
  }

  .register-billing-wrap {
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: 0 clamp(18px, 3vw, 34px);
    display: grid;
    gap: 18px;
  }

  .register-billing-stepper-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 10px 14px;
  }

  .register-billing-stepper-row .step {
    color: var(--muted);
    background: transparent;
  }

  .register-billing-stepper-row .step.step-done {
    background: #d4e4ff;
    color: #17253d;
    border: 1px solid #b8cffc;
  }

  .register-billing-stepper-row .step.step-current {
    background: #ebf2ff;
    color: var(--blue);
    border: 1px solid transparent;
  }

  .register-billing-card {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
    gap: 18px;
    align-items: start;
  }

  .register-billing-main,
  .register-billing-summary {
    border: 1px solid rgba(223, 231, 245, 0.95);
    background: rgba(255, 255, 255, 0.88);
    box-shadow: 0 20px 48px rgba(34, 78, 160, 0.12);
  }

  .register-billing-main {
    padding: clamp(22px, 3vw, 34px);
    display: grid;
    gap: 20px;
  }

  .register-billing-header {
    display: grid;
    gap: 10px;
  }

  .register-billing-kicker {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 8px 13px;
    border-radius: 999px;
    background: #edf4ff;
    color: #2f6df6;
    border: 1px solid #d9e6ff;
    font-weight: 900;
    font-size: 0.86rem;
  }

  .register-billing-title {
    margin: 0;
    font-size: clamp(2rem, 3.2vw, 2.75rem);
    line-height: 0.98;
    letter-spacing: -0.055em;
    color: #17253d;
  }

  .register-billing-copy {
    margin: 0;
    max-width: 640px;
    color: #70809b;
    line-height: 1.58;
    font-size: 1rem;
  }

  .register-billing-form {
    display: grid;
    gap: 16px;
  }

  .register-billing-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .register-billing-field {
    display: grid;
    gap: 8px;
  }

  .register-billing-field--full {
    grid-column: 1 / -1;
  }

  .register-billing-field label,
  .register-billing-payment-label {
    font-size: 0.92rem;
    font-weight: 850;
    color: #2a3a56;
  }

  .register-billing-field input,
  .register-billing-field select {
    width: 100%;
    height: 52px;
    border-radius: 16px;
    border: 1px solid #dfe7f5;
    background: rgba(255, 255, 255, 0.94);
    padding: 0 16px;
    font-size: 0.98rem;
    color: #17253d;
    outline: none;
    transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
  }

  .register-billing-field input:focus,
  .register-billing-field select:focus {
    border-color: #b8d0ff;
    box-shadow: 0 0 0 4px rgba(47, 109, 246, 0.10);
    background: #fff;
  }

  .register-billing-payment-box {
    display: grid;
    gap: 10px;
    padding: 16px;
    border: 1px solid #dbe6f7;
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,248,255,0.96));
  }

  .register-billing-payment-options {
    display: grid;
    gap: 10px;
  }

  .register-billing-payment-option {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 12px 14px;
    border: 1px solid #dfe7f5;
    background: #fff;
    color: #17253d;
    cursor: pointer;
    font-weight: 800;
  }

  .register-billing-payment-option input {
    accent-color: #2f6df6;
  }

  .register-billing-help {
    color: #70809b;
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .register-billing-error {
    padding: 12px 14px;
    border: 1px solid #f3b7b7;
    background: #fff2f2;
    color: #a12828;
    font-weight: 800;
  }

  .register-billing-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
  }

  .register-billing-back,
  .register-billing-submit {
    border: 0;
    min-height: 48px;
    padding: 0 20px;
    font-weight: 900;
    cursor: pointer;
  }

  .register-billing-back {
    background: #eef4ff;
    color: #2f6df6;
  }

  .register-billing-submit {
    background: #2f6df6;
    color: #fff;
    box-shadow: 0 16px 30px rgba(47, 109, 246, 0.22);
  }

  .register-billing-submit:disabled {
    opacity: 0.64;
    cursor: not-allowed;
  }

  .register-billing-summary {
    padding: 22px;
    position: sticky;
    top: 84px;
    display: grid;
    gap: 16px;
  }

  .register-billing-summary-title {
    margin: 0;
    color: #17253d;
    font-size: 1.1rem;
  }

  .register-billing-summary-plan {
    display: grid;
    gap: 4px;
    padding: 14px;
    background: #f5f8ff;
    border: 1px solid #dfe7f5;
  }

  .register-billing-summary-plan span {
    color: #70809b;
    font-size: 0.84rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 900;
  }

  .register-billing-summary-plan strong {
    color: #17253d;
    font-size: 1rem;
  }

  .register-billing-summary-list {
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
    list-style: none;
  }

  .register-billing-summary-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    color: #5d6c85;
    font-size: 0.92rem;
  }

  .register-billing-summary-row strong {
    color: #17253d;
    white-space: nowrap;
  }

  .register-billing-summary-total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid #dfe7f5;
  }

  .register-billing-summary-total span {
    color: #70809b;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 900;
  }

  .register-billing-summary-total strong {
    color: #17253d;
    font-size: 1.25rem;
  }

  @media (max-width: 860px) {
    .register-billing-card {
      grid-template-columns: 1fr;
    }

    .register-billing-summary {
      position: static;
    }
  }

  @media (max-width: 640px) {
    .register-billing-grid {
      grid-template-columns: 1fr;
    }
  }
`

const copyByLocale = {
  en: {
    kicker: 'Billing details',
    title: 'Billing details',
    subtitle: 'Your selected package has a recurring price. Add the billing details before entering the app so invoices and subscription records are created correctly.',
    firstName: 'First name *',
    lastName: 'Last name *',
    companyName: 'Company / business name *',
    vatId: 'VAT ID / Tax number',
    address: 'Address *',
    postalCode: 'Postal code *',
    city: 'City *',
    paymentMethod: 'Preferred payment method',
    bankTransfer: 'Bank transfer',
    card: 'Card payment',
    paypal: 'PayPal',
    paymentHelp: 'You can change the active payment provider later in platform payment settings.',
    summaryTitle: 'Selected package',
    summaryLabel: 'Package',
    estimatedTotal: 'Estimated total',
    back: 'Back to account setup',
    submit: 'Save and continue to app',
    saving: 'Saving…',
    required: 'Please fill in all required billing fields.',
    saved: 'Billing details saved.',
    failed: 'Could not save billing details. Please try again.',
  },
  sl: {
    kicker: 'Podatki za obračun',
    title: 'Podatki za obračun',
    subtitle: 'Vaš izbrani paket ima ponavljajočo ceno. Pred vstopom v aplikacijo vnesite podatke za obračun, da bodo računi in naročnina pravilno pripravljeni.',
    firstName: 'Ime *',
    lastName: 'Priimek *',
    companyName: 'Naziv podjetja / dejavnosti *',
    vatId: 'ID za DDV / Davčna številka',
    address: 'Naslov *',
    postalCode: 'Poštna številka *',
    city: 'Kraj *',
    paymentMethod: 'Želeni način plačila',
    bankTransfer: 'Bančno nakazilo',
    card: 'Plačilna kartica',
    paypal: 'PayPal',
    paymentHelp: 'Aktivnega ponudnika plačil lahko kasneje spremenite v nastavitvah plačil platforme.',
    summaryTitle: 'Izbrani paket',
    summaryLabel: 'Paket',
    estimatedTotal: 'Skupaj (ocena)',
    back: 'Nazaj na nastavitev računa',
    submit: 'Shrani in nadaljuj v aplikacijo',
    saving: 'Shranjevanje…',
    required: 'Izpolnite vsa obvezna polja za obračun.',
    saved: 'Podatki za obračun so shranjeni.',
    failed: 'Podatkov za obračun ni bilo mogoče shraniti. Poskusite znova.',
  },
} as const

export function RegisterBillingDetailsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, setLocale, t } = useLocale()
  const { showToast } = useToast()
  const lang: RegisterLocale = locale === 'sl' ? 'sl' : 'en'
  const copy = copyByLocale[lang]
  const pageCopy = useMemo(() => getRegisterPlanPageCopy(lang), [lang])
  const selection = useMemo(() => parseRegisterSelection(location.search), [location.search])
  const summary = useMemo(() => buildSummary(selection, lang), [selection, lang])
  const plans = useMemo(() => plansForLocale(lang), [lang])
  const storedUser = getStoredUser()

  const [firstName, setFirstName] = useState(storedUser?.firstName || '')
  const [lastName, setLastName] = useState(storedUser?.lastName || '')
  const [companyName, setCompanyName] = useState('')
  const [vatId, setVatId] = useState('')
  const [address, setAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<RegisterPaymentMethod>('BANK_TRANSFER')
  const [paymentCapabilities, setPaymentCapabilities] = useState<RegisterPaymentCapabilities>({
    stripeEnabled: true,
    paypalEnabled: false,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void ensureRegisterCatalogLoaded()
  }, [])

  useEffect(() => {
    let cancelled = false
    void api.get<RegisterPaymentCapabilities>('/register/payment-capabilities')
      .then(({ data }) => {
        if (cancelled || !data) return
        setPaymentCapabilities({
          stripeEnabled: data.stripeEnabled !== false,
          paypalEnabled: data.paypalEnabled === true,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setPaymentCapabilities({ stripeEnabled: true, paypalEnabled: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const availablePaymentMethods = useMemo<RegisterPaymentMethod[]>(() => {
    const methods: RegisterPaymentMethod[] = ['BANK_TRANSFER']
    if (paymentCapabilities.stripeEnabled) methods.push('CARD')
    if (paymentCapabilities.paypalEnabled) methods.push('PAYPAL')
    return methods
  }, [paymentCapabilities.paypalEnabled, paymentCapabilities.stripeEnabled])

  useEffect(() => {
    if (availablePaymentMethods.includes(paymentMethod)) return
    setPaymentMethod(availablePaymentMethods[0] || 'BANK_TRANSFER')
  }, [availablePaymentMethods, paymentMethod])

  useEffect(() => {
    if (!selectionRequiresBillingDetails(selection)) {
      clearPendingBillingDetailsRedirect()
      navigate('/calendar', { replace: true })
    }
  }, [navigate, selection])

  useEffect(() => {
    let cancelled = false
    api.get('/auth/me')
      .then((res) => {
        if (cancelled) return
        const user = res.data?.user
        if (user) {
          if (!firstName.trim() && user.firstName) setFirstName(String(user.firstName))
          if (!lastName.trim() && user.lastName) setLastName(String(user.lastName))
        }
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          navigate('/login', { replace: true })
        }
      })
    return () => {
      cancelled = true
    }
    // Intentionally only hydrate once on entry; the form itself owns edits afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const submitBillingDetails = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    const required = [firstName, lastName, companyName, address, postalCode, city].every((value) => value.trim())
    if (!required) {
      setError(copy.required)
      return
    }

    setSaving(true)
    try {
      await api.post('/auth/signup/billing-details', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        companyName: companyName.trim(),
        vatId: vatId.trim() || null,
        address: address.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
        packageName: registerPlanToPackage[selection.plan],
        billingInterval: getBillingInterval(selection),
        paymentMethod,
      })
      clearPendingBillingDetailsRedirect()
      showToast('success', copy.saved)
      window.location.assign('/calendar')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || copy.failed)
      } else {
        setError(copy.failed)
      }
    } finally {
      setSaving(false)
    }
  }

  const backToAccount = () => {
    navigate(`/register/account?${selectionToSearch(selection)}`)
  }

  return (
    <div className="register-flow register-billing-details-page">
      <style>{registerPageStyles}</style>
      <style>{registerBillingDetailsStyles}</style>
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={loginLogo} alt={pageCopy.brandAlt} />
        </div>

        <div className="top-actions">
          <div className="lang-switch" role="group" aria-label={t('language')}>
            <button
              type="button"
              className={locale === 'sl' ? 'lang-switch-btn active' : 'lang-switch-btn'}
              aria-pressed={locale === 'sl'}
              onClick={() => setLocale('sl')}
            >
              SL
            </button>
            <button
              type="button"
              className={locale === 'en' ? 'lang-switch-btn active' : 'lang-switch-btn'}
              aria-pressed={locale === 'en'}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <div className="app">
        <main className="content">
          <div className="register-billing-wrap">
            <div className="register-billing-stepper-row">
              <div className="stepper" aria-label={pageCopy.stepperAria}>
                <span className="step step-done">{pageCopy.step1} ✓</span>
                <span className="step step-done">{pageCopy.step2} ✓</span>
                <span className="step step-current">{pageCopy.step3}</span>
              </div>
            </div>

            <div className="register-billing-card">
              <section className="register-billing-main" aria-labelledby="register-billing-title">
                <div className="register-billing-header">
                  <span className="register-billing-kicker">{copy.kicker}</span>
                  <h1 id="register-billing-title" className="register-billing-title">{copy.title}</h1>
                  <p className="register-billing-copy">{copy.subtitle}</p>
                </div>

                <form className="register-billing-form" onSubmit={submitBillingDetails}>
                  <div className="register-billing-grid">
                    <div className="register-billing-field">
                      <label htmlFor="billing-first-name">{copy.firstName}</label>
                      <input id="billing-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
                    </div>
                    <div className="register-billing-field">
                      <label htmlFor="billing-last-name">{copy.lastName}</label>
                      <input id="billing-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
                    </div>
                    <div className="register-billing-field register-billing-field--full">
                      <label htmlFor="billing-company-name">{copy.companyName}</label>
                      <input id="billing-company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} autoComplete="organization" />
                    </div>
                    <div className="register-billing-field">
                      <label htmlFor="billing-vat-id">{copy.vatId}</label>
                      <input id="billing-vat-id" value={vatId} onChange={(event) => setVatId(event.target.value)} autoComplete="off" />
                    </div>
                    <div className="register-billing-field">
                      <label htmlFor="billing-city">{copy.city}</label>
                      <input id="billing-city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" />
                    </div>
                    <div className="register-billing-field register-billing-field--full">
                      <label htmlFor="billing-address">{copy.address}</label>
                      <input id="billing-address" value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" />
                    </div>
                    <div className="register-billing-field">
                      <label htmlFor="billing-postal-code">{copy.postalCode}</label>
                      <input id="billing-postal-code" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} autoComplete="postal-code" />
                    </div>
                  </div>

                  <div className="register-billing-payment-box">
                    <span className="register-billing-payment-label">{copy.paymentMethod}</span>
                    <div className="register-billing-payment-options">
                      {availablePaymentMethods.map((method) => (
                        <label className="register-billing-payment-option" key={method}>
                          <input
                            type="radio"
                            name="billing-payment-method"
                            checked={paymentMethod === method}
                            onChange={() => setPaymentMethod(method)}
                          />
                          <span>
                            {method === 'BANK_TRANSFER'
                              ? copy.bankTransfer
                              : method === 'CARD'
                                ? copy.card
                                : copy.paypal}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="register-billing-help">{copy.paymentHelp}</div>
                  </div>

                  {error ? <div className="register-billing-error" role="alert">{error}</div> : null}

                  <div className="register-billing-actions">
                    <button type="button" className="register-billing-back" onClick={backToAccount}>{copy.back}</button>
                    <button type="submit" className="register-billing-submit" disabled={saving}>{saving ? copy.saving : copy.submit}</button>
                  </div>
                </form>
              </section>

              <aside className="register-billing-summary" aria-label={copy.summaryTitle}>
                <h2 className="register-billing-summary-title">{copy.summaryTitle}</h2>
                <div className="register-billing-summary-plan">
                  <span>{copy.summaryLabel}</span>
                  <strong>{plans[selection.plan].name}</strong>
                </div>
                <ul className="register-billing-summary-list">
                  {summary.rows.map((row) => (
                    <li key={`${row.label}-${row.value}`} className="register-billing-summary-row">
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </li>
                  ))}
                </ul>
                <div className="register-billing-summary-total">
                  <span>{copy.estimatedTotal}</span>
                  <strong>{summary.totalPrimary}</strong>
                </div>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
