import type { MouseEvent as ReactMouseEvent } from 'react'

export function ServiceConfigActionIcon({ kind }: { kind: 'edit' | 'delete' }) {
  if (kind === 'delete') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="m7 7 1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </svg>
    )
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  )
}

export function ServiceConfigEditButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="secondary clients-row-action-btn service-config-action-edit" onClick={onClick} disabled={disabled}>
      <ServiceConfigActionIcon kind="edit" />
      {label}
    </button>
  )
}

export function ServiceConfigDeleteButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="secondary clients-row-action-btn clients-row-action-btn--danger account-table-action-danger service-config-action-delete" onClick={onClick} disabled={disabled}>
      <ServiceConfigActionIcon kind="delete" />
      {label}
    </button>
  )
}

export function ServiceConfigTableFooter({ summary }: { summary: string }) {
  return (
    <div className="clients-modern-table-footer service-config-table-footer">
      <span>{summary}</span>
      <div className="clients-modern-pagination" aria-label="Pagination">
        <button type="button" className="secondary" disabled aria-label="Previous page">‹</button>
        <span aria-current="page">1</span>
        <button type="button" className="secondary" disabled aria-label="Next page">›</button>
      </div>
    </div>
  )
}
