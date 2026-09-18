import type { Actor } from "./actor";
import {
  fetchJsonPatient,
  INTERACTIVE_RETRY,
  SPECTRA_BASE as BASE,
  SPECTRA_EMPTY_MESSAGE,
} from "../../../scripts/spectra-client.mjs";
import { isRelay, nameMatches, normalizeResultRow, parseEventDescr } from "../../../scripts/spectra-athlete-parse.mjs";

export type SpectraMatch = {
  athleteId: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: "putra" | "putri" | null;
  club: string | null;
  meetCode: string;
  eventNumber: string;
  ageGroup: string | null;
};

type RaceRow = { kode: string; nomordescr: string; jenis: string; kelumur: string };
export type FetchRaceList = (meetCode: string) => Promise<RaceRow[]>;
export type FetchRaceResults = (meetCode: string, eventNumber: string, ageGroup: string) => Promise<unknown[]>;

export async function fetchRaceListLive(meetCode: string): Promise<RaceRow[]> {
  const url = `${BASE}/events_resultbyevent.php?csearch=&cevent=${encodeURIComponent(meetCode)}&page=1`;
  try {
    const rows = await fetchJsonPatient(url, INTERACTIVE_RETRY);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return []; // their backend is genuinely flaky -- skip this meet, don't fail the whole search
  }
}

export async function fetchRaceResultsLive(meetCode: string, eventNumber: string, ageGroup: string): Promise<unknown[]> {
  const url =
    `${BASE}/events_resultbyevent2.php?csearch=&cevent=${encodeURIComponent(meetCode)}` +
    `&ceventno=${encodeURIComponent(eventNumber)}&ckelumur=${encodeURIComponent(ageGroup)}`;
  try {
    const rows = await fetchJsonPatient(url, INTERACTIVE_RETRY);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function looksLikeThisClub(club: string | null, clubKeywords: string[]): boolean {
  if (!club) return false;
  const upper = club.toUpperCase();
  return clubKeywords.some((kw) => upper.includes(kw.toUpperCase()));
}

/**
 * Search Spectra SwimPro's public per-race results for a swimmer being
 * added, scoped to a bounded list of already-synced meets. Stops issuing
 * new requests as soon as at least one confident match (name AND club both
 * agree) is found in a batch, but keeps every distinct athlete matched
 * within that batch -- surfaces a same-name collision within the club's own
 * results rather than silently picking one. Never touches the CAPTCHA-gated
 * personal-login area; everything here is the public Result Viewer data.
 *
 * Bounded by wall-clock time (maxWallClockMs), not just call count -- the
 * call-count cap alone doesn't protect a synchronous "Add Swimmer" click
 * from their backend's real flakiness. This matters most for the single
 * most common case: a brand-new swimmer with no Spectra history at all, who
 * by definition exhausts the whole search space with no early exit.
 */
export async function findSpectraMatches({
  fullName,
  gender,
  candidateMeetCodes,
  clubKeywords,
  maxRaceChecksPerMeet = 40,
  maxTotalRaceChecks = 120,
  maxWallClockMs = 15_000,
  fetchRaceList = fetchRaceListLive,
  fetchRaceResults = fetchRaceResultsLive,
}: {
  fullName: string;
  gender: "putra" | "putri";
  candidateMeetCodes: string[];
  clubKeywords: string[];
  maxRaceChecksPerMeet?: number;
  maxTotalRaceChecks?: number;
  maxWallClockMs?: number;
  fetchRaceList?: FetchRaceList;
  fetchRaceResults?: FetchRaceResults;
}): Promise<SpectraMatch[]> {
  const genderWord = gender === "putri" ? "putri" : "putra";
  const found = new Map<string, SpectraMatch>();
  let totalChecked = 0;
  let meetsWithRaces = 0;
  const deadline = Date.now() + maxWallClockMs;
  const outOfTime = () => Date.now() > deadline;

  for (const meetCode of candidateMeetCodes) {
    if (outOfTime()) break;
    const races = await fetchRaceList(meetCode);
    if (races.length > 0) meetsWithRaces += 1;
    const candidates = races.filter((r) => {
      if (isRelay(r)) return false;
      const { gender: raceGender } = parseEventDescr(r.nomordescr);
      return raceGender === genderWord;
    });

    let checkedInMeet = 0;
    for (const race of candidates) {
      if (checkedInMeet >= maxRaceChecksPerMeet || totalChecked >= maxTotalRaceChecks || outOfTime()) break;
      checkedInMeet += 1;
      totalChecked += 1;

      const rows = await fetchRaceResults(meetCode, race.kode, race.kelumur);
      for (const row of rows as Array<{ nama?: string; club?: string; id?: string }>) {
        if (!row.nama || !nameMatches(row.nama, fullName)) continue;
        if (!looksLikeThisClub(row.club ?? null, clubKeywords)) continue;
        const normalized = normalizeResultRow(row, meetCode);
        found.set(normalized.athleteId, {
          athleteId: normalized.athleteId,
          fullName: normalized.fullName,
          dateOfBirth: normalized.dateOfBirth,
          gender: normalized.gender,
          club: normalized.club,
          meetCode: normalized.meetCode,
          eventNumber: normalized.eventNumber,
          ageGroup: normalized.ageGroup,
        });
      }
    }

    if (found.size > 0) break; // confident match(es) found -- stop searching further meets
    if (totalChecked >= maxTotalRaceChecks) break;
  }

  if (candidateMeetCodes.length > 0 && meetsWithRaces === 0) {
    throw new Error(SPECTRA_EMPTY_MESSAGE);
  }

  return [...found.values()];
}

/** This club's own recently-synced meets, most recent first -- the search
 *  space for findSpectraMatches. Only meets with a spectra_event_code (i.e.
 *  ones that came from the Spectra sync, not manually-created club-only
 *  entries) are usable, since the search needs Spectra's own meet code. */
export async function candidateMeetCodesFor(actor: Actor & { clubId: number }, limit = 15): Promise<string[]> {
  const rows = await actor.sql<{ spectra_event_code: string }>`
    select spectra_event_code from meets
    where club_id = ${actor.clubId} and spectra_event_code is not null
    order by start_date desc
    limit ${limit}
  `;
  return rows.map((r) => r.spectra_event_code);
}

/** Keywords identifying this club's own results in Spectra's "club"/"team"
 *  field (e.g. "BLACK MARLINS SWIMMING CLUB KLATEN" for club meets, "KAB.
 *  KLATEN" for school-organized ones -- both mention the city). */
export async function clubKeywordsFor(actor: Actor & { clubId: number }): Promise<string[]> {
  const rows = await actor.sql<{ name: string; city: string }>`
    select name, city from clubs where id = ${actor.clubId} limit 1
  `;
  const club = rows[0];
  if (!club) return [];
  return [...new Set([club.name, club.city])].filter(Boolean);
}
