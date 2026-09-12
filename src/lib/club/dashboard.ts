import type { Dashboard, Meet, Practice, Result } from "@/lib/swim/types";
import { clubOf } from "@/lib/server/fns-shared";
import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { listSwimmers } from "./swimmers";

type ResultRow = {
  id: number; swimmer_id: number; swimmer_name: string; meet_id: number | null; meet_name: string | null;
  result_date: string; stroke: string; distance_m: number; course: string; time_ms: number | null;
  place: number | null; round: string | null; status: string; kind: "official" | "test"; notes: string | null;
};

function mapResult(r: ResultRow, bestMs: number | null): Result {
  return {
    id: r.id, swimmerId: r.swimmer_id, swimmerName: r.swimmer_name, meetId: r.meet_id, meetName: r.meet_name,
    resultDate: r.result_date, stroke: r.stroke, distanceM: r.distance_m, course: r.course, timeMs: r.time_ms,
    place: r.place, round: r.round, status: r.status, kind: r.kind,
    isPb: r.time_ms != null && bestMs != null && r.time_ms === bestMs,
    notes: r.notes,
  };
}

export async function getDashboardData(actor: Actor): Promise<Dashboard> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Akun belum diundang. Hubungi admin.");
  const sql = actor.sql;
  const club = await clubOf(sql, clubId);
  const swimmers = await listSwimmers(actor);
  const visibleIds = swimmers.map((s) => s.id);
  const upcomingPractices = await sql<{
    id: number; session_date: string; start_time: string | null; duration_min: number | null;
    location: string | null; kind: string; title: string; focus: string | null; total_meters: number; notes: string | null;
  }>`select * from practices where club_id = ${clubId} and session_date >= current_date order by session_date, start_time limit 4`;
  const upcomingMeets = await sql<{
    id: number; name: string; level: string; course: string; venue: string | null; city: string | null;
    start_date: string; end_date: string | null; organizer: string | null; status: string; notes: string | null;
  }>`select * from meets where club_id = ${clubId} and start_date >= current_date and status <> 'batal' order by start_date limit 4`;
  const meetCount = await sql<{ n: number }>`
    select count(*)::int as n from meets where club_id = ${clubId} and start_date >= current_date and status <> 'batal'`;
  let recentRows: ResultRow[] = [];
  if (visibleIds.length) {
    const ph = visibleIds.map((_, i) => `$${i + 2}`).join(", ");
    recentRows = await sql.query<ResultRow>(
      `select r.id, r.swimmer_id, s.full_name as swimmer_name, r.meet_id, m.name as meet_name,
        r.result_date, r.stroke, r.distance_m, r.course, r.time_ms, r.place, r.round, r.status, r.kind, r.notes
       from results r join swimmers s on s.id = r.swimmer_id left join meets m on m.id = r.meet_id
       where r.club_id = $1 and r.swimmer_id in (${ph})
       order by r.result_date desc, r.id desc limit 40`,
      [clubId, ...visibleIds],
    );
  }
  const visibleRecent = recentRows;
  const bests = await sql<{ swimmer_id: number; stroke: string; distance_m: number; course: string; t: number }>`
    select swimmer_id, stroke, distance_m, course, min(time_ms) as t
    from results
    where club_id = ${clubId} and status = 'selesai' and time_ms is not null
    group by swimmer_id, stroke, distance_m, course`;
  const bestMap = new Map(bests.map((b) => [`${b.swimmer_id}:${b.stroke}:${b.distance_m}:${b.course}`, b.t]));
  const recentResults = visibleRecent.slice(0, 8).map((r) =>
    mapResult(r, bestMap.get(`${r.swimmer_id}:${r.stroke}:${r.distance_m}:${r.course}`) ?? null),
  );
  const recentPbs = visibleRecent
    .filter((r) => r.time_ms != null && r.status === "selesai" && bestMap.get(`${r.swimmer_id}:${r.stroke}:${r.distance_m}:${r.course}`) === r.time_ms)
    .slice(0, 6)
    .map((r) => mapResult(r, r.time_ms));
  const monthKey = new Date().toISOString().slice(0, 7);
  let pbThisMonth = 0;
  if (visibleIds.length) {
    const ph = visibleIds.map((_, i) => `$${i + 2}`).join(", ");
    const pbRows = await sql.query<{ n: number }>(
      `select count(*)::int as n from (
         select distinct on (swimmer_id, stroke, distance_m, course) result_date
         from results
         where club_id = $1 and status = 'selesai' and time_ms is not null and swimmer_id in (${ph})
         order by swimmer_id, stroke, distance_m, course, time_ms asc
       ) best where to_char(result_date::date, 'YYYY-MM') = $${visibleIds.length + 2}`,
      [clubId, ...visibleIds, monthKey],
    );
    pbThisMonth = pbRows[0]?.n ?? 0;
  }
  const monthPractices = await sql<{ n: number }>`
    select count(*)::int as n from practices where club_id = ${clubId}
      and date_trunc('month', session_date::timestamp) = date_trunc('month', current_date::timestamp)`;
  const att = await sql<{ hadir: number; total: number }>`
    select coalesce(sum(case when status = 'hadir' then 1 else 0 end), 0)::int as hadir,
           count(*) filter (where status <> 'belum')::int as total
    from practice_attendance a join practices p on p.id = a.practice_id
    where a.club_id = ${clubId} and p.session_date >= (current_date - interval '30 days') and p.session_date <= current_date`;
  const volume = await sql<{ n: number }>`
    select coalesce(sum(total_meters), 0)::int as n from practices
    where club_id = ${clubId} and session_date >= (current_date - interval '6 days') and session_date <= current_date`;
  const hadir = att[0]?.hadir ?? 0;
  const total = att[0]?.total ?? 0;
  const unreadTotal = await sql<{ n: number }>`
    select count(*)::int as n
    from announcements a
    left join announcement_reads r
      on r.announcement_id = a.id and r.user_id = ${actor.userId}
    where a.club_id = ${clubId} and r.user_id is null
  `;
  const unreadAnnouncements = await sql<{
    id: number; title: string; important: boolean; created_at: string;
  }>`
    select a.id, a.title, a.important, a.created_at::text as created_at
    from announcements a
    left join announcement_reads r
      on r.announcement_id = a.id and r.user_id = ${actor.userId}
    where a.club_id = ${clubId} and r.user_id is null
    order by a.important desc, a.created_at desc
    limit 8
  `;
  return {
    club, swimmers,
    upcomingPractices: upcomingPractices.map((p): Practice => ({
      id: p.id, sessionDate: p.session_date, startTime: p.start_time, durationMin: p.duration_min,
      location: p.location, kind: p.kind, title: p.title, focus: p.focus, totalMeters: p.total_meters, notes: p.notes,
    })),
    upcomingMeets: upcomingMeets.map((m): Meet => ({
      id: m.id, name: m.name, level: m.level, course: m.course, venue: m.venue, city: m.city,
      startDate: m.start_date, endDate: m.end_date, organizer: m.organizer, status: m.status, notes: m.notes,
    })),
    recentResults, recentPbs,
    unreadAnnouncements: unreadAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      important: a.important,
      createdAt: a.created_at,
    })),
    unreadCount: unreadTotal[0]?.n ?? 0,
    stats: {
      swimmerCount: swimmers.filter((s) => s.status === "aktif").length,
      practicesThisMonth: monthPractices[0]?.n ?? 0,
      meetsUpcoming: meetCount[0]?.n ?? 0,
      pbThisMonth,
      attendanceRecorded: total,
      attendanceRate: total === 0 ? 0 : Math.round((hadir / total) * 100),
      volumeThisWeek: volume[0]?.n ?? 0,
    },
  };
}

export async function meetEntryNames(actor: Actor, meetId: number): Promise<string[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{ swimmer_id: number; full_name: string }>`
    select e.swimmer_id, s.full_name
    from meet_entries e join swimmers s on s.id = e.swimmer_id
    where e.meet_id = ${meetId} and e.club_id = ${clubId}
  `;
  return rows.filter((r) => canSeeSwimmer(hats, r.swimmer_id)).map((r) => r.full_name);
}
