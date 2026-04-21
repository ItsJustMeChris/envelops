import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const now = sql`(unixepoch())`

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  fullUsername: text('full_username').notNull(),
  provider: text('provider').notNull().default('local'),
  providerRef: text('provider_ref'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
})

export const organizations = sqliteTable(
  'organizations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    name: text('name'),
    contactEmail: text('contact_email'),
    provider: text('provider').notNull().default('manual'),
    providerRef: text('provider_ref'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    slugIdx: uniqueIndex('org_slug_idx').on(t.slug)
  })
)

export const memberships = sqliteTable(
  'memberships',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    unique: uniqueIndex('memberships_account_org_idx').on(t.accountId, t.orgId),
    byOrg: index('memberships_org_idx').on(t.orgId)
  })
)

export const devices = sqliteTable(
  'devices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    systemInfo: text('system_info', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    unique: uniqueIndex('devices_account_pubkey_idx').on(t.accountId, t.publicKey)
  })
)

export const tokens = sqliteTable(
  'tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    deviceId: integer('device_id').references(() => devices.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull().unique(),
    scope: text('scope').notNull().default('cli'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byHash: uniqueIndex('tokens_hash_idx').on(t.tokenHash)
  })
)

export const oauthDeviceCodes = sqliteTable(
  'oauth_device_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deviceCode: text('device_code').notNull().unique(),
    userCode: text('user_code').notNull().unique(),
    devicePublicKey: text('device_public_key').notNull(),
    systemInfo: text('system_info', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    approvedAt: integer('approved_at', { mode: 'timestamp' }),
    consumedAt: integer('consumed_at', { mode: 'timestamp' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byUserCode: uniqueIndex('oauth_user_code_idx').on(t.userCode)
  })
)

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dotenvxProjectId: text('dotenvx_project_id').notNull().unique(),
    name: text('name'),
    // `team`       = any member of the org has access (the team-wide default)
    // `restricted` = only members listed in project_access (owners/admins override)
    visibility: text('visibility', { enum: ['team', 'restricted'] }).notNull().default('team'),
    createdBy: integer('created_by').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byOrg: index('projects_org_idx').on(t.orgId),
    // Names are unique per-org (null allowed multiple times, which is standard SQLite
    // behavior — id-only rows never minted by the UI don't collide).
    byOrgName: uniqueIndex('projects_org_name_idx').on(t.orgId, t.name),
    visibilityCheck: check(
      'projects_visibility_check',
      sql`${t.visibility} IN ('team', 'restricted')`
    )
  })
)

export const projectAccess = sqliteTable(
  'project_access',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    unique: uniqueIndex('project_access_project_account_idx').on(t.projectId, t.accountId),
    byProject: index('project_access_project_idx').on(t.projectId)
  })
)

export const keypairs = sqliteTable(
  'keypairs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publicKey: text('public_key').notNull(),
    encryptedPrivateKey: text('encrypted_private_key').notNull(),
    masterKeyId: text('master_key_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byPub: uniqueIndex('keypairs_pubkey_idx').on(t.publicKey),
    byOrg: index('keypairs_org_idx').on(t.orgId)
  })
)

export const invites = sqliteTable(
  'invites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Subject identifiers — at least one must be set. Captured at creation time so
    // acceptance flows can verify via either channel.
    email: text('email'),
    githubUsername: text('github_username'),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: integer('invited_by').references(() => accounts.id, { onDelete: 'set null' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byHash: uniqueIndex('invites_hash_idx').on(t.tokenHash),
    byOrg: index('invites_org_idx').on(t.orgId)
  })
)

export const rotationConnectors = sqliteTable(
  'rotation_connectors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['manual', 'github', 'npm', 'openai'] }).notNull(),
    label: text('label'),
    encryptedCredentials: text('encrypted_credentials'),
    masterKeyId: text('master_key_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byOrg: index('rotation_connectors_org_idx').on(t.orgId)
  })
)

export const rotations = sqliteTable(
  'rotations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectorId: integer('connector_id').references(() => rotationConnectors.id, { onDelete: 'set null' }),
    uid: text('uid').notNull().unique(),
    uri: text('uri').notNull(),
    secretId: integer('secret_id'),
    lastRotatedAt: integer('last_rotated_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byUid: uniqueIndex('rotations_uid_idx').on(t.uid),
    byOrg: index('rotations_org_idx').on(t.orgId)
  })
)

export const secrets = sqliteTable(
  'secrets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    uri: text('uri').notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    masterKeyId: text('master_key_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byUri: uniqueIndex('secrets_uri_idx').on(t.uri),
    byOrg: index('secrets_org_idx').on(t.orgId)
  })
)

export const syncFiles = sqliteTable(
  'sync_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    syncBackupId: integer('sync_backup_id')
      .notNull()
      .references(() => syncBackups.id, { onDelete: 'cascade' }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    filepath: text('filepath').notNull(),
    // Monotonic per-(projectId, filepath) counter starting at 1. Assigned at
    // insert time and surfaced in the sync response so clients can detect stale
    // local state. Matches the `version` field the commercial server emits.
    version: integer('version').notNull().default(1),
    // `env_<hex>` URI addressable via POST /api/get
    envUri: text('env_uri').notNull().unique(),
    encryptedContent: text('encrypted_content').notNull(),
    masterKeyId: text('master_key_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byEnvUri: uniqueIndex('sync_files_env_uri_idx').on(t.envUri),
    byProjectFilepath: index('sync_files_project_filepath_idx').on(t.projectId, t.filepath),
    // Belt-and-suspenders against two concurrent syncs producing the same
    // version number for a (projectId, filepath). Transaction serialization
    // is the primary defense; this index guarantees the DB refuses a dupe.
    byProjectFilepathVersion: uniqueIndex('sync_files_project_filepath_version_idx').on(
      t.projectId,
      t.filepath,
      t.version
    ),
    bySync: index('sync_files_sync_idx').on(t.syncBackupId)
  })
)

export const syncBackups = sqliteTable(
  'sync_backups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    deviceId: integer('device_id').references(() => devices.id, { onDelete: 'set null' }),
    encryptedBlob: text('encrypted_blob').notNull(),
    masterKeyId: text('master_key_id').notNull(),
    gitUrl: text('git_url'),
    gitBranch: text('git_branch'),
    pwd: text('pwd'),
    cliVersion: text('cli_version'),
    kind: text('kind').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byProject: index('sync_backups_project_idx').on(t.projectId, t.createdAt)
  })
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byHash: uniqueIndex('sessions_hash_idx').on(t.tokenHash)
  })
)

export const loginLinks = sqliteTable(
  'login_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    consumedAt: integer('consumed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byHash: uniqueIndex('login_links_hash_idx').on(t.tokenHash)
  })
)

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orgId: integer('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    deviceId: integer('device_id').references(() => devices.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    rawEncoded: text('raw_encoded'),
    gitUrl: text('git_url'),
    gitBranch: text('git_branch'),
    pwd: text('pwd'),
    systemUuid: text('system_uuid'),
    osPlatform: text('os_platform'),
    osArch: text('os_arch'),
    cliVersion: text('cli_version'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
  },
  (t) => ({
    byOrg: index('audit_org_created_idx').on(t.orgId, t.createdAt),
    byKind: index('audit_kind_idx').on(t.kind)
  })
)

export type Account = typeof accounts.$inferSelect
export type Organization = typeof organizations.$inferSelect
export type Membership = typeof memberships.$inferSelect
export type Device = typeof devices.$inferSelect
export type Token = typeof tokens.$inferSelect
export type OAuthDeviceCode = typeof oauthDeviceCodes.$inferSelect
export type Project = typeof projects.$inferSelect
export type ProjectAccess = typeof projectAccess.$inferSelect
export type Keypair = typeof keypairs.$inferSelect
export type AuditEvent = typeof auditEvents.$inferSelect
export type Session = typeof sessions.$inferSelect
export type LoginLink = typeof loginLinks.$inferSelect
export type Secret = typeof secrets.$inferSelect
export type SyncBackup = typeof syncBackups.$inferSelect
export type SyncFile = typeof syncFiles.$inferSelect
export type Invite = typeof invites.$inferSelect
export type RotationConnector = typeof rotationConnectors.$inferSelect
export type Rotation = typeof rotations.$inferSelect
