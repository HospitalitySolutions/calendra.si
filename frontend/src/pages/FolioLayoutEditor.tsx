import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Field, PageHeader } from '../components/ui'
import '../styles/folio-layout-editor.css'

/* ── Types mirroring backend FolioLayoutConfig ── */

type FieldConfig = {
  key: string
  group: string
  label: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  bold: boolean
  alignment: 'left' | 'center' | 'right'
  visible: boolean
  type?: 'data' | 'custom'
  text?: string
}

type LogoConfig = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

type ColumnConfig = {
  key: string
  label: string
  relX: number
  width: number
  alignment: 'left' | 'right'
}

type TableConfig = {
  startX: number
  startY: number
  width: number
  rowHeight: number
  headerHeight: number
  headerFontSize: number
  bodyFontSize: number
  footerSpacing: number
  columns: ColumnConfig[]
}

type FooterItem = {
  key: string
  label: string
  fontSize: number
  bold: boolean
  alignment: 'left' | 'right'
  x: number
  y: number
  width: number
  height: number
}

type FooterConfig = {
  gapAfterTable: number
  lineSpacing: number
  items: FooterItem[]
}

type SignatureConfig = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

type PaymentQrConfig = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

type LayoutConfig = {
  pageWidth: number
  pageHeight: number
  fields: FieldConfig[]
  table: TableConfig
  footer: FooterConfig
  logo: LogoConfig
  signature: SignatureConfig
  paymentQr: PaymentQrConfig
}

type Selection =
  | { type: 'field'; index: number }
  | { type: 'table' }
  | { type: 'footer'; index: number }
  | { type: 'logo' }
  | { type: 'signature' }
  | { type: 'paymentQr' }
  | null

const GROUP_COLORS: Record<string, string> = {
  header: 'var(--fle-group-header)',
  document: 'var(--fle-group-document)',
  recipient: 'var(--fle-group-recipient)',
  custom: 'var(--fle-group-custom)',
}

const DEFAULT_LOGO: LogoConfig = { x: 400, y: 40, width: 120, height: 60, visible: true }
const DEFAULT_SIGNATURE: SignatureConfig = { x: 50, y: 500, width: 120, height: 50, visible: true }
const DEFAULT_PAYMENT_QR: PaymentQrConfig = { x: 395, y: 392, width: 120, height: 120, visible: true }

function isValidLayout(data: any): data is LayoutConfig {
  if (!data || Array.isArray(data) || !Array.isArray(data.fields) || !data.table || !data.footer) return false
  if (!data.logo) data.logo = { ...DEFAULT_LOGO }
  if (!data.signature) data.signature = { ...DEFAULT_SIGNATURE }
  if (!data.paymentQr) data.paymentQr = { ...DEFAULT_PAYMENT_QR }
  // Migrate footer items without x/y to have default positions
  for (const item of data.footer?.items ?? []) {
    if (item.x == null || item.x < 0) item.x = -1
    if (item.y == null || item.y < 0) item.y = -1
    if (item.width == null || item.width < 0) item.width = -1
    if (item.height == null || item.height < 0) item.height = -1
  }
  return true
}

const SNAP = 5

function snapVal(v: number, enabled: boolean) {
  return enabled ? Math.round(v / SNAP) * SNAP : Math.round(v * 10) / 10
}

export function FolioLayoutEditor() {
  const [layout, setLayout] = useState<LayoutConfig | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [zoom, setZoom] = useState(1)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    kind: 'move' | 'resize'
    sel: NonNullable<Selection>
    startMx: number
    startMy: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)

  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get('/billing/folio-layout')
        let data = r.data
        if (typeof data === 'string') {
          try { data = JSON.parse(data) } catch { data = null }
        }
        if (isValidLayout(data)) {
          setLayout(data)
          return
        }
        // Old/invalid format stored in DB -- reset to default
        console.warn('[FolioLayoutEditor] Stored layout has wrong shape, resetting to default')
        const del = await api.delete('/billing/folio-layout')
        let fresh = del.data
        if (typeof fresh === 'string') {
          try { fresh = JSON.parse(fresh) } catch { fresh = null }
        }
        if (isValidLayout(fresh)) {
          setLayout(fresh)
        } else {
          setLoadError('Could not load a valid layout from the server.')
        }
      } catch (err: any) {
        console.error('Failed to load folio layout', err)
        setLoadError(`Failed to load layout: ${err?.response?.status === 404 ? 'endpoint not found — is the backend updated?' : (err?.message || 'unknown error')}`)
      }
    }
    void load()
    api.get('/billing/folio-logo').then((r) => {
      if (r.status === 200 && r.data) setLogoDataUrl(r.data as string)
    }).catch(() => { /* no logo */ })
    api.get('/billing/folio-signature').then((r) => {
      if (r.status === 200 && r.data) setSignatureDataUrl(r.data as string)
    }).catch(() => { /* no signature */ })
  }, [])

  const save = async () => {
    if (!layout) return
    setSaving(true)
    try {
      await api.put('/billing/folio-layout', layout)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    try {
      const { data } = await api.delete('/billing/folio-layout')
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      if (parsed && Array.isArray(parsed.fields) && parsed.table && parsed.footer) {
        setLayout(parsed)
        setSelection(null)
        setDirty(false)
      }
    } catch (err) {
      console.error('Failed to reset folio layout', err)
    }
  }

  const exportJson = () => {
    if (!layout) return
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'folio-layout.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const parsed = JSON.parse(text) as LayoutConfig
        setLayout(parsed)
        setDirty(true)
        setSelection(null)
      } catch { /* ignore bad files */ }
    }
    input.click()
  }

  const mutateLayout = useCallback((fn: (l: LayoutConfig) => void) => {
    setLayout((prev) => {
      if (!prev) return prev
      const next = JSON.parse(JSON.stringify(prev)) as LayoutConfig
      fn(next)
      return next
    })
    setDirty(true)
  }, [])

  const uploadLogo = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await api.post('/billing/folio-logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        setLogoDataUrl(r.data as string)
      } catch (err: any) {
        console.error('Logo upload failed', err)
      }
    }
    input.click()
  }

  const removeLogo = async () => {
    try {
      await api.delete('/billing/folio-logo')
      setLogoDataUrl(null)
    } catch (err) {
      console.error('Logo delete failed', err)
    }
  }

  const uploadSignature = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await api.post('/billing/folio-signature', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        setSignatureDataUrl(r.data as string)
        setLayout((prev) => {
          if (!prev) return prev
          const next = { ...prev, signature: { ...prev.signature, visible: true } }
          void api.put('/billing/folio-layout', next).catch((err) => {
            console.error('Failed to persist signature visibility', err)
          })
          return next
        })
        setDirty(false)
      } catch (err: any) {
        console.error('Signature upload failed', err)
      }
    }
    input.click()
  }

  const removeSignature = async () => {
    try {
      await api.delete('/billing/folio-signature')
      setSignatureDataUrl(null)
    } catch (err) {
      console.error('Signature delete failed', err)
    }
  }

  const addCustomField = () => {
    if (!layout) return
    const existingCustom = layout.fields.filter((f) => f.type === 'custom')
    const idx = existingCustom.length + 1
    mutateLayout((l) => {
      l.fields.push({
        key: `custom_${Date.now()}`,
        group: 'custom',
        label: `Text ${idx}`,
        x: 200,
        y: 200,
        width: 150,
        height: 16,
        fontSize: 10,
        bold: false,
        alignment: 'left',
        visible: true,
        type: 'custom',
        text: `Text ${idx}`,
      })
    })
    setSelection({ type: 'field', index: layout.fields.length })
  }

  const deleteField = (index: number) => {
    mutateLayout((l) => { l.fields.splice(index, 1) })
    setSelection(null)
  }

  /* ── Pointer drag handling ── */

  const onPointerDown = useCallback(
    (e: React.PointerEvent, sel: NonNullable<Selection>, kind: 'move' | 'resize') => {
      if (!layout) return
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      let origX = 0, origY = 0, origW = 0, origH = 0
      if (sel.type === 'field') {
        const f = layout.fields[sel.index]
        origX = f.x; origY = f.y; origW = f.width; origH = f.height
      } else if (sel.type === 'table') {
        origX = layout.table.startX; origY = layout.table.startY
        origW = layout.table.width; origH = 100
      } else if (sel.type === 'logo') {
        const lg = layout.logo
        origX = lg.x; origY = lg.y; origW = lg.width; origH = lg.height
      } else if (sel.type === 'footer') {
        const fi = layout.footer.items[sel.index]
        origX = fi.x; origY = fi.y; origW = fi.width; origH = fi.height
      } else if (sel.type === 'signature') {
        const sg = layout.signature
        origX = sg.x; origY = sg.y; origW = sg.width; origH = sg.height
      } else if (sel.type === 'paymentQr') {
        const qr = layout.paymentQr
        origX = qr.x; origY = qr.y; origW = qr.width; origH = qr.height
      }
      dragRef.current = { kind, sel, startMx: e.clientX, startMy: e.clientY, origX, origY, origW, origH }
      setSelection(sel)
    },
    [layout],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (!d || !layout) return
      const scale = zoom
      const dx = (e.clientX - d.startMx) / scale
      const dy = (e.clientY - d.startMy) / scale
      mutateLayout((l) => {
        if (d.sel.type === 'field') {
          const f = l.fields[d.sel.index]
          if (d.kind === 'move') {
            f.x = snapVal(d.origX + dx, snapEnabled)
            f.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            f.width = Math.max(20, snapVal(d.origW + dx, snapEnabled))
            f.height = Math.max(10, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'table') {
          if (d.kind === 'move') {
            l.table.startX = snapVal(d.origX + dx, snapEnabled)
            l.table.startY = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.table.width = Math.max(100, snapVal(d.origW + dx, snapEnabled))
          }
        } else if (d.sel.type === 'logo') {
          if (d.kind === 'move') {
            l.logo.x = snapVal(d.origX + dx, snapEnabled)
            l.logo.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.logo.width = Math.max(20, snapVal(d.origW + dx, snapEnabled))
            l.logo.height = Math.max(20, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'footer') {
          const fi = l.footer.items[d.sel.index]
          if (d.kind === 'move') {
            fi.x = snapVal(d.origX + dx, snapEnabled)
            fi.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            fi.width = Math.max(40, snapVal(d.origW + dx, snapEnabled))
            fi.height = Math.max(10, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'signature') {
          if (d.kind === 'move') {
            l.signature.x = snapVal(d.origX + dx, snapEnabled)
            l.signature.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.signature.width = Math.max(20, snapVal(d.origW + dx, snapEnabled))
            l.signature.height = Math.max(20, snapVal(d.origH + dy, snapEnabled))
          }
        } else if (d.sel.type === 'paymentQr') {
          if (d.kind === 'move') {
            l.paymentQr.x = snapVal(d.origX + dx, snapEnabled)
            l.paymentQr.y = snapVal(d.origY + dy, snapEnabled)
          } else {
            l.paymentQr.width = Math.max(40, snapVal(d.origW + dx, snapEnabled))
            l.paymentQr.height = Math.max(40, snapVal(d.origH + dy, snapEnabled))
          }
        }
      })
    },
    [layout, zoom, snapEnabled, mutateLayout],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  if (loadError) return <div className="fle-loading" style={{ color: '#f87171' }}>{loadError}</div>
  if (!layout) return <div className="fle-loading">Loading layout...</div>

  const scale = zoom
  const pw = layout.pageWidth * scale
  const ph = layout.pageHeight * scale

  const selectedField = selection?.type === 'field' ? layout.fields[selection.index] : null
  const selectedFooterItem = selection?.type === 'footer' ? layout.footer.items[selection.index] : null

  /* ── Render ── */

  return (
    <div className="fle-root">
      {/* Toolbar */}
      <div className="fle-toolbar">
        <label className="fle-toolbar-item">
          Zoom
          <input type="range" min={0.4} max={1.5} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          <span>{Math.round(zoom * 100)}%</span>
        </label>
        <label className="fle-toolbar-item fle-snap-toggle">
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
          Snap
        </label>
        <div className="fle-toolbar-spacer" />
        <button type="button" className="fle-btn fle-btn-add" onClick={addCustomField}>+ Text field</button>
        <button type="button" className="fle-btn" onClick={importJson}>Import</button>
        <button type="button" className="fle-btn" onClick={exportJson}>Export</button>
        <button type="button" className="fle-btn fle-btn-secondary" onClick={reset}>Reset</button>
        <button type="button" className="fle-btn fle-btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="fle-body">
        {/* A4 preview */}
        <div className="fle-canvas-wrap" ref={containerRef}>
          <div
            className="fle-canvas"
            style={{ width: pw, height: ph }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => setSelection(null)}
          >
            {/* Grid dots */}
            {snapEnabled && (
              <svg className="fle-grid" width={pw} height={ph}>
                {Array.from({ length: Math.floor(layout.pageWidth / 25) + 1 }, (_, i) =>
                  Array.from({ length: Math.floor(layout.pageHeight / 25) + 1 }, (_, j) => (
                    <circle key={`${i}-${j}`} cx={i * 25 * scale} cy={j * 25 * scale} r={0.5} fill="var(--fle-grid-dot)" />
                  )),
                )}
              </svg>
            )}

            {/* Ruler marks */}
            <div className="fle-ruler-top">
              {Array.from({ length: Math.floor(layout.pageWidth / 50) + 1 }, (_, i) => (
                <span key={i} className="fle-ruler-mark" style={{ left: i * 50 * scale }}>{i * 50}</span>
              ))}
            </div>
            <div className="fle-ruler-left">
              {Array.from({ length: Math.floor(layout.pageHeight / 50) + 1 }, (_, i) => (
                <span key={i} className="fle-ruler-mark" style={{ top: i * 50 * scale }}>{i * 50}</span>
              ))}
            </div>

            {/* Logo overlay */}
            {layout.logo && (() => {
              const lg = layout.logo
              const isSel = selection?.type === 'logo'
              return (
                <div
                  className={`fle-logo ${isSel ? 'fle-logo--selected' : ''} ${!lg.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: lg.x * scale,
                    top: lg.y * scale,
                    width: lg.width * scale,
                    height: lg.height * scale,
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'logo' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'logo' }) }}
                >
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="Logo" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  ) : (
                    <span className="fle-logo-placeholder">Logo</span>
                  )}
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'logo' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}

            {/* Header / document / recipient / custom fields */}
            {layout.fields.map((f, idx) => {
              const isSel = selection?.type === 'field' && selection.index === idx
              const groupColor = GROUP_COLORS[f.group] || 'var(--fle-group-default)'
              const displayLabel = f.type === 'custom' ? (f.text || f.label) : f.label
              return (
                <div
                  key={f.key}
                  className={`fle-field ${isSel ? 'fle-field--selected' : ''} ${!f.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: f.x * scale,
                    top: f.y * scale,
                    width: f.width * scale,
                    height: f.height * scale,
                    borderColor: groupColor,
                    fontSize: Math.max(8, f.fontSize * scale * 0.7),
                    fontWeight: f.bold ? 700 : 400,
                    textAlign: f.alignment,
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'field', index: idx }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'field', index: idx }) }}
                >
                  <span className="fle-field-label">{displayLabel}</span>
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'field', index: idx }, 'resize') }}
                    />
                  )}
                </div>
              )
            })}

            {/* Table region */}
            {(() => {
              const t = layout.table
              const isSel = selection?.type === 'table'
              const sampleRows = 3
              const tableH = t.headerHeight + t.rowHeight * sampleRows + t.footerSpacing
              return (
                <div
                  className={`fle-table-region ${isSel ? 'fle-table-region--selected' : ''}`}
                  style={{
                    left: t.startX * scale,
                    top: t.startY * scale,
                    width: t.width * scale,
                    height: tableH * scale,
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'table' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'table' }) }}
                >
                  <div className="fle-table-header" style={{ height: t.headerHeight * scale }}>
                    {t.columns.map((col) => (
                      <span key={col.key} className="fle-table-col-label" style={{
                        left: col.relX * scale,
                        width: col.width * scale,
                        textAlign: col.alignment,
                        fontSize: Math.max(7, t.headerFontSize * scale * 0.7),
                      }}>
                        {col.label}
                      </span>
                    ))}
                  </div>
                  {Array.from({ length: sampleRows }, (_, r) => (
                    <div key={r} className="fle-table-row" style={{ height: t.rowHeight * scale, top: (t.headerHeight + t.rowHeight * r) * scale }}>
                      {t.columns.map((col) => (
                        <span key={col.key} className="fle-table-col-cell" style={{
                          left: col.relX * scale,
                          width: col.width * scale,
                          textAlign: col.alignment,
                          fontSize: Math.max(7, t.bodyFontSize * scale * 0.7),
                        }}>
                          ---
                        </span>
                      ))}
                    </div>
                  ))}
                  <span className="fle-table-label">Services Table</span>
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'table' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}

            {/* Footer items preview — positioned absolutely when x/y are set */}
            {layout.footer.items.map((item, idx) => {
              const t = layout.table
              const sampleRows = 3
              const tableBottom = t.startY + t.headerHeight + t.rowHeight * sampleRows + t.footerSpacing
              const hasPos = item.x >= 0 && item.y >= 0
              const posX = hasPos ? item.x : (item.alignment === 'right' ? t.startX + t.width - 150 : t.startX)
              const posY = hasPos ? item.y : tableBottom + layout.footer.gapAfterTable + 18 + idx * layout.footer.lineSpacing
              const posW = hasPos && item.width > 0 ? item.width : (item.alignment === 'right' ? 150 : t.width)
              const posH = hasPos && item.height > 0 ? item.height : layout.footer.lineSpacing
              const isSel = selection?.type === 'footer' && selection.index === idx
              return (
                <div
                  key={item.key}
                  className={`fle-footer-item ${isSel ? 'fle-footer-item--selected' : ''}`}
                  style={{
                    left: posX * scale,
                    top: posY * scale,
                    width: posW * scale,
                    height: posH * scale,
                    textAlign: item.alignment,
                    fontWeight: item.bold ? 700 : 400,
                    fontSize: Math.max(7, item.fontSize * scale * 0.7),
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'footer', index: idx }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'footer', index: idx }) }}
                >
                  {item.label}
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'footer', index: idx }, 'resize') }}
                    />
                  )}
                </div>
              )
            })}

            {/* Payment QR overlay */}
            {layout.paymentQr && (() => {
              const qr = layout.paymentQr
              const isSel = selection?.type === 'paymentQr'
              return (
                <div
                  className={`fle-logo ${isSel ? 'fle-logo--selected' : ''} ${!qr.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: qr.x * scale,
                    top: qr.y * scale,
                    width: qr.width * scale,
                    height: qr.height * scale,
                    borderColor: 'var(--fle-group-document)',
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'paymentQr' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'paymentQr' }) }}
                >
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', pointerEvents: 'none', background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 6px, transparent 6px, transparent 12px)' }}>
                    <span className="fle-logo-placeholder">Payment QR</span>
                  </div>
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'paymentQr' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}

            {/* Signature overlay */}
            {layout.signature && (() => {
              const sg = layout.signature
              const isSel = selection?.type === 'signature'
              return (
                <div
                  className={`fle-logo ${isSel ? 'fle-logo--selected' : ''} ${!sg.visible ? 'fle-field--hidden' : ''}`}
                  style={{
                    left: sg.x * scale,
                    top: sg.y * scale,
                    width: sg.width * scale,
                    height: sg.height * scale,
                    borderColor: 'var(--fle-group-custom)',
                  }}
                  onPointerDown={(e) => onPointerDown(e, { type: 'signature' }, 'move')}
                  onClick={(e) => { e.stopPropagation(); setSelection({ type: 'signature' }) }}
                >
                  {signatureDataUrl ? (
                    <img src={signatureDataUrl} alt="Signature" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  ) : (
                    <span className="fle-logo-placeholder">Signature</span>
                  )}
                  {isSel && (
                    <div
                      className="fle-resize-handle"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { type: 'signature' }, 'resize') }}
                    />
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Property panel */}
        <div className="fle-panel">
          {selection === null && (
            <div className="fle-panel-empty">
              <p className="muted">Click a field, the logo, the payment QR, the table region, or a footer item to edit its properties.</p>
            </div>
          )}

          {selection?.type === 'logo' && (
            <div className="fle-panel-content">
              <PageHeader title="Company Logo" subtitle="Logo image placement" />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(layout.logo.x)} onChange={(e) => mutateLayout((l) => { l.logo.x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(layout.logo.y)} onChange={(e) => mutateLayout((l) => { l.logo.y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.logo.width)} onChange={(e) => mutateLayout((l) => { l.logo.width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(layout.logo.height)} onChange={(e) => mutateLayout((l) => { l.logo.height = Number(e.target.value) })} />
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={layout.logo.visible} onChange={(e) => mutateLayout((l) => { l.logo.visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.logo.x)}, {Math.round(layout.logo.y)} pt
              </div>
              <h4 className="fle-panel-section-title">Image</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="fle-btn fle-btn-primary" onClick={uploadLogo}>
                  {logoDataUrl ? 'Replace' : 'Upload'}
                </button>
                {logoDataUrl && (
                  <button type="button" className="fle-btn fle-btn-secondary" onClick={removeLogo}>Remove</button>
                )}
              </div>
              {logoDataUrl && (
                <div style={{ marginTop: 12, border: '1px solid var(--fle-panel-border)', borderRadius: 6, padding: 8, background: '#fff' }}>
                  <img src={logoDataUrl} alt="Current logo" style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                </div>
              )}
            </div>
          )}

          {selection?.type === 'paymentQr' && (
            <div className="fle-panel-content">
              <PageHeader title="Payment QR" subtitle="Auto-generated bank-app payment QR placement" />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(layout.paymentQr.x)} onChange={(e) => mutateLayout((l) => { l.paymentQr.x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(layout.paymentQr.y)} onChange={(e) => mutateLayout((l) => { l.paymentQr.y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.paymentQr.width)} onChange={(e) => mutateLayout((l) => { l.paymentQr.width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(layout.paymentQr.height)} onChange={(e) => mutateLayout((l) => { l.paymentQr.height = Number(e.target.value) })} />
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={layout.paymentQr.visible} onChange={(e) => mutateLayout((l) => { l.paymentQr.visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.paymentQr.x)}, {Math.round(layout.paymentQr.y)} pt
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                This QR is generated automatically as a bank-app payment QR for Stripe-enabled bank transfer / TRR bills.
              </p>
            </div>
          )}

          {selectedField && selection?.type === 'field' && (
            <div className="fle-panel-content">
              <PageHeader title={selectedField.label} subtitle={`${selectedField.group} / ${selectedField.key}`} />
              {selectedField.type === 'custom' && (
                <div className="fle-panel-grid" style={{ marginBottom: 8 }}>
                  <Field label="Label">
                    <input type="text" value={selectedField.label} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].label = e.target.value })} />
                  </Field>
                  <Field label="Text">
                    <input type="text" value={selectedField.text || ''} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].text = e.target.value })} />
                  </Field>
                </div>
              )}
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(selectedField.x)} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(selectedField.y)} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(selectedField.width)} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(selectedField.height)} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].height = Number(e.target.value) })} />
                </Field>
                <Field label="Font size">
                  <input type="number" min={6} max={36} value={selectedField.fontSize} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].fontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Bold">
                  <input type="checkbox" checked={selectedField.bold} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].bold = e.target.checked })} />
                </Field>
                <Field label="Alignment">
                  <select value={selectedField.alignment} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].alignment = e.target.value as FieldConfig['alignment'] })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={selectedField.visible} onChange={(e) => mutateLayout((l) => { l.fields[selection.index].visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(selectedField.x)}, {Math.round(selectedField.y)} pt
              </div>
              {selectedField.type === 'custom' && (
                <button type="button" className="fle-btn fle-btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => deleteField(selection.index)}>
                  Delete field
                </button>
              )}
            </div>
          )}

          {selection?.type === 'table' && (
            <div className="fle-panel-content">
              <PageHeader title="Services Table" subtitle="Table region and columns" />
              <div className="fle-panel-grid">
                <Field label="Start X">
                  <input type="number" step={1} value={Math.round(layout.table.startX)} onChange={(e) => mutateLayout((l) => { l.table.startX = Number(e.target.value) })} />
                </Field>
                <Field label="Start Y">
                  <input type="number" step={1} value={Math.round(layout.table.startY)} onChange={(e) => mutateLayout((l) => { l.table.startY = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.table.width)} onChange={(e) => mutateLayout((l) => { l.table.width = Number(e.target.value) })} />
                </Field>
                <Field label="Row height">
                  <input type="number" step={1} value={layout.table.rowHeight} onChange={(e) => mutateLayout((l) => { l.table.rowHeight = Number(e.target.value) })} />
                </Field>
                <Field label="Header height">
                  <input type="number" step={1} value={layout.table.headerHeight} onChange={(e) => mutateLayout((l) => { l.table.headerHeight = Number(e.target.value) })} />
                </Field>
                <Field label="Header font">
                  <input type="number" min={6} max={24} value={layout.table.headerFontSize} onChange={(e) => mutateLayout((l) => { l.table.headerFontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Body font">
                  <input type="number" min={6} max={24} value={layout.table.bodyFontSize} onChange={(e) => mutateLayout((l) => { l.table.bodyFontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Footer spacing">
                  <input type="number" step={1} value={layout.table.footerSpacing} onChange={(e) => mutateLayout((l) => { l.table.footerSpacing = Number(e.target.value) })} />
                </Field>
              </div>
              <h4 className="fle-panel-section-title">Columns</h4>
              {layout.table.columns.map((col, ci) => (
                <div key={col.key} className="fle-column-row">
                  <strong>{col.label}</strong>
                  <div className="fle-panel-grid fle-panel-grid--compact">
                    <Field label="Offset X">
                      <input type="number" step={1} value={Math.round(col.relX)} onChange={(e) => mutateLayout((l) => { l.table.columns[ci].relX = Number(e.target.value) })} />
                    </Field>
                    <Field label="Width">
                      <input type="number" step={1} value={Math.round(col.width)} onChange={(e) => mutateLayout((l) => { l.table.columns[ci].width = Number(e.target.value) })} />
                    </Field>
                    <Field label="Align">
                      <select value={col.alignment} onChange={(e) => mutateLayout((l) => { l.table.columns[ci].alignment = e.target.value as 'left' | 'right' })}>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedFooterItem && selection?.type === 'footer' && (
            <div className="fle-panel-content">
              <PageHeader title={selectedFooterItem.label} subtitle={`Footer / ${selectedFooterItem.key}`} />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(selectedFooterItem.x)} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(selectedFooterItem.y)} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(selectedFooterItem.width)} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(selectedFooterItem.height)} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].height = Number(e.target.value) })} />
                </Field>
                <Field label="Font size">
                  <input type="number" min={6} max={24} value={selectedFooterItem.fontSize} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].fontSize = Number(e.target.value) })} />
                </Field>
                <Field label="Bold">
                  <input type="checkbox" checked={selectedFooterItem.bold} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].bold = e.target.checked })} />
                </Field>
                <Field label="Alignment">
                  <select value={selectedFooterItem.alignment} onChange={(e) => mutateLayout((l) => { l.footer.items[selection.index].alignment = e.target.value as 'left' | 'right' })}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(selectedFooterItem.x)}, {Math.round(selectedFooterItem.y)} pt
              </div>
              <h4 className="fle-panel-section-title">Footer spacing</h4>
              <div className="fle-panel-grid">
                <Field label="Gap after table">
                  <input type="number" step={1} value={layout.footer.gapAfterTable} onChange={(e) => mutateLayout((l) => { l.footer.gapAfterTable = Number(e.target.value) })} />
                </Field>
                <Field label="Line spacing">
                  <input type="number" step={1} value={layout.footer.lineSpacing} onChange={(e) => mutateLayout((l) => { l.footer.lineSpacing = Number(e.target.value) })} />
                </Field>
              </div>
            </div>
          )}

          {selection?.type === 'signature' && (
            <div className="fle-panel-content">
              <PageHeader title="Signature" subtitle="Signature image placement" />
              <div className="fle-panel-grid">
                <Field label="X (pt)">
                  <input type="number" step={1} value={Math.round(layout.signature.x)} onChange={(e) => mutateLayout((l) => { l.signature.x = Number(e.target.value) })} />
                </Field>
                <Field label="Y (pt)">
                  <input type="number" step={1} value={Math.round(layout.signature.y)} onChange={(e) => mutateLayout((l) => { l.signature.y = Number(e.target.value) })} />
                </Field>
                <Field label="Width">
                  <input type="number" step={1} value={Math.round(layout.signature.width)} onChange={(e) => mutateLayout((l) => { l.signature.width = Number(e.target.value) })} />
                </Field>
                <Field label="Height">
                  <input type="number" step={1} value={Math.round(layout.signature.height)} onChange={(e) => mutateLayout((l) => { l.signature.height = Number(e.target.value) })} />
                </Field>
                <Field label="Visible">
                  <input type="checkbox" checked={layout.signature.visible} onChange={(e) => mutateLayout((l) => { l.signature.visible = e.target.checked })} />
                </Field>
              </div>
              <div className="fle-panel-coords">
                Position: {Math.round(layout.signature.x)}, {Math.round(layout.signature.y)} pt
              </div>
              <h4 className="fle-panel-section-title">Image</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="fle-btn fle-btn-primary" onClick={uploadSignature}>
                  {signatureDataUrl ? 'Replace' : 'Upload'}
                </button>
                {signatureDataUrl && (
                  <button type="button" className="fle-btn fle-btn-secondary" onClick={removeSignature}>Remove</button>
                )}
              </div>
              {signatureDataUrl && (
                <div style={{ marginTop: 12, border: '1px solid var(--fle-panel-border)', borderRadius: 6, padding: 8, background: '#fff' }}>
                  <img src={signatureDataUrl} alt="Current signature" style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
