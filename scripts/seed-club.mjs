#!/usr/bin/env node
/**
 * Idempotent club + adult account seed. Safe to re-run. Does not import kiko times.
 *   DATABASE_URL=… node scripts/seed-club.mjs
 *
 * Reads the club's real roster from data/seed.local.json and its real training venues from
 * data/default-training-schedules.local.json, if present (both gitignored, never committed --
 * see docs/aidev-deploy.md for where they live in production). Falls back to the committed
 * data/seed.example.json / data/default-training-schedules.json otherwise, so a fresh clone of
 * this repo seeds a working demo club without needing anyone's real information.
 *
 * Production runs each release from a fresh releases/<sha> directory (see docs/aidev-deploy.md),
 * so a path resolved relative to this file would never find the real override files that live
 * once at the app root. BMSC_DATA_LOCAL_DIR (set in .env, like every other production secret)
 * points at that stable location instead; it's unset in local dev, where the relative path is
 * already correct.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import pg from "pg";
import { ensureDefaultTrainingSchedules } from "./default-training-schedules.mjs";

const databaseUrl = process.env.DATABASE_URL;
const here = dirname(fileURLToPath(import.meta.url));
const dataLocalDir = process.env.BMSC_DATA_LOCAL_DIR || join(here, "..", "data");
const LOCAL_SEED_PATH = join(dataLocalDir, "seed.local.json");
const EXAMPLE_SEED_PATH = join(here, "..", "data", "seed.example.json");
const LOCAL_SCHEDULES_PATH = join(dataLocalDir, "default-training-schedules.local.json");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const SEED = loadJson(existsSync(LOCAL_SEED_PATH) ? LOCAL_SEED_PATH : EXAMPLE_SEED_PATH);
// undefined when no local override exists -- ensureDefaultTrainingSchedules already defaults
// to the committed synthetic example in that case, so there's nothing to load here.
const localSchedules = existsSync(LOCAL_SCHEDULES_PATH) ? loadJson(LOCAL_SCHEDULES_PATH) : undefined;

/** @param {import('pg').PoolClient} client */
export async function seedClubPg(client) {
  const [superadmin, clubAdmin, guardian] = SEED.adults;
  const ids = {};
  for (const adult of SEED.adults) {
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
      `insert into clubs (name, short_name, city, province, country, coach_name, slug, hostname, sport)
       values ($1, $2, $3, $4, $5, $6, 'bmsc', 'bmsc.klaten.org', 'renang')
       returning id`,
      [SEED.club.name, SEED.club.shortName, SEED.club.city, SEED.club.province, SEED.club.country, SEED.club.coachName],
    );
    clubId = inserted.rows[0].id;
  }
  const superadminId = ids[superadmin.email];
  const clubAdminId = ids[clubAdmin.email];
  const guardianId = ids[guardian.email];
  await client.query(
    `insert into club_staff (club_id, user_id, role) values ($1, $2, 'superadmin'), ($1, $3, 'club_admin')
     on conflict (club_id, user_id) do nothing`,
    [clubId, superadminId, clubAdminId],
  );
  const swimmers = await client.query("select id from swimmers where club_id = $1", [clubId]);
  if (swimmers.rows.length === 0) {
    const params = [clubId, SEED.club.city];
    const rows = SEED.swimmers.map((s) => {
      const base = params.length;
      params.push(s.fullName, s.dateOfBirth, s.gender);
      return `($1, $${base + 1}, $${base + 2}, $${base + 3}, 'Indonesia', $2, 'aktif')`;
    });
    const created = await client.query(
      `insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, city, status) values
        ${rows.join(",\n        ")}
       returning id`,
      params,
    );
    for (const row of created.rows) {
      await client.query(
        `insert into guardians (user_id, swimmer_id) values ($1, $3), ($2, $3)
         on conflict (user_id, swimmer_id) do nothing`,
        [superadminId, guardianId, row.id],
      );
    }
  }
  console.log("[seed] club seed ensured.");
  return clubId;
}

async function main() {
  if (!databaseUrl) {
    console.error("[seed] DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const clubId = await seedClubPg(client);
    const schedules = await ensureDefaultTrainingSchedules(client.query.bind(client), clubId, localSchedules);
    await client.query("commit");
    console.log(
      `[seed] schedules ensured (${schedules.seriesCreated} series, ${schedules.practicesCreated} practices created).`,
    );
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

const isCli = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main().catch((err) => {
    console.error("[seed] failed:", err?.message || err);
    process.exit(1);
  });
}
