/**
 * OrderCase API Proxy Worker
 * GitHub Pages -> Worker -> GAS
 */

const GAS_URL = "https://script.google.com/macros/s/AKfycbxTZCSs-CoDqmNIBdayZ_7K2GN8IiOZDKCXicWr7bQ5W_u-sx5g6fq2BFk_sZNVltygzg/exec";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request) {
    // OPTIONS ここから
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }
    // OPTIONS ここまで

    try {
      const url = new URL(request.url);
      const gasUrl = new URL(GAS_URL);

      // GitHub Pages側から来た ?action=bootstrap などをGASへ引き継ぐ
      gasUrl.search = url.search;

      const init = {
        method: request.method,
        headers: {
          "Content-Type": request.headers.get("Content-Type") || "text/plain;charset=utf-8"
        }
      };

      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = await request.text();
      }

      const gasResponse = await fetch(gasUrl.toString(), init);
      const text = await gasResponse.text();

      return new Response(text, {
        status: gasResponse.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        ok: false,
        code: "WORKER_ERROR",
        message: error.message
      }, null, 2), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    }
  }
};
