import { expect, test } from "vitest";
import {
  cancelPractice,
  loadPractice,
} from "../src/lib/club/practice";
import {
  createPracticeSeries,
  createPracticeSeriesBatch,
  datesInRange,
  isoWeekday,
  listPracticeIcs,
  listPracticeSeries,
  listScheduledTrainingDays,
  openScheduledTrainingDay,
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

async function setup() {
  const harness = await createClubHarness();
  await seedClub(harness.sql);
  const club = await harness.sql<{ club_id: number }>`select club_id from club_staff where user_id = ${SATRIYO_ID} limit 1`;
  const clubId = club[0]!.club_id;
  await harness.sql`delete from practices where club_id = ${clubId}`;
  return { harness, clubId };
}

async function createTodaySchedule(harness: Awaited<ReturnType<typeof createClubHarness>>, active = true) {
  const today = jakartaNowParts().date;
  return createPracticeSeries(harness.actor(SATRIYO_ID), {
    title: "Latihan Hari Ini",
    weekday: isoWeekday(today),
    startTime: "15:30",
    durationMin: 90,
    location: "Tirtomulyono",
    kind: "teknik",
    fromDate: today,
    active,
    sets,
  });
}

test("date helpers follow ISO weekdays without an occurrence cap", () => {
  expect(isoWeekday("2026-10-08")).toBe(4);
  const dates = datesInRange(2, "2026-10-06", "2027-02-02");
  expect(dates.length).toBeGreaterThan(16);
  expect(dates.at(-1)).toBe("2027-02-02");
});

test("creating a schedule does not generate training or attendance rows", async () => {
  const { harness, clubId } = await setup();
  const schedule = await createTodaySchedule(harness);
  expect(schedule.practiceIds).toEqual([]);
  const practices = await harness.sql<{ count: number }>`select count(*)::int as count from practices where club_id = ${clubId}`;
  const attendance = await harness.sql<{ count: number }>`select count(*)::int as count from practice_attendance where club_id = ${clubId}`;
  expect(practices[0]!.count).toBe(0);
  expect(attendance[0]!.count).toBe(0);
});

test("scheduled days are derived for display without writing rows", async () => {
  const { harness, clubId } = await setup();
  const today = jakartaNowParts().date;
  const schedule = await createTodaySchedule(harness);
  const days = await listScheduledTrainingDays(harness.actor(SATRIYO_ID), { fromDate: today, days: 8 });
  expect(days).toEqual([
    expect.objectContaining({ scheduleId: schedule.id, date: today, practiceId: null }),
    expect.objectContaining({ scheduleId: schedule.id, date: addDays(today, 7), practiceId: null }),
  ]);
  const rows = await harness.sql<{ count: number }>`select count(*)::int as count from practices where club_id = ${clubId}`;
  expect(rows[0]!.count).toBe(0);
});

test("staff open today's scheduled training once and receive its attendance sheet", async () => {
  const { harness, clubId } = await setup();
  const today = jakartaNowParts().date;
  const schedule = await createTodaySchedule(harness);
  const first = await openScheduledTrainingDay(harness.actor(SATRIYO_ID), { scheduleId: schedule.id, date: today });
  const second = await openScheduledTrainingDay(harness.actor(SATRIYO_ID), { scheduleId: schedule.id, date: today });
  expect(second.id).toBe(first.id);
  const training = await loadPractice(harness.actor(SATRIYO_ID), first.id);
  expect(training.seriesId).toBe(schedule.id);
  expect(training.sessionDate).toBe(today);
  expect(training.sets).toHaveLength(1);
  const active = await harness.sql<{ count: number }>`select count(*)::int as count from swimmers where club_id = ${clubId} and status = 'aktif'`;
  expect(training.attendance).toHaveLength(active[0]!.count);
});

test("attendance cannot be opened before the scheduled training day", async () => {
  const { harness } = await setup();
  const today = jakartaNowParts().date;
  const future = addDays(today, 1);
  const schedule = await createPracticeSeries(harness.actor(SATRIYO_ID), {
    title: "Besok", weekday: isoWeekday(future), startTime: "15:30", location: "Tirta",
    kind: "teknik", fromDate: future, sets: [],
  });
  await expect(openScheduledTrainingDay(harness.actor(SATRIYO_ID), { scheduleId: schedule.id, date: future })).rejects.toThrow(/belum dapat dibuka/);
});

test("inactive and skipped schedules are not practice days", async () => {
  const { harness } = await setup();
  const today = jakartaNowParts().date;
  const schedule = await createTodaySchedule(harness, false);
  expect(await listScheduledTrainingDays(harness.actor(SATRIYO_ID), { fromDate: today, days: 1 })).toEqual([]);
  await setSeriesActive(harness.actor(SATRIYO_ID), { id: schedule.id, active: true });
  expect(await listScheduledTrainingDays(harness.actor(SATRIYO_ID), { fromDate: today, days: 1 })).toHaveLength(1);
  await skipSeriesRange(harness.actor(SATRIYO_ID), { id: schedule.id, fromDate: today, toDate: today, reason: "Libur" });
  expect(await listScheduledTrainingDays(harness.actor(SATRIYO_ID), { fromDate: today, days: 1 })).toEqual([]);
});

test("multi-day schedule creation is atomic and creates no sessions", async () => {
  const { harness, clubId } = await setup();
  const today = jakartaNowParts().date;
  const weekdays = [isoWeekday(today), isoWeekday(addDays(today, 1))] as WeekdayId[];
  const schedules = await createPracticeSeriesBatch(harness.actor(SATRIYO_ID), {
    title: "Dua hari", weekdays, startTime: "15:30", kind: "teknik", fromDate: today, sets: [],
  });
  expect(schedules).toHaveLength(2);
  const rows = await harness.sql<{ count: number }>`select count(*)::int as count from practices where club_id = ${clubId}`;
  expect(rows[0]!.count).toBe(0);
  await expect(createPracticeSeriesBatch(harness.actor(SATRIYO_ID), {
    title: "Duplikat", weekdays: [weekdays[0]!, weekdays[0]!], kind: "teknik", sets: [],
  })).rejects.toThrow(/duplikat/);
});

test("guardians cannot configure schedules or open staff attendance", async () => {
  const { harness } = await setup();
  const today = jakartaNowParts().date;
  const schedule = await createTodaySchedule(harness);
  await expect(setSeriesActive(harness.actor(RATIH_ID), { id: schedule.id, active: false })).rejects.toThrow(/Tidak diizinkan/);
  await expect(openScheduledTrainingDay(harness.actor(RATIH_ID), { scheduleId: schedule.id, date: today })).rejects.toThrow(/Tidak diizinkan/);
});

test("opened scheduled training remains compatible with calendar and lifecycle", async () => {
  const { harness } = await setup();
  const today = jakartaNowParts().date;
  const schedule = await createTodaySchedule(harness);
  const opened = await openScheduledTrainingDay(harness.actor(SATRIYO_ID), { scheduleId: schedule.id, date: today });
  const detail = await loadPractice(harness.actor(SATRIYO_ID), opened.id);
  await cancelPractice(harness.actor(SATRIYO_ID), { id: opened.id, reason: "Kolam tutup", expectedRevision: detail.revision });
  const ics = await listPracticeIcs(harness.actor(SATRIYO_ID));
  expect(ics).toContain(`UID:practice-${opened.id}@bmsc.klaten.org`);
  expect(ics).toContain("STATUS:CANCELLED");
  expect(await listPracticeSeries(harness.actor(SATRIYO_ID))).toHaveLength(1);
});
