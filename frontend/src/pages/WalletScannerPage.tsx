import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { api } from '../api'
import { Card, Field } from '../components/ui'
import { useLocale } from '../locale'

type ScanClient = {
  id: number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
}

type ScanEntitlement = {
  id: number
  code?: string | null
  productName?: string | null
  entitlementType?: string | null
  remainingUses?: number | null
  totalUses?: number | null
  visitCount?: number | null
  validUntil?: string | null
  status?: string | null
}

type ScanResponse = {
  success: boolean
  result: string
  message?: string | null
  client?: ScanClient | null
  entitlement?: ScanEntitlement | null
  bookingId?: number | null
}

type ScanSource = 'qr' | 'manual'

type ScannerIconKind = 'qr' | 'ticket' | 'box' | 'camera' | 'keyboard' | 'tip'

function resultMessage(result: string | undefined, fallback: string | null | undefined, t: (key: string) => string) {
  switch (result) {
    case 'INVALID_CODE':
      return t('scannerResultInvalidCode')
    case 'EXPIRED':
      return t('scannerResultExpired')
    case 'NO_VISITS_REMAINING':
      return t('scannerResultNoVisits')
    case 'DUPLICATE_SCAN':
      return t('scannerResultDuplicate')
    case 'PERMISSION_DENIED':
      return t('scannerResultPermission')
    case 'ALREADY_BOOKED':
      return t('scannerResultAlreadyBooked')
    case 'GROUP_FULL':
      return t('scannerResultGroupFull')
    case 'UNSUPPORTED_ENTITLEMENT':
      return t('scannerResultUnsupportedGroupEntitlement')
    case 'UNSUPPORTED_PAYMENT_ENTITLEMENT':
      return t('scannerResultUnsupportedPaymentEntitlement')
    case 'SERVICE_TYPE_MISMATCH':
      return fallback || t('scannerResultServiceTypeMismatch')
    case 'PAYMENT_BOOKING_NOT_FOUND':
      return fallback || t('scannerResultPaymentBookingNotFound')
    case 'PAYMENT_CLIENT_MISMATCH':
      return fallback || t('scannerResultPaymentClientMismatch')
    case 'ALREADY_PAID_WITH_ENTITLEMENT':
      return fallback || t('scannerResultAlreadyPaidWithEntitlement')
    case 'GROUP_JOIN_FAILED':
      return fallback || t('scannerResultGroupJoinFailed')
    default:
      return fallback || t('scannerResultGenericError')
  }
}

function resultCodeFromServerMessage(message: string | undefined) {
  if (!message) return undefined
  const lowered = message.toLowerCase()
  if (lowered.includes('already booked') || lowered.includes('already added')) return 'ALREADY_BOOKED'
  if (lowered.includes('full') || lowered.includes('no public spots') || lowered.includes('limited to invited')) return 'GROUP_FULL'
  if (lowered.includes('different service type') || lowered.includes('not linked to the service type')) return 'SERVICE_TYPE_MISMATCH'
  return undefined
}

function cameraErrorMessage(error: unknown, t: (key: string) => string) {
  const name = typeof error === 'object' && error && 'name' in error ? String((error as { name?: unknown }).name ?? '') : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return t('scannerCameraPermissionDenied')
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return t('scannerCameraNotFound')
  }
  return t('scannerCameraUnsupportedDetailed')
}

function ScannerIcon({ kind }: { kind: ScannerIconKind }) {
  switch (kind) {
    case 'ticket':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 5.5 19 11l-8 8-5.5-5.5 8-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9.5 9.5h.01M12 12h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'box':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M4.5 7.5 12 12l7.5-4.5M12 12v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
    case 'camera':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8.5 7.5h7l1 1.5H19A2.5 2.5 0 0 1 21.5 11.5v5A2.5 2.5 0 0 1 19 19H5a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 5 9h2.5l1-1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="12" cy="14" r="3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )
    case 'keyboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="6" width="17" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6.5 10.5h1M9.5 10.5h1M12.5 10.5h1M15.5 10.5h1M6.5 13.5h6M14.5 13.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'tip':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5a6.5 6.5 0 0 0-3.75 11.8c.69.5 1.19 1.13 1.39 1.95l.06.25h4.6l.06-.25c.2-.82.7-1.45 1.39-1.95A6.5 6.5 0 0 0 12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9.5 20h5M10 17.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'qr':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="3.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="14.5" y="3.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="3.5" y="14.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6.5 6.5h.01M17.5 6.5h.01M6.5 17.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M14.5 14.5h2v2h-2zM18.5 14.5h2v2h-2zM14.5 18.5h2v2h-2zM18.5 18.5h2v2h-2z" fill="currentColor" />
        </svg>
      )
  }
}

export function WalletScannerPage() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const location = useLocation()
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const groupBookingId = Number(query.get('groupBookingId'))
  const scannerGroupBookingId = Number.isFinite(groupBookingId) && groupBookingId > 0 ? groupBookingId : null
  const paymentBookingId = Number(query.get('paymentBookingId'))
  const scannerPaymentBookingId = Number.isFinite(paymentBookingId) && paymentBookingId > 0 ? paymentBookingId : null
  const autoStartCamera = query.get('autoStart') === '1' || query.get('camera') === '1'
  const returnTo = query.get('returnTo') || (scannerPaymentBookingId ? `/calendar/booking/${scannerPaymentBookingId}` : scannerGroupBookingId ? `/calendar/booking/${scannerGroupBookingId}` : null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const qrReaderRef = useRef<BrowserQRCodeReader | null>(null)
  const scanningLockRef = useRef(false)
  const autoStartedRef = useRef(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraIssue, setCameraIssue] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error' | 'info'; text: string; detail?: string } | null>(null)

  const scanOptions = [
    {
      key: 'membership',
      icon: 'qr' as const,
      title: t('scannerOptionMembershipTitle'),
      subtitle: t('scannerOptionMembershipSubtitle'),
    },
    {
      key: 'ticket',
      icon: 'ticket' as const,
      title: t('scannerOptionTicketTitle'),
      subtitle: t('scannerOptionTicketSubtitle'),
    },
    {
      key: 'pack',
      icon: 'box' as const,
      title: t('scannerOptionPackTitle'),
      subtitle: t('scannerOptionPackSubtitle'),
    },
  ]

  const stopCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.stop()
      controlsRef.current = null
    }
    qrReaderRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    scanningLockRef.current = false
    setCameraActive(false)
  }

  useEffect(() => stopCamera, [])

  const openScannedClient = (data: ScanResponse) => {
    if (!data.client?.id) return
    const params = new URLSearchParams({ clientId: String(data.client.id), tab: 'wallet' })
    if (data.entitlement?.id) params.set('entitlementId', String(data.entitlement.id))
    window.setTimeout(() => navigate(`/clients?${params.toString()}`), 450)
  }

  const submitCode = async (code: string, source: ScanSource) => {
    if (!code || submitting) return
    scanningLockRef.current = true
    setSubmitting(true)
    setResult({ tone: 'info', text: t('scannerSubmitting') })
    try {
      const { data } = await api.post<ScanResponse>('/wallet-scanner/scan', {
        code,
        source,
        groupBookingId: scannerGroupBookingId,
        paymentBookingId: scannerPaymentBookingId,
      })
      if (data.success) {
        if (scannerPaymentBookingId) {
          const clientName = [data.client?.firstName, data.client?.lastName].filter(Boolean).join(' ').trim()
          setResult({
            tone: 'success',
            text: t('scannerSuccessPaidWithEntitlement'),
            detail: clientName || data.entitlement?.productName || data.entitlement?.code || undefined,
          })
          stopCamera()
          if (returnTo) window.setTimeout(() => navigate(returnTo), 700)
        } else if (scannerGroupBookingId) {
          const clientName = [data.client?.firstName, data.client?.lastName].filter(Boolean).join(' ').trim()
          setResult({
            tone: 'success',
            text: t('scannerSuccessAddedToGroup'),
            detail: clientName || data.entitlement?.productName || data.entitlement?.code || undefined,
          })
          stopCamera()
          if (returnTo) window.setTimeout(() => navigate(returnTo), 700)
        } else {
          setResult({
            tone: 'success',
            text: t('scannerSuccessOpeningClient'),
            detail: data.entitlement?.productName || data.entitlement?.code || undefined,
          })
          stopCamera()
          openScannedClient(data)
        }
      } else {
        setResult({ tone: 'error', text: resultMessage(data.result, data.message, t), detail: data.entitlement?.productName || undefined })
        scanningLockRef.current = false
      }
    } catch (error: any) {
      const status = error?.response?.status
      const responseData = error?.response?.data as { result?: string; message?: string; error?: string } | undefined
      const serverMessage = responseData?.message || responseData?.error || undefined
      const serverResult = responseData?.result || resultCodeFromServerMessage(serverMessage)
      setResult({
        tone: 'error',
        text: status === 403
          ? t('scannerResultPermission')
          : resultMessage(serverResult, serverMessage, t),
      })
      scanningLockRef.current = false
    } finally {
      setSubmitting(false)
    }
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = t('scannerCameraUnsupportedDetailed')
      setCameraIssue(message)
      setResult({ tone: 'error', text: message })
      return
    }
    if (!window.isSecureContext) {
      const message = t('scannerCameraInsecureContext')
      setCameraIssue(message)
      setResult({ tone: 'error', text: message })
      return
    }
    const video = videoRef.current
    if (!video) return
    try {
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 })
      qrReaderRef.current = reader
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (decodeResult) => {
        if (!decodeResult || scanningLockRef.current) return
        void submitCode(decodeResult.getText(), 'qr')
      })
      scanningLockRef.current = false
      setCameraActive(true)
      setCameraIssue(null)
      setResult(null)
    } catch (error) {
      const message = cameraErrorMessage(error, t)
      setCameraIssue(message)
      setResult({ tone: 'error', text: message })
      stopCamera()
    }
  }

  useEffect(() => {
    if (!autoStartCamera || autoStartedRef.current) return
    autoStartedRef.current = true
    const timer = window.setTimeout(() => {
      void startCamera()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [autoStartCamera])

  const submitManual = (event: React.FormEvent) => {
    event.preventDefault()
    void submitCode(manualCode, 'manual')
  }

  return (
    <div className="content scanner-page">
      <div className="scanner-layout">
        <div className="scanner-main-column">
          <section className="scanner-options-panel" aria-labelledby="scanner-options-title">
            <div className="scanner-options-header">
              <h1 id="scanner-options-title">{t('scannerWhatCanYouScan')}</h1>
            </div>
            <div className="scanner-options-grid" role="list" aria-label={t('scannerWhatCanYouScan')}>
              {scanOptions.map((option) => (
                <div key={option.key} className="scanner-option-chip" role="listitem">
                  <span className="scanner-option-icon" aria-hidden="true">
                    <ScannerIcon kind={option.icon} />
                  </span>
                  <span className="scanner-option-copy">
                    <strong>{option.title}</strong>
                    <small>{option.subtitle}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <Card className="scanner-card">
            <div className="scanner-preview">
              <video ref={videoRef} className="scanner-video" playsInline muted />
              {!cameraActive && (
                <div className="scanner-preview-empty">
                  <span className="scanner-preview-icon" aria-hidden="true">
                    <ScannerIcon kind="qr" />
                  </span>
                  <strong>{cameraIssue || t('scannerPreviewIdle')}</strong>
                </div>
              )}
            </div>
            <div className="scanner-actions">
              <div className="scanner-actions-hint">
                <span className="scanner-actions-icon" aria-hidden="true">
                  <ScannerIcon kind="camera" />
                </span>
                <span>{t('scannerCameraAutoHint')}</span>
              </div>
              {cameraActive ? (
                <button type="button" className="button secondary" onClick={stopCamera} disabled={submitting}>
                  {t('scannerStopCamera')}
                </button>
              ) : (
                <button type="button" className="button" onClick={startCamera} disabled={submitting}>
                  {t('scannerStartCamera')}
                </button>
              )}
            </div>
          </Card>
        </div>

        <div className="scanner-side-column">
          <Card className="scanner-card scanner-manual-card">
            <h2>{t('scannerManualTitle')}</h2>
            <form onSubmit={submitManual} className="scanner-manual-form">
              <Field label={t('scannerManualTitle')} hint={t('scannerManualHint')}>
                <div className="scanner-input-wrap">
                  <span className="scanner-input-icon" aria-hidden="true">
                    <ScannerIcon kind="keyboard" />
                  </span>
                  <input
                    value={manualCode}
                    onChange={(event) => setManualCode(event.target.value)}
                    placeholder={t('scannerManualPlaceholder')}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </Field>
              <button type="submit" className="button" disabled={submitting || manualCode.length === 0}>
                {submitting ? t('scannerSubmitting') : t('scannerSubmitManual')}
              </button>
            </form>

            {result && (
              <div className={`scanner-result scanner-result--${result.tone}`} role="status">
                <strong>{result.text}</strong>
                {result.detail && <span>{result.detail}</span>}
              </div>
            )}
          </Card>

          <Card className="scanner-card scanner-advice-card">
            <div className="scanner-advice-header">
              <span className="scanner-advice-icon" aria-hidden="true">
                <ScannerIcon kind="tip" />
              </span>
              <h3>{t('scannerAdviceTitle')}</h3>
            </div>
            <p>{t('scannerAdviceLine1')}</p>
            <p>{t('scannerAdviceLine2')}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
