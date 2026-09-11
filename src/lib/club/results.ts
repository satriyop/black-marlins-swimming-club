import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canWriteOfficialResult, canWriteTestTime } from "./permissions";

export async function saveResult(
  actor: Actor,
  input: {
    swimmerId: number;
    meetId?: number | null;
    resultDate: string;
    stroke: string;
    distanceM: number;
    course: "25" | "50";
    timeMs?: number | null;
    place?: number | null;
    round?: string;
    status: string;
    kind: "official" | "test";
    notes?: string;
  },
): Promise<{ id: number; isPb: boolean }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const owned = await actor.sql<{ id: number }>`
    select id from swimmers where id = ${input.swimmerId} and club_id = ${clubId} limit 1
  `;
  if (!owned[0] || !canSeeSwimmer(hats, input.swimmerId)) throw new Error("Perenang tidak ditemukan");
  if (input.kind === "official" && !canWriteOfficialResult(hats, input.swimmerId)) {
    throw new Error("Tidak diizinkan");
  }
  if (input.kind === "test" && !canWriteTestTime(hats, input.swimmerId)) {
    throw new Error("Tidak diizinkan");
  }
  let isPb = false;
  if (input.status === "selesai" && input.timeMs != null) {
    const best = await actor.sql<{ t: number | null }>`
      select min(time_ms) as t from results
      where club_id = ${clubId} and swimmer_id = ${input.swimmerId}
        and stroke = ${input.stroke} and distance_m = ${input.distanceM} and course = ${input.course}
        and status = 'selesai' and time_ms is not null
    `;
    const prev = best[0]?.t;
    isPb = prev == null || input.timeMs < prev;
  }
  const rows = await actor.sql<{ id: number }>`
    insert into results (
      club_id, created_by, swimmer_id, meet_id, result_date, stroke, distance_m, course,
      time_ms, place, round, status, kind, is_pb, notes
    ) values (
      ${clubId}, ${actor.userId}, ${input.swimmerId}, ${input.meetId ?? null}, ${input.resultDate},
      ${input.stroke}, ${input.distanceM}, ${input.course}, ${input.timeMs ?? null},
      ${input.place ?? null}, ${input.round || null}, ${input.status}, ${input.kind}, ${isPb},
      ${input.notes?.trim() || null}
    ) returning id
  `;
  return { id: rows[0]!.id, isPb };
}
