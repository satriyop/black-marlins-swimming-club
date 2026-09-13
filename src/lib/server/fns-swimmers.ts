import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { accessFor } from "@/lib/club/access";
import { loadClub, requireClub } from "@/lib/club/context";
import { canSeeSwimmer, hatsFor } from "@/lib/club/hats";
import { listAttendanceHistory } from "@/lib/club/attendance";
import { listSwimmers as listSwimmersFor, saveSwimmer as saveSwimmerFor } from "@/lib/club/swimmers";
import { getDashboardData } from "@/lib/club/dashboard";
import { deleteSwimmer as deleteSwimmerFor } from "@/lib/club/writes";
import { clubOf, mapSwimmer, type SwimmerRow } from "./fns-shared";
import type { Dashboard, PersonalBest, Result } from "@/lib/swim/types";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Dashboard> => {
    const actor = await requireClub(context.userId);
    return getDashboardData(actor);
  });

export const getAccess = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const { sql, userId } = await loadClub(context.userId);
  return accessFor({ sql, userId });
});

export const getClub = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const { sql, clubId } = await requireClub(context.userId);
  return clubOf(sql, clubId);
});

export const listSwimmers = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const { sql, userId } = await loadClub(context.userId);
  return listSwimmersFor({ sql, userId });
});

export const getSwimmer = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const { sql, clubId, userId } = await requireClub(context.userId);
  const hats = await hatsFor({ sql, userId });
  const rows = await sql<SwimmerRow>`select * from swimmers where id = ${data.id} and club_id = ${clubId} limit 1`;
  const row = rows[0];
  if (!row || !canSeeSwimmer(hats, data.id)) throw new Error("Perenang tidak ditemukan");
  const swimmer = mapSwimmer(row);
  const results = await sql<ResultRow>`
    select r.*, ${swimmer.fullName} as swimmer_name, m.name as meet_name
    from results r left join meets m on m.id = r.meet_id
    where r.club_id = ${clubId} and r.swimmer_id = ${data.id} order by r.result_date desc, r.id desc`;
  const pbs = await sql<{ stroke: string; distance_m: number; course: string; time_ms: number; result_date: string; meet_name: string | null }>`
    select distinct on (r.stroke, r.distance_m, r.course) r.stroke, r.distance_m, r.course, r.time_ms, r.result_date, m.name as meet_name
    from results r left join meets m on m.id = r.meet_id
    where r.club_id = ${clubId} and r.swimmer_id = ${data.id} and r.status = 'selesai' and r.time_ms is not null
    order by r.stroke, r.distance_m, r.course, r.time_ms asc`;
  const att = await sql<{ hadir: number; total: number }>`
    select coalesce(sum(case when status = 'hadir' then 1 else 0 end), 0)::int as hadir, count(*) filter (where status <> 'belum')::int as total
    from practice_attendance where club_id = ${clubId} and swimmer_id = ${data.id}`;
  const volume = await sql<{ n: number }>`select coalesce(sum(meters_completed), 0)::int as n from practice_attendance where club_id = ${clubId} and swimmer_id = ${data.id} and status = 'hadir'`;
  const attendanceHistory = await listAttendanceHistory({ sql, userId }, data.id);
  const entries = await sql<{
    id: number; meet_id: number; swimmer_id: number; swimmer_name: string; stroke: string; distance_m: number;
    age_group: string | null; seed_time_ms: number | null; status: string; lane: number | null; heat: string | null;
    meet_name: string; start_date: string;
  }>`
    select e.*, ${swimmer.fullName} as swimmer_name, m.name as meet_name, m.start_date
    from meet_entries e join meets m on m.id = e.meet_id
    where e.club_id = ${clubId} and e.swimmer_id = ${data.id} and m.start_date >= current_date
    order by m.start_date, e.distance_m`;
  return {
    swimmer, results: results.map(mapResult),
    pbs: pbs.map((p): PersonalBest => ({ stroke: p.stroke, distanceM: p.distance_m, course: p.course, timeMs: p.time_ms, resultDate: p.result_date, meetName: p.meet_name })),
    attendance: { present: att[0]?.hadir ?? 0, total: att[0]?.total ?? 0, rate: (att[0]?.total ?? 0) === 0 ? 0 : Math.round(((att[0]?.hadir ?? 0) / (att[0]?.total ?? 1)) * 100) },
    attendanceHistory,
    totalMeters: volume[0]?.n ?? 0,
    upcomingEntries: entries.map((e) => ({ id: e.id, meetId: e.meet_id, swimmerId: e.swimmer_id, swimmerName: e.swimmer_name, stroke: e.stroke, distanceM: e.distance_m, ageGroup: e.age_group, seedTimeMs: e.seed_time_ms, status: e.status, lane: e.lane, heat: e.heat, meetName: e.meet_name, startDate: e.start_date })),
  };
});

export const saveSwimmer = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id?: number; fullName: string; nickname?: string; dateOfBirth: string; gender: "putra" | "putri";
  city?: string; status: "aktif" | "cuti" | "alumni"; joinDate?: string; notes?: string; asChild?: boolean; confirmSimilar?: boolean;
}) => {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Nama wajib diisi");
  if (!input.dateOfBirth) throw new Error("Tanggal lahir wajib diisi");
  return { ...input, fullName };
}).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return saveSwimmerFor(actor, data);
});

export const deleteSwimmer = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return deleteSwimmerFor(actor, data.id);
});

type ResultRow = { id: number; swimmer_id: number; swimmer_name: string; meet_id: number | null; meet_name: string | null; result_date: string; stroke: string; distance_m: number; course: string; time_ms: number | null; place: number | null; round: string | null; status: string; kind: "official" | "test"; notes: string | null };
function mapResult(r: ResultRow): Result {
  return { id: r.id, swimmerId: r.swimmer_id, swimmerName: r.swimmer_name, meetId: r.meet_id, meetName: r.meet_name, resultDate: r.result_date, stroke: r.stroke, distanceM: r.distance_m, course: r.course, timeMs: r.time_ms, place: r.place, round: r.round, status: r.status, kind: r.kind, isPb: false, notes: r.notes };
}
