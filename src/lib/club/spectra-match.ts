import type { Actor } from "./actor";
import {
  fetchJsonPatient,
  INTERACTIVE_RETRY,
  SPECTRA_BASE as BASE,
} from "../../../scripts/spectra-client.mjs";
import { nameMatches, parseSpectraDate } from "../../../scripts/spectra-athlete-parse.mjs";
import { resolveSpectraKey } from "../server/spectra-key.server";

export type SpectraMatch = {
  athleteId: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: "putra" | "putri" | null;
  club: string | null;
};

type AthleteRow = { id?: string; name?: string; lahir?: string; sex?: string; team?: string };
export type FetchAthletesByName = (
  meetCode: string,
  fullName: string,
  page: number,
) => Promise<unknown[]>;

const PAGE_SIZE = 20;

/** Spectra's `csearch` only matches a single name token. Multi-word queries
 * return [] even when the exact athlete exists, so start with the longest
 * (usually most distinctive) token and retain the full-name check locally. */
export function spectraNameSearchTerms(fullName: string): string[] {
  const trimmed = fullName.trim();
  const terms = [...new Set(trimmed.split(/\s+/).filter((term) => term.length >= 2))];
  return terms.length > 0 ? terms.sort((a, b) => b.length - a.length) : [trimmed];
}

export function spectraNameSearchUrl(meetCode: string, fullName: string, page: number): string {
  return (
    `${BASE}/events_resultbyname.php?csearch=${encodeURIComponent(fullName.trim())}` +
    `&cevent=${encodeURIComponent(meetCode)}&page=${page}`
  );
}

export async function fetchAthletesByNameLive(
  meetCode: string,
  fullName: string,
  page: number,
): Promise<unknown[]> {
  // Spectra answer an unauthenticated request with HTTP 200 and an empty []
  // rather than a 401. Everywhere else that shape means "no rows", and with
  // retryEmpty:false below it would sail through as a completed search with no
  // match -- telling a coach the swimmer is not in Spectra when the real cause
  // is that we sent no key. Nothing downstream can tell those apart, so fail
  // here, before spending a request. Checked outside the try: the catch below
  // rewrites every error into "tidak dapat dihubungi", which would hide a
  // configuration problem behind a network one.
  const apiKey = resolveSpectraKey();
  if (!apiKey) {
    throw new Error("Spectra belum dikonfigurasi (SPECTRA_API_KEY kosong). Hubungi admin.");
  }
  try {
    const rows = await fetchJsonPatient(spectraNameSearchUrl(meetCode, fullName, page), {
      ...INTERACTIVE_RETRY,
      retryEmpty: false,
      apiKey,
    });
    if (!Array.isArray(rows)) {
      throw new Error("unexpected response shape");
    }
    return rows;
  } catch (cause) {
    throw new Error("Spectra sedang tidak dapat dihubungi. Coba lagi.", { cause });
  }
}

function looksLikeThisClub(club: string | null, clubKeywords: string[]): boolean {
  if (!club) return false;
  const upper = club.toUpperCase();
  return clubKeywords.some((kw) => upper.includes(kw.toUpperCase()));
}

/**
 * Search Spectra SwimPro's public result-by-name endpoint for a swimmer being
 * linked. This endpoint returns identity fields directly, avoiding the old
 * race-by-race scan and its hundreds of paginated requests. A provider error
 * reaches the UI; returning [] is reserved for a completed search with no
 * confident name + gender + club match.
 */
export async function findSpectraMatches({
  fullName,
  gender,
  candidateMeetCodes,
  clubKeywords,
  maxWallClockMs = 15_000,
  maxPagesPerMeet = 5,
  fetchAthletesByName = fetchAthletesByNameLive,
}: {
  fullName: string;
  gender: "putra" | "putri";
  candidateMeetCodes: string[];
  clubKeywords: string[];
  maxWallClockMs?: number;
  maxPagesPerMeet?: number;
  fetchAthletesByName?: FetchAthletesByName;
}): Promise<SpectraMatch[]> {
  const found = new Map<string, SpectraMatch>();
  const searchTerms = spectraNameSearchTerms(fullName);
  const deadline = Date.now() + maxWallClockMs;
  const outOfTime = () => Date.now() >= deadline;

  for (const meetCode of candidateMeetCodes) {
    let meetSearchComplete = false;
    for (const searchTerm of searchTerms) {
      for (let page = 1; page <= maxPagesPerMeet; page += 1) {
        if (outOfTime()) throw new Error("Pencarian Spectra terlalu lama. Coba lagi.");
        const rows = await fetchAthletesByName(meetCode, searchTerm, page);
        for (const row of rows as AthleteRow[]) {
          if (!row.id || !row.name || !nameMatches(row.name, fullName)) continue;
          const rowGender = row.sex === "MEN" ? "putra" : row.sex === "WOMEN" ? "putri" : null;
          if (rowGender !== gender) continue;
          if (!looksLikeThisClub(row.team ?? null, clubKeywords)) continue;
          found.set(row.id, {
            athleteId: row.id,
            fullName: row.name,
            dateOfBirth: parseSpectraDate(row.lahir ?? ""),
            gender: rowGender,
            club: row.team ?? null,
          });
        }
        if (found.size > 0) break;
        if (rows.length < PAGE_SIZE) {
          meetSearchComplete = true;
          break;
        }
      }
      if (found.size > 0 || meetSearchComplete) break;
    }
    if (found.size > 0) break;
    if (!meetSearchComplete) {
      throw new Error("Terlalu banyak hasil Spectra. Masukkan nama lengkap yang lebih spesifik.");
    }
  }

  return [...found.values()];
}

/** Recent completed/current Spectra meets, most recent first. Future meets
 * have no published results and must not consume the interactive budget. */
export async function candidateMeetCodesFor(
  actor: Actor & { clubId: number },
  limit = 15,
): Promise<string[]> {
  const rows = await actor.sql<{ spectra_event_code: string }>`
    select spectra_event_code from meets
    where club_id = ${actor.clubId}
      and spectra_event_code is not null
      and start_date <= current_date
    order by start_date desc
    limit ${limit}
  `;
  return rows.map((r) => r.spectra_event_code);
}

/** Keywords identifying this club's own results in Spectra's team field. */
export async function clubKeywordsFor(actor: Actor & { clubId: number }): Promise<string[]> {
  const rows = await actor.sql<{ name: string; city: string }>`
    select name, city from clubs where id = ${actor.clubId} limit 1
  `;
  const club = rows[0];
  if (!club) return [];
  return [...new Set([club.name, club.city])].filter(Boolean);
}
