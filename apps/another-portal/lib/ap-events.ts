export const AP_EVENT_SCHEMA_VERSION = 1;
export const AP_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;
export const AP_WEBHOOK_MAX_SKEW_SECONDS = 5 * 60;

export const AP_EVENT_TYPES = ['attendance.started', 'attendance.ended'] as const;
export type ApEventType = (typeof AP_EVENT_TYPES)[number];

export const WORKPLACE_KINDS = ['unknown', 'office', 'store', 'remote'] as const;
export type WorkplaceKind = (typeof WORKPLACE_KINDS)[number];

export type ApAttendanceEvent = {
  schema_version: 1;
  event_id: string;
  event_type: ApEventType;
  occurred_at: string;
  organization_id: string;
  subject: {
    internal_user_id: string;
    employee_code: string;
    display_name: string;
  };
  attendance: {
    record_id: string;
    work_date: string;
    started_at: string;
    ended_at: string | null;
    state: 'working' | 'ended';
  };
  workplace: {
    store_id: string | null;
    label: string;
    kind: WorkplaceKind;
  };
};

export class ApIntegrationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
  ) {
    super(message);
    this.name = 'ApIntegrationError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) {
    throw new ApIntegrationError('INVALID_EVENT', `${key} must be an object.`, 400);
  }
  return value;
}

function requiredString(
  parent: Record<string, unknown>,
  key: string,
  maximumLength = 255,
): string {
  const value = parent[key];
  if (typeof value !== 'string' || !value.trim() || value.length > maximumLength) {
    throw new ApIntegrationError('INVALID_EVENT', `${key} is invalid.`, 400);
  }
  return value.trim();
}

function nullableString(
  parent: Record<string, unknown>,
  key: string,
  maximumLength = 255,
): string | null {
  const value = parent[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new ApIntegrationError('INVALID_EVENT', `${key} is invalid.`, 400);
  }
  return value.trim() || null;
}

function requiredIsoDate(parent: Record<string, unknown>, key: string): string {
  const value = requiredString(parent, key, 64);
  if (!Number.isFinite(Date.parse(value))) {
    throw new ApIntegrationError('INVALID_EVENT', `${key} must be an ISO date.`, 400);
  }
  return value;
}

function requiredDateKey(parent: Record<string, unknown>, key: string): string {
  const value = requiredString(parent, key, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApIntegrationError('INVALID_EVENT', `${key} must use YYYY-MM-DD.`, 400);
  }
  return value;
}

export function parseApAttendanceEvent(value: unknown): ApAttendanceEvent {
  if (!isRecord(value)) {
    throw new ApIntegrationError('INVALID_EVENT', 'The event body must be an object.', 400);
  }

  if (value.schema_version !== AP_EVENT_SCHEMA_VERSION) {
    throw new ApIntegrationError('UNSUPPORTED_SCHEMA', 'Unsupported schema_version.', 422);
  }

  const eventType = requiredString(value, 'event_type', 64);
  if (!AP_EVENT_TYPES.includes(eventType as ApEventType)) {
    throw new ApIntegrationError('INVALID_EVENT', 'event_type is invalid.', 400);
  }

  const subject = requiredRecord(value, 'subject');
  const attendance = requiredRecord(value, 'attendance');
  const workplace = requiredRecord(value, 'workplace');
  const attendanceState = requiredString(attendance, 'state', 32);
  const expectedState = eventType === 'attendance.started' ? 'working' : 'ended';

  if (attendanceState !== expectedState) {
    throw new ApIntegrationError(
      'INVALID_EVENT',
      `attendance.state must be ${expectedState} for ${eventType}.`,
      400,
    );
  }

  const endedAt = nullableString(attendance, 'ended_at', 64);
  if (endedAt && !Number.isFinite(Date.parse(endedAt))) {
    throw new ApIntegrationError('INVALID_EVENT', 'attendance.ended_at must be an ISO date.', 400);
  }
  if (eventType === 'attendance.started' && endedAt !== null) {
    throw new ApIntegrationError('INVALID_EVENT', 'A start event cannot contain ended_at.', 400);
  }
  if (eventType === 'attendance.ended' && endedAt === null) {
    throw new ApIntegrationError('INVALID_EVENT', 'An end event requires ended_at.', 400);
  }

  const workplaceKind = requiredString(workplace, 'kind', 32);
  if (!WORKPLACE_KINDS.includes(workplaceKind as WorkplaceKind)) {
    throw new ApIntegrationError('INVALID_EVENT', 'workplace.kind is invalid.', 400);
  }

  return {
    schema_version: AP_EVENT_SCHEMA_VERSION,
    event_id: requiredString(value, 'event_id', 128),
    event_type: eventType as ApEventType,
    occurred_at: requiredIsoDate(value, 'occurred_at'),
    organization_id: requiredString(value, 'organization_id', 128),
    subject: {
      internal_user_id: requiredString(subject, 'internal_user_id', 128),
      employee_code: requiredString(subject, 'employee_code', 64),
      display_name: requiredString(subject, 'display_name', 160),
    },
    attendance: {
      record_id: requiredString(attendance, 'record_id', 128),
      work_date: requiredDateKey(attendance, 'work_date'),
      started_at: requiredIsoDate(attendance, 'started_at'),
      ended_at: endedAt,
      state: attendanceState as 'working' | 'ended',
    },
    workplace: {
      store_id: nullableString(workplace, 'store_id', 128),
      label: requiredString(workplace, 'label', 255),
      kind: workplaceKind as WorkplaceKind,
    },
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(leftHex: string, rightHex: string): boolean {
  const left = hexToBytes(leftHex);
  const right = hexToBytes(rightHex);
  if (!left || !right || left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToHex(new Uint8Array(signature));
}

export async function createApWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  return `v1=${await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)}`;
}

export async function verifyApWebhookSignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMilliseconds?: number;
}): Promise<void> {
  const { secret, timestamp, signature, rawBody } = input;
  if (!timestamp || !/^\d{10}$/.test(timestamp)) {
    throw new ApIntegrationError('TIMESTAMP_INVALID', 'X-AP-Timestamp is invalid.', 401);
  }

  const nowSeconds = Math.floor((input.nowMilliseconds ?? Date.now()) / 1000);
  const eventSeconds = Number(timestamp);
  if (Math.abs(nowSeconds - eventSeconds) > AP_WEBHOOK_MAX_SKEW_SECONDS) {
    throw new ApIntegrationError('TIMESTAMP_EXPIRED', 'The webhook timestamp has expired.', 401);
  }

  if (!signature || !/^v1=[a-f0-9]{64}$/i.test(signature)) {
    throw new ApIntegrationError('SIGNATURE_INVALID', 'X-AP-Signature is invalid.', 401);
  }

  const expected = await createApWebhookSignature(secret, timestamp, rawBody);
  if (!constantTimeEqual(signature.slice(3), expected.slice(3))) {
    throw new ApIntegrationError('SIGNATURE_INVALID', 'X-AP-Signature is invalid.', 401);
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}
