import { expect, test } from "vitest";
import { hatsFor } from "../src/lib/club/hats";
import {
  canInviteStaff,
  canRevokeStaff,
  canEditResult,
  canWriteOfficialResult,
  canWritePractice,
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
