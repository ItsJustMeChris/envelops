-- Dedupe project names within an org by appending -2, -3, ... in id order so the
-- new unique index below can be created against existing data without failing.
UPDATE `projects`
SET `name` = `projects`.`name` || '-' || (
  SELECT COUNT(*) + 1 FROM `projects` p2
  WHERE p2.`org_id` = `projects`.`org_id`
    AND p2.`name` = `projects`.`name`
    AND p2.`id` < `projects`.`id`
)
WHERE `projects`.`name` IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM `projects` p3
    WHERE p3.`org_id` = `projects`.`org_id`
      AND p3.`name` = `projects`.`name`
      AND p3.`id` < `projects`.`id`
  );--> statement-breakpoint
CREATE UNIQUE INDEX `projects_org_name_idx` ON `projects` (`org_id`,`name`);
