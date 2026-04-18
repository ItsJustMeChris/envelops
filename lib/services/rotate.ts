import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { rotationConnectors, rotations, type Rotation, type RotationConnector } from '../db/schema'
import { encryptWithMaster } from '../crypto/master-key'
import { setSecret } from './secrets'

function newRotUid(): string {
  return `rot_${randomBytes(16).toString('hex')}`
}

export async function rotateByUri(input: {
  orgId: number
  uri: string
  newValue?: string | null
}): Promise<{ url: string; rotUid: string; uri: string }> {
  const { db } = getDb()
  const match = input.uri.match(/^dotenvx:\/\/(rot_[0-9a-fA-F]+)$/)
  if (!match) throw new Error('uri must be dotenvx://rot_<hex>')
  const uid = match[1]

  const existing = await db.query.rotations.findFirst({ where: eq(rotations.uid, uid) })
  if (existing && existing.orgId !== input.orgId) throw new Error('forbidden: rotation belongs to another org')

  if (input.newValue != null) {
    await setSecret({ orgId: input.orgId, uri: input.uri, value: input.newValue })
  }

  const row = existing
    ? (await db
        .update(rotations)
        .set({ lastRotatedAt: new Date() })
        .where(eq(rotations.id, existing.id))
        .returning())[0]
    : (await db
        .insert(rotations)
        .values({ orgId: input.orgId, uid, uri: input.uri, lastRotatedAt: new Date() })
        .returning())[0]

  return { url: `dotenvx://${row.uid}`, rotUid: row.uid, uri: row.uri }
}

export async function createRotationReference(input: {
  orgId: number
  provider: 'manual' | 'github' | 'npm' | 'openai'
}): Promise<{ uid: string; uri: string }> {
  const { db } = getDb()
  const uid = newRotUid()
  const uri = `dotenvx://${uid}`
  const connector = await db.query.rotationConnectors.findFirst({
    where: and(eq(rotationConnectors.orgId, input.orgId), eq(rotationConnectors.provider, input.provider))
  })
  await db.insert(rotations).values({
    orgId: input.orgId,
    uid,
    uri,
    connectorId: connector?.id ?? null
  })
  return { uid, uri }
}

export async function recordConnector(input: {
  orgId: number
  provider: 'manual' | 'github' | 'npm' | 'openai'
  label?: string | null
  credentials?: Record<string, unknown> | null
}): Promise<RotationConnector> {
  const { db } = getDb()
  let encryptedCredentials: string | null = null
  let masterKeyId: string | null = null
  if (input.credentials) {
    const enc = encryptWithMaster(JSON.stringify(input.credentials))
    encryptedCredentials = enc.ciphertext
    masterKeyId = enc.masterKeyId
  }

  const existing = await db.query.rotationConnectors.findFirst({
    where: and(eq(rotationConnectors.orgId, input.orgId), eq(rotationConnectors.provider, input.provider))
  })
  if (existing) {
    const updated = await db
      .update(rotationConnectors)
      .set({
        label: input.label ?? existing.label,
        encryptedCredentials,
        masterKeyId
      })
      .where(eq(rotationConnectors.id, existing.id))
      .returning()
    return updated[0]
  }

  const inserted = await db
    .insert(rotationConnectors)
    .values({
      orgId: input.orgId,
      provider: input.provider,
      label: input.label ?? null,
      encryptedCredentials,
      masterKeyId
    })
    .returning()
  return inserted[0]
}

export async function listRotationsForOrg(orgId: number): Promise<Rotation[]> {
  const { db } = getDb()
  return db.select().from(rotations).where(eq(rotations.orgId, orgId)).orderBy(rotations.createdAt)
}

export async function listConnectorsForOrg(orgId: number): Promise<RotationConnector[]> {
  const { db } = getDb()
  return db.select().from(rotationConnectors).where(eq(rotationConnectors.orgId, orgId))
}
