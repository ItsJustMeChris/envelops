import { z } from 'zod'

import { apiError, asForbidden, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { fetchOrMintKeypair } from '@/lib/services/keystore'
import { recordAudit } from '@/lib/services/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  device_public_key: z.string().min(1),
  cli_version: z.string().optional(),
  public_key: z.string().optional()
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
    return apiError(
      403,
      'device_mismatch',
      'device_public_key does not match the device that minted this token'
    )
  }

  let result
  try {
    result = await fetchOrMintKeypair({
      accountId: id.account.id,
      publicKey: parsed.public_key ?? null
    })
  } catch (e) {
    const forbidden = asForbidden(e)
    if (forbidden) return forbidden
    throw e
  }

  if (id.device) await touchDevice(id.device.id)
  await recordAudit({
    orgId: result.orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: result.action === 'fetch' ? 'keypair.fetch' : 'keypair.mint',
    payload: { public_key: result.public_key },
    cliVersion: parsed.cli_version ?? null
  })

  const { orgId: _orgId, action: _action, ...wire } = result
  return json(wire, {
    headers: { 'cache-control': 'no-store', pragma: 'no-cache' }
  })
}
