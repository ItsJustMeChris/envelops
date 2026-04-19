import { cookies } from 'next/headers'
import { randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'

import { getDb } from '../db/client'
import { accounts, loginLinks, sessions, type Account } from '../db/schema'
import { hashToken } from '../crypto/tokens'
import { baseUrl } from '../config'
import { findOrCreateAccountByEmail } from './accounts'
import { emailEnabled, sendEmail } from './email'
import { isSafeLocalPath } from '../http/safe-redirect'

const SESSION_COOKIE = 'envelops_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days
const LINK_TTL_MS = 1000 * 60 * 20 // 20 min

export class MagicLinkProviderConflict extends Error {
  constructor() {
    super('magic_link_provider_conflict')
    this.name = 'MagicLinkProviderConflict'
  }
}

export async function requestLoginLink(
  email: string,
  options?: { next?: string }
): Promise<{ url: string; expiresAt: Date }> {
  const { db } = getDb()
  const normalized = email.toLowerCase().trim()
  const plaintext = randomBytes(24).toString('base64url')
  const tokenHash = hashToken(plaintext)
  const expiresAt = new Date(Date.now() + LINK_TTL_MS)

  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.email, normalized)
  })
  if (existing && existing.provider !== 'local') {
    return { url: '', expiresAt }
  }

  await db.insert(loginLinks).values({
    email: normalized,
    tokenHash,
    expiresAt
  })

  const nextParam = isSafeLocalPath(options?.next) ? `&next=${encodeURIComponent(options!.next!)}` : ''
  const url = `${baseUrl()}/login/verify?token=${plaintext}${nextParam}`
  if (emailEnabled()) {
    await sendEmail({
      to: email,
      subject: 'Your envelops login link',
      text: `Sign in to envelops:\n\n${url}\n\nThis link expires in 20 minutes. If you did not request it, ignore this email.`
    })
  }
  return { url, expiresAt }
}

export async function consumeLoginLink(plaintext: string): Promise<Account | null> {
  const { db } = getDb()
  const tokenHash = hashToken(plaintext)
  const row = await db.query.loginLinks.findFirst({ where: eq(loginLinks.tokenHash, tokenHash) })
  if (!row) return null
  if (row.consumedAt) return null
  if (row.expiresAt.getTime() < Date.now()) return null

  await db.update(loginLinks).set({ consumedAt: new Date() }).where(eq(loginLinks.id, row.id))

  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.email, row.email.toLowerCase())
  })
  if (existing && existing.provider !== 'local') {
    throw new MagicLinkProviderConflict()
  }

  if (existing) {
    await issueSession(existing.id)
    return existing
  }

  const account = await findOrCreateAccountByEmail(row.email)
  await issueSession(account.id)
  return account
}

export async function issueSession(accountId: number): Promise<void> {
  const { db } = getDb()
  const plaintext = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(plaintext)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  // Rotate: invalidate prior sessions for this account so a re-auth revokes any
  // cookies that may have been captured before the user chose to sign in again.
  await db.delete(sessions).where(eq(sessions.accountId, accountId))
  await db.insert(sessions).values({ accountId, tokenHash, expiresAt })

  const store = await cookies()
  store.set(SESSION_COOKIE, plaintext, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt
  })
}

export async function currentAccount(): Promise<Account | null> {
  const { db } = getDb()
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (!raw) return null
  const tokenHash = hashToken(raw)
  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()))
  })
  if (!row) return null
  return (await db.query.accounts.findFirst({ where: (a, { eq }) => eq(a.id, row.accountId) })) ?? null
}

export async function endSession(): Promise<void> {
  const { db } = getDb()
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (raw) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)))
  }
  store.delete(SESSION_COOKIE)
}
