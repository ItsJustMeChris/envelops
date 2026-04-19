import { randomBytes } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'

import { getDb } from '../db/client'
import { accounts, invites, memberships, organizations, type Account, type Invite } from '../db/schema'
import { hashToken } from '../crypto/tokens'
import { baseUrl } from '../config'

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

function normalizeGithub(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase()
}

export function inviteSubjectLabel(invite: Pick<Invite, 'email' | 'githubUsername'>): string {
  if (invite.email && invite.githubUsername) return `${invite.email} / @${invite.githubUsername}`
  if (invite.email) return invite.email
  if (invite.githubUsername) return `@${invite.githubUsername}`
  return 'unknown'
}

export async function createInvite(input: {
  orgId: number
  email?: string | null
  githubUsername?: string | null
  role: 'owner' | 'admin' | 'member'
  invitedBy: number
}): Promise<{ invite: Invite; url: string }> {
  const email = input.email ? input.email.toLowerCase().trim() : null
  const githubUsername = input.githubUsername ? normalizeGithub(input.githubUsername) : null
  if (!email && !githubUsername) throw new Error('invite_requires_identifier')

  const { db } = getDb()
  const plaintext = randomBytes(24).toString('base64url')
  const tokenHash = hashToken(plaintext)

  const inserted = await db
    .insert(invites)
    .values({
      orgId: input.orgId,
      email,
      githubUsername,
      role: input.role,
      tokenHash,
      invitedBy: input.invitedBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS)
    })
    .returning()

  const url = `${baseUrl()}/invites/accept?token=${plaintext}`
  return { invite: inserted[0], url }
}

export async function listActiveInvitesForOrg(orgId: number): Promise<Invite[]> {
  const { db } = getDb()
  return db
    .select()
    .from(invites)
    .where(and(eq(invites.orgId, orgId), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
    .orderBy(desc(invites.createdAt))
}

export async function revokeInvite(input: { orgId: number; inviteId: number }): Promise<void> {
  const { db } = getDb()
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, input.inviteId), eq(invites.orgId, input.orgId)))
}

export async function inspectInvite(plaintext: string): Promise<{
  invite: Invite
  org: { id: number; slug: string; name: string | null }
} | null> {
  const { db } = getDb()
  const row = await db.query.invites.findFirst({
    where: eq(invites.tokenHash, hashToken(plaintext))
  })
  if (!row) return null
  if (row.revokedAt || row.acceptedAt) return null
  if (row.expiresAt.getTime() < Date.now()) return null
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, row.orgId) })
  if (!org) return null
  return { invite: row, org: { id: org.id, slug: org.slug, name: org.name } }
}

/**
 * Accept via an active session: the invitee is already authenticated (email-link
 * or GitHub). Grants membership when their email matches `invite.email` OR their
 * GitHub handle matches `invite.github_username`.
 */
export async function acceptInviteByAccount(
  plaintext: string,
  account: Account
): Promise<{ accountId: number; orgId: number; orgSlug: string } | { error: string }> {
  const inspection = await inspectInvite(plaintext)
  if (!inspection) return { error: 'invite_invalid' }
  const { invite } = inspection

  const emailMatch = Boolean(invite.email && invite.email === account.email.toLowerCase())
  const ghMatch = Boolean(
    invite.githubUsername &&
      account.fullUsername.toLowerCase() === `gh/${invite.githubUsername.toLowerCase()}`
  )
  if (!emailMatch && !ghMatch) return { error: 'invite_identity_mismatch' }

  return finaliseAccept(invite.id, account, invite.orgId, invite.role)
}

async function finaliseAccept(
  inviteId: number,
  account: Account,
  orgId: number,
  role: 'owner' | 'admin' | 'member'
): Promise<{ accountId: number; orgId: number; orgSlug: string }> {
  const { db } = getDb()
  const existing = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, account.id), eq(memberships.orgId, orgId))
  })
  if (!existing) {
    await db.insert(memberships).values({ accountId: account.id, orgId, role })
  }
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inviteId))
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) })
  return { accountId: account.id, orgId, orgSlug: org!.slug }
}

export async function getMemberRole(input: {
  accountId: number
  orgId: number
}): Promise<'owner' | 'admin' | 'member' | null> {
  const { db } = getDb()
  const row = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, input.accountId), eq(memberships.orgId, input.orgId))
  })
  return row ? row.role : null
}

export async function requireOwnerOrAdmin(input: {
  accountId: number
  orgId: number
}): Promise<boolean> {
  const role = await getMemberRole(input)
  return role === 'owner' || role === 'admin'
}

export async function requireOwner(input: {
  accountId: number
  orgId: number
}): Promise<boolean> {
  return (await getMemberRole(input)) === 'owner'
}

/**
 * Enforces the promotion rule: only team owners can mint new admins or owners.
 * Admins may still invite plain members, but they can't grow the leadership ranks.
 */
export async function canInviteWithRole(input: {
  actorId: number
  orgId: number
  targetRole: 'owner' | 'admin' | 'member'
}): Promise<boolean> {
  const actorRole = await getMemberRole({ accountId: input.actorId, orgId: input.orgId })
  if (!actorRole) return false
  if (input.targetRole === 'member') return actorRole === 'owner' || actorRole === 'admin'
  // Admin or owner target — only owners can issue.
  return actorRole === 'owner'
}

export interface MemberRow {
  accountId: number
  email: string
  username: string
  role: 'owner' | 'admin' | 'member'
}

export async function listMembers(orgId: number): Promise<MemberRow[]> {
  const { db } = getDb()
  const rows = await db
    .select({
      accountId: accounts.id,
      email: accounts.email,
      username: accounts.username,
      role: memberships.role
    })
    .from(memberships)
    .innerJoin(accounts, eq(memberships.accountId, accounts.id))
    .where(eq(memberships.orgId, orgId))
  return rows as MemberRow[]
}
