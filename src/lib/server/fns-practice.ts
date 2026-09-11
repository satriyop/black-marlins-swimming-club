import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import { updateAttendanceStatus } from "@/lib/club/attendance";
import { canSeeSwimmer, hatsFor } from "@/lib/club/hats";
import { savePracticeRecord } from "@/lib/club/practice";
import { deletePractice as deletePracticeFor } from "@/lib/club/writes";
import type { Attendance, Practice, PracticeDetail, PracticeSet } from "@/lib/swim/types";

export type SetInput = {
  block: string; reps: number; distanceM: number; stroke: string; intervalSec?: number | null; description?: string;
};

export const listPractices = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const { sql, clubId } = await requireClub(context.userId);
  const rows = await sql<{
    id: number; session_date: string; start_time: string | null; duration_min: number | null;
    location: string | null; kind: string; title: string; focus: string | null;
    total_meters: number; notes: string | null; present_count: number; roster_count: number;
  }>`select p.*, coalesce(sum(case when a.status = 'hadir' then 1 else 0 end), 0)::int as present_count, count(a.id)::int as roster_count from practices p left join practice_attendance a on a.practice_id = p.id where p.club_id = ${clubId} group by p.id order by p.session_date desc, p.start_time desc`;
  return rows.map((p): Practice => ({
    id: p.id, sessionDate: p.session_date, startTime: p.start_time, durationMin: p.duration_min,
    location: p.location, kind: p.kind, title: p.title, focus: p.focus,
    totalMeters: p.total_meters, notes: p.notes, presentCount: p.present_count, rosterCount: p.roster_count,
  }));
});

export const getPractice = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }): Promise<PracticeDetail> => {
  const { sql, clubId, userId } = await requireClub(context.userId);
  const hats = await hatsFor({ sql, userId });
  const rows = await sql<{
    id: number; session_date: string; start_time: string | null; duration_min: number | null;
    location: string | null; kind: string; title: string; focus: string | null; total_meters: number; notes: string | null;
  }>`select * from practices where id = ${data.id} and club_id = ${clubId} limit 1`;
  const p = rows[0];
  if (!p) throw new Error("Sesi latihan tidak ditemukan");
  const sets = await sql<{
    id: number; practice_id: number; sort_order: number; block: string | null; reps: number;
    distance_m: number; stroke: string; interval_sec: number | null; description: string | null;
  }>`select * from practice_sets where practice_id = ${data.id} and club_id = ${clubId} order by sort_order, id`;
  const attendance = await sql<{
    id: number; practice_id: number; swimmer_id: number; swimmer_name: string;
    status: "belum" | "hadir" | "izin" | "sakit" | "alfa"; meters_completed: number | null; notes: string | null;
  }>`select a.*, s.full_name as swimmer_name from practice_attendance a join swimmers s on s.id = a.swimmer_id where a.practice_id = ${data.id} and a.club_id = ${clubId} order by s.full_name`;
  return {
    id: p.id, sessionDate: p.session_date, startTime: p.start_time, durationMin: p.duration_min,
    location: p.location, kind: p.kind, title: p.title, focus: p.focus, totalMeters: p.total_meters, notes: p.notes,
    sets: sets.map((s): PracticeSet => ({ id: s.id, practiceId: s.practice_id, sortOrder: s.sort_order, block: s.block, reps: s.reps, distanceM: s.distance_m, stroke: s.stroke, intervalSec: s.interval_sec, description: s.description })),
    attendance: attendance.filter((a) => canSeeSwimmer(hats, a.swimmer_id)).map((a): Attendance => ({ id: a.id, practiceId: a.practice_id, swimmerId: a.swimmer_id, swimmerName: a.swimmer_name, status: a.status, metersCompleted: a.meters_completed, notes: a.notes })),
  };
});

export const savePractice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id?: number; sessionDate: string; startTime?: string; durationMin?: number; location?: string;
  kind: string; title: string; focus?: string; notes?: string; sets: SetInput[];
}) => {
  if (!input.title.trim()) throw new Error("Judul wajib diisi");
  if (!input.sessionDate) throw new Error("Tanggal wajib diisi");
  return input;
}).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return savePracticeRecord(actor, data);
});

export const deletePractice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return deletePracticeFor(actor, data.id);
});

export const updateAttendance = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number; status: "belum" | "hadir" | "izin" | "sakit" | "alfa"; metersCompleted?: number | null }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return updateAttendanceStatus(actor, data);
});
