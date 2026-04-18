CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`full_username` text NOT NULL,
	`provider` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer,
	`account_id` integer,
	`device_id` integer,
	`kind` text NOT NULL,
	`payload` text,
	`raw_encoded` text,
	`git_url` text,
	`git_branch` text,
	`pwd` text,
	`system_uuid` text,
	`os_platform` text,
	`os_arch` text,
	`cli_version` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_org_created_idx` ON `audit_events` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_kind_idx` ON `audit_events` (`kind`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`public_key` text NOT NULL,
	`system_info` text,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_account_pubkey_idx` ON `devices` (`account_id`,`public_key`);--> statement-breakpoint
CREATE TABLE `keypairs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`project_id` integer,
	`account_id` integer,
	`public_key` text NOT NULL,
	`encrypted_private_key` text NOT NULL,
	`master_key_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keypairs_pubkey_idx` ON `keypairs` (`public_key`);--> statement-breakpoint
CREATE INDEX `keypairs_org_idx` ON `keypairs` (`org_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`org_id` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_account_org_idx` ON `memberships` (`account_id`,`org_id`);--> statement-breakpoint
CREATE INDEX `memberships_org_idx` ON `memberships` (`org_id`);--> statement-breakpoint
CREATE TABLE `oauth_device_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_code` text NOT NULL,
	`user_code` text NOT NULL,
	`device_public_key` text NOT NULL,
	`system_info` text,
	`account_id` integer,
	`approved_at` integer,
	`consumed_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_device_codes_device_code_unique` ON `oauth_device_codes` (`device_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_device_codes_user_code_unique` ON `oauth_device_codes` (`user_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_user_code_idx` ON `oauth_device_codes` (`user_code`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text,
	`contact_email` text,
	`provider` text DEFAULT 'manual' NOT NULL,
	`provider_ref` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_slug_idx` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`dotenvx_project_id` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_dotenvx_project_id_unique` ON `projects` (`dotenvx_project_id`);--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`org_id`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`device_id` integer,
	`token_hash` text NOT NULL,
	`scope` text DEFAULT 'cli' NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_token_hash_unique` ON `tokens` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_hash_idx` ON `tokens` (`token_hash`);