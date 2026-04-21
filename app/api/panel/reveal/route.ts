import { z } from 'zod'
import { and, eq } from 'drizzle-orm'

import { apiError, json } from '@/lib/http/responses'
import { requireSameOrigin } from '@/lib/http/origin'
import { currentAccount } from '@/lib/services/panel-auth'
import { getDb } from '@/lib/db/client'
import { keypairs, memberships } from '@/lib/db/schema'
import { unsealPrivateKey } from '@/lib/services/keystore'
import { recordAudit } from '@/lib/services/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({ public_key: z.string().min(1) })

export async function POST(req: Request) {
  const denied = requireSameOrigin(req)
  if (denied) return denied

  const account = await currentAccount()
  if (!account) return apiError(401, 'unauthorized', 'sign in first')

  let parsed
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return apiError(400, 'invalid_request')
  }

  const { db } = getDb()
  const row = await db.query.keypairs.findFirst({ where: eq(keypairs.publicKey, parsed.public_key) })
  if (!row) return apiError(404, 'not_found')

  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, account.id), eq(memberships.orgId, row.orgId))
  })
  if (!membership) return apiError(404, 'not_found')
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return apiError(404, 'not_found')
  }

  await recordAudit({
    orgId: row.orgId,
    accountId: account.id,
    kind: 'keypair.reveal.panel',
    payload: { public_key: row.publicKey }
  })
  const privateKey = unsealPrivateKey(row.encryptedPrivateKey)
  return json(
    { private_key: privateKey },
    { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } }
  )
}
