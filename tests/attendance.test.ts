import { expect, test } from "vitest";
import { updateAttendanceStatus } from "../src/lib/club/attendance";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

async function seedAttendance(h: Awaited<ReturnType<typeof createClubHarness>>) {
  const clubId = await seedClub(h.sql);
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  const practices = await h.sql<{ id: number }>`
    insert into practices (club_id, session_date, kind, title, total_meters)
    values (${clubId}, '2026-09-11', 'teknik', 'Tes izin', 1000)
    returning id
  `;
  const practiceId = practices[0]!.id;
  const att = await h.sql<{ id: number }>`
    insert into practice_attendance (club_id, practice_id, swimmer_id, status, meters_completed)
    values (${clubId}, ${practiceId}, ${luigi.id}, 'hadir', 1000)
    returning id
  `;
  return { clubId, luigiId: luigi.id, attendanceId: att[0]!.id };
}

test("wali can set izin or sakit on a linked child", async () => {
  const h = await createClubHarness();
  const { attendanceId } = await seedAttendance(h);
  await updateAttendanceStatus(h.actor(RATIH_ID), { id: attendanceId, status: "izin", metersCompleted: 0 });
  const rows = await h.sql<{ status: string }>`select status from practice_attendance where id = ${attendanceId}`;
  expect(rows[0]?.status).toBe("izin");
  await updateAttendanceStatus(h.actor(RATIH_ID), { id: attendanceId, status: "sakit", metersCompleted: 0 });
  const again = await h.sql<{ status: string }>`select status from practice_attendance where id = ${attendanceId}`;
  expect(again[0]?.status).toBe("sakit");
});

test("wali cannot mark hadir on attendance", async () => {
  const h = await createClubHarness();
  const { attendanceId } = await seedAttendance(h);
  await updateAttendanceStatus(h.actor(RATIH_ID), { id: attendanceId, status: "izin", metersCompleted: 0 });
  await expect(
    updateAttendanceStatus(h.actor(RATIH_ID), { id: attendanceId, status: "hadir", metersCompleted: 1000 }),
  ).rejects.toThrow(/Tidak diizinkan/);
});

test("staff can mark any attendance status", async () => {
  const h = await createClubHarness();
  const { attendanceId } = await seedAttendance(h);
  await updateAttendanceStatus(h.actor(SATRIYO_ID), { id: attendanceId, status: "alfa", metersCompleted: 0 });
  const rows = await h.sql<{ status: string }>`select status from practice_attendance where id = ${attendanceId}`;
  expect(rows[0]?.status).toBe("alfa");
});
