/**
 * Returns true if `value` is a same-origin path safe to feed into `new URL(value, base)`.
 *
 * Rejects protocol-relative ("//host") and backslash-prefixed ("/\host") forms,
 * which the URL parser resolves to a different origin and would enable an open
 * redirect on any caller that only checks `value.startsWith('/')`.
 */
export function isSafeLocalPath(value: string | null | undefined): value is string {
  if (!value || value[0] !== '/') return false
  if (value.length > 1 && (value[1] === '/' || value[1] === '\\')) return false
  return true
}
