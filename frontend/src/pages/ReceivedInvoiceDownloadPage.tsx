import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { User } from '../lib/types'
import { setPostLoginRedirect } from '../lib/session'

interface ReceivedInvoiceDownloadPageProps {
  user: User | null
  authResolved: boolean
}

function resolveDownloadFileName(contentDisposition: unknown, invoiceId: string) {
  const fallback = `racun-${invoiceId}.pdf`
  if (typeof contentDisposition !== 'string' || !contentDisposition.trim()) return fallback

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return utf8Match[1].trim()
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  return basicMatch?.[1]?.trim() || fallback
}

export function ReceivedInvoiceDownloadPage({ user, authResolved }: ReceivedInvoiceDownloadPageProps) {
  const { invoiceId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [downloadStarted, setDownloadStarted] = useState(false)

  const returnPath = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  )

  useEffect(() => {
    if (!authResolved) return

    if (!user) {
      setPostLoginRedirect(returnPath)
      navigate(`/login?next=${encodeURIComponent(returnPath)}`, { replace: true })
      return
    }

    const numericInvoiceId = Number(invoiceId)
    if (!Number.isInteger(numericInvoiceId) || numericInvoiceId <= 0) {
      setError('Povezava do računa ni veljavna.')
      return
    }

    let cancelled = false
    let objectUrl = ''
    let redirectTimer: number | undefined

    api.get(`/account-management/received-invoices/${numericInvoiceId}/pdf`, {
      responseType: 'blob',
    })
      .then((response) => {
        if (cancelled) return
        const blob = response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = resolveDownloadFileName(response.headers['content-disposition'], invoiceId)
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        setDownloadStarted(true)
        redirectTimer = window.setTimeout(() => {
          navigate('/configuration?tab=company&subtab=receivedInvoices', { replace: true })
        }, 900)
      })
      .catch((err) => {
        if (cancelled) return
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          sessionStorage.removeItem('user')
          sessionStorage.removeItem('token')
          setPostLoginRedirect(returnPath)
          window.location.replace(`/login?next=${encodeURIComponent(returnPath)}`)
          return
        }
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setError('Računa ni bilo mogoče najti ali pa do njega nimate dostopa.')
          return
        }
        setError('Prenos računa ni uspel. Poskusite ga odpreti med prejetimi računi.')
      })

    return () => {
      cancelled = true
      if (redirectTimer) window.clearTimeout(redirectTimer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [authResolved, invoiceId, navigate, returnPath, user])

  const openInvoices = () => navigate('/configuration?tab=company&subtab=receivedInvoices', { replace: true })

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
      <div style={{ width: '100%', maxWidth: 460, padding: 32, border: '1px solid #dce5f1', borderRadius: 20, background: '#fff', boxShadow: '0 18px 50px rgba(34,73,126,0.10)', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 26, color: '#111a2c' }}>
          {error ? 'Prenos ni uspel' : downloadStarted ? 'Prenos računa se je začel' : 'Pripravljamo vaš račun'}
        </h1>
        <p style={{ margin: '0 0 22px', lineHeight: 1.6, color: '#536581' }}>
          {error || (downloadStarted
            ? 'Preusmerjamo vas na seznam prejetih računov.'
            : 'Prosimo, počakajte trenutek.')}
        </p>
        {error && (
          <button
            type="button"
            onClick={openInvoices}
            style={{ border: 0, borderRadius: 12, padding: '13px 18px', background: '#1768e5', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
          >
            Odpri prejete račune
          </button>
        )}
      </div>
    </div>
  )
}


export function ReceivedInvoicesRedirectPage({ user, authResolved }: ReceivedInvoiceDownloadPageProps) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!authResolved) return
    const returnPath = `${location.pathname}${location.search}`
    if (!user) {
      setPostLoginRedirect(returnPath)
      navigate(`/login?next=${encodeURIComponent(returnPath)}`, { replace: true })
      return
    }
    navigate('/configuration?tab=company&subtab=receivedInvoices', { replace: true })
  }, [authResolved, location.pathname, location.search, navigate, user])

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
      <div style={{ width: '100%', maxWidth: 460, padding: 32, border: '1px solid #dce5f1', borderRadius: 20, background: '#fff', boxShadow: '0 18px 50px rgba(34,73,126,0.10)', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 26, color: '#111a2c' }}>Odpiramo prejete račune</h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: '#536581' }}>Prosimo, počakajte trenutek.</p>
      </div>
    </div>
  )
}
