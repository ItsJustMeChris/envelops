import { NextResponse } from 'next/server'

export function json<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init)
}

export function oauthError(status: number, error: string, description?: string) {
  return NextResponse.json(
    { error, error_description: description ?? '' },
    { status }
  )
}

export function apiError(status: number, error: string, description?: string) {
  return NextResponse.json(
    { error, error_description: description ?? '' },
    { status }
  )
}

/**
 * Turn a thrown `forbidden: ...` error from the service layer into a clean 403 response.
 * Anything else bubbles up so Next's error logging still sees real bugs.
 */
export function asForbidden(err: unknown): ReturnType<typeof apiError> | null {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.startsWith('forbidden')) return apiError(403, 'forbidden', msg)
  return null
}
