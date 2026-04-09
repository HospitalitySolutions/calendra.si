import { useEffect, useState } from 'react'
import axios from 'axios'
import { api } from '../api'
import { Card, PageHeader, Pill, SectionTitle } from '../components/ui'
import { useLocale } from '../locale'
import { createPasskeyFromOptions, passkeyCapabilityMessage, supportsWebAuthn } from '../lib/webauthn'

type CredentialRow = {
  credentialId: string
  label: string
  discoverable: boolean
  createdAt?: string
  lastUsedAt?: string | null
}

type StatusResponse = {
  webauthnEnabled: boolean
  recoveryCodesRemaining: number
  credentials: CredentialRow[]
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

type SecurityPageProps = {
  embedded?: boolean
}

export function SecurityPage({ embedded = false }: SecurityPageProps) {
  const { t } = useLocale()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newCredentialLabel, setNewCredentialLabel] = useState('This device')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])

  const loadStatus = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/auth/mfa/status')
      setStatus(data)
    } catch {
      setError('Could not load your security settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  const registerPasskey = async () => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      if (!supportsWebAuthn()) {
        setError(passkeyCapabilityMessage())
        return
      }
      const start = await api.post('/auth/mfa/webauthn/register/start')
      const credentialJson = await createPasskeyFromOptions(start.data.publicKey)
      const finish = await api.post('/auth/mfa/webauthn/register/finish', {
        pendingToken: start.data.pendingToken,
        credentialJson,
        label: newCredentialLabel,
      })
      const codes = Array.isArray(finish.data?.recoveryCodes) ? finish.data.recoveryCodes : []
      setRecoveryCodes(codes)
      setSuccess('Passkey added successfully.')
      await loadStatus()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setError(String(err.response.data.message))
      } else if (err instanceof Error && err.message) {
        setError(err.message)
      } else {
        setError('Passkey registration failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  const regenerateRecoveryCodes = async () => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const { data } = await api.post('/auth/mfa/recovery/regenerate')
      setRecoveryCodes(Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : [])
      setSuccess('Recovery codes regenerated. Store the new set now; the previous set no longer works.')
      await loadStatus()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.message) setError(String(err.response.data.message))
      else setError('Could not regenerate recovery codes.')
    } finally {
      setBusy(false)
    }
  }

  const removeCredential = async (credentialId: string) => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.delete(`/auth/mfa/webauthn/credentials/${encodeURIComponent(credentialId)}`)
      setSuccess('Passkey removed.')
      await loadStatus()
    } catch {
      setError('Could not remove that passkey.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'security-page-embedded' : 'content content-android-native'} style={{ display: 'grid', gap: 16 }}>
      {!embedded && <PageHeader title={t('tabSecurity')} subtitle={t('securityPageSubtitle')} />}
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <Card>
        <SectionTitle>Passkeys</SectionTitle>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill tone={status?.webauthnEnabled ? 'green' : 'default'}>
              {status?.webauthnEnabled ? 'Enabled' : 'Not enabled'}
            </Pill>
            <span className="muted">{supportsWebAuthn() ? 'This browser can create and use passkeys.' : passkeyCapabilityMessage()}</span>
          </div>
          <label className="field">
            <span className="field-label">New passkey label</span>
            <input value={newCredentialLabel} onChange={(e) => setNewCredentialLabel(e.target.value)} placeholder="This device" />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={registerPasskey} disabled={busy || loading || !supportsWebAuthn()}>
              {busy ? 'Working…' : 'Add passkey'}
            </button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {(status?.credentials || []).map((credential) => (
              <div key={credential.credentialId} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <strong>{credential.label || 'Unnamed passkey'}</strong>
                  <button type="button" className="secondary" onClick={() => removeCredential(credential.credentialId)} disabled={busy}>
                    Remove
                  </button>
                </div>
                <div className="muted">Created: {formatDateTime(credential.createdAt)}</div>
                <div className="muted">Last used: {formatDateTime(credential.lastUsedAt)}</div>
                <div className="muted">Type: {credential.discoverable ? 'Passkey / discoverable credential' : 'Security key / non-discoverable credential'}</div>
              </div>
            ))}
            {!loading && (!status?.credentials || status.credentials.length === 0) && <div className="muted">No passkeys registered yet.</div>}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Recovery codes</SectionTitle>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill tone={status && status.recoveryCodesRemaining > 0 ? 'blue' : 'default'}>
              {status ? `${status.recoveryCodesRemaining} remaining` : '—'}
            </Pill>
            <span className="muted">Each code works once. Regenerating creates a brand new set.</span>
          </div>
          <div>
            <button type="button" onClick={regenerateRecoveryCodes} disabled={busy || loading || !status?.webauthnEnabled}>
              {busy ? 'Working…' : 'Generate new recovery codes'}
            </button>
          </div>
          {recoveryCodes.length > 0 && (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 14 }}>
              <strong>Save these now</strong>
              <p className="muted" style={{ marginTop: 6 }}>These codes are shown only once in full.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {recoveryCodes.map((code) => (
                  <code key={code} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-alt)' }}>{code}</code>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
