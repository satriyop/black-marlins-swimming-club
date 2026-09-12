import { expect, test } from "vitest";
import { hatsFor } from "../src/lib/club/hats";
import {
  canInviteStaff,
  canRevokeStaff,
  canEditResult,
  canWriteOfficialResult,
  canWritePractice,
  canCreateClubSwimmer,
  canEnrollOwnChild,
  canWriteRoster,
  canWriteTestTime,
} from "../src/lib/club/permissions";
import { AZKIYA_ID, RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("club admin cannot grant superadmin", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(AZKIYA_ID));
  expect(canInviteStaff(hats, "coach")).toBe(true);
  expect(canInviteStaff(hats, "club_admin")).toBe(true);
  expect(canInviteStaff(hats, "superadmin")).toBe(false);
});

test("guardian cannot invite staff", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(RATIH_ID));
  expect(canInviteStaff(hats, "coach")).toBe(false);
  expect(canWriteRoster(hats)).toBe(false);
  expect(canWritePractice(hats)).toBe(false);
  expect(canCreateClubSwimmer(hats)).toBe(false);
  expect(canEnrollOwnChild(hats)).toBe(true);
});

test("coach cannot enroll a child; admin can", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_coach_perm', 'Coach', 'coach-perm@example.com', true, now(), now())
  `;
  await h.sql`insert into club_staff (club_id, user_id, role) values (${clubId}, 'usr_coach_perm', 'coach')`;
  const coach = await hatsFor(h.actor("usr_coach_perm"));
  expect(canCreateClubSwimmer(coach)).toBe(false);
  expect(canEnrollOwnChild(coach)).toBe(false);
  const admin = await hatsFor(h.actor(AZKIYA_ID));
  expect(canCreateClubSwimmer(admin)).toBe(true);
  expect(canEnrollOwnChild(admin)).toBe(true);
});

test("last superadmin cannot be revoked", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(SATRIYO_ID));
  expect(canRevokeStaff(hats, "superadmin", 1)).toBe(false);
  expect(canRevokeStaff(hats, "superadmin", 2)).toBe(true);
  expect(canWriteRoster(hats)).toBe(true);
  expect(canWritePractice(hats)).toBe(true);
});

test("guardian can write test times but not official results", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(RATIH_ID));
  const kid = hats.guardianSwimmerIds[0]!;
  expect(canWriteTestTime(hats, kid)).toBe(true);
  expect(canWriteOfficialResult(hats, kid)).toBe(false);
  expect(canEditResult(hats, { kind: "test", swimmerId: kid })).toBe(true);
  expect(canEditResult(hats, { kind: "official", swimmerId: kid })).toBe(false);
});
