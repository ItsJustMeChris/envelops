import { and, eq, isNull } from 'drizzle-orm'

import { getDb } from '../db/client'
import { oauthDeviceCodes, tokens, devices } from '../db/schema'
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
  const row = await db.query.oauthDeviceCodes.findFirst({
    where: eq(oauthDeviceCodes.deviceCode, deviceCode)
  })
  if (!row) return { status: 'expired' }
  if (row.consumedAt) return { status: 'consumed' }
  if (row.expiresAt.getTime() < Date.now()) return { status: 'expired' }
  if (!row.accountId || !row.approvedAt) return { status: 'pending' }

  const account = await db.query.accounts.findFirst({ where: (a, { eq }) => eq(a.id, row.accountId!) })
  if (!account) return { status: 'expired' }

  // Upsert device for this account + pubkey.
  const existingDevice = await db.query.devices.findFirst({
    where: and(eq(devices.accountId, row.accountId), eq(devices.publicKey, row.devicePublicKey))
  })
  let deviceId: number
  if (existingDevice) {
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(), systemInfo: row.systemInfo ?? existingDevice.systemInfo })
      .where(eq(devices.id, existingDevice.id))
    deviceId = existingDevice.id
  } else {
    const inserted = await db
      .insert(devices)
      .values({
        accountId: row.accountId,
        publicKey: row.devicePublicKey,
        systemInfo: row.systemInfo ?? null,
        lastSeenAt: new Date()
      })
      .returning({ id: devices.id })
    deviceId = inserted[0].id
  }

  const { plaintext, hash } = mintToken()
  await db.insert(tokens).values({
    accountId: row.accountId,
    deviceId,
    tokenHash: hash,
    scope: 'cli'
  })

  await db
    .update(oauthDeviceCodes)
    .set({ consumedAt: new Date() })
    .where(eq(oauthDeviceCodes.id, row.id))

  return {
    status: 'authorized',
    accessToken: plaintext,
    accountId: account.id,
    username: account.username,
    fullUsername: account.fullUsername
  }
}

export async function findPendingDeviceCodeByUserCode(userCode: string) {
  const { db } = getDb()
  return db.query.oauthDeviceCodes.findFirst({
    where: and(eq(oauthDeviceCodes.userCode, userCode), isNull(oauthDeviceCodes.consumedAt))
  })
}

export async function approveDeviceCode(id: number, accountId: number) {
  const { db } = getDb()
  await db
    .update(oauthDeviceCodes)
    .set({ accountId, approvedAt: new Date() })
    .where(eq(oauthDeviceCodes.id, id))
}
