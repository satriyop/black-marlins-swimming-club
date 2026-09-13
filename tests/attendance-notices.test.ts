import { expect, test } from "vitest";
import {
  absenceCutoffLabel,
  isBeforeAbsenceCutoff,
  listAttendanceHistory,
  requestAttendanceCorrection,
  resolveAttendanceCorrection,
  saveAbsenceNotice,
  updateAttendanceStatus,
  withdrawAbsenceNotice,
} from "../src/lib/club/attendance";
import { loadPractice, removePracticeParticipant, savePracticeRecord } from "../src/lib/club/practice";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

const set = { block: "utama", reps: 4, distanceM: 50, stroke: "bebas" };

async function sessionWithLuigi(
  h: Awaited<ReturnType<typeof createClubHarness>>,
  extra: { sessionDate?: string; startTime?: string | null } = {},
) {
  await seedClub(h.sql);
  const saved = await savePracticeRecord(h.actor(SATRIYO_ID), {
    sessionDate: extra.sessionDate ?? "2099-01-15",
    startTime: extra.startTime === undefined ? "15:30" : extra.startTime || undefined,
    kind: "teknik",
    title: "Teknik",
    sets: [set],
  });
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  const practice = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  const row = practice.attendance.find((a) => a.swimmerId === luigi.id)!;
  return { practiceId: saved.id, luigiId: luigi.id, attendanceId: row.id, revision: practice.revision };
}

test("cutoff is session start, or midnight on the session date when jam is missing", () => {
  expect(isBeforeAbsenceCutoff("2099-01-15", "15:30", new Date("2026-01-01T00:00:00Z"))).toBe(true);
  expect(isBeforeAbsenceCutoff("2099-01-15", "15:30:00", new Date("2026-01-01T00:00:00Z"))).toBe(true);
  expect(isBeforeAbsenceCutoff("2020-01-15", "15:30", new Date("2026-01-01T00:00:00Z"))).toBe(false);
  expect(absenceCutoffLabel("2099-01-15", "15:30")).toMatch(/15:30/);
  expect(absenceCutoffLabel("2099-01-15", null)).toMatch(/00\.00/);
});

test("wali reports izin then sakit then withdraws without touching final attendance", async () => {
  const h = await createClubHarness();
  const { practiceId, luigiId, attendanceId } = await sessionWithLuigi(h);
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: attendanceId,
    status: "hadir",
    metersCompleted: 800,
  });
  await saveAbsenceNotice(h.actor(RATIH_ID), { practiceId, swimmerId: luigiId, kind: "izin" });
  await saveAbsenceNotice(h.actor(RATIH_ID), {
    practiceId,
    swimmerId: luigiId,
    kind: "sakit",
    reason: "Demam",
  });
  const mid = await loadPractice(h.actor(SATRIYO_ID), practiceId);
  const midRow = mid.attendance.find((a) => a.swimmerId === luigiId)!;
  expect(midRow.status).toBe("hadir");
  expect(midRow.metersCompleted).toBe(800);
  expect(midRow.notice?.kind).toBe("sakit");
  expect(midRow.notice?.status).toBe("active");
  expect(midRow.notice?.reason).toBe("Demam");
  await withdrawAbsenceNotice(h.actor(RATIH_ID), { practiceId, swimmerId: luigiId });
  const after = await loadPractice(h.actor(SATRIYO_ID), practiceId);
  const row = after.attendance.find((a) => a.swimmerId === luigiId)!;
  expect(row.status).toBe("hadir");
  expect(row.metersCompleted).toBe(800);
  expect(row.notice?.status).toBe("withdrawn");
});

test("wali cannot overwrite historical hadir through attendance write", async () => {
  const h = await createClubHarness();
  const { attendanceId, practiceId, luigiId } = await sessionWithLuigi(h);
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: attendanceId,
    status: "hadir",
    metersCompleted: 800,
  });
  await expect(
    updateAttendanceStatus(h.actor(RATIH_ID), { id: attendanceId, status: "izin" }),
  ).rejects.toThrow(/Tidak diizinkan/);
  const clubId = await h.sql<{ club_id: number }>`select club_id from practices where id = ${practiceId}`;
  const other = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
    values (${clubId[0]!.club_id}, 'Anak Lain', '2014-01-01', 'putra', 'Indonesia', 'aktif')
    returning id
  `;
  await expect(
    saveAbsenceNotice(h.actor(RATIH_ID), { practiceId, swimmerId: other[0]!.id, kind: "izin" }),
  ).rejects.toThrow(/Tidak diizinkan/);
  const row = await h.sql<{ status: string; meters_completed: number | null }>`
    select status, meters_completed from practice_attendance where id = ${attendanceId}
  `;
  expect(row[0]).toEqual({ status: "hadir", meters_completed: 800 });
  expect(luigiId).toBeTruthy();
});

test("omitting meters leaves the recorded distance; explicit null clears it", async () => {
  const h = await createClubHarness();
  const { attendanceId } = await sessionWithLuigi(h);
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: attendanceId,
    status: "hadir",
    metersCompleted: 800,
  });
  await updateAttendanceStatus(h.actor(SATRIYO_ID), { id: attendanceId, status: "hadir" });
  let row = await h.sql<{ meters_completed: number | null }>`
    select meters_completed from practice_attendance where id = ${attendanceId}
  `;
  expect(row[0]?.meters_completed).toBe(800);
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: attendanceId,
    status: "hadir",
    metersCompleted: null,
  });
  row = await h.sql<{ meters_completed: number | null }>`
    select meters_completed from practice_attendance where id = ${attendanceId}
  `;
  expect(row[0]?.meters_completed).toBeNull();
});

test("late, cancelled, and completed sessions reject family notices", async () => {
  const h = await createClubHarness();
  const past = await sessionWithLuigi(h, { sessionDate: "2020-01-15", startTime: "15:30" });
  await expect(
    saveAbsenceNotice(h.actor(RATIH_ID), {
      practiceId: past.practiceId,
      swimmerId: past.luigiId,
      kind: "izin",
    }),
  ).rejects.toThrow(/Batas waktu/);
  const open = await sessionWithLuigi(h);
  const { completePractice } = await import("../src/lib/club/practice");
  await completePractice(h.actor(SATRIYO_ID), {
    id: open.practiceId,
    acknowledgeIncomplete: true,
    expectedRevision: open.revision,
  });
  await expect(
    saveAbsenceNotice(h.actor(RATIH_ID), {
      practiceId: open.practiceId,
      swimmerId: open.luigiId,
      kind: "izin",
    }),
  ).rejects.toThrow(/ditutup|dibatalkan/);
});

test("coach final attendance stays independent of an active notice", async () => {
  const h = await createClubHarness();
  const { practiceId, luigiId, attendanceId } = await sessionWithLuigi(h);
  await saveAbsenceNotice(h.actor(RATIH_ID), { practiceId, swimmerId: luigiId, kind: "izin" });
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: attendanceId,
    status: "hadir",
    metersCompleted: 400,
  });
  const loaded = await loadPractice(h.actor(SATRIYO_ID), practiceId);
  const row = loaded.attendance.find((a) => a.swimmerId === luigiId)!;
  expect(row.status).toBe("hadir");
  expect(row.notice?.kind).toBe("izin");
  expect(row.notice?.status).toBe("active");
});

test("history lists notice and final attendance without letting notices change the rate", async () => {
  const h = await createClubHarness();
  const { practiceId, luigiId, attendanceId } = await sessionWithLuigi(h);
  await saveAbsenceNotice(h.actor(RATIH_ID), { practiceId, swimmerId: luigiId, kind: "izin" });
  const before = await listAttendanceHistory(h.actor(RATIH_ID), luigiId);
  expect(before.every((r) => r.status === "belum" || r.status === "hadir")).toBe(true);
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: attendanceId,
    status: "hadir",
    metersCompleted: 200,
  });
  const after = await listAttendanceHistory(h.actor(RATIH_ID), luigiId);
  const row = after.find((r) => r.practiceId === practiceId)!;
  expect(row.status).toBe("hadir");
  expect(row.metersCompleted).toBe(200);
  expect(row.noticeKind).toBe("izin");
});

test("correction request is pending then resolved with an explanation", async () => {
  const h = await createClubHarness();
  const { practiceId, luigiId, attendanceId, revision } = await sessionWithLuigi(h);
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: attendanceId,
    status: "alfa",
  });
  const { completePractice } = await import("../src/lib/club/practice");
  await completePractice(h.actor(SATRIYO_ID), {
    id: practiceId,
    acknowledgeIncomplete: true,
    expectedRevision: revision,
  });
  const req = await requestAttendanceCorrection(h.actor(RATIH_ID), {
    attendanceId,
    message: "Anak izin, bukan alfa",
  });
  const pending = await listAttendanceHistory(h.actor(RATIH_ID), luigiId);
  expect(pending.find((r) => r.practiceId === practiceId)?.correctionStatus).toBe("pending");
  await resolveAttendanceCorrection(h.actor(SATRIYO_ID), {
    id: req.id,
    status: "resolved",
    resolution: "Dikoreksi ke izin",
  });
  const done = await listAttendanceHistory(h.actor(RATIH_ID), luigiId);
  const row = done.find((r) => r.practiceId === practiceId)!;
  expect(row.correctionStatus).toBe("resolved");
  expect(row.correctionResolution).toBe("Dikoreksi ke izin");
  expect(row.status).toBe("alfa");
});

test("lepas with an active notice keeps the attendance row off the roll", async () => {
  const h = await createClubHarness();
  const { practiceId, luigiId, attendanceId } = await sessionWithLuigi(h);
  await saveAbsenceNotice(h.actor(RATIH_ID), { practiceId, swimmerId: luigiId, kind: "izin" });
  await removePracticeParticipant(h.actor(SATRIYO_ID), { practiceId, swimmerId: luigiId });
  const loaded = await loadPractice(h.actor(SATRIYO_ID), practiceId);
  const row = loaded.attendance.find((a) => a.swimmerId === luigiId);
  expect(row?.id).toBe(attendanceId);
  expect(row?.onRoll).toBe(false);
  expect(row?.notice?.status).toBe("active");
});

test("a second pending correction is rejected cleanly", async () => {
  const h = await createClubHarness();
  const { practiceId, attendanceId, revision } = await sessionWithLuigi(h);
  const { completePractice } = await import("../src/lib/club/practice");
  await completePractice(h.actor(SATRIYO_ID), {
    id: practiceId,
    acknowledgeIncomplete: true,
    expectedRevision: revision,
  });
  await requestAttendanceCorrection(h.actor(RATIH_ID), {
    attendanceId,
    message: "Pertama",
  });
  await expect(
    requestAttendanceCorrection(h.actor(RATIH_ID), { attendanceId, message: "Kedua" }),
  ).rejects.toThrow(/Koreksi menunggu/);
});
