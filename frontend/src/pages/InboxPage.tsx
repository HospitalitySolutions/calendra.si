import '../styles/features.booking.css'
import '../styles/features/modern-inbox.css'
import '../styles/main/inbox-modern.css'
import '../styles/main/inbox-preview.css'
import '../styles/main/inbox-tabs.css'
import '../styles/main/inbox-workspace.css'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthenticatedUser } from '../authUserContext'
import { hasEmployeePermission } from '../lib/employeePermissions'
import { useLocale } from '../locale'
import { settingsQueryOptions } from '../queries/sharedQueryOptions'
import { inboxCapabilitiesQueryOptions } from '../queries/remainingQueryOptions'
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


type InboxPageTabIconName = 'messages' | 'deliveryLogs'

function InboxPageTabIcon({ name }: { name: InboxPageTabIconName }) {
  if (name === 'deliveryLogs') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16v12H4z" />
      <path d="m4 10 4-4 4 4 4-4" />
    </svg>
  )
}

export function InboxPage({ inboxModuleEnabled = true }: InboxPageProps) {
  const me = useAuthenticatedUser()
  const activeUnitId = me.activeUnitId ?? me.companyId
  const queryClient = useQueryClient()
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
      queryClient.fetchQuery(settingsQueryOptions(activeUnitId)).catch(() => ({} as Record<string, string>)),
      queryClient.fetchQuery(inboxCapabilitiesQueryOptions<MessagingProviderCapabilities>()).catch(() => ({} as MessagingProviderCapabilities)),
    ]).then(([settingsData, capabilities]) => {
      if (cancelled) return
      setSettings(settingsData || {})
      setMessagingProviders({
        whatsappEnabled: capabilities?.whatsappEnabled === true,
        viberEnabled: capabilities?.viberEnabled === true,
      })
      setMessagingProvidersLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [activeUnitId, canViewDeliveryLogs, queryClient])

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
        <nav className="inbox-page-tabs" role="tablist" aria-label={locale === 'sl' ? 'Komunikacijski zavihki' : 'Communication tabs'}>
          <button
            type="button"
            role="tab"
            aria-selected={requestedTab === 'messages'}
            className={`inbox-page-tab${requestedTab === 'messages' ? ' active' : ''}`}
            aria-current={requestedTab === 'messages' ? 'page' : undefined}
            onClick={() => openTab('messages')}
          >
            <span className="inbox-page-tab-icon" aria-hidden><InboxPageTabIcon name="messages" /></span>
            <span >{labels.messages}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={requestedTab === 'deliveryLogs'}
            className={`inbox-page-tab${requestedTab === 'deliveryLogs' ? ' active' : ''}`}
            aria-current={requestedTab === 'deliveryLogs' ? 'page' : undefined}
            onClick={() => openTab('deliveryLogs')}
          >
            <span className="inbox-page-tab-icon" aria-hidden><InboxPageTabIcon name="deliveryLogs" /></span>
            <span >{labels.deliveryLogs}</span>
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
