import { expect, test } from "vitest";
import { saveResult } from "../src/lib/club/results";
import { RATIH_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("swimmer can write own official result but not a sibling", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  const kun = kids.find((s) => s.full_name.startsWith("Kun"))!;
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_luigi', 'Luigi', 'luigi@example.com', true, now(), now())
  `;
  await h.sql`update swimmers set user_id = 'usr_luigi' where id = ${luigi.id}`;
  const own = await saveResult(h.actor("usr_luigi"), {
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
    await saveResult(h.actor("usr_luigi"), {
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
