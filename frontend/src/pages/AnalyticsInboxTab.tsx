import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from '../components/Toast'
import { Card, EmptyState, Field, Pill, SectionTitle } from '../components/ui'
import type { Client, ClientMessage, InboxChannel, InboxStatus, InboxThread } from '../lib/types'
import { formatDateTime } from '../lib/format'

const CHANNELS: InboxChannel[] = ['EMAIL', 'WHATSAPP', 'VIBER']

function clientName(row: { firstName?: string | null; lastName?: string | null }) {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || 'Client'
}

function channelLabel(channel: InboxChannel) {
  if (channel === 'WHATSAPP') return 'WhatsApp'
  if (channel === 'VIBER') return 'Viber'
  return 'Email'
}

function channelTone(channel: InboxChannel): 'default' | 'green' | 'red' | 'blue' {
  if (channel === 'EMAIL') return 'blue'
  if (channel === 'WHATSAPP') return 'green'
  return 'default'
}

function statusTone(status: InboxStatus): 'default' | 'green' | 'red' | 'blue' {
  return status === 'SENT' ? 'green' : 'red'
}

function statusLabel(status: InboxStatus) {
  if (status === 'SENT') return 'Sent'
  if (status === 'RECEIVED') return 'Received'
  return 'Failed'
}

function senderSummary(senderName?: string | null, senderPhone?: string | null) {
  const label = [senderName, senderPhone].filter(Boolean).join(' · ')
  return label || null
}

export function AnalyticsInboxTab() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [clientIdFilter, setClientIdFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState<'' | InboxChannel>('')
  const [statusFilter, setStatusFilter] = useState<'' | InboxStatus>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [composeChannel, setComposeChannel] = useState<InboxChannel>('EMAIL')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [sending, setSending] = useState(false)

  const clientsQuery = useQuery<Client[]>({
    queryKey: ['inbox-clients'],
    queryFn: async () => {
      const res = await api.get<Client[]>('/clients')
      return res.data ?? []
    },
  })

  const threadsQuery = useQuery<InboxThread[]>({
    queryKey: ['inbox-threads', search, clientIdFilter, channelFilter, statusFilter, from, to],
    queryFn: async () => {
      const res = await api.get<InboxThread[]>('/inbox/threads', {
        params: {
          search: search.trim() || undefined,
          clientId: clientIdFilter ? Number(clientIdFilter) : undefined,
          channel: channelFilter || undefined,
          status: statusFilter || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      })
      return res.data ?? []
    },
  })

  const selectedThread = useMemo(
    () => (threadsQuery.data ?? []).find((row) => row.clientId === selectedClientId) ?? null,
    [threadsQuery.data, selectedClientId],
  )

  useEffect(() => {
    const rows = threadsQuery.data ?? []
    if (!rows.length) {
      if (clientIdFilter) setSelectedClientId(Number(clientIdFilter))
      return
    }
    const exists = rows.some((row) => row.clientId === selectedClientId)
    if (!exists) setSelectedClientId(rows[0].clientId)
  }, [threadsQuery.data, selectedClientId, clientIdFilter])

  useEffect(() => {
    if (selectedThread?.lastChannel) setComposeChannel(selectedThread.lastChannel)
  }, [selectedThread?.lastChannel])

  const messagesQuery = useQuery<ClientMessage[]>({
    queryKey: ['inbox-messages', selectedClientId],
    enabled: selectedClientId != null,
    queryFn: async () => {
      const res = await api.get<ClientMessage[]>(`/inbox/clients/${selectedClientId}/messages`)
      return res.data ?? []
    },
  })

  const selectedClient = useMemo(
    () => (clientsQuery.data ?? []).find((row) => row.id === selectedClientId) ?? null,
    [clientsQuery.data, selectedClientId],
  )

  const recentMessages = messagesQuery.data ?? []

  const sendMessage = async () => {
    if (!selectedClientId || !composeBody.trim()) return
    setSending(true)
    try {
      await api.post('/inbox/messages', {
        clientId: selectedClientId,
        channel: composeChannel,
        subject: composeChannel === 'EMAIL' ? composeSubject.trim() || null : null,
        body: composeBody.trim(),
      })
      showToast('success', `${channelLabel(composeChannel)} message sent.`)
      setComposeBody('')
      if (composeChannel === 'EMAIL') setComposeSubject('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inbox-threads'] }),
        queryClient.invalidateQueries({ queryKey: ['inbox-messages', selectedClientId] }),
      ])
      window.dispatchEvent(new Event('clients-updated'))
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="stack gap-lg">
      <Card className="analytics-inbox-hero">
        <div className="analytics-inbox-hero__copy">
          <SectionTitle>Inbox</SectionTitle>
          <p className="muted analytics-inbox-hero__text">
            A unified communication hub for email, direct WhatsApp Cloud API, and opt-in Viber Bot messages. Every inbound and outbound message is saved under the client timeline.
          </p>
        </div>
        <div className="analytics-inbox-hero__stats">
          <div className="analytics-inbox-stat">
            <span>Threads</span>
            <strong>{threadsQuery.data?.length ?? 0}</strong>
          </div>
          <div className="analytics-inbox-stat">
            <span>Messages</span>
            <strong>{recentMessages.length}</strong>
          </div>
        </div>
      </Card>

      <Card className="analytics-inbox-filters-card">
        <div className="analytics-inbox-filters">
          <div className="analytics-inbox-search-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, channel, subject, recipient..."
            />
          </div>
          <select value={clientIdFilter} onChange={(e) => setClientIdFilter(e.target.value)}>
            <option value="">All clients</option>
            {(clientsQuery.data ?? []).map((client) => (
              <option key={client.id} value={client.id}>{clientName(client)}</option>
            ))}
          </select>
          <select value={channelFilter} onChange={(e) => setChannelFilter((e.target.value || '') as '' | InboxChannel)}>
            <option value="">All channels</option>
            {CHANNELS.map((channel) => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter((e.target.value || '') as '' | InboxStatus)}>
            <option value="">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="RECEIVED">Received</option>
            <option value="FAILED">Failed</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <div className="analytics-inbox-layout">
        <Card className="analytics-inbox-threads-card">
          <div className="analytics-inbox-panel-header">
            <div>
              <strong>Conversations</strong>
              <p className="muted">Latest message per client.</p>
            </div>
          </div>

          <div className="analytics-inbox-thread-list">
            {threadsQuery.isLoading ? (
              <div className="muted">Loading inbox...</div>
            ) : (threadsQuery.data ?? []).length === 0 ? (
              <EmptyState title="No conversations yet" text="Send the first message to start a client thread." />
            ) : (
              (threadsQuery.data ?? []).map((thread) => {
                const active = thread.clientId === selectedClientId
                return (
                  <button
                    type="button"
                    key={thread.clientId}
                    className={`analytics-inbox-thread${active ? ' active' : ''}`}
                    onClick={() => setSelectedClientId(thread.clientId)}
                  >
                    <div className="analytics-inbox-thread__top">
                      <strong>{thread.clientFirstName} {thread.clientLastName}</strong>
                      <span>{thread.lastSentAt ? formatDateTime(thread.lastSentAt) : '—'}</span>
                    </div>
                    <div className="analytics-inbox-thread__meta">
                      <Pill tone={channelTone(thread.lastChannel)}>{channelLabel(thread.lastChannel)}</Pill>
                      <Pill tone={statusTone(thread.lastStatus)}>{statusLabel(thread.lastStatus)}</Pill>
                      <span>{thread.messageCount} msg</span>
                    </div>
                    {thread.lastDirection === 'OUTBOUND' && senderSummary(thread.lastSenderName, thread.lastSenderPhone) && (
                      <div className="analytics-inbox-thread__sender muted">Sent by {senderSummary(thread.lastSenderName, thread.lastSenderPhone)}</div>
                    )}
                    {thread.lastSubject && <div className="analytics-inbox-thread__subject">{thread.lastSubject}</div>}
                    <div className="analytics-inbox-thread__preview">{thread.lastPreview || 'No preview available.'}</div>
                  </button>
                )
              })
            )}
          </div>
        </Card>

        <Card className="analytics-inbox-thread-view-card">
          <div className="analytics-inbox-panel-header analytics-inbox-panel-header--thread">
            <div>
              <strong>{selectedClient ? clientName(selectedClient) : 'Select a client'}</strong>
              <p className="muted">
                {selectedClient ? [selectedClient.email, selectedClient.phone].filter(Boolean).join(' · ') || 'No contact info' : 'Choose a client thread to read the timeline.'}
              </p>
            </div>
            <div className="analytics-inbox-panel-tags">
              {selectedThread && <Pill tone={channelTone(selectedThread.lastChannel)}>{channelLabel(selectedThread.lastChannel)}</Pill>}
            </div>
          </div>

          <div className="analytics-inbox-messages">
            {selectedClientId == null ? (
              <EmptyState title="No client selected" text="Pick a conversation from the left, or choose a client in the composer to start a new one." />
            ) : messagesQuery.isLoading ? (
              <div className="muted">Loading thread...</div>
            ) : recentMessages.length === 0 ? (
              <EmptyState title="No saved messages yet" text="Write the first message in the composer." />
            ) : (
              recentMessages.map((message) => (
                <div key={message.id} className={`analytics-inbox-bubble analytics-inbox-bubble--${message.direction === 'OUTBOUND' ? 'out' : 'in'}`}>
                  <div className="analytics-inbox-bubble__meta">
                    <Pill tone={channelTone(message.channel)}>{channelLabel(message.channel)}</Pill>
                    <Pill tone={statusTone(message.status)}>{statusLabel(message.status)}</Pill>
                    <span>{message.sentAt ? formatDateTime(message.sentAt) : formatDateTime(message.createdAt)}</span>
                    {message.direction === 'OUTBOUND' && senderSummary(message.senderName, message.senderPhone) && (
                      <span>Sent by {senderSummary(message.senderName, message.senderPhone)}</span>
                    )}
                  </div>
                  {message.subject && <strong className="analytics-inbox-bubble__subject">{message.subject}</strong>}
                  <div className="analytics-inbox-bubble__body">{message.body}</div>
                  {message.errorMessage && <div className="analytics-inbox-bubble__error">{message.errorMessage}</div>}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="analytics-inbox-compose-card">
          <div className="analytics-inbox-panel-header">
            <div>
              <strong>Compose</strong>
              <p className="muted">Send and save messages from one place.</p>
            </div>
          </div>

          <div className="analytics-inbox-compose-form stack gap-md">
            <Field label="Client">
              <select
                value={selectedClientId ?? ''}
                onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select client</option>
                {(clientsQuery.data ?? []).map((client) => (
                  <option key={client.id} value={client.id}>{clientName(client)}</option>
                ))}
              </select>
            </Field>

            <div className="analytics-inbox-channel-switch">
              {CHANNELS.map((channel) => {
                const disabled = channel === 'WHATSAPP'
                  ? !selectedClient?.whatsappOptIn || !selectedClient?.phone
                  : channel === 'VIBER'
                    ? !selectedClient?.viberConnected
                    : false
                return (
                  <button
                    key={channel}
                    type="button"
                    className={composeChannel === channel ? 'active' : ''}
                    onClick={() => !disabled && setComposeChannel(channel)}
                    disabled={disabled}
                    title={disabled ? (channel === 'VIBER' ? 'Viber is available only for linked clients.' : 'Add a client phone number and WhatsApp opt-in.') : undefined}
                  >
                    {channelLabel(channel)}
                  </button>
                )
              })}
            </div>

            {composeChannel === 'EMAIL' && (
              <Field label="Subject">
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                />
              </Field>
            )}

            <Field label="Message">
              <textarea
                rows={10}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder={composeChannel === 'EMAIL' ? 'Write your email...' : `Write your ${channelLabel(composeChannel)} message...`}
              />
            </Field>

            <div className="analytics-inbox-channel-note muted">
              {composeChannel === 'EMAIL'
                ? 'Email uses the SMTP settings already configured on the backend.'
                : composeChannel === 'WHATSAPP'
                  ? (selectedClient?.whatsappOptIn ? 'WhatsApp uses the client phone number. The consultant phone is used as the sender reference in the app, while delivery still relies on your configured WhatsApp API sender.' : 'Mark this client as WhatsApp opt-in before sending.')
                  : (selectedClient?.viberConnected ? 'Viber uses the official bot API and sends only to clients already linked to your Viber bot.' : 'Viber becomes available after the client is linked to your Viber bot.')}
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !selectedClientId || !composeBody.trim() || (composeChannel === 'WHATSAPP' && !selectedClient?.whatsappOptIn) || (composeChannel === 'VIBER' && !selectedClient?.viberConnected)}
              >
                {sending ? 'Sending…' : `Send ${channelLabel(composeChannel)}`}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
