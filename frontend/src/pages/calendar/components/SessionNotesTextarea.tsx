import { useLayoutEffect, useRef, type ChangeEvent, type TextareaHTMLAttributes } from 'react'

/** ~one text line inside session panel padding (see `.calendar-session-notes-autogrow` CSS) */
const SESSION_NOTES_TEXTAREA_MIN_HEIGHT_PX = 32
const SESSION_NOTES_TEXTAREA_MAX_HEIGHT_PX = 288

type SessionNotesTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'value' | 'onChange'> & {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

/** Starts one line tall; grows with content up to a max height, then scrolls. */
export function SessionNotesTextarea({ value, onChange, className, placeholder, ...rest }: SessionNotesTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    const sh = el.scrollHeight
    const h = Math.min(Math.max(sh, SESSION_NOTES_TEXTAREA_MIN_HEIGHT_PX), SESSION_NOTES_TEXTAREA_MAX_HEIGHT_PX)
    el.style.height = `${h}px`
    el.style.overflowY = sh > SESSION_NOTES_TEXTAREA_MAX_HEIGHT_PX ? 'auto' : 'hidden'
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      className={['calendar-session-notes-autogrow', className].filter(Boolean).join(' ')}
      placeholder={placeholder ?? 'Vnesi opombo'}
      value={value}
      onChange={onChange}
      {...rest}
    />
  )
}
