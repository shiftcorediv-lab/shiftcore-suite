const SLOT_HEADER = "X-Another-Portal-Slot";

function withSlotHeader(response: Response, slot: string): Response {
  const headers = new Headers(response.headers);
  headers.set(SLOT_HEADER, slot);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleSlotRequest(request: Request, env: SlotEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  return withSlotHeader(response, env.PORTAL_SLOT);
}

const slotWorker = {
  async fetch(request, env): Promise<Response> {
    return handleSlotRequest(request, env);
  },
} satisfies ExportedHandler<SlotEnv>;

export { SLOT_HEADER, handleSlotRequest, withSlotHeader };
export default slotWorker;
