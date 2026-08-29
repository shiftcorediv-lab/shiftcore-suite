export type BootstrapMember = {
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

export type BootstrapData = {
  server_now: string;
  me: BootstrapMember;
  office: {
    office_id: string;
    name: string;
    members: BootstrapMember[];
  };
  reconciled_from_ap: boolean;
};

export class BootstrapClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BootstrapClientError';
    this.code = code;
  }
}

export async function fetchPortalBootstrap(
  idToken: string,
  fetcher: typeof fetch = fetch,
): Promise<BootstrapData> {
  const response = await fetcher('/api/v1/bootstrap', {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null) as (BootstrapData & {
    ok?: boolean;
    code?: string;
    message?: string;
  }) | null;

  if (!response.ok || !result || result.ok === false) {
    throw new BootstrapClientError(
      result?.code || 'BOOTSTRAP_UNAVAILABLE',
      result?.message || 'Portalを初期化できませんでした。',
    );
  }
  if (!result.me || !result.office || !Array.isArray(result.office.members)) {
    throw new BootstrapClientError('BOOTSTRAP_INVALID', 'Portalの初期データが不正です。');
  }
  return result;
}
