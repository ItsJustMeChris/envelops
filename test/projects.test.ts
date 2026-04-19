// Project-level access control — proves a restricted project keeps out
// non-granted members of the same team, while a team-wide project is open
// to every member.
//
// Precondition: a dev server is running at $OSOPS_TEST_PORT (default 3100)
// with a fresh DB. Run with:
//   rm -f data/osops.db && npm run db:migrate
//   OSOPS_BASE_URL=http://localhost:3100 PORT=3100 npm run dev &
//   npx vitest run -c vitest.e2e.config.ts test/projects.test.ts

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../lib/db/client'
import { findOrCreateAccountByEmail } from '../lib/services/accounts'
import {
  createProject,
  addProjectMember,
  assertCanAccessProject,
  canAccessProject,
  ensureDefaultProjectForOrg
} from '../lib/services/projects'
import { acceptInviteByAccount, canInviteWithRole, createInvite } from '../lib/services/invites'
import { memberships, tokens as tokensTable, devices, organizations } from '../lib/db/schema'
import { hashToken, mintToken } from '../lib/crypto/tokens'

const PORT = process.env.OSOPS_TEST_PORT ?? '3100'
const BASE = `http://127.0.0.1:${PORT}`

async function waitForServer(url: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url)
      if (resp.status < 500) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`server not ready at ${url}`)
}

async function mintCliToken(accountId: number): Promise<{ plaintext: string; devicePubKey: string }> {
  const { db } = getDb()
  const devicePubKey = `02${Buffer.from(`device-${accountId}-${Date.now()}`).toString('hex').padEnd(64, '0').slice(0, 64)}`
  const device = await db
    .insert(devices)
    .values({ accountId, publicKey: devicePubKey, lastSeenAt: new Date() })
    .returning({ id: devices.id })
  const { plaintext, hash } = mintToken()
  await db
    .insert(tokensTable)
    .values({ accountId, deviceId: device[0].id, tokenHash: hash, scope: 'cli' })
  return { plaintext, devicePubKey }
}

async function httpSet(token: string, devicePubKey: string, uri: string, value: string, projectId?: string) {
  return fetch(`${BASE}/api/set`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      device_public_key: devicePubKey,
      uri,
      value,
      ...(projectId ? { dotenvx_project_id: projectId } : {})
    })
  })
}

async function httpGet(token: string, uri: string) {
  return fetch(`${BASE}/api/get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ uri })
  })
}

async function httpSync(token: string, devicePubKey: string, projectId?: string) {
  const encoded = Buffer.from(JSON.stringify({ files: [] })).toString('base64')
  return fetch(`${BASE}/api/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      device_public_key: devicePubKey,
      encoded,
      ...(projectId ? { dotenvx_project_id: projectId } : {})
    })
  })
}

describe('projects: team-wide vs restricted access control', () => {
  // Three accounts:
  //   owner    — owner of `proj-team-a`, creator of team-wide + restricted projects
  //   member   — plain member invited to proj-team-a. Should access team-wide projects;
  //              should NOT access restricted projects unless explicitly granted.
  //   outsider — member of a different team entirely. Should access nothing in proj-team-a.
  let ownerId = 0
  let memberId = 0
  let outsiderId = 0
  let orgId = 0
  let teamWideProjectDotenvxId = ''
  let restrictedProjectDotenvxId = ''
  let restrictedProjectInternalId = 0
  let ownerToken = { plaintext: '', devicePubKey: '' }
  let memberToken = { plaintext: '', devicePubKey: '' }
  let outsiderToken = { plaintext: '', devicePubKey: '' }

  beforeAll(async () => {
    await waitForServer(`${BASE}/`)

    const suffix = Date.now()
    const owner = await findOrCreateAccountByEmail(`owner+proj-${suffix}@example.com`)
    const member = await findOrCreateAccountByEmail(`member+proj-${suffix}@example.com`)
    const outsider = await findOrCreateAccountByEmail(`outsider+proj-${suffix}@example.com`)
    ownerId = owner.id
    memberId = member.id
    outsiderId = outsider.id

    // Owner's personal org is the test team.
    const { db } = getDb()
    const ownerOrg = await db.query.memberships.findFirst({
      where: eq(memberships.accountId, owner.id)
    })
    orgId = ownerOrg!.orgId

    // Promote owner to actual owner role on their personal org (findOrCreateAccountByEmail
    // already does this — being defensive).
    await db
      .update(memberships)
      .set({ role: 'owner' })
      .where(and(eq(memberships.accountId, owner.id), eq(memberships.orgId, orgId)))

    // Invite `member` to owner's team with role=member and have them accept.
    const { url: inviteUrl } = await createInvite({
      orgId,
      email: member.email,
      role: 'member',
      invitedBy: owner.id
    })
    const inviteToken = new URL(inviteUrl).searchParams.get('token')!
    const accepted = await acceptInviteByAccount(inviteToken, member)
    expect('error' in accepted).toBe(false)

    // outsider stays in their personal org — NOT invited to owner's team.

    // Create a team-wide and a restricted project.
    const teamWide = await createProject({
      orgId,
      name: 'website',
      visibility: 'team',
      createdBy: owner.id
    })
    const restricted = await createProject({
      orgId,
      name: 'ios-app',
      visibility: 'restricted',
      createdBy: owner.id
    })
    teamWideProjectDotenvxId = teamWide.dotenvxProjectId
    restrictedProjectDotenvxId = restricted.dotenvxProjectId
    restrictedProjectInternalId = restricted.id

    // Mint CLI tokens for each identity.
    ownerToken = await mintCliToken(owner.id)
    memberToken = await mintCliToken(member.id)
    outsiderToken = await mintCliToken(outsider.id)
  }, 60_000)

  afterAll(() => {
    getDb().sqlite.close()
  })

  describe('service-layer: assertCanAccessProject', () => {
    it('grants access to team-wide projects for all org members', async () => {
      const { db } = getDb()
      const teamWide = await db.query.projects.findFirst({
        where: (p, { eq }) => eq(p.dotenvxProjectId, teamWideProjectDotenvxId)
      })
      expect(await canAccessProject(ownerId, teamWide!)).toBe(true)
      expect(await canAccessProject(memberId, teamWide!)).toBe(true)
      expect(await canAccessProject(outsiderId, teamWide!)).toBe(false)
    })

    it('restricted projects: owner yes, explicit member yes, plain member no, outsider no', async () => {
      const { db } = getDb()
      const restricted = await db.query.projects.findFirst({
        where: (p, { eq }) => eq(p.dotenvxProjectId, restrictedProjectDotenvxId)
      })

      // Owner always has access (org role=owner).
      expect(await canAccessProject(ownerId, restricted!)).toBe(true)

      // Plain member is in the org but NOT explicitly on the project.
      expect(await canAccessProject(memberId, restricted!)).toBe(false)

      // Outsider isn't even in the org.
      expect(await canAccessProject(outsiderId, restricted!)).toBe(false)

      // Grant explicit access and re-check.
      await addProjectMember({ projectId: restricted!.id, accountId: memberId })
      expect(await canAccessProject(memberId, restricted!)).toBe(true)
    })

    it('ensureDefaultProjectForOrg is idempotent', async () => {
      const a = await ensureDefaultProjectForOrg(orgId)
      const b = await ensureDefaultProjectForOrg(orgId)
      expect(a.id).toBe(b.id)
      expect(a.isDefault).toBe(true)
      expect(a.visibility).toBe('team')
    })

    it('throws forbidden with descriptive message for non-member org', async () => {
      const { db } = getDb()
      const restricted = await db.query.projects.findFirst({
        where: (p, { eq }) => eq(p.dotenvxProjectId, restrictedProjectDotenvxId)
      })
      await expect(assertCanAccessProject(outsiderId, restricted!)).rejects.toThrow(
        /forbidden: caller is not a member/
      )
    })
  })

  describe('invite role promotion gate', () => {
    it('owners can mint any role; admins only members; members nothing', async () => {
      // Promote the `member` account to admin to exercise the admin path.
      const { db } = getDb()
      await db
        .update(memberships)
        .set({ role: 'admin' })
        .where(and(eq(memberships.accountId, memberId), eq(memberships.orgId, orgId)))

      expect(
        await canInviteWithRole({ actorId: ownerId, orgId, targetRole: 'member' })
      ).toBe(true)
      expect(
        await canInviteWithRole({ actorId: ownerId, orgId, targetRole: 'admin' })
      ).toBe(true)
      expect(
        await canInviteWithRole({ actorId: ownerId, orgId, targetRole: 'owner' })
      ).toBe(true)

      expect(
        await canInviteWithRole({ actorId: memberId, orgId, targetRole: 'member' })
      ).toBe(true)
      expect(
        await canInviteWithRole({ actorId: memberId, orgId, targetRole: 'admin' })
      ).toBe(false)
      expect(
        await canInviteWithRole({ actorId: memberId, orgId, targetRole: 'owner' })
      ).toBe(false)

      // Restore to 'member' so later tests have a plain-member actor available.
      await db
        .update(memberships)
        .set({ role: 'member' })
        .where(and(eq(memberships.accountId, memberId), eq(memberships.orgId, orgId)))

      expect(
        await canInviteWithRole({ actorId: memberId, orgId, targetRole: 'member' })
      ).toBe(false) // plain members can't invite at all

      // Outsider (no membership) always false.
      expect(
        await canInviteWithRole({ actorId: outsiderId, orgId, targetRole: 'member' })
      ).toBe(false)
    })
  })

  describe('wire-level: /api/set and /api/get enforce project access', () => {
    const teamWideUri = `dotenvx://rot_aaa${Date.now().toString(16)}`
    const restrictedUri = `dotenvx://rot_bbb${Date.now().toString(16)}`

    it('team-wide project: every team member can set and get', async () => {
      // owner writes
      let r = await httpSet(
        ownerToken.plaintext,
        ownerToken.devicePubKey,
        teamWideUri,
        'team-wide-value',
        teamWideProjectDotenvxId
      )
      expect(r.status).toBe(200)

      // member reads
      r = await httpGet(memberToken.plaintext, teamWideUri)
      expect(r.status).toBe(200)
      expect(await r.text()).toBe('team-wide-value')

      // outsider is a member of a different team entirely → 403 (or 404-leak-safe)
      r = await httpGet(outsiderToken.plaintext, teamWideUri)
      expect(r.status).toBe(403)
    })

    it('restricted project: plain member is blocked from set and get until granted', async () => {
      // First make sure member is NOT on the restricted project access list.
      // (The service-level test above added them — clean up for this test.)
      const { db } = getDb()
      await db
        .delete((await import('../lib/db/schema')).projectAccess)
        .where(
          and(
            eq(
              (await import('../lib/db/schema')).projectAccess.projectId,
              restrictedProjectInternalId
            ),
            eq(
              (await import('../lib/db/schema')).projectAccess.accountId,
              memberId
            )
          )
        )

      // Owner writes to the restricted project.
      let r = await httpSet(
        ownerToken.plaintext,
        ownerToken.devicePubKey,
        restrictedUri,
        'ios-secret-v1',
        restrictedProjectDotenvxId
      )
      expect(r.status).toBe(200)

      // Member tries to read: 403.
      r = await httpGet(memberToken.plaintext, restrictedUri)
      expect(r.status).toBe(403)

      // Member tries to write to the restricted project: 403 during project resolution.
      r = await httpSet(
        memberToken.plaintext,
        memberToken.devicePubKey,
        `dotenvx://rot_cc${Date.now().toString(16)}`,
        'should-fail',
        restrictedProjectDotenvxId
      )
      expect(r.status).toBe(403)

      // Grant the member explicit access. Now both set and get work.
      await addProjectMember({ projectId: restrictedProjectInternalId, accountId: memberId })

      r = await httpGet(memberToken.plaintext, restrictedUri)
      expect(r.status).toBe(200)
      expect(await r.text()).toBe('ios-secret-v1')

      r = await httpSet(
        memberToken.plaintext,
        memberToken.devicePubKey,
        `dotenvx://rot_dd${Date.now().toString(16)}`,
        'now-allowed',
        restrictedProjectDotenvxId
      )
      expect(r.status).toBe(200)
    })
  })

  describe('wire-level: /api/sync respects project access', () => {
    it('rejects sync against a restricted project you are not in', async () => {
      const { db } = getDb()
      // Make sure outsider has zero access to the restricted project (they don't —
      // they're in a different org — but be explicit).
      const r = await httpSync(
        outsiderToken.plaintext,
        outsiderToken.devicePubKey,
        restrictedProjectDotenvxId
      )
      expect(r.status).toBe(403)
    })

    it('allows sync against a team-wide project for any member', async () => {
      const r = await httpSync(
        memberToken.plaintext,
        memberToken.devicePubKey,
        teamWideProjectDotenvxId
      )
      expect(r.status).toBe(200)
      const body = (await r.json()) as { dotenvx_project_id: string }
      expect(body.dotenvx_project_id).toBe(teamWideProjectDotenvxId)
    })
  })

  describe('wire-level: sync decomposes files and /api/get resolves env URIs', () => {
    async function httpSyncWithFiles(
      token: string,
      devicePubKey: string,
      projectId: string,
      files: Array<{ filepath: string; src: string }>
    ) {
      const encoded = Buffer.from(JSON.stringify({ files })).toString('base64')
      return fetch(`${BASE}/api/sync`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          device_public_key: devicePubKey,
          encoded,
          dotenvx_project_id: projectId
        })
      })
    }

    it('stores one row per synced file and returns filepaths', async () => {
      const r = await httpSyncWithFiles(
        ownerToken.plaintext,
        ownerToken.devicePubKey,
        teamWideProjectDotenvxId,
        [
          { filepath: '.env', src: 'HELLO=encrypted:ABCD' },
          { filepath: '.env.production', src: 'STAGE=prod' }
        ]
      )
      expect(r.status).toBe(200)
      const body = (await r.json()) as { files: Array<{ filepath: string }> }
      expect(body.files.map((f) => f.filepath).sort()).toEqual(
        ['.env', '.env.production'].sort()
      )

      // Look up what the service stored and confirm env URIs were minted.
      const { db } = getDb()
      const project = await db.query.projects.findFirst({
        where: (p, { eq }) => eq(p.dotenvxProjectId, teamWideProjectDotenvxId)
      })
      const files = await db.query.syncFiles.findMany({
        where: (sf, { eq }) => eq(sf.projectId, project!.id)
      })
      expect(files.length).toBeGreaterThanOrEqual(2)
      for (const f of files) {
        expect(f.envUri).toMatch(/^dotenvx:\/\/env_[0-9a-f]{32}$/)
      }
    })

    it('/api/get returns the raw file contents for a valid env_ URI', async () => {
      // Re-sync a known value and then fetch its env URI.
      const distinctive = `HELLO=encrypted:UNIQUE${Date.now().toString(16)}`
      const r = await httpSyncWithFiles(
        ownerToken.plaintext,
        ownerToken.devicePubKey,
        teamWideProjectDotenvxId,
        [{ filepath: '.env', src: distinctive }]
      )
      expect(r.status).toBe(200)

      const { db } = getDb()
      const project = await db.query.projects.findFirst({
        where: (p, { eq }) => eq(p.dotenvxProjectId, teamWideProjectDotenvxId)
      })
      const latest = await db.query.syncFiles.findFirst({
        where: (sf, { and, eq }) =>
          and(eq(sf.projectId, project!.id), eq(sf.filepath, '.env')),
        orderBy: (sf, { desc }) => desc(sf.id)
      })
      expect(latest?.envUri).toBeTruthy()

      const g = await fetch(`${BASE}/api/get`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${memberToken.plaintext}`
        },
        body: JSON.stringify({ uri: latest!.envUri })
      })
      expect(g.status).toBe(200)
      expect(await g.text()).toBe(distinctive)
    })

    it('/api/get rejects an env_ URI for a restricted project the caller is not on', async () => {
      // Sync a file into the restricted project as owner.
      const r = await httpSyncWithFiles(
        ownerToken.plaintext,
        ownerToken.devicePubKey,
        restrictedProjectDotenvxId,
        [{ filepath: '.env', src: 'SECRET=only-ios-devs' }]
      )
      expect(r.status).toBe(200)

      const { db } = getDb()
      const latest = await db.query.syncFiles.findFirst({
        where: (sf, { eq, and }) =>
          and(
            eq(sf.projectId, restrictedProjectInternalId),
            eq(sf.filepath, '.env')
          ),
        orderBy: (sf, { desc }) => desc(sf.id)
      })
      expect(latest?.envUri).toBeTruthy()

      // Remove the explicit member grant that previous tests may have added, so this
      // is a clean "plain member, no project_access row" scenario.
      const { projectAccess } = await import('../lib/db/schema')
      await db
        .delete(projectAccess)
        .where(
          and(
            eq(projectAccess.projectId, restrictedProjectInternalId),
            eq(projectAccess.accountId, memberId)
          )
        )

      const g = await fetch(`${BASE}/api/get`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${memberToken.plaintext}`
        },
        body: JSON.stringify({ uri: latest!.envUri })
      })
      expect(g.status).toBe(403)
    })

    it('/api/get returns 404 for an unknown env_ URI', async () => {
      const g = await fetch(`${BASE}/api/get`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${ownerToken.plaintext}`
        },
        body: JSON.stringify({
          uri: `dotenvx://env_${'0'.repeat(32)}`
        })
      })
      expect(g.status).toBe(404)
    })
  })
})
