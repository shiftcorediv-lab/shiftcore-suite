import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BootstrapError,
  extractBearerToken,
  fallbackMember,
  parseApUserResponse,
  parseAttendanceFallback,
  postApAction,
} from '../lib/bootstrap.ts';

const userResponse = {
  ok: true,
  user: {
    internal_user_id: 'usr_001',
    employee_code: 'AN0001',
    display_name: 'えいち',
    organization_id: 'org_001',
    person_type: 'internal',
    email: 'not-returned@example.com',
  },
};

test('BearerトークンをAuthorizationヘッダーだけから取得する', () => {
  const token = 'a'.repeat(64);
  assert.equal(extractBearerToken(`Bearer ${token}`), token);
  assert.throws(
    () => extractBearerToken(`Basic ${token}`),
    (error: unknown) => error instanceof BootstrapError && error.code === 'AUTH_REQUIRED',
  );
});

test('AP利用者をPortalに必要な最小項目へ絞る', () => {
  assert.deepEqual(parseApUserResponse(userResponse), {
    internalUserId: 'usr_001',
    employeeCode: 'AN0001',
    displayName: 'えいち',
    organizationId: 'org_001',
  });
});

test('外部人員を暫定アクセス境界で拒否する', () => {
  assert.throws(
    () => parseApUserResponse({
      ...userResponse,
      user: { ...userResponse.user, person_type: 'alliance_individual' },
    }),
    (error: unknown) => error instanceof BootstrapError && error.code === 'PORTAL_ACCESS_FORBIDDEN',
  );
});

test('AP勤怠からWebhook到着前の本人状態を補う', () => {
  const fallback = parseAttendanceFallback({
    ok: true,
    record: {
      record_id: 'rec_001',
      '実開始': '2026-08-23T09:00:00+09:00',
      '実終了': '',
      '予定場所': 'Another 店',
    },
  });
  const me = fallbackMember(parseApUserResponse(userResponse), fallback);

  assert.equal(me.attendance_state, 'working');
  assert.equal(me.connection_state, 'online');
  assert.equal(me.workplace.label, 'Another 店');
});

test('上流APへトークンを本文で渡し、レスポンスを保存しない', async () => {
  let capturedBody = '';
  const result = await postApAction({
    url: 'https://ap.example.com/',
    action: 'resolveCurrentUserByIdToken',
    idToken: 'token-value-that-is-long-enough',
    fetcher: async (_input, init) => {
      capturedBody = String(init?.body || '');
      return Response.json(userResponse);
    },
  });

  assert.deepEqual(result, userResponse);
  assert.deepEqual(JSON.parse(capturedBody), {
    action: 'resolveCurrentUserByIdToken',
    idToken: 'token-value-that-is-long-enough',
    payload: {},
  });
});
