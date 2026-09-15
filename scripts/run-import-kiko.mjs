#!/usr/bin/env node
/**
 * Import kiko race times. Not part of schema migrate — run on demand.
 *   DATABASE_URL=… node scripts/run-import-kiko.mjs
 *
 * Resolves the club's real roster from data/seed.local.json, if present (gitignored, never
 * committed -- see docs/aidev-deploy.md), and passes its kikoCode -> name/nickname mapping into
 * importKikoResults explicitly. BMSC_DATA_LOCAL_DIR overrides where that file is read from,
 * since production runs each release from a fresh releases/<sha> directory (see scripts/
 * seed-club.mjs for the same override).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { importKikoResults } from "./import-kiko-results.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[kiko-import] DATABASE_URL is required");
  process.exit(1);
}

function realAthleteNames() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const seedPath = join(process.env.BMSC_DATA_LOCAL_DIR || join(root, "data"), "seed.local.json");
  if (!existsSync(seedPath)) return { names: {}, nicknames: {} };
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));
  const names = {};
  const nicknames = {};
  for (const s of seed.swimmers ?? []) {
    if (!s.kikoCode) continue;
    names[s.kikoCode] = s.fullName;
    if (s.nickname) nicknames[s.kikoCode] = s.nickname;
  }
  return { names, nicknames };
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  const query = async (text, params = []) => (await client.query(text, params)).rows;
  const { names, nicknames } = realAthleteNames();
  const stats = await importKikoResults(query, names, nicknames);
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
