export function Spinner({ small = false }: { small?: boolean }) {
  return <span className={`spinner ${small ? 'spinner--small' : ''}`} aria-label="Nalagam" />
}

export function FullPageLoader() {
  return <div className="full-page-loader"><img src="/racun/calendra-wordmark.webp" alt="Calendra"/><Spinner/></div>
}

export function PageLoader() {
  return <div className="page-state"><Spinner/><span>Nalaganje …</span></div>
}

export function ErrorState({ message = 'Pri nalaganju je prišlo do napake.', onRetry }: { message?: string; onRetry?: () => void }) {
  return <div className="page-state page-state--error"><strong>Nekaj ni uspelo</strong><span>{message}</span>{onRetry && <button className="button button--secondary" onClick={onRetry}>Poskusi znova</button>}</div>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-state__mark">C</div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>
}
