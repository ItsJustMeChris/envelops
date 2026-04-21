import { and, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { secrets, type Secret } from '../db/schema'
import { decryptWithMaster, encryptWithMaster } from '../crypto/master-key'

export async function setSecret(input: {
  orgId: number
  uri: string
  key: string
  value: string
}): Promise<Secret> {
  const { db } = getDb()
  const enc = encryptWithMaster(input.value)
  // The SELECT + UPDATE/INSERT must be atomic so two concurrent writers can't
  // both observe the same pre-image and race to overwrite each other. Lookup
  // is by (orgId, key) — the `uri` column is the caller's verbatim string
  // (for display/copy), not a lookup identifier.
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(secrets)
      .where(and(eq(secrets.orgId, input.orgId), eq(secrets.key, input.key)))
      .get()

    if (existing) {
      const updated = tx
        .update(secrets)
        .set({
          uri: input.uri,
          encryptedValue: enc.ciphertext,
          masterKeyId: enc.masterKeyId,
          updatedAt: new Date()
        })
        .where(eq(secrets.id, existing.id))
        .returning()
        .all()
      return updated[0]
    }

    const inserted = tx
      .insert(secrets)
      .values({
        orgId: input.orgId,
        uri: input.uri,
        key: input.key,
        encryptedValue: enc.ciphertext,
        masterKeyId: enc.masterKeyId
      })
      .returning()
      .all()
    return inserted[0]
  })
}

export async function getSecretValue(input: {
  orgId: number
  key: string
}): Promise<{ value: string; orgId: number } | null> {
  const { db } = getDb()
  const row = await db.query.secrets.findFirst({
    where: and(eq(secrets.orgId, input.orgId), eq(secrets.key, input.key))
  })
  if (!row) return null
  const plaintext = Buffer.from(decryptWithMaster(row.encryptedValue)).toString('utf8')
  return { value: plaintext, orgId: row.orgId }
}

export async function listSecretsForOrg(orgId: number): Promise<Secret[]> {
  const { db } = getDb()
  return db.select().from(secrets).where(eq(secrets.orgId, orgId)).orderBy(secrets.updatedAt)
}
