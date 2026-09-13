import { expect, test } from "vitest";
import { accessFor } from "../src/lib/club/access";
import { hatsFor } from "../src/lib/club/hats";
import {
  defaultTaskView,
  homePracticeCta,
  isDualRole,
  navItemsFor,
  roleLabels,
} from "../src/lib/club/nav";
import { dismissOnboarding, saveTaskView } from "../src/lib/club/prefs";
import { AZKIYA_ID, RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { acceptPendingInvitesForEmail, createInvite } from "../src/lib/club/invites";
import { createClubHarness } from "./harness";

test("family nav labels Perenang as Anak saya; club nav uses Skuad", () => {
  const dual = {
    staff: "superadmin" as const,
    family: true,
    guardianSwimmerIds: [1, 2, 3],
    selfSwimmerId: null,
  };
  expect(navItemsFor(dual, "family").find((i) => i.to === "/perenang")?.label).toBe("Anak saya");
  expect(navItemsFor(dual, "club").find((i) => i.to === "/perenang")?.label).toBe("Skuad");
  expect(isDualRole(dual)).toBe(true);
  expect(roleLabels(dual)).toEqual(["Superadmin", "Wali"]);
});

test("dual-role family view CTA is izin, not staff", () => {
  const dual = {
    staff: "superadmin" as const,
    family: true,
    guardianSwimmerIds: [1],
    selfSwimmerId: null,
  };
  expect(homePracticeCta(dual, "club")).toBe("staff");
  expect(homePracticeCta(dual, "family")).toBe("izin");
  expect(defaultTaskView(dual, null)).toBe("family");
});

test("coach-only default is club and has no family empty-state view", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_coach_home', 'Coach', 'coach-home@example.com', true, now(), now())
  `;
  await h.sql`insert into club_staff (club_id, user_id, role) values (${clubId}, 'usr_coach_home', 'coach')`;
  const hats = await hatsFor(h.actor("usr_coach_home"));
  expect(defaultTaskView(hats, null)).toBe("club");
  expect(isDualRole(hats)).toBe(false);
  expect(roleLabels(hats)).toEqual(["Pelatih"]);
  expect(homePracticeCta(hats, "club")).toBe("staff");
});

test("wali-only default is family", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(RATIH_ID));
  expect(defaultTaskView(hats, null)).toBe("family");
  expect(navItemsFor(hats, "family").find((i) => i.to === "/perenang")?.label).toBe("Anak saya");
});

test("ordinary login that accepts a guardian invite reports new grants once", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number }>`select id from swimmers order by id`;
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_baru_home', 'Ibu Baru', 'ibu-home@example.com', true, now(), now())
  `;
  await createInvite(h.actor(SATRIYO_ID), {
    kind: "guardian",
    email: "ibu-home@example.com",
    swimmerIds: [kids[0]!.id],
  });
  await acceptPendingInvitesForEmail(h.sql, "usr_baru_home");
  const first = await accessFor(h.actor("usr_baru_home"));
  expect(first.invited).toBe(true);
  expect(first.newGrants.some((g) => g.kind === "guardian")).toBe(true);
  expect(first.welcomeDismissed).toBe(false);
  await dismissOnboarding(h.actor("usr_baru_home"));
  const second = await accessFor(h.actor("usr_baru_home"));
  expect(second.newGrants).toEqual([]);
  expect(second.welcomeDismissed).toBe(true);
});

test("dual-role preference persists and does not change hats", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await saveTaskView(h.actor(SATRIYO_ID), "club");
  const access = await accessFor(h.actor(SATRIYO_ID));
  expect(access.taskView).toBe("club");
  expect(access.hats.staff).toBe("superadmin");
  expect(access.hats.guardianSwimmerIds.length).toBeGreaterThan(0);
  await saveTaskView(h.actor(SATRIYO_ID), "family");
  expect((await accessFor(h.actor(SATRIYO_ID))).taskView).toBe("family");
});

test("staff plus self-swimmer is not a family dual-role switch", () => {
  expect(
    isDualRole({
      staff: "coach",
      family: false,
      guardianSwimmerIds: [],
      selfSwimmerId: 9,
    }),
  ).toBe(false);
});

test("club admin is club view without pretending they are wali", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(AZKIYA_ID));
  expect(defaultTaskView(hats, null)).toBe("club");
  expect(isDualRole(hats)).toBe(false);
});
