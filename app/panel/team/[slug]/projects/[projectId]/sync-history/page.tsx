import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { assertCanAccessProject } from '@/lib/services/projects'
import { syncHistoryForProject } from '@/lib/services/sync'
import { getDb } from '@/lib/db/client'
import { projects as projectsTable } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function SyncHistoryPage({
  params
}: {
  params: Promise<{ slug: string; projectId: string }>
}) {
  const { slug, projectId } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()

  const { db } = getDb()
  const project = await db.query.projects.findFirst({
    where: eq(projectsTable.dotenvxProjectId, projectId)
  })
  if (!project || project.orgId !== team.org.id) notFound()

  try {
    await assertCanAccessProject(account.id, project)
  } catch {
    notFound()
  }

  const history = await syncHistoryForProject(project.id)

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/panel/team/${slug}/projects/${projectId}`} className="text-dim text-xs">
          ← back to project
        </Link>
        <h2 className="mt-2">sync history</h2>
      </div>

      {history.length === 0 ? (
        <p className="text-dim">ø no syncs yet</p>
      ) : (
        <ul className="space-y-1">
          <li className="grid grid-cols-[4rem_6rem_10rem_8rem_6rem_8rem] gap-4 items-center text-dim text-xs uppercase tracking-wide">
            <span>#</span>
            <span>kind</span>
            <span>user</span>
            <span>branch</span>
            <span>cli</span>
            <span className="text-right">when</span>
          </li>
          {history.map((s) => (
            <li
              key={s.id}
              className="grid grid-cols-[4rem_6rem_10rem_8rem_6rem_8rem] gap-4 items-center"
            >
              <span className="text-dim">#{s.id}</span>
              <span className={s.kind === 'backup' ? 'text-dim' : 'text-accent'}>{s.kind}</span>
              <span className="text-dim text-xs truncate">{s.username ?? '—'}</span>
              <span className="text-dim text-xs truncate">{s.gitBranch ?? '—'}</span>
              <span className="text-dim text-xs truncate">{s.cliVersion ?? '—'}</span>
              <span className="text-dim text-xs text-right">
                {s.createdAt.toISOString().replace('T', ' ').slice(0, 16)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
