import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuthenticatedUser } from '../authUserContext'
import { hasEmployeePermission } from '../lib/employeePermissions'
import { useLocale } from '../locale'
import { AnalyticsInboxTab } from './AnalyticsInboxTab'
import { ConfigurationDeliveryLogsSection } from './ConfigurationDeliveryLogsSection'

type InboxPageProps = {
  inboxModuleEnabled?: boolean
}

type InboxSection = 'messages' | 'deliveryLogs'

type MessagingProviderCapabilities = {
  whatsappEnabled?: boolean
  viberEnabled?: boolean
}

export function InboxPage({ inboxModuleEnabled = true }: InboxPageProps) {
  const me = useAuthenticatedUser()
  const location = useLocation()
  const navigate = useNavigate()
  const { locale } = useLocale()
  const canViewMessages = inboxModuleEnabled && hasEmployeePermission(me, 'INBOX_MESSAGES_VIEW')
  const canViewDeliveryLogs = hasEmployeePermission(me, 'DELIVERY_LOGS_VIEW')
  const requestedTab: InboxSection = new URLSearchParams(location.search).get('tab') === 'deliveryLogs'
    ? 'deliveryLogs'
    : 'messages'
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [messagingProviders, setMessagingProviders] = useState<MessagingProviderCapabilities>({})
  const [messagingProvidersLoaded, setMessagingProvidersLoaded] = useState(false)

  useEffect(() => {
    if (!canViewDeliveryLogs) return
    let cancelled = false

    void Promise.all([
      api.get<Record<string, string>>('/settings').catch(() => ({ data: {} as Record<string, string> })),
      api.get<MessagingProviderCapabilities>('/inbox/global-capabilities').catch(() => ({ data: {} as MessagingProviderCapabilities })),
    ]).then(([settingsResponse, capabilitiesResponse]) => {
      if (cancelled) return
      setSettings(settingsResponse.data || {})
      setMessagingProviders({
        whatsappEnabled: capabilitiesResponse.data?.whatsappEnabled === true,
        viberEnabled: capabilitiesResponse.data?.viberEnabled === true,
      })
      setMessagingProvidersLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [canViewDeliveryLogs])

  if (!canViewMessages && !canViewDeliveryLogs) {
    return <Navigate to="/" replace />
  }
  if (requestedTab === 'deliveryLogs' && !canViewDeliveryLogs) {
    return <Navigate to="/inbox" replace />
  }
  if (requestedTab === 'messages' && !canViewMessages) {
    return <Navigate to="/inbox?tab=deliveryLogs" replace />
  }

  const labels = locale === 'sl'
    ? { messages: 'Prejeto', deliveryLogs: 'Dnevniki pošiljanja' }
    : locale === 'sr'
      ? { messages: 'Primljeno', deliveryLogs: 'Dnevnici slanja' }
      : { messages: 'Inbox', deliveryLogs: 'Delivery logs' }

  const openTab = (tab: InboxSection) => {
    navigate(tab === 'deliveryLogs' ? '/inbox?tab=deliveryLogs' : '/inbox')
  }

  return (
    <div className="inbox-page-shell">
      {canViewMessages && canViewDeliveryLogs ? (
        <nav className="inbox-page-tabs" aria-label={locale === 'sl' ? 'Komunikacijski zavihki' : 'Communication tabs'}>
          <button
            type="button"
            className={`inbox-page-tab${requestedTab === 'messages' ? ' active' : ''}`}
            aria-current={requestedTab === 'messages' ? 'page' : undefined}
            onClick={() => openTab('messages')}
          >
            <span className="inbox-page-tab-icon" aria-hidden>✉</span>
            {labels.messages}
          </button>
          <button
            type="button"
            className={`inbox-page-tab${requestedTab === 'deliveryLogs' ? ' active' : ''}`}
            aria-current={requestedTab === 'deliveryLogs' ? 'page' : undefined}
            onClick={() => openTab('deliveryLogs')}
          >
            <span className="inbox-page-tab-icon" aria-hidden>▤</span>
            {labels.deliveryLogs}
          </button>
        </nav>
      ) : null}

      {requestedTab === 'deliveryLogs' ? (
        <div className="inbox-page-delivery-logs" data-onboarding-panel="delivery-logs">
          <ConfigurationDeliveryLogsSection
            settings={settings}
            messagingProviders={messagingProviders}
            messagingProvidersLoaded={messagingProvidersLoaded}
          />
        </div>
      ) : (
        <AnalyticsInboxTab />
      )}
    </div>
  )
}
