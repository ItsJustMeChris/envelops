import { z } from 'zod'

import { MAX_ENCODED_BYTES, readJsonWithLimit } from '@/lib/http/body'
import { apiError, asAccessDenied, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { recordSyncBackup, SyncPayloadError } from '@/lib/services/sync'
import { recordAudit } from '@/lib/services/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  device_public_key: z.string().min(1),
  encoded: z.string().min(1).max(MAX_ENCODED_BYTES),
  dotenvx_project_id: z.string().nullable().optional(),
  synced_at: z.string().optional(),
  pwd: z.string().nullable().optional(),
  git_url: z.string().nullable().optional(),
  git_branch: z.string().nullable().optional(),
  system_uuid: z.string().nullable().optional(),
  os_platform: z.string().nullable().optional(),
  os_arch: z.string().nullable().optional(),
  cli_version: z.string().nullable().optional(),
  force: z.boolean().optional(),
  org: z.string().nullable().optional()
})

export async function POST(req: Request) {
  const id = await requireBearer(req)
  if (!id) return apiError(401, 'unauthorized', 'missing or invalid bearer token')

  const body = await readJsonWithLimit(req, MAX_ENCODED_BYTES)
  if (!body.ok) return body.res

  let parsed
  try {
    parsed = Body.parse(body.data)
  } catch {
    return apiError(400, 'invalid_request', 'malformed body')
  }

  if (id.device && id.device.publicKey !== parsed.device_public_key) {
    return apiError(404, 'not_found')
  }

  let result
  try {
    result = await recordSyncBackup({
      accountId: id.account.id,
      deviceId: id.device?.id ?? null,
      orgSlug: parsed.org ?? null,
      dotenvxProjectId: parsed.dotenvx_project_id ?? null,
      encoded: parsed.encoded,
      pwd: parsed.pwd ?? null,
      gitUrl: parsed.git_url ?? null,
      gitBranch: parsed.git_branch ?? null,
      cliVersion: parsed.cli_version ?? null,
      kind: 'sync'
    })
  } catch (e) {
    const denied = asAccessDenied(e)
    if (denied) return denied
    if (e instanceof SyncPayloadError) return apiError(400, 'invalid_request', e.message)
    throw e
  }

  if (id.device) await touchDevice(id.device.id)
  await recordAudit({
    orgId: result._orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'sync.push',
    payload: { sync_id: result.id, project: result.dotenvx_project_id },
    gitUrl: parsed.git_url ?? null,
    gitBranch: parsed.git_branch ?? null,
    pwd: parsed.pwd ?? null,
    systemUuid: parsed.system_uuid ?? null,
    osPlatform: parsed.os_platform ?? null,
    osArch: parsed.os_arch ?? null,
    cliVersion: parsed.cli_version ?? null
  })

  const { _orgId: _o, _projectId: _p, ...wire } = result
  return json(wire)
}
