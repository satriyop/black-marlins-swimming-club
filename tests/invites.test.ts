import { expect, test } from "vitest";
import { acceptInvite, createInvite, listInvites } from "../src/lib/club/invites";
import { hatsFor } from "../src/lib/club/hats";
import { AZKIYA_ID, RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("club admin can invite a coach and cannot invite superadmin", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const coach = await createInvite(h.actor(AZKIYA_ID), {
    kind: "staff",
    email: "hardiyanto@example.com",
    role: "coach",
  });
  expect(coach.token).toBeTruthy();
  await expect(
    createInvite(h.actor(AZKIYA_ID), {
      kind: "staff",
      email: "other@example.com",
      role: "superadmin",
    }),
  ).rejects.toThrow(/Tidak diizinkan/);
});

test("guardian cannot mint a coach", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    createInvite(h.actor(RATIH_ID), {
      kind: "staff",
      email: "coach@example.com",
      role: "coach",
    }),
  ).rejects.toThrow(/Tidak diizinkan/);
});

test("accepting a coach invite grants the hat", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const invite = await createInvite(h.actor(SATRIYO_ID), {
    kind: "staff",
    email: "hardiyanto@example.com",
    role: "coach",
  });
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_coach', 'Hardiyanto', 'hardiyanto@example.com', true, now(), now())
  `;
  await acceptInvite(h.sql, { token: invite.token, userId: "usr_coach", email: "hardiyanto@example.com" });
  const hats = await hatsFor(h.actor("usr_coach"));
  expect(hats.staff).toBe("coach");
});

test("wali can invite another wali only on linked perenang", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  const extra = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId}, 'Anak Lain', '2015-01-01', 'putra', 'Indonesia', 'aktif')
    returning id
  `;
  const ok = await createInvite(h.actor(RATIH_ID), {
    kind: "guardian",
    email: "ibu-dua@example.com",
    swimmerIds: [luigi.id],
  });
  expect(ok.token).toBeTruthy();
  await expect(
    createInvite(h.actor(RATIH_ID), {
      kind: "guardian",
      email: "asing@example.com",
      swimmerIds: [extra[0]!.id],
    }),
  ).rejects.toThrow(/Tidak diizinkan/);
});

test("rejects a second pending guardian invite for the same email and perenang", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  const first = await createInvite(h.actor(SATRIYO_ID), {
    kind: "guardian",
    email: "ibu-baru@example.com",
    swimmerIds: [luigi.id],
  });
  expect(first.acceptPath).toContain("/terima?token=");
  await expect(
    createInvite(h.actor(SATRIYO_ID), {
      kind: "guardian",
      email: "ibu-baru@example.com",
      swimmerIds: [luigi.id],
    }),
  ).rejects.toThrow(/sudah ada/);
});

test("rejects guardian invite when that email is already wali of the perenang", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  await expect(
    createInvite(h.actor(SATRIYO_ID), {
      kind: "guardian",
      email: "ratihsasminta@gmail.com",
      swimmerIds: [luigi.id],
    }),
  ).rejects.toThrow(/sudah wali/);
});

test("guardian invite requires a perenang", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    createInvite(h.actor(SATRIYO_ID), {
      kind: "guardian",
      email: "baru@example.com",
      swimmerIds: [],
    }),
  ).rejects.toThrow(/Pilih perenang/);
});

test("listInvites includes a copyable accept path", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number }>`select id from swimmers limit 1`;
  await createInvite(h.actor(SATRIYO_ID), {
    kind: "guardian",
    email: "copy@example.com",
    swimmerIds: [kids[0]!.id],
  });
  const rows = await listInvites(h.actor(SATRIYO_ID));
  const row = rows.find((r) => r.email === "copy@example.com");
  expect(row?.acceptPath).toMatch(/^\/terima\?token=/);
  expect(row?.token).toBeTruthy();
});

test("expired invite is rejected", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const invite = await createInvite(h.actor(SATRIYO_ID), {
    kind: "staff",
    email: "late@example.com",
    role: "coach",
  });
  await h.sql`update invites set expires_at = now() - interval '1 day' where token = ${invite.token}`;
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_late', 'Late', 'late@example.com', true, now(), now())
  `;
  await expect(
    acceptInvite(h.sql, { token: invite.token, userId: "usr_late", email: "late@example.com" }),
  ).rejects.toThrow(/Undangan tidak berlaku/);
});
