const ALLOWED_ACTIONS = new Set([
  "checkLoginUserByEmail",
  "resolveCurrentUserByIdToken"
]);

export default {
  async fetch(request) {
    const allowedOrigin = "https://shiftcorediv-lab.github.io";
    const gasUrl = "https://script.google.com/macros/s/AKfycbx83rAzXDfQPJUEu9tX4dpULH4QHYUoqfaTnfzzySkW3KjGVbcH4tnq9PKCCvfuEx6eRA/exec";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({ ok: true, message: "ShiftCore Worker is running" }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED", message: "POST only" }),
        { status: 405, headers: corsHeaders }
      );
    }

    try {
      const bodyText = await request.text();
      let requestedAction = "";

      try {
        requestedAction = String(JSON.parse(bodyText)?.action || "");
      } catch (error) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: "INVALID_JSON",
            message: "リクエストの解析に失敗しました"
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!ALLOWED_ACTIONS.has(requestedAction)) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: "ACTION_NOT_ALLOWED",
            message: "このアクションは許可されていません"
          }),
          { status: 403, headers: corsHeaders }
        );
      }

      const gasResponse = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: bodyText,
        redirect: "follow"
      });

      const gasText = await gasResponse.text();

      return new Response(gasText, { status: gasResponse.status, headers: corsHeaders });
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, code: "WORKER_ERROR", message: String(error.message || error) }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
