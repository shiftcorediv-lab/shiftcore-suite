import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BootstrapClientError,
  fetchPortalBootstrap,
} from '../lib/bootstrap-client.ts';

const bootstrap = {
  ok: true,
  server_now: '2026-08-23T09:00:00+09:00',
  me: {
    internal_user_id: 'usr_001',
    display_name: 'えいち',
    attendance_state: 'working',
    availability: 'available',
    availability_message: '',
    connection_state: 'online',
    workplace: { store_id: null, label: 'オフィス', kind: 'unknown' },
  },
  office: { office_id: 'org_001:main', name: 'アナザーオフィス', members: [] },
  reconciled_from_ap: false,
};

test('bootstrapへBearerトークンを送り実データを返す', async () => {
  let authorization = '';
  const result = await fetchPortalBootstrap('firebase-token', async (_input, init) => {
    authorization = new Headers(init?.headers).get('authorization') || '';
    return Response.json(bootstrap);
  });

  assert.equal(authorization, 'Bearer firebase-token');
  assert.equal(result.me.display_name, 'えいち');
});

test('bootstrapの認証エラーコードを画面層へ渡す', async () => {
  await assert.rejects(
    fetchPortalBootstrap('expired-token', async () => Response.json(
      { ok: false, code: 'AUTH_INVALID', message: 'invalid' },
      { status: 401 },
    )),
    (error: unknown) => error instanceof BootstrapClientError && error.code === 'AUTH_INVALID',
  );
});

test('不完全なbootstrapレスポンスを拒否する', async () => {
  await assert.rejects(
    fetchPortalBootstrap('firebase-token', async () => Response.json({ ok: true })),
    (error: unknown) => error instanceof BootstrapClientError && error.code === 'BOOTSTRAP_INVALID',
  );
});
