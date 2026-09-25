#!/usr/bin/env node
/**
 * Operator-only Club row. Empty roster. Not a seed, and not kiko.
 *   DATABASE_URL=… node scripts/provision-club.mjs \
 *     --slug apta --hostname apta.klaten.org \
 *     --name "Apta Swimming" --short-name Apta --city Klaten --province "Jawa Tengah" --sport renang
 *   DATABASE_URL=… node scripts/provision-club.mjs --club apta --invite-admin ketua@example.com
 *   DATABASE_URL=… node scripts/provision-club.mjs --club apta --superadmin satriyo@example.com
 */
import { randomBytes } from "node:crypto";
import pg from "pg";

function flag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return value;
}

export function parseProvisionArgs(argv) {
  const slug = flag(argv, "--slug");
  const club = flag(argv, "--club") || slug;
  if (!club) throw new Error("Pass --slug to create a Club, or --club <slug-or-hostname> to grant a Hat");
  return {
    club,
    slug,
    hostname: flag(argv, "--hostname"),
    name: flag(argv, "--name"),
    shortName: flag(argv, "--short-name"),
    city: flag(argv, "--city"),
    province: flag(argv, "--province"),
    country: flag(argv, "--country") || "Indonesia",
    coachName: flag(argv, "--coach") || flag(argv, "--short-name") || "Ketua",
    sport: flag(argv, "--sport") || "renang",
    inviteAdmin: flag(argv, "--invite-admin"),
    superadmin: flag(argv, "--superadmin"),
  };
}

export async function provisionClub(query, input) {
  const ref = input.slug || input.club;
  if (!ref) throw new Error("Pass --slug or --club");
  let rows = await query(
    `select id from clubs where lower(slug) = lower($1) or lower(hostname) = lower($1)`,
    [ref],
  );
  let created = false;
  if (!rows[0]) {
    if (!input.slug || !input.hostname || !input.name || !input.shortName || !input.city || !input.province) {
      throw new Error("A new Club needs --slug, --hostname, --name, --short-name, --city, and --province");
    }
    rows = await query(
      `insert into clubs (name, short_name, city, province, country, coach_name, slug, hostname, sport)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        input.name,
        input.shortName,
        input.city,
        input.province,
        input.country || "Indonesia",
        input.coachName || input.shortName,
        input.slug,
        input.hostname,
        input.sport || "renang",
      ],
    );
    created = true;
  }
  const clubId = rows[0].id;
  let inviteToken = null;
  if (input.inviteAdmin) {
    const pending = await query(
      `select token from invites
       where club_id = $1 and lower(email) = lower($2) and kind = 'staff'
         and accepted_at is null and revoked_at is null and expires_at > now()`,
      [clubId, input.inviteAdmin],
    );
    if (pending[0]) inviteToken = pending[0].token;
    else {
      inviteToken = randomBytes(24).toString("hex");
      await query(
        `insert into invites (club_id, email, kind, payload, token, invited_by, expires_at)
         values ($1, $2, 'staff', $3::jsonb, $4, 'operator', now() + interval '14 days')`,
        [clubId, input.inviteAdmin, JSON.stringify({ role: "club_admin", swimmerIds: [] }), inviteToken],
      );
    }
  }
  if (input.superadmin) {
    const users = await query(`select id from "user" where lower(email) = lower($1)`, [input.superadmin]);
    if (!users[0]) throw new Error(`No user for ${input.superadmin}. Sign in with Google first.`);
    await query(
      `insert into club_staff (club_id, user_id, role) values ($1, $2, 'superadmin')
       on conflict (club_id, user_id) do update set role = 'superadmin'`,
      [clubId, users[0].id],
    );
  }
  const swimmers = await query(`select count(*)::int as n from swimmers where club_id = $1`, [clubId]);
  return { clubId, created, inviteToken, swimmers: Number(swimmers[0]?.n ?? 0) };
}

async function main() {
  let input;
  try {
    input = parseProvisionArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[provision] ${err?.message || err}`);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[provision] DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const query = async (text, params = []) => (await client.query(text, params)).rows;
    const result = await provisionClub(query, input);
    console.log(
      `[provision] club=${result.clubId} created=${result.created} swimmers=${result.swimmers}` +
        (result.inviteToken ? ` invite=${result.inviteToken}` : ""),
    );
  } catch (err) {
    console.error("[provision] failed:", err?.message || err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

const isCli = process.argv[1] && process.argv[1].endsWith("provision-club.mjs");
if (isCli) {
  main();
}
