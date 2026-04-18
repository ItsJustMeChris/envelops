import { z } from 'zod'

import { apiError, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { recordAudit } from '@/lib/services/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  encoded: z.string(),
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

  let parsed
  try {
    parsed = Body.parse(await req.json())
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

  await recordAudit({
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
