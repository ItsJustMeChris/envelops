import { notFound } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { listConnectorsForOrg, listRotationsForOrg } from '@/lib/services/rotate'

export const dynamic = 'force-dynamic'

export default async function RotationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()

  const [rotations, connectors] = await Promise.all([
    listRotationsForOrg(team.org.id),
    listConnectorsForOrg(team.org.id)
  ])

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4">rotations</h2>
        {rotations.length === 0 ? (
          <p className="text-dim">ø no rotation references yet</p>
        ) : (
          <ul className="space-y-1">
            {rotations.map((r, i) => (
              <li key={r.id} className="grid grid-cols-[3rem_1fr_10rem_10rem] gap-4">
                <span className="text-dim">{String(i + 1).padStart(3, '0')}.</span>
                <span className="text-accent truncate">{r.uri}</span>
                <span className="text-dim text-xs">
                  {r.lastRotatedAt ? `rotated ${r.lastRotatedAt.toISOString().slice(0, 10)}` : '—'}
                </span>
                <span className="text-dim text-xs">created {r.createdAt.toISOString().slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-4">connectors</h3>
        {connectors.length === 0 ? (
          <p className="text-dim">
            ø no connectors. provider integrations (github, npm, openai) are stubbed — manual rotations
            work today, automated rotation lands in a future release.
          </p>
        ) : (
          <ul className="space-y-1">
            {connectors.map((c) => (
              <li key={c.id} className="grid grid-cols-[8rem_1fr_10rem] gap-4">
                <span className="text-accent">{c.provider}</span>
                <span className="text-dim">{c.label ?? '—'}</span>
                <span className="text-dim text-xs">created {c.createdAt.toISOString().slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
