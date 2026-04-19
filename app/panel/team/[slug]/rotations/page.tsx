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
          <ul className="space-y-2 sm:space-y-1">
            {rotations.map((r, i) => (
              <li
                key={r.id}
                className="grid grid-cols-[2.5rem_1fr] gap-x-3 sm:grid-cols-[3rem_1fr_10rem_10rem] sm:gap-4 sm:items-center"
              >
                <span className="text-dim">{String(i + 1).padStart(3, '0')}.</span>
                <span className="text-accent truncate min-w-0">{r.uri}</span>
                <div className="col-start-2 flex flex-wrap gap-3 text-xs text-dim sm:contents">
                  <span>
                    {r.lastRotatedAt ? `rotated ${r.lastRotatedAt.toISOString().slice(0, 10)}` : '—'}
                  </span>
                  <span>created {r.createdAt.toISOString().slice(0, 10)}</span>
                </div>
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
          <ul className="space-y-2 sm:space-y-1">
            {connectors.map((c) => (
              <li
                key={c.id}
                className="grid grid-cols-[1fr_auto] gap-x-3 sm:grid-cols-[8rem_1fr_10rem] sm:gap-4 sm:items-center"
              >
                <span className="text-accent">{c.provider}</span>
                <span className="text-dim truncate min-w-0 text-right sm:text-left">{c.label ?? '—'}</span>
                <span className="col-span-2 text-dim text-xs sm:col-span-1">
                  created {c.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
