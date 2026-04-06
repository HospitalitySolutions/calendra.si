import { useId } from 'react'
import { PageHeader } from './ui'
import { useLocale } from '../locale'
import type { ReactNode } from 'react'

type Props = { onClose: () => void }

function FlagUk() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden>
      <rect width="22" height="16" fill="#012169" rx="2" />
      <path d="M0 0l22 16M22 0L0 16" stroke="#fff" strokeWidth="3.2" />
      <path d="M0 0l22 16M22 0L0 16" stroke="#C8102E" strokeWidth="1.8" />
      <path d="M11 0v16M0 8h22" stroke="#fff" strokeWidth="5" />
      <path d="M11 0v16M0 8h22" stroke="#C8102E" strokeWidth="3" />
    </svg>
  )
}

/** Slovenia: equal white / blue / red bands; coat of arms in canton astride the white–blue line (blue field, red shield trim, Triglav, waves, three 6-point stars). */
function FlagSi() {
  const clipId = useId()
  const band = 16 / 3
  const shieldCy = 4.82
  const shieldTx = 0.26
  const shieldTy = band - shieldCy

  /** Regular hexagram from two equilateral triangles (official stars). */
  const hexagram = (cx: number, cy: number, r: number) => (
    <path
      fill="#F5D02B"
      d={`M ${cx} ${cy - r} L ${cx + 0.866 * r} ${cy + 0.5 * r} L ${cx - 0.866 * r} ${cy + 0.5 * r} Z M ${cx} ${cy + r} L ${cx + 0.866 * r} ${cy - 0.5 * r} L ${cx - 0.866 * r} ${cy - 0.5 * r} Z`}
    />
  )

  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="22" height="16" rx="2" ry="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="22" height={band} fill="#fff" />
        <rect width="22" height={band} y={band} fill="#0B4EA2" />
        <rect width="22" height={16 - 2 * band} y={2 * band} fill="#D52B1E" />
        <g transform={`translate(${shieldTx}, ${shieldTy})`}>
          <path
            d="M 0 2.2 Q 4.2 0.28 8.4 2.2 L 8.4 7.52 L 4.2 9.35 L 0 7.52 Z"
            fill="#0B4EA2"
            stroke="#D52B1E"
            strokeWidth="0.26"
            strokeLinejoin="round"
            paintOrder="stroke fill"
          />
          {hexagram(2.05, 1.05, 0.48)}
          {hexagram(6.35, 1.05, 0.48)}
          {hexagram(4.2, 2.38, 0.48)}
          <path
            d="M 4.2 6.95 L 1.95 4.62 L 2.95 4.62 L 3.35 3.95 L 4.2 3.18 L 5.05 3.95 L 5.45 4.62 L 6.45 4.62 Z"
            fill="#fff"
          />
          <path
            d="M 0.85 7.1 C 2.15 6.88 3.05 7.18 4.2 6.98 C 5.35 6.78 6.25 7.1 7.55 6.95"
            fill="none"
            stroke="#93B4E1"
            strokeWidth="0.32"
            strokeLinecap="round"
          />
          <path
            d="M 0.85 7.48 C 2.15 7.26 3.05 7.56 4.2 7.36 C 5.35 7.16 6.25 7.48 7.55 7.33"
            fill="none"
            stroke="#93B4E1"
            strokeWidth="0.32"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  )
}

export function LanguageModal({ onClose }: Props) {
  const { locale, setLocale, t } = useLocale()

  const rows: { code: 'en' | 'sl'; flag: ReactNode; title: string; hint: string }[] = [
    { code: 'en', flag: <FlagUk />, title: 'English', hint: t('langPickEnglishHint') },
    { code: 'sl', flag: <FlagSi />, title: 'Slovenščina', hint: t('langPickSlovenianHint') },
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <PageHeader title={t('langTitle')} />
        <div className="language-modal-list">
          {rows.map((row) => (
            <button
              key={row.code}
              type="button"
              className={`language-modal-option${locale === row.code ? ' language-modal-option-active' : ''}`}
              onClick={() => {
                setLocale(row.code)
                onClose()
              }}
            >
              <span className="language-modal-flag" aria-hidden>
                {row.flag}
              </span>
              <span className="language-modal-text">
                <span className="language-modal-title">{row.title}</span>
                <span className="language-modal-desc muted">{row.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="secondary" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
