import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { getDashboardData } from "../src/lib/club/dashboard";
import { hatsFor } from "../src/lib/club/hats";
import { acceptSwimmerInvite, createInvite } from "../src/lib/club/invites";
import { savePracticeRecord } from "../src/lib/club/practice";
import { saveResult } from "../src/lib/club/results";
import { AZKIYA_EMAIL, AZKIYA_ID, RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("swimmer invite cannot attach a password to an existing staff user", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number }>`select id from swimmers limit 1`;
  await expect(
    createInvite(h.actor(RATIH_ID), {
      kind: "swimmer_account",
      email: AZKIYA_EMAIL,
      swimmerIds: [kids[0]!.id],
    }),
  ).rejects.toThrow(/sudah terpakai/);
});

test("expired swimmer invite does not create a credential", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number }>`select id from swimmers limit 1`;
  const invite = await createInvite(h.actor(RATIH_ID), {
    kind: "swimmer_account",
    email: "anak-baru@example.com",
    swimmerIds: [kids[0]!.id],
  });
  await h.sql`update invites set expires_at = now() - interval '1 day' where token = ${invite.token}`;
  await expect(
    acceptSwimmerInvite(h.sql, { token: invite.token, password: "renang123" }),
  ).rejects.toThrow(/tidak berlaku/);
  const users = await h.sql<{
    n: number;
  }>`select count(*)::int as n from "user" where email = 'anak-baru@example.com'`;
  expect(users[0]?.n).toBe(0);
  const accounts = await h.sql<{
    n: number;
  }>`select count(*)::int as n from account where password is not null`;
  expect(accounts[0]?.n).toBe(0);
});

test("seedClub does not restore deleted staff", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await h.sql`delete from club_staff where user_id = ${AZKIYA_ID}`;
  await seedClub(h.sql);
  expect((await hatsFor(h.actor(AZKIYA_ID))).staff).toBeNull();
});

test("new practice records unmarked attendance with no completed meters", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await savePracticeRecord(h.actor(SATRIYO_ID), {
    sessionDate: "2026-10-01",
    kind: "teknik",
    title: "Sesi baru",
    sets: [{ block: "utama", reps: 4, distanceM: 50, stroke: "bebas" }],
  });
  const att = await h.sql<{ status: string; meters_completed: number | null }>`
    select status, meters_completed from practice_attendance where practice_id = ${saved.id}
  `;
  expect(att.length).toBe(3);
  expect(att.every((a) => a.status === "belum" && a.meters_completed == null)).toBe(true);
});

test("negative times are rejected", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number }>`select id from swimmers limit 1`;
  await expect(
    saveResult(h.actor(SATRIYO_ID), {
      swimmerId: kids[0]!.id,
      resultDate: "2026-09-01",
      stroke: "bebas",
      distanceM: 50,
      course: "50",
      timeMs: -1,
      status: "selesai",
      kind: "official",
    }),
  ).rejects.toThrow(/Waktu tidak valid/);
});

test("dashboard applies family visibility before the recent-result cap", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name === "Perenang Tiga")!;
  const extra = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId}, 'Anak Lain', '2015-01-01', 'putra', 'Indonesia', 'aktif')
    returning id
  `;
  await h.sql`
    insert into results (club_id, swimmer_id, result_date, stroke, distance_m, course, time_ms, status, kind)
    values (${clubId}, ${luigi.id}, '2020-01-01', 'bebas', 50, '50', 40000, 'selesai', 'official')
  `;
  for (let i = 0; i < 40; i += 1) {
    await h.sql`
      insert into results (club_id, swimmer_id, result_date, stroke, distance_m, course, time_ms, status, kind)
      values (${clubId}, ${extra[0]!.id}, ${`2099-01-${String((i % 28) + 1).padStart(2, "0")}`}, 'bebas', 50, '50', ${30000 + i}, 'selesai', 'official')
    `;
  }
  const dash = await getDashboardData(h.actor(RATIH_ID));
  expect(
    dash.recentResults.some((r) => r.timeMs === 40000 && r.swimmerName === "Perenang Tiga"),
  ).toBe(true);
  expect(JSON.stringify(dash)).not.toContain("Anak Lain");
});

test("detail routes are not nested under list layouts", () => {
  const tree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
  expect(tree).toContain("from './routes/event_.$id'");
  expect(tree).toMatch(/id: '\/event_\/\$id'[\s\S]*getParentRoute: \(\) => rootRouteImport/);
  expect(tree).not.toMatch(/getParentRoute: \(\) => EventRoute/);
});
