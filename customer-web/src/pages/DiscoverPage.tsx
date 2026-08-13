import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { customerApi } from '../api/customerApi'
import type { PublicLocation } from '../api/types'
import { ApiError } from '../api/client'
import { launchCustomerBooking } from '../bookingHandoff'
import { ArrowUpRightIcon, MapPinIcon, SearchIcon, StarIcon } from '../components/Icons'
import { EmptyState, ErrorState, PageLoader } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'

const CATEGORY_LABELS: Record<string, string> = {
  BEAUTY: 'Lepota', HAIR: 'Frizerstvo', HEALTH: 'Zdravje', WELLNESS: 'Dobro počutje', FITNESS: 'Fitnes', CONSULTING: 'Svetovanje', EDUCATION: 'Izobraževanje', OTHER: 'Drugo',
}

type ProviderSearchData = {
  locations: PublicLocation[]
  resolvedAddress?: string
  radiusKm?: number | null
}

function distanceLabel(distanceKm?: number | null) {
  if (distanceKm == null) return ''
  if (distanceKm < 1) return `${Math.max(1, Math.round(distanceKm * 1000))} m stran`
  return `${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km stran`
}

export function DiscoverPage() {
  const [search, setSearch] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [submittedLocation, setSubmittedLocation] = useState('')
  const [category, setCategory] = useState('')
  const [bookingLocationId, setBookingLocationId] = useState<number | null>(null)
  const [bookingError, setBookingError] = useState('')

  const query = useQuery<ProviderSearchData>({
    queryKey: ['public-providers', submittedLocation],
    queryFn: async () => {
      if (!submittedLocation) {
        return { locations: await customerApi.providers() }
      }
      const result = await customerApi.nearbyProviders(submittedLocation, null, 50)
      return {
        locations: result.locations,
        resolvedAddress: result.resolvedAddress,
        radiusKm: result.radiusKm,
      }
    },
    staleTime: submittedLocation ? 60_000 : 5 * 60_000,
  })

  const booking = useMutation({
    mutationFn: (locationId: number) => launchCustomerBooking(locationId),
    onMutate: locationId => { setBookingLocationId(locationId); setBookingError('') },
    onError: error => {
      setBookingLocationId(null)
      setBookingError(error instanceof ApiError ? error.message : 'Rezervacije ni bilo mogoče odpreti.')
    },
  })

  const sourceProviders = query.data?.locations || []
  const providers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('sl')
    return sourceProviders.filter(provider => {
      const matchesSearch = !needle || [
        provider.publicName,
        provider.publicDescription,
        provider.publicAddress,
        provider.physicalAddress?.city,
        provider.category,
      ].filter(Boolean).some(value => String(value).toLocaleLowerCase('sl').includes(needle))
      const matchesCategory = !category || (provider.category || '').toUpperCase() === category
      return matchesSearch && matchesCategory
    })
  }, [sourceProviders, search, category])

  const categories = useMemo(
    () => Array.from(new Set(sourceProviders.map(p => (p.category || '').toUpperCase()).filter(Boolean))),
    [sourceProviders],
  )

  const submitLocation = (event: FormEvent) => {
    event.preventDefault()
    const next = locationInput.trim()
    setCategory('')
    if (next === submittedLocation) {
      void query.refetch()
    } else {
      setSubmittedLocation(next)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setCategory('')
    setLocationInput('')
    setSubmittedLocation('')
  }

  return <div className="page-stack">
    <section className="discover-hero">
      <span className="overline">Poiščite pravi termin</span>
      <h2>Poiščite ponudnika in rezervirajte termin</h2>
      <form className="discover-search-grid" onSubmit={submitLocation}>
        <label className="discover-search-field">
          <span>Kaj iščete?</span>
          <div className="search-box"><SearchIcon/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Masaža, frizer, svetovanje …" aria-label="Kaj iščete?"/></div>
        </label>
        <label className="discover-search-field">
          <span>Kje?</span>
          <div className="search-box"><MapPinIcon/><input value={locationInput} onChange={e => setLocationInput(e.target.value)} placeholder="Naslov, kraj ali poštna številka …" aria-label="Kje?" autoComplete="street-address"/></div>
        </label>
        <button className="button button--primary discover-search-submit" type="submit">Poišči <SearchIcon size={17}/></button>
      </form>
      <p className="discover-location-help">Vnesite naslov ali kraj. Calendra poišče najbližje javno objavljene poslovne lokacije ponudnikov.</p>
      <div className="chip-row"><button className={!category ? 'chip chip--active' : 'chip'} onClick={() => setCategory('')} type="button">Vse</button>{categories.map(item => <button key={item} className={category === item ? 'chip chip--active' : 'chip'} onClick={() => setCategory(item)} type="button">{CATEGORY_LABELS[item] || item}</button>)}</div>
    </section>

    {query.isLoading ? <PageLoader /> : query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : <>
      <div className="results-heading">
        <strong>{providers.length} {providers.length === 1 ? 'ponudnik' : 'ponudnikov'}</strong>
        {submittedLocation && <span>blizu “{query.data?.resolvedAddress || submittedLocation}”</span>}
        {search && <span>za “{search}”</span>}
      </div>
      {bookingError && <div className="form-alert form-alert--error">{bookingError}</div>}
      {providers.length === 0 ? <EmptyState
        title="Ni najdenih ponudnikov"
        description={submittedLocation ? 'Za izbrano lokacijo ni bilo mogoče najti javno objavljenih ponudnikov z veljavnim fizičnim naslovom.' : 'Poskusite z drugim iskalnim izrazom ali odstranite filter.'}
        action={<button className="button button--secondary" onClick={clearFilters}>Počisti filtre</button>}
      /> : <div className="provider-grid">{providers.map(provider => <article className="provider-card" key={provider.locationId}>
        <div className="provider-card__header"><ProviderAvatar name={provider.publicName} logoUrl={provider.logoUrl} size="lg"/><div className="provider-card__category">{CATEGORY_LABELS[(provider.category || '').toUpperCase()] || provider.category || 'Storitve'}</div></div>
        <div className="provider-card__body"><h3>{provider.publicName}</h3>{provider.publicDescription && <p>{provider.publicDescription}</p>}<div className="provider-card__meta">{provider.publicAddress && <span><MapPinIcon size={16}/>{provider.publicAddress}</span>}{provider.distanceKm != null && <span className="provider-card__distance"><MapPinIcon size={16}/>{distanceLabel(provider.distanceKm)}</span>}{provider.googleRating != null && <span><StarIcon size={16}/>{provider.googleRating.toFixed(1)} {provider.googleReviewCount ? `(${provider.googleReviewCount})` : ''}</span>}</div></div>
        <div className="provider-card__footer"><Link className="button button--secondary button--full" to={`/providers/${provider.slug}`}>Prikaži ponudnika <ArrowUpRightIcon size={17}/></Link>{provider.publicBookingEnabled && <button className="button button--primary button--full" disabled={booking.isPending && bookingLocationId === provider.locationId} onClick={() => booking.mutate(provider.locationId)}>{booking.isPending && bookingLocationId === provider.locationId ? 'Odpiram …' : 'Rezerviraj termin'}</button>}</div>
      </article>)}</div>}
    </>}
  </div>
}
