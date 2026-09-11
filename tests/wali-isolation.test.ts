import { expect, test } from "vitest";
import { listSwimmers } from "../src/lib/club/swimmers";
import { AZKIYA_ID, RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("guardian does not see an unlinked swimmer", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId}, 'Anak Lain', '2015-01-01', 'putra', 'Indonesia', 'aktif')
  `;
  const ratih = await listSwimmers(h.actor(RATIH_ID));
  expect(ratih.map((s) => s.fullName)).not.toContain("Anak Lain");
  expect(ratih.map((s) => s.fullName).sort()).toEqual([
    "Ken Athaya Nirwasita",
    "Kun Bumi Pamungkas",
    "Luigi Banyu Pamungkas",
  ]);
});

test("superadmin sees the whole skuad including unlinked children", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId}, 'Anak Lain', '2015-01-01', 'putra', 'Indonesia', 'aktif')
  `;
  const names = (await listSwimmers(h.actor(SATRIYO_ID))).map((s) => s.fullName);
  expect(names).toContain("Anak Lain");
  expect(names).toContain("Luigi Banyu Pamungkas");
});

test("club admin sees the whole skuad", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const names = (await listSwimmers(h.actor(AZKIYA_ID))).map((s) => s.fullName);
  expect(names).toContain("Ken Athaya Nirwasita");
});
