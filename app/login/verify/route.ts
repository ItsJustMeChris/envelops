import { NextResponse } from 'next/server'

import { isSafeLocalPath } from '@/lib/http/safe-redirect'
import { consumeLoginLink } from '@/lib/services/panel-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const next = url.searchParams.get('next')
  if (!token) return NextResponse.redirect(new URL('/login', url))

  const account = await consumeLoginLink(token)
  if (!account) return NextResponse.redirect(new URL('/login?error=expired', url))

  const dest = isSafeLocalPath(next) ? next : '/panel'
  return NextResponse.redirect(new URL(dest, url))
}
