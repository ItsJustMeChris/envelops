import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

import { baseUrl } from '../config'
import { getDb } from '../db/client'
import { accounts, memberships, organizations, type Account } from '../db/schema'
import { eq } from 'drizzle-orm'
import { issueSession } from './panel-auth'

const STATE_COOKIE = 'osops_gh_state'

export function githubEnabled(): boolean {
  return Boolean(process.env.ENVELOPS_GITHUB_CLIENT_ID && process.env.ENVELOPS_GITHUB_CLIENT_SECRET)
}

export async function buildAuthorizeUrl(nextPath: string): Promise<string> {
  const state = `${randomBytes(16).toString('hex')}:${encodeURIComponent(nextPath)}`
  const store = await cookies()
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600
  })
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', process.env.ENVELOPS_GITHUB_CLIENT_ID!)
  url.searchParams.set('redirect_uri', `${baseUrl()}/login/github/callback`)
  url.searchParams.set('scope', 'read:user read:org user:email')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function validateStateAndRedirect(state: string): Promise<{ nextPath: string } | null> {
  const store = await cookies()
  const saved = store.get(STATE_COOKIE)?.value
  if (!saved || saved !== state) return null
  store.delete(STATE_COOKIE)
  const enc = state.split(':', 2)[1] ?? ''
  let nextPath = '/panel'
  try {
    const decoded = decodeURIComponent(enc)
    if (decoded.startsWith('/')) nextPath = decoded
  } catch {
    // ignore
  }
  return { nextPath }
}

interface TokenResp {
  access_token?: string
  scope?: string
  token_type?: string
  error?: string
}

export async function exchangeCode(code: string): Promise<string> {
  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.ENVELOPS_GITHUB_CLIENT_ID,
      client_secret: process.env.ENVELOPS_GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${baseUrl()}/login/github/callback`
    })
  })
  const json = (await resp.json()) as TokenResp
  if (!json.access_token) throw new Error(`github token exchange failed: ${json.error ?? resp.statusText}`)
  return json.access_token
}

interface GithubUser {
  id: number
  login: string
  email: string | null
}

interface GithubEmail {
  email: string
  primary: boolean
  verified: boolean
}

interface GithubOrg {
  id: number
  login: string
}

export async function fetchGithubIdentity(token: string): Promise<{
  user: GithubUser
  primaryEmail: string
  orgs: GithubOrg[]
}> {
  const [userResp, emailsResp, orgsResp] = await Promise.all([
    fetch('https://api.github.com/user', { headers: githubHeaders(token) }),
    fetch('https://api.github.com/user/emails', { headers: githubHeaders(token) }),
    fetch('https://api.github.com/user/orgs', { headers: githubHeaders(token) })
  ])
  if (!userResp.ok) throw new Error(`github /user failed: ${userResp.status}`)
  const user = (await userResp.json()) as GithubUser
  const emails = emailsResp.ok ? ((await emailsResp.json()) as GithubEmail[]) : []
  const orgs = orgsResp.ok ? ((await orgsResp.json()) as GithubOrg[]) : []
  const primary = emails.find((e) => e.primary && e.verified)?.email ?? user.email
  if (!primary) throw new Error('github account has no verified primary email')
  return { user, primaryEmail: primary, orgs }
}

function githubHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'envelops'
  }
}

export async function upsertFromGithub(input: {
  user: GithubUser
  primaryEmail: string
  orgs: GithubOrg[]
}): Promise<Account> {
  const { db } = getDb()
  const email = input.primaryEmail.toLowerCase()
  const existing = await db.query.accounts.findFirst({ where: eq(accounts.email, email) })
  const username = input.user.login
  const fullUsername = `gh/${username}`

  const account = existing
    ? (
        await db
          .update(accounts)
          .set({ username, fullUsername, provider: 'github' })
          .where(eq(accounts.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(accounts)
          .values({ email, username, fullUsername, provider: 'github' })
          .returning()
      )[0]

  // Mirror GitHub orgs into organizations + memberships. Each GH org becomes a `github`-provider team.
  const personalSlug = username
  await ensureMembershipForOrg(account.id, personalSlug, 'owner', 'github', String(input.user.id))
  for (const org of input.orgs) {
    await ensureMembershipForOrg(account.id, org.login, 'member', 'github', String(org.id))
  }
  return account
}

async function ensureMembershipForOrg(
  accountId: number,
  slug: string,
  role: 'owner' | 'admin' | 'member',
  provider: 'manual' | 'github',
  providerRef: string | null
) {
  const { db } = getDb()
  let org = await db.query.organizations.findFirst({ where: eq(organizations.slug, slug) })
  if (!org) {
    const inserted = await db
      .insert(organizations)
      .values({ slug, name: slug, provider, providerRef })
      .returning()
    org = inserted[0]
  }
  const membership = await db.query.memberships.findFirst({
    where: (m, { and, eq }) => and(eq(m.accountId, accountId), eq(m.orgId, org!.id))
  })
  if (!membership) {
    await db.insert(memberships).values({ accountId, orgId: org.id, role })
  }
}

export async function completeSessionForAccount(accountId: number): Promise<void> {
  await issueSession(accountId)
}
