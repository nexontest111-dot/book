import { createClient } from "@supabase/supabase-js";

// Keys are configured in the Worker, never taken from requests.
export function authConfigured(env) {
  try {
    const url = new URL(env.SUPABASE_URL);
    return url.protocol === "https:" && Boolean(env.SUPABASE_PUBLISHABLE_KEY);
  } catch {
    return false;
  }
}
export async function authenticate(request, env) {
  if (!authConfigured(env)) return { error: "AUTH_NOT_CONFIGURED", status: 503 };
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer ([^\s]+)$/i);
  if (!match || match[1].length > 8192) return { error: "UNAUTHORIZED", status: 401 };
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) }
  });
  try {
    // Server validation; decoded JWT payloads and user_metadata are not trusted.
    const { data, error } = await client.auth.getUser(match[1]);
    if (error) {
      const invalid = [400, 401, 403].includes(error.status);
      return { error: invalid ? "UNAUTHORIZED" : "AUTH_UNAVAILABLE", status: invalid ? 401 : 503 };
    }
    if (!data.user || data.user.is_anonymous) return { error: "UNAUTHORIZED", status: 401 };
    if (!data.user.email_confirmed_at) return { error: "EMAIL_NOT_CONFIRMED", status: 403 };
    return { user: data.user };
  } catch {
    return { error: "AUTH_UNAVAILABLE", status: 503 };
  }
}
