import { expect, test } from "vitest";
import { listPracticeSummaries } from "../src/lib/club/practice";
import { SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

async function emptyPracticeClub() {
  const harness = await createClubHarness();
  await seedClub(harness.sql);
  const clubs = await harness.sql<{ club_id: number }>`
    select club_id from club_staff where user_id = ${SATRIYO_ID} limit 1
  `;
  const clubId = clubs[0]!.club_id;
  await harness.sql`delete from practices where club_id = ${clubId}`;
  return { harness, clubId };
}

test("practice overview is read-only, bounded to seven days, and ordered forward", async () => {
  const { harness, clubId } = await emptyPracticeClub();
  await harness.sql`
    insert into practices (club_id, session_date, start_time, kind, title)
    values
      (${clubId}, '2026-09-13', '15:30', 'teknik', 'Kemarin'),
      (${clubId}, '2026-09-14', '15:30', 'teknik', 'Hari ini sore'),
      (${clubId}, '2026-09-14', '05:00', 'teknik', 'Hari ini pagi'),
      (${clubId}, '2026-09-21', '05:00', 'teknik', 'Batas tujuh hari'),
      (${clubId}, '2026-09-22', '05:00', 'teknik', 'Terlalu jauh')
  `;
  const before = await harness.sql<{
    count: number;
  }>`select count(*)::int as count from practices where club_id = ${clubId}`;

  const rows = await listPracticeSummaries(harness.actor(SATRIYO_ID), {
    view: "overview",
    today: "2026-09-14",
  });

  expect(rows.map((row) => row.title)).toEqual([
    "Hari ini pagi",
    "Hari ini sore",
    "Batas tujuh hari",
  ]);
  const after = await harness.sql<{
    count: number;
  }>`select count(*)::int as count from practices where club_id = ${clubId}`;
  expect(after[0]!.count).toBe(before[0]!.count);
});

test("practice history is paginated with the newest session first", async () => {
  const { harness, clubId } = await emptyPracticeClub();
  for (let day = 1; day <= 22; day += 1) {
    await harness.sql`
      insert into practices (club_id, session_date, start_time, kind, title)
      values (${clubId}, ${`2026-08-${String(day).padStart(2, "0")}`}, '15:30', 'teknik', ${`Riwayat ${day}`})
    `;
  }

  const first = await listPracticeSummaries(harness.actor(SATRIYO_ID), {
    view: "history",
    page: 1,
    today: "2026-09-14",
  });
  const second = await listPracticeSummaries(harness.actor(SATRIYO_ID), {
    view: "history",
    page: 2,
    today: "2026-09-14",
  });

  expect(first).toHaveLength(20);
  expect(first[0]!.title).toBe("Riwayat 22");
  expect(second.map((row) => row.title)).toEqual(["Riwayat 2", "Riwayat 1"]);
});
