CREATE TABLE `secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`project_id` integer,
	`uri` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`master_key_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_uri_idx` ON `secrets` (`uri`);--> statement-breakpoint
CREATE INDEX `secrets_org_idx` ON `secrets` (`org_id`);--> statement-breakpoint
CREATE TABLE `sync_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`project_id` integer,
	`account_id` integer,
	`device_id` integer,
	`encrypted_blob` text NOT NULL,
	`master_key_id` text NOT NULL,
	`git_url` text,
	`git_branch` text,
	`pwd` text,
	`cli_version` text,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sync_backups_project_idx` ON `sync_backups` (`project_id`,`created_at`);