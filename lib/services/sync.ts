import { desc, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { organizations, syncBackups, type Project } from '../db/schema'
import { encryptWithMaster } from '../crypto/master-key'
import { resolveOrCreateProject } from './projects'

export interface SyncInput {
  accountId: number
  deviceId?: number | null
  orgSlug?: string | null
  dotenvxProjectId?: string | null
  encoded: string
  pwd?: string | null
  gitUrl?: string | null
  gitBranch?: string | null
  cliVersion?: string | null
  kind: 'sync' | 'backup'
}

export interface SyncResult {
  id: number
  dotenvx_project_id: string
  project_username_name: string
  project_env_x_src: string
  files: unknown
}

export async function recordSyncBackup(input: SyncInput): Promise<SyncResult & { _orgId: number; _projectId: number }> {
  const { db } = getDb()
  const project: Project = await resolveOrCreateProject({
    accountId: input.accountId,
    dotenvxProjectId: input.dotenvxProjectId ?? null,
    orgSlug: input.orgSlug ?? null,
    cwdName: input.pwd?.split('/').pop() ?? null
  })
  const enc = encryptWithMaster(input.encoded)
  const inserted = await db
    .insert(syncBackups)
    .values({
      orgId: project.orgId,
      projectId: project.id,
      accountId: input.accountId,
      deviceId: input.deviceId ?? null,
      encryptedBlob: enc.ciphertext,
      masterKeyId: enc.masterKeyId,
      gitUrl: input.gitUrl ?? null,
      gitBranch: input.gitBranch ?? null,
      pwd: input.pwd ?? null,
      cliVersion: input.cliVersion ?? null,
      kind: input.kind
    })
    .returning()
  const row = inserted[0]

  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, project.orgId) })
  const projectUsernameName = `${org?.slug ?? 'org'}/${project.name ?? project.dotenvxProjectId}`
  const envXSrc = `DOTENVX_PROJECT_ID=${project.dotenvxProjectId}\n`

  return {
    id: row.id,
    dotenvx_project_id: project.dotenvxProjectId,
    project_username_name: projectUsernameName,
    project_env_x_src: envXSrc,
    files: tryDecodeFiles(input.encoded),
    _orgId: project.orgId,
    _projectId: project.id
  }
}

function tryDecodeFiles(encoded: string): unknown {
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    return payload?.files ?? null
  } catch {
    return null
  }
}

export async function latestSyncStateForProject(dotenvxProjectId: string): Promise<{ id: number; createdAt: Date } | null> {
  const { db } = getDb()
  const project = await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.dotenvxProjectId, dotenvxProjectId) })
  if (!project) return null
  const row = await db
    .select({ id: syncBackups.id, createdAt: syncBackups.createdAt })
    .from(syncBackups)
    .where(eq(syncBackups.projectId, project.id))
    .orderBy(desc(syncBackups.createdAt))
    .limit(1)
  return row[0] ?? null
}
