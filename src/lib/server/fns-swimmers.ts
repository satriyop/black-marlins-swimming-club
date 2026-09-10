import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ensureSeeded } from "./bootstrap";
import { clubOf, mapSwimmer, swimmersOf, type SwimmerRow } from "./fns-shared";
import type { Dashboard, PersonalBest, Practice, Meet, Result } from "@/lib/swim/types";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Dashboard> => {
    const userId = context.userId;
    await ensureSeeded(userId);
    const sql = await getSql();
    const club = await clubOf(sql, userId);
    const swimmers = await swimmersOf(sql, userId);
    const upcomingPractices = await sql<PracticeRow>`
      select * from practices
      where user_id = ${userId} and session_date >= current_date
      order by session_date, start_time limit 4`;
    const upcomingMeets = await sql<MeetRow>`
      select * from meets
      where user_id = ${userId} and start_date >= current_date and status <> 'batal'
      order by start_date limit 4`;
    const recentResults = await sql<ResultRow>`
      select r.*, s.full_name as swimmer_name, m.name as meet_name
      from results r join swimmers s on s.id = r.swimmer_id left join meets m on m.id = r.meet_id
      where r.user_id = ${userId} order by r.result_date desc, r.id desc limit 8`;
    const recentPbs = recentResults.filter((r) => r.is_pb).slice(0, 6);
    const monthPractices = await sql<{ n: number }>`
      select count(*)::int as n from practices where user_id = ${userId}
        and date_trunc('month', session_date::timestamp) = date_trunc('month', current_date::timestamp)`;
    const pbMonth = await sql<{ n: number }>`
      select count(*)::int as n from results where user_id = ${userId} and is_pb = true
        and date_trunc('month', result_date::timestamp) = date_trunc('month', current_date::timestamp)`;
    const att = await sql<{ hadir: number; total: number }>`
      select coalesce(sum(case when status = 'hadir' then 1 else 0 end), 0)::int as hadir, count(*)::int as total
      from practice_attendance a join practices p on p.id = a.practice_id
      where a.user_id = ${userId} and p.session_date >= (current_date - interval '30 days')`;
    const volume = await sql<{ n: number }>`
      select coalesce(sum(total_meters), 0)::int as n from practices
      where user_id = ${userId} and session_date >= (current_date - interval '6 days') and session_date <= current_date`;
    const hadir = att[0]?.hadir ?? 0;
    const total = att[0]?.total ?? 0;
    return {
      club, swimmers,
      upcomingPractices: upcomingPractices.map(mapPractice),
      upcomingMeets: upcomingMeets.map(mapMeet),
      recentResults: recentResults.map(mapResult),
      recentPbs: recentPbs.map(mapResult),
      stats: {
        swimmerCount: swimmers.filter((s) => s.status === "aktif").length,
        practicesThisMonth: monthPractices[0]?.n ?? 0,
        meetsUpcoming: upcomingMeets.length,
        pbThisMonth: pbMonth[0]?.n ?? 0,
        attendanceRate: total === 0 ? 0 : Math.round((hadir / total) * 100),
        volumeThisWeek: volume[0]?.n ?? 0,
      },
    };
  });

export const getClub = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  await ensureSeeded(context.userId);
  return clubOf(await getSql(), context.userId);
});

export const listSwimmers = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  await ensureSeeded(context.userId);
  return swimmersOf(await getSql(), context.userId);
});

export const getSwimmer = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  await ensureSeeded(context.userId);
  const sql = await getSql();
  const rows = await sql<SwimmerRow>`select * from swimmers where id = ${data.id} and user_id = ${context.userId} limit 1`;
  const row = rows[0];
  if (!row) throw new Error("Perenang tidak ditemukan");
  const swimmer = mapSwimmer(row);
  const results = await sql<ResultRow>`
    select r.*, ${swimmer.fullName} as swimmer_name, m.name as meet_name
    from results r left join meets m on m.id = r.meet_id
    where r.user_id = ${context.userId} and r.swimmer_id = ${data.id} order by r.result_date desc, r.id desc`;
  const pbs = await sql<{ stroke: string; distance_m: number; course: string; time_ms: number; result_date: string; meet_name: string | null }>`
    select distinct on (r.stroke, r.distance_m, r.course) r.stroke, r.distance_m, r.course, r.time_ms, r.result_date, m.name as meet_name
    from results r left join meets m on m.id = r.meet_id
    where r.user_id = ${context.userId} and r.swimmer_id = ${data.id} and r.status = 'selesai' and r.time_ms is not null
    order by r.stroke, r.distance_m, r.course, r.time_ms asc`;
  const att = await sql<{ hadir: number; total: number }>`
    select coalesce(sum(case when status = 'hadir' then 1 else 0 end), 0)::int as hadir, count(*)::int as total
    from practice_attendance where user_id = ${context.userId} and swimmer_id = ${data.id}`;
  const volume = await sql<{ n: number }>`select coalesce(sum(meters_completed), 0)::int as n from practice_attendance where user_id = ${context.userId} and swimmer_id = ${data.id} and status = 'hadir'`;
  const entries = await sql<{
    id: number; meet_id: number; swimmer_id: number; swimmer_name: string; stroke: string; distance_m: number;
    age_group: string | null; seed_time_ms: number | null; status: string; lane: number | null; heat: string | null;
    meet_name: string; start_date: string;
  }>`
    select e.*, ${swimmer.fullName} as swimmer_name, m.name as meet_name, m.start_date
    from meet_entries e join meets m on m.id = e.meet_id
    where e.user_id = ${context.userId} and e.swimmer_id = ${data.id} and m.start_date >= current_date
    order by m.start_date, e.distance_m`;
  return {
    swimmer, results: results.map(mapResult),
    pbs: pbs.map((p): PersonalBest => ({ stroke: p.stroke, distanceM: p.distance_m, course: p.course, timeMs: p.time_ms, resultDate: p.result_date, meetName: p.meet_name })),
    attendance: { present: att[0]?.hadir ?? 0, total: att[0]?.total ?? 0, rate: (att[0]?.total ?? 0) === 0 ? 0 : Math.round(((att[0]?.hadir ?? 0) / (att[0]?.total ?? 1)) * 100) },
    totalMeters: volume[0]?.n ?? 0,
    upcomingEntries: entries.map((e) => ({ id: e.id, meetId: e.meet_id, swimmerId: e.swimmer_id, swimmerName: e.swimmer_name, stroke: e.stroke, distanceM: e.distance_m, ageGroup: e.age_group, seedTimeMs: e.seed_time_ms, status: e.status, lane: e.lane, heat: e.heat, meetName: e.meet_name, startDate: e.start_date })),
  };
});

export const saveSwimmer = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id?: number; fullName: string; nickname?: string; dateOfBirth: string; gender: "putra" | "putri";
  city?: string; status: "aktif" | "cuti" | "alumni"; joinDate?: string; notes?: string;
}) => {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Nama wajib diisi");
  if (!input.dateOfBirth) throw new Error("Tanggal lahir wajib diisi");
  return { ...input, fullName };
}).handler(async ({ context, data }) => {
  const sql = await getSql();
  if (data.id) {
    await sql`update swimmers set full_name = ${data.fullName}, nickname = ${data.nickname?.trim() || null}, date_of_birth = ${data.dateOfBirth}, gender = ${data.gender}, city = ${data.city?.trim() || null}, status = ${data.status}, join_date = ${data.joinDate || null}, notes = ${data.notes?.trim() || null} where id = ${data.id} and user_id = ${context.userId}`;
    return { id: data.id };
  }
  const rows = await sql<{ id: number }>`insert into swimmers (user_id, full_name, nickname, date_of_birth, gender, nationality, city, status, join_date, notes) values (${context.userId}, ${data.fullName}, ${data.nickname?.trim() || null}, ${data.dateOfBirth}, ${data.gender}, 'Indonesia', ${data.city?.trim() || null}, ${data.status}, ${data.joinDate || null}, ${data.notes?.trim() || null}) returning id`;
  return { id: rows[0]!.id };
});

export const deleteSwimmer = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  await (await getSql())`delete from swimmers where id = ${data.id} and user_id = ${context.userId}`;
  return { ok: true };
});

type PracticeRow = { id: number; session_date: string; start_time: string | null; duration_min: number | null; location: string | null; kind: string; title: string; focus: string | null; total_meters: number; notes: string | null };
type MeetRow = { id: number; name: string; level: string; course: string; venue: string | null; city: string | null; start_date: string; end_date: string | null; organizer: string | null; status: string; notes: string | null };
type ResultRow = { id: number; swimmer_id: number; swimmer_name: string; meet_id: number | null; meet_name: string | null; result_date: string; stroke: string; distance_m: number; course: string; time_ms: number | null; place: number | null; round: string | null; status: string; is_pb: boolean; notes: string | null };
function mapPractice(p: PracticeRow): Practice {
  return { id: p.id, sessionDate: p.session_date, startTime: p.start_time, durationMin: p.duration_min, location: p.location, kind: p.kind, title: p.title, focus: p.focus, totalMeters: p.total_meters, notes: p.notes };
}
function mapMeet(m: MeetRow): Meet {
  return { id: m.id, name: m.name, level: m.level, course: m.course, venue: m.venue, city: m.city, startDate: m.start_date, endDate: m.end_date, organizer: m.organizer, status: m.status, notes: m.notes };
}
function mapResult(r: ResultRow): Result {
  return { id: r.id, swimmerId: r.swimmer_id, swimmerName: r.swimmer_name, meetId: r.meet_id, meetName: r.meet_name, resultDate: r.result_date, stroke: r.stroke, distanceM: r.distance_m, course: r.course, timeMs: r.time_ms, place: r.place, round: r.round, status: r.status, isPb: r.is_pb, notes: r.notes };
}
