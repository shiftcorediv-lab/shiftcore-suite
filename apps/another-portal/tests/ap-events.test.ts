import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApIntegrationError,
  createApWebhookSignature,
  parseApAttendanceEvent,
  verifyApWebhookSignature,
} from '../lib/ap-events.ts';

const startedEvent = {
  schema_version: 1,
  event_id: 'evt_001',
  event_type: 'attendance.started',
  occurred_at: '2026-08-22T09:12:34+09:00',
  organization_id: 'org_another',
  subject: {
    internal_user_id: 'usr_00123',
    employee_code: 'AN0123',
    display_name: 'あおい',
  },
  attendance: {
    record_id: 'attendance-uuid',
    work_date: '2026-08-22',
    started_at: '2026-08-22T09:12:34+09:00',
    ended_at: null,
    state: 'working',
  },
  workplace: {
    store_id: null,
    label: 'Another 店',
    kind: 'unknown',
  },
};

test('開始イベントを正規化する', () => {
  assert.deepEqual(parseApAttendanceEvent(startedEvent), startedEvent);
});

test('開始イベントに終了時刻があれば拒否する', () => {
  assert.throws(
    () => parseApAttendanceEvent({
      ...startedEvent,
      attendance: { ...startedEvent.attendance, ended_at: '2026-08-22T18:00:00+09:00' },
    }),
    (error: unknown) => error instanceof ApIntegrationError && error.code === 'INVALID_EVENT',
  );
});

test('未対応schema_versionを拒否する', () => {
  assert.throws(
    () => parseApAttendanceEvent({ ...startedEvent, schema_version: 2 }),
    (error: unknown) => error instanceof ApIntegrationError && error.code === 'UNSUPPORTED_SCHEMA',
  );
});

test('正しい署名を受理する', async () => {
  const rawBody = JSON.stringify(startedEvent);
  const timestamp = '1787361154';
  const signature = await createApWebhookSignature('test-secret', timestamp, rawBody);

  await verifyApWebhookSignature({
    secret: 'test-secret',
    timestamp,
    signature,
    rawBody,
    nowMilliseconds: Number(timestamp) * 1000,
  });
});

test('本文が変わった署名を拒否する', async () => {
  const rawBody = JSON.stringify(startedEvent);
  const timestamp = '1787361154';
  const signature = await createApWebhookSignature('test-secret', timestamp, rawBody);

  await assert.rejects(
    verifyApWebhookSignature({
      secret: 'test-secret',
      timestamp,
      signature,
      rawBody: `${rawBody} `,
      nowMilliseconds: Number(timestamp) * 1000,
    }),
    (error: unknown) => error instanceof ApIntegrationError && error.code === 'SIGNATURE_INVALID',
  );
});

test('5分を超えた署名を拒否する', async () => {
  const rawBody = JSON.stringify(startedEvent);
  const timestamp = '1787361154';
  const signature = await createApWebhookSignature('test-secret', timestamp, rawBody);

  await assert.rejects(
    verifyApWebhookSignature({
      secret: 'test-secret',
      timestamp,
      signature,
      rawBody,
      nowMilliseconds: (Number(timestamp) + 301) * 1000,
    }),
    (error: unknown) => error instanceof ApIntegrationError && error.code === 'TIMESTAMP_EXPIRED',
  );
});
