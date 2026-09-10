import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ensureSeeded } from "./bootstrap";
import type { Attendance, Practice, PracticeDetail, PracticeSet } from "@/lib/swim/types";

export type SetInput = {
  block: string; reps: number; distanceM: number; stroke: string; intervalSec?: number | null; description?: string;
};

export const listPractices = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  await ensureSeeded(context.userId);
  const sql = await getSql();
  const rows = await sql<{
    id: number; session_date: string; start_time: string | null; duration_min: number | null;
    location: string | null; kind: string; title: string; focus: string | null;
    total_meters: number; notes: string | null; present_count: number; roster_count: number;
  }>`select p.*, coalesce(sum(case when a.status = 'hadir' then 1 else 0 end), 0)::int as present_count, count(a.id)::int as roster_count from practices p left join practice_attendance a on a.practice_id = p.id where p.user_id = ${context.userId} group by p.id order by p.session_date desc, p.start_time desc`;
  return rows.map((p): Practice => ({
    id: p.id, sessionDate: p.session_date, startTime: p.start_time, durationMin: p.duration_min,
    location: p.location, kind: p.kind, title: p.title, focus: p.focus,
    totalMeters: p.total_meters, notes: p.notes, presentCount: p.present_count, rosterCount: p.roster_count,
  }));
});

export const getPractice = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }): Promise<PracticeDetail> => {
  const sql = await getSql();
  const rows = await sql<{
    id: number; session_date: string; start_time: string | null; duration_min: number | null;
    location: string | null; kind: string; title: string; focus: string | null; total_meters: number; notes: string | null;
  }>`select * from practices where id = ${data.id} and user_id = ${context.userId} limit 1`;
  const p = rows[0];
  if (!p) throw new Error("Sesi latihan tidak ditemukan");
  const sets = await sql<{
    id: number; practice_id: number; sort_order: number; block: string | null; reps: number;
    distance_m: number; stroke: string; interval_sec: number | null; description: string | null;
  }>`select * from practice_sets where practice_id = ${data.id} and user_id = ${context.userId} order by sort_order, id`;
  const attendance = await sql<{
    id: number; practice_id: number; swimmer_id: number; swimmer_name: string;
    status: "hadir" | "izin" | "sakit" | "alfa"; meters_completed: number | null; notes: string | null;
  }>`select a.*, s.full_name as swimmer_name from practice_attendance a join swimmers s on s.id = a.swimmer_id where a.practice_id = ${data.id} and a.user_id = ${context.userId} order by s.full_name`;
  return {
    id: p.id, sessionDate: p.session_date, startTime: p.start_time, durationMin: p.duration_min,
    location: p.location, kind: p.kind, title: p.title, focus: p.focus, totalMeters: p.total_meters, notes: p.notes,
    sets: sets.map((s): PracticeSet => ({ id: s.id, practiceId: s.practice_id, sortOrder: s.sort_order, block: s.block, reps: s.reps, distanceM: s.distance_m, stroke: s.stroke, intervalSec: s.interval_sec, description: s.description })),
    attendance: attendance.map((a): Attendance => ({ id: a.id, practiceId: a.practice_id, swimmerId: a.swimmer_id, swimmerName: a.swimmer_name, status: a.status, metersCompleted: a.meters_completed, notes: a.notes })),
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
  const sql = await getSql();
  const total = data.sets.reduce((acc, s) => acc + s.reps * s.distanceM, 0);
  let practiceId = data.id;
  if (practiceId) {
    await sql`update practices set session_date = ${data.sessionDate}, start_time = ${data.startTime || null}, duration_min = ${data.durationMin ?? null}, location = ${data.location?.trim() || null}, kind = ${data.kind}, title = ${data.title.trim()}, focus = ${data.focus?.trim() || null}, total_meters = ${total}, notes = ${data.notes?.trim() || null} where id = ${practiceId} and user_id = ${context.userId}`;
    await sql`delete from practice_sets where practice_id = ${practiceId} and user_id = ${context.userId}`;
  } else {
    const rows = await sql<{ id: number }>`insert into practices (user_id, session_date, start_time, duration_min, location, kind, title, focus, total_meters, notes) values (${context.userId}, ${data.sessionDate}, ${data.startTime || null}, ${data.durationMin ?? null}, ${data.location?.trim() || null}, ${data.kind}, ${data.title.trim()}, ${data.focus?.trim() || null}, ${total}, ${data.notes?.trim() || null}) returning id`;
    practiceId = rows[0]!.id;
    const roster = await sql<{ id: number }>`select id from swimmers where user_id = ${context.userId} and status = 'aktif'`;
    for (const s of roster) {
      await sql`insert into practice_attendance (user_id, practice_id, swimmer_id, status, meters_completed) values (${context.userId}, ${practiceId}, ${s.id}, 'hadir', ${total})`;
    }
  }
  for (let i = 0; i < data.sets.length; i++) {
    const s = data.sets[i]!;
    await sql`insert into practice_sets (user_id, practice_id, sort_order, block, reps, distance_m, stroke, interval_sec, description) values (${context.userId}, ${practiceId}, ${i}, ${s.block}, ${s.reps}, ${s.distanceM}, ${s.stroke}, ${s.intervalSec ?? null}, ${s.description?.trim() || null})`;
  }
  return { id: practiceId };
});

export const deletePractice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  await (await getSql())`delete from practices where id = ${data.id} and user_id = ${context.userId}`;
  return { ok: true };
});

export const updateAttendance = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number; status: "hadir" | "izin" | "sakit" | "alfa"; metersCompleted?: number | null }) => input).handler(async ({ context, data }) => {
  await (await getSql())`update practice_attendance set status = ${data.status}, meters_completed = ${data.metersCompleted ?? null} where id = ${data.id} and user_id = ${context.userId}`;
  return { ok: true };
});
