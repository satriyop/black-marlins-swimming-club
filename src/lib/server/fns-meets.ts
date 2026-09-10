import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ensureSeeded } from "./bootstrap";
import { ageGroupForDob } from "@/lib/swim/age";
import type { Meet, MeetEntry, Result } from "@/lib/swim/types";

export const listMeets = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  await ensureSeeded(context.userId);
  const sql = await getSql();
  const rows = await sql<{
    id: number; name: string; level: string; course: string; venue: string | null; city: string | null;
    start_date: string; end_date: string | null; organizer: string | null; status: string; notes: string | null; entry_count: number;
  }>`select m.*, count(e.id)::int as entry_count from meets m left join meet_entries e on e.meet_id = m.id where m.user_id = ${context.userId} group by m.id order by m.start_date desc`;
  return rows.map((m): Meet => ({
    id: m.id, name: m.name, level: m.level, course: m.course, venue: m.venue, city: m.city,
    startDate: m.start_date, endDate: m.end_date, organizer: m.organizer, status: m.status, notes: m.notes, entryCount: m.entry_count,
  }));
});

export const getMeet = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const sql = await getSql();
  const rows = await sql<{
    id: number; name: string; level: string; course: string; venue: string | null; city: string | null;
    start_date: string; end_date: string | null; organizer: string | null; status: string; notes: string | null;
  }>`select * from meets where id = ${data.id} and user_id = ${context.userId} limit 1`;
  const m = rows[0];
  if (!m) throw new Error("Event tidak ditemukan");
  const entries = await sql<{
    id: number; meet_id: number; swimmer_id: number; swimmer_name: string; stroke: string; distance_m: number;
    age_group: string | null; seed_time_ms: number | null; status: string; lane: number | null; heat: string | null;
  }>`select e.*, s.full_name as swimmer_name from meet_entries e join swimmers s on s.id = e.swimmer_id where e.meet_id = ${data.id} and e.user_id = ${context.userId} order by s.full_name, e.distance_m, e.stroke`;
  const results = await sql<{
    id: number; swimmer_id: number; swimmer_name: string; meet_id: number | null; meet_name: string | null;
    result_date: string; stroke: string; distance_m: number; course: string; time_ms: number | null;
    place: number | null; round: string | null; status: string; is_pb: boolean; notes: string | null;
  }>`select r.*, s.full_name as swimmer_name, ${m.name} as meet_name from results r join swimmers s on s.id = r.swimmer_id where r.meet_id = ${data.id} and r.user_id = ${context.userId} order by r.place nulls last, r.stroke, r.distance_m`;
  const meet: Meet = { id: m.id, name: m.name, level: m.level, course: m.course, venue: m.venue, city: m.city, startDate: m.start_date, endDate: m.end_date, organizer: m.organizer, status: m.status, notes: m.notes };
  return {
    meet,
    entries: entries.map((e): MeetEntry => ({ id: e.id, meetId: e.meet_id, swimmerId: e.swimmer_id, swimmerName: e.swimmer_name, stroke: e.stroke, distanceM: e.distance_m, ageGroup: e.age_group, seedTimeMs: e.seed_time_ms, status: e.status, lane: e.lane, heat: e.heat })),
    results: results.map((r): Result => ({ id: r.id, swimmerId: r.swimmer_id, swimmerName: r.swimmer_name, meetId: r.meet_id, meetName: r.meet_name, resultDate: r.result_date, stroke: r.stroke, distanceM: r.distance_m, course: r.course, timeMs: r.time_ms, place: r.place, round: r.round, status: r.status, isPb: r.is_pb, notes: r.notes })),
  };
});

export const saveMeet = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id?: number; name: string; level: string; course: "25" | "50"; venue?: string; city?: string;
  startDate: string; endDate?: string; organizer?: string; status: string; notes?: string;
}) => {
  if (!input.name.trim()) throw new Error("Nama event wajib diisi");
  if (!input.startDate) throw new Error("Tanggal mulai wajib diisi");
  return input;
}).handler(async ({ context, data }) => {
  const sql = await getSql();
  if (data.id) {
    await sql`update meets set name = ${data.name.trim()}, level = ${data.level}, course = ${data.course}, venue = ${data.venue?.trim() || null}, city = ${data.city?.trim() || null}, start_date = ${data.startDate}, end_date = ${data.endDate || null}, organizer = ${data.organizer?.trim() || null}, status = ${data.status}, notes = ${data.notes?.trim() || null} where id = ${data.id} and user_id = ${context.userId}`;
    return { id: data.id };
  }
  const rows = await sql<{ id: number }>`insert into meets (user_id, name, level, course, venue, city, start_date, end_date, organizer, status, notes) values (${context.userId}, ${data.name.trim()}, ${data.level}, ${data.course}, ${data.venue?.trim() || null}, ${data.city?.trim() || null}, ${data.startDate}, ${data.endDate || null}, ${data.organizer?.trim() || null}, ${data.status}, ${data.notes?.trim() || null}) returning id`;
  return { id: rows[0]!.id };
});

export const deleteMeet = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  await (await getSql())`delete from meets where id = ${data.id} and user_id = ${context.userId}`;
  return { ok: true };
});

export const saveEntry = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { meetId: number; swimmerId: number; stroke: string; distanceM: number; seedTimeMs?: number | null }) => input).handler(async ({ context, data }) => {
  const sql = await getSql();
  const sw = await sql<{ date_of_birth: string }>`select date_of_birth from swimmers where id = ${data.swimmerId} and user_id = ${context.userId}`;
  const meet = await sql<{ start_date: string }>`select start_date from meets where id = ${data.meetId} and user_id = ${context.userId}`;
  if (!sw[0] || !meet[0]) throw new Error("Data tidak valid");
  const year = Number(meet[0].start_date.slice(0, 4));
  const ag = ageGroupForDob(sw[0].date_of_birth, year).id;
  const rows = await sql<{ id: number }>`insert into meet_entries (user_id, meet_id, swimmer_id, stroke, distance_m, age_group, seed_time_ms, status) values (${context.userId}, ${data.meetId}, ${data.swimmerId}, ${data.stroke}, ${data.distanceM}, ${ag}, ${data.seedTimeMs ?? null}, 'terdaftar') returning id`;
  return { id: rows[0]!.id };
});

export const deleteEntry = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  await (await getSql())`delete from meet_entries where id = ${data.id} and user_id = ${context.userId}`;
  return { ok: true };
});

export const saveResult = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  swimmerId: number; meetId?: number | null; resultDate: string; stroke: string; distanceM: number;
  course: "25" | "50"; timeMs?: number | null; place?: number | null; round?: string; status: string; notes?: string;
}) => {
  if (!input.resultDate) throw new Error("Tanggal wajib diisi");
  return input;
}).handler(async ({ context, data }) => {
  const sql = await getSql();
  let isPb = false;
  if (data.status === "selesai" && data.timeMs != null) {
    const best = await sql<{ t: number | null }>`select min(time_ms) as t from results where user_id = ${context.userId} and swimmer_id = ${data.swimmerId} and stroke = ${data.stroke} and distance_m = ${data.distanceM} and course = ${data.course} and status = 'selesai' and time_ms is not null`;
    const prev = best[0]?.t;
    isPb = prev == null || data.timeMs < prev;
  }
  const rows = await sql<{ id: number }>`insert into results (user_id, swimmer_id, meet_id, result_date, stroke, distance_m, course, time_ms, place, round, status, is_pb, notes) values (${context.userId}, ${data.swimmerId}, ${data.meetId ?? null}, ${data.resultDate}, ${data.stroke}, ${data.distanceM}, ${data.course}, ${data.timeMs ?? null}, ${data.place ?? null}, ${data.round || null}, ${data.status}, ${isPb}, ${data.notes?.trim() || null}) returning id`;
  return { id: rows[0]!.id, isPb };
});

export const deleteResult = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  await (await getSql())`delete from results where id = ${data.id} and user_id = ${context.userId}`;
  return { ok: true };
});
