import { headers } from 'next/headers'

/**
 * Best-effort client IP for rate-limiting / abuse controls.
 *
 * Proxy headers (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`) are only
 * trusted when `ENVELOPS_TRUST_PROXY=1` is set — otherwise any client can spoof
 * them against a directly-exposed Next.js process and defeat every per-IP rate
 * limit by rotating the header. When proxy trust is off we return `'unknown'`,
 * which callers treat as a single shared bucket (not "no limit"): the server
 * stays rate-limited in aggregate even when the socket peer isn't reachable
 * through `headers()`. Operators running behind Caddy/Cloudflare/nginx should
 * set `ENVELOPS_TRUST_PROXY=1` so per-IP buckets work.
 */
export async function clientIp(): Promise<string> {
  if (process.env.ENVELOPS_TRUST_PROXY !== '1') return 'unknown'
  const h = await headers()
  const cf = h.get('cf-connecting-ip')
  if (cf && cf.trim()) return cf.trim()
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = h.get('x-real-ip')
  if (real && real.trim()) return real.trim()
  return 'unknown'
}
