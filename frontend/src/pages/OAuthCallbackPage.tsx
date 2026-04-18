import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ensureCsrfToken } from '../api'
import { MfaChallengeCard } from '../components/MfaChallengeCard'
import { consumePostLoginRedirect, storeAuthenticatedSession } from '../lib/session'

/**
 * Handles redirect from Google OAuth: backend sets the auth cookie, frontend loads the user profile.
 */
export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pendingToken, setPendingToken] = useState<string | null>(null)

  useEffect(() => {
    void ensureCsrfToken().catch(() => undefined)

    const oauthError = searchParams.get('oauth_error')
    const mfaToken = searchParams.get('mfa_token')

    if (oauthError) {
      const err = decodeURIComponent(oauthError)
      console.error('OAuth error:', err)
      setError(err)
      return
    }

    if (mfaToken) {
      setPendingToken(mfaToken)
      return
    }

    api
      .get('/auth/me')
      .then((res) => {
        const user = res.data?.user
        if (!user) {
          const err = 'Could not load user profile.'
          console.error(err)
          setError(err)
          return
        }
        storeAuthenticatedSession({ user })
        window.location.assign(consumePostLoginRedirect('/calendar'))
      })
      .catch((err) => {
        const msg = `Failed to load user profile: ${err.response?.status} ${err.message}`
        console.error(msg)
        setError(msg)
      })
  }, [searchParams, navigate])

  if (pendingToken) {
    return (
      <div className="login-wrap login-bg">
        <MfaChallengeCard
          pendingToken={pendingToken}
          heading="Two-factor verification"
          subheading="Use your passkey or a recovery code to finish signing in with Google."
          onSuccess={(data) => {
            storeAuthenticatedSession(data)
            window.location.assign(consumePostLoginRedirect('/calendar'))
          }}
          onBack={() => navigate('/login', { replace: true })}
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="login-wrap login-bg">
        <div className="card login" style={{ maxWidth: 400 }}>
          <h2>Sign in failed</h2>
          <p className="error">{error}</p>
          <a href="/" className="secondary" style={{ display: 'inline-block', marginTop: 16 }}>
            Back to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap login-bg">
      <div className="card login" style={{ maxWidth: 400 }}>
        <p>Signing you in...</p>
      </div>
    </div>
  )
}
