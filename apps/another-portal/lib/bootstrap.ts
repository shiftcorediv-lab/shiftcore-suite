export type ApPortalUser = {
  internalUserId: string;
  employeeCode: string;
  displayName: string;
  organizationId: string;
};

export type PortalMember = {
  internal_user_id: string;
  display_name: string;
  attendance_state: 'working' | 'ended' | 'unknown';
  availability: 'available' | 'focus' | 'break' | 'do_not_disturb';
  availability_message: string;
  connection_state: 'online' | 'offline';
  workplace: {
    store_id: string | null;
    label: string;
    kind: 'unknown' | 'office' | 'store' | 'remote';
  };
};

export type AttendanceFallback = {
  attendanceRecordId: string;
  attendanceState: 'working' | 'ended' | 'unknown';
  workplaceLabel: string;
};

export class BootstrapError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BootstrapError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maximumLength = 255): string {
  if (typeof value !== 'string') return '';
  const result = value.trim();
  return result.length <= maximumLength ? result : '';
}

export function extractBearerToken(header: string | null): string {
  const match = /^Bearer ([^\s]{20,8192})$/.exec(header || '');
  if (!match) {
    throw new BootstrapError('AUTH_REQUIRED', 'A valid Bearer token is required.', 401);
  }
  return match[1];
}

export function parseApUserResponse(value: unknown): ApPortalUser {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.user)) {
    throw new BootstrapError('AUTH_INVALID', 'AP could not validate the current user.', 401);
  }

  const personType = cleanString(value.user.person_type || value.user.personType, 64);
  if (personType !== 'internal') {
    throw new BootstrapError('PORTAL_ACCESS_FORBIDDEN', 'Another Portal is limited to internal staff.', 403);
  }

  const result = {
    internalUserId: cleanString(value.user.internal_user_id || value.user.userId, 128),
    employeeCode: cleanString(value.user.employee_code || value.user.employeeCode, 64),
    displayName: cleanString(value.user.display_name || value.user.displayName || value.user.name, 160),
    organizationId: cleanString(value.user.organization_id, 128),
  };

  if (!result.internalUserId || !result.employeeCode || !result.displayName || !result.organizationId) {
    throw new BootstrapError('AP_USER_INCOMPLETE', 'AP returned an incomplete user profile.', 502);
  }
  return result;
}

export function parseAttendanceFallback(value: unknown): AttendanceFallback {
  if (!isRecord(value) || value.ok !== true) {
    throw new BootstrapError('AP_ATTENDANCE_UNAVAILABLE', 'AP attendance could not be reconciled.', 502);
  }

  const record = isRecord(value.record) ? value.record : null;
  const schedule = isRecord(value.schedule) ? value.schedule : null;
  if (!record) {
    return { attendanceRecordId: '', attendanceState: 'unknown', workplaceLabel: '' };
  }

  const startedAt = record['実開始'];
  const endedAt = record['実終了'];
  const attendanceState = startedAt && !endedAt ? 'working' : endedAt ? 'ended' : 'unknown';
  return {
    attendanceRecordId: cleanString(record.record_id, 128),
    attendanceState,
    workplaceLabel: cleanString(
      record['予定場所'] || record['稼働場所'] || schedule?.['稼働場所'] || '',
      255,
    ),
  };
}

export function fallbackMember(user: ApPortalUser, fallback: AttendanceFallback): PortalMember {
  return {
    internal_user_id: user.internalUserId,
    display_name: user.displayName,
    attendance_state: fallback.attendanceState,
    availability: 'available',
    availability_message: '',
    connection_state: 'online',
    workplace: {
      store_id: null,
      label: fallback.workplaceLabel,
      kind: 'unknown',
    },
  };
}

export async function postApAction(input: {
  url: string;
  action: 'resolveCurrentUserByIdToken' | 'getDashboardData';
  idToken: string;
  fetcher?: typeof fetch;
}): Promise<unknown> {
  const response = await (input.fetcher || fetch)(input.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: input.action, idToken: input.idToken, payload: {} }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new BootstrapError('AP_UPSTREAM_ERROR', 'AP returned an upstream error.', 502);
  }
  try {
    return await response.json();
  } catch {
    throw new BootstrapError('AP_UPSTREAM_INVALID', 'AP returned an invalid response.', 502);
  }
}
