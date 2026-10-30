-- void:allow-destructive
-- 回答に「提出」を設ける。提出するまでは下書きで、トーナメントに出るのは提出した回答だけ。
-- これまでの回答は出した時点で確定していたので、すべて提出済みとみなす (全行の UPDATE なので destructive 扱いになる)。
ALTER TABLE `answers` ADD `submitted_at` text;
--> statement-breakpoint
UPDATE `answers` SET `submitted_at` = `created_at`;
