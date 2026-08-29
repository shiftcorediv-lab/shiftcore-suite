import { getApAccountApiUrl, getApAttendanceApiUrl } from '@/db';
import { getOfficePresence } from '@/db/presence';
import {
  BootstrapError,
  extractBearerToken,
  fallbackMember,
  parseApUserResponse,
  parseAttendanceFallback,
  postApAction,
} from '@/lib/bootstrap';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Authorization',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const idToken = extractBearerToken(request.headers.get('authorization'));
    const user = parseApUserResponse(await postApAction({
      url: getApAccountApiUrl(),
      action: 'resolveCurrentUserByIdToken',
      idToken,
    }));

    const members = await getOfficePresence(user);
    let me = members.find((member) => member.internal_user_id === user.internalUserId);
    let reconciledFromAp = false;

    if (!me) {
      const fallback = parseAttendanceFallback(await postApAction({
        url: getApAttendanceApiUrl(),
        action: 'getDashboardData',
        idToken,
      }));
      me = fallbackMember(user, fallback);
      reconciledFromAp = true;
      if (me.attendance_state === 'working') members.unshift(me);
    } else {
      me = { ...me, display_name: user.displayName, connection_state: 'online' };
      const index = members.findIndex((member) => member.internal_user_id === user.internalUserId);
      members[index] = me;
    }

    return json({
      ok: true,
      server_now: new Date().toISOString(),
      me,
      office: {
        office_id: `${user.organizationId}:main`,
        name: 'アナザーオフィス',
        members,
      },
      reconciled_from_ap: reconciledFromAp,
    });
  } catch (error) {
    if (error instanceof BootstrapError) {
      return json({ ok: false, code: error.code, message: error.message }, error.status);
    }

    console.error('Portal bootstrap failed', error instanceof Error ? error.name : 'UnknownError');
    return json(
      { ok: false, code: 'BOOTSTRAP_UNAVAILABLE', message: 'Portal could not be initialized.' },
      503,
    );
  }
}
