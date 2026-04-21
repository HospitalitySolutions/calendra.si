import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from '../components/Toast'
import { Card, EmptyState, Field, Pill, SectionTitle } from '../components/ui'
import type { Client, ClientMessage, InboxChannel, InboxStatus, InboxThread } from '../lib/types'
import { formatDateTime } from '../lib/format'
import { useLocale } from '../locale'

const CHANNELS: InboxChannel[] = ['EMAIL', 'WHATSAPP', 'VIBER', 'GUEST_APP']
type RecipientMode = 'single' | 'bulk'
type ComposeAttachmentStatus = 'pending' | 'uploading' | 'uploaded' | 'failed'
type ComposeAttachmentItem = {
  id: string
  file: File
  progress: number
  status: ComposeAttachmentStatus
  error: string
  uploadedFileId?: number
}

const MAX_COMPOSE_ATTACHMENT_COUNT = 10
const MAX_COMPOSE_ATTACHMENT_BYTES = 50 * 1024 * 1024
const ACCEPTED_ATTACHMENT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
const ACCEPTED_ATTACHMENT_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
const ACCEPTED_ATTACHMENT_INPUT = ACCEPTED_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',')

function formatFileSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = sizeBytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

function fileExtension(name?: string | null) {
  if (!name) return ''
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

function isImageMime(contentType?: string | null) {
  return !!contentType && contentType.toLowerCase().startsWith('image/')
}

function isPdfMime(contentType?: string | null) {
  return (contentType || '').toLowerCase() === 'application/pdf'
}

function isImageAttachment(attachment: { fileName: string; contentType?: string | null }) {
  return isImageMime(attachment.contentType) || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(fileExtension(attachment.fileName))
}

function isPdfAttachment(attachment: { fileName: string; contentType?: string | null }) {
  return isPdfMime(attachment.contentType) || fileExtension(attachment.fileName) === 'pdf'
}

function attachmentKindLabel(attachment: { fileName: string; contentType?: string | null }, copy: any) {
  if (isImageAttachment(attachment)) return copy.imageFileLabel
  if (isPdfAttachment(attachment)) return copy.pdfFileLabel
  const ext = fileExtension(attachment.fileName)
  return ext ? ext.toUpperCase() : copy.fileLabel
}

function newComposeAttachmentItem(file: File): ComposeAttachmentItem {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    progress: 0,
    status: 'pending',
    error: '',
  }
}

function normalizeAttachmentSelection(existing: ComposeAttachmentItem[], files: File[], copy: any) {
  const accepted = [...existing]
  const errors: string[] = []
  const seen = new Set(accepted.map((entry) => `${entry.file.name}-${entry.file.size}-${entry.file.lastModified}`))
  let totalBytes = accepted.reduce((sum, entry) => sum + Math.max(entry.file.size, 0), 0)
  for (const file of files) {
    const key = `${file.name}-${file.size}-${file.lastModified}`
    if (seen.has(key)) continue
    seen.add(key)
    if (accepted.length >= MAX_COMPOSE_ATTACHMENT_COUNT) {
      errors.push(copy.attachmentsTooMany(MAX_COMPOSE_ATTACHMENT_COUNT))
      break
    }
    const normalizedType = (file.type || '').toLowerCase()
    const extension = fileExtension(file.name)
    const supported = ACCEPTED_ATTACHMENT_CONTENT_TYPES.has(normalizedType) || ACCEPTED_ATTACHMENT_EXTENSIONS.includes(extension)
    if (!supported) {
      errors.push(copy.attachmentUnsupported(file.name))
      continue
    }
    if (file.size > MAX_COMPOSE_ATTACHMENT_BYTES) {
      errors.push(copy.attachmentTooLarge(file.name, formatFileSize(MAX_COMPOSE_ATTACHMENT_BYTES)))
      continue
    }
    if (totalBytes + file.size > MAX_COMPOSE_ATTACHMENT_BYTES) {
      errors.push(copy.attachmentsTotalTooLarge(formatFileSize(MAX_COMPOSE_ATTACHMENT_BYTES)))
      continue
    }
    accepted.push(newComposeAttachmentItem(file))
    totalBytes += file.size
  }
  return { files: accepted, errors: Array.from(new Set(errors)) }
}

function AttachmentPreviewCard({
  clientId,
  attachment,
  copy,
  onDownload,
}: {
  clientId: number
  attachment: NonNullable<ClientMessage['attachments']>[number]
  copy: any
  onDownload: (clientId: number, attachment: { clientFileId: number; fileName: string; contentType?: string | null }) => Promise<void>
}) {
  const previewable = isImageAttachment(attachment) || isPdfAttachment(attachment)
  const previewQuery = useQuery({
    queryKey: ['inbox-attachment-preview', clientId, attachment.id],
    enabled: previewable,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await api.get(`/clients/${clientId}/files/${attachment.clientFileId}`, { responseType: 'blob' })
      return response.data as Blob
    },
  })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!previewQuery.data) {
      setPreviewUrl((current) => {
        if (current) window.URL.revokeObjectURL(current)
        return null
      })
      return
    }
    const nextUrl = window.URL.createObjectURL(previewQuery.data)
    setPreviewUrl((current) => {
      if (current) window.URL.revokeObjectURL(current)
      return nextUrl
    })
    return () => {
      window.URL.revokeObjectURL(nextUrl)
    }
  }, [previewQuery.data])

  const openPreview = () => {
    if (!previewUrl) return
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 16, padding: 12, background: 'var(--color-surface)' }}>
      {isImageAttachment(attachment) && previewUrl ? (
        <button
          type="button"
          onClick={openPreview}
          title={copy.openPreview}
          style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', display: 'block', marginBottom: 10 }}
        >
          <img
            src={previewUrl}
            alt={attachment.fileName}
            style={{ display: 'block', maxWidth: 240, maxHeight: 180, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--color-border)' }}
          />
        </button>
      ) : null}
      <div className="stack gap-xs">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <strong style={{ wordBreak: 'break-word' }}>{attachment.fileName}</strong>
          <Pill tone={isImageAttachment(attachment) ? 'green' : isPdfAttachment(attachment) ? 'blue' : 'default'}>{attachmentKindLabel(attachment, copy)}</Pill>
        </div>
        <div className="analytics-inbox-thread__sender muted">{formatFileSize(attachment.sizeBytes)}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {previewable ? (
            <button type="button" className="secondary" onClick={openPreview} disabled={!previewUrl || previewQuery.isLoading}>
              {previewQuery.isLoading ? copy.loadingPreview : copy.openPreview}
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={() => void onDownload(clientId, attachment)}>{copy.downloadAttachment}</button>
        </div>
      </div>
    </div>
  )
}

function ComposeAttachmentCard({
  attachment,
  onRemove,
  onRetry,
  copy,
}: {
  attachment: ComposeAttachmentItem
  onRemove: () => void
  onRetry: () => void
  copy: any
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const { file } = attachment

  useEffect(() => {
    if (!isImageMime(file.type)) return
    const nextUrl = window.URL.createObjectURL(file)
    setPreviewUrl(nextUrl)
    return () => window.URL.revokeObjectURL(nextUrl)
  }, [file])

  const tone = attachment.status === 'failed'
    ? 'red'
    : attachment.status === 'uploaded'
      ? 'green'
      : attachment.status === 'uploading'
        ? 'blue'
        : isImageMime(file.type)
          ? 'green'
          : fileExtension(file.name) === 'pdf'
            ? 'blue'
            : 'default'

  const statusLabel = attachment.status === 'uploaded'
    ? copy.attachmentUploaded
    : attachment.status === 'uploading'
      ? copy.attachmentUploading(attachment.progress)
      : attachment.status === 'failed'
        ? copy.attachmentUploadFailed
        : copy.attachmentPending

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 16, padding: 12, background: 'var(--color-surface)' }}>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={file.name}
          style={{ display: 'block', maxWidth: 220, maxHeight: 160, borderRadius: 12, objectFit: 'cover', marginBottom: 10, border: '1px solid var(--color-border)' }}
        />
      ) : null}
      <div className="stack gap-xs">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <strong style={{ wordBreak: 'break-word' }}>{file.name}</strong>
          <Pill tone={tone as any}>
            {isImageMime(file.type) ? copy.imageFileLabel : fileExtension(file.name) === 'pdf' ? copy.pdfFileLabel : fileExtension(file.name).toUpperCase() || copy.fileLabel}
          </Pill>
        </div>
        <div className="analytics-inbox-thread__sender muted">{formatFileSize(file.size)}</div>
        <div className="analytics-inbox-thread__sender muted">{statusLabel}</div>
        {attachment.status === 'uploading' ? (
          <progress value={Math.max(0, Math.min(100, attachment.progress))} max={100} style={{ width: '100%' }} />
        ) : null}
        {attachment.error ? <div className="error">{attachment.error}</div> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {attachment.status === 'failed' ? (
            <button type="button" className="secondary" onClick={onRetry}>{copy.retryAttachment}</button>
          ) : null}
          <button type="button" className="secondary" onClick={onRemove}>{copy.removeAttachment}</button>
        </div>
      </div>
    </div>
  )
}

function clientName(row: { firstName?: string | null; lastName?: string | null }) {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || 'Client'
}

function channelLabel(channel: InboxChannel) {
  if (channel === 'WHATSAPP') return 'WhatsApp'
  if (channel === 'VIBER') return 'Viber'
  if (channel === 'GUEST_APP') return 'Guest App'
  return 'Email'
}

function channelTone(channel: InboxChannel): 'default' | 'green' | 'red' | 'blue' {
  if (channel === 'EMAIL') return 'blue'
  if (channel === 'WHATSAPP') return 'green'
  if (channel === 'GUEST_APP') return 'blue'
  return 'default'
}

function statusTone(status: InboxStatus): 'default' | 'green' | 'red' | 'blue' {
  if (status === 'FAILED') return 'red'
  if (status === 'RECEIVED') return 'blue'
  return 'green'
}

function statusLabel(status: InboxStatus, copy: any) {
  if (status === 'SENT') return copy.sent
  if (status === 'DELIVERED') return copy.delivered
  if (status === 'READ') return copy.read
  if (status === 'RECEIVED') return copy.received
  return copy.failed
}

function senderSummary(senderName?: string | null, senderPhone?: string | null) {
  const label = [senderName, senderPhone].filter(Boolean).join(' · ')
  return label || null
}

function threadSenderLabel(thread: InboxThread, copy: any) {
  const label = senderSummary(thread.lastSenderName, thread.lastSenderPhone)
  if (!label) return null
  return thread.lastDirection === 'INBOUND' ? `${copy.clientPrefix} · ${label}` : `${copy.sentBy} ${label}`
}

function messageSenderLabel(message: ClientMessage, copy: any) {
  const label = senderSummary(message.senderName, message.senderPhone)
  if (!label) return null
  return message.direction === 'INBOUND' ? `${copy.clientPrefix} · ${label}` : `${copy.sentBy} ${label}`
}

function matchesClientSearch(client: Client, value: string) {
  const query = value.trim().toLowerCase()
  if (!query) return true
  const haystack = [
    clientName(client),
    client.email ?? '',
    client.phone ?? '',
    client.whatsappPhone ?? '',
  ].join(' ').toLowerCase()
  return haystack.includes(query)
}

function hasEmailTarget(client?: Client | null) {
  return !!client?.email?.trim()
}

function hasWhatsAppTarget(client?: Client | null) {
  return !!(client?.whatsappPhone?.trim() || client?.phone?.trim())
}

function hasViberTarget(client?: Client | null) {
  return !!client?.viberConnected
}

function hasGuestAppTarget(client?: Client | null) {
  return !!client?.guestAppLinked
}

function isClientEligibleForChannel(client: Client | null | undefined, channel: InboxChannel) {
  if (!client) return false
  if (channel === 'EMAIL') return hasEmailTarget(client)
  if (channel === 'WHATSAPP') return !!client.whatsappOptIn && hasWhatsAppTarget(client)
  if (channel === 'VIBER') return hasViberTarget(client)
  return hasGuestAppTarget(client)
}

function clientEligibilityLabel(client: Client, channel: InboxChannel, copy: any) {
  if (channel === 'EMAIL') return hasEmailTarget(client) ? copy.ready : copy.missingEmail
  if (channel === 'WHATSAPP') {
    if (!client.whatsappOptIn) return copy.optInNeeded
    return hasWhatsAppTarget(client) ? copy.ready : copy.missingPhone
  }
  if (channel === 'VIBER') return client.viberConnected ? copy.ready : copy.notLinked
  return client.guestAppLinked ? copy.ready : copy.notLinkedGuestApp
}

export function AnalyticsInboxTab() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { locale } = useLocale()
  const copy = locale === 'sl' ? {
    clientLabel: 'Stranka',
    ready: 'Pripravljeno',
    missingEmail: 'Manjka e-pošta',
    optInNeeded: 'Potrebno soglasje',
    missingPhone: 'Manjka telefon',
    notLinked: 'Ni povezano',
    notLinkedGuestApp: 'Ni povezano z gost aplikacijo',
    sent: 'Poslano',
    received: 'Prejeto',
    delivered: 'Dostavljeno',
    read: 'Prebrano',
    failed: 'Neuspešno',
    clientPrefix: 'Stranka',
    sentBy: 'Poslal',
    searchPlaceholder: 'Išči po stranki, kanalu, zadevi ali prejemniku...',
    noConversationsTitle: 'Pogovorov še ni',
    noConversationsText: 'Pošljite prvo sporočilo za začetek pogovora s stranko.',
    noClientSelectedTitle: 'Stranka ni izbrana',
    noClientSelectedText: 'Izberite pogovor na levi ali stranko v obrazcu, da začnete novega.',
    loadingThread: 'Nalagam pogovor...',
    noSavedMessagesTitle: 'Shranjenih sporočil še ni',
    noSavedMessagesText: 'Prvo sporočilo napišite v obrazcu.',
    compose: 'Novo sporočilo',
    composeSubtitle: 'Pošiljajte in shranjujte sporočila na enem mestu.',
    singleClient: 'Ena stranka',
    bulkSend: 'Množično pošiljanje',
    selectClient: 'Izberi stranko',
    recipients: 'Prejemniki',
    filterClients: 'Filtriraj stranke po imenu, e-pošti ali telefonu',
    selectEligible: 'Izberi ustrezne',
    selectAll: 'Izberi vse',
    clear: 'Počisti',
    selectedSummary: (selected: number, eligible: number, channel: string) => `${selected} izbranih · ${eligible} ustreznih za ${channel.toLowerCase()}`,
    noClientsMatch: 'Nobena stranka ne ustreza iskanju.',
    noContactInfo: 'Ni kontaktnih podatkov',
    bulkSendTitle: 'Množično pošiljanje trenutno podpira le e-pošto in WhatsApp.',
    addEmailAddress: 'Dodajte e-poštni naslov stranke.',
    addWhatsApp: 'Dodajte telefonsko številko stranke in soglasje za WhatsApp.',
    viberOnlyLinked: 'Viber je na voljo samo za povezane stranke.',
    guestAppOnlyLinked: 'Gost aplikacija je na voljo samo za povezane goste.',
    subject: 'Zadeva',
    message: 'Sporočilo',
    writeEmail: 'Napišite e-pošto...',
    writeMessage: (channel: string) => `Napišite ${channel} sporočilo...`,
    bulkEmailNote: 'Množična e-pošta pošlje isto sporočilo vsem izbranim strankam z e-poštnim naslovom.',
    bulkWhatsAppNote: 'Množični WhatsApp se pošlje samo izbranim strankam s soglasjem in WhatsApp številko.',
    bulkChannelUnavailable: 'Množično pošiljanje je trenutno na voljo za e-pošto in WhatsApp.',
    emailNote: 'E-pošta uporablja SMTP nastavitve, ki so že nastavljene v zaledju.',
    whatsappNoteReady: 'WhatsApp uporablja telefonsko številko stranke ali WhatsApp številko. Telefon zaposlenega se v aplikaciji uporabi kot referenca pošiljatelja, dostava pa še vedno uporablja vaš nastavljen WhatsApp API pošiljatelj.',
    whatsappNoteOptIn: 'Pred pošiljanjem označite to stranko kot WhatsApp opt-in.',
    viberNoteReady: 'Viber uporablja uradni bot API in pošilja samo strankam, ki so že povezane z vašim Viber botom.',
    viberNotePending: 'Viber je na voljo, ko je stranka povezana z vašim Viber botom.',
    guestAppNoteReady: 'Guest App pošlje sporočilo neposredno v nabiralnik gostove mobilne aplikacije.',
    guestAppNotePending: 'Gost mora imeti aktivno povezavo z vašim tenantom v mobilni aplikaciji.',
    sending: 'Pošiljanje…',
    sendSingle: (channel: string) => `Pošlji ${channel}`,
    sendBulk: (channel: string, count: number) => `Pošlji ${channel} ${count} ${count === 1 ? 'stranki' : 'strankam'}`,
    messageSent: (channel: string) => `${channel} sporočilo je poslano.`,
    sendFailed: 'Pošiljanje sporočila ni uspelo.',
    attachments: 'Priponke',
    addAttachments: 'Dodaj priponke',
    attachmentsReady: 'Priponke bodo shranjene med datotekami stranke in poslane v pogovor Guest App.',
    attachmentsGuestOnly: 'Priponke so trenutno podprte samo za posamezni pogovor Guest App.',
    removeAttachment: 'Odstrani',
    attachmentLabel: (count: number) => `${count} ${count === 1 ? 'priponka' : 'priponke'}`,
    imageFileLabel: 'Slika',
    pdfFileLabel: 'PDF',
    fileLabel: 'Datoteka',
    openPreview: 'Odpri predogled',
    loadingPreview: 'Nalagam predogled…',
    downloadAttachment: 'Prenesi',
    attachmentUnsupported: (name: string) => `${name} ni podprt tip datoteke. Dovoljene so slike, PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, PPT in PPTX.`,
    attachmentTooLarge: (name: string, max: string) => `${name} presega največjo velikost ${max}.`,
    attachmentsTooMany: (max: number) => `Na sporočilo lahko dodate največ ${max} priponk.`,
    attachmentsTotalTooLarge: (max: string) => `Skupna velikost priponk mora biti ${max} ali manj.`,
    attachmentPending: 'Pripravljeno za nalaganje',
    attachmentUploading: (progress: number) => `Nalagam ${progress}%`,
    attachmentUploaded: 'Naloženo',
    attachmentUploadFailed: 'Nalaganje ni uspelo',
    retryAttachment: 'Poskusi znova',
    attachmentsNeedRetry: 'Odstranite ali ponovno naložite neuspele priponke, nato pošljite sporočilo.',
    bulkSuccess: (parts: string[]) => `Poslano: ${parts.join(' · ')}.`,
    bulkFailed: (channel: string) => `Pošiljanje ${channel.toLowerCase()} sporočil ni uspelo.`,
  } : {
    clientLabel: 'Client',
    ready: 'Ready',
    missingEmail: 'Missing email',
    optInNeeded: 'Opt-in needed',
    missingPhone: 'Missing phone',
    notLinked: 'Not linked',
    notLinkedGuestApp: 'Not linked to Guest App',
    sent: 'Sent',
    received: 'Received',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Failed',
    clientPrefix: 'Client',
    sentBy: 'Sent by',
    searchPlaceholder: 'Search by client, channel, subject, recipient...',
    noConversationsTitle: 'No conversations yet',
    noConversationsText: 'Send the first message to start a client thread.',
    noClientSelectedTitle: 'No client selected',
    noClientSelectedText: 'Pick a conversation from the left, or choose a client in the composer to start a new one.',
    loadingThread: 'Loading thread...',
    noSavedMessagesTitle: 'No saved messages yet',
    noSavedMessagesText: 'Write the first message in the composer.',
    compose: 'Compose',
    composeSubtitle: 'Send and save messages from one place.',
    singleClient: 'Single client',
    bulkSend: 'Bulk send',
    selectClient: 'Select client',
    recipients: 'Recipients',
    filterClients: 'Filter clients by name, email, or phone',
    selectEligible: 'Select eligible',
    selectAll: 'Select all',
    clear: 'Clear',
    selectedSummary: (selected: number, eligible: number, channel: string) => `${selected} selected · ${eligible} eligible for ${channel.toLowerCase()}`,
    noClientsMatch: 'No clients match this search.',
    noContactInfo: 'No contact info',
    bulkSendTitle: 'Bulk send currently supports Email and WhatsApp.',
    addEmailAddress: 'Add a client email address.',
    addWhatsApp: 'Add a client phone number and WhatsApp opt-in.',
    viberOnlyLinked: 'Viber is available only for linked clients.',
    guestAppOnlyLinked: 'Guest App is available only for clients linked to the guest mobile app.',
    subject: 'Subject',
    message: 'Message',
    writeEmail: 'Write your email...',
    writeMessage: (channel: string) => `Write your ${channel} message...`,
    bulkEmailNote: 'Bulk email sends the same message to every selected client with an email address.',
    bulkWhatsAppNote: 'Bulk WhatsApp sends only to selected clients with opt-in and a WhatsApp target number.',
    bulkChannelUnavailable: 'Bulk send is currently available for Email and WhatsApp.',
    emailNote: 'Email uses the SMTP settings already configured on the backend.',
    whatsappNoteReady: 'WhatsApp uses the client phone or WhatsApp number. The consultant phone is used as the sender reference in the app, while delivery still relies on your configured WhatsApp API sender.',
    whatsappNoteOptIn: 'Mark this client as WhatsApp opt-in before sending.',
    viberNoteReady: 'Viber uses the official bot API and sends only to clients already linked to your Viber bot.',
    viberNotePending: 'Viber becomes available after the client is linked to your Viber bot.',
    guestAppNoteReady: 'Guest App delivers the message directly into the guest mobile inbox.',
    guestAppNotePending: 'The client must have an active guest mobile app link for this tenant.',
    sending: 'Sending…',
    sendSingle: (channel: string) => `Send ${channel}`,
    sendBulk: (channel: string, count: number) => `Send ${channel} to ${count} client${count === 1 ? '' : 's'}`,
    messageSent: (channel: string) => `${channel} message sent.`,
    sendFailed: 'Failed to send message.',
    attachments: 'Attachments',
    addAttachments: 'Add attachments',
    attachmentsReady: 'Attachments will be stored with the client files and delivered into the Guest App conversation.',
    attachmentsGuestOnly: 'Attachments are currently supported only for a single Guest App conversation.',
    removeAttachment: 'Remove',
    attachmentLabel: (count: number) => `${count} attachment${count === 1 ? '' : 's'}`,
    imageFileLabel: 'Image',
    pdfFileLabel: 'PDF',
    fileLabel: 'File',
    openPreview: 'Open preview',
    loadingPreview: 'Loading preview…',
    downloadAttachment: 'Download',
    attachmentUnsupported: (name: string) => `${name} is not a supported file type. Allowed: images, PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, PPT, PPTX.`,
    attachmentTooLarge: (name: string, max: string) => `${name} is larger than the ${max} limit.`,
    attachmentsTooMany: (max: number) => `You can add up to ${max} attachments per message.`,
    attachmentsTotalTooLarge: (max: string) => `The combined attachment size must be ${max} or smaller.`,
    attachmentPending: 'Ready to upload',
    attachmentUploading: (progress: number) => `Uploading ${progress}%`,
    attachmentUploaded: 'Uploaded',
    attachmentUploadFailed: 'Upload failed',
    retryAttachment: 'Retry',
    attachmentsNeedRetry: 'Remove or retry failed attachments, then send the message again.',
    bulkSuccess: (parts: string[]) => `${parts.join(' · ')}.`,
    bulkFailed: (channel: string) => `Failed to send ${channel} messages.`,
  }
  const [search, setSearch] = useState('')
  const [clientIdFilter, setClientIdFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState<'' | InboxChannel>('')
  const [statusFilter, setStatusFilter] = useState<'' | InboxStatus>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('single')
  const [bulkRecipientSearch, setBulkRecipientSearch] = useState('')
  const [bulkSelectedClientIds, setBulkSelectedClientIds] = useState<number[]>([])
  const [composeChannel, setComposeChannel] = useState<InboxChannel>('EMAIL')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeAttachments, setComposeAttachments] = useState<ComposeAttachmentItem[]>([])
  const [sending, setSending] = useState(false)
  const composeAttachmentsRef = useRef<ComposeAttachmentItem[]>([])
  const selectedClientIdRef = useRef<number | null>(null)
  const previousSelectedClientIdRef = useRef<number | null>(null)

  const clientsQuery = useQuery<Client[]>({
    queryKey: ['inbox-clients'],
    queryFn: async () => {
      const res = await api.get<Client[]>('/clients')
      return res.data ?? []
    },
  })

  const threadsQuery = useQuery<InboxThread[]>({
    queryKey: ['inbox-threads', search, clientIdFilter, channelFilter, statusFilter, from, to],
    refetchInterval: 10000,
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
      if (selectedClientId == null && clientIdFilter) setSelectedClientId(Number(clientIdFilter))
      return
    }
    if (selectedClientId == null) {
      setSelectedClientId(rows[0].clientId)
      return
    }
    // Keep explicit client selection from the composer even if that client has no existing thread yet.
    if (clientIdFilter) {
      const existsInFilteredRows = rows.some((row) => row.clientId === selectedClientId)
      if (!existsInFilteredRows) setSelectedClientId(rows[0].clientId)
    }
  }, [threadsQuery.data, selectedClientId, clientIdFilter])

  useEffect(() => {
    if (recipientMode === 'single' && selectedThread?.lastChannel) setComposeChannel(selectedThread.lastChannel)
  }, [selectedThread?.lastChannel, recipientMode])

  useEffect(() => {
    composeAttachmentsRef.current = composeAttachments
  }, [composeAttachments])

  useEffect(() => {
    selectedClientIdRef.current = selectedClientId ?? null
  }, [selectedClientId])

  const discardComposeAttachments = async (clientId: number | null | undefined, attachments: ComposeAttachmentItem[]) => {
    if (clientId == null || attachments.length === 0) return
    const uploadedIds = attachments
      .map((attachment) => attachment.uploadedFileId)
      .filter((value): value is number => typeof value === 'number')
    if (uploadedIds.length === 0) return
    await Promise.allSettled(
      uploadedIds.map((fileId) => api.post(`/inbox/clients/${clientId}/attachments/${fileId}/discard`)),
    )
  }

  useEffect(() => {
    if (recipientMode === 'bulk' && (composeChannel === 'VIBER' || composeChannel === 'GUEST_APP')) setComposeChannel('EMAIL')
    if (recipientMode === 'bulk' && composeAttachmentsRef.current.length > 0) {
      const attachments = [...composeAttachmentsRef.current]
      setComposeAttachments([])
      void discardComposeAttachments(selectedClientIdRef.current, attachments)
    }
  }, [recipientMode, composeChannel])

  useEffect(() => {
    if (composeChannel !== 'GUEST_APP' && composeAttachmentsRef.current.length > 0) {
      const attachments = [...composeAttachmentsRef.current]
      setComposeAttachments([])
      void discardComposeAttachments(selectedClientIdRef.current, attachments)
    }
  }, [composeChannel])

  useEffect(() => {
    const previousClientId = previousSelectedClientIdRef.current
    previousSelectedClientIdRef.current = selectedClientId ?? null
    if (previousClientId != null && previousClientId !== selectedClientId && composeAttachmentsRef.current.length > 0) {
      const attachments = [...composeAttachmentsRef.current]
      setComposeAttachments([])
      void discardComposeAttachments(previousClientId, attachments)
    }
  }, [selectedClientId])

  useEffect(() => () => {
    const clientId = selectedClientIdRef.current
    const attachments = composeAttachmentsRef.current
    if (clientId != null && attachments.length > 0) {
      void discardComposeAttachments(clientId, attachments)
    }
  }, [])

  const messagesQuery = useQuery<ClientMessage[]>({
    queryKey: ['inbox-messages', selectedClientId],
    enabled: selectedClientId != null,
    refetchInterval: selectedClientId != null ? 5000 : false,
    queryFn: async () => {
      const res = await api.get<ClientMessage[]>(`/inbox/clients/${selectedClientId}/messages`)
      return res.data ?? []
    },
  })

  const selectedClient = useMemo(
    () => (clientsQuery.data ?? []).find((row) => row.id === selectedClientId) ?? null,
    [clientsQuery.data, selectedClientId],
  )

  const bulkSelectedSet = useMemo(() => new Set(bulkSelectedClientIds), [bulkSelectedClientIds])

  const bulkSelectedClients = useMemo(
    () => (clientsQuery.data ?? []).filter((client) => bulkSelectedSet.has(client.id)),
    [clientsQuery.data, bulkSelectedSet],
  )

  const filteredBulkClients = useMemo(
    () => (clientsQuery.data ?? []).filter((client) => matchesClientSearch(client, bulkRecipientSearch)),
    [clientsQuery.data, bulkRecipientSearch],
  )

  const eligibleBulkClients = useMemo(
    () => bulkSelectedClients.filter((client) => isClientEligibleForChannel(client, composeChannel)),
    [bulkSelectedClients, composeChannel],
  )

  const recentMessages = messagesQuery.data ?? []

  useEffect(() => {
    if (selectedClientId == null || !messagesQuery.data) return
    queryClient.setQueriesData<InboxThread[]>({ queryKey: ['inbox-threads'] }, (current) => (
      current?.map((thread) => thread.clientId === selectedClientId ? { ...thread, unreadCount: 0 } : thread) ?? current
    ))
  }, [queryClient, selectedClientId, messagesQuery.dataUpdatedAt])

  const canAttachFiles = recipientMode === 'single' && composeChannel === 'GUEST_APP' && selectedClientId != null
  const singleSendReady = !!selectedClientId && (!!composeBody.trim() || composeAttachments.length > 0) && isClientEligibleForChannel(selectedClient, composeChannel)
  const bulkSendReady = composeChannel !== 'VIBER' && composeChannel !== 'GUEST_APP' && !!composeBody.trim() && eligibleBulkClients.length > 0

  const toggleBulkClient = (clientId: number) => {
    setBulkSelectedClientIds((prev) => (
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    ))
  }

  const selectAllVisibleClients = () => {
    setBulkSelectedClientIds(filteredBulkClients.map((client) => client.id))
  }

  const selectEligibleVisibleClients = () => {
    setBulkSelectedClientIds(
      filteredBulkClients
        .filter((client) => isClientEligibleForChannel(client, composeChannel))
        .map((client) => client.id),
    )
  }

  const clearBulkSelection = () => {
    setBulkSelectedClientIds([])
  }

  const resetComposerAfterSend = () => {
    setComposeBody('')
    setComposeAttachments([])
    if (composeChannel === 'EMAIL') setComposeSubject('')
  }

  const handleComposeAttachmentSelection = (files: FileList | null) => {
    const normalized = normalizeAttachmentSelection(composeAttachments, Array.from(files ?? []), copy)
    setComposeAttachments(normalized.files)
    if (normalized.errors.length) {
      showToast('error', normalized.errors[0])
    }
  }

  const updateComposeAttachment = (attachmentId: string, updater: (current: ComposeAttachmentItem) => ComposeAttachmentItem) => {
    setComposeAttachments((prev) => prev.map((entry) => (entry.id === attachmentId ? updater(entry) : entry)))
  }

  const uploadComposeAttachment = async (clientId: number, attachment: ComposeAttachmentItem) => {
    if (attachment.uploadedFileId) return attachment.uploadedFileId
    updateComposeAttachment(attachment.id, (current) => ({ ...current, status: 'uploading', progress: current.progress > 0 ? current.progress : 0, error: '' }))
    try {
      const body = new FormData()
      body.append('file', attachment.file)
      const response = await api.post(`/inbox/clients/${clientId}/attachments`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          const total = event.total || attachment.file.size || 1
          const nextProgress = Math.max(1, Math.min(100, Math.round((event.loaded / total) * 100)))
          updateComposeAttachment(attachment.id, (current) => ({ ...current, status: 'uploading', progress: nextProgress, error: '' }))
        },
      })
      const uploadedFileId = response.data?.id as number | undefined
      if (!uploadedFileId) throw new Error('Missing uploaded file id.')
      updateComposeAttachment(attachment.id, (current) => ({ ...current, status: 'uploaded', progress: 100, error: '', uploadedFileId }))
      return uploadedFileId
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || copy.attachmentUploadFailed
      updateComposeAttachment(attachment.id, (current) => ({ ...current, status: 'failed', error: message, progress: 0 }))
      throw error
    }
  }

  const retryComposeAttachment = async (attachmentId: string) => {
    if (!selectedClientId) return
    const attachment = composeAttachments.find((entry) => entry.id === attachmentId)
    if (!attachment) return
    try {
      await uploadComposeAttachment(selectedClientId, attachment)
    } catch {
      // handled in state
    }
  }

  const removeComposeAttachment = (attachmentId: string) => {
    const attachment = composeAttachmentsRef.current.find((entry) => entry.id === attachmentId)
    setComposeAttachments((prev) => prev.filter((entry) => entry.id !== attachmentId))
    if (selectedClientIdRef.current != null && attachment?.uploadedFileId) {
      void discardComposeAttachments(selectedClientIdRef.current, [attachment])
    }
  }

  const ensureComposeAttachmentsUploaded = async (clientId: number) => {
    const currentAttachments = [...composeAttachments]
    const uploadedIds: number[] = []
    let failed = false
    for (const attachment of currentAttachments) {
      if (attachment.uploadedFileId) {
        uploadedIds.push(attachment.uploadedFileId)
        continue
      }
      try {
        const uploadedId = await uploadComposeAttachment(clientId, attachment)
        uploadedIds.push(uploadedId)
      } catch {
        failed = true
      }
    }
    return { uploadedIds, failed }
  }

  const invalidateInboxQueries = async (sentClientIds: number[]) => {
    await queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    if (selectedClientId != null && sentClientIds.includes(selectedClientId)) {
      await queryClient.invalidateQueries({ queryKey: ['inbox-messages', selectedClientId] })
    }
    window.dispatchEvent(new Event('clients-updated'))
  }

  const downloadAttachment = async (clientId: number, attachment: { clientFileId: number; fileName: string; contentType?: string | null }) => {
    const response = await api.get(`/clients/${clientId}/files/${attachment.clientFileId}`, { responseType: 'blob' })
    const blob = new Blob([response.data], { type: attachment.contentType || 'application/octet-stream' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = attachment.fileName || 'attachment'
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const sendSingleMessage = async () => {
    if (!selectedClientId || (!composeBody.trim() && composeAttachments.length === 0)) return
    setSending(true)
    try {
      let attachmentFileIds: number[] = []
      if (composeAttachments.length > 0) {
        const uploadResult = await ensureComposeAttachmentsUploaded(selectedClientId)
        attachmentFileIds = uploadResult.uploadedIds
        if (uploadResult.failed) {
          showToast('error', copy.attachmentsNeedRetry)
          return
        }
      }
      await api.post('/inbox/messages', {
        clientId: selectedClientId,
        channel: composeChannel,
        subject: composeChannel === 'EMAIL' ? composeSubject.trim() || null : null,
        body: composeBody.trim(),
        attachmentFileIds,
      })
      showToast('success', copy.messageSent(channelLabel(composeChannel)))
      resetComposerAfterSend()
      await invalidateInboxQueries([selectedClientId])
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || copy.sendFailed)
    } finally {
      setSending(false)
    }
  }

  const sendBulkMessage = async () => {
    const eligibleRecipients = eligibleBulkClients
    if (!eligibleRecipients.length || !composeBody.trim()) return

    setSending(true)
    try {
      const results = await Promise.allSettled(
        eligibleRecipients.map((client) => api.post('/inbox/messages', {
          clientId: client.id,
          channel: composeChannel,
          subject: composeChannel === 'EMAIL' ? composeSubject.trim() || null : null,
          body: composeBody.trim(),
        })),
      )

      let successCount = 0
      let failureCount = 0
      let firstError = ''
      const sentClientIds: number[] = []

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount += 1
          sentClientIds.push(eligibleRecipients[index].id)
          return
        }
        failureCount += 1
        if (!firstError) {
          firstError = result.reason?.response?.data?.message || result.reason?.message || 'Failed to send messages.'
        }
      })

      const skippedCount = bulkSelectedClients.length - eligibleRecipients.length
      if (successCount > 0) {
        const parts = [`${channelLabel(composeChannel)} sent to ${successCount} client${successCount === 1 ? '' : 's'}`]
        if (failureCount) parts.push(`${failureCount} failed`)
        if (skippedCount) parts.push(`${skippedCount} skipped`)
        showToast('success', copy.bulkSuccess(parts))
        resetComposerAfterSend()
        await invalidateInboxQueries(sentClientIds)
      } else {
        showToast('error', firstError || copy.bulkFailed(channelLabel(composeChannel)))
      }
    } finally {
      setSending(false)
    }
  }

  const sendMessage = async () => {
    if (recipientMode === 'bulk') {
      await sendBulkMessage()
      return
    }
    await sendSingleMessage()
  }

  return (
    <div className="stack gap-lg">
      <Card className="analytics-inbox-hero">
        <div className="analytics-inbox-hero__copy">
          <SectionTitle>Inbox</SectionTitle>
          <p className="muted analytics-inbox-hero__text">
            A unified communication hub for email, direct WhatsApp Cloud API, opt-in Viber Bot messages, and the guest mobile app inbox. Every inbound and outbound message is saved under the client timeline.
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
              placeholder={copy.searchPlaceholder}
            />
          </div>
          <select value={clientIdFilter} onChange={(e) => setClientIdFilter(e.target.value)}>
            <option value="">{locale === 'sl' ? 'Vse stranke' : 'All clients'}</option>
            {(clientsQuery.data ?? []).map((client) => (
              <option key={client.id} value={client.id}>{clientName(client)}</option>
            ))}
          </select>
          <select value={channelFilter} onChange={(e) => setChannelFilter((e.target.value || '') as '' | InboxChannel)}>
            <option value="">{locale === 'sl' ? 'Vsi kanali' : 'All channels'}</option>
            {CHANNELS.map((channel) => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter((e.target.value || '') as '' | InboxStatus)}>
            <option value="">{locale === 'sl' ? 'Vsi statusi' : 'All statuses'}</option>
            <option value="SENT">{copy.sent}</option>
            <option value="DELIVERED">{copy.delivered}</option>
            <option value="READ">{copy.read}</option>
            <option value="RECEIVED">{copy.received}</option>
            <option value="FAILED">{copy.failed}</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <div className="analytics-inbox-layout">
        <Card className="analytics-inbox-threads-card">
          <div className="analytics-inbox-panel-header">
            <div>
              <strong>{locale === 'sl' ? 'Pogovori' : 'Conversations'}</strong>
              <p className="muted">{locale === 'sl' ? 'Zadnje sporočilo za vsako stranko.' : 'Latest message per client.'}</p>
            </div>
          </div>

          <div className="analytics-inbox-thread-list">
            {threadsQuery.isLoading ? (
              <div className="muted">{locale === 'sl' ? 'Nalagam prejeto...' : 'Loading inbox...'}</div>
            ) : (threadsQuery.data ?? []).length === 0 ? (
              <EmptyState title={copy.noConversationsTitle} text={copy.noConversationsText} />
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
                      <Pill tone={statusTone(thread.lastStatus)}>{statusLabel(thread.lastStatus, copy)}</Pill>
                      {thread.unreadCount && thread.unreadCount > 0 ? (
                        <Pill tone="red">{thread.unreadCount} {locale === 'sl' ? 'novo' : 'new'}</Pill>
                      ) : null}
                      <span>{thread.messageCount} {locale === 'sl' ? 'sporočil' : 'msg'}</span>
                    </div>
                    {threadSenderLabel(thread, copy) && (
                      <div className="analytics-inbox-thread__sender muted">{threadSenderLabel(thread, copy)}</div>
                    )}
                    {thread.lastSubject && <div className="analytics-inbox-thread__subject">{thread.lastSubject}</div>}
                    <div className="analytics-inbox-thread__preview">{thread.lastPreview || (locale === 'sl' ? 'Predogled ni na voljo.' : 'No preview available.')}</div>
                  </button>
                )
              })
            )}
          </div>
        </Card>

        <Card className="analytics-inbox-thread-view-card">
          <div className="analytics-inbox-panel-header analytics-inbox-panel-header--thread">
            <div>
              <strong>{selectedClient ? clientName(selectedClient) : (locale === 'sl' ? 'Izberite stranko' : 'Select a client')}</strong>
              <p className="muted">
                {selectedClient ? [selectedClient.email, selectedClient.phone].filter(Boolean).join(' · ') || copy.noContactInfo : (locale === 'sl' ? 'Izberite pogovor stranke za ogled časovnice.' : 'Choose a client thread to read the timeline.')}
              </p>
            </div>
            <div className="analytics-inbox-panel-tags">
              {selectedThread && <Pill tone={channelTone(selectedThread.lastChannel)}>{channelLabel(selectedThread.lastChannel)}</Pill>}
            </div>
          </div>

          <div className="analytics-inbox-messages">
            {selectedClientId == null ? (
              <EmptyState title={copy.noClientSelectedTitle} text={copy.noClientSelectedText} />
            ) : messagesQuery.isLoading ? (
              <div className="muted">{copy.loadingThread}</div>
            ) : recentMessages.length === 0 ? (
              <EmptyState title={copy.noSavedMessagesTitle} text={copy.noSavedMessagesText} />
            ) : (
              recentMessages.map((message) => (
                <div key={message.id} className={`analytics-inbox-bubble analytics-inbox-bubble--${message.direction === 'OUTBOUND' ? 'out' : 'in'}`}>
                  <div className="analytics-inbox-bubble__meta">
                    <Pill tone={channelTone(message.channel)}>{channelLabel(message.channel)}</Pill>
                    <Pill tone={statusTone(message.status)}>{statusLabel(message.status, copy)}</Pill>
                    <span>{message.sentAt ? formatDateTime(message.sentAt) : formatDateTime(message.createdAt)}</span>
                    {messageSenderLabel(message, copy) && (
                      <span>{messageSenderLabel(message, copy)}</span>
                    )}
                  </div>
                  {message.subject && <strong className="analytics-inbox-bubble__subject">{message.subject}</strong>}
                  {message.body && <div className="analytics-inbox-bubble__body">{message.body}</div>}
                  {message.attachments && message.attachments.length > 0 && selectedClientId != null && (
                    <div className="stack gap-sm" style={{ marginTop: 10 }}>
                      {message.attachments.map((attachment) => (
                        <AttachmentPreviewCard
                          key={attachment.id}
                          clientId={selectedClientId}
                          attachment={attachment}
                          copy={copy}
                          onDownload={downloadAttachment}
                        />
                      ))}
                    </div>
                  )}
                  {message.errorMessage && <div className="analytics-inbox-bubble__error">{message.errorMessage}</div>}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="analytics-inbox-compose-card">
          <div className="analytics-inbox-panel-header">
            <div>
              <strong>{copy.compose}</strong>
              <p className="muted">{copy.composeSubtitle}</p>
            </div>
          </div>

          <div className="analytics-inbox-compose-form stack gap-md">
            <div className="analytics-inbox-recipient-mode">
              <button
                type="button"
                className={recipientMode === 'single' ? 'active' : ''}
                onClick={() => setRecipientMode('single')}
              >
                {copy.singleClient}
              </button>
              <button
                type="button"
                className={recipientMode === 'bulk' ? 'active' : ''}
                onClick={() => setRecipientMode('bulk')}
              >
                {copy.bulkSend}
              </button>
            </div>

            {recipientMode === 'single' ? (
              <Field label={copy.clientLabel}>
                <select
                  value={selectedClientId ?? ''}
                  onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{copy.selectClient}</option>
                  {(clientsQuery.data ?? []).map((client) => (
                    <option key={client.id} value={client.id}>{clientName(client)}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="analytics-inbox-bulk-picker stack gap-sm">
                <Field label={copy.recipients}>
                  <input
                    value={bulkRecipientSearch}
                    onChange={(e) => setBulkRecipientSearch(e.target.value)}
                    placeholder={copy.filterClients}
                  />
                </Field>
                <div className="analytics-inbox-bulk-actions">
                  <button type="button" className="secondary" onClick={selectEligibleVisibleClients}>{copy.selectEligible}</button>
                  <button type="button" className="secondary" onClick={selectAllVisibleClients}>{copy.selectAll}</button>
                  <button type="button" className="secondary" onClick={clearBulkSelection} disabled={bulkSelectedClientIds.length === 0}>{copy.clear}</button>
                </div>
                <div className="analytics-inbox-bulk-summary muted">
                  {copy.selectedSummary(bulkSelectedClients.length, eligibleBulkClients.length, channelLabel(composeChannel))}
                </div>
                <div className="analytics-inbox-bulk-list">
                  {filteredBulkClients.length === 0 ? (
                    <div className="muted">{copy.noClientsMatch}</div>
                  ) : (
                    filteredBulkClients.map((client) => {
                      const checked = bulkSelectedSet.has(client.id)
                      const eligible = isClientEligibleForChannel(client, composeChannel)
                      const meta = [client.email, client.phone || client.whatsappPhone].filter(Boolean).join(' · ') || copy.noContactInfo
                      return (
                        <label key={client.id} className={`analytics-inbox-bulk-client${checked ? ' active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBulkClient(client.id)}
                          />
                          <div className="analytics-inbox-bulk-client__body">
                            <strong>{clientName(client)}</strong>
                            <span>{meta}</span>
                          </div>
                          <Pill tone={eligible ? 'green' : 'red'}>{clientEligibilityLabel(client, composeChannel, copy)}</Pill>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            <div className="analytics-inbox-channel-switch">
              {CHANNELS.map((channel) => {
                const disabled = recipientMode === 'bulk'
                  ? channel === 'VIBER' || channel === 'GUEST_APP'
                  : channel === 'WHATSAPP'
                    ? !selectedClient?.whatsappOptIn || !hasWhatsAppTarget(selectedClient)
                    : channel === 'VIBER'
                      ? !selectedClient?.viberConnected
                      : channel === 'GUEST_APP'
                        ? !selectedClient?.guestAppLinked
                        : channel === 'EMAIL'
                          ? !hasEmailTarget(selectedClient)
                          : false
                const disabledTitle = recipientMode === 'bulk'
                  ? ((channel === 'VIBER' || channel === 'GUEST_APP') ? copy.bulkSendTitle : undefined)
                  : channel === 'EMAIL'
                    ? copy.addEmailAddress
                    : channel === 'WHATSAPP'
                      ? copy.addWhatsApp
                      : channel === 'GUEST_APP'
                        ? copy.guestAppOnlyLinked
                        : copy.viberOnlyLinked
                return (
                  <button
                    key={channel}
                    type="button"
                    className={composeChannel === channel ? 'active' : ''}
                    onClick={() => !disabled && setComposeChannel(channel)}
                    disabled={disabled}
                    title={disabled ? disabledTitle : undefined}
                  >
                    {channelLabel(channel)}
                  </button>
                )
              })}
            </div>

            {composeChannel === 'EMAIL' && (
              <Field label={copy.subject}>
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder={copy.subject}
                />
              </Field>
            )}

            <Field label={copy.message}>
              <textarea
                rows={10}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder={composeChannel === 'EMAIL' ? copy.writeEmail : copy.writeMessage(channelLabel(composeChannel))}
              />
            </Field>

            {canAttachFiles ? (
              <Field label={`${copy.attachments} · ${copy.attachmentLabel(composeAttachments.length)}`}>
                <div className="stack gap-sm">
                  <input
                    type="file"
                    multiple
                    accept={ACCEPTED_ATTACHMENT_INPUT}
                    onChange={(e) => {
                      handleComposeAttachmentSelection(e.target.files)
                      e.currentTarget.value = ''
                    }}
                  />
                  {composeAttachments.length > 0 ? (
                    <div className="stack gap-sm">
                      {composeAttachments.map((attachment) => (
                        <ComposeAttachmentCard
                          key={attachment.id}
                          attachment={attachment}
                          copy={copy}
                          onRetry={() => void retryComposeAttachment(attachment.id)}
                          onRemove={() => removeComposeAttachment(attachment.id)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>
            ) : null}

            <div className="analytics-inbox-channel-note muted">
              {recipientMode === 'bulk'
                ? composeChannel === 'EMAIL'
                  ? copy.bulkEmailNote
                  : composeChannel === 'WHATSAPP'
                    ? copy.bulkWhatsAppNote
                    : copy.bulkChannelUnavailable
                : composeChannel === 'EMAIL'
                  ? copy.emailNote
                  : composeChannel === 'WHATSAPP'
                    ? (selectedClient?.whatsappOptIn ? copy.whatsappNoteReady : copy.whatsappNoteOptIn)
                    : composeChannel === 'VIBER'
                      ? (selectedClient?.viberConnected ? copy.viberNoteReady : copy.viberNotePending)
                      : (selectedClient?.guestAppLinked ? `${copy.guestAppNoteReady} ${copy.attachmentsReady}` : copy.guestAppNotePending)}
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || (recipientMode === 'bulk' ? !bulkSendReady : !singleSendReady)}
              >
                {sending
                  ? copy.sending
                  : recipientMode === 'bulk'
                    ? copy.sendBulk(channelLabel(composeChannel), eligibleBulkClients.length)
                    : copy.sendSingle(channelLabel(composeChannel))}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
