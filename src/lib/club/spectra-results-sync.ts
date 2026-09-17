import type { Actor } from "./actor";
import { refreshPbFlag } from "./results";
import { fetchJsonPatient } from "../../../scripts/spectra-client.mjs";
import { isRelay, normalizeAthleteHistoryRow } from "../../../scripts/spectra-athlete-parse.mjs";

const BASE = "https://globiesoft.com/rlist_off/php";
const INTERACTIVE_RETRY = { retries: 2, delayMs: 1500 };

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
  skippedUnrecognized: number;
  skippedDuplicate: number;
}> {
  const rawRows = await fetchAthleteHistory(input.athleteId);

  let inserted = 0;
  let skippedNoMeet = 0;
  let skippedNoTime = 0;
  let skippedUnrecognized = 0;
  let skippedDuplicate = 0;

  for (const raw of rawRows as Array<{ jenis?: string }>) {
    if (isRelay(raw)) continue;
    const result = normalizeAthleteHistoryRow(raw as never);
    if (result.timeMs == null) {
      skippedNoTime += 1;
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
    await refreshPbFlag(actor, actor.clubId, input.swimmerId, result.stroke, result.distanceM, result.course);
    inserted += 1;
  }

  return { total: rawRows.length, inserted, skippedNoMeet, skippedNoTime, skippedUnrecognized, skippedDuplicate };
}
