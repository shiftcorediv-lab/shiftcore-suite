const SLOT_HEADER = "X-Another-Portal-Slot";

function maintenanceResponse(request: Request): Response {
  const body = request.method === "HEAD"
    ? null
    : `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>メンテナンス中 | Another Portal</title>
    <style>
      :root{--blue:#1556b8;--red:#d93440;--navy:#172033;--muted:#667085;--line:#e3e8ef;--bg:#f4f7fb}
      *{box-sizing:border-box}
      body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f8faff,#f4f7fb 55%,#fff1f2);color:var(--navy);font-family:Inter,"Noto Sans JP","Hiragino Kaku Gothic ProN",Meiryo,sans-serif}
      main{width:min(620px,100%);overflow:hidden;border:1px solid var(--line);border-top:6px solid var(--red);border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(23,32,51,.12)}
      header{display:flex;align-items:center;gap:14px;padding:24px 28px;border-bottom:1px solid var(--line)}
      .mark{position:relative;width:42px;height:42px;flex:0 0 42px}
      .mark i{position:absolute;width:31px;height:13px;border-radius:10px;transform:rotate(-38deg)}
      .mark i:first-child{left:0;top:8px;background:var(--blue)}
      .mark i:last-child{right:0;bottom:7px;background:var(--red)}
      .brand strong,.brand small{display:block}
      .brand strong{font-size:20px;letter-spacing:.02em}
      .brand small{margin-top:3px;color:var(--muted);font-size:9px;letter-spacing:.17em}
      section{padding:42px 28px 46px;text-align:center}
      .status{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;padding:7px 12px;border-radius:99px;background:#fff0f1;color:#a52028;font-size:12px;font-weight:800}
      .status:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--red)}
      h1{margin:0;font-size:clamp(26px,6vw,38px);line-height:1.3}
      p{margin:18px auto 0;max-width:470px;color:var(--muted);font-size:15px;line-height:1.85}
      .note{margin-top:28px;padding:14px 16px;border-radius:12px;background:#f7f9fc;color:#475467;font-size:13px}
      @media(max-width:520px){body{padding:14px}header{padding:20px}section{padding:34px 20px 38px}p{font-size:14px}}
    </style>
  </head>
  <body>
    <main>
      <header>
        <span class="mark" aria-hidden="true"><i></i><i></i></span>
        <span class="brand"><strong>Another Portal</strong><small>WORKFORCE PLATFORM</small></span>
      </header>
      <section>
        <div class="status">メンテナンス中</div>
        <h1>ただいまシステムを整備しています</h1>
        <p>安全にご利用いただくため、メンテナンスを実施しています。作業が完了次第、同じURLからご利用いただけます。</p>
        <div class="note">しばらく時間をおいてから、もう一度お試しください。</div>
      </section>
    </main>
  </body>
</html>`;

  return new Response(body, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

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
  const response = env.PORTAL_SLOT === "green"
    ? maintenanceResponse(request)
    : await env.ASSETS.fetch(request);
  return withSlotHeader(response, env.PORTAL_SLOT);
}

const slotWorker = {
  async fetch(request, env): Promise<Response> {
    return handleSlotRequest(request, env);
  },
} satisfies ExportedHandler<SlotEnv>;

export { handleSlotRequest, maintenanceResponse, withSlotHeader };
export default slotWorker;
