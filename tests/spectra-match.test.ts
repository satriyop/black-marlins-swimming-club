import { expect, test, vi } from "vitest";
import { findSpectraMatches } from "../src/lib/club/spectra-match";

const RACES_MEET_A = [
  { kode: "101", nomordescr: "50 M FREESTYLE MEN, LCM", jenis: "INDIVIDUAL", kelumur: "GROUP 3" },
  { kode: "102", nomordescr: "50 M FREESTYLE WOMEN, LCM", jenis: "INDIVIDUAL", kelumur: "GROUP 3" },
  { kode: "103", nomordescr: "4X100 M FREESTYLE RELAY MEN, LCM", jenis: "RELAY", kelumur: "GROUP 3" },
];

test("finds a swimmer whose name and club both match", async () => {
  const fetchRaceList = vi.fn(async () => RACES_MEET_A);
  const fetchRaceResults = vi.fn(async (_meet: string, eventNumber: string) => {
    if (eventNumber !== "101") return [];
    return [
      {
        id: "43720",
        nama: "LUIGI BANYU PAMUNGKAS",
        lahir: "1 JANUARY 2014",
        sex: "MEN",
        club: "BLACK MARLINS SWIMMING CLUB KLATEN",
        kode: "101",
        kelumur: "GROUP 3",
        nomordescr: "50 M FREESTYLE MEN, LCM",
        hasilfinal: "00:31.76",
        juara: "7",
        seri3: "Heat 02",
        lin3: "4",
      },
    ];
  });

  const matches = await findSpectraMatches({
    fullName: "Luigi Banyu Pamungkas",
    gender: "putra",
    candidateMeetCodes: ["KRAPPROVBYL2026"],
    clubKeywords: ["Klaten", "Black Marlins"],
    fetchRaceList,
    fetchRaceResults,
  });

  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({ athleteId: "43720", fullName: "LUIGI BANYU PAMUNGKAS" });
  // Only the men's races should have been checked -- the women's race and the relay are skipped.
  expect(fetchRaceResults).toHaveBeenCalledTimes(1);
  expect(fetchRaceResults).toHaveBeenCalledWith("KRAPPROVBYL2026", "101", "GROUP 3");
});

test("a name match from a different club is not returned", async () => {
  const fetchRaceList = vi.fn(async () => RACES_MEET_A);
  const fetchRaceResults = vi.fn(async () => [
    {
      id: "99999",
      nama: "LUIGI BANYU PAMUNGKAS",
      lahir: "1 JANUARY 2014",
      sex: "MEN",
      club: "TRI CAKTI SEMESTA SEMARANG", // different club, same name
      kode: "101",
      kelumur: "GROUP 3",
      nomordescr: "50 M FREESTYLE MEN, LCM",
      hasilfinal: "00:31.76",
      juara: "3",
      seri3: "Heat 01",
      lin3: "2",
    },
  ]);

  const matches = await findSpectraMatches({
    fullName: "Luigi Banyu Pamungkas",
    gender: "putra",
    candidateMeetCodes: ["KRAPPROVBYL2026"],
    clubKeywords: ["Klaten"],
    fetchRaceList,
    fetchRaceResults,
  });

  expect(matches).toEqual([]);
});

test("stops checking further meets once a match is found", async () => {
  const fetchRaceList = vi.fn(async () => RACES_MEET_A);
  const fetchRaceResults = vi.fn(async (meetCode: string) =>
    meetCode === "MEET_ONE"
      ? [
          {
            id: "1",
            nama: "TEST SWIMMER",
            lahir: "1 JANUARY 2014",
            sex: "MEN",
            club: "BLACK MARLINS SWIMMING CLUB KLATEN",
            kode: "101",
            kelumur: "GROUP 3",
            nomordescr: "50 M FREESTYLE MEN, LCM",
            hasilfinal: "00:31.76",
            juara: "1",
            seri3: "Heat 01",
            lin3: "1",
          },
        ]
      : [],
  );

  const matches = await findSpectraMatches({
    fullName: "Test Swimmer",
    gender: "putra",
    candidateMeetCodes: ["MEET_ONE", "MEET_TWO"],
    clubKeywords: ["Klaten"],
    fetchRaceList,
    fetchRaceResults,
  });

  expect(matches).toHaveLength(1);
  // MEET_TWO's race list should never have been fetched once MEET_ONE matched.
  expect(fetchRaceList).toHaveBeenCalledTimes(1);
  expect(fetchRaceList).toHaveBeenCalledWith("MEET_ONE");
});

test("no match found (unknown swimmer) returns an empty array, ready for manual fallback", async () => {
  const fetchRaceList = vi.fn(async () => RACES_MEET_A);
  const fetchRaceResults = vi.fn(async () => []);

  const matches = await findSpectraMatches({
    fullName: "Nobody In Particular",
    gender: "putri",
    candidateMeetCodes: ["MEET_ONE"],
    clubKeywords: ["Klaten"],
    fetchRaceList,
    fetchRaceResults,
  });

  expect(matches).toEqual([]);
});

test("a flaky/failed race-list fetch for one meet doesn't stop the search moving to the next meet", async () => {
  const fetchRaceList = vi.fn(async (meetCode: string) => (meetCode === "FLAKY_MEET" ? [] : RACES_MEET_A));
  const fetchRaceResults = vi.fn(async () => [
    {
      id: "1",
      nama: "TEST SWIMMER",
      lahir: "1 JANUARY 2014",
      sex: "MEN",
      club: "BLACK MARLINS SWIMMING CLUB KLATEN",
      kode: "101",
      kelumur: "GROUP 3",
      nomordescr: "50 M FREESTYLE MEN, LCM",
      hasilfinal: "00:31.76",
      juara: "1",
      seri3: "Heat 01",
      lin3: "1",
    },
  ]);

  const matches = await findSpectraMatches({
    fullName: "Test Swimmer",
    gender: "putra",
    candidateMeetCodes: ["FLAKY_MEET", "GOOD_MEET"],
    clubKeywords: ["Klaten"],
    fetchRaceList,
    fetchRaceResults,
  });

  expect(matches).toHaveLength(1);
});

test("gives up once the wall-clock budget is spent, rather than checking every race", async () => {
  // 20 candidate races, each individually fast and well-formed (not flaky) --
  // this is the realistic "brand new swimmer, never competed" case, which by
  // definition never finds a match and would otherwise exhaust the full
  // search space every single time it's used.
  const races = Array.from({ length: 20 }, (_, i) => ({
    kode: String(101 + i),
    nomordescr: "50 M FREESTYLE MEN, LCM",
    jenis: "INDIVIDUAL",
    kelumur: "GROUP 1",
  }));
  const fetchRaceList = vi.fn(async () => races);
  const fetchRaceResults = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
    return []; // never matches -- every race gets checked unless the deadline stops it
  });

  const matches = await findSpectraMatches({
    fullName: "Nobody In Particular",
    gender: "putra",
    candidateMeetCodes: ["MEET_ONE"],
    clubKeywords: ["Klaten"],
    fetchRaceList,
    fetchRaceResults,
    maxWallClockMs: 40, // tiny budget -- only a handful of the 20 races fit
  });

  expect(matches).toEqual([]);
  expect(fetchRaceResults.mock.calls.length).toBeLessThan(20);
  expect(fetchRaceResults.mock.calls.length).toBeGreaterThan(0);
});
