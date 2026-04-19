import { cookies } from 'next/headers'
import { randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'

import { getDb } from '../db/client'
import { loginLinks, sessions, type Account } from '../db/schema'
import { hashToken } from '../crypto/tokens'
import { baseUrl } from '../config'
import { findOrCreateAccountByEmail } from './accounts'
import { emailEnabled, sendEmail } from './email'

const SESSION_COOKIE = 'osops_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days
const LINK_TTL_MS = 1000 * 60 * 20 // 20 min

export async function requestLoginLink(email: string): Promise<{ url: string; expiresAt: Date }> {
  const { db } = getDb()
  const plaintext = randomBytes(24).toString('base64url')
  const tokenHash = hashToken(plaintext)
  const expiresAt = new Date(Date.now() + LINK_TTL_MS)

  await db.insert(loginLinks).values({
    email: email.toLowerCase().trim(),
    tokenHash,
    expiresAt
  })

  const url = `${baseUrl()}/login/verify?token=${plaintext}`
  if (emailEnabled()) {
    const result = await sendEmail({
      to: email,
      subject: 'Your envelops login link',
      text: `Sign in to envelops:\n\n${url}\n\nThis link expires in 20 minutes. If you did not request it, ignore this email.`
    })
    if (!result.sent) {
      // Fall back to logs so the operator can still recover the link if Mailgun rejects.
      console.log(`[envelops] email send failed (${result.error}); login link for ${email}: ${url}`)
    }
  } else {
    console.log(`[envelops] login link for ${email}: ${url}`)
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
  const account = await findOrCreateAccountByEmail(row.email)
  await issueSession(account.id)
  return account
}

export async function issueSession(accountId: number): Promise<void> {
  const { db } = getDb()
  const plaintext = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(plaintext)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

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
