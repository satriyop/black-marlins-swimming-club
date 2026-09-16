import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { getRaceDay, saveHeatSheet } from "../src/lib/club/race-day";
import { saveMeetRecord } from "../src/lib/club/writes";

describe("race-day companion", () => {
  let harness: Awaited<ReturnType<typeof createClubHarness>>;
  let clubId: number;
  let meetId: number;
  let swimmerId: number;
  let otherSwimmerId: number;
  let entryId: number;

  beforeEach(async () => {
    harness = await createClubHarness();
    await harness.sql`
      insert into "user"(id,name,email,"emailVerified") values
        ('race-coach','Coach','race-coach@example.test',true),
        ('race-guardian','Guardian','race-guardian@example.test',true),
        ('race-other','Other','race-other@example.test',true),
        ('race-other-club-coach','Other coach','race-other-club@example.test',true)
    `;
    const clubs = await harness.sql<{ id: number }>`
      insert into clubs(name,short_name,city,province,coach_name) values
        ('Klub Satu','K1','Jakarta','DKI Jakarta','Coach'),
        ('Klub Dua','K2','Bandung','Jawa Barat','Coach') returning id
    `;
    clubId = clubs[0]!.id;
    await harness.sql`
      insert into club_staff(club_id,user_id,role) values
        (${clubId},'race-coach','coach'),(${clubs[1]!.id},'race-other-club-coach','coach')
    `;
    await harness.sql`
      insert into club_family(club_id,user_id) values
        (${clubId},'race-guardian'),(${clubId},'race-other')
    `;
    const swimmers = await harness.sql<{ id: number }>`
      insert into swimmers(club_id,full_name,date_of_birth,gender) values
        (${clubId},'Anak Satu','2013-01-01','putra'),
        (${clubId},'Anak Dua','2013-02-01','putri') returning id
    `;
    swimmerId = swimmers[0]!.id;
    otherSwimmerId = swimmers[1]!.id;
    await harness.sql`
      insert into guardians(user_id,swimmer_id) values
        ('race-guardian',${swimmerId}),('race-other',${otherSwimmerId})
    `;
    const meets = await harness.sql<{ id: number }>`
      insert into meets(club_id,name,level,course,start_date,end_date,status) values
        (${clubId},'Kejuaraan Satu','regional','25','2026-09-10','2026-09-11','rencana'),
        (${clubId},'Kejuaraan Lain','regional','25','2026-09-10',null,'rencana'),
        (${clubs[1]!.id},'Kejuaraan Klub Lain','regional','25','2026-09-10',null,'rencana') returning id
    `;
    meetId = meets[0]!.id;
    const entries = await harness.sql<{ id: number }>`
      insert into meet_entries(club_id,meet_id,swimmer_id,stroke,distance_m,registration_status) values
        (${clubId},${meetId},${swimmerId},'bebas',50,'confirmed'),
        (${clubId},${meetId},${swimmerId},'punggung',100,'proposed'),
        (${clubId},${meetId},${swimmerId},'dada',50,'withdrawn'),
        (${clubId},${meetId},${otherSwimmerId},'bebas',50,'confirmed') returning id
    `;
    entryId = entries[0]!.id;
    await harness.sql`
      insert into results(club_id,meet_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,status,kind,round) values
        (${clubId},${meetId},${swimmerId},'2026-09-10','bebas',50,'25',34000,'selesai','official','heat'),
        (${clubId},${meetId},${swimmerId},'2026-09-11','bebas',50,'25',33000,'selesai','official','final'),
        (${clubId},${meetId},${swimmerId},'2026-09-11','bebas',50,'25',32000,'selesai','test','tes'),
        (${clubId},${meetId},${swimmerId},'2026-09-11','bebas',50,'50',31000,'selesai','official','final'),
        (${clubId},${meets[1]!.id},${swimmerId},'2026-09-10','bebas',50,'25',30000,'selesai','official','final'),
        (${clubId},${meetId},${otherSwimmerId},'2026-09-10','bebas',50,'25',29000,'selesai','official','final'),
        (${clubId},${meetId},${swimmerId},'2026-09-11','bebas',50,'25',28000,'dq','official','final')
    `;
  });

  afterEach(async () => {
    await harness.sql.end?.();
  });

  test("guardian sees only linked active races and matching stored official results", async () => {
    const day = await getRaceDay(harness.actor("race-guardian"), meetId, swimmerId);
    expect(day.swimmer.name).toBe("Anak Satu");
    expect(day.canEditHeatSheet).toBe(false);
    expect(day.races.map((race) => race.registrationStatus)).toEqual(["confirmed", "proposed"]);
    expect(day.races[0]).toMatchObject({
      heat: null,
      lane: null,
      reportDate: null,
      reportTime: null,
    });
    expect(day.races[0]!.officialResults).toMatchObject([
      { timeMs: 34000, round: "heat", status: "selesai" },
      { timeMs: 33000, round: "final", status: "selesai" },
      { timeMs: null, round: "final", status: "dq" },
    ]);
    expect(day.races[1]!.officialResults).toEqual([]);
    await expect(getRaceDay(harness.actor("race-other"), meetId, swimmerId)).rejects.toThrow(
      "tidak ditemukan",
    );
    await expect(
      getRaceDay(harness.actor("race-guardian"), meetId, otherSwimmerId),
    ).rejects.toThrow("tidak ditemukan");
    await expect(
      getRaceDay(harness.actor("race-other-club-coach"), meetId, swimmerId),
    ).rejects.toThrow("tidak ditemukan");
    await harness.sql`delete from guardians where user_id='race-guardian' and swimmer_id=${swimmerId}`;
    await expect(getRaceDay(harness.actor("race-guardian"), meetId, swimmerId)).rejects.toThrow(
      "tidak ditemukan",
    );
  });

  test("staff edit is scoped, dated, and protected against stale writes", async () => {
    const input = {
      meetId,
      entryId,
      expectedRevision: 1,
      heat: "Seri 3",
      lane: 4,
      reportDate: "2026-09-11",
      reportTime: "07:45",
      warmupNote: "Pemanasan di kolam latihan",
    };
    await expect(saveHeatSheet(harness.actor("race-guardian"), input)).rejects.toThrow(
      "Hanya pelatih",
    );
    await expect(saveHeatSheet(harness.actor("race-other-club-coach"), input)).rejects.toThrow(
      "Kejuaraan tidak ditemukan",
    );
    await expect(
      saveHeatSheet(harness.actor("race-coach"), { ...input, reportDate: "2026-09-12" }),
    ).rejects.toThrow("Tanggal lapor harus pada hari kejuaraan");
    await expect(
      saveHeatSheet(harness.actor("race-coach"), { ...input, reportTime: null }),
    ).rejects.toThrow("Isi tanggal dan jam lapor bersama-sama");
    const saved = await saveHeatSheet(harness.actor("race-coach"), input);
    expect(saved.heatSheetRevision).toBe(2);
    await expect(saveHeatSheet(harness.actor("race-coach"), input)).rejects.toThrow(
      "sudah berubah",
    );
    const day = await getRaceDay(harness.actor("race-guardian"), meetId, swimmerId);
    expect(day.races[0]).toMatchObject({
      heat: "Seri 3",
      lane: 4,
      reportDate: "2026-09-11",
      reportTime: "07:45",
      warmupNote: "Pemanasan di kolam latihan",
    });
  });

  test("changing the meet context clears old heat-sheet fields", async () => {
    await saveHeatSheet(harness.actor("race-coach"), {
      meetId,
      entryId,
      expectedRevision: 1,
      heat: "Seri 3",
      lane: 4,
      reportDate: "2026-09-10",
      reportTime: "07:45",
      warmupNote: "Kolam A",
    });
    await saveMeetRecord(harness.actor("race-coach"), {
      id: meetId,
      name: "Kejuaraan Satu",
      level: "regional",
      course: "50",
      startDate: "2026-09-12",
      endDate: "2026-09-13",
      status: "rencana",
    });
    const day = await getRaceDay(harness.actor("race-guardian"), meetId, swimmerId);
    expect(day.races[0]).toMatchObject({
      heat: null,
      lane: null,
      reportDate: null,
      reportTime: null,
      warmupNote: null,
      heatSheetRevision: 3,
      officialResults: [],
    });
  });

  test("cancelled meets retain archive data but cannot be edited", async () => {
    await saveHeatSheet(harness.actor("race-coach"), {
      meetId,
      entryId,
      expectedRevision: 1,
      heat: "Seri 3",
      lane: 4,
      reportDate: "2026-09-10",
      reportTime: "07:45",
      warmupNote: null,
    });
    await saveMeetRecord(harness.actor("race-coach"), {
      id: meetId,
      name: "Kejuaraan Satu",
      level: "regional",
      course: "25",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      status: "batal",
    });
    const day = await getRaceDay(harness.actor("race-guardian"), meetId, swimmerId);
    expect(day.meet.status).toBe("batal");
    expect(day.canEditHeatSheet).toBe(false);
    expect(day.races[0]!.heat).toBe("Seri 3");
    await expect(
      saveHeatSheet(harness.actor("race-coach"), {
        meetId,
        entryId,
        expectedRevision: 2,
        heat: "Seri 4",
        lane: 5,
        reportDate: "2026-09-10",
        reportTime: "08:00",
        warmupNote: null,
      }),
    ).rejects.toThrow("Kejuaraan dibatalkan");
  });
});
