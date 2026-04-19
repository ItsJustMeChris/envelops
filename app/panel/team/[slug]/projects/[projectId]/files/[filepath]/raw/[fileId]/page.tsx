import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq, lt } from 'drizzle-orm'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import { assertCanAccessProject } from '@/lib/services/projects'
import { unsealSyncFile } from '@/lib/services/sync'
import { lineDiff } from '@/lib/services/line-diff'
import { getDb } from '@/lib/db/client'
import { projects as projectsTable, syncFiles } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function FileVersionMetaPage({
  params
}: {
  params: Promise<{ slug: string; projectId: string; filepath: string; fileId: string }>
}) {
  const { slug, projectId, filepath: raw, fileId } = await params
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

  const id = Number(fileId)
  if (!Number.isFinite(id)) notFound()
  const file = await db.query.syncFiles.findFirst({ where: eq(syncFiles.id, id) })
  if (!file || file.projectId !== project.id || file.filepath !== filepath) notFound()

  const content = unsealSyncFile(file)
  const previous = await db
    .select()
    .from(syncFiles)
    .where(
      and(
        eq(syncFiles.projectId, project.id),
        eq(syncFiles.filepath, filepath),
        lt(syncFiles.id, file.id)
      )
    )
    .orderBy(desc(syncFiles.id))
    .limit(1)
  const prior = previous[0] ?? null
  const diff = prior ? lineDiff(unsealSyncFile(prior), content) : null

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/panel/team/${slug}/projects/${projectId}/files/${encodeURIComponent(filepath)}`}
          className="text-dim text-xs"
        >
          ← back to {filepath}
        </Link>
        <h2 className="mt-2">
          {filepath} <span className="text-dim">v{file.version}</span>
        </h2>
        <p className="text-dim text-xs mt-1">
          decrypted server-side from the ciphertext at rest. if the file was encrypted with{' '}
          <code>dotenvx encrypt</code> before syncing, the contents are still dotenvx-ciphertext —
          decrypt with <code>dotenvx run</code> locally.
        </p>
      </div>

      <dl className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
        <dt className="text-dim">env_uri</dt>
        <dd className="text-accent break-all">{file.envUri}</dd>
        <dt className="text-dim">synced</dt>
        <dd>{file.createdAt.toISOString()}</dd>
        <dt className="text-dim">version</dt>
        <dd>v{file.version}</dd>
      </dl>

      <section>
        <h3 className="mb-2">contents</h3>
        <pre className="border border-rule px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all"><code>{content}</code></pre>
      </section>

      <section>
        <h3 className="mb-2">
          diff{' '}
          {prior ? (
            <span className="text-dim text-xs">
              vs v{prior.version}
            </span>
          ) : (
            <span className="text-dim text-xs">— initial version</span>
          )}
        </h3>
        {diff ? (
          <pre className="border border-rule px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all"><code>{diff.map((line, i) => {
            const prefix = line.op === 'add' ? '+ ' : line.op === 'del' ? '- ' : '  '
            const cls =
              line.op === 'add'
                ? 'text-accent'
                : line.op === 'del'
                ? 'text-dim line-through'
                : 'text-dim'
            return (
              <span key={i} className={cls}>
                {prefix}
                {line.text}
                {'\n'}
              </span>
            )
          })}</code></pre>
        ) : (
          <p className="text-dim text-xs">ø no earlier version to compare against</p>
        )}
      </section>

      <section>
        <h3 className="mb-2">fetch this version</h3>
        <pre className="border border-rule px-4 py-3 overflow-x-auto"><code><span className="text-dim">$ </span>dotenvx-ops get <span className="text-accent">{file.envUri}</span></code></pre>
      </section>
    </div>
  )
}
