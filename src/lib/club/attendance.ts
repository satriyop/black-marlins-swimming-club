import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canMarkAttendance } from "./permissions";
import { markPracticeInProgress } from "./practice";
import type { PracticeStatus } from "@/lib/swim/types";

export async function updateAttendanceStatus(
  actor: Actor,
  input: { id: number; status: "belum" | "hadir" | "izin" | "sakit" | "alfa"; metersCompleted?: number | null },
): Promise<{ ok: true }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{
    swimmer_id: number;
    practice_id: number;
    practice_status: PracticeStatus;
    on_roll: boolean;
  }>`
    select a.swimmer_id, a.practice_id, p.status as practice_status, a.on_roll
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
  await actor.sql`
    update practice_attendance
    set status = ${input.status}, meters_completed = ${input.metersCompleted ?? null}
    where id = ${input.id} and club_id = ${clubId}
  `;
  if (hats.staff != null && input.status !== "belum") {
    await markPracticeInProgress(actor, row.practice_id);
  }
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
