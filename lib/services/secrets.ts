import { eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { secrets, type Secret } from '../db/schema'
import { decryptWithMaster, encryptWithMaster } from '../crypto/master-key'

export async function setSecret(input: {
  orgId: number
  projectId?: number | null
  uri: string
  value: string
}): Promise<Secret> {
  const { db } = getDb()
  const enc = encryptWithMaster(input.value)
  // The SELECT + UPDATE/INSERT must be atomic so two concurrent writers can't
  // both observe the same pre-image and race to overwrite each other (and, in
  // the worst case, relabel an existing secret with a different orgId).
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(secrets)
      .where(eq(secrets.uri, input.uri))
      .get()

    if (existing) {
      if (existing.orgId !== input.orgId) {
        throw new Error('forbidden: secret belongs to another org')
      }
      const updated = tx
        .update(secrets)
        .set({
          projectId: input.projectId ?? existing.projectId,
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
        projectId: input.projectId ?? null,
        uri: input.uri,
        encryptedValue: enc.ciphertext,
        masterKeyId: enc.masterKeyId
      })
      .returning()
      .all()
    return inserted[0]
  })
}

export async function getSecretValue(
  uri: string
): Promise<{ value: string; orgId: number; projectId: number | null } | null> {
  const { db } = getDb()
  const row = await db.query.secrets.findFirst({ where: eq(secrets.uri, uri) })
  if (!row) return null
  const plaintext = Buffer.from(decryptWithMaster(row.encryptedValue)).toString('utf8')
  return { value: plaintext, orgId: row.orgId, projectId: row.projectId }
}

export async function listSecretsForOrg(orgId: number): Promise<Secret[]> {
  const { db } = getDb()
  return db.select().from(secrets).where(eq(secrets.orgId, orgId)).orderBy(secrets.updatedAt)
}
