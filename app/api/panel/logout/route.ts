import { NextResponse } from 'next/server'

import { endSession } from '@/lib/services/panel-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  await endSession()
  return NextResponse.redirect(new URL('/login', process.env.OSOPS_BASE_URL ?? 'http://localhost:3000'))
}
