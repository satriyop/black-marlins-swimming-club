import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { syncSpectraResultsForSwimmer } from "../src/lib/club/spectra-results-sync";

const HISTORY_ROW = {
  kode: "POPDAJATENG2026",
  awal: "01 SEPTEMBER 2026",
  nomorkode: "A07",
  nomordescr: "200 M FREESTYLE MEN, LCM",
  jenis: "INDIVIDUAL",
  note: "",
  hasil: "02:28.36",
  pakaidata: "JAWA TENGAH",
  urut3: "2",
  juara: "2",
  kelumur: "SD",
  team: "KAB. KLATEN",
  acara: "101",
};

const RELAY_ROW = { ...HISTORY_ROW, jenis: "RELAY", acara: "117" };
const DNS_ROW = { ...HISTORY_ROW, hasil: "_", acara: "999" };

async function seedClubAndSwimmer(sql: ReturnType<typeof createClubHarness> extends Promise<infer T> ? T["sql"] : never) {
  await sql.query(
    `insert into clubs (name, short_name, city, province, coach_name)
     values ('Black Marlins Swimming Club', 'BMSC', 'Klaten', 'Jawa Tengah', 'Coach')`,
  );
  const club = await sql.query<{ id: number }>("select id from clubs limit 1");
  const swimmer = await sql.query<{ id: number }>(
    `insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status, spectra_athlete_id)
     values ($1, 'Test Swimmer', '2013-01-01', 'putra', 'Indonesia', 'aktif', '43720') returning id`,
    [club[0].id],
  );
  return { clubId: club[0].id, swimmerId: swimmer[0].id };
}

async function seedSyncedMeet(sql: Awaited<ReturnType<typeof createClubHarness>>["sql"], clubId: number, spectraCode: string) {
  await sql.query(
    `insert into meets (club_id, name, level, course, start_date, status, spectra_event_code)
     values ($1, 'POPDA Jateng 2026', 'sekolah', '50', '2026-09-01', 'selesai', $2)`,
    [clubId, spectraCode],
  );
}

test("imports a new result for an already-matched swimmer, skipping relays and DNS rows", async () => {
  const { sql, actor } = await createClubHarness();
  const { clubId, swimmerId } = await seedClubAndSwimmer(sql);
  await seedSyncedMeet(sql, clubId, "POPDAJATENG2026");

  const stats = await syncSpectraResultsForSwimmer(
    { ...actor("usr_coach"), clubId },
    { swimmerId, athleteId: "43720" },
    { fetchAthleteHistory: async () => [HISTORY_ROW, RELAY_ROW, DNS_ROW] },
  );

  expect(stats).toEqual({ total: 3, inserted: 1, skippedNoMeet: 0, skippedNoTime: 1, skippedUnrecognized: 0, skippedDuplicate: 0 });

  const results = await sql.query<{
    stroke: string;
    distance_m: number;
    time_ms: number;
    place: number;
    is_pb: boolean;
    spectra_result_ref: string;
  }>("select stroke, distance_m, time_ms, place, is_pb, spectra_result_ref from results where club_id = $1", [clubId]);
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    stroke: "bebas",
    distance_m: 200,
    time_ms: 148360,
    place: 2,
    is_pb: true,
    spectra_result_ref: "43720:POPDAJATENG2026:101",
  });
});

test("re-running is a no-op (idempotent via spectra_result_ref)", async () => {
  const { sql, actor } = await createClubHarness();
  const { clubId, swimmerId } = await seedClubAndSwimmer(sql);
  await seedSyncedMeet(sql, clubId, "POPDAJATENG2026");
  const bound = { ...actor("usr_coach"), clubId };
  const fetchAthleteHistory = async () => [HISTORY_ROW];

  await syncSpectraResultsForSwimmer(bound, { swimmerId, athleteId: "43720" }, { fetchAthleteHistory });
  const second = await syncSpectraResultsForSwimmer(bound, { swimmerId, athleteId: "43720" }, { fetchAthleteHistory });

  expect(second.inserted).toBe(0);
  expect(second.skippedDuplicate).toBe(1);
  const results = await sql.query("select id from results where club_id = $1", [clubId]);
  expect(results).toHaveLength(1);
});

test("a result whose meet was never synced locally (out of region) is skipped, not fabricated", async () => {
  const { sql, actor } = await createClubHarness();
  const { clubId, swimmerId } = await seedClubAndSwimmer(sql);
  // No meets seeded at all.

  const stats = await syncSpectraResultsForSwimmer(
    { ...actor("usr_coach"), clubId },
    { swimmerId, athleteId: "43720" },
    { fetchAthleteHistory: async () => [HISTORY_ROW] },
  );

  expect(stats).toEqual({ total: 1, inserted: 0, skippedNoMeet: 1, skippedNoTime: 0, skippedUnrecognized: 0, skippedDuplicate: 0 });
  const results = await sql.query("select id from results where club_id = $1", [clubId]);
  expect(results).toHaveLength(0);
});
