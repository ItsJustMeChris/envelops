import { apiError, json } from '@/lib/http/responses'
import { requireBearer } from '@/lib/services/cli-auth'
import { latestSyncStateForProject } from '@/lib/services/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = await requireBearer(req)
  if (!id) return apiError(401, 'unauthorized', 'missing or invalid bearer token')

  const url = new URL(req.url)
  const projectId = url.searchParams.get('dotenvx_project_id')
  if (!projectId) return apiError(400, 'invalid_request', 'dotenvx_project_id required')

  const state = await latestSyncStateForProject(projectId)
  if (!state) return json({ dotenvx_project_id: projectId, synced: false })

  return json({
    dotenvx_project_id: projectId,
    synced: true,
    id: state.id,
    last_synced_at: state.createdAt.toISOString()
  })
}
