CREATE TABLE `invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`email` text NOT NULL,
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
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `invites_hash_idx` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_org_idx` ON `invites` (`org_id`);--> statement-breakpoint
CREATE TABLE `rotation_connectors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`provider` text NOT NULL,
	`label` text,
	`encrypted_credentials` text,
	`master_key_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rotation_connectors_org_idx` ON `rotation_connectors` (`org_id`);--> statement-breakpoint
CREATE TABLE `rotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`connector_id` integer,
	`uid` text NOT NULL,
	`uri` text NOT NULL,
	`secret_id` integer,
	`last_rotated_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connector_id`) REFERENCES `rotation_connectors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rotations_uid_unique` ON `rotations` (`uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `rotations_uid_idx` ON `rotations` (`uid`);--> statement-breakpoint
CREATE INDEX `rotations_org_idx` ON `rotations` (`org_id`);