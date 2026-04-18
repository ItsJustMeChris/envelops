import { notFound } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { listSecretsForOrg } from '@/lib/services/secrets'

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
      <div>
        <h2 className="mb-2">secrets</h2>
        <p className="text-dim">ø no secrets yet</p>
        <p className="text-dim mt-2">create one from your cli: <code>dotenvx-ops set dotenvx://rot_… &lt;value&gt;</code></p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-4">secrets</h2>
      <ul className="space-y-1">
        {rows.map((s, i) => (
          <li key={s.id} className="grid grid-cols-[3rem_1fr_10rem] gap-4">
            <span className="text-dim">{String(i + 1).padStart(3, '0')}.</span>
            <span className="text-accent truncate">{s.uri}</span>
            <span className="text-dim text-xs text-right">{s.updatedAt.toISOString()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
