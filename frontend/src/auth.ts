import type { User } from './lib/types'

export const getStoredUser = (): User | null => {
  try {
    const raw = sessionStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
