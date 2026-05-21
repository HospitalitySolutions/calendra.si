import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

type ToastType = 'success' | 'error'
type ToastMessage = { id: number; type: ToastType; message: string }

const ToastContext = createContext<{
  showToast: (type: ToastType, message: string) => void
  clearToasts: () => void
} | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextIdRef = useRef(1)
  const timeoutRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const clearTimeoutFor = useCallback((id: number) => {
    const handle = timeoutRef.current.get(id)
    if (!handle) return
    clearTimeout(handle)
    timeoutRef.current.delete(id)
  }, [])

  const scheduleAutoDismiss = useCallback((id: number) => {
    clearTimeoutFor(id)
    const handle = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timeoutRef.current.delete(id)
    }, 5000)
    timeoutRef.current.set(id, handle)
  }, [clearTimeoutFor])

  const showToast = useCallback((type: ToastType, message: string) => {
    setToasts((prev) => {
      const existing = prev.find((t) => t.type === type && t.message === message)
      if (existing) {
        scheduleAutoDismiss(existing.id)
        return prev
      }
      const id = nextIdRef.current++
      scheduleAutoDismiss(id)
      return [...prev, { id, type, message }]
    })
  }, [scheduleAutoDismiss])

  const dismiss = useCallback((id: number) => {
    clearTimeoutFor(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [clearTimeoutFor])

  const clearToasts = useCallback(() => {
    timeoutRef.current.forEach((handle) => clearTimeout(handle))
    timeoutRef.current.clear()
    setToasts([])
  }, [])

  useEffect(() => () => {
    timeoutRef.current.forEach((handle) => clearTimeout(handle))
    timeoutRef.current.clear()
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, clearToasts }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role="alert"
          >
            <span className="toast-message">{t.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              OK
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
