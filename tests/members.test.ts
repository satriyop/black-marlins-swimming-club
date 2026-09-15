import { expect, test } from "vitest";
import { hatsFor } from "../src/lib/club/hats";
import {
  acceptInvite,
  acceptPendingInvitesForEmail,
  createInvite,
  previewInvite,
  recreateInvite,
  revokeInvite,
} from "../src/lib/club/invites";
import {
  getPublicClubContact,
  linkGuardian,
  listMembers,
  listMyAccessHelp,
  saveClubSupport,
  submitAccessHelp,
  revokeStaffRole,
  setStaffRole,
  unlinkGuardian,
} from "../src/lib/club/members";
import { listSwimmers } from "../src/lib/club/swimmers";
import { AZKIYA_ID, RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("admin lists accepted access and can change then revoke a staff role without dropping wali", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const before = await listMembers(h.actor(SATRIYO_ID));
  expect(before.some((m) => m.userId === SATRIYO_ID && m.staffRole === "superadmin")).toBe(true);
  expect(before.some((m) => m.userId === RATIH_ID && m.swimmerIds.length === 3)).toBe(true);
  await setStaffRole(h.actor(SATRIYO_ID), { userId: RATIH_ID, role: "coach" });
  expect((await hatsFor(h.actor(RATIH_ID))).staff).toBe("coach");
  await revokeStaffRole(h.actor(SATRIYO_ID), { userId: RATIH_ID });
  const ratih = await hatsFor(h.actor(RATIH_ID));
  expect(ratih.staff).toBeNull();
  expect(ratih.guardianSwimmerIds.length).toBe(3);
});

test("last superadmin cannot demote or revoke themselves", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    setStaffRole(h.actor(SATRIYO_ID), { userId: SATRIYO_ID, role: "club_admin" }),
  ).rejects.toThrow(/superadmin terakhir/);
  await expect(revokeStaffRole(h.actor(SATRIYO_ID), { userId: SATRIYO_ID })).rejects.toThrow(
    /superadmin terakhir/,
  );
});

test("unlinking a guardian drops that child's access and keeps the athlete", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  await unlinkGuardian(h.actor(SATRIYO_ID), { userId: RATIH_ID, swimmerId: luigi.id });
  const ratih = await hatsFor(h.actor(RATIH_ID));
  expect(ratih.guardianSwimmerIds).not.toContain(luigi.id);
  expect(ratih.guardianSwimmerIds.length).toBe(2);
  const names = (await listSwimmers(h.actor(RATIH_ID))).map((s) => s.fullName);
  expect(names.some((n) => n.startsWith("Luigi"))).toBe(false);
  const still = await h.sql<{ n: number }>`select count(*)::int as n from swimmers where id = ${luigi.id}`;
  expect(still[0]?.n).toBe(1);
  expect((await hatsFor(h.actor(SATRIYO_ID))).guardianSwimmerIds).toContain(luigi.id);
});

test("guardian cannot inspect unrelated members or elevate roles", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const mine = await listMembers(h.actor(RATIH_ID));
  expect(mine.every((m) => m.userId === RATIH_ID)).toBe(true);
  await expect(setStaffRole(h.actor(RATIH_ID), { userId: AZKIYA_ID, role: "coach" })).rejects.toThrow(
    /Tidak diizinkan/,
  );
});

test("recreating an invite invalidates the old token", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const invite = await createInvite(h.actor(SATRIYO_ID), {
    kind: "staff",
    email: "baru-staf@example.com",
    confirmedEmail: "baru-staf@example.com",
    role: "coach",
  });
  const next = await recreateInvite(h.actor(SATRIYO_ID), { id: invite.id });
  expect(next.token).not.toBe(invite.token);
  expect(await previewInvite(h.sql, invite.token)).toMatchObject({ state: "revoked" });
  expect((await previewInvite(h.sql, next.token)).state).toBe("pending");
});

test("revoked pending invite is not auto-accepted on login", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const invite = await createInvite(h.actor(SATRIYO_ID), {
    kind: "staff",
    email: "revoked@example.com",
    confirmedEmail: "revoked@example.com",
    role: "coach",
  });
  await revokeInvite(h.actor(SATRIYO_ID), { id: invite.id });
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_revoked', 'Revoked', 'revoked@example.com', true, now(), now())
  `;
  await acceptPendingInvitesForEmail(h.sql, "usr_revoked");
  expect((await hatsFor(h.actor("usr_revoked"))).staff).toBeNull();
  await expect(
    acceptInvite(h.sql, { token: invite.token, userId: "usr_revoked", email: "revoked@example.com" }),
  ).rejects.toThrow(/tidak berlaku/);
});

test("coach cannot list the directory", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_coach_mem', 'Coach', 'coach-mem@example.com', true, now(), now())
  `;
  await h.sql`insert into club_staff (club_id, user_id, role) values (${clubId}, 'usr_coach_mem', 'coach')`;
  await expect(listMembers(h.actor("usr_coach_mem"))).rejects.toThrow(/Tidak diizinkan/);
});

test("club admin cannot demote a superadmin", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    setStaffRole(h.actor(AZKIYA_ID), { userId: SATRIYO_ID, role: "coach" }),
  ).rejects.toThrow(/Tidak diizinkan|superadmin/);
});

test("uninvited signed-in user can request access without seeing the skuad", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_stranger', 'Stranger', 'stranger@example.com', true, now(), now())
  `;
  await submitAccessHelp(h.actor("usr_stranger"), { kind: "access", message: "Tolong undang saya" });
  const mine = await listMyAccessHelp(h.actor("usr_stranger"));
  expect(mine[0]?.kind).toBe("access");
  expect(mine[0]?.resolved_at).toBeNull();
  await expect(
    submitAccessHelp(h.actor("usr_stranger"), { kind: "missing_child", message: "Anak" }),
  ).rejects.toThrow(/Tidak diizinkan/);
});

test("admin can set https support contact and it is public", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    saveClubSupport(h.actor(SATRIYO_ID), { url: "http://insecure.example" }),
  ).rejects.toThrow(/https/);
  await saveClubSupport(h.actor(SATRIYO_ID), {
    email: "admin@bmsc.test",
    phone: "+62 812 0000",
    url: "https://bmsc.klaten.org",
  });
  const pub = await getPublicClubContact(h.sql);
  expect(pub?.supportEmail).toBe("admin@bmsc.test");
  expect(pub?.supportUrl).toBe("https://bmsc.klaten.org");
});

test("admin can link an existing wali to an existing child", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const extra = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId}, 'Anak Extra', '2015-02-02', 'putri', 'Indonesia', 'aktif')
    returning id
  `;
  await linkGuardian(h.actor(SATRIYO_ID), { userId: RATIH_ID, swimmerId: extra[0]!.id });
  expect((await hatsFor(h.actor(RATIH_ID))).guardianSwimmerIds).toContain(extra[0]!.id);
});
