import { desc, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { auditEvents, type AuditEvent } from '../db/schema'

export async function recordAudit(input: {
  orgId?: number | null
  accountId?: number | null
  deviceId?: number | null
  kind: string
  payload?: Record<string, unknown> | null
  rawEncoded?: string | null
  gitUrl?: string | null
  gitBranch?: string | null
  pwd?: string | null
  systemUuid?: string | null
  osPlatform?: string | null
  osArch?: string | null
  cliVersion?: string | null
}): Promise<void> {
  const { db } = getDb()
  await db.insert(auditEvents).values({
    orgId: input.orgId ?? null,
    accountId: input.accountId ?? null,
    deviceId: input.deviceId ?? null,
    kind: input.kind,
    payload: input.payload ?? null,
    rawEncoded: input.rawEncoded ?? null,
    gitUrl: input.gitUrl ?? null,
    gitBranch: input.gitBranch ?? null,
    pwd: input.pwd ?? null,
    systemUuid: input.systemUuid ?? null,
    osPlatform: input.osPlatform ?? null,
    osArch: input.osArch ?? null,
    cliVersion: input.cliVersion ?? null
  })
}

export async function listAuditForOrg(orgId: number, limit = 100): Promise<AuditEvent[]> {
  const { db } = getDb()
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit)
}
