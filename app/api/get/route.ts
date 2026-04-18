import { z } from 'zod'
import { and, eq } from 'drizzle-orm'

import { apiError } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { getSecretValue } from '@/lib/services/secrets'
import { recordAudit } from '@/lib/services/audit'
import { getDb } from '@/lib/db/client'
import { memberships } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  uri: z.string().regex(/^dotenvx:\/\/[a-z0-9_]+_[0-9a-fA-F]+$/)
})

export async function POST(req: Request) {
  const id = await requireBearer(req)
  if (!id) return apiError(401, 'unauthorized', 'missing or invalid bearer token')

  let parsed
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return apiError(400, 'invalid_request', 'uri must match dotenvx://<prefix>_<hex>')
  }

  const secret = await getSecretValue(parsed.uri)
  if (!secret) return apiError(404, 'not_found', 'no secret bound to that uri')

  const { db } = getDb()
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, id.account.id), eq(memberships.orgId, secret.orgId))
  })
  if (!membership) return apiError(403, 'forbidden', 'caller is not a member of the owning org')

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
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  })
}
