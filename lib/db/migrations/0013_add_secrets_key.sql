-- Introduce `secrets.key` as the org-scoped lookup identifier. Until now the
-- `uri` column was the globally-unique lookup key; switching to (org_id, key)
-- lets two users have secrets with the same human name in their respective
-- personal orgs, and lets the new `envelops://<slug>/<key>` scheme route based
-- on the slug alone.
--
-- Backfill: existing rows have their `key` set equal to their `uri`, which
-- matches the new semantics for plain names and legacy server-minted URIs
-- (rot_<hex>/env_<hex>). New writes will set `key` explicitly.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` integer NOT NULL,
	`uri` text NOT NULL,
	`key` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`master_key_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_secrets`("id", "org_id", "uri", "key", "encrypted_value", "master_key_id", "created_at", "updated_at")
SELECT "id", "org_id", "uri", "uri", "encrypted_value", "master_key_id", "created_at", "updated_at" FROM `secrets`;--> statement-breakpoint
DROP TABLE `secrets`;--> statement-breakpoint
ALTER TABLE `__new_secrets` RENAME TO `secrets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_org_key_idx` ON `secrets` (`org_id`,`key`);--> statement-breakpoint
CREATE INDEX `secrets_org_idx` ON `secrets` (`org_id`);
