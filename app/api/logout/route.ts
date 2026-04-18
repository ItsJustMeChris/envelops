import { apiError, json } from '@/lib/http/responses'
import { requireBearer, revokeToken } from '@/lib/services/cli-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const id = await requireBearer(req)
  if (!id) return apiError(401, 'unauthorized', 'missing or invalid bearer token')
  await revokeToken(id.token.id)
  return json({ ok: true })
}
