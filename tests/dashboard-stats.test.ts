import { afterEach, expect, test, vi } from "vitest";
import { getDashboardData } from "../src/lib/club/dashboard";
import { SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

afterEach(() => vi.useRealTimers());

test("club statistics use Jakarta month-to-date completed and active sessions", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T23:00:00Z"));
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`delete from practices where club_id=${clubId}`;
  const swimmers = await h.sql<{ id: number }>`
    select id from swimmers where club_id=${clubId} order by id limit 3
  `;
  const practices = await h.sql<{ id: number }>`
    insert into practices(club_id,session_date,kind,title,status,total_meters) values
      (${clubId},'2026-09-01','renang','Selesai','completed',1000),
      (${clubId},'2026-09-17','renang','Berjalan','in_progress',2000),
      (${clubId},'2026-09-10','renang','Belum dibuka','scheduled',3000),
      (${clubId},'2026-09-11','renang','Batal','cancelled',4000),
      (${clubId},'2026-08-31','renang','Bulan lalu','completed',5000),
      (${clubId},'2026-09-20','renang','Masa depan','scheduled',6000)
    returning id
  `;
  await h.sql`
    insert into practice_attendance(club_id,practice_id,swimmer_id,status,on_roll) values
      (${clubId},${practices[0]!.id},${swimmers[0]!.id},'hadir',true),
      (${clubId},${practices[0]!.id},${swimmers[1]!.id},'izin',true),
      (${clubId},${practices[0]!.id},${swimmers[2]!.id},'belum',true),
      (${clubId},${practices[1]!.id},${swimmers[0]!.id},'hadir',true),
      (${clubId},${practices[1]!.id},${swimmers[1]!.id},'sakit',true),
      (${clubId},${practices[1]!.id},${swimmers[2]!.id},'belum',true),
      (${clubId},${practices[3]!.id},${swimmers[0]!.id},'hadir',true),
      (${clubId},${practices[4]!.id},${swimmers[0]!.id},'hadir',true),
      (${clubId},${practices[5]!.id},${swimmers[0]!.id},'hadir',true)
  `;

  const dashboard = await getDashboardData(h.actor(SATRIYO_ID));

  expect(dashboard.stats).toMatchObject({
    practicesThisMonth: 2,
    volumeThisMonth: 3000,
    attendanceExpected: 6,
    attendanceRecorded: 4,
    attendanceRate: 50,
  });
});
