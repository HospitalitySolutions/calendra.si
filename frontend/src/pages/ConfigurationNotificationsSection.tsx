import { useEffect, useLayoutEffect, useRef, useState, type SVGProps } from 'react'
import { Card, Field, SectionTitle } from '../components/ui'
import { getStoredUser } from '../auth'

export const NOTIFICATION_SETTINGS_KEY = 'NOTIFICATION_SETTINGS_JSON'

type Translate = (key: string) => string

export type NotificationKind = 'newSession' | 'changeSession' | 'cancelSession' | 'beforeSession' | 'afterSession'

export type OffsetUnit = 'minutes' | 'hours' | 'days'

export type EmailTemplate = {
  enabled: boolean
  subject: string
  bodyHtml: string
  /** Used for beforeSession / afterSession: how long before or after the session to send. */
  offsetValue?: number
  offsetUnit?: OffsetUnit
}

export type SmsTemplate = {
  enabled: boolean
  body: string
  offsetValue?: number
  offsetUnit?: OffsetUnit
}

export type NotificationSettingsPayload = {
  email: Record<NotificationKind, EmailTemplate>
  sms: Record<NotificationKind, SmsTemplate>
}

const IMMEDIATE_KINDS: NotificationKind[] = ['newSession', 'changeSession', 'cancelSession']
const SCHEDULED_KINDS: NotificationKind[] = ['beforeSession', 'afterSession']
const NOTIFICATION_KINDS: NotificationKind[] = [...IMMEDIATE_KINDS, ...SCHEDULED_KINDS]

function isScheduledKind(kind: NotificationKind): boolean {
  return kind === 'beforeSession' || kind === 'afterSession'
}

const defaultScheduledEmail = (): EmailTemplate => ({
  enabled: false,
  subject: '',
  bodyHtml: '',
  offsetValue: 1,
  offsetUnit: 'hours',
})

const defaultScheduledSms = (): SmsTemplate => ({
  enabled: false,
  body: '',
  offsetValue: 1,
  offsetUnit: 'hours',
})

const defaultPayload = (): NotificationSettingsPayload => ({
  email: {
    newSession: { enabled: false, subject: '', bodyHtml: '' },
    changeSession: { enabled: false, subject: '', bodyHtml: '' },
    cancelSession: { enabled: false, subject: '', bodyHtml: '' },
    beforeSession: defaultScheduledEmail(),
    afterSession: defaultScheduledEmail(),
  },
  sms: {
    newSession: { enabled: false, body: '' },
    changeSession: { enabled: false, body: '' },
    cancelSession: { enabled: false, body: '' },
    beforeSession: defaultScheduledSms(),
    afterSession: defaultScheduledSms(),
  },
})

function parseOffsetUnit(raw: unknown): OffsetUnit {
  if (raw === 'minutes' || raw === 'hours' || raw === 'days') return raw
  return 'hours'
}

function parseOffsetValue(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 365 * 24 * 60)
}

export function parseNotificationSettings(raw: string | undefined): NotificationSettingsPayload {
  if (!raw) return defaultPayload()
  try {
    const p = JSON.parse(raw)
    const base = defaultPayload()
    for (const k of NOTIFICATION_KINDS) {
      const e = p?.email?.[k]
      if (e && typeof e === 'object') {
        const sched = isScheduledKind(k)
        base.email[k] = {
          enabled: Boolean(e.enabled),
          subject: typeof e.subject === 'string' ? e.subject : '',
          bodyHtml: typeof e.bodyHtml === 'string' ? e.bodyHtml : '',
          ...(sched
            ? {
                offsetValue: parseOffsetValue(e.offsetValue),
                offsetUnit: parseOffsetUnit(e.offsetUnit),
              }
            : {}),
        }
      }
      const s = p?.sms?.[k]
      if (s && typeof s === 'object') {
        const sched = isScheduledKind(k)
        base.sms[k] = {
          enabled: Boolean(s.enabled),
          body: typeof s.body === 'string' ? s.body : '',
          ...(sched
            ? {
                offsetValue: parseOffsetValue(s.offsetValue),
                offsetUnit: parseOffsetUnit(s.offsetUnit),
              }
            : {}),
        }
      }
    }
    return base
  } catch {
    return defaultPayload()
  }
}

export function serializeNotificationSettings(n: NotificationSettingsPayload): string {
  return JSON.stringify(n)
}

type TagDef = { token: string; labelKey: string }

const MESSAGE_TAGS: TagDef[] = [
  { token: '{{companyName}}', labelKey: 'configNotifyTagCompanyName' },
  { token: '{{clientFirstName}}', labelKey: 'configNotifyTagClientFirstName' },
  { token: '{{clientLastName}}', labelKey: 'configNotifyTagClientLastName' },
  { token: '{{serviceName}}', labelKey: 'configNotifyTagServiceName' },
  { token: '{{date}}', labelKey: 'configNotifyTagDate' },
  { token: '{{dayName}}', labelKey: 'configNotifyTagDayName' },
  { token: '{{year}}', labelKey: 'configNotifyTagYear' },
  { token: '{{time}}', labelKey: 'configNotifyTagTime' },
  { token: '{{locationAddress}}', labelKey: 'configNotifyTagLocationAddress' },
  { token: '{{locationName}}', labelKey: 'configNotifyTagLocationName' },
  { token: '{{locationPhone}}', labelKey: 'configNotifyTagLocationPhone' },
  { token: '{{rescheduleLink}}', labelKey: 'configNotifyTagRescheduleLink' },
  { token: '{{serviceCategories}}', labelKey: 'configNotifyTagServiceCategories' },
  { token: '{{consultantName}}', labelKey: 'configNotifyTagConsultantName' },
  { token: '{{consultantPhone}}', labelKey: 'configNotifyTagConsultantPhone' },
  { token: '{{originalAppointmentDateTime}}', labelKey: 'configNotifyTagOriginalAppointment' },
]

const Ico = (props: SVGProps<SVGSVGElement>) => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  />
)

function IconBold() {
  return (
    <Ico>
      <path d="M14 12a4 4 0 0 0 0-8H6v8" />
      <path d="M15 20a4 4 0 0 0 0-8H6v8Z" />
    </Ico>
  )
}

function IconItalic() {
  return (
    <Ico>
      <line x1="19" x2="10" y1="4" y2="4" />
      <line x1="14" x2="5" y1="20" y2="20" />
      <line x1="15" x2="9" y1="4" y2="20" />
    </Ico>
  )
}

function IconStrikethrough() {
  return (
    <Ico>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <path d="M4 12h16" />
    </Ico>
  )
}

function IconLink() {
  return (
    <Ico>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Ico>
  )
}

function IconImage() {
  return (
    <Ico>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Ico>
  )
}

function IconListBullet() {
  return (
    <Ico>
      <circle cx="5.5" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <line x1="10" x2="21" y1="6" y2="6" />
      <line x1="10" x2="21" y1="12" y2="12" />
      <line x1="10" x2="21" y1="18" y2="18" />
    </Ico>
  )
}

function IconListNumbered() {
  return (
    <Ico>
      <line x1="10" x2="21" y1="6" y2="6" />
      <line x1="10" x2="21" y1="12" y2="12" />
      <line x1="10" x2="21" y1="18" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </Ico>
  )
}

function IconParagraph() {
  return (
    <Ico>
      <path d="M17 6H3" />
      <path d="M21 12H3" />
      <path d="M15 18H3" />
    </Ico>
  )
}

function IconUndo() {
  return (
    <Ico>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.708L3 13" />
    </Ico>
  )
}

function IconRedo() {
  return (
    <Ico>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 15-6.708L21 13" />
    </Ico>
  )
}

function insertTagIntoEmailEditor(editorKind: NotificationKind, token: string, onHtmlChange: (next: string) => void) {
  const el = document.querySelector<HTMLDivElement>(`[data-notification-editor="${editorKind}"]`)
  if (!el) return
  el.focus()
  try {
    document.execCommand('insertHTML', false, token)
  } catch {
    // ignore
  }
  onHtmlChange(el.innerHTML)
}

function RichEmailBodyEditor({
  html,
  onHtmlChange,
  editorKind,
  t,
}: {
  html: string
  onHtmlChange: (next: string) => void
  editorKind: NotificationKind
  t: Translate
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastSynced = useRef('')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = html || ''
    lastSynced.current = html || ''
  }, [editorKind])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (html !== lastSynced.current) {
      el.innerHTML = html || ''
      lastSynced.current = html || ''
    }
  }, [html])

  const emit = () => {
    const el = ref.current
    if (!el) return
    const v = el.innerHTML
    lastSynced.current = v
    onHtmlChange(v)
  }

  const exec = (command: string, value?: string) => {
    ref.current?.focus()
    try {
      document.execCommand(command, false, value)
    } catch {
      // ignore
    }
    emit()
  }

  const onLink = () => {
    const url = window.prompt('URL')
    if (url) exec('createLink', url)
  }

  const onImage = () => {
    const url = window.prompt('Image URL')
    if (url) exec('insertImage', url)
  }

  return (
    <div className="notification-rich-editor">
      <div className="notification-rich-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} title={t('configNotifyEditorBold')}>
          <IconBold />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} title={t('configNotifyEditorItalic')}>
          <IconItalic />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('strikeThrough')} title={t('configNotifyEditorStrike')}>
          <IconStrikethrough />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={onLink} title={t('configNotifyEditorLink')}>
          <IconLink />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={onImage} title={t('configNotifyEditorImage')}>
          <IconImage />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')} title={t('configNotifyEditorUl')}>
          <IconListBullet />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')} title={t('configNotifyEditorOl')}>
          <IconListNumbered />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'p')} title={t('configNotifyEditorParagraph')}>
          <IconParagraph />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('undo')} title={t('configNotifyEditorUndo')}>
          <IconUndo />
        </button>
        <button type="button" className="notification-rich-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('redo')} title={t('configNotifyEditorRedo')}>
          <IconRedo />
        </button>
      </div>
      <div
        ref={ref}
        className="notification-rich-body"
        data-notification-editor={editorKind}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
      />
    </div>
  )
}

function insertIntoTextarea(
  el: HTMLTextAreaElement,
  text: string,
  onChange: (next: string) => void,
) {
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const v = el.value
  const next = v.slice(0, start) + text + v.slice(end)
  onChange(next)
  queueMicrotask(() => {
    el.focus()
    const pos = start + text.length
    el.setSelectionRange(pos, pos)
  })
}

function notificationKindLabel(kind: NotificationKind, t: Translate) {
  if (kind === 'newSession') return t('configNotifyNewSession')
  if (kind === 'changeSession') return t('configNotifyChangeSession')
  if (kind === 'cancelSession') return t('configNotifyCancelSession')
  if (kind === 'beforeSession') return t('configNotifyBeforeSession')
  return t('configNotifyAfterSession')
}

function TagPills({ t, onInsert }: { t: Translate; onInsert: (token: string) => void }) {
  return (
    <div className="notification-tag-block">
      <p className="muted notification-tag-hint">{t('configNotifyTagsHint')}</p>
      <div className="notification-tag-pills">
        {MESSAGE_TAGS.map((tag) => (
          <button
            key={tag.token}
            type="button"
            className="notification-tag-pill"
            onClick={() => onInsert(tag.token)}
          >
            {t(tag.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

type Props = {
  settings: Record<string, string>
  setSettings: React.Dispatch<React.SetStateAction<Record<string, string>>>
  savingSettings: boolean
  onSave: () => void
  t: Translate
}

export function ConfigurationNotificationsSection({ settings, setSettings, savingSettings, onSave, t }: Props) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const payload = parseNotificationSettings(settings[NOTIFICATION_SETTINGS_KEY])
  const smsTextareaRefs = useRef<Partial<Record<NotificationKind, HTMLTextAreaElement | null>>>({})

  const patchEmail = (kind: NotificationKind, patch: Partial<EmailTemplate>) => {
    setSettings((prev) => {
      const cur = parseNotificationSettings(prev[NOTIFICATION_SETTINGS_KEY])
      const nextEmailRow = { ...cur.email[kind], ...patch }
      const next: NotificationSettingsPayload = {
        ...cur,
        email: { ...cur.email, [kind]: nextEmailRow },
      }
      if (isScheduledKind(kind) && (patch.offsetValue !== undefined || patch.offsetUnit !== undefined)) {
        next.sms = {
          ...cur.sms,
          [kind]: {
            ...cur.sms[kind],
            ...(patch.offsetValue !== undefined ? { offsetValue: patch.offsetValue } : {}),
            ...(patch.offsetUnit !== undefined ? { offsetUnit: patch.offsetUnit } : {}),
          },
        }
      }
      return { ...prev, [NOTIFICATION_SETTINGS_KEY]: serializeNotificationSettings(next) }
    })
  }

  const patchSms = (kind: NotificationKind, patch: Partial<SmsTemplate>) => {
    setSettings((prev) => {
      const cur = parseNotificationSettings(prev[NOTIFICATION_SETTINGS_KEY])
      const nextSmsRow = { ...cur.sms[kind], ...patch }
      const next: NotificationSettingsPayload = {
        ...cur,
        sms: { ...cur.sms, [kind]: nextSmsRow },
      }
      if (isScheduledKind(kind) && (patch.offsetValue !== undefined || patch.offsetUnit !== undefined)) {
        next.email = {
          ...cur.email,
          [kind]: {
            ...cur.email[kind],
            ...(patch.offsetValue !== undefined ? { offsetValue: patch.offsetValue } : {}),
            ...(patch.offsetUnit !== undefined ? { offsetUnit: patch.offsetUnit } : {}),
          },
        }
      }
      return { ...prev, [NOTIFICATION_SETTINGS_KEY]: serializeNotificationSettings(next) }
    })
  }

  return (
    <div className="stack gap-lg config-notifications-page">
      <Card className="settings-card">
        <SectionTitle>{t('tabNotifications')}</SectionTitle>
        <p className="muted">{t('configNotificationsIntro')}</p>
        <div className="clients-session-tabs" style={{ marginTop: 12, marginBottom: 0 }}>
          <button
            type="button"
            className={channel === 'email' ? 'clients-session-tab active' : 'clients-session-tab'}
            onClick={() => setChannel('email')}
          >
            {t('configNotificationsEmailTab')}
          </button>
          <button
            type="button"
            className={channel === 'sms' ? 'clients-session-tab active' : 'clients-session-tab'}
            onClick={() => setChannel('sms')}
          >
            {t('configNotificationsSmsTab')}
          </button>
        </div>
      </Card>

      {channel === 'email' ? (
        <Card className="settings-card">
          {NOTIFICATION_KINDS.map((kind) => {
            const row = payload.email[kind]
            return (
              <div key={kind} className="notification-event-block">
                <div className="config-module-row notification-toggle-row">
                  <div className="config-module-name">
                    <strong>{notificationKindLabel(kind, t)}</strong>
                  </div>
                  <button
                    type="button"
                    className={row.enabled ? 'small-btn' : 'secondary small-btn'}
                    onClick={() => patchEmail(kind, { enabled: !row.enabled })}
                  >
                    {row.enabled ? t('configToggleOn') : t('configToggleOff')}
                  </button>
                </div>
                {row.enabled && isScheduledKind(kind) && (
                  <div className="notification-template-fields stack gap-md" style={{ marginTop: 12 }}>
                    <p className="muted" style={{ margin: 0 }}>
                      {kind === 'beforeSession' ? t('configNotifyBeforeSessionEmailHint') : t('configNotifyAfterSessionEmailHint')}
                    </p>
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field label={t('configNotifyOffsetAmount')}>
                        <input
                          type="number"
                          min={1}
                          value={row.offsetValue ?? 1}
                          onChange={(e) => {
                            const v = Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                            patchEmail(kind, { offsetValue: v })
                          }}
                        />
                      </Field>
                      <Field label={t('configNotifyOffsetUnit')}>
                        <select
                          value={row.offsetUnit ?? 'hours'}
                          onChange={(e) => patchEmail(kind, { offsetUnit: e.target.value as OffsetUnit })}
                        >
                          <option value="minutes">{t('configNotifyOffsetUnitMinutes')}</option>
                          <option value="hours">{t('configNotifyOffsetUnitHours')}</option>
                          <option value="days">{t('configNotifyOffsetUnitDays')}</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                )}
                {row.enabled && (
                  <div className="notification-template-fields stack gap-md">
                    <Field label={t('configNotifySubject')}>
                      <input
                        value={row.subject}
                        onChange={(e) => patchEmail(kind, { subject: e.target.value })}
                      />
                    </Field>
                    <div className="field">
                      <label className="field-label">{t('configNotifyMessage')}</label>
                      <TagPills
                        t={t}
                        onInsert={(token) => insertTagIntoEmailEditor(kind, token, (bodyHtml) => patchEmail(kind, { bodyHtml }))}
                      />
                      <RichEmailBodyEditor
                        editorKind={kind}
                        html={row.bodyHtml}
                        onHtmlChange={(bodyHtml) => patchEmail(kind, { bodyHtml })}
                        t={t}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="config-notifications-templates-footer" role="region" aria-label={t('configSaveConfiguration')}>
            <button type="button" className="config-notifications-save-btn" onClick={onSave} disabled={savingSettings}>
              {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
            </button>
          </div>
        </Card>
      ) : (
        <Card className="settings-card">
          <p className="muted" style={{ marginBottom: 16 }}>{t('configNotifySmsHint')}</p>
          {NOTIFICATION_KINDS.map((kind) => {
            const row = payload.sms[kind]
            return (
              <div key={kind} className="notification-event-block">
                <div className="config-module-row notification-toggle-row">
                  <div className="config-module-name">
                    <strong>{notificationKindLabel(kind, t)}</strong>
                  </div>
                  <button
                    type="button"
                    className={row.enabled ? 'small-btn' : 'secondary small-btn'}
                    onClick={() => patchSms(kind, { enabled: !row.enabled })}
                  >
                    {row.enabled ? t('configToggleOn') : t('configToggleOff')}
                  </button>
                </div>
                {row.enabled && isScheduledKind(kind) && (
                  <div className="notification-template-fields stack gap-md" style={{ marginTop: 12 }}>
                    <p className="muted" style={{ margin: 0 }}>
                      {kind === 'beforeSession' ? t('configNotifyBeforeSessionSmsHint') : t('configNotifyAfterSessionSmsHint')}
                    </p>
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field label={t('configNotifyOffsetAmount')}>
                        <input
                          type="number"
                          min={1}
                          value={row.offsetValue ?? 1}
                          onChange={(e) => {
                            const v = Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                            patchSms(kind, { offsetValue: v })
                          }}
                        />
                      </Field>
                      <Field label={t('configNotifyOffsetUnit')}>
                        <select
                          value={row.offsetUnit ?? 'hours'}
                          onChange={(e) => patchSms(kind, { offsetUnit: e.target.value as OffsetUnit })}
                        >
                          <option value="minutes">{t('configNotifyOffsetUnitMinutes')}</option>
                          <option value="hours">{t('configNotifyOffsetUnitHours')}</option>
                          <option value="days">{t('configNotifyOffsetUnitDays')}</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                )}
                {row.enabled && (
                  <div className="notification-template-fields stack gap-md">
                    <TagPills
                      t={t}
                      onInsert={(token) => {
                        const ta = smsTextareaRefs.current[kind]
                        if (ta) insertIntoTextarea(ta, token, (body) => patchSms(kind, { body }))
                        else patchSms(kind, { body: row.body + token })
                      }}
                    />
                    <Field label={t('configNotifyMessage')}>
                      <textarea
                        ref={(el) => { smsTextareaRefs.current[kind] = el }}
                        rows={6}
                        value={row.body}
                        onChange={(e) => patchSms(kind, { body: e.target.value })}
                      />
                    </Field>
                  </div>
                )}
              </div>
            )
          })}
          <div className="config-notifications-templates-footer" role="region" aria-label={t('configSaveConfiguration')}>
            <button type="button" className="config-notifications-save-btn" onClick={onSave} disabled={savingSettings}>
              {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
            </button>
          </div>
        </Card>
      )}

      <Card className="settings-card">
        <SectionTitle>Inbox channels</SectionTitle>
        <p className="muted" style={{ marginBottom: 16 }}>
          Configure the company WhatsApp Cloud API sender and the Viber Bot API integration for Analytics → Inbox.
        </p>

        <div className="stack gap-lg">
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>WhatsApp Cloud API</h3>
            <div className="form-grid">
              <Field label="Access token" hint="Permanent or long-lived system user token. Stored encrypted.">
                <input
                  value={settings.INBOX_WHATSAPP_ACCESS_TOKEN || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_ACCESS_TOKEN: e.target.value }))}
                  placeholder="EAAG..."
                />
              </Field>
              <Field label="Phone number ID" hint="The Meta WhatsApp Cloud API phone number ID used for all WhatsApp delivery.">
                <input
                  value={settings.INBOX_WHATSAPP_PHONE_NUMBER_ID || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_PHONE_NUMBER_ID: e.target.value }))}
                  placeholder="123456789012345"
                />
              </Field>
              <Field label="Business account ID" hint="Helpful for Meta setup and support; not required for the send call itself.">
                <input
                  value={settings.INBOX_WHATSAPP_BUSINESS_ACCOUNT_ID || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_BUSINESS_ACCOUNT_ID: e.target.value }))}
                  placeholder="123456789012345"
                />
              </Field>
              <Field label="Webhook verify token" hint="Must match your Meta webhook configuration.">
                <input
                  value={settings.INBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN: e.target.value }))}
                  placeholder="Choose a secret verify token"
                />
              </Field>
              <Field label="App secret" hint="Used to validate Meta webhook signatures. Stored encrypted.">
                <input
                  value={settings.INBOX_WHATSAPP_APP_SECRET || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_APP_SECRET: e.target.value }))}
                  placeholder="Meta app secret"
                />
              </Field>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Viber Bot API</h3>
            <div className="form-grid">
              <Field label="Bot token" hint="Stored encrypted. Used for send_message and webhook setup.">
                <input
                  value={settings.INBOX_VIBER_BOT_TOKEN || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_VIBER_BOT_TOKEN: e.target.value }))}
                  placeholder="Viber bot token"
                />
              </Field>
              <Field label="Bot name">
                <input
                  value={settings.INBOX_VIBER_BOT_NAME || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_VIBER_BOT_NAME: e.target.value }))}
                  placeholder="Calendra"
                />
              </Field>
              <Field label="Bot avatar URL">
                <input
                  value={settings.INBOX_VIBER_BOT_AVATAR_URL || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_VIBER_BOT_AVATAR_URL: e.target.value }))}
                  placeholder="https://.../avatar.png"
                />
              </Field>
            </div>
          </div>

          <div className="stack gap-sm">
            <div className="muted">Webhook endpoints for this company:</div>
            <code style={{ display: 'block', padding: 12, borderRadius: 12, background: 'var(--card-muted)', overflowX: 'auto' }}>
              WhatsApp: https://YOUR-BACKEND/api/inbox/webhooks/whatsapp/{getStoredUser()?.companyId || 'COMPANY_ID'}
            </code>
            <code style={{ display: 'block', padding: 12, borderRadius: 12, background: 'var(--card-muted)', overflowX: 'auto' }}>
              Viber: https://YOUR-BACKEND/api/inbox/webhooks/viber/{getStoredUser()?.companyId || 'COMPANY_ID'}
            </code>
            <div className="muted">
              WhatsApp always uses the client phone number. Consultant phone is used as the sender reference shown in the app, while the configured WhatsApp API sender handles delivery. Viber stays system-linked and becomes available only after the client is linked to your Viber bot.
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
