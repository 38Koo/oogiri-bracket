CREATE TABLE `answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `answers_room_idx` ON `answers` (`room_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`round` integer NOT NULL,
	`slot` integer NOT NULL,
	`answer_a_id` integer,
	`answer_b_id` integer,
	`winner_answer_id` integer,
	`prob_a` real,
	`judge` text,
	`judged_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_room_round_slot_uq` ON `matches` (`room_id`,`round`,`slot`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`nickname` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `participants_room_idx` ON `participants` (`room_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`host_participant_id` text NOT NULL,
	`status` text DEFAULT 'collecting' NOT NULL,
	`champion_answer_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`finished_at` text
);
