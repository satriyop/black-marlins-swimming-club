import { expect, test } from "vitest";
import { accessFor } from "../src/lib/club/access";
import { hatsFor } from "../src/lib/club/hats";
import { acceptInvite, acceptPendingInvitesForEmail, createInvite } from "../src/lib/club/invites";
import { savePracticeRecord } from "../src/lib/club/practice";
import { AZKIYA_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { listSwimmers, saveSwimmer } from "../src/lib/club/swimmers";
import { createClubHarness } from "./harness";

const child = {
  fullName: "Aira Baru",
  dateOfBirth: "2016-03-01",
  gender: "putri" as const,
  status: "aktif" as const,
};

async function admitParent(h: Awaited<ReturnType<typeof createClubHarness>>, email: string, userId: string) {
  const invite = await createInvite(h.actor(SATRIYO_ID), {
    kind: "guardian",
    email,
    swimmerIds: [],
  });
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${userId}, 'Ibu Baru', ${email}, true, now(), now())
  `;
  await acceptInvite(h.sql, { token: invite.token, userId, email });
  return h.actor(userId);
}

test("accepting an empty wali invite admits the parent with no children", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const parent = await admitParent(h, "ibu-baru@example.com", "usr_ibu_baru");
  const access = await accessFor(parent);
  const hats = await hatsFor(parent);
  expect(access.invited).toBe(true);
  expect(hats.staff).toBeNull();
  expect(hats.family).toBe(true);
  expect(hats.guardianSwimmerIds).toEqual([]);
  expect(await listSwimmers(parent)).toEqual([]);
});

test("admitted parent still cannot see the skuad", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const parent = await admitParent(h, "ibu-baru@example.com", "usr_ibu_baru");
  const names = (await listSwimmers(parent)).map((s) => s.fullName);
  expect(names).not.toContain("Perenang Satu");
  expect(names).not.toContain("Perenang Tiga");
});

test("loadClub auto-accept of an empty wali invite also admits the parent", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await createInvite(h.actor(SATRIYO_ID), {
    kind: "guardian",
    email: "ibu-auto@example.com",
    swimmerIds: [],
  });
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_ibu_auto', 'Ibu Auto', 'ibu-auto@example.com', true, now(), now())
  `;
  await acceptPendingInvitesForEmail(h.sql, "usr_ibu_auto");
  const access = await accessFor(h.actor("usr_ibu_auto"));
  expect(access.invited).toBe(true);
  expect((await hatsFor(h.actor("usr_ibu_auto"))).family).toBe(true);
});

test("admitted parent creating a swimmer links themselves as wali", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const parent = await admitParent(h, "ibu-baru@example.com", "usr_ibu_baru");
  const saved = await saveSwimmer(parent, { ...child, asChild: true });
  const hats = await hatsFor(parent);
  expect(hats.guardianSwimmerIds).toEqual([saved.id]);
  const mine = await listSwimmers(parent);
  expect(mine.map((s) => s.fullName)).toEqual(["Aira Baru"]);
});

test("admin creating a swimmer does not become wali", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const before = (await hatsFor(h.actor(AZKIYA_ID))).guardianSwimmerIds;
  const saved = await saveSwimmer(h.actor(AZKIYA_ID), child);
  const after = (await hatsFor(h.actor(AZKIYA_ID))).guardianSwimmerIds;
  expect(after).toEqual(before);
  expect(after).not.toContain(saved.id);
});

test("admin Daftarkan anak saya does self-link", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await saveSwimmer(h.actor(AZKIYA_ID), { ...child, asChild: true });
  expect((await hatsFor(h.actor(AZKIYA_ID))).guardianSwimmerIds).toContain(saved.id);
});

test("coach cannot create a swimmer", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_coach_enroll', 'Coach', 'coach-enroll@example.com', true, now(), now())
  `;
  await h.sql`insert into club_staff (club_id, user_id, role) values (${clubId}, 'usr_coach_enroll', 'coach')`;
  await expect(saveSwimmer(h.actor("usr_coach_enroll"), child)).rejects.toThrow(/Tidak diizinkan/);
  await expect(saveSwimmer(h.actor("usr_coach_enroll"), { ...child, asChild: true })).rejects.toThrow(
    /Tidak diizinkan/,
  );
});

test("wali create of a matching name and date of birth is blocked", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const parent = await admitParent(h, "ibu-baru@example.com", "usr_ibu_baru");
  await expect(
    saveSwimmer(parent, {
      ...child,
      fullName: "Perenang Satu",
      dateOfBirth: "2012-05-15",
      asChild: true,
    }),
  ).rejects.toThrow(/mirip/);
});

test("admin roster create of a matching name warns until confirmed", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const dup = {
    fullName: "Perenang Satu",
    dateOfBirth: "2012-05-15",
    gender: "putri" as const,
    status: "aktif" as const,
  };
  await expect(saveSwimmer(h.actor(AZKIYA_ID), dup)).rejects.toThrow(/Simpan lagi/);
  const saved = await saveSwimmer(h.actor(AZKIYA_ID), { ...dup, confirmSimilar: true });
  expect(saved.id).toBeGreaterThan(0);
});

test("admin Daftarkan anak of a matching name warns rather than blocking", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const dup = {
    ...child,
    fullName: "Perenang Satu",
    dateOfBirth: "2012-05-15",
    asChild: true as const,
  };
  await expect(saveSwimmer(h.actor(AZKIYA_ID), dup)).rejects.toThrow(/Simpan lagi/);
  const saved = await saveSwimmer(h.actor(AZKIYA_ID), { ...dup, confirmSimilar: true });
  expect((await hatsFor(h.actor(AZKIYA_ID))).guardianSwimmerIds).toContain(saved.id);
});

test("parent cannot confirm-create a matching name and date of birth", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const parent = await admitParent(h, "ibu-baru@example.com", "usr_ibu_baru");
  await expect(
    saveSwimmer(parent, {
      ...child,
      fullName: "Perenang Satu",
      dateOfBirth: "2012-05-15",
      asChild: true,
      confirmSimilar: true,
    }),
  ).rejects.toThrow(/Hubungi admin/);
});

test("failed shape-1 accept does not admit family or consume the invite", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const extra = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId}, 'Anak Hapus', '2015-01-01', 'putra', 'Indonesia', 'aktif')
    returning id
  `;
  const invite = await createInvite(h.actor(SATRIYO_ID), {
    kind: "guardian",
    email: "ibu-gagal@example.com",
    swimmerIds: [extra[0]!.id],
  });
  await h.sql`delete from swimmers where id = ${extra[0]!.id}`;
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_ibu_gagal', 'Ibu Gagal', 'ibu-gagal@example.com', true, now(), now())
  `;
  await expect(
    acceptInvite(h.sql, { token: invite.token, userId: "usr_ibu_gagal", email: "ibu-gagal@example.com" }),
  ).rejects.toThrow();
  expect((await hatsFor(h.actor("usr_ibu_gagal"))).family).toBeFalsy();
  const pending = await h.sql<{ accepted_at: string | null }>`
    select accepted_at from invites where token = ${invite.token}
  `;
  expect(pending[0]?.accepted_at).toBeNull();
});

test("admitted parent can daftarkan a sibling without a second invite", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const parent = await admitParent(h, "ibu-baru@example.com", "usr_ibu_baru");
  await saveSwimmer(parent, { ...child, asChild: true });
  const sibling = await saveSwimmer(parent, {
    ...child,
    fullName: "Adik Baru",
    dateOfBirth: "2018-04-04",
    asChild: true,
  });
  const names = (await listSwimmers(parent)).map((s) => s.fullName).sort();
  expect(names).toEqual(["Adik Baru", "Aira Baru"]);
  expect((await hatsFor(parent)).guardianSwimmerIds).toContain(sibling.id);
});

test("parent-created child is not added to an already scheduled session", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const session = await savePracticeRecord(h.actor(SATRIYO_ID), {
    sessionDate: "2026-10-01",
    kind: "teknik",
    title: "Sesi sebelum daftar",
    sets: [{ block: "utama", reps: 4, distanceM: 50, stroke: "bebas" }],
  });
  const parent = await admitParent(h, "ibu-baru@example.com", "usr_ibu_baru");
  const saved = await saveSwimmer(parent, { ...child, asChild: true });
  const rows = await h.sql<{ n: number }>`
    select count(*)::int as n from practice_attendance
    where practice_id = ${session.id} and swimmer_id = ${saved.id}
  `;
  expect(rows[0]?.n).toBe(0);
});
