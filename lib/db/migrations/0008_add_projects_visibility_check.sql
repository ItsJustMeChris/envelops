UPDATE `projects` SET `visibility` = 'team' WHERE `visibility` NOT IN ('team', 'restricted');--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`dotenvx_project_id` text NOT NULL,
	`name` text,
	`visibility` text DEFAULT 'team' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "projects_visibility_check" CHECK("__new_projects"."visibility" IN ('team', 'restricted'))
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "org_id", "dotenvx_project_id", "name", "visibility", "is_default", "created_by", "created_at") SELECT "id", "org_id", "dotenvx_project_id", "name", "visibility", "is_default", "created_by", "created_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_dotenvx_project_id_unique` ON `projects` (`dotenvx_project_id`);--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`org_id`);--> statement-breakpoint
CREATE INDEX `projects_org_default_idx` ON `projects` (`org_id`,`is_default`);