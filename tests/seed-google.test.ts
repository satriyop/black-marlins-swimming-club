import { expect, test } from "vitest";
import { hatsFor } from "../src/lib/club/hats";
import { SATRIYO_EMAIL, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("seed attaches hats to a pre-existing Google user with a seed email", async () => {
  const h = await createClubHarness();
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('google-satriyo-oid', 'Satriyo Pamungkas', ${SATRIYO_EMAIL}, true, now(), now())
  `;
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor("google-satriyo-oid"));
  expect(hats.staff).toBe("superadmin");
  expect(hats.guardianSwimmerIds.length).toBe(3);
  const leftover = await h.sql<{ id: string }>`select id from "user" where id = 'usr_satriyo'`;
  expect(leftover).toEqual([]);
});
