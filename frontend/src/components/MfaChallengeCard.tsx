import { useEffect, useState } from 'react'
import axios from 'axios'
import { api } from '../api'
import { getPasskeyAssertionFromOptions, passkeyCapabilityMessage, supportsWebAuthn } from '../lib/webauthn'
import type { AuthPayload } from '../lib/session'

type Props = {
  pendingToken: string
  heading: string
  subheading?: string
  onSuccess: (data: AuthPayload) => void
  onBack?: () => void
}

export function MfaChallengeCard({ pendingToken, heading, subheading, onSuccess, onBack }: Props) {
  const [publicKey, setPublicKey] = useState<any | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [autoAttempted, setAutoAttempted] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadOptions = async () => {
      setLoadingOptions(true)
      setError('')
      try {
        const { data } = await api.post('/auth/mfa/webauthn/options', { pendingToken })
        if (!cancelled) setPublicKey(data.publicKey)
      } catch (err) {
        if (!cancelled) {
          if (axios.isAxiosError(err) && err.response?.data?.message) setError(String(err.response.data.message))
          else setError('Could not load the passkey challenge.')
        }
      } finally {
        if (!cancelled) setLoadingOptions(false)
      }
    }
    loadOptions()
    return () => {
      cancelled = true
    }
  }, [pendingToken])

  useEffect(() => {
    if (!publicKey || autoAttempted || !supportsWebAuthn()) return
    setAutoAttempted(true)
    void verifyWithPasskey(true)
  }, [publicKey, autoAttempted])

  const verifyWithPasskey = async (automatic = false) => {
    if (!publicKey) return
    if (!supportsWebAuthn()) {
      setError(passkeyCapabilityMessage())
      return
    }
    setVerifying(true)
    if (!automatic) setError('')
    try {
      const credentialJson = await getPasskeyAssertionFromOptions(publicKey)
      const { data } = await api.post('/auth/mfa/webauthn/verify', { pendingToken, credentialJson })
      onSuccess(data)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.message) setError(String(err.response.data.message))
      else if (!automatic) setError('Passkey verification failed.')
      else setError('Passkey verification was cancelled or failed. Try again or use a recovery code.')
    } finally {
      setVerifying(false)
    }
  }

  const verifyRecoveryCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setVerifying(true)
    setError('')
    try {
      const { data } = await api.post('/auth/mfa/recovery/verify', { pendingToken, code: recoveryCode })
      onSuccess(data)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.message) setError(String(err.response.data.message))
      else setError('Recovery code verification failed.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="card login polished-login polished-login--modern" style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}>
      <h2 style={{ marginBottom: 8 }}>{heading}</h2>
      {subheading && <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>{subheading}</p>}
      {loadingOptions && <p className="muted">Preparing your passkey challenge…</p>}
      {!supportsWebAuthn() && <div className="error">{passkeyCapabilityMessage()}</div>}
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        <button type="button" className="login-primary-btn" disabled={loadingOptions || verifying || !publicKey || !supportsWebAuthn()} onClick={() => verifyWithPasskey(false)}>
          {verifying ? 'Checking passkey…' : 'Use passkey'}
        </button>
        <form onSubmit={verifyRecoveryCode} style={{ display: 'grid', gap: 10 }}>
          <label className="login-modern-label" htmlFor="recovery-code">Recovery code</label>
          <input
            id="recovery-code"
            autoComplete="one-time-code"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
          />
          <button type="submit" disabled={verifying || !recoveryCode.trim()} className="login-social-btn">
            Use recovery code
          </button>
        </form>
        {onBack && (
          <button type="button" className="secondary" onClick={onBack}>
            Back
          </button>
        )}
      </div>
    </div>
  )
}
