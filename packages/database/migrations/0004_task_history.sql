CREATE TABLE `anonymous_users` (
	`id` text PRIMARY KEY NOT NULL,
	`session_hash` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generation_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_type` text NOT NULL,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `anonymous_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_generation_tasks_user_created` ON `generation_tasks` (`user_id`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_generation_tasks_user_type_created` ON `generation_tasks` (`user_id`, `task_type`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `task_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`role` text NOT NULL,
	`r2_key` text NOT NULL UNIQUE,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `generation_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_task_assets_task` ON `task_assets` (`task_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_task_assets_expiry` ON `task_assets` (`expires_at`, `deleted_at`);
