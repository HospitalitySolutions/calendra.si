import { createContext, useContext, type PropsWithChildren } from 'react'
import type { User } from './lib/types'

const AuthenticatedUserContext = createContext<User | null>(null)

type AuthenticatedUserProviderProps = PropsWithChildren<{
  user: User
}>

export function AuthenticatedUserProvider({ user, children }: AuthenticatedUserProviderProps) {
  return (
    <AuthenticatedUserContext.Provider value={user}>
      {children}
    </AuthenticatedUserContext.Provider>
  )
}

export function useAuthenticatedUser(): User {
  const user = useContext(AuthenticatedUserContext)
  if (!user) {
    throw new Error('Authenticated user is unavailable.')
  }
  return user
}
