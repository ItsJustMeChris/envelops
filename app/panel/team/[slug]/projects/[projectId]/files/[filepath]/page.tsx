import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { assertCanAccessProject } from '@/lib/services/projects'
import { versionsForFile } from '@/lib/services/sync'
import { getDb } from '@/lib/db/client'
import { projects as projectsTable } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function FileVersionsPage({
  params
}: {
  params: Promise<{ slug: string; projectId: string; filepath: string }>
}) {
  const { slug, projectId, filepath: raw } = await params
  const filepath = decodeURIComponent(raw)
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

  const versions = await versionsForFile(project.id, filepath)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/panel/team/${slug}/projects/${projectId}/files`}
          className="text-dim text-xs"
        >
          ← back to files
        </Link>
        <h2 className="mt-2">{filepath}</h2>
        <p className="text-dim text-xs mt-1">
          version history — newest first. retrieve any version via{' '}
          <code>dotenvx-ops get &lt;env_uri&gt;</code>.
        </p>
      </div>

      {versions.length === 0 ? (
        <p className="text-dim">ø no versions recorded</p>
      ) : (
        <ul className="space-y-1">
          {versions.map((v) => (
            <li
              key={v.id}
              className="grid grid-cols-[3rem_1fr_8rem_6rem] gap-4 items-center"
            >
              <span className="text-dim">v{v.version}</span>
              <span className="text-dim text-xs truncate">{v.envUri}</span>
              <span className="text-dim text-xs">
                {v.createdAt.toISOString().replace('T', ' ').slice(0, 16)}
              </span>
              <Link
                href={`/panel/team/${slug}/projects/${projectId}/files/${encodeURIComponent(filepath)}/raw/${v.id}`}
                className="text-dim hover:text-fg underline text-xs text-right"
              >
                [details]
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
