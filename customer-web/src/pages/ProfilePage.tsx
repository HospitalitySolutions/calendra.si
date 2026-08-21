import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { EditIcon, LogOutIcon } from '../components/Icons'
import { ErrorState, PageLoader, Spinner } from '../components/Loading'
import { initials } from '../utils'

export function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['customer-profile-settings'], queryFn: customerApi.profileSettings })
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!query.data) return
    const settings = query.data
    setFirstName(settings.guestUser.firstName || '')
    setLastName(settings.guestUser.lastName || '')
    setEmail(settings.guestUser.email || '')
    setPhone(settings.guestUser.phone || '')
  }, [query.data])

  const update = useMutation({
    mutationFn: () => customerApi.updateProfile({
      firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() || null, language: 'sl', companyId: null, linkedCompanyId: null,
      batchPaymentEnabled: null, notifyMessagesEnabled: query.data?.notifyMessagesEnabled ?? true, notifyRemindersEnabled: query.data?.notifyRemindersEnabled ?? true, notifyReminderMinutes: query.data?.notifyReminderMinutes ?? 60,
      invoiceRecipientType: null, invoicePersonAddressLine: null, invoicePersonPostalCode: null, invoicePersonCity: null, invoiceCompanyName: null, invoiceCompanyAddressLine: null, invoiceCompanyPostalCode: null, invoiceCompanyCity: null, invoiceCompanyVatId: null,
    }),
    onSuccess: async () => {
      setNotice('Spremembe so shranjene.')
      await refreshUser()
      await client.invalidateQueries({ queryKey: ['customer-profile-settings'] })
    },
  })
  const upload = useMutation({ mutationFn: customerApi.uploadProfilePicture, onSuccess: async () => { await refreshUser(); await client.invalidateQueries({ queryKey: ['customer-profile-settings'] }) } })

  function submit(event: FormEvent) { event.preventDefault(); setNotice(''); update.mutate() }
  function performLogout() { logout(); window.location.replace('/racun') }

  if (query.isLoading) return <PageLoader/>
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()}/>
  const error = update.error instanceof ApiError ? update.error.message : update.isError ? 'Sprememb ni bilo mogoče shraniti.' : ''

  return <div className="profile-layout">
    <aside className="profile-summary"><div className="profile-avatar-large">{initials(user?.firstName, user?.lastName)}</div><h2>{user?.firstName} {user?.lastName}</h2><p>{user?.email}</p><label className="button button--secondary button--full upload-button"><EditIcon size={17}/> Spremeni fotografijo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) upload.mutate(file) }}/></label><button className="button button--text danger-text" onClick={performLogout}><LogOutIcon size={18}/> Odjava</button></aside>
    <div className="profile-content"><form className="settings-card" onSubmit={submit}><div className="section-heading"><div><span className="overline">Račun</span><h2>Osebni podatki</h2></div></div>{error && <div className="form-alert form-alert--error">{error}</div>}{notice && <div className="form-alert form-alert--success">{notice}</div>}<div className="form-grid form-grid--2"><label>Ime<input value={firstName} onChange={e => setFirstName(e.target.value)} required/></label><label>Priimek<input value={lastName} onChange={e => setLastName(e.target.value)} required/></label></div><label>E-pošta<input type="email" value={email} onChange={e => setEmail(e.target.value)} required/></label><label>Telefon<input type="tel" value={phone} onChange={e => setPhone(e.target.value)}/></label><div className="settings-actions"><button className="button button--primary" disabled={update.isPending}>{update.isPending ? <><Spinner small/> Shranjujem …</> : 'Shrani spremembe'}</button></div></form>

    <section className="settings-card settings-card--muted"><div className="section-heading"><div><span className="overline">Varnost in zasebnost</span><h2>Vaš Calendra račun</h2></div></div><p>Za spremembo gesla uporabite postopek »Pozabljeno geslo« na prijavni strani. Za izbris računa in informacije o varstvu podatkov obiščite center zasebnosti.</p><div className="settings-links"><a href="https://calendra.si/pravice-posameznikov">Pravice posameznikov</a><a href="https://calendra.si/izbris-racuna">Izbris računa</a></div></section></div>
  </div>
}
