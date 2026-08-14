import { useState, type FormEvent } from 'react'
import { MARKETING_BASE_URL } from '../config'
import { CalendarIcon, MapPinIcon, SearchIcon } from './Icons'

export function MarketplaceSearchBar() {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    const normalizedQuery = query.trim().replace(/\s+/g, ' ')
    const normalizedLocation = location.trim().replace(/\s+/g, ' ')

    if (normalizedQuery) params.set('q', normalizedQuery)
    if (normalizedLocation) params.set('location', normalizedLocation)
    if (date) params.set('date', date)

    const suffix = params.toString()
    window.location.assign(`${MARKETING_BASE_URL}/za-stranke${suffix ? `?${suffix}` : ''}`)
  }

  return <form className="marketplace-search" onSubmit={submit} aria-label="Poišči termin">
    <label className="marketplace-search__field marketplace-search__field--service">
      <SearchIcon size={19}/>
      <span className="marketplace-search__copy">
        <span className="marketplace-search__label">Katero storitev iščete?</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Frizerstvo, masaža, joga …" aria-label="Katero storitev iščete?"/>
      </span>
    </label>
    <label className="marketplace-search__field marketplace-search__field--location">
      <MapPinIcon size={19}/>
      <span className="marketplace-search__copy">
        <span className="marketplace-search__label">Lokacija</span>
        <input value={location} onChange={event => setLocation(event.target.value)} placeholder="Vnesite kraj ali območje" aria-label="Lokacija" autoComplete="street-address"/>
      </span>
    </label>
    <label className="marketplace-search__field marketplace-search__field--date">
      <CalendarIcon size={19}/>
      <span className="marketplace-search__copy">
        <span className="marketplace-search__label">Kdaj?</span>
        <input type="date" value={date} onChange={event => setDate(event.target.value)} aria-label="Kdaj?"/>
      </span>
    </label>
    <button className="marketplace-search__submit" type="submit">Poišči <span aria-hidden="true">→</span></button>
  </form>
}
