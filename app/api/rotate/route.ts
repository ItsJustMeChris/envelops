import { z } from 'zod'

import { apiError, asForbidden, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { rotateByUri } from '@/lib/services/rotate'
import { resolveOrCreateProject } from '@/lib/services/projects'
import { recordAudit } from '@/lib/services/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  uri: z.string().regex(/^dotenvx:\/\/rot_[0-9a-fA-F]+$/),
  new_value: z.string().nullable().optional(),
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

  try {
    const result = await rotateByUri({
      orgId: project.orgId,
      uri: parsed.uri,
      newValue: parsed.new_value ?? null
    })
    if (id.device) await touchDevice(id.device.id)
    await recordAudit({
      orgId: project.orgId,
      accountId: id.account.id,
      deviceId: id.device?.id ?? null,
      kind: 'rotate',
      payload: { uri: result.uri, rot_uid: result.rotUid }
    })
    return json({ url: result.url, rot_uid: result.rotUid, uri: result.uri })
  } catch (e) {
    return apiError(400, 'rotate_failed', (e as Error).message)
  }
}
