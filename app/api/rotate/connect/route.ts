import { z } from 'zod'
import { eq } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'
import { projects } from '@/lib/db/schema'
import { apiError, asAccessDenied, json } from '@/lib/http/responses'
import { requireBearer, touchDevice } from '@/lib/services/cli-auth'
import { createRotationReference, recordConnector } from '@/lib/services/rotate'
import { assertCanAccessProject, resolveOrgForAccount } from '@/lib/services/projects'
import { requireOwnerOrAdmin } from '@/lib/services/invites'
import { recordAudit } from '@/lib/services/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KNOWN_PROVIDERS = ['manual', 'github', 'npm', 'openai'] as const
type Provider = (typeof KNOWN_PROVIDERS)[number]

// The commercial CLI sends `{org, slug, username, password, email,
// playwright_storage_state}`; panel/internal callers may send
// `{provider, label, credentials, ...}`. Accept both — we normalize below.
const Body = z.object({
  provider: z.enum(KNOWN_PROVIDERS).optional(),
  slug: z.string().optional(),
  label: z.string().nullable().optional(),
  credentials: z.record(z.string(), z.unknown()).nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  playwright_storage_state: z.string().nullable().optional(),
  dotenvx_project_id: z.string().nullable().optional(),
  org: z.string().nullable().optional()
})

function resolveProvider(parsed: z.infer<typeof Body>): Provider | null {
  const candidate = parsed.provider ?? parsed.slug
  if (!candidate) return null
  return (KNOWN_PROVIDERS as readonly string[]).includes(candidate)
    ? (candidate as Provider)
    : null
}

function resolveCredentials(parsed: z.infer<typeof Body>): Record<string, unknown> | null {
  const wire: Record<string, unknown> = {}
  if (parsed.username != null) wire.username = parsed.username
  if (parsed.password != null) wire.password = parsed.password
  if (parsed.email != null) wire.email = parsed.email
  if (parsed.playwright_storage_state != null) {
    wire.playwright_storage_state = parsed.playwright_storage_state
  }
  const fromWire = Object.keys(wire).length ? wire : null
  if (parsed.credentials && fromWire) return { ...parsed.credentials, ...fromWire }
  return parsed.credentials ?? fromWire
}

export async function POST(req: Request) {
  const id = await requireBearer(req)
  if (!id) return apiError(401, 'unauthorized', 'missing or invalid bearer token')

  let parsed
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return apiError(400, 'invalid_request', 'malformed body')
  }

  const provider = resolveProvider(parsed)
  if (!provider) {
    return apiError(400, 'invalid_request', 'provider/slug must be one of: manual, github, npm, openai')
  }
  const credentials = resolveCredentials(parsed)

  let orgId: number
  try {
    if (parsed.dotenvx_project_id) {
      const { db } = getDb()
      const project = await db.query.projects.findFirst({
        where: eq(projects.dotenvxProjectId, parsed.dotenvx_project_id)
      })
      if (!project) return apiError(404, 'not_found')
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
    const denied = asAccessDenied(e)
    if (denied) return denied
    throw e
  }

  const allowed = await requireOwnerOrAdmin({ accountId: id.account.id, orgId })
  if (!allowed) return apiError(404, 'not_found')

  const connector = await recordConnector({
    orgId,
    provider,
    label: parsed.label ?? null,
    credentials
  })
  const rotation = await createRotationReference({ orgId, provider })

  if (id.device) await touchDevice(id.device.id)
  await recordAudit({
    orgId,
    accountId: id.account.id,
    deviceId: id.device?.id ?? null,
    kind: 'rotate.connect',
    payload: { provider, connector_id: connector.id, rot_uid: rotation.uid }
  })

  return json({ rot_uid: rotation.uid, uri: rotation.uri, provider: connector.provider })
}
