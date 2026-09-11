import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canMarkAttendance } from "./permissions";

export async function updateAttendanceStatus(
  actor: Actor,
  input: { id: number; status: "hadir" | "izin" | "sakit" | "alfa"; metersCompleted?: number | null },
): Promise<{ ok: true }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{ swimmer_id: number }>`
    select swimmer_id from practice_attendance where id = ${input.id} and club_id = ${clubId} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Perenang tidak ditemukan");
  if (!canMarkAttendance(hats, row.swimmer_id, input.status)) throw new Error("Tidak diizinkan");
  await actor.sql`
    update practice_attendance
    set status = ${input.status}, meters_completed = ${input.metersCompleted ?? null}
    where id = ${input.id} and club_id = ${clubId}
  `;
  return { ok: true };
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
