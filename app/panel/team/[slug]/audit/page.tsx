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
        <ul className="space-y-3 md:space-y-1 text-sm">
          <li className="hidden md:grid md:grid-cols-[14rem_10rem_10rem_1fr] md:gap-4 text-dim text-xs uppercase tracking-wide">
            <span>when</span>
            <span>kind</span>
            <span>user</span>
            <span>payload</span>
          </li>
          {events.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[1fr_auto] gap-x-3 md:grid-cols-[14rem_10rem_10rem_1fr] md:gap-4 md:items-center border-b border-rule pb-2 last:border-0 md:border-0 md:pb-0"
            >
              <span className="text-dim text-xs md:text-sm md:order-1 col-span-2 md:col-span-1 break-all">
                {e.createdAt.toISOString()}
              </span>
              <span className="text-accent md:order-2">{e.kind}</span>
              <span className="text-dim truncate min-w-0 md:order-3 text-right md:text-left">
                {e.username ?? '—'}
              </span>
              <span className="text-dim text-xs md:text-sm md:order-4 col-span-2 md:col-span-1 break-all min-w-0">
                {e.payload ? JSON.stringify(e.payload) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
