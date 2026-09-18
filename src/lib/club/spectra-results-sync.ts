import type { Actor } from "./actor";
import { refreshPbFlag } from "./results";
import {
  fetchJsonPatient,
  INTERACTIVE_RETRY,
  SPECTRA_BASE as BASE,
  SPECTRA_EMPTY_MESSAGE,
} from "../../../scripts/spectra-client.mjs";
import { isRelay, normalizeAthleteHistoryRow } from "../../../scripts/spectra-athlete-parse.mjs";

export type FetchAthleteHistory = (athleteId: string) => Promise<unknown[]>;

export async function fetchAthleteHistoryLive(athleteId: string): Promise<unknown[]> {
  const url = `${BASE}/athlete_time2.php?cid=${encodeURIComponent(athleteId)}&cprovince=&page=1`;
  try {
    const rows = await fetchJsonPatient(url, INTERACTIVE_RETRY);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Pull a single already-confirmed swimmer's full result history from
 * athlete_time2.php and upsert new results, keyed by spectra_result_ref
 * (athleteId:meetCode:eventNumber) so re-running is a no-op for anything
 * already imported -- results are historical facts, not editable state, so
 * unlike the meets sync there's no conflict/snapshot dance here.
 *
 * Per the approved design, this is only ever called for a swimmer whose
 * athlete ID was already confirmed via the public per-race search
 * (findSpectraMatches) -- never used to look anyone up.
 *
 * A result whose meet hasn't been synced locally (out-of-region, per the
 * Jateng/DIY filter in sync-spectra-meets.mjs) is skipped, not auto-created
 * -- this module doesn't know how to build a full meets row from the
 * thinner athlete_time2.php shape.
 */
export async function syncSpectraResultsForSwimmer(
  actor: Actor & { clubId: number },
  input: { swimmerId: number; athleteId: string },
  { fetchAthleteHistory = fetchAthleteHistoryLive }: { fetchAthleteHistory?: FetchAthleteHistory } = {},
): Promise<{
  total: number;
  inserted: number;
  skippedNoMeet: number;
  skippedNoTime: number;
  skippedNoDate: number;
  skippedUnrecognized: number;
  skippedDuplicate: number;
}> {
  const rawRows = await fetchAthleteHistory(input.athleteId);
  // A linked athlete was discovered from at least one published race result,
  // so their history cannot legitimately be empty. Spectra returns [] during
  // outages; surface that state instead of claiming a successful zero import.
  if (rawRows.length === 0) throw new Error(SPECTRA_EMPTY_MESSAGE);

  let inserted = 0;
  let skippedNoMeet = 0;
  let skippedNoTime = 0;
  let skippedNoDate = 0;
  let skippedUnrecognized = 0;
  let skippedDuplicate = 0;
  // (stroke, distanceM, course) groups actually inserted into, so PBs are
  // recomputed once per group after the loop instead of once per row.
  const touchedGroups = new Map<string, { stroke: string; distanceM: number; course: string }>();

  for (const raw of rawRows as Array<{ jenis?: string }>) {
    if (isRelay(raw)) continue;
    const result = normalizeAthleteHistoryRow(raw as never);
    if (result.timeMs == null) {
      skippedNoTime += 1;
      continue;
    }
    // result_date is NOT NULL -- a row whose date text parseSpectraDate
    // can't recognize must be skipped, not inserted as null.
    if (result.date == null) {
      skippedNoDate += 1;
      continue;
    }
    if (!result.stroke || !result.distanceM || !result.course) {
      skippedUnrecognized += 1; // e.g. an event description parseEventDescr couldn't parse
      continue;
    }

    const meetRows = await actor.sql<{ id: number }>`
      select id from meets where club_id = ${actor.clubId} and spectra_event_code = ${result.meetCode} limit 1
    `;
    const meetId = meetRows[0]?.id;
    if (!meetId) {
      skippedNoMeet += 1;
      continue;
    }

    const resultRef = `${input.athleteId}:${result.meetCode}:${result.eventNumber}`;
    const existing = await actor.sql<{ id: number }>`
      select id from results where club_id = ${actor.clubId} and spectra_result_ref = ${resultRef} limit 1
    `;
    if (existing[0]) {
      skippedDuplicate += 1;
      continue;
    }

    await actor.sql`
      insert into results (
        club_id, swimmer_id, meet_id, result_date, stroke, distance_m, course,
        time_ms, place, round, status, kind, is_pb, notes, spectra_result_ref
      ) values (
        ${actor.clubId}, ${input.swimmerId}, ${meetId}, ${result.date}, ${result.stroke}, ${result.distanceM}, ${result.course},
        ${result.timeMs}, ${result.place}, 'final', 'selesai', 'official', false, ${result.notes}, ${resultRef}
      )
    `;
    touchedGroups.set(`${result.stroke}|${result.distanceM}|${result.course}`, {
      stroke: result.stroke,
      distanceM: result.distanceM,
      course: result.course,
    });
    inserted += 1;
  }

  for (const g of touchedGroups.values()) {
    await refreshPbFlag(actor, actor.clubId, input.swimmerId, g.stroke, g.distanceM, g.course);
  }

  return { total: rawRows.length, inserted, skippedNoMeet, skippedNoTime, skippedNoDate, skippedUnrecognized, skippedDuplicate };
}
