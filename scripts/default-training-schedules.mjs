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

/** @param {number} weekday @param {string} fromDate @param {number} weeks */
function datesForWeekday(weekday, fromDate, weeks = HORIZON_WEEKS) {
  const [year, month, day] = fromDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = () => cursor.getUTCDay() || 7;
  while (isoWeekday() !== weekday) cursor.setUTCDate(cursor.getUTCDate() + 1);
  return Array.from({ length: weeks }, (_, offset) => {
    const date = new Date(cursor);
    date.setUTCDate(date.getUTCDate() + offset * 7);
    return date.toISOString().slice(0, 10);
  });
}

/**
 * Ensures the club's canonical schedules without resetting later on/off choices.
 * Active schedules receive a rolling 16-week set of concrete practices.
 *
 * @param {Query} query
 * @param {number} clubId
 */
export async function ensureDefaultTrainingSchedules(query, clubId) {
  const fromDate = jakartaDate();
  let seriesCreated = 0;
  let practicesCreated = 0;

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
    if (row.active !== true) continue;

    for (const sessionDate of datesForWeekday(schedule.weekday, fromDate)) {
      const practice = await query(
        `insert into practices (
           club_id, session_date, start_time, duration_min, location, kind, title,
           total_meters, notes, series_id, occurrence_date
         ) values ($1,$2::date,$3,$4,$5,$6,$7,0,$8,$9,$2::date)
         on conflict (series_id, occurrence_date) where series_id is not null do nothing
         returning id`,
        [
          clubId,
          sessionDate,
          schedule.startTime,
          schedule.durationMin,
          schedule.location,
          schedule.kind,
          schedule.title,
          schedule.notes,
          row.id,
        ],
      );
      const practiceId = practice.rows[0]?.id;
      if (typeof practiceId !== "number") continue;
      practicesCreated += 1;
      await query(
        `insert into practice_attendance (
           club_id, practice_id, swimmer_id, status, meters_completed, on_roll
         )
         select $1, $2, id, 'belum', null, true
         from swimmers where club_id = $1 and status = 'aktif'`,
        [clubId, practiceId],
      );
    }
  }

  return { seriesCreated, practicesCreated };
}
