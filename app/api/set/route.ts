import { z } from 'zod'
import { eq } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'
import { projects, rotations, secrets, syncFiles, type Project } from '@/lib/db/schema'
import { apiError, asForbidden, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { setSecret } from '@/lib/services/secrets'
import { recordAudit } from '@/lib/services/audit'
import {
  assertAccountIsOrgMember,
  assertCanAccessProject,
  resolveOrCreateProject
} from '@/lib/services/projects'

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

  // The commercial CLI does not send `dotenvx_project_id` on /api/set — the URI
  // alone is expected to identify where the secret lives. Resolve via the URI:
  // existing secret first, then the syncFiles table (env_* URIs minted by sync),
  // then the rotations table (rot_* URIs minted by rotate/connect). Only if the
  // URI is entirely unknown do we fall back to the explicit hint / default project.
  let orgId: number
  let projectId: number | null = null
  try {
    const resolved = await resolveUriTarget(parsed.uri)
    if (resolved) {
      if (resolved.project) {
        await assertCanAccessProject(id.account.id, resolved.project)
        projectId = resolved.project.id
      } else {
        await assertAccountIsOrgMember(id.account.id, resolved.orgId)
      }
      orgId = resolved.orgId
    } else {
      const project = await resolveOrCreateProject({
        accountId: id.account.id,
        dotenvxProjectId: parsed.dotenvx_project_id ?? null,
        orgSlug: parsed.org ?? null
      })
      orgId = project.orgId
      projectId = project.id
    }
  } catch (e) {
    const forbidden = asForbidden(e)
    if (forbidden) return forbidden
    throw e
  }

  let row
  try {
    row = await setSecret({
      orgId,
      projectId,
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
    orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'secret.set',
    payload: { uri: parsed.uri, secret_id: row.id }
  })

  return json({ id: row.id, uri: row.uri, updated_at: row.updatedAt.toISOString() })
}

async function resolveUriTarget(
  uri: string
): Promise<{ orgId: number; project: Project | null } | null> {
  const { db } = getDb()

  const existingSecret = await db.query.secrets.findFirst({ where: eq(secrets.uri, uri) })
  if (existingSecret) {
    const project = existingSecret.projectId
      ? (await db.query.projects.findFirst({
          where: eq(projects.id, existingSecret.projectId)
        })) ?? null
      : null
    return { orgId: existingSecret.orgId, project }
  }

  const envFile = await db.query.syncFiles.findFirst({ where: eq(syncFiles.envUri, uri) })
  if (envFile) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, envFile.projectId)
    })
    return { orgId: envFile.orgId, project: project ?? null }
  }

  const rotation = await db.query.rotations.findFirst({ where: eq(rotations.uri, uri) })
  if (rotation) return { orgId: rotation.orgId, project: null }

  return null
}
