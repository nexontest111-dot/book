import { authenticate } from "../auth/supabase.js";
import { issuerOf } from "../auth/issuer.js";
import { withDatabase } from "../db.js";
import { json, fail, InputError, readJsonBody } from "../http.js";

// Codes raised when migration 004 (booking.member_profile) is not applied yet.
const SETUP_CODES = ["42883", "42P01", "42703", "3F000"];
const CONTROL = /\p{Cc}/u;
// Message constants raised by booking.member_profile; only these are ever logged.
const KNOWN_MESSAGES = ["INVALID_IDENTITY", "INVALID_ACTION", "INVALID_DISPLAY_NAME", "MEMBER_NOT_FOUND"];

// Log unexpected DB failures without SQL, user data or tokens: SQLSTATE and a known constant only.
function logDatabaseError(route, e) {
  const code = typeof e?.code === "string" && /^[0-9A-Z]{5}$/.test(e.code) ? e.code : "unknown";
  const message = KNOWN_MESSAGES.includes(e?.message) ? e.message : "-";
  console.error(`member_profile ${route} failed: sqlstate=${code} message=${message}`);
}

function memberOf(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string") return null;
  return { id: value.id, displayName: value.displayName, createdAt: value.createdAt, updatedAt: value.updatedAt ?? null };
}

function displayNameOf(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("INVALID_BODY");
  if (typeof body.displayName !== "string") throw new InputError("INVALID_DISPLAY_NAME");
  const name = body.displayName.trim();
  // Count code points to match PostgreSQL char_length.
  const length = [...name].length;
  // Lone surrogates would be stored as U+FFFD, so reject them.
  const wellFormed = typeof name.isWellFormed === "function" ? name.isWellFormed() : !/\p{Cs}/u.test(name);
  if (!wellFormed || length < 1 || length > 80 || CONTROL.test(name)) throw new InputError("INVALID_DISPLAY_NAME");
  return name;
}

async function getMe(request, env) {
  const identity = await authenticate(request, env);
  if (identity.error) return fail(identity.error, identity.status);
  const base = { data: { authUserId: identity.user.id, email: identity.user.email ?? null }, operatorAccess: false };
  if (!env.HYPERDRIVE?.connectionString) return json({ ...base, membership: "setup_required", member: null });
  try {
    const payload = await withDatabase(env, async db => {
      const result = await db.query("SELECT booking.member_profile($1::text,$2::text,$3::text,$4::text) AS payload",
        [issuerOf(env), identity.user.id, "get", null]);
      return result.rows[0]?.payload ?? null;
    });
    const member = memberOf(payload);
    if (payload !== null && !member) {
      console.error("member_profile get failed: unexpected payload shape");
      return json({ ...base, membership: "unavailable", member: null });
    }
    return json({ ...base, membership: member ? "active" : "not_provisioned", member });
  } catch (e) {
    if (SETUP_CODES.includes(e?.code)) return json({ ...base, membership: "setup_required", member: null });
    // Authentication succeeded; report membership as unknown instead of failing the login check.
    // Never expose database credentials, SQL details or user data in responses.
    logDatabaseError("get", e);
    return json({ ...base, membership: "unavailable", member: null });
  }
}

async function putMembership(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return fail("ORIGIN_NOT_ALLOWED", 403);
  const identity = await authenticate(request, env);
  if (identity.error) return fail(identity.error, identity.status);
  try {
    const displayName = displayNameOf(await readJsonBody(request));
    if (!env.HYPERDRIVE?.connectionString) return fail("DATABASE_NOT_CONFIGURED", 503);
    const payload = await withDatabase(env, async db => {
      const result = await db.query("SELECT booking.member_profile($1::text,$2::text,$3::text,$4::text) AS payload",
        [issuerOf(env), identity.user.id, "upsert", displayName]);
      return result.rows[0]?.payload ?? null;
    });
    const member = memberOf(payload?.member);
    if (!member) { console.error("member_profile upsert failed: unexpected payload shape"); return fail("DATABASE_UNAVAILABLE", 503); }
    return json({ member }, payload.created === true ? 201 : 200);
  } catch (e) {
    if (e instanceof InputError) return fail(e.message, e.status);
    if (SETUP_CODES.includes(e?.code)) return fail("MEMBER_SETUP_REQUIRED", 503);
    if ((e?.code === "22023" && e.message === "INVALID_DISPLAY_NAME") || ["23514", "22001"].includes(e?.code)) return fail("INVALID_DISPLAY_NAME", 400);
    // Other 22023 (INVALID_IDENTITY, INVALID_ACTION) and P0002 are server-side faults.
    logDatabaseError("upsert", e);
    return fail("DATABASE_UNAVAILABLE", 503);
  }
}

export async function meRoutes(request, env) {
  const path = new URL(request.url).pathname;
  if (path === "/api/me") {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    return getMe(request, env);
  }
  if (path === "/api/me/membership") {
    if (request.method !== "PUT") return fail("METHOD_NOT_ALLOWED", 405);
    return putMembership(request, env);
  }
  return fail("API_NOT_IMPLEMENTED", 501);
}
