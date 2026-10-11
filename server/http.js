// Shared response and request-body helpers for route modules.
// Response shape is the same as worker.js and admin-facilities.js: errors are { error: { code } }.
export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
export const fail = (code, status) => json({ error: { code } }, status);

export class InputError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}

// Same rules as admin-facilities.js readBody (JSON content type, 16KB streamed limit),
// except a missing body is INVALID_JSON so empty bodies get one code. Admin keeps its own reader.
export async function readJsonBody(request, maxBytes = 16384) {
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) throw new InputError("JSON_REQUIRED", 415);
  const reader = request.body?.getReader();
  // A missing body stream is an empty body: same result as an empty string body.
  if (!reader) throw new InputError("INVALID_JSON");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new InputError("BODY_TOO_LARGE", 413); }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InputError("INVALID_JSON"); }
}
