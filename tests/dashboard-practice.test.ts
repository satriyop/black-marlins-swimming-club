import { expect, test } from "vitest";
import { selectDashboardPractice } from "../src/lib/club/dashboard-practice";
import type { Dashboard, Practice } from "../src/lib/swim/types";

const overdue = {
  id: 1,
  sessionDate: "2026-09-14",
  startTime: "15:30",
  title: "Latihan lama belum selesai",
} as Practice;

const today = {
  scheduleId: 2,
  practiceId: 2,
  date: "2026-09-17",
  startTime: "15:30",
  title: "Latihan Reguler Sore",
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
