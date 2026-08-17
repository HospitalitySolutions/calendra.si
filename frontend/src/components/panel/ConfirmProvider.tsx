import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useLocale } from '../../locale'
import { ConfirmDialog } from './SidePanel'

export type ConfirmRequest = {
  title: string
  text?: string
  tone?: 'default' | 'danger' | 'warning'
  confirmLabel?: string
  cancelLabel?: string
}

type PendingRequest = ConfirmRequest & { id: number }

const ConfirmContext = createContext<((request: ConfirmRequest) => Promise<boolean>) | null>(null)

/**
 * Promise-based replacement for `window.confirm`:
 *
 * ```tsx
 * const confirm = useConfirm()
 * if (!(await confirm({ title: t('confirmDeleteClient'), tone: 'danger' }))) return
 * ```
 *
 * Resolves `true` on confirm, `false` on cancel, Escape or scrim click. The dialog
 * renders above every other surface, so it is safe to raise from inside a legacy modal.
 */
export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used within ConfirmProvider')
  return confirm
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLocale()
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)
  const nextIdRef = useRef(1)

  const settle = useCallback((value: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setPending(null)
    resolve?.(value)
  }, [])

  const confirm = useCallback((request: ConfirmRequest) => {
    // Only one dialog at a time; a request arriving while one is open declines the old one.
    resolveRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setPending({ ...request, id: nextIdRef.current++ })
    })
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmDialog
          key={pending.id}
          open
          onClose={() => settle(false)}
          onConfirm={() => settle(true)}
          title={pending.title}
          text={pending.text}
          tone={pending.tone}
          confirmLabel={
            pending.confirmLabel
            ?? (pending.tone === 'danger' ? t('confirmDefaultDelete') : t('confirmDefaultConfirm'))
          }
          cancelLabel={pending.cancelLabel ?? t('cancel')}
        />
      )}
    </ConfirmContext.Provider>
  )
}
