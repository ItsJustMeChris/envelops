import { and, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { keypairs, memberships, type Keypair } from '../db/schema'
import { encryptWithMaster, decryptWithMaster } from '../crypto/master-key'
import { generateKeypair, isCompressedPublicKey } from '../crypto/keypair'
import { personalOrgForAccount } from './teams'

export interface KeypairResult {
  public_key: string
  private_key: string
  orgId: number
  action: 'mint' | 'fetch'
}

export async function fetchOrMintKeypair(input: {
  accountId: number
  publicKey?: string | null
}): Promise<KeypairResult> {
  const { db } = getDb()

  // Fetch existing by pubkey — caller must still have a membership that covers the keypair's org.
  if (input.publicKey && isCompressedPublicKey(input.publicKey)) {
    const row = await db.query.keypairs.findFirst({
      where: eq(keypairs.publicKey, input.publicKey)
    })
    if (row) {
      await assertAccountCanAccessOrg(input.accountId, row.orgId)
      const priv = decryptWithMaster(row.encryptedPrivateKey)
      return {
        public_key: row.publicKey,
        private_key: Buffer.from(priv).toString('utf8'),
        orgId: row.orgId,
        action: 'fetch'
      }
    }
    // Fall through: caller passed a pubkey we've never seen. Mint a new one rather than error;
    // matches the observed commercial behavior where the server always produces a usable keypair.
  }

  const orgId = await personalOrgForAccount(input.accountId)
  const kp = generateKeypair()
  const enc = encryptWithMaster(kp.privateKey)
  await db.insert(keypairs).values({
    orgId,
    accountId: input.accountId,
    publicKey: kp.publicKey,
    encryptedPrivateKey: enc.ciphertext,
    masterKeyId: enc.masterKeyId
  })
  return {
    public_key: kp.publicKey,
    private_key: kp.privateKey,
    orgId,
    action: 'mint'
  }
}

async function assertAccountCanAccessOrg(accountId: number, orgId: number): Promise<void> {
  const { db } = getDb()
  const row = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, accountId), eq(memberships.orgId, orgId))
  })
  if (!row) throw new Error('forbidden: caller is not a member of the keypair owning organization')
}

export async function listKeypairsForOrg(orgId: number): Promise<Array<Pick<Keypair, 'id' | 'publicKey' | 'createdAt' | 'encryptedPrivateKey'>>> {
  const { db } = getDb()
  return db
    .select({
      id: keypairs.id,
      publicKey: keypairs.publicKey,
      createdAt: keypairs.createdAt,
      encryptedPrivateKey: keypairs.encryptedPrivateKey
    })
    .from(keypairs)
    .where(eq(keypairs.orgId, orgId))
    .orderBy(keypairs.id)
}

export function unsealPrivateKey(encryptedPrivateKey: string): string {
  return Buffer.from(decryptWithMaster(encryptedPrivateKey)).toString('utf8')
}
