import { z } from 'zod'

import { apiError, asAccessDenied, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { setSecret } from '@/lib/services/secrets'
import { recordAudit } from '@/lib/services/audit'
import {
  routeUriForAccount,
  SecretRouteForbiddenError
} from '@/lib/services/secret-routing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  device_public_key: z.string().min(1),
  uri: z.string().min(1).regex(/^\S+$/),
  value: z.string()
})

export async function POST(req: Request) {
  const id = await requireBearer(req)
  if (!id) return apiError(401, 'unauthorized', 'missing or invalid bearer token')

  let parsed
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return apiError(400, 'invalid_request', 'malformed body')
  }

  if (id.device && id.device.publicKey !== parsed.device_public_key) {
    return apiError(404, 'not_found')
  }

  // Routing is pure: the URI's shape picks the org, no DB fallback chase.
  //   envelops://<slug>/<key>  → that org (404 if caller isn't a member — we
  //                              never leak whether the slug exists).
  //   anything else            → caller's personal org, key = verbatim uri.
  let routed
  try {
    routed = await routeUriForAccount({ accountId: id.account.id, uri: parsed.uri })
  } catch (e) {
    if (e instanceof SecretRouteForbiddenError) {
      return apiError(404, 'not_found')
    }
    throw e
  }

  let row
  try {
    row = await setSecret({
      orgId: routed.orgId,
      uri: routed.uri,
      key: routed.key,
      value: parsed.value
    })
  } catch (e) {
    const denied = asAccessDenied(e)
    if (denied) return denied
    throw e
  }

  if (id.device) await touchDevice(id.device.id)
  await recordAudit({
    orgId: routed.orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'secret.set',
    payload: { uri: parsed.uri, secret_id: row.id }
  })

  return json({ id: row.id, uri: row.uri, updated_at: row.updatedAt.toISOString() })
}
