import { getD1 } from './index';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ap_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    payload_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    internal_user_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    processed_at TEXT NOT NULL,
    CONSTRAINT ap_events_schema_version_check CHECK(schema_version = 1),
    CONSTRAINT ap_events_event_type_check CHECK(event_type IN ('attendance.started', 'attendance.ended'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ap_events_subject_occurred_at
    ON ap_events (organization_id, internal_user_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS presence (
    organization_id TEXT NOT NULL,
    internal_user_id TEXT NOT NULL,
    employee_code TEXT NOT NULL,
    display_name TEXT NOT NULL,
    attendance_record_id TEXT NOT NULL,
    attendance_state TEXT NOT NULL,
    availability TEXT DEFAULT 'available' NOT NULL,
    availability_message TEXT DEFAULT '' NOT NULL,
    workplace_store_id TEXT,
    workplace_label TEXT DEFAULT '' NOT NULL,
    workplace_kind TEXT DEFAULT 'unknown' NOT NULL,
    attendance_started_at TEXT NOT NULL,
    attendance_ended_at TEXT,
    last_ap_event_id TEXT NOT NULL,
    last_ap_event_at TEXT NOT NULL,
    connected_at TEXT,
    last_seen_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (organization_id, internal_user_id),
    CONSTRAINT presence_attendance_state_check CHECK(attendance_state IN ('working', 'ended')),
    CONSTRAINT presence_availability_check CHECK(availability IN ('available', 'focus', 'break', 'do_not_disturb')),
    CONSTRAINT presence_workplace_kind_check CHECK(workplace_kind IN ('unknown', 'office', 'store', 'remote'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_presence_organization_state
    ON presence (organization_id, attendance_state)`,
] as const;

let schemaInitialization: Promise<void> | null = null;

export function ensureIntegrationSchema(): Promise<void> {
  if (!schemaInitialization) {
    const d1 = getD1();
    schemaInitialization = d1
      .batch(SCHEMA_STATEMENTS.map((statement) => d1.prepare(statement)))
      .then(async () => {
        await d1.prepare('PRAGMA optimize').run();
      })
      .catch((error) => {
        schemaInitialization = null;
        throw error;
      });
  }

  return schemaInitialization;
}
