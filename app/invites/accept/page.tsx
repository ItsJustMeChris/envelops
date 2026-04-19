import { redirect } from 'next/navigation'

import {
  acceptInviteByAccount,
  inspectInvite,
  inviteSubjectLabel
} from '@/lib/services/invites'
import { currentAccount, requestLoginLink } from '@/lib/services/panel-auth'
import { githubEnabled } from '@/lib/services/github-oauth'
import { emailEnabled } from '@/lib/services/email'
import { clientIp } from '@/lib/http/client-ip'
import { rateLimit } from '@/lib/http/rate-limit'

export const dynamic = 'force-dynamic'

// Invite tokens are 24 random bytes so brute force isn't realistic, but the
// button sends a mailgun email per click. Cap per-IP so a scraper who scrapes a
// token can't pump login emails at the invitee.
const ACCEPT_LIMIT = 20
const ACCEPT_WINDOW_MS = 10 * 60_000

async function accept(formData: FormData) {
  'use server'
  if (!emailEnabled()) redirect('/login')
  const token = String(formData.get('token') ?? '')
  if (!token) redirect('/login')

  const ip = await clientIp()
  const limited = rateLimit(`invite-accept:${ip}`, {
    limit: ACCEPT_LIMIT,
    windowMs: ACCEPT_WINDOW_MS
  })
  if (!limited.allowed) redirect(`/invites/accept?token=${token}&err=rate_limited`)

  // Email is sourced from the invite row — never from user input — so an
  // attacker with a leaked token can only cause a login email to the real
  // invitee's inbox, which they don't control. Account + membership are still
  // deferred to consumeLoginLink / acceptInviteByAccount; this action only
  // triggers the login email.
  const inspection = await inspectInvite(token)
  if (!inspection) redirect(`/invites/accept?token=${token}&err=invite_invalid`)
  const { invite } = inspection!
  if (!invite.email) redirect(`/invites/accept?token=${token}&err=invite_requires_github`)

  const next = `/invites/accept?token=${encodeURIComponent(token)}`
  await requestLoginLink(invite.email, { next })
  redirect(`/login?sent=${encodeURIComponent(invite.email)}&next=${encodeURIComponent(next)}`)
}

export default async function AcceptInvitePage({
  searchParams
}: {
  searchParams: Promise<{ token?: string; err?: string }>
}) {
  const { token, err } = await searchParams
  if (!token) redirect('/login')

  const inspection = await inspectInvite(token)
  if (!inspection) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-accent text-lg mb-4">invite invalid or expired</h1>
        <div className="rule mb-6" />
        <p className="text-dim">ask the person who invited you to send a new one.</p>
      </main>
    )
  }

  const { invite, org } = inspection
  const account = await currentAccount()

  // If a session already exists, try to accept via that identity (email OR github).
  if (account) {
    const attempt = await acceptInviteByAccount(token, account)
    if (!('error' in attempt)) redirect(`/panel/team/${attempt.orgSlug}`)
  }

  const subjectLabel = inviteSubjectLabel(invite)
  const mismatched = account != null
  const ghNext = `/invites/accept?token=${token}`
  const emailAllowed = Boolean(invite.email) && emailEnabled()

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-accent text-lg mb-4">join {org.slug}</h1>
      <div className="rule mb-6" />
      <p className="mb-2">
        you've been invited to join <span className="text-accent">{org.slug}</span> as{' '}
        <span className="text-accent">{invite.role}</span>.
      </p>
      <p className="text-dim mb-6">
        this invite is for <span className="text-fg">{subjectLabel}</span>.
      </p>

      {mismatched ? (
        <p className="text-red-400 mb-4">
          ✘ you're signed in as {account!.email}
          {account!.fullUsername.startsWith('gh/') ? ` (${account!.fullUsername})` : ''}, which
          doesn't match this invite.{' '}
          <a href="/api/panel/logout" className="underline">sign out</a> and try again.
        </p>
      ) : null}
      {err ? <p className="text-red-400 mb-4">✘ {err}</p> : null}

      {emailAllowed ? (
        <form action={accept} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <button className="border border-accent text-accent px-4 py-2 hover:bg-accent/10">
            send sign-in link to {invite.email}
          </button>
          <p className="text-dim text-xs">
            only the owner of this inbox can finish signing in.
          </p>
        </form>
      ) : invite.githubUsername || (invite.email && githubEnabled()) ? (
        <p className="text-dim mb-6">
          {invite.email && !emailEnabled()
            ? 'email sign-in is disabled on this server. accept via github below (your github primary email must match).'
            : 'this invite requires github. use the button below.'}
        </p>
      ) : (
        <p className="text-dim mb-6">
          no sign-in providers are configured on this server. ask an admin to enable email or
          github before accepting.
        </p>
      )}

      {githubEnabled() ? (
        <>
          <div className="rule my-8" />
          <a
            href={`/login/github?next=${encodeURIComponent(ghNext)}`}
            className="inline-block border border-rule px-4 py-2 hover:border-accent hover:text-accent"
          >
            accept with github
          </a>
          <p className="text-dim text-xs mt-2">
            {invite.githubUsername
              ? `your github account must be @${invite.githubUsername}.`
              : `your github primary email must be ${invite.email}.`}
          </p>
        </>
      ) : null}
    </main>
  )
}
