import { expect, test } from "vitest";
import { ensureDefaultTrainingSchedules } from "../scripts/default-training-schedules.mjs";
import { seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("default schedules seed idempotently and preserve on/off choices", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const query = async (text: string, params: unknown[] = []) => ({
    rows: await h.sql.query<Record<string, unknown>>(text, params),
  });

  const first = await ensureDefaultTrainingSchedules(query, clubId);
  expect(first).toEqual({ seriesCreated: 4, practicesCreated: 0 });

  const schedules = await h.sql<{
    seed_key: string;
    active: boolean;
    map_url: string | null;
  }>`select seed_key, active, map_url from practice_series where club_id = ${clubId} order by seed_key`;
  expect(schedules).toHaveLength(4);
  expect(schedules.filter((row) => row.active)).toHaveLength(3);
  expect(schedules.every((row) => row.map_url == null)).toBe(true);
  expect(schedules.find((row) => row.seed_key === "saturday-morning-contoh-0500")?.active).toBe(
    false,
  );

  await h.sql`
    update practice_series set active = false
    where club_id = ${clubId} and seed_key = 'weekday-monday-contoh-1530'
  `;
  const again = await ensureDefaultTrainingSchedules(query, clubId);
  expect(again).toEqual({ seriesCreated: 0, practicesCreated: 0 });

  const monday = await h.sql<{ active: boolean }>`
    select active from practice_series
    where club_id = ${clubId} and seed_key = 'weekday-monday-contoh-1530'
  `;
  expect(monday[0]?.active).toBe(false);
});

test("ensureDefaultTrainingSchedules can seed an explicitly supplied schedule instead of the example", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const query = async (text: string, params: unknown[] = []) => ({
    rows: await h.sql.query<Record<string, unknown>>(text, params),
  });
  const custom = [
    {
      key: "custom-tuesday-1600",
      title: "Latihan Kustom",
      weekday: 2,
      startTime: "16:00",
      durationMin: 60,
      location: "Kolam Kustom",
      kind: "teknik",
      mapUrl: "https://maps.example.com/kustom",
      active: true,
    },
  ];
  const result = await ensureDefaultTrainingSchedules(query, clubId, custom);
  expect(result).toEqual({ seriesCreated: 1, practicesCreated: 0 });
  const rows = await h.sql<{ seed_key: string; map_url: string | null }>`
    select seed_key, map_url from practice_series where club_id = ${clubId}
  `;
  expect(rows).toEqual([
    expect.objectContaining({ seed_key: "custom-tuesday-1600", map_url: "https://maps.example.com/kustom" }),
  ]);
});
