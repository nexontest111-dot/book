// Issuer is decided by the server from configuration, never by the client.
// Shared by /api/me and /api/admin/permissions so both pass the same value to the database.
// Callers run authenticate() first, which has already verified SUPABASE_URL is a valid https URL.
export const issuerOf = env => new URL(env.SUPABASE_URL).origin + "/auth/v1";
