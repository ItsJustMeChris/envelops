import { and, eq, gt, isNull } from 'drizzle-orm'

import { getDb } from '../db/client'
import { accounts, oauthDeviceCodes, tokens, devices } from '../db/schema'
import {
  DEVICE_CODE_POLL_INTERVAL_SECONDS,
  DEVICE_CODE_TTL_SECONDS,
  baseUrl
} from '../config'
import { generateDeviceCode, generateUserCode, mintToken } from '../crypto/tokens'

export interface DeviceCodeResult {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

export async function createDeviceCode(input: {
  devicePublicKey: string
  systemInformation?: Record<string, unknown> | null
}): Promise<DeviceCodeResult> {
  const { db } = getDb()
  const deviceCode = generateDeviceCode()
  const userCode = generateUserCode()
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000)

  await db.insert(oauthDeviceCodes).values({
    deviceCode,
    userCode,
    devicePublicKey: input.devicePublicKey,
    systemInfo: input.systemInformation ?? null,
    expiresAt
  })

  const base = baseUrl()
  return {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${base}/login/device`,
    verification_uri_complete: `${base}/login/device?user_code=${userCode}`,
    expires_in: DEVICE_CODE_TTL_SECONDS,
    interval: DEVICE_CODE_POLL_INTERVAL_SECONDS
  }
}

export type PollOutcome =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'consumed' }
  | { status: 'authorized'; accessToken: string; accountId: number; username: string; fullUsername: string }

export async function redeemDeviceCode(deviceCode: string): Promise<PollOutcome> {
  const { db } = getDb()
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(oauthDeviceCodes)
      .where(eq(oauthDeviceCodes.deviceCode, deviceCode))
      .get()
    if (!row) return { status: 'expired' } satisfies PollOutcome
    if (row.consumedAt) return { status: 'consumed' } satisfies PollOutcome
    if (row.expiresAt.getTime() < Date.now()) return { status: 'expired' } satisfies PollOutcome
    if (!row.accountId || !row.approvedAt) return { status: 'pending' } satisfies PollOutcome

    const account = tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, row.accountId))
      .get()
    if (!account) return { status: 'expired' } satisfies PollOutcome

    // Claim the device code before minting anything. Only one poller can flip
    // consumed_at from null -> timestamp; losers observe `consumed`.
    const claimed = tx
      .update(oauthDeviceCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(oauthDeviceCodes.id, row.id),
          eq(oauthDeviceCodes.accountId, row.accountId),
          eq(oauthDeviceCodes.approvedAt, row.approvedAt),
          isNull(oauthDeviceCodes.consumedAt),
          gt(oauthDeviceCodes.expiresAt, new Date())
        )
      )
      .run()
    if (claimed.changes !== 1) return { status: 'consumed' } satisfies PollOutcome

    const existingDevice = tx
      .select()
      .from(devices)
      .where(and(eq(devices.accountId, row.accountId), eq(devices.publicKey, row.devicePublicKey)))
      .get()

    let deviceId: number
    if (existingDevice) {
      tx
        .update(devices)
        .set({ lastSeenAt: new Date(), systemInfo: row.systemInfo ?? existingDevice.systemInfo })
        .where(eq(devices.id, existingDevice.id))
        .run()
      deviceId = existingDevice.id
    } else {
      const inserted = tx
        .insert(devices)
        .values({
          accountId: row.accountId,
          publicKey: row.devicePublicKey,
          systemInfo: row.systemInfo ?? null,
          lastSeenAt: new Date()
        })
        .returning({ id: devices.id })
        .all()
      deviceId = inserted[0].id
    }

    const { plaintext, hash } = mintToken()
    tx.insert(tokens)
      .values({
        accountId: row.accountId,
        deviceId,
        tokenHash: hash,
        scope: 'cli'
      })
      .run()

    return {
      status: 'authorized',
      accessToken: plaintext,
      accountId: account.id,
      username: account.username,
      fullUsername: account.fullUsername
    } satisfies PollOutcome
  })
}

export async function findPendingDeviceCodeByUserCode(userCode: string) {
  const { db } = getDb()
  return db.query.oauthDeviceCodes.findFirst({
    where: and(
      eq(oauthDeviceCodes.userCode, userCode),
      isNull(oauthDeviceCodes.approvedAt),
      isNull(oauthDeviceCodes.consumedAt),
      gt(oauthDeviceCodes.expiresAt, new Date())
    )
  })
}

export async function approveDeviceCode(id: number, accountId: number): Promise<boolean> {
  const { db } = getDb()
  const result = await db
    .update(oauthDeviceCodes)
    .set({ accountId, approvedAt: new Date() })
    .where(
      and(
        eq(oauthDeviceCodes.id, id),
        isNull(oauthDeviceCodes.approvedAt),
        isNull(oauthDeviceCodes.consumedAt),
        gt(oauthDeviceCodes.expiresAt, new Date())
      )
    )
  return result.changes === 1
}
