import type { ApAttendanceEvent } from '@/lib/ap-events';
import { ApIntegrationError } from '@/lib/ap-events';
import { getD1 } from './index';
import { ensureIntegrationSchema } from './runtime-schema';

type StoredEvent = {
  event_id: string;
  payload_hash: string;
};

export type ApplyApEventResult = {
  eventId: string;
  duplicate: boolean;
};

export async function applyApAttendanceEvent(input: {
  event: ApAttendanceEvent;
  payloadHash: string;
  rawBody: string;
}): Promise<ApplyApEventResult> {
  await ensureIntegrationSchema();

  const d1 = getD1();
  const { event, payloadHash, rawBody } = input;
  const processedAt = new Date().toISOString();

  const insertEvent = d1
    .prepare(
      `INSERT OR IGNORE INTO ap_events (
        event_id, event_type, schema_version, payload_hash, payload_json,
        organization_id, internal_user_id, occurred_at, received_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.event_id,
      event.event_type,
      event.schema_version,
      payloadHash,
      rawBody,
      event.organization_id,
      event.subject.internal_user_id,
      event.occurred_at,
      processedAt,
      processedAt,
    );

  // payload_hashがDB内のイベントと一致する場合だけ在席状態を更新する。
  // 同じevent_idで本文が違う並行リクエストが来ても、勝った本文以外は投影されない。
  const projectPresence = d1
    .prepare(
      `INSERT INTO presence (
        organization_id, internal_user_id, employee_code, display_name,
        attendance_record_id, attendance_state, workplace_store_id,
        workplace_label, workplace_kind, attendance_started_at,
        attendance_ended_at, last_ap_event_id, last_ap_event_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM ap_events WHERE event_id = ? AND payload_hash = ?
      )
      ON CONFLICT (organization_id, internal_user_id) DO UPDATE SET
        employee_code = excluded.employee_code,
        display_name = excluded.display_name,
        attendance_record_id = excluded.attendance_record_id,
        attendance_state = excluded.attendance_state,
        workplace_store_id = excluded.workplace_store_id,
        workplace_label = excluded.workplace_label,
        workplace_kind = excluded.workplace_kind,
        attendance_started_at = excluded.attendance_started_at,
        attendance_ended_at = excluded.attendance_ended_at,
        last_ap_event_id = excluded.last_ap_event_id,
        last_ap_event_at = excluded.last_ap_event_at,
        updated_at = excluded.updated_at
      WHERE excluded.last_ap_event_at >= presence.last_ap_event_at`,
    )
    .bind(
      event.organization_id,
      event.subject.internal_user_id,
      event.subject.employee_code,
      event.subject.display_name,
      event.attendance.record_id,
      event.attendance.state,
      event.workplace.store_id,
      event.workplace.label,
      event.workplace.kind,
      event.attendance.started_at,
      event.attendance.ended_at,
      event.event_id,
      event.occurred_at,
      processedAt,
      event.event_id,
      payloadHash,
    );

  const [insertResult] = await d1.batch([insertEvent, projectPresence]);
  const stored = await d1
    .prepare('SELECT event_id, payload_hash FROM ap_events WHERE event_id = ?')
    .bind(event.event_id)
    .first<StoredEvent>();

  if (!stored || stored.payload_hash !== payloadHash) {
    throw new ApIntegrationError(
      'EVENT_CONFLICT',
      'The event_id already exists with a different payload.',
      409,
    );
  }

  return {
    eventId: event.event_id,
    duplicate: Number(insertResult.meta.changes ?? 0) === 0,
  };
}
