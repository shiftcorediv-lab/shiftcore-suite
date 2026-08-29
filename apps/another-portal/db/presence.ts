import type { ApPortalUser, PortalMember } from '@/lib/bootstrap';
import { getD1 } from './index';
import { ensureIntegrationSchema } from './runtime-schema';

type PresenceRow = {
  internal_user_id: string;
  display_name: string;
  attendance_state: 'working' | 'ended';
  availability: PortalMember['availability'];
  availability_message: string;
  workplace_store_id: string | null;
  workplace_label: string;
  workplace_kind: PortalMember['workplace']['kind'];
  last_seen_at: string | null;
};

function connectionState(lastSeenAt: string | null, nowMilliseconds: number): 'online' | 'offline' {
  if (!lastSeenAt) return 'offline';
  const lastSeen = Date.parse(lastSeenAt);
  return Number.isFinite(lastSeen) && nowMilliseconds - lastSeen <= 90_000 ? 'online' : 'offline';
}

function toMember(row: PresenceRow, nowMilliseconds: number): PortalMember {
  return {
    internal_user_id: row.internal_user_id,
    display_name: row.display_name,
    attendance_state: row.attendance_state,
    availability: row.availability,
    availability_message: row.availability_message,
    connection_state: connectionState(row.last_seen_at, nowMilliseconds),
    workplace: {
      store_id: row.workplace_store_id,
      label: row.workplace_label,
      kind: row.workplace_kind,
    },
  };
}

export async function getOfficePresence(user: ApPortalUser): Promise<PortalMember[]> {
  await ensureIntegrationSchema();
  const d1 = getD1();
  const now = new Date();
  const nowIso = now.toISOString();

  await d1
    .prepare(
      `UPDATE presence
       SET connected_at = COALESCE(connected_at, ?), last_seen_at = ?, updated_at = ?
       WHERE organization_id = ? AND internal_user_id = ? AND attendance_state = 'working'`,
    )
    .bind(nowIso, nowIso, nowIso, user.organizationId, user.internalUserId)
    .run();

  const result = await d1
    .prepare(
      `SELECT internal_user_id, display_name, attendance_state, availability,
              availability_message, workplace_store_id, workplace_label,
              workplace_kind, last_seen_at
       FROM presence
       WHERE organization_id = ? AND attendance_state = 'working'
       ORDER BY display_name, internal_user_id`,
    )
    .bind(user.organizationId)
    .all<PresenceRow>();

  return result.results.map((row) => toMember(row, now.getTime()));
}
