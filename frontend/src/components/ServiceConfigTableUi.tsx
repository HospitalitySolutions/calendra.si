import type { MouseEvent as ReactMouseEvent } from 'react'

export type ServiceConfigSortDirection = 'asc' | 'desc'

export type ServiceConfigSortState<K extends string> = {
  key: K | null
  direction: ServiceConfigSortDirection
}

type ServiceConfigSortValue = string | number | boolean | null | undefined

export function nextServiceConfigSortState<K extends string>(
  current: ServiceConfigSortState<K>,
  key: K,
): ServiceConfigSortState<K> {
  if (current.key !== key) return { key, direction: 'asc' }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

export function sortServiceConfigRows<T, K extends string>(
  rows: T[],
  state: ServiceConfigSortState<K>,
  getValue: (row: T, key: K) => ServiceConfigSortValue,
  locale: string,
): T[] {
  if (state.key == null) return rows
  const key = state.key
  const direction = state.direction === 'asc' ? 1 : -1

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftValue = getValue(left.row, key)
      const rightValue = getValue(right.row, key)
      const leftEmpty = leftValue == null || leftValue === ''
      const rightEmpty = rightValue == null || rightValue === ''
      if (leftEmpty && rightEmpty) return left.index - right.index
      if (leftEmpty) return 1
      if (rightEmpty) return -1

      const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), locale, { numeric: true, sensitivity: 'base' })
      return compared === 0 ? left.index - right.index : compared * direction
    })
    .map(({ row }) => row)
}

export function ServiceConfigSortableTableHeader<K extends string>({
  label,
  sortKey,
  sortState,
  onSort,
}: {
  label: string
  sortKey: K
  sortState: ServiceConfigSortState<K>
  onSort: (key: K) => void
}) {
  const active = sortState.key === sortKey
  const direction = active ? sortState.direction : null

  return (
    <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`clients-sort-header${active ? ' clients-sort-header--active' : ''}`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <svg className={`clients-sort-icon${direction ? ` clients-sort-icon--${direction}` : ''}`} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path className="clients-sort-icon__up" d="m4.5 6 3.5-3.5L11.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path className="clients-sort-icon__down" d="m4.5 10 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  )
}

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
