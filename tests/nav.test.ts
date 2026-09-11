import { expect, test } from "vitest";
import { hatsFor } from "../src/lib/club/hats";
import { navItemsFor } from "../src/lib/club/nav";
import { AZKIYA_ID, RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("superadmin plus wali nav includes Undangan (union of hats)", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(SATRIYO_ID));
  expect(hats.staff).toBe("superadmin");
  expect(hats.guardianSwimmerIds.length).toBeGreaterThan(0);
  expect(navItemsFor(hats).map((i) => i.to)).toContain("/undangan");
});

test("club admin nav includes Undangan", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(AZKIYA_ID));
  expect(navItemsFor(hats).map((i) => i.to)).toContain("/undangan");
});

test("wali nav includes Undangan", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(RATIH_ID));
  expect(hats.staff).toBeNull();
  expect(navItemsFor(hats).map((i) => i.to)).toContain("/undangan");
});

test("coach-only nav omits Undangan", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_coach_nav', 'Coach', 'coach-nav@example.com', true, now(), now())
  `;
  await h.sql`insert into club_staff (club_id, user_id, role) values (${clubId}, 'usr_coach_nav', 'coach')`;
  const hats = await hatsFor(h.actor("usr_coach_nav"));
  expect(hats.staff).toBe("coach");
  expect(navItemsFor(hats).map((i) => i.to)).not.toContain("/undangan");
});

test("swimmer-only nav omits Undangan", () => {
  const items = navItemsFor({ staff: null, guardianSwimmerIds: [], selfSwimmerId: 1 });
  expect(items.map((i) => i.to)).not.toContain("/undangan");
  expect(items.map((i) => i.to)).toContain("/");
});
