import { and, asc, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { accounts, memberships, organizations } from '../db/schema'

/**
 * Pick the org used as a default for actions that don't specify one (like
 * `dotenvx encrypt` hitting `/api/keypair` with no project id).
 *
 * Matches commercial dotenvx-ops behaviour: always the caller's personal team,
 * identified by `organizations.slug === accounts.username`. Without this guard,
 * a user who belongs to multiple teams could land their armored key in some
 * other team purely by insertion order.
 *
 * Falls back to the caller's earliest-joined membership only if no slug match
 * is found — covers the edge case where the username was changed after the
 * personal org was created (e.g. GitHub-oauth rename).
 */
export async function primaryOrgForAccount(accountId: number): Promise<number> {
  const { db } = getDb()
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) })
  if (!account) throw new Error('account not found')

  const personal = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(
      and(eq(memberships.accountId, accountId), eq(organizations.slug, account.username))
    )
    .limit(1)
  if (personal[0]) return personal[0].orgId

  const anyMembership = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .orderBy(asc(memberships.createdAt), asc(memberships.id))
    .limit(1)
  if (!anyMembership[0]) throw new Error('account has no organization')
  return anyMembership[0].orgId
}
