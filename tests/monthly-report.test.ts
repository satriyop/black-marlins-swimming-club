import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { getMonthlyReport, monthBounds } from "../src/lib/club/monthly-report";

describe("monthly swimmer report", () => {
  let harness: Awaited<ReturnType<typeof createClubHarness>>;
  let clubId: number;
  let swimmerId: number;
  let otherSwimmerId: number;

  beforeEach(async () => {
    harness = await createClubHarness();
    await harness.sql`
      insert into "user"(id,name,email,"emailVerified") values
        ('report-coach','Coach','report-coach@example.test',true),
        ('report-guardian','Guardian','report-guardian@example.test',true),
        ('report-other','Other','report-other@example.test',true)
    `;
    const clubs = await harness.sql<{ id: number }>`
      insert into clubs(name,short_name,city,province,coach_name) values
        ('Klub Satu','K1','Jakarta','DKI Jakarta','Coach'),
        ('Klub Dua','K2','Bandung','Jawa Barat','Coach') returning id
    `;
    clubId = clubs[0]!.id;
    await harness.sql`insert into club_staff(club_id,user_id,role) values (${clubId},'report-coach','coach')`;
    await harness.sql`
      insert into club_family(club_id,user_id) values
        (${clubId},'report-guardian'),(${clubId},'report-other')
    `;
    const swimmers = await harness.sql<{ id: number }>`
      insert into swimmers(club_id,full_name,date_of_birth,gender) values
        (${clubId},'Anak Satu','2013-01-01','putra'),
        (${clubId},'Anak Dua','2013-02-01','putri'),
        (${clubs[1]!.id},'Anak Klub Lain','2013-03-01','putra') returning id
    `;
    swimmerId = swimmers[0]!.id;
    otherSwimmerId = swimmers[1]!.id;
    await harness.sql`
      insert into guardians(user_id,swimmer_id) values
        ('report-guardian',${swimmerId}),('report-other',${otherSwimmerId})
    `;
    const practices = await harness.sql<{ id: number }>`
      insert into practices(club_id,session_date,kind,title,status) values
        (${clubId},'2026-09-10','renang','Selesai 1','completed'),
        (${clubId},'2026-09-11','renang','Selesai 2','completed'),
        (${clubId},'2026-09-12','renang','Selesai 3','completed'),
        (${clubId},'2026-09-13','renang','Terjadwal','scheduled'),
        (${clubId},'2026-09-14','renang','Dibatalkan','cancelled'),
        (${clubId},'2026-08-31','renang','Bulan lalu','completed') returning id
    `;
    await harness.sql`
      insert into practice_attendance(club_id,practice_id,swimmer_id,status,meters_completed,on_roll) values
        (${clubId},${practices[0]!.id},${swimmerId},'hadir',1200,true),
        (${clubId},${practices[1]!.id},${swimmerId},'izin',null,true),
        (${clubId},${practices[2]!.id},${swimmerId},'belum',null,true),
        (${clubId},${practices[3]!.id},${swimmerId},'hadir',900,true),
        (${clubId},${practices[4]!.id},${swimmerId},'hadir',800,true),
        (${clubId},${practices[5]!.id},${swimmerId},'hadir',700,true)
    `;
    await harness.sql`
      insert into results(club_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,status,kind) values
        (${clubId},${swimmerId},'2026-08-20','bebas',50,'25',35000,'selesai','official'),
        (${clubId},${swimmerId},'2026-09-10','bebas',50,'25',34000,'selesai','official'),
        (${clubId},${swimmerId},'2026-09-11','bebas',50,'25',33000,'selesai','official'),
        (${clubId},${swimmerId},'2026-09-12','bebas',50,'50',36000,'selesai','official'),
        (${clubId},${swimmerId},'2026-09-13','bebas',50,'25',30000,'selesai','test'),
        (${clubId},${swimmerId},'2026-09-14','bebas',50,'25',29000,'dq','official')
    `;
    await harness.sql`
      insert into coach_feedback(club_id,swimmer_id,practice_title,practice_date,focus,status,created_by) values
        (${clubId},${swimmerId},'Selesai 1','2026-09-10','Dibagikan','shared','report-coach'),
        (${clubId},${swimmerId},'Selesai 2','2026-09-11','Rahasia','private','report-coach'),
        (${clubId},${swimmerId},'Selesai 3','2026-09-12','Ditarik','retracted','report-coach'),
        (${clubId},${swimmerId},'Bulan lalu','2026-08-31','Lama','shared','report-coach')
    `;
  });

  afterEach(async () => {
    await harness.sql.end?.();
  });

  test("uses finalized club records and comparable official times only", async () => {
    const report = await getMonthlyReport(harness.actor("report-guardian"), swimmerId, "2026-09");
    expect(report).toMatchObject({
      swimmerName: "Anak Satu",
      attended: 1,
      missed: 1,
      unrecorded: 1,
      meters: 1200,
      metersRecordedSessions: 1,
    });
    expect(report.officialTimes).toEqual([
      { stroke: "bebas", distanceM: 50, course: "25", timeMs: 33000, previousTimeMs: 35000 },
      { stroke: "bebas", distanceM: 50, course: "50", timeMs: 36000, previousTimeMs: null },
    ]);
    expect(report.feedback.map((note) => note.focus)).toEqual(["Dibagikan"]);
    const staffReport = await getMonthlyReport(harness.actor("report-coach"), swimmerId, "2026-09");
    expect(staffReport.feedback.map((note) => note.focus)).toEqual(["Dibagikan"]);
  });

  test("empty month has zeros and no invented time or feedback", async () => {
    const report = await getMonthlyReport(harness.actor("report-guardian"), swimmerId, "2026-07");
    expect(report).toMatchObject({
      attended: 0,
      missed: 0,
      unrecorded: 0,
      meters: 0,
      officialTimes: [],
      feedback: [],
    });
  });

  test("linked guardian and same-club scope are enforced", async () => {
    await expect(
      getMonthlyReport(harness.actor("report-other"), swimmerId, "2026-09"),
    ).rejects.toThrow("Perenang tidak ditemukan");
    await expect(
      getMonthlyReport(harness.actor("report-guardian"), otherSwimmerId, "2026-09"),
    ).rejects.toThrow("Perenang tidak ditemukan");
    await expect(
      getMonthlyReport(harness.actor("report-coach"), otherSwimmerId + 1, "2026-09"),
    ).rejects.toThrow("Perenang tidak ditemukan");
  });

  test("month input is strict and includes calendar boundaries", () => {
    expect(monthBounds("2026-01")).toEqual({
      start: "2026-01-01",
      previous: "2025-12-01",
      next: "2026-02-01",
    });
    expect(() => monthBounds("2026-13")).toThrow("Bulan tidak valid");
    expect(() => monthBounds("2026-1")).toThrow("Bulan tidak valid");
    expect(() => monthBounds("0000-01")).toThrow("Bulan tidak valid");
    expect(() => monthBounds("0099-12")).toThrow("Bulan tidak valid");
    expect(() => monthBounds("9999-12")).toThrow("Bulan tidak valid");
  });
});
