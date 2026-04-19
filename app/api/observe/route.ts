import { z } from 'zod'

import { MAX_ENCODED_BYTES, readJsonWithLimit } from '@/lib/http/body'
import { getDb } from '@/lib/db/client'
import { apiError, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { recordAudit } from '@/lib/services/audit'
import { rateLimit } from '@/lib/http/rate-limit'
import { assertCanAccessProject } from '@/lib/services/projects'
import { personalOrgForAccount } from '@/lib/services/teams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_OBSERVE_BYTES = 256 * 1024
const OBSERVE_LIMIT = 20
const OBSERVE_WINDOW_MS = 60_000

const Body = z.object({
  encoded: z.string().max(MAX_OBSERVE_BYTES),
  observed_at: z.string().optional(),
  pwd: z.string().nullable().optional(),
  git_url: z.string().nullable().optional(),
  git_branch: z.string().nullable().optional(),
  system_uuid: z.string().nullable().optional(),
  os_platform: z.string().nullable().optional(),
  os_arch: z.string().nullable().optional(),
  cli_version: z.string().nullable().optional(),
  dotenvx_project_id: z.string().nullable().optional()
})

export async function POST(req: Request) {
  const id = await requireBearer(req)
  if (!id) return apiError(401, 'unauthorized', 'missing or invalid bearer token')

  const bucket = rateLimit(`observe:${id.account.id}:${id.device?.id ?? 'none'}`, {
    limit: OBSERVE_LIMIT,
    windowMs: OBSERVE_WINDOW_MS
  })
  if (!bucket.allowed) {
    return apiError(429, 'too_many_requests', `try again in ${bucket.retryAfterSeconds}s`)
  }

  const body = await readJsonWithLimit(req, MAX_OBSERVE_BYTES)
  if (!body.ok) return body.res

  let parsed
  try {
    parsed = Body.parse(body.data)
  } catch {
    return apiError(400, 'invalid_request', 'malformed body')
  }

  let decoded: Record<string, unknown> | null = null
  try {
    const json = Buffer.from(parsed.encoded, 'base64').toString('utf8')
    const candidate = JSON.parse(json)
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      decoded = candidate as Record<string, unknown>
    }
  } catch {
    decoded = null
  }

  let auditOrgId = await personalOrgForAccount(id.account.id)
  if (parsed.dotenvx_project_id) {
    const { db } = getDb()
    const project = await db.query.projects.findFirst({
      where: (p, { eq }) => eq(p.dotenvxProjectId, parsed.dotenvx_project_id!)
    })
    if (project) {
      try {
        await assertCanAccessProject(id.account.id, project)
        auditOrgId = project.orgId
      } catch {
        // Keep observe best-effort. An untrusted project hint must not re-home
        // the event into another org's audit trail.
      }
    }
  }

  await recordAudit({
    orgId: auditOrgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'observe',
    payload: decoded,
    rawEncoded: parsed.encoded,
    pwd: parsed.pwd ?? null,
    gitUrl: parsed.git_url ?? null,
    gitBranch: parsed.git_branch ?? null,
    systemUuid: parsed.system_uuid ?? null,
    osPlatform: parsed.os_platform ?? null,
    osArch: parsed.os_arch ?? null,
    cliVersion: parsed.cli_version ?? null
  })

  if (id.device) await touchDevice(id.device.id)

  return json({ ok: true })
}
