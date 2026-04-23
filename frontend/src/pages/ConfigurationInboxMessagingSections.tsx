import type { Dispatch, SetStateAction } from 'react'
import { Card, Field, SectionTitle } from '../components/ui'
import { getStoredUser } from '../auth'

type Translate = (key: string) => string

type Props = {
  settings: Record<string, string>
  setSettings: Dispatch<SetStateAction<Record<string, string>>>
  savingSettings: boolean
  onSave: () => void | Promise<void>
  t: Translate
}

export function ConfigurationWhatsAppSection({ settings, setSettings, savingSettings, onSave, t }: Props) {
  const companyId = getStoredUser()?.companyId || 'COMPANY_ID'
  return (
    <Card className="settings-card">
      <SectionTitle>{t('tabWhatsapp')}</SectionTitle>
      <p className="muted" style={{ marginBottom: 16 }}>
        {t('configInboxWhatsappPageSubtitle')}
      </p>
      <div className="stack gap-lg">
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{t('configInboxWhatsappSectionTitle')}</h3>
          <div className="form-grid">
            <Field label={t('configInboxWhatsappAccessToken')} hint={t('configInboxWhatsappAccessTokenHint')}>
              <input
                value={settings.INBOX_WHATSAPP_ACCESS_TOKEN || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_ACCESS_TOKEN: e.target.value }))}
                placeholder="EAAG..."
              />
            </Field>
            <Field label={t('configInboxWhatsappPhoneNumberId')} hint={t('configInboxWhatsappPhoneNumberIdHint')}>
              <input
                value={settings.INBOX_WHATSAPP_PHONE_NUMBER_ID || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_PHONE_NUMBER_ID: e.target.value }))}
                placeholder="123456789012345"
              />
            </Field>
            <Field label={t('configInboxWhatsappBusinessAccountId')} hint={t('configInboxWhatsappBusinessAccountIdHint')}>
              <input
                value={settings.INBOX_WHATSAPP_BUSINESS_ACCOUNT_ID || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_BUSINESS_ACCOUNT_ID: e.target.value }))}
                placeholder="123456789012345"
              />
            </Field>
            <Field label={t('configInboxWhatsappWebhookVerify')} hint={t('configInboxWhatsappWebhookVerifyHint')}>
              <input
                value={settings.INBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN: e.target.value }))}
                placeholder={t('configInboxWhatsappWebhookVerifyPlaceholder')}
              />
            </Field>
            <Field label={t('configInboxWhatsappAppSecret')} hint={t('configInboxWhatsappAppSecretHint')}>
              <input
                value={settings.INBOX_WHATSAPP_APP_SECRET || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_WHATSAPP_APP_SECRET: e.target.value }))}
                placeholder={t('configInboxWhatsappAppSecretPlaceholder')}
              />
            </Field>
          </div>
        </div>

        <div className="stack gap-sm">
          <div className="muted">{t('configInboxWhatsappWebhookHeading')}</div>
          <code style={{ display: 'block', padding: 12, borderRadius: 12, background: 'var(--card-muted)', overflowX: 'auto' }}>
            {t('configInboxWhatsappWebhookPrefix')}{' '}
            https://YOUR-BACKEND/api/inbox/webhooks/whatsapp/{companyId}
          </code>
          <p className="muted" style={{ margin: 0 }}>
            {t('configInboxWhatsappFootnote')}
          </p>
        </div>

        <div className="form-actions" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => void onSave()} disabled={savingSettings}>
            {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
          </button>
        </div>
      </div>
    </Card>
  )
}

export function ConfigurationViberSection({ settings, setSettings, savingSettings, onSave, t }: Props) {
  const companyId = getStoredUser()?.companyId || 'COMPANY_ID'
  return (
    <Card className="settings-card">
      <SectionTitle>{t('tabViber')}</SectionTitle>
      <p className="muted" style={{ marginBottom: 16 }}>
        {t('configInboxViberPageSubtitle')}
      </p>
      <div className="stack gap-lg">
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{t('configInboxViberSectionTitle')}</h3>
          <div className="form-grid">
            <Field label={t('configInboxViberBotToken')} hint={t('configInboxViberBotTokenHint')}>
              <input
                value={settings.INBOX_VIBER_BOT_TOKEN || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_VIBER_BOT_TOKEN: e.target.value }))}
                placeholder={t('configInboxViberBotTokenPlaceholder')}
              />
            </Field>
            <Field label={t('configInboxViberBotName')}>
              <input
                value={settings.INBOX_VIBER_BOT_NAME || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_VIBER_BOT_NAME: e.target.value }))}
                placeholder="Calendra"
              />
            </Field>
            <Field label={t('configInboxViberBotAvatar')}>
              <input
                value={settings.INBOX_VIBER_BOT_AVATAR_URL || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, INBOX_VIBER_BOT_AVATAR_URL: e.target.value }))}
                placeholder="https://.../avatar.png"
              />
            </Field>
          </div>
        </div>

        <div className="stack gap-sm">
          <div className="muted">{t('configInboxViberWebhookHeading')}</div>
          <code style={{ display: 'block', padding: 12, borderRadius: 12, background: 'var(--card-muted)', overflowX: 'auto' }}>
            {t('configInboxViberWebhookPrefix')} https://YOUR-BACKEND/api/inbox/webhooks/viber/{companyId}
          </code>
          <p className="muted" style={{ margin: 0 }}>
            {t('configInboxViberFootnote')}
          </p>
        </div>

        <div className="form-actions" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => void onSave()} disabled={savingSettings}>
            {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
          </button>
        </div>
      </div>
    </Card>
  )
}
