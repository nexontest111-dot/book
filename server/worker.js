import { adminFacilities } from "./routes/admin-facilities.js";
import { authenticate, authConfigured } from "./auth/supabase.js";
import { withDatabase } from "./db.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
const error = (code, status) => json({ error: { code } }, status);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!(path === "/api" || path.startsWith("/api/"))) return env.ASSETS.fetch(request);
    if (path.startsWith("/api/admin/")) return adminFacilities(request, env);
    if (path === "/api/health") {
      if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", 405);
      return json({ service: "book", stage: "postgres-foundation",
        databaseBindingConfigured: Boolean(env.HYPERDRIVE?.connectionString),
        databaseConnectivity: "not_checked",
        authenticationConfigured: authConfigured(env), paymentsConfigured: false });
    }
    if (path === "/api/auth/config") {
      if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", 405);
      if (!authConfigured(env)) return error("AUTH_NOT_CONFIGURED", 503);
      if (!env.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) return error("INVALID_PUBLIC_KEY_CONFIGURATION", 503);
      return json({ url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
    }
    if (path === "/api/me") {
      if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", 405);
      const result = await authenticate(request, env);
      if (result.error) return error(result.error, result.status);
      return json({ data: { authUserId: result.user.id, email: result.user.email ?? null },
        membership: "not_provisioned", operatorAccess: false });
    }
    const slotsMatch = path.match(/^\/api\/facilities\/([^/]+)\/slots$/);
    if (path !== "/api/facilities" && !slotsMatch) return error("API_NOT_IMPLEMENTED", 501);
    if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", 405);
    const sport = url.searchParams.get("sport");
    const region = url.searchParams.get("region");
    if (sport !== null && !["golf", "baseball"].includes(sport)) return error("INVALID_SPORT", 400);
    if (region !== null && region.length > 80) return error("INVALID_REGION", 400);
    const date = url.searchParams.get("date");
    if (slotsMatch) {
      if (!uuid.test(slotsMatch[1])) return error("INVALID_FACILITY_ID", 400);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error("DATE_REQUIRED", 400);
      const parsed = new Date(date + "T00:00:00Z");
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return error("INVALID_DATE", 400);
    }
    if (!env.HYPERDRIVE?.connectionString) return error("DATABASE_NOT_CONFIGURED", 503);
    try {
      return await withDatabase(env, async db => {
        if (!slotsMatch) {
          const result = await db.query(
            "SELECT id, name, sport, region, address, description, image_url, pin_order FROM booking.facilities WHERE published = true AND ($1::text IS NULL OR sport = $1) AND ($2::text IS NULL OR region = $2) ORDER BY pin_order ASC NULLS LAST, name, id LIMIT 100",
            [sport, region]);
          return json({ data: result.rows, limit: 100 });
        }
        const facility = await db.query("SELECT id FROM booking.facilities WHERE id = $1 AND published = true", [slotsMatch[1]]);
        if (!facility.rowCount) return error("FACILITY_NOT_FOUND", 404);
        const result = await db.query(
          "SELECT s.id, s.resource_id, r.name AS resource_name, s.starts_at, s.ends_at, s.price_krw, s.booking_deadline, g.tee_time, g.player_count, g.cart_option, g.caddie_option, b.lighting_option FROM booking.slots s JOIN booking.resources r ON r.id = s.resource_id LEFT JOIN booking.golf_slot_details g ON g.slot_id = s.id LEFT JOIN booking.baseball_slot_details b ON b.slot_id = s.id WHERE r.facility_id = $1 AND r.published = true AND s.published = true AND s.starts_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Seoul') AND s.starts_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul') AND s.booking_deadline > now() ORDER BY s.starts_at, s.id LIMIT 200",
          [slotsMatch[1], date]);
        return json({ data: result.rows, limit: 200, availability: "server_recheck_required" });
      });
    } catch {
      // Never expose database credentials, SQL details or user data in errors.
      return error("DATABASE_UNAVAILABLE", 503);
    }
  }
};
