import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, getApiErrorMessage } from '../api'
import { useLocale } from '../locale'
import { useToast } from './Toast'

type MyReferralLink = {
  code: string
  url: string
  referralsQualified: number
  freeMonthsEarned: number
  monthlyCap: number
  capRemaining: number
}

type ReferAFriendModalProps = {
  onClose: () => void
}

function ReferralHeaderIcon() {
  return (
    <span className="referral-modal-header-icon" aria-hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </span>
  )
}

function CopyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <path fill="#fff" d="M23.5 8.45A10.45 10.45 0 0 0 7.06 21.04L5.58 26.5l5.58-1.46A10.46 10.46 0 0 0 26.5 15.8c0-2.79-1.08-5.4-3-7.35Zm-7.43 15.94c-1.54 0-3.04-.41-4.35-1.19l-.31-.18-3.31.87.88-3.23-.2-.33a8.5 8.5 0 1 1 7.29 4.06Zm4.67-6.36c-.26-.13-1.52-.75-1.76-.84-.24-.09-.42-.13-.59.13-.17.26-.68.84-.83 1.01-.15.17-.31.2-.57.07-.26-.13-1.1-.41-2.1-1.29a7.84 7.84 0 0 1-1.45-1.8c-.15-.26-.02-.4.11-.53.12-.12.26-.31.39-.46.13-.15.17-.26.26-.44.09-.17.04-.33-.02-.46-.07-.13-.59-1.42-.81-1.94-.21-.51-.43-.44-.59-.45h-.5c-.17 0-.46.07-.7.33-.24.26-.92.9-.92 2.2s.94 2.55 1.07 2.73c.13.17 1.85 2.83 4.49 3.97.63.27 1.12.43 1.5.55.63.2 1.2.17 1.65.1.5-.08 1.52-.62 1.74-1.22.22-.59.22-1.1.15-1.21-.06-.11-.24-.17-.5-.3Z" />
    </svg>
  )
}

function ViberIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <path fill="#fff" d="M22.8 8.8c-3.74-3.08-10.56-2.92-13.99.14-2.85 2.55-2.28 8.2-1.75 10.31.32 1.28 1.35 2.7 3.04 3.33l-.38 3.49a.74.74 0 0 0 1.15.7l3.83-2.65c2.48.16 5.63-.11 7.62-1.76 3.2-2.66 3.28-10.47.48-13.56Zm1.03 9.69c-.3 1.27-.93 2.31-1.87 3.09-1.63 1.35-4.48 1.65-7.49 1.36l-3.34 2.31.35-3.1-.58-.18c-1.46-.45-2.35-1.6-2.62-2.68-.58-2.31-.74-7.26 1.38-9.16 2.87-2.57 8.89-2.73 12.38.14 1.85 1.52 2.4 5.7 1.79 8.22Zm-4.75-6.58c-.6-.55-1.45-.84-2.53-.87a.65.65 0 0 0-.04 1.3c.76.02 1.32.2 1.69.54.38.35.59.87.63 1.56a.65.65 0 0 0 1.3-.08c-.07-1.03-.42-1.86-1.05-2.45Zm-2.58 1.35a.65.65 0 0 0-.03 1.3c.64.02.96.34.99 1a.65.65 0 1 0 1.3-.06c-.07-1.36-.89-2.2-2.26-2.24Zm4.69-2.86c-1.09-1-2.59-1.52-4.48-1.57a.65.65 0 1 0-.03 1.3c1.56.04 2.77.44 3.63 1.23.86.79 1.34 1.94 1.43 3.43a.65.65 0 0 0 1.3-.08c-.12-1.83-.74-3.28-1.85-4.31Zm-.78 7.93c-.36-.21-.73-.41-1.1-.61-.52-.28-.91-.11-1.16.23l-.51.67c-.25.33-.55.27-.55.27-2.25-.58-3.48-2.86-3.48-2.86s-.05-.31.29-.54l.7-.47c.36-.24.54-.61.29-1.15-.18-.38-.36-.76-.55-1.13-.25-.48-.71-.62-1.18-.4-.72.34-1.45 1.09-1.33 2.1.21 1.75 1.13 3.62 2.72 5.16 1.59 1.54 3.49 2.4 5.25 2.55 1.01.09 1.73-.67 2.05-1.4.2-.48.05-.93-.44-1.16Z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <path fill="#fff" d="M18.16 26V16.88h3.06l.46-3.55h-3.52v-2.27c0-1.03.29-1.73 1.76-1.73h1.88V6.15A25.3 25.3 0 0 0 19.06 6c-2.71 0-4.57 1.65-4.57 4.68v2.61h-3.07v3.55h3.07V26h3.67Z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="referral-instagram-gradient" x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB000" />
          <stop offset="0.48" stopColor="#F50057" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#referral-instagram-gradient)" />
      <rect x="8.1" y="8.1" width="15.8" height="15.8" rx="5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="16" cy="16" r="3.8" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="21.4" cy="10.7" r="1.15" fill="#fff" />
    </svg>
  )
}

export function ReferAFriendModal({ onClose }: ReferAFriendModalProps) {
  const { t } = useLocale()
  const { showToast } = useToast()
  const [data, setData] = useState<MyReferralLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .get<MyReferralLink>('/referrals/my-link')
      .then((response) => {
        if (!active) return
        setData(response.data)
        setError('')
      })
      .catch((requestError) => {
        if (!active) return
        setError(getApiErrorMessage(requestError, t('referLoadError')))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [t])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const shareUrl = useMemo(() => {
    if (!data) return ''
    if (typeof window !== 'undefined' && data.code) {
      return `${window.location.origin}/register?ref=${encodeURIComponent(data.code)}`
    }
    return data.url
  }, [data])

  const shareText = t('referShareMessage')

  const copyLink = useCallback(async (showSuccessToast = true) => {
    if (!shareUrl) return false
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const input = document.createElement('textarea')
      input.value = shareUrl
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      const copiedWithFallback = document.execCommand('copy')
      document.body.removeChild(input)
      if (!copiedWithFallback) {
        window.prompt(t('referYourLink'), shareUrl)
        return false
      }
    }

    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
    if (showSuccessToast) showToast('success', t('referCopied'))
    return true
  }, [shareUrl, showToast, t])

  const openShare = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  const shareWhatsApp = useCallback(() => {
    if (!shareUrl) return
    openShare(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`)
  }, [openShare, shareText, shareUrl])

  const shareViber = useCallback(() => {
    if (!shareUrl) return
    openShare(`viber://forward?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`)
  }, [openShare, shareText, shareUrl])

  const shareFacebook = useCallback(() => {
    if (!shareUrl) return
    openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)
  }, [openShare, shareUrl])

  const shareInstagram = useCallback(async () => {
    if (!shareUrl) return
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Calendra', text: shareText, url: shareUrl })
        return
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      }
    }
    const didCopy = await copyLink(false)
    if (didCopy) showToast('info', t('referInstagramHint'))
  }, [copyLink, shareText, shareUrl, showToast, t])

  const shareDisabled = loading || Boolean(error) || !shareUrl

  return createPortal(
    <div className="referral-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="referral-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="referral-modal-header">
          <div className="referral-modal-heading">
            <ReferralHeaderIcon />
            <div>
              <h2 id="referral-modal-title">{t('referTitle')}</h2>
              <p>{t('referModalSubtitle')}</p>
            </div>
          </div>
          <button type="button" className="referral-modal-close" onClick={onClose} aria-label={t('referClose')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="referral-modal-section">
          <label className="referral-modal-section-title" htmlFor="referral-modal-link">
            {t('referCopyLink')}
          </label>
          <div className="referral-modal-link-row">
            <input
              id="referral-modal-link"
              className={`referral-modal-link${loading ? ' referral-modal-link--loading' : ''}`}
              type="text"
              readOnly
              value={loading ? '' : shareUrl}
              placeholder={loading ? '…' : ''}
              onFocus={(event) => event.currentTarget.select()}
              aria-label={t('referYourLink')}
            />
            <button
              type="button"
              className="referral-modal-copy"
              onClick={() => void copyLink()}
              disabled={shareDisabled}
            >
              <CopyIcon />
              {copied ? t('referCopiedShort') : t('referCopy')}
            </button>
          </div>
          {error ? <div className="referral-modal-error" role="alert">{error}</div> : null}
        </div>

        <div className="referral-modal-divider" aria-hidden />

        <div className="referral-modal-section referral-modal-share-section">
          <div className="referral-modal-section-title">{t('referShareVia')}</div>
          <div className="referral-modal-share-grid">
            <button type="button" className="referral-modal-share referral-modal-share--whatsapp" onClick={shareWhatsApp} disabled={shareDisabled}>
              <WhatsAppIcon />
              <span>{t('referShareWhatsApp')}</span>
            </button>
            <button type="button" className="referral-modal-share referral-modal-share--viber" onClick={shareViber} disabled={shareDisabled}>
              <ViberIcon />
              <span>{t('referShareViber')}</span>
            </button>
            <button type="button" className="referral-modal-share referral-modal-share--facebook" onClick={shareFacebook} disabled={shareDisabled}>
              <FacebookIcon />
              <span>{t('referShareFacebook')}</span>
            </button>
            <button type="button" className="referral-modal-share referral-modal-share--instagram" onClick={() => void shareInstagram()} disabled={shareDisabled}>
              <InstagramIcon />
              <span>{t('referShareInstagram')}</span>
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
