import { expect, test } from "vitest";
import {
  isRelay,
  nameMatches,
  normalizeAthleteHistoryRow,
  normalizeResultRow,
  parseEventDescr,
  parseSpectraDate,
} from "../scripts/spectra-athlete-parse.mjs";

// Real events_resultbyevent2.php rows captured via DevTools 2026-09-17
// (globiesoft.com/rlist_off, ?cevent=KRAPPROVBYL2026&ceventno=108&ckelumur=GROUP+2).
const WINNER_ROW = {
  id: "8928",
  nama: "LAUZAH BATRISYA AZZAHRA",
  lahir: "25 APRIL 2012",
  sex: "WOMEN",
  club: "TRI CAKTI SEMESTA SEMARANG",
  kode: "108",
  nomorkode: "E08",
  nomordescr: "200 M BREASTSTROKE WOMEN, LCM",
  jenis: "INDIVIDUAL",
  kelumur: "GROUP 2",
  note: "",
  hasilfinal: "03:05.70",
  urut3: "1",
  juara: "1",
  ket1: "",
  seri3: "Heat 04",
  lin3: "3",
  hasilseri: "_",
  seri1: "",
  lin1: "",
  urut1: "1000",
  hasiloff: "_",
  seri2: "",
  lin2: "",
  urut2: "1000",
};

const UNPLACED_ROW = {
  ...WINNER_ROW,
  id: "44188",
  nama: "ALYANDRA GENDHIS PANGESTU",
  lahir: "18 MAY 2011",
  club: "WIJAYA ATMAJA SWIMMING CLUB",
  hasilfinal: "04:07.27",
  urut3: "4",
  juara: "1000", // not top-3 -- the "unplaced" sentinel
  seri3: "Heat 02",
  lin3: "6",
};

test("parseSpectraDate converts DD MONTH YYYY to ISO", () => {
  expect(parseSpectraDate("25 APRIL 2012")).toBe("2012-04-25");
  expect(parseSpectraDate("18 MAY 2011")).toBe("2011-05-18");
});

test("parseSpectraDate returns null for unrecognized text", () => {
  expect(parseSpectraDate("")).toBeNull();
  expect(parseSpectraDate("not a date")).toBeNull();
});

test("parseEventDescr extracts distance, stroke, gender, course", () => {
  expect(parseEventDescr("200 M BREASTSTROKE WOMEN, LCM")).toEqual({
    distanceM: 200,
    stroke: "dada",
    gender: "putri",
    course: "50",
  });
  expect(parseEventDescr("50 M FREESTYLE MEN, LCM")).toEqual({
    distanceM: 50,
    stroke: "bebas",
    gender: "putra",
    course: "50",
  });
});

test("parseEventDescr handles the two-word Individual Medley stroke", () => {
  expect(parseEventDescr("200 M INDIVIDUAL MEDLEY MEN, LCM").stroke).toBe("ganti");
});

test("isRelay flags relay events for exclusion", () => {
  expect(isRelay({ jenis: "RELAY" })).toBe(true);
  expect(isRelay({ jenis: "INDIVIDUAL" })).toBe(false);
});

test("normalizeResultRow maps a placed swimmer's row", () => {
  const result = normalizeResultRow(WINNER_ROW, "KRAPPROVBYL2026");
  expect(result).toEqual({
    athleteId: "8928",
    fullName: "LAUZAH BATRISYA AZZAHRA",
    dateOfBirth: "2012-04-25",
    gender: "putri",
    club: "TRI CAKTI SEMESTA SEMARANG",
    meetCode: "KRAPPROVBYL2026",
    eventNumber: "108",
    ageGroup: "GROUP 2",
    distanceM: 200,
    stroke: "dada",
    course: "50",
    timeMs: 185700, // 3:05.70
    place: 1,
    heat: 4,
    lane: 3,
    notes: null,
  });
});

test("normalizeResultRow maps juara:1000 to place:null (not placed, not DQ)", () => {
  const result = normalizeResultRow(UNPLACED_ROW, "KRAPPROVBYL2026");
  expect(result.place).toBeNull();
  expect(result.timeMs).toBe(247270); // 4:07.27 -- still a real finishing time
});

test("normalizeResultRow rejects a row that doesn't look like events_resultbyevent2.php", () => {
  expect(() => normalizeResultRow({ foo: "bar" }, "X")).toThrow(/unexpected events_resultbyevent2\.php row shape/);
});

test("nameMatches is case/whitespace insensitive and allows substring recall", () => {
  expect(nameMatches("LAUZAH BATRISYA AZZAHRA", "lauzah batrisya azzahra")).toBe(true);
  expect(nameMatches("LAUZAH BATRISYA AZZAHRA", "Lauzah Batrisya")).toBe(true);
  expect(nameMatches("LUIGI  BANYU PAMUNGKAS", "Luigi Banyu Pamungkas")).toBe(true);
  expect(nameMatches("LAUZAH BATRISYA AZZAHRA", "Chyara Nayla")).toBe(false);
});

// Real athlete_time2.php rows captured via DevTools 2026-09-17
// (globiesoft.com/rlist_off, ?cid=43720&cprovince=&page=1).
const HISTORY_ROW_RANKED = {
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

const HISTORY_ROW_UNPLACED = {
  ...HISTORY_ROW_RANKED,
  kode: "KRAPPROVBYL2026",
  awal: "04 JULY 2026",
  hasil: "01:09.01",
  juara: "1000",
  kelumur: "GROUP 3",
  team: "BLACK MARLINS SWIMMING CLUB KLATEN",
  acara: "127",
  nomordescr: "100 M FREESTYLE MEN, LCM",
};

test("normalizeAthleteHistoryRow maps a placed result (kode is the meet code here)", () => {
  expect(normalizeAthleteHistoryRow(HISTORY_ROW_RANKED)).toEqual({
    meetCode: "POPDAJATENG2026",
    date: "2026-09-01",
    eventNumber: "101",
    ageGroup: "SD",
    club: "KAB. KLATEN",
    distanceM: 200,
    stroke: "bebas",
    course: "50",
    timeMs: 148360, // 2:28.36
    place: 2,
    notes: null,
  });
});

test("normalizeAthleteHistoryRow maps juara:1000 to an unplaced (not DQ) result", () => {
  const result = normalizeAthleteHistoryRow(HISTORY_ROW_UNPLACED);
  expect(result.place).toBeNull();
  expect(result.timeMs).toBe(69010); // 1:09.01 -- a real time despite no placement
  expect(result.club).toBe("BLACK MARLINS SWIMMING CLUB KLATEN");
});

test("normalizeAthleteHistoryRow rejects a row that doesn't look like athlete_time2.php", () => {
  expect(() => normalizeAthleteHistoryRow({ foo: "bar" })).toThrow(/unexpected athlete_time2\.php row shape/);
});
