import { redirect } from 'next/navigation'

import { requestLoginLink } from '@/lib/services/panel-auth'
import { githubEnabled } from '@/lib/services/github-oauth'
import { emailEnabled } from '@/lib/services/email'
import { clientIp } from '@/lib/http/client-ip'
import { rateLimit } from '@/lib/http/rate-limit'

export const dynamic = 'force-dynamic'

// Login links are free mailgun sends + cheap enumeration oracles. Cap both the
// source (stops spraying) and the target (stops flooding one victim's inbox).
// Windows are generous so a real user's mistyped email still works.
const LINK_IP_LIMIT = 8
const LINK_IP_WINDOW_MS = 10 * 60_000
const LINK_EMAIL_LIMIT = 3
const LINK_EMAIL_WINDOW_MS = 10 * 60_000

async function sendLink(formData: FormData) {
  'use server'
  if (!emailEnabled()) return
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const next = String(formData.get('next') ?? '/panel')
  if (!email) return

  const ip = await clientIp()
  const ipLimit = rateLimit(`login-link-ip:${ip}`, {
    limit: LINK_IP_LIMIT,
    windowMs: LINK_IP_WINDOW_MS
  })
  const emailLimit = rateLimit(`login-link-email:${email}`, {
    limit: LINK_EMAIL_LIMIT,
    windowMs: LINK_EMAIL_WINDOW_MS
  })
  // Keep the user-visible response identical whether we send or drop; that's
  // what preserves the "if it's a valid account" ambiguity on the confirmation
  // page. The limit is silent from the attacker's view.
  if (ipLimit.allowed && emailLimit.allowed) {
    await requestLoginLink(email)
  }
  redirect(`/login?sent=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`)
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; next?: string; error?: string }>
}) {
  const params = await searchParams
  const email = emailEnabled()
  const github = githubEnabled()
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-accent text-lg mb-4">sign in</h1>
      <div className="rule mb-6" />

      {params.error === 'expired' ? (
        <p className="mb-6 text-accent">link invalid or expired. request a new one below.</p>
      ) : null}

      {params.sent && email ? (
        <div className="mb-6">
          <p>if [{params.sent}] is a valid account, a sign-in link is on the way.</p>
          <p className="text-dim mt-2">check your email.</p>
        </div>
      ) : null}

      {!email && !github ? (
        <p className="text-dim">
          no sign-in providers are configured on this server. set{' '}
          <code>ENVELOPS_MAILGUN_API_KEY</code> + <code>ENVELOPS_MAILGUN_EMAIL_DOMAIN</code> to enable email links, or{' '}
          <code>ENVELOPS_GITHUB_CLIENT_ID</code> + <code>ENVELOPS_GITHUB_CLIENT_SECRET</code> for github oauth.
        </p>
      ) : null}

      {email ? (
        <form action={sendLink} className="space-y-4">
          <input type="hidden" name="next" value={params.next ?? '/panel'} />
          <label className="block">
            <span className="text-dim">email</span>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-full bg-transparent border border-rule px-3 py-2"
            />
          </label>
          <button type="submit" className="border border-accent text-accent px-4 py-2 hover:bg-accent/10">
            send link
          </button>
        </form>
      ) : null}

      {github ? (
        <>
          {email ? <div className="rule my-8" /> : null}
          <a
            href={`/login/github?next=${encodeURIComponent(params.next ?? '/panel')}`}
            className="inline-block border border-rule px-4 py-2 hover:border-accent hover:text-accent"
          >
            sign in with github
          </a>
        </>
      ) : null}
    </main>
  )
}
