import { expect, test } from "vitest";
import { listSwimmers } from "../src/lib/club/swimmers";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("two seeded adults see the same three swimmers", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const satriyo = await listSwimmers(h.actor(SATRIYO_ID));
  const ratih = await listSwimmers(h.actor(RATIH_ID));
  const names = (rows: { fullName: string }[]) => rows.map((s) => s.fullName).sort();
  expect(names(satriyo)).toEqual([
    "Perenang Dua",
    "Perenang Satu",
    "Perenang Tiga",
  ]);
  expect(names(ratih)).toEqual(names(satriyo));
});

test("a fresh login does not get a private copy of the swimmers", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const rows = await listSwimmers(h.actor("stranger"));
  expect(rows).toEqual([]);
});
