import { z } from 'zod'

import { oauthError, json } from '@/lib/http/responses'
import { createDeviceCode } from '@/lib/services/oauth'
import { clientIp } from '@/lib/http/client-ip'
import { rateLimit } from '@/lib/http/rate-limit'
import { isCompressedPublicKey } from '@/lib/crypto/keypair'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  client_id: z.string(),
  device_public_key: z.string().refine(isCompressedPublicKey),
  system_information: z.record(z.string(), z.unknown()).nullable().optional(),
  dotenvx_project_id: z.string().nullable().optional()
})

// Without a per-IP cap, anyone can mint unlimited pending device codes and fill
// oauth_device_codes. Legitimate CLIs issue one per `login` invocation.
const MINT_LIMIT = 10
const MINT_WINDOW_MS = 60_000

export async function POST(req: Request) {
  const ip = await clientIp()
  const limited = rateLimit(`device-code-mint:${ip}`, {
    limit: MINT_LIMIT,
    windowMs: MINT_WINDOW_MS
  })
  if (!limited.allowed) {
    return oauthError(429, 'slow_down', `try again in ${limited.retryAfterSeconds}s`)
  }

  let parsed
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return oauthError(400, 'invalid_request', 'malformed body')
  }

  const result = await createDeviceCode({
    devicePublicKey: parsed.device_public_key,
    systemInformation: parsed.system_information ?? null
  })
  return json(result)
}
