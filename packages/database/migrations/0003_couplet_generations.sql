CREATE TABLE `couplet_generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`openid` text NOT NULL,
	`type` text NOT NULL,
	`mode` text NOT NULL,
	`names` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_openid` ON `couplet_generations` (`openid`);
--> statement-breakpoint
CREATE INDEX `idx_created_at` ON `couplet_generations` (`created_at`);
