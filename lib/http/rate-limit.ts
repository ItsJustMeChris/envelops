type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function sweep(now: number): void {
  if (buckets.size <= 10_000) return
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

/**
 * Fixed-window counter keyed by arbitrary string. In-memory and per-process —
 * good enough to blunt online brute-force of short codes on a single node; if
 * this server is ever horizontally scaled the backing store must move out of
 * process (Redis, DB) or attackers can just spray across instances.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  if (existing.count >= opts.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    }
  }
  existing.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

/**
 * Non-incrementing peek. Use when you want to reject requests that have
 * *already* blown their budget (e.g. too many recorded auth failures) without
 * charging the current request against the bucket itself.
 */
export function rateLimitPeek(
  key: string,
  opts: { limit: number; windowMs: number }
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    return { allowed: true, retryAfterSeconds: 0 }
  }
  if (existing.count >= opts.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}
