import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'

import { getDb } from '../db/client'
import { memberships, organizations, projects, type Project } from '../db/schema'
import { primaryOrgForAccount } from './teams'

function generateProjectId(): string {
  // dotenvx URIs in observed traffic use `<prefix>_<hex>` — keep that shape for projects too.
  return `prj_${randomBytes(16).toString('hex')}`
}

export async function resolveOrCreateProject(input: {
  accountId: number
  dotenvxProjectId?: string | null
  orgSlug?: string | null
  cwdName?: string | null
}): Promise<Project> {
  const { db } = getDb()

  if (input.dotenvxProjectId) {
    const existing = await db.query.projects.findFirst({
      where: eq(projects.dotenvxProjectId, input.dotenvxProjectId)
    })
    if (existing) {
      await assertMember(input.accountId, existing.orgId)
      return existing
    }
  }

  // Need an org. Prefer explicit slug; fall back to caller's primary (personal team).
  const orgId = input.orgSlug
    ? await orgIdForAccountBySlug(input.accountId, input.orgSlug)
    : await primaryOrgForAccount(input.accountId)

  const inserted = await db
    .insert(projects)
    .values({
      orgId,
      dotenvxProjectId: input.dotenvxProjectId ?? generateProjectId(),
      name: input.cwdName ?? null
    })
    .returning()
  return inserted[0]
}

async function orgIdForAccountBySlug(accountId: number, slug: string): Promise<number> {
  const { db } = getDb()
  const row = await db
    .select({ id: organizations.id })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(and(eq(memberships.accountId, accountId), eq(organizations.slug, slug)))
    .limit(1)
  if (!row[0]) throw new Error(`forbidden: not a member of org ${slug}`)
  return row[0].id
}

async function assertMember(accountId: number, orgId: number): Promise<void> {
  const { db } = getDb()
  const row = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, accountId), eq(memberships.orgId, orgId))
  })
  if (!row) throw new Error('forbidden')
}

export function projectDisplayName(p: Project): string {
  return p.name && p.name.length > 0 ? p.name : p.dotenvxProjectId
}
