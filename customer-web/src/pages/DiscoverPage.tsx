import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import { ApiError } from '../api/client'
import type { PublicLocation } from '../api/types'
import { launchCustomerBooking } from '../bookingHandoff'
import { ArrowUpRightIcon, MapPinIcon, SearchIcon, StarIcon } from '../components/Icons'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'

const CATEGORY_LABELS: Record<string, string> = {
  BEAUTY: 'Lepota', HAIR: 'Frizerstvo', HEALTH: 'Zdravje', WELLNESS: 'Dobro počutje', FITNESS: 'Fitnes', CONSULTING: 'Svetovanje', EDUCATION: 'Izobraževanje', OTHER: 'Drugo',
}

type DisplayProvider = PublicLocation & { distanceKm?: number }

export function DiscoverPage() {
  const [search, setSearch] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [activeLocation, setActiveLocation] = useState('')
  const [category, setCategory] = useState('')
  const [bookingLocationId, setBookingLocationId] = useState<number | null>(null)
  const [bookingError, setBookingError] = useState('')

  const query = useQuery({ queryKey: ['public-providers'], queryFn: customerApi.providers, staleTime: 5 * 60_000 })
  const nearbyQuery = useQuery({
    queryKey: ['nearby-public-providers', activeLocation],
    queryFn: () => customerApi.nearbyProviders(activeLocation),
    enabled: Boolean(activeLocation),
    staleTime: 5 * 60_000,
  })

  const booking = useMutation({
    mutationFn: (locationId: number) => launchCustomerBooking(locationId),
    onMutate: locationId => { setBookingLocationId(locationId); setBookingError('') },
    onError: error => {
      setBookingLocationId(null)
      setBookingError(error instanceof ApiError ? error.message : 'Rezervacije ni bilo mogoče odpreti.')
    },
  })

  const sourceProviders = useMemo<DisplayProvider[]>(() => {
    if (activeLocation) {
      return (nearbyQuery.data?.items || []).map(item => ({ ...item.location, distanceKm: item.distanceKm }))
    }
    return (query.data || []).map(provider => ({ ...provider }))
  }, [activeLocation, nearbyQuery.data, query.data])

  const providers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('sl')
    return sourceProviders.filter(provider => {
      const matchesSearch = !needle || [provider.publicName, provider.publicDescription, provider.publicAddress, provider.physicalAddress?.city, provider.category]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase('sl').includes(needle))
      const matchesCategory = !category || (provider.category || '').toUpperCase() === category
      return matchesSearch && matchesCategory
    })
  }, [sourceProviders, search, category])

  const categories = useMemo(() => Array.from(new Set((query.data || []).map(p => (p.category || '').toUpperCase()).filter(Boolean))), [query.data])

  const submitLocation = (event: FormEvent) => {
    event.preventDefault()
    const normalized = locationInput.trim().replace(/\s+/g, ' ')
    setActiveLocation(normalized)
  }

  const clearFilters = () => {
    setSearch('')
    setLocationInput('')
    setActiveLocation('')
    setCategory('')
  }

  if (query.isLoading) return <PageLoader />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />

  return <div className="page-stack">
    <section className="discover-hero">
      <span className="overline">Poiščite pravi termin</span>
      <h2>Poiščite ponudnika v svoji bližini</h2>
      <form className="discover-search-grid" onSubmit={submitLocation}>
        <label className="discover-search-field">
          <span>Kaj iščete?</span>
          <div className="search-box"><SearchIcon/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Masaža, frizer, svetovanje …" aria-label="Kaj iščete?"/></div>
        </label>
        <label className="discover-search-field">
          <span>Kje?</span>
          <div className="search-box"><MapPinIcon size={19}/><input value={locationInput} onChange={e => setLocationInput(e.target.value)} placeholder="Naslov, kraj ali poštna številka …" aria-label="Kje?" autoComplete="street-address"/></div>
        </label>
        <button className="button button--primary discover-search-button" type="submit" disabled={nearbyQuery.isFetching}>
          {nearbyQuery.isFetching ? 'Iščem …' : 'Poišči'}
        </button>
      </form>
      {activeLocation && nearbyQuery.isError && <div className="form-alert form-alert--error">{nearbyQuery.error instanceof ApiError ? nearbyQuery.error.message : 'Lokacije ni bilo mogoče poiskati.'}</div>}
      <div className="chip-row"><button className={!category ? 'chip chip--active' : 'chip'} onClick={() => setCategory('')}>Vse</button>{categories.map(item => <button key={item} className={category === item ? 'chip chip--active' : 'chip'} onClick={() => setCategory(item)}>{CATEGORY_LABELS[item] || item}</button>)}</div>
    </section>

    <div className="results-heading">
      <strong>{providers.length} {providers.length === 1 ? 'ponudnik' : 'ponudnikov'}</strong>
      {search && <span>za “{search}”</span>}
      {activeLocation && !nearbyQuery.isError && <span>v bližini “{activeLocation}”</span>}
      {activeLocation && nearbyQuery.data?.attribution && <span className="google-maps-attribution" translate="no">{nearbyQuery.data.attribution}</span>}
    </div>

    {bookingError && <div className="form-alert form-alert--error">{bookingError}</div>}
    {nearbyQuery.isFetching && activeLocation ? <PageLoader /> : providers.length === 0 ? <EmptyState title="Ni najdenih ponudnikov" description={activeLocation ? 'V bližini te lokacije trenutno ni najdenih ponudnikov. Poskusite z drugim naslovom ali odstranite lokacijski filter.' : 'Poskusite z drugim iskalnim izrazom ali odstranite filter.'} action={<button className="button button--secondary" onClick={clearFilters}>Počisti filtre</button>}/>
      : <div className="provider-grid">{providers.map(provider => <article className="provider-card" key={provider.locationId}>
        <div className="provider-card__header"><ProviderAvatar name={provider.publicName} logoUrl={provider.logoUrl} size="lg"/><div className="provider-card__category">{CATEGORY_LABELS[(provider.category || '').toUpperCase()] || provider.category || 'Storitve'}</div></div>
        <div className="provider-card__body"><h3>{provider.publicName}</h3>{provider.publicDescription && <p>{provider.publicDescription}</p>}<div className="provider-card__meta">{provider.publicAddress && <span><MapPinIcon size={16}/>{provider.publicAddress}</span>}{provider.distanceKm != null && <span><MapPinIcon size={16}/>{formatDistance(provider.distanceKm)}</span>}{provider.googleRating != null && <span><StarIcon size={16}/>{provider.googleRating.toFixed(1)} {provider.googleReviewCount ? `(${provider.googleReviewCount})` : ''}</span>}</div></div>
        <div className="provider-card__footer"><Link className="button button--secondary button--full" to={`/ponudniki/${provider.slug}`}>Prikaži ponudnika <ArrowUpRightIcon size={17}/></Link>{provider.publicBookingEnabled && <button className="button button--primary button--full" disabled={booking.isPending && bookingLocationId === provider.locationId} onClick={() => booking.mutate(provider.locationId)}>{booking.isPending && bookingLocationId === provider.locationId ? 'Odpiram …' : 'Rezerviraj termin'}</button>}</div>
      </article>)}</div>}
  </div>
}

function formatDistance(distanceKm: number) {
  if (distanceKm < 1) return `${Math.max(10, Math.round(distanceKm * 1000 / 10) * 10)} m stran`
  return `${distanceKm.toLocaleString('sl-SI', { maximumFractionDigits: 1 })} km stran`
}
