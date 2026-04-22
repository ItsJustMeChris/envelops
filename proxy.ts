import { NextResponse, type NextRequest } from 'next/server'

import { baseOrigin } from './lib/config'

// Dumps the full request (method, url, headers, body) as a single JSON line
// when ENVELOPS_VERBOSE is set. Clones the request so the handler still gets
// an intact body stream. No redaction — this is a debug flag, and this server
// is a keystore, so assume anyone turning it on accepts secrets in logs.
async function logVerbose(req: NextRequest) {
  try {
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => {
      headers[k] = v
    })
    let body: string | null = null
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const text = await req.clone().text()
      if (text.length > 0) body = text
    }
    console.log(
      '[envelops:verbose] ' +
        JSON.stringify({ method: req.method, url: req.url, headers, body })
    )
  } catch (e) {
    console.log('[envelops:verbose] failed to log request: ' + String(e))
  }
}

// Defense-in-depth CSRF backstop for Next.js server actions. Server actions
// arrive as POSTs carrying a `Next-Action` header; cross-origin browser POSTs
// always include `Origin`, so rejecting anything that doesn't match our base
// URL blocks attacker-initiated form submissions even if SameSite=Lax is
// relaxed in some future browser. CLI traffic to `/api/*` doesn't carry
// `Next-Action` and is unaffected; the existing `/api/panel/*` handlers keep
// their own `requireSameOrigin` check.
export async function proxy(req: NextRequest) {
  if (process.env.ENVELOPS_VERBOSE) await logVerbose(req)

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
