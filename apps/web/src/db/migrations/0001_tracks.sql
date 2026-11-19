CREATE TABLE `track_points` (
	`track_id` text NOT NULL,
	`seq` integer NOT NULL,
	`t` integer NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`speed_kn` real,
	`course_deg` real,
	PRIMARY KEY(`track_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`server_version` integer,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`distance_nm` real DEFAULT 0 NOT NULL,
	`point_count` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tracks_started_at_idx` ON `tracks` (`started_at`);