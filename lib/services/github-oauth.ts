import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

import { baseUrl } from '../config'
import { getDb } from '../db/client'
import { accounts, type Account } from '../db/schema'
import { eq } from 'drizzle-orm'
import { isSafeLocalPath } from '../http/safe-redirect'
import { ensurePersonalOrg } from './accounts'
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
  url.searchParams.set('scope', 'read:user user:email')
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
    if (isSafeLocalPath(decoded)) nextPath = decoded
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

export async function fetchGithubIdentity(token: string): Promise<{
  user: GithubUser
  primaryEmail: string
}> {
  const [userResp, emailsResp] = await Promise.all([
    fetch('https://api.github.com/user', { headers: githubHeaders(token) }),
    fetch('https://api.github.com/user/emails', { headers: githubHeaders(token) })
  ])
  if (!userResp.ok) throw new Error(`github /user failed: ${userResp.status}`)
  const user = (await userResp.json()) as GithubUser
  const emails = emailsResp.ok ? ((await emailsResp.json()) as GithubEmail[]) : []
  const primary = emails.find((e) => e.primary && e.verified)?.email ?? user.email
  if (!primary) throw new Error('github account has no verified primary email')
  return { user, primaryEmail: primary }
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

  await ensurePersonalOrg(account)
  return account
}

export async function completeSessionForAccount(accountId: number): Promise<void> {
  await issueSession(accountId)
}
