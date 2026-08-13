import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import type { InboxThread, MessageView } from '../api/types'
import { MessageIcon, SendIcon } from '../components/Icons'
import { EmptyState, ErrorState, PageLoader, Spinner } from '../components/Loading'
import { ProviderAvatar } from '../components/ProviderAvatar'
import { formatDateTime } from '../utils'

function messageBody(message: MessageView) {
  return String(message.body ?? message['content'] ?? message['text'] ?? '')
}
function messageTime(message: MessageView) {
  const value = message.sentAt ?? message.createdAt ?? message['timestamp']
  return typeof value === 'string' ? value : null
}
function isGuestMessage(message: MessageView) {
  const sender = String(message.senderType ?? message.direction ?? message['sender'] ?? '').toUpperCase()
  return sender.includes('GUEST') || sender.includes('CLIENT') || sender.includes('OUTBOUND')
}

export function InboxPage() {
  const queryClient = useQueryClient()
  const threads = useQuery({ queryKey: ['customer-inbox-threads'], queryFn: customerApi.inboxThreads })
  const [selected, setSelected] = useState<InboxThread | null>(null)
  const [body, setBody] = useState('')

  const messages = useQuery({
    queryKey: ['customer-inbox-messages', selected?.provider.companyId],
    queryFn: () => customerApi.messages(selected!.provider.companyId),
    enabled: Boolean(selected?.provider.companyId),
  })
  const send = useMutation({
    mutationFn: () => customerApi.sendMessage(selected!.provider.companyId, body.trim()),
    onSuccess: async () => {
      setBody('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer-inbox-messages', selected?.provider.companyId] }),
        queryClient.invalidateQueries({ queryKey: ['customer-inbox-threads'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-home-shell'] }),
      ])
    },
  })

  const orderedMessages = useMemo(() => [...(messages.data || [])].sort((a, b) => String(messageTime(a) || '').localeCompare(String(messageTime(b) || ''))), [messages.data])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim() || !selected || send.isPending) return
    send.mutate()
  }

  if (threads.isLoading) return <PageLoader/>
  if (threads.isError) return <ErrorState onRetry={() => void threads.refetch()}/>
  const items = threads.data || []

  if (!items.length) return <div className="page-stack"><div className="page-intro"><div><span className="overline">Sporočila</span><h2>Prejeto</h2><p>Pogovori z vašimi ponudniki.</p></div></div><EmptyState title="Ni sporočil" description="Ko vam ponudnik pošlje sporočilo, se bo pogovor prikazal tukaj."/></div>

  return <div className={`inbox-layout ${selected ? 'inbox-layout--thread-open' : ''}`}>
    <section className="inbox-sidebar">
      <div className="inbox-sidebar__heading"><span className="overline">Sporočila</span><h2>Prejeto</h2></div>
      <div className="thread-list">{items.map(thread => <button key={thread.threadKey} className={`thread-row ${selected?.threadKey === thread.threadKey ? 'thread-row--active' : ''}`} onClick={() => setSelected(thread)}><ProviderAvatar name={thread.provider.companyName} logoUrl={thread.provider.logoUrl} size="sm"/><div><div className="thread-row__top"><strong>{thread.provider.companyName}</strong>{thread.lastSentAt && <time>{formatDateTime(thread.lastSentAt, { day: 'numeric', month: 'short' })}</time>}</div><p>{thread.lastPreview || 'Odprite pogovor'}</p></div>{thread.unreadCount > 0 && <b>{thread.unreadCount > 9 ? '9+' : thread.unreadCount}</b>}</button>)}</div>
    </section>
    <section className="conversation-panel">
      {!selected ? <div className="conversation-empty"><MessageIcon size={34}/><h3>Izberite pogovor</h3><p>Odprite ponudnika na levi, da prikažete sporočila.</p></div> : <>
        <header className="conversation-header"><button className="conversation-back" onClick={() => setSelected(null)}>‹</button><ProviderAvatar name={selected.provider.companyName} logoUrl={selected.provider.logoUrl} size="sm"/><div><strong>{selected.provider.companyName}</strong><span>{selected.provider.locationName || selected.provider.locationAddress || 'Calendra'}</span></div></header>
        <div className="message-stream">{messages.isLoading ? <PageLoader/> : messages.isError ? <ErrorState onRetry={() => void messages.refetch()}/> : orderedMessages.length ? orderedMessages.map((message, index) => <div key={String(message.id ?? message.messageId ?? index)} className={`message-bubble ${isGuestMessage(message) ? 'message-bubble--mine' : ''}`}><p>{messageBody(message) || 'Sporočilo'}</p><span>{message.senderName && !isGuestMessage(message) ? `${message.senderName} · ` : ''}{formatDateTime(messageTime(message), { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span></div>) : <div className="conversation-empty"><p>V tem pogovoru še ni sporočil.</p></div>}</div>
        <form className="message-compose" onSubmit={submit}><textarea rows={1} value={body} onChange={e => setBody(e.target.value)} placeholder="Napišite sporočilo …"/><button className="icon-button icon-button--primary" disabled={!body.trim() || send.isPending} aria-label="Pošlji">{send.isPending ? <Spinner small/> : <SendIcon size={20}/>}</button></form>
      </>}
    </section>
  </div>
}
