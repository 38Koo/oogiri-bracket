-- void:allow-destructive
-- ルームの中に「試合 (games)」を持てるようにする。
-- 既存のルームは、そのお題・状態・優勝をそのまま第 1 試合として games に移し、回答と対戦をそこに紐付ける。
-- rooms から移した列 (topic など) だけを削除する。データは games に残る。
PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`number` integer NOT NULL,
	`topic` text NOT NULL,
	`max_answers_per_participant` integer,
	`status` text DEFAULT 'collecting' NOT NULL,
	`champion_answer_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_room_number_uq` ON `games` (`room_id`,`number`);
--> statement-breakpoint
INSERT INTO `games` (`room_id`, `number`, `topic`, `max_answers_per_participant`, `status`, `champion_answer_id`, `created_at`, `started_at`, `finished_at`)
SELECT `id`, 1, `topic`, `max_answers_per_participant`, `status`, `champion_answer_id`, `created_at`, `started_at`, `finished_at` FROM `rooms`;
--> statement-breakpoint
CREATE TABLE `__new_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`game_id` integer NOT NULL,
	`participant_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_answers` (`id`, `room_id`, `game_id`, `participant_id`, `text`, `created_at`)
SELECT a.`id`, a.`room_id`, g.`id`, a.`participant_id`, a.`text`, a.`created_at`
FROM `answers` a JOIN `games` g ON g.`room_id` = a.`room_id` AND g.`number` = 1;
--> statement-breakpoint
DROP TABLE `answers`;
--> statement-breakpoint
ALTER TABLE `__new_answers` RENAME TO `answers`;
--> statement-breakpoint
CREATE INDEX `answers_game_idx` ON `answers` (`game_id`);
--> statement-breakpoint
CREATE TABLE `__new_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`game_id` integer NOT NULL,
	`round` integer NOT NULL,
	`slot` integer NOT NULL,
	`answer_a_id` integer,
	`answer_b_id` integer,
	`winner_answer_id` integer,
	`next_slot` integer,
	`next_side` text,
	`prob_a` real,
	`judge` text,
	`judged_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- 旧形式の表は「round r の slot s の勝者が round r+1 の slot s/2 の A(偶数)/B(奇数) に入る」決まりだったので、
-- その進出先を明示的な列に書き出す (決勝は null)。
INSERT INTO `__new_matches` (`id`, `room_id`, `game_id`, `round`, `slot`, `answer_a_id`, `answer_b_id`, `winner_answer_id`, `next_slot`, `next_side`, `prob_a`, `judge`, `judged_at`)
SELECT m.`id`, m.`room_id`, g.`id`, m.`round`, m.`slot`, m.`answer_a_id`, m.`answer_b_id`, m.`winner_answer_id`,
       CASE WHEN m.`round` = last.`max_round` THEN NULL ELSE m.`slot` / 2 END,
       CASE WHEN m.`round` = last.`max_round` THEN NULL WHEN m.`slot` % 2 = 0 THEN 'A' ELSE 'B' END,
       m.`prob_a`, m.`judge`, m.`judged_at`
FROM `matches` m
JOIN `games` g ON g.`room_id` = m.`room_id` AND g.`number` = 1
JOIN (SELECT `room_id`, max(`round`) AS `max_round` FROM `matches` GROUP BY `room_id`) last ON last.`room_id` = m.`room_id`;
--> statement-breakpoint
DROP TABLE `matches`;
--> statement-breakpoint
ALTER TABLE `__new_matches` RENAME TO `matches`;
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_game_round_slot_uq` ON `matches` (`game_id`,`round`,`slot`);
--> statement-breakpoint
ALTER TABLE `participants` ADD `removed_at` text;
--> statement-breakpoint
ALTER TABLE `rooms` ADD `last_activity_at` text DEFAULT '1970-01-01 00:00:00' NOT NULL;
--> statement-breakpoint
-- 既存ルームの最終操作は、最後に起きた出来事 (作成・開始・決着) の時刻とみなす
UPDATE `rooms` SET `last_activity_at` = coalesce(
  (SELECT max(coalesce(g.`finished_at`, g.`started_at`, g.`created_at`)) FROM `games` g WHERE g.`room_id` = `rooms`.`id`),
  `rooms`.`created_at`
);
--> statement-breakpoint
ALTER TABLE `rooms` DROP COLUMN `topic`;
--> statement-breakpoint
ALTER TABLE `rooms` DROP COLUMN `max_answers_per_participant`;
--> statement-breakpoint
ALTER TABLE `rooms` DROP COLUMN `status`;
--> statement-breakpoint
ALTER TABLE `rooms` DROP COLUMN `champion_answer_id`;
--> statement-breakpoint
ALTER TABLE `rooms` DROP COLUMN `started_at`;
--> statement-breakpoint
ALTER TABLE `rooms` DROP COLUMN `finished_at`;
