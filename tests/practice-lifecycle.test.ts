import { expect, test } from "vitest";
import { updateAttendanceStatus } from "../src/lib/club/attendance";
import { getDashboardData } from "../src/lib/club/dashboard";
import {
  addPracticeParticipant,
  cancelPractice,
  completePractice,
  loadPractice,
  removePracticeParticipant,
  reopenPractice,
  savePracticeRecord,
} from "../src/lib/club/practice";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { saveSwimmer } from "../src/lib/club/swimmers";
import { deletePractice } from "../src/lib/club/writes";
import { todayIso } from "../src/lib/utils";
import { createClubHarness } from "./harness";

const set = { block: "utama", reps: 4, distanceM: 50, stroke: "bebas" };

async function makeSession(
  h: Awaited<ReturnType<typeof createClubHarness>>,
  extra: { sessionDate?: string; title?: string; startTime?: string } = {},
) {
  return savePracticeRecord(h.actor(SATRIYO_ID), {
    sessionDate: extra.sessionDate ?? "2026-10-01",
    startTime: extra.startTime ?? "15:30",
    kind: "teknik",
    title: extra.title ?? "Teknik",
    location: "Tirta",
    sets: [set],
  });
}

test("editing a session keeps the same id and attendance rows", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await makeSession(h);
  const before = await h.sql<{ id: number; status: string; meters_completed: number | null }>`
    select id, status, meters_completed from practice_attendance where practice_id = ${saved.id} order by id
  `;
  const att = before[0]!;
  await h.sql`update practice_attendance set status = 'hadir', meters_completed = 200 where id = ${att.id}`;
  const updated = await savePracticeRecord(h.actor(SATRIYO_ID), {
    id: saved.id,
    sessionDate: "2026-10-02",
    startTime: "16:00",
    kind: "sprint",
    title: "Sprint sore",
    location: "Tirta",
    sets: [{ block: "sprint", reps: 8, distanceM: 25, stroke: "bebas" }],
    expectedRevision: 1,
  });
  expect(updated.id).toBe(saved.id);
  const after = await h.sql<{ id: number; status: string; meters_completed: number | null }>`
    select id, status, meters_completed from practice_attendance where practice_id = ${saved.id} order by id
  `;
  expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
  expect(after.find((r) => r.id === att.id)).toEqual({
    id: att.id,
    status: "hadir",
    meters_completed: 200,
  });
  const loaded = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(loaded.title).toBe("Sprint sore");
  expect(loaded.sessionDate).toBe("2026-10-02");
  expect(loaded.originalSessionDate).toBe("2026-10-01");
  expect(loaded.originalStartTime).toBe("15:30");
  expect(loaded.revision).toBe(2);
});

test("stale revision does not overwrite a concurrent edit", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await makeSession(h);
  await savePracticeRecord(h.actor(SATRIYO_ID), {
    id: saved.id,
    sessionDate: "2026-10-01",
    startTime: "15:30",
    kind: "teknik",
    title: "Diedit dulu",
    sets: [set],
    expectedRevision: 1,
  });
  await expect(
    savePracticeRecord(h.actor(SATRIYO_ID), {
      id: saved.id,
      sessionDate: "2026-10-01",
      startTime: "15:30",
      kind: "teknik",
      title: "Diedit belakangan",
      sets: [set],
      expectedRevision: 1,
    }),
  ).rejects.toThrow(/Muat ulang/);
});

test("a child created after scheduling is not on the roll until added", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await makeSession(h);
  const child = await saveSwimmer(h.actor(SATRIYO_ID), {
    fullName: "Aira Baru",
    dateOfBirth: "2016-03-01",
    gender: "putri",
    status: "aktif",
    asChild: true,
  });
  const before = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(before.attendance.some((a) => a.swimmerId === child.id)).toBe(false);
  await addPracticeParticipant(h.actor(SATRIYO_ID), { practiceId: saved.id, swimmerId: child.id });
  const after = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  const row = after.attendance.find((a) => a.swimmerId === child.id);
  expect(row?.status).toBe("belum");
  expect(row?.onRoll).toBe(true);
  expect(after.attendance.filter((a) => a.swimmerId === child.id)).toHaveLength(1);
});

test("removing a recorded participant keeps history off the roll", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await makeSession(h);
  const loaded = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  const row = loaded.attendance[0]!;
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: row.id,
    status: "hadir",
    metersCompleted: 200,
  });
  await removePracticeParticipant(h.actor(SATRIYO_ID), {
    practiceId: saved.id,
    swimmerId: row.swimmerId,
  });
  const after = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  const kept = after.attendance.find((a) => a.swimmerId === row.swimmerId);
  expect(kept?.onRoll).toBe(false);
  expect(kept?.status).toBe("hadir");
  expect(kept?.metersCompleted).toBe(200);
});

test("cancel requires a reason, preserves the session, and blocks family writes", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await makeSession(h);
  await expect(
    cancelPractice(h.actor(SATRIYO_ID), { id: saved.id, reason: "  ", expectedRevision: 1 }),
  ).rejects.toThrow(/Alasan/);
  await cancelPractice(h.actor(SATRIYO_ID), {
    id: saved.id,
    reason: "Kolam tutup",
    expectedRevision: 1,
  });
  const loaded = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(loaded.status).toBe("cancelled");
  expect(loaded.cancelReason).toBe("Kolam tutup");
  const row = loaded.attendance[0]!;
  await expect(
    updateAttendanceStatus(h.actor(RATIH_ID), { id: row.id, status: "izin" }),
  ).rejects.toThrow(/ditutup|dibatalkan/);
});

test("complete requires acknowledging unmarked rows and does not auto-mark alfa", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await makeSession(h);
  await expect(
    completePractice(h.actor(SATRIYO_ID), { id: saved.id, expectedRevision: 1 }),
  ).rejects.toThrow(/belum dicatat/);
  await completePractice(h.actor(SATRIYO_ID), {
    id: saved.id,
    acknowledgeIncomplete: true,
    expectedRevision: 1,
  });
  const loaded = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(loaded.status).toBe("completed");
  expect(loaded.attendance.every((a) => a.status === "belum")).toBe(true);
  await expect(
    savePracticeRecord(h.actor(SATRIYO_ID), {
      id: saved.id,
      sessionDate: "2026-10-01",
      kind: "teknik",
      title: "Tidak boleh",
      sets: [set],
    }),
  ).rejects.toThrow(/selesai/);
});

test("reopen of a completed session needs a reason and restores edits", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await makeSession(h);
  await completePractice(h.actor(SATRIYO_ID), {
    id: saved.id,
    acknowledgeIncomplete: true,
    expectedRevision: 1,
  });
  await expect(
    reopenPractice(h.actor(SATRIYO_ID), { id: saved.id, reason: "", expectedRevision: 2 }),
  ).rejects.toThrow(/Alasan/);
  await reopenPractice(h.actor(SATRIYO_ID), {
    id: saved.id,
    reason: "Koreksi jarak",
    expectedRevision: 2,
  });
  const loaded = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(loaded.status).toBe("scheduled");
  expect(loaded.reopenReason).toBe("Koreksi jarak");
  const edited = await savePracticeRecord(h.actor(SATRIYO_ID), {
    id: saved.id,
    sessionDate: "2026-10-01",
    kind: "teknik",
    title: "Setelah dibuka",
    sets: [set],
    expectedRevision: loaded.revision,
  });
  expect(edited.id).toBe(saved.id);
});

test("deleting a session with recorded attendance is refused", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const saved = await makeSession(h);
  const loaded = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  await updateAttendanceStatus(h.actor(SATRIYO_ID), {
    id: loaded.attendance[0]!.id,
    status: "hadir",
    metersCompleted: 50,
  });
  await expect(deletePractice(h.actor(SATRIYO_ID), saved.id)).rejects.toThrow(/Batalkan/);
});

test("Hari Ini skips completed and cancelled sessions", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const done = await makeSession(h, { sessionDate: "2026-12-01", title: "Selesai" });
  await completePractice(h.actor(SATRIYO_ID), {
    id: done.id,
    acknowledgeIncomplete: true,
    expectedRevision: 1,
  });
  const cancelled = await makeSession(h, { sessionDate: "2026-12-02", title: "Batal" });
  await cancelPractice(h.actor(SATRIYO_ID), {
    id: cancelled.id,
    reason: "Hujan",
    expectedRevision: 1,
  });
  const next = await makeSession(h, { sessionDate: "2026-12-03", title: "Berikutnya" });
  const dash = await getDashboardData(h.actor(SATRIYO_ID));
  expect(dash.upcomingPractices.map((p) => p.title)).toEqual(["Berikutnya"]);
  expect(dash.upcomingPractices[0]?.id).toBe(next.id);
});

test("Hari Ini keeps an open session after start and shows today's cancellation", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const today = todayIso();
  await makeSession(h, { sessionDate: "2020-01-01", startTime: "06:00", title: "Terlambat" });
  const cancelled = await makeSession(h, { sessionDate: today, startTime: "07:00", title: "Batal hari ini" });
  await cancelPractice(h.actor(SATRIYO_ID), {
    id: cancelled.id,
    reason: "Hujan",
    expectedRevision: 1,
  });
  const dash = await getDashboardData(h.actor(SATRIYO_ID));
  expect(dash.upcomingPractices.map((p) => p.title)).toContain("Terlambat");
  expect(dash.upcomingPractices.map((p) => p.title)).not.toContain("Batal hari ini");
  expect(dash.noticePractices.map((p) => p.title)).toContain("Batal hari ini");
});
