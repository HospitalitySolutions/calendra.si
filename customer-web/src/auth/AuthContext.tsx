import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { customerApi } from '../api/customerApi'
import { getStoredToken, setStoredToken } from '../api/client'
import type { GuestSession, GuestUser } from '../api/types'

type AuthContextValue = {
  user: GuestUser | null
  loading: boolean
  isAuthenticated: boolean
  setSession: (session: GuestSession) => void
  refreshUser: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GuestUser | null>(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    setStoredToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    if (!getStoredToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const response = await customerApi.me()
      setUser(response.guestUser)
    } catch {
      logout()
    } finally {
      setLoading(false)
    }
  }, [logout])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  useEffect(() => {
    const onUnauthorized = () => logout()
    window.addEventListener('calendra:customer-unauthorized', onUnauthorized)
    return () => window.removeEventListener('calendra:customer-unauthorized', onUnauthorized)
  }, [logout])

  const setSession = useCallback((session: GuestSession) => {
    setStoredToken(session.token)
    setUser(session.guestUser)
    setLoading(false)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user && getStoredToken()),
    setSession,
    refreshUser,
    logout,
  }), [user, loading, setSession, refreshUser, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
