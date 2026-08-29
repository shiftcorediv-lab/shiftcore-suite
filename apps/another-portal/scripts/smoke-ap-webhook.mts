import assert from 'node:assert/strict';
import { createApWebhookSignature } from '../lib/ap-events.ts';

const endpoint = process.env.AP_WEBHOOK_URL || 'http://localhost:3000/api/v1/integrations/ap/events';
const secret = process.env.AP_WEBHOOK_SECRET;

if (!secret) {
  throw new Error('AP_WEBHOOK_SECRET is required for the smoke test.');
}

const now = new Date();
const timestamp = String(Math.floor(now.getTime() / 1000));
const eventId = `evt_smoke_${timestamp}`;
const event = {
  schema_version: 1,
  event_id: eventId,
  event_type: 'attendance.started',
  occurred_at: now.toISOString(),
  organization_id: 'org_smoke_test',
  subject: {
    internal_user_id: 'usr_smoke_test',
    employee_code: 'TEST001',
    display_name: '連携テスト',
  },
  attendance: {
    record_id: `record_${timestamp}`,
    work_date: now.toISOString().slice(0, 10),
    started_at: now.toISOString(),
    ended_at: null,
    state: 'working',
  },
  workplace: {
    store_id: null,
    label: 'テストオフィス',
    kind: 'office',
  },
};

async function send(body: object) {
  const rawBody = JSON.stringify(body);
  const signature = await createApWebhookSignature(secret, timestamp, rawBody);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ap-timestamp': timestamp,
      'x-ap-event-id': eventId,
      'x-ap-signature': signature,
    },
    body: rawBody,
  });
  return { status: response.status, body: await response.json() };
}

const first = await send(event);
assert.equal(first.status, 200);
assert.deepEqual(first.body, {
  ok: true,
  event_id: eventId,
  accepted: true,
  duplicate: false,
});

const duplicate = await send(event);
assert.equal(duplicate.status, 200);
assert.equal((duplicate.body as { duplicate?: boolean }).duplicate, true);

const conflict = await send({
  ...event,
  workplace: { ...event.workplace, label: '本文が異なる場所' },
});
assert.equal(conflict.status, 409);
assert.equal((conflict.body as { code?: string }).code, 'EVENT_CONFLICT');

console.log('Webhook smoke test passed: accepted, duplicate, and conflict paths.');
