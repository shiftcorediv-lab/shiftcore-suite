import { applyApAttendanceEvent } from '@/db/ap-events';
import { getApWebhookSecret } from '@/db';
import {
  AP_WEBHOOK_MAX_BODY_BYTES,
  ApIntegrationError,
  parseApAttendanceEvent,
  sha256Hex,
  verifyApWebhookSignature,
} from '@/lib/ap-events';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function GET(): Response {
  return json({
    ok: true,
    service: 'another-portal-ap-integration',
    schema_version: 1,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > AP_WEBHOOK_MAX_BODY_BYTES) {
      throw new ApIntegrationError('PAYLOAD_TOO_LARGE', 'The request body is too large.', 413);
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > AP_WEBHOOK_MAX_BODY_BYTES) {
      throw new ApIntegrationError('PAYLOAD_TOO_LARGE', 'The request body is too large.', 413);
    }

    await verifyApWebhookSignature({
      secret: getApWebhookSecret(),
      timestamp: request.headers.get('x-ap-timestamp'),
      signature: request.headers.get('x-ap-signature'),
      rawBody,
    });

    let rawEvent: unknown;
    try {
      rawEvent = JSON.parse(rawBody);
    } catch {
      throw new ApIntegrationError('INVALID_EVENT', 'The request body is not valid JSON.', 400);
    }

    const event = parseApAttendanceEvent(rawEvent);
    const headerEventId = request.headers.get('x-ap-event-id');
    if (!headerEventId || headerEventId !== event.event_id) {
      throw new ApIntegrationError(
        'EVENT_ID_MISMATCH',
        'X-AP-Event-Id must match event_id.',
        400,
      );
    }

    const result = await applyApAttendanceEvent({
      event,
      payloadHash: await sha256Hex(rawBody),
      rawBody,
    });

    return json({
      ok: true,
      event_id: result.eventId,
      accepted: true,
      duplicate: result.duplicate,
    });
  } catch (error) {
    if (error instanceof ApIntegrationError) {
      return json({ ok: false, code: error.code, message: error.message }, error.status);
    }

    console.error('AP webhook processing failed', error instanceof Error ? error.name : 'UnknownError');
    return json(
      { ok: false, code: 'INTERNAL_ERROR', message: 'The event could not be processed.' },
      500,
    );
  }
}
