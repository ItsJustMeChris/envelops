// Keypair-scope isolation: every mint lands in the rotator's personal org,
// and a team invite never confers access to the inviter's (or invitee's)
// personal keys. The "rotations belong to the initiator" invariant.
//
// Service-layer only — no HTTP, no server. Run under the e2e config alongside
// the other suites:
//   rm -f data/envelops.db && npm run db:migrate
//   npx vitest run -c vitest.e2e.config.ts test/keypair-isolation.test.ts

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Single close at file scope — each describe shares the same cached db singleton
// (lib/db/client.ts caches on first getDb()), so closing mid-file would leave the
// second describe with a dead connection.
afterAll(() => {
  getDb().sqlite.close()
})

import { getDb } from '../lib/db/client'
import { findOrCreateAccountByEmail } from '../lib/services/accounts'
import { acceptInviteByAccount, createInvite } from '../lib/services/invites'
import { fetchOrMintKeypair } from '../lib/services/keystore'
import { personalOrgForAccount } from '../lib/services/teams'
import { accounts, keypairs, memberships, organizations } from '../lib/db/schema'

describe('keypair isolation: mints land in the rotator personal scope', () => {
  let jeffId = 0
  let johnId = 0
  let jeffPersonalOrgId = 0
  let johnPersonalOrgId = 0
  let jeffTeamOrgId = 0

  beforeAll(async () => {
    const suffix = Date.now()
    const jeff = await findOrCreateAccountByEmail(`jeff+kp-${suffix}@example.com`)
    const john = await findOrCreateAccountByEmail(`john+kp-${suffix}@example.com`)
    jeffId = jeff.id
    johnId = john.id

    const { db } = getDb()
    jeffPersonalOrgId = await personalOrgForAccount(jeffId)
    johnPersonalOrgId = await personalOrgForAccount(johnId)

    // Separate team org owned by jeff; john joins via an explicit invite.
    const teamRow = await db
      .insert(organizations)
      .values({ slug: `jeff-team-${suffix}`, name: 'jeff-team', provider: 'manual' })
      .returning()
    jeffTeamOrgId = teamRow[0].id
    await db
      .insert(memberships)
      .values({ accountId: jeffId, orgId: jeffTeamOrgId, role: 'owner' })

    const { url } = await createInvite({
      orgId: jeffTeamOrgId,
      email: john.email,
      role: 'member',
      invitedBy: jeffId
    })
    const token = new URL(url).searchParams.get('token')!
    const accepted = await acceptInviteByAccount(token, john)
    expect('error' in accepted).toBe(false)
  })

  it('jeff mint → keypair stored under jeff personal, never jeff-team', async () => {
    const kp = await fetchOrMintKeypair({ accountId: jeffId, publicKey: null })
    const { db } = getDb()
    const row = await db.query.keypairs.findFirst({
      where: eq(keypairs.publicKey, kp.public_key)
    })
    expect(row).toBeTruthy()
    expect(row!.orgId).toBe(jeffPersonalOrgId)
    expect(row!.orgId).not.toBe(jeffTeamOrgId)
    expect(row!.accountId).toBe(jeffId)
  })

  it('john mint (invited to jeff-team) → lands in john personal, not jeff-team', async () => {
    const kp = await fetchOrMintKeypair({ accountId: johnId, publicKey: null })
    const { db } = getDb()
    const row = await db.query.keypairs.findFirst({
      where: eq(keypairs.publicKey, kp.public_key)
    })
    expect(row).toBeTruthy()
    expect(row!.orgId).toBe(johnPersonalOrgId)
    expect(row!.orgId).not.toBe(jeffTeamOrgId)
    expect(row!.orgId).not.toBe(jeffPersonalOrgId)
    expect(row!.accountId).toBe(johnId)
  })

  it('jeff cannot fetch john personal pubkey — forbidden', async () => {
    const johnKp = await fetchOrMintKeypair({ accountId: johnId, publicKey: null })
    await expect(
      fetchOrMintKeypair({ accountId: jeffId, publicKey: johnKp.public_key })
    ).rejects.toThrow(/forbidden/)
  })

  it('john (in jeff-team) cannot fetch jeff personal pubkey — forbidden', async () => {
    const jeffKp = await fetchOrMintKeypair({ accountId: jeffId, publicKey: null })
    await expect(
      fetchOrMintKeypair({ accountId: johnId, publicKey: jeffKp.public_key })
    ).rejects.toThrow(/forbidden/)
  })

  it('owner can still read their own personal pubkey back', async () => {
    const minted = await fetchOrMintKeypair({ accountId: jeffId, publicKey: null })
    const again = await fetchOrMintKeypair({
      accountId: jeffId,
      publicKey: minted.public_key
    })
    expect(again.public_key).toBe(minted.public_key)
    expect(again.private_key).toBe(minted.private_key)
  })
})

describe('personalOrgForAccount: handle-rename edge case', () => {
  it('lazy-creates a fresh personal when account.username no longer matches any org slug', async () => {
    const suffix = Date.now()
    const acct = await findOrCreateAccountByEmail(`rename+kp-${suffix}@example.com`)
    const originalPersonalId = await personalOrgForAccount(acct.id)

    // Simulate the handle-rename edge: mutate username but leave the original
    // personal org slug untouched, and drop the account into a team so a naive
    // "any membership" fallback would land on that team. personalOrgForAccount
    // must refuse the team and create a new personal instead.
    const { db } = getDb()
    const teamRow = await db
      .insert(organizations)
      .values({ slug: `rename-team-${suffix}`, name: 'rename-team', provider: 'manual' })
      .returning()
    const teamOrgId = teamRow[0].id
    await db
      .insert(memberships)
      .values({ accountId: acct.id, orgId: teamOrgId, role: 'member' })

    const newHandle = `renamed-${suffix}`
    await db.update(accounts).set({ username: newHandle }).where(eq(accounts.id, acct.id))

    const strictOrgId = await personalOrgForAccount(acct.id)
    expect(strictOrgId).not.toBe(teamOrgId)
    expect(strictOrgId).not.toBe(originalPersonalId)

    const strictOrg = await db.query.organizations.findFirst({
      where: eq(organizations.id, strictOrgId)
    })
    expect(strictOrg?.slug.startsWith(newHandle)).toBe(true)

    const strictMembership = await db.query.memberships.findFirst({
      where: and(eq(memberships.accountId, acct.id), eq(memberships.orgId, strictOrgId))
    })
    expect(strictMembership?.role).toBe('owner')

    // And a subsequent mint uses the new personal — not the team, not the stale personal.
    const kp = await fetchOrMintKeypair({ accountId: acct.id, publicKey: null })
    const kpRow = await db.query.keypairs.findFirst({
      where: eq(keypairs.publicKey, kp.public_key)
    })
    expect(kpRow!.orgId).toBe(strictOrgId)
  })
})
