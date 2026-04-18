import { z } from 'zod'

import { apiError, asForbidden, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { createRotationReference, recordConnector } from '@/lib/services/rotate'
import { resolveOrCreateProject } from '@/lib/services/projects'
import { recordAudit } from '@/lib/services/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  provider: z.enum(['manual', 'github', 'npm', 'openai']),
  label: z.string().nullable().optional(),
  credentials: z.record(z.string(), z.unknown()).nullable().optional(),
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

  const connector = await recordConnector({
    orgId: project.orgId,
    provider: parsed.provider,
    label: parsed.label ?? null,
    credentials: parsed.credentials ?? null
  })
  const rotation = await createRotationReference({ orgId: project.orgId, provider: parsed.provider })

  if (id.device) await touchDevice(id.device.id)
  await recordAudit({
    orgId: project.orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'rotate.connect',
    payload: { provider: parsed.provider, connector_id: connector.id, rot_uid: rotation.uid }
  })

  return json({ rot_uid: rotation.uid, uri: rotation.uri, provider: connector.provider })
}
