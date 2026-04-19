import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AppCtx = Awaited<ReturnType<typeof bootApp>>

let app: AppCtx

beforeEach(async () => {
  app = await bootApp()
})

afterEach(() => {
  app.getDb().sqlite.close()
  rmSync(app.tempDir, { recursive: true, force: true })
  delete process.env.DATABASE_URL
  delete process.env.ENVELOPS_MASTER_KEY
  delete process.env.ENVELOPS_BASE_URL
  delete process.env.ENVELOPS_TRUST_PROXY
  vi.resetModules()
})

describe('security fixes', () => {
  it('approves a device code at most once and never overwrites the approved account', async () => {
    const owner = await app.accounts.findOrCreateAccountByEmail(`owner+${Date.now()}@example.com`)
    const attacker = await app.accounts.findOrCreateAccountByEmail(`attacker+${Date.now()}@example.com`)

    const issued = await app.oauth.createDeviceCode({
      devicePublicKey: compressedKey('11')
    })
    const pending = await app.oauth.findPendingDeviceCodeByUserCode(issued.user_code)
    expect(pending).toBeTruthy()

    const [a, b] = await Promise.all([
      app.oauth.approveDeviceCode(pending!.id, owner.id),
      app.oauth.approveDeviceCode(pending!.id, attacker.id)
    ])

    expect([a, b].filter(Boolean)).toHaveLength(1)

    const row = await app.getDb().db.query.oauthDeviceCodes.findFirst({
      where: eq(app.schema.oauthDeviceCodes.id, pending!.id)
    })
    expect(row?.accountId).toBe(a ? owner.id : attacker.id)
    expect(await app.oauth.findPendingDeviceCodeByUserCode(issued.user_code)).toBeUndefined()
  })

  it('redeems an approved device code only once and keeps the wire contract on repeat polls', async () => {
    const account = await app.accounts.findOrCreateAccountByEmail(`redeem+${Date.now()}@example.com`)
    const issued = await app.oauth.createDeviceCode({
      devicePublicKey: compressedKey('22')
    })
    const pending = await app.oauth.findPendingDeviceCodeByUserCode(issued.user_code)
    expect(pending).toBeTruthy()
    expect(await app.oauth.approveDeviceCode(pending!.id, account.id)).toBe(true)

    const [first, second] = await Promise.all([
      app.oauth.redeemDeviceCode(issued.device_code),
      app.oauth.redeemDeviceCode(issued.device_code)
    ])

    expect([first, second].filter((r) => r.status === 'authorized')).toHaveLength(1)
    expect([first, second].filter((r) => r.status === 'consumed')).toHaveLength(1)

    const tokenRows = await app.getDb().db.select().from(app.schema.tokens)
    expect(tokenRows).toHaveLength(1)

    const firstWire = await app.oauthTokenRoute.POST(
      jsonRequest('http://test/oauth/token', {
        client_id: 'oac_dotenvxcli',
        device_code: issued.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    )
    expect(firstWire.status).toBe(400)
    expect(await firstWire.json()).toMatchObject({ error: 'expired_token' })
  })

  it('rejects oversized /oauth/device/code requests without inserting rows', async () => {
    const oversized = await app.deviceCodeRoute.POST(
      jsonRequest('http://test/oauth/device/code', {
        client_id: 'oac_dotenvxcli',
        device_public_key: compressedKey('33'),
        system_information: { blob: 'x'.repeat(17_000) }
      })
    )
    expect(oversized.status).toBe(413)

    const rowsAfterOversized = await app.getDb().db.select().from(app.schema.oauthDeviceCodes)
    expect(rowsAfterOversized).toHaveLength(0)

    const ok = await app.deviceCodeRoute.POST(
      jsonRequest('http://test/oauth/device/code', {
        client_id: 'oac_dotenvxcli',
        device_public_key: compressedKey('44'),
        system_information: { os: 'macos', arch: 'arm64' }
      })
    )
    expect(ok.status).toBe(200)
    const okBody = await ok.json()
    expect(okBody).toMatchObject({
      user_code: expect.stringMatching(/^[A-F0-9]{8}$/),
      device_code: expect.stringMatching(/^[0-9a-f]{20}$/)
    })
  })

  it('keeps magic links provider-bound and does not consume them on GET', async () => {
    const localUrl = await app.panelAuth.requestLoginLink(`local+${Date.now()}@example.com`, {
      next: '/panel'
    })
    const localToken = new URL(localUrl.url).searchParams.get('token')
    expect(localToken).toBeTruthy()

    const beforeGet = await app.getDb().db.query.loginLinks.findFirst({
      where: eq(app.schema.loginLinks.tokenHash, app.tokens.hashToken(localToken!))
    })
    expect(beforeGet?.consumedAt).toBeNull()

    const landing = await app.verifyRoute.GET(new Request(localUrl.url))
    expect(landing.status).toBe(200)

    const afterGet = await app.getDb().db.query.loginLinks.findFirst({
      where: eq(app.schema.loginLinks.tokenHash, app.tokens.hashToken(localToken!))
    })
    expect(afterGet?.consumedAt).toBeNull()

    const githubEmail = `gh+${Date.now()}@example.com`
    await app.getDb().db.insert(app.schema.accounts).values({
      email: githubEmail,
      username: `ghuser-${Date.now()}`,
      fullUsername: `gh/ghuser-${Date.now()}`,
      provider: 'github',
      providerRef: '123'
    })

    const beforeSuppressed = await app.getDb().db.select().from(app.schema.loginLinks)
    const suppressed = await app.panelAuth.requestLoginLink(githubEmail)
    expect(suppressed.url).toBe('')
    const afterSuppressed = await app.getDb().db.select().from(app.schema.loginLinks)
    expect(afterSuppressed).toHaveLength(beforeSuppressed.length)

    const legacyToken = 'legacy-magic-token'
    await app.getDb().db.insert(app.schema.loginLinks).values({
      email: githubEmail,
      tokenHash: app.tokens.hashToken(legacyToken),
      expiresAt: new Date(Date.now() + 60_000)
    })

    const conflict = await app.verifyRoute.POST(
      formRequest('http://test/login/verify', {
        token: legacyToken,
        next: '/panel'
      })
    )
    expect(conflict.status).toBe(307)
    expect(conflict.headers.get('location')).toContain('/login?err=email_conflict')

    const consumed = await app.getDb().db.query.loginLinks.findFirst({
      where: eq(app.schema.loginLinks.tokenHash, app.tokens.hashToken(legacyToken))
    })
    expect(consumed?.consumedAt).toBeTruthy()
  })

  it('does not globally lock valid CLI auth after invalid bearer attempts when source IP is unknown', async () => {
    const account = await app.accounts.findOrCreateAccountByEmail(`account+${Date.now()}@example.com`)
    const session = await mintCliToken(account.id)

    for (let i = 0; i < 35; i += 1) {
      const denied = await app.accountRoute.GET(
        new Request('http://test/api/account', {
          headers: { authorization: `Bearer invalid-${i}` }
        })
      )
      expect(denied.status).toBe(401)
    }

    const allowed = await app.accountRoute.GET(
      new Request('http://test/api/account', {
        headers: { authorization: `Bearer ${session.token}` }
      })
    )
    expect(allowed.status).toBe(200)
  })

  it('does not let plain members create projects implicitly through rotate/connect denial paths', async () => {
    const owner = await app.accounts.findOrCreateAccountByEmail(`owner+rotate-${Date.now()}@example.com`)
    const member = await app.accounts.findOrCreateAccountByEmail(`member+rotate-${Date.now()}@example.com`)
    const orgId = await app.teams.personalOrgForAccount(owner.id)
    const ownerOrg = await app.getDb().db.query.organizations.findFirst({
      where: eq(app.schema.organizations.id, orgId)
    })
    expect(ownerOrg).toBeTruthy()

    await app.getDb().db.insert(app.schema.memberships).values({
      accountId: member.id,
      orgId,
      role: 'member'
    })

    const memberToken = await mintCliToken(member.id)
    const before = await app.getDb().db
      .select()
      .from(app.schema.projects)
      .where(eq(app.schema.projects.orgId, orgId))

    const denied = await app.rotateConnectRoute.POST(
      jsonRequest(
        'http://test/api/rotate/connect',
        { provider: 'manual', org: ownerOrg!.slug },
        memberToken.token
      )
    )
    expect(denied.status).toBe(403)

    const unknownProject = await app.rotateConnectRoute.POST(
      jsonRequest(
        'http://test/api/rotate/connect',
        { provider: 'manual', org: ownerOrg!.slug, dotenvx_project_id: 'prj_missing' },
        memberToken.token
      )
    )
    expect(unknownProject.status).toBe(404)

    const after = await app.getDb().db
      .select()
      .from(app.schema.projects)
      .where(eq(app.schema.projects.orgId, orgId))
    expect(after).toHaveLength(before.length)
  })

  it('rate-limits and size-limits observe traffic per authenticated caller', async () => {
    const account = await app.accounts.findOrCreateAccountByEmail(`observe+${Date.now()}@example.com`)
    const session = await mintCliToken(account.id)

    const oversized = await app.observeRoute.POST(
      jsonRequest(
        'http://test/api/observe',
        {
          encoded: 'x'.repeat(256 * 1024 + 1)
        },
        session.token
      )
    )
    expect(oversized.status).toBe(413)

    for (let i = 0; i < 19; i += 1) {
      const resp = await app.observeRoute.POST(
        jsonRequest(
          'http://test/api/observe',
          {
            encoded: Buffer.from(JSON.stringify({ i })).toString('base64')
          },
          session.token
        )
      )
      expect(resp.status).toBe(200)
    }

    const limited = await app.observeRoute.POST(
      jsonRequest(
        'http://test/api/observe',
        {
          encoded: Buffer.from(JSON.stringify({ i: 20 })).toString('base64')
        },
        session.token
      )
    )
    expect(limited.status).toBe(429)
  })

  it('rejects sync payloads with excessive file fanout before creating backup state', async () => {
    const account = await app.accounts.findOrCreateAccountByEmail(`sync+${Date.now()}@example.com`)
    const session = await mintCliToken(account.id)

    const files = Array.from({ length: 129 }, (_, i) => ({
      filepath: `.env.${i}`,
      src: `VALUE_${i}=1`
    }))
    const encoded = Buffer.from(JSON.stringify({ files })).toString('base64')

    const beforeBackups = await app.getDb().db.select().from(app.schema.syncBackups)
    const beforeProjects = await app.getDb().db.select().from(app.schema.projects)

    const rejected = await app.syncRoute.POST(
      jsonRequest(
        'http://test/api/sync',
        {
          device_public_key: session.devicePublicKey,
          encoded
        },
        session.token
      )
    )
    expect(rejected.status).toBe(400)

    const afterBackups = await app.getDb().db.select().from(app.schema.syncBackups)
    const afterProjects = await app.getDb().db.select().from(app.schema.projects)
    expect(afterBackups).toHaveLength(beforeBackups.length)
    expect(afterProjects).toHaveLength(beforeProjects.length)
  })

  it('writes keypair and observe audit rows into the correct org trails', async () => {
    const account = await app.accounts.findOrCreateAccountByEmail(`audit+${Date.now()}@example.com`)
    const personalOrgId = await app.teams.personalOrgForAccount(account.id)
    const teamOrg = (
      await app.getDb().db
        .insert(app.schema.organizations)
        .values({ slug: `audit-team-${Date.now()}`, name: 'audit-team', provider: 'manual' })
        .returning()
    )[0]
    await app.getDb().db.insert(app.schema.memberships).values({
      accountId: account.id,
      orgId: teamOrg.id,
      role: 'owner'
    })

    const project = await app.projects.createProject({
      orgId: teamOrg.id,
      name: 'shared-project',
      visibility: 'team',
      createdBy: account.id
    })

    const outsider = await app.accounts.findOrCreateAccountByEmail(`foreign+${Date.now()}@example.com`)
    const outsiderOrgId = await app.teams.personalOrgForAccount(outsider.id)
    const foreignProject = await app.projects.createProject({
      orgId: outsiderOrgId,
      name: 'foreign-project',
      visibility: 'team',
      createdBy: outsider.id
    })

    const session = await mintCliToken(account.id)

    const minted = await app.keypairRoute.POST(
      jsonRequest(
        'http://test/api/keypair',
        {
          device_public_key: session.devicePublicKey,
          public_key: compressedKey('55')
        },
        session.token
      )
    )
    expect(minted.status).toBe(200)

    const personalAudit = await app.audit.listAuditForOrg(personalOrgId)
    expect(personalAudit.some((e) => e.kind === 'keypair.mint')).toBe(true)

    const observedTeam = await app.observeRoute.POST(
      jsonRequest(
        'http://test/api/observe',
        {
          encoded: Buffer.from(JSON.stringify({ action: 'team' })).toString('base64'),
          dotenvx_project_id: project.dotenvxProjectId
        },
        session.token
      )
    )
    expect(observedTeam.status).toBe(200)

    const teamAudit = await app.audit.listAuditForOrg(teamOrg.id)
    expect(teamAudit.some((e) => e.kind === 'observe')).toBe(true)

    const observedForeign = await app.observeRoute.POST(
      jsonRequest(
        'http://test/api/observe',
        {
          encoded: Buffer.from(JSON.stringify({ action: 'foreign' })).toString('base64'),
          dotenvx_project_id: foreignProject.dotenvxProjectId
        },
        session.token
      )
    )
    expect(observedForeign.status).toBe(200)

    const foreignAudit = await app.audit.listAuditForOrg(outsiderOrgId)
    expect(foreignAudit.some((e) => e.payload?.action === 'foreign')).toBe(false)

    const personalAuditAfterForeign = await app.audit.listAuditForOrg(personalOrgId)
    expect(personalAuditAfterForeign.some((e) => e.payload?.action === 'foreign')).toBe(true)
  })

  it('binds GitHub accounts to a stable provider id, not email alone', async () => {
    const first = await app.githubOAuth.upsertFromGithub({
      user: { id: 101, login: 'first-handle', email: 'gh@example.com' },
      primaryEmail: 'gh@example.com'
    })
    expect(first.provider).toBe('github')
    expect(first.providerRef).toBe('101')

    const repeated = await app.githubOAuth.upsertFromGithub({
      user: { id: 101, login: 'renamed-handle', email: 'gh@example.com' },
      primaryEmail: 'gh@example.com'
    })
    expect(repeated.id).toBe(first.id)
    expect(repeated.providerRef).toBe('101')

    await expect(
      app.githubOAuth.upsertFromGithub({
        user: { id: 202, login: 'other-user', email: 'gh@example.com' },
        primaryEmail: 'gh@example.com'
      })
    ).rejects.toBeInstanceOf(app.githubOAuth.GithubEmailConflict)
  })
})

async function bootApp() {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'envelops-security-'))
  process.env.DATABASE_URL = `file:${path.join(tempDir, 'test.db')}`
  process.env.ENVELOPS_MASTER_KEY = '11'.repeat(32)
  process.env.ENVELOPS_BASE_URL = 'http://localhost:3000'
  delete process.env.ENVELOPS_TRUST_PROXY

  vi.resetModules()

  const [{ getDb }, schema, accounts, oauth, teams, projects, audit, tokens, panelAuth, githubOAuth, accountRoute, keypairRoute, observeRoute, rotateConnectRoute, syncRoute, deviceCodeRoute, oauthTokenRoute, verifyRoute] =
    await Promise.all([
      import('../lib/db/client'),
      import('../lib/db/schema'),
      import('../lib/services/accounts'),
      import('../lib/services/oauth'),
      import('../lib/services/teams'),
      import('../lib/services/projects'),
      import('../lib/services/audit'),
      import('../lib/crypto/tokens'),
      import('../lib/services/panel-auth'),
      import('../lib/services/github-oauth'),
      import('../app/api/account/route'),
      import('../app/api/keypair/route'),
      import('../app/api/observe/route'),
      import('../app/api/rotate/connect/route'),
      import('../app/api/sync/route'),
      import('../app/oauth/device/code/route'),
      import('../app/oauth/token/route'),
      import('../app/login/verify/route')
    ])

  migrate(getDb().db, { migrationsFolder: './lib/db/migrations' })

  return {
    tempDir,
    getDb,
    schema,
    accounts,
    oauth,
    teams,
    projects,
    audit,
    tokens,
    panelAuth,
    githubOAuth,
    accountRoute,
    keypairRoute,
    observeRoute,
    rotateConnectRoute,
    syncRoute,
    deviceCodeRoute,
    oauthTokenRoute,
    verifyRoute
  }
}

async function mintCliToken(accountId: number): Promise<{
  token: string
  devicePublicKey: string
}> {
  const devicePublicKey = compressedKey(randomBytes(2).toString('hex'))
  const { db } = app.getDb()
  const device = await db
    .insert(app.schema.devices)
    .values({
      accountId,
      publicKey: devicePublicKey,
      lastSeenAt: new Date()
    })
    .returning({ id: app.schema.devices.id })
  const minted = app.tokens.mintToken()
  await db.insert(app.schema.tokens).values({
    accountId,
    deviceId: device[0].id,
    tokenHash: minted.hash,
    scope: 'cli'
  })
  return { token: minted.plaintext, devicePublicKey }
}

function jsonRequest(url: string, body: unknown, bearer?: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
    },
    body: JSON.stringify(body)
  })
}

function formRequest(url: string, body: Record<string, string>): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(body)) form.set(k, v)
  return new Request(url, {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
    body: form
  })
}

function compressedKey(seed: string): string {
  const hex = Buffer.from(seed).toString('hex').padEnd(64, '0').slice(0, 64)
  return `02${hex}`
}
