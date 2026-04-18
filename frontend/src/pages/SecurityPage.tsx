import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { api } from '../api'
import { Card, EmptyState, PageHeader, Pill, SectionTitle } from '../components/ui'
import { useLocale } from '../locale'
import { createPasskeyFromOptions, passkeyCapabilityMessage, supportsWebAuthn } from '../lib/webauthn'
import { clearAuthStoragePreservingTheme } from '../theme'

type PasskeyRow = {
  credentialId: string
  label: string
  discoverable: boolean
  createdAt?: string
  lastUsedAt?: string | null
  kind: string
}

type SessionRow = {
  sessionKey: string
  label: string
  ipAddress?: string | null
  issuedAt?: string
  lastSeenAt?: string
  current: boolean
  revoked: boolean
}

type ActivityRow = {
  type: string
  title: string
  detail?: string | null
  occurredAt?: string
  riskLevel?: string | null
}

type Alerts = {
  factorChangeAlertsEnabled: boolean
  suspiciousSignInAlertsEnabled: boolean
}

type SecurityOverview = {
  passkeys: PasskeyRow[]
  recoveryCodesRemaining: number
  sessions: SessionRow[]
  activity: ActivityRow[]
  alerts: Alerts
  passkeyCount: number
  activeSessionCount: number
}

type SecurityPageProps = {
  embedded?: boolean
}

type ReauthRequest = {
  title: string
  execute: (reauthToken: string) => Promise<void>
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function formatAgo(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / 60000)
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 14) return `${diffDays}d ago`
  return formatDateTime(value)
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
}

export function SecurityPage({ embedded = false }: SecurityPageProps) {
  const { t } = useLocale()
  const [overview, setOverview] = useState<SecurityOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [newPasskeyLabel, setNewPasskeyLabel] = useState('This device')
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null)
  const [editingPasskeyLabel, setEditingPasskeyLabel] = useState('')
  const [draftAlerts, setDraftAlerts] = useState<Alerts>({
    factorChangeAlertsEnabled: true,
    suspiciousSignInAlertsEnabled: true,
  })
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthRequest, setReauthRequest] = useState<ReauthRequest | null>(null)
  const [reauthBusy, setReauthBusy] = useState(false)
  const [reauthError, setReauthError] = useState('')
  const [reauthToken, setReauthToken] = useState(() => sessionStorage.getItem('securityReauthToken') || '')

  const loadOverview = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/security/overview')
      setOverview(data)
      setDraftAlerts(data.alerts)
    } catch {
      setError('Could not load your security overview.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  const syncedPasskeys = useMemo(
    () => (overview?.passkeys || []).filter((passkey) => passkey.discoverable),
    [overview?.passkeys],
  )
  const securityKeys = useMemo(
    () => (overview?.passkeys || []).filter((passkey) => !passkey.discoverable),
    [overview?.passkeys],
  )
  const activeSessions = useMemo(
    () => (overview?.sessions || []).filter((session) => !session.revoked),
    [overview?.sessions],
  )

  const resetFeedback = () => {
    setError('')
    setSuccess('')
  }

  const applyError = (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err) && err.response?.data?.message) setError(String(err.response.data.message))
    else if (err instanceof Error && err.message) setError(err.message)
    else setError(fallback)
  }

  const persistReauthToken = (token: string) => {
    setReauthToken(token)
    sessionStorage.setItem('securityReauthToken', token)
  }

  const clearReauthToken = () => {
    setReauthToken('')
    sessionStorage.removeItem('securityReauthToken')
  }

  const runProtected = async (title: string, action: (token: string) => Promise<void>) => {
    resetFeedback()
    if (reauthToken) {
      try {
        await action(reauthToken)
        return
      } catch (err) {
        if (axios.isAxiosError(err) && [401, 403].includes(err.response?.status || 0)) {
          clearReauthToken()
        } else {
          applyError(err, 'Security update failed.')
          return
        }
      }
    }
    setReauthError('')
    setReauthPassword('')
    setReauthRequest({ title, execute: action })
  }

  const submitReauth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!reauthRequest) return
    setReauthBusy(true)
    setReauthError('')
    try {
      const { data } = await api.post('/security/reauth', { password: reauthPassword })
      const token = String(data?.reauthToken || '')
      if (!token) throw new Error('No re-authentication token returned.')
      persistReauthToken(token)
      await reauthRequest.execute(token)
      setReauthRequest(null)
      setReauthPassword('')
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.message) setReauthError(String(err.response.data.message))
      else if (err instanceof Error) setReauthError(err.message)
      else setReauthError('Re-authentication failed.')
    } finally {
      setReauthBusy(false)
    }
  }

  const withBusy = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  const registerPasskey = async () => {
    await runProtected('Confirm your password to add a new passkey.', async (token) => {
      await withBusy(async () => {
        if (!supportsWebAuthn()) {
          setError(passkeyCapabilityMessage())
          return
        }
        const start = await api.post('/security/passkeys/register/start', undefined, {
          headers: { 'X-Reauth-Token': token },
        })
        const credentialJson = await createPasskeyFromOptions(start.data.publicKey)
        const finish = await api.post('/security/passkeys/register/finish', {
          pendingToken: start.data.pendingToken,
          credentialJson,
          label: newPasskeyLabel,
        }, {
          headers: { 'X-Reauth-Token': token },
        })
        const codes = Array.isArray(finish.data?.recoveryCodes) ? finish.data.recoveryCodes : []
        setRecoveryCodes(codes)
        setSuccess('Passkey added successfully.')
        await loadOverview()
      })
    })
  }

  const savePasskeyLabel = async (credentialId: string) => {
    await runProtected('Confirm your password to rename this passkey.', async (token) => {
      await withBusy(async () => {
        await api.patch(`/security/passkeys/${encodeURIComponent(credentialId)}`, {
          label: editingPasskeyLabel,
        }, {
          headers: { 'X-Reauth-Token': token },
        })
        setEditingPasskeyId(null)
        setEditingPasskeyLabel('')
        setSuccess('Passkey renamed.')
        await loadOverview()
      })
    })
  }

  const removePasskey = async (credentialId: string, label: string) => {
    if (!window.confirm(`Remove “${label}”?`)) return
    await runProtected('Confirm your password to remove this passkey.', async (token) => {
      await withBusy(async () => {
        await api.delete(`/security/passkeys/${encodeURIComponent(credentialId)}`, {
          headers: { 'X-Reauth-Token': token },
        })
        setSuccess('Passkey removed.')
        await loadOverview()
      })
    })
  }

  const regenerateCodes = async () => {
    await runProtected('Confirm your password to generate a new set of recovery codes.', async (token) => {
      await withBusy(async () => {
        const { data } = await api.post('/security/recovery/regenerate', undefined, {
          headers: { 'X-Reauth-Token': token },
        })
        setRecoveryCodes(Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : [])
        setSuccess('Recovery codes regenerated. Save the new set now; the previous codes no longer work.')
        await loadOverview()
      })
    })
  }

  const saveAlerts = async () => {
    await runProtected('Confirm your password to update security alerts.', async (token) => {
      await withBusy(async () => {
        const { data } = await api.put('/security/alerts', draftAlerts, {
          headers: { 'X-Reauth-Token': token },
        })
        setDraftAlerts(data)
        setSuccess('Alert preferences updated.')
        await loadOverview()
      })
    })
  }

  const revokeSession = async (session: SessionRow) => {
    const copy = session.current ? 'Sign out this device?' : `Sign out ${session.label}?`
    if (!window.confirm(copy)) return
    await runProtected('Confirm your password to sign out this session.', async (token) => {
      await withBusy(async () => {
        await api.delete(`/security/sessions/${encodeURIComponent(session.sessionKey)}`, {
          headers: { 'X-Reauth-Token': token },
        })
        if (session.current) {
          clearAuthStoragePreservingTheme()
          window.location.assign('/')
          return
        }
        setSuccess('Session signed out.')
        await loadOverview()
      })
    })
  }

  const revokeOtherSessions = async () => {
    if (!window.confirm('Sign out all other sessions?')) return
    await runProtected('Confirm your password to sign out your other sessions.', async (token) => {
      await withBusy(async () => {
        await api.post('/security/sessions/revoke-others', undefined, {
          headers: { 'X-Reauth-Token': token },
        })
        setSuccess('Other sessions signed out.')
        await loadOverview()
      })
    })
  }

  const downloadRecoveryCodes = () => {
    const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'recovery-codes.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const copyRecoveryCodes = async () => {
    try {
      await copyText(recoveryCodes.join('\n'))
      setSuccess('Recovery codes copied.')
    } catch {
      setError('Could not copy the recovery codes.')
    }
  }

  return (
    <div className={embedded ? 'security-page security-page-embedded' : 'security-page content content-android-native'}>
      {!embedded && <PageHeader title={t('tabSecurity')} subtitle="Manage passkeys, active sessions, alerts, and recent account security activity." />}
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <Card className="security-hero-card">
        <div className="security-hero-grid">
          <div>
            <div className="security-eyebrow">Security overview</div>
            <h2 className="security-hero-title">Your account security in one place</h2>
            <p className="muted security-hero-copy">
              Review passkeys, revoke active sessions, inspect recent security events, and control alerts for factor changes and suspicious sign-ins.
            </p>
          </div>
          <div className="security-stat-grid">
            <div className="security-stat-card">
              <span className="security-stat-value">{overview?.passkeyCount ?? '—'}</span>
              <span className="security-stat-label">Passkeys</span>
            </div>
            <div className="security-stat-card">
              <span className="security-stat-value">{overview?.activeSessionCount ?? '—'}</span>
              <span className="security-stat-label">Active sessions</span>
            </div>
            <div className="security-stat-card">
              <span className="security-stat-value">{overview?.recoveryCodesRemaining ?? '—'}</span>
              <span className="security-stat-label">Recovery codes left</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="security-layout-grid">
        <Card>
          <SectionTitle action={<Pill tone={supportsWebAuthn() ? 'green' : 'default'}>{supportsWebAuthn() ? 'Ready' : 'Unavailable'}</Pill>}>
            Sign-in methods
          </SectionTitle>
          <p className="muted security-section-copy">Passkeys let you sign in with your device or a hardware security key. Sensitive changes require you to re-enter your password first.</p>

          <div className="security-subsection">
            <div className="security-subsection-head">
              <div>
                <strong>Passkeys on your devices</strong>
                <p className="muted">Synced passkeys that can usually travel with your platform account.</p>
              </div>
            </div>
            {syncedPasskeys.length === 0 ? (
              <EmptyState title="No synced passkeys yet" text="Add a passkey from this browser or device to make sign-in easier and phishing-resistant." />
            ) : (
              <div className="security-stack">
                {syncedPasskeys.map((passkey) => (
                  <div key={passkey.credentialId} className="security-list-item">
                    <div className="security-list-item-main">
                      {editingPasskeyId === passkey.credentialId ? (
                        <div className="security-inline-editor">
                          <input value={editingPasskeyLabel} onChange={(e) => setEditingPasskeyLabel(e.target.value)} placeholder="Passkey label" />
                          <div className="security-inline-actions">
                            <button type="button" onClick={() => void savePasskeyLabel(passkey.credentialId)} disabled={busy || !editingPasskeyLabel.trim()}>
                              Save
                            </button>
                            <button type="button" className="secondary" onClick={() => setEditingPasskeyId(null)} disabled={busy}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="security-item-title-row">
                            <strong>{passkey.label || 'Unnamed passkey'}</strong>
                            <Pill tone="blue">{passkey.kind}</Pill>
                          </div>
                          <div className="security-meta-grid muted">
                            <span>Added {formatDateTime(passkey.createdAt)}</span>
                            <span>Last used {formatAgo(passkey.lastUsedAt)}</span>
                          </div>
                        </>
                      )}
                    </div>
                    {editingPasskeyId !== passkey.credentialId && (
                      <div className="security-item-actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            setEditingPasskeyId(passkey.credentialId)
                            setEditingPasskeyLabel(passkey.label || '')
                          }}
                        >
                          Rename
                        </button>
                        <button type="button" className="secondary danger" disabled={busy} onClick={() => void removePasskey(passkey.credentialId, passkey.label || 'this passkey')}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="security-subsection">
            <div className="security-subsection-head">
              <div>
                <strong>Passkeys on security keys</strong>
                <p className="muted">Hardware keys that stay on a physical authenticator.</p>
              </div>
            </div>
            {securityKeys.length === 0 ? (
              <EmptyState title="No hardware security keys" text="You can still add one from a supported browser whenever you want a removable hardware factor." />
            ) : (
              <div className="security-stack">
                {securityKeys.map((passkey) => (
                  <div key={passkey.credentialId} className="security-list-item">
                    <div className="security-list-item-main">
                      {editingPasskeyId === passkey.credentialId ? (
                        <div className="security-inline-editor">
                          <input value={editingPasskeyLabel} onChange={(e) => setEditingPasskeyLabel(e.target.value)} placeholder="Passkey label" />
                          <div className="security-inline-actions">
                            <button type="button" onClick={() => void savePasskeyLabel(passkey.credentialId)} disabled={busy || !editingPasskeyLabel.trim()}>
                              Save
                            </button>
                            <button type="button" className="secondary" onClick={() => setEditingPasskeyId(null)} disabled={busy}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="security-item-title-row">
                            <strong>{passkey.label || 'Unnamed security key'}</strong>
                            <Pill tone="default">{passkey.kind}</Pill>
                          </div>
                          <div className="security-meta-grid muted">
                            <span>Added {formatDateTime(passkey.createdAt)}</span>
                            <span>Last used {formatAgo(passkey.lastUsedAt)}</span>
                          </div>
                        </>
                      )}
                    </div>
                    {editingPasskeyId !== passkey.credentialId && (
                      <div className="security-item-actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            setEditingPasskeyId(passkey.credentialId)
                            setEditingPasskeyLabel(passkey.label || '')
                          }}
                        >
                          Rename
                        </button>
                        <button type="button" className="secondary danger" disabled={busy} onClick={() => void removePasskey(passkey.credentialId, passkey.label || 'this security key')}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="security-add-box">
            <label className="field">
              <span className="field-label">New passkey label</span>
              <input value={newPasskeyLabel} onChange={(e) => setNewPasskeyLabel(e.target.value)} placeholder="This device" />
            </label>
            <div className="security-add-actions">
              <button type="button" disabled={busy || loading || !supportsWebAuthn()} onClick={() => void registerPasskey()}>
                {busy ? 'Working…' : 'Add passkey'}
              </button>
              {!supportsWebAuthn() && <span className="muted">{passkeyCapabilityMessage()}</span>}
            </div>
          </div>
        </Card>

        <div className="security-right-column">
          <Card>
            <SectionTitle action={<Pill tone={overview && overview.recoveryCodesRemaining > 0 ? 'blue' : 'default'}>{overview?.recoveryCodesRemaining ?? 0} left</Pill>}>
              Recovery
            </SectionTitle>
            <p className="muted security-section-copy">Each recovery code works once. Generating a new set invalidates the old one.</p>
            <div className="security-inline-actions">
              <button type="button" onClick={() => void regenerateCodes()} disabled={busy || loading || !overview?.passkeyCount}>
                {busy ? 'Working…' : 'Generate new recovery codes'}
              </button>
            </div>
            {recoveryCodes.length > 0 && (
              <div className="security-recovery-box">
                <strong>Save these now</strong>
                <p className="muted">These codes are shown only once in full.</p>
                <div className="security-recovery-grid">
                  {recoveryCodes.map((code) => (
                    <code key={code}>{code}</code>
                  ))}
                </div>
                <div className="security-inline-actions">
                  <button type="button" className="secondary" onClick={() => void copyRecoveryCodes()}>
                    Copy
                  </button>
                  <button type="button" className="secondary" onClick={downloadRecoveryCodes}>
                    Download
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle action={<Pill tone="green">Alerts</Pill>}>
              Security alerts
            </SectionTitle>
            <p className="muted security-section-copy">Send alerts for factor changes and suspicious sign-ins.</p>
            <div className="security-toggle-list">
              <label className="security-toggle-row">
                <div>
                  <strong>Factor change alerts</strong>
                  <p className="muted">Email me when passkeys or recovery codes change.</p>
                </div>
                <input
                  type="checkbox"
                  checked={draftAlerts.factorChangeAlertsEnabled}
                  onChange={(e) => setDraftAlerts((prev) => ({ ...prev, factorChangeAlertsEnabled: e.target.checked }))}
                />
              </label>
              <label className="security-toggle-row">
                <div>
                  <strong>Suspicious sign-in alerts</strong>
                  <p className="muted">Email me when a sign-in looks unusual for my account.</p>
                </div>
                <input
                  type="checkbox"
                  checked={draftAlerts.suspiciousSignInAlertsEnabled}
                  onChange={(e) => setDraftAlerts((prev) => ({ ...prev, suspiciousSignInAlertsEnabled: e.target.checked }))}
                />
              </label>
            </div>
            <button type="button" onClick={() => void saveAlerts()} disabled={busy || loading}>
              Save alert preferences
            </button>
          </Card>
        </div>
      </div>

      <div className="security-layout-grid security-layout-grid--bottom">
        <Card>
          <SectionTitle action={<Pill tone="default">{activeSessions.length} active</Pill>}>
            Active sessions
          </SectionTitle>
          <p className="muted security-section-copy">Review where you are signed in and revoke sessions you no longer trust.</p>
          <div className="security-inline-actions security-inline-actions--wrap">
            <button type="button" className="secondary" disabled={busy || activeSessions.length <= 1} onClick={() => void revokeOtherSessions()}>
              Sign out other sessions
            </button>
          </div>
          {activeSessions.length === 0 ? (
            <EmptyState title="No tracked sessions yet" text="Sessions will appear here as you sign in from devices and browsers." />
          ) : (
            <div className="security-stack">
              {activeSessions.map((session) => (
                <div key={session.sessionKey} className="security-list-item">
                  <div className="security-list-item-main">
                    <div className="security-item-title-row">
                      <strong>{session.label || 'Unknown device'}</strong>
                      {session.current && <Pill tone="green">Current session</Pill>}
                    </div>
                    <div className="security-meta-grid muted">
                      <span>Started {formatDateTime(session.issuedAt)}</span>
                      <span>Last active {formatAgo(session.lastSeenAt)}</span>
                      <span>{session.ipAddress || 'IP unavailable'}</span>
                    </div>
                  </div>
                  <div className="security-item-actions">
                    <button type="button" className="secondary danger" disabled={busy} onClick={() => void revokeSession(session)}>
                      {session.current ? 'Sign out' : 'Sign out session'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Security activity</SectionTitle>
          <p className="muted security-section-copy">Recent sign-ins, factor changes, and account security events.</p>
          {!loading && (!overview?.activity || overview.activity.length === 0) ? (
            <EmptyState title="No security activity yet" text="When security events happen, they will show up here." />
          ) : (
            <div className="security-timeline">
              {(overview?.activity || []).map((event, index) => (
                <div key={`${event.type}-${event.occurredAt || index}`} className="security-timeline-item">
                  <div className={`security-timeline-dot security-timeline-dot--${(event.riskLevel || 'info').toLowerCase()}`} />
                  <div>
                    <div className="security-item-title-row">
                      <strong>{event.title}</strong>
                      <span className="muted">{formatAgo(event.occurredAt)}</span>
                    </div>
                    {event.detail && <p className="muted security-timeline-copy">{event.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {reauthRequest && (
        <div className="security-modal-backdrop" role="presentation">
          <div className="card security-reauth-card" role="dialog" aria-modal="true" aria-labelledby="security-reauth-title">
            <h3 id="security-reauth-title">Confirm it’s you</h3>
            <p className="muted">{reauthRequest.title}</p>
            {reauthError && <div className="error">{reauthError}</div>}
            <form onSubmit={submitReauth} className="security-reauth-form">
              <label className="field">
                <span className="field-label">Password</span>
                <input
                  type="password"
                  autoFocus
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </label>
              <div className="security-inline-actions">
                <button type="submit" disabled={reauthBusy || !reauthPassword.trim()}>
                  {reauthBusy ? 'Checking…' : 'Continue'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setReauthRequest(null)
                    setReauthError('')
                    setReauthPassword('')
                  }}
                  disabled={reauthBusy}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
