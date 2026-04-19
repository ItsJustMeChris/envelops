import { NextResponse } from 'next/server'

import {
  completeSessionForAccount,
  exchangeCode,
  fetchGithubIdentity,
  githubEnabled,
  upsertFromGithub,
  validateStateAndRedirect
} from '@/lib/services/github-oauth'
import { baseUrl } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!githubEnabled()) {
    return NextResponse.json({ error: 'github_disabled' }, { status: 503 })
  }
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return NextResponse.redirect(new URL('/login?err=missing_code', baseUrl()))

  const validated = await validateStateAndRedirect(state)
  if (!validated) return NextResponse.redirect(new URL('/login?err=bad_state', baseUrl()))

  try {
    const token = await exchangeCode(code)
    const identity = await fetchGithubIdentity(token)
    const account = await upsertFromGithub(identity)
    await completeSessionForAccount(account.id)
  } catch {
    return NextResponse.redirect(new URL('/login?err=oauth_failed', baseUrl()))
  }

  return NextResponse.redirect(new URL(validated.nextPath, baseUrl()))
}
