CREATE TABLE `sync_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_backup_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`org_id` integer NOT NULL,
	`filepath` text NOT NULL,
	`env_uri` text NOT NULL,
	`encrypted_content` text NOT NULL,
	`master_key_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sync_backup_id`) REFERENCES `sync_backups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_files_env_uri_unique` ON `sync_files` (`env_uri`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_files_env_uri_idx` ON `sync_files` (`env_uri`);--> statement-breakpoint
CREATE INDEX `sync_files_project_filepath_idx` ON `sync_files` (`project_id`,`filepath`);--> statement-breakpoint
CREATE INDEX `sync_files_sync_idx` ON `sync_files` (`sync_backup_id`);