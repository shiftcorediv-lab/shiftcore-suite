const SLOT_HEADER = "X-Another-Portal-Slot";
const COLOR_HEADER = "X-Another-Portal-Color";

type PortalColor = "blue" | "red";

function portalColor(slot: string): PortalColor {
  return slot === "green" ? "red" : "blue";
}

function withSlotPresentation(response: Response, slot: string): Response {
  const color = portalColor(slot);
  const contentType = response.headers.get("Content-Type") ?? "";
  const themedResponse = response.body && contentType.includes("text/html")
    ? new HTMLRewriter()
        .on("html", {
          element(element) {
            element.setAttribute("data-portal-color", color);
          },
        })
        .transform(response)
    : response;
  const headers = new Headers(themedResponse.headers);
  headers.set(SLOT_HEADER, slot);
  headers.set(COLOR_HEADER, color);
  return new Response(themedResponse.body, {
    status: themedResponse.status,
    statusText: themedResponse.statusText,
    headers,
  });
}

async function handleSlotRequest(request: Request, env: SlotEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  return withSlotPresentation(response, env.PORTAL_SLOT);
}

const slotWorker = {
  async fetch(request, env): Promise<Response> {
    return handleSlotRequest(request, env);
  },
} satisfies ExportedHandler<SlotEnv>;

export { handleSlotRequest, portalColor, withSlotPresentation };
export default slotWorker;
