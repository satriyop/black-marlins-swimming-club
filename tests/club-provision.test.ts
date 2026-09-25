import { expect, test } from "vitest";
import { parseSeedArgs, seedClubPg } from "../scripts/seed-club.mjs";
import { parseProvisionArgs, provisionClub } from "../scripts/provision-club.mjs";
import { seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

const apta = {
  club: "apta",
  slug: "apta",
  hostname: "apta.klaten.org",
  name: "Apta Swimming",
  shortName: "Apta",
  city: "Klaten",
  province: "Jawa Tengah",
  country: "Indonesia",
  coachName: "Ketua",
  sport: "renang",
  inviteAdmin: null as string | null,
  superadmin: null as string | null,
};

test("provision creates an empty club, invites club admin, and grants superadmin", async () => {
  const h = await createClubHarness();
  const query = h.sql.query.bind(h.sql);
  const created = await provisionClub(query, { ...apta, inviteAdmin: "ketua@example.test" });
  expect(created.created).toBe(true);
  expect(created.swimmers).toBe(0);
  expect(created.inviteToken).toBeTruthy();

  await h.sql.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('usr_operator', 'Operator', 'operator@example.test', true, now(), now())`,
  );
  const again = await provisionClub(query, {
    ...apta,
    slug: null,
    inviteAdmin: "ketua@example.test",
    superadmin: "operator@example.test",
  });
  expect(again.created).toBe(false);
  expect(again.swimmers).toBe(0);
  expect(again.inviteToken).toBe(created.inviteToken);

  const staff = await h.sql.query<{ role: string }>(
    `select role from club_staff where club_id = $1 and user_id = 'usr_operator'`,
    [created.clubId],
  );
  expect(staff[0]?.role).toBe("superadmin");
  const invites = await h.sql.query<{ email: string; role: string }>(
    `select email, payload->>'role' as role from invites where club_id = $1`,
    [created.clubId],
  );
  expect(invites).toEqual([{ email: "ketua@example.test", role: "club_admin" }]);
});

test("provision refuses to guess a club", () => {
  expect(() => parseProvisionArgs([])).toThrow(/--slug/);
});

test("bmsc seed leaves an existing Apta roster empty and does not recreate BMSC", async () => {
  const h = await createClubHarness();
  await h.sql.query(
    `insert into clubs (name, short_name, city, province, coach_name, slug, hostname, sport)
     values ('Apta Swimming', 'Apta', 'Klaten', 'Jawa Tengah', 'Ketua', 'apta', 'apta.klaten.org', 'renang')`,
  );
  const bmscId = await seedClub(h.sql);
  const again = await seedClub(h.sql);
  expect(again).toBe(bmscId);
  const clubs = await h.sql.query<{ slug: string }>("select slug from clubs order by slug");
  expect(clubs.map((row) => row.slug)).toEqual(["apta", "bmsc"]);
  const counts = await h.sql.query<{ slug: string; n: number }>(
    `select c.slug, count(s.id)::int as n
     from clubs c left join swimmers s on s.club_id = c.id
     group by c.slug order by c.slug`,
  );
  expect(counts.map((row) => ({ slug: row.slug, n: Number(row.n) }))).toEqual([
    { slug: "apta", n: 0 },
    { slug: "bmsc", n: 3 },
  ]);
});

test("the seed script refuses another club's slug and still creates bmsc beside Apta", async () => {
  const h = await createClubHarness();
  const client = {
    query: async (text: string, params?: unknown[]) => ({ rows: await h.sql.query(text, params) }),
  };
  expect(() => parseSeedArgs([])).toThrow(/--club/);
  await expect(seedClubPg(client, { clubRef: "apta" })).rejects.toThrow(/provision-club/);
  const clubId = await seedClubPg(client, { clubRef: "bmsc" });
  const slugs = await h.sql.query<{ slug: string }>("select slug from clubs order by slug");
  expect(slugs.map((row) => row.slug)).toEqual(["bmsc"]);
  const apta = await h.sql.query(
    `insert into clubs (name, short_name, city, province, coach_name, slug, hostname, sport)
     values ('Apta', 'Apta', 'Klaten', 'Jawa Tengah', 'Ketua', 'apta', 'apta.klaten.org', 'renang')
     returning id`,
  );
  const again = await seedClubPg(client, { clubRef: "bmsc.klaten.org" });
  expect(again).toBe(clubId);
  const aptaSwimmers = await h.sql.query<{ n: number }>(
    "select count(*)::int as n from swimmers where club_id = $1",
    [apta[0]!.id],
  );
  expect(Number(aptaSwimmers[0]?.n)).toBe(0);
  expect((await h.sql.query("select id from clubs where slug = 'bmsc'")).length).toBe(1);
});
