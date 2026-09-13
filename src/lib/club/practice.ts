import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canWritePractice } from "./permissions";
import type { Attendance, PracticeDetail, PracticeStatus } from "@/lib/swim/types";

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
};

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
           revision, incomplete_ack
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
  await actor.sql.query("begin");
  try {
    let practiceId = data.id;
    let revision = 1;
    let scheduleChanged = false;
    if (practiceId) {
      const current = await loadRow(actor, clubId, practiceId);
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
      const updatedRows = await actor.sql<{ id: number }>`
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
      await actor.sql`delete from practice_sets where practice_id = ${practiceId} and club_id = ${clubId}`;
    } else {
      const rows = await actor.sql<{ id: number }>`
        insert into practices (club_id, session_date, start_time, duration_min, location, kind, title, focus, total_meters, notes)
        values (
          ${clubId}, ${data.sessionDate}, ${data.startTime || null}, ${data.durationMin ?? null},
          ${data.location?.trim() || null}, ${data.kind}, ${data.title.trim()}, ${data.focus?.trim() || null},
          ${total}, ${data.notes?.trim() || null}
        )
        returning id
      `;
      practiceId = rows[0]!.id;
      const roster = await actor.sql<{ id: number }>`select id from swimmers where club_id = ${clubId} and status = 'aktif'`;
      for (const s of roster) {
        await actor.sql`insert into practice_attendance (club_id, practice_id, swimmer_id, status, meters_completed, on_roll) values (${clubId}, ${practiceId}, ${s.id}, 'belum', null, true)`;
      }
    }
    for (let i = 0; i < data.sets.length; i++) {
      const s = data.sets[i]!;
      await actor.sql`insert into practice_sets (club_id, practice_id, sort_order, block, reps, distance_m, stroke, interval_sec, description) values (${clubId}, ${practiceId}, ${i}, ${s.block}, ${s.reps}, ${s.distanceM}, ${s.stroke}, ${s.intervalSec ?? null}, ${s.description?.trim() || null})`;
    }
    await actor.sql.query("commit");
    return { id: practiceId!, revision, scheduleChanged };
  } catch (err) {
    try {
      await actor.sql.query("rollback");
    } catch {
      /* keep */
    }
    throw err;
  }
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
  }>`
    select a.id, a.practice_id, a.swimmer_id, s.full_name as swimmer_name, a.status, a.meters_completed, a.notes, a.on_roll
    from practice_attendance a join swimmers s on s.id = a.swimmer_id
    where a.practice_id = ${id} and a.club_id = ${clubId}
    order by a.on_roll desc, s.full_name
  `;
  return {
    ...mapPractice(row),
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
        }),
      ),
  };
}

function assertExpectedRevision(row: PracticeRow, expected: number | undefined): void {
  if (expected !== row.revision) throw new Error("Sesi sudah diubah. Muat ulang.");
}

export async function cancelPractice(
  actor: Actor,
  input: { id: number; reason: string; expectedRevision: number },
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
  if (found.status === "belum" && found.meters_completed == null) {
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
