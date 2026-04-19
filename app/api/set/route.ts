import { z } from 'zod'

import { apiError, asForbidden, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { setSecret } from '@/lib/services/secrets'
import { recordAudit } from '@/lib/services/audit'
import { resolveOrCreateProject } from '@/lib/services/projects'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  device_public_key: z.string().min(1),
  uri: z.string().regex(/^dotenvx:\/\/[a-z0-9_]+_[0-9a-fA-F]+$/),
  value: z.string(),
  dotenvx_project_id: z.string().nullable().optional(),
  org: z.string().nullable().optional()
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
    return apiError(403, 'device_mismatch', 'device_public_key mismatch')
  }

  let project
  try {
    project = await resolveOrCreateProject({
      accountId: id.account.id,
      dotenvxProjectId: parsed.dotenvx_project_id ?? null,
      orgSlug: parsed.org ?? null
    })
  } catch (e) {
    const forbidden = asForbidden(e)
    if (forbidden) return forbidden
    throw e
  }

  let row
  try {
    row = await setSecret({
      orgId: project.orgId,
      projectId: project.id,
      uri: parsed.uri,
      value: parsed.value
    })
  } catch (e) {
    const forbidden = asForbidden(e)
    if (forbidden) return forbidden
    throw e
  }

  if (id.device) await touchDevice(id.device.id)
  await recordAudit({
    orgId: project.orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'secret.set',
    payload: { uri: parsed.uri, secret_id: row.id }
  })

  return json({ id: row.id, uri: row.uri, updated_at: row.updatedAt.toISOString() })
}
