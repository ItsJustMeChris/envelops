import { notFound } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { listAuditForOrg } from '@/lib/services/audit'

export const dynamic = 'force-dynamic'

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()
  const events = await listAuditForOrg(team.org.id, 100)

  return (
    <div>
      <h2 className="mb-4">audit</h2>
      {events.length === 0 ? (
        <p className="text-dim">ø no events yet</p>
      ) : (
        <ul className="space-y-1 text-sm">
          <li className="grid grid-cols-[14rem_10rem_10rem_1fr] gap-4 text-dim text-xs uppercase tracking-wide">
            <span>when</span>
            <span>kind</span>
            <span>user</span>
            <span>payload</span>
          </li>
          {events.map((e) => (
            <li key={e.id} className="grid grid-cols-[14rem_10rem_10rem_1fr] gap-4">
              <span className="text-dim">{e.createdAt.toISOString()}</span>
              <span className="text-accent">{e.kind}</span>
              <span className="text-dim truncate">{e.username ?? '—'}</span>
              <span className="text-dim truncate">{e.payload ? JSON.stringify(e.payload) : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
