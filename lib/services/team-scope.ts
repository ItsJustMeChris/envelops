import { and, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { memberships, organizations, type Organization } from '../db/schema'

export async function resolveTeamForAccount(input: {
  accountId: number
  slug: string
}): Promise<{ org: Organization; role: string } | null> {
  const { db } = getDb()
  const row = await db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(and(eq(memberships.accountId, input.accountId), eq(organizations.slug, input.slug)))
    .limit(1)
  if (!row[0]) return null
  return { org: row[0].org, role: row[0].role }
}
