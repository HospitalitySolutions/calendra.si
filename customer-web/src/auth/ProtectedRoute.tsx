import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { FullPageLoader } from '../components/Loading'
import { CUSTOMER_ACCOUNT_BASE_PATH } from '../config'

export function ProtectedRoute() {
  const { loading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!isAuthenticated) {
    const next = `${CUSTOMER_ACCOUNT_BASE_PATH}${location.pathname}${location.search}`
    return <Navigate to={`/prijava?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}
