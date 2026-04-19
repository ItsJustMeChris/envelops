import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { assertCanAccessProject } from '@/lib/services/projects'
import { latestFilesForProject } from '@/lib/services/sync'
import { getDb } from '@/lib/db/client'
import { projects as projectsTable } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function FilesPage({
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

  const files = await latestFilesForProject(project.id)

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/panel/team/${slug}/projects/${projectId}`} className="text-dim text-xs">
          ← back to project
        </Link>
        <h2 className="mt-2">files</h2>
        <p className="text-dim text-xs mt-1">
          latest version of every synced file. contents are stored exactly as the cli sent
          them — still dotenvx-ciphertext if they were encrypted locally.
        </p>
      </div>

      {files.length === 0 ? (
        <p className="text-dim">
          ø no files synced yet. run <code>dotenvx-ops sync</code> in a project dir with your{' '}
          <code>.env.x</code> pointing at this project.
        </p>
      ) : (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={f.id}
              className="grid grid-cols-[3rem_1fr_1fr_6rem_6rem] gap-4 items-center"
            >
              <span className="text-dim">{String(i + 1).padStart(3, '0')}.</span>
              <Link
                className="text-accent truncate"
                href={`/panel/team/${slug}/projects/${projectId}/files/${encodeURIComponent(f.filepath)}`}
              >
                {f.filepath}
              </Link>
              <span className="text-dim text-xs truncate">{f.envUri}</span>
              <span className="text-dim text-xs">{f.createdAt.toISOString().slice(0, 10)}</span>
              <Link
                href={`/panel/team/${slug}/projects/${projectId}/files/${encodeURIComponent(f.filepath)}/raw/${f.id}`}
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
