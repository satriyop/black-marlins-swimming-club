import { expect, test } from "vitest";
import { hatsFor } from "../src/lib/club/hats";
import { saveResult } from "../src/lib/club/results";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("swimmer can write own official result but not a sibling", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name === "Perenang Tiga")!;
  const kun = kids.find((s) => s.full_name === "Perenang Dua")!;
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_perenang_tiga', 'Perenang Tiga', 'perenang.tiga@example.com', true, now(), now())
  `;
  await h.sql`update swimmers set user_id = 'usr_perenang_tiga' where id = ${luigi.id}`;
  const own = await saveResult(h.actor("usr_perenang_tiga"), {
    swimmerId: luigi.id,
    resultDate: "2026-09-01",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 42000,
    status: "selesai",
    kind: "official",
  });
  expect(own.id).toBeGreaterThan(0);
  await expect(
    saveResult(h.actor(RATIH_ID), {
      swimmerId: luigi.id,
      resultDate: "2026-09-01",
      stroke: "bebas",
      distanceM: 50,
      course: "50",
      timeMs: 41000,
      status: "selesai",
      kind: "official",
    }),
  ).rejects.toThrow(/Tidak diizinkan/);
  try {
    await saveResult(h.actor("usr_perenang_tiga"), {
      swimmerId: kun.id,
      resultDate: "2026-09-01",
      stroke: "bebas",
      distanceM: 50,
      course: "50",
      timeMs: 43000,
      status: "selesai",
      kind: "official",
    });
    throw new Error("expected sibling write to fail");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    expect(message).toBe("Perenang tidak ditemukan");
    expect(message).not.toContain("Kun");
    expect(message).not.toContain(kun.fullName);
  }
});

test("wali can edit tes but not official; staff can edit official", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const hats = await hatsFor(h.actor(RATIH_ID));
  const kid = hats.guardianSwimmerIds[0]!;
  const tes = await saveResult(h.actor(RATIH_ID), {
    swimmerId: kid,
    resultDate: "2026-09-01",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 40000,
    status: "selesai",
    kind: "test",
  });
  const tesEdited = await saveResult(h.actor(RATIH_ID), {
    id: tes.id,
    swimmerId: kid,
    resultDate: "2026-09-01",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 39000,
    status: "selesai",
    kind: "test",
  });
  expect(tesEdited.id).toBe(tes.id);
  const row = await h.sql<{ time_ms: number }>`select time_ms from results where id = ${tes.id}`;
  expect(row[0]!.time_ms).toBe(39000);

  const official = await saveResult(h.actor(SATRIYO_ID), {
    swimmerId: kid,
    resultDate: "2026-09-02",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 38000,
    status: "selesai",
    kind: "official",
  });
  await expect(
    saveResult(h.actor(RATIH_ID), {
      id: official.id,
      swimmerId: kid,
      resultDate: "2026-09-02",
      stroke: "bebas",
      distanceM: 50,
      course: "50",
      timeMs: 37000,
      status: "selesai",
      kind: "official",
    }),
  ).rejects.toThrow(/Tidak diizinkan/);
  const staffEdit = await saveResult(h.actor(SATRIYO_ID), {
    id: official.id,
    swimmerId: kid,
    resultDate: "2026-09-02",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 37000,
    status: "selesai",
    kind: "official",
  });
  expect(staffEdit.isPb).toBe(true);
  const officialRow = await h.sql<{
    time_ms: number;
  }>`select time_ms from results where id = ${official.id}`;
  expect(officialRow[0]!.time_ms).toBe(37000);
  const flags = await h.sql<{ id: number; is_pb: boolean }>`
    select id, is_pb from results where swimmer_id = ${kid} and stroke = 'bebas' and distance_m = 50 and course = '50' order by id
  `;
  expect(flags.find((r) => r.id === tes.id)?.is_pb).toBe(false);
  expect(flags.find((r) => r.id === official.id)?.is_pb).toBe(true);
});

test("a faster insert clears the previous is_pb flag and keeps notes on edit", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kid = (await h.sql<{ id: number }>`select id from swimmers limit 1`)[0]!.id;
  const slow = await saveResult(h.actor(SATRIYO_ID), {
    swimmerId: kid,
    resultDate: "2026-09-01",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 40000,
    status: "selesai",
    kind: "official",
    notes: "kiko import",
  });
  const fast = await saveResult(h.actor(SATRIYO_ID), {
    swimmerId: kid,
    resultDate: "2026-09-02",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 38000,
    status: "selesai",
    kind: "official",
  });
  const flags = await h.sql<{ id: number; is_pb: boolean }>`
    select id, is_pb from results where id in (${slow.id}, ${fast.id}) order by id
  `;
  expect(flags.find((r) => r.id === slow.id)?.is_pb).toBe(false);
  expect(flags.find((r) => r.id === fast.id)?.is_pb).toBe(true);
  await saveResult(h.actor(SATRIYO_ID), {
    id: slow.id,
    swimmerId: kid,
    resultDate: "2026-09-01",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 39500,
    status: "selesai",
    kind: "official",
  });
  const kept = await h.sql<{
    notes: string | null;
  }>`select notes from results where id = ${slow.id}`;
  expect(kept[0]!.notes).toBe("kiko import");
});
