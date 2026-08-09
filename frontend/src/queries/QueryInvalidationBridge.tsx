import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'

export function QueryInvalidationBridge() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const invalidateSettings = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
    }
    const invalidateLocations = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.locations.all })
    }
    const invalidateUsers = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
    }
    const invalidateClients = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all })
    }
    const invalidateCompanies = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all })
    }
    const invalidateGroups = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all })
    }

    window.addEventListener('settings-updated', invalidateSettings)
    window.addEventListener('locations-updated', invalidateLocations)
    window.addEventListener('users-updated', invalidateUsers)
    window.addEventListener('clients-updated', invalidateClients)
    window.addEventListener('companies-updated', invalidateCompanies)
    window.addEventListener('groups-updated', invalidateGroups)

    return () => {
      window.removeEventListener('settings-updated', invalidateSettings)
      window.removeEventListener('locations-updated', invalidateLocations)
      window.removeEventListener('users-updated', invalidateUsers)
      window.removeEventListener('clients-updated', invalidateClients)
      window.removeEventListener('companies-updated', invalidateCompanies)
      window.removeEventListener('groups-updated', invalidateGroups)
    }
  }, [queryClient])

  return null
}
