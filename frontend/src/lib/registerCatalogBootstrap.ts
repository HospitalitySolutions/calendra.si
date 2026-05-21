import axios from 'axios'
import { getApiBaseURL } from '../api'
import { hydrateRegisterCatalogFromApi } from '../pages/registerPlanCopy'

let registerCatalogLoadAttempted = false

/** Loads public register price catalog once (defaults apply until this succeeds). */
export async function ensureRegisterCatalogLoaded(): Promise<void> {
  if (registerCatalogLoadAttempted) return
  registerCatalogLoadAttempted = true
  try {
    const { data } = await axios.get(`${getApiBaseURL()}/register/catalog`, {
      withCredentials: false,
      timeout: 15_000,
    })
    hydrateRegisterCatalogFromApi(data)
  } catch {
    // Keep built-in defaults; avoid blocking register if API is down.
  }
}
