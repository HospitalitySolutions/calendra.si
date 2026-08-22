import { useState, type FormEvent } from 'react'
import { CUSTOMER_ACCOUNT_BASE_PATH } from '../config'
import { SearchIcon } from './Icons'

export function MarketplaceSearchBar() {
  const [query, setQuery] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    const normalizedQuery = query.trim().replace(/\s+/g, ' ')

    if (normalizedQuery) params.set('q', normalizedQuery)

    const suffix = params.toString()
    window.location.assign(`${CUSTOMER_ACCOUNT_BASE_PATH}/isci${suffix ? `?${suffix}` : ''}`)
  }

  return <form className="marketplace-search marketplace-search--compact" onSubmit={submit} aria-label="Poišči ponudnika">
    <label className="marketplace-search__field marketplace-search__field--service">
      <SearchIcon size={19}/>
      <span className="marketplace-search__copy">
        <span className="marketplace-search__label">Katero storitev iščete?</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="npr. psiholog, fizioterapija, pregled ..." aria-label="Katero storitev iščete?"/>
      </span>
    </label>
    <button className="marketplace-search__submit" type="submit">Poišči <span aria-hidden="true">→</span></button>
  </form>
}
