import { z } from 'zod'
import { eq } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'
import { projects } from '@/lib/db/schema'
import { apiError, asForbidden, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { createRotationReference, recordConnector } from '@/lib/services/rotate'
import { assertCanAccessProject, resolveOrgForAccount } from '@/lib/services/projects'
import { requireOwnerOrAdmin } from '@/lib/services/invites'
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

  let orgId: number
  try {
    if (parsed.dotenvx_project_id) {
      const { db } = getDb()
      const project = await db.query.projects.findFirst({
        where: eq(projects.dotenvxProjectId, parsed.dotenvx_project_id)
      })
      if (!project) return apiError(404, 'not_found', 'project not found')
      await assertCanAccessProject(id.account.id, project)
      if (parsed.org) {
        const scopedOrgId = await resolveOrgForAccount({
          accountId: id.account.id,
          orgSlug: parsed.org
        })
        if (scopedOrgId !== project.orgId) {
          return apiError(400, 'invalid_request', 'org and dotenvx_project_id refer to different organizations')
        }
      }
      orgId = project.orgId
    } else {
      orgId = await resolveOrgForAccount({
        accountId: id.account.id,
        orgSlug: parsed.org ?? null
      })
    }
  } catch (e) {
    const forbidden = asForbidden(e)
    if (forbidden) return forbidden
    throw e
  }

  const allowed = await requireOwnerOrAdmin({ accountId: id.account.id, orgId })
  if (!allowed) return apiError(403, 'forbidden', 'owner or admin role required to manage rotation connectors')

  const connector = await recordConnector({
    orgId,
    provider: parsed.provider,
    label: parsed.label ?? null,
    credentials: parsed.credentials ?? null
  })
  const rotation = await createRotationReference({ orgId, provider: parsed.provider })

  if (id.device) await touchDevice(id.device.id)
  await recordAudit({
    orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'rotate.connect',
    payload: { provider: parsed.provider, connector_id: connector.id, rot_uid: rotation.uid }
  })

  return json({ rot_uid: rotation.uid, uri: rotation.uri, provider: connector.provider })
}
