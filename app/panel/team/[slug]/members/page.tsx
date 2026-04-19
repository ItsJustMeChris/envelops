import { notFound, redirect } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import {
  canInviteWithRole,
  createInvite,
  getMemberRole,
  inviteSubjectLabel,
  listActiveInvitesForOrg,
  listMembers,
  requireOwnerOrAdmin,
  revokeInvite
} from '@/lib/services/invites'
import { baseUrl } from '@/lib/config'
import { InviteLinkBanner } from './invite-link'

export const dynamic = 'force-dynamic'

async function inviteAction(formData: FormData) {
  'use server'
  const slug = String(formData.get('slug'))
  const email = String(formData.get('email') ?? '').trim()
  const githubUsername = String(formData.get('github_username') ?? '').trim()
  const role = String(formData.get('role') ?? 'member') as 'owner' | 'admin' | 'member'

  const account = await currentAccount()
  if (!account) redirect('/login')
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) redirect('/panel')
  const ok = await requireOwnerOrAdmin({ accountId: account.id, orgId: team.org.id })
  if (!ok) redirect(`/panel/team/${slug}/members?error=forbidden`)

  if (!email && !githubUsername) {
    redirect(`/panel/team/${slug}/members?error=invite_requires_identifier`)
  }

  const allowedRole = await canInviteWithRole({
    actorId: account.id,
    orgId: team.org.id,
    targetRole: role
  })
  if (!allowedRole) {
    redirect(`/panel/team/${slug}/members?error=only_owners_can_promote`)
  }

  const { url } = await createInvite({
    orgId: team.org.id,
    email: email || null,
    githubUsername: githubUsername || null,
    role,
    invitedBy: account.id
  })
  // Pass the plaintext token back through the query once so the admin can grab the
  // link. Anyone who can already see this page is the creator — no extra exposure.
  const tokenParam = url.split('token=')[1] ?? ''
  redirect(
    `/panel/team/${slug}/members?invite_token=${encodeURIComponent(tokenParam)}` +
      (email ? `&invite_email=${encodeURIComponent(email)}` : '') +
      (githubUsername ? `&invite_github=${encodeURIComponent(githubUsername)}` : '')
  )
}

async function revokeAction(formData: FormData) {
  'use server'
  const slug = String(formData.get('slug'))
  const inviteId = Number(formData.get('invite_id'))
  const account = await currentAccount()
  if (!account) redirect('/login')
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) redirect('/panel')
  const ok = await requireOwnerOrAdmin({ accountId: account.id, orgId: team.org.id })
  if (!ok) redirect(`/panel/team/${slug}/members?error=forbidden`)
  await revokeInvite({ orgId: team.org.id, inviteId })
  redirect(`/panel/team/${slug}/members?revoked=${inviteId}`)
}

export default async function MembersPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    invite_token?: string
    invite_email?: string
    invite_github?: string
    error?: string
    revoked?: string
  }>
}) {
  const { slug } = await params
  const flash = await searchParams
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()

  const manageable = await requireOwnerOrAdmin({ accountId: account.id, orgId: team.org.id })
  const actorRole = await getMemberRole({ accountId: account.id, orgId: team.org.id })
  const canPromote = actorRole === 'owner'
  const [members, invitesList] = await Promise.all([
    listMembers(team.org.id),
    listActiveInvitesForOrg(team.org.id)
  ])

  const newInviteUrl = flash.invite_token
    ? `${baseUrl()}/invites/accept?token=${flash.invite_token}`
    : null
  const newInviteLabel = inviteSubjectLabel({
    email: flash.invite_email ?? null,
    githubUsername: flash.invite_github ?? null
  })

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4">members</h2>
        {newInviteUrl ? <InviteLinkBanner url={newInviteUrl} label={newInviteLabel} /> : null}
        {flash.revoked ? <p className="text-accent mb-4">✔ revoked invite #{flash.revoked}</p> : null}
        {flash.error ? <p className="text-red-400 mb-4">✘ {flash.error}</p> : null}

        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.accountId} className="grid grid-cols-[1fr_10rem_6rem] gap-4">
              <span>{m.email}</span>
              <span className="text-dim">{m.username}</span>
              <span className={m.role === 'owner' ? 'text-accent' : 'text-dim'}>{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      {manageable ? (
        <>
          <section>
            <h3 className="mb-4">invite</h3>
            <p className="text-dim text-xs mb-4">
              provide an email, a github username, or both. either identifier is enough to accept.
            </p>
            <form action={inviteAction} className="space-y-3">
              <input type="hidden" name="slug" value={slug} />
              <div className="grid grid-cols-[1fr_1fr_6rem_auto] gap-3">
                <input
                  name="email"
                  type="email"
                  placeholder="email (optional)"
                  className="bg-transparent border border-rule px-3 py-1.5"
                />
                <input
                  name="github_username"
                  placeholder="github username (optional)"
                  className="bg-transparent border border-rule px-3 py-1.5"
                  autoComplete="off"
                />
                <select
                  name="role"
                  defaultValue="member"
                  className="bg-transparent border border-rule px-2 py-1.5"
                >
                  <option value="member">member</option>
                  {canPromote ? <option value="admin">admin</option> : null}
                  {canPromote ? <option value="owner">owner</option> : null}
                </select>
                <button className="border border-accent text-accent px-4 py-1.5 hover:bg-accent/10">
                  create invite
                </button>
              </div>
              {!canPromote ? (
                <p className="text-dim text-xs">
                  only team owners can invite admins or owners. admins can invite plain members.
                </p>
              ) : null}
            </form>
          </section>

          <section>
            <h3 className="mb-4">pending invites</h3>
            {invitesList.length === 0 ? (
              <p className="text-dim">ø none pending</p>
            ) : (
              <ul className="space-y-1">
                {invitesList.map((inv) => (
                  <li
                    key={inv.id}
                    className="grid grid-cols-[1fr_6rem_10rem_5rem] gap-4 items-center"
                  >
                    <span>{inviteSubjectLabel(inv)}</span>
                    <span className="text-dim">{inv.role}</span>
                    <span className="text-dim text-xs">
                      expires {inv.expiresAt.toISOString().slice(0, 10)}
                    </span>
                    <form action={revokeAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="invite_id" value={inv.id} />
                      <button className="text-dim hover:text-fg underline text-xs">[revoke]</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-dim">only owners/admins can invite members.</p>
      )}
    </div>
  )
}
