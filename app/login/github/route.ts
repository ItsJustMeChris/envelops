import { NextResponse } from 'next/server'

import { buildAuthorizeUrl, githubEnabled } from '@/lib/services/github-oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!githubEnabled()) {
    return NextResponse.json({ error: 'github_disabled', error_description: 'set OSOPS_GITHUB_CLIENT_ID + _SECRET' }, { status: 503 })
  }
  const url = new URL(req.url)
  const next = url.searchParams.get('next') ?? '/panel'
  const authorize = await buildAuthorizeUrl(next)
  return NextResponse.redirect(authorize)
}
