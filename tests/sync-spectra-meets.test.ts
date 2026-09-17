import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { syncSpectraMeets } from "../scripts/sync-spectra-meets.mjs";

const JATENG_EVENT = {
  kode: "KRASBMSV2026",
  nama: "KRAS Piala Bupati Banyumas Tahun 2026",
  awal: "2026-08-28",
  akhir: "2026-08-30",
  periode: "28 - 30 AUGUST 2026",
  tempat: "BANYUMAS",
  lokasi: "Kolam Renang Tirta Kembar Banyumas",
  status: "REGISTRATION",
  pakaidata: "JAWA TENGAH",
  sport: "SWIMMING",
  register: "NO",
};

const OUT_OF_REGION_EVENT = {
  kode: "FTCHAMSACRAMENTO26",
  nama: "2026 FUTURE CHAMPIONSHIPS - SACRAMENTO",
  awal: "2026-07-29",
  akhir: "2026-08-02",
  periode: "29 - 02 AUGUST 2026",
  tempat: "CALIFORNIA",
  lokasi: "Nort Natomas Aquatic Center, Sacramento, CA - US",
  status: "CLOSED",
  pakaidata: "NATIONAL",
  sport: "SWIMMING",
  register: "NO",
};

async function seedClubRow(query: (text: string, params?: unknown[]) => Promise<unknown[]>) {
  await query(
    `insert into clubs (name, short_name, city, province, coach_name)
     values ('Black Marlins Swimming Club', 'BMSC', 'Klaten', 'Jawa Tengah', 'Coach')`,
  );
}

test("first sync inserts an in-region meet and skips an out-of-region one", async () => {
  const { sql } = await createClubHarness();
  await seedClubRow(sql.query);

  const stats = await syncSpectraMeets(sql.query, {
    fetchEvents: async () => [JATENG_EVENT, OUT_OF_REGION_EVENT],
  });

  expect(stats).toEqual({ total: 1, inserted: 1, updated: 0, conflicted: 0, unchanged: 0 });

  const rows = await sql.query<{
    name: string;
    level: string;
    status: string;
    spectra_event_code: string;
  }>("select name, level, status, spectra_event_code from meets");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: "KRAS Piala Bupati Banyumas Tahun 2026",
    level: "pengcab",
    status: "rencana",
    spectra_event_code: "KRASBMSV2026",
  });
});

test("re-sync with no upstream change is a no-op", async () => {
  const { sql } = await createClubHarness();
  await seedClubRow(sql.query);
  const fetchEvents = async () => [JATENG_EVENT];

  await syncSpectraMeets(sql.query, { fetchEvents });
  const second = await syncSpectraMeets(sql.query, { fetchEvents });

  expect(second).toEqual({ total: 1, inserted: 0, updated: 0, conflicted: 0, unchanged: 1 });
});

test("re-sync auto-applies an upstream change when local hasn't drifted", async () => {
  const { sql } = await createClubHarness();
  await seedClubRow(sql.query);

  await syncSpectraMeets(sql.query, { fetchEvents: async () => [JATENG_EVENT] });

  const running = { ...JATENG_EVENT, status: "RUNNING" };
  const stats = await syncSpectraMeets(sql.query, { fetchEvents: async () => [running] });

  expect(stats).toEqual({ total: 1, inserted: 0, updated: 1, conflicted: 0, unchanged: 0 });
  const rows = await sql.query<{ status: string }>("select status from meets");
  expect(rows[0].status).toBe("berlangsung");
});

test("a coach's manual edit blocks the next sync from overwriting it, and is flagged instead", async () => {
  const { sql } = await createClubHarness();
  await seedClubRow(sql.query);

  await syncSpectraMeets(sql.query, { fetchEvents: async () => [JATENG_EVENT] });

  // Coach manually cancels the meet after it synced.
  await sql.query("update meets set status = 'batal' where spectra_event_code = $1", [JATENG_EVENT.kode]);

  const running = { ...JATENG_EVENT, status: "RUNNING" };
  const stats = await syncSpectraMeets(sql.query, { fetchEvents: async () => [running] });

  expect(stats).toEqual({ total: 1, inserted: 0, updated: 0, conflicted: 1, unchanged: 0 });

  const meetRow = await sql.query<{ status: string }>("select status from meets");
  expect(meetRow[0].status).toBe("batal"); // untouched

  const conflicts = await sql.query<{
    field_name: string;
    local_value: string;
    incoming_value: string;
    resolved_at: string | null;
  }>("select field_name, local_value, incoming_value, resolved_at from sync_conflicts");
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0]).toMatchObject({
    field_name: "status",
    local_value: "batal",
    incoming_value: "berlangsung",
    resolved_at: null,
  });
});

test("once a coach dismisses a conflict (keeps local), the same incoming value isn't re-raised", async () => {
  const { sql } = await createClubHarness();
  await seedClubRow(sql.query);

  await syncSpectraMeets(sql.query, { fetchEvents: async () => [JATENG_EVENT] });
  await sql.query("update meets set status = 'batal' where spectra_event_code = $1", [JATENG_EVENT.kode]);

  const running = { ...JATENG_EVENT, status: "RUNNING" };
  await syncSpectraMeets(sql.query, { fetchEvents: async () => [running] });

  // Coach reviews and picks "keep local" -- simulate what resolveSyncConflict does.
  await sql.query(
    "update sync_conflicts set resolved_at = now(), resolution = 'kept_local' where field_name = 'status'",
  );

  // Same upstream value again on the next run: should not re-raise.
  const second = await syncSpectraMeets(sql.query, { fetchEvents: async () => [running] });
  expect(second).toEqual({ total: 1, inserted: 0, updated: 0, conflicted: 0, unchanged: 1 });
  const openConflicts = await sql.query("select id from sync_conflicts where resolved_at is null");
  expect(openConflicts).toHaveLength(0);

  // Upstream changes to something new: that's fresh information, should raise again.
  const closed = { ...JATENG_EVENT, status: "CLOSED" };
  const third = await syncSpectraMeets(sql.query, { fetchEvents: async () => [closed] });
  expect(third).toEqual({ total: 1, inserted: 0, updated: 0, conflicted: 1, unchanged: 0 });
  const reopened = await sql.query<{ incoming_value: string }>(
    "select incoming_value from sync_conflicts where resolved_at is null",
  );
  expect(reopened[0].incoming_value).toBe("selesai");
});

test("a meet the coach created manually (no spectra_event_code) is left alone entirely", async () => {
  const { sql } = await createClubHarness();
  await seedClubRow(sql.query);
  const club = await sql.query<{ id: number }>("select id from clubs limit 1");
  await sql.query(
    `insert into meets (club_id, name, level, course, start_date, status)
     values ($1, 'Latihan bersama internal', 'klub', '25', '2026-06-01', 'rencana')`,
    [club[0].id],
  );

  await syncSpectraMeets(sql.query, { fetchEvents: async () => [JATENG_EVENT] });

  const rows = await sql.query<{ name: string; spectra_event_code: string | null }>(
    "select name, spectra_event_code from meets order by name",
  );
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.name === "Latihan bersama internal")?.spectra_event_code).toBeNull();
});

test("two overlapping sync runs for the same new meet don't crash each other (ON CONFLICT DO NOTHING)", async () => {
  const { sql } = await createClubHarness();
  await seedClubRow(sql.query);

  // Both calls' internal SELECT-then-INSERT sequences interleave via the
  // microtask queue even though PGlite has one connection -- this is the
  // same race an overlapping cron tick or a manual re-run mid-flight would
  // hit against real Postgres, per the docstring in sync-spectra-meets.mjs.
  const [a, b] = await Promise.all([
    syncSpectraMeets(sql.query, { fetchEvents: async () => [JATENG_EVENT] }),
    syncSpectraMeets(sql.query, { fetchEvents: async () => [JATENG_EVENT] }),
  ]);

  // Exactly one of the two runs actually inserted the row; the other saw
  // ON CONFLICT DO NOTHING and correctly didn't count it as inserted.
  expect(a.inserted + b.inserted).toBe(1);
  const rows = await sql.query("select id from meets where spectra_event_code = $1", [JATENG_EVENT.kode]);
  expect(rows).toHaveLength(1);
});
