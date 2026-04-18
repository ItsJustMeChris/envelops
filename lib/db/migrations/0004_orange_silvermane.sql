PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`email` text,
	`github_username` text,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` integer,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_invites`("id", "org_id", "email", "role", "token_hash", "invited_by", "expires_at", "accepted_at", "revoked_at", "created_at") SELECT "id", "org_id", "email", "role", "token_hash", "invited_by", "expires_at", "accepted_at", "revoked_at", "created_at" FROM `invites`;--> statement-breakpoint
DROP TABLE `invites`;--> statement-breakpoint
ALTER TABLE `__new_invites` RENAME TO `invites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `invites_hash_idx` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_org_idx` ON `invites` (`org_id`);