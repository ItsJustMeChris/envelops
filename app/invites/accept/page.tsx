import { redirect } from 'next/navigation'

import {
  acceptInviteByAccount,
  acceptInviteByEmail,
  inspectInvite,
  inviteSubjectLabel
} from '@/lib/services/invites'
import { currentAccount, requestLoginLink } from '@/lib/services/panel-auth'
import { githubEnabled } from '@/lib/services/github-oauth'
import { emailEnabled } from '@/lib/services/email'

export const dynamic = 'force-dynamic'

async function accept(formData: FormData) {
  'use server'
  if (!emailEnabled()) redirect('/login')
  const token = String(formData.get('token') ?? '')
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!token || !email) redirect('/login')
  const result = await acceptInviteByEmail(token, email)
  if ('error' in result) redirect(`/invites/accept?token=${token}&err=${result.error}`)
  // They proved email intent — finish by signing them in via a login link.
  await requestLoginLink(email)
  redirect(`/login?sent=${encodeURIComponent(email)}&next=${encodeURIComponent(`/panel/team/${result.orgSlug}`)}`)
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
          <label className="block">
            <span className="text-dim">email</span>
            <input
              type="email"
              name="email"
              required
              defaultValue={invite.email ?? ''}
              className="mt-1 w-full bg-transparent border border-rule px-3 py-2"
            />
          </label>
          <button className="border border-accent text-accent px-4 py-2 hover:bg-accent/10">
            accept by email
          </button>
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
