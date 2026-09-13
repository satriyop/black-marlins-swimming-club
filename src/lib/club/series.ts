import type { Actor } from "./actor";
import { hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canWritePractice } from "./permissions";
import { cancelPractice, savePracticeRecord, type PracticeSetInput } from "./practice";
import { jakartaNowParts } from "@/lib/utils";

export type SeriesInput = {
  title: string;
  weekday: number;
  startTime?: string;
  durationMin?: number;
  location?: string;
  kind: string;
  focus?: string;
  notes?: string;
  weeks?: number;
  fromDate?: string;
  sets: PracticeSetInput[];
};

export function isoWeekday(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const js = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function datesForWeekday(weekday: number, fromDate: string, weeks: number): string[] {
  if (weekday < 1 || weekday > 7) throw new Error("Hari tidak valid");
  const count = Math.min(Math.max(weeks, 1), 16);
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

export function datesInRange(weekday: number, fromDate: string, toDate: string): string[] {
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
  const rows = await actor.sql<{ id: number }>`
    insert into practice_series (
      club_id, title, weekday, start_time, duration_min, location, kind, focus, notes, horizon_weeks
    )
    values (
      ${clubId}, ${title}, ${input.weekday}, ${input.startTime || null}, ${input.durationMin ?? null},
      ${input.location?.trim() || null}, ${input.kind}, ${input.focus?.trim() || null},
      ${input.notes?.trim() || null}, ${weeks}
    )
    returning id
  `;
  const id = rows[0]!.id;
  for (let i = 0; i < input.sets.length; i += 1) {
    const s = input.sets[i]!;
    await actor.sql`
      insert into practice_series_sets (
        club_id, series_id, sort_order, block, reps, distance_m, stroke, interval_sec, description
      )
      values (
        ${clubId}, ${id}, ${i}, ${s.block}, ${s.reps}, ${s.distanceM}, ${s.stroke},
        ${s.intervalSec ?? null}, ${s.description?.trim() || null}
      )
    `;
  }
  const materialized = await materializePracticeSeries(actor, { id, fromDate });
  return { id, title, practiceIds: materialized.practiceIds };
}

export async function materializePracticeSeries(
  actor: Actor,
  input: { id: number; fromDate?: string },
): Promise<{ practiceIds: number[] }> {
  const clubId = await requireCoach(actor);
  const series = await actor.sql<{
    id: number;
    title: string;
    weekday: number;
    start_time: string | null;
    duration_min: number | null;
    location: string | null;
    kind: string;
    focus: string | null;
    notes: string | null;
    horizon_weeks: number;
    until_date: string | null;
  }>`
    select id, title, weekday, start_time, duration_min, location, kind, focus, notes, horizon_weeks, until_date::text as until_date
    from practice_series where id = ${input.id} and club_id = ${clubId} and active = true limit 1
  `;
  const row = series[0];
  if (!row) throw new Error("Jadwal berulang tidak ditemukan");
  const sets = await actor.sql<{
    block: string | null;
    reps: number;
    distance_m: number;
    stroke: string;
    interval_sec: number | null;
    description: string | null;
  }>`
    select block, reps, distance_m, stroke, interval_sec, description
    from practice_series_sets where series_id = ${row.id} and club_id = ${clubId} order by sort_order, id
  `;
  const fromDate = input.fromDate ?? jakartaNowParts().date;
  const dates = datesForWeekday(row.weekday, fromDate, row.horizon_weeks);
  const skips = await actor.sql<{ skip_date: string }>`
    select skip_date::text as skip_date from practice_series_skips where series_id = ${row.id}
  `;
  const skipSet = new Set(skips.map((s) => s.skip_date.slice(0, 10)));
  const existing = await actor.sql<{ id: number; occurrence_date: string }>`
    select id, occurrence_date::text as occurrence_date from practices
    where club_id = ${clubId} and series_id = ${row.id}
  `;
  const have = new Map(existing.map((e) => [e.occurrence_date.slice(0, 10), e.id]));
  const practiceIds: number[] = [];
  for (const date of dates) {
    const already = have.get(date);
    if (already) {
      practiceIds.push(already);
      continue;
    }
    if (skipSet.has(date)) continue;
    if (row.until_date && date > row.until_date.slice(0, 10)) continue;
    const saved = await savePracticeRecord(actor, {
      sessionDate: date,
      startTime: row.start_time ?? undefined,
      durationMin: row.duration_min ?? undefined,
      location: row.location ?? undefined,
      kind: row.kind,
      title: row.title,
      focus: row.focus ?? undefined,
      notes: row.notes ?? undefined,
      seriesId: row.id,
      occurrenceDate: date,
      sets: sets.map((s) => ({
        block: s.block ?? "utama",
        reps: s.reps,
        distanceM: s.distance_m,
        stroke: s.stroke,
        intervalSec: s.interval_sec,
        description: s.description ?? undefined,
      })),
    });
    practiceIds.push(saved.id);
  }
  return { practiceIds };
}

export async function skipSeriesRange(
  actor: Actor,
  input: { id: number; fromDate: string; toDate: string; reason: string },
): Promise<{ ok: true }> {
  const clubId = await requireCoach(actor);
  const reason = input.reason.trim() || "Libur";
  const series = await actor.sql<{ weekday: number }>`
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
  return actor.sql<{
    id: number;
    title: string;
    weekday: number;
    start_time: string | null;
    location: string | null;
    horizon_weeks: number;
  }>`
    select id, title, weekday, start_time, location, horizon_weeks
    from practice_series where club_id = ${clubId} and active = true
    order by weekday, start_time, id
  `;
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
