import schedules from "../data/default-training-schedules.json" with { type: "json" };

const HORIZON_WEEKS = 16;

/** @typedef {{ rows: Array<Record<string, unknown>> }} QueryResult */
/** @typedef {(text: string, params?: unknown[]) => Promise<QueryResult>} Query */

function jakartaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/**
 * Ensures the club's canonical schedules without resetting later on/off choices.
 * Concrete training and attendance rows are created only when staff open a scheduled day.
 *
 * @param {Query} query
 * @param {number} clubId
 */
export async function ensureDefaultTrainingSchedules(query, clubId) {
  const fromDate = jakartaDate();
  let seriesCreated = 0;
  const practicesCreated = 0;

  for (const schedule of schedules) {
    const result = await query(
      `insert into practice_series (
         club_id, seed_key, title, weekday, start_time, duration_min, location, kind, notes,
         horizon_weeks, start_date, active
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12)
       on conflict (club_id, seed_key) where seed_key is not null do update set
         title = excluded.title,
         weekday = excluded.weekday,
         start_time = excluded.start_time,
         duration_min = excluded.duration_min,
         location = excluded.location,
         kind = excluded.kind,
         notes = excluded.notes,
         horizon_weeks = excluded.horizon_weeks
       returning id, active, (xmax = 0) as inserted`,
      [
        clubId,
        schedule.key,
        schedule.title,
        schedule.weekday,
        schedule.startTime,
        schedule.durationMin,
        schedule.location,
        schedule.kind,
        schedule.notes,
        HORIZON_WEEKS,
        fromDate,
        schedule.active,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Schedule seed failed for ${schedule.key}`);
    if (row.inserted === true) seriesCreated += 1;
  }

  return { seriesCreated, practicesCreated };
}
