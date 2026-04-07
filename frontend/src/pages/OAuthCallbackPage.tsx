import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'

/**
 * Handles redirect from Google OAuth: stores token, fetches user, redirects to app.
 */
export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    const oauthError = searchParams.get('oauth_error')


    if (oauthError) {
      const err = decodeURIComponent(oauthError)
      console.error('OAuth error:', err)
      setError(err)
      return
    }

    if (!token) {
      const err = 'No token received from Google.'
      console.error(err)
      setError(err)
      return
    }

    sessionStorage.setItem('token', token)
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
        sessionStorage.setItem('user', JSON.stringify(user))
        navigate('/calendar', { replace: true })
        window.location.reload()
      })
      .catch((err) => {
        const msg = `Failed to load user profile: ${err.response?.status} ${err.message}`
        console.error(msg)
        setError(msg)
      })
  }, [searchParams, navigate])

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
