type SessionTypeDisplayLike = {
  internalDescription?: unknown
  description?: unknown
  name?: unknown
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Staff-facing service description for the Calendra web app.
 *
 * When an internal description exists it intentionally replaces the public
 * description in internal UI. Public/customer surfaces must continue to use
 * `description` directly and must not import this helper.
 */
export function appSessionTypeDescription(
  type: SessionTypeDisplayLike | null | undefined,
  fallback = '',
): string {
  if (!type) return fallback
  return clean(type.internalDescription) || clean(type.description) || fallback
}

/** Staff-facing label that keeps the technical/name code when it differs. */
export function appSessionTypeCodeAndDescription(
  type: SessionTypeDisplayLike | null | undefined,
  fallback = '',
): string {
  if (!type) return fallback
  const code = clean(type.name)
  const description = appSessionTypeDescription(type)
  if (code && description && code.toLocaleLowerCase() !== description.toLocaleLowerCase()) {
    return `${code} - ${description}`
  }
  return description || code || fallback
}
