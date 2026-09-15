import { afterEach, expect, test, vi } from "vitest";
import { getDashboardData } from "../src/lib/club/dashboard";
import { loadPractice, savePracticeRecord } from "../src/lib/club/practice";
import {
  createPracticeSeries,
  isoWeekday,
  listScheduledTrainingDays,
  openScheduledTrainingDay,
  savePlannedAbsenceNotice,
  skipSeriesRange,
  withdrawPlannedAbsenceNotice,
} from "../src/lib/club/series";
import { saveTaskView } from "../src/lib/club/prefs";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { jakartaNowParts } from "../src/lib/utils";
import { createClubHarness } from "./harness";

afterEach(() => vi.useRealTimers());

async function fixture() {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`delete from practices where club_id = ${clubId}`;
  const swimmers = await h.sql<{
    id: number;
    full_name: string;
  }>`select id, full_name from swimmers where club_id = ${clubId}`;
  const luigi = swimmers.find((row) => row.full_name === "Perenang Tiga")!;
  return { h, clubId, luigi };
}

test("guardian home uses a recurring day before attendance opens and ignores old or canceled sessions", async () => {
  const { h, clubId } = await fixture();
  const today = jakartaNowParts().date;
  await savePracticeRecord(h.actor(SATRIYO_ID), {
    sessionDate: "2020-01-01",
    kind: "teknik",
    title: "Sesi lama",
    sets: [],
  });
  const schedule = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Latihan rutin",
    weekday: isoWeekday(today),
    fromDate: today,
    startTime: "16:00",
    kind: "teknik",
    sets: [],
  });
  const home = await getDashboardData(h.actor(RATIH_ID));
  expect(home.upcomingPractices.map((practice) => practice.title)).toContain("Sesi lama");
  expect(home.nextScheduledTraining).toMatchObject({
    scheduleId: schedule.id,
    practiceId: null,
    date: today,
    title: "Latihan rutin",
  });
  await h.sql`insert into practices (club_id,session_date,kind,title,status,series_id,occurrence_date)
    values (${clubId},${today}::date,'teknik','Latihan rutin','cancelled',${schedule.id},${today}::date)`;
  const afterCancel = await getDashboardData(h.actor(RATIH_ID));
  expect(afterCancel.nextScheduledTraining?.date).not.toBe(today);
});

test("a guardian notice precedes the roll, follows it when opened, and never sets final attendance", async () => {
  const { h, luigi } = await fixture();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-01-14T10:00:00Z"));
  const today = jakartaNowParts().date;
  const schedule = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Latihan besok",
    weekday: isoWeekday(today),
    fromDate: today,
    startTime: "18:00",
    kind: "teknik",
    sets: [],
  });
  await savePlannedAbsenceNotice(h.actor(RATIH_ID), {
    scheduleId: schedule.id,
    date: today,
    swimmerId: luigi.id,
    kind: "sakit",
    reason: "Demam",
  });
  const before = await listScheduledTrainingDays(h.actor(RATIH_ID), { fromDate: today, days: 1 });
  expect(before[0]?.practiceId).toBeNull();
  expect(before[0]?.familySwimmers.find((row) => row.id === luigi.id)?.notice).toMatchObject({
    kind: "sakit",
    reason: "Demam",
    status: "active",
  });
  const opened = await openScheduledTrainingDay(h.actor(SATRIYO_ID), {
    scheduleId: schedule.id,
    date: today,
  });
  const practice = await loadPractice(h.actor(SATRIYO_ID), opened.id);
  const attendance = practice.attendance.find((row) => row.swimmerId === luigi.id)!;
  expect(attendance.status).toBe("belum");
  expect(attendance.notice).toMatchObject({ kind: "sakit", reason: "Demam", status: "active" });
  await withdrawPlannedAbsenceNotice(h.actor(RATIH_ID), {
    scheduleId: schedule.id,
    date: today,
    swimmerId: luigi.id,
  });
  expect(
    (await loadPractice(h.actor(SATRIYO_ID), opened.id)).attendance.find(
      (row) => row.swimmerId === luigi.id,
    )?.notice?.status,
  ).toBe("withdrawn");
});

test("planned notices enforce child access, schedule skips, and the session cutoff", async () => {
  const { h, clubId, luigi } = await fixture();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-01-14T10:00:00Z"));
  const today = jakartaNowParts().date;
  const schedule = await createPracticeSeries(h.actor(SATRIYO_ID), {
    title: "Latihan",
    weekday: isoWeekday(today),
    fromDate: today,
    startTime: "18:00",
    kind: "teknik",
    sets: [],
  });
  const outsider = await h.sql<{ id: number }>`
    insert into swimmers (club_id,full_name,date_of_birth,gender,status)
    values (${clubId},'Anak Lain','2014-01-01','putra','aktif') returning id`;
  await expect(
    savePlannedAbsenceNotice(h.actor(RATIH_ID), {
      scheduleId: schedule.id,
      date: today,
      swimmerId: outsider[0]!.id,
      kind: "izin",
    }),
  ).rejects.toThrow(/Tidak diizinkan/);
  vi.setSystemTime(new Date("2099-01-14T11:30:00Z"));
  await expect(
    savePlannedAbsenceNotice(h.actor(RATIH_ID), {
      scheduleId: schedule.id,
      date: today,
      swimmerId: luigi.id,
      kind: "izin",
    }),
  ).rejects.toThrow(/Batas waktu izin sudah lewat/);
  vi.setSystemTime(new Date("2099-01-14T10:00:00Z"));
  await skipSeriesRange(h.actor(SATRIYO_ID), {
    id: schedule.id,
    fromDate: today,
    toDate: today,
    reason: "Kolam tutup",
  });
  await expect(
    savePlannedAbsenceNotice(h.actor(RATIH_ID), {
      scheduleId: schedule.id,
      date: today,
      swimmerId: luigi.id,
      kind: "izin",
    }),
  ).rejects.toThrow(/diliburkan/);
});

test("home tasks show only actionable registration work for the current role", async () => {
  const { h, clubId, luigi } = await fixture();
  const meet = await h.sql<{ id: number }>`
    insert into meets (club_id,name,level,course,start_date,status,registration_state,registration_deadline)
    values (${clubId},'Kejuaraan Uji','pengcab','50','2099-02-01','rencana','open','2099-01-31T00:00:00Z') returning id
  `;
  await h.sql`insert into meet_eligibility (meet_id,swimmer_id,club_id,group_name)
    values (${meet[0]!.id},${luigi.id},${clubId},'KU 2014')`;
  const guardian = await getDashboardData(h.actor(RATIH_ID));
  expect(guardian.pendingRegistrationTasks).toMatchObject([
    {
      meetId: meet[0]!.id,
      swimmerName: luigi.full_name,
      kind: "guardian_response",
    },
  ]);
  await h.sql`update meet_eligibility set response='yes' where meet_id=${meet[0]!.id} and swimmer_id=${luigi.id}`;
  await h.sql`insert into meet_entries (club_id,meet_id,swimmer_id,stroke,distance_m,registration_status)
    values (${clubId},${meet[0]!.id},${luigi.id},'bebas',50,'requested')`;
  await saveTaskView(h.actor(SATRIYO_ID), "club");
  const coach = await getDashboardData(h.actor(SATRIYO_ID));
  expect(coach.pendingRegistrationTasks).toMatchObject([
    {
      meetId: meet[0]!.id,
      kind: "coach_review",
      count: 1,
    },
  ]);
  expect((await getDashboardData(h.actor(RATIH_ID))).pendingRegistrationTasks).toEqual([]);
});
