import { expect, test } from "vitest";
import { hatsFor } from "../src/lib/club/hats";
import {
  cancelPractice,
  loadPractice,
  removePracticeParticipant,
  savePracticeRecord,
} from "../src/lib/club/practice";
import {
  createPracticeSeries,
  createPracticeSeriesBatch,
  datesInRange,
  isoWeekday,
  listPracticeIcs,
  listPracticeSeries,
  materializePracticeSeries,
  refreshActivePracticeSeries,
  setSeriesActive,
  skipSeriesRange,
} from "../src/lib/club/series";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { jakartaNowParts } from "../src/lib/utils";
import type { WeekdayId } from "../src/lib/swim/constants";
import { createClubHarness } from "./harness";

const sets = [{ block: "utama", reps: 4, distanceM: 50, stroke: "bebas" }];

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("skip range walks every matching weekday, not a 16-week cap", () => {
  const dates = datesInRange(2, "2026-10-06", "2027-02-02");
  expect(dates.length).toBeGreaterThan(16);
  expect(dates.at(-1)).toBe("2027-02-02");
  expect(() => datesInRange(2, "2026-10-20", "2026-10-06")).toThrow(/Rentang/);
});

test("weekday follows the start date", () => {
  expect(isoWeekday("2026-10-08")).toBe(4);
});

test("creating a weekly template materializes the next N sessions", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler Selasa",
    weekday: 2,
    startTime: "15:30",
    location: "Tirta",
    kind: "teknik",
    weeks: 4,
    fromDate: "2026-10-06",
    sets,
  });
  expect(series.practiceIds).toHaveLength(4);
  const dates = await h.sql<{ session_date: string; series_id: number }>`
    select session_date::text as session_date, series_id from practices
    where series_id = ${series.id} order by session_date
  `;
  expect(dates.map((d) => d.session_date.slice(0, 10))).toEqual([
    "2026-10-06",
    "2026-10-13",
    "2026-10-20",
    "2026-10-27",
  ]);
  const again = await materializePracticeSeries(h.actor(SATRIYO_ID), {
    id: series.id,
    fromDate: "2026-10-06",
  });
  expect(again.practiceIds).toHaveLength(4);
});

test("cancelling one date does not remove the rest of the series", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler",
    weekday: 2,
    startTime: "15:30",
    kind: "teknik",
    weeks: 3,
    fromDate: "2026-10-06",
    sets,
  });
  const first = series.practiceIds[0]!;
  await cancelPractice(h.actor(SATRIYO_ID), {
    id: first,
    reason: "Libur sekolah",
    expectedRevision: 1,
    scope: "this",
  });
  const rows = await h.sql<{ id: number; status: string }>`
    select id, status from practices where series_id = ${series.id} order by session_date
  `;
  expect(rows).toHaveLength(3);
  expect(rows[0]?.status).toBe("cancelled");
  expect(rows[1]?.status).toBe("scheduled");
  expect(rows[2]?.status).toBe("scheduled");
});

test("cancelling this and future leaves earlier occurrences", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler",
    weekday: 2,
    startTime: "15:30",
    kind: "teknik",
    weeks: 4,
    fromDate: "2026-10-06",
    sets,
  });
  const second = series.practiceIds[1]!;
  await cancelPractice(h.actor(SATRIYO_ID), {
    id: second,
    reason: "Kolam tutup",
    expectedRevision: 1,
    scope: "future",
  });
  const rows = await h.sql<{ status: string }>`
    select status from practices where series_id = ${series.id} order by session_date
  `;
  expect(rows.map((r) => r.status)).toEqual(["scheduled", "cancelled", "cancelled", "cancelled"]);
  await expect(
    materializePracticeSeries(h.actor(SATRIYO_ID), {
      id: series.id,
      fromDate: "2026-10-06",
    }),
  ).rejects.toThrow(/tidak ditemukan/);
  const after = await h.sql<{ n: number }>`
    select count(*)::int as n from practices where series_id = ${series.id} and status = 'scheduled'
  `;
  expect(after[0]?.n).toBe(1);
  const ended = await h.sql<{ active: boolean; until_date: string }>`
    select active, until_date::text as until_date from practice_series where id = ${series.id}
  `;
  expect(ended[0]).toMatchObject({ active: false, until_date: "2026-10-12" });
});

test("holiday skip prevents materializing those dates", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler",
    weekday: 2,
    startTime: "15:30",
    kind: "teknik",
    weeks: 4,
    fromDate: "2026-10-06",
    sets,
  });
  await skipSeriesRange(h.actor(SATRIYO_ID), {
    id: series.id,
    fromDate: "2026-10-13",
    toDate: "2026-10-20",
    reason: "Libur",
  });
  const rows = await h.sql<{ session_date: string; status: string }>`
    select session_date::text as session_date, status from practices
    where series_id = ${series.id} order by session_date
  `;
  expect(rows.map((r) => [r.session_date.slice(0, 10), r.status])).toEqual([
    ["2026-10-06", "scheduled"],
    ["2026-10-13", "cancelled"],
    ["2026-10-20", "cancelled"],
    ["2026-10-27", "scheduled"],
  ]);
});

test("ICS uses stable ids and marks cancellations", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler",
    weekday: 2,
    startTime: "15:30",
    location: "Tirta",
    kind: "teknik",
    weeks: 2,
    fromDate: "2026-10-06",
    sets,
  });
  await cancelPractice(h.actor(SATRIYO_ID), {
    id: series.practiceIds[0]!,
    reason: "Hujan",
    expectedRevision: 1,
  });
  const ics = await listPracticeIcs(h.actor(SATRIYO_ID));
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain(`UID:practice-${series.practiceIds[0]}@bmsc.klaten.org`);
  expect(ics).toContain("STATUS:CANCELLED");
  expect(ics).toContain("STATUS:CONFIRMED");
  expect(ics).toContain("LOCATION:Tirta");
  expect(ics).toContain("DTSTAMP:");
  expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
});

test("future venue change updates later open sessions and the template", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler",
    weekday: 2,
    startTime: "15:30",
    location: "Tirta",
    kind: "teknik",
    weeks: 3,
    fromDate: "2026-10-06",
    sets,
  });
  await savePracticeRecord(h.actor(SATRIYO_ID), {
    id: series.practiceIds[0]!,
    sessionDate: "2026-10-06",
    startTime: "16:00",
    location: "Renang Baru",
    kind: "teknik",
    title: "Reguler",
    sets,
    expectedRevision: 1,
    scope: "future",
  });
  const locs = await h.sql<{ location: string | null }>`
    select location from practices where series_id = ${series.id} order by session_date
  `;
  expect(locs.every((r) => r.location === "Renang Baru")).toBe(true);
  const tmpl = await h.sql<{ start_time: string | null; location: string | null }>`
    select start_time, location from practice_series where id = ${series.id}
  `;
  expect(tmpl[0]).toEqual({ start_time: "16:00", location: "Renang Baru" });
});

test("wali ICS only includes sessions their children are on", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler",
    weekday: 2,
    startTime: "15:30",
    kind: "teknik",
    weeks: 2,
    fromDate: "2026-10-06",
    sets,
  });
  const first = await loadPractice(h.actor(SATRIYO_ID), series.practiceIds[0]!);
  const ratihKids = (await hatsFor(h.actor(RATIH_ID))).guardianSwimmerIds;
  for (const row of first.attendance.filter((a) => ratihKids.includes(a.swimmerId))) {
    await removePracticeParticipant(h.actor(SATRIYO_ID), {
      practiceId: first.id,
      swimmerId: row.swimmerId,
    });
  }
  const family = await listPracticeIcs(h.actor(RATIH_ID));
  expect(family).not.toContain(`UID:practice-${first.id}@bmsc.klaten.org`);
  expect(family).toContain(`UID:practice-${series.practiceIds[1]}@bmsc.klaten.org`);
});

test("wali cannot create a series", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    createPracticeSeries(h.actor(RATIH_ID), {
      title: "X",
      weekday: 2,
      startTime: "15:30",
      kind: "teknik",
      weeks: 2,
      fromDate: "2026-10-06",
      sets,
    }),
  ).rejects.toThrow(/Tidak diizinkan/);
});

test("creating a series inactive skips materialization until it is turned on", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Sabtu Pagi Opsional",
    weekday: 6,
    startTime: "05:00",
    location: "Umbul Brondong",
    kind: "teknik",
    weeks: 4,
    fromDate: "2026-10-06",
    active: false,
    sets,
  });
  expect(series.practiceIds).toHaveLength(0);
  const beforeCount = await h.sql<{ n: number }>`
    select count(*)::int as n from practices where series_id = ${series.id}
  `;
  expect(beforeCount[0]?.n).toBe(0);

  await setSeriesActive(h.actor(SATRIYO_ID), { id: series.id, active: true });
  const afterCount = await h.sql<{ n: number }>`
    select count(*)::int as n from practices where series_id = ${series.id}
  `;
  expect(afterCount[0]?.n).toBeGreaterThan(0);
});

test("turning on a future inactive series respects its original start date", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const future = addDays(jakartaNowParts().date, 28);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Program Bulan Depan",
    weekday: isoWeekday(future),
    startTime: "15:30",
    kind: "teknik",
    weeks: 4,
    fromDate: future,
    active: false,
    sets,
  });

  await setSeriesActive(h.actor(SATRIYO_ID), { id: series.id, active: true });

  const dates = await h.sql<{ session_date: string }>`
    select session_date::text as session_date from practices
    where series_id = ${series.id} order by session_date
  `;
  expect(dates[0]?.session_date.slice(0, 10)).toBe(future);
});

test("active series rolls its materialization window forward without expiring", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const today = jakartaNowParts().date;
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Program Berjalan Terus",
    weekday: isoWeekday(today),
    startTime: "15:30",
    kind: "teknik",
    weeks: 2,
    fromDate: "2025-01-01",
    sets,
  });
  expect(series.practiceIds).toHaveLength(2);

  await refreshActivePracticeSeries(h.actor(SATRIYO_ID));

  const dates = await h.sql<{ session_date: string }>`
    select session_date::text as session_date from practices
    where series_id = ${series.id} order by session_date
  `;
  expect(dates.some((row) => row.session_date.slice(0, 10) >= today)).toBe(true);
});

test("multi-day creation validates the whole selection before writing", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    createPracticeSeriesBatch(h.actor(SATRIYO_ID), {
      title: "Pilihan Tidak Valid",
      weekdays: [2, 8 as WeekdayId],
      startTime: "15:30",
      kind: "teknik",
      weeks: 2,
      fromDate: "2026-10-06",
      sets,
    }),
  ).rejects.toThrow(/Hari tidak valid/);
  const rows = await h.sql<{ n: number }>`
    select count(*)::int as n from practice_series where title = 'Pilihan Tidak Valid'
  `;
  expect(rows[0]?.n).toBe(0);
});

test("a series ended with this-and-future cannot masquerade as paused", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const today = jakartaNowParts().date;
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Program Diakhiri",
    weekday: isoWeekday(today),
    startTime: "15:30",
    kind: "teknik",
    weeks: 2,
    fromDate: today,
    sets,
  });
  const first = await loadPractice(h.actor(SATRIYO_ID), series.practiceIds[0]!);
  await cancelPractice(h.actor(SATRIYO_ID), {
    id: first.id,
    reason: "Program selesai",
    expectedRevision: first.revision,
    scope: "future",
  });

  const listed = await listPracticeSeries(h.actor(SATRIYO_ID));
  expect(listed.find((row) => row.id === series.id)).toMatchObject({ active: false });
  await expect(
    setSeriesActive(h.actor(SATRIYO_ID), { id: series.id, active: true }),
  ).rejects.toThrow(/sudah berakhir/);
});

test("deactivating a series stops future generation without cancelling sessions already scheduled", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler Selasa",
    weekday: 2,
    startTime: "15:30",
    kind: "teknik",
    weeks: 4,
    fromDate: "2026-10-06",
    sets,
  });
  expect(series.practiceIds).toHaveLength(4);

  await setSeriesActive(h.actor(SATRIYO_ID), { id: series.id, active: false });

  const rows = await h.sql<{ status: string }>`
    select status from practices where series_id = ${series.id} order by session_date
  `;
  expect(rows.every((r) => r.status !== "cancelled")).toBe(true);

  const listed = await listPracticeSeries(h.actor(SATRIYO_ID));
  const found = listed.find((s) => s.id === series.id);
  expect(found?.active).toBe(false);

  await expect(
    materializePracticeSeries(h.actor(SATRIYO_ID), { id: series.id, fromDate: "2026-10-06" }),
  ).rejects.toThrow(/tidak ditemukan/);
});

test("wali cannot toggle a series on or off", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const series = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Reguler",
    weekday: 2,
    startTime: "15:30",
    kind: "teknik",
    weeks: 2,
    fromDate: "2026-10-06",
    sets,
  });
  await expect(
    setSeriesActive(h.actor(RATIH_ID), { id: series.id, active: false }),
  ).rejects.toThrow(/Tidak diizinkan/);
});
