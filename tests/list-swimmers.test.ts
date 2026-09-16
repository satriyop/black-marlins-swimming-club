import { expect, test } from "vitest";
import { listSwimmers } from "../src/lib/club/swimmers";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("seeded superadmin can list the club roster", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const rows = await listSwimmers(h.actor(SATRIYO_ID));
  expect(rows.map((s) => s.fullName).sort()).toEqual([
    "Perenang Dua",
    "Perenang Satu",
    "Perenang Tiga",
  ]);
});

test("local demo scale creates a large mixed roster without expanding the sample family", async () => {
  const previous = process.env.VITE_DEMO_SWIMMER_COUNT;
  process.env.VITE_DEMO_SWIMMER_COUNT = "60";
  try {
    const h = await createClubHarness();
    await seedClub(h.sql);

    const staffRows = await listSwimmers(h.actor(SATRIYO_ID));
    expect(staffRows).toHaveLength(60);
    expect(staffRows.filter((swimmer) => swimmer.status === "aktif").length).toBeGreaterThan(50);
    expect(staffRows.some((swimmer) => swimmer.status === "cuti")).toBe(true);
    expect(staffRows.some((swimmer) => swimmer.status === "alumni")).toBe(true);

    const familyRows = await listSwimmers(h.actor(RATIH_ID));
    expect(familyRows.map((swimmer) => swimmer.fullName).sort()).toEqual([
      "Perenang Dua",
      "Perenang Satu",
      "Perenang Tiga",
    ]);
  } finally {
    if (previous === undefined) delete process.env.VITE_DEMO_SWIMMER_COUNT;
    else process.env.VITE_DEMO_SWIMMER_COUNT = previous;
  }
});
