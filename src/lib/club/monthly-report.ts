import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { requireClubId } from "./membership";

export type MonthlyReport = {
  swimmerId: number;
  swimmerName: string;
  month: string;
  attended: number;
  missed: number;
  unrecorded: number;
  meters: number;
  metersRecordedSessions: number;
  officialTimes: Array<{
    stroke: string;
    distanceM: number;
    course: string;
    timeMs: number;
    previousTimeMs: number | null;
  }>;
  feedback: Array<{
    id: number;
    practiceDate: string;
    practiceTitle: string;
    focus: string | null;
    improvement: string | null;
    nextStep: string | null;
  }>;
};

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Bulan tidak valid");
  const [year, number] = month.split("-").map(Number);
  if (year! < 1900 || year! > 9998) throw new Error("Bulan tidak valid");
  const previous = new Date(Date.UTC(year!, number! - 2, 1));
  const next = new Date(Date.UTC(year!, number!, 1));
  return {
    start: `${month}-01`,
    next: next.toISOString().slice(0, 10),
    previous: previous.toISOString().slice(0, 10),
  };
}

export async function getMonthlyReport(
  actor: Actor,
  swimmerId: number,
  month: string,
): Promise<MonthlyReport> {
  if (!Number.isSafeInteger(swimmerId) || swimmerId < 1)
    throw new Error("Perenang tidak ditemukan");
  const { start, next, previous } = monthBounds(month);
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const swimmer = await actor.sql<{ full_name: string }>`
    select full_name from swimmers where id=${swimmerId} and club_id=${clubId} limit 1
  `;
  if (!swimmer[0] || !canSeeSwimmer(hats, swimmerId)) throw new Error("Perenang tidak ditemukan");

  const [attendance, times, feedback] = await Promise.all([
    actor.sql<{ status: string; meters_completed: number | null }>`
      select a.status,a.meters_completed
      from practice_attendance a
      join practices p on p.id=a.practice_id and p.club_id=a.club_id
      where a.club_id=${clubId} and a.swimmer_id=${swimmerId} and a.on_roll=true
        and p.status='completed' and p.session_date >= ${start} and p.session_date < ${next}
    `,
    actor.sql<{
      stroke: string;
      distance_m: number;
      course: string;
      time_ms: number;
      month_group: string;
    }>`
      select stroke,distance_m,course,min(time_ms)::int as time_ms,
        case when result_date >= ${start} then 'current' else 'previous' end as month_group
      from results
      where club_id=${clubId} and swimmer_id=${swimmerId} and kind='official'
        and status='selesai' and time_ms > 0
        and result_date >= ${previous} and result_date < ${next}
      group by stroke,distance_m,course,month_group
      order by distance_m,stroke,course
    `,
    actor.sql<{
      id: number;
      practice_date: string;
      practice_title: string;
      focus: string | null;
      improvement: string | null;
      next_step: string | null;
    }>`
      select id,practice_date::text,practice_title,focus,improvement,next_step
      from coach_feedback
      where club_id=${clubId} and swimmer_id=${swimmerId} and status='shared'
        and practice_date >= ${start} and practice_date < ${next}
      order by practice_date desc,id desc
    `,
  ]);

  const previousTimes = new Map(
    times
      .filter((row) => row.month_group === "previous")
      .map((row) => [`${row.stroke}:${row.distance_m}:${row.course}`, row.time_ms]),
  );
  return {
    swimmerId,
    swimmerName: swimmer[0].full_name,
    month,
    attended: attendance.filter((row) => row.status === "hadir").length,
    missed: attendance.filter((row) => ["izin", "sakit", "alfa"].includes(row.status)).length,
    unrecorded: attendance.filter((row) => row.status === "belum").length,
    meters: attendance.reduce(
      (sum, row) => sum + (row.status === "hadir" ? (row.meters_completed ?? 0) : 0),
      0,
    ),
    metersRecordedSessions: attendance.filter(
      (row) => row.status === "hadir" && row.meters_completed != null,
    ).length,
    officialTimes: times
      .filter((row) => row.month_group === "current")
      .map((row) => ({
        stroke: row.stroke,
        distanceM: row.distance_m,
        course: row.course,
        timeMs: row.time_ms,
        previousTimeMs: previousTimes.get(`${row.stroke}:${row.distance_m}:${row.course}`) ?? null,
      })),
    feedback: feedback.map((row) => ({
      id: row.id,
      practiceDate: row.practice_date.slice(0, 10),
      practiceTitle: row.practice_title,
      focus: row.focus,
      improvement: row.improvement,
      nextStep: row.next_step,
    })),
  };
}
