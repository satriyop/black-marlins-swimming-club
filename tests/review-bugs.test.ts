import { expect, test } from "vitest";
import { listPracticeAttendance } from "../src/lib/club/attendance";
import { getDashboardData, meetEntryNames } from "../src/lib/club/dashboard";
import { hatsFor } from "../src/lib/club/hats";
import {
  acceptInvite,
  acceptPendingInvitesForEmail,
  acceptSwimmerInvite,
  createInvite,
  listInvites,
} from "../src/lib/club/invites";
import { saveResult } from "../src/lib/club/results";
import { AZKIYA_ID, RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { deleteActivity, deleteMeet, deletePractice, deleteSwimmer } from "../src/lib/club/writes";
import { createClubHarness } from "./harness";

test("accept staff invite by matching email grants coach", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const invite = await createInvite(h.actor(SATRIYO_ID), {
    kind: "staff",
    email: "hardiyanto@example.com",
    confirmedEmail: "hardiyanto@example.com",
    role: "coach",
  });
  expect(invite.acceptPath).toContain("/terima?token=");
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_hardi', 'Hardiyanto', 'hardiyanto@example.com', true, now(), now())
  `;
  await acceptPendingInvitesForEmail(h.sql, "usr_hardi");
  expect((await hatsFor(h.actor("usr_hardi"))).staff).toBe("coach");
});

test("accept swimmer_account invite creates a password login linked to that perenang", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  const invite = await createInvite(h.actor(RATIH_ID), {
    kind: "swimmer_account",
    email: "luigi@example.com",
    swimmerIds: [luigi.id],
  });
  const { userId } = await acceptSwimmerInvite(h.sql, { token: invite.token, password: "renang123" });
  const linked = await h.sql<{ user_id: string | null }>`select user_id from swimmers where id = ${luigi.id}`;
  expect(linked[0]?.user_id).toBe(userId);
  const accounts = await h.sql<{ providerId: string; password: string | null }>`
    select "providerId" as "providerId", password from account where "userId" = ${userId}
  `;
  expect(accounts[0]?.providerId).toBe("credential");
  expect(accounts[0]?.password).toBeTruthy();
});

test("weaker staff invite does not downgrade superadmin", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    createInvite(h.actor(AZKIYA_ID), {
      kind: "staff",
      email: "satriyopamungkas@gmail.com",
      confirmedEmail: "satriyopamungkas@gmail.com",
      role: "coach",
    }),
  ).rejects.toThrow(/sudah staf/);
  expect((await hatsFor(h.actor(SATRIYO_ID))).staff).toBe("superadmin");
});

test("wali listInvites omits another family's pending guardian invite email", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const extra = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId}, 'Anak Lain', '2015-01-01', 'putra', 'Indonesia', 'aktif')
    returning id
  `;
  await createInvite(h.actor(AZKIYA_ID), {
    kind: "guardian",
    email: "keluarga-lain@example.com",
    swimmerIds: [extra[0]!.id],
  });
  const listed = await listInvites(h.actor(RATIH_ID));
  expect(listed.map((i) => i.email)).not.toContain("keluarga-lain@example.com");
});

test("wali cannot delete roster, practice, meet, or activity", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const kids = await h.sql<{ id: number }>`select id from swimmers limit 1`;
  const practice = await h.sql<{ id: number }>`
    insert into practices (club_id, session_date, kind, title, total_meters)
    values (${clubId}, '2026-09-11', 'teknik', 'Sesi', 500) returning id
  `;
  const meet = await h.sql<{ id: number }>`
    insert into meets (club_id, name, level, course, start_date, status)
    values (${clubId}, 'Tes Meet', 'pengcab', '50', '2026-10-01', 'rencana') returning id
  `;
  const activity = await h.sql<{ id: number }>`
    insert into activities (club_id, title, kind, activity_date)
    values (${clubId}, 'Rapat', 'rapat', '2026-09-12') returning id
  `;
  const wali = h.actor(RATIH_ID);
  await expect(deleteSwimmer(wali, kids[0]!.id)).rejects.toThrow(/Tidak diizinkan/);
  await expect(deletePractice(wali, practice[0]!.id)).rejects.toThrow(/Tidak diizinkan/);
  await expect(deleteMeet(wali, meet[0]!.id)).rejects.toThrow(/Tidak diizinkan/);
  await expect(deleteActivity(wali, activity[0]!.id)).rejects.toThrow(/Tidak diizinkan/);
});

test("wali dashboard, practice, and meet payloads omit unlinked child names", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const extra = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId}, 'Anak Lain', '2015-01-01', 'putra', 'Indonesia', 'aktif')
    returning id
  `;
  const extraId = extra[0]!.id;
  const practice = await h.sql<{ id: number }>`
    insert into practices (club_id, session_date, kind, title, total_meters)
    values (${clubId}, '2026-09-11', 'teknik', 'Sesi', 500) returning id
  `;
  await h.sql`
    insert into practice_attendance (club_id, practice_id, swimmer_id, status)
    values (${clubId}, ${practice[0]!.id}, ${extraId}, 'hadir')
  `;
  const meet = await h.sql<{ id: number }>`
    insert into meets (club_id, name, level, course, start_date, status)
    values (${clubId}, 'Tes Meet', 'pengcab', '50', '2026-10-01', 'rencana') returning id
  `;
  await h.sql`
    insert into meet_entries (club_id, meet_id, swimmer_id, stroke, distance_m, status)
    values (${clubId}, ${meet[0]!.id}, ${extraId}, 'bebas', 50, 'terdaftar')
  `;
  await h.sql`
    insert into results (club_id, swimmer_id, result_date, stroke, distance_m, course, time_ms, status, kind)
    values (${clubId}, ${extraId}, '2026-09-01', 'bebas', 50, '50', 40000, 'selesai', 'official')
  `;
  const dash = await getDashboardData(h.actor(RATIH_ID));
  const blob = JSON.stringify(dash);
  expect(blob).not.toContain("Anak Lain");
  const att = await listPracticeAttendance(h.actor(RATIH_ID), practice[0]!.id);
  expect(att.map((a) => a.swimmer_name)).not.toContain("Anak Lain");
  const names = await meetEntryNames(h.actor(RATIH_ID), meet[0]!.id);
  expect(names).not.toContain("Anak Lain");
  await seedClub(h.sql);
  const afterReseed = await getDashboardData(h.actor(RATIH_ID));
  expect(JSON.stringify(afterReseed)).not.toContain("Anak Lain");
  expect((await hatsFor(h.actor(RATIH_ID))).guardianSwimmerIds).not.toContain(extraId);
  const attAfter = await listPracticeAttendance(h.actor(RATIH_ID), practice[0]!.id);
  expect(attAfter.map((a) => a.swimmer_name)).not.toContain("Anak Lain");
  expect(await meetEntryNames(h.actor(RATIH_ID), meet[0]!.id)).not.toContain("Anak Lain");
});

test("wali saveResult tes succeeds and official fails; PB comes from time_ms", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  const wali = h.actor(RATIH_ID);
  await expect(
    saveResult(wali, {
      swimmerId: luigi.id, resultDate: "2026-09-01", stroke: "bebas", distanceM: 50, course: "50",
      timeMs: 45000, status: "selesai", kind: "official",
    }),
  ).rejects.toThrow(/Tidak diizinkan/);
  const first = await saveResult(wali, {
    swimmerId: luigi.id, resultDate: "2026-09-01", stroke: "bebas", distanceM: 50, course: "50",
    timeMs: 45000, status: "selesai", kind: "test",
  });
  expect(first.isPb).toBe(true);
  const faster = await saveResult(wali, {
    swimmerId: luigi.id, resultDate: "2026-09-11", stroke: "bebas", distanceM: 50, course: "50",
    timeMs: 42000, status: "selesai", kind: "test",
  });
  expect(faster.isPb).toBe(true);
  const dash = await getDashboardData(wali);
  expect(dash.recentPbs.some((r) => r.timeMs === 42000)).toBe(true);
  expect(dash.recentPbs.some((r) => r.timeMs === 45000 && r.stroke === "bebas" && r.distanceM === 50)).toBe(false);
});
