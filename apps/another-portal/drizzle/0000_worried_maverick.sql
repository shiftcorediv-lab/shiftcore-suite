CREATE TABLE `ap_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`schema_version` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`organization_id` text NOT NULL,
	`internal_user_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`received_at` text NOT NULL,
	`processed_at` text NOT NULL,
	CONSTRAINT "ap_events_schema_version_check" CHECK("ap_events"."schema_version" = 1),
	CONSTRAINT "ap_events_event_type_check" CHECK("ap_events"."event_type" IN ('attendance.started', 'attendance.ended'))
);
--> statement-breakpoint
CREATE INDEX `idx_ap_events_subject_occurred_at` ON `ap_events` (`organization_id`,`internal_user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `presence` (
	`organization_id` text NOT NULL,
	`internal_user_id` text NOT NULL,
	`employee_code` text NOT NULL,
	`display_name` text NOT NULL,
	`attendance_record_id` text NOT NULL,
	`attendance_state` text NOT NULL,
	`availability` text DEFAULT 'available' NOT NULL,
	`availability_message` text DEFAULT '' NOT NULL,
	`workplace_store_id` text,
	`workplace_label` text DEFAULT '' NOT NULL,
	`workplace_kind` text DEFAULT 'unknown' NOT NULL,
	`attendance_started_at` text NOT NULL,
	`attendance_ended_at` text,
	`last_ap_event_id` text NOT NULL,
	`last_ap_event_at` text NOT NULL,
	`connected_at` text,
	`last_seen_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `internal_user_id`),
	CONSTRAINT "presence_attendance_state_check" CHECK("presence"."attendance_state" IN ('working', 'ended')),
	CONSTRAINT "presence_availability_check" CHECK("presence"."availability" IN ('available', 'focus', 'break', 'do_not_disturb')),
	CONSTRAINT "presence_workplace_kind_check" CHECK("presence"."workplace_kind" IN ('unknown', 'office', 'store', 'remote'))
);
--> statement-breakpoint
CREATE INDEX `idx_presence_organization_state` ON `presence` (`organization_id`,`attendance_state`);