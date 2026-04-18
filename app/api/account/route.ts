import { apiError, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { listAccountOrganizations } from '@/lib/services/accounts'
import { baseUrl } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = await requireBearer(req)
  if (!id) return apiError(401, 'unauthorized', 'missing or invalid bearer token')
  if (id.device) await touchDevice(id.device.id)

  const orgs = await listAccountOrganizations(id.account.id)
  return json({
    id: id.account.id,
    username: id.account.username,
    full_username: id.account.fullUsername,
    hostname: baseUrl(),
    organizations: orgs.map((o) => ({
      id: o.id,
      provider: o.provider,
      provider_slug: o.slug
    }))
  })
}
