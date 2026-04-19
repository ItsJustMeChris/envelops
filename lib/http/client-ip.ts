import { headers } from 'next/headers'

/**
 * Best-effort client IP for rate-limiting / abuse controls.
 *
 * Prefers Cloudflare's `CF-Connecting-IP`, which Cloudflare sets from the real
 * edge connection and clients cannot spoof through the proxy. Falls back to the
 * left-most entry of `X-Forwarded-For` (the original client on a well-behaved
 * trust chain), then `X-Real-IP`, and finally `'unknown'` — the caller must
 * treat `'unknown'` as a single shared bucket, not as "no limit".
 */
export async function clientIp(): Promise<string> {
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
