-- The `default` project concept is being removed: callers that arrived without
-- a dotenvxProjectId and without a cwd name used to silently mint/reuse a
-- team-wide `default` project. In practice every real CLI path supplies one
-- of those, so the fallback is dead code. Purge any rows that got created
-- before dropping the column (cascades to project_access / sync_backups /
-- sync_files / secrets per their FK rules).
DELETE FROM `projects` WHERE `is_default` = 1;--> statement-breakpoint
DROP INDEX `projects_org_default_idx`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `is_default`;
