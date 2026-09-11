#!/usr/bin/env node
/**
 * Import kiko race times. Not part of schema migrate — run on demand.
 *   DATABASE_URL=… node scripts/run-import-kiko.mjs
 */
import pg from "pg";
import { importKikoResults } from "./import-kiko-results.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[kiko-import] DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  const query = async (text, params = []) => (await client.query(text, params)).rows;
  const stats = await importKikoResults(query);
  console.log(
    `[kiko-import] inserted=${stats.inserted} skipped=${stats.skipped} updated=${stats.updated ?? 0}`,
  );
} catch (err) {
  console.error("[kiko-import] failed:", err?.message || err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
