const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
      return json({ service: "book", stage: "foundation", databaseConfigured: false, authenticationConfigured: false, paymentsConfigured: false });
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return json({ error: { code: "API_NOT_IMPLEMENTED", message: "서버 기능은 준비 중입니다. 실제 예약이나 결제는 처리되지 않습니다." } }, 501);
    }
    return env.ASSETS.fetch(request);
  }
};
