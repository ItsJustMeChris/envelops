import { eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { accounts, memberships, organizations, type Account, type Organization } from '../db/schema'

function normalizeUsername(email: string): string {
  const base = email.split('@')[0] ?? email
  return base.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40) || 'user'
}

async function uniqueSlug(db: ReturnType<typeof getDb>['db'], desired: string): Promise<string> {
  let slug = desired
  let suffix = 1
  while (true) {
    const existing = await db.query.organizations.findFirst({ where: eq(organizations.slug, slug) })
    if (!existing) return slug
    slug = `${desired}-${++suffix}`
  }
}

export async function findOrCreateAccountByEmail(email: string): Promise<Account> {
  const { db } = getDb()
  const normalized = email.toLowerCase().trim()
  const existing = await db.query.accounts.findFirst({ where: eq(accounts.email, normalized) })
  if (existing) return existing

  const baseUsername = normalizeUsername(normalized)
  let username = baseUsername
  let suffix = 1
  while (await db.query.accounts.findFirst({ where: eq(accounts.username, username) })) {
    username = `${baseUsername}-${++suffix}`
  }

  const inserted = await db
    .insert(accounts)
    .values({
      email: normalized,
      username,
      fullUsername: `local/${username}`,
      provider: 'local'
    })
    .returning()

  const account = inserted[0]
  await ensurePersonalOrg(account)
  return account
}

export async function ensurePersonalOrg(account: Account): Promise<void> {
  const { db } = getDb()
  const anyMembership = await db.query.memberships.findFirst({
    where: eq(memberships.accountId, account.id)
  })
  if (anyMembership) return

  const slug = await uniqueSlug(db, account.username)
  const orgRow = await db
    .insert(organizations)
    .values({ slug, name: account.username, contactEmail: account.email, provider: 'manual' })
    .returning()
  await db.insert(memberships).values({ accountId: account.id, orgId: orgRow[0].id, role: 'owner' })
}

export async function listAccountOrganizations(
  accountId: number
): Promise<Array<Pick<Organization, 'id' | 'slug' | 'provider'> & { role: string }>> {
  const { db } = getDb()
  const rows = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      provider: organizations.provider,
      role: memberships.role
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.accountId, accountId))
  return rows
}
