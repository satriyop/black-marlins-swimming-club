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
  expect(first).toEqual({ seriesCreated: 10, practicesCreated: 0 });

  const schedules = await h.sql<{
    seed_key: string;
    active: boolean;
    map_url: string;
  }>`select seed_key, active, map_url from practice_series where club_id = ${clubId} order by seed_key`;
  expect(schedules).toHaveLength(10);
  expect(schedules.filter((row) => row.active)).toHaveLength(7);
  expect(schedules.every((row) => row.map_url.includes("https://maps.app.goo.gl/"))).toBe(true);
  expect(schedules.find((row) => row.seed_key === "saturday-morning-brondong-0500")?.active).toBe(
    false,
  );
  expect(schedules.find((row) => row.seed_key === "saturday-morning-depo-0500")?.active).toBe(
    false,
  );
  expect(schedules.find((row) => row.seed_key === "saturday-afternoon-depo-1530")?.active).toBe(
    false,
  );

  await h.sql`
    update practice_series set active = false
    where club_id = ${clubId} and seed_key = 'weekday-monday-tirtomulyono-1530'
  `;
  const again = await ensureDefaultTrainingSchedules(query, clubId);
  expect(again).toEqual({ seriesCreated: 0, practicesCreated: 0 });

  const monday = await h.sql<{ active: boolean }>`
    select active from practice_series
    where club_id = ${clubId} and seed_key = 'weekday-monday-tirtomulyono-1530'
  `;
  expect(monday[0]?.active).toBe(false);
});
