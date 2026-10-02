import type { Sql } from "@/lib/db";

export const AUTO_CANCEL_REASON = "Tanggal lewat tanpa catatan kehadiran";

export function previousIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Close every open session dated before today. A started roll is completed; an empty roll is cancelled. */
export async function closePastPractices(sql: Sql, clubId: number, today: string): Promise<void> {
  await sql.transaction(async (tx) => {
    await tx`
      update practice_attendance a
      set status = n.kind
      from practices p, absence_notices n
      where a.practice_id = p.id
        and a.club_id = p.club_id
        and n.practice_id = p.id
        and n.club_id = p.club_id
        and n.swimmer_id = a.swimmer_id
        and n.status = 'active'
        and n.kind in ('izin', 'sakit')
        and p.club_id = ${clubId}
        and p.status in ('scheduled', 'in_progress')
        and p.reopen_reason is null
        and p.session_date < ${today}::date
        and a.on_roll = true
        and a.status = 'belum'
        and exists (
          select 1 from practice_attendance marked
          where marked.practice_id = p.id
            and marked.club_id = p.club_id
            and marked.on_roll = true
            and marked.status <> 'belum'
        )
    `;
    await tx`
      update practice_attendance a
      set status = 'alfa'
      from practices p
      where a.practice_id = p.id
        and a.club_id = p.club_id
        and p.club_id = ${clubId}
        and p.status in ('scheduled', 'in_progress')
        and p.reopen_reason is null
        and p.session_date < ${today}::date
        and a.on_roll = true
        and a.status = 'belum'
        and exists (
          select 1 from practice_attendance marked
          where marked.practice_id = p.id
            and marked.club_id = p.club_id
            and marked.on_roll = true
            and marked.status <> 'belum'
        )
    `;
    await tx`
      update practices p
      set status = 'completed',
          completed_at = now(),
          completed_by = null,
          incomplete_ack = false,
          auto_closed = true,
          revision = revision + 1
      where p.club_id = ${clubId}
        and p.status in ('scheduled', 'in_progress')
        and p.reopen_reason is null
        and p.session_date < ${today}::date
        and exists (
          select 1 from practice_attendance marked
          where marked.practice_id = p.id
            and marked.club_id = p.club_id
            and marked.on_roll = true
            and marked.status <> 'belum'
        )
    `;
    await tx`
      update practices p
      set status = 'cancelled',
          cancel_reason = ${AUTO_CANCEL_REASON},
          auto_closed = true,
          revision = revision + 1
      where p.club_id = ${clubId}
        and p.status in ('scheduled', 'in_progress')
        and p.reopen_reason is null
        and p.session_date < ${today}::date
    `;
  });
}
