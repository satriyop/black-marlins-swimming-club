import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import {
  canMarkAttendance,
  canRequestAttendanceCorrection,
  canSubmitAbsenceNotice,
} from "./permissions";
import { absenceCutoffLabel, isBeforeAbsenceCutoff } from "./absence-window";
import { markPracticeInProgress } from "./practice";
import type { AttendanceStatus, PracticeStatus } from "@/lib/swim/types";

export type AttendanceHistoryRow = {
  practiceId: number;
  attendanceId: number;
  sessionDate: string;
  title: string;
  startTime: string | null;
  status: AttendanceStatus;
  metersCompleted: number | null;
  noticeKind: "izin" | "sakit" | null;
  noticeStatus: "active" | "withdrawn" | null;
  noticeReason: string | null;
  correctionStatus: "pending" | "resolved" | "rejected" | null;
  correctionResolution: string | null;
  cutoffLabel: string;
};

export { absenceCutoffLabel, isBeforeAbsenceCutoff } from "./absence-window";

async function requireClubId(actor: Actor): Promise<number> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  return clubId;
}

export async function updateAttendanceStatus(
  actor: Actor,
  input: {
    id: number;
    status: AttendanceStatus;
    metersCompleted?: number | null;
  },
): Promise<{ ok: true }> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{
    swimmer_id: number;
    practice_id: number;
    practice_status: PracticeStatus;
    on_roll: boolean;
    status: AttendanceStatus;
    meters_completed: number | null;
  }>`
    select a.swimmer_id, a.practice_id, p.status as practice_status, a.on_roll, a.status, a.meters_completed
    from practice_attendance a
    join practices p on p.id = a.practice_id
    where a.id = ${input.id} and a.club_id = ${clubId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Perenang tidak ditemukan");
  if (row.practice_status === "completed" || row.practice_status === "cancelled") {
    throw new Error("Sesi sudah ditutup atau dibatalkan.");
  }
  if (!row.on_roll) throw new Error("Perenang tidak ada di daftar sesi ini");
  if (!canMarkAttendance(hats, row.swimmer_id, input.status)) throw new Error("Tidak diizinkan");
  if ("metersCompleted" in input && input.metersCompleted != null) {
    if (!Number.isFinite(input.metersCompleted) || input.metersCompleted < 0) {
      throw new Error("Jarak tidak valid");
    }
  }
  const nextMeters =
    "metersCompleted" in input ? input.metersCompleted ?? null : row.meters_completed;
  await actor.sql`
    update practice_attendance
    set status = ${input.status}, meters_completed = ${nextMeters}
    where id = ${input.id} and club_id = ${clubId}
  `;
  await actor.sql`
    insert into attendance_events (club_id, attendance_id, actor_id, from_status, to_status, from_meters, to_meters)
    values (
      ${clubId}, ${input.id}, ${actor.userId}, ${row.status}, ${input.status},
      ${row.meters_completed}, ${nextMeters}
    )
  `;
  if (hats.staff != null && input.status !== "belum") {
    await markPracticeInProgress(actor, row.practice_id);
  }
  return { ok: true };
}

type PracticeGate = {
  club_id: number;
  session_date: string;
  start_time: string | null;
  status: PracticeStatus;
};

async function loadPracticeGate(actor: Actor, clubId: number, practiceId: number): Promise<PracticeGate> {
  const rows = await actor.sql<PracticeGate>`
    select club_id, session_date::text as session_date, start_time, status
    from practices where id = ${practiceId} and club_id = ${clubId} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Sesi latihan tidak ditemukan");
  return row;
}

function assertFamilyNoticeWindow(practice: PracticeGate): void {
  if (practice.status === "completed" || practice.status === "cancelled") {
    throw new Error("Sesi sudah ditutup atau dibatalkan.");
  }
  const date = (practice.session_date || "").slice(0, 10);
  if (!isBeforeAbsenceCutoff(date, practice.start_time)) {
    throw new Error(`Batas waktu izin sudah lewat. ${absenceCutoffLabel(date, practice.start_time)}`);
  }
}

export async function saveAbsenceNotice(
  actor: Actor,
  input: { practiceId: number; swimmerId: number; kind: "izin" | "sakit"; reason?: string },
): Promise<{ id: number }> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  if (!canSubmitAbsenceNotice(hats, input.swimmerId)) throw new Error("Tidak diizinkan");
  const practice = await loadPracticeGate(actor, clubId, input.practiceId);
  assertFamilyNoticeWindow(practice);
  const onSession = await actor.sql<{ n: number }>`
    select count(*)::int as n from practice_attendance
    where practice_id = ${input.practiceId} and swimmer_id = ${input.swimmerId} and club_id = ${clubId} and on_roll = true
  `;
  if ((onSession[0]?.n ?? 0) === 0) throw new Error("Perenang tidak ada di daftar sesi ini");
  const reason = input.reason?.trim() || null;
  const rows = await actor.sql<{ id: number }>`
    insert into absence_notices (
      club_id, practice_id, swimmer_id, kind, reason, status, created_by, withdrawn_at, withdrawn_by, revision
    )
    values (
      ${clubId}, ${input.practiceId}, ${input.swimmerId}, ${input.kind}, ${reason}, 'active', ${actor.userId},
      null, null, 1
    )
    on conflict (practice_id, swimmer_id) do update set
      kind = excluded.kind,
      reason = excluded.reason,
      status = 'active',
      updated_at = now(),
      withdrawn_at = null,
      withdrawn_by = null,
      revision = absence_notices.revision + 1
    returning id
  `;
  return { id: rows[0]!.id };
}

export async function withdrawAbsenceNotice(
  actor: Actor,
  input: { practiceId: number; swimmerId: number },
): Promise<{ ok: true }> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  if (!canSubmitAbsenceNotice(hats, input.swimmerId)) throw new Error("Tidak diizinkan");
  const practice = await loadPracticeGate(actor, clubId, input.practiceId);
  assertFamilyNoticeWindow(practice);
  const rows = await actor.sql<{ id: number; status: string }>`
    select id, status from absence_notices
    where practice_id = ${input.practiceId} and swimmer_id = ${input.swimmerId} and club_id = ${clubId}
    limit 1
  `;
  const row = rows[0];
  if (!row || row.status !== "active") throw new Error("Tidak ada izin aktif");
  await actor.sql`
    update absence_notices
    set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = ${actor.userId},
        updated_at = now(), revision = revision + 1
    where id = ${row.id} and club_id = ${clubId}
  `;
  return { ok: true };
}

export async function requestAttendanceCorrection(
  actor: Actor,
  input: { attendanceId: number; message: string },
): Promise<{ id: number }> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const message = input.message.trim();
  if (!message) throw new Error("Pesan wajib diisi");
  const rows = await actor.sql<{
    swimmer_id: number;
    practice_id: number;
    practice_status: PracticeStatus;
    session_date: string;
    start_time: string | null;
  }>`
    select a.swimmer_id, a.practice_id, p.status as practice_status,
           p.session_date::text as session_date, p.start_time
    from practice_attendance a
    join practices p on p.id = a.practice_id
    where a.id = ${input.attendanceId} and a.club_id = ${clubId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Perenang tidak ditemukan");
  if (!canRequestAttendanceCorrection(hats, row.swimmer_id)) throw new Error("Tidak diizinkan");
  const date = (row.session_date || "").slice(0, 10);
  const afterCutoff = !isBeforeAbsenceCutoff(date, row.start_time);
  if (row.practice_status !== "completed" && !afterCutoff) {
    throw new Error("Koreksi hanya setelah sesi selesai atau melewati batas izin.");
  }
  const pending = await actor.sql<{ n: number }>`
    select count(*)::int as n from attendance_corrections
    where attendance_id = ${input.attendanceId} and club_id = ${clubId} and status = 'pending'
  `;
  if ((pending[0]?.n ?? 0) > 0) throw new Error("Koreksi menunggu");
  const inserted = await actor.sql<{ id: number }>`
    insert into attendance_corrections (
      club_id, practice_id, swimmer_id, attendance_id, message, requested_by
    )
    values (
      ${clubId}, ${row.practice_id}, ${row.swimmer_id}, ${input.attendanceId}, ${message}, ${actor.userId}
    )
    returning id
  `;
  return { id: inserted[0]!.id };
}

export async function resolveAttendanceCorrection(
  actor: Actor,
  input: { id: number; status: "resolved" | "rejected"; resolution: string },
): Promise<{ ok: true }> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  if (!canMarkAttendance(hats, 0)) throw new Error("Tidak diizinkan");
  const resolution = input.resolution.trim();
  if (!resolution) throw new Error("Penjelasan wajib diisi");
  const rows = await actor.sql<{ id: number; status: string }>`
    select id, status from attendance_corrections where id = ${input.id} and club_id = ${clubId} limit 1
  `;
  if (!rows[0] || rows[0].status !== "pending") throw new Error("Pengajuan tidak ditemukan");
  await actor.sql`
    update attendance_corrections
    set status = ${input.status}, resolution = ${resolution}, resolved_by = ${actor.userId}, resolved_at = now()
    where id = ${input.id} and club_id = ${clubId}
  `;
  return { ok: true };
}

export async function listAttendanceHistory(
  actor: Actor,
  swimmerId: number,
): Promise<AttendanceHistoryRow[]> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  if (!canSeeSwimmer(hats, swimmerId)) throw new Error("Tidak diizinkan");
  const rows = await actor.sql<{
    practice_id: number;
    attendance_id: number;
    session_date: string;
    title: string;
    start_time: string | null;
    status: AttendanceStatus;
    meters_completed: number | null;
    notice_kind: "izin" | "sakit" | null;
    notice_status: "active" | "withdrawn" | null;
    notice_reason: string | null;
    correction_status: "pending" | "resolved" | "rejected" | null;
    correction_resolution: string | null;
  }>`
    select p.id as practice_id, a.id as attendance_id, p.session_date::text as session_date, p.title, p.start_time,
           a.status, a.meters_completed,
           n.kind as notice_kind, n.status as notice_status, n.reason as notice_reason,
           c.status as correction_status, c.resolution as correction_resolution
    from practice_attendance a
    join practices p on p.id = a.practice_id
    left join absence_notices n on n.practice_id = a.practice_id and n.swimmer_id = a.swimmer_id
    left join lateral (
      select status, resolution from attendance_corrections
      where attendance_id = a.id
      order by requested_at desc
      limit 1
    ) c on true
    where a.club_id = ${clubId} and a.swimmer_id = ${swimmerId}
    order by p.session_date desc, p.start_time desc, a.id desc
  `;
  return rows.map((r) => {
    const date = (r.session_date || "").slice(0, 10);
    return {
      practiceId: r.practice_id,
      attendanceId: r.attendance_id,
      sessionDate: date,
      title: r.title,
      startTime: r.start_time,
      status: r.status,
      metersCompleted: r.meters_completed,
      noticeKind: r.notice_kind,
      noticeStatus: r.notice_status,
      noticeReason: r.notice_reason,
      correctionStatus: r.correction_status,
      correctionResolution: r.correction_resolution,
      cutoffLabel: absenceCutoffLabel(date, r.start_time),
    };
  });
}

export async function listPracticeAttendance(actor: Actor, practiceId: number) {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{ swimmer_id: number; swimmer_name: string }>`
    select a.swimmer_id, s.full_name as swimmer_name
    from practice_attendance a join swimmers s on s.id = a.swimmer_id
    where a.practice_id = ${practiceId} and a.club_id = ${clubId}
  `;
  return rows.filter((r) => canSeeSwimmer(hats, r.swimmer_id));
}
