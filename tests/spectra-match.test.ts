import { expect, test, vi } from "vitest";
import { findSpectraMatches, spectraNameSearchUrl } from "../src/lib/club/spectra-match";

const LUIGI = {
  id: "43720",
  name: "LUIGI BANYU PAMUNGKAS",
  lahir: "1 JANUARY 2014",
  sex: "MEN",
  team: "BLACK MARLINS SWIMMING CLUB KLATEN",
};

test("builds the direct result-by-name URL with an explicit page", () => {
  expect(spectraNameSearchUrl("MEET/2026", " Luigi Banyu ", 2)).toBe(
    "https://globiesoft.com/rlist_off/php/events_resultbyname.php?csearch=Luigi%20Banyu&cevent=MEET%2F2026&page=2",
  );
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
  expect(fetchAthletesByName).toHaveBeenCalledWith("KRAPPROVBYL2026", "Luigi Banyu Pamungkas", 1);
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
    ["MEET_ONE", "Luigi Banyu Pamungkas", 1],
    ["MEET_TWO", "Luigi Banyu Pamungkas", 1],
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
  expect(fetchAthletesByName).toHaveBeenNthCalledWith(2, "MEET_ONE", "Luigi Banyu Pamungkas", 2);
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
