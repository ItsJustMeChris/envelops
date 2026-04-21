import { notFound } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { isAdminRole, resolveTeamForAccount, roleBasedPublicKey } from '@/lib/services/team-scope'
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
  const canReveal = isAdminRole(team.role)
  // Members only ever see the first 5 bytes of a public key in the panel. The full key
  // is what the CLI `/api/keypair` endpoint matches on, so withholding it means a member
  // can't bounce off the web UI to walk a keypair they don't already have via a project file.
  const displayKeys = keys.map((k) => ({
    ...k,
    publicKey: roleBasedPublicKey(k.publicKey, team.role)
  }))

  if (displayKeys.length === 0) {
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
        {displayKeys.map((k, i) => (
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
