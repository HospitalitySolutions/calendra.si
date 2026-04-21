import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { consumePostZoomReturnPath, getPostZoomReturnPath, setPostLoginRedirect, setPostZoomReturnPath } from '../lib/session'

type RedirectState = 'idle' | 'starting' | 'done'

export function ZoomInstallPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getStoredUser()
  const [status, setStatus] = useState<RedirectState>('idle')
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const zoomConnected = params.get('zoom_connected')
  const zoomError = params.get('zoom_error')
  const nextPath = getPostZoomReturnPath(params.get('next') || '/calendar')

  useEffect(() => {
    if (!zoomConnected) return

    setStatus('done')
    setError('')
    const returnTarget = consumePostZoomReturnPath(nextPath)
    const timeoutId = window.setTimeout(() => {
      navigate(returnTarget, { replace: true })
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [navigate, nextPath, zoomConnected])

  useEffect(() => {
    const target = params.get('next') || nextPath
    setPostZoomReturnPath(target)

    if (!user) {
      const loginTarget = `${location.pathname}${location.search}`
      setPostLoginRedirect(loginTarget)
      navigate(`/login?next=${encodeURIComponent(loginTarget)}`, { replace: true })
      return
    }

    if (zoomConnected || zoomError || startedRef.current) return

    startedRef.current = true
    setStatus('starting')
    setError('')

    api.get('/zoom/authorize')
      .then(({ data }) => {
        const redirectUrl = typeof data?.redirectUrl === 'string' ? data.redirectUrl : ''
        if (!redirectUrl) {
          setError('Zoom authorization URL is missing.')
          setStatus('done')
          startedRef.current = false
          return
        }
        window.location.assign(redirectUrl)
      })
      .catch((err) => {
        const msg = axios.isAxiosError(err)
          ? String(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to start Zoom authorization.')
          : 'Failed to start Zoom authorization.'
        setError(msg)
        setStatus('done')
        startedRef.current = false
      })
  }, [location.pathname, location.search, navigate, nextPath, params, user, zoomConnected, zoomError])

  const message = zoomConnected
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
        {(zoomConnected || zoomError || error) && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" className="login-primary-btn" onClick={() => navigate(consumePostZoomReturnPath(nextPath), { replace: true })}>
              {zoomConnected ? 'Return to booking' : 'Go to calendar'}
            </button>
            {!zoomConnected && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  startedRef.current = false
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
