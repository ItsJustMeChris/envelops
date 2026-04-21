import { z } from 'zod'

import { apiError } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { getSecretValue } from '@/lib/services/secrets'
import { recordAudit } from '@/lib/services/audit'
import { resolveEnvUriForAccount } from '@/lib/services/sync'
import {
  routeUriForAccount,
  SecretRouteForbiddenError
} from '@/lib/services/secret-routing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  uri: z.string().min(1).regex(/^\S+$/)
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

  // env_<hex> URIs point at synced file contents. Returns the RAW content that
  // was stored on /api/sync — still dotenvx-ciphertext if the caller synced
  // encrypted files. Decryption is the caller's responsibility via `dotenvx run`.
  if (parsed.uri.startsWith('dotenvx://env_')) {
    const result = await resolveEnvUriForAccount({
      accountId: id.account.id,
      envUri: parsed.uri
    })
    if ('error' in result) {
      return apiError(404, 'not_found')
    }

    await recordAudit({
      orgId: result.project.orgId,
      accountId: id.account.id,
      deviceId: id.device?.id ?? null,
      kind: 'sync_file.get',
      payload: { uri: parsed.uri, filepath: result.file.filepath }
    })
    if (id.device) await touchDevice(id.device.id)

    return new Response(result.content, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        pragma: 'no-cache'
      }
    })
  }

  // Same routing logic as /api/set — envelops://<slug>/<key> resolves to that
  // org's secret, anything else reads from the caller's personal org.
  let routed
  try {
    routed = await routeUriForAccount({ accountId: id.account.id, uri: parsed.uri })
  } catch (e) {
    if (e instanceof SecretRouteForbiddenError) {
      return apiError(404, 'not_found')
    }
    throw e
  }

  const secret = await getSecretValue({ orgId: routed.orgId, key: routed.key })
  if (!secret) return apiError(404, 'not_found')

  await recordAudit({
    orgId: secret.orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'secret.get',
    payload: { uri: parsed.uri }
  })
  if (id.device) await touchDevice(id.device.id)

  // Observed commercial behavior: returns plaintext as `text/plain`.
  return new Response(secret.value, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      pragma: 'no-cache'
    }
  })
}
