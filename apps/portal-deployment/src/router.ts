type PortalSlot = "blue" | "green";

const ACTIVE_SLOT_HEADER = "X-Another-Portal-Active-Slot";

function normalizeSlot(value: string): PortalSlot | null {
  return value === "blue" || value === "green" ? value : null;
}

function selectSlot(env: RouterEnv): PortalSlot | null {
  return normalizeSlot(env.ACTIVE_SLOT);
}

function dashboardRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== "/") return null;
  url.pathname = "/apps/account-console/";
  return Response.redirect(url, 302);
}

function serviceForSlot(slot: PortalSlot, env: RouterEnv): Fetcher {
  return slot === "blue" ? env.BLUE : env.GREEN;
}

function withPortalHeaders(
  response: Response,
  slot: PortalSlot,
): Response {
  const headers = new Headers(response.headers);
  headers.set(ACTIVE_SLOT_HEADER, slot);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function unavailableResponse(): Response {
  return new Response(
    "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Another Portal</title><body><main><h1>ただいま準備中です</h1><p>時間をおいて、もう一度お試しください。</p></main></body></html>",
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "60",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function handleRouterRequest(request: Request, env: RouterEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const redirect = dashboardRedirect(request);
  if (redirect) return redirect;

  const slot = selectSlot(env);
  if (!slot) return unavailableResponse();

  try {
    const response = await serviceForSlot(slot, env).fetch(request);
    return withPortalHeaders(response, slot);
  } catch (error) {
    console.error(JSON.stringify({
      event: "portal_slot_fetch_failed",
      slot,
      message: error instanceof Error ? error.message : String(error),
    }));
    return unavailableResponse();
  }
}

const routerWorker = {
  async fetch(request, env): Promise<Response> {
    return handleRouterRequest(request, env);
  },
} satisfies ExportedHandler<RouterEnv>;

export {
  dashboardRedirect,
  handleRouterRequest,
  normalizeSlot,
  selectSlot,
  unavailableResponse,
  withPortalHeaders,
};
export default routerWorker;
