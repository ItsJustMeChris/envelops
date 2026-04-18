import { z } from 'zod'

import { oauthError, json } from '@/lib/http/responses'
import { createDeviceCode } from '@/lib/services/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  client_id: z.string(),
  device_public_key: z.string().min(1),
  system_information: z.record(z.string(), z.unknown()).nullable().optional(),
  dotenvx_project_id: z.string().nullable().optional()
})

export async function POST(req: Request) {
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
