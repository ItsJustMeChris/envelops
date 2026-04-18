import { z } from 'zod'

import { oauthError, json } from '@/lib/http/responses'
import { redeemDeviceCode } from '@/lib/services/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  client_id: z.string(),
  device_code: z.string().min(1),
  grant_type: z.literal('urn:ietf:params:oauth:grant-type:device_code')
})

export async function POST(req: Request) {
  let parsed
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return oauthError(400, 'invalid_request', 'malformed body')
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
