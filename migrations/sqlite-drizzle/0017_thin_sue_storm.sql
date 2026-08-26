CREATE TABLE `transcription_prompt_template` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`built_in` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transcription_prompt_template_order_key_idx` ON `transcription_prompt_template` (`order_key`);--> statement-breakpoint
CREATE TABLE `transcription_record` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`audio_path` text NOT NULL,
	`audio_managed` integer NOT NULL,
	`duration_ms` integer,
	`language` text,
	`backend` text,
	`provider_id` text,
	`model_id` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`error_summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transcription_record_created_at_idx` ON `transcription_record` (`created_at`);--> statement-breakpoint
CREATE INDEX `transcription_record_status_created_at_idx` ON `transcription_record` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `transcription_result` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`transcript_text` text NOT NULL,
	`segments_json` text NOT NULL,
	`organization_template_id` text,
	`organization_prompt_snapshot` text,
	`organization_output` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `transcription_record`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transcription_result_record_id_idx` ON `transcription_result` (`record_id`);