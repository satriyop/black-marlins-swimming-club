#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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

const SEED_ADULTS = [
  { fallbackId: "usr_satriyo", name: "Satriyo", email: "satriyopamungkas@gmail.com", role: "superadmin" },
  { fallbackId: "usr_azkiya", name: "Azkiya", email: "azkiyakhayladwrd04@gmail.com", role: "club_admin" },
  { fallbackId: "usr_ratih", name: "Ratih", email: "ratihsasminta@gmail.com", role: null },
];

/** @param {import('pg').PoolClient} client */
async function seedClubPg(client) {
  const ids = {};
  for (const adult of SEED_ADULTS) {
    const found = await client.query('select id from "user" where email = $1', [adult.email]);
    if (found.rows[0]) {
      ids[adult.email] = found.rows[0].id;
    } else {
      await client.query(
        'insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, true, now(), now())',
        [adult.fallbackId, adult.name, adult.email],
      );
      ids[adult.email] = adult.fallbackId;
    }
  }
  let clubId;
  const club = await client.query("select id from clubs limit 1");
  if (club.rows[0]) clubId = club.rows[0].id;
  else {
    const inserted = await client.query(
      `insert into clubs (name, short_name, city, province, country, coach_name)
       values ('Black Marlins Swimming Club Klaten', 'BMSC', 'Klaten', 'Jawa Tengah', 'Indonesia', 'Hardiyanto Wibowo')
       returning id`,
    );
    clubId = inserted.rows[0].id;
  }
  const satriyoId = ids["satriyopamungkas@gmail.com"];
  const azkiyaId = ids["azkiyakhayladwrd04@gmail.com"];
  const ratihId = ids["ratihsasminta@gmail.com"];
  await client.query(
    `insert into club_staff (club_id, user_id, role) values ($1, $2, 'superadmin'), ($1, $3, 'club_admin')
     on conflict (club_id, user_id) do nothing`,
    [clubId, satriyoId, azkiyaId],
  );
  const swimmers = await client.query("select id from swimmers where club_id = $1", [clubId]);
  if (swimmers.rows.length === 0) {
    const created = await client.query(
      `insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, city, status) values
        ($1, 'Ken Athaya Nirwasita', '2012-06-30', 'putri', 'Indonesia', 'Klaten', 'aktif'),
        ($1, 'Luigi Banyu Pamungkas', '2014-06-05', 'putra', 'Indonesia', 'Klaten', 'aktif'),
        ($1, 'Kun Bumi Pamungkas', '2014-06-05', 'putra', 'Indonesia', 'Klaten', 'aktif')
       returning id`,
      [clubId],
    );
    for (const row of created.rows) {
      await client.query(
        `insert into guardians (user_id, swimmer_id) values ($1, $3), ($2, $3)
         on conflict (user_id, swimmer_id) do nothing`,
        [satriyoId, ratihId, row.id],
      );
    }
  }
  console.log("[migrate] club seed ensured.");
}

async function main() {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("[migrate] no migrations/ directory — nothing to do.");
    return;
  }
  if (pendingMigrations(entries, []).length === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = (await client.query("SELECT name FROM _migrations")).rows.map(
      (r) => r.name,
    );

    let count = 0;
    for (const { name } of pendingMigrations(entries, applied)) {
      const text = await readFile(join(migrationsDir, name), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(text);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (err) {
        console.error(`[migrate] error applying ${name}`);
        try {
          await client.query("ROLLBACK");
        } catch {
          // keep original error
        }
        throw err;
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.");
    await seedClubPg(client);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }
  process.exit(1);
});
