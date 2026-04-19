import { and, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { accounts, memberships, organizations } from '../db/schema'
import { firstAvailableSlug } from './funky-name'

/**
 * Return the caller's personal org — the one seeded at account creation with
 * `slug === account.username`. This is the single source of truth for "which
 * org does this account belong to by default" — used for project routing,
 * keypair mints, and the `/panel` landing redirect.
 *
 * Lazy-creates a personal under the current username on the handle-rename
 * edge (account.username diverges from any owned org slug). We refuse to
 * fall back to a team membership here: routing a mint or a new project into
 * a shared org would silently break the isolation the `.username === slug`
 * personal is meant to provide.
 */
export async function personalOrgForAccount(accountId: number): Promise<number> {
  const { db } = getDb()
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) })
  if (!account) throw new Error('account not found')

  const hit = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(
      and(eq(memberships.accountId, accountId), eq(organizations.slug, account.username))
    )
    .limit(1)
  if (hit[0]) return hit[0].orgId

  const slug = await firstAvailableSlug(account.username, async (candidate) => {
    const hit = await db.query.organizations.findFirst({
      where: eq(organizations.slug, candidate)
    })
    return Boolean(hit)
  })
  const inserted = await db
    .insert(organizations)
    .values({
      slug,
      name: account.username,
      contactEmail: account.email,
      provider: 'manual'
    })
    .returning()
  await db
    .insert(memberships)
    .values({ accountId, orgId: inserted[0].id, role: 'owner' })
  return inserted[0].id
}
