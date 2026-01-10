CREATE TABLE `todo_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`due_date` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`vector_id` text
);
