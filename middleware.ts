import { NextResponse, type NextRequest } from 'next/server'

import { baseOrigin } from './lib/config'

// Defense-in-depth CSRF backstop for Next.js server actions. Server actions
// arrive as POSTs carrying a `Next-Action` header; cross-origin browser POSTs
// always include `Origin`, so rejecting anything that doesn't match our base
// URL blocks attacker-initiated form submissions even if SameSite=Lax is
// relaxed in some future browser. CLI traffic to `/api/*` doesn't carry
// `Next-Action` and is unaffected; the existing `/api/panel/*` handlers keep
// their own `requireSameOrigin` check.
export function middleware(req: NextRequest) {
  if (req.method === 'POST' && req.headers.has('next-action')) {
    const origin = req.headers.get('origin')
    if (!origin || origin !== baseOrigin()) {
      return NextResponse.json(
        { error: 'forbidden', error_description: 'origin mismatch' },
        { status: 403 }
      )
    }
  }

  // Per-request nonce-based CSP. Next.js auto-extracts the nonce from this
  // header and stamps it onto its own framework <script>/<style> tags, so
  // hydration works without `'unsafe-inline'`. `'strict-dynamic'` lets those
  // trusted scripts load further chunks. Dev mode needs `'unsafe-eval'` for
  // React refresh and `'unsafe-inline'` styles for the error overlay.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ''}`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`
  ].join('; ')

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)'
}
