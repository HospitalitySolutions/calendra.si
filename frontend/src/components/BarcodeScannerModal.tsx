import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

export type BarcodeScanResult = {
  accepted: boolean
  message: string
  close?: boolean
}

type ScannerControls = { stop: () => void }

type Props = {
  open: boolean
  title: string
  subtitle?: string
  continuous?: boolean
  onClose: () => void
  onScan: (code: string) => BarcodeScanResult
}

function normalizeCode(value: string) {
  return String(value || '').trim()
}

export function BarcodeScannerModal({ open, title, subtitle, continuous = false, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<ScannerControls | null>(null)
  const scanHandlerRef = useRef(onScan)
  const lastCameraScanRef = useRef<{ code: string; at: number } | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'error'>('idle')
  const [cameraMessage, setCameraMessage] = useState('')
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { scanHandlerRef.current = onScan }, [onScan])

  const stopCamera = useCallback(() => {
    try { controlsRef.current?.stop() } catch { /* noop */ }
    controlsRef.current = null
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    setCameraState('idle')
  }, [])

  const applyCode = useCallback((rawCode: string, source: 'camera' | 'manual') => {
    const code = normalizeCode(rawCode)
    if (!code) {
      setFeedback({ ok: false, text: 'Vnesite ali skenirajte veljavno črtno kodo.' })
      return
    }
    if (source === 'camera') {
      const previous = lastCameraScanRef.current
      const now = Date.now()
      if (previous && previous.code === code && now - previous.at < 2500) return
      lastCameraScanRef.current = { code, at: now }
    }
    const result = scanHandlerRef.current(code)
    setFeedback({ ok: result.accepted, text: result.message })
    if (result.accepted) {
      setManualCode('')
      if (result.close ?? !continuous) {
        stopCamera()
        onClose()
      }
    }
  }, [continuous, onClose, stopCamera])

  const startCamera = useCallback(async () => {
    if (!open || cameraState === 'starting' || cameraState === 'active') return
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error')
      setCameraMessage('Kamera v tem brskalniku ni podprta. Uporabite ročni vnos ali fizični čitalnik.')
      return
    }
    if (!window.isSecureContext) {
      setCameraState('error')
      setCameraMessage('Za uporabo kamere odprite Calendra prek HTTPS. Ročni vnos in fizični čitalnik še vedno delujeta.')
      return
    }
    const video = videoRef.current
    if (!video) return
    setCameraState('starting')
    setCameraMessage('Zaganjam kamero…')
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        video,
        (result: any) => {
          if (!result) return
          const text = typeof result.getText === 'function' ? result.getText() : String(result.text || '')
          applyCode(text, 'camera')
        },
      )
      controlsRef.current = controls as ScannerControls
      setCameraState('active')
      setCameraMessage('Kamera je pripravljena.')
    } catch (error: any) {
      const name = String(error?.name || '')
      const message = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)
        ? 'Dovolite dostop do kamere in poskusite znova.'
        : 'Kamere ni bilo mogoče zagnati. Uporabite ročni vnos ali fizični čitalnik.'
      stopCamera()
      setCameraState('error')
      setCameraMessage(message)
    }
  }, [applyCode, cameraState, open, stopCamera])

  useEffect(() => {
    if (!open) return undefined
    setManualCode('')
    setFeedback(null)
    setCameraMessage('')
    lastCameraScanRef.current = null
    const timer = window.setTimeout(() => { void startCamera() }, 40)
    return () => {
      window.clearTimeout(timer)
      try { controlsRef.current?.stop() } catch { /* noop */ }
      controlsRef.current = null
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach((track) => track.stop())
        videoRef.current.srcObject = null
      }
    }
  }, [open]) // intentionally start once for each modal opening

  if (!open) return null

  const submitManual = (event: FormEvent) => {
    event.preventDefault()
    applyCode(manualCode, 'manual')
  }

  return (
    <div className="consumables-barcode-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="consumables-barcode-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><h2>{title}</h2><p>{subtitle || 'Postavite črtno kodo znotraj okvirja ali uporabite fizični čitalnik.'}</p></div>
          <button type="button" onClick={onClose} aria-label="Zapri">×</button>
        </header>
        <div className="consumables-barcode-camera">
          <video ref={videoRef} muted playsInline autoPlay />
          <div className="consumables-barcode-frame" aria-hidden><span /><span /><span /><span /></div>
          <div className={`consumables-barcode-camera-state ${cameraState}`}>{cameraMessage || (cameraState === 'active' ? 'Skenirajte EAN, UPC, Code 128, QR ali drugo podprto kodo.' : 'Pripravljam skener…')}</div>
        </div>
        <form className="consumables-barcode-manual" onSubmit={submitManual}>
          <label>
            Črtna koda
            <div><input autoFocus value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Skenirajte s čitalnikom ali vnesite kodo" autoComplete="off" inputMode="text" /><button type="submit" className="btn primary">Uporabi</button></div>
          </label>
          <small>Fizični USB/Bluetooth čitalnik deluje kot tipkovnica: skenirajte kodo, ko je polje aktivno.</small>
        </form>
        {feedback && <div className={`consumables-barcode-feedback ${feedback.ok ? 'success' : 'error'}`} role="status">{feedback.text}</div>}
        <footer>
          <span>{continuous ? 'Način večkratnega skeniranja je vklopljen.' : 'Po uspešnem skenu se okno samodejno zapre.'}</span>
          <div>{cameraState === 'active' ? <button type="button" className="btn secondary" onClick={stopCamera}>Ustavi kamero</button> : <button type="button" className="btn secondary" onClick={() => { setCameraState('idle'); setCameraMessage(''); void startCamera() }}>Zaženi kamero</button>}<button type="button" className="btn secondary" onClick={onClose}>Zapri</button></div>
        </footer>
      </section>
    </div>
  )
}
