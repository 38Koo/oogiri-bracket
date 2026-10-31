-- void:allow-destructive
-- 試合ごとに審査のしかた (mode) と回答のルール (rules) を持たせる。
-- これまでの試合はお題への答えとしての質で審査していたので gachi とみなす (全行の UPDATE なので destructive 扱いになる)。
ALTER TABLE `games` ADD `mode` text DEFAULT 'oogiri' NOT NULL;
--> statement-breakpoint
ALTER TABLE `games` ADD `rules` text;
--> statement-breakpoint
UPDATE `games` SET `mode` = 'gachi';
