import axios from 'axios'
import { getApiBaseURL } from '../api'
import { hydrateRegisterCatalogFromApi } from '../pages/registerPlanCopy'

let registerCatalogLoadAttempted = false

/** Loads public register price catalog once (defaults apply until this succeeds). */
export async function ensureRegisterCatalogLoaded(): Promise<boolean> {
  if (registerCatalogLoadAttempted) return false
  registerCatalogLoadAttempted = true
  try {
    const { data } = await axios.get(`${getApiBaseURL()}/register/catalog`, {
      withCredentials: false,
      timeout: 15_000,
    })
    hydrateRegisterCatalogFromApi(data)
    return true
  } catch {
    // Keep built-in defaults; avoid blocking register if API is down.
    return false
  }
}
