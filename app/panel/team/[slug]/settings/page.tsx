import { notFound } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'

export const dynamic = 'force-dynamic'

export default async function TeamSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()

  return (
    <div className="space-y-3">
      <h2 className="mb-4">settings</h2>
      <dl className="grid grid-cols-[7rem_1fr] sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-2">
        <dt className="text-dim">slug</dt><dd className="break-all">{team.org.slug}</dd>
        <dt className="text-dim">name</dt><dd className="break-all">{team.org.name ?? team.org.slug}</dd>
        <dt className="text-dim">contact email</dt><dd className="break-all">{team.org.contactEmail ?? '—'}</dd>
        <dt className="text-dim">provider</dt><dd>{team.org.provider}</dd>
        <dt className="text-dim">created</dt><dd className="break-all">{team.org.createdAt.toISOString()}</dd>
        <dt className="text-dim">your role</dt><dd>{team.role}</dd>
      </dl>
    </div>
  )
}
