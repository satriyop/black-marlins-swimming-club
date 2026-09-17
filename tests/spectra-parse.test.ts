import { expect, test } from "vitest";
import {
  diffAgainstSnapshot,
  inRegion,
  mapLevel,
  mapStatus,
  meetFieldsFromEvent,
  normalizeEventRow,
} from "../scripts/spectra-parse.mjs";

// Real events_list.php rows captured via DevTools 2026-09-17 (globiesoft.com/rlist_off).
const RAW_ROWS = [
  {
    kode: "WALKOTMGL2026",
    nama: "Grand KRAPPROV FAI Jateng tahun 2026",
    awal: "2026-11-13",
    akhir: "2026-11-15",
    periode: "13 - 15 NOVEMBER 2026",
    tempat: "MAGELANG",
    lokasi: "Samapta Aquatic Stadium, Kota Magelang",
    status: "REGISTRATION",
    pakaidata: "NATIONAL",
    sport: "SWIMMING",
    register: "YES",
  },
  {
    kode: "KRASBMSV2026",
    nama: "KRAS Piala Bupati Banyumas Tahun 2026",
    awal: "2026-08-28",
    akhir: "2026-08-30",
    periode: "28 - 30 AUGUST 2026",
    tempat: "BANYUMAS",
    lokasi: "Kolam Renang Tirta Kembar Banyumas",
    status: "CLOSED",
    pakaidata: "JAWA TENGAH",
    sport: "SWIMMING",
    register: "NO",
  },
  {
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
  },
  {
    kode: "KRAPPANTURA2026",
    nama: "KRAP Pantura Jawa Tengah tahun 2026",
    awal: "2026-08-23",
    akhir: "2026-08-23",
    periode: "23 - 23 AUGUST 2026",
    tempat: "TEGAL",
    lokasi: "Kolam Renang Tegal Waterpark",
    status: "CLOSED",
    pakaidata: "NATIONAL",
    sport: "SWIMMING",
    register: "YES",
  },
];

test("normalizeEventRow maps the real field names", () => {
  const event = normalizeEventRow(RAW_ROWS[0]);
  expect(event).toEqual({
    code: "WALKOTMGL2026",
    name: "Grand KRAPPROV FAI Jateng tahun 2026",
    startDate: "2026-11-13",
    endDate: "2026-11-15",
    venue: "Samapta Aquatic Stadium, Kota Magelang",
    cityHint: "MAGELANG",
    status: "REGISTRATION",
    scope: "NATIONAL",
    registeredOnly: true,
  });
});

test("normalizeEventRow rejects a row that doesn't look like events_list.php", () => {
  expect(() => normalizeEventRow({ foo: "bar" })).toThrow(/unexpected events_list\.php row shape/);
});

test("inRegion trusts an explicit Jawa Tengah scope tag", () => {
  const event = normalizeEventRow(RAW_ROWS[1]);
  expect(inRegion(event)).toBe(true);
});

test("inRegion falls back to a city/venue keyword when scope says NATIONAL", () => {
  // KRAP Pantura is tagged NATIONAL but is unmistakably a Jateng (Tegal) meet.
  const event = normalizeEventRow(RAW_ROWS[3]);
  expect(event.scope).toBe("NATIONAL");
  expect(inRegion(event)).toBe(true);
});

test("inRegion excludes an out-of-region NATIONAL meet", () => {
  const event = normalizeEventRow(RAW_ROWS[2]);
  expect(inRegion(event)).toBe(false);
});

test("mapLevel recognizes KRAPPROV/PORPROV as provincial", () => {
  expect(mapLevel("Grand KRAPPROV FAI Jateng tahun 2026")).toBe("pengprov");
  expect(mapLevel("PEKAN OLAHRAGA PROVINSI (PORPROV) XVI JAWA TENGAH 2023")).toBe("pengprov");
});

test("mapLevel recognizes KRAS/Bupati/Walikota as kabupaten-level", () => {
  expect(mapLevel("KRAS Piala Bupati Banyumas Tahun 2026")).toBe("pengcab");
  expect(mapLevel("Walikota Cup XIII tahun 2026 Yogyakarta")).toBe("pengcab");
});

test("mapLevel recognizes school competitions", () => {
  expect(mapLevel("PEKAN OLAHRAGA PELAJAR DAERAH TINGKAT JAWA TENGAH 2026")).toBe("sekolah");
});

test("mapLevel defaults to pengcab for an unrecognized name", () => {
  expect(mapLevel("Kejuaraan Renang Athirah Swimming Cup 2026")).toBe("pengcab");
});

test("mapStatus maps Spectra's three observed statuses", () => {
  expect(mapStatus("REGISTRATION")).toBe("rencana");
  expect(mapStatus("RUNNING")).toBe("berlangsung");
  expect(mapStatus("CLOSED")).toBe("selesai");
});

test("meetFieldsFromEvent produces the meets-table field set", () => {
  const event = normalizeEventRow(RAW_ROWS[0]);
  expect(meetFieldsFromEvent(event)).toEqual({
    name: "Grand KRAPPROV FAI Jateng tahun 2026",
    level: "pengprov",
    venue: "Samapta Aquatic Stadium, Kota Magelang",
    startDate: "2026-11-13",
    endDate: "2026-11-15",
    status: "rencana",
  });
});

test("diffAgainstSnapshot: first sync (no snapshot) never conflicts", () => {
  const local = { status: "rencana" };
  const incoming = { status: "berlangsung" };
  const { autoApply, conflicts } = diffAgainstSnapshot(local, null, incoming, ["status"]);
  expect(autoApply).toEqual({ status: "berlangsung" });
  expect(conflicts).toEqual([]);
});

test("diffAgainstSnapshot: local unchanged since last sync -> auto-applies incoming", () => {
  const snapshot = { status: "rencana" };
  const local = { status: "rencana" }; // coach hasn't touched it
  const incoming = { status: "berlangsung" }; // Spectra moved it to running
  const { autoApply, conflicts } = diffAgainstSnapshot(local, snapshot, incoming, ["status"]);
  expect(autoApply).toEqual({ status: "berlangsung" });
  expect(conflicts).toEqual([]);
});

test("diffAgainstSnapshot: local edited since last sync -> conflict, not overwritten", () => {
  const snapshot = { status: "rencana" };
  const local = { status: "batal" }; // coach manually cancelled it
  const incoming = { status: "berlangsung" }; // Spectra says it's running
  const { autoApply, conflicts } = diffAgainstSnapshot(local, snapshot, incoming, ["status"]);
  expect(autoApply).toEqual({});
  expect(conflicts).toEqual([{ field: "status", localValue: "batal", incomingValue: "berlangsung" }]);
});

test("diffAgainstSnapshot: local edited but now agrees with incoming -> no conflict", () => {
  const snapshot = { venue: "Kolam A" };
  const local = { venue: "Kolam B" };
  const incoming = { venue: "Kolam B" };
  const { autoApply, conflicts } = diffAgainstSnapshot(local, snapshot, incoming, ["venue"]);
  expect(autoApply).toEqual({});
  expect(conflicts).toEqual([]);
});
