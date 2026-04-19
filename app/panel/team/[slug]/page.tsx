import { notFound } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { listKeypairsForOrg } from '@/lib/services/keystore'
import { KeyRow } from './key-row'

export const dynamic = 'force-dynamic'

export default async function KeysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()
  const keys = await listKeypairsForOrg(team.org.id)
  const canReveal = team.role === 'owner' || team.role === 'admin'

  if (keys.length === 0) {
    return (
      <div>
        <h2 className="mb-2">private keys</h2>
        <p className="text-dim">ø no private keys yet</p>
        <p className="text-dim mt-2">start generating private keys off-computer via your cli.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-4">private keys</h2>
      <ul className="space-y-2">
        {keys.map((k, i) => (
          <KeyRow
            key={k.id}
            index={i + 1}
            publicKey={k.publicKey}
            createdAt={k.createdAt.toISOString()}
            canReveal={canReveal}
          />
        ))}
      </ul>
    </div>
  )
}
