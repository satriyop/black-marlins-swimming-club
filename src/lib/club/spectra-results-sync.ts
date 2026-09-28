import type { Actor } from "./actor";
import { refreshPbFlag } from "./results";
import {
  fetchJsonPatient,
  INTERACTIVE_RETRY,
  SPECTRA_BASE as BASE,
  SPECTRA_EMPTY_MESSAGE,
} from "../../../scripts/spectra-client.mjs";
import {
  isRelay,
  normalizeAthleteHistoryRow,
  normalizeResultRow,
  spectraEventDate,
} from "../../../scripts/spectra-athlete-parse.mjs";
import { resolveSpectraKey } from "../server/spectra-key.server";

export type FetchAthleteHistory = (athleteId: string) => Promise<unknown[]>;
export type FetchAthleteMeetResults = (meetCode: string, athleteId: string) => Promise<unknown[]>;

const PAGE_SIZE = 20;
const MAX_PAGES = 30;

export async function fetchAthleteHistoryLive(athleteId: string): Promise<unknown[]> {
  const all: unknown[] = [];
  const apiKey = resolveSpectraKey();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${BASE}/athlete_time2.php?cid=${encodeURIComponent(athleteId)}&cprovince=&page=${page}`;
    const rows = await fetchJsonPatient(url, {
      ...INTERACTIVE_RETRY,
      retryEmpty: page === 1,
      apiKey,
    });
    if (!Array.isArray(rows)) throw new Error("Spectra SwimPro mengirim format data yang tidak dikenali.");
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export async function fetchAthleteMeetResultsLive(
  meetCode: string,
  athleteId: string,
): Promise<unknown[]> {
  const all: unknown[] = [];
  const apiKey = resolveSpectraKey();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url =
      `${BASE}/events_resultbyname2.php?csearch=&cevent=${encodeURIComponent(meetCode)}` +
      `&cid=${encodeURIComponent(athleteId)}&page=${page}`;
    const rows = await fetchJsonPatient(url, {
      ...INTERACTIVE_RETRY,
      retryEmpty: false,
      apiKey,
    });
    if (!Array.isArray(rows)) throw new Error("Spectra SwimPro mengirim format data yang tidak dikenali.");
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * Pull a single already-confirmed swimmer's full result history from
 * athlete_time2.php and upsert new results, keyed by spectra_result_ref
 * (athleteId:meetCode:eventNumber). Spectra may revise a live result, so an
 * existing provider-owned row is updated when its result fields change.
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
  {
    fetchAthleteHistory = fetchAthleteHistoryLive,
    fetchAthleteMeetResults = fetchAthleteMeetResultsLive,
  }: {
    fetchAthleteHistory?: FetchAthleteHistory;
    fetchAthleteMeetResults?: FetchAthleteMeetResults;
  } = {},
): Promise<{
  total: number;
  inserted: number;
  updated: number;
  skippedNoMeet: number;
  skippedNoTime: number;
  skippedNoDate: number;
  skippedUnrecognized: number;
  skippedDuplicate: number;
}> {
  const owned = await actor.sql<{ id: number }>`
    select id from swimmers where id = ${input.swimmerId} and club_id = ${actor.clubId} limit 1
  `;
  if (!owned[0]) throw new Error("Perenang tidak ditemukan");

  const recentMeets = await actor.sql<{
    code: string;
    start_date: string;
    end_date: string | null;
  }>`
    select spectra_event_code as code, start_date::text as start_date, end_date::text as end_date
    from meets
    where club_id = ${actor.clubId}
      and spectra_event_code is not null
      and status <> 'batal'
      and start_date <= current_date
      and coalesce(end_date, start_date) >= current_date - interval '7 days'
    order by start_date desc
    limit 8
  `;
  const rawRows = await fetchAthleteHistory(input.athleteId);
  const currentRows = await Promise.all(
    recentMeets.map(async (meet) => ({
      meet,
      rows: await fetchAthleteMeetResults(meet.code, input.athleteId),
    })),
  );
  // A linked athlete was discovered from at least one published race result,
  // so their history cannot legitimately be empty. Spectra returns [] during
  // outages; surface that state instead of claiming a successful zero import.
  if (rawRows.length === 0 && currentRows.every((entry) => entry.rows.length === 0)) {
    throw new Error(SPECTRA_EMPTY_MESSAGE);
  }

  let inserted = 0;
  let updated = 0;
  let skippedNoMeet = 0;
  let skippedNoTime = 0;
  let skippedNoDate = 0;
  let skippedUnrecognized = 0;
  let skippedDuplicate = 0;
  type Candidate = ReturnType<typeof normalizeAthleteHistoryRow> & { date: string | null };
  const candidates = new Map<string, Candidate>();
  for (const raw of rawRows as Array<{ jenis?: string }>) {
    if (isRelay(raw)) continue;
    const result = normalizeAthleteHistoryRow(raw as never);
    candidates.set(`${input.athleteId}:${result.meetCode}:${result.eventNumber}`, result);
  }
  for (const { meet, rows } of currentRows) {
    for (const raw of rows as Array<{ jenis?: string }>) {
      if (isRelay(raw)) continue;
      const result = normalizeResultRow(raw as never, meet.code);
      if (result.athleteId !== input.athleteId) continue;
      candidates.set(`${input.athleteId}:${result.meetCode}:${result.eventNumber}`, {
        meetCode: result.meetCode,
        date: spectraEventDate(meet.start_date, meet.end_date, result.eventNumber),
        eventNumber: result.eventNumber,
        ageGroup: result.ageGroup,
        club: result.club,
        distanceM: result.distanceM,
        stroke: result.stroke,
        course: result.course,
        timeMs: result.timeMs,
        status: result.status,
        place: result.place,
        notes: result.notes,
      });
    }
  }

  // (stroke, distanceM, course) groups actually inserted into, so PBs are
  // recomputed once per group after the loop instead of once per row.
  const touchedGroups = new Map<string, { stroke: string; distanceM: number; course: string }>();

  for (const result of candidates.values()) {
    if (result.status === "selesai" && result.timeMs == null) {
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
    const existing = await actor.sql<{
      id: number;
      meet_id: number | null;
      result_date: string;
      stroke: string;
      distance_m: number;
      course: string;
      time_ms: number | null;
      place: number | null;
      status: string;
      notes: string | null;
    }>`
      select id, meet_id, result_date::text as result_date, stroke, distance_m, course,
             time_ms, place, status, notes
      from results
      where club_id = ${actor.clubId} and spectra_result_ref = ${resultRef}
      limit 1
    `;
    const found = existing[0];
    if (found) {
      const changed =
        found.meet_id !== meetId ||
        found.result_date !== result.date ||
        found.stroke !== result.stroke ||
        found.distance_m !== result.distanceM ||
        found.course !== result.course ||
        found.time_ms !== result.timeMs ||
        found.place !== result.place ||
        found.status !== result.status ||
        found.notes !== result.notes;
      if (!changed) {
        skippedDuplicate += 1;
        continue;
      }
      if (found.status === "selesai" && found.time_ms != null) {
        touchedGroups.set(`${found.stroke}|${found.distance_m}|${found.course}`, {
          stroke: found.stroke,
          distanceM: found.distance_m,
          course: found.course,
        });
      }
      await actor.sql`
        update results set
          meet_id = ${meetId}, result_date = ${result.date}, stroke = ${result.stroke},
          distance_m = ${result.distanceM}, course = ${result.course}, time_ms = ${result.timeMs},
          place = ${result.place}, status = ${result.status}, notes = ${result.notes}
        where id = ${found.id} and club_id = ${actor.clubId}
      `;
      if (result.status === "selesai" && result.timeMs != null) {
        touchedGroups.set(`${result.stroke}|${result.distanceM}|${result.course}`, {
          stroke: result.stroke,
          distanceM: result.distanceM,
          course: result.course,
        });
      }
      updated += 1;
      continue;
    }

    await actor.sql`
      insert into results (
        club_id, swimmer_id, meet_id, result_date, stroke, distance_m, course,
        time_ms, place, round, status, kind, is_pb, notes, spectra_result_ref
      ) values (
        ${actor.clubId}, ${input.swimmerId}, ${meetId}, ${result.date}, ${result.stroke}, ${result.distanceM}, ${result.course},
        ${result.timeMs}, ${result.place}, 'final', ${result.status}, 'official', false, ${result.notes}, ${resultRef}
      )
    `;
    if (result.status === "selesai" && result.timeMs != null) {
      touchedGroups.set(`${result.stroke}|${result.distanceM}|${result.course}`, {
        stroke: result.stroke,
        distanceM: result.distanceM,
        course: result.course,
      });
    }
    inserted += 1;
  }

  for (const g of touchedGroups.values()) {
    await refreshPbFlag(actor, actor.clubId, input.swimmerId, g.stroke, g.distanceM, g.course);
  }
  await actor.sql`
    update swimmers set spectra_synced_at = now()
    where id = ${input.swimmerId} and club_id = ${actor.clubId}
  `;

  return {
    total: rawRows.length + currentRows.reduce((sum, entry) => sum + entry.rows.length, 0),
    inserted,
    updated,
    skippedNoMeet,
    skippedNoTime,
    skippedNoDate,
    skippedUnrecognized,
    skippedDuplicate,
  };
}
