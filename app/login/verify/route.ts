import { NextResponse } from 'next/server'

import { baseOrigin, baseUrl } from '@/lib/config'
import { isSafeLocalPath } from '@/lib/http/safe-redirect'
import { consumeLoginLink, MagicLinkProviderConflict } from '@/lib/services/panel-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const next = url.searchParams.get('next') ?? ''
  if (!token) return NextResponse.redirect(new URL('/login', baseUrl()))

  return new Response(renderConfirmPage({ token, next }), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  if (origin && origin !== baseOrigin()) {
    return NextResponse.redirect(new URL('/login?error=expired', baseUrl()))
  }

  const form = await req.formData().catch(() => null)
  const token = String(form?.get('token') ?? '')
  const next = String(form?.get('next') ?? '')
  if (!token) return NextResponse.redirect(new URL('/login', baseUrl()))

  try {
    const account = await consumeLoginLink(token)
    if (!account) return NextResponse.redirect(new URL('/login?error=expired', baseUrl()))
  } catch (err) {
    if (err instanceof MagicLinkProviderConflict) {
      const conflict = new URL('/login?err=email_conflict', baseUrl())
      if (isSafeLocalPath(next)) conflict.searchParams.set('next', next)
      return NextResponse.redirect(conflict)
    }
    throw err
  }

  const dest = isSafeLocalPath(next) ? next : '/panel'
  return NextResponse.redirect(new URL(dest, baseUrl()))
}

function renderConfirmPage(input: { token: string; next: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Continue Sign In</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0d1117;
        color: #e6edf3;
        font: 16px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      main {
        width: min(32rem, calc(100vw - 2rem));
        border: 1px solid #30363d;
        padding: 1.5rem;
        background: #010409;
      }
      h1 { margin: 0 0 1rem; color: #7ee787; font-size: 1rem; }
      p { margin: 0 0 1rem; color: #9da7b3; }
      button {
        border: 1px solid #7ee787;
        background: transparent;
        color: #7ee787;
        padding: 0.75rem 1rem;
        font: inherit;
        cursor: pointer;
      }
      button:hover { background: rgba(126, 231, 135, 0.08); }
    </style>
  </head>
  <body>
    <main>
      <h1>continue sign in</h1>
      <p>confirm to finish signing in. the link is only consumed after this step.</p>
      <form method="post" action="/login/verify">
        <input type="hidden" name="token" value="${escapeAttr(input.token)}" />
        <input type="hidden" name="next" value="${escapeAttr(input.next)}" />
        <button type="submit">continue</button>
      </form>
    </main>
  </body>
</html>`
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
