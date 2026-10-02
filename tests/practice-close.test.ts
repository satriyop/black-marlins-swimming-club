import { expect, test } from "vitest";
import { getDashboardData } from "../src/lib/club/dashboard";
import { loadPractice, reopenPractice, savePracticeRecord } from "../src/lib/club/practice";
import { AUTO_CANCEL_REASON } from "../src/lib/club/practice-close";
import { previousIsoDate } from "../src/lib/club/practice-close";
import { SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { todayIso } from "../src/lib/utils";
import { createClubHarness } from "./harness";

const set = { block: "utama", reps: 4, distanceM: 50, stroke: "bebas" };

async function club() {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const swimmers = await h.sql<{ id: number; full_name: string }>`
    select id, full_name from swimmers where club_id = ${clubId} order by full_name
  `;
  return { h, clubId, swimmers };
}

async function session(
  h: Awaited<ReturnType<typeof club>>["h"],
  sessionDate: string,
  title: string,
) {
  return savePracticeRecord(h.actor(SATRIYO_ID), {
    sessionDate,
    startTime: "15:30",
    kind: "teknik",
    title,
    sets: [set],
  });
}

test("a started roll closes overnight: notices stay, blanks become alfa", async () => {
  const { h, clubId, swimmers } = await club();
  const yesterday = previousIsoDate(todayIso());
  const saved = await session(h, yesterday, "Sore kemarin");
  const [present, excused, blank] = swimmers;
  await h.sql`
    update practice_attendance set status = 'hadir', meters_completed = 400
    where practice_id = ${saved.id} and swimmer_id = ${present!.id}
  `;
  await h.sql`
    insert into absence_notices (club_id, practice_id, swimmer_id, kind, status, created_by)
    values (${clubId}, ${saved.id}, ${excused!.id}, 'izin', 'active', ${SATRIYO_ID})
  `;
  const dash = await getDashboardData(h.actor(SATRIYO_ID));
  expect(dash.upcomingPractices.map((practice) => practice.title)).not.toContain("Sore kemarin");
  expect(dash.autoClosedYesterday).toEqual([
    expect.objectContaining({ id: saved.id, title: "Sore kemarin", sessionDate: yesterday }),
  ]);
  const loaded = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(loaded.status).toBe("completed");
  expect(loaded.autoClosed).toBe(true);
  expect(loaded.attendance.find((row) => row.swimmerId === present!.id)).toMatchObject({
    status: "hadir",
    metersCompleted: 400,
  });
  expect(loaded.attendance.find((row) => row.swimmerId === excused!.id)?.status).toBe("izin");
  expect(loaded.attendance.find((row) => row.swimmerId === blank!.id)?.status).toBe("alfa");
  const again = await getDashboardData(h.actor(SATRIYO_ID));
  expect(again.autoClosedYesterday.map((row) => row.id)).toEqual([saved.id]);
  const revision = await h.sql<{ revision: number }>`
    select revision from practices where id = ${saved.id}
  `;
  expect(revision[0]!.revision).toBe(loaded.revision);
});

test("an empty roll is cancelled and nobody is marked alfa", async () => {
  const { h, swimmers } = await club();
  const saved = await session(h, "2020-01-01", "Lama kosong");
  const dash = await getDashboardData(h.actor(SATRIYO_ID));
  expect(dash.upcomingPractices.map((practice) => practice.title)).not.toContain("Lama kosong");
  expect(dash.autoClosedYesterday.map((row) => row.id)).not.toContain(saved.id);
  const loaded = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(loaded.status).toBe("cancelled");
  expect(loaded.cancelReason).toBe(AUTO_CANCEL_REASON);
  expect(loaded.autoClosed).toBe(true);
  expect(loaded.attendance.every((row) => row.status === "belum")).toBe(true);
  expect(loaded.attendance).toHaveLength(swimmers.length);
});

test("today stays open, a withdrawn notice becomes alfa, and an off-roll blank stays blank", async () => {
  const { h, clubId, swimmers } = await club();
  const yesterday = previousIsoDate(todayIso());
  const today = await session(h, todayIso(), "Hari ini");
  const saved = await session(h, yesterday, "Campuran");
  const [present, excused, aside] = swimmers;
  await h.sql`
    update practice_attendance set status = 'hadir'
    where practice_id = ${saved.id} and swimmer_id = ${present!.id}
  `;
  await h.sql`
    update practice_attendance set on_roll = false
    where practice_id = ${saved.id} and swimmer_id = ${aside!.id}
  `;
  await h.sql`
    insert into absence_notices (club_id, practice_id, swimmer_id, kind, status, created_by)
    values (${clubId}, ${saved.id}, ${excused!.id}, 'sakit', 'withdrawn', ${SATRIYO_ID})
  `;
  await getDashboardData(h.actor(SATRIYO_ID));
  const open = await loadPractice(h.actor(SATRIYO_ID), today.id);
  expect(open.status).toBe("scheduled");
  const closed = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(closed.attendance.find((row) => row.swimmerId === excused!.id)?.status).toBe("alfa");
  expect(closed.attendance.find((row) => row.swimmerId === aside!.id)?.status).toBe("belum");
});

test("reopening a past session keeps it open for the coach to correct", async () => {
  const { h } = await club();
  const saved = await session(h, previousIsoDate(todayIso()), "Dibuka lagi");
  const closedDash = await getDashboardData(h.actor(SATRIYO_ID));
  expect(closedDash.autoClosedYesterday.map((row) => row.id)).toContain(saved.id);
  const closed = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  await reopenPractice(h.actor(SATRIYO_ID), {
    id: saved.id,
    reason: "Catatan salah",
    expectedRevision: closed.revision,
  });
  const dash = await getDashboardData(h.actor(SATRIYO_ID));
  expect(dash.upcomingPractices.map((practice) => practice.id)).toContain(saved.id);
  expect(dash.autoClosedYesterday.map((row) => row.id)).not.toContain(saved.id);
  const reopened = await loadPractice(h.actor(SATRIYO_ID), saved.id);
  expect(reopened.autoClosed).toBe(false);
  expect(reopened.attendance.every((row) => row.status === "belum")).toBe(true);
});
