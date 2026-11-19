CREATE TABLE `imported_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`server_version` integer,
	`name` text NOT NULL,
	`format` text NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`imported_at` integer NOT NULL,
	`hidden_features` text DEFAULT '[]' NOT NULL,
	`show_descriptions` integer DEFAULT false NOT NULL,
	`content` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `imported_layers_dirty_idx` ON `imported_layers` (`dirty`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route_points` (
	`position` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`waypoint_id` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waypoints` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`server_version` integer,
	`description` text DEFAULT '' NOT NULL,
	`recorded_at` integer NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`speed_kn` real DEFAULT 0 NOT NULL,
	`bearing` real DEFAULT 0 NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`visible` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `waypoints_recorded_at_idx` ON `waypoints` (`recorded_at`);--> statement-breakpoint
CREATE INDEX `waypoints_dirty_idx` ON `waypoints` (`dirty`);