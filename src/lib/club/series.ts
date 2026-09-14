import type { Actor } from "./actor";
import { hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canWritePractice } from "./permissions";
import { cancelPractice, savePracticeRecord, type PracticeSetInput } from "./practice";
import { jakartaNowParts } from "@/lib/utils";
import type { WeekdayId } from "@/lib/swim/constants";

export type SeriesInput = {
  title: string;
  weekday: WeekdayId;
  startTime?: string;
  durationMin?: number;
  location?: string;
  kind: string;
  focus?: string;
  notes?: string;
  weeks?: number;
  fromDate?: string;
  active?: boolean;
  sets: PracticeSetInput[];
};

export type ScheduledTrainingDay = {
  scheduleId: number;
  practiceId: number | null;
  date: string;
  title: string;
  startTime: string | null;
  durationMin: number | null;
  location: string | null;
  focus: string | null;
  totalMeters: number;
};

export function isoWeekday(isoDate: string): WeekdayId {
  const [y, m, d] = isoDate.split("-").map(Number);
  const js = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return (js === 0 ? 7 : js) as WeekdayId;
}

export function datesForWeekday(weekday: WeekdayId, fromDate: string, weeks: number): string[] {
  if (weekday < 1 || weekday > 7) throw new Error("Hari tidak valid");
  const count = Math.max(Math.trunc(weeks), 1);
  const [y, m, d] = fromDate.slice(0, 10).split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, d!));
  const dates: string[] = [];
  for (let i = 0; i < 8 && isoWeekday(start.toISOString().slice(0, 10)) !== weekday; i += 1) {
    start.setUTCDate(start.getUTCDate() + 1);
  }
  for (let w = 0; w < count; w += 1) {
    const cur = new Date(start);
    cur.setUTCDate(start.getUTCDate() + w * 7);
    dates.push(cur.toISOString().slice(0, 10));
  }
  return dates;
}

export function datesInRange(weekday: WeekdayId, fromDate: string, toDate: string): string[] {
  if (fromDate > toDate) throw new Error("Rentang tanggal tidak valid");
  if (weekday < 1 || weekday > 7) throw new Error("Hari tidak valid");
  const dates: string[] = [];
  const [y, m, d] = fromDate.slice(0, 10).split("-").map(Number);
  const cursor = new Date(Date.UTC(y!, m! - 1, d!));
  for (let i = 0; i < 8 && isoWeekday(cursor.toISOString().slice(0, 10)) !== weekday; i += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  while (cursor.toISOString().slice(0, 10) <= toDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}

async function requireCoach(actor: Actor) {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (!canWritePractice(hats)) throw new Error("Tidak diizinkan");
  return clubId;
}

export async function createPracticeSeries(actor: Actor, input: SeriesInput) {
  const clubId = await requireCoach(actor);
  const title = input.title.trim();
  if (!title) throw new Error("Judul wajib diisi");
  const weeks = input.weeks ?? 8;
  const fromDate = input.fromDate ?? jakartaNowParts().date;
  const active = input.active ?? true;
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)
    throw new Error("Jangka penyiapan tidak valid");
  return actor.sql.transaction(async (sql) => {
    const rows = await sql<{ id: number }>`
      insert into practice_series (
        club_id, title, weekday, start_time, duration_min, location, kind, focus, notes,
        horizon_weeks, start_date, active
      )
      values (
        ${clubId}, ${title}, ${input.weekday}, ${input.startTime || null}, ${input.durationMin ?? null},
        ${input.location?.trim() || null}, ${input.kind}, ${input.focus?.trim() || null},
        ${input.notes?.trim() || null}, ${weeks}, ${fromDate}, ${active}
      )
      returning id
    `;
    const id = rows[0]!.id;
    for (let i = 0; i < input.sets.length; i += 1) {
      const s = input.sets[i]!;
      await sql`
        insert into practice_series_sets (
          club_id, series_id, sort_order, block, reps, distance_m, stroke, interval_sec, description
        )
        values (
          ${clubId}, ${id}, ${i}, ${s.block}, ${s.reps}, ${s.distanceM}, ${s.stroke},
          ${s.intervalSec ?? null}, ${s.description?.trim() || null}
        )
      `;
    }
    return { id, title, practiceIds: [] as number[] };
  });
}

export async function createPracticeSeriesBatch(
  actor: Actor,
  input: Omit<SeriesInput, "weekday"> & { weekdays: WeekdayId[] },
) {
  if (!input.weekdays.length || new Set(input.weekdays).size !== input.weekdays.length) {
    throw new Error("Pilih setidaknya satu hari tanpa duplikat");
  }
  if (input.weekdays.some((day) => day < 1 || day > 7)) throw new Error("Hari tidak valid");
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    const results = [];
    for (const weekday of input.weekdays) {
      results.push(await createPracticeSeries(a, { ...input, weekday }));
    }
    return results;
  });
}

export async function skipSeriesRange(
  actor: Actor,
  input: { id: number; fromDate: string; toDate: string; reason: string },
): Promise<{ ok: true }> {
  const clubId = await requireCoach(actor);
  const reason = input.reason.trim() || "Libur";
  const series = await actor.sql<{ weekday: WeekdayId }>`
    select weekday from practice_series where id = ${input.id} and club_id = ${clubId} limit 1
  `;
  if (!series[0]) throw new Error("Jadwal berulang tidak ditemukan");
  const dates = datesInRange(series[0].weekday, input.fromDate, input.toDate);
  for (const date of dates) {
    await actor.sql`
      insert into practice_series_skips (series_id, skip_date, reason)
      values (${input.id}, ${date}, ${reason})
      on conflict (series_id, skip_date) do update set reason = excluded.reason
    `;
    const found = await actor.sql<{ id: number; revision: number; status: string }>`
      select id, revision, status from practices
      where club_id = ${clubId} and series_id = ${input.id} and occurrence_date = ${date}::date
      limit 1
    `;
    const row = found[0];
    if (row && row.status !== "cancelled" && row.status !== "completed") {
      await cancelPractice(actor, {
        id: row.id,
        reason,
        expectedRevision: row.revision,
        scope: "this",
      });
    }
  }
  return { ok: true };
}

export async function listPracticeSeries(actor: Actor) {
  const clubId = await requireCoach(actor);
  const rows = await actor.sql<{
    id: number;
    title: string;
    weekday: WeekdayId;
    start_time: string | null;
    location: string | null;
    focus: string | null;
    notes: string | null;
    horizon_weeks: number;
    active: boolean;
    until_date: string | null;
  }>`
    select id, title, weekday, start_time, location, focus, notes, horizon_weeks, active,
           until_date::text as until_date
    from practice_series where club_id = ${clubId}
    order by title, weekday, start_time, id
  `;
  const sets = await actor.sql<{
    series_id: number; sort_order: number; block: string | null; reps: number;
    distance_m: number; stroke: string; interval_sec: number | null; description: string | null;
  }>`
    select series_id, sort_order, block, reps, distance_m, stroke, interval_sec, description
    from practice_series_sets where club_id = ${clubId}
    order by series_id, sort_order, id
  `;
  const setsBySeries = new Map<number, typeof sets>();
  for (const set of sets) {
    setsBySeries.set(set.series_id, [...(setsBySeries.get(set.series_id) ?? []), set]);
  }
  return rows.map((row) => {
    const program = (setsBySeries.get(row.id) ?? []).map(({ series_id: _seriesId, ...set }) => set);
    return {
      ...row,
      sets: program,
      total_meters: program.reduce((total, set) => total + set.reps * set.distance_m, 0),
    };
  });
}

export async function setSeriesActive(
  actor: Actor,
  input: { id: number; active: boolean },
): Promise<{ ok: true }> {
  const clubId = await requireCoach(actor);
  return actor.sql.transaction(async (sql) => {
    const updated = await sql<{ id: number }>`
      update practice_series
      set active = ${input.active}
      where id = ${input.id} and club_id = ${clubId}
        and (${input.active} = false or until_date is null)
      returning id
    `;
    if (!updated[0]) {
      const ended = await sql<{ ended: boolean }>`
        select (until_date is not null) as ended
        from practice_series where id = ${input.id} and club_id = ${clubId}
      `;
      if (ended[0]?.ended && input.active) {
        throw new Error("Jadwal sudah berakhir. Buat jadwal baru untuk memulai lagi.");
      }
      throw new Error("Jadwal berulang tidak ditemukan");
    }
    return { ok: true };
  });
}

export async function listScheduledTrainingDays(
  actor: Actor,
  input: { fromDate?: string; days?: number },
): Promise<ScheduledTrainingDay[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const fromDate = input.fromDate ?? jakartaNowParts().date;
  const days = Math.min(Math.max(Math.trunc(input.days ?? 8), 1), 31);
  const to = new Date(`${fromDate}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + days - 1);
  const toDate = to.toISOString().slice(0, 10);
  const schedules = await actor.sql<{
    id: number; title: string; weekday: WeekdayId; start_time: string | null;
    duration_min: number | null; location: string | null; focus: string | null;
    total_meters: number; start_date: string;
  }>`
    select s.id, s.title, s.weekday, s.start_time, s.duration_min, s.location, s.focus,
           coalesce((select sum(ps.reps * ps.distance_m) from practice_series_sets ps where ps.series_id = s.id), 0)::int as total_meters,
           s.start_date::text as start_date
    from practice_series s
    where s.club_id = ${clubId} and s.active = true and s.start_date <= ${toDate}::date
      and (s.until_date is null or s.until_date >= ${fromDate}::date)
    order by s.weekday, s.start_time, s.id
  `;
  const skips = await actor.sql<{ series_id: number; skip_date: string }>`
    select series_id, skip_date::text as skip_date from practice_series_skips
    where skip_date between ${fromDate}::date and ${toDate}::date
  `;
  const skipped = new Set(skips.map((row) => `${row.series_id}:${row.skip_date.slice(0, 10)}`));
  const practices = await actor.sql<{ id: number; series_id: number; occurrence_date: string }>`
    select id, series_id, occurrence_date::text as occurrence_date from practices
    where club_id = ${clubId} and series_id is not null
      and occurrence_date between ${fromDate}::date and ${toDate}::date
  `;
  const practiceByDay = new Map(practices.map((row) => [`${row.series_id}:${row.occurrence_date.slice(0, 10)}`, row.id]));
  const result: ScheduledTrainingDay[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(`${fromDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.toISOString().slice(0, 10);
    for (const schedule of schedules) {
      const key = `${schedule.id}:${day}`;
      if (day < schedule.start_date.slice(0, 10) || isoWeekday(day) !== schedule.weekday || skipped.has(key)) continue;
      result.push({
        scheduleId: schedule.id,
        practiceId: practiceByDay.get(key) ?? null,
        date: day,
        title: schedule.title,
        startTime: schedule.start_time,
        durationMin: schedule.duration_min,
        location: schedule.location,
        focus: schedule.focus,
        totalMeters: schedule.total_meters,
      });
    }
  }
  return result;
}

export async function openScheduledTrainingDay(
  actor: Actor,
  input: { scheduleId: number; date: string },
): Promise<{ id: number }> {
  const clubId = await requireCoach(actor);
  if (input.date > jakartaNowParts().date) throw new Error("Absensi belum dapat dibuka sebelum hari latihan.");
  const schedules = await actor.sql<{
    id: number; title: string; weekday: WeekdayId; start_time: string | null; duration_min: number | null;
    location: string | null; kind: string; focus: string | null; notes: string | null;
  }>`
    select id, title, weekday, start_time, duration_min, location, kind, focus, notes
    from practice_series where id = ${input.scheduleId} and club_id = ${clubId} and active = true
      and start_date <= ${input.date}::date and (until_date is null or until_date >= ${input.date}::date)
    limit 1
  `;
  const schedule = schedules[0];
  if (!schedule || isoWeekday(input.date) !== schedule.weekday) throw new Error("Tanggal bukan hari latihan pada jadwal ini.");
  const skipped = await actor.sql<{ found: boolean }>`
    select true as found from practice_series_skips where series_id = ${schedule.id} and skip_date = ${input.date}::date limit 1
  `;
  if (skipped[0]) throw new Error("Jadwal latihan pada tanggal ini diliburkan.");
  const existing = await actor.sql<{ id: number }>`
    select id from practices where club_id = ${clubId} and series_id = ${schedule.id}
      and occurrence_date = ${input.date}::date limit 1
  `;
  if (existing[0]) return existing[0];
  const sets = await actor.sql<{
    block: string | null; reps: number; distance_m: number; stroke: string;
    interval_sec: number | null; description: string | null;
  }>`
    select block, reps, distance_m, stroke, interval_sec, description
    from practice_series_sets where series_id = ${schedule.id} and club_id = ${clubId} order by sort_order, id
  `;
  const saved = await savePracticeRecord(actor, {
    sessionDate: input.date,
    startTime: schedule.start_time ?? undefined,
    durationMin: schedule.duration_min ?? undefined,
    location: schedule.location ?? undefined,
    kind: schedule.kind,
    title: schedule.title,
    focus: schedule.focus ?? undefined,
    notes: schedule.notes ?? undefined,
    seriesId: schedule.id,
    occurrenceDate: input.date,
    sets: sets.map((set) => ({
      block: set.block ?? "utama", reps: set.reps, distanceM: set.distance_m, stroke: set.stroke,
      intervalSec: set.interval_sec, description: set.description ?? undefined,
    })),
  });
  return { id: saved.id };
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsUtc(date: string, time: string | null, extraMin = 0): string {
  const clock = time && /^\d{1,2}:\d{2}/.test(time) ? time : "15:30";
  const start = new Date(`${date}T${clock.length === 5 ? `${clock}:00` : clock}+07:00`);
  const at = new Date(start.getTime() + extraMin * 60_000);
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function listPracticeIcs(actor: Actor): Promise<string> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const familyIds = hats.guardianSwimmerIds;
  const rows = hats.staff
    ? await actor.sql<{
        id: number;
        title: string;
        session_date: string;
        start_time: string | null;
        duration_min: number | null;
        location: string | null;
        status: string;
        revision: number;
      }>`
        select p.id, p.title, p.session_date::text as session_date, p.start_time, p.duration_min, p.location, p.status, p.revision
        from practices p
        where p.club_id = ${clubId}
        order by p.session_date, p.start_time, p.id
      `
    : familyIds.length
      ? await actor.sql<{
          id: number;
          title: string;
          session_date: string;
          start_time: string | null;
          duration_min: number | null;
          location: string | null;
          status: string;
          revision: number;
        }>`
          select p.id, p.title, p.session_date::text as session_date, p.start_time, p.duration_min, p.location, p.status, p.revision
          from practices p
          where p.club_id = ${clubId}
            and exists (
              select 1 from practice_attendance a
              where a.practice_id = p.id and a.on_roll = true
                and a.swimmer_id = any(${familyIds}::int[])
            )
          order by p.session_date, p.start_time, p.id
        `
      : [];
  const stamp = icsUtc(jakartaNowParts().date, jakartaNowParts().time);
  const events = rows.map((p) => {
    const date = p.session_date.slice(0, 10);
    const start = icsUtc(date, p.start_time);
    const end = icsUtc(date, p.start_time, p.duration_min ?? 90);
    const status = p.status === "cancelled" ? "CANCELLED" : "CONFIRMED";
    return [
      "BEGIN:VEVENT",
      `UID:practice-${p.id}@bmsc.klaten.org`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsEscape(p.title)}`,
      p.location ? `LOCATION:${icsEscape(p.location)}` : null,
      `STATUS:${status}`,
      `SEQUENCE:${p.revision}`,
      "END:VEVENT",
    ]
      .filter(Boolean)
      .join("\r\n");
  });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BMSC//Latihan//ID",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
