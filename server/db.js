import { Client } from "pg";

export async function withDatabase(env, task) {
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 8000
  });
  try {
    await client.connect();
    return await task(client);
  } finally {
    await client.end().catch(() => {});
  }
}
