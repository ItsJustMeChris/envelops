import { and, eq, gt, isNull } from 'drizzle-orm'

import { getDb } from '../db/client'
import { accounts, devices, tokens, type Account, type Device, type Token } from '../db/schema'
import { hashToken } from '../crypto/tokens'

export interface BearerIdentity {
  account: Account
  token: Token
  device: Device | null
}

export async function requireBearer(req: Request): Promise<BearerIdentity | null> {
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
