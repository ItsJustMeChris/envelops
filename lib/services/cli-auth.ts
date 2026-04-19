import { and, eq, gt, isNull } from 'drizzle-orm'

import { getDb } from '../db/client'
import { accounts, devices, tokens, type Account, type Device, type Token } from '../db/schema'
import { hashToken } from '../crypto/tokens'
import { clientIp } from '../http/client-ip'
import { rateLimit, rateLimitPeek } from '../http/rate-limit'

export interface BearerIdentity {
  account: Account
  token: Token
  device: Device | null
}

// Token hashes are indexed (constant-time lookup), but an attacker with a pile
// of stolen / guessed candidates can still fire them at the API. Cap *failed*
// attempts per source IP so an automated sprayer hits a wall well before
// completing any meaningful search. Successful bearers never charge the bucket,
// so a busy legitimate CLI isn't affected.
const BEARER_FAIL_LIMIT = 30
const BEARER_FAIL_WINDOW_MS = 60_000

export async function requireBearer(req: Request): Promise<BearerIdentity | null> {
  const ip = await clientIp()
  const canBucketBySource = ip !== 'unknown'
  const failKey = `bearer-fail:${ip}`
  const failOpts = { limit: BEARER_FAIL_LIMIT, windowMs: BEARER_FAIL_WINDOW_MS }

  if (canBucketBySource && !rateLimitPeek(failKey, failOpts).allowed) return null

  const identity = await lookupBearer(req)
  if (!identity && canBucketBySource) rateLimit(failKey, failOpts)
  return identity
}

async function lookupBearer(req: Request): Promise<BearerIdentity | null> {
  const header = req.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const plaintext = match[1]
  const tokenHash = hashToken(plaintext)

  const { db } = getDb()
  const tokenRow = await db.query.tokens.findFirst({
    where: and(
      eq(tokens.tokenHash, tokenHash),
      isNull(tokens.revokedAt)
    )
  })
  if (!tokenRow) return null
  if (tokenRow.expiresAt && tokenRow.expiresAt.getTime() < Date.now()) return null

  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, tokenRow.accountId) })
  if (!account) return null

  const device = tokenRow.deviceId
    ? (await db.query.devices.findFirst({ where: eq(devices.id, tokenRow.deviceId) })) ?? null
    : null

  return { account, token: tokenRow, device }
}

export async function revokeToken(tokenId: number): Promise<void> {
  const { db } = getDb()
  await db.update(tokens).set({ revokedAt: new Date() }).where(eq(tokens.id, tokenId))
}

export async function touchDevice(deviceId: number): Promise<void> {
  const { db } = getDb()
  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(devices.id, deviceId), gt(devices.id, 0)))
}
