#!/usr/bin/env node
/**
 * Run the Spectra SwimPro meet-catalog sync against a real database.
 *   DATABASE_URL=… node scripts/run-sync-spectra-meets.mjs
 * Intended to run on a daily timer (see docs/aidev-deploy.md) -- each run
 * pages through the public event catalog with patient retries (their
 * backend is intermittently flaky, not access-gated), so a single
 * invocation can take several minutes when the API is having a bad day.
 */
import pg from "pg";
import { syncSpectraMeets } from "./sync-spectra-meets.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[spectra-sync] DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  const query = async (text, params = []) => (await client.query(text, params)).rows;
  const stats = await syncSpectraMeets(query);
  console.log(
    `[spectra-sync] total=${stats.total} inserted=${stats.inserted} updated=${stats.updated} ` +
      `conflicted=${stats.conflicted} unchanged=${stats.unchanged}`,
  );
} catch (err) {
  console.error("[spectra-sync] failed:", err?.message || err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
