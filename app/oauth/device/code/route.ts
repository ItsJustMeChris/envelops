import { z } from 'zod'

import { readJsonWithLimit } from '@/lib/http/body'
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

const MAX_DEVICE_CODE_BODY_BYTES = 16 * 1024

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

  const body = await readJsonWithLimit(req, MAX_DEVICE_CODE_BODY_BYTES)
  if (!body.ok) return body.res

  let parsed
  try {
    parsed = Body.parse(body.data)
  } catch {
    return oauthError(400, 'invalid_request', 'malformed body')
  }

  const result = await createDeviceCode({
    devicePublicKey: parsed.device_public_key,
    systemInformation: parsed.system_information ?? null
  })
  return json(result)
}
