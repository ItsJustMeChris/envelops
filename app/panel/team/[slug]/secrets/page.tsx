import { notFound } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { listSecretsForOrg } from '@/lib/services/secrets'
import { Terminal } from '@/app/components/terminal'

export const dynamic = 'force-dynamic'

export default async function SecretsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()
  const rows = await listSecretsForOrg(team.org.id)

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="mb-2">secrets</h2>
        <p className="text-dim">ø no secrets yet</p>
        <p className="text-dim">create one from your cli:</p>
        <Terminal title="dotenvx-ops set">
          <span className="text-dim">$ </span>dotenvx-ops set <span className="text-accent">dotenvx://rot_…</span> <span className="text-accent">&lt;value&gt;</span>
        </Terminal>
        <p className="text-dim">and read it back with:</p>
        <Terminal title="dotenvx-ops get">
          <span className="text-dim">$ </span>dotenvx-ops get <span className="text-accent">dotenvx://rot_…</span>
        </Terminal>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4">secrets</h2>
        <ul className="space-y-2 sm:space-y-1">
          {rows.map((s, i) => (
            <li
              key={s.id}
              className="grid grid-cols-[2.5rem_1fr] gap-x-3 sm:grid-cols-[3rem_1fr_10rem] sm:gap-4 sm:items-center"
            >
              <span className="text-dim">{String(i + 1).padStart(3, '0')}.</span>
              <span className="text-accent truncate min-w-0">{s.uri}</span>
              <span className="col-start-2 text-dim text-xs break-all sm:col-start-auto sm:text-right">
                {s.updatedAt.toISOString()}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <p className="text-dim text-xs">set or read a secret from your cli:</p>
        <Terminal title="dotenvx-ops set">
          <span className="text-dim">$ </span>dotenvx-ops set <span className="text-accent">dotenvx://rot_…</span> <span className="text-accent">&lt;value&gt;</span>
        </Terminal>
        <Terminal title="dotenvx-ops get">
          <span className="text-dim">$ </span>dotenvx-ops get <span className="text-accent">dotenvx://rot_…</span>
        </Terminal>
      </div>
    </div>
  )
}
