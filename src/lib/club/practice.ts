import type { Actor } from "./actor";
import { absenceCutoffLabel, isBeforeAbsenceCutoff } from "./absence-window";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canWritePractice } from "./permissions";
import type { Attendance, Practice, PracticeDetail, PracticeStatus } from "@/lib/swim/types";
import { jakartaNowParts } from "@/lib/utils";

export type PracticeSetInput = {
  block: string;
  reps: number;
  distanceM: number;
  stroke: string;
  intervalSec?: number | null;
  description?: string;
};

export type PracticeRow = {
  id: number;
  session_date: string;
  start_time: string | null;
  duration_min: number | null;
  location: string | null;
  kind: string;
  title: string;
  focus: string | null;
  total_meters: number;
  notes: string | null;
  status: PracticeStatus;
  cancel_reason: string | null;
  reopen_reason: string | null;
  original_session_date: string | null;
  original_start_time: string | null;
  original_location: string | null;
  revision: number;
  incomplete_ack: boolean;
  series_id: number | null;
  occurrence_date: string | null;
};

type PracticeSummaryRow = PracticeRow & { present_count: number; roster_count: number };

function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

function mapPracticeSummary(row: PracticeSummaryRow): Practice {
  return {
    ...mapPractice(row),
    presentCount: row.present_count,
    rosterCount: row.roster_count,
  };
}

/** A bounded read model for the operational practice workspace. */
export async function listPracticeSummaries(
  actor: Actor,
  input: { view: "overview" | "history"; page?: number; today?: string },
): Promise<Practice[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const today = input.today ?? jakartaNowParts().date;
  const select = `
    select p.id, p.session_date::text as session_date, p.start_time, p.duration_min, p.location,
           p.kind, p.title, p.focus, p.total_meters, p.notes, p.status, p.cancel_reason,
           p.reopen_reason, p.original_session_date::text as original_session_date,
           p.original_start_time, p.original_location, p.revision, p.incomplete_ack,
           p.series_id, p.occurrence_date::text as occurrence_date,
           coalesce(sum(case when a.on_roll and a.status = 'hadir' then 1 else 0 end), 0)::int as present_count,
           coalesce(sum(case when a.on_roll then 1 else 0 end), 0)::int as roster_count
    from practices p
    left join practice_attendance a on a.practice_id = p.id
  `;
  const group = " group by p.id ";
  if (input.view === "history") {
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const rows = await actor.sql.query<PracticeSummaryRow>(
      `${select} where p.club_id = $1 and p.session_date < $2::date ${group}
       order by p.session_date desc, p.start_time desc, p.id desc limit 20 offset $3`,
      [clubId, today, (page - 1) * 20],
    );
    return rows.map(mapPracticeSummary);
  }
  const through = addIsoDays(today, 7);
  const rows = await actor.sql.query<PracticeSummaryRow>(
    `${select} where p.club_id = $1 and p.session_date between $2::date and $3::date ${group}
     order by p.session_date asc, p.start_time asc, p.id asc limit 24`,
    [clubId, today, through],
  );
  return rows.map(mapPracticeSummary);
}

function dayBeforeIso(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function asDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function mapPractice(p: PracticeRow) {
  return {
    id: p.id,
    sessionDate: asDate(p.session_date) ?? "",
    startTime: p.start_time,
    durationMin: p.duration_min,
    location: p.location,
    kind: p.kind,
    title: p.title,
    focus: p.focus,
    totalMeters: p.total_meters,
    notes: p.notes,
    status: p.status,
    cancelReason: p.cancel_reason,
    reopenReason: p.reopen_reason,
    originalSessionDate: asDate(p.original_session_date),
    originalStartTime: p.original_start_time,
    originalLocation: p.original_location,
    revision: p.revision,
    incompleteAck: p.incomplete_ack,
    seriesId: p.series_id,
    occurrenceDate: asDate(p.occurrence_date),
  };
}

async function requireWritableClub(actor: Actor): Promise<{ clubId: number }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (!canWritePractice(hats)) throw new Error("Tidak diizinkan");
  return { clubId };
}

async function loadRow(actor: Actor, clubId: number, id: number): Promise<PracticeRow> {
  const rows = await actor.sql<PracticeRow>`
    select id, session_date::text as session_date, start_time, duration_min, location, kind, title, focus,
           total_meters, notes, status, cancel_reason, reopen_reason,
           original_session_date::text as original_session_date, original_start_time, original_location,
           revision, incomplete_ack, series_id, occurrence_date::text as occurrence_date
    from practices where id = ${id} and club_id = ${clubId} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Sesi latihan tidak ditemukan");
  return row;
}

function assertOpen(status: PracticeStatus): void {
  if (status === "completed") throw new Error("Sesi sudah selesai. Buka kembali untuk mengubah.");
  if (status === "cancelled") throw new Error("Sesi dibatalkan.");
}

/**
 * Writes a program (title/schedule fields/focus/notes/sets) onto a series and cascades it to
 * that series' already-materialized, still-open future occurrences. Shared by editing a single
 * opened day with scope "future" and by editing a schedule's program directly.
 */
export async function applyProgramToSeries(
  sql: Actor["sql"],
  clubId: number,
  seriesId: number,
  program: {
    title: string;
    startTime: string | null;
    durationMin: number | null;
    location: string | null;
    kind: string;
    focus: string | null;
    notes: string | null;
    sets: PracticeSetInput[];
  },
  opts: { excludePracticeId?: number; fromDate?: string } = {},
): Promise<void> {
  const updated = await sql<{ id: number }>`
    update practice_series set
      title = ${program.title},
      start_time = ${program.startTime},
      duration_min = ${program.durationMin},
      location = ${program.location},
      kind = ${program.kind},
      focus = ${program.focus},
      notes = ${program.notes}
    where id = ${seriesId} and club_id = ${clubId}
    returning id
  `;
  if (!updated[0]) throw new Error("Jadwal tidak ditemukan");
  await sql`delete from practice_series_sets where series_id = ${seriesId} and club_id = ${clubId}`;
  for (let i = 0; i < program.sets.length; i++) {
    const s = program.sets[i]!;
    await sql`
      insert into practice_series_sets (club_id, series_id, sort_order, block, reps, distance_m, stroke, interval_sec, description)
      values (${clubId}, ${seriesId}, ${i}, ${s.block}, ${s.reps}, ${s.distanceM}, ${s.stroke}, ${s.intervalSec ?? null}, ${s.description?.trim() || null})
    `;
  }
  const total = program.sets.reduce((acc, s) => acc + s.reps * s.distanceM, 0);
  const future =
    opts.excludePracticeId != null && opts.fromDate
      ? await sql<{ id: number }>`
          select id from practices
          where club_id = ${clubId} and series_id = ${seriesId} and id <> ${opts.excludePracticeId}
            and status in ('scheduled', 'in_progress')
            and coalesce(occurrence_date, session_date) > ${opts.fromDate}::date
        `
      : await sql<{ id: number }>`
          select id from practices
          where club_id = ${clubId} and series_id = ${seriesId} and status in ('scheduled', 'in_progress')
        `;
  for (const f of future) {
    await sql`
      update practices set
        start_time = ${program.startTime},
        duration_min = ${program.durationMin},
        location = ${program.location},
        kind = ${program.kind},
        title = ${program.title},
        focus = ${program.focus},
        notes = ${program.notes},
        total_meters = ${total},
        revision = revision + 1
      where id = ${f.id} and club_id = ${clubId}
    `;
    await sql`delete from practice_sets where practice_id = ${f.id} and club_id = ${clubId}`;
    for (let i = 0; i < program.sets.length; i++) {
      const s = program.sets[i]!;
      await sql`
        insert into practice_sets (club_id, practice_id, sort_order, block, reps, distance_m, stroke, interval_sec, description)
        values (${clubId}, ${f.id}, ${i}, ${s.block}, ${s.reps}, ${s.distanceM}, ${s.stroke}, ${s.intervalSec ?? null}, ${s.description?.trim() || null})
      `;
    }
  }
}

export async function savePracticeRecord(
  actor: Actor,
  data: {
    id?: number;
    sessionDate: string;
    startTime?: string;
    durationMin?: number;
    location?: string;
    kind: string;
    title: string;
    focus?: string;
    notes?: string;
    sets: PracticeSetInput[];
    expectedRevision?: number;
    seriesId?: number;
    occurrenceDate?: string;
    scope?: "this" | "future";
  },
): Promise<{ id: number; revision: number; scheduleChanged: boolean }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (!canWritePractice(hats)) throw new Error("Tidak diizinkan");
  for (const s of data.sets) {
    if (s.distanceM <= 0 || s.reps <= 0) throw new Error("Set tidak valid");
  }
  const total = data.sets.reduce((acc, s) => acc + s.reps * s.distanceM, 0);
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    let practiceId = data.id;
    let revision = 1;
    let scheduleChanged = false;
    if (practiceId) {
      const current = await loadRow(a, clubId, practiceId);
      assertOpen(current.status);
      if (data.expectedRevision !== current.revision) {
        throw new Error("Sesi sudah diubah. Muat ulang.");
      }
      const nextDate = data.sessionDate;
      const nextTime = data.startTime || null;
      const nextLocation = data.location?.trim() || null;
      scheduleChanged =
        asDate(current.session_date) !== nextDate ||
        (current.start_time || null) !== nextTime ||
        (current.location || null) !== nextLocation;
      const keepOriginal = current.original_session_date != null;
      const originalDate = keepOriginal ? current.original_session_date : current.session_date;
      const originalTime = keepOriginal ? current.original_start_time : current.start_time;
      const originalLocation = keepOriginal ? current.original_location : current.location;
      revision = current.revision + 1;
      const updatedRows = await sql<{ id: number }>`
        update practices set
          session_date = ${nextDate},
          start_time = ${nextTime},
          duration_min = ${data.durationMin ?? null},
          location = ${nextLocation},
          kind = ${data.kind},
          title = ${data.title.trim()},
          focus = ${data.focus?.trim() || null},
          total_meters = ${total},
          notes = ${data.notes?.trim() || null},
          original_session_date = ${scheduleChanged ? originalDate : current.original_session_date},
          original_start_time = ${scheduleChanged ? originalTime : current.original_start_time},
          original_location = ${scheduleChanged ? originalLocation : current.original_location},
          revision = ${revision}
        where id = ${practiceId} and club_id = ${clubId} and revision = ${current.revision}
        returning id
      `;
      if (!updatedRows[0]) throw new Error("Sesi sudah diubah. Muat ulang.");
      await sql`delete from practice_sets where practice_id = ${practiceId} and club_id = ${clubId}`;
      if (data.scope === "future" && current.series_id) {
        const from = asDate(current.occurrence_date) ?? asDate(current.session_date);
        await applyProgramToSeries(
          sql,
          clubId,
          current.series_id,
          {
            title: data.title.trim(),
            startTime: nextTime,
            durationMin: data.durationMin ?? null,
            location: nextLocation,
            kind: data.kind,
            focus: data.focus?.trim() || null,
            notes: data.notes?.trim() || null,
            sets: data.sets,
          },
          { excludePracticeId: practiceId, fromDate: from ?? undefined },
        );
      }
    } else {
      const rows = await sql<{ id: number }>`
        insert into practices (club_id, session_date, start_time, duration_min, location, kind, title, focus, total_meters, notes, series_id, occurrence_date)
        values (
          ${clubId}, ${data.sessionDate}, ${data.startTime || null}, ${data.durationMin ?? null},
          ${data.location?.trim() || null}, ${data.kind}, ${data.title.trim()}, ${data.focus?.trim() || null},
          ${total}, ${data.notes?.trim() || null}, ${data.seriesId ?? null}, ${data.occurrenceDate ?? null}
        )
        returning id
      `;
      practiceId = rows[0]!.id;
      const roster = await sql<{ id: number }>`select id from swimmers where club_id = ${clubId} and status = 'aktif'`;
      for (const s of roster) {
        await sql`insert into practice_attendance (club_id, practice_id, swimmer_id, status, meters_completed, on_roll) values (${clubId}, ${practiceId}, ${s.id}, 'belum', null, true)`;
      }
    }
    for (let i = 0; i < data.sets.length; i++) {
      const s = data.sets[i]!;
      await sql`insert into practice_sets (club_id, practice_id, sort_order, block, reps, distance_m, stroke, interval_sec, description) values (${clubId}, ${practiceId}, ${i}, ${s.block}, ${s.reps}, ${s.distanceM}, ${s.stroke}, ${s.intervalSec ?? null}, ${s.description?.trim() || null})`;
    }
    return { id: practiceId!, revision, scheduleChanged };
  });
}

export async function loadPractice(actor: Actor, id: number): Promise<PracticeDetail> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const row = await loadRow(actor, clubId, id);
  const sets = await actor.sql<{
    id: number;
    practice_id: number;
    sort_order: number;
    block: string | null;
    reps: number;
    distance_m: number;
    stroke: string;
    interval_sec: number | null;
    description: string | null;
  }>`select * from practice_sets where practice_id = ${id} and club_id = ${clubId} order by sort_order, id`;
  const attendance = await actor.sql<{
    id: number;
    practice_id: number;
    swimmer_id: number;
    swimmer_name: string;
    status: Attendance["status"];
    meters_completed: number | null;
    notes: string | null;
    on_roll: boolean;
    notice_kind: "izin" | "sakit" | null;
    notice_status: "active" | "withdrawn" | null;
    notice_reason: string | null;
    notice_revision: number | null;
    correction_status: "pending" | "resolved" | "rejected" | null;
    correction_id: number | null;
    correction_message: string | null;
    correction_resolution: string | null;
  }>`
    select a.id, a.practice_id, a.swimmer_id, s.full_name as swimmer_name, a.status, a.meters_completed, a.notes, a.on_roll,
           n.kind as notice_kind, n.status as notice_status, n.reason as notice_reason, n.revision as notice_revision,
           c.status as correction_status, c.id as correction_id, c.message as correction_message, c.resolution as correction_resolution
    from practice_attendance a
    join swimmers s on s.id = a.swimmer_id
    left join absence_notices n on n.practice_id = a.practice_id and n.swimmer_id = a.swimmer_id
    left join lateral (
      select id, status, message, resolution from attendance_corrections
      where attendance_id = a.id
      order by requested_at desc
      limit 1
    ) c on true
    where a.practice_id = ${id} and a.club_id = ${clubId}
    order by a.on_roll desc, s.full_name
  `;
  const mapUrl = row.series_id
    ? (
        await actor.sql<{ map_url: string | null }>`
          select map_url from practice_series where id = ${row.series_id} and club_id = ${clubId} limit 1
        `
      )[0]?.map_url ?? null
    : null;
  return {
    ...mapPractice(row),
    mapUrl,
    sets: sets.map((s) => ({
      id: s.id,
      practiceId: s.practice_id,
      sortOrder: s.sort_order,
      block: s.block,
      reps: s.reps,
      distanceM: s.distance_m,
      stroke: s.stroke,
      intervalSec: s.interval_sec,
      description: s.description,
    })),
    attendance: attendance
      .filter((a) => canSeeSwimmer(hats, a.swimmer_id))
      .map(
        (a): Attendance => ({
          id: a.id,
          practiceId: a.practice_id,
          swimmerId: a.swimmer_id,
          swimmerName: a.swimmer_name,
          status: a.status,
          metersCompleted: a.meters_completed,
          notes: a.notes,
          onRoll: a.on_roll,
          notice: a.notice_kind
            ? {
                kind: a.notice_kind,
                status: a.notice_status ?? "active",
                reason: a.notice_reason,
                revision: a.notice_revision ?? 1,
              }
            : null,
          correctionStatus: a.correction_status,
          correctionId: a.correction_id,
          correctionMessage: a.correction_message,
          correctionResolution: a.correction_resolution,
          cutoffLabel: absenceCutoffLabel(asDate(row.session_date) ?? "", row.start_time),
          noticeEditable:
            row.status !== "completed" &&
            row.status !== "cancelled" &&
            isBeforeAbsenceCutoff(asDate(row.session_date) ?? "", row.start_time),
          canRequestCorrection:
            row.status === "completed" ||
            !isBeforeAbsenceCutoff(asDate(row.session_date) ?? "", row.start_time),
        }),
      ),
  };
}

function assertExpectedRevision(row: PracticeRow, expected: number | undefined): void {
  if (expected !== row.revision) throw new Error("Sesi sudah diubah. Muat ulang.");
}

export async function cancelPractice(
  actor: Actor,
  input: { id: number; reason: string; expectedRevision: number; scope?: "this" | "future" },
): Promise<{ id: number }> {
  const { clubId } = await requireWritableClub(actor);
  const reason = input.reason.trim();
  if (!reason) throw new Error("Alasan pembatalan wajib diisi.");
  const row = await loadRow(actor, clubId, input.id);
  assertExpectedRevision(row, input.expectedRevision);
  if (row.status === "cancelled") throw new Error("Sesi sudah dibatalkan.");
  if (row.status === "completed") throw new Error("Sesi sudah selesai. Buka kembali untuk membatalkan.");
  const bumped = await actor.sql<{ id: number }>`
    update practices
    set status = 'cancelled', cancel_reason = ${reason}, revision = revision + 1
    where id = ${input.id} and club_id = ${clubId} and revision = ${row.revision}
    returning id
  `;
  if (!bumped[0]) throw new Error("Sesi sudah diubah. Muat ulang.");
  if (input.scope === "future" && row.series_id) {
    const from = asDate(row.occurrence_date) ?? asDate(row.session_date);
    await actor.sql`
      update practices
      set status = 'cancelled', cancel_reason = ${reason}, revision = revision + 1
      where club_id = ${clubId}
        and series_id = ${row.series_id}
        and id <> ${input.id}
        and status in ('scheduled', 'in_progress')
        and coalesce(occurrence_date, session_date) > ${from}::date
    `;
    const until = dayBeforeIso(from!);
    await actor.sql`
      update practice_series
      set until_date = ${until}, active = false
      where id = ${row.series_id} and club_id = ${clubId}
        and (until_date is null or until_date > ${until}::date)
    `;
  }
  return { id: input.id };
}

export async function completePractice(
  actor: Actor,
  input: { id: number; acknowledgeIncomplete?: boolean; expectedRevision: number },
): Promise<{ id: number }> {
  const { clubId } = await requireWritableClub(actor);
  const row = await loadRow(actor, clubId, input.id);
  assertExpectedRevision(row, input.expectedRevision);
  if (row.status === "cancelled") throw new Error("Sesi dibatalkan.");
  if (row.status === "completed") throw new Error("Sesi sudah selesai.");
  const unmarked = await actor.sql<{ n: number }>`
    select count(*)::int as n from practice_attendance
    where practice_id = ${input.id} and club_id = ${clubId} and on_roll = true and status = 'belum'
  `;
  const hasUnmarked = (unmarked[0]?.n ?? 0) > 0;
  if (hasUnmarked && !input.acknowledgeIncomplete) {
    throw new Error("Ada perenang belum dicatat.");
  }
  const bumped = await actor.sql<{ id: number }>`
    update practices
    set status = 'completed',
        completed_at = now(),
        completed_by = ${actor.userId},
        incomplete_ack = ${hasUnmarked},
        revision = revision + 1
    where id = ${input.id} and club_id = ${clubId} and revision = ${row.revision}
    returning id
  `;
  if (!bumped[0]) throw new Error("Sesi sudah diubah. Muat ulang.");
  return { id: input.id };
}

export async function reopenPractice(
  actor: Actor,
  input: { id: number; reason: string; expectedRevision: number },
): Promise<{ id: number }> {
  const { clubId } = await requireWritableClub(actor);
  const reason = input.reason.trim();
  if (!reason) throw new Error("Alasan membuka kembali wajib diisi.");
  const row = await loadRow(actor, clubId, input.id);
  assertExpectedRevision(row, input.expectedRevision);
  if (row.status !== "completed" && row.status !== "cancelled") {
    throw new Error("Sesi ini belum ditutup.");
  }
  const hadir = await actor.sql<{ n: number }>`
    select count(*)::int as n from practice_attendance
    where practice_id = ${input.id} and club_id = ${clubId} and on_roll = true and status = 'hadir'
  `;
  const next: PracticeStatus = (hadir[0]?.n ?? 0) > 0 ? "in_progress" : "scheduled";
  const bumped = await actor.sql<{ id: number }>`
    update practices
    set status = ${next},
        reopen_reason = ${reason},
        completed_at = null,
        completed_by = null,
        incomplete_ack = false,
        cancel_reason = null,
        revision = revision + 1
    where id = ${input.id} and club_id = ${clubId} and revision = ${row.revision}
    returning id
  `;
  if (!bumped[0]) throw new Error("Sesi sudah diubah. Muat ulang.");
  return { id: input.id };
}

export async function addPracticeParticipant(
  actor: Actor,
  input: { practiceId: number; swimmerId: number },
): Promise<{ ok: true }> {
  const { clubId } = await requireWritableClub(actor);
  const row = await loadRow(actor, clubId, input.practiceId);
  assertOpen(row.status);
  const swimmer = await actor.sql<{ id: number }>`
    select id from swimmers where id = ${input.swimmerId} and club_id = ${clubId} limit 1
  `;
  if (!swimmer[0]) throw new Error("Perenang tidak ditemukan");
  await actor.sql`
    insert into practice_attendance (club_id, practice_id, swimmer_id, status, meters_completed, on_roll)
    values (${clubId}, ${input.practiceId}, ${input.swimmerId}, 'belum', null, true)
    on conflict (practice_id, swimmer_id) do update set on_roll = true
  `;
  return { ok: true };
}

export async function removePracticeParticipant(
  actor: Actor,
  input: { practiceId: number; swimmerId: number },
): Promise<{ ok: true }> {
  const { clubId } = await requireWritableClub(actor);
  const row = await loadRow(actor, clubId, input.practiceId);
  assertOpen(row.status);
  const att = await actor.sql<{ id: number; status: string; meters_completed: number | null }>`
    select id, status, meters_completed from practice_attendance
    where practice_id = ${input.practiceId} and swimmer_id = ${input.swimmerId} and club_id = ${clubId}
    limit 1
  `;
  const found = att[0];
  if (!found) throw new Error("Perenang tidak ada di sesi ini");
  const notice = await actor.sql<{ n: number }>`
    select count(*)::int as n from absence_notices
    where practice_id = ${input.practiceId} and swimmer_id = ${input.swimmerId} and club_id = ${clubId}
  `;
  if (found.status === "belum" && found.meters_completed == null && (notice[0]?.n ?? 0) === 0) {
    await actor.sql`delete from practice_attendance where id = ${found.id} and club_id = ${clubId}`;
  } else {
    await actor.sql`update practice_attendance set on_roll = false where id = ${found.id} and club_id = ${clubId}`;
  }
  return { ok: true };
}

export async function markPracticeInProgress(actor: Actor, practiceId: number): Promise<void> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) return;
  await actor.sql`
    update practices set status = 'in_progress'
    where id = ${practiceId} and club_id = ${clubId} and status = 'scheduled'
  `;
}
