import { authenticate } from "../auth/supabase.js";
import { issuerOf } from "../auth/issuer.js";
import { withDatabase } from "../db.js";
import { json, fail, InputError, readJsonBody } from "../http.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Codes raised when migration 005 (booking.admin_permissions) is not applied yet.
const SETUP_CODES = ["42883", "42P01", "42703", "3F000"];
// Message constants raised by booking.admin_permissions: [SQLSTATE, message] -> [API code, HTTP status].
const MAPPED = new Map([
  ["42501:ADMIN_REQUIRED", ["ADMIN_REQUIRED", 403]],
  ["22023:INVALID_EMAIL", ["INVALID_EMAIL", 400]],
  ["22023:INVALID_ID", ["INVALID_ID", 400]],
  ["P0002:USER_NOT_FOUND", ["USER_NOT_FOUND", 404]],
  ["P0002:FACILITY_NOT_FOUND", ["FACILITY_NOT_FOUND", 404]],
  ["P0001:MEMBER_NOT_REGISTERED", ["MEMBER_NOT_REGISTERED", 409]],
  ["P0001:SELF_REVOKE", ["SELF_REVOKE", 409]],
  ["P0001:LAST_ADMIN", ["LAST_ADMIN", 409]]
]);
// Only these constants are ever logged; INVALID_ACTION / INVALID_ISSUER / CONCURRENT_UPDATE map to DATABASE_UNAVAILABLE.
const KNOWN_MESSAGES = ["ADMIN_REQUIRED", "INVALID_ACTION", "INVALID_ISSUER", "INVALID_EMAIL", "INVALID_ID",
  "USER_NOT_FOUND", "FACILITY_NOT_FOUND", "MEMBER_NOT_REGISTERED", "SELF_REVOKE", "LAST_ADMIN", "CONCURRENT_UPDATE"];

// Log unexpected DB failures without SQL, user data or tokens: SQLSTATE and a known constant only.
function logDatabaseError(action, e) {
  const code = typeof e?.code === "string" && /^[0-9A-Z]{5}$/.test(e.code) ? e.code : "unknown";
  const message = KNOWN_MESSAGES.includes(e?.message) ? e.message : "-";
  console.error(`admin_permissions ${action} failed: sqlstate=${code} message=${message}`);
}

class PayloadError extends Error {}

function objectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("INVALID_BODY");
  return body;
}

// Exact-match lookup key only: trimmed, 3..254 code points, no whitespace, at least one "@".
// The database compares lower(email), so case is left as typed.
function emailOf(body) {
  if (typeof body.email !== "string") throw new InputError("INVALID_EMAIL");
  const email = body.email.trim();
  const length = [...email].length;
  if (length < 3 || length > 254 || /\s/u.test(email) || !email.includes("@")) throw new InputError("INVALID_EMAIL");
  return email;
}

function idOf(value) {
  if (typeof value !== "string" || !uuid.test(value)) throw new InputError("INVALID_ID");
  return value;
}

const isObject = v => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// Response bodies carry the DB payload fields unchanged; only the envelope is checked.
function shape(action, payload) {
  if (!isObject(payload)) throw new PayloadError();
  if (action === "list_admins" || action === "list_operators") {
    if (!Array.isArray(payload.data)) throw new PayloadError();
    return { body: { data: payload.data }, status: 200 };
  }
  if (typeof payload.changed !== "boolean") throw new PayloadError();
  if (action === "grant_admin" || action === "grant_operator") {
    const key = action === "grant_admin" ? "admin" : "operator";
    if (!isObject(payload[key])) throw new PayloadError();
    return { body: { changed: payload.changed, [key]: payload[key] }, status: payload.changed ? 201 : 200 };
  }
  return { body: { changed: payload.changed }, status: 200 };
}

// Resolve path + method to an action. Target IDs come from the path only, never from the body.
function route(url, method) {
  const path = url.pathname;
  let m;
  if (path === "/api/admin/permissions/admins") {
    if (method === "GET") return { action: "list_admins", data: () => ({}) };
    if (method === "POST") return { action: "grant_admin", body: true, data: body => ({ email: emailOf(objectBody(body)) }) };
    return { methodNotAllowed: true };
  }
  if ((m = path.match(/^\/api\/admin\/permissions\/admins\/([^/]+)$/))) {
    if (!uuid.test(m[1])) return { invalidId: true };
    if (method === "DELETE") return { action: "revoke_admin", data: () => ({ authUserId: m[1] }) };
    return { methodNotAllowed: true };
  }
  if (path === "/api/admin/permissions/operators") {
    if (method === "GET") return { action: "list_operators", data: () => {
      const facilityId = url.searchParams.get("facilityId");
      return { facilityId: facilityId === null ? null : idOf(facilityId) };
    } };
    if (method === "POST") return { action: "grant_operator", body: true, data: body => {
      const value = objectBody(body);
      return { facilityId: idOf(value.facilityId), email: emailOf(value) };
    } };
    return { methodNotAllowed: true };
  }
  if ((m = path.match(/^\/api\/admin\/permissions\/operators\/([^/]+)\/([^/]+)$/))) {
    if (!uuid.test(m[1]) || !uuid.test(m[2])) return { invalidId: true };
    if (method === "DELETE") return { action: "revoke_operator", data: () => ({ facilityId: m[1], memberId: m[2] }) };
    return { methodNotAllowed: true };
  }
  return null;
}

export async function adminPermissions(request, env) {
  const url = new URL(request.url);
  const target = route(url, request.method);
  if (!target) return fail("NOT_FOUND", 404);
  if (target.invalidId) return fail("INVALID_ID", 400);
  if (target.methodNotAllowed) return fail("METHOD_NOT_ALLOWED", 405);
  const origin = request.headers.get("Origin");
  if (request.method !== "GET" && origin && origin !== url.origin) return fail("ORIGIN_NOT_ALLOWED", 403);
  const identity = await authenticate(request, env);
  if (identity.error) return fail(identity.error, identity.status);
  try {
    const data = target.data(target.body ? await readJsonBody(request) : undefined);
    if (!env.HYPERDRIVE?.connectionString) return fail("DATABASE_NOT_CONFIGURED", 503);
    const payload = await withDatabase(env, async db => {
      const result = await db.query("SELECT booking.admin_permissions($1::uuid,$2::text,$3::text,$4::jsonb) AS payload",
        [identity.user.id, issuerOf(env), target.action, JSON.stringify(data)]);
      return result.rows[0]?.payload ?? null;
    });
    const { body, status } = shape(target.action, payload);
    return json(body, status);
  } catch (e) {
    if (e instanceof InputError) return fail(e.message, e.status);
    if (e instanceof PayloadError) {
      console.error(`admin_permissions ${target.action} failed: unexpected payload shape`);
      return fail("DATABASE_UNAVAILABLE", 503);
    }
    if (SETUP_CODES.includes(e?.code)) return fail("ADMIN_SETUP_REQUIRED", 503);
    const mapped = MAPPED.get(`${e?.code}:${e?.message}`);
    if (mapped) return fail(mapped[0], mapped[1]);
    // INVALID_ACTION, INVALID_ISSUER, other 42501 (missing EXECUTE grant) and anything else.
    // Never expose database credentials, SQL details or user data in responses.
    logDatabaseError(target.action, e);
    return fail("DATABASE_UNAVAILABLE", 503);
  }
}
