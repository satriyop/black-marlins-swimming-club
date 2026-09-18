import { afterEach, expect, test, vi } from "vitest";
import {
  fetchAthletesByNameLive,
  findSpectraMatches,
  spectraNameSearchUrl,
  spectraNameSearchTerms,
} from "../src/lib/club/spectra-match";
import { resetSpectraKeyCache } from "../src/lib/server/spectra-key.server";

const LUIGI = {
  id: "43720",
  name: "LUIGI BANYU PAMUNGKAS",
  lahir: "1 JANUARY 2014",
  sex: "MEN",
  team: "BLACK MARLINS SWIMMING CLUB KLATEN",
};

afterEach(() => {
  resetSpectraKeyCache();
});

test("a missing API key is an error, never a completed search with no match", async () => {
  // Spectra answer a keyless request with 200 [], which retryEmpty:false would
  // otherwise pass through as "this swimmer is not in Spectra" -- the exact
  // failure the API-key work removed. This must stay loud.
  const saved = process.env.SPECTRA_API_KEY;
  const savedFile = process.env.SPECTRA_ENV_FILE;
  delete process.env.SPECTRA_API_KEY;
  delete process.env.SPECTRA_ENV_FILE;
  resetSpectraKeyCache();

  try {
    await expect(fetchAthletesByNameLive("MEET_ONE", "Luigi Banyu Pamungkas", 1)).rejects.toThrow(
      "SPECTRA_API_KEY",
    );
  } finally {
    if (saved !== undefined) process.env.SPECTRA_API_KEY = saved;
    if (savedFile !== undefined) process.env.SPECTRA_ENV_FILE = savedFile;
    resetSpectraKeyCache();
  }
});

test("builds the direct result-by-name URL with an explicit page", () => {
  expect(spectraNameSearchUrl("MEET/2026", " Luigi Banyu ", 2)).toBe(
    "https://globiesoft.com/rlist_off/php/events_resultbyname.php?csearch=Luigi%20Banyu&cevent=MEET%2F2026&page=2",
  );
});

test("uses distinctive single-word terms because Spectra rejects multi-word searches", () => {
  expect(spectraNameSearchTerms(" Luigi Banyu Pamungkas ")).toEqual([
    "Pamungkas",
    "Luigi",
    "Banyu",
  ]);
});

test("finds and normalizes a swimmer whose name, gender, and club match", async () => {
  const fetchAthletesByName = vi.fn(async () => [LUIGI]);

  await expect(
    findSpectraMatches({
      fullName: "Luigi Banyu Pamungkas",
      gender: "putra",
      candidateMeetCodes: ["KRAPPROVBYL2026"],
      clubKeywords: ["Klaten", "Black Marlins"],
      fetchAthletesByName,
    }),
  ).resolves.toEqual([
    {
      athleteId: "43720",
      fullName: "LUIGI BANYU PAMUNGKAS",
      dateOfBirth: "2014-01-01",
      gender: "putra",
      club: "BLACK MARLINS SWIMMING CLUB KLATEN",
    },
  ]);
  expect(fetchAthletesByName).toHaveBeenCalledWith("KRAPPROVBYL2026", "Pamungkas", 1);
});

test("filters same-name swimmers from another club or gender", async () => {
  const fetchAthletesByName = vi.fn(async () => [
    { ...LUIGI, id: "1", team: "OTHER CLUB" },
    { ...LUIGI, id: "2", sex: "WOMEN" },
  ]);

  await expect(
    findSpectraMatches({
      fullName: "Luigi Banyu Pamungkas",
      gender: "putra",
      candidateMeetCodes: ["MEET_ONE"],
      clubKeywords: ["Klaten"],
      fetchAthletesByName,
    }),
  ).resolves.toEqual([]);
});

test("an empty successful search moves to the next meet without retrying pages", async () => {
  const fetchAthletesByName = vi.fn(async (meetCode: string) =>
    meetCode === "MEET_ONE" ? [] : [LUIGI],
  );

  const matches = await findSpectraMatches({
    fullName: "Luigi Banyu Pamungkas",
    gender: "putra",
    candidateMeetCodes: ["MEET_ONE", "MEET_TWO", "MEET_THREE"],
    clubKeywords: ["Klaten"],
    fetchAthletesByName,
  });

  expect(matches).toHaveLength(1);
  expect(fetchAthletesByName.mock.calls).toEqual([
    ["MEET_ONE", "Pamungkas", 1],
    ["MEET_TWO", "Pamungkas", 1],
  ]);
});

test("paginates a full name-search page", async () => {
  const firstPage = Array.from({ length: 20 }, (_, id) => ({
    ...LUIGI,
    id: String(id),
    name: `OTHER SWIMMER ${id}`,
  }));
  const fetchAthletesByName = vi
    .fn()
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce([LUIGI]);

  const matches = await findSpectraMatches({
    fullName: "Luigi Banyu Pamungkas",
    gender: "putra",
    candidateMeetCodes: ["MEET_ONE"],
    clubKeywords: ["Klaten"],
    fetchAthletesByName,
  });

  expect(matches).toHaveLength(1);
  expect(fetchAthletesByName).toHaveBeenNthCalledWith(2, "MEET_ONE", "Pamungkas", 2);
});

test("tries another name token when the first token exceeds the page cap", async () => {
  const crowded = Array.from({ length: 20 }, (_, id) => ({
    ...LUIGI,
    id: String(id),
    name: `OTHER PAMUNGKAS ${id}`,
  }));
  const fetchAthletesByName = vi.fn(async (_meet: string, term: string) =>
    term === "Pamungkas" ? crowded : [LUIGI],
  );

  const matches = await findSpectraMatches({
    fullName: "Luigi Banyu Pamungkas",
    gender: "putra",
    candidateMeetCodes: ["MEET_ONE"],
    clubKeywords: ["Klaten"],
    maxPagesPerMeet: 1,
    fetchAthletesByName,
  });

  expect(matches).toHaveLength(1);
  expect(fetchAthletesByName.mock.calls).toEqual([
    ["MEET_ONE", "Pamungkas", 1],
    ["MEET_ONE", "Luigi", 1],
  ]);
});

test("provider failures remain errors instead of becoming false no-match results", async () => {
  await expect(
    findSpectraMatches({
      fullName: "Luigi Banyu Pamungkas",
      gender: "putra",
      candidateMeetCodes: ["MEET_ONE"],
      clubKeywords: ["Klaten"],
      fetchAthletesByName: async () => {
        throw new Error("Spectra sedang tidak dapat dihubungi");
      },
    }),
  ).rejects.toThrow("Spectra sedang tidak dapat dihubungi");
});
