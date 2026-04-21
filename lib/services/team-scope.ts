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

export function isAdminRole(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

// Route every panel render of a public key through this guard, even inside
// views that are already role-gated, so an accidentally-leaked path still
// truncates for non-admins.
export function roleBasedPublicKey(fullKey: string, role: string): string {
  return isAdminRole(role) ? fullKey : `${fullKey.slice(0, 10)}…`
}
