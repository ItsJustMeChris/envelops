import { baseOrigin } from '../config'
import { apiError } from './responses'

/**
 * Defense-in-depth CSRF check. Browsers always send Origin on cross-origin POSTs,
 * so rejecting anything other than our own base URL blocks attacker-initiated form
 * submissions even in browsers that relax SameSite=Lax.
 */
export function requireSameOrigin(req: Request): ReturnType<typeof apiError> | null {
  const origin = req.headers.get('origin')
  if (!origin || origin !== baseOrigin()) {
    return apiError(403, 'forbidden', 'origin mismatch')
  }
  return null
}
