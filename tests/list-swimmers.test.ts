import { expect, test } from "vitest";
import { listSwimmers } from "../src/lib/club/swimmers";
import { SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("seeded superadmin can list the club roster", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const rows = await listSwimmers(h.actor(SATRIYO_ID));
  expect(rows.map((s) => s.fullName).sort()).toEqual([
    "Ken Athaya Nirwasita",
    "Kun Bumi Pamungkas",
    "Luigi Banyu Pamungkas",
  ]);
});
