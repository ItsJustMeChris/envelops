import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'

import { getDb } from '../db/client'
import {
  accounts,
  organizations,
  projects as projectsTable,
  syncBackups,
  syncFiles,
  type Project,
  type SyncFile
} from '../db/schema'
import { decryptWithMaster, encryptWithMaster } from '../crypto/master-key'
import { resolveOrCreateProject, assertCanAccessProject } from './projects'

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

export class SyncPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncPayloadError'
  }
}

interface DecodedFile {
  filepath: string
  src: string
}

const MAX_SYNC_FILES = 128
const MAX_SYNC_FILEPATH_BYTES = 1024
const MAX_SYNC_FILE_SRC_BYTES = 256 * 1024

function newEnvUri(): string {
  return `dotenvx://env_${randomBytes(16).toString('hex')}`
}

function decodeFiles(encoded: string): DecodedFile[] {
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as {
      files?: DecodedFile[]
    }
    if (!Array.isArray(payload?.files)) return []
    if (payload.files.length > MAX_SYNC_FILES) {
      throw new SyncPayloadError(`files exceeds ${MAX_SYNC_FILES} entries`)
    }
    return payload.files.filter(
      (f): f is DecodedFile =>
        typeof f?.filepath === 'string' && typeof f?.src === 'string' && f.filepath.length > 0
    ).map((f) => {
      if (Buffer.byteLength(f.filepath, 'utf8') > MAX_SYNC_FILEPATH_BYTES) {
        throw new SyncPayloadError(`filepath exceeds ${MAX_SYNC_FILEPATH_BYTES} bytes`)
      }
      if (Buffer.byteLength(f.src, 'utf8') > MAX_SYNC_FILE_SRC_BYTES) {
        throw new SyncPayloadError(`file src exceeds ${MAX_SYNC_FILE_SRC_BYTES} bytes`)
      }
      return f
    })
  } catch (error) {
    if (error instanceof SyncPayloadError) throw error
    return []
  }
}

export async function recordSyncBackup(
  input: SyncInput
): Promise<SyncResult & { _orgId: number; _projectId: number }> {
  const { db } = getDb()
  const files = decodeFiles(input.encoded)
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

  // Decompose the payload into per-file rows so each file is independently addressable
  // via a stable `dotenvx://env_<hex>` URI. The raw blob stays on syncBackups for
  // disaster recovery / audit.
  db.transaction((tx) => {
    for (const file of files) {
      const fileEnc = encryptWithMaster(file.src)
      // MAX(version)+1 inside a transaction — prevents two concurrent syncs of
      // the same (projectId, filepath) from reading the same max and colliding
      // on the same version number. The unique index on
      // (project_id, filepath, version) is the hard guarantee.
      const maxRow = tx
        .select({ max: sql<number | null>`max(${syncFiles.version})` })
        .from(syncFiles)
        .where(and(eq(syncFiles.projectId, project.id), eq(syncFiles.filepath, file.filepath)))
        .get()
      const version = (maxRow?.max ?? 0) + 1
      tx.insert(syncFiles)
        .values({
          syncBackupId: row.id,
          projectId: project.id,
          orgId: project.orgId,
          filepath: file.filepath,
          version,
          envUri: newEnvUri(),
          encryptedContent: fileEnc.ciphertext,
          masterKeyId: fileEnc.masterKeyId
        })
        .run()
    }
  })

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, project.orgId)
  })
  const projectUsernameName = `${org?.slug ?? 'org'}/${project.name ?? project.dotenvxProjectId}`
  const envXSrc = `DOTENVX_PROJECT_ID=${project.dotenvxProjectId}\n`

  // The commercial server returns the FULL latest state of the project (every
  // stored filepath, newest row per filepath), not just the files the client
  // uploaded. The CLI then writes each returned file back to disk, skipping
  // where `sha256File(local)` already matches. This lets a teammate with only
  // a minimal `.env.x` pull down `.env` too.
  const latest = await latestFilesForProject(project.id)
  const filesOut = latest.map((f) => {
    const src = unsealSyncFile(f)
    return {
      filepath: f.filepath,
      src,
      sha: createHash('sha256').update(src, 'utf8').digest('hex'),
      version: f.version
    }
  })

  return {
    id: row.id,
    dotenvx_project_id: project.dotenvxProjectId,
    project_username_name: projectUsernameName,
    project_env_x_src: envXSrc,
    files: filesOut,
    _orgId: project.orgId,
    _projectId: project.id
  }
}

export async function latestSyncStateForProject(
  dotenvxProjectId: string
): Promise<{ id: number; createdAt: Date } | null> {
  const { db } = getDb()
  const project = await db.query.projects.findFirst({
    where: (p, { eq }) => eq(p.dotenvxProjectId, dotenvxProjectId)
  })
  if (!project) return null
  const row = await db
    .select({ id: syncBackups.id, createdAt: syncBackups.createdAt })
    .from(syncBackups)
    .where(eq(syncBackups.projectId, project.id))
    .orderBy(desc(syncBackups.createdAt))
    .limit(1)
  return row[0] ?? null
}

/**
 * One row per unique filepath — the most recently synced copy. Used by the project
 * detail view to show what files exist.
 */
export async function latestFilesForProject(projectId: number): Promise<SyncFile[]> {
  const { db } = getDb()
  const all = await db
    .select()
    .from(syncFiles)
    .where(eq(syncFiles.projectId, projectId))
    .orderBy(desc(syncFiles.id))
  const seen = new Set<string>()
  const out: SyncFile[] = []
  for (const f of all) {
    if (seen.has(f.filepath)) continue
    seen.add(f.filepath)
    out.push(f)
  }
  return out
}

export async function versionsForFile(
  projectId: number,
  filepath: string
): Promise<SyncFile[]> {
  const { db } = getDb()
  return db
    .select()
    .from(syncFiles)
    .where(and(eq(syncFiles.projectId, projectId), eq(syncFiles.filepath, filepath)))
    .orderBy(desc(syncFiles.id))
}

export async function syncHistoryForProject(projectId: number) {
  const { db } = getDb()
  const rows = await db
    .select({
      id: syncBackups.id,
      kind: syncBackups.kind,
      gitBranch: syncBackups.gitBranch,
      cliVersion: syncBackups.cliVersion,
      createdAt: syncBackups.createdAt,
      username: accounts.username
    })
    .from(syncBackups)
    .leftJoin(accounts, eq(accounts.id, syncBackups.accountId))
    .where(eq(syncBackups.projectId, projectId))
    .orderBy(desc(syncBackups.createdAt))
  return rows
}

export async function getSyncFileByEnvUri(envUri: string): Promise<SyncFile | null> {
  const { db } = getDb()
  const row = await db.query.syncFiles.findFirst({ where: eq(syncFiles.envUri, envUri) })
  return row ?? null
}

/**
 * Look up a sync file by URI, enforce project access, and return the plaintext
 * (the raw content that was originally synced — still dotenvx-ciphertext if the
 * user synced encrypted files, plaintext if they synced unencrypted).
 */
export async function resolveEnvUriForAccount(input: {
  accountId: number
  envUri: string
}): Promise<{ file: SyncFile; content: string; project: Project } | { error: string }> {
  const file = await getSyncFileByEnvUri(input.envUri)
  if (!file) return { error: 'not_found' }

  const { db } = getDb()
  const project = await db.query.projects.findFirst({
    where: eq(projectsTable.id, file.projectId)
  })
  if (!project) return { error: 'not_found' }

  try {
    await assertCanAccessProject(input.accountId, project)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const content = Buffer.from(decryptWithMaster(file.encryptedContent)).toString('utf8')
  return { file, content, project }
}

export function unsealSyncFile(file: SyncFile): string {
  return Buffer.from(decryptWithMaster(file.encryptedContent)).toString('utf8')
}
