import { z } from 'zod'

import { oauthError, json } from '@/lib/http/responses'
import { redeemDeviceCode } from '@/lib/services/oauth'
import { clientIp } from '@/lib/http/client-ip'
import { rateLimit } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  client_id: z.string(),
  device_code: z.string().min(1),
  grant_type: z.literal('urn:ietf:params:oauth:grant-type:device_code')
})

// Clients poll on the advertised `interval` (5s). A per-IP cap keeps a
// compliant polling CLI well under the threshold but blocks a fleet spamming
// random device_codes. A per-device-code cap forces one client to honor the
// interval even if they share an IP with legitimate traffic.
const IP_POLL_LIMIT = 120
const IP_POLL_WINDOW_MS = 60_000
const CODE_POLL_LIMIT = 20
const CODE_POLL_WINDOW_MS = 60_000

export async function POST(req: Request) {
  const ip = await clientIp()
  const ipLimit = rateLimit(`token-poll-ip:${ip}`, {
    limit: IP_POLL_LIMIT,
    windowMs: IP_POLL_WINDOW_MS
  })
  if (!ipLimit.allowed) {
    return oauthError(429, 'slow_down', `try again in ${ipLimit.retryAfterSeconds}s`)
  }

  let parsed
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return oauthError(400, 'invalid_request', 'malformed body')
  }

  const codeLimit = rateLimit(`token-poll-code:${parsed.device_code}`, {
    limit: CODE_POLL_LIMIT,
    windowMs: CODE_POLL_WINDOW_MS
  })
  if (!codeLimit.allowed) {
    return oauthError(400, 'slow_down', `polling too fast; retry in ${codeLimit.retryAfterSeconds}s`)
  }

  const outcome = await redeemDeviceCode(parsed.device_code)
  switch (outcome.status) {
    case 'pending':
      return oauthError(400, 'authorization_pending', 'user authorization is pending. wait for the user.')
    case 'expired':
      return oauthError(400, 'expired_token', 'device code expired')
    case 'consumed':
      return oauthError(400, 'expired_token', 'device code already redeemed')
    case 'authorized':
      return json({
        access_token: outcome.accessToken,
        token_type: 'bearer',
        id: outcome.accountId,
        username: outcome.username,
        full_username: outcome.fullUsername
      })
  }
}
