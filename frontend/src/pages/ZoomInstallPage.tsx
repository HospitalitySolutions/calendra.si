import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { consumePostZoomReturnPath, getPostZoomReturnPath, setPostLoginRedirect, setPostZoomReturnPath } from '../lib/session'

type RedirectState = 'idle' | 'starting' | 'done'

const ZOOM_OAUTH_IN_PROGRESS_KEY = 'zoomOAuthInProgressAt'
const ZOOM_OAUTH_SETTLED_KEY = 'zoomOAuthSettledAt'
const ZOOM_OAUTH_GUARD_MS = 15_000

export function ZoomInstallPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getStoredUser()
  const [status, setStatus] = useState<RedirectState>('idle')
  const [error, setError] = useState('')
  const [connectedOverride, setConnectedOverride] = useState(false)
  const startedRef = useRef(false)

  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const zoomConnected = params.get('zoom_connected')
  const zoomError = params.get('zoom_error')
  const nextPath = getPostZoomReturnPath(params.get('next') || '/calendar')
  const connected = zoomConnected === '1' || connectedOverride

  useEffect(() => {
    if (!zoomConnected && !zoomError) return
    sessionStorage.removeItem(ZOOM_OAUTH_IN_PROGRESS_KEY)
    sessionStorage.setItem(ZOOM_OAUTH_SETTLED_KEY, String(Date.now()))
    if (zoomConnected) {
      setConnectedOverride(true)
      setError('')
    }
    setStatus('done')
  }, [zoomConnected, zoomError])

  useEffect(() => {
    const target = params.get('next') || nextPath
    setPostZoomReturnPath(target)

    if (!user) {
      const loginTarget = `${location.pathname}${location.search}`
      setPostLoginRedirect(loginTarget)
      navigate(`/login?next=${encodeURIComponent(loginTarget)}`, { replace: true })
      return
    }

    if (connected || zoomError || startedRef.current) return

    const now = Date.now()
    const settledAt = Number(sessionStorage.getItem(ZOOM_OAUTH_SETTLED_KEY) || '0')
    if (settledAt && now - settledAt < 4000) {
      setStatus('done')
      return
    }

    const startedAt = Number(sessionStorage.getItem(ZOOM_OAUTH_IN_PROGRESS_KEY) || '0')
    if (startedAt && now - startedAt < ZOOM_OAUTH_GUARD_MS) {
      setStatus('starting')
      api.get('/zoom/status')
        .then((res) => {
          if (res.data?.connected) {
            sessionStorage.removeItem(ZOOM_OAUTH_IN_PROGRESS_KEY)
            sessionStorage.setItem(ZOOM_OAUTH_SETTLED_KEY, String(Date.now()))
            setConnectedOverride(true)
            setError('')
            setStatus('done')
          }
        })
        .catch(() => undefined)
      return
    }

    if (startedAt) {
      sessionStorage.removeItem(ZOOM_OAUTH_IN_PROGRESS_KEY)
    }

    startedRef.current = true
    sessionStorage.setItem(ZOOM_OAUTH_IN_PROGRESS_KEY, String(now))
    setStatus('starting')
    setError('')

    api.get('/zoom/authorize')
      .then(({ data }) => {
        const redirectUrl = typeof data?.redirectUrl === 'string' ? data.redirectUrl : ''
        if (!redirectUrl) {
          sessionStorage.removeItem(ZOOM_OAUTH_IN_PROGRESS_KEY)
          setError('Zoom authorization URL is missing.')
          setStatus('done')
          startedRef.current = false
          return
        }
        window.location.assign(redirectUrl)
      })
      .catch((err) => {
        sessionStorage.removeItem(ZOOM_OAUTH_IN_PROGRESS_KEY)
        const msg = axios.isAxiosError(err)
          ? String(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to start Zoom authorization.')
          : 'Failed to start Zoom authorization.'
        setError(msg)
        setStatus('done')
        startedRef.current = false
      })
  }, [connected, location.pathname, location.search, navigate, nextPath, params, user, zoomError])

  const message = connected
    ? 'Zoom connected successfully. You can return to where you left off and continue setting up your online booking.'
    : zoomError
      ? `Zoom authorization failed: ${decodeURIComponent(zoomError)}`
      : error || (status === 'starting'
          ? 'Redirecting you to Zoom to authorize the integration…'
          : 'Preparing Zoom authorization…')

  return (
    <div className="login-wrap login-bg">
      <div className="card login" style={{ maxWidth: 460 }}>
        <h2>Connect Zoom</h2>
        <p>{message}</p>
        {(connected || zoomError || error) && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" className="login-primary-btn" onClick={() => navigate(consumePostZoomReturnPath(nextPath), { replace: true })}>
              {connected ? 'Return to booking' : 'Go to calendar'}
            </button>
            {!connected && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  startedRef.current = false
                  sessionStorage.removeItem(ZOOM_OAUTH_IN_PROGRESS_KEY)
                  sessionStorage.removeItem(ZOOM_OAUTH_SETTLED_KEY)
                  setConnectedOverride(false)
                  setError('')
                  setStatus('idle')
                  navigate(`/zoom/install?next=${encodeURIComponent(nextPath)}`, { replace: true })
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
