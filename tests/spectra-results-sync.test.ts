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
const UNPARSEABLE_DATE_ROW = { ...HISTORY_ROW, awal: "not a date", acara: "888" };
const SECOND_EVENT_ROW = {
  ...HISTORY_ROW,
  nomorkode: "A01",
  nomordescr: "50 M FREESTYLE MEN, LCM",
  hasil: "00:31.76",
  acara: "113",
};

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

test("a result lands on the linked club's meet copy and not the other club's", async () => {
  const { sql, actor } = await createClubHarness();
  const clubs = await sql.query<{ id: number }>(
    `insert into clubs (name, short_name, city, province, coach_name, slug, sport)
     values
      ('Black Marlins', 'BMSC', 'Klaten', 'Jawa Tengah', 'Coach', 'bmsc', 'renang'),
      ('Apta', 'Apta', 'Klaten', 'Jawa Tengah', 'Ketua', 'apta', 'renang')
     returning id`,
  );
  const bmsc = clubs[0]!.id;
  const apta = clubs[1]!.id;
  await seedSyncedMeet(sql, bmsc, "POPDAJATENG2026");
  await seedSyncedMeet(sql, apta, "POPDAJATENG2026");
  const swimmers = await sql.query<{ id: number }>(
    `insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status, spectra_athlete_id)
     values
      ($1, 'Bima Marlin', '2013-01-01', 'putra', 'Indonesia', 'aktif', '43720'),
      ($2, 'Alya Apta', '2013-01-01', 'putri', 'Indonesia', 'aktif', '43720')
     returning id`,
    [bmsc, apta],
  );

  await syncSpectraResultsForSwimmer(
    { ...actor("usr_coach"), clubId: apta },
    { swimmerId: swimmers[1]!.id, athleteId: "43720" },
    { fetchAthleteHistory: async () => [HISTORY_ROW] },
  );

  const rows = await sql.query<{ slug: string; n: number }>(
    `select c.slug, count(r.id)::int as n
     from clubs c left join results r on r.club_id = c.id
     group by c.slug order by c.slug`,
  );
  expect(rows.map((row) => ({ slug: row.slug, n: Number(row.n) }))).toEqual([
    { slug: "apta", n: 1 },
    { slug: "bmsc", n: 0 },
  ]);
  const linked = await sql.query<{ slug: string; spectra_athlete_id: string | null }>(
    `select c.slug, s.spectra_athlete_id
     from swimmers s join clubs c on c.id = s.club_id
     order by c.slug`,
  );
  expect(linked).toEqual([
    { slug: "apta", spectra_athlete_id: "43720" },
    { slug: "bmsc", spectra_athlete_id: "43720" },
  ]);
});

test("imports a new result for an already-matched swimmer, skipping relays and DNS rows", async () => {
  const { sql, actor } = await createClubHarness();
  const { clubId, swimmerId } = await seedClubAndSwimmer(sql);
  await seedSyncedMeet(sql, clubId, "POPDAJATENG2026");

  const stats = await syncSpectraResultsForSwimmer(
    { ...actor("usr_coach"), clubId },
    { swimmerId, athleteId: "43720" },
    { fetchAthleteHistory: async () => [HISTORY_ROW, RELAY_ROW, DNS_ROW] },
  );

  expect(stats).toEqual({
    total: 3,
    inserted: 1,
    skippedNoMeet: 0,
    skippedNoTime: 1,
    skippedNoDate: 0,
    skippedUnrecognized: 0,
    skippedDuplicate: 0,
  });

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

test("empty athlete history reports an upstream failure instead of a successful zero-result sync", async () => {
  const { sql, actor } = await createClubHarness();
  const { clubId, swimmerId } = await seedClubAndSwimmer(sql);

  await expect(
    syncSpectraResultsForSwimmer(
      { ...actor("usr_coach"), clubId },
      { swimmerId, athleteId: "43720" },
      { fetchAthleteHistory: async () => [] },
    ),
  ).rejects.toThrow("Spectra SwimPro sedang tidak mengirim data");
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

  expect(stats).toEqual({
    total: 1,
    inserted: 0,
    skippedNoMeet: 1,
    skippedNoTime: 0,
    skippedNoDate: 0,
    skippedUnrecognized: 0,
    skippedDuplicate: 0,
  });
  const results = await sql.query("select id from results where club_id = $1", [clubId]);
  expect(results).toHaveLength(0);
});

test("a row with an unparseable date is skipped, not inserted with a null result_date", async () => {
  const { sql, actor } = await createClubHarness();
  const { clubId, swimmerId } = await seedClubAndSwimmer(sql);
  await seedSyncedMeet(sql, clubId, "POPDAJATENG2026");

  const stats = await syncSpectraResultsForSwimmer(
    { ...actor("usr_coach"), clubId },
    { swimmerId, athleteId: "43720" },
    { fetchAthleteHistory: async () => [UNPARSEABLE_DATE_ROW] },
  );

  expect(stats).toEqual({
    total: 1,
    inserted: 0,
    skippedNoMeet: 0,
    skippedNoTime: 0,
    skippedNoDate: 1,
    skippedUnrecognized: 0,
    skippedDuplicate: 0,
  });
  const results = await sql.query("select id from results where club_id = $1", [clubId]);
  expect(results).toHaveLength(0);
});

test("PB is recomputed once per (stroke, distance, course) group, not once per inserted row", async () => {
  const { sql, actor } = await createClubHarness();
  const { clubId, swimmerId } = await seedClubAndSwimmer(sql);
  await seedSyncedMeet(sql, clubId, "POPDAJATENG2026");

  // Two rows in the SAME event (200 free) plus one in a different event (50
  // free) -- refreshPbFlag should run twice total, not three times.
  const secondSameEvent = { ...HISTORY_ROW, kode: "KRAPPROVBYL2026", acara: "201", hasil: "02:20.00" };
  await sql.query(
    `insert into meets (club_id, name, level, course, start_date, status, spectra_event_code)
     values ($1, 'KRAPPROV 2026', 'pengprov', '50', '2026-07-04', 'selesai', 'KRAPPROVBYL2026')`,
    [clubId],
  );

  const stats = await syncSpectraResultsForSwimmer(
    { ...actor("usr_coach"), clubId },
    { swimmerId, athleteId: "43720" },
    { fetchAthleteHistory: async () => [HISTORY_ROW, secondSameEvent, SECOND_EVENT_ROW] },
  );

  expect(stats.inserted).toBe(3);
  const pbs = await sql.query<{ distance_m: number; is_pb: boolean; time_ms: number }>(
    "select distance_m, is_pb, time_ms from results where club_id = $1 and is_pb = true order by distance_m",
    [clubId],
  );
  // The faster of the two 200-free rows is the PB; the lone 50-free row is its own PB.
  expect(pbs).toHaveLength(2);
  expect(pbs.find((p) => p.distance_m === 200)?.time_ms).toBe(140000); // 2:20.00
  expect(pbs.find((p) => p.distance_m === 50)?.time_ms).toBe(31760); // 0:31.76
});
