import { expect, test } from "vitest";
import { accessFor, UNINVITED_MESSAGE } from "../src/lib/club/access";
import { hatsFor } from "../src/lib/club/hats";
import { acceptInvite, createInvite, recreateInvite } from "../src/lib/club/invites";
import { getPublicClubContact, submitAccessHelp } from "../src/lib/club/members";
import { CLUB_NOT_CHOSEN } from "../src/lib/club/membership";
import { getMonthlyReport } from "../src/lib/club/monthly-report";
import { seedClub } from "../src/lib/club/seed";
import { listSwimmers } from "../src/lib/club/swimmers";
import { createClubHarness } from "./harness";

async function user(sql: Awaited<ReturnType<typeof createClubHarness>>["sql"], id: string, email: string) {
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${id}, ${id}, ${email}, true, now(), now())
  `;
}

async function twoClubs() {
  const h = await createClubHarness();
  const clubs = await h.sql<{ id: number }>`
    insert into clubs (name, short_name, city, province, coach_name, slug, hostname, sport, support_email)
    values
      ('Black Marlins Swimming Club Klaten', 'BMSC', 'Klaten', 'Jawa Tengah', 'Hardiyanto Wibowo', 'bmsc', 'bmsc.klaten.org', 'renang', 'bmsc@example.test'),
      ('Apta Swimming', 'Apta', 'Klaten', 'Jawa Tengah', 'Ketua Apta', 'apta', 'apta.klaten.org', 'renang', 'apta@example.test')
    returning id
  `;
  const bmsc = clubs[0]!.id;
  const apta = clubs[1]!.id;
  for (const [id, email] of [
    ["coach-a", "coach-a@example.test"],
    ["wali-a", "wali-a@example.test"],
    ["both", "both@example.test"],
    ["admin-a", "admin-a@example.test"],
    ["joiner", "joiner@example.test"],
    ["stranger", "stranger@example.test"],
  ] as const) {
    await user(h.sql, id, email);
  }
  const swimmers = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values
      (${bmsc}, 'Bima Marlin', '2014-03-02', 'putra', 'Indonesia', 'aktif'),
      (${apta}, 'Alya Apta', '2015-04-05', 'putri', 'Indonesia', 'aktif')
    returning id
  `;
  const bima = swimmers[0]!.id;
  const alya = swimmers[1]!.id;
  await h.sql`
    insert into club_staff (club_id, user_id, role) values
      (${bmsc}, 'coach-a', 'coach'),
      (${bmsc}, 'admin-a', 'superadmin'),
      (${bmsc}, 'both', 'coach'),
      (${apta}, 'both', 'club_admin')
  `;
  await h.sql`insert into club_family (club_id, user_id) values (${bmsc}, 'wali-a')`;
  await h.sql`insert into guardians (user_id, swimmer_id) values ('wali-a', ${bima})`;
  return { ...h, bmsc, apta, bima, alya };
}

test("seeded BMSC keeps slug, hostname, and sport renang", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const rows = await h.sql<{ slug: string; hostname: string; sport: string }>`
    select slug, hostname, sport from clubs where id = ${clubId}
  `;
  expect(rows[0]).toEqual({ slug: "bmsc", hostname: "bmsc.klaten.org", sport: "renang" });
});

test("club slug and hostname may be null on more than one row", async () => {
  const h = await createClubHarness();
  const rows = await h.sql<{ sport: string }>`
    insert into clubs (name, short_name, city, province, coach_name)
    values ('Klub Kosong', 'K', 'Klaten', 'Jateng', 'Pelatih'), ('Klub Lain', 'L', 'Solo', 'Jateng', 'Pelatih')
    returning sport
  `;
  expect(rows.map((row) => row.sport)).toEqual(["renang", "renang"]);
});

test("a hat on BMSC only is uninvited in an Apta context and shows no BMSC names", async () => {
  const f = await twoClubs();
  const apta = f.actor("coach-a", f.apta);
  const access = await accessFor(apta);
  expect(access.invited).toBe(false);
  expect(access.message).toBe(UNINVITED_MESSAGE);
  expect(access.hats.staff).toBeNull();
  expect(access.hats.guardianSwimmerIds).toEqual([]);
  const names = (await listSwimmers(apta)).map((swimmer) => swimmer.fullName);
  expect(names).toEqual([]);
  expect(names.join(" ")).not.toContain("Bima");
  expect(names.join(" ")).not.toContain("Alya");
});

test("hats on both clubs show only the club in context", async () => {
  const f = await twoClubs();
  expect((await listSwimmers(f.actor("both", f.bmsc))).map((swimmer) => swimmer.fullName)).toEqual([
    "Bima Marlin",
  ]);
  expect((await listSwimmers(f.actor("both", f.apta))).map((swimmer) => swimmer.fullName)).toEqual([
    "Alya Apta",
  ]);
  expect((await hatsFor(f.actor("both", f.bmsc))).staff).toBe("coach");
  expect((await hatsFor(f.actor("both", f.apta))).staff).toBe("club_admin");
  expect((await hatsFor(f.actor("both", f.apta))).guardianSwimmerIds).toEqual([]);
  await expect(hatsFor(f.actor("both"))).rejects.toThrow(CLUB_NOT_CHOSEN);
  await expect(listSwimmers(f.actor("both"))).rejects.toThrow(CLUB_NOT_CHOSEN);
});

test("a BMSC guardian cannot load an Apta swimmer", async () => {
  const f = await twoClubs();
  const wali = f.actor("wali-a", f.bmsc);
  await expect(getMonthlyReport(wali, f.alya, "2026-09")).rejects.toThrow("Perenang tidak ditemukan");
  await expect(getMonthlyReport(wali, 999_999, "2026-09")).rejects.toThrow("Perenang tidak ditemukan");
  expect((await listSwimmers(wali)).map((swimmer) => swimmer.fullName)).toEqual(["Bima Marlin"]);
});

test("an invite for BMSC cannot be accepted in an Apta context", async () => {
  const f = await twoClubs();
  const invite = await createInvite(f.actor("admin-a", f.bmsc), {
    kind: "staff",
    email: "joiner@example.test",
    confirmedEmail: "joiner@example.test",
    role: "coach",
  });
  await expect(
    acceptInvite(f.sql, {
      token: invite.token,
      userId: "joiner",
      email: "joiner@example.test",
      clubId: f.apta,
    }),
  ).rejects.toThrow(/tidak berlaku/);
  const pending = await f.sql<{ accepted_at: string | null }>`
    select accepted_at::text from invites where token = ${invite.token}
  `;
  expect(pending[0]?.accepted_at).toBeNull();
  expect((await hatsFor(f.actor("joiner", f.apta))).staff).toBeNull();
  await acceptInvite(f.sql, {
    token: invite.token,
    userId: "joiner",
    email: "joiner@example.test",
    clubId: f.bmsc,
  });
  expect((await hatsFor(f.actor("joiner", f.bmsc))).staff).toBe("coach");
  expect((await hatsFor(f.actor("joiner", f.apta))).staff).toBeNull();
  expect((await listSwimmers(f.actor("joiner", f.apta))).map((swimmer) => swimmer.fullName)).toEqual([]);
});

test("recreating an invite stays on the club in context when the admin has both hats", async () => {
  const f = await twoClubs();
  await f.sql`insert into club_staff (club_id, user_id, role) values (${f.apta}, 'admin-a', 'club_admin')`;
  const invite = await createInvite(f.actor("admin-a", f.bmsc), {
    kind: "staff",
    email: "joiner@example.test",
    confirmedEmail: "joiner@example.test",
    role: "coach",
  });
  const recreated = await recreateInvite(f.actor("admin-a", f.bmsc), { id: invite.id });
  const rows = await f.sql<{ club_id: number; revoked_at: string | null }>`
    select club_id, revoked_at::text from invites where id in (${invite.id}, ${recreated.id}) order by id
  `;
  expect(rows[0]?.club_id).toBe(f.bmsc);
  expect(rows[0]?.revoked_at).toBeTruthy();
  expect(rows[1]?.club_id).toBe(f.bmsc);
  expect(rows[1]?.revoked_at).toBeNull();
});

test("no hat and two clubs is uninvited when no club was resolved", async () => {
  const f = await twoClubs();
  const stranger = f.actor("stranger");
  const access = await accessFor(stranger);
  expect(access.invited).toBe(false);
  expect(access.message).toBe(UNINVITED_MESSAGE);
  expect(await listSwimmers(stranger)).toEqual([]);
  await expect(
    submitAccessHelp(stranger, { kind: "access", message: "Undang saya" }),
  ).rejects.toThrow(/Tidak diizinkan|Klub belum dipilih/);
});

test("public contact and access-help use the resolved club, not the first row", async () => {
  const f = await twoClubs();
  await expect(getPublicClubContact(f.sql)).rejects.toThrow(CLUB_NOT_CHOSEN);
  const apta = await getPublicClubContact(f.sql, f.apta);
  expect(apta?.name).toBe("Apta Swimming");
  expect(apta?.supportEmail).toBe("apta@example.test");
  const bmsc = await getPublicClubContact(f.sql, f.bmsc);
  expect(bmsc?.supportEmail).toBe("bmsc@example.test");

  await submitAccessHelp(f.actor("stranger", f.apta), { kind: "access", message: "Undang ke Apta" });
  const filed = await f.sql<{ club_id: number; message: string }>`
    select club_id, message from access_help_requests
  `;
  expect(filed).toEqual([{ club_id: f.apta, message: "Undang ke Apta" }]);
  expect(filed[0]?.message).not.toContain("Bima");
});
