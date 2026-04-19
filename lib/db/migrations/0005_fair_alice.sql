CREATE TABLE `project_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_access_project_account_idx` ON `project_access` (`project_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `project_access_project_idx` ON `project_access` (`project_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `visibility` text DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `is_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `created_by` integer REFERENCES accounts(id);--> statement-breakpoint
CREATE INDEX `projects_org_default_idx` ON `projects` (`org_id`,`is_default`);