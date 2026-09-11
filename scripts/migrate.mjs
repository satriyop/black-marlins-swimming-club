#!/usr/bin/env node
/**
 * Apply pending SQL migrations only. Does not seed accounts or import kiko times.
 *   DATABASE_URL=… node scripts/migrate.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import pg from "pg";
import { pendingMigrations } from "./migration-plan.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log(
    "[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).",
  );
  process.exit(0);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function applyMigrations(query) {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    return { applied: 0, names: [] };
  }
  if (pendingMigrations(entries, []).length === 0) {
    return { applied: 0, names: [] };
  }

  await query(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const appliedRows = await query("SELECT name FROM _migrations");
  const applied = appliedRows.map((r) => r.name);
  const names = [];
  for (const { name } of pendingMigrations(entries, applied)) {
    const text = await readFile(join(migrationsDir, name), "utf8");
    await query("BEGIN");
    try {
      await query(text);
      await query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
      await query("COMMIT");
    } catch (err) {
      try {
        await query("ROLLBACK");
      } catch {
        // keep original error
      }
      console.error(`[migrate] error applying ${name}`);
      throw err;
    }
    console.log(`[migrate] applied ${name}`);
    names.push(name);
  }
  return { applied: names.length, names };
}

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  const query = async (text, params = []) => (await client.query(text, params)).rows;
  try {
    const stats = await applyMigrations(query);
    console.log(
      stats.applied ? `[migrate] done — ${stats.applied} migration(s) applied.` : "[migrate] up to date.",
    );
  } finally {
    client.release();
    await pool.end();
  }
}

const isCli = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  main().catch((err) => {
    console.error("[migrate] failed:", err?.message || err);
    for (const key of ["code", "detail", "hint", "position", "where"]) {
      if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
    }
    process.exit(1);
  });
}
