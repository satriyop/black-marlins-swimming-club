import { expect, test } from "vitest";
import {
  selectDashboardPractice,
  selectOverduePractices,
} from "../src/lib/club/dashboard-practice";
import type { Dashboard, Practice } from "../src/lib/swim/types";

const overdue = {
  id: 1,
  sessionDate: "2026-09-14",
  startTime: "15:30",
  title: "Latihan lama belum selesai",
} as Practice;

const olderOverdue = {
  id: 3,
  sessionDate: "2026-09-12",
  startTime: "15:30",
  title: "Latihan lebih lama",
} as Practice;

const today = {
  scheduleId: 2,
  practiceId: 2,
  date: "2026-09-17",
  startTime: "15:30",
  title: "Latihan Reguler Sore",
} as NonNullable<Dashboard["nextScheduledTraining"]>;

const future = {
  scheduleId: 4,
  practiceId: 4,
  date: "2026-09-18",
  startTime: "15:30",
  title: "Latihan Jumat",
} as NonNullable<Dashboard["nextScheduledTraining"]>;

test("today's scheduled training outranks an overdue unfinished session", () => {
  expect(
    selectDashboardPractice({
      upcomingPractices: [overdue],
      nextScheduledTraining: today,
      clubView: true,
      today: "2026-09-17",
    }),
  ).toBe(today);
});

test("a later scheduled session outranks overdue for the primary slot", () => {
  expect(
    selectDashboardPractice({
      upcomingPractices: [overdue],
      nextScheduledTraining: future,
      clubView: true,
      today: "2026-09-17",
    }),
  ).toBe(future);
});

test("an overdue unfinished session is not the primary slot", () => {
  expect(
    selectDashboardPractice({
      upcomingPractices: [overdue],
      nextScheduledTraining: null,
      clubView: true,
      today: "2026-09-17",
    }),
  ).toBeUndefined();
});

test("club view lists overdue sessions oldest first", () => {
  expect(
    selectOverduePractices({
      upcomingPractices: [overdue, olderOverdue],
      nextScheduledTraining: today,
      clubView: true,
      today: "2026-09-17",
    }),
  ).toEqual([olderOverdue, overdue]);
});

test("family view does not list overdue sessions", () => {
  expect(
    selectOverduePractices({
      upcomingPractices: [overdue],
      nextScheduledTraining: today,
      clubView: false,
      today: "2026-09-17",
    }),
  ).toEqual([]);
});
