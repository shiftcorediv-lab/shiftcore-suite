import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const apEvents = sqliteTable(
  'ap_events',
  {
    eventId: text('event_id').primaryKey(),
    eventType: text('event_type').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    payloadHash: text('payload_hash').notNull(),
    payloadJson: text('payload_json').notNull(),
    organizationId: text('organization_id').notNull(),
    internalUserId: text('internal_user_id').notNull(),
    occurredAt: text('occurred_at').notNull(),
    receivedAt: text('received_at').notNull(),
    processedAt: text('processed_at').notNull(),
  },
  (table) => [
    check('ap_events_schema_version_check', sql`${table.schemaVersion} = 1`),
    check(
      'ap_events_event_type_check',
      sql`${table.eventType} IN ('attendance.started', 'attendance.ended')`,
    ),
    index('idx_ap_events_subject_occurred_at').on(
      table.organizationId,
      table.internalUserId,
      table.occurredAt,
    ),
  ],
);

export const presence = sqliteTable(
  'presence',
  {
    organizationId: text('organization_id').notNull(),
    internalUserId: text('internal_user_id').notNull(),
    employeeCode: text('employee_code').notNull(),
    displayName: text('display_name').notNull(),
    attendanceRecordId: text('attendance_record_id').notNull(),
    attendanceState: text('attendance_state').notNull(),
    availability: text('availability').notNull().default('available'),
    availabilityMessage: text('availability_message').notNull().default(''),
    workplaceStoreId: text('workplace_store_id'),
    workplaceLabel: text('workplace_label').notNull().default(''),
    workplaceKind: text('workplace_kind').notNull().default('unknown'),
    attendanceStartedAt: text('attendance_started_at').notNull(),
    attendanceEndedAt: text('attendance_ended_at'),
    lastApEventId: text('last_ap_event_id').notNull(),
    lastApEventAt: text('last_ap_event_at').notNull(),
    connectedAt: text('connected_at'),
    lastSeenAt: text('last_seen_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.internalUserId] }),
    check(
      'presence_attendance_state_check',
      sql`${table.attendanceState} IN ('working', 'ended')`,
    ),
    check(
      'presence_availability_check',
      sql`${table.availability} IN ('available', 'focus', 'break', 'do_not_disturb')`,
    ),
    check(
      'presence_workplace_kind_check',
      sql`${table.workplaceKind} IN ('unknown', 'office', 'store', 'remote')`,
    ),
    index('idx_presence_organization_state').on(
      table.organizationId,
      table.attendanceState,
    ),
  ],
);
