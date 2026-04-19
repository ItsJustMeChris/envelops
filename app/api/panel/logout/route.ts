import { NextResponse } from 'next/server'

import { requireSameOrigin } from '@/lib/http/origin'
import { endSession } from '@/lib/services/panel-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const denied = requireSameOrigin(req)
  if (denied) return denied

  await endSession()
  return NextResponse.redirect(new URL('/login', process.env.ENVELOPS_BASE_URL ?? 'http://localhost:3000'))
}
